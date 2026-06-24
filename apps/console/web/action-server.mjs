import { execFile, spawn } from "node:child_process";
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
const actionRuns = new Map();
const terminalRunStatuses = new Set(["PASS", "FAIL", "BLOCKED", "NEEDS_APPROVAL", "CANCELLED"]);
const actionTimeoutMs = 180000;

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
  { id: "workspace-goal", label: "自然语言任务", risk: "MEDIUM" },
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

function inferWorkspaceActionId(input = {}) {
  const goal = safeGoal(input.goal).toLowerCase();
  const mode = String(input.workspace_mode || input.mode || "auto");
  const agent = String(input.agent || "auto");
  if (mode === "agent" && ["codex-cli", "claude-code"].includes(agent)) return "agent-real-plan";
  if (goal.includes("阻断") || goal.includes("blocker") || goal.includes("blocked")) return "smart-park-blockers";
  if (goal.includes("上线") || goal.includes("go-live") || goal.includes("golive")) return "smart-park-go-live-plan";
  if (goal.includes("smart park") || goal.includes("智慧园区") || goal.includes("金湖")) return "project-inspect";
  if (goal.includes("worker") || goal.includes("agent 状态") || goal.includes("agent状态")) return "worker-health";
  if (goal.includes("runtime") || goal.includes("运行时")) return "runtime-health";
  if (goal.includes("governance") || goal.includes("治理") || goal.includes("审批")) return "governance-check";
  if (goal.includes("context") || goal.includes("上下文") || goal.includes("记忆")) return "context-summary";
  if (goal.includes("proposal") || goal.includes("待审批")) return "proposal-review";
  if (goal.includes("继续推进 pilot") || goal.includes("继续推进 v5") || goal.includes("继续推进 v4")) {
    return mode === "plan_only" ? "autopilot-dry-run" : "autopilot-dry-run";
  }
  return "goal-plan";
}

function normalizeActionId(actionId, input = {}) {
  if (actionId === "autopilot-run") return "autopilot-dry-run";
  if (actionId === "proposal-approve") return "proposal-approve-dry-run";
  if (actionId === "worker-status") return "worker-health";
  if (actionId === "pending-proposals") return "proposal-review";
  if (actionId === "smart-park-go-live-plan-dry-run") return "smart-park-go-live-plan";
  if (actionId === "workspace-default" || actionId === "workspace-goal") return inferWorkspaceActionId(input);
  return consoleActionOptions.some((action) => action.id === actionId) ? actionId : "context-summary";
}

function normalizeProject(projectId) {
  return projects[projectId] ? projectId : "jinhu-smart-park";
}

function commandFor(input) {
  const actionId = normalizeActionId(input.action_id, input);
  const projectId = normalizeProject(input.project_id);
  const goal = safeGoal(input.goal);
  const project = projects[projectId];

  if (actionId === "ai-runtime-status") {
    return {
      command: process.execPath,
      args: [studioScript, "console", "agent-status", "--dry-run"],
      display: `node ${studioScript} console agent-status --dry-run`
    };
  }
  if (actionId === "agent-real-plan") {
    return realAgentCommandFor(input);
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

function realAgentPromptFor(input) {
  const goal = safeGoal(input.goal);
  const projectId = normalizeProject(input.project_id);
  return [
    "你正在通过 ANKSEN Agent Studio Console 运行。",
    "这是本地 Pilot Production 模式。",
    "安全边界：只读分析和计划；不要修改文件；不要执行 deploy；不要进行 production operation；不要读取或输出真实凭证；不要写 jinhu-smart-park 业务代码。",
    `项目：${projectId}`,
    `目标：${goal}`,
    "",
    "请用中文输出：",
    "1. 已理解目标",
    "2. 建议计划",
    "3. 风险等级",
    "4. 下一步操作"
  ].join("\n");
}

function realAgentCommandFor(input) {
  const agent = String(input.agent || "codex-cli");
  const prompt = realAgentPromptFor(input);
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

function buildPlan(input) {
  const actionId = normalizeActionId(input.action_id, input);
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
    workspace_mode: String(input.workspace_mode || input.mode || "auto"),
    agent: String(input.agent || "auto"),
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
      external_model_call: actionId === "agent-real-plan" ? "user_selected_local_cli_runtime" : "disabled"
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
    .filter(Boolean);
  return lines.slice(0, 30).join("\n");
}

function runMessagesForPlan(plan) {
  return [
    { role: "user", content: plan.goal_summary, at: plan.created_at },
    { role: "assistant", content: `已理解目标：${plan.goal_summary}`, at: plan.created_at, phase: "understood" },
    { role: "assistant", content: `正在选择项目：${plan.target_project}（${plan.target_project_status}）`, at: plan.created_at, phase: "project" },
    { role: "assistant", content: `正在选择 Agent/Runtime：${plan.agent} / ${plan.workspace_mode}`, at: plan.created_at, phase: "agent" },
    { role: "assistant", content: `正在生成计划：${plan.action_label}`, at: plan.created_at, phase: "planning" },
    { role: "assistant", content: `正在通过 Governance 检查：${plan.governance_gate}，风险 ${plan.risk}`, at: plan.created_at, phase: "governance" }
  ];
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
  const { child: _child, timeout: _timeout, stdout: _stdout, stderr: _stderr, ...value } = run;
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

export async function createActionPlan(input) {
  const plan = buildPlan(input);
  const planCommand = actionPlanCommandFor(plan, input);
  let commandResult;
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
  run.result.stdout_summary = `命令已启动。PID: ${child.pid ?? "unknown"}。正在等待输出...`;

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
    run.timeline = runTimeline(run.status, run.result.status);
    if (run.child && !run.child.killed) run.child.kill("SIGTERM");
    delete run.child;
    delete run.timeout;
    await persistConversationRun(run);
  }, actionTimeoutMs);

  child.stdout.on("data", (chunk) => {
    run.stdout += chunk.toString("utf8");
    run.result.stdout_summary = summarizeStdout(run.stdout) || `命令已启动。PID: ${run.child_pid ?? "unknown"}。正在等待输出...`;
    run.updated_at = new Date().toISOString();
  });
  child.stderr.on("data", (chunk) => {
    run.stderr += chunk.toString("utf8");
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
    run.timeline = runTimeline(run.status, run.result.status);
    delete run.child;
    delete run.timeout;
    await persistConversationRun(run);
  });
  child.on("close", async (code, signal) => {
    if (run.status === "CANCELLED") return;
    if (run.timeout) clearTimeout(run.timeout);
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
      } catch (error) {
        fallbackSummary = [
          "Planning Center 没有为该目标返回可直接执行的 batch_plan。",
          "已停止直接执行；请先生成更明确的计划或选择 Smart Park 快捷入口。",
          summarizeStdout(error?.stdout ?? error?.stderr ?? error?.message ?? "")
        ].filter(Boolean).join("\n");
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
    run.timeline = runTimeline(run.status, run.result.status);
    delete run.child;
    delete run.timeout;
    await persistConversationRun(run);
  });
}

export async function startConversationAction(input) {
  const plan = buildPlan(input);
  const command = commandFor(input);
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
    stdout: "",
    stderr: ""
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
  if (run.timeout) clearTimeout(run.timeout);
  if (run.child && !run.child.killed) run.child.kill("SIGTERM");
  delete run.child;
  delete run.timeout;
  await persistConversationRun(run);
  return publicRun(run);
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
