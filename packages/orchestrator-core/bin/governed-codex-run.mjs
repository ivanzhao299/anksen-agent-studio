#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";
import { loadAccessCenter, resolveSessionContext } from "../../access-center/lib/access-center-utils.mjs";
import { PlannerService } from "../../planning-center/lib/planner-service.mjs";
import {
  CodexCliAdapter,
  ControlledStubAdapter,
  MemoryRuntimeLogStore,
  ProcessSupervisor,
  RuntimeRegistry,
  RuntimeService,
} from "../../runtime-adapters/lib/runtime-core.mjs";
import { ActivationGateService, SessionProjectionConsumer } from "../lib/activation-gate.mjs";
import { PostgresAutonomousKernelStore } from "../lib/autonomous-kernel/postgres-store.mjs";
import { governedCodexSafety, loadGovernedCodexConfig } from "../lib/governed-codex-config.mjs";
import { assertWorkspaceWithinScope, captureGitWorkspace } from "../lib/autonomous-development-policy.mjs";
import { createTestPool, ensurePostgresFixture } from "../lib/postgres-fixture.mjs";
import { migrate } from "../lib/persistent-night-shift.mjs";

const configPath = process.argv[2];
if (!configPath) {
  console.error("Usage: pnpm studio:codex:run <config.json>");
  process.exit(2);
}

const blockedCommands = [
  "git push", "git merge", "git rebase", "git reset --hard", "git clean", "git checkout main", "git switch main",
  "docker", "kubectl", "terraform", "ssh", "scp", "rsync", "curl", "wget", "npm publish", "pnpm publish",
  "deploy", "rm -r",
];
const allowedCommands = ["codex exec", "git status", "git diff", "pnpm typecheck", "pnpm build", "pnpm test", "controlled file write"];

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", shell: false, ...options });
}

function git(root, args) {
  return run("git", ["-C", root, ...args]);
}

function changedPaths(root) {
  const result = git(root, ["status", "--short", "--untracked-files=all"]);
  assert(result.status === 0, "GIT_STATUS_FAILED");
  return result.stdout.split("\n").filter(line => line.trim()).map(line => line.slice(3).split(" -> ").at(-1));
}

function pathAllowed(path, allowedPaths) {
  return allowedPaths.some(allowed => path === allowed || path.startsWith(`${allowed.replace(/\/$/, "")}/`));
}

function safeEnvironment() {
  const keys = ["HOME", "PATH", "CODEX_HOME", "LANG", "LC_ALL", "LC_CTYPE", "TMPDIR", "USER", "LOGNAME", "SHELL", "TERM", "COLORTERM", "CODEX_SHELL", "__CF_USER_TEXT_ENCODING"];
  return Object.fromEntries(keys.filter(key => process.env[key]).map(key => [key, process.env[key]]));
}

function codexUsageFromLogs(logs) {
  const usage = { input_tokens: 0, cached_input_tokens: 0, output_tokens: 0, reasoning_output_tokens: 0 };
  const text = logs.slice().sort((a, b) => a.sequence - b.sequence).map(event => event.message).join("");
  for (const line of text.split("\n")) {
    try {
      const event = JSON.parse(line);
      if (event.type !== "turn.completed" || !event.usage) continue;
      for (const key of Object.keys(usage)) usage[key] += Number(event.usage[key] ?? 0);
    } catch {}
  }
  return usage;
}

async function completeClaim(pool, kernel, workerSession, worker, claim, result, logs = []) {
  const proof = { leaseId: claim.leaseId, leaseToken: claim.leaseToken, fencingToken: claim.fencingToken, workerId: worker.id, sessionId: workerSession.session_id, expectedVersion: 1 };
  await kernel.fencedUpdate(proof, async (client, lease) => {
    const task = (await client.query("SELECT * FROM ad_task WHERE id=$1 FOR UPDATE", [claim.taskId])).rows[0];
    const safeResult = {
      executionId: result.executionId,
      runtimeType: result.metadata?.controlledStub ? "CONTROLLED_STUB" : "CODEX",
      status: result.status,
      exitCode: result.exitCode,
      startedAt: result.startedAt,
      finishedAt: result.finishedAt,
      durationMs: result.durationMs,
      pid: result.metadata?.pid ?? null,
      signal: result.signal ?? null,
      errorCode: result.errorCode ?? null,
      errorMessage: result.errorMessage ?? null,
      fencingToken: result.fencingToken,
      logEvents: logs.slice(-20).map(event => ({ sequence: event.sequence, stream: event.stream, level: event.level, message: event.message.slice(0, 2000), timestamp: event.timestamp })),
    };
    await client.query("UPDATE ad_task_lease SET status='RELEASED',released_at=now(),version=version+1 WHERE id=$1", [lease.id]);
    await client.query("UPDATE ad_task_attempt SET status=$2,started_at=COALESCE(started_at,$3),finished_at=$4,validation_result=$5,metadata=metadata||$6::jsonb WHERE id=$1", [lease.attempt_id, result.status, result.startedAt, result.finishedAt, safeResult, JSON.stringify({ runtimeResult: safeResult, sideEffectsPossible: safeResult.runtimeType === "CODEX" })]);
    await client.query("UPDATE ad_task SET status=$2,output=$3,version=version+1 WHERE id=$1", [lease.task_id, result.status, { runtimeResult: safeResult }]);
    await client.query("UPDATE ad_worker SET active_claims=GREATEST(active_claims-1,0),status='IDLE',version=version+1 WHERE id=$1", [lease.worker_id]);
    await client.query("UPDATE ad_worker_claim SET status='COMPLETED',completed_at=now() WHERE lease_id=$1", [lease.id]);
    await kernel.transition(client, "TASK", task.id, task.goal_id, task.project_id, "CLAIMED", result.status, Number(task.version) + 1, worker.id, claim.fencingToken);
    await kernel.outbox(client, "autonomous.task.completed", "task", task.id, task.goal_id, task.project_id, Number(task.version) + 1, { status: result.status, runtimeType: safeResult.runtimeType, executionId: result.executionId, fencingToken: result.fencingToken });
  });
}

async function claimTask(pool, kernel, scope, session, worker, workerSession, taskId, leaseSeconds) {
  for (let index = 0; index < 8; index += 1) {
    const task = (await pool.query("SELECT status FROM ad_task WHERE id=$1", [taskId])).rows[0];
    if (task?.status === "QUEUED") break;
    const tick = await kernel.schedulerTick({ dryRun: false });
    await pool.query("INSERT INTO ad_scheduler_tick(session_id,scheduler_id,changed_count) VALUES($1,$2,$3)", [session.id, `governed-${scope.projectId}`, tick.changed.length]);
    await pool.query("UPDATE ad_night_shift_session SET scheduler_tick_count=scheduler_tick_count+1 WHERE id=$1", [session.id]);
  }
  const claim = await kernel.claimNext({ ...scope, goalId: session.goal_id, workerId: worker.id, sessionId: workerSession.session_id, capabilities: worker.capabilities, leaseSeconds });
  assert(claim.taskId === taskId, "UNEXPECTED_TASK_CLAIM");
  await pool.query("INSERT INTO ad_worker_claim(id,session_id,worker_id,task_id,attempt_id,lease_id,fencing_token,status) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE')", [randomUUID(), session.id, worker.id, claim.taskId, claim.attemptId, claim.leaseId, claim.fencingToken]);
  await pool.query("UPDATE ad_night_shift_session SET worker_claim_count=worker_claim_count+1 WHERE id=$1", [session.id]);
  return claim;
}

function runAcceptance(config) {
  return config.acceptanceCommands.map(commandLine => {
    const [command, ...args] = commandLine.split(" ");
    const result = run(command, args, { cwd: config.projectRoot, timeout: 20 * 60 * 1000 });
    return { command: commandLine, status: result.status, signal: result.signal, output: `${result.stdout ?? ""}${result.stderr ?? ""}`.slice(-4000) };
  });
}

async function main() {
  const config = await loadGovernedCodexConfig(resolve(configPath));
  assert(git(config.projectRoot, ["rev-parse", "--show-toplevel"]).stdout.trim() === config.projectRoot, "PROJECT_ROOT_MISMATCH");
  const baseline = captureGitWorkspace(config.projectRoot);
  if (config.expectedBaselineDigest) {
    assertWorkspaceWithinScope(baseline, config.allowedPaths);
    assert(baseline.digest === config.expectedBaselineDigest, "PROJECT_BASELINE_CHANGED");
  } else {
    assert(baseline.paths.length === 0, "PROJECT_BASELINE_DIRTY");
  }
  assert(git(config.projectRoot, ["remote"]).status === 0, "GIT_REMOTE_CHECK_FAILED");

  await ensurePostgresFixture();
  const pool = createTestPool();
  process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
  let session = null;
  try {
    const migrated = (await pool.query("SELECT to_regclass('ad_runtime_approval') activation")).rows[0];
    if (!migrated.activation) await migrate(pool, "up");
    const access = await resolveSessionContext(await loadAccessCenter(), { allow_default_user: true });
    assert(access.authenticated, "ACCESS_CONTEXT_UNAUTHENTICATED");
    const actor = { userId: access.user.user_id, authenticated: true, workspaceId: access.workspace_id, projectAllowlist: access.project_allowlist, capabilities: access.capabilities };
    const scope = { organizationId: "anksen-local", workspaceId: access.workspace_id, projectId: config.projectId };
    const kernel = new PostgresAutonomousKernelStore(pool);
    const planner = new PlannerService({ kernel });
    const sessionKey = `${config.runKey}-${randomUUID()}`;
    session = (await pool.query("INSERT INTO ad_night_shift_session(id,session_key,mode,status,limits,started_at) VALUES($1,$2,'once','RUNNING',$3,now()) RETURNING *", [randomUUID(), sessionKey, { maxRuntimeSeconds: config.maxRuntimeSeconds, maxTasks: 3 }])).rows[0];
    const goal = await kernel.createGoal(scope, { title: config.goal, description: config.instruction, source: "studio-governed-codex", idempotencyKey: sessionKey, metadata: { riskLevel: "MEDIUM", governedCodex: true, runKey: config.runKey } });
    const graph = planner.planGoal(goal);
    const constrained = { ...graph, tasks: graph.tasks.map(task => ({ ...task, maxAttempts: 1 })) };
    await kernel.submitPlan(goal.id, { plannerVersion: constrained.plannerVersion, sourceArtifactRef: config.runKey, tasks: constrained.tasks, dependencies: constrained.dependencies });
    await pool.query("UPDATE ad_goal SET status='RUNNING',version=version+1 WHERE id=$1", [goal.id]);
    await pool.query("UPDATE ad_night_shift_session SET goal_id=$2 WHERE id=$1", [session.id, goal.id]);
    session.goal_id = goal.id;
    const worker = await kernel.registerWorker({ organizationId: scope.organizationId, workspaceId: scope.workspaceId }, { workerKey: `codex-${config.runKey}`, displayName: `Governed Codex: ${config.runKey}`, runtimeType: "CODEX", maxConcurrency: 1, capabilities: ["planning", "code_development", "document_generation", "general_execution", "validation_testing"], metadata: { authorizedProjectId: scope.projectId, governedRun: config.runKey } });
    const workerSession = await kernel.openSession(worker.id, config.maxRuntimeSeconds + 120);
    const tasks = (await pool.query("SELECT * FROM ad_task WHERE goal_id=$1 ORDER BY created_at,task_key", [goal.id])).rows;
    const codexTask = tasks.find(task => task.required_capabilities.some(capability => ["code_development", "document_generation", "general_execution"].includes(capability)));
    assert(codexTask && tasks.length === 3, "PLANNER_GRAPH_UNEXPECTED");

    const fencingPort = { assertCurrent: async proof => {
      const count = (await pool.query("SELECT 1 FROM ad_task_lease WHERE id=$1 AND task_id=$2 AND attempt_id=$3 AND fencing_token=$4 AND status='ACTIVE' AND expires_at>now()", [proof.leaseId, proof.taskId, proof.attemptId, proof.fencingToken])).rowCount;
      if (count !== 1) throw Object.assign(new Error("FENCING_REJECTED"), { code: "FENCING_REJECTED" });
    } };
    const runtimeContext = { projectRoot: config.projectRoot, environmentAllowlist: [], secrets: [], maxLogBytes: 400000, maxOutputBytes: 400000, maxRuntimeSeconds: config.maxRuntimeSeconds };
    let codexEvidence = null;
    let approvalId = null;
    for (const task of tasks) {
      const claim = await claimTask(pool, kernel, scope, session, worker, workerSession, task.id, config.maxRuntimeSeconds + 60);
      if (task.id !== codexTask.id) {
        const supervisor = new ProcessSupervisor({ fencingPort });
        const registry = new RuntimeRegistry();
        registry.registerAdapter(new ControlledStubAdapter({ supervisor, context: runtimeContext, fencingPort }));
        const service = new RuntimeService({ registry, fencingPort });
        const request = { executionId: randomUUID(), goalId: goal.id, taskId: task.id, attemptId: claim.attemptId, workerId: worker.id, sessionId: workerSession.session_id, leaseId: claim.leaseId, fencingToken: claim.fencingToken, runtimeType: "CONTROLLED_STUB", instruction: task.description, workingDirectory: config.projectRoot, targetPaths: config.targetPaths, allowedPaths: config.allowedPaths, blockedPaths: config.blockedPaths, timeoutSeconds: 30, environment: {}, metadata: { runKey: config.runKey } };
        await service.startExecution(request, runtimeContext);
        await completeClaim(pool, kernel, workerSession, worker, claim, await service.collectExecutionResult(request.executionId));
      } else {
        const version = run(config.codexPath, ["--version"]);
        const login = run(config.codexPath, ["login", "status"]);
        const gate = new ActivationGateService(pool, { credentialResolver: async reference => reference === config.credentialReferenceId && login.status === 0, codexHealth: async () => ({ status: version.status === 0 ? "HEALTHY" : "NOT_CONFIGURED", version: version.stdout.trim() }) });
        const policy = await gate.putPolicy(actor, scope, { policyVersion: config.policyVersion, projectRoot: config.projectRoot, allowedPaths: config.allowedPaths, blockedPaths: config.blockedPaths, allowedCommands, blockedCommands, maxRuntimeSeconds: config.maxRuntimeSeconds, maxAttempts: 1, ...governedCodexSafety });
        await gate.bindCredentialReference(actor, scope, { runtimeType: "CODEX", credentialReferenceId: config.credentialReferenceId, referenceType: "local_session_ref" });
        const approval = await gate.createApproval(actor, { ...scope, goalId: goal.id, taskId: task.id, runtimeType: "CODEX", workerId: worker.id, policyVersion: config.policyVersion, expiresAt: new Date(Date.now() + 10 * 60 * 1000), maxUses: 1 });
        approvalId = approval.id;
        await gate.transitionApproval(actor, approval.id, "APPROVED");
        const activation = { ...scope, goalId: goal.id, taskId: task.id, runtimeType: "CODEX", workerId: worker.id, policyVersion: config.policyVersion, approvalId, workingDirectory: config.projectRoot, targetPaths: config.targetPaths, timeoutSeconds: config.maxRuntimeSeconds, command: "codex exec" };
        const before = await gate.readiness(actor, activation);
        const failures = before.checks.filter(check => check.status === "FAIL").map(check => check.name);
        assert(failures.length === 1 && failures[0] === "FEATURE_FLAG", `PRE_ACTIVATION_NOT_READY:${failures.join(",")}`);
        process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "true";
        await gate.authorizeRuntime(actor, activation);
        const logStore = new MemoryRuntimeLogStore();
        const supervisor = new ProcessSupervisor({ fencingPort, logStore, maxLogBytes: 400000 });
        const registry = new RuntimeRegistry();
        registry.registerAdapter(new CodexCliAdapter({ supervisor, context: runtimeContext, fencingPort, cliPath: config.codexPath, enabled: true, execArgs: ["--ephemeral", "--json", "--sandbox", "workspace-write", "--cd", config.projectRoot], baseEnvironment: safeEnvironment() }));
        const service = new RuntimeService({ registry, fencingPort });
        const request = { executionId: randomUUID(), goalId: goal.id, taskId: task.id, attemptId: claim.attemptId, workerId: worker.id, sessionId: workerSession.session_id, leaseId: claim.leaseId, fencingToken: claim.fencingToken, runtimeType: "CODEX", instruction: config.instruction, workingDirectory: config.projectRoot, targetPaths: config.targetPaths, allowedPaths: policy.allowed_paths, blockedPaths: policy.blocked_paths, timeoutSeconds: config.maxRuntimeSeconds, environment: {}, metadata: { runKey: config.runKey, credentialReferenceId: config.credentialReferenceId } };
        const execution = await service.startExecution(request, runtimeContext);
        assert(execution.pid, "CODEX_PROCESS_NOT_STARTED");
        const result = await service.collectExecutionResult(request.executionId);
        process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
        const logs = await logStore.list(request.executionId);
        await completeClaim(pool, kernel, workerSession, worker, claim, result, logs);
        assert(result.status === "SUCCEEDED" && result.exitCode === 0, `CODEX_RUNTIME_${result.status}`);
        codexEvidence = { executionId: result.executionId, pid: result.metadata.pid, durationMs: result.durationMs, exitCode: result.exitCode, logEventCount: logs.length, tokenUsage: codexUsageFromLogs(logs), approvalId, preActivation: before };
      }
      await pool.query("UPDATE ad_night_shift_session SET runtime_execution_count=runtime_execution_count+1 WHERE id=$1", [session.id]);
    }

    const changed = changedPaths(config.projectRoot);
    assert(changed.length > 0 && changed.every(path => pathAllowed(path, config.allowedPaths)), `CHANGED_PATH_DENIED:${changed.join(",")}`);
    const acceptance = runAcceptance(config);
    assert(acceptance.every(check => check.status === 0), `ACCEPTANCE_FAILED:${acceptance.filter(check => check.status !== 0).map(check => check.command).join(",")}`);
    assert(git(config.projectRoot, ["diff", "--check"]).status === 0, "GIT_DIFF_CHECK_FAILED");
    const counts = (await pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='SUCCEEDED')::int succeeded,count(*) FILTER(WHERE status='FAILED')::int failed,count(*) FILTER(WHERE status='BLOCKED')::int blocked FROM ad_task WHERE goal_id=$1", [goal.id])).rows[0];
    assert(counts.total === counts.succeeded, "GOAL_AGGREGATION_FAILED");
    await pool.query("UPDATE ad_goal SET status='SUCCEEDED',version=version+1 WHERE id=$1", [goal.id]);
    const facts = (await pool.query("SELECT a.attempt_number,a.status attempt_status,l.status lease_status,l.fencing_token,t.task_key,t.status task_status FROM ad_task t JOIN ad_task_attempt a ON a.task_id=t.id JOIN ad_task_lease l ON l.attempt_id=a.id WHERE t.goal_id=$1 ORDER BY t.created_at,t.task_key", [goal.id])).rows;
    assert(facts.every(row => row.attempt_number === 1 && row.attempt_status === "SUCCEEDED" && row.lease_status === "RELEASED" && row.task_status === "SUCCEEDED"), "PERSISTED_FACT_MISMATCH");
    const approval = (await pool.query("SELECT status,used_count,max_uses,expires_at,consumed_at FROM ad_runtime_approval WHERE id=$1", [approvalId])).rows[0];
    assert(approval.status === "CONSUMED" && approval.used_count === 1, "APPROVAL_NOT_CONSUMED");
    const persisted = (await pool.query("SELECT * FROM ad_night_shift_session WHERE id=$1", [session.id])).rows[0];
    const report = { sessionId: session.id, sessionKey, sessionStatus: "SUCCEEDED", goalId: goal.id, goalStatus: "SUCCEEDED", totalTasks: counts.total, succeededTasks: counts.succeeded, failedTasks: counts.failed, blockedTasks: counts.blocked, attemptCount: facts.length, schedulerTickCount: persisted.scheduler_tick_count, workerClaimCount: persisted.worker_claim_count, runtimeExecutionCount: persisted.runtime_execution_count, codexExecutionCount: 1, startedAt: new Date(persisted.started_at).toISOString(), finishedAt: new Date().toISOString(), changedPaths: changed, acceptance: acceptance.map(({ command, status }) => ({ command, status })), errorSummary: [] };
    await pool.query("UPDATE ad_night_shift_session SET status='SUCCEEDED',finished_at=$2,report=$3,updated_at=now() WHERE id=$1", [session.id, report.finishedAt, report]);
    await new SessionProjectionConsumer(pool, `governed-projection-${session.id}`).replay();
    return { conclusion: "SUCCEEDED", runKey: config.runKey, attemptKind: config.attemptKind, projectRoot: config.projectRoot, baselineDigest: baseline.digest, featureFlag: false, goal: { id: goal.id, status: "SUCCEEDED" }, policy: { version: config.policyVersion, allowedPaths: config.allowedPaths, blockedPaths: config.blockedPaths, ...governedCodexSafety }, approval, codexEvidence, facts, morningReport: report };
  } catch (error) {
    if (session) {
      await pool.query("INSERT INTO ad_session_error(session_id,code,message,metadata) VALUES($1,$2,$3,$4)", [session.id, error.code ?? error.message, "Governed Codex execution stopped", { featureFlagRestored: true }]).catch(() => {});
      await pool.query("UPDATE ad_night_shift_session SET status='FAILED',error_summary=jsonb_build_array($2::text),finished_at=now(),updated_at=now() WHERE id=$1", [session.id, error.code ?? error.message]).catch(() => {});
    }
    throw error;
  } finally {
    process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
    await pool.end();
  }
}

try {
  console.log(JSON.stringify(await main(), null, 2));
} catch (error) {
  process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
  console.error(JSON.stringify({ conclusion: "STOPPED", code: error.code ?? error.message, featureFlag: false }, null, 2));
  process.exitCode = 1;
}
