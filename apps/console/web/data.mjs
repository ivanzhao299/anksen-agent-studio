import { readdir, readFile, stat } from "node:fs/promises";
import { existsSync } from "node:fs";
import { dirname, join, relative, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { actionServerSummary, latestActionLog } from "./action-server.mjs";
import { loadProjectRegistry, resolveActiveProjectId } from "./project-registry.mjs";
import { accessInviteSummary, accessSummary, domainCapabilityCatalog, loadAccessCenter, resolveUserProfile } from "../../../packages/access-center/lib/access-center-utils.mjs";

const webDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(webDir, "../../..");

const dataFiles = {
  platformState: "runtime/global/platform-state.json",
  roadmapMemory: "runtime/global/roadmap-memory.json",
  v5Roadmap: "runtime/global/v5-roadmap.json",
  jinhuProjectState: "runtime/projects/jinhu-smart-park/project-state.json",
  codexContextIndex: "runtime/global/codex-context-index.json",
  decisionLog: "runtime/global/decision-log.json",
  attachedProjectWorkspace: "runtime/global/attached-project-workspace.json",
  workerControlPlane: "runtime/global/worker-control-plane.json",
  accessEnforcement: "runtime/global/access-enforcement.json",
  releaseConsistency: "runtime/global/release-consistency.json",
  accessState: "runtime/global/access-state.json",
  accessUsers: "runtime/global/access-users.json",
  accessMemberships: "runtime/global/access-memberships.json",
  accessInvites: "runtime/global/access-invites.json",
  consoleActions: "apps/console/examples/console-actions.example.json"
};

const exampleDirs = {
  runtimeCenter: "packages/runtime-center/examples",
  workerPool: "packages/worker-pool/examples",
  governanceCenter: "packages/governance-center/examples",
  credentialVault: "packages/credential-vault/examples",
  accessCenter: "packages/access-center/examples"
};

async function readJson(relativePath, fallback = null) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return fallback;
  return JSON.parse(await readFile(absolutePath, "utf8"));
}

async function readExampleDirectory(relativePath) {
  const absolutePath = resolve(repoRoot, relativePath);
  if (!existsSync(absolutePath)) return [];
  const entries = await readdir(absolutePath, { withFileTypes: true });
  const files = entries
    .filter((entry) => entry.isFile() && entry.name.endsWith(".json"))
    .map((entry) => join(relativePath, entry.name))
    .sort();
  const records = [];
  for (const file of files) {
    records.push({
      path: file,
      data: await readJson(file, {})
    });
  }
  return records;
}

async function latestAutopilotRun() {
  const runsDir = resolve(repoRoot, "autopilot-runs");
  if (!existsSync(runsDir)) return null;
  const entries = await readdir(runsDir, { withFileTypes: true });
  const jsonFiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const absolutePath = join(runsDir, entry.name);
    const stats = await stat(absolutePath);
    jsonFiles.push({ absolutePath, mtimeMs: stats.mtimeMs });
  }
  jsonFiles.sort((a, b) => b.mtimeMs - a.mtimeMs || a.absolutePath.localeCompare(b.absolutePath));
  const latest = jsonFiles[0];
  if (!latest) return null;
  return {
    path: relative(repoRoot, latest.absolutePath),
    data: JSON.parse(await readFile(latest.absolutePath, "utf8"))
  };
}

async function readProjectBindings() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const bindings = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeBindingPath = join("runtime/projects", entry.name, "binding.json");
    const data = await readJson(relativeBindingPath, null);
    if (!data) continue;
    bindings.push({
      project_id: entry.name,
      path: relativeBindingPath,
      data
    });
  }
  return bindings.sort((left, right) => left.project_id.localeCompare(right.project_id));
}

async function readProjectStates() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const projectStates = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeProjectStatePath = join("runtime/projects", entry.name, "project-state.json");
    const data = await readJson(relativeProjectStatePath, null);
    if (!data) continue;
    projectStates.push({
      project_id: entry.name,
      path: relativeProjectStatePath,
      data
    });
  }
  return projectStates.sort((left, right) => left.project_id.localeCompare(right.project_id));
}

async function readProjectDispatchPlans() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const plans = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "dispatch-plans");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      plans.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  plans.sort((left, right) => {
    const leftDate = String(left.data?.generated_at ?? "");
    const rightDate = String(right.data?.generated_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return plans;
}

async function readProjectProposals() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const proposals = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("examples", entry.name, "task-proposals");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      proposals.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  proposals.sort((left, right) => {
    const leftDate = String(left.data?.approved_at ?? left.data?.created_at ?? "");
    const rightDate = String(right.data?.approved_at ?? right.data?.created_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return proposals;
}

async function readProjectQueueInjectionAudits() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const audits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "queue-injection-audits");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      audits.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  audits.sort((left, right) => {
    const leftDate = String(left.data?.generated_at ?? "");
    const rightDate = String(right.data?.generated_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return audits;
}

async function readModelGatewayProposals() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const proposals = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "model-gateway-proposals");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      proposals.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  proposals.sort((left, right) => {
    const leftDate = String(left.data?.approved_at ?? left.data?.created_at ?? "");
    const rightDate = String(right.data?.approved_at ?? right.data?.created_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return proposals;
}

async function readModelGatewayQueueInjectionAudits() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const audits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "model-gateway-queue-audits");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      audits.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  audits.sort((left, right) => {
    const leftDate = String(left.data?.generated_at ?? "");
    const rightDate = String(right.data?.generated_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return audits;
}

async function readControlledWorkerQueuePreflightTasks() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const tasks = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "controlled-worker-queue");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      tasks.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  tasks.sort((left, right) => {
    const leftDate = String(left.data?.updated_at ?? left.data?.created_at ?? "");
    const rightDate = String(right.data?.updated_at ?? right.data?.created_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return tasks;
}

async function readWorkerClaimAudits() {
  const projectsDir = resolve(repoRoot, "runtime/projects");
  if (!existsSync(projectsDir)) return [];
  const entries = await readdir(projectsDir, { withFileTypes: true });
  const audits = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const relativeDir = join("runtime/projects", entry.name, "worker-claim-audits");
    const absoluteDir = resolve(repoRoot, relativeDir);
    if (!existsSync(absoluteDir)) continue;
    const files = (await readdir(absoluteDir, { withFileTypes: true }))
      .filter((file) => file.isFile() && file.name.endsWith(".json"))
      .map((file) => join(relativeDir, file.name))
      .sort();
    for (const file of files) {
      const data = await readJson(file, null);
      if (!data) continue;
      audits.push({
        project_id: entry.name,
        path: file,
        data
      });
    }
  }
  audits.sort((left, right) => {
    const leftDate = String(left.data?.generated_at ?? "");
    const rightDate = String(right.data?.generated_at ?? "");
    return rightDate.localeCompare(leftDate) || left.project_id.localeCompare(right.project_id);
  });
  return audits;
}

function countArray(value, key) {
  if (Array.isArray(value)) return value.length;
  if (value && Array.isArray(value[key])) return value[key].length;
  return 0;
}

function firstValue(record, paths, fallback = "unknown") {
  for (const path of paths) {
    let cursor = record;
    for (const segment of path.split(".")) {
      cursor = cursor?.[segment];
    }
    if (cursor !== undefined && cursor !== null && cursor !== "") return cursor;
  }
  return fallback;
}

function lifecycleOrder(value) {
  const token = String(value ?? "").toLowerCase();
  return {
    blocked: 0,
    needs_approval: 1,
    proposal_only: 2,
    ready_inject: 3,
    injected: 4,
    proposal_missing: 5,
    idle: 6
  }[token] ?? 9;
}

function buildProjectRouterLifecycle(dispatchPlans, proposals, audits, controlledQueueTasks = [], workerClaimAudits = []) {
  const dispatchMap = new Map(dispatchPlans.map((item) => [item.data?.task_id ?? item.path, item]));
  const proposalMap = new Map(proposals.map((item) => [item.data?.task_id ?? item.path, item]));
  const auditMap = new Map(audits.map((item) => [item.data?.task_id ?? item.path, item]));
  const controlledQueueMap = new Map(controlledQueueTasks.map((item) => [item.data?.task_id ?? item.path, item]));
  const workerClaimMap = new Map(workerClaimAudits.map((item) => [item.data?.task_id ?? item.path, item]));
  const taskIds = new Set([
    ...dispatchMap.keys(),
    ...proposalMap.keys(),
    ...auditMap.keys(),
    ...controlledQueueMap.keys(),
    ...workerClaimMap.keys()
  ]);

  const records = [...taskIds].map((taskId) => {
    const dispatch = dispatchMap.get(taskId);
    const proposal = proposalMap.get(taskId);
    const audit = auditMap.get(taskId);
    const controlledQueue = controlledQueueMap.get(taskId);
    const workerClaim = workerClaimMap.get(taskId);
    const dispatchData = dispatch?.data ?? {};
    const proposalData = proposal?.data ?? {};
    const auditData = audit?.data ?? {};
    const controlledQueueData = controlledQueue?.data ?? {};
    const workerClaimData = workerClaim?.data ?? {};
    const risk = firstValue(proposalData, ["risk"], firstValue(dispatchData, ["task_candidate.risk"], "MEDIUM"));
    const approvalStatus = firstValue(proposalData, ["approval_status"], "PROPOSED");
    const queueAuditStatus = firstValue(auditData, ["status"], "missing");
    const queueTaskStatus = firstValue(auditData, ["queue_state.queue_task_status"], "pending");
    const dispatchStage = firstValue(dispatchData, ["pipeline_stage"], "missing");
    const nextStage = firstValue(dispatchData, ["recommended_next_stage"], "idle");
    const nextCommand = firstValue(dispatchData, ["recommended_next_command", "command_plan.create_proposal"], "");
    const runtimeId = firstValue(dispatchData, ["worker_route.runtime_id", "task_candidate.runtime"], firstValue(proposalData, ["runtime_id", "model_gateway_plan.runtime_id"], "unknown"));
    const workerId = firstValue(dispatchData, ["worker_route.worker_id"], firstValue(proposalData, ["source"], "none"));
    const executionRoute = firstValue(dispatchData, ["binding_summary.execution_route"], firstValue(proposalData, ["execution_mode"], "unknown"));
    const goalText = firstValue(dispatchData, ["goal_text"], firstValue(proposalData, ["text"], "unknown"));
    const projectId = firstValue(dispatchData, ["project_id"], firstValue(proposalData, ["project_id"], firstValue(auditData, ["project_id"], "unknown")));
    const requiresApproval = proposalData.approval_required === true || risk === "HIGH" || risk === "CRITICAL";
    const approvalCleared = approvalStatus === "APPROVED" || approvalStatus === "APPROVAL_NOT_REQUIRED";
    const blockers = [];
    let lifecycle = "idle";
    let lifecycle_label = "待补 proposal";

    if (!proposal) {
      lifecycle = "proposal_missing";
      lifecycle_label = "待生成 proposal";
      blockers.push("派发计划已生成，但 proposal 尚未落盘。");
    } else if (!approvalCleared) {
      lifecycle = "needs_approval";
      lifecycle_label = "待审批";
      blockers.push(requiresApproval ? "需先完成 proposal 审批。" : "需确认 proposal 后才能进入队列。");
    } else if (queueAuditStatus === "PASS") {
      lifecycle = "injected";
      lifecycle_label = "已入队";
    } else if (risk === "HIGH" || risk === "CRITICAL") {
      lifecycle = "proposal_only";
      lifecycle_label = "仅提案";
      blockers.push(`${risk} 风险已审批，但保持 proposal_only，不自动入队。`);
    } else if (queueAuditStatus === "BLOCKED" || queueAuditStatus === "FAIL") {
      lifecycle = "blocked";
      lifecycle_label = "入队受阻";
      blockers.push(`queue audit ${queueAuditStatus}。`);
    } else {
      lifecycle = "ready_inject";
      lifecycle_label = "待注入";
      blockers.push(queueAuditStatus === "missing" ? "待生成 queue audit trace。" : `queue audit ${queueAuditStatus}。`);
    }

    const latestAt = firstValue(
      auditData,
      ["generated_at"],
      firstValue(proposalData, ["approved_at", "created_at"], firstValue(dispatchData, ["generated_at"], ""))
    );

    return {
      task_id: taskId,
      project_id: projectId,
      goal_text: goalText,
      risk,
      approved_at: firstValue(proposalData, ["approved_at"], ""),
      approved_by: firstValue(proposalData, ["approved_by"], ""),
      approval_status: approvalStatus,
      queue_audit_status: queueAuditStatus,
      queue_task_status: queueTaskStatus,
      audit_id: firstValue(auditData, ["audit_id"], ""),
      audit_generated_at: firstValue(auditData, ["generated_at"], ""),
      queue_event_file: firstValue(auditData, ["injection.event_file"], ""),
      queue_rebuild_status: firstValue(auditData, ["injection.rebuild_status"], ""),
      queue_rebuild_exit_code: firstValue(auditData, ["injection.rebuild_exit_code"], ""),
      controlled_queue_status: firstValue(controlledQueueData, ["status"], "missing"),
      controlled_queue_preflight_id: firstValue(controlledQueueData, ["preflight_id"], ""),
      controlled_queue_worker_claim_enabled: firstValue(controlledQueueData, ["worker_claim_enabled"], false),
      controlled_queue_next_gate: firstValue(controlledQueueData, ["next_required_gate"], ""),
      worker_claim_status: firstValue(workerClaimData, ["status"], firstValue(controlledQueueData, ["worker_claim_status"], "missing")),
      worker_claim_id: firstValue(workerClaimData, ["claim_id"], ""),
      claimed_worker_id: firstValue(workerClaimData, ["claimed_worker_id"], firstValue(controlledQueueData, ["claimed_worker_id"], "")),
      worker_claim_next_gate: firstValue(workerClaimData, ["next_required_gate"], firstValue(controlledQueueData, ["next_required_gate"], "")),
      dispatch_stage: dispatchStage,
      next_stage: nextStage,
      next_command: nextCommand,
      runtime_id: runtimeId,
      worker_id: workerId,
      execution_route: executionRoute,
      lifecycle,
      lifecycle_label,
      blockers,
      latest_at: latestAt,
      proposal_path: proposal?.path ?? "",
      dispatch_path: dispatch?.path ?? "",
      audit_path: audit?.path ?? "",
      controlled_queue_path: controlledQueue?.path ?? "",
      worker_claim_path: workerClaim?.path ?? "",
      proposal: proposalData,
      dispatch: dispatchData,
      audit: auditData,
      controlled_queue: controlledQueueData,
      worker_claim: workerClaimData
    };
  }).sort((left, right) =>
    lifecycleOrder(left.lifecycle) - lifecycleOrder(right.lifecycle)
    || String(right.latest_at).localeCompare(String(left.latest_at))
    || String(left.task_id).localeCompare(String(right.task_id))
  );

  const summary = {
    total: records.length,
    pending_approval: records.filter((item) => item.lifecycle === "needs_approval").length,
    proposal_only: records.filter((item) => item.lifecycle === "proposal_only").length,
    ready_inject: records.filter((item) => item.lifecycle === "ready_inject").length,
    injected: records.filter((item) => item.lifecycle === "injected").length,
    blocked: records.filter((item) => item.lifecycle === "blocked").length,
    proposal_missing: records.filter((item) => item.lifecycle === "proposal_missing").length,
    controlled_queue_ready: records.filter((item) => item.controlled_queue_status === "PREFLIGHT_READY").length,
    worker_claimed: records.filter((item) => item.worker_claim_status === "PASS" || item.controlled_queue_status === "CLAIMED_DRY_RUN_READY").length
  };

  const directActions = records.filter((item) => item.lifecycle === "ready_inject").map((item) => `${item.task_id}：审批并入队`);
  const approvalItems = records.filter((item) => item.lifecycle === "needs_approval").map((item) => `${item.task_id}：${item.blockers[0] ?? item.lifecycle_label}`);
  const proposalOnlyItems = records.filter((item) => item.lifecycle === "proposal_only").map((item) => `${item.task_id}：${item.blockers[0] ?? item.lifecycle_label}`);
  const blockerItems = records.filter((item) => item.lifecycle === "blocked" || item.lifecycle === "proposal_missing").map((item) => `${item.task_id}：${item.blockers[0] ?? item.lifecycle_label}`);
  const completedItems = records.filter((item) => item.lifecycle === "injected").map((item) => `${item.task_id}：queue=${item.queue_task_status} / audit=PASS / preflight=${item.controlled_queue_status} / claim=${item.worker_claim_status}`);

  let nextRecommendation = "先生成项目派发计划，形成 proposal -> queue audit 的闭环。";
  if (summary.pending_approval > 0) {
    nextRecommendation = "优先清理待审批 Proposal，再决定是否进入队列。";
  } else if (summary.ready_inject > 0) {
    nextRecommendation = "LOW / MEDIUM Proposal 已可直接审批并入队。";
  } else if (summary.proposal_only > 0) {
    nextRecommendation = "HIGH / CRITICAL Proposal 已批准，下一步保持人工复核或人工入队。";
  } else if (summary.blocked > 0 || summary.proposal_missing > 0) {
    nextRecommendation = "先补齐阻断项：修复 queue audit 或生成缺失的 proposal。";
  } else if (summary.injected > 0) {
    nextRecommendation = "已有任务入队，下一步转向观察队列执行与结果回流。";
  }

  return {
    records,
    summary,
    next_recommendation: nextRecommendation,
    direct_actions: directActions,
    approval_items: approvalItems,
    proposal_only_items: proposalOnlyItems,
    blocker_items: blockerItems,
    completed_items: completedItems
  };
}

export async function loadConsoleLocalData(options = {}) {
  const [
    platformState,
    roadmapMemory,
    v5Roadmap,
    codexContextIndex,
    decisionLog,
    attachedProjectWorkspace,
    workerControlPlane,
    accessEnforcement,
    releaseConsistency,
    accessState,
    accessUsers,
    accessMemberships,
    accessInvites,
    consoleActions,
    runtimeCenterExamples,
    workerPoolExamples,
    governanceCenterExamples,
    credentialVaultExamples,
    accessCenterExamples,
    latestRun,
    latestConsoleActionLog,
    projectRegistry,
    projectStates,
    projectBindings,
    projectDispatchPlans,
    projectProposals,
    projectQueueInjectionAudits,
    modelGatewayProposals,
    modelGatewayQueueInjectionAudits,
    controlledWorkerQueuePreflightTasks,
    workerClaimAudits
  ] = await Promise.all([
    readJson(dataFiles.platformState, {}),
    readJson(dataFiles.roadmapMemory, {}),
    readJson(dataFiles.v5Roadmap, {}),
    readJson(dataFiles.codexContextIndex, {}),
    readJson(dataFiles.decisionLog, {}),
    readJson(dataFiles.attachedProjectWorkspace, {}),
    readJson(dataFiles.workerControlPlane, {}),
    readJson(dataFiles.accessEnforcement, {}),
    readJson(dataFiles.releaseConsistency, {}),
    readJson(dataFiles.accessState, {}),
    readJson(dataFiles.accessUsers, {}),
    readJson(dataFiles.accessMemberships, {}),
    readJson(dataFiles.accessInvites, {}),
    readJson(dataFiles.consoleActions, {}),
    readExampleDirectory(exampleDirs.runtimeCenter),
    readExampleDirectory(exampleDirs.workerPool),
    readExampleDirectory(exampleDirs.governanceCenter),
    readExampleDirectory(exampleDirs.credentialVault),
    readExampleDirectory(exampleDirs.accessCenter),
    latestAutopilotRun(),
    latestActionLog(),
    loadProjectRegistry(),
    readProjectStates(),
    readProjectBindings(),
    readProjectDispatchPlans(),
    readProjectProposals(),
    readProjectQueueInjectionAudits(),
    readModelGatewayProposals(),
    readModelGatewayQueueInjectionAudits(),
    readControlledWorkerQueuePreflightTasks(),
    readWorkerClaimAudits()
  ]);

  const runtimeProfiles = runtimeCenterExamples.find((item) => item.path.endsWith("runtime-profiles.example.json"))?.data;
  const runtimeProviders = runtimeCenterExamples.find((item) => item.path.endsWith("runtime-providers.example.json"))?.data;
  const workerRegistry = workerPoolExamples.find((item) => item.path.endsWith("worker-registry.example.json"))?.data;
  const credentialReferences = credentialVaultExamples.find((item) => item.path.endsWith("credential-references.example.json"))?.data;
  const backendPolicy = credentialVaultExamples.find((item) => item.path.endsWith("backend-policy.example.json"))?.data;
  const governancePolicy = governanceCenterExamples.find((item) => item.path.endsWith("governance-policy.example.json"))?.data;
  const releaseGates = governanceCenterExamples.find((item) => item.path.endsWith("release-gates.example.json"))?.data;
  const accessBundle = await loadAccessCenter();
  const bootstrapAccessProfile = resolveUserProfile(accessBundle, accessBundle.policy.default_console_user_id);
  const accessRoles = (accessBundle.policy?.roles ?? []).map((role) => ({
    role_id: role.role_id,
    display_name: role.display_name,
    description: role.description ?? "",
    capability_count: Array.isArray(role.capabilities) ? role.capabilities.length : 0,
    capabilities: Array.isArray(role.capabilities) ? role.capabilities : [],
    project_scope_mode: role.project_scope_mode ?? "workspace"
  }));
  const accessPlans = (accessBundle.plans?.plans ?? []).map((plan) => ({
    plan_id: plan.plan_id,
    display_name: plan.display_name,
    tier: plan.tier,
    seat_limit: plan.seat_limit ?? null,
    project_scope_limit: plan.project_scope_limit ?? null,
    worker_parallel_limit: plan.worker_parallel_limit ?? null,
    direct_execute_max_risk: plan.direct_execute_max_risk ?? "LOW",
    runtime_allowlist: Array.isArray(plan.runtime_allowlist) ? plan.runtime_allowlist : []
  }));
  const accessUsersSafe = (accessUsers?.users ?? []).map((user) => ({
    user_id: user.user_id,
    username: user.username,
    display_name: user.display_name,
    status: user.status,
    primary_role_id: user.primary_role_id,
    default_plan_id: user.default_plan_id,
    feature_overrides: Array.isArray(user.feature_overrides) ? user.feature_overrides : []
  }));
  const accessMembershipsSafe = (accessMemberships?.memberships ?? []).map((membership) => ({
    membership_id: membership.membership_id,
    workspace_id: membership.workspace_id,
    user_id: membership.user_id,
    status: membership.status,
    plan_id: membership.plan_id,
    role_ids: Array.isArray(membership.role_ids) ? membership.role_ids : [],
    project_allowlist: Array.isArray(membership.project_allowlist) ? membership.project_allowlist : [],
    capability_grants: Array.isArray(membership.capability_grants) ? membership.capability_grants : [],
    beta_features: Array.isArray(membership.beta_features) ? membership.beta_features : []
  }));
  const allProjectProposals = [...projectProposals, ...modelGatewayProposals];
  const allProjectQueueInjectionAudits = [...projectQueueInjectionAudits, ...modelGatewayQueueInjectionAudits];
  const projectRouterLifecycle = buildProjectRouterLifecycle(projectDispatchPlans, allProjectProposals, allProjectQueueInjectionAudits, controlledWorkerQueuePreflightTasks, workerClaimAudits);
  const activeProjectId = resolveActiveProjectId(options.activeProjectId, projectRegistry);
  const activeProject = projectRegistry.find((project) => project.project_id === activeProjectId) ?? projectRegistry[0] ?? null;
  const activeProjectState = projectStates.find((project) => project.project_id === activeProjectId)?.data
    ?? {};

  return {
    loaded_at: new Date().toISOString(),
    data_sources: {
      files: Object.values(dataFiles),
      directories: Object.values(exampleDirs),
      autopilot_latest: latestRun?.path ?? "autopilot-runs/latest:not_found"
    },
    platformState,
    roadmapMemory,
    v5Roadmap,
    active_project_id: activeProjectId,
    active_project: activeProject,
    active_project_state: activeProjectState,
    project_states: projectStates,
    codexContextIndex,
    decisionLog,
    project_router: {
      workspace: attachedProjectWorkspace ?? {},
      projects: projectRegistry,
      bindings: projectBindings,
      binding_count: projectBindings.length,
      dispatch_plans: projectDispatchPlans,
      dispatch_plan_count: projectDispatchPlans.length,
      proposals: allProjectProposals,
      proposal_count: allProjectProposals.length,
      project_proposals: projectProposals,
      model_gateway_proposals: modelGatewayProposals,
      model_gateway_proposal_count: modelGatewayProposals.length,
      queue_injection_audits: allProjectQueueInjectionAudits,
      queue_injection_audit_count: allProjectQueueInjectionAudits.length,
      project_queue_injection_audits: projectQueueInjectionAudits,
      model_gateway_queue_injection_audits: modelGatewayQueueInjectionAudits,
      model_gateway_queue_injection_audit_count: modelGatewayQueueInjectionAudits.length,
      controlled_worker_queue_preflight_tasks: controlledWorkerQueuePreflightTasks,
      controlled_worker_queue_preflight_count: controlledWorkerQueuePreflightTasks.length,
      worker_claim_audits: workerClaimAudits,
      worker_claim_audit_count: workerClaimAudits.length,
      lifecycle_records: projectRouterLifecycle.records,
      lifecycle_summary: projectRouterLifecycle.summary,
      lifecycle_next_recommendation: projectRouterLifecycle.next_recommendation,
      lifecycle_direct_actions: projectRouterLifecycle.direct_actions,
      lifecycle_approval_items: projectRouterLifecycle.approval_items,
      lifecycle_blocker_items: projectRouterLifecycle.blocker_items,
      lifecycle_completed_items: projectRouterLifecycle.completed_items
    },
    accessState,
    accessUsers,
    accessMemberships,
    accessInvites,
    consoleActions,
    actionServer: actionServerSummary(),
    runtime: {
      examples: runtimeCenterExamples,
      profile_count: countArray(runtimeProfiles?.profiles, "profiles"),
      provider_count: countArray(runtimeProviders?.providers, "providers"),
      health_records: runtimeCenterExamples.find((item) => item.path.endsWith("runtime-health.example.json"))?.data ?? {}
    },
    workers: {
      examples: workerPoolExamples,
      registry: workerRegistry ?? {},
      worker_count: countArray(workerRegistry?.workers, "workers"),
      control_plane: workerControlPlane ?? {}
    },
    credentials: {
      examples: credentialVaultExamples,
      reference_count: countArray(credentialReferences?.credential_references, "credential_references"),
      backend_count: countArray(backendPolicy?.backends, "backends")
    },
    governance: {
      examples: governanceCenterExamples,
      policy_id: firstValue(governancePolicy ?? {}, ["policy_id"], "unknown"),
      release_gate_count: countArray(releaseGates?.release_gates, "release_gates")
    },
    access: {
      examples: accessCenterExamples,
      summary: accessSummary(accessBundle, bootstrapAccessProfile),
      invite_summary: accessInviteSummary(accessBundle),
      enforcement: accessEnforcement ?? {},
      roles: accessRoles,
      plans: accessPlans,
      users: accessUsersSafe,
      memberships: accessMembershipsSafe,
      domain_capabilities: domainCapabilityCatalog,
      route_checks: accessEnforcement?.route_checks ?? [],
      action_checks: accessEnforcement?.action_checks ?? [],
      user_count: countArray(accessUsers?.users, "users"),
      membership_count: countArray(accessMemberships?.memberships, "memberships"),
      invite_count: countArray(accessInvites?.invites, "invites"),
      plan_count: countArray(accessBundle.plans?.plans, "plans"),
      default_console_user: bootstrapAccessProfile.user ?? null
    },
    autopilot: {
      latest: latestRun,
      latest_summary: latestRun ? {
        id: firstValue(latestRun.data, ["run_id", "batch_id", "id"], latestRun.path),
        execution_mode: firstValue(latestRun.data, ["execution_mode", "execution.mode"], "unknown"),
        next_recommendation: firstValue(latestRun.data, ["next_recommendation.title", "next_recommendation", "summary.next_recommendation"], "unknown"),
        validation: firstValue(latestRun.data, ["validation_result.status", "validation.status"], "unknown")
      } : null
    },
    action_log: {
      latest: latestConsoleActionLog,
      latest_path: latestConsoleActionLog?.path ?? "not_found",
      latest_summary: latestConsoleActionLog?.data?.result?.stdout_summary ?? "not_found"
    },
    safety: {
      database: "not_connected",
      external_calls: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      model_invocation: "disabled",
      phoenix_erp_local_path: projectRegistry.find((project) => project.project_id === "phoenix-erp-v3")?.repo_path_display ?? "not_connected",
      anonymous_console_access: accessBundle.policy.allow_anonymous_console_read ? "enabled" : "disabled"
    },
    release_consistency: releaseConsistency ?? {}
  };
}

export async function buildConsoleDashboardModel(options = {}) {
  const data = await loadConsoleLocalData(options);
  return {
    title: "ANKSEN Studio",
    mode: "local_read_only_pilot",
    platform_status: firstValue(data.platformState, ["status", "platform_status"], "READY_FOR_PILOT"),
    v5_status: "READY_FOR_PILOT",
    active_project: data.active_project?.project_id ?? data.project_router.projects?.[0]?.project_id ?? "workspace",
    project_status: firstValue(data.active_project_state, ["status", "project_status", "doctor_status"], data.active_project?.connection_status ?? "connected"),
    modules: {
      runtime_profiles: data.runtime.profile_count,
      runtime_providers: data.runtime.provider_count,
      workers: data.workers.worker_count,
      attached_projects: data.project_router.binding_count,
      credential_references: data.credentials.reference_count,
      credential_backends: data.credentials.backend_count,
      governance_release_gates: data.governance.release_gate_count,
      access_users: data.access.user_count,
      access_plans: data.access.plan_count,
      latest_autopilot_run: data.autopilot.latest?.path ?? "not_found"
    },
    safety: data.safety,
    data_sources: data.data_sources,
    access: data.access.summary
  };
}
