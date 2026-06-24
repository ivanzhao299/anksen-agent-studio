import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, stat, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

const execFileAsync = promisify(execFile);
const webDir = dirname(fileURLToPath(import.meta.url));
export const repoRoot = resolve(webDir, "../../..");
export const actionLogDir = "autopilot-runs/console-actions";
const studioScript = "packages/orchestrator-core/bin/studio.mjs";

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

export const consoleActionOptions = [
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
  { id: "proposal-approve-dry-run", label: "审批 Proposal 草稿", risk: "HIGH" },
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

function normalizeActionId(actionId) {
  if (actionId === "autopilot-run") return "autopilot-dry-run";
  if (actionId === "proposal-approve") return "proposal-approve-dry-run";
  if (actionId === "worker-status") return "worker-health";
  if (actionId === "pending-proposals") return "proposal-review";
  if (actionId === "smart-park-go-live-plan-dry-run") return "smart-park-go-live-plan";
  return consoleActionOptions.some((action) => action.id === actionId) ? actionId : "context-summary";
}

function normalizeProject(projectId) {
  return projects[projectId] ? projectId : "jinhu-smart-park";
}

function commandFor(input) {
  const actionId = normalizeActionId(input.action_id);
  const projectId = normalizeProject(input.project_id);
  const goal = safeGoal(input.goal);
  const project = projects[projectId];

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
  if (actionId === "autopilot-dry-run") {
    return {
      command: process.execPath,
      args: [studioScript, "autopilot", "batch", "--goal", goal, "--dry-run", "--parallel", "4"],
      display: `node ${studioScript} autopilot batch --goal "${goal}" --dry-run --parallel 4`
    };
  }
  if (actionId === "autopilot-execute") {
    return {
      command: process.execPath,
      args: [studioScript, "autopilot", "batch", "--goal", goal, "--apply", "--parallel", "4"],
      display: `node ${studioScript} autopilot batch --goal "${goal}" --apply --parallel 4`
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
  return {
    command: process.execPath,
    args: [studioScript, "project", "proposals", "--config", "examples/jinhu-smart-park/project.config.example.json"],
    display: `node ${studioScript} project proposals --config examples/jinhu-smart-park/project.config.example.json`
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

function buildPlan(input) {
  const actionId = normalizeActionId(input.action_id);
  const projectId = normalizeProject(input.project_id);
  const meta = actionMeta(actionId);
  const command = commandFor({ ...input, action_id: actionId, project_id: projectId });
  const gate = governanceGateForRisk(meta.risk);
  const now = new Date().toISOString();
  const planId = `console-action-${timestampForFile(now)}-${createHash("sha1").update(`${actionId}:${projectId}:${now}`).digest("hex").slice(0, 8)}`;
  return {
    schema_version: 1,
    plan_id: planId,
    created_at: now,
    action_id: actionId,
    action_label: meta.label,
    target_project: projectId,
    target_project_status: projects[projectId].status,
    goal_summary: safeGoal(input.goal).slice(0, 240),
    command: command.display,
    risk: meta.risk,
    approval_required: gate.approval_required,
    mode: gate.execution_mode,
    governance_gate: gate.gate_action,
    allowed_to_execute: gate.allowed_to_execute,
    blocked_reason: gate.blocked_reason,
    write_enabled: false,
    production_enabled: false,
    log_path: `${actionLogDir}/${planId}.json`,
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
      external_model_call: "disabled"
    }
  };
}

function summarizeStdout(stdout) {
  const lines = redactSensitive(stdout)
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean);
  return lines.slice(0, 30).join("\n");
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
- external_model_call: disabled
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

export async function createActionPlan(input) {
  const plan = buildPlan(input);
  const record = {
    schema_version: 1,
    kind: "console_action_plan",
    plan,
    result: null
  };
  const logs = await writeActionLog(record);
  return {
    ...record,
    logs
  };
}

export async function executeConsoleAction(input) {
  const plan = buildPlan(input);
  const command = commandFor(input);
  let commandResult;
  if (!plan.allowed_to_execute) {
    commandResult = {
      status: "BLOCKED",
      exit_code: null,
      stdout_summary: `${plan.governance_gate}: ${plan.blocked_reason}`,
      stderr_summary: ""
    };
  } else {
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
    pilot_production_mode: true,
    dry_run_only: false,
    direct_execute_allowed_for: ["LOW", "MEDIUM"],
    high_risk_policy: "proposal_only",
    critical_risk_policy: "human_approval_required",
    action_log_dir: actionLogDir,
    actions: consoleActionOptions,
    projects: Object.entries(projects).map(([project_id, project]) => ({
      project_id,
      label: project.label,
      status: project.status
    }))
  };
}
