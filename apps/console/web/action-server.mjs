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
  loadAccessCenter,
  resolveSessionContext
} from "../../../packages/access-center/lib/access-center-utils.mjs";

const execFileAsync = promisify(execFile);
const webDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(webDir, "../../..");
export const actionLogDir = "autopilot-runs/console-actions";
export const actionUploadDir = `${actionLogDir}/uploads`;
const studioScript = "packages/orchestrator-core/bin/studio.mjs";
const actionRuns = new Map();
const terminalRunStatuses = new Set(["PASS", "FAIL", "BLOCKED", "NEEDS_APPROVAL", "CANCELLED"]);
const actionTimeoutMs = 180000;
const liveAgentRuntimeIds = new Set(["codex-cli", "claude-code"]);
const maxAttachmentCount = 6;
const maxAttachmentBytes = 8 * 1024 * 1024;

const projects = {
  "jinhu-smart-park": {
    label: "jinhu-smart-park",
    status: "connected",
    config: "examples/jinhu-smart-park/project.config.example.json"
  },
  "phoenix-erp": {
    label: "phoenix-erp",
    status: "WAITING_FOR_GITHUB_REPO",
    config: "examples/phoenix-erp/project.config.example.json"
  },
  "group-portal": {
    label: "group-portal",
    status: "PLANNED",
    config: ""
  }
};

function projectConfigFor(projectId) {
  return projects[projectId]?.config || projects["jinhu-smart-park"].config;
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

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  return JSON.parse(await readFile(path, "utf8"));
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

function findPendingProposal(records = []) {
  return records.find((record) => record.data?.approval_status !== "APPROVED") ?? records[0] ?? null;
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
  { id: "project-inspect", label: "检查 Smart Park", risk: "MEDIUM" },
  { id: "runtime-health", label: "Runtime 健康检查", risk: "LOW" },
  { id: "worker-health", label: "查看 Worker 状态", risk: "MEDIUM" },
  { id: "governance-check", label: "Governance 检查", risk: "LOW" },
  { id: "autopilot-dry-run", label: "Autopilot 规划", risk: "MEDIUM" },
  { id: "autopilot-execute", label: "Autopilot 执行 LOW/MEDIUM", risk: "MEDIUM" },
  { id: "smart-park-continue", label: "继续 Smart Park", risk: "MEDIUM" },
  { id: "smart-park-blockers", label: "检查上线阻断项", risk: "MEDIUM" },
  { id: "smart-park-go-live-plan", label: "Smart Park 上线计划 Proposal", risk: "MEDIUM" },
  { id: "proposal-review", label: "查看待审批 Proposal", risk: "MEDIUM" },
  { id: "release-server-preview", label: "服务器预览确认", risk: "MEDIUM" },
  { id: "release-reviewed-publish", label: "Reviewed Publish 确认", risk: "MEDIUM" },
  { id: "proposal-approve-dry-run", label: "审批 Proposal 草稿", risk: "MEDIUM" },
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
  return String(input.agent || "auto");
}

function resolveExecutionAgent(input = {}) {
  const requested = normalizeRequestedAgent(input);
  if (liveAgentRuntimeIds.has(requested)) {
    return { requested, effective: requested, fallback: false };
  }
  if (!requested || requested === "auto") {
    return { requested: "auto", effective: "codex-cli", fallback: false };
  }
  return { requested, effective: "codex-cli", fallback: true };
}

function inferWorkspaceActionId(input = {}) {
  const goal = safeGoal(input.goal).toLowerCase();
  const mode = normalizeWorkspaceMode(input);
  const requestedAgent = normalizeRequestedAgent(input);
  const hasAttachments = Array.isArray(input.attachments) && input.attachments.length > 0;
  if (mode === "plan_only") return "goal-plan";
  if (mode === "agent") return "agent-real-plan";
  if (hasAttachments) return "agent-real-plan";
  if (liveAgentRuntimeIds.has(requestedAgent)) return "agent-real-plan";
  if (goal.includes("阻断") || goal.includes("blocker") || goal.includes("blocked")) return "smart-park-blockers";
  if (goal.includes("上线") || goal.includes("go-live") || goal.includes("golive")) return "smart-park-go-live-plan";
  if (goal.includes("project inspect") || goal.includes("项目状态") || goal.includes("项目概况")) return "project-inspect";
  if (goal.includes("worker") || goal.includes("agent 状态") || goal.includes("agent状态")) return "worker-health";
  if (goal.includes("runtime") || goal.includes("运行时")) return "runtime-health";
  if (goal.includes("governance") || goal.includes("治理") || goal.includes("审批")) return "governance-check";
  if (goal.includes("context") || goal.includes("上下文") || goal.includes("记忆")) return "context-summary";
  if (goal.includes("proposal") || goal.includes("待审批")) return "proposal-review";
  if (goal.includes("服务器预览") || goal.includes("server preview")) return "release-server-preview";
  if (goal.includes("reviewed publish") || goal.includes("发布确认")) return "release-reviewed-publish";
  if (goal.includes("autopilot") || goal.includes("batch") || goal.includes("批处理")) return "autopilot-dry-run";
  if (goal.includes("生成计划") || goal.includes("只生成计划")) return "goal-plan";
  return "agent-real-plan";
}

function normalizeActionId(actionId, input = {}) {
  if (actionId === "autopilot-run") return "autopilot-dry-run";
  if (actionId === "proposal-approve") return "proposal-approve-dry-run";
  if (actionId === "worker-status") return "worker-health";
  if (actionId === "pending-proposals") return "proposal-review";
  if (actionId === "smart-park-go-live-plan-dry-run") return "smart-park-go-live-plan";
  if (actionId === "server-preview") return "release-server-preview";
  if (actionId === "reviewed-publish") return "release-reviewed-publish";
  if (actionId === "workspace-default" || actionId === "workspace-goal") return inferWorkspaceActionId(input);
  return consoleActionOptions.some((action) => action.id === actionId) ? actionId : "context-summary";
}

function normalizeProject(projectId) {
  return projects[projectId] ? projectId : "jinhu-smart-park";
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
  const project = projects[projectId];
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
    if (projectId !== "jinhu-smart-park" || !project.config || !existsSync(resolve(repoRoot, project.config))) {
      return {
        command: process.execPath,
        args: [studioScript, "context", "project", "--project", projectId],
        display: `node ${studioScript} context project --project ${projectId}`
      };
    }
    return {
      command: process.execPath,
      args: [studioScript, "project", "inspect", "--config", project.config, "--dry-run"],
      display: `node ${studioScript} project inspect --config ${project.config} --dry-run`
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
  if (actionId === "proposal-reject-draft") {
    return {
      command: process.execPath,
      args: [studioScript, "project", "proposals", "--config", projectConfigFor(projectId)],
      display: "proposal reject draft -> review required"
    };
  }
  return {
    command: process.execPath,
    args: [studioScript, "project", "proposals", "--config", "examples/jinhu-smart-park/project.config.example.json"],
    display: `node ${studioScript} project proposals --config examples/jinhu-smart-park/project.config.example.json`
  };
}

function realAgentPromptFor(input, attachments = []) {
  const goal = safeGoal(input.goal);
  const projectId = normalizeProject(input.project_id);
  return [
    "你正在通过 ANKSEN Agent Studio Console 运行。",
    "这是本地 Pilot Production 模式。",
    "安全边界：只读分析和计划；不要修改文件；不要执行 deploy；不要进行 production operation；不要读取或输出真实凭证；不要写 jinhu-smart-park 业务代码。",
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
  const agent = String(input.agent || "codex-cli");
  const prompt = realAgentPromptFor(input, attachments);
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
    target_project_status: projects[projectId].status,
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
      external_model_call: actionId === "agent-real-plan" ? "user_selected_local_cli_runtime" : "disabled"
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
    const { stdout } = await execFileAsync("/bin/zsh", ["-lc", `command -v ${command}`], {
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

export async function detectLocalAiRuntimes() {
  const [codex, claude] = await Promise.all([
    detectCommand("codex"),
    detectCommand("claude")
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
      }
    ],
    safety: {
      console_reads_secret_values: false,
      console_stores_secret_values: false,
      default_invocation: "user_selected_only",
      codex_sandbox: "read-only",
      claude_tools: "Bash/Edit/Write/MultiEdit/NotebookEdit disallowed"
    }
  };
}

async function executeProjectDispatchFlow(plan, input) {
  const projectId = plan.target_project;
  const configPath = projectConfigFor(projectId);
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
  const pending = findPendingProposal(proposals);
  const summary = [
    `dispatch_plan: ${dispatchFields.pipeline_stage || "unknown"}`,
    `recommended_next_stage: ${dispatchFields.recommended_next_stage || "unknown"}`,
    proposalCreated
      ? `proposal_created: ${proposalCreated.task_id} | ${proposalCreated.proposal_file || "file pending"}`
      : `proposal_state: ${pending?.data?.approval_status || "none"}`,
    `proposal_review_ready: ${pending ? "yes" : "no"}`,
    "",
    summarizeProposalRecords(proposals)
  ].join("\n");
  return {
    status: pending ? "NEEDS_APPROVAL" : "PASS",
    exit_code: 0,
    stdout_summary: summary,
    stderr_summary: "",
    proposal_task_id: proposalCreated?.task_id || pending?.data?.task_id || ""
  };
}

async function executeProposalReviewFlow(plan) {
  const projectId = plan.target_project;
  const proposals = await readProjectProposalRecords(projectId);
  const audits = await readProjectQueueAuditRecords(projectId);
  const pending = proposals.filter((record) => record.data?.approval_status !== "APPROVED");
  return {
    status: pending.length > 0 ? "NEEDS_APPROVAL" : "PASS",
    exit_code: 0,
    stdout_summary: [
      `proposal_count: ${proposals.length}`,
      `pending_approval: ${pending.length}`,
      "",
      summarizeProposalRecords(proposals),
      "",
      summarizeQueueAuditRecords(audits)
    ].join("\n"),
    stderr_summary: ""
  };
}

async function executeProposalApproveDryRunFlow(plan, input) {
  const projectId = plan.target_project;
  const configPath = projectConfigFor(projectId);
  const proposals = await readProjectProposalRecords(projectId);
  const selected = proposals.find((record) => record.data?.task_id === input.task_id) ?? findPendingProposal(proposals);
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

async function executeReleasePromotionFlow(targetStage) {
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
  if (plan.action_id === "release-server-preview") return executeReleasePromotionFlow("server_preview");
  if (plan.action_id === "release-reviewed-publish") return executeReleasePromotionFlow("reviewed_publish");
  if (plan.action_id === "proposal-approve-dry-run") return executeProposalApproveDryRunFlow(plan, input);
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
  const logs = await writeActionLog(publicRun(run));
  run.logs = logs;
  run.plan.log_path = logs.json;
  run.updated_at = new Date().toISOString();
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

export function getConversationAction(runId) {
  return publicRun(actionRuns.get(runId));
}

export async function cancelConversationAction(runId) {
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
    actions: consoleActionOptions,
    projects: Object.entries(projects).map(([project_id, project]) => ({
      project_id,
      label: project.label,
      status: project.status
    }))
  };
}

export async function getAccessSessionSummary(sessionToken, options = {}) {
  const bundle = await loadAccessCenter();
  return currentSessionSummary(bundle, sessionToken, options);
}
