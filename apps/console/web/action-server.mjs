import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";
import {
  currentSessionSummary,
  evaluateConsoleActionAccess,
  listConsoleActionCatalog,
  loadAccessCenter,
  resolveSessionContext
} from "../../../packages/access-center/lib/access-center-utils.mjs";
import { loadProjectRegistrySync } from "./project-registry.mjs";

const execFileAsync = promisify(execFile);
const webDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(webDir, "../../..");
export const actionLogDir = "autopilot-runs/console-actions";
export const actionUploadDir = `${actionLogDir}/uploads`;
const credentialReferencePath = resolve(repoRoot, "packages/credential-vault/examples/credential-references.example.json");
const studioScript = "packages/orchestrator-core/bin/studio.mjs";
const actionRuns = new Map();
const terminalRunStatuses = new Set(["PASS", "FAIL", "BLOCKED", "NEEDS_APPROVAL", "CANCELLED", "RECOVERY_REQUIRED"]);
let actionRunsHydrated = false;
let actionRunsHydration = null;
const actionTimeoutMs = 180000;
const liveCliAgentRuntimeIds = new Set(["codex-cli", "claude-code"]);
const managedModelGatewayRuntimeIds = new Set(["deepseek-chat", "qwen-plus"]);
const selectableAgentRuntimeIds = new Set([
  "codex-cli",
  "claude-code",
  "gemini-cli",
  "gemini",
  "deepseek-chat",
  "qwen-plus",
  "openhands",
  "aider",
  "local-agent"
]);
const maxAttachmentCount = 6;
const maxAttachmentBytes = 8 * 1024 * 1024;

function projectRegistry() {
  return loadProjectRegistrySync();
}

function projectsMap() {
  return Object.fromEntries(projectRegistry().map((project) => [project.project_id, project]));
}

function projectConfigFor(projectId) {
  const projects = projectsMap();
  return projects[projectId]?.config_path || projects["jinhu-smart-park"]?.config_path || "";
}

function projectProposalDir(projectId) {
  return resolve(repoRoot, "examples", projectId, "task-proposals");
}

function projectDispatchDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "dispatch-plans");
}

function projectQueueAuditDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "queue-injection-audits");
}

function modelGatewayProposalDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "model-gateway-proposals");
}

function modelGatewayQueueAuditDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "model-gateway-queue-audits");
}

function controlledWorkerQueueDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "controlled-worker-queue");
}

function workerClaimAuditDir(projectId) {
  return resolve(repoRoot, "runtime/projects", projectId, "worker-claim-audits");
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
}

async function hydrateConversationRuns() {
  if (actionRunsHydrated) return;
  if (actionRunsHydration) return actionRunsHydration;
  actionRunsHydration = (async () => {
    const absoluteDir = resolve(repoRoot, actionLogDir);
    if (!existsSync(absoluteDir)) { actionRunsHydrated = true; return; }
    const entries = await readdir(absoluteDir, { withFileTypes: true });
    for (const entry of entries) {
      if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
      const run = await readJsonIfExists(join(absoluteDir, entry.name));
      if (run?.kind !== "console_action_conversation_run" || !run.run_id) continue;
      if (["RUNNING", "QUEUED"].includes(run.status)) {
        run.status = "RECOVERY_REQUIRED";
        run.phase = "recovery";
        run.result = { status: "RECOVERY_REQUIRED", exit_code: null, stdout_summary: run.result?.stdout_summary ?? "", stderr_summary: "Studio 服务在任务运行期间重启。为避免重复副作用，任务未自动重跑，请人工确认后重新提交。" };
        run.messages = [...(run.messages ?? []), { role: "assistant", content: "检测到服务重启：已恢复运行记录，但不会自动重复执行可能产生副作用的任务。", at: new Date().toISOString(), phase: "recovery" }];
        run.timeline = runTimeline(run.status, run.result.status);
        run.updated_at = new Date().toISOString();
        await writeActionLog(run);
      }
      actionRuns.set(run.run_id, run);
    }
    actionRunsHydrated = true;
  })().finally(() => { actionRunsHydration = null; });
  return actionRunsHydration;
}

async function readProjectJsonRecords(absoluteDir, projectId) {
  if (!existsSync(absoluteDir)) return [];
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const records = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const absolutePath = join(absoluteDir, entry.name);
    const data = await readJsonIfExists(absolutePath);
    if (!data) continue;
    const stats = await stat(absolutePath);
    records.push({
      project_id: projectId,
      path: relative(repoRoot, absolutePath),
      data,
      mtimeMs: stats.mtimeMs
    });
  }
  records.sort((left, right) => right.mtimeMs - left.mtimeMs || left.path.localeCompare(right.path));
  return records;
}

async function readProjectProposalRecords(projectId) {
  return readProjectJsonRecords(projectProposalDir(projectId), projectId);
}

async function readProjectDispatchRecords(projectId) {
  return readProjectJsonRecords(projectDispatchDir(projectId), projectId);
}

async function readProjectQueueAuditRecords(projectId) {
  return readProjectJsonRecords(projectQueueAuditDir(projectId), projectId);
}

async function readModelGatewayProposalRecords(projectId) {
  return readProjectJsonRecords(modelGatewayProposalDir(projectId), projectId);
}

async function readModelGatewayQueueAuditRecords(projectId) {
  return readProjectJsonRecords(modelGatewayQueueAuditDir(projectId), projectId);
}

async function readControlledWorkerQueueRecords(projectId) {
  return readProjectJsonRecords(controlledWorkerQueueDir(projectId), projectId);
}

async function readWorkerClaimAuditRecords(projectId) {
  return readProjectJsonRecords(workerClaimAuditDir(projectId), projectId);
}

async function readWorkerRegistry() {
  const registry = await readJsonIfExists(resolve(repoRoot, "packages/worker-pool/examples/worker-registry.example.json"));
  return Array.isArray(registry?.workers) ? registry.workers : [];
}

function parseStudioFieldMap(output) {
  const fields = {};
  for (const line of String(output || "").split("\n")) {
    const match = line.match(/^([a-zA-Z0-9_]+):\s*(.+)$/);
    if (!match) continue;
    fields[match[1]] = match[2].trim();
  }
  return fields;
}

async function runShellCommand(command, args, timeout = 120000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd: repoRoot,
      timeout,
      maxBuffer: 1024 * 1024 * 10
    });
    return { ok: true, exit_code: 0, stdout, stderr };
  } catch (error) {
    return {
      ok: false,
      exit_code: typeof error?.code === "number" ? error.code : 1,
      stdout: String(error?.stdout ?? ""),
      stderr: String(error?.stderr ?? error?.message ?? "")
    };
  }
}

function isProposalApprovalCleared(record) {
  const status = String(record?.data?.approval_status || "");
  return status === "APPROVED" || status === "APPROVAL_NOT_REQUIRED";
}

function findPendingProposal(records = []) {
  return records.find((record) => !isProposalApprovalCleared(record)) ?? records[0] ?? null;
}

function findPendingModelGatewayProposal(records = []) {
  return records.find((record) => !isProposalApprovalCleared(record)) ?? records[0] ?? null;
}

function summarizeProposalRecords(records = []) {
  if (records.length === 0) return "当前没有 proposal。";
  return records.slice(0, 8).map((record) => {
    const proposal = record.data ?? {};
    return [
      proposal.task_id || "unknown",
      proposal.risk || "unknown",
      proposal.approval_status || "unknown",
      record.path
    ].join(" | ");
  }).join("\n");
}

function summarizeQueueAuditRecords(records = []) {
  if (records.length === 0) return "当前没有 queue injection audit trace。";
  return records.slice(0, 8).map((record) => {
    const audit = record.data ?? {};
    return [
      audit.task_id || "unknown",
      audit.status || "unknown",
      record.path
    ].join(" | ");
  }).join("\n");
}

function shouldBridgeModelGatewayProposal(plan, input) {
  const requested = normalizeRequestedAgent(input);
  return plan.action_id === "project-dispatch" && (requested === "auto" || managedModelGatewayRuntimeIds.has(requested));
}

async function writeModelGatewayProposalBridge(projectId, input, plan, fields) {
  const now = new Date().toISOString();
  const runtimeId = fields.runtime_id || (managedModelGatewayRuntimeIds.has(normalizeRequestedAgent(input)) ? normalizeRequestedAgent(input) : "auto");
  const invocationId = fields.invocation_id || `model-gateway-plan-${createHash("sha1").update(`${projectId}:${safeGoal(input.goal)}:${now}`).digest("hex").slice(0, 12)}`;
  const taskId = invocationId;
  const record = {
    schema_version: 1,
    kind: "model_gateway_proposal",
    task_id: taskId,
    invocation_id: invocationId,
    route_id: fields.route_id || "",
    project_id: projectId,
    text: safeGoal(input.goal),
    goal_text: safeGoal(input.goal),
    source: "managed_model_gateway",
    risk: fields.governance_risk || plan.risk || "MEDIUM",
    approval_required: true,
    approval_status: "PENDING_REVIEW",
    proposal_review_bridge: fields.proposal_review_bridge || "enabled",
    queue_injection_requires_approved_proposal: fields.queue_injection_requires_approved_proposal || "yes",
    runtime_id: runtimeId,
    provider: fields.provider || "",
    execution_status: fields.execution_status || "planned",
    execution_mode: fields.execution_mode || "gateway_invoke_plan_allowed",
    credential_reference_id: fields.credential_reference_id || "",
    credential_reference_status: fields.credential_reference_status || "reference_only",
    model_invocation: fields.model_invocation || "disabled",
    credential_values_read: fields.credential_values_read || "no",
    external_calls: fields.external_calls || "disabled",
    audit_trace_required: fields.audit_trace_required || "yes",
    requested_by: plan.requested_by ?? null,
    created_at: now,
    created_by: plan.requested_by?.username || input.username || input.user || "owner",
    safety: {
      external_model_call: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      production_operation: "disabled"
    },
    model_gateway_plan: fields
  };
  const absoluteDir = modelGatewayProposalDir(projectId);
  await mkdir(absoluteDir, { recursive: true });
  const relativePath = relative(repoRoot, join(absoluteDir, `${taskId}.json`));
  await writeFile(resolve(repoRoot, relativePath), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return {
    record,
    path: relativePath
  };
}

async function approveModelGatewayProposal(record, input, plan) {
  const now = new Date().toISOString();
  const data = {
    ...(record.data ?? {}),
    approval_status: "APPROVED",
    approved_at: now,
    approved_by: plan.requested_by?.username || input.username || input.user || "owner",
    approval_comment: input.comment || "Approved from Console proposal review flow."
  };
  await writeFile(resolve(repoRoot, record.path), `${JSON.stringify(data, null, 2)}\n`, "utf8");
  return {
    ...record,
    data
  };
}

async function writeModelGatewayQueueInjectionAudit(projectId, proposalRecord, input, plan) {
  const now = new Date().toISOString();
  const proposal = proposalRecord.data ?? {};
  const taskId = String(proposal.task_id || proposal.invocation_id || "");
  const auditId = `model-gateway-queue-audit-${timestampForFile(now)}-${createHash("sha1").update(`${projectId}:${taskId}:${now}`).digest("hex").slice(0, 8)}`;
  const audit = {
    schema_version: 1,
    kind: "model_gateway_queue_injection_audit",
    audit_id: auditId,
    task_id: taskId,
    project_id: projectId,
    generated_at: now,
    status: "PASS",
    source: "managed_model_gateway_proposal",
    risk: proposal.risk || "MEDIUM",
    approval_status: proposal.approval_status || "APPROVED",
    approved_by: proposal.approved_by || plan.requested_by?.username || input.username || input.user || "owner",
    approved_at: proposal.approved_at || now,
    queue_state: {
      queue_task_status: "queued_audit_trace",
      queue_mode: "approved_proposal_trace",
      executor: "not_started"
    },
    injection: {
      event_file: "",
      rebuild_status: "not_required",
      rebuild_exit_code: ""
    },
    proposal: {
      path: proposalRecord.path,
      task_id: taskId,
      invocation_id: proposal.invocation_id || taskId,
      runtime_id: proposal.runtime_id || "",
      provider: proposal.provider || "",
      goal_text: proposal.goal_text || proposal.text || ""
    },
    safety: {
      model_invocation: "disabled",
      credential_values_read: "no",
      external_calls: "disabled",
      managed_project_writes: "disabled",
      production_operation: "disabled"
    }
  };
  const absoluteDir = modelGatewayQueueAuditDir(projectId);
  await mkdir(absoluteDir, { recursive: true });
  const relativePath = relative(repoRoot, join(absoluteDir, `${taskId}.json`));
  await writeFile(resolve(repoRoot, relativePath), `${JSON.stringify(audit, null, 2)}\n`, "utf8");
  return {
    data: audit,
    path: relativePath
  };
}

async function writeControlledWorkerQueuePreflight(projectId, proposalRecord, auditRecord, input, plan) {
  const now = new Date().toISOString();
  const proposal = proposalRecord?.data ?? {};
  const audit = auditRecord?.data ?? {};
  const taskId = String(proposal.task_id || audit.task_id || proposal.invocation_id || `preflight-${createHash("sha1").update(`${projectId}:${now}`).digest("hex").slice(0, 8)}`);
  const runtimeId = String(proposal.runtime_id || proposal.runtime || proposal.model_gateway_plan?.runtime_id || audit.proposal?.runtime_id || plan.runtime_id || "unknown");
  const risk = String(proposal.risk || audit.risk || "MEDIUM");
  const existingRecords = await readControlledWorkerQueueRecords(projectId);
  const existing = existingRecords.find((record) => record.data?.task_id === taskId) ?? null;
  const preflightId = existing?.data?.preflight_id
    || `controlled-worker-preflight-${timestampForFile(now)}-${createHash("sha1").update(`${projectId}:${taskId}:${runtimeId}`).digest("hex").slice(0, 8)}`;
  const record = {
    schema_version: 1,
    kind: "controlled_worker_queue_preflight_task",
    preflight_id: preflightId,
    task_id: taskId,
    project_id: projectId,
    created_at: existing?.data?.created_at || now,
    updated_at: now,
    status: "PREFLIGHT_READY",
    source: proposal.source === "managed_model_gateway" ? "managed_model_gateway_proposal" : "project_proposal",
    runtime_id: runtimeId,
    worker_id: proposal.source === "managed_model_gateway" ? "managed-model-gateway" : "local-codex-1",
    risk,
    approval_status: proposal.approval_status || audit.approval_status || "APPROVED",
    queue_audit_status: audit.status || "PASS",
    execution_mode: "controlled_queue_preflight_only",
    next_required_gate: "worker_claim_or_project_execute_explicit",
    worker_claim_enabled: false,
    model_invocation: "disabled",
    credential_values_read: "no",
    external_calls: "disabled",
    managed_project_writes: "disabled",
    production_operation: "disabled",
    goal_text: proposal.goal_text || proposal.text || audit.proposal?.goal_text || "",
    proposal_path: proposalRecord?.path || audit.proposal?.path || "",
    queue_audit_path: auditRecord?.path || "",
    requested_by: plan.requested_by ?? null,
    safety: {
      deploy: "disabled",
      production_operation: "disabled",
      credential_values: "not_read",
      real_model_call: "disabled",
      business_code_writes: "disabled",
      allowed_next_step: "explicit_worker_queue_execution_gate"
    }
  };
  const absoluteDir = controlledWorkerQueueDir(projectId);
  await mkdir(absoluteDir, { recursive: true });
  const relativePath = relative(repoRoot, join(absoluteDir, `${sanitizeFileName(taskId)}.json`));
  await writeFile(resolve(repoRoot, relativePath), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  return {
    data: record,
    path: relativePath
  };
}

function validateControlledWorkerPreflightForClaim(preflight) {
  const errors = [];
  const risk = String(preflight?.risk || "MEDIUM");
  if (!preflight) errors.push("controlled worker queue preflight missing");
  if (preflight?.status && !["PREFLIGHT_READY", "CLAIMED_DRY_RUN_READY"].includes(preflight.status)) {
    errors.push(`preflight status ${preflight.status} is not claimable`);
  }
  if (risk === "HIGH" || risk === "CRITICAL") errors.push(`${risk} risk cannot be worker-claimed from Console`);
  if (!["APPROVED", "APPROVAL_NOT_REQUIRED"].includes(String(preflight?.approval_status || ""))) {
    errors.push("proposal approval is not cleared");
  }
  if (String(preflight?.queue_audit_status || "") !== "PASS") errors.push("queue audit is not PASS");
  if (String(preflight?.model_invocation || "") !== "disabled") errors.push("model invocation is not disabled");
  if (String(preflight?.credential_values_read || "") !== "no") errors.push("credential values read policy is not no");
  if (String(preflight?.managed_project_writes || "") !== "disabled") errors.push("managed project writes are not disabled");
  if (String(preflight?.production_operation || "") !== "disabled") errors.push("production operation is not disabled");
  return errors;
}

function resolveClaimWorker(preflight, workerRegistry, input = {}) {
  const requestedWorkerId = String(input.worker_id || preflight?.worker_id || "").trim();
  const exact = workerRegistry.find((worker) => worker.worker_id === requestedWorkerId);
  if (exact) {
    return {
      status: exact.status === "available" ? "PASS" : "BLOCKED",
      worker_id: exact.worker_id,
      worker_kind: exact.worker_kind,
      runtime_id: exact.runtime_id,
      registry_status: exact.status,
      registry_source: "worker-pool",
      reason: exact.status === "available" ? "worker is available" : `worker status is ${exact.status}`
    };
  }
  if (requestedWorkerId === "managed-model-gateway") {
    return {
      status: "PASS",
      worker_id: "managed-model-gateway",
      worker_kind: "virtual_gateway",
      runtime_id: preflight?.runtime_id || "managed-model-gateway",
      registry_status: "virtual_gateway_worker",
      registry_source: "model-gateway",
      reason: "managed model gateway is claimed as a virtual worker; real model invocation remains disabled"
    };
  }
  return {
    status: "BLOCKED",
    worker_id: requestedWorkerId || "unknown",
    worker_kind: "unknown",
    runtime_id: preflight?.runtime_id || "unknown",
    registry_status: "missing",
    registry_source: "worker-pool",
    reason: "worker is not present in worker registry"
  };
}

async function writeWorkerClaimAudit(projectId, preflightRecord, input, plan) {
  const now = new Date().toISOString();
  const preflight = preflightRecord?.data ?? {};
  const taskId = String(preflight.task_id || input.task_id || "");
  const validationErrors = validateControlledWorkerPreflightForClaim(preflight);
  const workerRegistry = await readWorkerRegistry();
  const worker = resolveClaimWorker(preflight, workerRegistry, input);
  const status = validationErrors.length === 0 && worker.status === "PASS" ? "PASS" : "BLOCKED";
  const claimId = `worker-claim-${timestampForFile(now)}-${createHash("sha1").update(`${projectId}:${taskId}:${worker.worker_id}:${now}`).digest("hex").slice(0, 8)}`;
  const audit = {
    schema_version: 1,
    kind: "controlled_worker_claim_audit",
    claim_id: claimId,
    task_id: taskId,
    project_id: projectId,
    generated_at: now,
    status,
    preflight_id: preflight.preflight_id || "",
    preflight_path: preflightRecord?.path || "",
    risk: preflight.risk || "MEDIUM",
    approval_status: preflight.approval_status || "unknown",
    queue_audit_status: preflight.queue_audit_status || "unknown",
    claim_mode: "dry_run_claim_only",
    claimed_worker_id: worker.worker_id,
    worker_kind: worker.worker_kind,
    runtime_id: worker.runtime_id,
    worker_registry_status: worker.registry_status,
    worker_registry_source: worker.registry_source,
    validation: {
      status,
      errors: validationErrors,
      worker_reason: worker.reason
    },
    next_required_gate: status === "PASS" ? "result_artifact_callback_or_explicit_execution" : "fix_worker_claim_blocker",
    execution_enabled: false,
    model_invocation: "disabled",
    credential_values_read: "no",
    managed_project_writes: "disabled",
    production_operation: "disabled",
    requested_by: plan.requested_by ?? null,
    safety: {
      real_model_call: "disabled",
      credential_values: "not_read",
      business_code_writes: "disabled",
      deploy: "disabled",
      production_operation: "disabled"
    }
  };
  const absoluteAuditDir = workerClaimAuditDir(projectId);
  await mkdir(absoluteAuditDir, { recursive: true });
  const relativeAuditPath = relative(repoRoot, join(absoluteAuditDir, `${sanitizeFileName(taskId)}.json`));
  await writeFile(resolve(repoRoot, relativeAuditPath), `${JSON.stringify(audit, null, 2)}\n`, "utf8");

  if (status === "PASS") {
    const updatedPreflight = {
      ...preflight,
      updated_at: now,
      status: "CLAIMED_DRY_RUN_READY",
      worker_claim_enabled: true,
      worker_claim_status: "CLAIMED",
      claimed_at: now,
      claimed_by: plan.requested_by?.username || input.username || input.user || "owner",
      claimed_worker_id: worker.worker_id,
      worker_claim_audit_path: relativeAuditPath,
      next_required_gate: "result_artifact_callback_or_explicit_execution",
      execution_enabled: false
    };
    await writeFile(resolve(repoRoot, preflightRecord.path), `${JSON.stringify(updatedPreflight, null, 2)}\n`, "utf8");
    return {
      data: audit,
      path: relativeAuditPath,
      preflight: {
        ...preflightRecord,
        data: updatedPreflight
      }
    };
  }

  return {
    data: audit,
    path: relativeAuditPath,
    preflight: preflightRecord
  };
}

async function readReleaseConsistencyArtifact() {
  return readJsonIfExists(resolve(repoRoot, "runtime/global/release-consistency.json"));
}

function summarizeReleaseConsistencyArtifact(artifact, targetStage = "") {
  if (!artifact) return "当前没有 release consistency 工件。";
  const stageRows = Array.isArray(artifact.promotion_stages) ? artifact.promotion_stages : [];
  const target = stageRows.find((stage) => stage.stage_id === targetStage);
  const lines = [
    `status: ${artifact.status || "unknown"}`,
    `promotion_consistency_key: ${artifact.promotion_consistency_key || "unknown"}`,
    `promotion_next_stage: ${artifact.promotion_next_stage || "completed"}`
  ];
  if (target) {
    lines.push(
      `target_stage: ${target.stage_id}`,
      `target_status: ${target.status || "unknown"}`,
      `target_recorded_at: ${target.recorded_at || "pending"}`,
      `target_gate_reason: ${target.gate_reason || "none"}`
    );
  }
  if (stageRows.length > 0) {
    lines.push("", "promotion_stages:");
    for (const stage of stageRows) {
      lines.push(`- ${stage.stage_id}: ${stage.status || "unknown"} | key=${stage.consistency_key || stage.source_consistency_key || "pending"} | ${stage.gate_reason || "none"}`);
    }
  }
  return lines.join("\n");
}

export const consoleActionOptions = [
  { id: "workspace-goal", label: "自然语言任务", risk: "MEDIUM" },
  { id: "project-dispatch", label: "项目派发计划", risk: "MEDIUM" },
  { id: "agent-real-plan", label: "真实 AI Agent 计划", risk: "MEDIUM" },
  { id: "ai-runtime-status", label: "检查 Codex / Claude", risk: "LOW" },
  { id: "goal-plan", label: "生成任务计划", risk: "MEDIUM" },
  { id: "context-summary", label: "读取上下文", risk: "LOW" },
  { id: "project-inspect", label: "检查当前项目", risk: "MEDIUM" },
  { id: "project-connect-dry-run", label: "项目接入草稿", risk: "LOW" },
  { id: "project-connect-apply", label: "项目接入写入", risk: "MEDIUM" },
  { id: "runtime-health", label: "Runtime 健康检查", risk: "LOW" },
  { id: "worker-health", label: "查看 Worker 状态", risk: "MEDIUM" },
  { id: "governance-check", label: "Governance 检查", risk: "LOW" },
  { id: "autopilot-dry-run", label: "Autopilot 规划", risk: "MEDIUM" },
  { id: "autopilot-execute", label: "Autopilot 执行 LOW/MEDIUM", risk: "MEDIUM" },
  { id: "smart-park-continue", label: "继续 Smart Park", risk: "MEDIUM" },
  { id: "smart-park-blockers", label: "检查上线阻断项", risk: "MEDIUM" },
  { id: "smart-park-go-live-plan", label: "Smart Park 上线计划 Proposal", risk: "MEDIUM" },
  { id: "proposal-review", label: "查看待审批 Proposal", risk: "MEDIUM" },
  { id: "release-local-preview", label: "本地预览确认", risk: "LOW" },
  { id: "release-server-preview", label: "服务器预览确认", risk: "LOW" },
  { id: "release-reviewed-publish", label: "Reviewed Publish 确认", risk: "LOW" },
  { id: "proposal-approve-dry-run", label: "审批 Proposal 草稿", risk: "MEDIUM" },
  { id: "proposal-approve-apply", label: "审批并注入队列", risk: "LOW" },
  { id: "worker-claim-preflight", label: "领取 Worker 队列任务", risk: "LOW" },
  { id: "production-operation-request", label: "生产操作请求", risk: "CRITICAL" },
  { id: "proposal-reject-draft", label: "拒绝草稿", risk: "MEDIUM" }
];

function timestampForFile(value = new Date().toISOString()) {
  return value.replace(/[:.]/g, "").replace("Z", "Z");
}

function redactSensitive(value) {
  return String(value ?? "")
    .replace(/sk-[A-Za-z0-9_-]{12,}/g, "[REDACTED_API_KEY]")
    .replace(/-----BEGIN [^-]+ PRIVATE KEY-----[\s\S]*?-----END [^-]+ PRIVATE KEY-----/g, "[REDACTED_PRIVATE_KEY]")
    .replace(/(api[_-]?key|secret|token|password|private[_-]?key)\s*[:=]\s*["']?[^"'\s]+/gi, "$1=[REDACTED]")
    .slice(0, 6000);
}

function safeGoal(goal) {
  const value = redactSensitive(goal).trim();
  return value || "继续推进 Pilot";
}

function sanitizeFileName(name = "attachment") {
  const cleaned = String(name)
    .trim()
    .replace(/[/\\?%*:|"<>]/g, "-")
    .replace(/\s+/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
  return cleaned || "attachment";
}

function decodeDataUrl(dataUrl) {
  const match = String(dataUrl ?? "").match(/^data:([^;,]+)?(?:;charset=[^;,]+)?;base64,(.+)$/);
  if (!match) return null;
  return {
    mimeType: match[1] || "application/octet-stream",
    buffer: Buffer.from(match[2], "base64")
  };
}

function formatBytes(bytes) {
  const value = Number(bytes || 0);
  if (value >= 1024 * 1024) return `${(value / (1024 * 1024)).toFixed(1)} MB`;
  if (value >= 1024) return `${Math.round(value / 1024)} KB`;
  return `${value} B`;
}

function isTextAttachment(type, name) {
  const value = String(type || "");
  const filename = String(name || "").toLowerCase();
  return value.startsWith("text/")
    || value.includes("json")
    || [".md", ".txt", ".json", ".csv", ".log", ".yaml", ".yml"].some((ext) => filename.endsWith(ext));
}

async function materializeAttachments(input, planId) {
  const rawAttachments = Array.isArray(input?.attachments) ? input.attachments.slice(0, maxAttachmentCount) : [];
  if (rawAttachments.length === 0) return [];

  const uploadDir = resolve(repoRoot, actionUploadDir, planId);
  await mkdir(uploadDir, { recursive: true });

  const stored = [];
  for (const [index, raw] of rawAttachments.entries()) {
    const decoded = decodeDataUrl(raw?.data_url);
    if (!decoded || decoded.buffer.length === 0 || decoded.buffer.length > maxAttachmentBytes) continue;

    const safeName = sanitizeFileName(raw?.name || `attachment-${index + 1}`);
    const storedName = `${String(index + 1).padStart(2, "0")}-${safeName}`;
    const absolutePath = join(uploadDir, storedName);
    await writeFile(absolutePath, decoded.buffer);

    stored.push({
      id: `attachment-${index + 1}`,
      name: safeName,
      mime_type: String(raw?.type || decoded.mimeType || "application/octet-stream"),
      kind: String(raw?.kind || "").toLowerCase() === "image" ? "image" : (String(raw?.type || decoded.mimeType || "").startsWith("image/") ? "image" : "file"),
      size_bytes: decoded.buffer.length,
      size_label: formatBytes(decoded.buffer.length),
      width: Number.isFinite(Number(raw?.width)) ? Number(raw.width) : null,
      height: Number.isFinite(Number(raw?.height)) ? Number(raw.height) : null,
      text_excerpt: isTextAttachment(raw?.type, raw?.name)
        ? redactSensitive(String(raw?.text_excerpt || "")).slice(0, 800)
        : "",
      stored_path: relative(repoRoot, absolutePath)
    });
  }
  return stored;
}

function attachmentSummaryLines(attachments = []) {
  if (!attachments.length) return [];
  return [
    "已接收以下本地附件，请优先结合它们理解目标：",
    ...attachments.map((attachment) => {
      const segments = [
        attachment.kind === "image" ? "图片" : "文件",
        attachment.name,
        attachment.stored_path,
        attachment.size_label
      ];
      if (attachment.width && attachment.height) segments.push(`${attachment.width}x${attachment.height}`);
      if (attachment.text_excerpt) segments.push(`摘录：${attachment.text_excerpt.replace(/\s+/g, " ").slice(0, 160)}`);
      return `- ${segments.join(" | ")}`;
    })
  ];
}

function normalizeWorkspaceMode(input = {}) {
  return String(input.workspace_mode || input.mode || "auto");
}

function normalizeRequestedAgent(input = {}) {
  const requested = String(input.agent || "auto").trim() || "auto";
  return requested === "gemini" ? "gemini-cli" : requested;
}

function resolveExecutionAgent(input = {}) {
  const requested = normalizeRequestedAgent(input);
  if (selectableAgentRuntimeIds.has(requested)) {
    return {
      requested,
      effective: requested,
      fallback: false,
      direct_cli: liveCliAgentRuntimeIds.has(requested)
    };
  }
  if (!requested || requested === "auto") {
    return { requested: "auto", effective: "codex-cli", fallback: false, direct_cli: true };
  }
  return { requested, effective: "codex-cli", fallback: true, direct_cli: true };
}

function inferWorkspaceActionId(input = {}) {
  const goal = safeGoal(input.goal).toLowerCase();
  const mode = normalizeWorkspaceMode(input);
  const requestedAgent = normalizeRequestedAgent(input);
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  if (mode === "plan_only") return "goal-plan";
  if (mode === "agent") return "agent-real-plan";
  if (hasAttachments) return "agent-real-plan";
  if (selectableAgentRuntimeIds.has(requestedAgent)) return "agent-real-plan";
  if (goal.includes("阻断") || goal.includes("blocker") || goal.includes("blocked")) return "project-inspect";
  if (goal.includes("上线") || goal.includes("go-live") || goal.includes("golive")) return "project-dispatch";
  if (goal.includes("接入项目") || goal.includes("连接项目") || goal.includes("github") || goal.includes("仓库接入") || goal.includes("本地项目")) return "project-connect-dry-run";
  if (goal.includes("project inspect") || goal.includes("项目状态") || goal.includes("项目概况")) return "project-inspect";
  if (goal.includes("worker") || goal.includes("agent 状态") || goal.includes("agent状态")) return "worker-health";
  if (goal.includes("runtime") || goal.includes("运行时")) return "runtime-health";
  if (goal.includes("governance") || goal.includes("治理") || goal.includes("审批")) return "governance-check";
  if (goal.includes("context") || goal.includes("上下文") || goal.includes("记忆")) return "context-summary";
  if (goal.includes("proposal") || goal.includes("待审批")) return "proposal-review";
  if (goal.includes("本地预览") || goal.includes("local preview")) return "release-local-preview";
  if (goal.includes("服务器预览") || goal.includes("server preview")) return "release-server-preview";
  if (goal.includes("reviewed publish") || goal.includes("发布确认")) return "release-reviewed-publish";
  if (goal.includes("autopilot") || goal.includes("batch") || goal.includes("批处理")) return "autopilot-dry-run";
  if (goal.includes("生成计划") || goal.includes("只生成计划")) return "goal-plan";
  return "agent-real-plan";
}

function normalizeActionId(actionId, input = {}) {
  if (actionId === "autopilot-run") return "autopilot-dry-run";
  if (actionId === "proposal-approve") return "proposal-approve-dry-run";
  if (actionId === "proposal-inject") return "proposal-approve-apply";
  if (actionId === "project-connect") return "project-connect-dry-run";
  if (actionId === "worker-status") return "worker-health";
  if (actionId === "worker-claim" || actionId === "queue-claim") return "worker-claim-preflight";
  if (actionId === "pending-proposals") return "proposal-review";
  if (actionId === "smart-park-go-live-plan-dry-run") return "smart-park-go-live-plan";
  if (actionId === "local-preview") return "release-local-preview";
  if (actionId === "server-preview") return "release-server-preview";
  if (actionId === "reviewed-publish") return "release-reviewed-publish";
  if (actionId === "workspace-default" || actionId === "workspace-goal") return inferWorkspaceActionId(input);
  return consoleActionOptions.some((action) => action.id === actionId) ? actionId : "context-summary";
}

function normalizeProject(projectId) {
  const projects = projectsMap();
  return projects[projectId] ? projectId : (projectRegistry()[0]?.project_id ?? "jinhu-smart-park");
}

function desiredParallelCountForAction(actionId, input = {}) {
  const explicit = Number(input.parallel_count ?? input.parallelCount ?? input.parallel ?? 0);
  if (Number.isFinite(explicit) && explicit > 0) return explicit;
  return ["autopilot-dry-run", "autopilot-execute", "agent-real-plan"].includes(actionId) ? 4 : 1;
}

function effectiveParallelCountForPlan(actionId, input = {}, userContext = null) {
  const requested = desiredParallelCountForAction(actionId, input);
  const workerLimit = Number(userContext?.plan?.worker_parallel_limit ?? 0);
  if (!Number.isFinite(workerLimit) || workerLimit <= 0) {
    return {
      requested,
      effective: requested,
      adjusted: false,
      limit: null
    };
  }
  const effective = Math.max(1, Math.min(requested, workerLimit));
  return {
    requested,
    effective,
    adjusted: effective !== requested,
    limit: workerLimit
  };
}

function commandFor(input, plan = null) {
  const actionId = normalizeActionId(input.action_id, input);
  const projectId = normalizeProject(input.project_id);
  const goal = safeGoal(input.goal);
  const project = projectsMap()[projectId];
  const effectiveParallel = Number(plan?.effective_parallel ?? input.parallel ?? input.parallel_count ?? 0) || 1;

  if (actionId === "ai-runtime-status") {
    return {
      command: process.execPath,
      args: [studioScript, "console", "agent-status", "--dry-run"],
      display: `node ${studioScript} console agent-status --dry-run`
    };
  }
  if (actionId === "agent-real-plan") {
    return realAgentCommandFor({ ...input, agent: plan?.agent ?? resolveExecutionAgent(input).effective }, plan?.attachments ?? []);
  }
  if (actionId === "context-summary") {
    return {
      command: process.execPath,
      args: [studioScript, "context", "summary"],
      display: `node ${studioScript} context summary`
    };
  }
  if (actionId === "project-inspect") {
    if (!project?.config_path || !existsSync(resolve(repoRoot, project.config_path))) {
      return {
        command: process.execPath,
        args: [studioScript, "context", "project", "--project", projectId],
        display: `node ${studioScript} context project --project ${projectId}`
      };
    }
    return {
      command: process.execPath,
      args: [studioScript, "project", "inspect", "--config", project.config_path, "--dry-run"],
      display: `node ${studioScript} project inspect --config ${project.config_path} --dry-run`
    };
  }
  if (actionId === "project-connect-dry-run" || actionId === "project-connect-apply") {
    const flags = [];
    if (String(input.connect_project_id ?? "").trim()) flags.push("--project-id", String(input.connect_project_id).trim());
    if (String(input.connect_project_name ?? "").trim()) flags.push("--project-name", String(input.connect_project_name).trim());
    if (String(input.connect_source_type ?? "").trim() && String(input.connect_source_type).trim() !== "auto") {
      flags.push("--source-type", String(input.connect_source_type).trim());
    }
    if (String(input.connect_local_path ?? "").trim()) flags.push("--local-path", String(input.connect_local_path).trim());
    if (String(input.connect_git_url ?? "").trim()) flags.push("--git-url", String(input.connect_git_url).trim());
    if (String(input.connect_url ?? "").trim()) flags.push("--url", String(input.connect_url).trim());
    if (String(input.connect_zip_placeholder ?? "").trim()) flags.push("--zip-placeholder", String(input.connect_zip_placeholder).trim());
    if (String(input.connect_description ?? "").trim()) flags.push("--description", String(input.connect_description).trim());
    if (String(input.connect_default_branch ?? "").trim()) flags.push("--default-branch", String(input.connect_default_branch).trim());
    if (String(input.connect_package_manager ?? "").trim()) flags.push("--package-manager", String(input.connect_package_manager).trim());
    if (String(input.connect_project_type ?? "").trim()) flags.push("--project-type", String(input.connect_project_type).trim());
    const finalArgs = [studioScript, "project", "connect", ...flags, actionId === "project-connect-apply" ? "--apply" : "--dry-run"];
    return {
      command: process.execPath,
      args: finalArgs,
      display: `node ${finalArgs.join(" ")}`
    };
  }
  if (actionId === "runtime-health") {
    return {
      command: process.execPath,
      args: [studioScript, "runtime", "health", "--dry-run"],
      display: `node ${studioScript} runtime health --dry-run`
    };
  }
  if (actionId === "worker-health") {
    return {
      command: process.execPath,
      args: [studioScript, "worker", "health", "--dry-run"],
      display: `node ${studioScript} worker health --dry-run`
    };
  }
  if (actionId === "governance-check") {
    return {
      command: process.execPath,
      args: [studioScript, "governance", "check", "--dry-run"],
      display: `node ${studioScript} governance check --dry-run`
    };
  }
  if (actionId === "goal-plan") {
    return {
      command: process.execPath,
      args: [studioScript, "plan", "--goal", goal, "--dry-run"],
      display: `node ${studioScript} plan --goal "${goal}" --dry-run`
    };
  }
  if (actionId === "project-dispatch") {
    return {
      command: process.execPath,
      args: [studioScript, "project", "dispatch-plan", "--project", projectId, "--text", goal, "--dry-run"],
      display: `node ${studioScript} project dispatch-plan --project ${projectId} --text "${goal}" --apply -> project task-plan --apply-proposal -> project proposals`
    };
  }
  if (actionId === "autopilot-dry-run") {
    return {
      command: process.execPath,
      args: [studioScript, "autopilot", "batch", "--goal", goal, "--dry-run", "--parallel", String(effectiveParallel)],
      display: `node ${studioScript} autopilot batch --goal "${goal}" --dry-run --parallel ${effectiveParallel}`
    };
  }
  if (actionId === "autopilot-execute") {
    return {
      command: process.execPath,
      args: [studioScript, "autopilot", "batch", "--goal", goal, "--apply", "--parallel", String(effectiveParallel)],
      display: `node ${studioScript} autopilot batch --goal "${goal}" --apply --parallel ${effectiveParallel}`
    };
  }
  if (actionId === "smart-park-continue") {
    return {
      command: process.execPath,
      args: [studioScript, "project", "evidence", "--project", "jinhu-smart-park", "--dry-run"],
      display: `node ${studioScript} project evidence --project jinhu-smart-park --dry-run`
    };
  }
  if (actionId === "smart-park-blockers" || actionId === "smart-park-go-live-plan") {
    return {
      command: process.execPath,
      args: [studioScript, "project", "chain-validate", "--project", "jinhu-smart-park", "--dry-run"],
      display: `node ${studioScript} project chain-validate --project jinhu-smart-park --dry-run`
    };
  }
  if (actionId === "proposal-review") {
    const configPath = projectConfigFor(projectId);
    return {
      command: process.execPath,
      args: [studioScript, "project", "proposals", "--config", configPath],
      display: `node ${studioScript} project proposals --config ${configPath}`
    };
  }
  if (actionId === "release-local-preview") {
    return {
      command: process.execPath,
      args: [studioScript, "release", "consistency", "--apply", "--target", "local_preview"],
      display: `node ${studioScript} release consistency --apply --target local_preview`
    };
  }
  if (actionId === "release-server-preview") {
    return {
      command: process.execPath,
      args: [studioScript, "release", "consistency", "--apply", "--target", "server_preview"],
      display: `node ${studioScript} release consistency --apply --target server_preview`
    };
  }
  if (actionId === "release-reviewed-publish") {
    return {
      command: process.execPath,
      args: [studioScript, "release", "consistency", "--apply", "--target", "reviewed_publish"],
      display: `node ${studioScript} release consistency --apply --target reviewed_publish`
    };
  }
  if (actionId === "proposal-approve-dry-run") {
    const configPath = projectConfigFor(projectId);
    return {
      command: process.execPath,
      args: [studioScript, "project", "approve-proposal", "--config", configPath, "--task-id", input.task_id || "<auto>", "--dry-run"],
      display: `node ${studioScript} project approve-proposal --config ${configPath} --task-id ${input.task_id || "<auto>"} --dry-run`
    };
  }
  if (actionId === "proposal-approve-apply") {
    const configPath = projectConfigFor(projectId);
    return {
      command: process.execPath,
      args: [studioScript, "project", "approve-proposal", "--config", configPath, "--task-id", input.task_id || "<auto>", "--apply"],
      display: `node ${studioScript} project approve-proposal --config ${configPath} --task-id ${input.task_id || "<auto>"} --apply`
    };
  }
  if (actionId === "worker-claim-preflight") {
    return {
      command: process.execPath,
      args: [studioScript, "worker", "dispatch", "--runtime", String(input.agent || "local-agent"), "--dry-run"],
      display: `controlled worker claim gate --project ${projectId} --task-id ${input.task_id || "<auto>"}`
    };
  }
  if (actionId === "proposal-reject-draft") {
    return {
      command: process.execPath,
      args: [studioScript, "project", "proposals", "--config", projectConfigFor(projectId)],
      display: "proposal reject draft -> review required"
    };
  }
  return {
    command: process.execPath,
    args: [studioScript, "project", "proposals", "--config", projectConfigFor(projectId)],
    display: `node ${studioScript} project proposals --config ${projectConfigFor(projectId)}`
  };
}

function realAgentPromptFor(input, attachments = []) {
  const goal = safeGoal(input.goal);
  const projectId = normalizeProject(input.project_id);
  return [
    "你正在通过 ANKSEN Studio 运行。",
    "这是本地 Pilot Production 模式。",
    "安全边界：只读分析和计划；不要修改文件；不要执行 deploy；不要进行 production operation；不要读取或输出真实凭证；不要写入任何挂接业务项目代码。",
    `项目：${projectId}`,
    `目标：${goal}`,
    ...(attachments.length > 0 ? ["", ...attachmentSummaryLines(attachments)] : []),
    "",
    "请全程使用中文，并显式输出可见进度，不要隐藏在内部：",
    "阶段 1/5：已理解目标",
    "阶段 2/5：选择项目与运行时",
    "阶段 3/5：分析当前缺口",
    "阶段 4/5：给出安全执行计划",
    "阶段 5/5：输出结论、风险等级、下一步建议",
    "",
    "要求：",
    "- 输出可以逐段简短更新，像终端任务流。",
    ...(attachments.length > 0 ? ["- 如果附件中包含图片或文件，请先阅读并在结论里明确提取到的关键信息。"] : []),
    "- 不要输出隐私、密钥、生产凭证。",
    "- 不要编造已执行的仓库改动。"
  ].join("\n");
}

function realAgentCommandFor(input, attachments = []) {
  const agent = normalizeRequestedAgent(input);
  const prompt = realAgentPromptFor(input, attachments);
  const goal = safeGoal(input.goal);
  const projectId = normalizeProject(input.project_id);
  const username = input.username || input.user || "owner";
  if (agent === "claude-code") {
    return {
      command: "claude",
      args: [
        "--print",
        "--bare",
        "--disallowedTools",
        "Bash,Edit,Write,MultiEdit,NotebookEdit",
        prompt
      ],
      display: `claude --print --bare --disallowedTools Bash,Edit,Write,MultiEdit,NotebookEdit "<prompt>"`
    };
  }
  if (managedModelGatewayRuntimeIds.has(agent)) {
    return {
      command: process.execPath,
      args: [
        studioScript,
        "model-gateway",
        "invoke-plan",
        "--runtime",
        agent,
        "--goal",
        goal,
        "--project",
        projectId,
        "--user",
        username,
        "--dry-run"
      ],
      display: `node ${studioScript} model-gateway invoke-plan --runtime ${agent} --goal "<goal>" --project ${projectId} --user ${username} --dry-run`
    };
  }
  if (agent !== "codex-cli") {
    const runtimeId = selectableAgentRuntimeIds.has(agent) ? agent : "codex-cli";
    return {
      command: process.execPath,
      args: [
        studioScript,
        "adapter",
        "invoke-plan",
        "--runtime",
        runtimeId,
        "--skill",
        "code_development",
        "--dry-run"
      ],
      display: `node ${studioScript} adapter invoke-plan --runtime ${runtimeId} --skill code_development --dry-run`
    };
  }
  return {
    command: "codex",
    args: [
      "exec",
      "--sandbox",
      "read-only",
      "--cd",
      repoRoot,
      "--color",
      "never",
      prompt
    ],
    display: `codex exec --sandbox read-only --cd ${repoRoot} "<prompt>"`
  };
}

function actionMeta(actionId) {
  return consoleActionOptions.find((action) => action.id === actionId) ?? consoleActionOptions[0];
}

function governanceGateForRisk(risk) {
  if (risk === "CRITICAL") {
    return {
      execution_mode: "human_approval_required",
      gate_action: "HUMAN_APPROVAL_REQUIRED",
      allowed_to_execute: false,
      approval_required: true,
      blocked_reason: "CRITICAL 风险必须人工审批，Console 不能直接执行。"
    };
  }
  if (risk === "HIGH") {
    return {
      execution_mode: "proposal_only",
      gate_action: "PROPOSAL_ONLY",
      allowed_to_execute: false,
      approval_required: true,
      blocked_reason: "HIGH 风险保持 proposal_only，需要审批后由独立流程执行。"
    };
  }
  return {
    execution_mode: "direct_execute",
    gate_action: "ALLOW_DIRECT_EXECUTE",
    allowed_to_execute: true,
    approval_required: false,
    blocked_reason: null
  };
}

async function resolveActionAccess(input, actionId, meta, options = {}) {
  const bundle = options.access_bundle ?? await loadAccessCenter();
  const context = options.user_context ?? await resolveSessionContext(bundle, {
    session_token: options.session_token,
    allow_default_user: options.allow_default_user !== false
  });
  const agentSelection = resolveExecutionAgent(input);
  const parallel = effectiveParallelCountForPlan(actionId, input, context);
  const decision = await evaluateConsoleActionAccess(bundle, {
    action_id: actionId,
    project_id: normalizeProject(input.project_id),
    risk: meta.risk,
    attachment_count: Array.isArray(input.attachments) ? input.attachments.length : 0,
    runtime_id: agentSelection.effective,
    parallel_count: parallel.effective
  }, {
    user_context: context,
    allow_default_user: options.allow_default_user !== false
  });
  return { bundle, context, decision, agentSelection, parallel };
}

function buildPlan(input, access = {}) {
  const actionId = normalizeActionId(input.action_id, input);
  const projectId = normalizeProject(input.project_id);
  const project = projectsMap()[projectId];
  const meta = actionMeta(actionId);
  const gate = governanceGateForRisk(meta.risk);
  const accessContext = access.context ?? null;
  const accessDecision = access.decision ?? {
    status: "ALLOW",
    execution_mode: gate.execution_mode,
    reason: "Access Center default allow context.",
    required_capabilities: [],
    missing_capabilities: [],
    effective_capabilities: [],
    direct_execute_max_risk: "MEDIUM",
      project_scope: ["*"]
  };
  const agentSelection = access.agentSelection ?? resolveExecutionAgent(input);
  const parallel = access.parallel ?? effectiveParallelCountForPlan(actionId, input, accessContext);
  const now = new Date().toISOString();
  const planId = `console-action-${timestampForFile(now)}-${createHash("sha1").update(`${actionId}:${projectId}:${now}`).digest("hex").slice(0, 8)}`;
  const accessBlocked = accessDecision.status !== "ALLOW";
  const blockedReason = accessBlocked ? accessDecision.reason : gate.blocked_reason;
  const plan = {
    schema_version: 1,
    plan_id: planId,
    created_at: now,
    action_id: actionId,
    action_label: meta.label,
    target_project: projectId,
    target_project_status: project?.connection_status ?? "unknown",
    goal_summary: safeGoal(input.goal).slice(0, 240),
    workspace_mode: normalizeWorkspaceMode(input),
    requested_agent: agentSelection.requested,
    agent: actionId === "agent-real-plan" ? agentSelection.effective : normalizeRequestedAgent(input),
    runtime_id: agentSelection.effective,
    agent_fallback: actionId === "agent-real-plan" && agentSelection.fallback
      ? `所选 Agent 当前未接本地执行，已回退到 ${agentSelection.effective}`
      : null,
    risk: meta.risk,
    approval_required: gate.approval_required,
    mode: gate.execution_mode,
    governance_gate: gate.gate_action,
    allowed_to_execute: gate.allowed_to_execute && !accessBlocked,
    blocked_reason: blockedReason,
    write_enabled: false,
    production_enabled: false,
    log_path: `${actionLogDir}/${planId}.json`,
    requested_by: accessContext?.user ? {
      user_id: accessContext.user.user_id,
      username: accessContext.user.username,
      display_name: accessContext.user.display_name,
      roles: accessContext.roles.map((role) => role.role_id),
      plan_id: accessContext.plan?.plan_id ?? "unknown",
      feature_flags: accessContext.feature_flags ?? []
    } : {
      user_id: "anonymous",
      username: "anonymous",
      display_name: "anonymous",
      roles: [],
      plan_id: "none",
      feature_flags: []
    },
    access: {
      status: accessDecision.status,
      execution_mode: accessDecision.execution_mode,
      reason: accessDecision.reason,
      required_capabilities: accessDecision.required_capabilities,
      missing_capabilities: accessDecision.missing_capabilities,
      direct_execute_max_risk: accessDecision.direct_execute_max_risk,
      project_scope: accessDecision.project_scope,
      plan_limits: accessDecision.plan_limits ?? null
    },
    requested_parallel: parallel.requested,
    effective_parallel: parallel.effective,
    limit_adjustments: parallel.adjusted
      ? {
          parallel: {
            requested: parallel.requested,
            effective: parallel.effective,
            reason: `当前套餐并发上限为 ${parallel.limit}，已按套餐额度自动收敛。`
          }
        }
      : null,
    safety: {
      bind_address: "127.0.0.1",
      pilot_production_mode: true,
      direct_execute_allowed_for: ["LOW", "MEDIUM"],
      high_risk_policy: "proposal_only",
      critical_risk_policy: "human_approval_required",
      deploy: "disabled",
      production_operation: "disabled",
      server_access: "disabled",
      credential_values: "not_read",
      credential_storage: "disabled",
      managed_project_writes: "disabled",
      external_model_call: actionId === "agent-real-plan" && agentSelection.direct_cli
        ? "user_selected_local_cli_runtime"
        : "disabled_or_invoke_plan_only"
    }
  };
  const command = commandFor({ ...input, action_id: actionId, project_id: projectId }, plan);
  return {
    ...plan,
    command: command.display
  };
}

async function preparePlan(input, options = {}) {
  const actionId = normalizeActionId(input.action_id, input);
  const meta = actionMeta(actionId);
  const access = await resolveActionAccess(input, actionId, meta, options);
  const plan = buildPlan(input, access);
  const attachments = await materializeAttachments(input, plan.plan_id);
  return {
    ...plan,
    attachment_count: attachments.length,
    attachments,
    access: {
      ...plan.access,
      effective_capabilities: access.decision.effective_capabilities ?? [],
      auth_user: access.context?.user?.username ?? "anonymous"
    }
  };
}

async function detectCommand(command) {
  try {
    const { stdout } = await execFileAsync("/bin/sh", ["-lc", `command -v ${command}`], {
      cwd: repoRoot,
      timeout: 10000,
      maxBuffer: 1024 * 256
    });
    const path = stdout.trim();
    let version = "unknown";
    try {
      const versionResult = await execFileAsync(command, ["--version"], {
        cwd: repoRoot,
        timeout: 10000,
        maxBuffer: 1024 * 256
      });
      version = summarizeStdout(versionResult.stdout || versionResult.stderr) || "unknown";
    } catch {
      version = "installed";
    }
    return { command, installed: Boolean(path), path, version };
  } catch {
    return { command, installed: false, path: "", version: "missing" };
  }
}

async function completeAgentRuntimeUnavailableFallback(run, input, commandName) {
  const fallbackArgs = [
    studioScript,
    "plan",
    "--goal",
    run.plan.goal_summary || safeGoal(input.goal),
    "--completion-aware",
    "--dry-run"
  ];
  const runtimeLabel = commandName === "claude" ? "Claude Code CLI" : "Codex CLI";
  const missingMessage = `${runtimeLabel} 未安装或不在服务 PATH 中，已切换为 Studio 内置 Planning Center 安全规划。`;
  let fallbackSummary = missingMessage;
  let fallbackStatus = "PASS";
  let fallbackExitCode = 0;
  let fallbackError = "";

  try {
    const fallback = await execFileAsync(process.execPath, fallbackArgs, {
      cwd: repoRoot,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 10
    });
    fallbackSummary = [
      missingMessage,
      "",
      summarizeStdout(fallback.stdout)
    ].join("\n");
    fallbackError = summarizeStdout(fallback.stderr);
  } catch (error) {
    fallbackStatus = "FAIL";
    fallbackExitCode = typeof error?.code === "number" ? error.code : 1;
    fallbackSummary = missingMessage;
    fallbackError = summarizeStdout(error?.stdout ?? error?.stderr ?? error?.message ?? "");
  }

  run.status = fallbackStatus;
  run.phase = fallbackStatus === "PASS" ? "reported" : "failed";
  run.result = {
    status: fallbackStatus,
    exit_code: fallbackExitCode,
    stdout_summary: fallbackSummary,
    stderr_summary: fallbackError
  };
  run.messages.push({
    role: "assistant",
    content: fallbackStatus === "PASS"
      ? `执行完成：${missingMessage}`
      : `执行失败：${fallbackError || missingMessage}`,
    at: new Date().toISOString(),
    phase: fallbackStatus === "PASS" ? "report" : "failed"
  });
  pushTranscriptLine(run, fallbackStatus === "PASS" ? "system" : "stderr", fallbackStatus === "PASS" ? fallbackSummary : (fallbackError || missingMessage));
  run.timeline = runTimeline(run.status, run.result.status);
  await persistConversationRun(run);
}

export async function detectLocalAiRuntimes() {
  const [codex, claude, gemini, aider, localAgent, openhands] = await Promise.all([
    detectCommand("codex"),
    detectCommand("claude"),
    detectCommand("gemini"),
    detectCommand("aider"),
    detectCommand("local-agent"),
    detectCommand("openhands")
  ]);
  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    runtimes: [
      {
        runtime_id: "codex-cli",
        provider: "openai",
        command: codex.command,
        installed: codex.installed,
        path: codex.path,
        version: codex.version,
        invocation_mode: "codex exec --sandbox read-only",
        credential_policy: "external_cli_session",
        secret_values_read_by_console: false
      },
      {
        runtime_id: "claude-code",
        provider: "anthropic",
        command: claude.command,
        installed: claude.installed,
        path: claude.path,
        version: claude.version,
        invocation_mode: "claude --print --bare",
        credential_policy: "external_cli_session_or_env",
        secret_values_read_by_console: false
      },
      {
        runtime_id: "gemini-cli",
        provider: "google",
        command: gemini.command,
        installed: gemini.installed,
        path: gemini.path,
        version: gemini.version,
        invocation_mode: "gemini CLI",
        credential_policy: "external_cli_session_or_env",
        secret_values_read_by_console: false
      },
      {
        runtime_id: "aider",
        provider: "aider",
        command: aider.command,
        installed: aider.installed,
        path: aider.path,
        version: aider.version,
        invocation_mode: "aider CLI",
        credential_policy: "external_model_env_or_config",
        secret_values_read_by_console: false
      },
      {
        runtime_id: "deepseek-chat",
        provider: "deepseek",
        command: "platform-managed-api",
        installed: true,
        path: "credential-reference:deepseek-platform-ref",
        version: "reference-only",
        invocation_mode: "model-gateway invoke-plan / proposal flow",
        credential_policy: "admin_managed_reference",
        secret_values_read_by_console: false,
        managed_by_admin: true,
        direct_model_call_by_console: false
      },
      {
        runtime_id: "qwen-plus",
        provider: "qwen",
        command: "platform-managed-api",
        installed: true,
        path: "credential-reference:qwen-platform-ref",
        version: "reference-only",
        invocation_mode: "model-gateway invoke-plan / proposal flow",
        credential_policy: "admin_managed_reference",
        secret_values_read_by_console: false,
        managed_by_admin: true,
        direct_model_call_by_console: false
      },
      {
        runtime_id: "local-agent",
        provider: "local-runtime",
        command: localAgent.command,
        installed: localAgent.installed,
        path: localAgent.path,
        version: localAgent.version,
        invocation_mode: "deterministic local helper",
        credential_policy: "not_required",
        secret_values_read_by_console: false
      },
      {
        runtime_id: "openhands",
        provider: "openhands",
        command: openhands.command,
        installed: openhands.installed,
        path: openhands.path,
        version: openhands.version,
        invocation_mode: "remote-worker/proposal-only",
        credential_policy: "external_worker_reference",
        secret_values_read_by_console: false,
        proposal_only: true
      }
    ],
    safety: {
      console_reads_secret_values: false,
      console_stores_secret_values: false,
      default_invocation: "user_selected_only",
      codex_sandbox: "read-only",
      claude_tools: "Bash/Edit/Write/MultiEdit/NotebookEdit disallowed",
      openhands: "remote worker remains HIGH/proposal_only until approved",
      domestic_models: "DeepSeek/Qwen are reference-only and routed through invoke-plan until a managed API gateway is approved"
    }
  };
}

async function executeProjectDispatchFlow(plan, input) {
  const projectId = plan.target_project;
  const configPath = projectConfigFor(projectId);
  let modelGatewayBridge = null;
  if (shouldBridgeModelGatewayProposal(plan, input)) {
    const requested = normalizeRequestedAgent(input);
    const runtimeId = managedModelGatewayRuntimeIds.has(requested) ? requested : "deepseek-chat";
    const modelGatewayResult = await runShellCommand(process.execPath, [
      studioScript,
      "model-gateway",
      "invoke-plan",
      "--runtime",
      runtimeId,
      "--goal",
      safeGoal(input.goal),
      "--project",
      projectId,
      "--user",
      input.username || input.user || plan.requested_by?.username || "owner",
      "--dry-run"
    ]);
    if (!modelGatewayResult.ok) {
      return {
        status: "FAIL",
        exit_code: modelGatewayResult.exit_code,
        stdout_summary: summarizeStdout(modelGatewayResult.stdout),
        stderr_summary: summarizeStdout(modelGatewayResult.stderr)
      };
    }
    const modelGatewayFields = parseStudioFieldMap(modelGatewayResult.stdout);
    modelGatewayBridge = await writeModelGatewayProposalBridge(projectId, input, plan, modelGatewayFields);
  }

  const dispatchResult = await runShellCommand(process.execPath, [
    studioScript,
    "project",
    "dispatch-plan",
    "--project",
    projectId,
    "--text",
    safeGoal(input.goal),
    "--apply"
  ]);
  if (!dispatchResult.ok) {
    return {
      status: "FAIL",
      exit_code: dispatchResult.exit_code,
      stdout_summary: summarizeStdout(dispatchResult.stdout),
      stderr_summary: summarizeStdout(dispatchResult.stderr)
    };
  }

  const dispatchFields = parseStudioFieldMap(dispatchResult.stdout);
  let proposalCreated = null;
  if (dispatchFields.recommended_next_stage === "create_proposal") {
    const proposalResult = await runShellCommand(process.execPath, [
      studioScript,
      "project",
      "task-plan",
      "--config",
      configPath,
      "--text",
      safeGoal(input.goal),
      "--apply-proposal"
    ]);
    if (!proposalResult.ok) {
      return {
        status: "FAIL",
        exit_code: proposalResult.exit_code,
        stdout_summary: summarizeStdout(dispatchResult.stdout),
        stderr_summary: summarizeStdout(proposalResult.stderr || proposalResult.stdout)
      };
    }
    const proposalFields = parseStudioFieldMap(proposalResult.stdout);
    proposalCreated = {
      task_id: proposalFields.task_id || dispatchFields.task_id || "",
      proposal_file: proposalFields.proposal_file || ""
    };
  }

  const proposals = await readProjectProposalRecords(projectId);
  const modelGatewayProposals = await readModelGatewayProposalRecords(projectId);
  const allProposalRecords = [...proposals, ...modelGatewayProposals];
  const pending = allProposalRecords.find((record) => !isProposalApprovalCleared(record)) ?? null;
  const reviewCandidate = pending ?? allProposalRecords[0] ?? null;
  const summary = [
    `selected_agent: ${plan.agent || plan.runtime_id || "auto"}`,
    `runtime_id: ${plan.runtime_id || "auto"}`,
    modelGatewayBridge
      ? `model_gateway_proposal: ${modelGatewayBridge.record.task_id} | ${modelGatewayBridge.path}`
      : "model_gateway_proposal: skipped",
    `dispatch_plan: ${dispatchFields.pipeline_stage || "unknown"}`,
    `recommended_next_stage: ${dispatchFields.recommended_next_stage || "unknown"}`,
    proposalCreated
      ? `proposal_created: ${proposalCreated.task_id} | ${proposalCreated.proposal_file || "file pending"}`
      : `proposal_state: ${reviewCandidate?.data?.approval_status || "none"}`,
    `proposal_review_ready: ${reviewCandidate ? "yes" : "no"}`,
    "",
    summarizeProposalRecords(allProposalRecords)
  ].join("\n");
  return {
    status: pending ? "NEEDS_APPROVAL" : "PASS",
    exit_code: 0,
    stdout_summary: summary,
    stderr_summary: "",
    proposal_task_id: proposalCreated?.task_id || pending?.data?.task_id || reviewCandidate?.data?.task_id || ""
  };
}

async function executeProposalReviewFlow(plan) {
  const projectId = plan.target_project;
  const proposals = await readProjectProposalRecords(projectId);
  const audits = await readProjectQueueAuditRecords(projectId);
  const modelGatewayProposals = await readModelGatewayProposalRecords(projectId);
  const modelGatewayAudits = await readModelGatewayQueueAuditRecords(projectId);
  const allProposals = [...proposals, ...modelGatewayProposals];
  const allAudits = [...audits, ...modelGatewayAudits];
  const pending = allProposals.filter((record) => !isProposalApprovalCleared(record));
  return {
    status: pending.length > 0 ? "NEEDS_APPROVAL" : "PASS",
    exit_code: 0,
    stdout_summary: [
      `proposal_count: ${allProposals.length}`,
      `model_gateway_proposal_count: ${modelGatewayProposals.length}`,
      `pending_approval: ${pending.length}`,
      "",
      summarizeProposalRecords(allProposals),
      "",
      summarizeQueueAuditRecords(allAudits)
    ].join("\n"),
    stderr_summary: ""
  };
}

async function executeProposalApproveDryRunFlow(plan, input) {
  const projectId = plan.target_project;
  const configPath = projectConfigFor(projectId);
  const proposals = await readProjectProposalRecords(projectId);
  const modelGatewayProposals = await readModelGatewayProposalRecords(projectId);
  const requestedTaskId = String(input.task_id || "");
  const exactProposal = requestedTaskId ? proposals.find((record) => record.data?.task_id === requestedTaskId) : null;
  const exactModelGatewayProposal = requestedTaskId ? modelGatewayProposals.find((record) => record.data?.task_id === requestedTaskId) : null;
  const selected = exactProposal ?? (!requestedTaskId ? findPendingProposal(proposals) : null);
  const selectedModelGateway = exactModelGatewayProposal ?? (!requestedTaskId && !selected ? findPendingModelGatewayProposal(modelGatewayProposals) : null);
  if (selectedModelGateway) {
    return {
      status: "NEEDS_APPROVAL",
      exit_code: 0,
      stdout_summary: [
        `model_gateway_proposal: ${selectedModelGateway.data?.task_id || "unknown"}`,
        `runtime_id: ${selectedModelGateway.data?.runtime_id || "unknown"}`,
        `risk: ${selectedModelGateway.data?.risk || "MEDIUM"}`,
        "dry_run: approved proposal would write queue injection audit trace only.",
        "model_invocation: disabled",
        "credential_values_read: no",
        "",
        summarizeProposalRecords(modelGatewayProposals)
      ].join("\n"),
      stderr_summary: "",
      proposal_task_id: selectedModelGateway.data?.task_id || ""
    };
  }
  if (!selected) {
    return {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: "当前没有可审批的 proposal。",
      stderr_summary: ""
    };
  }
  const risk = String(selected.data?.risk || "MEDIUM");
  const args = [
    studioScript,
    "project",
    "approve-proposal",
    "--config",
    configPath,
    "--task-id",
    selected.data.task_id,
    "--dry-run"
  ];
  if (risk === "HIGH") args.push("--approve-high-risk");
  const result = await runShellCommand(process.execPath, args);
  return {
    status: result.ok ? "NEEDS_APPROVAL" : "FAIL",
    exit_code: result.exit_code,
    stdout_summary: result.ok
      ? summarizeStdout(result.stdout)
      : summarizeStdout(result.stdout || result.stderr),
    stderr_summary: result.ok ? "" : summarizeStdout(result.stderr),
    proposal_task_id: selected.data.task_id
  };
}

async function executeProposalApproveApplyFlow(plan, input) {
  const projectId = plan.target_project;
  const configPath = projectConfigFor(projectId);
  const proposals = await readProjectProposalRecords(projectId);
  const existingAudits = await readProjectQueueAuditRecords(projectId);
  const modelGatewayProposals = await readModelGatewayProposalRecords(projectId);
  const modelGatewayAudits = await readModelGatewayQueueAuditRecords(projectId);
  const requestedTaskId = String(input.task_id || "");
  const exactProposal = requestedTaskId ? proposals.find((record) => record.data?.task_id === requestedTaskId) : null;
  const exactModelGatewayProposal = requestedTaskId ? modelGatewayProposals.find((record) => record.data?.task_id === requestedTaskId) : null;
  const selected = exactProposal ?? (!requestedTaskId ? (findPendingProposal(proposals) ?? proposals[0] ?? null) : null);
  const selectedModelGateway = exactModelGatewayProposal ?? (!requestedTaskId && !selected ? findPendingModelGatewayProposal(modelGatewayProposals) : null);
  if (selectedModelGateway) {
    const taskId = String(selectedModelGateway.data?.task_id || "");
    const risk = String(selectedModelGateway.data?.risk || "MEDIUM");
    const existingModelGatewayAudit = modelGatewayAudits.find((record) => record.data?.task_id === taskId) ?? null;
    if (existingModelGatewayAudit?.data?.status === "PASS") {
      const preflight = await writeControlledWorkerQueuePreflight(projectId, selectedModelGateway, existingModelGatewayAudit, input, plan);
      return {
        status: "PASS",
        exit_code: 0,
        stdout_summary: [
          `model gateway proposal ${taskId} 已存在 PASS 的 queue injection audit trace。`,
          `controlled_worker_queue_preflight: ${preflight.path}`,
          "",
          summarizeProposalRecords(modelGatewayProposals),
          "",
          summarizeQueueAuditRecords(modelGatewayAudits)
        ].join("\n"),
        stderr_summary: "",
        proposal_task_id: taskId,
        queue_injection_audit_status: existingModelGatewayAudit.data.status
      };
    }
    if (risk === "HIGH" || risk === "CRITICAL") {
      return {
        status: "NEEDS_APPROVAL",
        exit_code: null,
        stdout_summary: `model gateway proposal ${taskId} 风险为 ${risk}，保持人工审批，不自动入队。`,
        stderr_summary: ""
      };
    }
    const approved = await approveModelGatewayProposal(selectedModelGateway, input, plan);
    const audit = await writeModelGatewayQueueInjectionAudit(projectId, approved, input, plan);
    const preflight = await writeControlledWorkerQueuePreflight(projectId, approved, audit, input, plan);
    const refreshedModelGatewayProposals = await readModelGatewayProposalRecords(projectId);
    const refreshedModelGatewayAudits = await readModelGatewayQueueAuditRecords(projectId);
    return {
      status: "PASS",
      exit_code: 0,
      stdout_summary: [
        `model_gateway_proposal_approved: ${taskId}`,
        `queue_injection_audit: ${audit.path}`,
        `controlled_worker_queue_preflight: ${preflight.path}`,
        "queue_injection_mode: audit_trace_only",
        "model_invocation: disabled",
        "credential_values_read: no",
        "",
        summarizeProposalRecords(refreshedModelGatewayProposals),
        "",
        summarizeQueueAuditRecords(refreshedModelGatewayAudits)
      ].join("\n"),
      stderr_summary: "",
      proposal_task_id: taskId,
      queue_injection_audit_status: audit.data.status
    };
  }
  if (!selected) {
    return {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: "当前没有可入队的 proposal。",
      stderr_summary: ""
    };
  }

  const taskId = String(selected.data?.task_id || "");
  const risk = String(selected.data?.risk || "MEDIUM");
  const existingAudit = existingAudits.find((record) => record.data?.task_id === taskId) ?? null;
  if (existingAudit?.data?.status === "PASS") {
    const preflight = await writeControlledWorkerQueuePreflight(projectId, selected, existingAudit, input, plan);
    return {
      status: "PASS",
      exit_code: 0,
      stdout_summary: [
        `proposal ${taskId} 已存在 PASS 的 queue injection audit trace，无需重复入队。`,
        `controlled_worker_queue_preflight: ${preflight.path}`,
        "",
        summarizeProposalRecords(proposals),
        "",
        summarizeQueueAuditRecords(existingAudits)
      ].join("\n"),
      stderr_summary: "",
      proposal_task_id: taskId,
      queue_injection_audit_status: existingAudit.data.status
    };
  }
  if (risk === "HIGH" || risk === "CRITICAL") {
    return {
      status: "NEEDS_APPROVAL",
      exit_code: null,
      stdout_summary: `proposal ${taskId} 风险为 ${risk}，当前 Console 不自动执行入队，请保留人工审批路径。`,
      stderr_summary: ""
    };
  }

  const result = await runShellCommand(process.execPath, [
    studioScript,
    "project",
    "approve-proposal",
    "--config",
    configPath,
    "--task-id",
    taskId,
    "--apply"
  ]);

  const refreshedProposals = await readProjectProposalRecords(projectId);
  const refreshedAudits = await readProjectQueueAuditRecords(projectId);
  const refreshedAudit = refreshedAudits.find((record) => record.data?.task_id === taskId) ?? null;
  const stdout = summarizeStdout(result.stdout || result.stderr);
  const stderr = summarizeStdout(result.stderr);
  const precheckBlocked = /Project injection precheck failed:/i.test(`${result.stdout}\n${result.stderr}`);
  const preflight = result.ok && refreshedAudit?.data?.status === "PASS"
    ? await writeControlledWorkerQueuePreflight(projectId, refreshedProposals.find((record) => record.data?.task_id === taskId) ?? selected, refreshedAudit, input, plan)
    : null;

  return {
    status: result.ok ? "PASS" : (precheckBlocked ? "BLOCKED" : "FAIL"),
    exit_code: result.exit_code,
    stdout_summary: result.ok
      ? [
          stdout,
          preflight ? `controlled_worker_queue_preflight: ${preflight.path}` : "",
          "",
          summarizeProposalRecords(refreshedProposals),
          "",
          summarizeQueueAuditRecords(refreshedAudits)
        ].join("\n")
      : stdout,
    stderr_summary: result.ok ? "" : stderr,
    proposal_task_id: taskId,
    queue_injection_audit_status: refreshedAudit?.data?.status || ""
  };
}

async function executeWorkerClaimPreflightFlow(plan, input) {
  const projectId = plan.target_project;
  const records = await readControlledWorkerQueueRecords(projectId);
  const audits = await readWorkerClaimAuditRecords(projectId);
  const requestedTaskId = String(input.task_id || "");
  const selected = requestedTaskId
    ? records.find((record) => record.data?.task_id === requestedTaskId)
    : records.find((record) => record.data?.status === "PREFLIGHT_READY")
      ?? records.find((record) => record.data?.status === "CLAIMED_DRY_RUN_READY")
      ?? records[0]
      ?? null;

  if (!selected) {
    return {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: "当前没有可领取的 controlled worker queue preflight task。请先完成 Proposal 审批并生成 queue audit。",
      stderr_summary: ""
    };
  }

  const taskId = String(selected.data?.task_id || "");
  const existingAudit = audits.find((record) => record.data?.task_id === taskId && record.data?.status === "PASS");
  if (existingAudit && selected.data?.status === "CLAIMED_DRY_RUN_READY") {
    return {
      status: "PASS",
      exit_code: 0,
      stdout_summary: [
        `worker_claim_status: already_claimed`,
        `task_id: ${taskId}`,
        `claim_audit: ${existingAudit.path}`,
        `claimed_worker_id: ${existingAudit.data?.claimed_worker_id || selected.data?.claimed_worker_id || "unknown"}`,
        "execution_enabled: false",
        "model_invocation: disabled",
        "credential_values_read: no",
        "managed_project_writes: disabled",
        "next_required_gate: result_artifact_callback_or_explicit_execution"
      ].join("\n"),
      stderr_summary: "",
      proposal_task_id: taskId,
      worker_claim_audit_status: existingAudit.data?.status || "PASS"
    };
  }

  const claim = await writeWorkerClaimAudit(projectId, selected, input, plan);
  const ok = claim.data.status === "PASS";
  return {
    status: ok ? "PASS" : "BLOCKED",
    exit_code: ok ? 0 : null,
    stdout_summary: [
      `worker_claim_status: ${claim.data.status}`,
      `task_id: ${taskId}`,
      `claim_audit: ${claim.path}`,
      `claimed_worker_id: ${claim.data.claimed_worker_id}`,
      `worker_registry_status: ${claim.data.worker_registry_status}`,
      `validation_errors: ${(claim.data.validation?.errors ?? []).join("; ") || "none"}`,
      "execution_enabled: false",
      "model_invocation: disabled",
      "credential_values_read: no",
      "managed_project_writes: disabled",
      `next_required_gate: ${claim.data.next_required_gate}`
    ].join("\n"),
    stderr_summary: "",
    proposal_task_id: taskId,
    worker_claim_audit_status: claim.data.status
  };
}

async function executeReleasePromotionFlow(targetStage) {
  const existingArtifact = await readReleaseConsistencyArtifact();
  const existingTarget = existingArtifact?.promotion_stages?.find((stage) => stage.stage_id === targetStage);
  if (existingTarget?.status === "PASS") {
    return {
      status: "PASS",
      exit_code: 0,
      stdout_summary: summarizeReleaseConsistencyArtifact(existingArtifact, targetStage),
      stderr_summary: "",
      promotion_consistency_key: existingArtifact?.promotion_consistency_key || "",
      release_stage: targetStage
    };
  }
  const result = await runShellCommand(process.execPath, [
    studioScript,
    "release",
    "consistency",
    "--apply",
    "--target",
    targetStage
  ]);
  const artifact = await readReleaseConsistencyArtifact();
  const target = artifact?.promotion_stages?.find((stage) => stage.stage_id === targetStage);
  const summary = [
    summarizeStdout(result.stdout || ""),
    summarizeReleaseConsistencyArtifact(artifact, targetStage)
  ].filter(Boolean).join("\n\n");

  if (result.ok) {
    return {
      status: "PASS",
      exit_code: 0,
      stdout_summary: summary,
      stderr_summary: "",
      promotion_consistency_key: artifact?.promotion_consistency_key || "",
      release_stage: targetStage
    };
  }

  const stageStatus = String(target?.status || "");
  return {
    status: stageStatus === "PENDING_REVIEW" ? "NEEDS_APPROVAL" : "BLOCKED",
    exit_code: result.exit_code,
    stdout_summary: summary || summarizeReleaseConsistencyArtifact(artifact, targetStage),
    stderr_summary: summarizeStdout(result.stderr || result.stdout),
    promotion_consistency_key: artifact?.promotion_consistency_key || "",
    release_stage: targetStage
  };
}

async function executeSpecialPlanFlow(plan, input) {
  if (plan.action_id === "project-dispatch") return executeProjectDispatchFlow(plan, input);
  if (plan.action_id === "proposal-review") return executeProposalReviewFlow(plan, input);
  if (plan.action_id === "release-local-preview") return executeReleasePromotionFlow("local_preview");
  if (plan.action_id === "release-server-preview") return executeReleasePromotionFlow("server_preview");
  if (plan.action_id === "release-reviewed-publish") return executeReleasePromotionFlow("reviewed_publish");
  if (plan.action_id === "proposal-approve-dry-run") return executeProposalApproveDryRunFlow(plan, input);
  if (plan.action_id === "proposal-approve-apply") return executeProposalApproveApplyFlow(plan, input);
  if (plan.action_id === "worker-claim-preflight") return executeWorkerClaimPreflightFlow(plan, input);
  if (plan.action_id === "proposal-reject-draft") {
    return {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: "proposal reject draft 尚未接入自动写回，当前保持 review-only。",
      stderr_summary: ""
    };
  }
  return null;
}

function actionPlanCommandFor(plan, input) {
  const goal = safeGoal(input.goal);
  if (plan.action_id === "goal-plan") {
    return {
      command: process.execPath,
      args: [studioScript, "plan", "--goal", goal, "--dry-run"],
      display: `node ${studioScript} plan --goal "${goal}" --dry-run`
    };
  }
  return {
    command: process.execPath,
    args: [
      studioScript,
      "console",
      "action-plan",
      "--action",
      plan.action_id,
      "--goal",
      goal,
      "--project",
      plan.target_project,
      "--dry-run"
    ],
    display: `node ${studioScript} console action-plan --action ${plan.action_id} --goal "${goal}" --project ${plan.target_project} --dry-run`
  };
}

function exactTokenUsage(text) {
  const value = String(text ?? "");
  const read = (patterns) => {
    for (const pattern of patterns) {
      const match = value.match(pattern);
      if (match) return Number(String(match[1]).replaceAll(",", ""));
    }
    return null;
  };
  const inputTokens = read([/"input_tokens"\s*:\s*(\d+)/i, /input tokens?\s*[:=]\s*([\d,]+)/i]);
  const outputTokens = read([/"output_tokens"\s*:\s*(\d+)/i, /output tokens?\s*[:=]\s*([\d,]+)/i]);
  const cachedTokens = read([/"cached_input_tokens"\s*:\s*(\d+)/i, /cached tokens?\s*[:=]\s*([\d,]+)/i]);
  const explicitTotal = read([/"total_tokens"\s*:\s*(\d+)/i, /tokens used\s*[:=]?\s*([\d,]+)/i, /total tokens?\s*[:=]\s*([\d,]+)/i]);
  const reported = [inputTokens, outputTokens, cachedTokens, explicitTotal].some(Number.isFinite);
  return { reported, inputTokens, outputTokens, cachedTokens, totalTokens: explicitTotal ?? (Number.isFinite(inputTokens) || Number.isFinite(outputTokens) ? Number(inputTokens ?? 0) + Number(outputTokens ?? 0) : null), source: reported ? "RUNTIME_REPORTED" : "NOT_REPORTED" };
}

function usageForRun(run) {
  if (run?.usage) return run.usage;
  return exactTokenUsage([run?.result?.stdout_summary, run?.result?.stderr_summary, ...(run?.transcript ?? []).map((item) => item.content)].filter(Boolean).join("\n"));
}

async function codexAuthenticationStatus(runtime) {
  if (!runtime?.installed) return "RUNTIME_UNAVAILABLE";
  try {
    await execFileAsync(runtime.command || "codex", ["login", "status"], { cwd: repoRoot, timeout: 5000, maxBuffer: 1024 * 128 });
    return "AUTHENTICATED_LOCAL_CLI_SESSION";
  } catch {
    return "LOCAL_CLI_SESSION_NOT_AUTHENTICATED";
  }
}

export async function getRuntimeIdentityUsage() {
  await hydrateConversationRuns();
  const [detected, credentialBundle] = await Promise.all([detectLocalAiRuntimes(), readJsonIfExists(credentialReferencePath)]);
  const references = credentialBundle?.credential_references ?? [];
  const referenceByProvider = new Map(references.map((item) => [item.provider, item]));
  const runs = [...actionRuns.values()];
  const codexAuthStatus = await codexAuthenticationStatus(detected.runtimes.find((item) => item.runtime_id === "codex-cli"));
  const runtimes = detected.runtimes.map((runtime) => {
    const runtimeRuns = runs.filter((run) => run.plan?.runtime_id === runtime.runtime_id || run.plan?.agent === runtime.runtime_id);
    const values = runtimeRuns.map(usageForRun);
    const reported = values.filter((item) => item.reported);
    const sum = (key) => reported.some((item) => Number.isFinite(item[key])) ? reported.reduce((total, item) => total + Number(item[key] ?? 0), 0) : null;
    const credential = runtime.runtime_id === "codex-cli" ? references.find((item) => item.credential_id === "codex-local-session-ref") ?? null : referenceByProvider.get(runtime.provider) ?? null;
    return {
      runtimeId: runtime.runtime_id, provider: runtime.provider, installed: runtime.installed, version: runtime.version,
      invocationMode: runtime.invocation_mode, credentialPolicy: runtime.credential_policy,
      credentialReferenceId: credential?.credential_id ?? (runtime.path?.startsWith("credential-reference:") ? runtime.path.slice("credential-reference:".length) : null),
      credentialReferenceType: credential?.reference?.reference_type ?? runtime.credential_policy,
      credentialReferenceLocation: credential ? Object.entries(credential.reference ?? {}).find(([key]) => key !== "reference_type")?.[1] ?? null : runtime.path?.startsWith("credential-reference:") ? runtime.path : null,
      credentialStatus: runtime.runtime_id === "codex-cli" ? codexAuthStatus : credential?.status ?? (runtime.credential_policy === "not_required" ? "not_required" : runtime.installed ? "EXTERNAL_SESSION_NOT_VERIFIED" : "RUNTIME_UNAVAILABLE"),
      secretValuesExposed: false,
      usage: { runCount: runtimeRuns.length, reportedRunCount: reported.length, unreportedRunCount: runtimeRuns.length - reported.length, inputTokens: reported.length ? sum("inputTokens") : null, outputTokens: reported.length ? sum("outputTokens") : null, cachedTokens: reported.length ? sum("cachedTokens") : null, totalTokens: reported.length ? sum("totalTokens") : null, status: runtimeRuns.length === 0 ? "NO_RUNS" : reported.length === 0 ? "NOT_REPORTED" : reported.length === runtimeRuns.length ? "COMPLETE" : "PARTIAL" }
    };
  });
  const known = runtimes.filter((item) => Number.isFinite(item.usage.totalTokens));
  return { generatedAt: new Date().toISOString(), safety: { secretValuesRead: false, secretValuesReturned: false, credentialReferencesOnly: true }, summary: { runtimeCount: runtimes.length, installedCount: runtimes.filter((item) => item.installed).length, runCount: runtimes.reduce((total, item) => total + item.usage.runCount, 0), reportedRunCount: runtimes.reduce((total, item) => total + item.usage.reportedRunCount, 0), totalTokens: known.length ? known.reduce((total, item) => total + Number(item.usage.totalTokens), 0) : null }, runtimes };
}

function summarizeStdout(stdout) {
  const lines = redactSensitive(stdout)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .filter((line) => !isConsoleNoiseLine(line));
  return lines.slice(0, 30).join("\n");
}

function isConsoleNoiseLine(line) {
  return [
    /Reading additional input from stdin/i,
    /codex_core_plugins::manifest: ignoring interface\.defaultPrompt/i,
    /codex_core_skills::loader: ignoring interface\.icon_(small|large)/i
  ].some((pattern) => pattern.test(line));
}

function transcriptClassFor(source) {
  if (source === "stderr") return "fail";
  if (source === "running") return "running";
  if (source === "user") return "user";
  return "assistant";
}

function pushTranscriptLine(run, source, content) {
  const text = redactSensitive(content).replace(/\r/g, "").trim();
  if (!text) return;
  if (source === "stderr" && isConsoleNoiseLine(text)) return;
  run.transcript.push({
    source,
    className: transcriptClassFor(source),
    content: text.slice(0, 4000),
    at: new Date().toISOString()
  });
  if (run.transcript.length > 240) {
    run.transcript = run.transcript.slice(-240);
  }
}

function appendTranscript(run, source, chunk) {
  const bufferKey = source === "stderr" ? "stderr_buffer" : "stdout_buffer";
  const buffered = `${run[bufferKey] ?? ""}${chunk.toString("utf8")}`.replace(/\r\n/g, "\n").replace(/\r/g, "\n");
  const parts = buffered.split("\n");
  run[bufferKey] = parts.pop() ?? "";
  for (const part of parts) pushTranscriptLine(run, source, part);
}

function flushTranscript(run, source) {
  const bufferKey = source === "stderr" ? "stderr_buffer" : "stdout_buffer";
  if (run[bufferKey]) {
    pushTranscriptLine(run, source, run[bufferKey]);
    run[bufferKey] = "";
  }
}

function runMessagesForPlan(plan) {
  const messages = [
    { role: "user", content: plan.goal_summary, at: plan.created_at },
    { role: "assistant", content: `已理解目标：${plan.goal_summary}`, at: plan.created_at, phase: "understood" },
    { role: "assistant", content: `正在选择项目：${plan.target_project}（${plan.target_project_status}）`, at: plan.created_at, phase: "project" },
    { role: "assistant", content: `正在选择 Agent/Runtime：${plan.agent} / ${plan.workspace_mode}`, at: plan.created_at, phase: "agent" },
    { role: "assistant", content: `正在生成计划：${plan.action_label}`, at: plan.created_at, phase: "planning" },
    { role: "assistant", content: `正在通过 Governance 检查：${plan.governance_gate}，风险 ${plan.risk}`, at: plan.created_at, phase: "governance" }
  ];
  if (plan.agent_fallback) {
    messages.push({ role: "assistant", content: plan.agent_fallback, at: plan.created_at, phase: "agent" });
  }
  if (plan.attachment_count > 0) {
    messages.push({
      role: "assistant",
      content: `已接收 ${plan.attachment_count} 个附件，任务执行时会把它们作为本地上下文输入。`,
      at: plan.created_at,
      phase: "understood"
    });
  }
  return messages;
}

function runTimeline(status, resultStatus = "PENDING") {
  const executionStatus = terminalRunStatuses.has(resultStatus) ? resultStatus : status;
  return [
    { name: "已理解目标", status: "PASS" },
    { name: "选择项目", status: "PASS" },
    { name: "选择 Agent/Runtime", status: "PASS" },
    { name: "生成计划", status: ["QUEUED", "RUNNING"].includes(status) ? "RUNNING" : "PASS" },
    { name: "Governance 检查", status: ["BLOCKED", "NEEDS_APPROVAL"].includes(resultStatus) ? "NEEDS_APPROVAL" : "PASS" },
    { name: "执行 / 审批", status: executionStatus },
    { name: "结果报告", status: terminalRunStatuses.has(resultStatus) ? "PASS" : "PENDING" }
  ];
}

function publicRun(run) {
  if (!run) return null;
  const { child: _child, timeout: _timeout, heartbeat: _heartbeat, stdout: _stdout, stderr: _stderr, stdout_buffer: _stdoutBuffer, stderr_buffer: _stderrBuffer, ...value } = run;
  return value;
}

async function persistConversationRun(run) {
  run.updated_at = new Date().toISOString();
  if (terminalRunStatuses.has(run.status)) run.usage = exactTokenUsage([run.result?.stdout_summary, run.result?.stderr_summary, ...(run.transcript ?? []).map((item) => item.content)].filter(Boolean).join("\n"));
  const logs = await writeActionLog(publicRun(run));
  run.logs = logs;
  run.plan.log_path = logs.json;
  return logs;
}

function finishSmartParkPlan(plan, commandResult) {
  const smartParkGoLivePlan = plan.action_id === "smart-park-go-live-plan"
    ? buildSmartParkGoLivePlan(commandResult)
    : null;
  if (smartParkGoLivePlan) {
    commandResult.stdout_summary = `${commandResult.stdout_summary ? `${commandResult.stdout_summary}\n\n` : ""}${formatSmartParkGoLivePlan(smartParkGoLivePlan)}`;
  }
  return ["smart-park-continue", "smart-park-blockers", "smart-park-go-live-plan"].includes(plan.action_id)
    ? {
        quick_entries: [
          "继续 Smart Park",
          "检查上线阻断项",
          "生成 SMART_PARK_GO_LIVE_PLAN",
          "检查项目状态",
          "生成下一步任务 proposal"
        ],
        go_live_plan: smartParkGoLivePlan,
        next_proposal_command: `node ${studioScript} project task-plan --config examples/jinhu-smart-park/project.config.example.json --text "<下一步任务>" --dry-run`
      }
    : null;
}

function buildSmartParkGoLivePlan(commandResult) {
  const chainReady = commandResult.status === "PASS";
  return {
    artifact_id: "SMART_PARK_GO_LIVE_PLAN",
    project_id: "jinhu-smart-park",
    generated_by: "console_action_server",
    mode: "proposal_only_for_project_writes",
    GO_LIVE_SCORE: chainReady ? 86 : 62,
    P0: [
      "生产部署、服务器连接、远程 SSH、真实数据库写入保持 CRITICAL 审批，当前 Console 不允许执行。",
      "Smart Park 业务仓库写入必须先生成 proposal 并获得 approval evidence。"
    ],
    P1: [
      "补齐上线阻断项清单和负责人。",
      "完成本地 Runtime / Worker / Governance health 连续 PASS 记录。",
      "把待审批 Proposal 按风险分组，优先处理 MEDIUM 本地验证任务。"
    ],
    P2: [
      "完善 Console 操作日志审计摘要。",
      "补充上线演练 checklist 与回滚演练文档。",
      "为后续 GitHub Repo Connector 预留 Phoenix ERP 接入流程。"
    ],
    NEXT_30_DAYS_PLAN: [
      "第 1 周：完成 Smart Park blocker review、proposal backlog 清理、本地 Console 操作闭环。",
      "第 2 周：完成真实 Worker smoke、Credential backend policy review、治理矩阵复核。",
      "第 3 周：完成 go-live rehearsal proposal、rollback plan proposal、monitoring checklist。",
      "第 4 周：在明确人工审批后再评估服务器部署和生产操作。"
    ],
    governance: {
      LOW: "direct_execute",
      MEDIUM: "direct_execute",
      HIGH: "proposal_only",
      CRITICAL: "human_approval_required"
    },
    safety: {
      managed_project_writes: "proposal_approval_required",
      deploy: "disabled",
      production_operation: "disabled",
      server_access: "disabled",
      credential_values: "not_read"
    }
  };
}

function formatSmartParkGoLivePlan(plan) {
  return [
    `SMART_PARK_GO_LIVE_PLAN: ${plan.project_id}`,
    `GO_LIVE_SCORE: ${plan.GO_LIVE_SCORE}`,
    "P0:",
    ...plan.P0.map((item) => `- ${item}`),
    "P1:",
    ...plan.P1.map((item) => `- ${item}`),
    "P2:",
    ...plan.P2.map((item) => `- ${item}`),
    "NEXT_30_DAYS_PLAN:",
    ...plan.NEXT_30_DAYS_PLAN.map((item) => `- ${item}`)
  ].join("\n");
}

function markdownLog(record) {
  return `# Console Action Log

- plan_id: ${record.plan.plan_id}
- action_id: ${record.plan.action_id}
- target_project: ${record.plan.target_project}
- workspace_mode: ${record.plan.workspace_mode}
- agent: ${record.plan.agent}
- runtime_id: ${record.plan.runtime_id}
- parallel: ${record.plan.effective_parallel}${record.plan.requested_parallel !== record.plan.effective_parallel ? ` (requested ${record.plan.requested_parallel})` : ""}
- risk: ${record.plan.risk}
- approval_required: ${record.plan.approval_required ? "yes" : "no"}
- mode: ${record.plan.mode}
- governance_gate: ${record.plan.governance_gate}
- status: ${record.result?.status ?? "PLANNED"}
- command: ${record.plan.command}

## Output Summary

\`\`\`
${record.result?.stdout_summary ?? "plan generated; command not executed"}
\`\`\`

${record.smart_park?.go_live_plan ? `## SMART_PARK_GO_LIVE_PLAN

\`\`\`
${formatSmartParkGoLivePlan(record.smart_park.go_live_plan)}
\`\`\`
` : ""}

${Array.isArray(record.plan.attachments) && record.plan.attachments.length > 0 ? `## Attachments

${record.plan.attachments.map((attachment) => `- ${attachment.kind === "image" ? "图片" : "文件"}: ${attachment.name} (${attachment.size_label}) -> ${attachment.stored_path}${attachment.width && attachment.height ? ` [${attachment.width}x${attachment.height}]` : ""}${attachment.text_excerpt ? `\n  - 摘录: ${attachment.text_excerpt}` : ""}`).join("\n")}

` : ""}

## Safety

- bind_address: 127.0.0.1
- pilot_production_mode: true
- direct_execute_allowed_for: LOW, MEDIUM
- high_risk_policy: proposal_only
- critical_risk_policy: human_approval_required
- deploy: disabled
- production_operation: disabled
- credential_values: not_read
- managed_project_writes: disabled
- external_model_call: ${record.plan.safety?.external_model_call ?? "disabled"}
`;
}

async function writeActionLog(record) {
  const absoluteDir = resolve(repoRoot, actionLogDir);
  await mkdir(absoluteDir, { recursive: true });
  const jsonRelative = `${actionLogDir}/${record.plan.plan_id}.json`;
  const markdownRelative = `${actionLogDir}/${record.plan.plan_id}.md`;
  await writeFile(resolve(repoRoot, jsonRelative), `${JSON.stringify(record, null, 2)}\n`, "utf8");
  await writeFile(resolve(repoRoot, markdownRelative), markdownLog(record), "utf8");
  return { json: jsonRelative, markdown: markdownRelative };
}

export async function createActionPlan(input, options = {}) {
  const plan = await preparePlan(input, options);
  const planCommand = actionPlanCommandFor(plan, input);
  let commandResult;
  if (plan.access?.status !== "ALLOW") {
    commandResult = {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: plan.access.reason,
      stderr_summary: ""
    };
  } else {
    try {
      const { stdout, stderr } = await execFileAsync(planCommand.command, planCommand.args, {
        cwd: repoRoot,
        timeout: 120000,
        maxBuffer: 1024 * 1024 * 10
      });
      commandResult = {
        status: plan.approval_required ? "NEEDS_APPROVAL" : "PASS",
        exit_code: 0,
        stdout_summary: summarizeStdout(stdout),
        stderr_summary: summarizeStdout(stderr)
      };
    } catch (error) {
      commandResult = {
        status: "FAIL",
        exit_code: typeof error?.code === "number" ? error.code : 1,
        stdout_summary: summarizeStdout(error?.stdout ?? ""),
        stderr_summary: summarizeStdout(error?.stderr ?? error?.message ?? "")
      };
    }
  }
  const record = {
    schema_version: 1,
    kind: "console_action_plan",
    plan: {
      ...plan,
      plan_command: planCommand.display
    },
    result: commandResult
  };
  const logs = await writeActionLog(record);
  return {
    ...record,
    logs
  };
}

async function runConversationCommand(runId, input, command) {
  const run = actionRuns.get(runId);
  if (!run || run.status === "CANCELLED") return;

  if (run.plan.access?.status !== "ALLOW") {
    run.status = "BLOCKED";
    run.phase = "approval";
    run.result = {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: run.plan.access.reason,
      stderr_summary: ""
    };
    run.messages.push({
      role: "assistant",
      content: `访问受限：${run.plan.access.reason}`,
      at: new Date().toISOString(),
      phase: "approval"
    });
    run.timeline = runTimeline(run.status, run.result.status);
    await persistConversationRun(run);
    return;
  }

  if (!run.plan.allowed_to_execute) {
    run.status = run.plan.approval_required ? "NEEDS_APPROVAL" : "BLOCKED";
    run.phase = "approval";
    run.result = {
      status: run.status,
      exit_code: null,
      stdout_summary: `${run.plan.governance_gate}: ${run.plan.blocked_reason}`,
      stderr_summary: ""
    };
    run.messages.push({
      role: "assistant",
      content: run.plan.approval_required
        ? `需要审批：${run.plan.blocked_reason}`
        : `已阻止执行：${run.plan.blocked_reason}`,
      at: new Date().toISOString(),
      phase: "approval"
    });
    run.timeline = runTimeline(run.status, run.result.status);
    await persistConversationRun(run);
    return;
  }

  const specialResult = await executeSpecialPlanFlow(run.plan, input);
  if (specialResult) {
    run.status = specialResult.status;
    run.phase = specialResult.status === "PASS" ? "reported" : (specialResult.status === "NEEDS_APPROVAL" ? "approval" : "failed");
    run.result = specialResult;
    run.messages.push({
      role: "assistant",
      content: specialResult.status === "PASS"
        ? `执行完成：${specialResult.stdout_summary || "特殊流程已完成。"}`
        : (specialResult.status === "NEEDS_APPROVAL"
            ? `已进入 Proposal Review：${specialResult.stdout_summary || "请继续审批。"}`
            : `流程已阻止：${specialResult.stdout_summary || specialResult.stderr_summary || "未通过执行条件。"}`),
      at: new Date().toISOString(),
      phase: specialResult.status === "NEEDS_APPROVAL" ? "approval" : "report"
    });
    pushTranscriptLine(run, specialResult.status === "FAIL" ? "stderr" : "system", specialResult.stdout_summary || specialResult.stderr_summary || "特殊流程完成。");
    if (specialResult.proposal_task_id) {
      pushTranscriptLine(run, "system", `proposal_task_id=${specialResult.proposal_task_id}`);
    }
    run.timeline = runTimeline(run.status, run.result.status);
    await persistConversationRun(run);
    return;
  }

  run.status = "RUNNING";
  run.phase = "executing";
  run.result = {
    status: "RUNNING",
    exit_code: null,
    stdout_summary: "正在执行本地安全任务，等待命令输出...",
    stderr_summary: ""
  };
  run.messages.push({
    role: "assistant",
    content: "正在执行本地安全任务，LOW/MEDIUM 会在 Governance Gate 允许后继续。",
    at: new Date().toISOString(),
    phase: "executing"
  });
  pushTranscriptLine(run, "running", "已通过 Governance Gate，正在启动本地 Agent / CLI 任务...");
  run.timeline = runTimeline(run.status, run.result.status);
  await persistConversationRun(run);

  if (run.plan.action_id === "agent-real-plan") {
    const runtimeCommand = command.command;
    const runtimeStatus = await detectCommand(runtimeCommand);
    if (!runtimeStatus.installed) {
      pushTranscriptLine(run, "system", `${runtimeCommand} 不在服务 PATH 中，切换到 Studio 内置 Planning Center。`);
      await completeAgentRuntimeUnavailableFallback(run, input, runtimeCommand);
      return;
    }
  }

  const child = spawn(command.command, command.args, {
    cwd: repoRoot,
    stdio: ["ignore", "pipe", "pipe"]
  });
  run.child = child;
  run.child_pid = child.pid;
  run.updated_at = new Date().toISOString();
  run.started_at = run.updated_at;
  run.stdout = "";
  run.stderr = "";
  run.stdout_buffer = "";
  run.stderr_buffer = "";
  run.result.stdout_summary = `命令已启动。PID: ${child.pid ?? "unknown"}。正在等待输出...`;
  pushTranscriptLine(run, "system", `命令已启动，PID=${child.pid ?? "unknown"}，正在持续接收输出。`);

  run.timeout = setTimeout(async () => {
    if (run.status !== "RUNNING") return;
    run.status = "FAIL";
    run.phase = "failed";
    run.result = {
      status: "FAIL",
      exit_code: null,
      stdout_summary: summarizeStdout(run.stdout) || "命令超过 180 秒仍未完成，已自动停止，避免页面长时间无反馈。",
      stderr_summary: summarizeStdout(run.stderr) || "TIMEOUT"
    };
    run.messages.push({
      role: "assistant",
      content: `执行超时：${run.result.stdout_summary}`,
      at: new Date().toISOString(),
      phase: "failed"
    });
    pushTranscriptLine(run, "stderr", run.result.stderr_summary || "TIMEOUT");
    run.timeline = runTimeline(run.status, run.result.status);
    if (run.heartbeat) clearInterval(run.heartbeat);
    if (run.child && !run.child.killed) run.child.kill("SIGTERM");
    delete run.child;
    delete run.heartbeat;
    delete run.timeout;
    await persistConversationRun(run);
  }, actionTimeoutMs);

  run.heartbeat = setInterval(() => {
    if (run.status !== "RUNNING") return;
    const elapsedSeconds = Math.max(1, Math.round((Date.now() - Date.parse(run.started_at || run.created_at)) / 1000));
    const hasVisibleStdout = run.transcript.some((entry) => entry.source === "stdout");
    const heartbeatContent = hasVisibleStdout
      ? `Agent 正在继续输出，已运行 ${elapsedSeconds}s。`
      : `Agent 已启动，正在读取上下文与分析目标，已运行 ${elapsedSeconds}s。`;
    const last = run.transcript.at(-1);
    if (!last || last.content !== heartbeatContent) {
      pushTranscriptLine(run, "running", heartbeatContent);
      run.updated_at = new Date().toISOString();
    }
  }, 4000);

  child.stdout.on("data", (chunk) => {
    run.stdout += chunk.toString("utf8");
    appendTranscript(run, "stdout", chunk);
    run.result.stdout_summary = summarizeStdout(run.stdout) || `命令已启动。PID: ${run.child_pid ?? "unknown"}。正在等待输出...`;
    run.updated_at = new Date().toISOString();
  });
  child.stderr.on("data", (chunk) => {
    run.stderr += chunk.toString("utf8");
    appendTranscript(run, "stderr", chunk);
    run.result.stderr_summary = summarizeStdout(run.stderr);
    run.updated_at = new Date().toISOString();
  });
  child.on("error", async (error) => {
    if (run.status === "CANCELLED") return;
    if (run.timeout) clearTimeout(run.timeout);
    run.status = "FAIL";
    run.phase = "failed";
    run.result = {
      status: "FAIL",
      exit_code: 1,
      stdout_summary: summarizeStdout(run.stdout),
      stderr_summary: summarizeStdout(error.message)
    };
    run.messages.push({
      role: "assistant",
      content: `执行失败：${run.result.stderr_summary || error.message}`,
      at: new Date().toISOString(),
      phase: "failed"
    });
    pushTranscriptLine(run, "stderr", run.result.stderr_summary || error.message);
    run.timeline = runTimeline(run.status, run.result.status);
    if (run.heartbeat) clearInterval(run.heartbeat);
    delete run.child;
    delete run.heartbeat;
    delete run.timeout;
    await persistConversationRun(run);
  });
  child.on("close", async (code, signal) => {
    if (run.status === "CANCELLED") return;
    if (run.timeout) clearTimeout(run.timeout);
    flushTranscript(run, "stdout");
    flushTranscript(run, "stderr");
    const combinedOutput = `${run.stdout}\n${run.stderr}`;
    let fallbackSummary = "";
    let fallbackStatus = code === 0 ? "PASS" : "FAIL";
    if (code !== 0 && combinedOutput.includes("Planning Center did not return a batch_plan")) {
      fallbackStatus = "NEEDS_APPROVAL";
      try {
        const fallback = await execFileAsync(process.execPath, [studioScript, "plan", "--goal", run.plan.goal_summary, "--dry-run"], {
          cwd: repoRoot,
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10
        });
        fallbackSummary = [
          "Planning Center 没有为该目标返回可直接执行的 batch_plan。",
          "已自动切换为安全计划/Proposal 待确认模式，未执行仓库写入。",
          "",
          summarizeStdout(fallback.stdout)
        ].join("\n");
        pushTranscriptLine(run, "system", "Planning Center 未返回可直接执行的 batch_plan，已回退为安全计划模式。");
      } catch (error) {
        fallbackSummary = [
          "Planning Center 没有为该目标返回可直接执行的 batch_plan。",
          "已停止直接执行；请先生成更明确的计划或选择 Smart Park 快捷入口。",
          summarizeStdout(error?.stdout ?? error?.stderr ?? error?.message ?? "")
        ].filter(Boolean).join("\n");
        pushTranscriptLine(run, "stderr", "Planning Center 未返回 batch_plan，且安全回退计划生成失败。");
      }
    }
    const commandResult = {
      status: fallbackStatus,
      exit_code: typeof code === "number" ? code : 1,
      signal: signal ?? null,
      stdout_summary: fallbackSummary || summarizeStdout(run.stdout),
      stderr_summary: summarizeStdout(run.stderr)
    };
    run.smart_park = finishSmartParkPlan(run.plan, commandResult);
    run.status = commandResult.status;
    run.phase = commandResult.status === "PASS" ? "reported" : (commandResult.status === "NEEDS_APPROVAL" ? "approval" : "failed");
    run.result = commandResult;
    run.messages.push({
      role: "assistant",
      content: commandResult.status === "PASS"
        ? `执行完成：${commandResult.stdout_summary || "任务已完成，未产生额外输出。"}`
        : (commandResult.status === "NEEDS_APPROVAL"
            ? `需要确认：${commandResult.stdout_summary || "已生成安全计划，等待用户确认下一步。"}`
            : `执行失败：${commandResult.stderr_summary || commandResult.stdout_summary || "命令返回非零状态。"}`),
      at: new Date().toISOString(),
      phase: "report"
    });
    pushTranscriptLine(
      run,
      commandResult.status === "PASS" ? "system" : (commandResult.status === "NEEDS_APPROVAL" ? "running" : "stderr"),
      commandResult.status === "PASS"
        ? "任务已完成，正在整理结果摘要。"
        : (commandResult.status === "NEEDS_APPROVAL"
            ? "当前任务需要进一步确认或审批。"
            : "任务执行失败，请查看错误摘要。")
    );
    run.timeline = runTimeline(run.status, run.result.status);
    if (run.heartbeat) clearInterval(run.heartbeat);
    delete run.child;
    delete run.heartbeat;
    delete run.timeout;
    await persistConversationRun(run);
  });
}

export async function startConversationAction(input, options = {}) {
  await hydrateConversationRuns();
  const plan = await preparePlan(input, options);
  const command = commandFor(input, plan);
  const run = {
    schema_version: 1,
    kind: "console_action_conversation_run",
    run_id: plan.plan_id,
    created_at: plan.created_at,
    updated_at: plan.created_at,
    status: "QUEUED",
    phase: "queued",
    plan,
    command_summary: command.display,
    child_pid: null,
    result: {
      status: "QUEUED",
      exit_code: null,
      stdout_summary: "任务已创建，正在准备执行。",
      stderr_summary: ""
    },
    messages: runMessagesForPlan(plan),
    timeline: runTimeline("QUEUED", "QUEUED"),
    smart_park: null,
    transcript: [],
    stdout: "",
    stderr: "",
    stdout_buffer: "",
    stderr_buffer: ""
  };
  actionRuns.set(run.run_id, run);
  await persistConversationRun(run);
  setTimeout(() => {
    runConversationCommand(run.run_id, input, command).catch(async (error) => {
      const current = actionRuns.get(run.run_id);
      if (!current || current.status === "CANCELLED") return;
      current.status = "FAIL";
      current.phase = "failed";
      current.result = {
        status: "FAIL",
        exit_code: 1,
        stdout_summary: "",
        stderr_summary: summarizeStdout(error?.message ?? String(error))
      };
      current.messages.push({
        role: "assistant",
        content: `执行失败：${current.result.stderr_summary}`,
        at: new Date().toISOString(),
        phase: "failed"
      });
      current.timeline = runTimeline(current.status, current.result.status);
      await persistConversationRun(current);
    });
  }, 25);
  return publicRun(run);
}

export async function getConversationAction(runId) {
  await hydrateConversationRuns();
  return publicRun(actionRuns.get(runId));
}

export async function getLatestConversationAction() {
  await hydrateConversationRuns();
  const latest = [...actionRuns.values()].sort((left, right) => Date.parse(right.updated_at ?? right.created_at ?? 0) - Date.parse(left.updated_at ?? left.created_at ?? 0))[0];
  return publicRun(latest);
}

export async function cancelConversationAction(runId) {
  await hydrateConversationRuns();
  const run = actionRuns.get(runId);
  if (!run) return null;
  if (terminalRunStatuses.has(run.status)) return publicRun(run);
  run.status = "CANCELLED";
  run.phase = "cancelled";
  run.result = {
    status: "CANCELLED",
    exit_code: null,
    stdout_summary: "已触发本地 dry-run kill-switch，当前任务已取消。",
    stderr_summary: ""
  };
  run.messages.push({
    role: "assistant",
    content: "已停止当前任务。本地 kill-switch 不会写业务项目、不执行部署、不读取凭证。",
    at: new Date().toISOString(),
    phase: "cancelled"
  });
  run.timeline = runTimeline(run.status, run.result.status);
  if (run.heartbeat) clearInterval(run.heartbeat);
  if (run.timeout) clearTimeout(run.timeout);
  if (run.child && !run.child.killed) run.child.kill("SIGTERM");
  delete run.child;
  delete run.heartbeat;
  delete run.timeout;
  await persistConversationRun(run);
  return publicRun(run);
}

export async function executeConsoleAction(input, options = {}) {
  const plan = await preparePlan(input, options);
  let commandResult;
  if (plan.access?.status !== "ALLOW") {
    commandResult = {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: plan.access.reason,
      stderr_summary: ""
    };
  } else if (!plan.allowed_to_execute) {
    commandResult = {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: `${plan.governance_gate}: ${plan.blocked_reason}`,
      stderr_summary: ""
    };
  } else {
    const specialResult = await executeSpecialPlanFlow(plan, input);
    if (specialResult) {
      commandResult = specialResult;
    } else {
      const command = commandFor(input, plan);
      try {
        const { stdout, stderr } = await execFileAsync(command.command, command.args, {
          cwd: repoRoot,
          timeout: 120000,
          maxBuffer: 1024 * 1024 * 10
        });
        commandResult = {
          status: "PASS",
          exit_code: 0,
          stdout_summary: summarizeStdout(stdout),
          stderr_summary: summarizeStdout(stderr)
        };
      } catch (error) {
        commandResult = {
          status: "FAIL",
          exit_code: typeof error?.code === "number" ? error.code : 1,
          stdout_summary: summarizeStdout(error?.stdout ?? ""),
          stderr_summary: summarizeStdout(error?.stderr ?? error?.message ?? "")
        };
      }
    }
  }

  const smartParkGoLivePlan = plan.action_id === "smart-park-go-live-plan"
    ? buildSmartParkGoLivePlan(commandResult)
    : null;
  if (smartParkGoLivePlan) {
    commandResult.stdout_summary = `${commandResult.stdout_summary ? `${commandResult.stdout_summary}\n\n` : ""}${formatSmartParkGoLivePlan(smartParkGoLivePlan)}`;
  }

  const record = {
    schema_version: 1,
    kind: "console_action_run",
    plan,
    result: commandResult,
    smart_park: ["smart-park-continue", "smart-park-blockers", "smart-park-go-live-plan"].includes(plan.action_id)
      ? {
          quick_entries: [
            "继续 Smart Park",
            "检查上线阻断项",
            "生成 SMART_PARK_GO_LIVE_PLAN",
            "检查项目状态",
            "生成下一步任务 proposal"
          ],
          go_live_plan: smartParkGoLivePlan,
          next_proposal_command: `node ${studioScript} project task-plan --config examples/jinhu-smart-park/project.config.example.json --text "<下一步任务>" --dry-run`
        }
      : null
  };
  const logs = await writeActionLog(record);
  return {
    ...record,
    logs
  };
}

export async function executeDryRunAction(input) {
  return executeConsoleAction(input);
}

export async function latestActionLog() {
  const absoluteDir = resolve(repoRoot, actionLogDir);
  if (!existsSync(absoluteDir)) return null;
  const entries = await readdir(absoluteDir, { withFileTypes: true });
  const jsonFiles = [];
  for (const entry of entries) {
    if (!entry.isFile() || !entry.name.endsWith(".json")) continue;
    const absolutePath = join(absoluteDir, entry.name);
    const stats = await stat(absolutePath);
    jsonFiles.push({ absolutePath, mtimeMs: stats.mtimeMs });
  }
  jsonFiles.sort((left, right) => right.mtimeMs - left.mtimeMs || left.absolutePath.localeCompare(right.absolutePath));
  const latest = jsonFiles[0];
  if (!latest) return null;
  return {
    path: relative(repoRoot, latest.absolutePath),
    data: JSON.parse(await readFile(latest.absolutePath, "utf8"))
  };
}

export function actionServerSummary() {
  const actionCatalog = new Map(listConsoleActionCatalog().map((entry) => [entry.action_id, entry]));
  const projects = projectRegistry();
  return {
    bind_address: "127.0.0.1",
    auth_required: true,
    auth_mode: "local_password_session",
    pilot_production_mode: true,
    dry_run_only: false,
    attachments_enabled: true,
    supported_uploads: ["image", "file"],
    direct_execute_allowed_for: ["LOW", "MEDIUM"],
    high_risk_policy: "proposal_only",
    critical_risk_policy: "human_approval_required",
    identity_source: "packages/access-center",
    session_store: "runtime/local-services/access-sessions.json",
    action_log_dir: actionLogDir,
    actions: consoleActionOptions.map((action) => {
      const catalog = actionCatalog.get(action.id) ?? {};
      return {
        ...action,
        executionMode: catalog.execution_mode ?? action.executionMode ?? "dry_run_only",
        projectScoped: catalog.project_scoped ?? false
      };
    }),
    projects: projects.map((project) => ({
      project_id: project.project_id,
      label: project.label,
      project_name: project.project_name,
      status: project.connection_status,
      doctor_status: project.doctor_status,
      config_path: project.config_path
    }))
  };
}

export async function getAccessSessionSummary(sessionToken, options = {}) {
  const bundle = await loadAccessCenter();
  return currentSessionSummary(bundle, sessionToken, options);
}
