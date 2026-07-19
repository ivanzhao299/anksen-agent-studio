#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { readFile, readdir } from "node:fs/promises";
import { realpathSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { join } from "node:path";
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
import { createTestPool, ensurePostgresFixture } from "../lib/postgres-fixture.mjs";
import { migrate } from "../lib/persistent-night-shift.mjs";

const fixtureRoot = "/Users/mac/Documents/Codex/anksen-codex-first-run-fixture";
const targetPath = "docs/codex-first-run.md";
const policyVersion = "beta-002-v1";
const credentialReferenceId = "codex-local-session-ref";
const codexPath = "/Users/mac/.local/bin/codex";
const executionStartedAt = new Date().toISOString();
const resumeExisting = process.argv.includes("--resume");
const expectedContent = `# First Controlled Codex Execution

- Task: Beta-002
- Runtime: CODEX
- Result: First controlled Codex execution succeeded.
- Execution Time: ${executionStartedAt}
- Safety: No push, merge, deploy, production credential or production database access occurred.
`;
const safeInstruction = [
  "Create exactly one new UTF-8 file at docs/codex-first-run.md in the current repository.",
  `The exact file content is this base64 payload: ${Buffer.from(expectedContent).toString("base64")}`,
  "Decode the payload and write it exactly, including the final newline.",
  "Do not modify any other file. Do not create a commit.",
  "Do not run commands other than git status, git diff, git diff --check, git rev-parse --show-toplevel, mkdir, or the single controlled file-write operation.",
  "After writing the file, verify only that file changed and return a concise result.",
].join(" ");

const allowedCommands = [
  "git status",
  "git diff",
  "git diff --check",
  "git rev-parse --show-toplevel",
  "mkdir",
  "controlled file write",
  "codex exec",
];
const blockedCommands = [
  "git push",
  "git merge",
  "git rebase",
  "git reset --hard",
  "git clean",
  "git checkout main",
  "git switch main",
  "docker",
  "kubectl",
  "terraform",
  "ssh",
  "scp",
  "rsync",
  "curl",
  "wget",
  "npm publish",
  "pnpm publish",
  "deploy",
  "rm -r",
];
const blockedPaths = [
  ".env",
  ".env.*",
  ".git/config",
  ".git/hooks",
  "node_modules",
  "apps",
  "packages",
  "database",
  "migrations",
  "deploy",
  "infra",
  "terraform",
  "~/.ssh",
  "~/Library/Keychains",
];

function run(command, args, options = {}) {
  return spawnSync(command, args, { encoding: "utf8", shell: false, ...options });
}

function git(args) {
  return run("git", ["-C", fixtureRoot, ...args]);
}

function assert(condition, code) {
  if (!condition) throw Object.assign(new Error(code), { code });
}

async function completeClaim(pool, kernel, session, worker, claim, result) {
  const proof = {
    leaseId: claim.leaseId,
    leaseToken: claim.leaseToken,
    fencingToken: claim.fencingToken,
    workerId: worker.id,
    sessionId: session.session_id,
    expectedVersion: 1,
  };
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
      fencingToken: result.fencingToken,
    };
    await client.query("UPDATE ad_task_lease SET status='RELEASED',released_at=now(),version=version+1 WHERE id=$1", [lease.id]);
    await client.query("UPDATE ad_task_attempt SET status=$2,started_at=COALESCE(started_at,$3),finished_at=$4,validation_result=$5,metadata=metadata||$6::jsonb WHERE id=$1", [lease.attempt_id, result.status, result.startedAt, result.finishedAt, safeResult, JSON.stringify({ runtimeResult: safeResult, sideEffectsPossible: true })]);
    await client.query("UPDATE ad_task SET status=$2,output=$3,version=version+1 WHERE id=$1", [lease.task_id, result.status, { runtimeResult: safeResult }]);
    await client.query("UPDATE ad_worker SET active_claims=GREATEST(active_claims-1,0),status='IDLE',version=version+1 WHERE id=$1", [lease.worker_id]);
    await client.query("UPDATE ad_worker_claim SET status='COMPLETED',completed_at=now() WHERE lease_id=$1", [lease.id]);
    await kernel.transition(client, "TASK", task.id, task.goal_id, task.project_id, "CLAIMED", result.status, Number(task.version) + 1, worker.id, claim.fencingToken);
    await kernel.outbox(client, "autonomous.task.completed", "task", task.id, task.goal_id, task.project_id, Number(task.version) + 1, { status: result.status, runtimeType: safeResult.runtimeType, executionId: result.executionId, fencingToken: result.fencingToken });
  });
}

async function tickToQueue(pool, kernel, nightSession, taskId) {
  for (let index = 0; index < 8; index += 1) {
    const task = (await pool.query("SELECT status FROM ad_task WHERE id=$1", [taskId])).rows[0];
    if (task?.status === "QUEUED") return;
    const tick = await kernel.schedulerTick({ dryRun: false });
    await pool.query("INSERT INTO ad_scheduler_tick(session_id,scheduler_id,changed_count) VALUES($1,'beta-002-scheduler',$2)", [nightSession.id, tick.changed.length]);
    await pool.query("UPDATE ad_night_shift_session SET scheduler_tick_count=scheduler_tick_count+1 WHERE id=$1", [nightSession.id]);
  }
  throw new Error("SCHEDULER_DID_NOT_QUEUE_TASK");
}

async function claimTask(pool, kernel, scope, nightSession, worker, workerSession, taskId) {
  await tickToQueue(pool, kernel, nightSession, taskId);
  const claim = await kernel.claimNext({
    ...scope,
    goalId: nightSession.goal_id,
    workerId: worker.id,
    sessionId: workerSession.session_id,
    capabilities: worker.capabilities,
    leaseSeconds: 650,
  });
  assert(claim.taskId === taskId, "UNEXPECTED_TASK_CLAIM");
  await pool.query("INSERT INTO ad_worker_claim(id,session_id,worker_id,task_id,attempt_id,lease_id,fencing_token,status) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE')", [randomUUID(), nightSession.id, worker.id, claim.taskId, claim.attemptId, claim.leaseId, claim.fencingToken]);
  await pool.query("UPDATE ad_night_shift_session SET worker_claim_count=worker_claim_count+1 WHERE id=$1", [nightSession.id]);
  return claim;
}

async function main() {
  assert(realpathSync(fixtureRoot) === fixtureRoot, "FIXTURE_ROOT_MISMATCH");
  assert(git(["remote"]).stdout.trim() === "", "FIXTURE_REMOTE_FORBIDDEN");
  assert(!join(fixtureRoot, targetPath).includes(".."), "TARGET_PATH_INVALID");
  const baselineStatus = git(["status", "--short"]).stdout.trim().split("\n").filter(Boolean);
  assert(baselineStatus.every(line => line === "?? README.md"), "FIXTURE_BASELINE_DIRTY");

  await ensurePostgresFixture();
  const pool = createTestPool();
  process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
  let approvalId = null;
  let codexVersionText = "";
  try {
    const existing = (await pool.query("SELECT to_regclass('ad_runtime_approval') activation")).rows[0];
    if (!existing.activation) await migrate(pool, "up");
    const access = await resolveSessionContext(await loadAccessCenter(), { allow_default_user: true });
    assert(access.authenticated, "ACCESS_CONTEXT_UNAUTHENTICATED");
    const actor = {
      userId: access.user.user_id,
      authenticated: access.authenticated,
      workspaceId: access.workspace_id,
      projectAllowlist: access.project_allowlist,
      capabilities: access.capabilities,
    };
    const scope = {
      organizationId: "anksen-local",
      workspaceId: access.workspace_id,
      projectId: "codex-first-run-fixture",
    };
    const kernel = new PostgresAutonomousKernelStore(pool);
    const planner = new PlannerService({ kernel });
    let sessionKey, nightSession, goal, worker, workerSession, tasks;
    if (resumeExisting) {
      nightSession = (await pool.query("SELECT * FROM ad_night_shift_session WHERE session_key LIKE 'beta-002-%' AND status='RUNNING' ORDER BY created_at DESC LIMIT 1")).rows[0];
      assert(nightSession, "RESUMABLE_SESSION_NOT_FOUND");
      sessionKey = nightSession.session_key;
      goal = (await pool.query("SELECT * FROM ad_goal WHERE id=$1", [nightSession.goal_id])).rows[0];
      worker = (await pool.query("SELECT * FROM ad_worker WHERE organization_id=$1 AND workspace_id=$2 AND worker_key='beta-002-controlled-codex-worker'", [scope.organizationId, scope.workspaceId])).rows[0];
      workerSession = (await pool.query("SELECT * FROM ad_worker_session WHERE worker_id=$1 AND status='ACTIVE' ORDER BY started_at DESC LIMIT 1", [worker.id])).rows[0];
      assert(workerSession && workerSession.expires_at > new Date(), "WORKER_SESSION_NOT_RESUMABLE");
      tasks = (await pool.query("SELECT * FROM ad_task WHERE goal_id=$1 ORDER BY created_at,task_key", [goal.id])).rows;
    } else {
      sessionKey = `beta-002-${randomUUID()}`;
      nightSession = (await pool.query("INSERT INTO ad_night_shift_session(id,session_key,mode,status,limits,started_at) VALUES($1,$2,'once','RUNNING',$3,now()) RETURNING *", [randomUUID(), sessionKey, { maxRuntimeSeconds: 600, maxTasks: 3 }])).rows[0];
      goal = await kernel.createGoal(scope, {
        title: "在隔离测试仓库中新增文档 docs/codex-first-run.md",
        description: "Beta-002 First Controlled Codex Execution",
        source: "studio-aec-beta-002",
        idempotencyKey: sessionKey,
        metadata: { task: "Beta-002", projectRootReference: "codex-first-run-fixture" },
      });
      const graph = planner.planGoal({ id: goal.id, title: goal.title, description: goal.description, metadata: { riskLevel: "LOW" } });
      const constrainedGraph = { ...graph, tasks: graph.tasks.map(task => ({ ...task, maxAttempts: 1 })) };
      await kernel.submitPlan(goal.id, { plannerVersion: constrainedGraph.plannerVersion, sourceArtifactRef: null, tasks: constrainedGraph.tasks, dependencies: constrainedGraph.dependencies });
      await pool.query("UPDATE ad_goal SET status='RUNNING',version=version+1 WHERE id=$1", [goal.id]);
      await pool.query("UPDATE ad_night_shift_session SET goal_id=$2 WHERE id=$1", [nightSession.id, goal.id]);
      nightSession.goal_id = goal.id;
      worker = await kernel.registerWorker({ organizationId: scope.organizationId, workspaceId: scope.workspaceId }, {
        workerKey: "beta-002-controlled-codex-worker",
        displayName: "Beta-002 Controlled Codex Worker",
        runtimeType: "CODEX",
        maxConcurrency: 1,
        capabilities: ["planning", "document_generation", "validation_testing"],
        metadata: { authorizedProjectId: scope.projectId, controlledRun: "Beta-002" },
      });
      workerSession = await kernel.openSession(worker.id, 700);
      tasks = (await pool.query("SELECT * FROM ad_task WHERE goal_id=$1 ORDER BY created_at,task_key", [goal.id])).rows;
    }
    const codexTask = tasks.find(task => task.required_capabilities.includes("document_generation"));
    assert(codexTask && tasks.length === 3, "PLANNER_GRAPH_UNEXPECTED");

    const fencingPort = { assertCurrent: async proof => {
      const row = (await pool.query("SELECT 1 FROM ad_task_lease WHERE id=$1 AND task_id=$2 AND attempt_id=$3 AND fencing_token=$4 AND status='ACTIVE' AND expires_at>now()", [proof.leaseId, proof.taskId, proof.attemptId, proof.fencingToken])).rowCount;
      if (row !== 1) throw Object.assign(new Error("FENCING_REJECTED"), { code: "FENCING_REJECTED" });
    }};
    const runtimeContext = { projectRoot: fixtureRoot, environmentAllowlist: [], secrets: [], maxLogBytes: 200000, maxOutputBytes: 200000, maxRuntimeSeconds: 600 };

    for (const task of tasks) {
      if (task.status === "SUCCEEDED") continue;
      const active = task.status === "CLAIMED" ? (await pool.query("SELECT l.*,a.id attempt_id FROM ad_task_lease l JOIN ad_task_attempt a ON a.id=l.attempt_id WHERE l.task_id=$1 AND l.status='ACTIVE'", [task.id])).rows[0] : null;
      const claim = active ? { taskId: task.id, attemptId: active.attempt_id, leaseId: active.id, leaseToken: active.lease_token, fencingToken: Number(active.fencing_token) } : await claimTask(pool, kernel, scope, nightSession, worker, workerSession, task.id);
      if (task.id !== codexTask.id) {
        const supervisor = new ProcessSupervisor({ fencingPort });
        const registry = new RuntimeRegistry();
        registry.registerAdapter(new ControlledStubAdapter({ supervisor, context: runtimeContext, fencingPort }));
        const service = new RuntimeService({ registry, fencingPort });
        const request = { executionId: randomUUID(), goalId: goal.id, taskId: task.id, attemptId: claim.attemptId, workerId: worker.id, sessionId: workerSession.session_id, leaseId: claim.leaseId, fencingToken: claim.fencingToken, runtimeType: "CONTROLLED_STUB", instruction: task.description, workingDirectory: fixtureRoot, targetPaths: [targetPath], allowedPaths: [targetPath], blockedPaths, timeoutSeconds: 30, environment: {}, metadata: { beta: "002" } };
        await service.startExecution(request, runtimeContext);
        await completeClaim(pool, kernel, workerSession, worker, claim, await service.collectExecutionResult(request.executionId));
        await pool.query("UPDATE ad_night_shift_session SET runtime_execution_count=runtime_execution_count+1 WHERE id=$1", [nightSession.id]);
        continue;
      }

      const codexVersion = run(codexPath, ["--version"]);
      codexVersionText = codexVersion.stdout.trim();
      const loginStatus = run(codexPath, ["login", "status"]);
      const gate = new ActivationGateService(pool, {
        credentialResolver: async reference => reference === credentialReferenceId && loginStatus.status === 0,
        codexHealth: async () => ({ status: codexVersion.status === 0 ? "HEALTHY" : "NOT_CONFIGURED", version: codexVersion.stdout.trim() }),
      });
      const policy = await gate.putPolicy(actor, scope, { policyVersion, projectRoot: fixtureRoot, allowedPaths: [targetPath], blockedPaths, allowedCommands, blockedCommands, maxRuntimeSeconds: 600, maxAttempts: 1, allowCommit: false, allowPush: false, allowMerge: false, allowDeploy: false });
      await gate.bindCredentialReference(actor, scope, { runtimeType: "CODEX", credentialReferenceId, referenceType: "local_session_ref" });
      const approval = await gate.createApproval(actor, { ...scope, goalId: goal.id, taskId: task.id, runtimeType: "CODEX", workerId: worker.id, policyVersion, expiresAt: new Date(Date.now() + 10 * 60 * 1000), maxUses: 1 });
      approvalId = approval.id;
      await gate.transitionApproval(actor, approval.id, "APPROVED");
      const activationInput = { ...scope, goalId: goal.id, taskId: task.id, runtimeType: "CODEX", workerId: worker.id, policyVersion, approvalId: approval.id, workingDirectory: fixtureRoot, targetPaths: [targetPath], timeoutSeconds: 600, command: "codex exec" };
      const beforeFlag = await gate.readiness(actor, activationInput);
      const failedBeforeFlag = beforeFlag.checks.filter(check => check.status === "FAIL").map(check => check.name);
      assert(failedBeforeFlag.length === 1 && failedBeforeFlag[0] === "FEATURE_FLAG", `PRE_ACTIVATION_NOT_READY:${failedBeforeFlag.join(",")}`);

      process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "true";
      const authorization = await gate.authorizeRuntime(actor, activationInput);
      assert(authorization.status === "ALLOW" && authorization.runtimeType === "CODEX", "ACTIVATION_DENIED");
      const logStore = new MemoryRuntimeLogStore();
      const supervisor = new ProcessSupervisor({ fencingPort, logStore, maxLogBytes: 200000 });
      const registry = new RuntimeRegistry();
      const safeEnvironment = Object.fromEntries(["HOME", "PATH", "CODEX_HOME", "LANG", "LC_ALL", "TMPDIR"].filter(key => process.env[key]).map(key => [key, process.env[key]]));
      const adapter = new CodexCliAdapter({ supervisor, context: runtimeContext, fencingPort, cliPath: codexPath, enabled: true, execArgs: ["--ephemeral", "--sandbox", "workspace-write", "--cd", fixtureRoot], baseEnvironment: safeEnvironment });
      registry.registerAdapter(adapter);
      const service = new RuntimeService({ registry, fencingPort });
      const request = { executionId: randomUUID(), goalId: goal.id, taskId: task.id, attemptId: claim.attemptId, workerId: worker.id, sessionId: workerSession.session_id, leaseId: claim.leaseId, fencingToken: claim.fencingToken, runtimeType: "CODEX", instruction: safeInstruction, workingDirectory: fixtureRoot, targetPaths: [targetPath], allowedPaths: policy.allowed_paths, blockedPaths: policy.blocked_paths, timeoutSeconds: policy.max_runtime_seconds, environment: {}, metadata: { beta: "002", credentialReferenceId } };
      const execution = await service.startExecution(request, runtimeContext);
      assert(execution.pid, "CODEX_PROCESS_NOT_STARTED");
      const result = await service.collectExecutionResult(request.executionId);
      process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false";
      await completeClaim(pool, kernel, workerSession, worker, claim, result);
      await pool.query("UPDATE ad_night_shift_session SET runtime_execution_count=runtime_execution_count+1 WHERE id=$1", [nightSession.id]);
      assert(result.status === "SUCCEEDED" && result.exitCode === 0, `CODEX_RUNTIME_${result.status}`);

      const actualContent = await readFile(join(fixtureRoot, targetPath), "utf8");
      assert(actualContent === expectedContent, "GENERATED_CONTENT_MISMATCH");
      const afterStatus = git(["status", "--short"]).stdout.trim().split("\n").filter(Boolean);
      assert(afterStatus.length === 2 && afterStatus.includes("?? README.md") && afterStatus.includes(`?? ${targetPath}`), "UNEXPECTED_FIXTURE_CHANGES");
      assert(git(["diff", "--check"]).status === 0, "GIT_DIFF_CHECK_FAILED");
      let replayRejected = false;
      try { await gate.consumeApproval(activationInput); } catch (error) { replayRejected = error.code === "APPROVAL_NOT_USABLE"; }
      assert(replayRejected, "APPROVAL_REPLAY_ACCEPTED");
      const logs = await logStore.list(request.executionId);
      nightSession.codexEvidence = { executionId: result.executionId, pid: result.metadata.pid, durationMs: result.durationMs, exitCode: result.exitCode, logEvents: logs.length, credentialReferenceId, approvalId: approval.id, preActivation: beforeFlag };
    }

    const taskCounts = (await pool.query("SELECT count(*)::int total,count(*) FILTER(WHERE status='SUCCEEDED')::int succeeded,count(*) FILTER(WHERE status='FAILED')::int failed,count(*) FILTER(WHERE status='BLOCKED')::int blocked FROM ad_task WHERE goal_id=$1", [goal.id])).rows[0];
    assert(taskCounts.total === taskCounts.succeeded, "GOAL_AGGREGATION_FAILED");
    await pool.query("UPDATE ad_goal SET status='SUCCEEDED',version=version+1 WHERE id=$1", [goal.id]);
    const facts = (await pool.query("SELECT a.id attempt_id,a.attempt_number,a.status attempt_status,l.id lease_id,l.status lease_status,l.fencing_token,t.id task_id,t.status task_status,t.output FROM ad_task t JOIN ad_task_attempt a ON a.task_id=t.id JOIN ad_task_lease l ON l.attempt_id=a.id WHERE t.goal_id=$1 ORDER BY t.created_at,t.task_key", [goal.id])).rows;
    assert(facts.every(row => row.attempt_number === 1 && row.attempt_status === "SUCCEEDED" && row.lease_status === "RELEASED" && row.task_status === "SUCCEEDED"), "PERSISTED_FACT_MISMATCH");
    const approval = (await pool.query("SELECT status,used_count,max_uses,expires_at,consumed_at FROM ad_runtime_approval WHERE id=$1", [approvalId])).rows[0];
    assert(approval.status === "CONSUMED" && approval.used_count === 1, "APPROVAL_NOT_CONSUMED");
    const report = { sessionId: nightSession.id, sessionKey, sessionStatus: "SUCCEEDED", goalId: goal.id, goalStatus: "SUCCEEDED", totalTasks: taskCounts.total, succeededTasks: taskCounts.succeeded, failedTasks: taskCounts.failed, blockedTasks: taskCounts.blocked, attemptCount: facts.length, runtimeType: "CODEX", codexExecutionCount: 1, startedAt: executionStartedAt, finishedAt: new Date().toISOString(), errorSummary: [] };
    await pool.query("UPDATE ad_night_shift_session SET status='SUCCEEDED',finished_at=$2,report=$3,updated_at=now() WHERE id=$1", [nightSession.id, report.finishedAt, report]);
    await new SessionProjectionConsumer(pool, `beta-002-projection-${nightSession.id}`).replay();
    const finalReadinessGate = new ActivationGateService(pool, { credentialResolver: async reference => reference === credentialReferenceId, codexHealth: async () => ({ status: "HEALTHY", version: codexVersionText }) });
    const finalReadiness = await finalReadinessGate.readiness(actor, { ...scope, goalId: goal.id, taskId: codexTask.id, runtimeType: "CODEX", workerId: worker.id, policyVersion, approvalId, workingDirectory: fixtureRoot, targetPaths: [targetPath], timeoutSeconds: 600, command: "codex exec" });
    const commitExists = git(["rev-parse", "--verify", "HEAD"]).status === 0;
    const files = (await readdir(join(fixtureRoot, "docs"))).sort();
    return { conclusion: "SUCCEEDED", beta001Commit: "c984ad1", fixtureRoot, goal: { id: goal.id, status: "SUCCEEDED" }, policy: { version: policyVersion, allowedPaths: [targetPath], blockedPaths, allowedCommands, blockedCommands, maxRuntimeSeconds: 600, maxAttempts: 1, allowCommit: false, allowPush: false, allowMerge: false, allowDeploy: false }, approval, featureFlag: process.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED, codexEvidence: nightSession.codexEvidence, facts, files, commitExists, morningReport: report, finalReadiness };
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
