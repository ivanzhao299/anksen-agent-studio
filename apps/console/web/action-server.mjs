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
  { id: "context-summary", label: "context summary", risk: "LOW" },
  { id: "project-inspect", label: "project inspect", risk: "MEDIUM" },
  { id: "runtime-health", label: "runtime health", risk: "LOW" },
  { id: "worker-health", label: "worker health", risk: "MEDIUM" },
  { id: "governance-check", label: "governance check", risk: "LOW" },
  { id: "autopilot-dry-run", label: "autopilot dry-run", risk: "MEDIUM" },
  { id: "smart-park-go-live-plan-dry-run", label: "smart-park go-live plan dry-run", risk: "MEDIUM" },
  { id: "proposal-review", label: "查看 Proposal", risk: "MEDIUM" },
  { id: "proposal-approve-dry-run", label: "dry-run 批准", risk: "HIGH" },
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
  if (actionId === "smart-park-go-live-plan-dry-run") {
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

function approvalRequired(risk) {
  return risk === "HIGH" || risk === "CRITICAL";
}

function buildPlan(input) {
  const actionId = normalizeActionId(input.action_id);
  const projectId = normalizeProject(input.project_id);
  const meta = actionMeta(actionId);
  const command = commandFor({ ...input, action_id: actionId, project_id: projectId });
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
    approval_required: approvalRequired(meta.risk),
    mode: "dry_run",
    write_enabled: false,
    production_enabled: false,
    log_path: `${actionLogDir}/${planId}.json`,
    safety: {
      bind_address: "127.0.0.1",
      dry_run_only: true,
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

function markdownLog(record) {
  return `# Console Action Log

- plan_id: ${record.plan.plan_id}
- action_id: ${record.plan.action_id}
- target_project: ${record.plan.target_project}
- risk: ${record.plan.risk}
- approval_required: ${record.plan.approval_required ? "yes" : "no"}
- mode: ${record.plan.mode}
- status: ${record.result?.status ?? "PLANNED"}
- command: ${record.plan.command}

## Output Summary

\`\`\`
${record.result?.stdout_summary ?? "plan generated; command not executed"}
\`\`\`

## Safety

- bind_address: 127.0.0.1
- dry_run_only: true
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

export async function executeDryRunAction(input) {
  const plan = buildPlan(input);
  const command = commandFor(input);
  let commandResult;
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

  const record = {
    schema_version: 1,
    kind: "console_action_run",
    plan,
    result: commandResult,
    smart_park: plan.action_id === "smart-park-go-live-plan-dry-run"
      ? {
          quick_entries: [
            "生成上线计划 dry-run",
            "检查项目状态",
            "查看阻断项",
            "生成下一步任务 proposal"
          ],
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
    dry_run_only: true,
    action_log_dir: actionLogDir,
    actions: consoleActionOptions,
    projects: Object.entries(projects).map(([project_id, project]) => ({
      project_id,
      label: project.label,
      status: project.status
    }))
  };
}
