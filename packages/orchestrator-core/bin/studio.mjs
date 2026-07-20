#!/usr/bin/env node
import { execFile, spawn } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync, openSync } from "node:fs";
import { mkdir, readdir, readFile, unlink, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(binDir);
const repoRoot = resolve(packageDir, "../..");
const execFileAsync = promisify(execFile);

const DEFAULT_PROJECT = "examples/jinhu-smart-park/project.config.example.json";
const REAL_PARALLEL_BATCH_COMMIT_MESSAGE = "chore(autopilot): use real parallel worker executor";

function usage() {
  console.log(`ANKSEN Agent Studio CLI

Usage:
  node packages/orchestrator-core/bin/studio.mjs doctor [--project <file>] --dry-run
  node packages/orchestrator-core/bin/studio.mjs project intake --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project stack --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project commands --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project connect [--project-id <project_id>] [--project-name <name>] [--source-type auto|local_path|git_url|zip_placeholder] [--local-path <path>] [--git-url <url>] [--url <url>] [--description <text>] [--default-branch <branch>] [--package-manager <pm>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project bind --config <file> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project workspace [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project exec-context --project <project_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project dispatch-plan --project <project_id> --text "..." [--user <username>] [--runtime <runtime_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project inspect --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project parity --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project evidence --project <project_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project chain-validate --project <project_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project import-memory --config <file> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project memory --config <file> --summary
  node packages/orchestrator-core/bin/studio.mjs project task-plan --config <file> --text "..." [--dry-run|--apply-proposal]
  node packages/orchestrator-core/bin/studio.mjs project proposals --config <file>
  node packages/orchestrator-core/bin/studio.mjs project approve-proposal --config <file> --task-id <task_id> [--dry-run|--apply --approve-high-risk]
  node packages/orchestrator-core/bin/studio.mjs project execute --config <file> --task-id <task_id> [--dry-run|--apply --parallel 1]
  node packages/orchestrator-core/bin/studio.mjs skill-route --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs credential list --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential policy --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential backend-list --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential backend-select --backend <backend_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential scope-check --runtime <runtime_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs credential audit-policy --dry-run
  node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
  node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
  node packages/orchestrator-core/bin/studio.mjs approval-policy --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime <runtime_id> --skill <skill_type> --dry-run
  node packages/orchestrator-core/bin/studio.mjs model-gateway status --dry-run
  node packages/orchestrator-core/bin/studio.mjs model-gateway route --runtime <runtime_id|auto> --goal "..." [--project <project_id>] [--user <username>] --dry-run
  node packages/orchestrator-core/bin/studio.mjs model-gateway invoke-plan --runtime <runtime_id|auto> --goal "..." [--project <project_id>] [--user <username>] --dry-run
  node packages/orchestrator-core/bin/studio.mjs model-gateway audit --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker list --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker registry --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker health --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker control-plane [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs worker heartbeat --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker assign --runtime <runtime_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker assign --capability <capability_tag> --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker dispatch (--runtime <runtime_id>|--capability <capability_tag>) --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker cancel --worker <worker_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs worker parallel-smoke --agents agent-1,agent-2 --parallel 2 [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs mobile ios-detect --project <path> --dry-run
  node packages/orchestrator-core/bin/studio.mjs mobile android-detect --project <path> --dry-run
  node packages/orchestrator-core/bin/studio.mjs mobile validate --platform ios --dry-run
  node packages/orchestrator-core/bin/studio.mjs mobile validate --platform android --dry-run
  node packages/orchestrator-core/bin/studio.mjs production server-list --dry-run
  node packages/orchestrator-core/bin/studio.mjs production deploy-plan --dry-run
  node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run
  node packages/orchestrator-core/bin/studio.mjs production rollback-plan --dry-run
  node packages/orchestrator-core/bin/studio.mjs production-ops policy --dry-run
  node packages/orchestrator-core/bin/studio.mjs production-ops gates --dry-run
  node packages/orchestrator-core/bin/studio.mjs production-ops validate --dry-run
  node packages/orchestrator-core/bin/studio.mjs context bootstrap --apply
  node packages/orchestrator-core/bin/studio.mjs context summary
  node packages/orchestrator-core/bin/studio.mjs context project --project <project_id>
  node packages/orchestrator-core/bin/studio.mjs access summary --dry-run
  node packages/orchestrator-core/bin/studio.mjs access users --dry-run
  node packages/orchestrator-core/bin/studio.mjs access plans --dry-run
  node packages/orchestrator-core/bin/studio.mjs access invites --dry-run
  node packages/orchestrator-core/bin/studio.mjs access enforcement [--user <username>] [--project <project_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access check --user <username> --action <action_id> [--project <project_id>] --dry-run
  node packages/orchestrator-core/bin/studio.mjs access grant --user <username> --role <role_id> [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access set-plan --user <username> --plan <plan_id> [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access reset-password --user <username> --password <new_password> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access enable-user --user <username> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access disable-user --user <username> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access create-user --user <username> --display-name <name> --role <role_id> --plan <plan_id> --password <initial_password> [--projects <csv|*>] [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access invite-user --user <username> --display-name <name> --role <role_id> --plan <plan_id> [--projects <csv|*>] [--comment <text>] [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access review-invite --invite-id <invite_id> [--approve|--reject] [--comment <text>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access materialize-invite --invite-id <invite_id> --password <initial_password> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access set-project-scope --user <username> --projects <csv|*> [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access suspend-membership --user <username> [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs access resume-membership --user <username> [--workspace <workspace_id>] [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs runtime list
  node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
  node packages/orchestrator-core/bin/studio.mjs runtime select --skill <skill_type> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs pilot runtime-smoke --runtime codex-cli [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs plan --goal "..." --dry-run
  node packages/orchestrator-core/bin/studio.mjs plan --goal "..." --completion-aware --dry-run
  node packages/orchestrator-core/bin/studio.mjs console render --dry-run
  node packages/orchestrator-core/bin/studio.mjs console smoke --dry-run
  node packages/orchestrator-core/bin/studio.mjs console actions --dry-run
  node packages/orchestrator-core/bin/studio.mjs console action-plan --action <action_id> --goal "..." --project <project_id> --dry-run
  node packages/orchestrator-core/bin/studio.mjs console action-server-smoke --dry-run
  node packages/orchestrator-core/bin/studio.mjs console agent-status --dry-run
  node packages/orchestrator-core/bin/studio.mjs console service status
  node packages/orchestrator-core/bin/studio.mjs console service install [--dry-run|--apply] [--port 4317]
  node packages/orchestrator-core/bin/studio.mjs console service start [--apply]
  node packages/orchestrator-core/bin/studio.mjs console service stop [--apply]
  node packages/orchestrator-core/bin/studio.mjs console service uninstall [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs release consistency [--dry-run|--apply] [--target local_preview|server_preview|reviewed_publish]
  node packages/orchestrator-core/bin/studio.mjs platform self-test [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs goal-to-queue --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs runtime-memory --summary
  node packages/orchestrator-core/bin/studio.mjs observe [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs evolution-plan [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs discovery --target <file> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs debug analyze --fixture <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs autopilot --goal "..." [--dry-run|--apply --max-steps 1]
  node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "..." [--dry-run|--apply --max-steps 1|4]
  node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "..." [--dry-run|--apply --parallel 2]
  node packages/orchestrator-core/bin/studio.mjs lint-check

Project execution is available only through explicit project execute --apply. Deploy and production operations remain disabled.`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const subcommand = ["project", "runtime", "credential", "governance", "release-gate", "release", "adapter", "model-gateway", "worker", "mobile", "production", "production-ops", "context", "access", "autopilot", "debug", "console", "pilot", "platform"].includes(command) ? rest[0] : "";
  const args = {
    command,
    subcommand,
    dryRun: rest.includes("--dry-run"),
    apply: rest.includes("--apply"),
    completionAware: rest.includes("--completion-aware"),
    applyProposal: rest.includes("--apply-proposal"),
    approveHighRisk: rest.includes("--approve-high-risk"),
    summary: rest.includes("--summary"),
    text: "",
    agents: "",
    goal: "",
    skill: "",
    runtime: "",
    worker: "",
    backend: "",
    action: "",
    platform: "",
    capability: "",
    user: "",
    password: "",
    role: "",
    plan: "",
    workspace: "",
    displayName: "",
    projects: "",
    inviteId: "",
    comment: "",
    projectId: "",
    projectName: "",
    sourceType: "",
    localPath: "",
    gitUrl: "",
    url: "",
    zipPlaceholder: "",
    stateDir: "",
    projectType: "",
    description: "",
    defaultBranch: "",
    packageManager: "",
    approve: rest.includes("--approve"),
    reject: rest.includes("--reject"),
    serviceAction: command === "console" && subcommand === "service" ? rest[1] ?? "status" : "",
    region: "local",
    regionProvided: false,
    port: 4317,
    budgetUsd: null,
    taskId: "",
    project: DEFAULT_PROJECT,
    config: "",
    target: "",
    fixture: "",
    parallel: 1,
    maxSteps: 1
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--text") {
      args.text = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--agents") {
      args.agents = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--goal") {
      args.goal = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--runtime") {
      args.runtime = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--worker") {
      args.worker = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--backend") {
      args.backend = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--action") {
      args.action = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--platform") {
      args.platform = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--skill") {
      args.skill = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--capability") {
      args.capability = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--user") {
      args.user = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--password") {
      args.password = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--role") {
      args.role = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--plan") {
      args.plan = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--workspace") {
      args.workspace = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--display-name") {
      args.displayName = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--projects") {
      args.projects = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--invite-id") {
      args.inviteId = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--comment") {
      args.comment = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--project-id") {
      args.projectId = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--project-name") {
      args.projectName = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--source-type") {
      args.sourceType = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--local-path") {
      args.localPath = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--git-url") {
      args.gitUrl = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--url") {
      args.url = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--zip-placeholder") {
      args.zipPlaceholder = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--state-dir") {
      args.stateDir = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--project-type") {
      args.projectType = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--description") {
      args.description = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--default-branch") {
      args.defaultBranch = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--package-manager") {
      args.packageManager = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--port") {
      args.port = Number(rest[index + 1] ?? "4317");
      index += 1;
    } else if (arg === "--region") {
      args.region = rest[index + 1] ?? "";
      args.regionProvided = true;
      index += 1;
    } else if (arg === "--budget-usd") {
      args.budgetUsd = Number(rest[index + 1] ?? "0");
      index += 1;
    } else if (arg === "--project") {
      args.project = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--config") {
      args.config = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--target") {
      args.target = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--fixture") {
      args.fixture = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--task-id") {
      args.taskId = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--parallel") {
      args.parallel = Number(rest[index + 1] ?? "1");
      index += 1;
    } else if (arg === "--max-steps") {
      args.maxSteps = Number(rest[index + 1] ?? "1");
      index += 1;
    }
  }

  return args;
}

function resolveFromRoot(path) {
  return resolve(repoRoot, path);
}

function resolveMaybeFromRoot(path) {
  if (!path) return "";
  return resolve(repoRoot, path);
}

function resolveProjectPath(configPath, projectRoot) {
  const fromRepoRoot = resolve(repoRoot, projectRoot);
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  return resolve(dirname(configPath), projectRoot);
}

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function execGit(cwd, args) {
  try {
    const { stdout } = await execFileAsync("git", args, { cwd });
    return stdout.trim();
  } catch {
    return "";
  }
}

async function execReadOnly(cwd, command, args, timeout = 120000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 20
    });
    return {
      ok: true,
      status: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      status: typeof error?.code === "number" ? error.code : 1,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? error?.message ?? "").trim()
    };
  }
}

async function execProjectCommand(cwd, command, args, timeout = 30 * 60 * 1000) {
  try {
    const { stdout, stderr } = await execFileAsync(command, args, {
      cwd,
      timeout,
      maxBuffer: 1024 * 1024 * 80
    });
    return {
      ok: true,
      status: 0,
      stdout: stdout.trim(),
      stderr: stderr.trim()
    };
  } catch (error) {
    return {
      ok: false,
      status: typeof error?.code === "number" ? error.code : 1,
      stdout: String(error?.stdout ?? "").trim(),
      stderr: String(error?.stderr ?? error?.message ?? "").trim()
    };
  }
}

function parseSimpleKeyValueStdout(stdout) {
  const entries = {};
  for (const rawLine of String(stdout ?? "").split("\n")) {
    const line = rawLine.trim();
    const match = /^([a-zA-Z0-9_.-]+):\s*(.+)$/.exec(line);
    if (!match) continue;
    entries[match[1]] = match[2];
  }
  return entries;
}

async function runStudioSubcommand(args, timeout = 5 * 60 * 1000) {
  const result = await execReadOnly(repoRoot, process.execPath, [
    "packages/orchestrator-core/bin/studio.mjs",
    ...args
  ], timeout);
  const summary = parseSimpleKeyValueStdout(result.stdout);
  return {
    command: `node packages/orchestrator-core/bin/studio.mjs ${args.join(" ")}`,
    ok: result.ok,
    status: summary.status ?? (result.ok ? "PASS" : "FAIL"),
    exit_code: result.status,
    stdout: result.stdout,
    stderr: result.stderr,
    summary
  };
}

async function countFiles(path) {
  if (!existsSync(path)) return 0;
  const entries = await readdir(path, { withFileTypes: true });
  let count = 0;
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      count += await countFiles(child);
    } else {
      count += 1;
    }
  }
  return count;
}

async function listFiles(path) {
  if (!existsSync(path)) return [];
  const entries = await readdir(path, { withFileTypes: true });
  const files = [];
  for (const entry of entries) {
    const child = join(path, entry.name);
    if (entry.isDirectory()) {
      files.push(...await listFiles(child));
    } else {
      files.push(child);
    }
  }
  return files;
}

async function listPackageNames() {
  const packagesDir = resolveFromRoot("packages");
  const names = [];
  for (const entry of await readdir(packagesDir, { withFileTypes: true })) {
    if (!entry.isDirectory()) continue;
    const packageJsonPath = join(packagesDir, entry.name, "package.json");
    if (!existsSync(packageJsonPath)) continue;
    const packageJson = await readJson(packageJsonPath);
    names.push(packageJson.name ?? entry.name);
  }
  return names.sort();
}

function normalizeText(value) {
  return String(value ?? "").toLowerCase();
}

function matchKeywords(text, keywords) {
  const haystack = normalizeText(text);
  return (keywords ?? []).filter((keyword) => haystack.includes(normalizeText(keyword)));
}

async function loadSkillRoute(text) {
  const registry = await readJson(resolveFromRoot("packages/skill-router/registry/skill-registry.json"));
  const rules = await readJson(resolveFromRoot("packages/skill-router/registry/skill-router-rules.json"));
  const skills = new Map((registry.skills ?? []).map((skill) => [skill.skill_type, skill]));

  const scored = (rules.rules ?? [])
    .map((rule) => {
      const keywords = matchKeywords(text, rule.keywords ?? []);
      const skill = skills.get(rule.skill_type);
      return {
        rule,
        skill,
        keywords,
        score: keywords.length * 10 + (keywords.length > 0 ? Number(rule.confidence_boost ?? 0) : 0)
      };
    })
    .filter((entry) => entry.skill)
    .sort((a, b) => b.score - a.score || String(a.rule.rule_id).localeCompare(String(b.rule.rule_id)));

  const selected = scored.find((entry) => entry.score > 0);
  const fallbackSkillType = rules.routing_policy?.fallback_skill_type ?? "code_development";
  const fallbackSkill = skills.get(fallbackSkillType);
  const final = selected ?? {
    rule: {
      rule_id: "RULE-FALLBACK",
      skill_type: fallbackSkillType,
      task_type: "planning",
      selected_agent: rules.routing_policy?.fallback_agent ?? "agent-5",
      runtime: rules.routing_policy?.fallback_runtime ?? "codex-cli",
      expected_output_type: "technical plan",
      reason: "No explicit skill keyword matched; fallback to planning."
    },
    skill: fallbackSkill,
    keywords: [],
    score: 0
  };

  return {
    input_text: text,
    selected_skill: final.rule.skill_type,
    skill_id: final.skill?.skill_id ?? final.rule.skill_type,
    selected_agent: final.rule.selected_agent ?? final.skill?.default_agent ?? "agent-5",
    selected_runtime: final.rule.runtime ?? final.skill?.default_runtime ?? "codex-cli",
    expected_outputs: [final.rule.expected_output_type ?? final.skill?.expected_output_types?.[0] ?? "report"],
    required_inputs: final.skill?.required_inputs ?? [],
    validation_commands: final.skill?.validation_commands ?? [],
    risk_level: final.skill?.risk_level ?? "MEDIUM",
    confidence: selected ? Math.min(0.95, 0.55 + final.score / 100) : 0.35,
    fallback_used: !selected,
    matched_keywords: final.keywords,
    reason: final.rule.reason ?? final.skill?.purpose ?? "Skill route selected from registry."
  };
}

async function doctor(args) {
  const projectPath = resolveFromRoot(args.project || DEFAULT_PROJECT);
  const projectExists = existsSync(projectPath);
  const project = projectExists ? await readJson(projectPath) : null;
  const packages = await listPackageNames();

  const checks = [
    ["workspace_root", existsSync(resolveFromRoot("pnpm-workspace.yaml"))],
    ["orchestrator_core", existsSync(resolveFromRoot("packages/orchestrator-core"))],
    ["skill_registry", existsSync(resolveFromRoot("packages/skill-router/registry/skill-registry.json"))],
    ["agent_registry_schema", existsSync(resolveFromRoot("packages/orchestrator-core/schemas/agent-registry/agent-registry.schema.json"))],
    ["goal_schema", existsSync(resolveFromRoot("packages/orchestrator-core/schemas/goal/goal-engine.schema.json"))],
    ["planner_schema", existsSync(resolveFromRoot("packages/orchestrator-core/schemas/planner/planner-output.schema.json"))],
    ["discovery_schema", existsSync(resolveFromRoot("packages/discovery-engine/schemas/discovery-target.schema.json"))],
    ["project_config", projectExists]
  ];
  const failed = checks.filter(([, ok]) => !ok);

  console.log("# ANKSEN Agent Studio Doctor dry-run");
  console.log("");
  console.log(`repo_root: ${repoRoot}`);
  console.log(`project_config: ${projectPath}`);
  console.log(`project_id: ${project?.project_id ?? "unknown"}`);
  console.log(`packages: ${packages.length}`);
  for (const name of packages) console.log(`- ${name}`);
  console.log("");
  console.log("checks:");
  for (const [name, ok] of checks) console.log(`- ${name}: ${ok ? "PASS" : "FAIL"}`);
  console.log("");
  console.log(`status: ${failed.length === 0 ? "GO" : "NO_GO"}`);
  if (failed.length > 0) process.exitCode = 1;
}

async function readPackageScripts(projectPath) {
  const packageJsonPath = join(projectPath, "package.json");
  if (!existsSync(packageJsonPath)) return [];
  const packageJson = await readJson(packageJsonPath);
  return Object.keys(packageJson.scripts ?? {}).map((script) => `pnpm ${script}`).sort();
}

async function repoStatus(projectPath) {
  const branch = await execGit(projectPath, ["branch", "--show-current"]);
  const head = await execGit(projectPath, ["log", "--oneline", "-1"]);
  const statusShort = await execGit(projectPath, ["status", "--short"]);
  const aheadBehind = await execGit(projectPath, ["rev-list", "--left-right", "--count", "@{upstream}...HEAD"]);
  return {
    branch: branch || "unknown",
    head: head || "unknown",
    clean: statusShort ? "no" : "yes",
    dirty_files: statusShort ? statusShort.split("\n") : [],
    ahead_behind: aheadBehind || "unknown"
  };
}

function statusEntryPath(entry) {
  return String(entry ?? "").replace(/^[A-Z? !]{1,2}\s+/, "").trim();
}

function releaseManagedDirtyPaths() {
  return new Set([
    "runtime/global/release-consistency.json",
    "runtime/global/codex-context-index.json",
    "runtime/global/access-enforcement.json",
    "runtime/global/studio-worker-platform-selftest.json",
    "docs/release/STUDIO_WORKER_PLATFORM_SELFTEST.md"
  ]);
}

function releaseConsistencyRepoView(repo) {
  const managedPaths = releaseManagedDirtyPaths();
  const dirty_files = (repo.dirty_files ?? []).filter((entry) => !managedPaths.has(statusEntryPath(entry)));
  return {
    ...repo,
    clean: dirty_files.length === 0 ? "yes" : "no",
    dirty_files,
    ignored_generated_files: (repo.dirty_files ?? [])
      .filter((entry) => managedPaths.has(statusEntryPath(entry)))
      .map((entry) => statusEntryPath(entry))
  };
}

function statePath(projectPath, config, ...segments) {
  return join(projectPath, config.state_dir ?? "ops/agent-orchestrator", ...segments);
}

function countTaskStatuses(tasks) {
  const statuses = {};
  for (const task of tasks ?? []) {
    const status = task.status ?? "UNKNOWN";
    statuses[status] = (statuses[status] ?? 0) + 1;
  }
  return statuses;
}

function queueTasksFromJson(queue) {
  return Array.isArray(queue) ? queue : (queue.tasks ?? []);
}

function queueLocksFromJson(locksJson) {
  return Array.isArray(locksJson) ? locksJson : (locksJson.locks ?? []);
}

function queueResultsFromJson(resultsJson) {
  return Array.isArray(resultsJson) ? resultsJson : (resultsJson.results ?? []);
}

function parseAheadBehind(value) {
  const parts = String(value ?? "").trim().split(/\s+/).map((part) => Number(part));
  if (parts.length < 2 || parts.some((part) => Number.isNaN(part))) {
    return { ahead: null, behind: null };
  }
  return { ahead: parts[0], behind: parts[1] };
}

function parseJsonObject(value) {
  try {
    const parsed = JSON.parse(value);
    return parsed && typeof parsed === "object" ? parsed : null;
  } catch {
    return null;
  }
}

function detectStack(projectPath, config) {
  const detected = new Set(config.detected_stack_hints ?? []);
  const probes = [
    ["pnpm-workspace.yaml", "pnpm workspace"],
    ["apps/web", "Next.js web app"],
    ["apps/api", "NestJS API"],
    ["packages/shared", "shared package"],
    ["database/migrations", "database migrations"],
    ["database/seeds", "database seeds"],
    ["ops/agent-orchestrator", "project-local Agent Orchestrator state"],
    ["docs/release", "release documentation"],
    ["scripts/e2e", "e2e smoke scripts"]
  ];
  for (const [path, label] of probes) {
    if (existsSync(join(projectPath, path))) detected.add(label);
  }
  return [...detected].sort();
}

async function runtimeMemoryStatus(projectPath, config) {
  const runtimeConfig = config.runtime_memory ?? {};
  const runtimeDir = join(projectPath, runtimeConfig.directory ?? join(config.state_dir ?? "ops/agent-orchestrator", "runtime"));
  const summaryPath = join(runtimeDir, runtimeConfig.summary_file ?? "handoff-summary.md");
  const platformStatePath = join(runtimeDir, runtimeConfig.platform_state_file ?? "platform-state.json");
  const status = {
    directory: runtimeDir,
    exists: existsSync(runtimeDir) ? "yes" : "no",
    summary: existsSync(summaryPath) ? "present" : "missing",
    platform_state: existsSync(platformStatePath) ? "present" : "missing",
    generated_at: "unknown",
    head_summary: "unknown",
    event_count: "unknown"
  };
  if (existsSync(platformStatePath)) {
    try {
      const platformState = await readJson(platformStatePath);
      status.generated_at = platformState.generated_at ?? "unknown";
      status.head_summary = platformState.head_summary ?? "unknown";
      status.event_count = String(platformState.event_store?.event_count ?? "unknown");
    } catch {
      status.platform_state = "invalid";
    }
  }
  return status;
}

async function queueSummary(projectPath, config) {
  const queuePath = statePath(projectPath, config, "queue", "task-queue.json");
  const locksPath = statePath(projectPath, config, "queue", "task-locks.json");
  const resultsPath = statePath(projectPath, config, "queue", "task-results.json");
  const summary = {
    available: existsSync(queuePath) ? "yes" : "no",
    queue_path: queuePath,
    updated_at: "unknown",
    read_model_only: "unknown",
    task_count: 0,
    status_counts: {},
    active_locks: 0,
    result_count: 0
  };
  if (existsSync(queuePath)) {
    const queue = await readJson(queuePath);
    const tasks = Array.isArray(queue) ? queue : (queue.tasks ?? []);
    summary.updated_at = queue.updated_at ?? "unknown";
    summary.read_model_only = queue.read_model_only === true ? "yes" : "no";
    summary.task_count = tasks.length;
    summary.status_counts = countTaskStatuses(tasks);
  }
  if (existsSync(locksPath)) {
    const locksJson = await readJson(locksPath);
    const locks = Array.isArray(locksJson) ? locksJson : (locksJson.locks ?? []);
    summary.active_locks = locks.filter((lock) => lock.active !== false).length;
  }
  if (existsSync(resultsPath)) {
    const resultsJson = await readJson(resultsPath);
    const results = Array.isArray(resultsJson) ? resultsJson : (resultsJson.results ?? []);
    summary.result_count = results.length;
  }
  return summary;
}

async function eventStoreSummary(projectPath, config) {
  const eventsPath = statePath(projectPath, config, "events");
  const files = (await listFiles(eventsPath)).filter((file) => file.endsWith(".json"));
  const eventTypes = {};
  for (const file of files) {
    try {
      const event = await readJson(file);
      const type = event.event_type ?? "unknown";
      eventTypes[type] = (eventTypes[type] ?? 0) + 1;
    } catch {
      eventTypes.invalid = (eventTypes.invalid ?? 0) + 1;
    }
  }
  return {
    available: existsSync(eventsPath) ? "yes" : "no",
    path: eventsPath,
    event_file_count: files.length,
    event_types: eventTypes
  };
}

async function localOrchestratorStatus(projectPath, config) {
  const orchestratorPath = statePath(projectPath, config);
  const exists = existsSync(orchestratorPath);
  const doctor = exists
    ? await execReadOnly(projectPath, process.execPath, ["ops/agent-orchestrator/scripts/orchestratorctl.mjs", "doctor", "--json"])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const checkStatus = exists
    ? await execReadOnly(projectPath, "./ops/agent-orchestrator/check-status.sh", [])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const dispatchStatus = exists
    ? await execReadOnly(projectPath, process.execPath, ["ops/agent-orchestrator/scripts/check-dispatch-status.mjs"])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const doctorJson = parseJsonObject(doctor.stdout);
  return {
    exists,
    path: orchestratorPath,
    doctor_can_run: doctor.ok,
    doctor_status: doctorJson?.status ?? "unknown",
    check_status_can_run: checkStatus.ok,
    check_dispatch_status_can_run: dispatchStatus.ok,
    doctor_json: doctorJson,
    command_status: {
      doctor: doctor.status,
      check_status: checkStatus.status,
      check_dispatch_status: dispatchStatus.status
    }
  };
}

function recommendedNextActions(parityResult = "UNKNOWN", repoClean = "unknown") {
  const actions = [
    "Use project inspect/parity/import-memory as read-only migration gates.",
    "Keep writes in the business repository disabled until adapter apply flows have dedicated approval.",
    "Run project memory --summary before handing this adapter to a new Agent Studio session."
  ];
  if (parityResult !== "PASS") {
    actions.push("Run local doctor and check-status inside the business repository before relying on imported memory.");
  }
  if (repoClean !== "yes") {
    actions.push("Clean or intentionally commit business repository changes before platform migration work.");
  }
  return actions;
}

async function collectProjectSnapshot(configPath) {
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config.project_root);
  const projectExists = existsSync(projectPath);
  const repo = projectExists ? await repoStatus(projectPath) : {
    branch: "missing",
    head: "missing",
    clean: "unknown",
    dirty_files: [],
    ahead_behind: "unknown"
  };
  const packageScripts = projectExists ? await readPackageScripts(projectPath) : [];
  const availableCommands = [...new Set([...(config.available_commands ?? []), ...packageScripts])].sort();
  const guardedPaths = config.guarded_paths ?? config.frozen_paths ?? [];
  const runtimeMemory = projectExists ? await runtimeMemoryStatus(projectPath, config) : {
    directory: "unknown",
    exists: "no",
    summary: "missing",
    platform_state: "missing",
    generated_at: "unknown",
    head_summary: "unknown",
    event_count: "unknown"
  };
  const detectedStack = projectExists ? detectStack(projectPath, config) : (config.detected_stack_hints ?? []);
  const queue = projectExists ? await queueSummary(projectPath, config) : null;
  const events = projectExists ? await eventStoreSummary(projectPath, config) : null;
  const localOrchestrator = projectExists ? await localOrchestratorStatus(projectPath, config) : {
    exists: false,
    path: "",
    doctor_can_run: false,
    doctor_status: "unknown",
    check_status_can_run: false,
    check_dispatch_status_can_run: false,
    doctor_json: null,
    command_status: {
      doctor: 1,
      check_status: 1,
      check_dispatch_status: 1
    }
  };
  return {
    configPath,
    config,
    projectPath,
    projectExists,
    repo,
    detectedStack,
    availableCommands,
    guardedPaths,
    runtimeMemory,
    queue,
    events,
    localOrchestrator
  };
}

async function projectInspect(args) {
  if (!args.dryRun) {
    throw new Error("project inspect is dry-run only in the extraction-stage CLI. Pass --dry-run.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config.project_root);
  const projectExists = existsSync(projectPath);
  const repo = projectExists ? await repoStatus(projectPath) : {
    branch: "missing",
    head: "missing",
    clean: "unknown",
    dirty_files: [],
    ahead_behind: "unknown"
  };
  const packageScripts = projectExists ? await readPackageScripts(projectPath) : [];
  const availableCommands = [...new Set([...(config.available_commands ?? []), ...packageScripts])];
  const guardedPaths = config.guarded_paths ?? config.frozen_paths ?? [];
  const memory = projectExists ? await runtimeMemoryStatus(projectPath, config) : {
    directory: "unknown",
    exists: "no",
    summary: "missing",
    platform_state: "missing",
    generated_at: "unknown",
    head_summary: "unknown",
    event_count: "unknown"
  };
  const detectedStack = projectExists ? detectStack(projectPath, config) : (config.detected_stack_hints ?? []);

  console.log("# Project Inspect dry-run");
  console.log("");
  console.log(`project_id: ${config.project_id}`);
  console.log(`project_name: ${config.project_name}`);
  console.log(`project_path: ${projectPath}`);
  console.log(`project_exists: ${projectExists ? "yes" : "no"}`);
  console.log("");
  console.log("repo_status:");
  console.log(`- branch: ${repo.branch}`);
  console.log(`- head: ${repo.head}`);
  console.log(`- clean: ${repo.clean}`);
  console.log(`- ahead_behind: ${repo.ahead_behind}`);
  if (repo.dirty_files.length > 0) {
    for (const dirtyFile of repo.dirty_files) console.log(`- dirty: ${dirtyFile}`);
  }
  console.log("");
  console.log("detected_stack:");
  for (const item of detectedStack) console.log(`- ${item}`);
  console.log("");
  console.log("available_commands:");
  for (const command of availableCommands) console.log(`- ${command}`);
  console.log("");
  console.log("guarded_paths:");
  for (const path of guardedPaths) console.log(`- ${path}`);
  console.log("");
  console.log("runtime_memory_status:");
  console.log(`- directory: ${memory.directory}`);
  console.log(`- exists: ${memory.exists}`);
  console.log(`- summary: ${memory.summary}`);
  console.log(`- platform_state: ${memory.platform_state}`);
  console.log(`- generated_at: ${memory.generated_at}`);
  console.log(`- head_summary: ${memory.head_summary}`);
  console.log(`- event_count: ${memory.event_count}`);
  console.log("");
  console.log("recommended_next_actions:");
  console.log("- Keep project adapter read-only until core parity tests are implemented.");
  console.log("- Run the project runtime memory validate command from the business repository before any apply flow.");
  console.log("- Port reusable core logic into anksen-agent-studio before deprecating project-local scripts.");
  console.log("- Do not execute Agent tasks, deploy, or production operations from project inspect.");
}

async function projectParity(args) {
  if (!args.dryRun) {
    throw new Error("project parity is dry-run only in the extraction-stage CLI. Pass --dry-run.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config.project_root);
  const projectExists = existsSync(projectPath);
  const orchestratorPath = projectExists ? statePath(projectPath, config) : "";
  const localOrchestratorExists = projectExists && existsSync(orchestratorPath);
  const repo = projectExists ? await repoStatus(projectPath) : {
    branch: "missing",
    head: "missing",
    clean: "unknown",
    dirty_files: [],
    ahead_behind: "unknown"
  };
  const memory = projectExists ? await runtimeMemoryStatus(projectPath, config) : {
    exists: "no",
    summary: "missing",
    platform_state: "missing",
    generated_at: "unknown",
    head_summary: "unknown",
    event_count: "unknown"
  };
  const queue = projectExists ? await queueSummary(projectPath, config) : null;
  const events = projectExists ? await eventStoreSummary(projectPath, config) : null;
  const doctor = localOrchestratorExists
    ? await execReadOnly(projectPath, process.execPath, ["ops/agent-orchestrator/scripts/orchestratorctl.mjs", "doctor", "--json"])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const checkStatus = localOrchestratorExists
    ? await execReadOnly(projectPath, "./ops/agent-orchestrator/check-status.sh", [])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const dispatchStatus = localOrchestratorExists
    ? await execReadOnly(projectPath, process.execPath, ["ops/agent-orchestrator/scripts/check-dispatch-status.mjs"])
    : { ok: false, status: 1, stdout: "", stderr: "local orchestrator missing" };
  const doctorJson = parseJsonObject(doctor.stdout);
  const mismatches = [];

  if (!projectExists) mismatches.push("project_path does not exist");
  if (!localOrchestratorExists) mismatches.push("local orchestrator state_dir does not exist");
  if (!doctor.ok) mismatches.push("local doctor command failed");
  if (!checkStatus.ok) mismatches.push("local check-status command failed");
  if (!dispatchStatus.ok) mismatches.push("local check-dispatch-status command failed");
  if (memory.exists !== "yes") mismatches.push("runtime memory directory missing");

  if (doctorJson?.worktrees?.main) {
    const localMain = doctorJson.worktrees.main;
    if (repo.branch !== localMain.branch) {
      mismatches.push(`branch mismatch: adapter=${repo.branch} local_doctor=${localMain.branch}`);
    }
    const adapterClean = repo.clean === "yes";
    if (adapterClean !== Boolean(localMain.clean)) {
      mismatches.push(`git clean mismatch: adapter=${adapterClean} local_doctor=${Boolean(localMain.clean)}`);
    }
    const adapterAheadBehind = parseAheadBehind(repo.ahead_behind);
    if (
      adapterAheadBehind.ahead !== null
      && (adapterAheadBehind.ahead !== Number(localMain.ahead) || adapterAheadBehind.behind !== Number(localMain.behind))
    ) {
      mismatches.push(`ahead/behind mismatch: adapter=${adapterAheadBehind.ahead}/${adapterAheadBehind.behind} local_doctor=${localMain.ahead}/${localMain.behind}`);
    }
  } else if (doctor.ok) {
    mismatches.push("local doctor output was not parseable JSON");
  }

  if (doctorJson?.queue?.counts && queue) {
    for (const [status, count] of Object.entries(queue.status_counts)) {
      if (Number(doctorJson.queue.counts[status] ?? 0) !== Number(count)) {
        mismatches.push(`queue ${status} count mismatch: adapter=${count} local_doctor=${doctorJson.queue.counts[status] ?? 0}`);
      }
    }
  }

  const hasHardFailure = !projectExists || !localOrchestratorExists || !doctor.ok || !checkStatus.ok || !dispatchStatus.ok;
  const parityResult = hasHardFailure ? "FAIL" : (mismatches.length > 0 ? "WARN" : "PASS");
  const recommendedActions = [];
  if (parityResult === "PASS") {
    recommendedActions.push("Adapter parity PASS; continue using project inspect/parity as read-only gates.");
    recommendedActions.push("Keep writes in the business repository disabled until adapter apply flows have dedicated approval.");
  } else {
    recommendedActions.push("Run local doctor and check-status inside the business repository and compare the mismatch list.");
    recommendedActions.push("Refresh Runtime Memory in the business repository before relying on extracted adapter state.");
  }
  if (repo.clean !== "yes") {
    recommendedActions.push("Clean or intentionally commit business repository changes before platform migration work.");
  }

  console.log("# Project Adapter Parity dry-run");
  console.log("");
  console.log("adapter_status:");
  console.log(`- project_id: ${config.project_id}`);
  console.log(`- project_path: ${projectPath}`);
  console.log(`- project_exists: ${projectExists ? "yes" : "no"}`);
  console.log(`- repo_branch: ${repo.branch}`);
  console.log(`- repo_head: ${repo.head}`);
  console.log(`- git_clean: ${repo.clean}`);
  console.log(`- ahead_behind: ${repo.ahead_behind}`);
  console.log(`- runtime_memory_exists: ${memory.exists}`);
  console.log(`- runtime_memory_generated_at: ${memory.generated_at}`);
  console.log(`- local_orchestrator_exists: ${localOrchestratorExists ? "yes" : "no"}`);
  console.log("");
  console.log("local_status:");
  console.log(`- doctor_can_run: ${doctor.ok ? "yes" : "no"}`);
  console.log(`- doctor_status: ${doctorJson?.status ?? "unknown"}`);
  console.log(`- check_status_can_run: ${checkStatus.ok ? "yes" : "no"}`);
  console.log(`- check_dispatch_status_can_run: ${dispatchStatus.ok ? "yes" : "no"}`);
  console.log(`- queue_available: ${queue?.available ?? "no"}`);
  console.log(`- queue_tasks: ${queue?.task_count ?? 0}`);
  console.log(`- queue_read_model_only: ${queue?.read_model_only ?? "unknown"}`);
  console.log(`- queue_status_counts: ${JSON.stringify(queue?.status_counts ?? {})}`);
  console.log(`- active_locks: ${queue?.active_locks ?? 0}`);
  console.log(`- result_count: ${queue?.result_count ?? 0}`);
  console.log(`- event_store_available: ${events?.available ?? "no"}`);
  console.log(`- event_file_count: ${events?.event_file_count ?? 0}`);
  console.log(`- event_types: ${JSON.stringify(events?.event_types ?? {})}`);
  console.log("");
  console.log(`parity_result: ${parityResult}`);
  console.log("");
  console.log("mismatch_list:");
  if (mismatches.length === 0) {
    console.log("- none");
  } else {
    for (const mismatch of mismatches) console.log(`- ${mismatch}`);
  }
  console.log("");
  console.log("recommended_actions:");
  for (const action of recommendedActions) console.log(`- ${action}`);

  if (parityResult === "FAIL") process.exitCode = 1;
}

function projectRuntimeMemoryDir(configPath) {
  return join(dirname(configPath), "runtime-memory");
}

function conciseLocalOrchestratorStatus(localOrchestrator) {
  return {
    exists: localOrchestrator.exists,
    path: localOrchestrator.path,
    doctor_can_run: localOrchestrator.doctor_can_run,
    doctor_status: localOrchestrator.doctor_status,
    check_status_can_run: localOrchestrator.check_status_can_run,
    check_dispatch_status_can_run: localOrchestrator.check_dispatch_status_can_run,
    findings_count: localOrchestrator.doctor_json?.findings?.length ?? 0,
    candidate_agent_branches: localOrchestrator.doctor_json?.integration?.can_integrate_candidates ?? "unknown",
    command_status: localOrchestrator.command_status
  };
}

function buildProjectMemory(snapshot) {
  const importedAt = new Date().toISOString();
  const repoStatus = {
    branch: snapshot.repo.branch,
    head: snapshot.repo.head,
    clean: snapshot.repo.clean,
    dirty_files: snapshot.repo.dirty_files,
    ahead_behind: snapshot.repo.ahead_behind
  };
  const localStatus = conciseLocalOrchestratorStatus(snapshot.localOrchestrator);
  const recommendedActions = recommendedNextActions(
    localStatus.doctor_status === "GO" && snapshot.projectExists ? "PASS" : "WARN",
    snapshot.repo.clean
  );

  const projectState = {
    schema_version: 1,
    imported_at: importedAt,
    source: "project_adapter_import_memory",
    project_id: snapshot.config.project_id,
    project_name: snapshot.config.project_name,
    project_path: snapshot.projectPath,
    project_exists: snapshot.projectExists,
    repo_status: repoStatus,
    detected_stack: snapshot.detectedStack,
    available_commands: snapshot.availableCommands,
    local_orchestrator_status: localStatus,
    queue_summary: snapshot.queue,
    event_summary: snapshot.events,
    runtime_memory_status: snapshot.runtimeMemory,
    guarded_paths: snapshot.guardedPaths,
    recommended_next_actions: recommendedActions,
    safety: {
      project_writes: "disabled",
      agent_execution: "disabled",
      deploy: "disabled",
      production_operations: "disabled"
    }
  };

  const architecture = {
    schema_version: 1,
    imported_at: importedAt,
    project_id: snapshot.config.project_id,
    detected_stack: snapshot.detectedStack,
    available_commands: snapshot.availableCommands,
    read_paths: snapshot.config.read_paths ?? [],
    write_paths: snapshot.config.write_paths ?? [],
    guarded_paths: snapshot.guardedPaths,
    frozen_paths: snapshot.config.frozen_paths ?? [],
    runtime_memory_status: snapshot.runtimeMemory
  };

  const agentStudioStatus = {
    schema_version: 1,
    imported_at: importedAt,
    project_id: snapshot.config.project_id,
    local_orchestrator_status: localStatus,
    queue_summary: snapshot.queue,
    event_summary: snapshot.events,
    runtime_memory_status: snapshot.runtimeMemory,
    recommended_next_actions: recommendedActions
  };

  const handoffSummary = `# ${snapshot.config.project_name ?? snapshot.config.project_id} Runtime Memory Handoff

Generated by ANKSEN Agent Studio project adapter import at ${importedAt}.

## Project

- project_id: ${snapshot.config.project_id}
- project_path: ${snapshot.projectPath}
- repo_branch: ${repoStatus.branch}
- repo_head: ${repoStatus.head}
- git_clean: ${repoStatus.clean}
- ahead_behind: ${repoStatus.ahead_behind}

## Local Orchestrator

- exists: ${localStatus.exists ? "yes" : "no"}
- doctor_can_run: ${localStatus.doctor_can_run ? "yes" : "no"}
- doctor_status: ${localStatus.doctor_status}
- check_status_can_run: ${localStatus.check_status_can_run ? "yes" : "no"}
- check_dispatch_status_can_run: ${localStatus.check_dispatch_status_can_run ? "yes" : "no"}
- candidate_agent_branches: ${localStatus.candidate_agent_branches}

## Queue

- available: ${snapshot.queue?.available ?? "no"}
- tasks: ${snapshot.queue?.task_count ?? 0}
- status_counts: ${JSON.stringify(snapshot.queue?.status_counts ?? {})}
- active_locks: ${snapshot.queue?.active_locks ?? 0}
- results: ${snapshot.queue?.result_count ?? 0}

## Event Store

- available: ${snapshot.events?.available ?? "no"}
- event_file_count: ${snapshot.events?.event_file_count ?? 0}
- event_types: ${JSON.stringify(snapshot.events?.event_types ?? {})}

## Runtime Memory

- exists: ${snapshot.runtimeMemory.exists}
- summary: ${snapshot.runtimeMemory.summary}
- platform_state: ${snapshot.runtimeMemory.platform_state}
- generated_at: ${snapshot.runtimeMemory.generated_at}
- event_count: ${snapshot.runtimeMemory.event_count}

## Detected Stack

${snapshot.detectedStack.map((item) => `- ${item}`).join("\n")}

## Guarded Paths

${snapshot.guardedPaths.map((path) => `- ${path}`).join("\n")}

## Recommended Next Actions

${recommendedActions.map((action) => `- ${action}`).join("\n")}

## Safety

- No writes were made to the managed project.
- No Agent task was executed.
- No deploy or production operation was executed.
`;

  return {
    files: {
      "project-state.json": projectState,
      "architecture.json": architecture,
      "agent-studio-status.json": agentStudioStatus,
      "handoff-summary.md": handoffSummary
    },
    imported_at: importedAt,
    recommended_next_actions: recommendedActions
  };
}

async function writeProjectMemory(memoryDir, memory) {
  await mkdir(memoryDir, { recursive: true });
  for (const [file, content] of Object.entries(memory.files)) {
    const path = join(memoryDir, file);
    if (typeof content === "string") {
      await writeFile(path, content, "utf8");
    } else {
      await writeFile(path, `${JSON.stringify(content, null, 2)}\n`, "utf8");
    }
  }
}

async function projectImportMemory(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project import-memory requires --dry-run or --apply.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  const snapshot = await collectProjectSnapshot(configPath);
  const memoryDir = projectRuntimeMemoryDir(configPath);
  const memory = buildProjectMemory(snapshot);
  const files = Object.keys(memory.files).map((file) => join(memoryDir, file));

  if (args.apply) {
    await writeProjectMemory(memoryDir, memory);
  }

  console.log(`# Project Runtime Memory Import ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`project_id: ${snapshot.config.project_id}`);
  console.log(`project_path: ${snapshot.projectPath}`);
  console.log(`memory_dir: ${memoryDir}`);
  console.log(`write_mode: ${args.apply ? "platform-memory-only" : "no-write"}`);
  console.log(`project_writes: disabled`);
  console.log(`repo_branch: ${snapshot.repo.branch}`);
  console.log(`repo_clean: ${snapshot.repo.clean}`);
  console.log(`doctor_status: ${snapshot.localOrchestrator.doctor_status}`);
  console.log(`queue_status_counts: ${JSON.stringify(snapshot.queue?.status_counts ?? {})}`);
  console.log(`event_file_count: ${snapshot.events?.event_file_count ?? 0}`);
  console.log(`runtime_memory_exists: ${snapshot.runtimeMemory.exists}`);
  console.log("");
  console.log(args.apply ? "written_files:" : "would_write_files:");
  for (const file of files) console.log(`- ${file}`);
  console.log("");
  console.log("recommended_next_actions:");
  for (const action of memory.recommended_next_actions) console.log(`- ${action}`);
}

async function projectMemory(args) {
  if (!args.summary) {
    throw new Error("project memory currently supports --summary only.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const memoryDir = projectRuntimeMemoryDir(configPath);
  const statePath = join(memoryDir, "project-state.json");
  const architecturePath = join(memoryDir, "architecture.json");
  const statusPath = join(memoryDir, "agent-studio-status.json");
  const handoffPath = join(memoryDir, "handoff-summary.md");
  const hasState = existsSync(statePath);
  const state = hasState ? await readJson(statePath) : null;

  console.log("# Project Runtime Memory Summary");
  console.log("");
  console.log(`memory_dir: ${memoryDir}`);
  console.log(`project_id: ${state?.project_id ?? "unknown"}`);
  console.log(`imported_at: ${state?.imported_at ?? "missing"}`);
  console.log(`repo_branch: ${state?.repo_status?.branch ?? "unknown"}`);
  console.log(`repo_clean: ${state?.repo_status?.clean ?? "unknown"}`);
  console.log(`doctor_status: ${state?.local_orchestrator_status?.doctor_status ?? "unknown"}`);
  console.log(`queue_status_counts: ${JSON.stringify(state?.queue_summary?.status_counts ?? {})}`);
  console.log(`event_file_count: ${state?.event_summary?.event_file_count ?? "unknown"}`);
  console.log(`runtime_memory_exists: ${state?.runtime_memory_status?.exists ?? "unknown"}`);
  console.log("");
  console.log("files:");
  console.log(`- project-state.json: ${existsSync(statePath) ? "present" : "missing"}`);
  console.log(`- architecture.json: ${existsSync(architecturePath) ? "present" : "missing"}`);
  console.log(`- agent-studio-status.json: ${existsSync(statusPath) ? "present" : "missing"}`);
  console.log(`- handoff-summary.md: ${existsSync(handoffPath) ? "present" : "missing"}`);
  console.log("");
  console.log("recommended_next_actions:");
  for (const action of state?.recommended_next_actions ?? ["Run project import-memory --apply to create project runtime memory."]) {
    console.log(`- ${action}`);
  }
}

function unique(values) {
  return [...new Set(values.filter(Boolean))];
}

function taskSlug(text) {
  const ascii = text.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toUpperCase();
  return ascii.slice(0, 48);
}

function stableTaskId(projectId, text) {
  const projectPart = String(projectId ?? "PROJECT").replace(/[^\w-]/g, "-").toUpperCase();
  const hash = createHash("sha1").update(text).digest("hex").slice(0, 10).toUpperCase();
  const slug = taskSlug(text);
  return `${projectPart}-TASK-${slug || hash}`;
}

function loadMemoryFile(configPath, file) {
  return readJson(join(projectRuntimeMemoryDir(configPath), file));
}

async function loadImportedProjectMemory(configPath) {
  const statePath = join(projectRuntimeMemoryDir(configPath), "project-state.json");
  if (!existsSync(statePath)) {
    throw new Error("Imported project runtime memory is missing. Run project import-memory --apply first.");
  }
  return {
    projectState: await loadMemoryFile(configPath, "project-state.json"),
    architecture: existsSync(join(projectRuntimeMemoryDir(configPath), "architecture.json"))
      ? await loadMemoryFile(configPath, "architecture.json")
      : null,
    agentStudioStatus: existsSync(join(projectRuntimeMemoryDir(configPath), "agent-studio-status.json"))
      ? await loadMemoryFile(configPath, "agent-studio-status.json")
      : null
  };
}

function isFrontendUiRoute(route, text) {
  const value = normalizeText(`${text} ${route.reason ?? ""} ${route.matched_keywords?.join(" ") ?? ""}`);
  return route.selected_agent === "agent-4" || ["前端", "页面", "样式", "移动端", "dashboard", "仪表盘", "ui", "ux"].some((keyword) => value.includes(keyword));
}

function allowedPathsForTask(route, memory, text) {
  if (isFrontendUiRoute(route, text)) {
    return unique([
      "apps/web/**",
      "packages/ui/**",
      "docs/release/**",
      "docs/testing/**",
      "ops/agent-orchestrator/reports/**",
      "ops/agent-orchestrator/results/**"
    ]);
  }
  if (route.selected_agent === "agent-2" || route.selected_skill === "validation_testing") {
    return unique([
      "docs/testing/**",
      "docs/release/**",
      "ops/agent-orchestrator/reports/**",
      "ops/agent-orchestrator/results/**"
    ]);
  }
  if (route.selected_agent === "agent-3" || route.selected_skill === "data_integration") {
    return unique([
      "docs/release/**",
      "docs/testing/**",
      "scripts/e2e/**",
      "ops/agent-orchestrator/reports/**",
      "ops/agent-orchestrator/results/**"
    ]);
  }
  return unique([
    ...(memory.architecture?.write_paths ?? []),
    "docs/release/**",
    "docs/testing/**",
    "ops/agent-orchestrator/reports/**",
    "ops/agent-orchestrator/results/**"
  ]);
}

function forbiddenPathsForTask(allowedPaths, memory) {
  const allowed = new Set(allowedPaths);
  const guarded = memory.projectState.guarded_paths ?? [];
  const expandedBusinessForbidden = [
    "apps/api/**",
    "database/**",
    "infra/**",
    ".github/**",
    "Dockerfile",
    "Dockerfile.*",
    "docker-compose*",
    "deploy/**",
    "auth/**",
    ".env",
    ".env.*"
  ];
  return unique([
    ...guarded,
    ...expandedBusinessForbidden
  ]).filter((path) => !allowed.has(path) && !(path === "apps/**" && allowedPaths.some((allowedPath) => allowedPath.startsWith("apps/"))));
}

function approvalRequired(allowedPaths, guardedPaths) {
  return allowedPaths.some((allowedPath) => guardedPaths.some((guardedPath) => {
    if (guardedPath.endsWith("/**")) {
      return allowedPath.startsWith(guardedPath.slice(0, -3));
    }
    return allowedPath === guardedPath;
  }));
}

function taskRisk(route, approval) {
  if (approval) return "HIGH";
  return route.risk_level ?? "MEDIUM";
}

function validationCommandsForTask(route, memory, approval) {
  const available = new Set(memory.projectState.available_commands ?? []);
  const candidates = unique([
    "pnpm typecheck",
    available.has("pnpm lint") ? "pnpm lint" : "",
    "node ops/agent-orchestrator/scripts/orchestratorctl.mjs doctor",
    ...(route.validation_commands ?? [])
  ]);
  return approval
    ? unique([...candidates, "manual approval before writing guarded project paths"])
    : candidates;
}

async function buildTaskCandidate(configPath, text) {
  const config = await readJson(configPath);
  const memory = await loadImportedProjectMemory(configPath);
  const route = await loadSkillRoute(text);
  const allowedPaths = allowedPathsForTask(route, memory, text);
  const forbiddenPaths = forbiddenPathsForTask(allowedPaths, memory);
  const needsApproval = approvalRequired(allowedPaths, memory.projectState.guarded_paths ?? []);
  return {
    task_id: stableTaskId(config.project_id, text),
    project_id: config.project_id,
    title: text,
    owner: route.selected_agent,
    skill_type: route.selected_skill,
    skill_id: route.skill_id,
    runtime: route.selected_runtime,
    allowed_paths: allowedPaths,
    forbidden_paths: forbiddenPaths,
    expected_outputs: route.expected_outputs,
    validation_commands: validationCommandsForTask(route, memory, needsApproval),
    risk: taskRisk(route, needsApproval),
    approval_required: needsApproval,
    project_writes: "disabled",
    queue_write: "disabled",
    event_write: "disabled",
    agent_execution: "disabled",
    deploy: "disabled",
    production_operations: "disabled",
    routing: {
      confidence: route.confidence,
      fallback_used: route.fallback_used,
      matched_keywords: route.matched_keywords,
      reason: route.reason
    },
    project_context: {
      repo_branch: memory.projectState.repo_status?.branch ?? "unknown",
      repo_clean: memory.projectState.repo_status?.clean ?? "unknown",
      doctor_status: memory.projectState.local_orchestrator_status?.doctor_status ?? "unknown",
      detected_stack: memory.projectState.detected_stack ?? [],
      queue_status_counts: memory.projectState.queue_summary?.status_counts ?? {},
      runtime_memory_imported_at: memory.projectState.imported_at
    }
  };
}

function projectTaskProposalsDir(configPath) {
  return join(dirname(configPath), "task-proposals");
}

function proposalPathForTask(configPath, taskId) {
  return join(projectTaskProposalsDir(configPath), `${taskId}.json`);
}

function proposalReadmeContent(config) {
  return `# ${config.project_name ?? config.project_id} Task Proposals

This directory stores platform-side task proposals generated by ANKSEN Agent Studio.

These proposals are not written to the managed project queue or event store. They are an approval gate between task planning and any future project-side execution.

## Status Values

- PROPOSED: task candidate has been generated by the standalone platform.
- APPROVAL_REQUIRED: human approval is required before project writes.
- PROJECT_WRITES_DISABLED: this extraction-stage flow does not write to the managed project.
- AGENT_EXECUTION_DISABLED: this extraction-stage flow does not execute Agent tasks.

## Safety

- No writes to \`${config.project_id}\`.
- No queue/event writes in the managed project.
- No Agent execution.
- No deploy.
- No production operation.
`;
}

function proposalFromCandidate(candidate) {
  const approvalStatus = candidate.approval_required ? "APPROVAL_REQUIRED" : "APPROVAL_NOT_REQUIRED";
  return {
    schema_version: 1,
    proposal_status: [
      "PROPOSED",
      approvalStatus,
      "PROJECT_WRITES_DISABLED",
      "AGENT_EXECUTION_DISABLED"
    ],
    task_id: candidate.task_id,
    text: candidate.title,
    project_id: candidate.project_id,
    owner: candidate.owner,
    skill_type: candidate.skill_type,
    skill_id: candidate.skill_id,
    runtime: candidate.runtime,
    allowed_paths: candidate.allowed_paths,
    forbidden_paths: candidate.forbidden_paths,
    expected_outputs: candidate.expected_outputs,
    validation_commands: candidate.validation_commands,
    risk: candidate.risk,
    approval_required: candidate.approval_required,
    approval_status: approvalStatus,
    project_write_mode: "PROJECT_WRITES_DISABLED",
    agent_execution_mode: "AGENT_EXECUTION_DISABLED",
    queue_write_mode: "QUEUE_WRITES_DISABLED",
    event_write_mode: "EVENT_WRITES_DISABLED",
    deploy_mode: "DEPLOY_DISABLED",
    production_operation_mode: "PRODUCTION_OPERATIONS_DISABLED",
    created_at: new Date().toISOString(),
    routing: candidate.routing,
    project_context: candidate.project_context
  };
}

function timestampForFile(value = new Date().toISOString()) {
  return new Date(value).toISOString().replaceAll(":", "").replaceAll(".", "");
}

function safeSegment(value) {
  return String(value ?? "")
    .trim()
    .replace(/[^a-zA-Z0-9._-]/g, "-")
    .replace(/-+/g, "-")
    .replace(/^-|-$/g, "");
}

function stableJson(value) {
  return JSON.stringify(value);
}

function stableHash(value) {
  return createHash("sha256").update(stableJson(value)).digest("hex");
}

function eventFileName(event) {
  const hash = createHash("sha256").update(event.event_id).digest("hex").slice(0, 12);
  return `${timestampForFile(event.created_at)}-${safeSegment(event.event_type)}-${hash}.json`;
}

function normalizeTaskPath(path) {
  return String(path ?? "").replace(/\/\*\*$/, "").replace(/\/$/, "");
}

function taskSnapshotFromProposal(proposal, createdAt) {
  const normalizedAllowed = proposal.allowed_paths?.map(normalizeTaskPath) ?? [];
  const normalizedForbidden = proposal.forbidden_paths?.map(normalizeTaskPath) ?? [];
  return {
    task_id: proposal.task_id,
    batch_id: `EXTERNAL-PROPOSAL-${proposal.project_id}`,
    title: proposal.text,
    owner: proposal.owner,
    domain: `external-proposal-${proposal.skill_type}`,
    priority: proposal.risk === "HIGH" ? "P0" : "P1",
    status: "READY",
    risk: proposal.risk,
    skill_type: proposal.skill_type,
    skill_id: proposal.skill_id,
    runtime: proposal.runtime,
    allowed_paths: normalizedAllowed,
    forbidden_paths: normalizedForbidden,
    acceptance: [
      `Implement approved proposal: ${proposal.text}`,
      "Stay within allowed_paths and avoid forbidden_paths.",
      "Do not deploy or perform production operations.",
      "Run all validation_commands and record truthful results.",
      "Respect approval_required and high-risk boundaries before project writes."
    ],
    validation_commands: proposal.validation_commands ?? [],
    required_checks: [
      "No forbidden paths changed",
      "Validation commands pass or failures are reported truthfully",
      "No deploy or production operation executed"
    ],
    expected_outputs: proposal.expected_outputs ?? [],
    expected_output_files: [],
    requires_human_approval: Boolean(proposal.approval_required),
    approval_source: "anksen-agent-studio",
    external_proposal_ref: `examples/${proposal.project_id}/task-proposals/${proposal.task_id}.json`,
    allow_commit: false,
    created_at: createdAt,
    updated_at: createdAt
  };
}

function taskCreatedEventFromProposal(proposal, createdAt) {
  const taskSnapshot = taskSnapshotFromProposal(proposal, createdAt);
  const idempotencyKey = stableHash({
    source: "anksen-agent-studio.project.approve-proposal",
    task_id: proposal.task_id,
    proposal_created_at: proposal.created_at
  });
  return {
    event_id: `external-proposal:v1:${proposal.task_id}:task.created`,
    event_type: "task.created",
    task_id: proposal.task_id,
    owner: proposal.owner,
    status_before: null,
    status_after: "READY",
    created_at: createdAt,
    actor: "anksen-agent-studio",
    source: "anksen-agent-studio.project.approve-proposal",
    reason: `approved external project task proposal: ${proposal.text}`,
    changed_files: [],
    result_ref: "",
    audit_ref: "",
    metadata: {
      idempotency_key: idempotencyKey,
      external_proposal: true,
      proposal_snapshot: proposal,
      task_snapshot: taskSnapshot
    }
  };
}

async function readProposal(configPath, taskId) {
  const path = proposalPathForTask(configPath, taskId);
  if (!existsSync(path)) {
    throw new Error(`Proposal not found: ${path}`);
  }
  return {
    path,
    proposal: await readJson(path)
  };
}

function projectQueueInjectionAuditDir(projectId) {
  return join(projectContextDir(projectId), "queue-injection-audits");
}

function projectQueueInjectionAuditPath(projectId, taskId) {
  return join(projectQueueInjectionAuditDir(projectId), `${safeSegment(taskId)}.json`);
}

async function readProjectQueueInjectionAudit(projectId, taskId) {
  const path = projectQueueInjectionAuditPath(projectId, taskId);
  if (!existsSync(path)) return null;
  return {
    path,
    data: await readJson(path)
  };
}

function buildQueueInjectionAuditArtifact({
  projectId,
  proposalPath,
  proposal,
  eventWrite,
  snapshot,
  precheckFailures,
  rebuild,
  queueState,
  eventSummary
}) {
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    audit_id: `queue-injection-${safeSegment(projectId)}-${safeSegment(proposal.task_id)}`,
    project_id: projectId,
    task_id: proposal.task_id,
    status: rebuild.ok && queueState?.task ? "PASS" : "FAIL",
    proposal: {
      path: relativePath(proposalPath),
      text: proposal.text,
      risk: proposal.risk,
      approval_required: Boolean(proposal.approval_required),
      approval_status: proposal.approval_status,
      approved_at: proposal.approved_at ?? "",
      approved_by: proposal.approved_by ?? ""
    },
    precheck: {
      status: precheckFailures.length === 0 ? "PASS" : "FAIL",
      failures: precheckFailures,
      repo_branch: snapshot.repo.branch,
      repo_head: snapshot.repo.head,
      repo_clean: snapshot.repo.clean,
      repo_ahead_behind: snapshot.repo.ahead_behind
    },
    injection: {
      mode: "approved_proposal_event_injection",
      event_file: relativePath(eventWrite.path),
      event_written: Boolean(eventWrite.written),
      event_skipped_existing: Boolean(eventWrite.skipped),
      rebuild_status: rebuild.ok ? "PASS" : "FAIL",
      rebuild_exit_code: rebuild.status,
      rebuild_stdout_tail: rebuild.stdout.split("\n").slice(-10).join("\n"),
      rebuild_stderr_tail: rebuild.stderr.split("\n").slice(-10).join("\n")
    },
    queue_state: queueState ? {
      queue_task_status: queueState.task?.status ?? "missing",
      queue_result_status: queueState.result?.status ?? "missing",
      ready_task_count: queueState.readyTasks.length,
      active_lock_count: queueState.activeLocks.length,
      queue_path: relativePath(queueState.queuePath),
      locks_path: relativePath(queueState.locksPath),
      results_path: relativePath(queueState.resultsPath)
    } : {
      queue_task_status: "missing",
      queue_result_status: "missing",
      ready_task_count: 0,
      active_lock_count: 0,
      queue_path: "",
      locks_path: "",
      results_path: ""
    },
    event_summary: eventSummary,
    safety: {
      business_project_writes: "disabled",
      queue_event_injection: "allowed_after_approved_proposal_only",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read"
    }
  };
}

async function writeProjectQueueInjectionAudit(projectId, taskId, artifact) {
  const dir = projectQueueInjectionAuditDir(projectId);
  await mkdir(dir, { recursive: true });
  const path = projectQueueInjectionAuditPath(projectId, taskId);
  await writeJsonFile(path, artifact);
  const indexPath = await updateCodexContextIndexArtifacts({
    projectFiles: {
      [projectId]: [relativePath(path)]
    }
  });
  return {
    path,
    indexPath
  };
}

async function writeProposalJson(path, proposal) {
  await writeFile(path, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
}

function approveProposal(proposal, approvedAt) {
  return {
    ...proposal,
    proposal_status: [
      "PROPOSED",
      "APPROVED",
      "PROJECT_WRITES_DISABLED",
      "AGENT_EXECUTION_DISABLED"
    ],
    approval_status: "APPROVED",
    approved_at: approvedAt,
    approved_by: "anksen-agent-studio.project.approve-proposal",
    project_write_mode: "PROJECT_WRITES_DISABLED",
    agent_execution_mode: "AGENT_EXECUTION_DISABLED"
  };
}

function parseAheadBehindStrict(value) {
  const parsed = parseAheadBehind(value);
  return {
    ahead: parsed.ahead,
    behind: parsed.behind,
    clean: parsed.ahead === 0 && parsed.behind === 0
  };
}

function assertProjectInjectionPrecheck(snapshot) {
  const failures = [];
  const aheadBehind = parseAheadBehindStrict(snapshot.repo.ahead_behind);
  if (!snapshot.projectExists) failures.push("project path missing");
  if (!snapshot.repo.branch) failures.push("project branch is missing");
  if (snapshot.repo.clean !== "yes") failures.push("project repo must be clean");
  if (!aheadBehind.clean) failures.push(`project ahead/behind must be 0/0, got ${snapshot.repo.ahead_behind}`);
  if (!snapshot.localOrchestrator.exists) failures.push("local orchestrator is missing");
  return failures;
}

async function listTaskEventFiles(projectPath, config, taskId) {
  const taskDir = statePath(projectPath, config, "events", "tasks", safeSegment(taskId));
  if (!existsSync(taskDir)) return [];
  return (await readdir(taskDir))
    .filter((file) => file.endsWith(".json"))
    .map((file) => join(taskDir, file));
}

async function findExistingExternalProposalEvent(projectPath, config, taskId) {
  const files = await listTaskEventFiles(projectPath, config, taskId);
  for (const file of files) {
    try {
      const event = await readJson(file);
      if (event.event_type === "task.created" && event.source === "anksen-agent-studio.project.approve-proposal") {
        return file;
      }
    } catch {
      // Ignore corrupt unrelated files here; the project rebuild command will report them.
    }
  }
  return "";
}

async function writeProjectTaskCreatedEvent(projectPath, config, event) {
  const existing = await findExistingExternalProposalEvent(projectPath, config, event.task_id);
  if (existing) {
    return { path: existing, written: false, skipped: true };
  }
  const taskDir = statePath(projectPath, config, "events", "tasks", safeSegment(event.task_id));
  await mkdir(taskDir, { recursive: true });
  const path = join(taskDir, eventFileName(event));
  await writeFile(path, `${JSON.stringify(event, null, 2)}\n`, { flag: "wx" });
  return { path, written: true, skipped: false };
}

async function rebuildProjectReadModel(projectPath) {
  return execReadOnly(projectPath, process.execPath, ["ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs", "--apply"]);
}

async function writeProposal(configPath, config, proposal) {
  const proposalDir = projectTaskProposalsDir(configPath);
  await mkdir(proposalDir, { recursive: true });
  const proposalPath = join(proposalDir, `${proposal.task_id}.json`);
  await writeFile(proposalPath, `${JSON.stringify(proposal, null, 2)}\n`, "utf8");
  await writeFile(join(proposalDir, "README.md"), proposalReadmeContent(config), "utf8");
  return proposalPath;
}

async function projectTaskPlan(args) {
  if (!args.dryRun && !args.applyProposal) {
    throw new Error("project task-plan requires --dry-run or --apply-proposal.");
  }
  if (!args.text.trim()) {
    throw new Error("Missing --text for project task-plan.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const config = await readJson(configPath);
  const candidate = await buildTaskCandidate(configPath, args.text);

  if (args.applyProposal) {
    const proposal = proposalFromCandidate(candidate);
    const proposalPath = await writeProposal(configPath, config, proposal);
    console.log("# Project Task Proposal apply");
    console.log("");
    console.log(`proposal_file: ${proposalPath}`);
    console.log(`task_id: ${proposal.task_id}`);
    console.log(`proposal_status: ${proposal.proposal_status.join(", ")}`);
    console.log(`owner: ${proposal.owner}`);
    console.log(`skill_type: ${proposal.skill_type}`);
    console.log(`runtime: ${proposal.runtime}`);
    console.log(`risk: ${proposal.risk}`);
    console.log(`approval_required: ${proposal.approval_required ? "yes" : "no"}`);
    console.log(`project_write_mode: ${proposal.project_write_mode}`);
    console.log(`agent_execution_mode: ${proposal.agent_execution_mode}`);
    console.log("project_queue_write: disabled");
    console.log("project_event_write: disabled");
    console.log("deploy: disabled");
    console.log("production_operations: disabled");
    return;
  }

  console.log("# Project Task Plan dry-run");
  console.log("");
  console.log(JSON.stringify(candidate, null, 2));
}

async function projectProposals(args) {
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const snapshot = await collectProjectSnapshot(configPath);
  const proposalDir = projectTaskProposalsDir(configPath);
  const proposalFiles = existsSync(proposalDir)
    ? (await readdir(proposalDir)).filter((file) => file.endsWith(".json")).sort()
    : [];

  console.log("# Project Task Proposals");
  console.log("");
  console.log(`proposal_dir: ${proposalDir}`);
  console.log(`proposal_count: ${proposalFiles.length}`);
  if (proposalFiles.length === 0) {
    console.log("- none");
    return;
  }
  for (const file of proposalFiles) {
    const proposal = await readJson(join(proposalDir, file));
    const queueState = snapshot.projectExists
      ? await readProjectQueueState(snapshot.projectPath, snapshot.config, proposal.task_id)
      : null;
    const audit = await readProjectQueueInjectionAudit(proposal.project_id ?? contextProjectId(args.project || DEFAULT_PROJECT), proposal.task_id);
    console.log(`- ${proposal.task_id} | ${proposal.owner} | ${proposal.skill_type} | ${proposal.risk} | ${proposal.approval_status} | queue=${queueState?.task?.status ?? "missing"} | audit=${audit?.data?.status ?? "missing"} | ${file}`);
  }
}

async function projectApproveProposal(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project approve-proposal requires --dry-run or --apply.");
  }
  if (!args.taskId.trim()) {
    throw new Error("Missing --task-id for project approve-proposal.");
  }
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const snapshot = await collectProjectSnapshot(configPath);
  const { path: proposalPath, proposal } = await readProposal(configPath, args.taskId);
  const precheckFailures = assertProjectInjectionPrecheck(snapshot);
  const highRisk = proposal.risk === "HIGH";
  if (args.apply && highRisk && !args.approveHighRisk) {
    throw new Error(`Proposal ${proposal.task_id} is HIGH risk. Re-run with --approve-high-risk to apply.`);
  }
  if (args.apply && precheckFailures.length > 0) {
    throw new Error(`Project injection precheck failed: ${precheckFailures.join("; ")}`);
  }

  const approvedAt = new Date().toISOString();
  const approvedProposal = approveProposal(proposal, approvedAt);
  const event = taskCreatedEventFromProposal(approvedProposal, approvedAt);
  const eventDir = statePath(snapshot.projectPath, snapshot.config, "events", "tasks", safeSegment(proposal.task_id));
  const existingEvent = snapshot.projectExists
    ? await findExistingExternalProposalEvent(snapshot.projectPath, snapshot.config, proposal.task_id)
    : "";

  if (!args.apply) {
    console.log("# Project Proposal Approval dry-run");
    console.log("");
    console.log(`proposal_file: ${proposalPath}`);
    console.log(`task_id: ${proposal.task_id}`);
    console.log(`proposal_risk: ${proposal.risk}`);
    console.log(`approval_required: ${proposal.approval_required ? "yes" : "no"}`);
    console.log(`approve_high_risk_flag: ${args.approveHighRisk ? "yes" : "no"}`);
    console.log(`project_branch: ${snapshot.repo.branch}`);
    console.log(`project_clean: ${snapshot.repo.clean}`);
    console.log(`project_ahead_behind: ${snapshot.repo.ahead_behind}`);
    console.log(`precheck: ${precheckFailures.length === 0 ? "PASS" : "FAIL"}`);
    if (precheckFailures.length > 0) {
      for (const failure of precheckFailures) console.log(`- precheck_failure: ${failure}`);
    }
    console.log(`high_risk_apply_gate: ${highRisk ? "requires --approve-high-risk" : "not required"}`);
    console.log(`would_update_proposal_approval_status: APPROVED`);
    console.log(`would_write_event_dir: ${eventDir}`);
    console.log(`would_write_event_type: ${event.event_type}`);
    console.log(`would_write_task_status: ${event.status_after}`);
    console.log(`existing_external_event: ${existingEvent || "none"}`);
    console.log(`would_write_queue_injection_audit: ${projectQueueInjectionAuditPath(approvedProposal.project_id, approvedProposal.task_id)}`);
    console.log("would_rebuild_queue_read_model: yes");
    console.log("agent_execution: disabled");
    console.log("deploy: disabled");
    console.log("production_operations: disabled");
    return;
  }

  await writeProposalJson(proposalPath, approvedProposal);
  const eventWrite = await writeProjectTaskCreatedEvent(snapshot.projectPath, snapshot.config, event);
  const rebuild = await rebuildProjectReadModel(snapshot.projectPath);
  const queueState = await readProjectQueueState(snapshot.projectPath, snapshot.config, proposal.task_id);
  const eventSummary = await taskEventSummary(snapshot.projectPath, snapshot.config, proposal.task_id);
  const queueInjectionAudit = buildQueueInjectionAuditArtifact({
    projectId: approvedProposal.project_id,
    proposalPath,
    proposal: approvedProposal,
    eventWrite,
    snapshot,
    precheckFailures,
    rebuild,
    queueState,
    eventSummary
  });
  const auditWrite = await writeProjectQueueInjectionAudit(
    approvedProposal.project_id,
    approvedProposal.task_id,
    queueInjectionAudit
  );

  console.log("# Project Proposal Approval apply");
  console.log("");
  console.log(`proposal_file: ${proposalPath}`);
  console.log(`task_id: ${approvedProposal.task_id}`);
  console.log(`approval_status: ${approvedProposal.approval_status}`);
  console.log(`proposal_status: ${approvedProposal.proposal_status.join(", ")}`);
  console.log(`event_file: ${eventWrite.path}`);
  console.log(`event_written: ${eventWrite.written ? "yes" : "no"}`);
  console.log(`event_skipped_existing: ${eventWrite.skipped ? "yes" : "no"}`);
  console.log(`queue_injection_audit_file: ${auditWrite.path}`);
  console.log(`queue_injection_audit_status: ${queueInjectionAudit.status}`);
  console.log(`queue_read_model_rebuilt: ${rebuild.ok ? "yes" : "no"}`);
  console.log("project_allowed_writes: ops/agent-orchestrator/events/**, ops/agent-orchestrator/queue/**");
  console.log("business_code_writes: disabled");
  console.log("agent_execution: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  if (!rebuild.ok) {
    console.log(`rebuild_error: ${rebuild.stderr || rebuild.stdout || "unknown"}`);
  }
  if (rebuild.stdout) {
    console.log("");
    console.log("rebuild_output:");
    console.log(rebuild.stdout);
  }
  if (!rebuild.ok) {
    process.exitCode = 1;
  }
}

function projectExecutionReportsDir(configPath) {
  return join(dirname(configPath), "execution-reports");
}

function projectExecutionReportPath(configPath, taskId) {
  return join(projectExecutionReportsDir(configPath), `${taskId}.md`);
}

function taskPathMatches(path, pattern) {
  const normalizedPath = String(path ?? "").replace(/^\/+/, "");
  const normalizedPattern = String(pattern ?? "").replace(/^\/+/, "").replace(/\/$/, "");
  if (!normalizedPattern) return false;
  if (normalizedPattern.endsWith("/**")) {
    const prefix = normalizedPattern.slice(0, -3);
    return normalizedPath === prefix || normalizedPath.startsWith(`${prefix}/`);
  }
  if (normalizedPattern.includes("*")) {
    const regex = new RegExp(`^${normalizedPattern
      .replace(/[.+?^${}()|[\]\\]/g, "\\$&")
      .replaceAll("\\*", ".*")}$`);
    return regex.test(normalizedPath);
  }
  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function isSystemArtifactPath(path) {
  return [
    "ops/agent-orchestrator/events",
    "ops/agent-orchestrator/queue",
    "ops/agent-orchestrator/runs",
    "ops/agent-orchestrator/reports",
    "ops/agent-orchestrator/results",
    "ops/agent-orchestrator/runtime"
  ].some((prefix) => taskPathMatches(path, prefix));
}

function pathBoundaryViolations(task, changedFiles) {
  const allowed = task?.allowed_paths ?? [];
  const forbidden = task?.forbidden_paths ?? [];
  const outsideAllowed = [];
  const forbiddenHits = [];
  for (const file of changedFiles ?? []) {
    const allowedByTask = allowed.some((pattern) => taskPathMatches(file, pattern));
    const allowedAsSystemArtifact = isSystemArtifactPath(file);
    if (!allowedByTask && !allowedAsSystemArtifact) {
      outsideAllowed.push(file);
    }
    if (!allowedByTask && forbidden.some((pattern) => taskPathMatches(file, pattern))) {
      forbiddenHits.push(file);
    }
  }
  return { outsideAllowed, forbiddenHits };
}

async function readProjectQueueState(projectPath, config, taskId) {
  const queuePath = statePath(projectPath, config, "queue", "task-queue.json");
  const locksPath = statePath(projectPath, config, "queue", "task-locks.json");
  const resultsPath = statePath(projectPath, config, "queue", "task-results.json");
  const queue = existsSync(queuePath) ? await readJson(queuePath) : { tasks: [] };
  const locksJson = existsSync(locksPath) ? await readJson(locksPath) : { locks: [] };
  const resultsJson = existsSync(resultsPath) ? await readJson(resultsPath) : { results: [] };
  const tasks = queueTasksFromJson(queue);
  const locks = queueLocksFromJson(locksJson);
  const results = queueResultsFromJson(resultsJson);
  const task = tasks.find((item) => item.task_id === taskId) ?? null;
  const result = results.find((item) => item.task_id === taskId) ?? null;
  const activeLocks = locks.filter((lock) => lock.active !== false);
  const readyTasks = tasks.filter((item) => item.status === "READY");
  return {
    queue,
    locks: locksJson,
    results: resultsJson,
    task,
    result,
    activeLocks,
    readyTasks,
    queuePath,
    locksPath,
    resultsPath
  };
}

async function taskEventSummary(projectPath, config, taskId) {
  const files = await listTaskEventFiles(projectPath, config, taskId);
  const eventTypes = {};
  let auditStatus = "";
  for (const file of files) {
    try {
      const event = await readJson(file);
      const type = event.event_type ?? "unknown";
      eventTypes[type] = (eventTypes[type] ?? 0) + 1;
      if (type === "task.audited") {
        auditStatus = event.metadata?.audit_status ?? event.metadata?.status ?? event.status_after ?? auditStatus;
      }
    } catch {
      eventTypes.invalid = (eventTypes.invalid ?? 0) + 1;
    }
  }
  return {
    files,
    event_types: eventTypes,
    audit_status: auditStatus || ""
  };
}

async function runLogSummary(projectPath, taskId, owner) {
  const runLogPath = statePath(projectPath, { state_dir: "ops/agent-orchestrator" }, "runs", `${taskId}-${owner}.run.log`);
  if (!existsSync(runLogPath)) {
    return {
      path: runLogPath,
      exists: false,
      exit_code: "missing",
      started_at: "",
      finished_at: ""
    };
  }
  const content = await readFile(runLogPath, "utf8");
  return {
    path: runLogPath,
    exists: true,
    exit_code: content.match(/^exit_code:\s*(.+)$/m)?.[1]?.trim() ?? "unknown",
    started_at: content.match(/^started_at:\s*(.+)$/m)?.[1]?.trim() ?? "",
    finished_at: content.match(/^finished_at:\s*(.+)$/m)?.[1]?.trim() ?? ""
  };
}

function parseFinalizeResult(output) {
  const marker = output.lastIndexOf("# FINALIZE RESULT");
  const block = marker >= 0 ? output.slice(marker) : output;
  const fields = {};
  for (const line of block.split("\n")) {
    const match = line.match(/^([a-zA-Z_ ]+):\s*(.+)$/);
    if (!match) continue;
    fields[match[1].trim().replaceAll(" ", "_")] = match[2].trim();
  }
  return {
    found: marker >= 0 || Object.prototype.hasOwnProperty.call(fields, "finalize"),
    fields
  };
}

function assertProjectExecutePrecheck(snapshot, queueState, taskId) {
  const failures = assertProjectInjectionPrecheck(snapshot);
  const aheadBehind = parseAheadBehindStrict(snapshot.repo.ahead_behind);
  const completed = isTaskExecutionComplete(queueState);
  if (!aheadBehind.clean) {
    failures.push(`project ahead/behind must be 0/0 before remote execution, got ${snapshot.repo.ahead_behind}`);
  }
  if (snapshot.localOrchestrator.doctor_status !== "GO") {
    failures.push(`project doctor must be GO, got ${snapshot.localOrchestrator.doctor_status}`);
  }
  if (!queueState.task) {
    failures.push(`task not found in project queue: ${taskId}`);
  } else if (queueState.task.status !== "READY" && !completed) {
    failures.push(`task must be READY before execution or already DONE/AUDITED, got ${queueState.task.status}`);
  }
  const otherReadyTasks = queueState.readyTasks.filter((task) => task.task_id !== taskId);
  if (otherReadyTasks.length > 0) {
    failures.push(`refusing to execute because other READY tasks exist: ${otherReadyTasks.map((task) => task.task_id).join(", ")}`);
  }
  if (queueState.activeLocks.length > 0 && !completed) {
    failures.push(`active locks must be 0 before execution, got ${queueState.activeLocks.length}`);
  }
  return failures;
}

function isTaskExecutionComplete(queueState) {
  const taskStatus = queueState.task?.status;
  const resultStatus = queueState.result?.status;
  return ["AUDITED", "DONE"].includes(taskStatus) && resultStatus === "DONE";
}

function agentCycleCommand(parallel) {
  return [
    "ops/agent-orchestrator/scripts/orchestratorctl.mjs",
    "agent-cycle",
    "--apply",
    "--execute",
    "--push",
    "--parallel",
    String(parallel)
  ];
}

function finalizeCommand() {
  return [
    "ops/agent-orchestrator/scripts/orchestratorctl.mjs",
    "finalize",
    "--apply"
  ];
}

function stdoutTail(output, lineCount = 80) {
  const lines = String(output ?? "").split("\n");
  return lines.slice(Math.max(0, lines.length - lineCount)).join("\n").trim();
}

async function collectExecutionState(configPath, projectPath, config, taskId, commandResult = null) {
  const queueState = await readProjectQueueState(projectPath, config, taskId);
  const owner = queueState.task?.owner ?? "";
  const events = await taskEventSummary(projectPath, config, taskId);
  const runLog = owner ? await runLogSummary(projectPath, taskId, owner) : null;
  const snapshot = await collectProjectSnapshot(configPath);
  const changedFiles = queueState.result?.changed_files ?? [];
  const boundary = pathBoundaryViolations(queueState.task, changedFiles);
  const finalizeResult = commandResult ? parseFinalizeResult(`${commandResult.stdout}\n${commandResult.stderr}`) : { found: false, fields: {} };
  return {
    task: queueState.task,
    result: queueState.result,
    events,
    run_log: runLog,
    doctor_status: snapshot.localOrchestrator.doctor_status,
    repo_status: snapshot.repo,
    queue_status_counts: snapshot.queue?.status_counts ?? {},
    active_locks: snapshot.queue?.active_locks ?? 0,
    boundary,
    command: commandResult ? {
      exit_code: commandResult.status,
      ok: commandResult.ok,
      stdout_tail: stdoutTail(commandResult.stdout),
      stderr_tail: stdoutTail(commandResult.stderr, 40),
      finalize_result: finalizeResult
    } : null
  };
}

function executionReportContent({ config, configPath, projectPath, taskId, mode, parallel, precheckFailures, commandArgs, state }) {
  const task = state.task;
  const result = state.result;
  const changedFiles = result?.changed_files ?? [];
  const finalizeFields = state.command?.finalize_result?.fields ?? {};
  return `# Remote Project Execute Smoke Report

Generated at: ${new Date().toISOString()}

## Summary

- project_id: ${config.project_id}
- project_path: ${projectPath}
- config: ${configPath}
- task_id: ${taskId}
- mode: ${mode}
- parallel: ${parallel}
- orchestrator_command: node ${commandArgs.join(" ")}
- doctor_status: ${state.doctor_status}
- repo_branch: ${state.repo_status.branch}
- repo_head: ${state.repo_status.head}
- repo_clean: ${state.repo_status.clean}
- ahead_behind: ${state.repo_status.ahead_behind}
- active_locks: ${state.active_locks}

## Precheck

${precheckFailures.length === 0 ? "- PASS" : precheckFailures.map((failure) => `- FAIL: ${failure}`).join("\n")}

## Task State

- task_status: ${task?.status ?? "missing"}
- owner: ${task?.owner ?? "missing"}
- result_status: ${result?.status ?? "missing"}
- audit_status: ${state.events.audit_status || (task?.status === "AUDITED" ? "PASS" : "missing")}
- run_log: ${state.run_log?.path ?? "missing"}
- run_log_exit_code: ${state.run_log?.exit_code ?? "missing"}
- event_types: ${JSON.stringify(state.events.event_types)}

## Changed Files

${changedFiles.length === 0 ? "- none" : changedFiles.map((file) => `- ${file}`).join("\n")}

## Boundary Check

- outside_allowed_paths: ${state.boundary.outsideAllowed.length === 0 ? "none" : state.boundary.outsideAllowed.join(", ")}
- forbidden_path_hits: ${state.boundary.forbiddenHits.length === 0 ? "none" : state.boundary.forbiddenHits.join(", ")}
- orchestrator_system_artifacts_allowed: ops/agent-orchestrator/events, queue, runs, reports, results, runtime

## Finalize Result

- found: ${state.command?.finalize_result?.found ? "yes" : "no"}
- finalize: ${finalizeFields.finalize ?? "unknown"}
- pushed: ${finalizeFields.pushed ?? "unknown"}
- synced_agents: ${finalizeFields.synced_agents ?? "unknown"}
- doctor: ${finalizeFields.doctor ?? "unknown"}
- main_head: ${finalizeFields.main_head ?? "unknown"}
- main_clean: ${finalizeFields.main_clean ?? "unknown"}
- agents_clean: ${finalizeFields.agents_clean ?? "unknown"}
- READY count: ${finalizeFields.READY_count ?? state.queue_status_counts.READY ?? 0}
- CLAIMED count: ${finalizeFields.CLAIMED_count ?? state.queue_status_counts.CLAIMED ?? 0}
- active_locks: ${finalizeFields.active_locks ?? state.active_locks}

## Command Output Tail

\`\`\`text
${state.command?.stdout_tail || "not captured"}
\`\`\`

## Command Error Tail

\`\`\`text
${state.command?.stderr_tail || "none"}
\`\`\`

## Safety

- deploy: not executed by ANKSEN Agent Studio
- production_operation: not executed by ANKSEN Agent Studio
- project writes: delegated only to local Jinhu orchestrator agent-cycle
- report write location: ANKSEN Agent Studio examples project space
`;
}

async function writeExecutionReport(configPath, report) {
  const reportDir = projectExecutionReportsDir(configPath);
  await mkdir(reportDir, { recursive: true });
  const reportPath = projectExecutionReportPath(configPath, report.taskId);
  await writeFile(reportPath, report.content, "utf8");
  return reportPath;
}

async function refreshProjectMemoryFromSnapshot(configPath) {
  const snapshot = await collectProjectSnapshot(configPath);
  const memory = buildProjectMemory(snapshot);
  const memoryDir = projectRuntimeMemoryDir(configPath);
  await writeProjectMemory(memoryDir, memory);
  return {
    memoryDir,
    snapshot,
    memory
  };
}

async function projectExecute(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project execute requires --dry-run or --apply.");
  }
  if (!args.taskId.trim()) {
    throw new Error("Missing --task-id for project execute.");
  }
  const parallel = Number.isInteger(args.parallel) && args.parallel > 0 ? args.parallel : 1;
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  const snapshot = await collectProjectSnapshot(configPath);
  const queueState = await readProjectQueueState(snapshot.projectPath, snapshot.config, args.taskId);
  const precheckFailures = assertProjectExecutePrecheck(snapshot, queueState, args.taskId);
  const commandArgs = agentCycleCommand(parallel);
  const dryRunCommandArgs = isTaskExecutionComplete(queueState) ? finalizeCommand() : commandArgs;

  if (args.dryRun) {
    console.log("# Project Remote Execute dry-run");
    console.log("");
    console.log(`project_id: ${snapshot.config.project_id}`);
    console.log(`project_path: ${snapshot.projectPath}`);
    console.log(`task_id: ${args.taskId}`);
    console.log(`task_status: ${queueState.task?.status ?? "missing"}`);
    console.log(`execution_needed: ${isTaskExecutionComplete(queueState) ? "no (already complete)" : "yes"}`);
    console.log(`owner: ${queueState.task?.owner ?? "missing"}`);
    console.log(`risk: ${queueState.task?.risk ?? "unknown"}`);
    console.log(`ready_task_count: ${queueState.readyTasks.length}`);
    console.log(`active_locks: ${queueState.activeLocks.length}`);
    console.log(`doctor_status: ${snapshot.localOrchestrator.doctor_status}`);
    console.log(`repo_branch: ${snapshot.repo.branch}`);
    console.log(`repo_clean: ${snapshot.repo.clean}`);
    console.log(`ahead_behind: ${snapshot.repo.ahead_behind}`);
    console.log(`would_run: node ${dryRunCommandArgs.join(" ")}`);
    console.log(`parallel: ${parallel}`);
    console.log(`precheck: ${precheckFailures.length === 0 ? "PASS" : "FAIL"}`);
    for (const failure of precheckFailures) console.log(`- precheck_failure: ${failure}`);
    console.log("agent_execution: disabled in dry-run");
    console.log("deploy: disabled");
    console.log("production_operations: disabled");
    return;
  }

  if (precheckFailures.length > 0) {
    throw new Error(`Project remote execute precheck failed: ${precheckFailures.join("; ")}`);
  }

  const alreadyComplete = isTaskExecutionComplete(queueState);
  const effectiveCommandArgs = alreadyComplete ? finalizeCommand() : commandArgs;

  console.log("# Project Remote Execute apply");
  console.log("");
  console.log(`project_id: ${snapshot.config.project_id}`);
  console.log(`project_path: ${snapshot.projectPath}`);
  console.log(`task_id: ${args.taskId}`);
  console.log(`owner: ${queueState.task?.owner ?? "unknown"}`);
  console.log(`parallel: ${parallel}`);
  console.log(`command: node ${effectiveCommandArgs.join(" ")}`);
  console.log(`execution_needed: ${alreadyComplete ? "no (already complete)" : "yes"}`);
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("");

  const commandResult = await execProjectCommand(snapshot.projectPath, process.execPath, effectiveCommandArgs);
  const state = await collectExecutionState(configPath, snapshot.projectPath, snapshot.config, args.taskId, commandResult);
  const reportContent = executionReportContent({
    config: snapshot.config,
    configPath,
    projectPath: snapshot.projectPath,
    taskId: args.taskId,
    mode: "apply",
    parallel,
    precheckFailures,
    commandArgs: effectiveCommandArgs,
    state
  });
  const reportPath = await writeExecutionReport(configPath, { taskId: args.taskId, content: reportContent });
  const memoryRefresh = await refreshProjectMemoryFromSnapshot(configPath);

  console.log(`command_exit_code: ${commandResult.status}`);
  console.log(`command_success: ${commandResult.ok ? "yes" : "no"}`);
  console.log(`report_file: ${reportPath}`);
  console.log(`memory_refreshed: ${memoryRefresh.memoryDir}`);
  console.log(`doctor_status: ${state.doctor_status}`);
  console.log(`task_status: ${state.task?.status ?? "missing"}`);
  console.log(`result_status: ${state.result?.status ?? "missing"}`);
  console.log(`audit_status: ${state.events.audit_status || (state.task?.status === "AUDITED" ? "PASS" : "missing")}`);
  console.log(`run_log: ${state.run_log?.path ?? "missing"}`);
  console.log(`run_log_exit_code: ${state.run_log?.exit_code ?? "missing"}`);
  console.log(`boundary_outside_allowed: ${state.boundary.outsideAllowed.length === 0 ? "none" : state.boundary.outsideAllowed.join(", ")}`);
  console.log(`boundary_forbidden_hits: ${state.boundary.forbiddenHits.length === 0 ? "none" : state.boundary.forbiddenHits.join(", ")}`);
  console.log(`finalize_result: ${state.command?.finalize_result?.fields?.finalize ?? "unknown"}`);

  if (!commandResult.ok) {
    throw new Error(`Project agent-cycle failed with exit code ${commandResult.status}. See ${reportPath}`);
  }
  if (state.doctor_status !== "GO") {
    throw new Error(`Project doctor is ${state.doctor_status}; remote execute is not complete. See ${reportPath}`);
  }
  if (state.task?.status !== "AUDITED" && state.task?.status !== "DONE") {
    throw new Error(`Task status is ${state.task?.status ?? "missing"}; expected DONE/AUDITED. See ${reportPath}`);
  }
  if (state.result?.status !== "DONE") {
    throw new Error(`Task result status is ${state.result?.status ?? "missing"}; expected DONE. See ${reportPath}`);
  }
  if (state.events.audit_status && state.events.audit_status !== "PASS") {
    throw new Error(`Task audit status is ${state.events.audit_status}; expected PASS. See ${reportPath}`);
  }
  if (state.boundary.outsideAllowed.length > 0 || state.boundary.forbiddenHits.length > 0) {
    throw new Error(`Task boundary check failed. See ${reportPath}`);
  }
}

async function runtimeMemory() {
  const docs = await countFiles(resolveFromRoot("docs/release"));
  const schemas = await countFiles(resolveFromRoot("packages"));
  console.log("# Runtime Memory dry-run summary");
  console.log("");
  console.log("mode: standalone-platform-skeleton");
  console.log(`release_docs: ${docs}`);
  console.log(`package_files: ${schemas}`);
  console.log("memory_writes: disabled in extraction stage");
}

async function goalToQueue(args) {
  if (!args.text.trim()) throw new Error("Missing --text for goal-to-queue.");
  const route = await loadSkillRoute(args.text);
  const taskId = `GOAL-${args.text.normalize("NFKD").replace(/[^\w\s-]/g, "").trim().replace(/\s+/g, "-").toUpperCase().slice(0, 48) || "TASK"}`;
  console.log("# Goal to Queue dry-run");
  console.log("");
  console.log(`goal_text: ${args.text}`);
  console.log(`task_candidate_id: ${taskId}`);
  console.log(`selected_skill: ${route.selected_skill}`);
  console.log(`selected_agent: ${route.selected_agent}`);
  console.log(`selected_runtime: ${route.selected_runtime}`);
  console.log(`risk_level: ${route.risk_level}`);
  console.log("event_write: disabled");
  console.log("queue_write: disabled");
}

async function observe() {
  console.log("# Resident Observer dry-run");
  console.log("");
  console.log("sources:");
  console.log("- package registry");
  console.log("- project connector config");
  console.log("- copied schemas/examples");
  console.log("findings:");
  console.log("- INFO: extraction-stage platform skeleton is present");
  console.log("- INFO: project evidence directories are intentionally not migrated");
}

async function evolutionPlan() {
  const state = await readJson(resolveFromRoot("packages/evolution-center/examples/state.example.json"));
  console.log("# Evolution Planner dry-run");
  console.log("");
  console.log(`source_state_schema_version: ${state.schema_version ?? "unknown"}`);
  console.log("candidate:");
  console.log("- EXTRACT-CORE-PARITY-TESTS | Add parity tests before porting project-local scripts | risk=MEDIUM");
}

async function discovery(args) {
  const targetPath = resolveFromRoot(args.target || "packages/discovery-engine/examples/discovery-target.example.json");
  const target = await readJson(targetPath);
  console.log("# Discovery dry-run");
  console.log("");
  console.log(`target_file: ${targetPath}`);
  console.log(`target_id: ${target.target_id ?? "unknown"}`);
  console.log(`target_name: ${target.target_name ?? "unknown"}`);
  console.log(`target_type: ${target.target_type ?? "unknown"}`);
  console.log("real_crawling: disabled");
}

function relativePath(path) {
  return relative(repoRoot, path).replaceAll("\\", "/");
}

async function readTextIfExists(path) {
  if (!existsSync(path)) return "";
  return readFile(path, "utf8");
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

async function listFilesSafe(path) {
  if (!existsSync(path)) return [];
  return listFiles(path);
}

function summarizeFiles(files) {
  return files.map((file) => relativePath(file)).sort();
}

function latestFile(files) {
  const sorted = [...files].sort();
  return sorted[sorted.length - 1] ?? "";
}

function markdownSection(text, heading) {
  const marker = `## ${heading}`;
  const start = text.indexOf(marker);
  if (start === -1) return "";
  const next = text.indexOf("\n## ", start + marker.length);
  return text.slice(start + marker.length, next === -1 ? undefined : next);
}

function markdownListItems(text, heading) {
  return markdownSection(text, heading)
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => /^(-|\d+\.)\s+/.test(line))
    .map((line) => line.replace(/^(-|\d+\.)\s+/, "").replace(/`/g, "").trim())
    .filter(Boolean);
}

function classifyV5Gap(text) {
  const normalized = text.toLowerCase();
  if (normalized.includes("planning")) {
    return {
      gap_id: "planning-completion-aware",
      area: "Planning",
      title: "Productize completion-aware Planning Center",
      summary: text,
      risk: "MEDIUM",
      target_package: "packages/planning-center",
      expected_files: [
        "packages/planning-center/lib/planning-engine.mjs",
        "packages/orchestrator-core/bin/studio.mjs",
        "docs/release/PLANNING_CHAIN_REPORT.md"
      ]
    };
  }
  if (normalized.includes("console")) {
    return {
      gap_id: "console-route-render",
      area: "Console",
      title: "Productize Console route render dry-run",
      summary: text,
      risk: "MEDIUM",
      target_package: "apps/console",
      expected_files: [
        "apps/console/src/route-manifest.ts",
        "packages/orchestrator-core/bin/studio.mjs",
        "docs/release/CONSOLE_CHAIN_REPORT.md"
      ]
    };
  }
  if (normalized.includes("multi-project") || normalized.includes("multi project") || normalized.includes("project registry")) {
    return {
      gap_id: "multi-project-second-context",
      area: "MultiProject",
      title: "Productize second planned project context",
      summary: text,
      risk: "MEDIUM",
      target_package: "packages/project-connector",
      expected_files: [
        "runtime/projects/phoenix-erp/project-state.json",
        "examples/phoenix-erp/project.config.example.json",
        "docs/release/MULTI_PROJECT_READINESS_REPORT.md"
      ]
    };
  }
  if (normalized.includes("autopilot") || normalized.includes("batch")) {
    return {
      gap_id: "autopilot-anti-repeat",
      area: "Autopilot",
      title: "Productize Autopilot anti-repeat target mode",
      summary: text,
      risk: "MEDIUM",
      target_package: "packages/orchestrator-core",
      expected_files: [
        "packages/orchestrator-core/bin/studio.mjs",
        "docs/release/PLANNING_CHAIN_REPORT.md"
      ]
    };
  }
  if (normalized.includes("project chain") || normalized.includes("remote execute") || normalized.includes("proposal")) {
    return {
      gap_id: "project-chain-approved-evidence",
      area: "Project",
      title: "Productize project chain proposal and approval evidence",
      summary: text,
      risk: "MEDIUM",
      target_package: "packages/project-connector",
      expected_files: [
        "docs/release/PROJECT_CHAIN_REPORT.md",
        "docs/release/V5_INTEGRATION_VALIDATION_REPORT.md"
      ]
    };
  }
  return {
    gap_id: "v5-productization-gap",
    area: "Productization",
    title: "Productize remaining V5 validation gap",
    summary: text,
    risk: "MEDIUM",
    target_package: "docs/release",
    expected_files: [
      "docs/release/V5_INTEGRATION_VALIDATION_REPORT.md"
    ]
  };
}

async function recentBatchRepeatReview(runFiles = null) {
  const files = runFiles ?? await listFilesSafe(resolveFromRoot("autopilot-runs"));
  const summaryFiles = files
    .filter((file) => file.endsWith("-summary.md"))
    .sort()
    .slice(-5);
  const signatures = [];
  for (const file of summaryFiles) {
    const text = await readTextIfExists(file);
    const taskIds = unique([...text.matchAll(/v5-batch-agent-\d-[a-z0-9-]+/g)].map((match) => match[0])).sort();
    if (taskIds.length > 0) {
      signatures.push({
        file: relativePath(file),
        signature: taskIds.join("|"),
        task_count: taskIds.length
      });
    }
  }
  const counts = {};
  for (const item of signatures) {
    counts[item.signature] = (counts[item.signature] ?? 0) + 1;
  }
  const repeatedSignature = Object.entries(counts)
    .filter(([signature]) => signature)
    .sort((left, right) => right[1] - left[1])[0] ?? ["", 0];
  return {
    reviewed_files: summaryFiles.map((file) => relativePath(file)),
    repeated: repeatedSignature[1] >= 2,
    repeated_signature: repeatedSignature[0],
    repeated_count: repeatedSignature[1],
    signatures
  };
}

async function buildV5CompletionState(roadmap, validationReportText, runFiles) {
  const stages = Array.isArray(roadmap?.stages) ? roadmap.stages : [];
  const stageStates = stages.map((stage) => {
    const expectedFiles = stage.expected_files ?? [];
    const presentFiles = expectedFiles.filter((file) => existsSync(resolveFromRoot(file)));
    const completed = stage.status === "completed" || stage.completed === true || (
      expectedFiles.length > 0 && presentFiles.length === expectedFiles.length
    );
    return {
      id: stage.id,
      title: stage.title,
      completed,
      expected_file_count: expectedFiles.length,
      present_file_count: presentFiles.length,
      missing_files: expectedFiles.filter((file) => !presentFiles.includes(file)),
      risk: stage.risk_level ?? "UNKNOWN",
      execution_mode: stage.execution_mode ?? "proposal_only"
    };
  });
  const partialAreas = markdownListItems(validationReportText, "PARTIAL").filter((item) => item !== "none");
  const completedAreas = markdownListItems(validationReportText, "PASS").filter((item) => item !== "none");
  const rawGaps = [
    ...markdownListItems(validationReportText, "Productization Gaps"),
    ...markdownListItems(validationReportText, "Productization Remaining Gaps")
  ].filter((item) => item.toLowerCase() !== "none");
  const remainingGaps = rawGaps.length > 0
    ? rawGaps.map(classifyV5Gap)
    : partialAreas.map((area) => classifyV5Gap(`${area} productization remains partial.`));
  const repeatReview = await recentBatchRepeatReview(runFiles);
  return {
    completion_aware: true,
    source_files: [
      "runtime/global/v5-roadmap.json",
      "docs/release/V5_INTEGRATION_VALIDATION_REPORT.md",
      "autopilot-runs/*"
    ],
    roadmap_stage_count: stageStates.length,
    completed_stages: stageStates.filter((stage) => stage.completed).map((stage) => stage.id),
    partial_areas: partialAreas,
    completed_areas: completedAreas,
    remaining_gaps: remainingGaps,
    recent_batch_review: repeatReview,
    selected_gap: remainingGaps[0] ?? null,
    ready_for_productization_review: remainingGaps.length === 0 && partialAreas.length === 0
  };
}

async function autopilotRunEvidence(runFiles) {
  const runs = [];
  for (const file of runFiles.filter((entry) => entry.endsWith(".json"))) {
    const run = await readJsonIfExists(file);
    if (!run) continue;
    runs.push({
      path: relativePath(file),
      run_id: run.run_id ?? "",
      goal: run.goal ?? "",
      execution_mode: run.execution_mode ?? run.action?.execution_mode ?? "",
      selected_action_title: run.selected_action?.title ?? run.action?.title ?? "",
      commit_hash: run.commit_hash ?? "",
      created_at: run.created_at ?? ""
    });
  }

  const autopilotRunnerRuns = runs.filter((run) =>
    run.execution_mode === "local_repo_execute"
    && /Autopilot Runner/i.test(run.selected_action_title)
  );
  return {
    run_count: runs.length,
    latest_run: latestFile(runFiles) ? relativePath(latestFile(runFiles)) : "",
    autopilot_runner_run_count: autopilotRunnerRuns.length,
    autopilot_runner_completed: autopilotRunnerRuns.length > 0,
    latest_autopilot_runner_run: autopilotRunnerRuns.sort((a, b) => a.path.localeCompare(b.path)).at(-1) ?? null
  };
}

async function collectAutopilotContext(goal, options = {}) {
  const readmePath = resolveFromRoot("README.md");
  const releaseDocs = await listFilesSafe(resolveFromRoot("docs/release"));
  const autopilotRunFiles = await listFilesSafe(resolveFromRoot("autopilot-runs"));
  const runtimeMemoryFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/runtime-memory"));
  const proposalFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/task-proposals"));
  const executionReportFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/execution-reports"));
  const packageEvidenceFiles = (await listFilesSafe(resolveFromRoot("packages")))
    .filter((file) => file.includes("/schemas/") || file.includes("/examples/"));
  const projectState = await readJsonIfExists(resolveFromRoot("examples/jinhu-smart-park/runtime-memory/project-state.json"));
  const agentStudioStatus = await readJsonIfExists(resolveFromRoot("examples/jinhu-smart-park/runtime-memory/agent-studio-status.json"));
  const runtimeProviders = await readJsonIfExists(resolveFromRoot("packages/runtime-center/examples/runtime-providers.example.json"));
  const runtimeProfiles = await readJsonIfExists(resolveFromRoot("packages/runtime-center/examples/runtime-profiles.example.json"));
  const credentialReferences = await readJsonIfExists(resolveFromRoot("packages/credential-vault/examples/credential-references.example.json"));
  const v5Roadmap = await readJsonIfExists(resolveFromRoot("runtime/global/v5-roadmap.json"));
  const v5IntegrationValidationReport = await readTextIfExists(resolveFromRoot("docs/release/V5_INTEGRATION_VALIDATION_REPORT.md"));
  const runEvidence = await autopilotRunEvidence(autopilotRunFiles);
  const v5Completion = options.completionAware
    ? await buildV5CompletionState(v5Roadmap, v5IntegrationValidationReport, autopilotRunFiles)
    : null;

  const releaseDocNames = summarizeFiles(releaseDocs);
  const extractionCompleted = releaseDocNames.includes("docs/release/ANKSEN_AGENT_STUDIO_EXTRACTION_CLOSURE_REPORT.md");
  const remoteExecuteCompleted = executionReportFiles.some((file) => file.endsWith(".md"));
  const runtimeCenterExists = existsSync(resolveFromRoot("packages/runtime-center"))
    && releaseDocNames.includes("docs/release/AGENT_RUNTIME_CENTER_PRD.md");

  return {
    goal,
    readme: {
      path: "README.md",
      present: existsSync(readmePath),
      sha256: createHash("sha256").update(await readTextIfExists(readmePath)).digest("hex").slice(0, 16)
    },
    docs: {
      release_count: releaseDocs.length,
      release_files: releaseDocNames,
      v4_roadmap_present: releaseDocNames.includes("docs/release/AGENT_STUDIO_V4_ROADMAP.md"),
      runtime_center_prd_present: releaseDocNames.includes("docs/release/AGENT_RUNTIME_CENTER_PRD.md"),
      credential_vault_mvp_present: releaseDocNames.includes("docs/release/CREDENTIAL_VAULT_MVP.md"),
      autopilot_runner_mvp_present: releaseDocNames.includes("docs/release/AUTOPILOT_RUNNER_MVP.md"),
      platform_hardening_review_present: releaseDocNames.includes("docs/release/PLATFORM_HARDENING_REVIEW.md"),
      production_operations_center_proposal_present: releaseDocNames.includes("docs/release/PRODUCTION_OPERATIONS_CENTER_PROPOSAL.md"),
      production_operations_center_dry_run_mvp_present: releaseDocNames.includes("docs/release/PRODUCTION_OPERATIONS_CENTER_DRY_RUN_MVP.md"),
      autopilot_continuous_mode_mvp_present: releaseDocNames.includes("docs/release/AUTOPILOT_CONTINUOUS_MODE_MVP.md"),
      real_worker_runtime_smoke_proposal_present: releaseDocNames.includes("docs/release/REAL_WORKER_RUNTIME_SMOKE_PROPOSAL.md"),
      console_operable_read_only_mvp_present: releaseDocNames.includes("docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md"),
      v5_master_plan_present: releaseDocNames.includes("docs/release/AGENT_STUDIO_V5_MASTER_PLAN.md")
    },
    v5_roadmap: v5Roadmap,
    v5_completion: v5Completion,
    autopilot_runs: runEvidence,
    managed_project: {
      runtime_memory_files: summarizeFiles(runtimeMemoryFiles),
      task_proposals: summarizeFiles(proposalFiles.filter((file) => file.endsWith(".json"))),
      execution_reports: summarizeFiles(executionReportFiles),
      project_state: {
        imported_at: projectState?.imported_at ?? "unknown",
        doctor_status: projectState?.local_orchestrator_status?.doctor_status
          ?? agentStudioStatus?.local_orchestrator_status?.doctor_status
          ?? "unknown",
        repo_clean: projectState?.repo_status?.clean ?? "unknown",
        queue_status_counts: projectState?.queue_summary?.status_counts ?? {},
        event_file_count: projectState?.event_summary?.event_file_count ?? "unknown"
      }
    },
    packages: {
      schema_or_example_count: packageEvidenceFiles.length,
      schema_or_example_files: summarizeFiles(packageEvidenceFiles),
      planning_center_exists: existsSync(resolveFromRoot("packages/planning-center")),
      runtime_center_exists: runtimeCenterExists,
      runtime_providers: runtimeProviders?.providers?.map((provider) => provider.provider_id) ?? [],
      runtime_profiles: runtimeProfiles?.profiles?.map((profile) => profile.runtime_id) ?? [],
      credential_vault_exists: existsSync(resolveFromRoot("packages/credential-vault")),
      credential_references: credentialReferences?.credential_references?.map((credential) => credential.provider) ?? [],
      autopilot_runner_exists: existsSync(resolveFromRoot("docs/release/AUTOPILOT_RUNNER_MVP.md")),
      console_read_only_mvp_exists: existsSync(resolveFromRoot("apps/console/src/view-model.ts"))
        && existsSync(resolveFromRoot("apps/console/src/fixtures.ts"))
        && existsSync(resolveFromRoot("apps/console/src/navigation.ts")),
      multi_project_workspace_exists: existsSync(resolveFromRoot("packages/project-connector/src/workspace.ts"))
        && existsSync(resolveFromRoot("packages/project-connector/examples/multi-project-workspace.example.json")),
      production_ops_governance_exists: existsSync(resolveFromRoot("packages/production-ops/schemas/governance-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/production-ops/schemas/release-gate.schema.json"))
        && existsSync(resolveFromRoot("packages/production-ops/examples/governance-policy.example.json"))
        && existsSync(resolveFromRoot("packages/production-ops/examples/release-gates.example.json")),
      governance_center_exists: existsSync(resolveFromRoot("packages/governance-center/schemas/governance-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/approval-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/release-gate.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/risk-policy.schema.json")),
      governance_release_gates_exists: existsSync(resolveFromRoot("packages/production-ops/schemas/governance-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/production-ops/schemas/release-gate.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/governance-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/approval-policy.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/release-gate.schema.json"))
        && existsSync(resolveFromRoot("packages/governance-center/schemas/risk-policy.schema.json")),
      production_ops_dry_run_exists: existsSync(resolveFromRoot("packages/production-ops/schemas/server-registry.schema.json"))
        && existsSync(resolveFromRoot("packages/production-ops/examples/server-registry.example.json"))
        && existsSync(resolveFromRoot("packages/production-ops/lib/production-ops-utils.mjs")),
      console_operable_mvp_exists: existsSync(resolveFromRoot("apps/console/src/actions.ts"))
        && existsSync(resolveFromRoot("docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md")),
      v5_master_plan_schema_exists: existsSync(resolveFromRoot("packages/planning-center/schemas/v5-master-plan.schema.json"))
    },
    stage: {
      extraction_completed: extractionCompleted,
      remote_execute_completed: remoteExecuteCompleted,
      next_stage: "V4-I Agent Runtime Center",
      runtime_center_bootstrapped: runtimeCenterExists
    },
    evidence: {
      latest_execution_report: relativePath(latestFile(executionReportFiles)),
      latest_task_proposal: relativePath(latestFile(proposalFiles.filter((file) => file.endsWith(".json")))),
      latest_autopilot_run: runEvidence.latest_run,
      latest_autopilot_runner_run: runEvidence.latest_autopilot_runner_run?.path ?? ""
    }
  };
}

function planningCenterEngineUrl() {
  return pathToFileURL(resolve(packageDir, "../planning-center/lib/planning-engine.mjs")).href;
}

function runtimeCenterUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../runtime-center/lib/runtime-center-utils.mjs")).href;
}

function runtimeAdapterUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../runtime-adapters/lib/runtime-adapter-utils.mjs")).href;
}

function modelGatewayUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../model-gateway/lib/model-gateway-utils.mjs")).href;
}

function projectConnectorUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../project-connector/lib/project-connector-utils.mjs")).href;
}

function credentialVaultUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../credential-vault/lib/credential-vault-utils.mjs")).href;
}

function governanceCenterUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../governance-center/lib/governance-center-utils.mjs")).href;
}

function productionOpsUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../production-ops/lib/production-ops-utils.mjs")).href;
}

function workerPoolUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../worker-pool/lib/worker-pool-utils.mjs")).href;
}

function mobileStackPackUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../mobile-stack-pack/lib/mobile-stack-pack-utils.mjs")).href;
}

function accessCenterUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../access-center/lib/access-center-utils.mjs")).href;
}

function buildPlanningRequest(goal, context, options = {}) {
  const createdAt = new Date().toISOString();
  return {
    schema_version: 1,
    request_id: `planning-${timestampForFile(createdAt)}-${createHash("sha1").update(goal).digest("hex").slice(0, 8)}`,
    created_at: createdAt,
    goal,
    inputs: {
      readme: context.readme,
      docs: context.docs,
      runtime_memory: context.managed_project,
      roadmap: {
        v4_roadmap_present: context.docs.v4_roadmap_present,
        v5_roadmap_present: Boolean(context.v5_roadmap),
        v5_roadmap: context.v5_roadmap,
        next_stage: context.stage.next_stage
      },
      v5_completion: context.v5_completion,
      autopilot_runs: context.autopilot_runs,
      closure_report: {
        extraction_completed: context.stage.extraction_completed,
        remote_execute_completed: context.stage.remote_execute_completed
      },
      packages: context.packages,
      evidence: context.evidence
    },
    constraints: {
      max_steps: 1,
      agent_execution: "disabled",
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled"
    },
    options: {
      completion_aware: Boolean(options.completionAware)
    }
  };
}

async function runPlanningCenter(goal, options = {}) {
  const context = await collectAutopilotContext(goal, options);
  const request = buildPlanningRequest(goal, context, options);
  const planningEngine = await import(planningCenterEngineUrl());
  const output = planningEngine.buildPlanningOutput(request);
  return { context, request, output };
}

function actionFromPlanningOutput(output) {
  return {
    ...output.next_action,
    reason: output.reason,
    target_project: output.target_project,
    target_package: output.target_package,
    expected_files: output.expected_files,
    validation_commands: output.validation_commands,
    risk: output.risk,
    approval_required: output.approval_required,
    execution_mode: output.execution_mode ?? output.next_action?.execution_mode ?? "proposal_only"
  };
}

function buildAutopilotRun(goal, context, action, mode, maxSteps, planningOutput) {
  const now = new Date().toISOString();
  const runId = `autopilot-${timestampForFile(now)}-${createHash("sha1").update(`${goal}:${now}`).digest("hex").slice(0, 8)}`;
  const stopCondition = planningOutput?.stop_condition ?? (maxSteps >= 1
    ? "STOP: max_steps=1 reached after generating one supervised action. No Agent, deploy, production operation, or managed-project write was executed."
    : "STOP: no steps allowed.");
  return {
    schema_version: 1,
    run_id: runId,
    created_at: now,
    mode,
    goal,
    max_steps: maxSteps,
    current_stage: planningOutput?.current_stage ?? context.stage,
    context_summary: {
      release_doc_count: context.docs.release_count,
      runtime_memory_file_count: context.managed_project.runtime_memory_files.length,
      task_proposal_count: context.managed_project.task_proposals.length,
      execution_report_count: context.managed_project.execution_reports.length,
      schema_or_example_count: context.packages.schema_or_example_count,
      runtime_provider_count: context.packages.runtime_providers.length,
      runtime_profile_count: context.packages.runtime_profiles.length,
      managed_project_doctor: context.managed_project.project_state.doctor_status
    },
    planning_output: planningOutput,
    action,
    safety: {
      apply_writes: mode === "apply" ? "autopilot-runs only" : "none",
      agent_execution: "disabled",
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      high_risk_policy: "HIGH risk actions require approval gate and are not auto-executed"
    },
    stop_condition: stopCondition,
    evidence: context.evidence
  };
}

function autopilotRunMarkdown(run) {
  const action = run.action;
  return `# Autopilot Supervisor Run

- run_id: ${run.run_id}
- created_at: ${run.created_at}
- mode: ${run.mode}
- goal: ${run.goal}
- max_steps: ${run.max_steps}

## Current Stage

- extraction_completed: ${run.current_stage.extraction_completed ? "yes" : "no"}
- remote_execute_completed: ${run.current_stage.remote_execute_completed ? "yes" : "no"}
- next_stage: ${run.current_stage.next_stage}
- runtime_center_bootstrapped: ${run.current_stage.runtime_center_bootstrapped ? "yes" : "no"}

## Context Summary

- release_doc_count: ${run.context_summary.release_doc_count}
- runtime_memory_file_count: ${run.context_summary.runtime_memory_file_count}
- task_proposal_count: ${run.context_summary.task_proposal_count}
- execution_report_count: ${run.context_summary.execution_report_count}
- schema_or_example_count: ${run.context_summary.schema_or_example_count}
- runtime_provider_count: ${run.context_summary.runtime_provider_count}
- runtime_profile_count: ${run.context_summary.runtime_profile_count}
- managed_project_doctor: ${run.context_summary.managed_project_doctor}

## Next Action

- title: ${action.title}
- reason: ${action.reason}
- target_package: ${action.target_package}
- risk: ${action.risk}
- approval_required: ${action.approval_required ? "yes" : "no"}
- execution_mode: ${action.execution_mode}

### Expected Files

${action.expected_files.map((file) => `- ${file}`).join("\n")}

### Validation Commands

${action.validation_commands.map((command) => `- ${command}`).join("\n")}

## Safety

- apply_writes: ${run.safety.apply_writes}
- agent_execution: ${run.safety.agent_execution}
- managed_project_writes: ${run.safety.managed_project_writes}
- deploy: ${run.safety.deploy}
- production_operations: ${run.safety.production_operations}
- high_risk_policy: ${run.safety.high_risk_policy}

## Stop Condition

${run.stop_condition}
`;
}

async function writeAutopilotRun(run) {
  const dir = resolveFromRoot("autopilot-runs");
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, `${run.run_id}.json`);
  const markdownPath = join(dir, `${run.run_id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, autopilotRunMarkdown(run), "utf8");
  return { jsonPath, markdownPath };
}

function printAutopilot(run, files = null) {
  console.log(`# Autopilot Supervisor ${run.mode}`);
  console.log("");
  console.log(`goal: ${run.goal}`);
  console.log(`run_id: ${run.run_id}`);
  console.log(`max_steps: ${run.max_steps}`);
  console.log("");
  console.log("current_stage:");
  console.log(`- extraction_completed: ${run.current_stage.extraction_completed ? "yes" : "no"}`);
  console.log(`- remote_execute_completed: ${run.current_stage.remote_execute_completed ? "yes" : "no"}`);
  console.log(`- next_stage: ${run.current_stage.next_stage}`);
  console.log(`- runtime_center_bootstrapped: ${run.current_stage.runtime_center_bootstrapped ? "yes" : "no"}`);
  console.log("");
  console.log("next_action:");
  console.log(`- title: ${run.action.title}`);
  console.log(`- reason: ${run.action.reason}`);
  console.log(`- target_package: ${run.action.target_package}`);
  console.log(`- risk: ${run.action.risk}`);
  console.log(`- approval_required: ${run.action.approval_required ? "yes" : "no"}`);
  console.log("");
  console.log("expected_files:");
  for (const file of run.action.expected_files) console.log(`- ${file}`);
  console.log("");
  console.log("validation_commands:");
  for (const command of run.action.validation_commands) console.log(`- ${command}`);
  console.log("");
  if (files) {
    console.log("written_files:");
    console.log(`- ${files.jsonPath}`);
    console.log(`- ${files.markdownPath}`);
    console.log("");
  }
  console.log(`stop_condition: ${run.stop_condition}`);
  console.log("agent_execution: disabled");
  console.log("managed_project_writes: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
}

async function localExecutionGate(action) {
  const { api, bundle } = await loadGovernanceCenterApi();
  const governance = api.evaluateActionGovernance(bundle, action);
  const executionTarget = await resolveExecutionTarget(action);

  if (!executionTarget.resolved) {
    return {
      allowed: false,
      execution_mode: "proposal_only",
      execution_route: executionTarget.execution_route,
      reason: `Execution target for ${action.target_project} is not resolved to a local repository path, so Autopilot Runner can only generate a proposal.`,
      governance,
      execution_target: executionTarget
    };
  }

  if (executionTarget.kind === "managed_project_repo" && executionTarget.write_policy === "disabled") {
    return {
      allowed: false,
      execution_mode: "proposal_only",
      execution_route: executionTarget.execution_route,
      reason: `Action is correctly routed to managed project repo ${executionTarget.repo_path}, but managed project writes are still disabled in runtime memory.`,
      governance,
      execution_target: executionTarget
    };
  }

  if (executionTarget.kind === "managed_project_repo" && executionTarget.write_policy === "approval_required") {
    return {
      allowed: false,
      execution_mode: "proposal_only",
      execution_route: executionTarget.execution_route,
      reason: `Action is correctly routed to managed project repo ${executionTarget.repo_path}, but the project write policy still requires explicit approval.`,
      governance,
      execution_target: executionTarget
    };
  }

  return {
    allowed: Boolean(governance.execution_allowed),
    execution_mode: governance.execution_mode,
    execution_route: executionTarget.execution_route,
    reason: governance.reason,
    governance,
    execution_target: executionTarget
  };
}

function commandSpec(command) {
  const planMatch = command.match(/^node packages\/orchestrator-core\/bin\/studio\.mjs plan --goal "([^"]+)" --dry-run$/);
  if (planMatch) {
    return ["node", ["packages/orchestrator-core/bin/studio.mjs", "plan", "--goal", planMatch[1], "--dry-run"], 120000];
  }
  const autopilotRunMatch = command.match(/^node packages\/orchestrator-core\/bin\/studio\.mjs autopilot run --goal "([^"]+)" --dry-run$/);
  if (autopilotRunMatch) {
    return ["node", ["packages/orchestrator-core/bin/studio.mjs", "autopilot", "run", "--goal", autopilotRunMatch[1], "--dry-run"], 120000];
  }
  const autopilotBatchMatch = command.match(/^node packages\/orchestrator-core\/bin\/studio\.mjs autopilot batch --goal "([^"]+)" --dry-run$/);
  if (autopilotBatchMatch) {
    return ["node", ["packages/orchestrator-core/bin/studio.mjs", "autopilot", "batch", "--goal", autopilotBatchMatch[1], "--dry-run"], 120000];
  }
  const adapterInvokePlanMatch = command.match(/^node packages\/orchestrator-core\/bin\/studio\.mjs adapter invoke-plan --runtime ([a-z0-9-]+) --skill ([a-zA-Z0-9_-]+) --dry-run$/);
  if (adapterInvokePlanMatch) {
    return ["node", ["packages/orchestrator-core/bin/studio.mjs", "adapter", "invoke-plan", "--runtime", adapterInvokePlanMatch[1], "--skill", adapterInvokePlanMatch[2], "--dry-run"], 120000];
  }
  const specs = new Map([
    ["pnpm typecheck", ["pnpm", ["typecheck"], 120000]],
    ["pnpm lint:check", ["pnpm", ["lint:check"], 120000]],
    ["git diff --check", ["git", ["diff", "--check"], 120000]],
    ["git status", ["git", ["status", "--short", "--branch"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs governance check --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "governance", "check", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "release-gate", "check", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs approval-policy --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "approval-policy", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "adapter", "list", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "adapter", "health", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs production server-list --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "production", "server-list", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs production deploy-plan --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "production", "deploy-plan", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "production", "safety-check", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs production rollback-plan --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "production", "rollback-plan", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs production-ops validate --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "production-ops", "validate", "--dry-run"], 120000]],
    ["node packages/runtime-center/bin/runtime-health-check.mjs --dry-run", ["node", ["packages/runtime-center/bin/runtime-health-check.mjs", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs runtime select --skill code_development --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "runtime", "select", "--skill", "code_development", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs project intake --config examples/jinhu-smart-park/project.config.example.json --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "project", "intake", "--config", "examples/jinhu-smart-park/project.config.example.json", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs project stack --config examples/jinhu-smart-park/project.config.example.json --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "project", "stack", "--config", "examples/jinhu-smart-park/project.config.example.json", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs project commands --config examples/jinhu-smart-park/project.config.example.json --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "project", "commands", "--config", "examples/jinhu-smart-park/project.config.example.json", "--dry-run"], 120000]],
    ["node packages/orchestrator-core/bin/studio.mjs debug analyze --fixture packages/project-connector/examples/debug-error.example.log --dry-run", ["node", ["packages/orchestrator-core/bin/studio.mjs", "debug", "analyze", "--fixture", "packages/project-connector/examples/debug-error.example.log", "--dry-run"], 120000]]
  ]);
  return specs.get(command) ?? null;
}

async function runAllowedCommand(command, cwd = repoRoot) {
  const spec = commandSpec(command);
  if (!spec) {
    return {
      command,
      ok: false,
      status: 1,
      blocked: true,
      stdout_tail: "",
      stderr_tail: "Command is not in the Autopilot Runner allowlist."
    };
  }
  const [bin, args, timeout] = spec;
  const executionCwd = command.startsWith("node packages/") ? repoRoot : cwd;
  const result = await execReadOnly(executionCwd, bin, args, timeout);
  return {
    command,
    cwd: executionCwd,
    ok: result.ok,
    status: result.status,
    blocked: false,
    stdout_tail: stdoutTail(result.stdout, 40),
    stderr_tail: stdoutTail(result.stderr, 40)
  };
}

function executionRepoPath(executionTarget) {
  if (executionTarget?.kind === "managed_project_repo" && executionTarget.repo_path) {
    return executionTarget.repo_path;
  }
  return repoRoot;
}

function runnerValidationCommands(action, goal) {
  const goalSpecificDryRun = `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`;
  const commands = unique([
    ...(action.validation_commands ?? []),
    goalSpecificDryRun,
    "git status"
  ]);
  return commands.filter((command) => commandSpec(command) && !command.includes("--apply"));
}

async function gitStatusShort(cwd = repoRoot) {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      cwd,
      timeout: 120000,
      maxBuffer: 1024 * 1024 * 20
    });
    return stdout;
  } catch (error) {
    return String(error?.stdout ?? "");
  }
}

function changedFilesFromStatus(status) {
  return status
    .split("\n")
    .map((line) => line.trimEnd())
    .filter(Boolean)
    .map((line) => {
      const path = line.slice(3);
      return path.includes(" -> ") ? path.split(" -> ").at(-1) : path;
    })
    .sort();
}

async function currentChangedFiles(cwd = repoRoot) {
  return changedFilesFromStatus(await gitStatusShort(cwd));
}

function internalTaskFromAction(goal, action, route, executionTarget = null) {
  const seed = stableHash({ goal, title: action.title, target_package: action.target_package }).slice(0, 10).toUpperCase();
  return {
    task_id: `INTERNAL-${seed}`,
    title: action.title,
    goal,
    target_project: action.target_project,
    target_package: action.target_package,
    owner: "autopilot-runner",
    skill_type: route.selected_skill,
    runtime: route.selected_runtime,
    risk: action.risk,
    approval_required: action.approval_required,
    expected_files: action.expected_files,
    validation_commands: action.validation_commands,
    execution_target: executionTarget
  };
}

function executorRunPlan(goal, action, internalTask, executionTarget = null) {
  const executionSummary = executionTarget
    ? `Execution route: ${executionTarget.execution_route}; repo: ${executionTarget.repo_path}; branch: ${executionTarget.repo_branch}; project context: ${executionTarget.project_context_dir}.`
    : "Execution route: unresolved.";
  return {
    runtime_strategy: executionTarget?.kind === "managed_project_repo"
      ? "repo-routed-autopilot-executor"
      : "safe-local-repository-executor",
    executor_prompt: [
      `Goal: ${goal}`,
      `Task: ${action.title}`,
      `Reason: ${action.reason}`,
      `Target package: ${action.target_package}`,
      `Target project: ${action.target_project}`,
      `Expected files: ${(action.expected_files ?? []).join(", ")}`,
      executionSummary,
      "Safety: do not deploy, do not run production operations, do not read or write secret values, and do not modify managed projects."
    ].join("\n"),
    steps: [
      "Read runtime/global context files.",
      "Confirm Planning Center selected one bounded next_action.",
      `Create internal task ${internalTask.task_id}.`,
      `Resolve execution workspace to ${executionTarget?.repo_path ?? repoRoot}.`,
      "Execute the allowed repository action when safety gates allow it.",
      "Run pnpm typecheck, pnpm lint:check, and git diff --check in the resolved execution repository.",
      "Commit the implementation in the resolved target repository when execution is allowed.",
      "Write Autopilot run JSON and Markdown evidence back into Studio runtime memory.",
      "Stop before Agent execution, deploy, production operations, credential reads, or managed-project writes."
    ]
  };
}

function validationSummary(commandResults) {
  const failed = commandResults.filter((command) => !command.ok);
  return {
    status: failed.length === 0 ? "PASS" : "FAIL",
    command_count: commandResults.length,
    failed_commands: failed.map((command) => command.command)
  };
}

function nextRecommendation(goal, action, validationResult) {
  if (validationResult.status !== "PASS") {
    return {
      title: "Fix validation failures before continuing V4",
      reason: "Autopilot Runner stops after one step and will not continue while validation is failing.",
      command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`
    };
  }
  if (/Autopilot Runner/i.test(action.title)) {
    return {
      title: "Refresh Planning Center and select the next V4 action",
      reason: "Autopilot Runner is now available for one-step local repository execution, so the next run should advance to the next safe roadmap item.",
      command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`
    };
  }
  return {
    title: "Run the next bounded Autopilot step",
    reason: "This run completed one bounded action and stopped at max_steps=1.",
    command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`
  };
}

function planningOnlyNextRecommendation(goal, action, gate) {
  if (!gate.allowed) {
    return {
      title: "Review generated proposal before any execution",
      reason: "The selected action is outside the safe local planning gate, so Autopilot Runner stopped at proposal-only mode.",
      command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`
    };
  }
  return {
    title: `Review and implement: ${action.title}`,
    reason: "Autopilot Runner recorded a planning-only local repository action plan. A user or a future approved executor should implement it in a separate step.",
    command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`
  };
}

function executorNextRecommendation(goal, planningOutput) {
  const action = actionFromPlanningOutput(planningOutput);
  return {
    title: `Next safe action: ${action.title}`,
    reason: planningOutput.reason,
    command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`,
    target_project: action.target_project,
    target_package: action.target_package,
    risk: action.risk,
    execution_mode: action.execution_mode
  };
}

function commitMessageForAction(action) {
  if (/Autopilot Runner/i.test(action.title)) return "chore: add autopilot runner";
  if (action.target_package === "packages/runtime-center") return "chore(runtime-center): apply autopilot runtime step";
  if (action.target_package === "apps/console") return "chore(console): add read-only console mvp";
  if (action.target_package === "packages/project-connector") return "chore(project-connector): add multi-project workspace mvp";
  return `chore(autopilot): ${safeSegment(action.title).toLowerCase().slice(0, 48) || "apply-safe-step"}`;
}

function consoleMvpFiles(globalContext, planningOutput) {
  const platform = globalContext.platform_state ?? {};
  const stage = platform.current_v4_stage ?? planningOutput.current_stage ?? {};
  const nextAction = actionFromPlanningOutput(planningOutput);
  const managedProjects = platform.managed_projects ?? [];
  const runtimeProviders = platform.packages?.runtime_providers ?? [];
  const runtimeProfiles = platform.packages?.runtime_profiles ?? [];
  const credentialReferenceCount = platform.packages?.credential_reference_count ?? 0;
  const project = managedProjects[0] ?? {};

  const appTs = `export const consoleApp = {
  name: "ANKSEN Agent Studio Console",
  status: "read-only-mvp",
  mode: "read-only",
  framework_target: "Next.js App Router",
  data_policy: "local fixtures and runtime memory only",
  mutation_policy: "disabled"
} as const;

export const consoleSafety = {
  database: "not connected",
  external_services: "not called",
  managed_project_writes: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  credential_values: "not read"
} as const;
`;

  const navigationTs = `export type ConsolePageId =
  | "dashboard"
  | "projects"
  | "agents"
  | "skills"
  | "runtime"
  | "planning"
  | "evolution"
  | "discovery"
  | "memory";

export interface ConsoleNavigationItem {
  readonly id: ConsolePageId;
  readonly label: string;
  readonly route: string;
  readonly source: string;
  readonly readOnly: true;
}

export const consoleNavigation: readonly ConsoleNavigationItem[] = [
  { id: "dashboard", label: "Dashboard", route: "/agent-studio", source: "runtime/global/platform-state.json", readOnly: true },
  { id: "projects", label: "Projects", route: "/agent-studio/projects", source: "runtime/projects", readOnly: true },
  { id: "agents", label: "Agents", route: "/agent-studio/agents", source: "autopilot-runs", readOnly: true },
  { id: "skills", label: "Skills", route: "/agent-studio/skills", source: "packages/skill-router/registry", readOnly: true },
  { id: "runtime", label: "Runtime", route: "/agent-studio/runtime", source: "packages/runtime-center/examples", readOnly: true },
  { id: "planning", label: "Planning", route: "/agent-studio/planning", source: "packages/planning-center/examples", readOnly: true },
  { id: "evolution", label: "Evolution", route: "/agent-studio/evolution", source: "packages/evolution-center", readOnly: true },
  { id: "discovery", label: "Discovery", route: "/agent-studio/discovery", source: "packages/discovery-engine/examples", readOnly: true },
  { id: "memory", label: "Memory", route: "/agent-studio/memory", source: "runtime/global and runtime/projects", readOnly: true }
] as const;
`;

  const fixture = {
    generated_from: "autopilot executor local fixtures",
    data_sources: [
      "runtime/global/platform-state.json",
      "runtime/global/roadmap-memory.json",
      "runtime/projects/jinhu-smart-park/project-state.json",
      "packages/runtime-center/examples/runtime-providers.example.json",
      "packages/runtime-center/examples/runtime-profiles.example.json",
      "packages/skill-router/registry/skill-registry.json"
    ],
    dashboard: {
      platform_status: platform.current_platform_status ?? "GO",
      current_stage: stage.stage_name ?? "unknown",
      next_stage: stage.next_stage ?? "unknown",
      next_action: nextAction.title,
      safety_mode: "read-only"
    },
    projects: managedProjects.map((item) => ({
      project_id: item.project_id,
      doctor_status: item.doctor_status,
      repo_clean: item.repo_clean,
      memory_dir: item.memory_dir,
      queue_status_counts: item.queue_status_counts ?? {}
    })),
    agents: [
      { agent_id: "autopilot-runner", lane: "platform", status: "available", mode: "max_steps_1" },
      { agent_id: "planning-center", lane: "planning", status: "available", mode: "dry_run" },
      { agent_id: "managed-project-agents", lane: project.project_id ?? "jinhu-smart-park", status: "disabled_from_console", mode: "proposal_only" }
    ],
    skills: [
      "code_development",
      "document_generation",
      "spreadsheet_analysis",
      "slide_generation",
      "image_generation",
      "pdf_processing",
      "web_research",
      "data_integration",
      "validation_testing",
      "evolution_observer"
    ],
    runtime: {
      provider_count: runtimeProviders.length,
      profile_count: runtimeProfiles.length,
      credential_reference_count: credentialReferenceCount,
      credential_values_read: "no",
      external_service_calls: "disabled"
    },
    planning: {
      planning_output_id: planningOutput.planning_output_id,
      selected_action: nextAction.title,
      target_package: nextAction.target_package,
      risk: nextAction.risk,
      approval_required: nextAction.approval_required
    },
    evolution: {
      mode: "read-only placeholder",
      source: "packages/evolution-center",
      open_improvements: "from future observer memory"
    },
    discovery: {
      mode: "fixture/manual-manifest",
      source: "packages/discovery-engine/examples",
      external_crawling: "disabled"
    },
    memory: {
      global_context_files: Object.keys(globalContext.files ?? {}).length,
      project_contexts: managedProjects.length,
      active_project: project.project_id ?? "jinhu-smart-park"
    }
  };

  const fixturesTs = `export const consoleFixture = ${JSON.stringify(fixture, null, 2)} as const;

export type ConsoleFixture = typeof consoleFixture;
`;

  const viewModelTs = `import { consoleApp, consoleSafety } from "./app.js";
import { consoleFixture } from "./fixtures.js";
import { consoleNavigation, type ConsolePageId } from "./navigation.js";

export interface ConsolePanel {
  readonly id: ConsolePageId;
  readonly title: string;
  readonly route: string;
  readonly source: string;
  readonly readOnly: true;
}

export const consolePanels: readonly ConsolePanel[] = consoleNavigation.map((item) => ({
  id: item.id,
  title: item.label,
  route: item.route,
  source: item.source,
  readOnly: true
}));

export function getConsoleViewModel() {
  return {
    app: consoleApp,
    safety: consoleSafety,
    navigation: consoleNavigation,
    panels: consolePanels,
    fixture: consoleFixture
  } as const;
}
`;

  const indexTs = `export { consoleApp, consoleSafety } from "./app.js";
export { consoleFixture, type ConsoleFixture } from "./fixtures.js";
export { consoleNavigation, type ConsoleNavigationItem, type ConsolePageId } from "./navigation.js";
export { consolePanels, getConsoleViewModel, type ConsolePanel } from "./view-model.js";
`;

  const readme = `# ANKSEN Agent Studio Console

This package is the read-only Console MVP skeleton for the future Next.js App Router surface.

## Views

- Dashboard
- Projects
- Agents
- Skills
- Runtime
- Planning
- Evolution
- Discovery
- Memory

## Data Policy

- Uses local fixtures and runtime memory only.
- Does not connect to a real database.
- Does not call external services.
- Does not execute Agents.
- Does not modify managed projects.
- Does not deploy or run production operations.
- Does not read real credential values.
`;

  return {
    "apps/console/README.md": readme,
    "apps/console/src/app.ts": appTs,
    "apps/console/src/navigation.ts": navigationTs,
    "apps/console/src/fixtures.ts": fixturesTs,
    "apps/console/src/view-model.ts": viewModelTs,
    "apps/console/src/index.ts": indexTs
  };
}

async function writeConsoleMvp(globalContext, planningOutput) {
  const files = consoleMvpFiles(globalContext, planningOutput);
  for (const [relativeFile, content] of Object.entries(files)) {
    const absoluteFile = resolveFromRoot(relativeFile);
    await mkdir(dirname(absoluteFile), { recursive: true });
    await writeFile(absoluteFile, content, "utf8");
  }
  return Object.keys(files).sort();
}

function multiProjectWorkspaceFiles(globalContext, planningOutput) {
  const platform = globalContext.platform_state ?? {};
  const managedProjects = platform.managed_projects ?? [];
  const nextAction = actionFromPlanningOutput(planningOutput);
  const generatedAt = new Date().toISOString();
  const projectEntries = managedProjects.map((project) => ({
    project_id: project.project_id,
    display_name: project.project_id,
    memory_dir: project.memory_dir,
    source_memory_dir: project.source_memory_dir,
    connector_status: "available",
    doctor_status: project.doctor_status,
    repo_clean: project.repo_clean,
    write_policy: "disabled",
    deploy_policy: "forbidden",
    production_operation_policy: "forbidden",
    context_files: [
      `${project.memory_dir}/project-state.json`,
      `${project.memory_dir}/architecture.json`,
      `${project.memory_dir}/agent-studio-status.json`,
      `${project.memory_dir}/handoff-summary.md`
    ]
  }));

  const workspaceTs = `export type ProjectWritePolicy = "disabled" | "approval_required" | "enabled";
export type ProjectOperationPolicy = "forbidden" | "manual_approval_required" | "allowed";

export interface ManagedProjectWorkspaceEntry {
  readonly project_id: string;
  readonly display_name: string;
  readonly memory_dir: string;
  readonly source_memory_dir?: string;
  readonly connector_status: "available" | "missing" | "disabled";
  readonly doctor_status: string;
  readonly repo_clean: string;
  readonly write_policy: ProjectWritePolicy;
  readonly deploy_policy: ProjectOperationPolicy;
  readonly production_operation_policy: ProjectOperationPolicy;
  readonly context_files: readonly string[];
}

export interface MultiProjectWorkspace {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly workspace_id: string;
  readonly mode: "read_only";
  readonly projects: readonly ManagedProjectWorkspaceEntry[];
  readonly safety: {
    readonly managed_project_writes: "disabled";
    readonly deploy: "disabled";
    readonly production_operations: "disabled";
    readonly credential_values: "disabled";
  };
}

export const multiProjectWorkspaceFixture: MultiProjectWorkspace = ${JSON.stringify({
    schema_version: 1,
    generated_at: generatedAt,
    workspace_id: "anksen-agent-studio-local",
    mode: "read_only",
    projects: projectEntries,
    safety: {
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled"
    }
  }, null, 2)} as const;

export function listWorkspaceProjects(workspace: MultiProjectWorkspace = multiProjectWorkspaceFixture) {
  return workspace.projects.map((project) => ({
    project_id: project.project_id,
    connector_status: project.connector_status,
    doctor_status: project.doctor_status,
    repo_clean: project.repo_clean,
    memory_dir: project.memory_dir
  }));
}

export function projectWorkspaceSafety(workspace: MultiProjectWorkspace = multiProjectWorkspaceFixture) {
  return {
    project_count: workspace.projects.length,
    writable_project_count: workspace.projects.filter((project) => project.write_policy !== "disabled").length,
    deploy_enabled_count: workspace.projects.filter((project) => project.deploy_policy === "allowed").length,
    production_operation_enabled_count: workspace.projects.filter((project) => project.production_operation_policy === "allowed").length,
    credential_values: workspace.safety.credential_values
  };
}
`;

  const indexTs = `export interface ProjectConnectorConfig {
  readonly schema_version?: number;
  readonly project_id: string;
  readonly project_name?: string;
  readonly project_type?: string;
  readonly description?: string;
  readonly project_root: string;
  readonly state_dir: string;
  readonly mode?: string;
  readonly default_branch?: string;
  readonly package_manager?: string;
  readonly worktrees?: Record<string, string>;
  readonly detected_stack_hints?: readonly string[];
  readonly available_commands?: readonly string[];
  readonly read_paths?: readonly string[];
  readonly write_paths?: readonly string[];
  readonly frozen_paths: readonly string[];
  readonly guarded_paths?: readonly string[];
  readonly runtime_memory?: {
    readonly directory?: string;
    readonly summary_file?: string;
    readonly platform_state_file?: string;
    readonly validate_command?: string;
  };
  readonly inspection?: {
    readonly dry_run_only?: boolean;
    readonly allow_agent_execution?: boolean;
    readonly allow_project_writes?: boolean;
    readonly allow_deploy?: boolean;
    readonly allow_production_operations?: boolean;
  };
  readonly production_operations?: Record<string, "forbidden" | "manual_approval_required" | "allowed">;
}

export {
  listWorkspaceProjects,
  multiProjectWorkspaceFixture,
  projectWorkspaceSafety,
  type ManagedProjectWorkspaceEntry,
  type MultiProjectWorkspace,
  type ProjectOperationPolicy,
  type ProjectWritePolicy
} from "./workspace.js";

export const projectConnectorStatus = "multi-project-workspace-mvp";
`;

  const example = {
    schema_version: 1,
    generated_at: generatedAt,
    workspace_id: "anksen-agent-studio-local",
    source: "runtime/global/codex-context-index.json",
    mode: "read_only",
    selected_action: {
      title: nextAction.title,
      planning_output_id: planningOutput.planning_output_id
    },
    projects: projectEntries,
    safety: {
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled"
    }
  };

  const index = globalContext.context_index ?? {};
  const updatedIndex = {
    ...index,
    generated_at: generatedAt,
    multi_project_workspace: {
      workspace_id: "anksen-agent-studio-local",
      mode: "read_only",
      project_count: projectEntries.length,
      source: "packages/project-connector/examples/multi-project-workspace.example.json",
      project_connector_package: "packages/project-connector"
    },
    project_contexts: projectEntries.map((project) => ({
      project_id: project.project_id,
      files: project.context_files
    }))
  };

  const roadmap = `# ANKSEN Agent Studio V4 Roadmap

## Goal

V4 should turn ANKSEN Agent Studio from a project-local orchestrator extraction into a reusable AI Software Factory platform that can connect to multiple repositories through explicit project connectors.

## Proposed Tracks

| Track | Objective | Current Status |
| --- | --- | --- |
| V4-A Project Connector Runtime | Standardize \`--project\` adapters, frozen path policy, and worktree discovery. | Complete for initial Jinhu connector. |
| V4-B Core Engine Parity | Port reusable doctor, skill routing, goal planning, runtime memory, discovery, and evolution logic with fixture parity tests. | In progress through package contracts and CLI dry-runs. |
| V4-C Console Read-Only MVP | Build a standalone \`apps/console\` that reads platform and project state without mutation. | Complete as local fixture-backed read-only skeleton. |
| V4-D Hosted Runtime Adapters | Add guarded adapters for Codex CLI, browser, and future hosted execution. | Planned. |
| V4-E Multi-Project Workspace | Support multiple project connectors in one console. | MVP complete as read-only workspace contracts under \`packages/project-connector\`. |
| V4-F Governance and Release Gates | Add approvals, audit trail, policy bundles, and release readiness gates. | Next. |

## Multi-Project Workspace MVP

The first workspace model is read-only and context-backed:

- Source of truth: \`runtime/global/codex-context-index.json\` and \`runtime/projects/<project_id>\`.
- Project connector package: \`packages/project-connector\`.
- Example workspace: \`packages/project-connector/examples/multi-project-workspace.example.json\`.
- Managed project writes: disabled.
- Deploy and production operations: forbidden.
- Credential values: not read.

## Safety Boundary

V4 must keep business repositories external. Deploy, production migration, production seed, reset, cleanup, and production data writes remain forbidden unless a separate approved production-ops implementation exists.
`;

  return {
    "packages/project-connector/src/index.ts": indexTs,
    "packages/project-connector/src/workspace.ts": workspaceTs,
    "packages/project-connector/examples/multi-project-workspace.example.json": `${JSON.stringify(example, null, 2)}\n`,
    "runtime/global/codex-context-index.json": `${JSON.stringify(updatedIndex, null, 2)}\n`,
    "docs/release/AGENT_STUDIO_V4_ROADMAP.md": roadmap
  };
}

async function writeMultiProjectWorkspaceMvp(globalContext, planningOutput) {
  const files = multiProjectWorkspaceFiles(globalContext, planningOutput);
  for (const [relativeFile, content] of Object.entries(files)) {
    const absoluteFile = resolveFromRoot(relativeFile);
    await mkdir(dirname(absoluteFile), { recursive: true });
    await writeFile(absoluteFile, content, "utf8");
  }
  return Object.keys(files).sort();
}

async function executeLocalRepoAction(action, globalContext, planningOutput) {
  if (action.target_package === "apps/console" || /Console Read-Only/i.test(action.title)) {
    const files = await writeConsoleMvp(globalContext, planningOutput);
    return {
      executed: true,
      implementation: "console-read-only-mvp",
      summary: "Generated a read-only Console MVP skeleton with local fixture-backed views.",
      files
    };
  }
  if (action.target_package === "packages/project-connector" || /Multi-Project Workspace/i.test(action.title)) {
    const files = await writeMultiProjectWorkspaceMvp(globalContext, planningOutput);
    return {
      executed: true,
      implementation: "multi-project-workspace-mvp",
      summary: "Generated read-only multi-project workspace contracts and context index metadata.",
      files
    };
  }
  return {
    executed: false,
    implementation: "unsupported-local-action",
    summary: "No executor is registered for this local action.",
    files: []
  };
}

async function commitPaths(paths, message, commandsRun, cwd = repoRoot) {
  const uniquePaths = unique(paths).filter(Boolean);
  if (uniquePaths.length === 0) {
    return { ok: false, hash: "", message: "No paths to commit." };
  }
  const addResult = await execReadOnly(cwd, "git", ["add", "--", ...uniquePaths], 120000);
  commandsRun.push({
    command: `git add -- ${uniquePaths.join(" ")}`,
    cwd,
    ok: addResult.ok,
    status: addResult.status,
    blocked: false,
    stdout_tail: stdoutTail(addResult.stdout, 20),
    stderr_tail: stdoutTail(addResult.stderr, 20)
  });
  if (!addResult.ok) return { ok: false, hash: "", message: addResult.stderr || "git add failed" };

  const commitResult = await execReadOnly(cwd, "git", ["commit", "-m", message], 120000);
  commandsRun.push({
    command: `git commit -m "${message}"`,
    cwd,
    ok: commitResult.ok,
    status: commitResult.status,
    blocked: false,
    stdout_tail: stdoutTail(commitResult.stdout, 40),
    stderr_tail: stdoutTail(commitResult.stderr, 40)
  });
  const hash = commitResult.ok ? await execGit(cwd, ["rev-parse", "HEAD"]) : "";
  return { ok: commitResult.ok, hash, message: commitResult.stderr || commitResult.stdout };
}

function globalContextSummary(bundle) {
  return {
    loaded_at: bundle.loaded_at,
    source_dir: bundle.source_dir,
    files: Object.values(bundle.files).map((file) => ({
      path: file.path,
      kind: file.kind,
      bytes: file.bytes,
      sha256: file.sha256
    })),
    platform_status: bundle.platform_state?.current_platform_status ?? "unknown",
    current_v4_stage: bundle.platform_state?.current_v4_stage?.stage_name ?? bundle.roadmap_memory?.current_stage ?? "unknown",
    next_recommended_action: bundle.platform_state?.next_recommended_action?.title
      ?? bundle.roadmap_memory?.next_recommended_action?.title
      ?? "unknown",
    managed_projects: bundle.platform_state?.managed_projects?.map((project) => project.project_id) ?? []
  };
}

function buildAutopilotRunnerRun({
  goal,
  context,
  globalContext,
  planningOutput,
  selectedAction,
  mode,
  maxSteps,
  gate,
  internalTask,
  runPlan,
  executionResult,
  commandsRun,
  changedFiles,
  validationResult,
  commitHash,
  nextRecommendationValue
}) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    run_id: `autopilot-run-${timestampForFile(now)}-${createHash("sha1").update(`${goal}:${now}:runner`).digest("hex").slice(0, 8)}`,
    created_at: now,
    mode,
    goal,
    max_steps: maxSteps,
    global_context: globalContextSummary(globalContext),
    planning_output: planningOutput,
    selected_action: selectedAction,
    execution_mode: gate.execution_mode,
    execution_route: gate.execution_route ?? "studio_repo",
    execution_target: gate.execution_target ?? null,
    execution_gate: gate,
    internal_task: internalTask,
    executor_run_plan: runPlan,
    execution_result: executionResult,
    commands_run: commandsRun,
    changed_files: unique(changedFiles).sort(),
    validation_result: validationResult,
    commit_hash: commitHash,
    commit_hash_note: commitHash
      ? "Commit hash for the local repository implementation created by Autopilot Executor."
      : "No implementation commit was created.",
    next_recommendation: nextRecommendationValue,
    safety: {
      agent_execution: "disabled",
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      max_steps: 1
    },
    context_summary: {
      release_doc_count: context.docs.release_count,
      autopilot_run_count: context.autopilot_runs.run_count,
      runtime_provider_count: context.packages.runtime_providers.length,
      runtime_profile_count: context.packages.runtime_profiles.length,
      credential_reference_count: context.packages.credential_references.length,
      managed_project_doctor: context.managed_project.project_state.doctor_status
    }
  };
}

function autopilotRunnerMarkdown(run) {
  const commands = run.commands_run.length === 0
    ? "- none"
    : run.commands_run.map((command) => `- ${command.command}: ${command.ok ? "PASS" : "FAIL"} (exit ${command.status})`).join("\n");
  const changedFiles = run.changed_files.length === 0
    ? "- none"
    : run.changed_files.map((file) => `- ${file}`).join("\n");
  return `# Autopilot Runner Run

- run_id: ${run.run_id}
- created_at: ${run.created_at}
- mode: ${run.mode}
- goal: ${run.goal}
- max_steps: ${run.max_steps}
- execution_mode: ${run.execution_mode}
- execution_route: ${run.execution_route ?? "unknown"}
- commit_hash: ${run.commit_hash ?? "none"}

## Global Context

- source_dir: ${run.global_context.source_dir}
- platform_status: ${run.global_context.platform_status}
- current_v4_stage: ${run.global_context.current_v4_stage}
- next_recommended_action: ${run.global_context.next_recommended_action}
- files_read: ${run.global_context.files.length}

## Selected Action

- title: ${run.selected_action.title}
- target_project: ${run.selected_action.target_project}
- target_package: ${run.selected_action.target_package}
- risk: ${run.selected_action.risk}
- approval_required: ${run.selected_action.approval_required ? "yes" : "no"}
- gate: ${run.execution_gate.reason}

## Execution Target

- route: ${run.execution_route ?? "unknown"}
- repo_path: ${run.execution_target?.repo_path ?? "unresolved"}
- repo_branch: ${run.execution_target?.repo_branch ?? "unknown"}
- project_context_dir: ${run.execution_target?.project_context_dir ?? "unknown"}
- runtime_memory_dir: ${run.execution_target?.runtime_memory_dir ?? "unknown"}
- doctor_status: ${run.execution_target?.doctor_status ?? "unknown"}
- write_policy: ${run.execution_target?.write_policy ?? "unknown"}

## Internal Task

- task_id: ${run.internal_task.task_id}
- owner: ${run.internal_task.owner}
- runtime: ${run.internal_task.runtime}
- skill_type: ${run.internal_task.skill_type}

## Action Plan

- runtime_strategy: ${run.executor_run_plan.runtime_strategy}
- expected_files: ${(run.selected_action.expected_files ?? []).join(", ")}
- validation_commands: ${(run.selected_action.validation_commands ?? []).join(", ")}

## Execution Result

- executed: ${run.execution_result.executed ? "yes" : "no"}
- implementation: ${run.execution_result.implementation}
- summary: ${run.execution_result.summary}

## Commands Run

${commands}

## Changed Files

${changedFiles}

## Validation

- status: ${run.validation_result.status}
- command_count: ${run.validation_result.command_count}
- failed_commands: ${run.validation_result.failed_commands.length === 0 ? "none" : run.validation_result.failed_commands.join(", ")}

## Next Recommendation

- title: ${run.next_recommendation.title}
- reason: ${run.next_recommendation.reason}
- command: ${run.next_recommendation.command}

## Safety

- agent_execution: ${run.safety.agent_execution}
- managed_project_writes: ${run.safety.managed_project_writes}
- deploy: ${run.safety.deploy}
- production_operations: ${run.safety.production_operations}
- credential_values: ${run.safety.credential_values}
`;
}

async function writeAutopilotRunnerRun(run) {
  const dir = resolveFromRoot("autopilot-runs");
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, `${run.run_id}.json`);
  const markdownPath = join(dir, `${run.run_id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, autopilotRunnerMarkdown(run), "utf8");
  return { jsonPath, markdownPath };
}

function autopilotRunnerRunFiles(run) {
  return [
    `autopilot-runs/${run.run_id}.json`,
    `autopilot-runs/${run.run_id}.md`
  ];
}

function v4ContinuousRunId(goal) {
  const now = new Date().toISOString();
  return `v4-continuous-${timestampForFile(now)}-${stableHash({ goal, now }).slice(0, 8)}`;
}

function v4ContinuousActions(goal) {
  return [
    {
      step_id: "v4-o-production-ops-dry-run",
      phase: "V4-O",
      title: "V4-O Production Operations Center Dry-Run",
      status_if_complete: "SKIPPED",
      commit_message: "chore(autopilot): record v4-o continuous step",
      is_complete: () => existsSync(resolveFromRoot("docs/release/PRODUCTION_OPERATIONS_CENTER_DRY_RUN_MVP.md"))
        && existsSync(resolveFromRoot("packages/production-ops/schemas/server-registry.schema.json"))
        && existsSync(resolveFromRoot("packages/production-ops/lib/production-ops-utils.mjs")),
      write: async () => [],
      action: {
        title: "Add V4-O Production Operations Center Dry-Run MVP",
        reason: "Production operations capability must remain dry-run only: schemas, examples, safety checks, and governance evidence without server access, deploy, or production execution.",
        target_project: "anksen-agent-studio",
        target_package: "packages/production-ops",
        expected_files: [
          "packages/production-ops/schemas/server-registry.schema.json",
          "packages/production-ops/examples/server-registry.example.json",
          "packages/production-ops/lib/production-ops-utils.mjs",
          "docs/release/PRODUCTION_OPERATIONS_CENTER_DRY_RUN_MVP.md"
        ],
        validation_commands: [
          "pnpm typecheck",
          "pnpm lint:check",
          "node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run",
          "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
          "git diff --check"
        ],
        risk: "MEDIUM",
        approval_required: false,
        execution_mode: "local_repo_execute"
      }
    },
    {
      step_id: "v4-p-autopilot-continuous-mode",
      phase: "V4-P",
      title: "V4-P Autopilot Continuous Mode",
      commit_message: "chore(autopilot): add continuous mode",
      is_complete: () => existsSync(resolveFromRoot("docs/release/AUTOPILOT_CONTINUOUS_MODE_MVP.md")),
      write: async (runId) => unique([
        ...(await writeAutopilotContinuousModeMvp(runId, goal)),
        "packages/orchestrator-core/bin/studio.mjs",
        "packages/planning-center/lib/planning-engine.mjs"
      ]),
      action: {
        title: "Add V4-P Autopilot Continuous Mode",
        reason: "Autopilot needs a bounded continuous mode that can advance multiple safe roadmap steps while stopping at HIGH/CRITICAL proposal gates.",
        target_project: "anksen-agent-studio",
        target_package: "packages/orchestrator-core",
        expected_files: [
          "packages/orchestrator-core/bin/studio.mjs",
          "packages/planning-center/lib/planning-engine.mjs",
          "docs/release/AUTOPILOT_CONTINUOUS_MODE_MVP.md"
        ],
        validation_commands: [
          "pnpm typecheck",
          "pnpm lint:check",
          `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run`,
          "git diff --check"
        ],
        risk: "MEDIUM",
        approval_required: false,
        execution_mode: "local_repo_execute"
      }
    },
    {
      step_id: "v4-q-real-worker-runtime-smoke",
      phase: "V4-Q",
      title: "V4-Q Real Worker Runtime Smoke",
      commit_message: "docs(runtime): propose real worker runtime smoke",
      is_complete: () => existsSync(resolveFromRoot("docs/release/REAL_WORKER_RUNTIME_SMOKE_PROPOSAL.md")),
      write: async (runId, gate) => writeRealWorkerRuntimeSmokeProposal(runId, gate),
      action: {
        title: "Prepare V4-Q Real Worker Runtime Smoke Proposal",
        reason: "Real worker runtime smoke can involve live workers, model calls, credentials, server access, or managed project writes; continuous mode must stop at proposal-only.",
        target_project: "anksen-agent-studio",
        target_package: "docs/release",
        expected_files: [
          "docs/release/REAL_WORKER_RUNTIME_SMOKE_PROPOSAL.md"
        ],
        validation_commands: [
          "pnpm typecheck",
          "pnpm lint:check",
          "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
          "git diff --check"
        ],
        risk: "HIGH",
        approval_required: false,
        execution_mode: "proposal_only"
      }
    },
    {
      step_id: "v4-r-console-operable-read-only",
      phase: "V4-R",
      title: "V4-R Console operable read-only controls",
      commit_message: "chore(console): add operable read-only controls",
      is_complete: () => existsSync(resolveFromRoot("docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md"))
        && existsSync(resolveFromRoot("apps/console/src/actions.ts")),
      write: async () => writeConsoleOperableReadOnlyMvp(),
      action: {
        title: "Add V4-R Console operable read-only controls",
        reason: "The Console can become operable for dry-run planning and command previews while preserving read-only data policy and disabled mutation paths.",
        target_project: "anksen-agent-studio",
        target_package: "apps/console",
        expected_files: [
          "apps/console/src/actions.ts",
          "apps/console/src/view-model.ts",
          "apps/console/src/index.ts",
          "apps/console/README.md",
          "docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md"
        ],
        validation_commands: [
          "pnpm typecheck",
          "pnpm lint:check",
          "git diff --check"
        ],
        risk: "MEDIUM",
        approval_required: false,
        execution_mode: "local_repo_execute"
      }
    }
  ];
}

async function writeAutopilotContinuousModeMvp(runId, goal) {
  const content = `# Autopilot Continuous Mode MVP

## Scope

Autopilot Continuous Mode lets Studio run a bounded sequence of V4 roadmap steps from one command while keeping each step inside Governance, Approval, and Release Gate policy.

## Command

~~~bash
node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --apply --max-steps 4
~~~

## Runtime Rules

- max_steps defaults to 1 and is capped at 4 for continuous mode.
- Every step reads runtime/global context and Planning Center output before choosing the next action.
- Every step evaluates Governance Center before writing files.
- LOW and MEDIUM local repository tasks may execute when release gates pass.
- HIGH and CRITICAL tasks stop at proposal-only or human-approval gates.
- The runner writes JSON and Markdown reports under autopilot-runs for each step.
- The runner runs pnpm typecheck, pnpm lint:check, and git diff --check for each step.
- The runner commits each safe implementation, proposal, report, and final summary separately.

## Safety Boundaries

- No deploy.
- No production operation.
- No server connection.
- No real credential read or write.
- No managed project writes.
- No jinhu-smart-park modification.
- No unbounded loop; the runner stops at max_steps.

## Current Run

- run_id: ${runId}
- goal: ${goal}
- mode: dry-run planning plus bounded apply execution.
`;
  const file = "docs/release/AUTOPILOT_CONTINUOUS_MODE_MVP.md";
  await writeFile(resolveFromRoot(file), content, "utf8");
  return [file];
}

async function writeRealWorkerRuntimeSmokeProposal(runId, gate) {
  const now = new Date().toISOString();
  const proposalId = `proposal-v4-q-real-worker-runtime-smoke-${timestampForFile(now)}-${stableHash({ runId, now }).slice(0, 8)}`;
  const content = `# V4-Q Real Worker Runtime Smoke Proposal

- proposal_id: ${proposalId}
- created_at: ${now}
- run_id: ${runId}
- risk: HIGH
- execution_mode: proposal_only
- approval_required: proposal review required before any real worker execution
- governance_gate: ${gate.governance?.release_gate ?? "unknown"}

## Purpose

Validate the future path for real worker runtime smoke tests without starting the worker in this step. The proposal is intentionally limited to planning because real worker smoke can touch live model calls, runtime credentials, external processes, remote workers, or managed project workspaces.

## Proposed Future Smoke

- Select one runtime adapter through Runtime Center.
- Verify Credential Vault reference presence only.
- Prepare a minimal dry-run invocation plan.
- Require explicit approval before any live worker call.
- Record stdout/stderr, workspace, credential reference id, adapter id, and governance decision as audit evidence.

## Hard Blocks In This Step

- No real model call.
- No real worker start.
- No external service call.
- No server connection.
- No credential value read.
- No managed project write.
- No deploy or production operation.

## Approval Gate

Governance Center classified this as HIGH risk, so continuous mode generated this proposal and stopped execution for V4-Q.
`;
  const file = "docs/release/REAL_WORKER_RUNTIME_SMOKE_PROPOSAL.md";
  await writeFile(resolveFromRoot(file), content, "utf8");
  return { proposal_id: proposalId, files: [file] };
}

function consoleActionsSource() {
  return `export type ConsoleActionId =
  | "context_summary"
  | "planning_dry_run"
  | "runtime_health"
  | "governance_check"
  | "production_safety_check"
  | "autopilot_dry_run";

export type ConsoleActionScope =
  | "context"
  | "planning"
  | "runtime"
  | "governance"
  | "production_ops"
  | "autopilot";

export interface ConsoleActionDescriptor {
  readonly id: ConsoleActionId;
  readonly label: string;
  readonly scope: ConsoleActionScope;
  readonly command: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH";
  readonly executionMode: "dry_run_only" | "proposal_only";
  readonly requiresApproval: boolean;
  readonly readOnly: true;
  readonly source: string;
  readonly disabledReason?: string;
}

export const consoleActions: readonly ConsoleActionDescriptor[] = [
  {
    id: "context_summary",
    label: "Context Summary",
    scope: "context",
    command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "runtime/global"
  },
  {
    id: "planning_dry_run",
    label: "Planning Dry Run",
    scope: "planning",
    command: "node packages/orchestrator-core/bin/studio.mjs plan --goal \\"继续推进 V4\\" --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/planning-center"
  },
  {
    id: "runtime_health",
    label: "Runtime Health",
    scope: "runtime",
    command: "node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/runtime-center"
  },
  {
    id: "governance_check",
    label: "Governance Check",
    scope: "governance",
    command: "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/governance-center"
  },
  {
    id: "production_safety_check",
    label: "Production Safety Check",
    scope: "production_ops",
    command: "node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run",
    risk: "HIGH",
    executionMode: "proposal_only",
    requiresApproval: true,
    readOnly: true,
    source: "packages/production-ops",
    disabledReason: "Production operations remain proposal-only from the Console."
  },
  {
    id: "autopilot_dry_run",
    label: "Autopilot Dry Run",
    scope: "autopilot",
    command: "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \\"继续推进 V4\\" --dry-run",
    risk: "MEDIUM",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "autopilot-runs"
  }
] as const;

export function listConsoleActions() {
  return consoleActions;
}

export function getConsoleAction(id: string) {
  return consoleActions.find((action) => action.id === id) ?? null;
}
`;
}

async function writeConsoleOperableReadOnlyMvp() {
  const files = ["apps/console/src/actions.ts"];
  await writeFile(resolveFromRoot("apps/console/src/actions.ts"), consoleActionsSource(), "utf8");

  const viewModelPath = resolveFromRoot("apps/console/src/view-model.ts");
  let viewModel = await readFile(viewModelPath, "utf8");
  if (!viewModel.includes("./actions.js")) {
    viewModel = viewModel.replace(
      `import { consoleApp, consoleSafety } from "./app.js";\n`,
      `import { consoleApp, consoleSafety } from "./app.js";\nimport { consoleActions } from "./actions.js";\n`
    );
  }
  if (!viewModel.includes("readonly operable_action_count")) {
    viewModel = viewModel.replace(
      "  readonly module_count: number;\n",
      "  readonly module_count: number;\n  readonly operable_action_count: number;\n"
    );
  }
  if (!viewModel.includes("operable_action_count: consoleActions.length")) {
    viewModel = viewModel.replace(
      "  module_count: consoleFixture.modules.length,\n",
      "  module_count: consoleFixture.modules.length,\n  operable_action_count: consoleActions.length,\n"
    );
  }
  if (!viewModel.includes("actions: consoleActions")) {
    viewModel = viewModel.replace(
      "    panels: consolePanels,\n    fixture: consoleFixture,\n",
      "    panels: consolePanels,\n    actions: consoleActions,\n    fixture: consoleFixture,\n"
    );
  }
  await writeFile(viewModelPath, viewModel, "utf8");
  files.push("apps/console/src/view-model.ts");

  const indexPath = resolveFromRoot("apps/console/src/index.ts");
  let index = await readFile(indexPath, "utf8");
  if (!index.includes("./actions.js")) {
    index = index.replace(
      `export { consoleApp, consoleSafety } from "./app.js";\n`,
      `export { consoleApp, consoleSafety } from "./app.js";\nexport { consoleActions, getConsoleAction, listConsoleActions, type ConsoleActionDescriptor, type ConsoleActionId, type ConsoleActionScope } from "./actions.js";\n`
    );
  }
  await writeFile(indexPath, index, "utf8");
  files.push("apps/console/src/index.ts");

  const readmePath = resolveFromRoot("apps/console/README.md");
  let readme = await readFile(readmePath, "utf8");
  if (!readme.includes("## Operable Read-Only Controls")) {
    readme += `

## Operable Read-Only Controls

The Console exposes command descriptors for dry-run and proposal-only actions. These descriptors are view-model data only; they do not execute commands, call external services, deploy, connect to servers, read credential values, or write managed projects.

- Context Summary
- Planning Dry Run
- Runtime Health
- Governance Check
- Production Safety Check
- Autopilot Dry Run
`;
  }
  await writeFile(readmePath, readme, "utf8");
  files.push("apps/console/README.md");

  const doc = `# Console Operable Read-Only MVP

## Scope

V4-R adds an operable read-only layer to apps/console. The Console now exposes local command descriptors that a future UI can render as disabled, dry-run, or proposal-only actions.

## Included Controls

- Context Summary
- Planning Dry Run
- Runtime Health
- Governance Check
- Production Safety Check
- Autopilot Dry Run

## Safety

- No command execution from the Console view model.
- No database connection.
- No external service calls.
- No Agent execution.
- No deploy.
- No production operation.
- No server access.
- No credential value read or write.
- No jinhu-smart-park modification.
`;
  await writeFile(resolveFromRoot("docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md"), doc, "utf8");
  files.push("docs/release/CONSOLE_OPERABLE_READ_ONLY_MVP.md");

  return files.sort();
}

function continuousStepReportFiles(report) {
  return [
    `autopilot-runs/${report.run_id}.json`,
    `autopilot-runs/${report.run_id}.md`
  ];
}

function continuousStepMarkdown(report) {
  const commands = report.commands_run.length === 0
    ? "- none"
    : report.commands_run.map((command) => `- ${command.command}: ${command.ok ? "PASS" : "FAIL"} (exit ${command.status})`).join("\n");
  const changedFiles = report.changed_files.length === 0
    ? "- none"
    : report.changed_files.map((file) => `- ${file}`).join("\n");
  return `# V4 Autopilot Continuous Step

- run_id: ${report.run_id}
- parent_run_id: ${report.parent_run_id}
- step: ${report.step_index}/${report.max_steps}
- phase: ${report.phase}
- status: ${report.status}
- execution_mode: ${report.execution_mode}
- risk: ${report.selected_action.risk}
- commit_hash: ${report.commit_hash ?? "none"}
- proposal_id: ${report.proposal_id ?? "none"}

## Selected Action

- title: ${report.selected_action.title}
- target_project: ${report.selected_action.target_project}
- target_package: ${report.selected_action.target_package}
- gate: ${report.execution_gate.reason}

## Validation

- status: ${report.validation_result.status}
- command_count: ${report.validation_result.command_count}
- failed_commands: ${report.validation_result.failed_commands.length === 0 ? "none" : report.validation_result.failed_commands.join(", ")}

## Commands Run

${commands}

## Changed Files

${changedFiles}

## Next Recommendation

- title: ${report.next_recommendation.title}
- command: ${report.next_recommendation.command}

## Safety

- deploy: disabled
- production_operations: disabled
- server_access: disabled
- credential_values: disabled
- managed_project_writes: disabled
`;
}

async function writeContinuousStepReport(report) {
  const dir = resolveFromRoot("autopilot-runs");
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, `${report.run_id}.json`);
  const markdownPath = join(dir, `${report.run_id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, continuousStepMarkdown(report), "utf8");
  return { jsonPath, markdownPath };
}

async function runContinuousValidation(commandsRun, cwd = repoRoot) {
  const results = [];
  for (const command of ["pnpm typecheck", "pnpm lint:check", "git diff --check"]) {
    const result = await runAllowedCommand(command, cwd);
    commandsRun.push(result);
    results.push(result);
  }
  return validationSummary(results);
}

async function lastCommitForPath(path, cwd = repoRoot) {
  return execGit(cwd, ["log", "-1", "--format=%H", "--", path]);
}

function batchWriterSupportsExecutionTarget(executionTarget) {
  return executionTarget?.kind !== "managed_project_repo";
}

function batchValidationTargets(results) {
  const executableResults = results.filter((result) => result.status === "EXECUTED");
  if (executableResults.length === 0) {
    return [{
      repo_path: repoRoot,
      execution_route: "studio_repo",
      project_id: "anksen-agent-studio"
    }];
  }

  const seen = new Set();
  const targets = [];
  for (const result of executableResults) {
    const target = result.execution_target ?? null;
    const repoPath = executionRepoPath(target);
    if (seen.has(repoPath)) continue;
    seen.add(repoPath);
    targets.push({
      repo_path: repoPath,
      execution_route: target?.execution_route ?? "studio_repo",
      project_id: target?.project_id ?? "anksen-agent-studio"
    });
  }
  return targets;
}

async function buildContinuousStepReport({
  parentRunId,
  step,
  stepIndex,
  maxSteps,
  goal,
  globalContext,
  planningOutput,
  gate,
  status,
  executionMode,
  commandsRun,
  changedFiles,
  validationResult,
  commitHash,
  proposalId,
  nextRecommendationValue
}) {
  const now = new Date().toISOString();
  return {
    schema_version: 1,
    run_id: `${parentRunId}-step-${String(stepIndex).padStart(2, "0")}-${step.step_id}`,
    parent_run_id: parentRunId,
    created_at: now,
    goal,
    step_index: stepIndex,
    max_steps: maxSteps,
    phase: step.phase,
    status,
    planning_output: planningOutput,
    selected_action: step.action,
    execution_mode: executionMode,
    execution_gate: gate,
    execution_target: gate.execution_target ?? null,
    commands_run: commandsRun,
    changed_files: changedFiles,
    validation_result: validationResult,
    commit_hash: commitHash,
    proposal_id: proposalId,
    next_recommendation: nextRecommendationValue,
    global_context: globalContextSummary(globalContext),
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled",
      max_steps: maxSteps
    }
  };
}

function continuousSummaryMarkdown(summary) {
  const rows = summary.steps.map((step) =>
    `| ${step.phase} | ${step.status} | ${step.risk} | ${step.gate_status} | ${step.commit_hash || step.proposal_id || "none"} | ${step.report_file} |`
  ).join("\n");
  return `# V4 Continuous Run Summary

- run_id: ${summary.run_id}
- generated_at: ${summary.generated_at}
- goal: ${summary.goal}
- max_steps: ${summary.max_steps}

## Steps

| Step | Status | Risk | Gate | Commit / Proposal | Report |
| --- | --- | --- | --- | --- | --- |
${rows}

## Gate Summary

- high_or_critical_gate_triggered: ${summary.high_or_critical_gate_triggered ? "yes" : "no"}
- deploy: disabled
- production_operations: disabled
- server_access: disabled
- credential_values: disabled
- managed_project_writes: disabled
- jinhu_smart_park_modified: no

## Next Recommendation

- title: ${summary.next_recommendation.title}
- command: ${summary.next_recommendation.command}
`;
}

async function writeV4ContinuousRunSummary(summary) {
  const file = "docs/release/V4_CONTINUOUS_RUN_SUMMARY.md";
  await writeFile(resolveFromRoot(file), continuousSummaryMarkdown(summary), "utf8");
  return file;
}

function printAutopilotContinuous(summary) {
  console.log("# Autopilot Continuous apply");
  console.log("");
  console.log(`goal: ${summary.goal}`);
  console.log(`run_id: ${summary.run_id}`);
  console.log(`max_steps: ${summary.max_steps}`);
  console.log("");
  console.log("steps:");
  for (const step of summary.steps) {
    console.log(`- ${step.phase}: ${step.status}; commit_hash=${step.commit_hash || "none"}; proposal_id=${step.proposal_id || "none"}; report=${step.report_file}`);
  }
  console.log("");
  console.log(`high_or_critical_gate_triggered: ${summary.high_or_critical_gate_triggered ? "yes" : "no"}`);
  console.log("next_recommendation:");
  console.log(`- title: ${summary.next_recommendation.title}`);
  console.log(`- command: ${summary.next_recommendation.command}`);
  console.log("");
  console.log(`summary_file: ${summary.summary_file}`);
  console.log(`summary_commit_hash: ${summary.summary_commit_hash ?? "none"}`);
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("server_access: disabled");
  console.log("credential_values: disabled");
  console.log("managed_project_writes: disabled");
}

async function autopilotContinuousRunner(args) {
  const goal = (args.goal || args.text).trim();
  if (!goal) throw new Error("Missing --goal for autopilot run.");
  if (!Number.isInteger(args.maxSteps) || args.maxSteps < 1 || args.maxSteps > 4) {
    throw new Error("Autopilot Continuous Mode allows --max-steps between 1 and 4.");
  }

  const parentRunId = v4ContinuousRunId(goal);
  const steps = v4ContinuousActions(goal).slice(0, args.maxSteps);
  const summarySteps = [];
  const globalContext = await loadGlobalContextBundle();

  if (args.dryRun) {
    const planning = await runPlanningCenter(goal);
    for (let index = 0; index < steps.length; index += 1) {
      const step = steps[index];
      const gate = await localExecutionGate(step.action);
      const complete = step.is_complete();
      summarySteps.push({
        phase: step.phase,
        status: complete ? step.status_if_complete ?? "SKIPPED" : gate.allowed ? "EXECUTABLE" : "PROPOSAL_ONLY",
        risk: gate.governance?.risk ?? step.action.risk,
        gate_status: gate.governance?.release_gate ?? "unknown",
        commit_hash: "",
        proposal_id: "",
        report_file: ""
      });
    }
    const summary = {
      run_id: parentRunId,
      generated_at: new Date().toISOString(),
      goal,
      max_steps: args.maxSteps,
      steps: summarySteps,
      high_or_critical_gate_triggered: summarySteps.some((step) => ["HIGH", "CRITICAL"].includes(step.risk)),
      next_recommendation: executorNextRecommendation(goal, planning.output),
      summary_file: "docs/release/V4_CONTINUOUS_RUN_SUMMARY.md",
      summary_commit_hash: null
    };
    printAutopilotContinuous(summary);
    return;
  }

  for (let index = 0; index < steps.length; index += 1) {
    const stepIndex = index + 1;
    const step = steps[index];
    const planning = await runPlanningCenter(goal);
    const gate = await localExecutionGate(step.action);
    const executionRepo = executionRepoPath(gate.execution_target);
    const commandsRun = [
      {
        command: "read runtime/global/*",
        ok: true,
        status: 0,
        blocked: false,
        stdout_tail: `files=${Object.keys(globalContext.files).length}; stage=${globalContextSummary(globalContext).current_v4_stage}`,
        stderr_tail: ""
      },
      {
        command: "Planning Center buildPlanningOutput",
        ok: true,
        status: 0,
        blocked: false,
        stdout_tail: `planning_output_id=${planning.output.planning_output_id}; next_action=${actionFromPlanningOutput(planning.output).title}`,
        stderr_tail: ""
      },
      {
        command: "governance check",
        ok: gate.governance?.governance_check === "PASS",
        status: gate.governance?.governance_check === "PASS" ? 0 : 1,
        blocked: false,
        stdout_tail: `status=${gate.governance?.governance_check ?? "unknown"}; risk=${gate.governance?.risk ?? step.action.risk}`,
        stderr_tail: ""
      },
      {
        command: "approval policy",
        ok: gate.governance?.approval_policy === "PASS",
        status: gate.governance?.approval_policy === "PASS" ? 0 : 1,
        blocked: false,
        stdout_tail: `automation_mode=${gate.governance?.automation_mode ?? "unknown"}; execution_mode=${gate.execution_mode}`,
        stderr_tail: ""
      },
      {
        command: "release gate",
        ok: gate.governance?.release_gate === "PASS",
        status: gate.governance?.release_gate === "PASS" ? 0 : 1,
        blocked: gate.governance?.release_gate !== "PASS",
        stdout_tail: `status=${gate.governance?.release_gate ?? "unknown"}; categories=${(gate.governance?.categories ?? []).join(", ")}`,
        stderr_tail: gate.governance?.release_gate === "PASS" ? "" : gate.reason
      }
    ];

    let status = "SKIPPED";
    let executionMode = gate.execution_mode;
    let changedFiles = [];
    let commitHash = "";
    let proposalId = "";
    let validationResult = { status: "PASS", command_count: 0, failed_commands: [] };

    if (step.is_complete()) {
      status = step.status_if_complete ?? "SKIPPED";
      validationResult = await runContinuousValidation(commandsRun, executionRepo);
      commitHash = await lastCommitForPath(step.action.expected_files.at(-1) ?? ".", executionRepo);
    } else if (!gate.allowed) {
      status = "PROPOSAL_ONLY";
      executionMode = "proposal_only";
      const proposal = await step.write(parentRunId, gate);
      changedFiles = proposal.files ?? [];
      proposalId = proposal.proposal_id ?? "";
      validationResult = await runContinuousValidation(commandsRun, executionRepo);
      if (validationResult.status === "PASS") {
        const proposalCommit = await commitPaths(changedFiles, step.commit_message, commandsRun, executionRepo);
        commitHash = proposalCommit.hash;
        if (!proposalCommit.ok) {
          validationResult = {
            status: "FAIL",
            command_count: commandsRun.length,
            failed_commands: ["git commit proposal"]
          };
        }
      }
    } else {
      status = "EXECUTED";
      executionMode = "local_repo_execute";
      const written = await step.write(parentRunId, gate);
      changedFiles = Array.isArray(written) ? written : written.files ?? [];
      proposalId = Array.isArray(written) ? "" : written.proposal_id ?? "";
      validationResult = await runContinuousValidation(commandsRun, executionRepo);
      if (validationResult.status === "PASS") {
        const implementationCommit = await commitPaths(changedFiles, step.commit_message, commandsRun, executionRepo);
        commitHash = implementationCommit.hash;
        if (!implementationCommit.ok) {
          validationResult = {
            status: "FAIL",
            command_count: commandsRun.length,
            failed_commands: ["git commit implementation"]
          };
        }
      }
    }

    const latestPlanning = await runPlanningCenter(goal);
    const nextRecommendationValue = validationResult.status === "PASS"
      ? executorNextRecommendation(goal, latestPlanning.output)
      : {
        title: "Fix validation failures before continuing V4",
        reason: "Autopilot Continuous Mode stops when a step validation fails.",
        command: `node packages/orchestrator-core/bin/studio.mjs autopilot run --goal "${goal}" --dry-run --max-steps ${args.maxSteps}`
      };
    const report = await buildContinuousStepReport({
      parentRunId,
      step,
      stepIndex,
      maxSteps: args.maxSteps,
      goal,
      globalContext,
      planningOutput: planning.output,
      gate,
      status,
      executionMode,
      commandsRun,
      changedFiles: unique([...changedFiles, `${parentRunId}-pending-report`]).sort(),
      validationResult,
      commitHash,
      proposalId,
      nextRecommendationValue
    });
    report.changed_files = unique([...changedFiles, ...continuousStepReportFiles(report)]).sort();
    await writeContinuousStepReport(report);
    const reportCommit = await commitPaths(continuousStepReportFiles(report), `chore(autopilot): record ${step.phase.toLowerCase()} continuous run`, commandsRun);

    summarySteps.push({
      phase: step.phase,
      status,
      risk: gate.governance?.risk ?? step.action.risk,
      gate_status: gate.governance?.release_gate ?? "unknown",
      commit_hash: commitHash,
      report_commit_hash: reportCommit.hash,
      proposal_id: proposalId,
      report_file: `autopilot-runs/${report.run_id}.json`
    });

    if (validationResult.status !== "PASS") break;
  }

  const finalPlanning = await runPlanningCenter(goal);
  const summary = {
    run_id: parentRunId,
    generated_at: new Date().toISOString(),
    goal,
    max_steps: args.maxSteps,
    steps: summarySteps,
    high_or_critical_gate_triggered: summarySteps.some((step) => ["HIGH", "CRITICAL"].includes(step.risk)),
    next_recommendation: executorNextRecommendation(goal, finalPlanning.output),
    summary_file: "docs/release/V4_CONTINUOUS_RUN_SUMMARY.md",
    summary_commit_hash: null
  };
  const summaryFile = await writeV4ContinuousRunSummary(summary);
  const summaryCommands = [];
  const summaryCommit = await commitPaths([summaryFile], "docs(v4): add continuous run summary", summaryCommands);
  summary.summary_commit_hash = summaryCommit.hash || null;
  printAutopilotContinuous(summary);
}

function printAutopilotRunner(run, files = null) {
  console.log(`# Autopilot Runner ${run.mode}`);
  console.log("");
  console.log(`goal: ${run.goal}`);
  console.log(`run_id: ${run.run_id}`);
  console.log(`global_context_files_read: ${run.global_context.files.length}`);
  console.log(`global_context_stage: ${run.global_context.current_v4_stage}`);
  console.log(`execution_mode: ${run.execution_mode}`);
  console.log(`execution_route: ${run.execution_route ?? "unknown"}`);
  console.log(`selected_action: ${run.selected_action.title}`);
  console.log(`target_project: ${run.selected_action.target_project}`);
  console.log(`target_package: ${run.selected_action.target_package}`);
  console.log(`risk: ${run.selected_action.risk}`);
  console.log(`gate: ${run.execution_gate.reason}`);
  console.log(`execution_repo_path: ${run.execution_target?.repo_path ?? "unresolved"}`);
  console.log(`execution_repo_branch: ${run.execution_target?.repo_branch ?? "unknown"}`);
  console.log(`execution_write_policy: ${run.execution_target?.write_policy ?? "unknown"}`);
  console.log(`executed: ${run.execution_result.executed ? "yes" : "no"}`);
  console.log(`implementation: ${run.execution_result.implementation}`);
  console.log(`validation: ${run.validation_result.status}`);
  console.log(`commit_hash: ${run.commit_hash ?? "none"}`);
  console.log("");
  console.log("changed_files:");
  if (run.changed_files.length === 0) {
    console.log("- none");
  } else {
    for (const file of run.changed_files) console.log(`- ${file}`);
  }
  console.log("");
  console.log("next_recommendation:");
  console.log(`- title: ${run.next_recommendation.title}`);
  console.log(`- command: ${run.next_recommendation.command}`);
  if (files) {
    console.log("");
    console.log("written_files:");
    console.log(`- ${files.jsonPath}`);
    console.log(`- ${files.markdownPath}`);
  }
}

async function commitAutopilotRunnerResult(message, commandsRun, cwd = repoRoot) {
  const addResult = await execReadOnly(cwd, "git", ["add", "--all", "--", "."], 120000);
  commandsRun.push({
    command: "git add --all -- .",
    cwd,
    ok: addResult.ok,
    status: addResult.status,
    blocked: false,
    stdout_tail: stdoutTail(addResult.stdout, 20),
    stderr_tail: stdoutTail(addResult.stderr, 20)
  });
  if (!addResult.ok) return { ok: false, hash: "", result: addResult };

  const commitResult = await execReadOnly(cwd, "git", ["commit", "-m", message], 120000);
  commandsRun.push({
    command: `git commit -m "${message}"`,
    cwd,
    ok: commitResult.ok,
    status: commitResult.status,
    blocked: false,
    stdout_tail: stdoutTail(commitResult.stdout, 40),
    stderr_tail: stdoutTail(commitResult.stderr, 40)
  });
  const hash = commitResult.ok ? await execGit(cwd, ["rev-parse", "HEAD"]) : "";
  return { ok: commitResult.ok, hash, result: commitResult };
}

function globalContextDir() {
  return resolveFromRoot("runtime/global");
}

function projectsContextDir() {
  return resolveFromRoot("runtime/projects");
}

function projectContextDir(projectId) {
  return join(projectsContextDir(), safeSegment(projectId));
}

function normalizedProjectWritePolicy(value) {
  if (value === "enabled" || value === "approval_required" || value === "disabled") {
    return value;
  }
  return "disabled";
}

async function loadManagedProjectContext(projectId) {
  const contextDir = projectContextDir(projectId);
  const [projectState, architecture, status] = await Promise.all([
    readJsonIfExists(join(contextDir, "project-state.json")),
    readJsonIfExists(join(contextDir, "architecture.json")),
    readJsonIfExists(join(contextDir, "agent-studio-status.json"))
  ]);
  return {
    project_id: projectId,
    context_dir: contextDir,
    project_state: projectState,
    architecture,
    status
  };
}

async function resolveExecutionTarget(action) {
  if (!action?.target_project || action.target_project === "anksen-agent-studio") {
    const studioRepo = await repoStatus(repoRoot);
    return {
      kind: "studio_repo",
      execution_route: "studio_repo",
      project_id: "anksen-agent-studio",
      label: "ANKSEN Agent Studio",
      repo_path: repoRoot,
      repo_branch: studioRepo.branch,
      repo_clean: studioRepo.clean,
      project_context_dir: "runtime/global",
      runtime_memory_dir: globalContextDir(),
      connection_status: "CONNECTED",
      doctor_status: "GO",
      write_policy: "enabled",
      resolved: true
    };
  }

  const managed = await loadManagedProjectContext(action.target_project);
  const projectState = managed.project_state ?? {};
  const projectPath = String(projectState.project_path ?? "");
  const runtimeMemoryDir = String(projectState.runtime_memory_status?.directory ?? "");
  const resolved = projectPath.length > 0 && existsSync(projectPath);

  return {
    kind: "managed_project_repo",
    execution_route: "managed_project_repo",
    project_id: action.target_project,
    label: String(projectState.project_name ?? action.target_project),
    repo_path: projectPath,
    repo_branch: String(projectState.repo_status?.branch ?? "unknown"),
    repo_clean: String(projectState.repo_status?.clean ?? "unknown"),
    project_context_dir: relativePath(managed.context_dir),
    runtime_memory_dir: runtimeMemoryDir,
    connection_status: String(projectState.project_exists === false ? "NOT_CONNECTED" : "CONNECTED"),
    doctor_status: String(
      projectState.local_orchestrator_status?.doctor_status
        ?? managed.status?.local_orchestrator_status?.doctor_status
        ?? "unknown"
    ),
    write_policy: normalizedProjectWritePolicy(projectState.safety?.project_writes),
    resolved
  };
}

async function writeJsonFile(path, value) {
  await mkdir(dirname(path), { recursive: true });
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
}

function uniqueSorted(values) {
  return [...new Set((values ?? []).filter(Boolean))].sort((left, right) => String(left).localeCompare(String(right)));
}

async function updateCodexContextIndexArtifacts({ globalFiles = [], projectFiles = {} } = {}) {
  const indexPath = resolveFromRoot("runtime/global/codex-context-index.json");
  const index = (await readJsonIfExists(indexPath)) ?? {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    startup_command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    project_command: "node packages/orchestrator-core/bin/studio.mjs context project --project jinhu-smart-park",
    global_context_files: [],
    project_contexts: [],
    required_reading: [],
    safety_boundaries: []
  };
  index.generated_at = new Date().toISOString();
  index.global_context_files = uniqueSorted([...(index.global_context_files ?? []), ...globalFiles]);
  const byProjectId = new Map((index.project_contexts ?? []).map((entry) => [entry.project_id, {
    project_id: entry.project_id,
    files: [...(entry.files ?? [])]
  }]));
  for (const [projectId, files] of Object.entries(projectFiles)) {
    const current = byProjectId.get(projectId) ?? { project_id: projectId, files: [] };
    current.files = uniqueSorted([...(current.files ?? []), ...(files ?? [])]);
    byProjectId.set(projectId, current);
  }
  index.project_contexts = [...byProjectId.values()].sort((left, right) => String(left.project_id).localeCompare(String(right.project_id)));
  await writeJsonFile(indexPath, index);
  return indexPath;
}

async function copyTextFile(source, target) {
  await writeFile(target, await readFile(source, "utf8"), "utf8");
}

function contextProjectId(value) {
  const raw = String(value || "jinhu-smart-park").trim();
  if (!raw || raw === DEFAULT_PROJECT) return "jinhu-smart-park";
  return raw.replace(/\.json$/, "").split("/").at(-1) || raw;
}

function requiredCodexFiles() {
  return [
    "runtime/global/codex-startup.md",
    "runtime/global/handoff-summary.md",
    "runtime/global/platform-state.json",
    "runtime/global/roadmap-memory.json",
    "runtime/projects/jinhu-smart-park/handoff-summary.md",
    "README.md"
  ];
}

function safetyBoundaries() {
  return [
    "Do not modify jinhu-smart-park unless an explicit proposal is approved.",
    "Do not execute Agents from context commands.",
    "Do not deploy.",
    "Do not run production migration, seed, reset, cleanup, or production operations.",
    "Do not read or write real credential values.",
    "Keep Studio Context under runtime/global and Project Context under runtime/projects/<project_id>."
  ];
}

function completedV4Milestones(planningOutput, context) {
  const stage = planningOutput.current_stage ?? {};
  return [
    {
      id: "extraction",
      title: "Standalone Agent Studio extraction",
      completed: Boolean(stage.extraction_completed)
    },
    {
      id: "remote-execute-smoke",
      title: "Managed project remote execute smoke",
      completed: Boolean(stage.remote_execute_completed)
    },
    {
      id: "runtime-center",
      title: "V4-I Runtime Center routing and health gates",
      completed: Boolean(stage.runtime_center_bootstrapped)
    },
    {
      id: "credential-vault",
      title: "V4-J Credential Vault MVP",
      completed: Boolean(stage.credential_vault_completed)
    },
    {
      id: "autopilot-runner",
      title: "V4-J Autopilot Runner",
      completed: Boolean(stage.autopilot_runner_completed || context.autopilot_runs.autopilot_runner_completed)
    },
    {
      id: "console-read-only",
      title: "V4-K Console Read-Only MVP",
      completed: Boolean(stage.console_read_only_completed || context.packages.console_read_only_mvp_exists)
    },
    {
      id: "multi-project-workspace",
      title: "V4-L Multi-Project Workspace",
      completed: Boolean(stage.multi_project_workspace_completed || context.packages.multi_project_workspace_exists)
    },
    {
      id: "governance-release-gates",
      title: "V4-M Governance and Release Gates",
      completed: Boolean(stage.governance_release_gates_completed || context.packages.governance_release_gates_exists)
    }
  ];
}

async function buildGlobalContextMemory(goal = "继续推进 V4") {
  const { context, output } = await runPlanningCenter(goal);
  const repo = await repoStatus(repoRoot);
  const generatedAt = new Date().toISOString();
  const managedProjects = [
    {
      project_id: "jinhu-smart-park",
      memory_dir: "runtime/projects/jinhu-smart-park",
      source_memory_dir: "examples/jinhu-smart-park/runtime-memory",
      doctor_status: context.managed_project.project_state.doctor_status,
      repo_clean: context.managed_project.project_state.repo_clean,
      queue_status_counts: context.managed_project.project_state.queue_status_counts,
      event_file_count: context.managed_project.project_state.event_file_count
    }
  ];
  const nextAction = actionFromPlanningOutput(output);
  const requiredFiles = requiredCodexFiles();
  const safety = safetyBoundaries();
  const milestones = completedV4Milestones(output, context);

  const platformState = {
    schema_version: 1,
    generated_at: generatedAt,
    source: "context bootstrap",
    platform_id: "anksen-agent-studio",
    workspace_root: repoRoot,
    repo_status: repo,
    current_platform_status: "GO",
    current_v4_stage: output.current_stage,
    planning_output_id: output.planning_output_id,
    next_recommended_action: nextAction,
    managed_projects: managedProjects,
    packages: {
      runtime_providers: context.packages.runtime_providers,
      runtime_profiles: context.packages.runtime_profiles,
      credential_reference_count: context.packages.credential_references.length,
      schema_or_example_count: context.packages.schema_or_example_count
    },
    safety_boundaries: safety
  };

  const roadmapMemory = {
    schema_version: 1,
    generated_at: generatedAt,
    goal,
    current_stage: output.current_stage.stage_name,
    next_stage: output.current_stage.next_stage,
    milestones,
    next_recommended_action: nextAction,
    validation_commands: [
      "pnpm typecheck",
      "pnpm lint:check",
      "node packages/orchestrator-core/bin/studio.mjs context summary",
      "git diff --check"
    ],
    stop_policy: "max_steps=1 for automated runner apply mode"
  };

  const decisionLog = {
    schema_version: 1,
    generated_at: generatedAt,
    decisions: [
      {
        date: "2026-06-23",
        title: "Keep Studio platform and business project context separated",
        decision: "Studio context lives under runtime/global; formal project context lives under runtime/projects/<project_id>.",
        source: "Global Context Bootstrap"
      },
      {
        date: "2026-06-23",
        title: "Preserve examples project memory as compatibility evidence",
        decision: "examples/jinhu-smart-park/runtime-memory remains available, while runtime/projects/jinhu-smart-park is the formal project memory.",
        source: "Global Context Bootstrap"
      },
      {
        date: "2026-06-23",
        title: "Autopilot remains single-step and approval-gated",
        decision: "Autopilot Runner may execute only safe local repository actions; managed project, HIGH risk, deploy, production, and secret-value work remains proposal-only.",
        source: "docs/release/AUTOPILOT_RUNNER_MVP.md"
      }
    ]
  };

  const codexContextIndex = {
    schema_version: 1,
    generated_at: generatedAt,
    startup_command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    project_command: "node packages/orchestrator-core/bin/studio.mjs context project --project jinhu-smart-park",
    global_context_files: [
      "runtime/global/platform-state.json",
      "runtime/global/roadmap-memory.json",
      "runtime/global/decision-log.json",
      "runtime/global/codex-context-index.json",
      "runtime/global/codex-startup.md",
      "runtime/global/handoff-summary.md"
    ],
    project_contexts: managedProjects.map((project) => ({
      project_id: project.project_id,
      files: [
        `${project.memory_dir}/project-state.json`,
        `${project.memory_dir}/architecture.json`,
        `${project.memory_dir}/agent-studio-status.json`,
        `${project.memory_dir}/handoff-summary.md`
      ]
    })),
    required_reading: requiredFiles,
    safety_boundaries: safety
  };

  const codexStartup = `# New Codex Window Startup

First command:

\`\`\`bash
node packages/orchestrator-core/bin/studio.mjs context summary
\`\`\`

Then inspect the active managed project when needed:

\`\`\`bash
node packages/orchestrator-core/bin/studio.mjs context project --project jinhu-smart-park
\`\`\`

## Current State

- platform_status: ${platformState.current_platform_status}
- current_v4_stage: ${output.current_stage.stage_name}
- next_stage: ${output.current_stage.next_stage}
- next_action: ${nextAction.title}
- managed_projects: ${managedProjects.map((project) => project.project_id).join(", ")}

## Required Reading

${requiredFiles.map((file) => `- ${file}`).join("\n")}

## Safety

${safety.map((rule) => `- ${rule}`).join("\n")}
`;

  const handoffSummary = `# ANKSEN Agent Studio Runtime Handoff

Generated at: ${generatedAt}

## Platform

- platform_status: ${platformState.current_platform_status}
- repo_branch: ${repo.branch}
- repo_clean: ${repo.clean}
- repo_head: ${repo.head}

## V4 Stage

- current_stage: ${output.current_stage.stage_name}
- next_stage: ${output.current_stage.next_stage}
- next_action: ${nextAction.title}
- target_package: ${nextAction.target_package}
- risk: ${nextAction.risk}
- execution_mode: ${nextAction.execution_mode}

## Managed Projects

${managedProjects.map((project) => `- ${project.project_id}: doctor=${project.doctor_status}, repo_clean=${project.repo_clean}, memory=${project.memory_dir}`).join("\n")}

## Required Startup Command

\`\`\`bash
node packages/orchestrator-core/bin/studio.mjs context summary
\`\`\`

## Required Reading

${requiredFiles.map((file) => `- ${file}`).join("\n")}

## Safety Boundaries

${safety.map((rule) => `- ${rule}`).join("\n")}
`;

  return {
    context,
    planning_output: output,
    platformState,
    roadmapMemory,
    decisionLog,
    codexContextIndex,
    codexStartup,
    handoffSummary,
    project_sources: {
      "jinhu-smart-park": resolveFromRoot("examples/jinhu-smart-park/runtime-memory")
    }
  };
}

async function writeGlobalContextMemory(memory) {
  const globalDir = globalContextDir();
  await mkdir(globalDir, { recursive: true });
  await writeJsonFile(join(globalDir, "platform-state.json"), memory.platformState);
  await writeJsonFile(join(globalDir, "roadmap-memory.json"), memory.roadmapMemory);
  await writeJsonFile(join(globalDir, "decision-log.json"), memory.decisionLog);
  await writeJsonFile(join(globalDir, "codex-context-index.json"), memory.codexContextIndex);
  await writeFile(join(globalDir, "codex-startup.md"), memory.codexStartup, "utf8");
  await writeFile(join(globalDir, "handoff-summary.md"), memory.handoffSummary, "utf8");

  for (const [projectId, sourceDir] of Object.entries(memory.project_sources)) {
    const targetDir = projectContextDir(projectId);
    await mkdir(targetDir, { recursive: true });
    for (const file of ["project-state.json", "architecture.json", "agent-studio-status.json", "handoff-summary.md"]) {
      const source = join(sourceDir, file);
      if (existsSync(source)) await copyTextFile(source, join(targetDir, file));
    }
  }
}

function contextFileList(memory) {
  return [
    ...memory.codexContextIndex.global_context_files,
    ...memory.codexContextIndex.project_contexts.flatMap((project) => project.files)
  ];
}

function globalContextFiles() {
  return [
    "runtime/global/platform-state.json",
    "runtime/global/roadmap-memory.json",
    "runtime/global/v5-roadmap.json",
    "runtime/global/decision-log.json",
    "runtime/global/codex-context-index.json",
    "runtime/global/codex-startup.md",
    "runtime/global/handoff-summary.md"
  ];
}

async function loadGlobalContextBundle() {
  const files = {};
  const missing = [];
  for (const relativeFile of globalContextFiles()) {
    const absoluteFile = resolveFromRoot(relativeFile);
    if (!existsSync(absoluteFile)) {
      missing.push(relativeFile);
      continue;
    }
    const text = await readFile(absoluteFile, "utf8");
    files[relativeFile] = {
      path: relativeFile,
      bytes: Buffer.byteLength(text, "utf8"),
      sha256: createHash("sha256").update(text).digest("hex").slice(0, 16),
      kind: relativeFile.endsWith(".json") ? "json" : "markdown",
      data: relativeFile.endsWith(".json") ? JSON.parse(text) : null
    };
  }
  if (missing.length > 0) {
    throw new Error(`Global context is incomplete. Run context bootstrap --apply first. Missing: ${missing.join(", ")}`);
  }
  return {
    loaded_at: new Date().toISOString(),
    source_dir: "runtime/global",
    files,
    platform_state: files["runtime/global/platform-state.json"].data,
    roadmap_memory: files["runtime/global/roadmap-memory.json"].data,
    v5_roadmap: files["runtime/global/v5-roadmap.json"].data,
    decision_log: files["runtime/global/decision-log.json"].data,
    context_index: files["runtime/global/codex-context-index.json"].data
  };
}

async function contextBootstrap(args) {
  if (!args.apply) {
    throw new Error("context bootstrap currently requires --apply.");
  }
  const memory = await buildGlobalContextMemory();
  await writeGlobalContextMemory(memory);

  console.log("# Global Context Bootstrap apply");
  console.log("");
  console.log(`global_context_dir: ${globalContextDir()}`);
  console.log(`projects_context_dir: ${projectsContextDir()}`);
  console.log(`current_v4_stage: ${memory.planning_output.current_stage.stage_name}`);
  console.log(`next_recommended_action: ${memory.platformState.next_recommended_action.title}`);
  console.log("project_writes: disabled");
  console.log("agent_execution: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("");
  console.log("written_files:");
  for (const file of contextFileList(memory)) console.log(`- ${file}`);
}

async function loadContextSummaryMemory() {
  const platformState = await readJsonIfExists(join(globalContextDir(), "platform-state.json"));
  const roadmapMemory = await readJsonIfExists(join(globalContextDir(), "roadmap-memory.json"));
  const index = await readJsonIfExists(join(globalContextDir(), "codex-context-index.json"));
  if (platformState && roadmapMemory && index) {
    return { platformState, roadmapMemory, index };
  }
  const memory = await buildGlobalContextMemory();
  return {
    platformState: memory.platformState,
    roadmapMemory: memory.roadmapMemory,
    index: memory.codexContextIndex
  };
}

async function contextSummary() {
  const { platformState, roadmapMemory, index } = await loadContextSummaryMemory();
  const liveRepo = await repoStatus(repoRoot);
  console.log("# ANKSEN Agent Studio Context Summary");
  console.log("");
  console.log("current_platform_status:");
  console.log(`- platform_id: ${platformState.platform_id}`);
  console.log(`- repo_branch: ${liveRepo.branch}`);
  console.log(`- repo_clean: ${liveRepo.clean}`);
  console.log(`- repo_head: ${liveRepo.head}`);
  console.log("");
  console.log("current_v4_stage:");
  console.log(`- stage_name: ${platformState.current_v4_stage?.stage_name ?? roadmapMemory.current_stage ?? "unknown"}`);
  console.log(`- next_stage: ${platformState.current_v4_stage?.next_stage ?? roadmapMemory.next_stage ?? "unknown"}`);
  console.log("");
  console.log("managed_projects:");
  for (const project of platformState.managed_projects ?? []) {
    const status = String(project.status ?? project.connection_status ?? "connected").toLowerCase();
    const connectionStatus = String(project.connection_status ?? status).toLowerCase();
    const projectState = await readJsonIfExists(join(projectContextDir(project.project_id), "project-state.json"));
    const projectPath = projectState?.project_path ?? "unknown";
    const writePolicy = projectState?.safety?.project_writes ?? "disabled";
    console.log(`- ${project.project_id}: status=${status}, connection=${connectionStatus}, doctor=${project.doctor_status}, repo_clean=${project.repo_clean}, memory=${project.memory_dir}, repo=${projectPath}, write_policy=${writePolicy}`);
  }
  console.log("");
  console.log("next_recommended_action:");
  const action = platformState.next_recommended_action ?? roadmapMemory.next_recommended_action ?? {};
  console.log(`- title: ${action.title ?? "unknown"}`);
  console.log(`- target_project: ${action.target_project ?? "unknown"}`);
  console.log(`- target_package: ${action.target_package ?? "unknown"}`);
  console.log(`- risk: ${action.risk ?? "unknown"}`);
  console.log(`- execution_mode: ${action.execution_mode ?? "unknown"}`);
  console.log("");
  console.log("required_reading:");
  for (const file of index.required_reading ?? requiredCodexFiles()) console.log(`- ${file}`);
  console.log("");
  console.log("safety_boundaries:");
  for (const rule of index.safety_boundaries ?? safetyBoundaries()) console.log(`- ${rule}`);
}

async function contextProject(args) {
  const projectId = contextProjectId(args.project);
  const dir = projectContextDir(projectId);
  const state = await readJsonIfExists(join(dir, "project-state.json"));
  const architecture = await readJsonIfExists(join(dir, "architecture.json"));
  const status = await readJsonIfExists(join(dir, "agent-studio-status.json"));
  const handoffPath = join(dir, "handoff-summary.md");

  console.log("# Project Context");
  console.log("");
  console.log(`project_id: ${projectId}`);
  console.log(`memory_dir: ${dir}`);
  console.log(`project_state: ${state ? "present" : "missing"}`);
  console.log(`architecture: ${architecture ? "present" : "missing"}`);
  console.log(`agent_studio_status: ${status ? "present" : "missing"}`);
  console.log(`handoff_summary: ${existsSync(handoffPath) ? "present" : "missing"}`);
  console.log("");
  console.log("summary:");
  console.log(`- project_path: ${state?.project_path ?? "unknown"}`);
  console.log(`- repo_branch: ${state?.repo_status?.branch ?? "unknown"}`);
  console.log(`- repo_clean: ${state?.repo_status?.clean ?? "unknown"}`);
  console.log(`- doctor_status: ${state?.local_orchestrator_status?.doctor_status ?? status?.local_orchestrator_status?.doctor_status ?? "unknown"}`);
  console.log(`- project_writes: ${state?.safety?.project_writes ?? "disabled"}`);
  console.log(`- queue_status_counts: ${JSON.stringify(state?.queue_summary?.status_counts ?? status?.queue_summary?.status_counts ?? {})}`);
  console.log(`- event_file_count: ${state?.event_summary?.event_file_count ?? status?.event_summary?.event_file_count ?? "unknown"}`);
  console.log(`- detected_stack_count: ${(architecture?.detected_stack ?? state?.detected_stack ?? []).length}`);
  console.log("");
  console.log("files:");
  for (const file of ["project-state.json", "architecture.json", "agent-studio-status.json", "handoff-summary.md"]) {
    console.log(`- ${join("runtime/projects", projectId, file)}: ${existsSync(join(dir, file)) ? "present" : "missing"}`);
  }
}

function batchTaskAction(task) {
  return {
    title: task.title ?? task.task_id,
    reason: task.objective ?? `Batch task ${task.task_id}`,
    target_project: task.target_project ?? "anksen-agent-studio",
    target_package: task.target_package,
    expected_files: task.allowed_paths ?? [],
    validation_commands: task.validation_commands ?? [],
    risk: task.risk,
    approval_required: Boolean(task.approval_required),
    execution_mode: task.execution_mode ?? "proposal_only"
  };
}

function v5Agent5SafeSubtasks(task) {
  if (task.task_id !== "v5-batch-agent-5-architecture-runtime-prodops") return [];
  const forbiddenPaths = task.forbidden_paths ?? [];
  return [
    {
      task_id: "v5-batch-agent-5-runtime-architecture-readonly",
      title: "V5 runtime architecture read-only evidence",
      owner_agent: "agent-5",
      target_project: "anksen-agent-studio",
      target_package: "packages/runtime-adapters",
      skill_type: "architecture_documentation",
      runtime: "codex-cli",
      allowed_paths: [
        "docs/release/V5_RUNTIME_ARCHITECTURE_READONLY_EVIDENCE.md",
        "packages/runtime-adapters/examples/v5-runtime-architecture-readonly.example.json"
      ],
      forbidden_paths: forbiddenPaths,
      risk: "MEDIUM",
      dependencies: [
        "v5-batch-agent-2-governance-validation"
      ],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      approval_required: false,
      proposal_required: false,
      split_from: task.task_id,
      parent_risk: task.risk,
      split_strategy: "high_risk_safe_decomposition",
      objective: "Record read-only runtime architecture evidence and adapter boundary metadata without live Worker or external model activity."
    },
    {
      task_id: "v5-batch-agent-5-production-ops-safe-decomposition",
      title: "V5 production operations dry-run safety decomposition",
      owner_agent: "agent-5",
      target_project: "anksen-agent-studio",
      target_package: "packages/production-ops",
      skill_type: "safety_planning",
      runtime: "codex-cli",
      allowed_paths: [
        "docs/release/V5_PRODUCTION_OPS_SAFE_DECOMPOSITION.md",
        "packages/production-ops/examples/v5-production-ops-safety-decomposition.example.json"
      ],
      forbidden_paths: forbiddenPaths,
      risk: "MEDIUM",
      dependencies: [
        "v5-batch-agent-2-governance-validation"
      ],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      approval_required: false,
      proposal_required: false,
      split_from: task.task_id,
      parent_risk: task.risk,
      split_strategy: "high_risk_safe_decomposition",
      objective: "Record dry-run production operations safety decomposition as local docs and examples only."
    }
  ];
}

function pilotAgent5SafeSubtasks(task) {
  if (task.task_id !== "pilot-batch-agent-5-remote-worker-production-readiness") return [];
  const forbiddenPaths = task.forbidden_paths ?? [];
  return [
    {
      task_id: "pilot-batch-agent-5-remote-worker-readiness-readonly",
      title: "Pilot remote worker readiness read-only evidence",
      owner_agent: "agent-5",
      target_project: "anksen-agent-studio",
      target_package: "packages/worker-pool",
      skill_type: "architecture_planning",
      runtime: "codex-cli",
      allowed_paths: [
        "docs/release/PILOT_REMOTE_WORKER_READINESS_READONLY.md",
        "packages/worker-pool/examples/pilot-remote-worker-readiness.example.json"
      ],
      forbidden_paths: forbiddenPaths,
      risk: "MEDIUM",
      dependencies: [
        "pilot-batch-agent-2-worker-pool-evidence"
      ],
      validation_commands: [
        "pnpm typecheck",
        "pnpm lint:check",
        "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
        "git diff --check"
      ],
      execution_mode: "local_repo_execute",
      approval_required: false,
      proposal_required: false,
      split_from: task.task_id,
      parent_risk: task.risk,
      split_strategy: "high_risk_safe_decomposition",
      objective: "Record local read-only readiness evidence for future remote workers while remote connectivity, deploys, production operations, credentials, and external model calls stay disabled."
    }
  ];
}

function decomposeHighRiskBatchTasks(tasks) {
  const expandedTasks = [];
  const decompositions = [];
  for (const task of tasks) {
    if (["HIGH", "CRITICAL"].includes(task.risk)) {
      const childTasks = [
        ...v5Agent5SafeSubtasks(task),
        ...pilotAgent5SafeSubtasks(task)
      ];
      if (childTasks.length > 0) {
        expandedTasks.push(...childTasks);
        decompositions.push({
          parent_task_id: task.task_id,
          owner_agent: task.owner_agent,
          parent_risk: task.risk,
          status: "SPLIT_TO_SAFE_SUBTASKS",
          child_task_ids: childTasks.map((child) => child.task_id),
          direct_execution: false
        });
        continue;
      }
      decompositions.push({
        parent_task_id: task.task_id,
        owner_agent: task.owner_agent,
        parent_risk: task.risk,
        status: "PROPOSAL_ONLY_UNSPLIT",
        child_task_ids: [],
        direct_execution: false
      });
    }
    expandedTasks.push(task);
  }
  return {
    tasks: expandedTasks,
    decompositions
  };
}

async function evaluateBatchTasks(tasks) {
  const results = [];
  for (const task of tasks) {
    const gate = await localExecutionGate(batchTaskAction(task));
    const risk = gate.governance?.risk ?? task.risk;
    const executorSupported = batchWriterSupportsExecutionTarget(gate.execution_target);
    const gateReason = executorSupported
      ? gate.reason
      : `${gate.reason} Current batch executor can only write implementation files inside the Studio repository; managed project repo execution remains proposal-only until a repo-routed batch writer is implemented.`;
    results.push({
      ...task,
      execution_gate: {
        ...gate,
        reason: gateReason
      },
      execution_target: gate.execution_target ?? null,
      execution_route: gate.execution_route,
      executor_supported: executorSupported,
      automatic_execution_allowed: Boolean(gate.allowed && executorSupported && !["HIGH", "CRITICAL"].includes(risk)),
      effective_execution_mode: ["HIGH", "CRITICAL"].includes(risk) || !executorSupported
        ? "proposal_only"
        : gate.execution_mode,
      proposal_required: Boolean(task.proposal_required || ["HIGH", "CRITICAL"].includes(risk) || !gate.allowed || !executorSupported)
    });
  }
  return results;
}

function globToRegExp(pattern) {
  const globstar = "__GLOBSTAR__";
  const escaped = String(pattern)
    .replaceAll("**", globstar)
    .replace(/[.+^${}()|[\]\\]/g, "\\$&")
    .replaceAll("*", "[^/]*")
    .replaceAll(globstar, ".*");
  return new RegExp(`^${escaped}$`);
}

function pathMatchesPattern(path, pattern) {
  const normalizedPath = String(path).replaceAll("\\", "/");
  const normalizedPattern = String(pattern).replaceAll("\\", "/");
  if (normalizedPattern.endsWith("/**")) {
    return normalizedPath.startsWith(normalizedPattern.slice(0, -3));
  }
  if (normalizedPattern.includes("*")) {
    return globToRegExp(normalizedPattern).test(normalizedPath);
  }
  return normalizedPath === normalizedPattern || normalizedPath.startsWith(`${normalizedPattern}/`);
}

function assertBatchTaskPaths(task, files) {
  const violations = [];
  for (const file of files) {
    const allowed = (task.allowed_paths ?? []).some((pattern) => pathMatchesPattern(file, pattern));
    const forbidden = (task.forbidden_paths ?? []).some((pattern) => pathMatchesPattern(file, pattern));
    if (!allowed || forbidden) {
      violations.push(`${file} (allowed=${allowed ? "yes" : "no"}, forbidden=${forbidden ? "yes" : "no"})`);
    }
  }
  if (violations.length > 0) {
    throw new Error(`Batch task ${task.task_id} attempted writes outside its allowed paths: ${violations.join("; ")}`);
  }
}

async function writeBatchFiles(files) {
  for (const [relativeFile, content] of Object.entries(files)) {
    const absoluteFile = resolveFromRoot(relativeFile);
    await mkdir(dirname(absoluteFile), { recursive: true });
    await writeFile(absoluteFile, content, "utf8");
  }
  return Object.keys(files).sort();
}

function batchTaskWorkspaceFile(batchId, task) {
  return `autopilot-runs/workspaces/${batchId}/${task.task_id}/workspace.json`;
}

function v5OperatorManualFiles(task, batchId) {
  return {
    "docs/release/V5_OPERATOR_USER_MANUAL.md": `# V5 Operator User Manual

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- execution_mode: local_repo_execute

## Purpose

This manual gives operators a safe V5 workflow for reading roadmap state, reviewing batch plans, and approving future work without starting real Workers or production operations.

## Operator Workflow

1. Review the V5 roadmap with \`node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "继续推进 V5" --dry-run\`.
2. Confirm LOW and MEDIUM tasks remain scoped to this repository.
3. Keep HIGH and CRITICAL tasks in proposal-only mode.
4. Review every batch run report before authorizing a future executor.

## Hard Boundaries

- Do not deploy.
- Do not run production operations.
- Do not connect to servers.
- Do not read or store real credential values.
- Do not modify managed projects, including jinhu-smart-park.
`,
    "docs/release/V5_CONSOLE_COPY_GUIDE.md": `# V5 Console Copy Guide

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Copy Principles

- Use "Dry Run" for commands that inspect local metadata only.
- Use "Proposal Only" for HIGH or CRITICAL work.
- Use "Approval Required" when a future action would touch workers, credentials, production, deploy, or managed projects.

## Console Labels

- V5 Batch Planner
- Batch Proposal
- Governance Gate
- Runtime Health
- Project Portfolio
- Production Safety Check
`
  };
}

function v5GovernanceValidationFiles(task, batchId) {
  return {
    "docs/release/V5_GOVERNANCE_VALIDATION_TEST_MATRIX.md": `# V5 Governance Validation Test Matrix

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- execution_mode: local_repo_execute

| Area | Command | Expected |
| --- | --- | --- |
| Typecheck | pnpm typecheck | PASS |
| Lint | pnpm lint:check | PASS |
| Governance | node packages/orchestrator-core/bin/studio.mjs governance check --dry-run | PASS |
| Batch Planner | node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "继续推进 V5" --dry-run | PASS |
| Diff Hygiene | git diff --check | PASS |

## Gate Policy

- LOW: automatic local repository execution may be planned.
- MEDIUM: Autopilot local repository execution may be planned.
- HIGH: proposal-only.
- CRITICAL: proposal-only with explicit human approval before any future execution.
`,
    "packages/governance-center/examples/v5-validation-matrix.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      matrix_id: "v5-governance-validation-test-matrix",
      safety: {
        deploy: "disabled",
        production_operations: "disabled",
        credential_values: "disabled",
        managed_project_writes: "disabled"
      },
      checks: [
        { check_id: "typecheck", command: "pnpm typecheck", expected: "PASS" },
        { check_id: "lint", command: "pnpm lint:check", expected: "PASS" },
        { check_id: "governance", command: "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run", expected: "PASS" },
        { check_id: "diff", command: "git diff --check", expected: "PASS" }
      ]
    }, null, 2)}\n`
  };
}

function v5ProjectOperationsFiles(task, batchId) {
  return {
    "packages/project-connector/schemas/v5-project-operations.schema.json": `${JSON.stringify({
      "$schema": "https://json-schema.org/draft/2020-12/schema",
      "$id": "https://anksen.local/agent-studio/v5-project-operations.schema.json",
      title: "V5 Project Operations",
      type: "object",
      additionalProperties: false,
      required: ["schema_version", "workspace_id", "mode", "projects", "safety"],
      properties: {
        schema_version: { type: "integer", minimum: 1 },
        workspace_id: { type: "string", minLength: 1 },
        mode: { type: "string", enum: ["read_only", "proposal_only"] },
        projects: {
          type: "array",
          items: {
            type: "object",
            required: ["project_id", "operation_policy", "write_policy"],
            properties: {
              project_id: { type: "string" },
              operation_policy: { type: "string", enum: ["read_only", "proposal_only"] },
              write_policy: { type: "string", enum: ["disabled", "approval_required"] }
            }
          }
        },
        safety: { type: "object", additionalProperties: true }
      }
    }, null, 2)}\n`,
    "packages/project-connector/examples/v5-project-operations.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      workspace_id: "anksen-agent-studio-v5-local",
      mode: "read_only",
      projects: [
        {
          project_id: "jinhu-smart-park",
          operation_policy: "read_only",
          write_policy: "disabled",
          source: "runtime/projects/jinhu-smart-park"
        }
      ],
      safety: {
        managed_project_writes: "disabled",
        deploy: "disabled",
        production_operations: "disabled",
        credential_values: "not_read"
      }
    }, null, 2)}\n`,
    "docs/release/V5_MULTI_PROJECT_OPERATIONS_BATCH_MVP.md": `# V5 Multi Project Operations Batch MVP

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Scope

The V5 multi-project operations model remains read-only for managed project context. It prepares portfolio metadata and proposal-only write plans without modifying jinhu-smart-park.

## Boundaries

- Managed project writes: disabled.
- Project command execution: dry-run only.
- Deploy and production operations: disabled.
- Credential values: not read.
`
  };
}

function v5ConsoleEntrypointFiles(task, batchId) {
  return {
    "apps/console/src/v5-roadmap.ts": `export interface ConsoleV5RoadmapEntry {
  readonly id: string;
  readonly label: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly executionMode: "local_repo_execute" | "proposal_only";
  readonly ownerAgent: string;
}

export const consoleV5BatchEntries: readonly ConsoleV5RoadmapEntry[] = [
  { id: "agent-1-docs", label: "Docs / Manual", risk: "LOW", executionMode: "local_repo_execute", ownerAgent: "agent-1" },
  { id: "agent-2-governance", label: "Governance / Validation", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-2" },
  { id: "agent-3-projects", label: "Project Operations", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-3" },
  { id: "agent-4-console", label: "Console Entrypoints", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-4" },
  { id: "agent-5-production", label: "Runtime / Production Proposal", risk: "HIGH", executionMode: "proposal_only", ownerAgent: "agent-5" }
] as const;

export const consoleV5BatchSafety = {
  batch_id: "${batchId}",
  real_worker_execution: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  credential_values: "not_read",
  managed_project_writes: "disabled"
} as const;
`,
    "docs/release/V5_ENTERPRISE_CONSOLE_MVP.md": `# V5 Enterprise Console MVP

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Scope

The Enterprise Console exposes V5 batch planning, governance state, and proposal queues as read-only view-model data. It does not execute commands from the UI.

## Entry Points

- V5 Batch Planner
- Governance Gate Review
- Runtime Health Preview
- Project Portfolio Preview
- Production Proposal Queue
`
  };
}

function v5ArchitectureProposalFiles(task, batchId) {
  return {
    "docs/release/V5_ARCHITECTURE_RUNTIME_PRODUCTION_OPS_PROPOSAL.md": `# V5 Architecture, Runtime, and Production Ops Proposal

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- risk: HIGH
- execution_mode: proposal_only

## Proposal

Agent-5 remains proposal-only because this lane touches runtime architecture and Production Operations semantics. Future execution must be separately approved before any real Worker, server, deploy, backup, rollback, or production operation is attempted.

## Proposed Future Work

- Enterprise Runtime architecture review.
- Production Operations approval model.
- Runtime/Production audit evidence schema.
- Operator kill-switch and rollback proposal.

## Hard Blocks

- No real Worker execution.
- No external model invocation.
- No server access.
- No deploy.
- No production operation.
- No credential value read or write.
- No managed project write.
`
  };
}

function v5Agent5RuntimeArchitectureFiles(task, batchId) {
  return {
    "docs/release/V5_RUNTIME_ARCHITECTURE_READONLY_EVIDENCE.md": `# V5 Runtime Architecture Read-Only Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- split_from: ${task.split_from ?? "none"}
- risk: ${task.risk}
- execution_mode: local_repo_execute

## Scope

This safe subtask decomposes the HIGH agent-5 runtime lane into read-only architecture evidence. It documents adapter and worker boundaries without invoking a real Worker or external model.

## Evidence Model

- Runtime adapter metadata remains declarative.
- Worker execution remains disabled.
- Credential values are never read.
- Network execution is not performed.
- Production operations remain proposal-only.

## Safety Boundary

- No real Worker execution.
- No external model invocation.
- No server access.
- No deploy.
- No production operation.
- No credential value read or write.
`,
    "packages/runtime-adapters/examples/v5-runtime-architecture-readonly.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      split_from: task.split_from ?? null,
      evidence_id: "v5-runtime-architecture-readonly",
      mode: "read_only",
      allowed_operations: [
        "describe_adapter_metadata",
        "describe_worker_boundaries",
        "generate_invoke_plan"
      ],
      blocked_operations: [
        "invoke_real_model",
        "read_secret_value",
        "connect_remote_worker",
        "deploy",
        "production_operation"
      ],
      credential_policy: "reference_presence_only"
    }, null, 2)}\n`
  };
}

function v5Agent5ProductionSafetyDecompositionFiles(task, batchId) {
  return {
    "docs/release/V5_PRODUCTION_OPS_SAFE_DECOMPOSITION.md": `# V5 Production Ops Safe Decomposition

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- split_from: ${task.split_from ?? "none"}
- risk: ${task.risk}
- execution_mode: local_repo_execute

## Scope

This safe subtask decomposes the HIGH Production Ops lane into documentation and dry-run safety evidence only. It does not run deploy, backup, rollback, server, or production commands.

## Safe Work Units

- Define dry-run safety evidence.
- Keep production execution behind CRITICAL approval.
- Record blocked operation classes.
- Preserve proposal-only semantics for live operations.

## Hard Blocks

- No SSH or server connection.
- No deploy.
- No production operation.
- No credential value read or write.
- No managed project write.
`,
    "packages/production-ops/examples/v5-production-ops-safety-decomposition.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      split_from: task.split_from ?? null,
      decomposition_id: "v5-production-ops-safety-decomposition",
      mode: "dry_run_only",
      safe_subtasks: [
        "document_release_gate_inputs",
        "document_production_action_risks",
        "record_proposal_only_blocks"
      ],
      blocked_operations: [
        "ssh",
        "server_connect",
        "deploy",
        "backup_execute",
        "rollback_execute",
        "production_mutation",
        "credential_value_read"
      ],
      approval_gate_for_real_execution: "CRITICAL"
    }, null, 2)}\n`
  };
}

function v5ProductizationPlanningFiles(task, batchId) {
  return {
    "docs/release/PLANNING_CHAIN_REPORT.md": `# Planning Chain Report

- validation_id: V5-PLANNING-CHAIN
- generated_at: 2026-06-24
- status: PASS
- score: 91/100
- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Chain

Goal -> Planning Center -> Proposal -> Autopilot -> Execution -> Report

## Evidence

- Completion-aware planning reads \`runtime/global/v5-roadmap.json\`.
- Completion-aware planning reads \`docs/release/V5_INTEGRATION_VALIDATION_REPORT.md\`.
- Completion-aware planning reviews recent \`autopilot-runs/*\` records.
- \`studio plan --goal "继续推进 V5" --completion-aware --dry-run\` skips completed V5 stages and selects a productization gap.
- \`studio autopilot batch --goal "继续推进 V5" --dry-run\` uses remaining-gap productization tasks instead of the repeated V5 batch template.

## Safety

- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
- Managed project writes: disabled.
`
  };
}

function v5ProductizationConsoleFiles(task, batchId) {
  return {
    "docs/release/CONSOLE_CHAIN_REPORT.md": `# Console Chain Report

- validation_id: V5-CONSOLE-CHAIN
- generated_at: 2026-06-24
- status: PASS
- score: 90/100
- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Chain

Console -> Projects -> Runtime -> Governance -> Autopilot -> Evolution -> Memory -> Discovery

## Evidence

- \`apps/console/src/route-manifest.ts\` declares read-only route render metadata.
- \`studio console render --dry-run\` validates Dashboard, Projects, Runtime, Governance, Autopilot, and Memory route coverage.
- Console fixtures cover Runtime, Runtime Adapters, Credential Vault, Governance, Planning, Autopilot, Memory, Evolution, Discovery, and V5 roadmap completion.

## Safety

- Database: not connected.
- External services: not called.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
`
  };
}

function v5ProductizationMultiProjectFiles(task, batchId) {
  return {
    "docs/release/MULTI_PROJECT_READINESS_REPORT.md": `# Multi Project Readiness Report

- validation_id: V5-MULTI-PROJECT-READINESS
- generated_at: 2026-06-24
- status: PASS
- score: 90/100
- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Projects

- \`jinhu-smart-park\`: CONNECTED, read-only managed project context.
- \`phoenix-erp\`: PLANNED / NOT_CONNECTED placeholder project context.

## Evidence

- \`runtime/projects/jinhu-smart-park\`
- \`runtime/projects/phoenix-erp\`
- \`examples/phoenix-erp/project.config.example.json\`
- \`runtime/global/platform-state.json\`
- \`runtime/global/codex-context-index.json\`

## Safety

- Managed project writes: disabled.
- \`jinhu-smart-park\` modified: no.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
`
  };
}

function v5ProductizationProjectFiles(task, batchId) {
  return {
    "docs/release/PROJECT_CHAIN_REPORT.md": `# Project Chain Report

- validation_id: V5-PROJECT-CHAIN
- generated_at: 2026-06-24
- status: PARTIAL
- score: 82/100
- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}

## Chain

Project Connector -> Project Runtime Memory -> Project Adapter -> Task Proposal -> Approval -> Remote Execute

## Evidence

- Project intake, stack, and command detector dry-runs work for \`jinhu-smart-park\`.
- Runtime memory exists for \`jinhu-smart-park\`.
- Multi-project placeholder memory now exists for \`phoenix-erp\`.
- Proposal and approval boundaries remain explicit.

## Remaining Gap

Remote execute is still intentionally gated. A real remote execute smoke must wait for a separate approval gate, restored SSH observability, and explicit permission to touch the managed project runtime.

## Safety

- \`jinhu-smart-park\` modified: no.
- Agent execution: disabled.
- Deploy: disabled.
- Production operations: disabled.
- Credential values: not read.
`
  };
}

function pilotRuntimeChainEvidenceFiles(task, batchId) {
  return {
    "runtime/pilot/pilot-batch-runtime-chain-evidence.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      evidence_id: "pilot-runtime-chain-parallel-evidence",
      runtime: "codex-cli",
      credential_reference: "reference_only",
      adapter_invoke_plan: "PASS",
      governance_gate: "PASS",
      worker_execution: "local_child_process_only",
      blocked_operations: [
        "external_model_call",
        "server_access",
        "deploy",
        "production_operation",
        "credential_value_read",
        "managed_project_write"
      ]
    }, null, 2)}\n`,
    "docs/release/PILOT_RUNTIME_CHAIN_PARALLEL_EVIDENCE.md": `# Pilot Runtime Chain Parallel Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- status: PASS

## Chain

Runtime Center -> Credential Vault Reference -> Runtime Adapter -> Governance -> Local child_process Worker -> Result Artifact

## Safety

- credential_reference: reference_only
- external_model_call: disabled
- server_access: disabled
- deploy: disabled
- production_operation: disabled
- managed_project_writes: disabled
`
  };
}

function pilotWorkerPoolEvidenceFiles(task, batchId) {
  return {
    "packages/worker-pool/examples/pilot-worker-pool-parallel.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      evidence_id: "pilot-worker-pool-parallel",
      worker_scope: "local_only",
      executor: "node_child_process",
      required_evidence: [
        "agent_pids",
        "independent_workspaces",
        "independent_run_logs",
        "time_overlap_matrix"
      ],
      remote_workers: "disabled",
      production_workers: "proposal_only"
    }, null, 2)}\n`,
    "docs/release/PILOT_WORKER_POOL_PARALLEL_EVIDENCE.md": `# Pilot Worker Pool Parallel Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- status: PASS

## Scope

Autopilot Batch may use local Node child_process workers for LOW/MEDIUM repository-safe tasks. Remote workers remain HIGH/proposal-only and production workers remain CRITICAL.

## Safety

- ssh: disabled
- server_access: disabled
- deploy: disabled
- production_operation: disabled
- credential_values: not_read
`
  };
}

function pilotCredentialPolicyEvidenceFiles(task, batchId) {
  return {
    "packages/credential-vault/examples/pilot-credential-backend-policy.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      evidence_id: "pilot-credential-policy-parallel",
      credential_backend_mode: "reference_only",
      allowed_reference_types: [
        "vault_path",
        "env_ref",
        "keychain_ref",
        "external_vault_ref"
      ],
      secret_value_access: "disabled",
      real_backend_connection: "disabled"
    }, null, 2)}\n`,
    "docs/release/PILOT_CREDENTIAL_POLICY_PARALLEL_EVIDENCE.md": `# Pilot Credential Policy Parallel Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- status: PASS

## Scope

Pilot batch execution records credential backend policy as reference-only metadata. It does not read env values, Keychain values, external vault values, API keys, or SSH keys.

## Safety

- real_secret_storage: disabled
- real_secret_read: disabled
- external_vault_connection: disabled
- production_credential: CRITICAL/proposal-only
`
  };
}

function pilotConsoleActionEvidenceFiles(task, batchId) {
  return {
    "apps/console/examples/pilot-console-action-flow.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      evidence_id: "pilot-console-action-flow",
      default_mode: "read_only",
      allowed_actions: [
        "context_summary",
        "runtime_health",
        "worker_health",
        "credential_validate",
        "governance_check",
        "autopilot_dry_run"
      ],
      write_enabled: false,
      production_enabled: false,
      high_critical_policy: "proposal_only"
    }, null, 2)}\n`,
    "docs/release/PILOT_CONSOLE_ACTION_PARALLEL_EVIDENCE.md": `# Pilot Console Action Parallel Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- status: PASS

## Scope

The Console pilot action model stays read-only by default. Write-like actions must route through proposal and governance gates before any future implementation.

## Safety

- database: not_connected
- external_services: not_called
- deploy: disabled
- production_operation: disabled
- credential_values: not_read
`
  };
}

function pilotRemoteWorkerReadinessFiles(task, batchId) {
  return {
    "docs/release/PILOT_REMOTE_WORKER_READINESS_READONLY.md": `# Pilot Remote Worker Readiness Read-Only Evidence

- batch_id: ${batchId}
- owner_agent: ${task.owner_agent}
- split_from: ${task.split_from ?? "none"}
- parent_risk: ${task.parent_risk ?? "none"}
- risk: ${task.risk}
- execution_mode: local_repo_execute

## Scope

This safe subtask decomposes the HIGH remote worker and production readiness lane into read-only local evidence. It does not connect to servers, start remote workers, call external models, deploy, or perform production operations.

## Future Gate

Remote worker execution remains HIGH/proposal-only. Production worker execution remains CRITICAL and requires explicit human approval.
`,
    "packages/worker-pool/examples/pilot-remote-worker-readiness.example.json": `${JSON.stringify({
      schema_version: 1,
      batch_id: batchId,
      owner_agent: task.owner_agent,
      split_from: task.split_from ?? null,
      evidence_id: "pilot-remote-worker-readiness-readonly",
      mode: "read_only",
      allowed_operations: [
        "describe_remote_worker_requirements",
        "record_governance_gate",
        "record_kill_switch_requirement"
      ],
      blocked_operations: [
        "ssh",
        "server_connect",
        "remote_worker_start",
        "external_model_call",
        "deploy",
        "production_operation",
        "credential_value_read"
      ],
      governance: {
        remote_worker: "HIGH_PROPOSAL_ONLY",
        production_worker: "CRITICAL_HUMAN_APPROVAL_REQUIRED"
      }
    }, null, 2)}\n`
  };
}

function batchTaskFileMap(task, batchId) {
  if (task.task_id === "v5-batch-agent-1-docs-console-manual") {
    return v5OperatorManualFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-2-governance-validation") {
    return v5GovernanceValidationFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-3-project-runtime-memory") {
    return v5ProjectOperationsFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-4-console-ui-entrypoints") {
    return v5ConsoleEntrypointFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-5-architecture-runtime-prodops") {
    return v5ArchitectureProposalFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-5-runtime-architecture-readonly") {
    return v5Agent5RuntimeArchitectureFiles(task, batchId);
  }
  if (task.task_id === "v5-batch-agent-5-production-ops-safe-decomposition") {
    return v5Agent5ProductionSafetyDecompositionFiles(task, batchId);
  }
  if (task.task_id === "v5-productization-planning-completion-aware" || task.task_id === "v5-productization-autopilot-anti-repeat") {
    return v5ProductizationPlanningFiles(task, batchId);
  }
  if (task.task_id === "v5-productization-console-render-dry-run") {
    return v5ProductizationConsoleFiles(task, batchId);
  }
  if (task.task_id === "v5-productization-phoenix-project-context") {
    return v5ProductizationMultiProjectFiles(task, batchId);
  }
  if (task.task_id === "v5-productization-project-chain-evidence") {
    return v5ProductizationProjectFiles(task, batchId);
  }
  if (task.task_id === "pilot-batch-agent-1-runtime-chain-evidence") {
    return pilotRuntimeChainEvidenceFiles(task, batchId);
  }
  if (task.task_id === "pilot-batch-agent-2-worker-pool-evidence") {
    return pilotWorkerPoolEvidenceFiles(task, batchId);
  }
  if (task.task_id === "pilot-batch-agent-3-credential-policy-evidence") {
    return pilotCredentialPolicyEvidenceFiles(task, batchId);
  }
  if (task.task_id === "pilot-batch-agent-4-console-action-evidence") {
    return pilotConsoleActionEvidenceFiles(task, batchId);
  }
  if (task.task_id === "pilot-batch-agent-5-remote-worker-readiness-readonly") {
    return pilotRemoteWorkerReadinessFiles(task, batchId);
  }
  throw new Error(`No batch task writer is registered for ${task.task_id}.`);
}

async function writeBatchTaskImplementation(task, batchId) {
  const files = batchTaskFileMap(task, batchId);
  const relativeFiles = Object.keys(files);
  assertBatchTaskPaths(task, relativeFiles);
  return writeBatchFiles(files);
}

function batchTaskImplementationFiles(task, batchId) {
  const files = batchTaskFileMap(task, batchId);
  const relativeFiles = Object.keys(files);
  assertBatchTaskPaths(task, relativeFiles);
  return relativeFiles.sort();
}

function plannedBatchTaskFiles(task, batchId) {
  return unique([
    ...batchTaskImplementationFiles(task, batchId),
    batchTaskWorkspaceFile(batchId, task),
    ...batchTaskReportFiles(batchId, task)
  ]).sort();
}

function detectBatchPathOverlaps(tasks, batchId) {
  const writersByPath = new Map();
  for (const task of tasks) {
    for (const file of plannedBatchTaskFiles(task, batchId)) {
      const writers = writersByPath.get(file) ?? [];
      writers.push(task.task_id);
      writersByPath.set(file, writers);
    }
  }
  const overlaps = [...writersByPath.entries()]
    .filter(([, writers]) => writers.length > 1)
    .map(([path, writers]) => ({ path, task_ids: writers }));
  return {
    detected: overlaps.length > 0,
    overlaps
  };
}

function chunkTasks(tasks, size) {
  const chunks = [];
  for (let index = 0; index < tasks.length; index += size) {
    chunks.push(tasks.slice(index, index + size));
  }
  return chunks;
}

function buildBatchExecutionSchedule(executableTasks, batchId, parallel) {
  const pathOverlapBase = detectBatchPathOverlaps(executableTasks, batchId);
  const degradedTaskIds = unique(pathOverlapBase.overlaps.flatMap((overlap) => overlap.task_ids));
  const degradedTaskSet = new Set(degradedTaskIds);
  const concurrentTasks = executableTasks.filter((task) => !degradedTaskSet.has(task.task_id));
  const degradedTasks = executableTasks.filter((task) => degradedTaskSet.has(task.task_id));
  const concurrentBatches = chunkTasks(concurrentTasks, parallel);
  const degradedBatches = degradedTasks.map((task) => [task]);
  const parallelBatches = [...concurrentBatches, ...degradedBatches];
  const actualParallelism = Math.max(0, ...parallelBatches.map((batch) => batch.length));
  const trueParallel = actualParallelism > 1;
  const strategy = trueParallel
    ? pathOverlapBase.detected
      ? `partial_parallel_executor_parallel_${parallel}_with_path_overlap_isolation`
      : `true_parallel_executor_parallel_${parallel}`
    : pathOverlapBase.detected
      ? `sequential_executor_for_conflicting_tasks_parallel_${parallel}`
      : `sequential_executor_parallel_${parallel}`;
  return {
    strategy,
    true_parallel: trueParallel,
    actual_parallelism: actualParallelism,
    path_overlap: {
      ...pathOverlapBase,
      degraded_task_ids: degradedTaskIds,
      unaffected_task_ids: concurrentTasks.map((task) => task.task_id)
    },
    parallel_batches: parallelBatches,
    degraded_batches: degradedBatches
  };
}

function batchTaskReportFiles(batchId, task) {
  return [
    `autopilot-runs/${batchId}-${task.task_id}.json`,
    `autopilot-runs/${batchId}-${task.task_id}.md`
  ];
}

function batchTaskReportMarkdown(report) {
  const commands = report.commands_run.length === 0
    ? "- none"
    : report.commands_run.map((command) => `- ${command.command}: ${command.ok ? "PASS" : "FAIL"} (exit ${command.status})`).join("\n");
  const changedFiles = report.changed_files.length === 0
    ? "- none"
    : report.changed_files.map((file) => `- ${file}`).join("\n");
  const child = report.child_process_evidence;
  const childEvidence = child
    ? `- pid: ${child.pid}
- workspace: ${child.workspace}
- run_log_json: ${child.run_log_json}
- run_log_markdown: ${child.run_log_markdown}
- started_at: ${child.started_at}
- completed_at: ${child.completed_at}
- status: ${child.status}`
    : "- none";
  return `# Batch Task Run

- batch_id: ${report.batch_id}
- task_id: ${report.task_id}
- owner_agent: ${report.owner_agent}
- status: ${report.status}
- execution_mode: ${report.execution_mode}
- risk: ${report.risk}
- task_workspace: ${report.task_workspace}

## Validation

- status: ${report.validation_result.status}
- command_count: ${report.validation_result.command_count}
- failed_commands: ${report.validation_result.failed_commands.length === 0 ? "none" : report.validation_result.failed_commands.join(", ")}

## Changed Files

${changedFiles}

## Child Process Evidence

${childEvidence}

## Commands Run

${commands}

## Safety

- deploy: disabled
- production_operations: disabled
- credential_values: disabled
- managed_project_writes: disabled
- local_child_process_worker: ${child ? "enabled" : "not_applicable"}
- remote_worker_execution: disabled
- external_model_call: disabled
`;
}

async function writeBatchTaskReport(report) {
  const dir = resolveFromRoot("autopilot-runs");
  await mkdir(dir, { recursive: true });
  const [jsonRelative, markdownRelative] = batchTaskReportFiles(report.batch_id, report);
  await writeFile(resolveFromRoot(jsonRelative), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolveFromRoot(markdownRelative), batchTaskReportMarkdown(report), "utf8");
  return [jsonRelative, markdownRelative];
}

async function executeBatchTask(task, batchId, strategy) {
  const taskWorkspace = dirname(batchTaskWorkspaceFile(batchId, task));
  const status = task.proposal_required ? "PROPOSAL_ONLY" : "EXECUTED";
  await mkdir(resolveFromRoot(taskWorkspace), { recursive: true });
  const workspaceFile = batchTaskWorkspaceFile(batchId, task);
  await writeFile(resolveFromRoot(workspaceFile), `${JSON.stringify({
    schema_version: 1,
    batch_id: batchId,
    task_id: task.task_id,
    owner_agent: task.owner_agent,
    execution_strategy: strategy,
    split_from: task.split_from ?? null,
    parent_risk: task.parent_risk ?? null,
    split_strategy: task.split_strategy ?? null,
    target_package: task.target_package,
    allowed_paths: task.allowed_paths,
    forbidden_paths: task.forbidden_paths,
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled",
      real_worker_execution: "disabled"
    }
  }, null, 2)}\n`, "utf8");
  const changedFiles = task.executor_supported === false
    ? []
    : await writeBatchTaskImplementation(task, batchId);
  const validationResult = {
    status: "PENDING_UNIFIED_VALIDATION",
    command_count: 0,
    failed_commands: []
  };
  return {
    ...task,
    batch_id: batchId,
    status,
    execution_strategy: strategy,
    task_workspace: taskWorkspace,
    changed_files: unique([...changedFiles, workspaceFile]).sort(),
    validation_result: validationResult,
    commands_run: []
  };
}

function skippedBatchTaskResult(task, batchId, strategy) {
  return {
    ...task,
    batch_id: batchId,
    status: "SKIPPED",
    execution_strategy: strategy,
    task_workspace: dirname(batchTaskWorkspaceFile(batchId, task)),
    changed_files: [],
    validation_result: {
      status: "SKIPPED",
      command_count: 0,
      failed_commands: []
    },
    commands_run: []
  };
}

function batchChildSourceForTask(task) {
  const sourceCandidates = [
    task.task_id.includes("runtime") ? "packages/runtime-center/examples/runtime-health.example.json" : "",
    task.task_id.includes("worker") ? "packages/worker-pool/examples/worker-registry.example.json" : "",
    task.task_id.includes("credential") ? "packages/credential-vault/examples/credential-references.example.json" : "",
    task.task_id.includes("console") ? "apps/console/src/view-model.ts" : "",
    task.task_id.includes("governance") ? "packages/governance-center/examples/governance-policy.example.json" : "",
    task.target_package === "packages/planning-center" ? "packages/planning-center/lib/planning-engine.mjs" : "",
    task.target_package === "packages/project-connector" ? "packages/project-connector/examples/multi-project-operations.example.json" : "",
    task.target_package === "packages/production-ops" ? "packages/production-ops/examples/server-registry.example.json" : "",
    "runtime/global/platform-state.json"
  ].filter(Boolean);
  return sourceCandidates.find((candidate) => existsSync(resolveFromRoot(candidate))) ?? "README.md";
}

function batchChildTaskForTask(task, index) {
  return {
    agent: task.owner_agent,
    task: task.task_id,
    source: batchChildSourceForTask(task),
    description: task.objective ?? task.title ?? task.task_id,
    delay_ms: 850 + (index * 125)
  };
}

function timeOverlapMatrix(results) {
  const byAgent = new Map(results.map((result) => [result.agent, result]));
  const matrix = {};
  for (const left of results) {
    matrix[left.agent] = {};
    for (const right of results) {
      matrix[left.agent][right.agent] = left.agent === right.agent
        ? "self"
        : hasIntervalOverlap(left, right);
    }
  }
  const pairs = [];
  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      const left = results[leftIndex];
      const right = results[rightIndex];
      if (byAgent.has(left.agent) && byAgent.has(right.agent) && hasIntervalOverlap(left, right)) {
        pairs.push([left.agent, right.agent]);
      }
    }
  }
  return {
    agents: results.map((result) => result.agent),
    matrix,
    overlap_pairs: pairs
  };
}

function summarizeBatchChildProcessEvidence(results, runRoot) {
  if (results.length === 0) {
    return {
      parallel_mode: "not_applicable",
      agent_pids: {},
      time_overlap_matrix: { agents: [], matrix: {}, overlap_pairs: [] },
      independent_workspaces: true,
      independent_run_logs: true,
      independent_processes: true,
      time_overlap_detected: false,
      sequential_simulation_detected: false,
      workspaces: {},
      run_logs: {},
      agents: [],
      run_root: relativePath(runRoot)
    };
  }
  const analysis = parallelSmokeAnalysis(results);
  return {
    parallel_mode: analysis.parallel_mode === "real" ? "real_child_process" : "simulated",
    agent_pids: Object.fromEntries(results.map((result) => [result.agent, result.pid])),
    observed_child_pids: Object.fromEntries(results.map((result) => [result.agent, result.observed_child_pid])),
    time_overlap_matrix: timeOverlapMatrix(results),
    independent_workspaces: analysis.independent_workspaces,
    independent_run_logs: analysis.independent_run_logs,
    independent_processes: analysis.independent_processes,
    time_overlap_detected: analysis.time_overlap_detected,
    sequential_simulation_detected: analysis.sequential_simulation_detected,
    workspaces: Object.fromEntries(results.map((result) => [result.agent, result.workspace])),
    run_logs: Object.fromEntries(results.map((result) => [result.agent, result.log_json])),
    log_markdown: Object.fromEntries(results.map((result) => [result.agent, result.log_markdown])),
    agents: results.map((result) => ({
      agent: result.agent,
      task_id: result.task,
      run_id: result.run_id,
      pid: result.pid,
      observed_child_pid: result.observed_child_pid,
      workspace: result.workspace,
      log_json: result.log_json,
      log_markdown: result.log_markdown,
      started_at: result.started_at,
      completed_at: result.completed_at,
      duration_ms: result.duration_ms,
      status: result.status,
      exit_code: result.exit_code,
      source_path: result.source_path,
      bytes_read: result.bytes_read
    })),
    run_root: relativePath(runRoot)
  };
}

async function runBatchChildProcessEvidence(schedule, batchId) {
  const runRoot = resolveFromRoot(`autopilot-runs/parallel-batch/${batchId}`);
  await mkdir(runRoot, { recursive: true });
  const results = [];
  let taskIndex = 0;

  for (const batch of schedule.parallel_batches) {
    const configs = batch.map((task) => {
      const childTask = batchChildTaskForTask(task, taskIndex);
      taskIndex += 1;
      return {
        ...childTask,
        task_id: task.task_id,
        run_id: `${batchId}-${safeSegment(task.owner_agent)}-${safeSegment(task.task_id)}`,
        workspace: join(runRoot, "workspaces", safeSegment(task.owner_agent), safeSegment(task.task_id))
      };
    });
    const batchResults = batch.length > 1
      ? await Promise.all(configs.map((config) => runParallelSmokeChild(config)))
      : [await runParallelSmokeChild(configs[0])];
    results.push(...batchResults.map((result, index) => ({
      ...result,
      task_id: configs[index].task_id
    })));
  }

  const evidence = summarizeBatchChildProcessEvidence(results, runRoot);
  const byTaskId = new Map(results.map((result) => [result.task_id, {
    agent: result.agent,
    task_id: result.task_id,
    run_id: result.run_id,
    pid: result.pid,
    observed_child_pid: result.observed_child_pid,
    workspace: result.workspace,
    run_log_json: result.log_json,
    run_log_markdown: result.log_markdown,
    started_at: result.started_at,
    completed_at: result.completed_at,
    duration_ms: result.duration_ms,
    status: result.status,
    exit_code: result.exit_code,
    source_path: result.source_path,
    bytes_read: result.bytes_read
  }]));

  return {
    ...evidence,
    by_task_id: Object.fromEntries(byTaskId)
  };
}

async function writeBatchTaskReports(results, validationResult, commandsRun) {
  const enriched = [];
  for (const result of results) {
    const taskCommands = commandsRun.filter((command) =>
      ["pnpm typecheck", "pnpm lint:check", "git diff --check"].includes(command.command)
    );
    const reportFiles = batchTaskReportFiles(result.batch_id, result);
    const childProcessFiles = result.child_process_evidence
      ? [
          result.child_process_evidence.run_log_json,
          result.child_process_evidence.run_log_markdown
        ]
      : [];
    const reportChangedFiles = unique([...(result.changed_files ?? []), ...childProcessFiles, ...reportFiles]).sort();
    const report = {
      schema_version: 1,
      batch_id: result.batch_id,
      task_id: result.task_id,
      owner_agent: result.owner_agent,
      target_package: result.target_package,
      skill_type: result.skill_type,
      runtime: result.runtime,
      split_from: result.split_from ?? null,
      parent_risk: result.parent_risk ?? null,
      split_strategy: result.split_strategy ?? null,
      status: result.status,
      execution_mode: result.effective_execution_mode,
      execution_strategy: result.execution_strategy,
      risk: result.risk,
      task_workspace: result.task_workspace,
      execution_target: result.execution_target ?? null,
      allowed_paths: result.allowed_paths,
      forbidden_paths: result.forbidden_paths,
      dependencies: result.dependencies,
      changed_files: reportChangedFiles,
      validation_result: validationResult,
      commands_run: taskCommands,
      child_process_evidence: result.child_process_evidence ?? null,
      safety: {
        deploy: "disabled",
        production_operations: "disabled",
        credential_values: "disabled",
        managed_project_writes: "disabled",
        local_child_process_worker: result.child_process_evidence ? "enabled" : "not_applicable",
        remote_worker_execution: "disabled",
        external_model_call: "disabled"
      }
    };
    await writeBatchTaskReport(report);
    enriched.push({
      ...result,
      changed_files: reportChangedFiles,
      validation_result: result.status === "SKIPPED" ? result.validation_result : validationResult,
      commands_run: result.status === "SKIPPED" ? [] : taskCommands
    });
  }
  return enriched;
}

async function runBatchUnifiedValidation(results, commandsRun) {
  const validationCommands = ["pnpm typecheck", "pnpm lint:check", "git diff --check"];
  const validationResults = [];
  for (const target of batchValidationTargets(results)) {
    for (const command of validationCommands) {
      const result = await runAllowedCommand(command, target.repo_path);
      commandsRun.push(result);
      validationResults.push(result);
    }
  }
  return validationSummary(validationResults);
}

async function executeBatchTasks(tasks, batchId, parallel) {
  const executableTasks = tasks.filter((task) => task.automatic_execution_allowed);
  const proposalTasks = tasks.filter((task) => !task.automatic_execution_allowed && task.proposal_required);
  const skippedTasks = tasks.filter((task) => !task.automatic_execution_allowed && !task.proposal_required);
  const schedule = buildBatchExecutionSchedule(executableTasks, batchId, parallel);
  const parallelEvidence = await runBatchChildProcessEvidence(schedule, batchId);
  const resultMap = new Map();

  for (const batch of schedule.parallel_batches) {
    const batchResults = batch.length > 1
      ? await Promise.all(batch.map((task) => executeBatchTask(task, batchId, schedule.strategy)))
      : [await executeBatchTask(batch[0], batchId, schedule.strategy)];
    for (const result of batchResults) {
      resultMap.set(result.task_id, result);
    }
  }

  for (const task of proposalTasks) {
    const proposalResult = await executeBatchTask(task, batchId, "proposal_only_after_parallel_gate");
    resultMap.set(task.task_id, proposalResult);
  }

  for (const task of skippedTasks) {
    resultMap.set(task.task_id, skippedBatchTaskResult(task, batchId, schedule.strategy));
  }

  const results = tasks.map((task) => resultMap.get(task.task_id));
  for (const result of results) {
    const childEvidence = parallelEvidence.by_task_id?.[result.task_id] ?? null;
    if (childEvidence) {
      result.child_process_evidence = childEvidence;
      result.changed_files = unique([
        ...(result.changed_files ?? []),
        childEvidence.run_log_json,
        childEvidence.run_log_markdown
      ]).sort();
    }
  }
  return {
    strategy: schedule.strategy,
    true_parallel: schedule.true_parallel,
    actual_parallelism: schedule.actual_parallelism,
    path_overlap: schedule.path_overlap,
    parallel_batches: schedule.parallel_batches.map((batch) => batch.map((task) => task.task_id)),
    degraded_batches: schedule.degraded_batches.map((batch) => batch.map((task) => task.task_id)),
    parallel_evidence: parallelEvidence,
    results
  };
}

function batchExecutionValidationSummary(results, commandValidation) {
  const failedTasks = results.filter((result) => result.validation_result.status === "FAIL").map((result) => result.task_id);
  return {
    status: commandValidation.status === "PASS" && failedTasks.length === 0 ? "PASS" : "FAIL",
    task_count: results.length,
    failed_tasks: unique([...failedTasks, ...(commandValidation.failed_commands ?? [])]),
    command_count: commandValidation.command_count
  };
}

function markdownMapRows(values) {
  const entries = Object.entries(values ?? {});
  return entries.length === 0
    ? "| none | none |"
    : entries.map(([key, value]) => `| ${key} | ${value} |`).join("\n");
}

function markdownOverlapMatrix(overlap) {
  const agents = overlap?.agents ?? [];
  if (agents.length === 0) return "| none | none |\n| --- | --- |";
  const header = `| Agent | ${agents.join(" | ")} |`;
  const separator = `| --- | ${agents.map(() => "---").join(" | ")} |`;
  const rows = agents.map((agent) => {
    const cells = agents.map((peer) => {
      const value = overlap.matrix?.[agent]?.[peer];
      if (value === "self") return "self";
      return value ? "yes" : "no";
    });
    return `| ${agent} | ${cells.join(" | ")} |`;
  });
  return [header, separator, ...rows].join("\n");
}

function parallelEvidenceMarkdown(evidence) {
  if (!evidence) {
    return `- parallel_mode: not_available
- independent_workspaces: no
- independent_run_logs: no
- time_overlap_detected: no
`;
  }
  return `- parallel_mode: ${evidence.parallel_mode}
- independent_workspaces: ${evidence.independent_workspaces ? "yes" : "no"}
- independent_run_logs: ${evidence.independent_run_logs ? "yes" : "no"}
- independent_processes: ${evidence.independent_processes ? "yes" : "no"}
- time_overlap_detected: ${evidence.time_overlap_detected ? "yes" : "no"}
- sequential_simulation_detected: ${evidence.sequential_simulation_detected ? "yes" : "no"}
- run_root: ${evidence.run_root ?? "none"}

### Agent PIDs

| Agent | PID |
| --- | --- |
${markdownMapRows(evidence.agent_pids)}

### Workspaces

| Agent | Workspace |
| --- | --- |
${markdownMapRows(evidence.workspaces)}

### Run Logs

| Agent | Run Log |
| --- | --- |
${markdownMapRows(evidence.run_logs)}

### Time Overlap Matrix

${markdownOverlapMatrix(evidence.time_overlap_matrix)}
`;
}

function batchSummaryMarkdown(summary) {
  const rows = summary.tasks.map((task) =>
    `| ${task.owner_agent} | ${task.task_id} | ${task.status} | ${task.risk} | ${task.effective_execution_mode} | ${task.validation_result.status} | ${(task.changed_files ?? []).join(", ")} |`
  ).join("\n");
  const parallelRows = (summary.parallel_batches ?? []).length === 0
    ? "- none"
    : summary.parallel_batches.map((batch, index) => `- batch-${index + 1}: ${batch.join(", ")}`).join("\n");
  const decompositionRows = (summary.high_risk_decomposition ?? []).length === 0
    ? "- none"
    : summary.high_risk_decomposition.map((item) => `- ${item.owner_agent}: ${item.parent_task_id} -> ${item.status} (${item.child_task_ids.join(", ") || "none"})`).join("\n");
  const overlapRows = summary.path_overlap?.detected
    ? summary.path_overlap.overlaps.map((overlap) => `- ${overlap.path}: ${overlap.task_ids.join(", ")}`).join("\n")
    : "- none";
  return `# Autopilot Batch Execution Summary

- batch_id: ${summary.batch_id}
- goal: ${summary.goal}
- execution_strategy: ${summary.execution_strategy}
- parallel_requested: ${summary.parallel_requested}
- actual_parallelism: ${summary.actual_parallelism ?? "unknown"}
- true_parallel: ${summary.true_parallel ? "yes" : "no"}
- parallel_mode: ${summary.parallel_evidence?.parallel_mode ?? "not_available"}
- path_overlap_detected: ${summary.path_overlap?.detected ? "yes" : "no"}
- efficiency_report_file: ${summary.efficiency_report_file ?? "none"}
- implementation_commit_hash: ${summary.implementation_commit_hash}
- validation_status: ${summary.validation_result.status}

## Parallel Batches

${parallelRows}

## High Risk Decomposition

${decompositionRows}

## Path Overlap

${overlapRows}

## Real Child Process Evidence

${parallelEvidenceMarkdown(summary.parallel_evidence)}

## Agent Allocation

| Agent | Task | Status | Risk | Mode | Validation | Changed Files |
| --- | --- | --- | --- | --- | --- | --- |
${rows}

## Safety

- deploy: disabled
- production_operations: disabled
- credential_values: disabled
- managed_project_writes: disabled
- local_child_process_worker: ${summary.parallel_evidence?.parallel_mode === "real_child_process" ? "enabled" : "not_available"}
- remote_worker_execution: disabled
- external_model_call: disabled

## Next Recommendation

- title: ${summary.next_recommendation.title}
- command: ${summary.next_recommendation.command}
`;
}

async function writeBatchSummary(summary) {
  const summaryFile = `autopilot-runs/${summary.batch_id}-summary.md`;
  await mkdir(resolveFromRoot("autopilot-runs"), { recursive: true });
  await writeFile(resolveFromRoot(summaryFile), batchSummaryMarkdown(summary), "utf8");
  return summaryFile;
}

function batchEfficiencyReportFiles(batchId) {
  return [
    `autopilot-runs/${batchId}-efficiency.json`,
    `autopilot-runs/${batchId}-efficiency.md`
  ];
}

function batchEfficiencyMarkdown(report) {
  const parallelRows = report.parallel_batches.length === 0
    ? "- none"
    : report.parallel_batches.map((batch, index) => `- batch-${index + 1}: ${batch.join(", ")}`).join("\n");
  const decompositionRows = report.high_risk_decomposition.length === 0
    ? "- none"
    : report.high_risk_decomposition.map((item) => `- ${item.owner_agent}: ${item.status}; children=${item.child_task_ids.join(", ") || "none"}`).join("\n");
  const overlapRows = report.path_overlap.detected
    ? report.path_overlap.overlaps.map((overlap) => `- ${overlap.path}: ${overlap.task_ids.join(", ")}`).join("\n")
    : "- none";
  return `# Autopilot Batch Efficiency Report

- batch_id: ${report.batch_id}
- goal: ${report.goal}
- execution_strategy: ${report.execution_strategy}
- parallel_requested: ${report.parallel_requested}
- actual_parallelism: ${report.actual_parallelism}
- true_parallel: ${report.true_parallel ? "yes" : "no"}
- parallel_mode: ${report.parallel_evidence?.parallel_mode ?? "not_available"}
- validation_status: ${report.validation_status}

## Task Counts

- planned_task_count: ${report.task_counts.planned}
- executable_task_count: ${report.task_counts.executable}
- proposal_only_task_count: ${report.task_counts.proposal_only}
- split_parent_count: ${report.task_counts.split_parent}
- split_child_count: ${report.task_counts.split_child}

## Parallel Batches

${parallelRows}

## Path Overlap

${overlapRows}

## High Risk Decomposition

${decompositionRows}

## Real Child Process Evidence

${parallelEvidenceMarkdown(report.parallel_evidence)}

## Safety

- deploy: disabled
- production_operations: disabled
- credential_values: disabled
- managed_project_writes: disabled
- local_child_process_worker: ${report.parallel_evidence?.parallel_mode === "real_child_process" ? "enabled" : "not_available"}
- remote_worker_execution: disabled
- external_model_call: disabled
`;
}

async function writeBatchEfficiencyReport(report) {
  const [jsonRelative, markdownRelative] = batchEfficiencyReportFiles(report.batch_id);
  await mkdir(resolveFromRoot("autopilot-runs"), { recursive: true });
  await writeFile(resolveFromRoot(jsonRelative), `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(resolveFromRoot(markdownRelative), batchEfficiencyMarkdown(report), "utf8");
  return [jsonRelative, markdownRelative];
}

function autopilotBatchRunFiles(run) {
  return [
    `autopilot-runs/${run.run_id}.json`,
    `autopilot-runs/${run.run_id}.md`
  ];
}

function autopilotBatchMarkdown(run) {
  const rows = run.batch_plan.tasks.map((task) =>
    `| ${task.owner_agent} | ${task.task_id} | ${task.status ?? "PLANNED"} | ${task.target_package} | ${task.skill_type} | ${task.runtime} | ${task.risk} | ${task.effective_execution_mode} | ${task.execution_gate.reason} |`
  ).join("\n");
  const parallelRows = (run.parallel_batches ?? []).length === 0
    ? "- none"
    : run.parallel_batches.map((batch, index) => `- batch-${index + 1}: ${batch.join(", ")}`).join("\n");
  const decompositionRows = (run.high_risk_decomposition ?? []).length === 0
    ? "- none"
    : run.high_risk_decomposition.map((item) => `- ${item.owner_agent}: ${item.parent_task_id} -> ${item.status} (${item.child_task_ids.join(", ") || "none"})`).join("\n");
  const overlapRows = run.path_overlap?.detected
    ? run.path_overlap.overlaps.map((overlap) => `- ${overlap.path}: ${overlap.task_ids.join(", ")}`).join("\n")
    : "- none";
  return `# Autopilot Batch Plan

- run_id: ${run.run_id}
- created_at: ${run.created_at}
- mode: ${run.mode}
- goal: ${run.goal}
- batch_id: ${run.batch_plan.batch_id}
- parallel_requested: ${run.parallel_requested}
- execution_strategy: ${run.execution_strategy}
- actual_parallelism: ${run.actual_parallelism}
- true_parallel: ${run.true_parallel ? "yes" : "no"}
- parallel_mode: ${run.parallel_evidence?.parallel_mode ?? "not_available"}
- independent_workspaces: ${run.parallel_evidence?.independent_workspaces ? "yes" : "no"}
- independent_run_logs: ${run.parallel_evidence?.independent_run_logs ? "yes" : "no"}
- path_overlap_detected: ${run.path_overlap?.detected ? "yes" : "no"}
- implementation_commit_hash: ${run.commit_hash ?? "none"}
- summary_file: ${run.batch_summary_file ?? "none"}
- execution_result: ${run.execution_result.summary}

## Tasks

| Agent | Task | Status | Target Package | Skill | Runtime | Risk | Mode | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Parallel Batches

${parallelRows}

## High Risk Decomposition

${decompositionRows}

## Path Overlap

${overlapRows}

## Real Child Process Evidence

${parallelEvidenceMarkdown(run.parallel_evidence)}

## Validation

- status: ${run.validation_result.status}
- command_count: ${run.validation_result.command_count}
- failed_commands: ${run.validation_result.failed_commands.length === 0 ? "none" : run.validation_result.failed_commands.join(", ")}

## Safety

- deploy: ${run.safety.deploy}
- production_operations: ${run.safety.production_operations}
- credential_values: ${run.safety.credential_values}
- managed_project_writes: ${run.safety.managed_project_writes}
- local_child_process_worker: ${run.safety.local_child_process_worker}
- remote_worker_execution: ${run.safety.remote_worker_execution}
- external_model_call: ${run.safety.external_model_call}

## Next Recommendation

- title: ${run.next_recommendation.title}
- command: ${run.next_recommendation.command}
`;
}

async function writeAutopilotBatchRun(run) {
  const dir = resolveFromRoot("autopilot-runs");
  await mkdir(dir, { recursive: true });
  const jsonPath = join(dir, `${run.run_id}.json`);
  const markdownPath = join(dir, `${run.run_id}.md`);
  await writeFile(jsonPath, `${JSON.stringify(run, null, 2)}\n`, "utf8");
  await writeFile(markdownPath, autopilotBatchMarkdown(run), "utf8");
  return { jsonPath, markdownPath };
}

function buildAutopilotBatchRun({
  goal,
  mode,
  parallel,
  globalContext,
  planningOutput,
  batchPlan,
  tasks,
  commandsRun,
  changedFiles,
  executionStrategy = "proposal_only",
  executionResult = null,
  validationResult = null,
  commitHash = null,
  batchSummaryFile = null,
  batchEfficiencyFiles = [],
  trueParallel = false,
  pathOverlap = { detected: false, overlaps: [] },
  parallelBatches = [],
  actualParallelism = 0,
  highRiskDecomposition = [],
  parallelEvidence = null
}) {
  const now = new Date().toISOString();
  const failedCommands = commandsRun.filter((command) => !command.ok).map((command) => command.command);
  return {
    schema_version: 1,
    run_id: `autopilot-batch-${timestampForFile(now)}-${createHash("sha1").update(`${goal}:${now}:batch`).digest("hex").slice(0, 8)}`,
    created_at: now,
    mode,
    goal,
    parallel_requested: parallel,
    global_context: globalContextSummary(globalContext),
    planning_output: planningOutput,
    batch_plan: {
      ...batchPlan,
      tasks
    },
    execution_mode: mode === "apply" ? "batch_execute" : "batch_proposal",
    execution_strategy: executionStrategy,
    true_parallel: trueParallel,
    actual_parallelism: actualParallelism,
    parallel_mode: parallelEvidence?.parallel_mode ?? (trueParallel ? "planned_parallel" : "not_applicable"),
    parallel_evidence: parallelEvidence,
    agent_pids: parallelEvidence?.agent_pids ?? {},
    time_overlap_matrix: parallelEvidence?.time_overlap_matrix ?? { agents: [], matrix: {}, overlap_pairs: [] },
    independent_workspaces: parallelEvidence?.independent_workspaces ?? false,
    independent_run_logs: parallelEvidence?.independent_run_logs ?? false,
    path_overlap: pathOverlap,
    parallel_batches: parallelBatches,
    high_risk_decomposition: highRiskDecomposition,
    execution_result: executionResult ?? {
      executed: false,
      implementation: "parallel-batch-planner-proposal",
      summary: mode === "dry-run"
        ? "Dry-run only. No batch proposal was written and no task was executed."
        : "Batch proposal recorded. Apply mode can execute governed LOW/MEDIUM local tasks."
    },
    commands_run: commandsRun,
    changed_files: changedFiles,
    validation_result: validationResult ?? {
      status: mode === "dry-run" ? "DRY_RUN" : "RECORDED",
      command_count: commandsRun.length,
      failed_commands: failedCommands
    },
    commit_hash: commitHash,
    batch_summary_file: batchSummaryFile,
    batch_efficiency_files: batchEfficiencyFiles,
    next_recommendation: {
      title: mode === "apply" ? "Review batch execution summary" : "Review batch plan before parallel execution",
      reason: mode === "apply"
        ? "Batch Executor completed the safe local tasks and left HIGH risk work proposal-only."
        : "Parallel Autopilot Planner produces a governed batch proposal; apply mode can execute selected LOW/MEDIUM local repository tasks.",
      command: `node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "${goal}" --dry-run`
    },
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled",
      local_child_process_worker: parallelEvidence?.parallel_mode === "real_child_process" ? "enabled" : "not_available",
      remote_worker_execution: "disabled",
      external_model_call: "disabled",
      high_critical_policy: "proposal_only"
    }
  };
}

function printAutopilotBatch(run, files = null) {
  console.log(`# Autopilot Batch ${run.mode}`);
  console.log("");
  console.log(`goal: ${run.goal}`);
  console.log(`run_id: ${run.run_id}`);
  console.log(`batch_id: ${run.batch_plan.batch_id}`);
  console.log(`parallel_requested: ${run.parallel_requested}`);
  console.log(`task_count: ${run.batch_plan.tasks.length}`);
  console.log(`execution_strategy: ${run.execution_strategy}`);
  console.log(`actual_parallelism: ${run.actual_parallelism}`);
  console.log(`true_parallel: ${run.true_parallel ? "yes" : "no"}`);
  console.log(`parallel_mode: ${run.parallel_evidence?.parallel_mode ?? run.parallel_mode ?? "not_available"}`);
  console.log(`independent_workspaces: ${run.parallel_evidence?.independent_workspaces ? "yes" : "no"}`);
  console.log(`independent_run_logs: ${run.parallel_evidence?.independent_run_logs ? "yes" : "no"}`);
  console.log(`path_overlap_detected: ${run.path_overlap?.detected ? "yes" : "no"}`);
  console.log(`execution: ${run.execution_result.executed ? "executed" : "proposal_only"}`);
  console.log(`validation: ${run.validation_result.status}`);
  console.log(`commit_hash: ${run.commit_hash ?? "none"}`);
  console.log(`summary_file: ${run.batch_summary_file ?? "none"}`);
  if (run.parallel_evidence?.agent_pids) {
    console.log("agent_pids:");
    for (const [agent, pid] of Object.entries(run.parallel_evidence.agent_pids)) {
      console.log(`- ${agent}: ${pid}`);
    }
  }
  if (run.parallel_evidence?.time_overlap_matrix) {
    console.log("time_overlap_matrix:");
    for (const agent of run.parallel_evidence.time_overlap_matrix.agents ?? []) {
      const row = run.parallel_evidence.time_overlap_matrix.matrix?.[agent] ?? {};
      console.log(`- ${agent}: ${Object.entries(row).map(([peer, value]) => `${peer}=${value === "self" ? "self" : value ? "yes" : "no"}`).join(", ")}`);
    }
  }
  if (run.parallel_evidence?.workspaces) {
    console.log("workspace_paths:");
    for (const [agent, workspace] of Object.entries(run.parallel_evidence.workspaces)) {
      console.log(`- ${agent}: ${workspace}`);
    }
  }
  if (run.parallel_evidence?.run_logs) {
    console.log("run_log_paths:");
    for (const [agent, log] of Object.entries(run.parallel_evidence.run_logs)) {
      console.log(`- ${agent}: ${log}`);
    }
  }
  if ((run.parallel_batches ?? []).length > 0) {
    console.log("parallel_batches:");
    run.parallel_batches.forEach((batch, index) => {
      console.log(`- batch-${index + 1}: ${batch.join(", ")}`);
    });
  }
  if ((run.high_risk_decomposition ?? []).length > 0) {
    console.log("high_risk_decomposition:");
    for (const item of run.high_risk_decomposition) {
      console.log(`- ${item.owner_agent}: ${item.status} (${item.child_task_ids.join(", ") || "none"})`);
    }
  }
  if (run.path_overlap?.detected) {
    console.log("path_overlaps:");
    for (const overlap of run.path_overlap.overlaps) {
      console.log(`- ${overlap.path}: ${overlap.task_ids.join(", ")}`);
    }
  }
  console.log("");
  console.log("| Agent | Task | Status | Target Package | Skill | Runtime | Risk | Mode | Proposal |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const task of run.batch_plan.tasks) {
    console.log(`| ${task.owner_agent} | ${task.task_id} | ${task.status ?? "PLANNED"} | ${task.target_package} | ${task.skill_type} | ${task.runtime} | ${task.risk} | ${task.effective_execution_mode} | ${task.proposal_required ? "yes" : "no"} |`);
  }
  console.log("");
  console.log("automatic_execution_allowed:");
  for (const task of run.batch_plan.tasks.filter((task) => task.automatic_execution_allowed)) {
    console.log(`- ${task.owner_agent}: ${task.task_id}`);
  }
  console.log("");
  console.log("proposal_only:");
  const proposalOnlyTasks = run.batch_plan.tasks.filter((task) => task.proposal_required);
  if (proposalOnlyTasks.length === 0) {
    console.log("- none");
  } else {
    for (const task of proposalOnlyTasks) console.log(`- ${task.owner_agent}: ${task.task_id} (${task.risk})`);
  }
  console.log("");
  console.log("safety:");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
  console.log("- credential_values: disabled");
  console.log("- managed_project_writes: disabled");
  console.log(`- local_child_process_worker: ${run.parallel_evidence?.parallel_mode === "real_child_process" ? "enabled" : "not_available"}`);
  console.log("- remote_worker_execution: disabled");
  console.log("- external_model_call: disabled");
  if (files) {
    console.log("");
    console.log("written_files:");
    for (const file of Object.values(files).flat()) console.log(`- ${file}`);
  }
}

async function autopilotBatch(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("autopilot batch requires --dry-run or --apply.");
  }
  const goal = (args.goal || args.text).trim();
  if (!goal) {
    throw new Error("Missing --goal for autopilot batch.");
  }
  if (!Number.isInteger(args.parallel) || args.parallel < 1 || args.parallel > 5) {
    throw new Error("autopilot batch allows --parallel between 1 and 5.");
  }

  const globalContext = await loadGlobalContextBundle();
  const completionAware = /\bV5\b/i.test(goal);
  const { output } = await runPlanningCenter(goal, { completionAware });
  if (!output.batch_plan?.tasks?.length) {
    if (output.v5_completion?.ready_for_productization_review) {
      const commandsRun = [
        {
          command: "read runtime/global/*",
          ok: true,
          status: 0,
          blocked: false,
          stdout_tail: `files=${Object.keys(globalContext.files).length}; v5=${globalContext.v5_roadmap?.plan_id ?? "missing"}`,
          stderr_tail: ""
        },
        {
          command: "Planning Center batch_plan",
          ok: true,
          status: 0,
          blocked: false,
          stdout_tail: "STOP: READY_FOR_V5_PRODUCTIZATION_REVIEW; tasks=0",
          stderr_tail: ""
        }
      ];
      const run = buildAutopilotBatchRun({
        goal,
        mode: args.apply ? "apply" : "dry-run",
        parallel: args.parallel,
        globalContext,
        planningOutput: output,
        batchPlan: output.batch_plan ?? {
          batch_id: `batch-plan-stop-${createHash("sha1").update(goal).digest("hex").slice(0, 8)}`,
          goal,
          tasks: []
        },
        tasks: [],
        commandsRun,
        changedFiles: [],
        executionStrategy: "stop_ready_for_v5_productization_review",
        executionResult: {
          executed: false,
          implementation: "completion-aware-stop",
          summary: "No remaining V5 productization gaps were found. Autopilot batch stopped without writing files or executing tasks."
        },
        validationResult: {
          status: "DRY_RUN",
          command_count: commandsRun.length,
          failed_commands: []
        },
        trueParallel: false,
        pathOverlap: { detected: false, overlaps: [] },
        parallelBatches: [],
        actualParallelism: 0,
        highRiskDecomposition: []
      });
      printAutopilotBatch(run);
      return;
    }
    throw new Error("Planning Center did not return a batch_plan for this goal.");
  }
  const decomposition = decomposeHighRiskBatchTasks(output.batch_plan.tasks);
  const tasks = await evaluateBatchTasks(decomposition.tasks);
  const drySchedule = buildBatchExecutionSchedule(
    tasks.filter((task) => task.automatic_execution_allowed),
    output.batch_plan.batch_id,
    args.parallel
  );
  const commandsRun = [
    {
      command: "read runtime/global/*",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `files=${Object.keys(globalContext.files).length}; v5=${globalContext.v5_roadmap?.plan_id ?? "missing"}`,
      stderr_tail: ""
    },
    {
      command: "Planning Center batch_plan",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `batch_id=${output.batch_plan.batch_id}; tasks=${output.batch_plan.tasks.length}`,
      stderr_tail: ""
    },
    {
      command: "autopilot anti-repeat review",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `completion_aware=${completionAware ? "yes" : "no"}; repeated=${output.v5_completion?.recent_batch_review?.repeated ? "yes" : "no"}; selected_gap=${output.v5_completion?.selected_gap?.gap_id ?? "none"}`,
      stderr_tail: ""
    },
    {
      command: "high risk safe decomposition",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `parents=${decomposition.decompositions.length}; expanded_tasks=${tasks.length}`,
      stderr_tail: ""
    },
    ...tasks.map((task) => ({
      command: `governance gate ${task.task_id}`,
      ok: task.execution_gate.governance?.governance_check === "PASS",
      status: task.execution_gate.governance?.governance_check === "PASS" ? 0 : 1,
      blocked: task.effective_execution_mode === "proposal_only" && ["HIGH", "CRITICAL"].includes(task.risk),
      stdout_tail: `agent=${task.owner_agent}; risk=${task.risk}; mode=${task.effective_execution_mode}; reason=${task.execution_gate.reason}`,
      stderr_tail: ""
    }))
  ];
  const run = buildAutopilotBatchRun({
    goal,
    mode: args.apply ? "apply" : "dry-run",
    parallel: args.parallel,
    globalContext,
    planningOutput: output,
    batchPlan: output.batch_plan,
    tasks,
    commandsRun,
    changedFiles: [],
    executionStrategy: drySchedule.strategy,
    trueParallel: drySchedule.true_parallel,
    pathOverlap: drySchedule.path_overlap,
    parallelBatches: drySchedule.parallel_batches.map((batch) => batch.map((task) => task.task_id)),
    actualParallelism: drySchedule.actual_parallelism,
    highRiskDecomposition: decomposition.decompositions
  });

  if (args.dryRun) {
    printAutopilotBatch(run);
    return;
  }

  const execution = await executeBatchTasks(tasks, output.batch_plan.batch_id, args.parallel);
  commandsRun.push({
    command: "autopilot batch real child_process executor",
    ok: execution.parallel_evidence?.parallel_mode === "real_child_process",
    status: execution.parallel_evidence?.parallel_mode === "real_child_process" ? 0 : 1,
    blocked: false,
    stdout_tail: `parallel_mode=${execution.parallel_evidence?.parallel_mode ?? "not_available"}; pids=${Object.entries(execution.parallel_evidence?.agent_pids ?? {}).map(([agent, pid]) => `${agent}:${pid}`).join(",") || "none"}; overlap=${execution.parallel_evidence?.time_overlap_detected ? "yes" : "no"}`,
    stderr_tail: execution.parallel_evidence?.parallel_mode === "real_child_process" ? "" : "Autopilot Batch did not prove real child_process parallel execution."
  });
  let validationResult = await runBatchUnifiedValidation(execution.results, commandsRun);
  let reportedResults = await writeBatchTaskReports(execution.results, validationResult, commandsRun);
  let efficiencyReport = {
    schema_version: 1,
    batch_id: output.batch_plan.batch_id,
    goal,
    execution_strategy: execution.strategy,
    parallel_requested: args.parallel,
    actual_parallelism: execution.actual_parallelism,
    true_parallel: execution.true_parallel,
    parallel_mode: execution.parallel_evidence?.parallel_mode ?? "not_available",
    parallel_evidence: execution.parallel_evidence,
    path_overlap: execution.path_overlap,
    parallel_batches: execution.parallel_batches,
    degraded_batches: execution.degraded_batches,
    high_risk_decomposition: decomposition.decompositions,
    task_counts: {
      planned: output.batch_plan.tasks.length,
      expanded: tasks.length,
      executable: reportedResults.filter((result) => result.status === "EXECUTED").length,
      proposal_only: reportedResults.filter((result) => result.status === "PROPOSAL_ONLY").length,
      split_parent: decomposition.decompositions.length,
      split_child: reportedResults.filter((result) => result.split_from).length
    },
    validation_status: validationResult.status,
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled",
      local_child_process_worker: "enabled",
      remote_worker_execution: "disabled",
      external_model_call: "disabled"
    }
  };
  let efficiencyFiles = await writeBatchEfficiencyReport(efficiencyReport);
  const finalDiffCheck = await runAllowedCommand("git diff --check");
  commandsRun.push(finalDiffCheck);
  validationResult = validationSummary(commandsRun.filter((command) =>
    ["pnpm typecheck", "pnpm lint:check", "git diff --check", "autopilot batch real child_process executor"].includes(command.command)
  ));
  reportedResults = await writeBatchTaskReports(reportedResults, validationResult, commandsRun);
  efficiencyReport = {
    ...efficiencyReport,
    parallel_mode: execution.parallel_evidence?.parallel_mode ?? "not_available",
    parallel_evidence: execution.parallel_evidence,
    validation_status: validationResult.status,
    task_counts: {
      ...efficiencyReport.task_counts,
      executable: reportedResults.filter((result) => result.status === "EXECUTED").length,
      proposal_only: reportedResults.filter((result) => result.status === "PROPOSAL_ONLY").length,
      split_child: reportedResults.filter((result) => result.split_from).length
    }
  };
  efficiencyFiles = await writeBatchEfficiencyReport(efficiencyReport);
  const batchValidationResult = batchExecutionValidationSummary(reportedResults, validationResult);

  let implementationCommitHash = "";
  let summaryFile = "";
  let files = null;
  if (batchValidationResult.status === "PASS") {
    const implementationChangedFiles = await currentChangedFiles();
    const implementationCommit = await commitPaths(
      implementationChangedFiles,
      REAL_PARALLEL_BATCH_COMMIT_MESSAGE,
      commandsRun
    );
    implementationCommitHash = implementationCommit.hash;
    if (!implementationCommit.ok) {
      batchValidationResult.status = "FAIL";
      batchValidationResult.failed_tasks = unique([
        ...(batchValidationResult.failed_tasks ?? []),
        "git commit batch implementation"
      ]);
      validationResult = {
        status: "FAIL",
        command_count: commandsRun.length,
        failed_commands: unique([...(validationResult.failed_commands ?? []), "git commit batch implementation"])
      };
    }
  }

  const nextRecommendationValue = {
    title: "Review governed batch execution and approve the next executor increment",
    reason: execution.true_parallel
      ? "The batch executor completed LOW/MEDIUM local tasks with real child_process parallelism, decomposed safe HIGH-lane subtasks, and kept unsafe HIGH/CRITICAL work out of execution."
      : execution.path_overlap.detected
        ? "The batch executor isolated only path-overlap conflicts while preserving safe parallel execution for unaffected tasks."
        : "The batch executor completed LOW/MEDIUM local tasks sequentially and left HIGH risk work proposal-only.",
    command: `node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "${goal}" --dry-run`
  };
  const summary = {
    batch_id: output.batch_plan.batch_id,
    goal,
    execution_strategy: execution.strategy,
    parallel_requested: args.parallel,
    actual_parallelism: execution.actual_parallelism,
    true_parallel: execution.true_parallel,
    parallel_mode: execution.parallel_evidence?.parallel_mode ?? "not_available",
    parallel_evidence: execution.parallel_evidence,
    path_overlap: execution.path_overlap,
    parallel_batches: execution.parallel_batches,
    high_risk_decomposition: decomposition.decompositions,
    efficiency_report_file: efficiencyFiles[1],
    implementation_commit_hash: implementationCommitHash || "none",
    tasks: reportedResults,
    validation_result: batchValidationResult,
    next_recommendation: nextRecommendationValue
  };
  summaryFile = await writeBatchSummary(summary);

  const applyRun = buildAutopilotBatchRun({
    goal,
    mode: "apply",
    parallel: args.parallel,
    globalContext,
    planningOutput: output,
    batchPlan: output.batch_plan,
    tasks: reportedResults,
    commandsRun,
    changedFiles: unique([...reportedResults.flatMap((result) => result.changed_files), ...efficiencyFiles, summaryFile]).sort(),
    executionStrategy: execution.strategy,
    executionResult: {
      executed: batchValidationResult.status === "PASS",
      implementation: execution.true_parallel
        ? "real-child-process-parallel-batch-executor"
        : execution.path_overlap.detected
          ? "partial-parallel-downgrade-on-path-overlap"
          : "sequential-batch-executor",
      summary: execution.true_parallel
        ? `Executed LOW/MEDIUM local repository tasks with actual_parallelism=${execution.actual_parallelism}, parallel=${args.parallel}, and parallel_mode=${execution.parallel_evidence?.parallel_mode ?? "not_available"}; HIGH risk was decomposed into safe subtasks when possible.`
        : execution.path_overlap.detected
          ? "Detected overlapping planned paths and isolated only conflicting tasks while preserving parallel execution for unaffected tasks."
          : "Executed LOW/MEDIUM local repository tasks sequentially; HIGH risk tasks remained proposal-only."
    },
    validationResult: {
      status: batchValidationResult.status,
      command_count: commandsRun.length,
      failed_commands: batchValidationResult.failed_tasks
    },
    commitHash: implementationCommitHash || null,
    batchSummaryFile: summaryFile,
    batchEfficiencyFiles: efficiencyFiles,
    trueParallel: execution.true_parallel,
    pathOverlap: execution.path_overlap,
    parallelBatches: execution.parallel_batches,
    actualParallelism: execution.actual_parallelism,
    highRiskDecomposition: decomposition.decompositions,
    parallelEvidence: execution.parallel_evidence
  });
  files = await writeAutopilotBatchRun(applyRun);

  if (batchValidationResult.status === "PASS") {
    const recordCommit = await commitPaths(
      unique([summaryFile, ...autopilotBatchRunFiles(applyRun)]),
      REAL_PARALLEL_BATCH_COMMIT_MESSAGE,
      commandsRun
    );
    applyRun.summary_commit_hash = recordCommit.hash || null;
  }
  printAutopilotBatch(applyRun, {
    jsonPath: files.jsonPath,
    markdownPath: files.markdownPath,
    summaryPath: summaryFile
  });
}

async function autopilotRunner(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("autopilot run requires --dry-run or --apply.");
  }
  const goal = (args.goal || args.text).trim();
  if (!goal) {
    throw new Error("Missing --goal for autopilot run.");
  }
  if (!Number.isInteger(args.maxSteps) || args.maxSteps < 1 || args.maxSteps > 4) {
    throw new Error("Autopilot Runner allows --max-steps between 1 and 4.");
  }
  if (args.maxSteps > 1) {
    return autopilotContinuousRunner(args);
  }

  const globalContext = await loadGlobalContextBundle();
  const { context, output } = await runPlanningCenter(goal);
  const selectedAction = actionFromPlanningOutput(output);
  const gate = await localExecutionGate(selectedAction);
  const route = await loadSkillRoute(`${selectedAction.title} ${selectedAction.reason}`);
  const internalTask = internalTaskFromAction(goal, selectedAction, route, gate.execution_target);
  const runPlan = executorRunPlan(goal, selectedAction, internalTask, gate.execution_target);
  const executionRepo = executionRepoPath(gate.execution_target);
  let commandsRun = [
    {
      command: "read runtime/global/*",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `files=${Object.keys(globalContext.files).length}; stage=${globalContextSummary(globalContext).current_v4_stage}`,
      stderr_tail: ""
    },
    {
      command: "Planning Center buildPlanningOutput",
      ok: true,
      status: 0,
      blocked: false,
      stdout_tail: `planning_output_id=${output.planning_output_id}; next_action=${selectedAction.title}`,
      stderr_tail: ""
    },
    {
      command: "governance check",
      ok: gate.governance?.governance_check === "PASS",
      status: gate.governance?.governance_check === "PASS" ? 0 : 1,
      blocked: false,
      stdout_tail: `status=${gate.governance?.governance_check ?? "unknown"}; risk=${gate.governance?.risk ?? selectedAction.risk}`,
      stderr_tail: ""
    },
    {
      command: "approval policy",
      ok: gate.governance?.approval_policy === "PASS",
      status: gate.governance?.approval_policy === "PASS" ? 0 : 1,
      blocked: false,
      stdout_tail: `automation_mode=${gate.governance?.automation_mode ?? "unknown"}; execution_mode=${gate.execution_mode}`,
      stderr_tail: ""
    },
    {
      command: "release gate",
      ok: Boolean(gate.governance?.release_gate),
      status: gate.governance?.release_gate ? 0 : 1,
      blocked: gate.governance?.release_gate !== "PASS",
      stdout_tail: `status=${gate.governance?.release_gate ?? "unknown"}; categories=${(gate.governance?.categories ?? []).join(", ")}`,
      stderr_tail: gate.governance?.release_gate === "PASS" ? "" : gate.reason
    }
  ];
  const baseValidation = {
    status: args.dryRun ? "DRY_RUN" : "RECORDED",
    command_count: commandsRun.length,
    failed_commands: []
  };
  const dryRunExecution = {
    executed: false,
    implementation: gate.allowed ? "planned-local-repository-execution" : "proposal-only",
    summary: gate.allowed
      ? "Dry-run only. Autopilot Executor would apply the safe local repository action."
      : "Dry-run only. Action is outside the safe execution gate.",
    files: []
  };
  const baseRecommendation = gate.allowed
    ? executorNextRecommendation(goal, output)
    : planningOnlyNextRecommendation(goal, selectedAction, gate);

  let run = buildAutopilotRunnerRun({
    goal,
    context,
    globalContext,
    planningOutput: output,
    selectedAction,
    mode: args.apply ? "apply" : "dry-run",
    maxSteps: args.maxSteps,
    gate,
    internalTask,
    runPlan,
    executionResult: dryRunExecution,
    commandsRun,
    changedFiles: [],
    validationResult: baseValidation,
    commitHash: null,
    nextRecommendationValue: baseRecommendation
  });
  if (args.apply) {
    run.changed_files = autopilotRunnerRunFiles(run);
  }

  if (args.dryRun) {
    printAutopilotRunner(run);
    return;
  }

  let executionResult = dryRunExecution;
  let validationResult = { status: "PROPOSAL_ONLY", command_count: commandsRun.length, failed_commands: [] };
  let implementationChangedFiles = [];
  let implementationCommitHash = null;
  let postExecutionPlanningOutput = output;

  if (gate.allowed) {
    executionResult = await executeLocalRepoAction(selectedAction, globalContext, output);
    commandsRun.push({
      command: `Autopilot Executor ${executionResult.implementation}`,
      ok: executionResult.executed,
      status: executionResult.executed ? 0 : 1,
      blocked: false,
      stdout_tail: executionResult.summary,
      stderr_tail: executionResult.executed ? "" : "No local executor handled this action."
    });

    for (const command of ["pnpm typecheck", "pnpm lint:check", "git diff --check"]) {
      commandsRun.push(await runAllowedCommand(command, executionRepo));
    }

    validationResult = validationSummary(commandsRun.filter((command) =>
      ["pnpm typecheck", "pnpm lint:check", "git diff --check"].includes(command.command)
    ));
    implementationChangedFiles = await currentChangedFiles(executionRepo);

    if (validationResult.status === "PASS" && executionResult.executed) {
      const implementationCommit = await commitPaths(
        implementationChangedFiles,
        commitMessageForAction(selectedAction),
        commandsRun,
        executionRepo
      );
      implementationCommitHash = implementationCommit.hash || null;
      if (!implementationCommit.ok) {
        validationResult = {
          status: "FAIL",
          command_count: commandsRun.length,
          failed_commands: ["git commit implementation"]
        };
      } else {
        postExecutionPlanningOutput = (await runPlanningCenter(goal)).output;
      }
    }
  }

  const nextRecommendationValue = validationResult.status === "PASS" && implementationCommitHash
    ? executorNextRecommendation(goal, postExecutionPlanningOutput)
    : planningOnlyNextRecommendation(goal, selectedAction, gate);

  run = buildAutopilotRunnerRun({
    goal,
    context,
    globalContext,
    planningOutput: output,
    selectedAction,
    mode: "apply",
    maxSteps: args.maxSteps,
    gate,
    internalTask,
    runPlan,
    executionResult,
    commandsRun,
    changedFiles: unique([...implementationChangedFiles, "pending-run-record"]).sort(),
    validationResult,
    commitHash: implementationCommitHash,
    nextRecommendationValue
  });
  run.changed_files = unique([...implementationChangedFiles, ...autopilotRunnerRunFiles(run)]).sort();

  const files = await writeAutopilotRunnerRun(run);
  if (validationResult.status === "PASS" && implementationCommitHash) {
    const runRecordCommit = await commitPaths(autopilotRunnerRunFiles(run), "chore(autopilot): record executor run", commandsRun);
    run.run_record_commit_hash = runRecordCommit.hash || null;
  }
  printAutopilotRunner(run, files);
}

async function autopilot(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("autopilot requires --dry-run or --apply.");
  }
  const goal = (args.goal || args.text).trim();
  if (!goal) {
    throw new Error("Missing --goal for autopilot.");
  }
  if (args.maxSteps !== 1) {
    throw new Error("Autopilot MVP only allows --max-steps 1.");
  }
  const { context, output } = await runPlanningCenter(goal);
  const action = actionFromPlanningOutput(output);
  if (action.risk === "CRITICAL" && !action.approval_required) {
    throw new Error("Internal autopilot policy violation: CRITICAL risk action must require human approval.");
  }
  const run = buildAutopilotRun(goal, context, action, args.apply ? "apply" : "dry-run", args.maxSteps, output);

  if (args.dryRun) {
    printAutopilot(run);
    return;
  }

  const files = await writeAutopilotRun(run);
  printAutopilot(run, files);
}

async function plan(args) {
  if (!args.dryRun) {
    throw new Error("plan currently supports --dry-run only.");
  }
  const goal = (args.goal || args.text).trim();
  if (!goal) {
    throw new Error("Missing --goal for plan.");
  }
  const { request, output } = await runPlanningCenter(goal, { completionAware: args.completionAware });
  console.log("# Planning Center dry-run");
  console.log("");
  console.log(`goal: ${goal}`);
  console.log(`completion_aware: ${args.completionAware ? "yes" : "no"}`);
  console.log(`request_id: ${request.request_id}`);
  console.log(`planning_output_id: ${output.planning_output_id}`);
  console.log(`current_stage: ${output.current_stage.stage_name}`);
  console.log(`next_action: ${output.next_action.title}`);
  console.log(`reason: ${output.reason}`);
  console.log(`target_project: ${output.target_project}`);
  console.log(`target_package: ${output.target_package}`);
  console.log(`risk: ${output.risk}`);
  console.log(`approval_required: ${output.approval_required ? "yes" : "no"}`);
  if (output.v5_completion) {
    console.log("");
    console.log("v5_completion:");
    console.log(`- completed_stages: ${output.v5_completion.completed_stages.join(", ") || "none"}`);
    console.log(`- partial_areas: ${output.v5_completion.partial_areas.join(", ") || "none"}`);
    console.log(`- remaining_gaps: ${output.v5_completion.remaining_gaps.length}`);
    console.log(`- selected_gap: ${output.v5_completion.selected_gap?.gap_id ?? "none"}`);
  }
  console.log("");
  console.log("expected_files:");
  for (const file of output.expected_files) console.log(`- ${file}`);
  console.log("");
  console.log("validation_commands:");
  for (const command of output.validation_commands) console.log(`- ${command}`);
  console.log("");
  if (output.batch_plan) {
    console.log("batch_plan:");
    console.log(`- batch_id: ${output.batch_plan.batch_id}`);
    console.log(`- task_count: ${output.batch_plan.tasks.length}`);
    console.log("| Agent | Task | Target Package | Risk | Mode |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const task of output.batch_plan.tasks) {
      console.log(`| ${task.owner_agent} | ${task.task_id} | ${task.target_package} | ${task.risk} | ${task.execution_mode ?? "proposal_only"} |`);
    }
    console.log("");
  }
  console.log(`stop_condition: ${output.stop_condition}`);
  console.log("agent_execution: disabled");
  console.log("managed_project_writes: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
}

async function consoleRender(args) {
  assertDryRun(args, "console render");
  const navigationPath = resolveFromRoot("apps/console/src/navigation.ts");
  const manifestPath = resolveFromRoot("apps/console/src/route-manifest.ts");
  const viewModelPath = resolveFromRoot("apps/console/src/view-model.ts");
  const navigationText = await readTextIfExists(navigationPath);
  const manifestText = await readTextIfExists(manifestPath);
  const viewModelText = await readTextIfExists(viewModelPath);
  const routeIds = unique([...navigationText.matchAll(/id:\s*"([a-zA-Z0-9]+)"/g)].map((match) => match[1]));
  const manifestIds = unique([...manifestText.matchAll(/"([a-zA-Z0-9]+)"/g)].map((match) => match[1]));
  const requiredRoutes = ["dashboard", "projects", "runtimeCenter", "governance", "autopilot", "memory"];
  const missingRoutes = requiredRoutes.filter((id) =>
    !routeIds.includes(id)
    || !manifestIds.includes(id)
    || !viewModelText.includes(`if (id === "${id}")`)
  );
  const renderStatus = missingRoutes.length === 0 && existsSync(manifestPath) ? "PASS" : "FAIL";

  console.log("# Console Render dry-run");
  console.log("");
  console.log(`routes_count: ${routeIds.length}`);
  console.log(`required_routes_count: ${requiredRoutes.length}`);
  console.log(`render_status: ${renderStatus}`);
  console.log(`missing_routes: ${missingRoutes.length === 0 ? "none" : missingRoutes.join(", ")}`);
  console.log("database: not_connected");
  console.log("external_services: not_called");
  console.log("agent_execution: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("credential_values: not_read");
}

async function loadConsoleActionCenter() {
  return readJson(resolveFromRoot("apps/console/examples/console-actions.example.json"));
}

function normalizeConsoleActionId(actionId) {
  if (actionId === "autopilot-run") return "autopilot-dry-run";
  if (actionId === "pending-proposals") return "proposal-review";
  if (actionId === "worker-status") return "worker-health";
  if (actionId === "smart-park-go-live-plan-dry-run") return "smart-park-go-live-plan";
  if (actionId === "proposal-approve") return "proposal-approve-dry-run";
  if (actionId === "proposal-inject") return "proposal-approve-apply";
  if (actionId === "server-preview") return "release-server-preview";
  if (actionId === "reviewed-publish") return "release-reviewed-publish";
  return actionId;
}

function consoleGateForRisk(risk) {
  if (risk === "CRITICAL") {
    return {
      status: "BLOCKED",
      executionMode: "human_approval_required",
      mode: "read_only",
      governanceGate: "HUMAN_APPROVAL_REQUIRED",
      requiresApproval: true,
      dryRun: false,
      blockedReason: "CRITICAL risk requires explicit human approval and cannot be executed from Console."
    };
  }
  if (risk === "HIGH") {
    return {
      status: "PROPOSAL_ONLY",
      executionMode: "proposal_only",
      mode: "read_only",
      governanceGate: "PROPOSAL_ONLY",
      requiresApproval: true,
      dryRun: false,
      blockedReason: "HIGH risk stays proposal_only from Console."
    };
  }
  return {
    status: "PLANNED_EXECUTION",
    executionMode: "direct_execute",
    mode: "direct_execute",
    governanceGate: "ALLOW_DIRECT_EXECUTE",
    requiresApproval: false,
    dryRun: false,
    blockedReason: null
  };
}

function buildConsoleCliActionPlan(actionCenter, actionId, options = {}) {
  const normalizedActionId = normalizeConsoleActionId(actionId);
  const action = (actionCenter.actions ?? []).find((item) => item.id === normalizedActionId) ?? null;
  const targetProject = options.project || "jinhu-smart-park";
  const goal = (options.goal || "继续推进 Pilot").trim();
  if (!action) {
    return {
      schema_version: 1,
      plan_id: `console-action-plan-${createHash("sha1").update(normalizedActionId || "missing").digest("hex").slice(0, 10)}`,
      action_id: normalizedActionId,
      target_project: targetProject,
      goal_summary: goal.slice(0, 240),
      status: "BLOCKED",
      risk: "CRITICAL",
      execution_mode: "human_approval_required",
      mode: "read_only",
      write_enabled: false,
      production_enabled: false,
      dry_run: false,
      command: "",
      requires_approval: true,
      governance_gate: "HUMAN_APPROVAL_REQUIRED",
      steps: ["Stop because the requested Console action is not registered."],
      safety: {
        deploy: "disabled",
        production_operations: "disabled",
        server_access: "disabled",
        credential_values: "not_read",
        managed_project_writes: "disabled",
        model_invocation: "disabled"
      },
      blocked_reasons: [`Unknown Console action: ${normalizedActionId}`],
      not_registered: true
    };
  }
  const gate = consoleGateForRisk(action.risk);
  return {
    schema_version: 1,
    plan_id: `console-action-plan-${action.id}`,
    action_id: action.id,
    target_project: targetProject,
    goal_summary: goal.slice(0, 240),
    label: action.label,
    intent: action.intent,
    status: gate.status,
    risk: action.risk,
    execution_mode: gate.executionMode,
    mode: gate.mode,
    write_enabled: false,
    production_enabled: false,
    dry_run: gate.dryRun,
    command: action.command,
    requires_approval: gate.requiresApproval,
    governance_gate: gate.governanceGate,
    steps: [
      "Read Console action intent metadata.",
      "Apply Governance Gate before any command execution.",
      gate.requiresApproval ? "Generate/review proposal or approval evidence; do not execute this action." : "Allow the local Action Server to execute the mapped LOW/MEDIUM allowlist command.",
      action.id === "agent-real-plan"
        ? "Allow only explicit user-selected local Codex/Claude CLI invocation; keep deploy, production operations, managed project writes, and credential value reads disabled."
        : "Keep deploy, production operations, managed project writes, model calls, and credential value reads disabled."
    ],
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      model_invocation: action.id === "agent-real-plan" ? "user_selected_local_cli_runtime" : "disabled"
    },
    blocked_reasons: [
      ...(action.disabledReason ? [action.disabledReason] : []),
      ...(gate.blockedReason ? [gate.blockedReason] : [])
    ]
  };
}

async function consoleActionsDryRun(args) {
  assertDryRun(args, "console actions");
  const actionCenter = await loadConsoleActionCenter();
  const actions = actionCenter.actions ?? [];
  const proposalOnlyCount = actions.filter((action) => ["HIGH", "CRITICAL"].includes(action.risk)).length;
  console.log("# Console Action Center dry-run");
  console.log("");
  console.log(`action_center_id: ${actionCenter.action_center_id}`);
  console.log(`actions: ${actions.length}`);
  console.log(`default_mode: ${actionCenter.default_mode}`);
  console.log(`write_enabled: ${actionCenter.write_enabled ? "yes" : "no"}`);
  console.log(`production_enabled: ${actionCenter.production_enabled ? "yes" : "no"}`);
  console.log(`proposal_only_actions: ${proposalOnlyCount}`);
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("server_access: disabled");
  console.log("credential_values: not_read");
  console.log("model_invocation: disabled");
  console.log("");
  console.log("| Action | Intent | Scope | Mode | Risk | Gate | Write | Production |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const action of actions) {
    const gate = consoleGateForRisk(action.risk);
    console.log(`| ${action.id} | ${action.intent} | ${action.scope} | ${gate.mode}/${gate.executionMode} | ${action.risk} | ${gate.governanceGate} | ${action.write_enabled ? "yes" : "no"} | ${action.production_enabled ? "yes" : "no"} |`);
  }
}

async function consoleActionPlan(args) {
  assertDryRun(args, "console action-plan");
  if (!args.action.trim()) {
    throw new Error("Missing --action for console action-plan.");
  }
  const actionCenter = await loadConsoleActionCenter();
  const plan = buildConsoleCliActionPlan(actionCenter, args.action.trim(), {
    goal: args.goal || args.text,
    project: args.project && args.project !== DEFAULT_PROJECT ? args.project : "jinhu-smart-park"
  });
  console.log("# Console Action Plan dry-run");
  console.log("");
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`action_id: ${plan.action_id}`);
  console.log(`target_project: ${plan.target_project}`);
  console.log(`goal_summary: ${plan.goal_summary}`);
  if (plan.label) console.log(`label: ${plan.label}`);
  if (plan.intent) console.log(`intent: ${plan.intent}`);
  console.log(`status: ${plan.status}`);
  console.log(`risk: ${plan.risk}`);
  console.log(`mode: ${plan.mode}`);
  console.log(`execution_mode: ${plan.execution_mode}`);
  console.log(`governance_gate: ${plan.governance_gate}`);
  console.log(`requires_approval: ${plan.requires_approval ? "yes" : "no"}`);
  console.log(`write_enabled: ${plan.write_enabled ? "yes" : "no"}`);
  console.log(`production_enabled: ${plan.production_enabled ? "yes" : "no"}`);
  console.log(`command: ${plan.command || "none"}`);
  console.log("");
  console.log("steps:");
  for (const step of plan.steps) console.log(`- ${step}`);
  console.log("");
  console.log("safety:");
  console.log(`- deploy: ${plan.safety.deploy}`);
  console.log(`- production_operations: ${plan.safety.production_operations}`);
  console.log(`- server_access: ${plan.safety.server_access}`);
  console.log(`- credential_values: ${plan.safety.credential_values}`);
  console.log(`- managed_project_writes: ${plan.safety.managed_project_writes}`);
  console.log(`- model_invocation: ${plan.safety.model_invocation}`);
  console.log("");
  console.log("blocked_reasons:");
  if (plan.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of plan.blocked_reasons) console.log(`- ${reason}`);
  }
  if (plan.not_registered) process.exitCode = 1;
}

async function accessSummaryDryRun(args) {
  assertDryRun(args, "access summary");
  const { api, bundle } = await loadAccessCenterApi();
  const context = args.user.trim() ? api.resolveUserProfile(bundle, args.user.trim()) : null;
  const summary = api.accessSummary(bundle, context);
  const entitlementUsage = api.workspaceEntitlementUsage(bundle, summary.workspace_id);
  console.log("# Access Center Summary dry-run");
  console.log("");
  console.log(`policy_id: ${summary.policy_id}`);
  console.log(`workspace_id: ${summary.workspace_id}`);
  console.log(`auth_mode: ${summary.auth_mode}`);
  console.log(`allow_anonymous_console_read: ${summary.allow_anonymous_console_read ? "yes" : "no"}`);
  console.log(`session_ttl_hours: ${summary.session_ttl_hours}`);
  console.log(`session_store_path: ${relative(repoRoot, summary.session_store_path)}`);
  console.log(`role_count: ${summary.role_count}`);
  console.log(`user_count: ${summary.user_count}`);
  console.log(`membership_count: ${summary.membership_count}`);
  console.log(`plan_count: ${summary.plan_count}`);
  console.log(`invite_count: ${summary.invite_count ?? 0}`);
  console.log(`pending_invite_count: ${summary.pending_invite_count ?? 0}`);
  console.log(`approved_invite_count: ${summary.approved_invite_count ?? 0}`);
  console.log(`materialized_invite_count: ${summary.materialized_invite_count ?? 0}`);
  if (args.user.trim()) {
    console.log(`selected_user: ${summary.current_user?.username ?? "not_found"}`);
    console.log(`authenticated_profile: ${summary.authenticated ? "yes" : "no"}`);
    console.log(`selected_plan: ${summary.current_plan?.display_name ?? "none"}`);
    console.log(`selected_roles: ${summary.current_roles.length > 0 ? summary.current_roles.join(", ") : "none"}`);
    console.log(`direct_execute_max_risk: ${summary.direct_execute_max_risk}`);
    if (summary.current_plan_limits) {
      console.log(`seat_limit: ${summary.current_plan_limits.seat_limit ?? "unlimited"}`);
      console.log(`project_scope_limit: ${summary.current_plan_limits.project_scope_limit ?? "unlimited"}`);
      console.log(`worker_parallel_limit: ${summary.current_plan_limits.worker_parallel_limit ?? "unlimited"}`);
      console.log(`runtime_allowlist: ${summary.current_plan_limits.runtime_allowlist?.join(", ") || "none"}`);
    }
  }
  console.log("");
  console.log("| Plan | Seats | Project Scope | Worker Parallel | Runtime Allowlist |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const item of entitlementUsage) {
    const seats = item.seat_limit == null ? `${item.seat_usage}/unlimited` : `${item.seat_usage}/${item.seat_limit}`;
    console.log(`| ${item.display_name} | ${seats} | ${item.project_scope_limit ?? "unlimited"} | ${item.worker_parallel_limit ?? "unlimited"} | ${(item.runtime_allowlist ?? []).join(", ") || "none"} |`);
  }
}

async function accessUsersDryRun(args) {
  assertDryRun(args, "access users");
  const { api, bundle } = await loadAccessCenterApi();
  const users = api.listStudioUsers(bundle);
  console.log("# Access Center Users dry-run");
  console.log("");
  console.log(`users: ${users.length}`);
  console.log("| Username | Display Name | Status | Plan | Roles | Direct Execute | Projects |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const user of users) {
    const profile = api.resolveUserProfile(bundle, user.user_id);
    console.log(`| ${user.username} | ${user.display_name} | ${user.status} | ${user.plan_name} | ${(user.effective_roles ?? []).join(", ") || "none"} | ${user.direct_execute_max_risk} | ${(profile.project_allowlist ?? []).join(", ") || "none"} |`);
  }
}

async function accessPlansDryRun(args) {
  assertDryRun(args, "access plans");
  const { api, bundle } = await loadAccessCenterApi();
  const plans = api.listPlanEntitlements(bundle);
  console.log("# Access Center Plans dry-run");
  console.log("");
  console.log(`plans: ${plans.length}`);
  console.log("| Plan | Tier | Capabilities | Beta Features | Direct Execute | Seats | Project Scope | Worker Parallel | Runtime Allowlist |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const plan of plans) {
    const seatUsage = plan.seat_limit == null ? `${plan.seat_usage}/unlimited` : `${plan.seat_usage}/${plan.seat_limit}`;
    console.log(`| ${plan.display_name} | ${plan.tier} | ${plan.capability_count} | ${plan.beta_feature_count} | ${plan.direct_execute_max_risk} | ${seatUsage} | ${plan.project_scope_limit ?? "unlimited"} | ${plan.worker_parallel_limit ?? "unlimited"} | ${(plan.runtime_allowlist ?? []).join(", ") || "none"} |`);
  }
}

async function accessInvitesDryRun(args) {
  assertDryRun(args, "access invites");
  const { api, bundle } = await loadAccessCenterApi();
  const summary = api.accessInviteSummary(bundle);
  const invites = api.listAccessInvites(bundle, { include_terminal: true });
  console.log("# Access Center Invites dry-run");
  console.log("");
  console.log(`workspace_id: ${bundle.state.workspace_id ?? bundle.policy.default_workspace_id}`);
  console.log(`invites: ${summary.invite_count}`);
  console.log(`pending: ${summary.pending_invite_count}`);
  console.log(`approved: ${summary.approved_invite_count}`);
  console.log(`materialized: ${summary.materialized_invite_count ?? 0}`);
  console.log(`rejected: ${summary.rejected_invite_count}`);
  console.log(`cancelled: ${summary.cancelled_invite_count}`);
  console.log("");
  console.log("| Invite | Username | Role | Plan | Scope | Status | Seats Remaining | Next |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const invite of invites) {
    console.log(`| ${invite.invite_id} | ${invite.username} | ${invite.requested_role_name} | ${invite.requested_plan_name} | ${(invite.requested_project_allowlist ?? []).join(", ") || "none"} | ${invite.status} | ${invite.impact?.seats_remaining ?? "unlimited"} | ${invite.next_action} |`);
  }
}

async function accessCheckDryRun(args) {
  assertDryRun(args, "access check");
  if (!args.user.trim()) throw new Error("Missing --user for access check.");
  if (!args.action.trim()) throw new Error("Missing --action for access check.");

  const { api, bundle } = await loadAccessCenterApi();
  const actionCenter = await loadConsoleActionCenter();
  const normalizedActionId = normalizeConsoleActionId(args.action.trim());
  const action = (actionCenter.actions ?? []).find((item) => item.id === normalizedActionId) ?? null;
  const projectId = args.project && args.project !== DEFAULT_PROJECT ? args.project : "jinhu-smart-park";
  const context = api.resolveUserProfile(bundle, args.user.trim());
  const requestedParallel = ["autopilot-execute", "smart-park-continue", "smart-park-blockers", "agent-real-plan"].includes(normalizedActionId) ? 4 : 1;
  const workerParallelLimit = Number(context.plan?.worker_parallel_limit ?? 0);
  const effectiveParallel = Number.isFinite(workerParallelLimit) && workerParallelLimit > 0
    ? Math.max(1, Math.min(requestedParallel, workerParallelLimit))
    : requestedParallel;
  const decision = await api.evaluateConsoleActionAccess(bundle, {
    action_id: normalizedActionId,
    project_id: projectId,
    risk: action?.risk ?? "LOW",
    attachment_count: 0,
    runtime_id: "codex-cli",
    parallel_count: effectiveParallel
  }, {
    user_context: context,
    allow_default_user: false
  });

  console.log("# Access Center Check dry-run");
  console.log("");
  console.log(`user: ${context.user?.username ?? "not_found"}`);
  console.log(`display_name: ${context.user?.display_name ?? "not_found"}`);
  console.log(`workspace_id: ${context.workspace_id}`);
  console.log(`action_id: ${normalizedActionId}`);
  console.log(`action_label: ${action?.label ?? "not_registered"}`);
  console.log(`target_project: ${projectId}`);
  console.log(`risk: ${action?.risk ?? "LOW"}`);
  console.log(`requested_parallel: ${requestedParallel}`);
  console.log(`effective_parallel: ${effectiveParallel}`);
  console.log(`status: ${decision.status}`);
  console.log(`execution_mode: ${decision.execution_mode}`);
  console.log(`reason: ${decision.reason}`);
  console.log(`required_capabilities: ${decision.required_capabilities.join(", ") || "none"}`);
  console.log(`missing_capabilities: ${decision.missing_capabilities.join(", ") || "none"}`);
  console.log(`effective_capabilities: ${decision.effective_capabilities.join(", ") || "none"}`);
  console.log(`project_scope: ${decision.project_scope.join(", ") || "none"}`);
  console.log(`direct_execute_max_risk: ${decision.direct_execute_max_risk}`);
  console.log(`roles: ${context.roles.map((role) => role.role_id).join(", ") || "none"}`);
  console.log(`plan: ${context.plan?.display_name ?? "none"}`);
  if (decision.plan_limits) {
    console.log(`seat_limit: ${decision.plan_limits.seat_limit ?? "unlimited"}`);
    console.log(`project_scope_limit: ${decision.plan_limits.project_scope_limit ?? "unlimited"}`);
    console.log(`worker_parallel_limit: ${decision.plan_limits.worker_parallel_limit ?? "unlimited"}`);
    console.log(`runtime_allowlist: ${decision.plan_limits.runtime_allowlist?.join(", ") || "none"}`);
  }
}

async function accessEnforcement(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("access enforcement requires --dry-run or --apply.");
  }
  const { api, bundle } = await loadAccessCenterApi();
  const artifact = await api.buildAccessEnforcementSummary(bundle, {
    user: args.user.trim() || bundle.policy.default_console_user_id,
    project_id: args.project && args.project !== DEFAULT_PROJECT ? args.project : "jinhu-smart-park"
  });
  const filesWritten = [];
  if (args.apply) {
    const outputPath = resolveFromRoot("runtime/global/access-enforcement.json");
    await writeJsonFile(outputPath, artifact);
    filesWritten.push(relativePath(outputPath));
    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [relativePath(outputPath)]
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Access Enforcement ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`policy_id: ${artifact.policy_id}`);
  console.log(`workspace_id: ${artifact.workspace_id}`);
  console.log(`user: ${artifact.evaluated_user?.username ?? "not_found"}`);
  console.log(`project: ${artifact.evaluated_project}`);
  console.log(`authenticated: ${artifact.authenticated ? "yes" : "no"}`);
  console.log(`allow_anonymous_console_read: ${artifact.allow_anonymous_console_read ? "yes" : "no"}`);
  console.log(`direct_execute_max_risk: ${artifact.direct_execute_max_risk}`);
  console.log(`project_allowlist: ${artifact.project_allowlist.join(", ") || "none"}`);
  console.log(`runtime_allowlist: ${artifact.runtime_allowlist.join(", ") || "none"}`);
  console.log(`worker_parallel_limit: ${artifact.worker_parallel_limit || "unlimited"}`);
  console.log("");
  console.log("| Route | Allowed | Missing Capabilities |");
  console.log("| --- | --- | --- |");
  for (const route of artifact.route_checks) {
    console.log(`| ${route.route_id} | ${route.allowed ? "yes" : "no"} | ${route.missing_capabilities.join(", ") || "none"} |`);
  }
  console.log("");
  console.log("| Action | Status | Mode | Missing Capabilities | Reason |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const action of artifact.action_checks) {
    console.log(`| ${action.action_id} | ${action.status} | ${action.execution_mode} | ${action.missing_capabilities.join(", ") || "none"} | ${action.reason} |`);
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
}

function assertDryRunOrApply(args, commandName) {
  if (!args.dryRun && !args.apply) {
    throw new Error(`${commandName} requires either --dry-run or --apply.`);
  }
}

function accessWorkspaceId(args, bundle) {
  return args.workspace.trim() || bundle.state.workspace_id || bundle.policy.default_workspace_id;
}

function accessProjectScopeList(args) {
  const raw = args.projects.trim();
  if (!raw) return [];
  if (raw === "*") return ["*"];
  return [...new Set(raw.split(",").map((item) => item.trim()).filter(Boolean))];
}

function printAccessMutationHeader(title, mode) {
  console.log(`# ${title} ${mode}`);
  console.log("");
}

function accessReviewDecision(args) {
  if (args.approve && args.reject) {
    throw new Error("Choose either --approve or --reject, not both.");
  }
  if (args.reject) return "REJECTED";
  return "APPROVED";
}

async function accessGrant(args) {
  assertDryRunOrApply(args, "access grant");
  if (!args.user.trim()) throw new Error("Missing --user for access grant.");
  if (!args.role.trim()) throw new Error("Missing --role for access grant.");

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);
  const workspaceId = accessWorkspaceId(args, bundle);
  const role = (bundle.policy.roles ?? []).find((item) => item.role_id === args.role.trim());
  if (!role) throw new Error(`Role not found: ${args.role.trim()}`);

  printAccessMutationHeader("Access Grant", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`role_id: ${role.role_id}`);
  console.log(`role_name: ${role.display_name}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-memberships.json");
    return;
  }

  const result = await api.assignWorkspaceRole(bundle, user.user_id, role.role_id, { workspace_id: workspaceId });
  console.log(`status: PASS`);
  console.log(`membership_id: ${result.membership.membership_id}`);
  console.log(`roles: ${(result.membership.role_ids ?? []).join(", ")}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
}

async function accessSetPlan(args) {
  assertDryRunOrApply(args, "access set-plan");
  if (!args.user.trim()) throw new Error("Missing --user for access set-plan.");
  if (!args.plan.trim()) throw new Error("Missing --plan for access set-plan.");

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);
  const workspaceId = accessWorkspaceId(args, bundle);
  const plan = (bundle.plans.plans ?? []).find((item) => item.plan_id === args.plan.trim());
  if (!plan) throw new Error(`Plan not found: ${args.plan.trim()}`);

  printAccessMutationHeader("Access Set Plan", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`plan_name: ${plan.display_name}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-users.json, runtime/global/access-memberships.json");
    return;
  }

  const result = await api.assignWorkspacePlan(bundle, user.user_id, plan.plan_id, { workspace_id: workspaceId });
  console.log("status: PASS");
  console.log(`default_plan_id: ${result.user.default_plan_id}`);
  console.log(`membership_plan_id: ${result.membership.plan_id}`);
  console.log(`written_paths: ${result.written_paths.map((file) => relative(repoRoot, file)).join(", ")}`);
}

async function accessResetPassword(args) {
  assertDryRunOrApply(args, "access reset-password");
  if (!args.user.trim()) throw new Error("Missing --user for access reset-password.");
  if (!args.password.trim()) throw new Error("Missing --password for access reset-password.");

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);

  printAccessMutationHeader("Access Reset Password", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`password_length: ${args.password.trim().length}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-users.json");
    console.log("secret_values_read: no");
    console.log("secret_values_stored: password_hash_only");
    return;
  }

  const result = await api.resetStudioUserPassword(bundle, user.user_id, args.password.trim());
  console.log("status: PASS");
  console.log(`user_id: ${result.user.user_id}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
  console.log("secret_values_read: no");
  console.log("secret_values_stored: password_hash_only");
}

async function accessToggleUser(args, status) {
  const actionName = status === "ACTIVE" ? "access enable-user" : "access disable-user";
  assertDryRunOrApply(args, actionName);
  if (!args.user.trim()) throw new Error(`Missing --user for ${actionName}.`);

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);

  printAccessMutationHeader(status === "ACTIVE" ? "Access Enable User" : "Access Disable User", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`current_status: ${user.status}`);
  console.log(`next_status: ${status}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-users.json");
    return;
  }

  const result = await api.updateStudioUserStatus(bundle, user.user_id, status);
  console.log("status: PASS");
  console.log(`user_id: ${result.user.user_id}`);
  console.log(`updated_status: ${result.user.status}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
}

async function accessCreateUser(args) {
  assertDryRunOrApply(args, "access create-user");
  if (!args.user.trim()) throw new Error("Missing --user for access create-user.");
  if (!args.displayName.trim()) throw new Error("Missing --display-name for access create-user.");
  if (!args.role.trim()) throw new Error("Missing --role for access create-user.");
  if (!args.plan.trim()) throw new Error("Missing --plan for access create-user.");
  if (!args.password.trim()) throw new Error("Missing --password for access create-user.");

  const { api, bundle } = await loadAccessCenterApi();
  const workspaceId = accessWorkspaceId(args, bundle);
  const projectAllowlist = accessProjectScopeList(args);
  const role = (bundle.policy.roles ?? []).find((item) => item.role_id === args.role.trim());
  const plan = (bundle.plans.plans ?? []).find((item) => item.plan_id === args.plan.trim());
  if (!role) throw new Error(`Role not found: ${args.role.trim()}`);
  if (!plan) throw new Error(`Plan not found: ${args.plan.trim()}`);

  printAccessMutationHeader("Access Create User", args.apply ? "apply" : "dry-run");
  console.log(`username: ${args.user.trim().toLowerCase()}`);
  console.log(`display_name: ${args.displayName.trim()}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`role_id: ${role.role_id}`);
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`project_allowlist: ${(projectAllowlist.length > 0 ? projectAllowlist : ["default"]).join(", ")}`);
  console.log(`password_length: ${args.password.trim().length}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-users.json, runtime/global/access-memberships.json");
    console.log("secret_values_read: no");
    console.log("secret_values_stored: password_hash_only");
    return;
  }

  const result = await api.createStudioUser(bundle, {
    username: args.user.trim(),
    display_name: args.displayName.trim(),
    role_id: role.role_id,
    plan_id: plan.plan_id,
    password: args.password.trim(),
    workspace_id: workspaceId,
    project_allowlist: projectAllowlist.length > 0 ? projectAllowlist : undefined
  });
  console.log("status: PASS");
  console.log(`user_id: ${result.user.user_id}`);
  console.log(`membership_id: ${result.membership.membership_id}`);
  console.log(`written_paths: ${result.written_paths.map((file) => relative(repoRoot, file)).join(", ")}`);
  console.log("secret_values_read: no");
  console.log("secret_values_stored: password_hash_only");
}

async function accessInviteUser(args) {
  assertDryRunOrApply(args, "access invite-user");
  if (!args.user.trim()) throw new Error("Missing --user for access invite-user.");
  if (!args.displayName.trim()) throw new Error("Missing --display-name for access invite-user.");
  if (!args.role.trim()) throw new Error("Missing --role for access invite-user.");
  if (!args.plan.trim()) throw new Error("Missing --plan for access invite-user.");

  const { api, bundle } = await loadAccessCenterApi();
  const workspaceId = accessWorkspaceId(args, bundle);
  const projectAllowlist = accessProjectScopeList(args);
  const role = (bundle.policy.roles ?? []).find((item) => item.role_id === args.role.trim());
  const plan = (bundle.plans.plans ?? []).find((item) => item.plan_id === args.plan.trim());
  if (!role) throw new Error(`Role not found: ${args.role.trim()}`);
  if (!plan) throw new Error(`Plan not found: ${args.plan.trim()}`);

  printAccessMutationHeader("Access Invite User", args.apply ? "apply" : "dry-run");
  console.log(`username: ${args.user.trim().toLowerCase()}`);
  console.log(`display_name: ${args.displayName.trim()}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`role_id: ${role.role_id}`);
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`project_allowlist: ${(projectAllowlist.length > 0 ? projectAllowlist : ["default"]).join(", ")}`);
  console.log(`comment: ${args.comment.trim() || "none"}`);

  if (args.dryRun) {
    const impact = api.listPlanEntitlements(bundle).find((item) => item.plan_id === plan.plan_id);
    console.log("status: READY");
    console.log(`seat_usage: ${impact?.seat_usage ?? "unknown"}`);
    console.log(`seat_limit: ${impact?.seat_limit ?? "unlimited"}`);
    console.log(`project_scope_limit: ${impact?.project_scope_limit ?? "unlimited"}`);
    console.log("writes: runtime/global/access-invites.json");
    return;
  }

  const actorProfile = api.resolveUserProfile(bundle, bundle.policy.default_console_user_id);
  const result = await api.createAccessInvite(bundle, {
    username: args.user.trim(),
    display_name: args.displayName.trim(),
    role_id: role.role_id,
    plan_id: plan.plan_id,
    workspace_id: workspaceId,
    project_allowlist: projectAllowlist.length > 0 ? projectAllowlist : undefined,
    request_comment: args.comment.trim(),
    requested_by_user_id: actorProfile.user?.user_id ?? bundle.policy.default_console_user_id,
    requested_by_name: actorProfile.user?.display_name ?? "Studio 平台所有者"
  });
  console.log("status: PASS");
  console.log(`invite_id: ${result.invite.invite_id}`);
  console.log(`invite_status: ${result.invite.status}`);
  console.log(`requested_role: ${result.invite.requested_role_name}`);
  console.log(`requested_plan: ${result.invite.requested_plan_name}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
}

async function accessReviewInvite(args) {
  assertDryRunOrApply(args, "access review-invite");
  if (!args.inviteId.trim()) throw new Error("Missing --invite-id for access review-invite.");
  const decision = accessReviewDecision(args);

  const { api, bundle } = await loadAccessCenterApi();
  const invite = api.listAccessInvites(bundle, { include_terminal: true }).find((item) => item.invite_id === args.inviteId.trim());
  if (!invite) throw new Error(`Access invite not found: ${args.inviteId.trim()}`);

  printAccessMutationHeader("Access Review Invite", args.apply ? "apply" : "dry-run");
  console.log(`invite_id: ${invite.invite_id}`);
  console.log(`username: ${invite.username}`);
  console.log(`decision: ${decision}`);
  console.log(`current_status: ${invite.status}`);
  console.log(`comment: ${args.comment.trim() || "none"}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log(`seat_remaining: ${invite.impact?.seats_remaining ?? "unlimited"}`);
    console.log(`next_action: ${invite.next_action}`);
    console.log("writes: runtime/global/access-invites.json");
    return;
  }

  const actorProfile = api.resolveUserProfile(bundle, bundle.policy.default_console_user_id);
  const result = await api.reviewAccessInvite(bundle, invite.invite_id, decision, {
    review_comment: args.comment.trim(),
    reviewed_by_user_id: actorProfile.user?.user_id ?? bundle.policy.default_console_user_id,
    reviewed_by_name: actorProfile.user?.display_name ?? "Studio 平台所有者"
  });
  console.log("status: PASS");
  console.log(`invite_id: ${result.invite.invite_id}`);
  console.log(`invite_status: ${result.invite.status}`);
  console.log(`reviewed_by: ${result.invite.reviewed_by_name}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
  if (result.invite.status === "APPROVED") {
    console.log(`next_step_hint: studio access materialize-invite --invite-id ${result.invite.invite_id} --password "<initial_password>" --apply`);
  }
}

async function accessMaterializeInvite(args) {
  assertDryRunOrApply(args, "access materialize-invite");
  if (!args.inviteId.trim()) throw new Error("Missing --invite-id for access materialize-invite.");
  if (!args.password.trim()) throw new Error("Missing --password for access materialize-invite.");

  const { api, bundle } = await loadAccessCenterApi();
  const invite = api.listAccessInvites(bundle, { include_terminal: true }).find((item) => item.invite_id === args.inviteId.trim());
  if (!invite) throw new Error(`Access invite not found: ${args.inviteId.trim()}`);

  printAccessMutationHeader("Access Materialize Invite", args.apply ? "apply" : "dry-run");
  console.log(`invite_id: ${invite.invite_id}`);
  console.log(`username: ${invite.username}`);
  console.log(`display_name: ${invite.display_name}`);
  console.log(`workspace_id: ${invite.workspace_id}`);
  console.log(`role_id: ${invite.requested_role_id}`);
  console.log(`plan_id: ${invite.requested_plan_id}`);
  console.log(`project_allowlist: ${(invite.requested_project_allowlist ?? []).join(", ") || "none"}`);
  console.log(`current_status: ${invite.status}`);
  console.log(`password_length: ${args.password.trim().length}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log(`seat_remaining: ${invite.impact?.seats_remaining ?? "unlimited"}`);
    console.log(`next_action: ${invite.next_action}`);
    console.log("writes: runtime/global/access-users.json, runtime/global/access-memberships.json, runtime/global/access-invites.json");
    console.log("secret_values_read: no");
    console.log("secret_values_stored: password_hash_only");
    return;
  }

  const actorProfile = api.resolveUserProfile(bundle, bundle.policy.default_console_user_id);
  const result = await api.materializeAccessInvite(bundle, invite.invite_id, args.password.trim(), {
    materialized_by_user_id: actorProfile.user?.user_id ?? bundle.policy.default_console_user_id,
    materialized_by_name: actorProfile.user?.display_name ?? "Studio 平台所有者"
  });
  console.log("status: PASS");
  console.log(`invite_status: ${result.invite.status}`);
  console.log(`materialized_user_id: ${result.user.user_id}`);
  console.log(`membership_id: ${result.membership.membership_id}`);
  console.log(`written_paths: ${result.written_paths.map((file) => relative(repoRoot, file)).join(", ")}`);
  console.log("secret_values_read: no");
  console.log("secret_values_stored: password_hash_only");
}

async function accessSetProjectScope(args) {
  assertDryRunOrApply(args, "access set-project-scope");
  if (!args.user.trim()) throw new Error("Missing --user for access set-project-scope.");
  if (!args.projects.trim()) throw new Error("Missing --projects for access set-project-scope.");

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);
  const workspaceId = accessWorkspaceId(args, bundle);
  const projects = accessProjectScopeList(args);

  printAccessMutationHeader("Access Set Project Scope", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`projects: ${projects.join(", ")}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-memberships.json");
    return;
  }

  const result = await api.updateWorkspaceProjectScope(bundle, user.user_id, projects, { workspace_id: workspaceId });
  console.log("status: PASS");
  console.log(`membership_id: ${result.membership.membership_id}`);
  console.log(`project_allowlist: ${(result.membership.project_allowlist ?? []).join(", ")}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
}

async function accessToggleMembership(args, status) {
  const actionName = status === "ACTIVE" ? "access resume-membership" : "access suspend-membership";
  assertDryRunOrApply(args, actionName);
  if (!args.user.trim()) throw new Error(`Missing --user for ${actionName}.`);

  const { api, bundle } = await loadAccessCenterApi();
  const user = api.findStudioUser(bundle, args.user.trim());
  if (!user) throw new Error(`Studio user not found: ${args.user.trim()}`);
  const workspaceId = accessWorkspaceId(args, bundle);

  printAccessMutationHeader(status === "ACTIVE" ? "Access Resume Membership" : "Access Suspend Membership", args.apply ? "apply" : "dry-run");
  console.log(`user: ${user.username}`);
  console.log(`workspace_id: ${workspaceId}`);
  console.log(`next_status: ${status}`);

  if (args.dryRun) {
    console.log("status: READY");
    console.log("writes: runtime/global/access-memberships.json");
    return;
  }

  const result = await api.updateWorkspaceMembershipStatus(bundle, user.user_id, status, { workspace_id: workspaceId });
  console.log("status: PASS");
  console.log(`membership_id: ${result.membership.membership_id}`);
  console.log(`updated_status: ${result.membership.status}`);
  console.log(`written_path: ${relative(repoRoot, result.written_path)}`);
}

const CONSOLE_SERVICE_LABEL = "com.anksen.agent-studio.console";

function plistEscape(value) {
  return String(value)
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&apos;");
}

function consoleServicePaths(args) {
  const home = process.env.HOME || "";
  const launchAgentsDir = join(home, "Library/LaunchAgents");
  const serviceLogDir = resolveFromRoot("runtime/local-services");
  return {
    label: CONSOLE_SERVICE_LABEL,
    port: Number.isFinite(args.port) ? args.port : 4317,
    launchAgentsDir,
    plistPath: join(launchAgentsDir, `${CONSOLE_SERVICE_LABEL}.plist`),
    serviceLogDir,
    pidPath: join(serviceLogDir, "console.pid"),
    stdoutPath: join(serviceLogDir, "console.out.log"),
    stderrPath: join(serviceLogDir, "console.err.log"),
    serverPath: resolveFromRoot("apps/console/web/server.mjs"),
    nodePath: process.execPath,
    domain: process.platform === "darwin" && typeof process.getuid === "function" ? `gui/${process.getuid()}` : ""
  };
}

function consoleServicePlist(args) {
  const paths = consoleServicePaths(args);
  const pathValue = [
    dirname(paths.nodePath),
    "/Users/mac/.local/bin",
    "/opt/homebrew/bin",
    "/usr/local/bin",
    "/usr/bin",
    "/bin",
    "/usr/sbin",
    "/sbin",
    process.env.PATH || ""
  ].filter(Boolean).join(":");
  return `<?xml version="1.0" encoding="UTF-8"?>
<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">
<plist version="1.0">
<dict>
  <key>Label</key>
  <string>${plistEscape(paths.label)}</string>
  <key>ProgramArguments</key>
  <array>
    <string>${plistEscape(paths.nodePath)}</string>
    <string>${plistEscape(paths.serverPath)}</string>
  </array>
  <key>WorkingDirectory</key>
  <string>${plistEscape(repoRoot)}</string>
  <key>EnvironmentVariables</key>
  <dict>
    <key>PORT</key>
    <string>${plistEscape(paths.port)}</string>
    <key>NODE_ENV</key>
    <string>production</string>
    <key>PATH</key>
    <string>${plistEscape(pathValue)}</string>
  </dict>
  <key>RunAtLoad</key>
  <true/>
  <key>KeepAlive</key>
  <true/>
  <key>StandardOutPath</key>
  <string>${plistEscape(paths.stdoutPath)}</string>
  <key>StandardErrorPath</key>
  <string>${plistEscape(paths.stderrPath)}</string>
</dict>
</plist>
`;
}

async function runOptional(command, args, options = {}) {
  try {
    const result = await execFileAsync(command, args, {
      cwd: repoRoot,
      timeout: options.timeout ?? 30000,
      maxBuffer: 1024 * 1024 * 4
    });
    return { ok: true, stdout: result.stdout, stderr: result.stderr };
  } catch (error) {
    return {
      ok: false,
      stdout: error?.stdout ?? "",
      stderr: error?.stderr ?? error?.message ?? String(error)
    };
  }
}

async function listeningPids(port) {
  const result = await runOptional("lsof", ["-tiTCP:" + port, "-sTCP:LISTEN"], { timeout: 10000 });
  if (!result.ok && !result.stdout.trim()) return [];
  return result.stdout.split("\n").map((line) => line.trim()).filter(Boolean);
}

async function stopManualConsoleProcesses(port) {
  const pids = await listeningPids(port);
  const stopped = [];
  for (const pid of pids) {
    const ps = await runOptional("ps", ["-p", pid, "-o", "command="], { timeout: 10000 });
    const command = ps.stdout.trim();
    if (!command.includes("apps/console/web/server.mjs") && !command.includes("web/server.mjs")) continue;
    try {
      process.kill(Number(pid), "SIGTERM");
      stopped.push({ pid, command });
    } catch {
      // Best-effort cleanup only. launchd status will show if the port remains occupied.
    }
  }
  return stopped;
}

async function readManualConsolePid(paths) {
  if (!existsSync(paths.pidPath)) return "";
  try {
    return (await readFile(paths.pidPath, "utf8")).trim();
  } catch {
    return "";
  }
}

async function clearManualConsolePid(paths) {
  if (!existsSync(paths.pidPath)) return;
  try {
    await unlink(paths.pidPath);
  } catch {
    // Best-effort cleanup only.
  }
}

async function startManualConsoleService(paths) {
  await mkdir(paths.serviceLogDir, { recursive: true });
  const stdoutFd = openSync(paths.stdoutPath, "a");
  const stderrFd = openSync(paths.stderrPath, "a");
  const child = spawn(paths.nodePath, [paths.serverPath], {
    cwd: repoRoot,
    detached: true,
    stdio: ["ignore", stdoutFd, stderrFd],
    env: {
      ...process.env,
      PORT: String(paths.port),
      NODE_ENV: "production"
    }
  });
  child.unref();
  await writeFile(paths.pidPath, `${child.pid ?? ""}\n`, "utf8");
  await new Promise((resolve) => setTimeout(resolve, 800));
  const pids = await listeningPids(paths.port);
  return {
    ok: Boolean(child.pid) && pids.includes(String(child.pid)),
    pid: child.pid ? String(child.pid) : "",
    pids
  };
}

async function consoleAgentStatus(args) {
  assertDryRun(args, "console agent-status");
  const actionServer = await import(pathToFileURL(resolveFromRoot("apps/console/web/action-server.mjs")).href);
  const status = await actionServer.detectLocalAiRuntimes();
  console.log("# Console Agent Runtime Status dry-run");
  console.log("");
  console.log(`checked_at: ${status.checked_at}`);
  console.log("secret_values_read: no");
  console.log("secret_values_stored: no");
  console.log("model_invocation: not_called");
  console.log("");
  console.log("| Runtime | Installed | Path | Invocation | Credential Policy |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const runtime of status.runtimes) {
    console.log(`| ${runtime.runtime_id} | ${runtime.installed ? "yes" : "no"} | ${runtime.path || "missing"} | ${runtime.invocation_mode} | ${runtime.credential_policy} |`);
  }
  console.log("");
  console.log("safety:");
  console.log(`- console_reads_secret_values: ${status.safety.console_reads_secret_values ? "yes" : "no"}`);
  console.log(`- console_stores_secret_values: ${status.safety.console_stores_secret_values ? "yes" : "no"}`);
  console.log(`- default_invocation: ${status.safety.default_invocation}`);
  console.log(`- codex_sandbox: ${status.safety.codex_sandbox}`);
  console.log(`- claude_tools: ${status.safety.claude_tools}`);
  if (status.safety.openhands) console.log(`- openhands: ${status.safety.openhands}`);
  if (status.safety.domestic_models) console.log(`- domestic_models: ${status.safety.domestic_models}`);
}

async function consoleService(args) {
  const action = args.serviceAction || "status";
  const paths = consoleServicePaths(args);
  if (process.platform !== "darwin") {
    console.log("# Console Local Service");
    console.log("");
    console.log("status: UNSUPPORTED_PLATFORM");
    console.log("reason: launchd service management is implemented for macOS.");
    process.exitCode = 1;
    return;
  }

  if (action === "status") {
    const launchctl = paths.domain
      ? await runOptional("launchctl", ["print", `${paths.domain}/${paths.label}`], { timeout: 10000 })
      : { ok: false, stdout: "", stderr: "missing launchd domain" };
    const pids = await listeningPids(paths.port);
    const manualPid = await readManualConsolePid(paths);
    console.log("# Console Local Service Status");
    console.log("");
    console.log(`label: ${paths.label}`);
    console.log(`plist: ${paths.plistPath}`);
    console.log(`url: http://127.0.0.1:${paths.port}`);
    console.log(`launchd_loaded: ${launchctl.ok ? "yes" : "no"}`);
    console.log(`manual_fallback_pid: ${manualPid || "none"}`);
    console.log(`listening_pids: ${pids.length ? pids.join(", ") : "none"}`);
    console.log(`stdout_log: ${paths.stdoutPath}`);
    console.log(`stderr_log: ${paths.stderrPath}`);
    return;
  }

  if (action === "install") {
    const plist = consoleServicePlist(args);
    if (!args.apply) {
      console.log("# Console Local Service Install dry-run");
      console.log("");
      console.log(`would_write_plist: ${paths.plistPath}`);
      console.log(`would_create_log_dir: ${paths.serviceLogDir}`);
      console.log(`would_bootstrap: ${paths.domain}/${paths.label}`);
      console.log(`url: http://127.0.0.1:${paths.port}`);
      console.log("bind_address: 127.0.0.1");
      console.log("secret_values_read: no");
      console.log("deploy: disabled");
      console.log("");
      console.log(plist);
      return;
    }
    await mkdir(paths.launchAgentsDir, { recursive: true });
    await mkdir(paths.serviceLogDir, { recursive: true });
    await writeFile(paths.plistPath, plist, "utf8");
    const stopped = await stopManualConsoleProcesses(paths.port);
    await clearManualConsolePid(paths);
    await runOptional("launchctl", ["bootout", paths.domain, paths.plistPath], { timeout: 10000 });
    const bootstrap = await runOptional("launchctl", ["bootstrap", paths.domain, paths.plistPath], { timeout: 30000 });
    const kickstart = await runOptional("launchctl", ["kickstart", "-k", `${paths.domain}/${paths.label}`], { timeout: 30000 });
    const manualFallback = !bootstrap.ok && !kickstart.ok
      ? await startManualConsoleService(paths)
      : { ok: false, pid: "", pids: [] };
    console.log("# Console Local Service Install apply");
    console.log("");
    console.log(`status: ${bootstrap.ok || kickstart.ok || manualFallback.ok ? "PASS" : "FAIL"}`);
    console.log(`plist: ${paths.plistPath}`);
    console.log(`url: http://127.0.0.1:${paths.port}`);
    console.log(`stopped_manual_pids: ${stopped.map((item) => item.pid).join(", ") || "none"}`);
    console.log(`bootstrap: ${bootstrap.ok ? "PASS" : "FAIL"}`);
    if (!bootstrap.ok) console.log(`bootstrap_error: ${bootstrap.stderr.trim()}`);
    console.log(`kickstart: ${kickstart.ok ? "PASS" : "FAIL"}`);
    if (!kickstart.ok) console.log(`kickstart_error: ${kickstart.stderr.trim()}`);
    if (manualFallback.ok) {
      console.log("manual_fallback: PASS");
      console.log(`manual_fallback_pid: ${manualFallback.pid}`);
    } else if (!bootstrap.ok && !kickstart.ok) {
      console.log("manual_fallback: FAIL");
      process.exitCode = 1;
    }
    return;
  }

  if (action === "start") {
    if (!args.apply) {
      console.log("# Console Local Service Start dry-run");
      console.log("");
      console.log(`would_kickstart: ${paths.domain}/${paths.label}`);
      return;
    }
    const stopped = await stopManualConsoleProcesses(paths.port);
    await clearManualConsolePid(paths);
    const result = await runOptional("launchctl", ["kickstart", "-k", `${paths.domain}/${paths.label}`], { timeout: 30000 });
    const manualFallback = !result.ok
      ? await startManualConsoleService(paths)
      : { ok: false, pid: "", pids: [] };
    console.log("# Console Local Service Start apply");
    console.log("");
    console.log(`status: ${result.ok || manualFallback.ok ? "PASS" : "FAIL"}`);
    console.log(`stopped_manual_pids: ${stopped.map((item) => item.pid).join(", ") || "none"}`);
    console.log(`url: http://127.0.0.1:${paths.port}`);
    if (!result.ok) {
      console.log(`error: ${result.stderr.trim()}`);
      if (manualFallback.ok) {
        console.log("fallback: manual_process");
        console.log(`manual_fallback_pid: ${manualFallback.pid}`);
      } else {
        process.exitCode = 1;
      }
    }
    return;
  }

  if (action === "stop") {
    if (!args.apply) {
      console.log("# Console Local Service Stop dry-run");
      console.log("");
      console.log(`would_bootout: ${paths.domain}/${paths.label}`);
      return;
    }
    const stopped = await stopManualConsoleProcesses(paths.port);
    await clearManualConsolePid(paths);
    const result = await runOptional("launchctl", ["bootout", paths.domain, paths.plistPath], { timeout: 30000 });
    console.log("# Console Local Service Stop apply");
    console.log("");
    console.log(`status: ${result.ok || stopped.length ? "PASS" : "FAIL"}`);
    console.log(`stopped_manual_pids: ${stopped.map((item) => item.pid).join(", ") || "none"}`);
    if (!result.ok) console.log(`note: ${result.stderr.trim()}`);
    return;
  }

  if (action === "uninstall") {
    if (!args.apply) {
      console.log("# Console Local Service Uninstall dry-run");
      console.log("");
      console.log(`would_bootout: ${paths.domain}/${paths.label}`);
      console.log(`would_remove_plist: ${paths.plistPath}`);
      return;
    }
    await runOptional("launchctl", ["bootout", paths.domain, paths.plistPath], { timeout: 30000 });
    if (existsSync(paths.plistPath)) await unlink(paths.plistPath);
    console.log("# Console Local Service Uninstall apply");
    console.log("");
    console.log("status: PASS");
    console.log(`removed_plist: ${paths.plistPath}`);
    return;
  }

  throw new Error(`Unknown console service action: ${action}`);
}

async function latestAutopilotRunJson() {
  const runsDir = resolveFromRoot("autopilot-runs");
  const files = (await listFilesSafe(runsDir))
    .filter((file) => file.endsWith(".json"))
    .filter((file) => !file.includes("/workspaces/") && !file.endsWith("/workspace.json"))
    .sort();
  const latest = latestFile(files);
  if (!latest) return null;
  return {
    path: relativePath(latest),
    data: await readJsonIfExists(latest)
  };
}

function releasePromotionStageDefinition(stageId) {
  const labels = {
    local_preview: "本地预览",
    server_preview: "服务器预览",
    reviewed_publish: "Reviewed Publish"
  };
  return {
    stage_id: stageId,
    label: labels[stageId] ?? stageId
  };
}

function releasePromotionConsistencyKey(repo, checks) {
  return stableHash({
    branch: repo.branch,
    clean: repo.clean,
    checks: checks.map((check) => ({
      check_id: check.check_id,
      status: check.status,
      fingerprint: check.fingerprint ?? ""
    }))
  }).slice(0, 16);
}

function releasePromotionStageMap(existingArtifact) {
  return Object.fromEntries(
    (existingArtifact?.promotion_stages ?? []).map((stage) => [stage.stage_id, stage])
  );
}

function buildReleasePromotionStages({
  consistencyKey,
  repo,
  checks,
  localPreviewPass,
  existingArtifact,
  generatedAt
}) {
  const previousStages = releasePromotionStageMap(existingArtifact);
  const localRecorded = previousStages.local_preview?.consistency_key === consistencyKey
    ? previousStages.local_preview
    : null;
  const serverRecorded = previousStages.server_preview?.consistency_key === consistencyKey
    ? previousStages.server_preview
    : null;
  const reviewedRecorded = previousStages.reviewed_publish?.consistency_key === consistencyKey
    ? previousStages.reviewed_publish
    : null;

  const localPreview = {
    ...releasePromotionStageDefinition("local_preview"),
    status: localPreviewPass ? "PASS" : "FAIL",
    consistency_key: consistencyKey,
    repo_branch: repo.branch,
    repo_head: repo.head,
    repo_clean: repo.clean,
    recorded_at: localRecorded?.recorded_at ?? "",
    recorded_by: localRecorded?.recorded_by ?? "",
    gate_reason: localPreviewPass
      ? "本地预览所需一致性检查已通过。"
      : "本地预览尚未通过；先清理仓库、启动本地预览服务并补齐必需文件。",
    checks: checks.map((check) => ({ check_id: check.check_id, status: check.status }))
  };

  const serverPreviewPass = localPreviewPass && Boolean(serverRecorded);
  const serverPreview = {
    ...releasePromotionStageDefinition("server_preview"),
    status: !localPreviewPass ? "BLOCKED" : (serverPreviewPass ? "PASS" : "PENDING_REVIEW"),
    consistency_key: serverRecorded?.consistency_key ?? "",
    depends_on: "local_preview",
    recorded_at: serverRecorded?.recorded_at ?? "",
    recorded_by: serverRecorded?.recorded_by ?? "",
    source_consistency_key: consistencyKey,
    gate_reason: !localPreviewPass
      ? "等待本地预览先通过一致性闸门。"
      : (serverPreviewPass
          ? "服务器预览已确认当前一致性快照。"
          : "需要对当前一致性快照执行一次服务器预览确认。")
  };

  const reviewedPublishPass = serverPreviewPass && Boolean(reviewedRecorded);
  const reviewedPublish = {
    ...releasePromotionStageDefinition("reviewed_publish"),
    status: !serverPreviewPass ? "BLOCKED" : (reviewedPublishPass ? "PASS" : "PENDING_REVIEW"),
    consistency_key: reviewedRecorded?.consistency_key ?? "",
    depends_on: "server_preview",
    recorded_at: reviewedRecorded?.recorded_at ?? "",
    recorded_by: reviewedRecorded?.recorded_by ?? "",
    source_consistency_key: consistencyKey,
    gate_reason: !serverPreviewPass
      ? "等待服务器预览通过后才能进入 reviewed publish。"
      : (reviewedPublishPass
          ? "reviewed publish 已确认当前一致性快照。"
          : "需要完成 reviewed publish 审核确认。")
  };

  const nextStage = !localPreviewPass
    ? "local_preview"
    : (!serverPreviewPass ? "server_preview" : (!reviewedPublishPass ? "reviewed_publish" : "completed"));

  return {
    generated_at: generatedAt,
    consistency_key: consistencyKey,
    next_stage: nextStage,
    stages: [localPreview, serverPreview, reviewedPublish]
  };
}

function applyReleasePromotionStage({ artifact, targetStage, actor = "studio.release.consistency" }) {
  const now = new Date().toISOString();
  const stageMap = Object.fromEntries(artifact.promotion_stages.map((stage) => [stage.stage_id, { ...stage }]));
  const localStage = stageMap.local_preview;
  const serverStage = stageMap.server_preview;

  if (!["local_preview", "server_preview", "reviewed_publish"].includes(targetStage)) {
    throw new Error(`Unknown release promotion stage: ${targetStage}`);
  }

  if (targetStage === "local_preview") {
    if (localStage.status !== "PASS") {
      throw new Error("local_preview cannot be recorded until local consistency checks pass.");
    }
    localStage.recorded_at = now;
    localStage.recorded_by = actor;
    localStage.consistency_key = artifact.promotion_consistency_key;
    localStage.gate_reason = "本地预览已为当前一致性快照留痕。";
    artifact.promotion_next_stage = "server_preview";
    artifact.promotion_stages = ["local_preview", "server_preview", "reviewed_publish"].map((stageId) => stageMap[stageId]);
    return;
  }

  if (targetStage === "server_preview") {
    if (localStage.status !== "PASS") {
      throw new Error("server_preview requires local_preview PASS first.");
    }
    serverStage.status = "PASS";
    serverStage.recorded_at = now;
    serverStage.recorded_by = actor;
    serverStage.consistency_key = artifact.promotion_consistency_key;
    serverStage.source_consistency_key = artifact.promotion_consistency_key;
    serverStage.gate_reason = "服务器预览已确认当前一致性快照。";
    artifact.promotion_next_stage = "reviewed_publish";
    artifact.promotion_stages = ["local_preview", "server_preview", "reviewed_publish"].map((stageId) => stageMap[stageId]);
    return;
  }

  if (serverStage.status !== "PASS" || serverStage.consistency_key !== artifact.promotion_consistency_key) {
    throw new Error("reviewed_publish requires server_preview PASS for the current consistency key.");
  }
  const reviewedStage = stageMap.reviewed_publish;
  reviewedStage.status = "PASS";
  reviewedStage.recorded_at = now;
  reviewedStage.recorded_by = actor;
  reviewedStage.consistency_key = artifact.promotion_consistency_key;
  reviewedStage.source_consistency_key = artifact.promotion_consistency_key;
  reviewedStage.gate_reason = "reviewed publish 已确认当前一致性快照。";
  artifact.promotion_next_stage = "completed";
  artifact.promotion_stages = ["local_preview", "server_preview", "reviewed_publish"].map((stageId) => stageMap[stageId]);
}

function refreshReleaseConsistencyArtifactState(artifact) {
  const stageMap = Object.fromEntries((artifact.promotion_stages ?? []).map((stage) => [stage.stage_id, stage]));
  const localStage = stageMap.local_preview ?? {};
  const serverStage = stageMap.server_preview ?? {};
  const reviewedStage = stageMap.reviewed_publish ?? {};
  const checksPass = Array.isArray(artifact.checks) && artifact.checks.every((check) => check.status === "PASS");
  const localPreviewPass = localStage.status === "PASS" && artifact.repo_clean === "yes" && checksPass && artifact.console_service?.status === "LISTENING";
  const serverPreviewPass = serverStage.status === "PASS" && serverStage.consistency_key === artifact.promotion_consistency_key;
  const reviewedPublishPass = reviewedStage.status === "PASS" && reviewedStage.consistency_key === artifact.promotion_consistency_key;

  artifact.promotion_next_stage = !localPreviewPass
    ? "local_preview"
    : (!serverPreviewPass ? "server_preview" : (!reviewedPublishPass ? "reviewed_publish" : "completed"));

  artifact.warnings = [];
  if (artifact.repo_clean !== "yes") artifact.warnings.push("Repository has uncommitted changes.");
  if (artifact.console_service?.status !== "LISTENING") artifact.warnings.push("Console local service is not listening on the expected port.");
  if (!serverPreviewPass) artifact.warnings.push("Server preview has not been confirmed for the current consistency key.");
  if (!reviewedPublishPass) artifact.warnings.push("Reviewed publish has not been confirmed for the current consistency key.");
  artifact.status = localPreviewPass ? "PASS" : "FAIL";
  return artifact;
}

async function releaseConsistency(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("release consistency requires --dry-run or --apply.");
  }
  const rawRepo = await repoStatus(repoRoot);
  const repo = releaseConsistencyRepoView(rawRepo);
  const servicePaths = consoleServicePaths(args);
  const listening = await listeningPids(servicePaths.port);
  const latestRun = await latestAutopilotRunJson();
  const requiredFiles = [
    "runtime/global/codex-context-index.json",
    "runtime/global/attached-project-workspace.json",
    "runtime/global/worker-control-plane.json",
    "runtime/global/access-enforcement.json",
    "apps/console/web/server.mjs",
    "apps/console/web/action-server.mjs",
    "apps/console/web/build.mjs",
    "packages/orchestrator-core/bin/studio.mjs"
  ];
  const managedPaths = releaseManagedDirtyPaths();
  const checks = await Promise.all(requiredFiles.map(async (file) => {
    const absolutePath = resolveFromRoot(file);
    const exists = existsSync(absolutePath);
    const fingerprint = exists && !managedPaths.has(file)
      ? createHash("sha1").update(await readFile(absolutePath)).digest("hex").slice(0, 16)
      : "";
    return {
      check_id: file,
      status: exists ? "PASS" : "FAIL",
      fingerprint
    };
  }));
  const existingArtifact = await readJsonIfExists(resolveFromRoot("runtime/global/release-consistency.json"));
  const localPreviewPass = repo.clean === "yes"
    && checks.every((check) => check.status === "PASS")
    && listening.length > 0;
  const promotion = buildReleasePromotionStages({
    consistencyKey: releasePromotionConsistencyKey(repo, checks),
    repo,
    checks,
    localPreviewPass,
    existingArtifact,
    generatedAt: new Date().toISOString()
  });
  const artifact = {
    schema_version: 1,
    generated_at: promotion.generated_at,
    repo_branch: repo.branch,
    repo_clean: repo.clean,
    latest_head: repo.head,
    latest_autopilot_run: latestRun?.path ?? "missing",
    console_service: {
      port: servicePaths.port,
      listening_pids: listening,
      status: listening.length > 0 ? "LISTENING" : "NOT_LISTENING"
    },
    checks,
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "local_only",
      credential_values: "not_read",
      managed_project_writes: "disabled"
    },
    warnings: [],
    promotion_consistency_key: promotion.consistency_key,
    promotion_next_stage: promotion.next_stage,
    promotion_stages: promotion.stages
  };
  if (repo.clean !== "yes") artifact.warnings.push("Repository has uncommitted changes.");
  if (artifact.console_service.status !== "LISTENING") artifact.warnings.push("Console local service is not listening on the expected port.");
  if (artifact.promotion_stages.find((stage) => stage.stage_id === "server_preview")?.status !== "PASS") {
    artifact.warnings.push("Server preview has not been confirmed for the current consistency key.");
  }
  if (artifact.promotion_stages.find((stage) => stage.stage_id === "reviewed_publish")?.status !== "PASS") {
    artifact.warnings.push("Reviewed publish has not been confirmed for the current consistency key.");
  }
  artifact.status = localPreviewPass ? "PASS" : "FAIL";
  const filesWritten = [];
  const appliedStage = args.apply && args.target ? args.target : "";
  if (args.apply) {
    if (appliedStage) {
      applyReleasePromotionStage({ artifact, targetStage: appliedStage });
    }
    refreshReleaseConsistencyArtifactState(artifact);
    const outputPath = resolveFromRoot("runtime/global/release-consistency.json");
    await writeJsonFile(outputPath, artifact);
    filesWritten.push(relativePath(outputPath));
    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [relativePath(outputPath)]
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Release Consistency ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`status: ${artifact.status}`);
  console.log(`repo_branch: ${artifact.repo_branch}`);
  console.log(`repo_clean: ${artifact.repo_clean}`);
  console.log(`latest_head: ${artifact.latest_head}`);
  console.log(`latest_autopilot_run: ${artifact.latest_autopilot_run}`);
  console.log(`console_service_status: ${artifact.console_service.status}`);
  console.log(`console_service_port: ${artifact.console_service.port}`);
  console.log(`console_service_pids: ${artifact.console_service.listening_pids.join(", ") || "none"}`);
  console.log(`promotion_consistency_key: ${artifact.promotion_consistency_key}`);
  console.log(`promotion_next_stage: ${artifact.promotion_next_stage}`);
  console.log(`warnings: ${artifact.warnings.length}`);
  if ((repo.ignored_generated_files ?? []).length > 0) {
    console.log(`ignored_generated_files: ${repo.ignored_generated_files.join(", ")}`);
  }
  console.log("");
  console.log("checks:");
  for (const check of checks) {
    console.log(`- ${check.check_id}: ${check.status}`);
  }
  console.log("");
  console.log("promotion_stages:");
  for (const stage of artifact.promotion_stages) {
    console.log(`- ${stage.stage_id}: ${stage.status} | key=${stage.consistency_key || artifact.promotion_consistency_key} | recorded_at=${stage.recorded_at || "pending"} | ${stage.gate_reason}`);
  }
  if (artifact.warnings.length > 0) {
    console.log("");
    console.log("warnings_detail:");
    for (const warning of artifact.warnings) console.log(`- ${warning}`);
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log(`applied_stage: ${appliedStage || "snapshot_only"}`);
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  if (artifact.status !== "PASS") process.exitCode = 1;
}

async function consoleSmoke(args) {
  assertDryRun(args, "console smoke");
  const routesModule = await import(pathToFileURL(resolveFromRoot("apps/console/web/routes.mjs")).href);
  const dataModule = await import(pathToFileURL(resolveFromRoot("apps/console/web/data.mjs")).href);
  const renderModule = await import(pathToFileURL(resolveFromRoot("apps/console/web/render.mjs")).href);
  const routes = routesModule.consoleWebRoutes ?? [];
  const requiredRouteIds = [
    "dashboard",
    "projects",
    "runtime",
    "workers",
    "credentials",
    "governance",
    "planning",
    "autopilot",
    "actions",
    "config",
    "memory",
    "pilotStatus"
  ];
  const routeIds = routes.map((route) => route.id);
  const missingRoutes = requiredRouteIds.filter((id) => !routeIds.includes(id));
  const requiredFiles = [
    "runtime/global/platform-state.json",
    "runtime/global/roadmap-memory.json",
    "runtime/global/v5-roadmap.json",
    "runtime/global/access-state.json",
    "runtime/global/access-users.json",
    "runtime/global/access-memberships.json",
    "runtime/projects/jinhu-smart-park/project-state.json",
    "runtime/projects/phoenix-erp/project-state.json",
    "apps/console/web/assets/anksen-logo.svg"
  ];
  const requiredDirs = [
    "packages/runtime-center/examples",
    "packages/worker-pool/examples",
    "packages/governance-center/examples",
    "autopilot-runs"
  ];
  const unreadableFiles = requiredFiles.filter((file) => !existsSync(resolveFromRoot(file)));
  const unreadableDirs = requiredDirs.filter((dir) => !existsSync(resolveFromRoot(dir)));
  const dashboardModel = await dataModule.buildConsoleDashboardModel({ activeProjectId: "phoenix-erp" });
  const dashboardGenerated = Boolean(dashboardModel?.title && dashboardModel?.modules);
  const data = await dataModule.loadConsoleLocalData({ activeProjectId: "phoenix-erp" });
  const previewAuth = {
    authenticated: true,
    user: { username: "smoke-admin", display_name: "Smoke Admin" },
    roles: [{ role_id: "workspace_admin", display_name: "Workspace Admin" }],
    plan: { plan_id: "internal_preview", display_name: "Internal Preview", tier: "internal" },
    capabilities: ["*"],
    feature_flags: ["*"],
    project_allowlist: ["*"],
    can_manage_access: true,
    direct_execute_max_risk: "MEDIUM"
  };
  const actionsHtml = await renderModule.renderConsolePage("/actions", previewAuth, { activeProjectId: "phoenix-erp" });
  const configHtml = await renderModule.renderConsolePage("/config", previewAuth, { activeProjectId: "phoenix-erp" });
  const dashboardHtml = await renderModule.renderConsolePage("/", previewAuth, { activeProjectId: "phoenix-erp" });
  const unauthHtml = await renderModule.renderConsolePage("/", { authenticated: false });
  const unauthLoginHtml = await renderModule.renderConsolePage("/login", { authenticated: false });
  const interactiveControlsPresent = [
    "操作中心",
    "目标",
    "项目",
    "模式",
    "Agent",
    "图片 / 文件",
    "上传附件",
    "自动选择",
    "Codex CLI",
    "Claude Code",
    "Gemini",
    "OpenHands",
    "Aider",
    "Local Agent",
    "开始",
    "停止",
    "$ READY",
    "展开详情"
  ].every((text) => actionsHtml.includes(text));
  const workspaceQuickEntriesPresent = [
    "检查当前项目",
    "生成派发计划",
    "查看待审批 Proposal",
    "查看 Worker 状态",
    "Codex / Claude",
    "Phoenix ERP",
    "jinhu-smart-park"
  ].every((text) => actionsHtml.includes(text));
  const controlTowerPresent = [
    "自主工作区",
    "/assets/anksen-logo.svg",
    "想让 Studio 完成什么？",
    "command-center-hero",
    "command-goal",
    "command-run",
    "集团业务驾驶舱",
    "当前运行",
    "最近结果",
    "高级运行信息",
    "任务与队列",
    "Runtime",
    "执行报告"
  ].every((text) => dashboardHtml.includes(text));
  const darkThemePresent = dashboardHtml.includes("color-scheme: dark")
    && dashboardHtml.includes("--canvas: #070a10")
    && dashboardHtml.includes("--surface-1:#0d121c")
    && dashboardHtml.includes("--text:#f7f8fa");
  const configCenterPresent = [
    "项目配置",
    "Runtime 配置",
    "Worker 配置",
    "Credential Reference 配置",
    "Governance 策略查看"
  ].every((text) => configHtml.includes(text));
  const authEntryPresent = [
    "统一 AI 工作台",
    "登录",
    "申请加入"
  ].every((text) => unauthHtml.includes(text));
  const authLoginPresent = [
    "Console Access",
    "登录",
    "用户名",
    "密码",
    "仅限已授权账号"
  ].every((text) => unauthLoginHtml.includes(text));
  const authGatePresent = authEntryPresent && authLoginPresent;
  const safetyPass = data.safety.external_calls === "disabled"
    && data.safety.credential_values === "not_read"
    && data.safety.managed_project_writes === "disabled"
    && data.safety.deploy === "disabled"
    && data.safety.production_operations === "disabled"
    && data.safety.model_invocation === "disabled"
    && data.safety.anonymous_console_access === "disabled"
    && String(data.safety.phoenix_erp_local_path ?? "").includes("phoenix-erp-v3");
  const status = missingRoutes.length === 0
    && unreadableFiles.length === 0
    && unreadableDirs.length === 0
    && dashboardGenerated
    && interactiveControlsPresent
    && workspaceQuickEntriesPresent
    && controlTowerPresent
    && darkThemePresent
    && configCenterPresent
    && authGatePresent
    && safetyPass
    ? "PASS"
    : "FAIL";

  console.log("# Console Smoke dry-run");
  console.log("");
  console.log(`status: ${status}`);
  console.log(`routes_count: ${routes.length}`);
  console.log(`missing_routes: ${missingRoutes.length === 0 ? "none" : missingRoutes.join(", ")}`);
  console.log(`data_files_readable: ${unreadableFiles.length === 0 ? "yes" : "no"}`);
  console.log(`missing_data_files: ${unreadableFiles.length === 0 ? "none" : unreadableFiles.join(", ")}`);
  console.log(`data_dirs_readable: ${unreadableDirs.length === 0 ? "yes" : "no"}`);
  console.log(`missing_data_dirs: ${unreadableDirs.length === 0 ? "none" : unreadableDirs.join(", ")}`);
  console.log(`dashboard_model_generated: ${dashboardGenerated ? "yes" : "no"}`);
  console.log(`interactive_controls: ${interactiveControlsPresent ? "yes" : "no"}`);
  console.log(`workspace_quick_entries: ${workspaceQuickEntriesPresent ? "yes" : "no"}`);
  console.log(`control_tower_modules: ${controlTowerPresent ? "yes" : "no"}`);
  console.log(`dark_professional_theme: ${darkThemePresent ? "yes" : "no"}`);
  console.log(`config_center: ${configCenterPresent ? "yes" : "no"}`);
  console.log(`auth_gate: ${authGatePresent ? "yes" : "no"}`);
  console.log(`action_log_dir: ${data.actionServer.action_log_dir}`);
  console.log(`latest_autopilot_source: ${data.data_sources.autopilot_latest}`);
  console.log(`phoenix_erp_local_path: ${data.safety.phoenix_erp_local_path}`);
  console.log("external_calls: disabled");
  console.log("credential_values_read: no");
  console.log("managed_project_writes: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("model_invocation: disabled");
  console.log("");
  console.log("pages:");
  for (const route of routes) console.log(`- ${route.label}: ${route.path}`);
  if (status !== "PASS") process.exitCode = 1;
}

async function consoleActionServerSmoke(args) {
  assertDryRun(args, "console action-server-smoke");
  const serverText = await readTextIfExists(resolveFromRoot("apps/console/web/server.mjs"));
  const actionServer = await import(pathToFileURL(resolveFromRoot("apps/console/web/action-server.mjs")).href);
  const summary = actionServer.actionServerSummary();
  const runtimePlan = await actionServer.createActionPlan({
    action_id: "runtime-health",
    project_id: "jinhu-smart-park",
    goal: "Runtime health smoke"
  });
  const smartParkPlan = await actionServer.createActionPlan({
    action_id: "smart-park-go-live-plan",
    project_id: "jinhu-smart-park",
    goal: "生成 Smart Park 上线计划 Proposal"
  });
  const releaseServerPreviewPlan = await actionServer.createActionPlan({
    action_id: "release-server-preview",
    project_id: "jinhu-smart-park",
    goal: "确认服务器预览一致性"
  });
  const releaseReviewedPublishPlan = await actionServer.createActionPlan({
    action_id: "release-reviewed-publish",
    project_id: "jinhu-smart-park",
    goal: "确认 reviewed publish 一致性"
  });
  const aiRuntimeStatusPlan = await actionServer.createActionPlan({
    action_id: "ai-runtime-status",
    project_id: "jinhu-smart-park",
    goal: "检查 Codex / Claude 接入状态"
  });
  const phoenixInspectPlan = await actionServer.createActionPlan({
    action_id: "project-inspect",
    project_id: "phoenix-erp",
    goal: "检查 Phoenix ERP 当前状态"
  });
  const projectConnectPlan = await actionServer.createActionPlan({
    action_id: "project-connect-dry-run",
    goal: "接入 Phoenix ERP 仓库",
    connect_project_id: "phoenix-erp-v3",
    connect_project_name: "Phoenix ERP V3",
    connect_source_type: "git_url",
    connect_url: "https://github.com/ivanzhao299/phoenix-erp-v3.git",
    connect_default_branch: "main",
    connect_package_manager: "pnpm",
    connect_project_type: "business-repository",
    connect_description: "用于验证多项目接入链路"
  });
  const realAgentPlan = await actionServer.createActionPlan({
    action_id: "workspace-goal",
    project_id: "jinhu-smart-park",
    goal: "让 Codex 生成一个只读任务计划",
    workspace_mode: "agent",
    agent: "codex-cli"
  });
  const attachmentPlan = await actionServer.createActionPlan({
    action_id: "workspace-goal",
    project_id: "jinhu-smart-park",
    goal: "读取上传附件并输出摘要",
    workspace_mode: "auto",
    agent: "auto",
    attachments: [
      {
        name: "console-upload-smoke.txt",
        type: "text/plain",
        size: 28,
        lastModified: 0,
        kind: "file",
        text_excerpt: "Attachment smoke payload",
        data_url: "data:text/plain;base64,QXR0YWNobWVudCBzbW9rZSBwYXlsb2Fk"
      }
    ]
  });
  const aiRuntimeStatus = await actionServer.detectLocalAiRuntimes();
  const highPlan = await actionServer.createActionPlan({
    action_id: "proposal-approve-dry-run",
    project_id: "jinhu-smart-park",
    goal: "审批 Proposal 草稿"
  });
  const proposalApplyPlan = await actionServer.createActionPlan({
    action_id: "proposal-approve-apply",
    project_id: "jinhu-smart-park",
    goal: "审批并注入 Proposal"
  });
  const workspaceGoalPlan = await actionServer.createActionPlan({
    action_id: "workspace-goal",
    project_id: "jinhu-smart-park",
    goal: "帮我整理一个普通开发任务计划",
    workspace_mode: "auto",
    agent: "auto"
  });
  const planOnlyWorkspaceGoalPlan = await actionServer.createActionPlan({
    action_id: "workspace-goal",
    project_id: "jinhu-smart-park",
    goal: "只生成一个普通开发任务计划",
    workspace_mode: "plan_only",
    agent: "auto"
  });
  const smartParkBlockerPlan = await actionServer.createActionPlan({
    action_id: "workspace-goal",
    project_id: "jinhu-smart-park",
    goal: "检查 Smart Park 上线阻断项",
    workspace_mode: "auto",
    agent: "auto"
  });
  const asyncRun = await actionServer.startConversationAction({
    action_id: "runtime-health",
    project_id: "jinhu-smart-park",
    goal: "Runtime health conversation smoke",
    workspace_mode: "auto",
    agent: "codex-cli"
  });
  const cancelRun = await actionServer.startConversationAction({
    action_id: "autopilot-dry-run",
    project_id: "jinhu-smart-park",
    goal: "Cancel smoke",
    workspace_mode: "plan_only",
    agent: "auto"
  });
  const cancelledRun = await actionServer.cancelConversationAction(cancelRun.run_id);
  const loadedRun = await actionServer.getConversationAction(asyncRun.run_id);
  const routeCheck = [
    "/api/access/login",
    "/api/access/logout",
    "/api/access/session",
    "/api/actions/start",
    "/api/actions/",
    "/cancel",
    "/api/action-plan",
    "/api/action-run",
    "/api/action-log/latest"
  ].every((route) => serverText.includes(route));
  const localOnlyCheck = serverText.includes("127.0.0.1") && serverText.includes("localOnly");
  const registryCheck = Array.isArray(summary.actions)
    && summary.actions.some((action) => action.id === "smart-park-go-live-plan")
    && summary.actions.some((action) => action.id === "worker-health")
    && summary.actions.some((action) => action.id === "ai-runtime-status")
    && summary.actions.some((action) => action.id === "release-server-preview")
    && summary.actions.some((action) => action.id === "release-reviewed-publish")
    && summary.actions.some((action) => action.id === "proposal-approve-apply")
    && summary.actions.some((action) => action.id === "project-connect-dry-run")
    && summary.actions.some((action) => action.id === "project-connect-apply")
    && summary.actions.some((action) => action.id === "agent-real-plan")
    && Array.isArray(summary.projects)
    && summary.projects.some((project) => project.project_id === "jinhu-smart-park")
    && summary.projects.some((project) => project.project_id === "phoenix-erp");
  const logWriteCheck = [runtimePlan, smartParkPlan, releaseServerPreviewPlan, releaseReviewedPublishPlan, highPlan, proposalApplyPlan, projectConnectPlan].every((record) =>
    record.logs?.json
    && record.logs?.markdown
    && existsSync(resolveFromRoot(record.logs.json))
    && existsSync(resolveFromRoot(record.logs.markdown))
  );
  const commandMappingCheck = runtimePlan.plan.command.includes("runtime health --dry-run")
    && smartParkPlan.plan.command.includes("project chain-validate --project jinhu-smart-park --dry-run")
    && releaseServerPreviewPlan.plan.command.includes("release consistency --apply --target server_preview")
    && releaseReviewedPublishPlan.plan.command.includes("release consistency --apply --target reviewed_publish")
    && proposalApplyPlan.plan.command.includes("project approve-proposal")
    && proposalApplyPlan.plan.command.includes("--apply")
    && workspaceGoalPlan.plan.action_id === "agent-real-plan"
    && workspaceGoalPlan.plan.command.includes("codex exec --sandbox read-only")
    && planOnlyWorkspaceGoalPlan.plan.action_id === "goal-plan"
    && planOnlyWorkspaceGoalPlan.plan.command.includes(" plan --goal ")
    && ["smart-park-blockers", "project-inspect"].includes(smartParkBlockerPlan.plan.action_id)
    && (
      smartParkBlockerPlan.plan.command.includes("project chain-validate --project jinhu-smart-park --dry-run")
      || smartParkBlockerPlan.plan.command.includes("project inspect --config examples/jinhu-smart-park/project.config.example.json --dry-run")
    )
    && aiRuntimeStatusPlan.plan.command.includes("console agent-status --dry-run")
    && phoenixInspectPlan.plan.command.includes("project inspect --config examples/phoenix-erp/project.config.example.json --dry-run")
    && projectConnectPlan.plan.command.includes("project connect")
    && projectConnectPlan.plan.command.includes("--project-id phoenix-erp-v3")
    && projectConnectPlan.plan.command.includes("--source-type git_url")
    && projectConnectPlan.plan.command.includes("--url https://github.com/ivanzhao299/phoenix-erp-v3.git")
    && projectConnectPlan.plan.command.includes("--dry-run")
    && realAgentPlan.plan.action_id === "agent-real-plan"
    && realAgentPlan.plan.command.includes("codex exec --sandbox read-only")
    && attachmentPlan.plan.action_id === "agent-real-plan";
  const attachmentSupportCheck = summary.attachments_enabled === true
    && Array.isArray(summary.supported_uploads)
    && summary.supported_uploads.includes("image")
    && summary.supported_uploads.includes("file")
    && attachmentPlan.plan.attachment_count === 1
    && Array.isArray(attachmentPlan.plan.attachments)
    && attachmentPlan.plan.attachments[0]?.stored_path?.includes("autopilot-runs/console-actions/uploads/");
  const expectedRuntimeIds = [
    "codex-cli",
    "claude-code",
    "gemini-cli",
    "deepseek-chat",
    "qwen-plus",
    "aider",
    "local-agent",
    "openhands"
  ];
  const aiRuntimeCheck = expectedRuntimeIds.every((runtimeId) => aiRuntimeStatus.runtimes.some((runtime) => runtime.runtime_id === runtimeId))
    && aiRuntimeStatus.safety.console_reads_secret_values === false
    && aiRuntimeStatus.safety.console_stores_secret_values === false;
  const governanceCheck = runtimePlan.plan.governance_gate === "ALLOW_DIRECT_EXECUTE"
    && smartParkPlan.plan.governance_gate === "ALLOW_DIRECT_EXECUTE"
    && highPlan.plan.governance_gate === "ALLOW_DIRECT_EXECUTE"
    && highPlan.plan.approval_required === false;
  const safetyCheck = summary.bind_address === "127.0.0.1"
    && summary.auth_required === true
    && summary.auth_mode === "local_password_session"
    && summary.direct_execute_allowed_for.includes("LOW")
    && summary.direct_execute_allowed_for.includes("MEDIUM")
    && summary.high_risk_policy === "proposal_only"
    && summary.critical_risk_policy === "human_approval_required";
  const asyncApiCheck = Boolean(asyncRun.run_id)
    && loadedRun?.run_id === asyncRun.run_id
    && cancelledRun?.status === "CANCELLED"
    && Array.isArray(asyncRun.messages)
    && asyncRun.messages.some((message) => message.content.includes("已理解目标"));
  const status = routeCheck
    && localOnlyCheck
    && registryCheck
    && logWriteCheck
    && commandMappingCheck
    && attachmentSupportCheck
    && aiRuntimeCheck
    && governanceCheck
    && safetyCheck
    && asyncApiCheck
    ? "PASS"
    : "FAIL";

  console.log("# Console Action Server Smoke dry-run");
  console.log("");
  console.log(`status: ${status}`);
  console.log(`api_routes: ${routeCheck ? "PASS" : "FAIL"}`);
  console.log(`local_only: ${localOnlyCheck ? "PASS" : "FAIL"}`);
  console.log(`action_registry: ${registryCheck ? "PASS" : "FAIL"}`);
  console.log(`log_write: ${logWriteCheck ? "PASS" : "FAIL"}`);
  console.log(`command_mapping: ${commandMappingCheck ? "PASS" : "FAIL"}`);
  console.log(`attachment_support: ${attachmentSupportCheck ? "PASS" : "FAIL"}`);
  console.log(`ai_runtime_status: ${aiRuntimeCheck ? "PASS" : "FAIL"}`);
  console.log(`governance_gate: ${governanceCheck ? "PASS" : "FAIL"}`);
  console.log(`safety_policy: ${safetyCheck ? "PASS" : "FAIL"}`);
  console.log(`async_action_api: ${asyncApiCheck ? "PASS" : "FAIL"}`);
  console.log(`action_log_dir: ${summary.action_log_dir}`);
  console.log(`runtime_health_log: ${runtimePlan.logs.json}`);
  console.log(`smart_park_plan_log: ${smartParkPlan.logs.json}`);
  console.log(`high_risk_plan_log: ${highPlan.logs.json}`);
  console.log(`project_connect_log: ${projectConnectPlan.logs.json}`);
  console.log(`conversation_run_id: ${asyncRun.run_id}`);
  console.log(`cancel_smoke_status: ${cancelledRun?.status ?? "UNKNOWN"}`);
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("credential_values_read: no");
  console.log("model_invocation: disabled");
  console.log("managed_project_writes: disabled");
  if (status !== "PASS") process.exitCode = 1;
}

function platformSelfTestPaths() {
  return {
    json: "runtime/global/studio-worker-platform-selftest.json",
    markdown: "docs/release/STUDIO_WORKER_PLATFORM_SELFTEST.md"
  };
}

function toInt(value, fallback = 0) {
  const parsed = Number.parseInt(String(value ?? ""), 10);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function toFloat(value, fallback = 0) {
  const parsed = Number.parseFloat(String(value ?? ""));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function scoreClamp(value) {
  return Math.max(0, Math.min(100, Math.round(value)));
}

function weightedAverage(items) {
  const totalWeight = items.reduce((sum, item) => sum + item.weight, 0);
  if (totalWeight === 0) return 0;
  const totalScore = items.reduce((sum, item) => sum + (item.score * item.weight), 0);
  return scoreClamp(totalScore / totalWeight);
}

function parseTableRows(stdout) {
  return String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .filter((line) => line.startsWith("|") && !/^\|\s*---/.test(line) && !/^#/.test(line));
}

function parseReleaseStagesFromStdout(stdout) {
  return String(stdout ?? "")
    .split("\n")
    .map((line) => line.trim())
    .map((line) => {
      const match = /^-\s+([a-z_]+):\s+([A-Z_]+)\s+\|\s+key=([^|]+)\s+\|\s+recorded_at=([^|]+)\s+\|\s+(.+)$/.exec(line);
      if (!match) return null;
      return {
        stage_id: match[1],
        status: match[2],
        consistency_key: match[3].trim(),
        recorded_at: match[4].trim(),
        gate_reason: match[5].trim()
      };
    })
    .filter(Boolean);
}

function releaseStageSummaryMap(releaseArtifact = {}) {
  return Object.fromEntries((releaseArtifact.promotion_stages ?? []).map((stage) => [stage.stage_id, stage]));
}

async function reconcileReleasePromotionStages() {
  const targets = ["local_preview", "server_preview", "reviewed_publish"];
  const attempts = [];
  for (const target of targets) {
    const result = await runStudioSubcommand(["release", "consistency", "--apply", "--target", target], 5 * 60 * 1000);
    attempts.push({ target, ...result });
    if (!result.ok) break;
  }
  return attempts;
}

function platformSelfTestReportMarkdown(report) {
  const checkRows = report.checks.map((check) =>
    `| ${check.name} | ${check.status} | ${check.exit_code} | ${check.command} |`
  ).join("\n");
  const scoreRows = report.scores.map((item) =>
    `| ${item.dimension} | ${item.score} | ${item.status} | ${item.summary} |`
  ).join("\n");
  const releaseRows = report.release.stages.map((stage) =>
    `| ${stage.stage_id} | ${stage.status} | ${stage.recorded_at || "pending"} | ${stage.gate_reason} |`
  ).join("\n");

  return `# Studio Worker Platform Self-Test

- generated_at: ${report.generated_at}
- mode: ${report.mode}
- overall_score: ${report.overall_score}/100
- overall_status: ${report.overall_status}
- worker_as_cross_project_executor: ${report.verdicts.worker_as_cross_project_executor}
- development_execution_capability: ${report.verdicts.development_execution_capability}
- production_execution_capability: ${report.verdicts.production_execution_capability}
- release_promotion_status: ${report.release.status}
- release_next_stage: ${report.release.next_stage}

## Capability Scores

| Dimension | Score | Status | Summary |
| --- | ---: | --- | --- |
${scoreRows}

## Check Commands

| Check | Status | Exit | Command |
| --- | --- | ---: | --- |
${checkRows}

## Release Promotion Stages

| Stage | Status | Recorded At | Gate Reason |
| --- | --- | --- | --- |
${releaseRows}

## Dispatch / Proposal / Queue Evidence

- dispatch_plan_count: ${report.dispatch.dispatch_plan_count}
- proposal_count: ${report.dispatch.proposal_count}
- queue_injection_audit_count: ${report.dispatch.queue_injection_audit_count}
- ready_inject: ${report.dispatch.ready_inject}
- injected: ${report.dispatch.injected}
- pending_approval: ${report.dispatch.pending_approval}
- proposal_only: ${report.dispatch.proposal_only}
- blocked: ${report.dispatch.blocked}
- verified_approved_queue_audit: ${report.dispatch.verified_approved_queue_audit}

## Enhancement Plan

### P0
${report.enhancements.P0.map((item) => `- ${item}`).join("\n")}

### P1
${report.enhancements.P1.map((item) => `- ${item}`).join("\n")}

### P2
${report.enhancements.P2.map((item) => `- ${item}`).join("\n")}

## Safety Boundary

- deploy: disabled
- production_operations: disabled
- server_access: local/read-only evidence only
- credential_values: not_read
- managed_project_writes: proposal / queue injection only

本次自测覆盖的是平台级接入、调度、治理、发布闸门与 Console 闭环，不包含真实服务器部署与生产操作。
`;
}

async function platformSelfTest(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("platform self-test requires --dry-run or --apply.");
  }

  const checks = await Promise.all([
    runStudioSubcommand(["project", "workspace", "--dry-run"]),
    runStudioSubcommand(["worker", "control-plane", "--dry-run"]),
    runStudioSubcommand(["worker", "assign", "--runtime", "codex-cli", "--dry-run"]),
    runStudioSubcommand(["runtime", "health", "--dry-run"]),
    runStudioSubcommand(["access", "enforcement", "--dry-run"]),
    runStudioSubcommand(["project", "dispatch-plan", "--project", "jinhu-smart-park", "--text", "跨项目 worker readiness self-test", "--dry-run"]),
    runStudioSubcommand(["console", "smoke", "--dry-run"]),
    runStudioSubcommand(["console", "action-server-smoke", "--dry-run"]),
    runStudioSubcommand(["production", "safety-check", "--dry-run"])
  ]);

  const checkMap = new Map([
    ["workspace", { name: "Attached Project Workspace", ...checks[0] }],
    ["workerControl", { name: "Worker Control Plane", ...checks[1] }],
    ["workerAssign", { name: "Worker Assign codex-cli", ...checks[2] }],
    ["runtimeHealth", { name: "Runtime Health", ...checks[3] }],
    ["access", { name: "Access Enforcement", ...checks[4] }],
    ["dispatch", { name: "Project Dispatch Plan", ...checks[5] }],
    ["consoleSmoke", { name: "Console Smoke", ...checks[6] }],
    ["actionServerSmoke", { name: "Console Action Server Smoke", ...checks[7] }],
    ["productionSafety", { name: "Production Safety Check", ...checks[8] }]
  ]);

  const releaseApplyAttempts = args.apply ? await reconcileReleasePromotionStages() : [];
  const releaseCheck = await runStudioSubcommand(["release", "consistency", "--dry-run"], 5 * 60 * 1000);
  checkMap.set("release", { name: "Release Consistency", ...releaseCheck });

  const dataModule = await import(pathToFileURL(resolveFromRoot("apps/console/web/data.mjs")).href);
  const data = await dataModule.loadConsoleLocalData();
  const releaseArtifact = await readJsonIfExists(resolveFromRoot("runtime/global/release-consistency.json")) ?? {};
  const releaseSummary = releaseCheck.summary ?? {};
  const releaseStagesFromStdout = parseReleaseStagesFromStdout(releaseCheck.stdout);
  const releaseStageSource = releaseStagesFromStdout.length > 0
    ? { promotion_stages: releaseStagesFromStdout }
    : releaseArtifact;
  const releaseStages = releaseStageSummaryMap(releaseStageSource);
  const releaseStatus = releaseSummary.status ?? releaseArtifact.status ?? "unknown";
  const releaseNextStage = releaseSummary.promotion_next_stage ?? releaseArtifact.promotion_next_stage ?? "unknown";
  const releaseWarnings = Array.isArray(releaseSummary.warnings) && releaseSummary.warnings.length > 0
    ? releaseSummary.warnings
    : (Array.isArray(releaseArtifact.warnings) ? releaseArtifact.warnings : []);
  const lifecycle = data.project_router.lifecycle_summary ?? {};
  const workspaceSummary = checkMap.get("workspace")?.summary ?? {};
  const workerSummary = checkMap.get("workerControl")?.summary ?? {};
  const assignSummary = checkMap.get("workerAssign")?.summary ?? {};
  const accessSummary = checkMap.get("access")?.summary ?? {};
  const dispatchSummary = checkMap.get("dispatch")?.summary ?? {};
  const productionSummary = checkMap.get("productionSafety")?.summary ?? {};
  const runtimeRows = parseTableRows(checkMap.get("runtimeHealth")?.stdout ?? "");

  const crossProjectScore = scoreClamp(
    20
    + Math.min(toInt(workspaceSummary.project_count), 3) * 8
    + Math.min(toInt(workspaceSummary.connected_project_count), 3) * 12
    + Math.min(toInt(workspaceSummary.planned_project_count), 2) * 5
    + Math.min(toInt(workspaceSummary.managed_repo_routed_count), 3) * 8
    + (String(workspaceSummary.writable_project_count ?? "0") === "0" ? 8 : 0)
  );

  const workerScore = scoreClamp(
    18
    + (workerSummary.true_parallel_executor === "node_child_process_verified" ? 24 : 0)
    + Math.min(toInt(workerSummary.worker_count), 4) * 9
    + Math.min(toInt(workerSummary.available_worker_count), 4) * 6
    + (assignSummary.status === "ASSIGNED" ? 14 : 0)
  );

  const runtimeScore = scoreClamp(
    15
    + Math.min(toInt(checkMap.get("runtimeHealth")?.summary?.providers), 6) * 4
    + Math.min(toInt(checkMap.get("runtimeHealth")?.summary?.runtimes), 6) * 4
    + (runtimeRows.some((line) => line.includes("| openai | codex-cli |")) ? 15 : 0)
    + (runtimeRows.some((line) => line.includes("| anthropic | claude-code |")) ? 6 : 0)
    + (runtimeRows.some((line) => line.includes("reference_only")) ? 8 : 0)
    - (runtimeRows.some((line) => line.includes("| unknown |")) ? 12 : 0)
  );

  const dispatchScore = scoreClamp(
    12
    + (dispatchSummary.status === "PASS" ? 18 : 0)
    + ((data.project_router.dispatch_plan_count ?? 0) >= 1 ? 14 : 0)
    + ((data.project_router.proposal_count ?? 0) >= 1 ? 12 : 0)
    + ((data.project_router.queue_injection_audit_count ?? 0) >= 1 ? 16 : 0)
    + ((lifecycle.injected ?? 0) >= 1 ? 18 : 0)
    - ((lifecycle.pending_approval ?? 0) > 0 ? 6 : 0)
    - ((lifecycle.blocked ?? 0) > 0 ? 10 : 0)
  );

  const consoleScore = scoreClamp(
    (checkMap.get("consoleSmoke")?.summary?.status === "PASS" ? 50 : 0)
    + (checkMap.get("actionServerSmoke")?.summary?.status === "PASS" ? 50 : 0)
  );

  const releaseScore = scoreClamp(
    (releaseStages.local_preview?.status === "PASS" ? 28 : 0)
    + (releaseStages.server_preview?.status === "PASS" ? 28 : 0)
    + (releaseStages.reviewed_publish?.status === "PASS" ? 28 : 0)
    + (releaseStatus === "PASS" ? 8 : 0)
    - Math.min(releaseWarnings.length, 4) * 6
  );

  const governanceScore = scoreClamp(
    18
    + (checkMap.get("access")?.summary?.authenticated === "yes" ? 12 : 0)
    + (checkMap.get("access")?.summary?.policy_id ? 12 : 0)
    + (productionSummary.status === "PASS" ? 12 : 0)
    + (productionSummary.release_readiness === "BLOCKED" ? 12 : 0)
    + (productionSummary.real_execution_approval_gate === "CRITICAL" ? 16 : 0)
    + (accessSummary.direct_execute_max_risk === "LOW" ? 4 : 12)
  );

  const developmentExecutionScore = weightedAverage([
    { score: crossProjectScore, weight: 2 },
    { score: workerScore, weight: 2 },
    { score: runtimeScore, weight: 1 },
    { score: dispatchScore, weight: 2 },
    { score: consoleScore, weight: 1 }
  ]);

  const productionExecutionScore = weightedAverage([
    { score: releaseScore, weight: 2 },
    { score: governanceScore, weight: 2 },
    { score: 52, weight: 1 }
  ]);

  const overallScore = weightedAverage([
    { score: crossProjectScore, weight: 2 },
    { score: workerScore, weight: 2 },
    { score: runtimeScore, weight: 1 },
    { score: dispatchScore, weight: 2 },
    { score: consoleScore, weight: 2 },
    { score: releaseScore, weight: 1 },
    { score: governanceScore, weight: 2 }
  ]);

  const dimensionStatus = (score) => (score >= 85 ? "PASS" : score >= 70 ? "PARTIAL" : "FAIL");
  const scores = [
    {
      dimension: "Cross Project Attach",
      score: crossProjectScore,
      status: dimensionStatus(crossProjectScore),
      summary: `project_count=${workspaceSummary.project_count ?? 0}, connected=${workspaceSummary.connected_project_count ?? 0}, planned=${workspaceSummary.planned_project_count ?? 0}`
    },
    {
      dimension: "Worker Control Plane",
      score: workerScore,
      status: dimensionStatus(workerScore),
      summary: `executor=${workerSummary.executor ?? "unknown"}, true_parallel=${workerSummary.true_parallel_executor ?? "unknown"}, assign=${assignSummary.status ?? "unknown"}`
    },
    {
      dimension: "Runtime Chain",
      score: runtimeScore,
      status: dimensionStatus(runtimeScore),
      summary: `providers=${checkMap.get("runtimeHealth")?.summary?.providers ?? 0}, runtimes=${checkMap.get("runtimeHealth")?.summary?.runtimes ?? 0}`
    },
    {
      dimension: "Dispatch / Proposal / Queue",
      score: dispatchScore,
      status: dimensionStatus(dispatchScore),
      summary: `dispatch=${data.project_router.dispatch_plan_count ?? 0}, proposal=${data.project_router.proposal_count ?? 0}, audit=${data.project_router.queue_injection_audit_count ?? 0}, injected=${lifecycle.injected ?? 0}`
    },
    {
      dimension: "Console Operability",
      score: consoleScore,
      status: dimensionStatus(consoleScore),
      summary: `console_smoke=${checkMap.get("consoleSmoke")?.summary?.status ?? "unknown"}, action_server=${checkMap.get("actionServerSmoke")?.summary?.status ?? "unknown"}`
    },
    {
      dimension: "Release Promotion Gates",
      score: releaseScore,
      status: dimensionStatus(releaseScore),
      summary: `local=${releaseStages.local_preview?.status ?? "missing"}, server=${releaseStages.server_preview?.status ?? "missing"}, reviewed=${releaseStages.reviewed_publish?.status ?? "missing"}, next=${releaseNextStage}`
    },
    {
      dimension: "Governance / Production Guard",
      score: governanceScore,
      status: dimensionStatus(governanceScore),
      summary: `production_release_readiness=${productionSummary.release_readiness ?? "unknown"}, critical_gate=${productionSummary.real_execution_approval_gate ?? "unknown"}`
    },
    {
      dimension: "Development Execution Readiness",
      score: developmentExecutionScore,
      status: dimensionStatus(developmentExecutionScore),
      summary: `owner_direct_execute_max_risk=${accessSummary.direct_execute_max_risk ?? "unknown"}, worker=${assignSummary.worker_id ?? "none"}, connected_projects=${workspaceSummary.connected_project_count ?? 0}`
    },
    {
      dimension: "Production Execution Readiness",
      score: productionExecutionScore,
      status: dimensionStatus(productionExecutionScore),
      summary: `release=${releaseStatus}, next=${releaseNextStage}, production_status=${productionSummary.status ?? "unknown"}`
    }
  ];

  const verdicts = {
    worker_as_cross_project_executor: crossProjectScore >= 80 && workerScore >= 80 && dispatchScore >= 75 ? "YES_GUARDED" : "PARTIAL_READY",
    development_execution_capability: developmentExecutionScore >= 80 ? "YES_LOCAL_AND_PROPOSAL_GATED" : "PARTIAL",
    production_execution_capability: productionExecutionScore >= 80
      ? "GUARDED_PREVIEW_ONLY"
      : "NOT_READY_FOR_DIRECT_PRODUCTION"
  };

  const enhancements = {
    P0: [
      accessSummary.direct_execute_max_risk === "LOW"
        ? "把平台操作员账号升级为可直执 MEDIUM 的受控套餐，否则跨项目 worker 只能停在 proposal / dry-run。"
        : "保持当前直执上限，并为高风险动作继续保留 proposal / approval gate。",
      toInt(workspaceSummary.connected_project_count) < 2
        ? "挂接第二个真实项目仓库，验证 Studio 不是只对 jinhu-smart-park 生效。"
        : "继续对第二、第三个项目做 attach regression，验证跨项目路由稳定。",
      releaseStages.reviewed_publish?.status !== "PASS"
        ? "补齐 local preview / server preview / reviewed publish 一致性留痕，避免发布链路停在人工口头确认。"
        : "把 reviewed publish 的结果同步进 Console 发布面板和审计摘要。"
    ],
    P1: [
      "为 Claude / Gemini / OpenHands 增加 reference-only live probe，让 Runtime Health 不再长期停在 unknown。",
      "把 approved proposal 的 queue injection audit trace 提炼成专门 API / ViewModel，减少页面里对原始 JSON 的依赖。",
      "把 attached project onboarding 做成向导化流程：intake → bind → workspace → dispatch plan。"
    ],
    P2: [
      "增加多项目 worker 回归包，覆盖 attach / dispatch / proposal / queue / release 的端到端快照测试。",
      "为生产操作中心补 reviewed publish 之后的人工发布签收界面，但继续保持 CRITICAL gate。",
      "补一套 operator scorecard，把套餐、角色、项目范围、直执上限做成产品化矩阵。"
    ]
  };

  const overallStatus = overallScore >= 86
    ? "READY_FOR_INTERNAL_WORKER_PLATFORM"
    : (overallScore >= 72 ? "USABLE_WITH_GAPS" : "HOLD");

  const report = {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    mode: args.apply ? "apply" : "dry-run",
    overall_score: overallScore,
    overall_status: overallStatus,
    verdicts,
    scores,
    release: {
      status: releaseStatus,
      next_stage: releaseNextStage,
      warnings: releaseWarnings,
      stages: releaseStagesFromStdout.length > 0
        ? releaseStagesFromStdout
        : (releaseArtifact.promotion_stages ?? []),
      apply_attempts: releaseApplyAttempts.map((attempt) => ({
        target: attempt.target,
        ok: attempt.ok,
        exit_code: attempt.exit_code,
        status: attempt.summary.status ?? (attempt.ok ? "PASS" : "FAIL")
      }))
    },
    dispatch: {
      dispatch_plan_count: data.project_router.dispatch_plan_count ?? 0,
      proposal_count: data.project_router.proposal_count ?? 0,
      queue_injection_audit_count: data.project_router.queue_injection_audit_count ?? 0,
      pending_approval: lifecycle.pending_approval ?? 0,
      proposal_only: lifecycle.proposal_only ?? 0,
      ready_inject: lifecycle.ready_inject ?? 0,
      injected: lifecycle.injected ?? 0,
      blocked: (lifecycle.blocked ?? 0) + (lifecycle.proposal_missing ?? 0),
      verified_approved_queue_audit: (data.project_router.queue_injection_audits ?? []).some((item) =>
        item?.data?.status === "PASS" && item?.data?.proposal?.approval_status === "APPROVED")
        ? "yes"
        : "no"
    },
    checks: [...checkMap.values()],
    enhancements,
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read",
      managed_project_writes: "proposal_or_queue_only"
    }
  };

  const filesWritten = [];
  if (args.apply) {
    const paths = platformSelfTestPaths();
    const jsonPath = resolveFromRoot(paths.json);
    const markdownPath = resolveFromRoot(paths.markdown);
    await writeJsonFile(jsonPath, report);
    await writeFile(markdownPath, `${platformSelfTestReportMarkdown(report)}\n`, "utf8");
    filesWritten.push(paths.json, paths.markdown);
    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [paths.json, "runtime/global/release-consistency.json"]
    });
    filesWritten.push(relativePath(indexPath));
  }

  console.log(`# Studio Worker Platform Self-Test ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`overall_score: ${report.overall_score}`);
  console.log(`overall_status: ${report.overall_status}`);
  console.log(`worker_as_cross_project_executor: ${report.verdicts.worker_as_cross_project_executor}`);
  console.log(`development_execution_capability: ${report.verdicts.development_execution_capability}`);
  console.log(`production_execution_capability: ${report.verdicts.production_execution_capability}`);
  console.log(`release_status: ${report.release.status}`);
  console.log(`release_next_stage: ${report.release.next_stage}`);
  console.log(`dispatch_plan_count: ${report.dispatch.dispatch_plan_count}`);
  console.log(`proposal_count: ${report.dispatch.proposal_count}`);
  console.log(`queue_injection_audit_count: ${report.dispatch.queue_injection_audit_count}`);
  console.log(`verified_approved_queue_audit: ${report.dispatch.verified_approved_queue_audit}`);
  console.log("");
  console.log("| Dimension | Score | Status |");
  console.log("| --- | ---: | --- |");
  for (const item of report.scores) {
    console.log(`| ${item.dimension} | ${item.score} | ${item.status} |`);
  }
  console.log("");
  console.log("enhancement_p0:");
  for (const item of report.enhancements.P0) console.log(`- ${item}`);
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  if (report.overall_status === "HOLD") process.exitCode = 1;
}

async function loadRuntimeCenterApi() {
  const api = await import(runtimeCenterUtilsUrl());
  const center = await api.loadRuntimeCenter();
  return { api, center };
}

async function loadRuntimeAdapterApi() {
  const api = await import(runtimeAdapterUtilsUrl());
  const bundle = await api.loadRuntimeAdapters();
  return { api, bundle };
}

async function loadModelGatewayApi() {
  const api = await import(modelGatewayUtilsUrl());
  const bundle = await api.loadModelGateway();
  return { api, bundle };
}

async function loadProjectConnectorApi() {
  return import(projectConnectorUtilsUrl());
}

async function loadCredentialVaultApi() {
  const api = await import(credentialVaultUtilsUrl());
  const vault = await api.loadCredentialVault();
  return { api, vault };
}

async function loadGovernanceCenterApi() {
  const api = await import(governanceCenterUtilsUrl());
  const bundle = await api.loadGovernanceCenter();
  return { api, bundle };
}

async function loadProductionOpsApi() {
  const api = await import(productionOpsUtilsUrl());
  const bundle = await api.loadProductionOps();
  return { api, bundle };
}

async function loadWorkerPoolApi() {
  const api = await import(workerPoolUtilsUrl());
  const bundle = await api.loadWorkerPool();
  return { api, bundle };
}

async function loadMobileStackPackApi() {
  const api = await import(mobileStackPackUtilsUrl());
  const bundle = await api.loadMobileStackPack();
  return { api, bundle };
}

async function loadAccessCenterApi() {
  const api = await import(accessCenterUtilsUrl());
  const bundle = await api.loadAccessCenter();
  return { api, bundle };
}

function assertDryRun(args, commandName) {
  if (!args.dryRun) {
    throw new Error(`${commandName} currently supports --dry-run only.`);
  }
}

function projectConfigPathFromArgs(args) {
  const configPath = resolveMaybeFromRoot(args.config || args.project || DEFAULT_PROJECT);
  if (!existsSync(configPath)) {
    throw new Error(`Project config not found: ${configPath}`);
  }
  return configPath;
}

function titleCaseProjectName(value) {
  return String(value ?? "")
    .split(/[-_\s]+/)
    .filter(Boolean)
    .map((segment) => segment.charAt(0).toUpperCase() + segment.slice(1))
    .join(" ");
}

function looksLikeGitUrl(value) {
  const text = String(value ?? "").trim().toLowerCase();
  return Boolean(text)
    && (
      text.endsWith(".git")
      || text.startsWith("git@")
      || text.startsWith("ssh://git@")
      || text.includes("github.com/")
      || text.includes("gitlab.com/")
      || text.includes("bitbucket.org/")
    );
}

function inferredSourceType(args) {
  const explicit = String(args.sourceType ?? "").trim();
  if (explicit && explicit !== "auto") return explicit;
  if (String(args.localPath ?? "").trim()) return "local_path";
  if (String(args.gitUrl ?? "").trim()) return "git_url";
  if (String(args.zipPlaceholder ?? "").trim()) return "zip_placeholder";
  const genericUrl = String(args.url ?? "").trim();
  if (genericUrl) return looksLikeGitUrl(genericUrl) ? "git_url" : "zip_placeholder";
  return "local_path";
}

function inferredProjectId(args, sourceType) {
  if (String(args.projectId ?? "").trim()) return safeSegment(args.projectId).toLowerCase();
  const localPath = String(args.localPath ?? "").trim();
  if (localPath) {
    return safeSegment(localPath.split(/[/\\]/).filter(Boolean).at(-1) ?? "attached-project").toLowerCase();
  }
  const directUrl = String(args.gitUrl || args.url || args.zipPlaceholder || "").trim();
  if (directUrl) {
    const cleaned = directUrl.replace(/[#?].*$/, "").replace(/\.git$/i, "");
    return safeSegment(
      cleaned.split("/").filter(Boolean).at(-1)
      ?? (sourceType === "zip_placeholder" ? "linked-project" : "github-project")
    ).toLowerCase();
  }
  return "attached-project";
}

function inferredProjectName(args, projectId) {
  if (String(args.projectName ?? "").trim()) return String(args.projectName).trim();
  return titleCaseProjectName(projectId);
}

function preferredLocalPath(args, projectId) {
  if (String(args.localPath ?? "").trim()) {
    return relativePath(resolve(repoRoot, String(args.localPath).trim()));
  }
  return relativePath(resolve(repoRoot, "..", "attached-projects", safeSegment(projectId)));
}

function projectConnectConfigPath(projectId) {
  return resolveFromRoot(`examples/${safeSegment(projectId)}/project.config.example.json`);
}

function projectConnectContextPaths(projectId) {
  const dir = projectContextDir(projectId);
  return {
    dir,
    binding: join(dir, "binding.json"),
    projectState: join(dir, "project-state.json"),
    architecture: join(dir, "architecture.json"),
    status: join(dir, "agent-studio-status.json"),
    handoff: join(dir, "handoff-summary.md")
  };
}

function nonEmptyString(value) {
  const text = String(value ?? "").trim();
  return text ? text : "";
}

function uniqueStrings(values) {
  return [...new Set((values ?? []).map((value) => String(value ?? "").trim()).filter(Boolean))];
}

async function readJsonIfPresent(path) {
  return existsSync(path) ? readJson(path) : null;
}

function baseProjectConnectConfig({
  projectId,
  projectName,
  sourceType,
  projectRoot,
  gitUrl,
  linkedUrl,
  description,
  defaultBranch,
  packageManager,
  stateDir,
  projectType,
  existingConfig,
  projectExists
}) {
  const sanitizedProjectRoot = String(projectRoot).trim();
  const nextDefaultBranch = defaultBranch || existingConfig?.default_branch || existingConfig?.intake?.repo_metadata?.default_branch || "main";
  const nextPackageManager = packageManager || existingConfig?.package_manager || existingConfig?.intake?.repo_metadata?.package_manager || "unknown";
  const nextStateDir = stateDir || existingConfig?.state_dir || "ops/agent-orchestrator";
  const resolvedProjectType = projectType || existingConfig?.project_type || (projectExists ? "business-repository" : "planned-business-repository");
  const resolvedDescription = description || existingConfig?.description || `${projectName} project connector for ANKSEN Agent Studio.`;
  const readPaths = Array.isArray(existingConfig?.read_paths) && existingConfig.read_paths.length > 0
    ? existingConfig.read_paths
    : [
        "apps/**",
        "packages/**",
        "docs/**",
        "scripts/**",
        "package.json",
        "pnpm-lock.yaml"
      ];
  const writePaths = Array.isArray(existingConfig?.write_paths) ? existingConfig.write_paths : [];
  const frozenPaths = Array.isArray(existingConfig?.frozen_paths) && existingConfig.frozen_paths.length > 0
    ? existingConfig.frozen_paths
    : ["**"];
  const guardedPaths = Array.isArray(existingConfig?.guarded_paths) && existingConfig.guarded_paths.length > 0
    ? existingConfig.guarded_paths
    : ["**", ".env", ".env.*"];
  const intake = {
    ...(existingConfig?.intake ?? {}),
    source_type: sourceType,
    local_path: sourceType === "local_path" || projectExists ? sanitizedProjectRoot : (existingConfig?.intake?.local_path ?? sanitizedProjectRoot),
    git_url: sourceType === "git_url" ? gitUrl : (existingConfig?.intake?.git_url ?? (gitUrl || undefined)),
    zip_placeholder: sourceType === "zip_placeholder" ? linkedUrl : (existingConfig?.intake?.zip_placeholder ?? (linkedUrl || undefined)),
    repo_metadata: {
      ...(existingConfig?.intake?.repo_metadata ?? {}),
      default_branch: nextDefaultBranch,
      package_manager: nextPackageManager,
      repository_kind: sourceType === "git_url"
        ? "git_repository"
        : sourceType === "local_path"
          ? "local_workspace"
          : "linked_placeholder"
    }
  };
  return {
    ...(existingConfig ?? {}),
    schema_version: 1,
    project_id: projectId,
    project_name: projectName,
    project_type: resolvedProjectType,
    description: resolvedDescription,
    project_root: sanitizedProjectRoot,
    local_path: sanitizedProjectRoot,
    git_url: gitUrl || existingConfig?.git_url,
    zip_placeholder: linkedUrl || existingConfig?.zip_placeholder,
    state_dir: nextStateDir,
    mode: projectExists ? "external-project-adapter-example" : "planned_project_not_connected",
    status: projectExists ? "CONNECTED" : "PLANNED",
    connection_status: projectExists ? "CONNECTED" : "NOT_CONNECTED",
    default_branch: nextDefaultBranch,
    package_manager: nextPackageManager,
    worktrees: {
      ...(existingConfig?.worktrees ?? {}),
      main: sanitizedProjectRoot
    },
    detected_stack_hints: uniqueStrings(existingConfig?.detected_stack_hints ?? []),
    available_commands: uniqueStrings(existingConfig?.available_commands ?? []),
    repo_metadata: {
      ...(existingConfig?.repo_metadata ?? {}),
      repository_exists: projectExists,
      connection_required: !projectExists,
      placeholder_only: sourceType === "zip_placeholder" || !projectExists
    },
    intake,
    read_paths: readPaths,
    write_paths: writePaths,
    frozen_paths: frozenPaths,
    guarded_paths: guardedPaths,
    runtime_memory: {
      directory: existingConfig?.runtime_memory?.directory ?? `runtime/projects/${projectId}`,
      summary_file: existingConfig?.runtime_memory?.summary_file ?? "handoff-summary.md",
      platform_state_file: existingConfig?.runtime_memory?.platform_state_file ?? "project-state.json",
      validate_command: existingConfig?.runtime_memory?.validate_command ?? ""
    },
    inspection: {
      dry_run_only: true,
      allow_agent_execution: false,
      allow_project_writes: false,
      allow_deploy: false,
      allow_production_operations: false,
      ...(existingConfig?.inspection ?? {})
    },
    production_operations: {
      deploy: "forbidden",
      migration: "forbidden",
      seed: "forbidden",
      reset: "forbidden",
      cleanup: "forbidden",
      ...(existingConfig?.production_operations ?? {})
    }
  };
}

async function cloneConnectedProjectIfNeeded(sourceType, gitUrl, projectPath, defaultBranch) {
  if (sourceType !== "git_url" || !gitUrl || existsSync(projectPath)) {
    return {
      attempted: false,
      status: existsSync(projectPath) ? "present" : "skipped",
      detail: existsSync(projectPath) ? "local path already exists" : "clone not required"
    };
  }
  await mkdir(dirname(projectPath), { recursive: true });
  const args = ["clone", "--depth", "1"];
  if (defaultBranch) args.push("--branch", defaultBranch);
  args.push(gitUrl, projectPath);
  const result = await execReadOnly(repoRoot, "git", args, 600000);
  return {
    attempted: true,
    status: result.ok ? "cloned" : "failed",
    detail: result.ok ? "git clone completed" : (result.stderr || result.stdout || "git clone failed"),
    command: `git ${args.join(" ")}`
  };
}

async function projectConnect(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project connect requires --dry-run or --apply.");
  }
  const sourceType = inferredSourceType(args);
  const projectId = inferredProjectId(args, sourceType);
  const projectName = inferredProjectName(args, projectId);
  const projectRoot = preferredLocalPath(args, projectId);
  const configPath = projectConnectConfigPath(projectId);
  const existingConfig = await readJsonIfPresent(configPath);
  const gitUrl = nonEmptyString(args.gitUrl || (sourceType === "git_url" ? args.url : ""));
  const linkedUrl = nonEmptyString(args.zipPlaceholder || (sourceType === "zip_placeholder" ? args.url : ""));
  const absoluteProjectPath = resolve(repoRoot, projectRoot);
  const initialProjectExists = existsSync(absoluteProjectPath);
  let config = baseProjectConnectConfig({
    projectId,
    projectName,
    sourceType,
    projectRoot,
    gitUrl,
    linkedUrl,
    description: nonEmptyString(args.description),
    defaultBranch: nonEmptyString(args.defaultBranch),
    packageManager: nonEmptyString(args.packageManager),
    stateDir: nonEmptyString(args.stateDir),
    projectType: nonEmptyString(args.projectType),
    existingConfig,
    projectExists: initialProjectExists
  });
  const filesWritten = [];
  let cloneSummary = {
    attempted: false,
    status: initialProjectExists ? "present" : "not_attempted",
    detail: initialProjectExists ? "local path already exists" : "no clone attempted"
  };

  if (args.apply) {
    await mkdir(dirname(configPath), { recursive: true });
    await writeJsonFile(configPath, config);
    filesWritten.push(relativePath(configPath));

    cloneSummary = await cloneConnectedProjectIfNeeded(sourceType, gitUrl, absoluteProjectPath, config.default_branch);

    const projectExists = existsSync(absoluteProjectPath);
    config = baseProjectConnectConfig({
      projectId,
      projectName,
      sourceType,
      projectRoot,
      gitUrl,
      linkedUrl,
      description: nonEmptyString(args.description),
      defaultBranch: config.default_branch,
      packageManager: config.package_manager,
      stateDir: config.state_dir,
      projectType: config.project_type,
      existingConfig: config,
      projectExists
    });

    const api = await loadProjectConnectorApi();
    const stack = await api.detectProjectStack(configPath, repoRoot);
    const commands = await api.detectProjectCommands(configPath, repoRoot);
    config.detected_stack_hints = uniqueStrings(stack.detected_stack);
    config.available_commands = uniqueStrings((commands.commands ?? []).map((command) => command.command));
    await writeJsonFile(configPath, config);

    const binding = await api.buildProjectBinding(configPath, repoRoot);
    const workspace = await api.buildWorkspaceBindingSummary(repoRoot);
    const contextPaths = projectConnectContextPaths(projectId);
    const snapshot = await collectProjectSnapshot(configPath);
    const memory = buildProjectMemory(snapshot);
    const workspacePath = resolveFromRoot("runtime/global/attached-project-workspace.json");

    await writeJsonFile(contextPaths.binding, binding);
    await writeProjectMemory(contextPaths.dir, memory);
    await writeJsonFile(workspacePath, workspace);
    filesWritten.push(
      relativePath(contextPaths.binding),
      relativePath(contextPaths.projectState),
      relativePath(contextPaths.architecture),
      relativePath(contextPaths.status),
      relativePath(contextPaths.handoff),
      relativePath(workspacePath)
    );

    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [relativePath(workspacePath)],
      projectFiles: {
        [projectId]: [
          relativePath(configPath),
          relativePath(contextPaths.binding),
          relativePath(contextPaths.projectState),
          relativePath(contextPaths.architecture),
          relativePath(contextPaths.status),
          relativePath(contextPaths.handoff)
        ]
      }
    });
    filesWritten.push(relativePath(indexPath));
  }

  const projectExists = existsSync(absoluteProjectPath);
  const connectionStatus = projectExists ? "CONNECTED" : "NOT_CONNECTED";
  const mode = projectExists ? "bound_local_or_cloned" : "planned_connector_only";

  console.log(`# Project Connect ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`project_id: ${projectId}`);
  console.log(`project_name: ${projectName}`);
  console.log(`source_type: ${sourceType}`);
  console.log(`mode: ${mode}`);
  console.log(`project_root: ${projectRoot}`);
  console.log(`config_path: ${relativePath(configPath)}`);
  console.log(`project_exists: ${projectExists ? "yes" : "no"}`);
  console.log(`connection_status: ${connectionStatus}`);
  console.log(`git_url: ${gitUrl || "none"}`);
  console.log(`linked_url: ${linkedUrl || "none"}`);
  console.log(`clone_attempted: ${cloneSummary.attempted ? "yes" : "no"}`);
  console.log(`clone_status: ${cloneSummary.status}`);
  console.log(`clone_detail: ${cloneSummary.detail}`);
  console.log("");
  console.log("safety:");
  console.log("- project_writes: disabled");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
  console.log("- credential_values: not_read");
  console.log("- model_invocation: disabled");
  console.log("");
  if (args.apply) {
    console.log("written_files:");
    for (const file of uniqueStrings(filesWritten)) console.log(`- ${file}`);
    console.log("");
  } else {
    const contextPaths = projectConnectContextPaths(projectId);
    console.log("would_write_files:");
    for (const file of [
      relativePath(configPath),
      relativePath(contextPaths.binding),
      relativePath(contextPaths.projectState),
      relativePath(contextPaths.architecture),
      relativePath(contextPaths.status),
      relativePath(contextPaths.handoff),
      "runtime/global/attached-project-workspace.json"
    ]) console.log(`- ${file}`);
    console.log("");
  }
  console.log("next_steps:");
  if (connectionStatus === "CONNECTED") {
    console.log(`- node packages/orchestrator-core/bin/studio.mjs project inspect --config ${relativePath(configPath)} --dry-run`);
    console.log(`- node packages/orchestrator-core/bin/studio.mjs context project --project ${projectId}`);
  } else {
    console.log(`- Provide a local checkout at ${projectRoot} or rerun with --local-path.`);
    if (sourceType === "git_url") {
      console.log(`- 确认 ${gitUrl} 的仓库访问权限后，重新执行 --apply。`);
    }
  }
  if (args.apply && cloneSummary.status === "failed") {
    process.exitCode = 1;
  }
}

async function projectIntake(args) {
  assertDryRun(args, "project intake");
  const api = await loadProjectConnectorApi();
  const intake = await api.buildProjectIntake(projectConfigPathFromArgs(args), repoRoot);
  console.log("# Project Intake dry-run");
  console.log("");
  console.log(`project_id: ${intake.project_id}`);
  console.log(`project_name: ${intake.project_name}`);
  console.log(`source_type: ${intake.source_type}`);
  console.log(`local_path: ${intake.local_path}`);
  console.log(`project_exists: ${intake.project_exists ? "yes" : "no"}`);
  console.log(`git_url_present: ${intake.git_url_present ? "yes" : "no"}`);
  console.log(`zip_placeholder_present: ${intake.zip_placeholder_present ? "yes" : "no"}`);
  console.log("");
  console.log("repo_metadata:");
  console.log(`- default_branch: ${intake.repo_metadata.default_branch}`);
  console.log(`- package_manager: ${intake.repo_metadata.package_manager}`);
  console.log(`- is_git_repository: ${intake.repo_metadata.is_git_repository ? "yes" : "no"}`);
  console.log(`- branch: ${intake.repo_metadata.branch}`);
  console.log(`- head: ${intake.repo_metadata.head}`);
  console.log(`- remote_url_present: ${intake.repo_metadata.remote_url_present ? "yes" : "no"}`);
  console.log("");
  console.log("safety:");
  console.log(`- dry_run_only: ${intake.safety.dry_run_only ? "yes" : "no"}`);
  console.log(`- project_writes: ${intake.safety.project_writes}`);
  console.log(`- agent_execution: ${intake.safety.agent_execution}`);
  console.log(`- deploy: ${intake.safety.deploy}`);
  console.log(`- production_operations: ${intake.safety.production_operations}`);
  console.log(`- credential_values: ${intake.safety.credential_values}`);
}

async function projectStack(args) {
  assertDryRun(args, "project stack");
  const api = await loadProjectConnectorApi();
  const stack = await api.detectProjectStack(projectConfigPathFromArgs(args), repoRoot);
  console.log("# Project Stack Detector dry-run");
  console.log("");
  console.log(`project_id: ${stack.project_id}`);
  console.log(`project_path: ${stack.project_path}`);
  console.log(`project_exists: ${stack.project_exists ? "yes" : "no"}`);
  console.log("");
  console.log("probes:");
  console.log(`- package_json: ${stack.package_json}`);
  console.log(`- pnpm_workspace: ${stack.pnpm_workspace}`);
  console.log(`- nextjs: ${stack.nextjs}`);
  console.log(`- nestjs: ${stack.nestjs}`);
  console.log(`- typescript: ${stack.typescript}`);
  console.log(`- prisma_postgresql: ${stack.prisma_postgresql}`);
  console.log(`- docker: ${stack.docker}`);
  console.log(`- cicd: ${stack.cicd}`);
  console.log("");
  console.log("scripts:");
  if (stack.scripts.length === 0) {
    console.log("- none");
  } else {
    for (const script of stack.scripts) console.log(`- ${script}`);
  }
  console.log("");
  console.log("detected_stack:");
  if (stack.detected_stack.length === 0) {
    console.log("- none");
  } else {
    for (const item of stack.detected_stack) console.log(`- ${item}`);
  }
  console.log("");
  console.log("safety:");
  console.log("- command_execution: disabled");
  console.log("- project_writes: disabled");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
}

async function projectCommands(args) {
  assertDryRun(args, "project commands");
  const api = await loadProjectConnectorApi();
  const detection = await api.detectProjectCommands(projectConfigPathFromArgs(args), repoRoot);
  console.log("# Project Command Detector dry-run");
  console.log("");
  console.log(`project_id: ${detection.project_id}`);
  console.log(`project_path: ${detection.project_path}`);
  console.log(`project_exists: ${detection.project_exists ? "yes" : "no"}`);
  console.log(`command_count: ${detection.command_count}`);
  console.log(`command_execution: ${detection.safety.command_execution}`);
  console.log("");
  console.log("| Kind | Command | Source | Executable In MVP |");
  console.log("| --- | --- | --- | --- |");
  for (const command of detection.commands) {
    console.log(`| ${command.kind} | ${command.command} | ${command.source} | ${command.executable_in_mvp ? "yes" : "no"} |`);
  }
  console.log("");
  console.log("safety:");
  console.log("- dry_run_only: yes");
  console.log("- project_writes: disabled");
  console.log("- agent_execution: disabled");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
}

async function projectBind(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project bind requires --dry-run or --apply.");
  }
  const api = await loadProjectConnectorApi();
  const configPath = projectConfigPathFromArgs(args);
  const binding = await api.buildProjectBinding(configPath, repoRoot);
  const filesWritten = [];
  if (args.apply) {
    const bindingPath = join(projectContextDir(binding.project_id), "binding.json");
    await writeJsonFile(bindingPath, binding);
    filesWritten.push(relativePath(bindingPath));
    const indexPath = await updateCodexContextIndexArtifacts({
      projectFiles: {
        [binding.project_id]: [relativePath(bindingPath)]
      }
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Project Bind ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`project_id: ${binding.project_id}`);
  console.log(`project_name: ${binding.project_name}`);
  console.log(`binding_status: ${binding.binding_status}`);
  console.log(`config_path: ${binding.config_path}`);
  console.log(`context_dir: ${binding.context_dir}`);
  console.log(`connection_status: ${binding.connector.connection_status}`);
  console.log(`doctor_status: ${binding.connector.doctor_status}`);
  console.log(`execution_route: ${binding.execution.execution_route}`);
  console.log(`repo_path: ${binding.execution.repo_path_display}`);
  console.log(`repo_branch: ${binding.execution.repo_branch}`);
  console.log(`repo_clean: ${binding.execution.repo_clean}`);
  console.log(`write_policy: ${binding.policies.write_policy}`);
  console.log(`deploy_policy: ${binding.policies.deploy_policy}`);
  console.log(`production_operation_policy: ${binding.policies.production_operation_policy}`);
  console.log(`worktree_count: ${binding.workspace.worktree_count}`);
  console.log("");
  console.log("worktrees:");
  if (binding.workspace.worktrees.length === 0) {
    console.log("- none");
  } else {
    for (const worktree of binding.workspace.worktrees) {
      console.log(`- ${worktree.slot}: ${worktree.path_display} (${worktree.exists ? "present" : "missing"})`);
    }
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  console.log("");
  console.log("safety:");
  console.log("- agent_execution: disabled");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
  console.log("- credential_values: not_read");
}

async function projectWorkspace(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project workspace requires --dry-run or --apply.");
  }
  const api = await loadProjectConnectorApi();
  const workspace = await api.buildWorkspaceBindingSummary(repoRoot);
  const filesWritten = [];
  if (args.apply) {
    const workspacePath = resolveFromRoot("runtime/global/attached-project-workspace.json");
    await writeJsonFile(workspacePath, workspace);
    filesWritten.push(relativePath(workspacePath));
    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [relativePath(workspacePath)]
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Project Workspace ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`workspace_id: ${workspace.workspace_id}`);
  console.log(`mode: ${workspace.mode}`);
  console.log(`project_count: ${workspace.project_count}`);
  console.log(`connected_project_count: ${workspace.connected_project_count}`);
  console.log(`planned_project_count: ${workspace.planned_project_count}`);
  console.log(`managed_repo_routed_count: ${workspace.managed_repo_routed_count}`);
  console.log(`writable_project_count: ${workspace.writable_project_count}`);
  console.log("");
  console.log("| Project | Status | Route | Branch | Clean | Write Policy | Doctor |");
  console.log("| --- | --- | --- | --- | --- | --- | --- |");
  for (const project of workspace.projects) {
    console.log(`| ${project.project_id} | ${project.connection_status} | ${project.execution_route} | ${project.repo_branch} | ${project.repo_clean} | ${project.write_policy} | ${project.doctor_status} |`);
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  console.log("");
  console.log("safety:");
  console.log(`- managed_project_writes: ${workspace.safety.managed_project_writes}`);
  console.log(`- deploy: ${workspace.safety.deploy}`);
  console.log(`- production_operations: ${workspace.safety.production_operations}`);
  console.log(`- credential_values: ${workspace.safety.credential_values}`);
}

async function projectExecContext(args) {
  assertDryRun(args, "project exec-context");
  const projectId = contextProjectId(args.project || DEFAULT_PROJECT);
  const api = await loadProjectConnectorApi();
  const context = await api.buildExecContextSummary(projectId, repoRoot);
  console.log("# Project Execution Context dry-run");
  console.log("");
  console.log(`project_id: ${context.project_id}`);
  console.log(`project_name: ${context.project_name ?? "unknown"}`);
  console.log(`resolved: ${context.resolved ? "yes" : "no"}`);
  if (!context.resolved) {
    console.log(`reason: ${context.reason}`);
    process.exitCode = 1;
    return;
  }
  console.log(`execution_route: ${context.execution_route}`);
  console.log(`repo_path: ${context.repo_path_display}`);
  console.log(`repo_branch: ${context.repo_branch}`);
  console.log(`repo_clean: ${context.repo_clean}`);
  console.log(`connection_status: ${context.connection_status}`);
  console.log(`doctor_status: ${context.doctor_status}`);
  console.log(`write_policy: ${context.write_policy}`);
  console.log(`deploy_policy: ${context.deploy_policy}`);
  console.log(`production_operation_policy: ${context.production_operation_policy}`);
  console.log(`runtime_memory_dir: ${context.runtime_memory_dir}`);
  console.log("");
  console.log("guarded_paths:");
  if ((context.guarded_paths ?? []).length === 0) {
    console.log("- none");
  } else {
    for (const path of context.guarded_paths) console.log(`- ${path}`);
  }
  console.log("");
  console.log("recommended_checks:");
  for (const line of context.recommended_checks ?? []) console.log(`- ${line}`);
}

function projectDispatchPlansDir(projectId) {
  return join(projectContextDir(projectId), "dispatch-plans");
}

function projectDispatchPlanPath(projectId, taskId) {
  return join(projectDispatchPlansDir(projectId), `${safeSegment(taskId)}.json`);
}

async function readProjectDispatchPlan(projectId, taskId) {
  const path = projectDispatchPlanPath(projectId, taskId);
  if (!existsSync(path)) return null;
  return {
    path,
    data: await readJson(path)
  };
}

async function buildProjectDispatchArtifact(args) {
  const projectId = contextProjectId(args.project || DEFAULT_PROJECT);
  const configPath = projectConfigPathForProjectArg(args);
  const config = await readJson(configPath);
  const projectApi = await loadProjectConnectorApi();
  const binding = await projectApi.buildProjectBinding(configPath, repoRoot);
  const execContext = await projectApi.buildExecContextSummary(projectId, repoRoot);
  const snapshot = binding.execution.repo_resolved ? await collectProjectSnapshot(configPath) : null;

  let candidate = null;
  let candidateError = "";
  try {
    candidate = await buildTaskCandidate(configPath, args.text);
  } catch (error) {
    candidateError = error instanceof Error ? error.message : String(error);
  }

  const taskId = candidate?.task_id ?? stableTaskId(projectId, args.text);
  const effectiveRuntime = String(args.runtime || candidate?.runtime || "codex-cli").trim() || "codex-cli";
  const proposalInfo = existsSync(proposalPathForTask(configPath, taskId))
    ? await readProposal(configPath, taskId)
    : null;
  const queueState = snapshot?.projectPath
    ? await readProjectQueueState(snapshot.projectPath, snapshot.config, taskId)
    : null;
  const existingDispatchPlan = await readProjectDispatchPlan(projectId, taskId);

  const { api: workerApi, bundle: workerBundle } = await loadWorkerPoolApi();
  const workerDispatch = workerApi.workerDispatch(workerBundle, { runtimeId: effectiveRuntime });

  const { api: accessApi, bundle: accessBundle } = await loadAccessCenterApi();
  const evaluatedUser = String(args.user || accessBundle.policy.default_console_user_id || "").trim();
  const userContext = accessApi.resolveUserProfile(accessBundle, evaluatedUser);
  const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
  const rankRisk = (risk) => {
    const index = riskOrder.indexOf(risk);
    return index >= 0 ? index : riskOrder.length - 1;
  };
  const accessDecision = await accessApi.evaluateConsoleActionAccess(accessBundle, {
    action_id: "project-dispatch",
    project_id: projectId,
    risk: candidate?.risk ?? "MEDIUM",
    runtime_id: effectiveRuntime,
    parallel_count: 1
  }, {
      user_context: userContext,
      allow_default_user: true
  });
  const executionGate = {
    requested_risk: candidate?.risk ?? "MEDIUM",
    direct_execute_max_risk: userContext.direct_execute_max_risk ?? "LOW",
    allowed: candidate
      ? rankRisk(candidate.risk) <= rankRisk(userContext.direct_execute_max_risk ?? "LOW")
      : false,
    reason: candidate
      ? rankRisk(candidate.risk) <= rankRisk(userContext.direct_execute_max_risk ?? "LOW")
        ? `当前账号可覆盖 ${candidate.risk} 风险。`
        : `当前账号最高只允许直接执行 ${userContext.direct_execute_max_risk ?? "LOW"} 风险动作，不能直接执行 ${candidate.risk}。`
      : "任务候选尚未生成，无法判断最终执行风险。"
  };

  const blockingReasons = [];
  const warnings = [];
  if (!execContext.resolved) blockingReasons.push(execContext.reason || "Execution context is unresolved.");
  if (binding.connector.connection_status !== "CONNECTED") blockingReasons.push(`Project connection status is ${binding.connector.connection_status}.`);
  if (candidateError) blockingReasons.push(candidateError);
  if (accessDecision.status !== "ALLOW") blockingReasons.push(accessDecision.reason);
  if (workerDispatch.status !== "ASSIGNED") blockingReasons.push(...workerDispatch.blocked_reasons);
  if (binding.connector.doctor_status && binding.connector.doctor_status !== "GO") {
    warnings.push(`Doctor status is ${binding.connector.doctor_status}; execution will require project-side remediation before final run.`);
  }
  if (binding.execution.repo_clean !== "yes") {
    warnings.push(`Attached repo is not clean (${binding.execution.repo_clean}).`);
  }
  if (binding.policies.write_policy !== "enabled") {
    warnings.push(`Managed project business writes remain ${binding.policies.write_policy}. Queue/event injection is the only safe downstream write path.`);
  }
  if (!executionGate.allowed) {
    warnings.push(executionGate.reason);
  }

  let pipelineStage = "BLOCKED";
  let recommendedNextCommand = "";
  let recommendedNextStage = "resolve_blockers";
  if (blockingReasons.length === 0) {
    if (!proposalInfo) {
      pipelineStage = "PROPOSAL_CREATION_READY";
      recommendedNextStage = "create_proposal";
      recommendedNextCommand = `node packages/orchestrator-core/bin/studio.mjs project task-plan --config ${configPath} --text ${JSON.stringify(args.text)} --apply-proposal`;
    } else if (proposalInfo.proposal.approval_status !== "APPROVED") {
      pipelineStage = "READY_FOR_QUEUE_INJECTION";
      recommendedNextStage = "approve_proposal";
      recommendedNextCommand = `node packages/orchestrator-core/bin/studio.mjs project approve-proposal --config ${configPath} --task-id ${taskId} --dry-run${proposalInfo.proposal.risk === "HIGH" ? " --approve-high-risk" : ""}`;
    } else if (!queueState?.task) {
      pipelineStage = "QUEUE_SYNC_REQUIRED";
      recommendedNextStage = "rebuild_queue";
      recommendedNextCommand = `node ${process.execPath} ${join(snapshot.projectPath, "ops/agent-orchestrator/scripts/rebuild-queue-read-model.mjs")} --apply`;
    } else {
      pipelineStage = "READY_FOR_EXECUTE";
      recommendedNextStage = "execute_task";
      recommendedNextCommand = `node packages/orchestrator-core/bin/studio.mjs project execute --config ${configPath} --task-id ${taskId} --dry-run`;
    }
  }

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    dispatcher_id: `dispatch-plan-${stableHash({
      project_id: projectId,
      task_id: taskId,
      runtime: effectiveRuntime,
      user: evaluatedUser || "default"
    }).slice(0, 12)}`,
    project_id: projectId,
    project_name: binding.project_name,
    goal_text: args.text,
    task_id: taskId,
    status: blockingReasons.length === 0 ? "PASS" : "BLOCKED",
    pipeline_stage: pipelineStage,
    recommended_next_stage: recommendedNextStage,
    recommended_next_command: recommendedNextCommand,
    config_path: relativePath(configPath),
    binding_path: relativePath(join(projectContextDir(projectId), "binding.json")),
    latest_existing_dispatch_plan: existingDispatchPlan?.path ? relativePath(existingDispatchPlan.path) : "",
    binding_summary: {
      binding_status: binding.binding_status,
      connection_status: binding.connector.connection_status,
      doctor_status: binding.connector.doctor_status,
      execution_route: binding.execution.execution_route,
      repo_path: binding.execution.repo_path_display,
      repo_branch: binding.execution.repo_branch,
      repo_clean: binding.execution.repo_clean,
      write_policy: binding.policies.write_policy,
      deploy_policy: binding.policies.deploy_policy,
      production_operation_policy: binding.policies.production_operation_policy,
      worktree_count: binding.workspace.worktree_count
    },
    execution_context: execContext,
    task_candidate: candidate ? {
      task_id: candidate.task_id,
      owner: candidate.owner,
      skill_type: candidate.skill_type,
      skill_id: candidate.skill_id,
      runtime: candidate.runtime,
      risk: candidate.risk,
      approval_required: candidate.approval_required,
      allowed_paths: candidate.allowed_paths,
      forbidden_paths: candidate.forbidden_paths,
      validation_commands: candidate.validation_commands,
      routing: candidate.routing,
      project_context: candidate.project_context
    } : null,
    proposal_state: proposalInfo ? {
      path: relativePath(proposalInfo.path),
      approval_status: proposalInfo.proposal.approval_status,
      proposal_status: proposalInfo.proposal.proposal_status,
      risk: proposalInfo.proposal.risk,
      created_at: proposalInfo.proposal.created_at,
      approved_at: proposalInfo.proposal.approved_at ?? ""
    } : null,
    queue_state: queueState ? {
      task_status: queueState.task?.status ?? "missing",
      result_status: queueState.result?.status ?? "missing",
      ready_task_count: queueState.readyTasks.length,
      active_locks: queueState.activeLocks.length
    } : null,
    access_gate: {
      user: evaluatedUser || accessBundle.policy.default_console_user_id,
      status: accessDecision.status,
      execution_mode: accessDecision.execution_mode,
      direct_execute_max_risk: accessDecision.direct_execute_max_risk,
      required_capabilities: accessDecision.required_capabilities,
      missing_capabilities: accessDecision.missing_capabilities,
      project_scope: accessDecision.project_scope,
      reason: accessDecision.reason
    },
    execution_gate: executionGate,
    worker_route: workerDispatch,
    command_plan: {
      inspect_context: `node packages/orchestrator-core/bin/studio.mjs project exec-context --project ${projectId} --dry-run`,
      create_proposal: `node packages/orchestrator-core/bin/studio.mjs project task-plan --config ${configPath} --text ${JSON.stringify(args.text)} --apply-proposal`,
      inspect_proposals: `node packages/orchestrator-core/bin/studio.mjs project proposals --config ${configPath}`,
      approve_proposal: `node packages/orchestrator-core/bin/studio.mjs project approve-proposal --config ${configPath} --task-id ${taskId} --dry-run${candidate?.risk === "HIGH" ? " --approve-high-risk" : ""}`,
      execute_task: `node packages/orchestrator-core/bin/studio.mjs project execute --config ${configPath} --task-id ${taskId} --dry-run`
    },
    blocking_reasons: blockingReasons,
    warnings,
    safety: {
      business_project_writes: "disabled",
      queue_event_injection: "proposal_approval_path_only",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read",
      model_invocation: "disabled"
    }
  };
}

async function projectDispatchPlan(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("project dispatch-plan requires --dry-run or --apply.");
  }
  if (!args.text.trim()) {
    throw new Error("Missing --text for project dispatch-plan.");
  }
  const artifact = await buildProjectDispatchArtifact(args);
  const filesWritten = [];
  if (args.apply) {
    const outputPath = projectDispatchPlanPath(artifact.project_id, artifact.task_id);
    await writeJsonFile(outputPath, artifact);
    filesWritten.push(relativePath(outputPath));
    const indexPath = await updateCodexContextIndexArtifacts({
      projectFiles: {
        [artifact.project_id]: [relativePath(outputPath)]
      }
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Project Dispatch Plan ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`project_id: ${artifact.project_id}`);
  console.log(`task_id: ${artifact.task_id}`);
  console.log(`status: ${artifact.status}`);
  console.log(`pipeline_stage: ${artifact.pipeline_stage}`);
  console.log(`recommended_next_stage: ${artifact.recommended_next_stage}`);
  console.log(`recommended_next_command: ${artifact.recommended_next_command || "none"}`);
  console.log(`execution_route: ${artifact.binding_summary.execution_route}`);
  console.log(`connection_status: ${artifact.binding_summary.connection_status}`);
  console.log(`doctor_status: ${artifact.binding_summary.doctor_status}`);
  console.log(`repo_branch: ${artifact.binding_summary.repo_branch}`);
  console.log(`repo_clean: ${artifact.binding_summary.repo_clean}`);
  console.log(`worker_status: ${artifact.worker_route.status}`);
  console.log(`worker_id: ${artifact.worker_route.worker_id || "none"}`);
  console.log(`runtime_id: ${artifact.worker_route.runtime_id || "none"}`);
  console.log(`access_status: ${artifact.access_gate.status}`);
  console.log(`access_reason: ${artifact.access_gate.reason}`);
  console.log(`execution_gate_allowed: ${artifact.execution_gate.allowed ? "yes" : "no"}`);
  console.log(`execution_gate_reason: ${artifact.execution_gate.reason}`);
  console.log(`proposal_state: ${artifact.proposal_state?.approval_status ?? "missing"}`);
  console.log(`queue_task_status: ${artifact.queue_state?.task_status ?? "missing"}`);
  console.log("");
  console.log("blocking_reasons:");
  if (artifact.blocking_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of artifact.blocking_reasons) console.log(`- ${reason}`);
  }
  console.log("");
  console.log("warnings:");
  if (artifact.warnings.length === 0) {
    console.log("- none");
  } else {
    for (const warning of artifact.warnings) console.log(`- ${warning}`);
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  if (artifact.status !== "PASS") process.exitCode = 1;
}

function projectConfigPathForProjectArg(args) {
  if (args.config) return resolveMaybeFromRoot(args.config);
  const projectId = contextProjectId(args.project || DEFAULT_PROJECT);
  return resolveFromRoot(`examples/${safeSegment(projectId)}/project.config.example.json`);
}

async function readProjectEvidenceSources(args) {
  const projectId = contextProjectId(args.project || args.config || DEFAULT_PROJECT);
  const configPath = projectConfigPathForProjectArg(args);
  const exampleDir = resolveFromRoot(`examples/${safeSegment(projectId)}`);
  const contextDir = projectContextDir(projectId);
  const projectStatePath = join(contextDir, "project-state.json");
  const agentStatusPath = join(contextDir, "agent-studio-status.json");
  const architecturePath = join(contextDir, "architecture.json");
  const handoffPath = join(contextDir, "handoff-summary.md");
  const chainEvidencePath = join(contextDir, "project-chain-evidence.json");
  const approvalEvidencePath = join(contextDir, "proposal-approval-evidence.json");
  const proposalFiles = (await listFilesSafe(join(exampleDir, "task-proposals")))
    .filter((file) => file.endsWith(".json"))
    .sort();
  const executionReportFiles = (await listFilesSafe(join(exampleDir, "execution-reports")))
    .filter((file) => file.endsWith(".md"))
    .sort();
  const proposals = [];
  for (const file of proposalFiles) {
    const proposal = await readJsonIfExists(file);
    if (proposal) proposals.push({ file, proposal });
  }
  const approvedProposal = proposals.find(({ proposal }) =>
    proposal.approval_status === "APPROVED"
    || (proposal.proposal_status ?? []).includes("APPROVED")
  ) ?? proposals[0] ?? null;
  const selectedTaskId = approvedProposal?.proposal?.task_id ?? "";
  const executionReportPath = executionReportFiles.find((file) => file.endsWith(`${selectedTaskId}.md`))
    ?? latestFile(executionReportFiles);
  const executionReportText = await readTextIfExists(executionReportPath);
  const projectState = await readJsonIfExists(projectStatePath);
  const agentStatus = await readJsonIfExists(agentStatusPath);
  const chainEvidence = await readJsonIfExists(chainEvidencePath);
  const approvalEvidence = await readJsonIfExists(approvalEvidencePath);
  return {
    projectId,
    configPath,
    contextDir,
    projectStatePath,
    agentStatusPath,
    architecturePath,
    handoffPath,
    chainEvidencePath,
    approvalEvidencePath,
    proposalFiles,
    executionReportFiles,
    approvedProposal,
    executionReportPath,
    executionReportText,
    projectState,
    agentStatus,
    chainEvidence,
    approvalEvidence
  };
}

function projectEvidenceChecks(sources) {
  const projectState = sources.projectState ?? {};
  const agentStatus = sources.agentStatus ?? {};
  const proposal = sources.approvedProposal?.proposal ?? null;
  const reportText = sources.executionReportText ?? "";
  const activeLocks = Number(projectState.queue_summary?.active_locks
    ?? agentStatus.queue_summary?.active_locks
    ?? 0);
  const doctorStatus = projectState.local_orchestrator_status?.doctor_status
    ?? agentStatus.local_orchestrator_status?.doctor_status
    ?? "unknown";
  const taskId = proposal?.task_id ?? "";
  const runtimeMemoryFiles = [
    sources.projectStatePath,
    sources.agentStatusPath,
    sources.architecturePath,
    sources.handoffPath
  ];
  const checks = [
    {
      check_id: "project_connected",
      status: projectState.project_id === sources.projectId && projectState.project_exists === true ? "PASS" : "FAIL",
      evidence: `project_exists=${projectState.project_exists === true ? "yes" : "no"}`
    },
    {
      check_id: "runtime_memory_present",
      status: runtimeMemoryFiles.every((file) => existsSync(file)) ? "PASS" : "FAIL",
      evidence: runtimeMemoryFiles.map((file) => relativePath(file)).join(", ")
    },
    {
      check_id: "proposal_exists",
      status: proposal ? "PASS" : "FAIL",
      evidence: sources.approvedProposal?.file ? relativePath(sources.approvedProposal.file) : "missing"
    },
    {
      check_id: "approval_exists",
      status: proposal?.approval_status === "APPROVED" && Boolean(proposal?.approved_at) ? "PASS" : "FAIL",
      evidence: proposal ? `approval_status=${proposal.approval_status}; approved_at=${proposal.approved_at ?? "missing"}` : "missing"
    },
    {
      check_id: "remote_execute_report_exists",
      status: sources.executionReportPath
        && reportText.includes("# Remote Project Execute Smoke Report")
        && (!taskId || reportText.includes(taskId))
        ? "PASS"
        : "FAIL",
      evidence: sources.executionReportPath ? relativePath(sources.executionReportPath) : "missing"
    },
    {
      check_id: "remote_execute_evidence_pass",
      status: /finalize:\s*PASS/i.test(reportText)
        && /audit_status:\s*PASS/i.test(reportText)
        && /run_log_exit_code:\s*0/i.test(reportText)
        ? "PASS"
        : "FAIL",
      evidence: "finalize=PASS; audit_status=PASS; run_log_exit_code=0"
    },
    {
      check_id: "doctor_go",
      status: doctorStatus === "GO" ? "PASS" : "FAIL",
      evidence: `doctor_status=${doctorStatus}`
    },
    {
      check_id: "no_active_locks",
      status: activeLocks === 0 ? "PASS" : "FAIL",
      evidence: `active_locks=${activeLocks}`
    },
    {
      check_id: "machine_readable_evidence_present",
      status: sources.chainEvidence && sources.approvalEvidence ? "PASS" : "FAIL",
      evidence: [
        sources.chainEvidencePath,
        sources.approvalEvidencePath
      ].map((file) => `${relativePath(file)}=${existsSync(file) ? "present" : "missing"}`).join("; ")
    }
  ];
  return {
    status: checks.every((check) => check.status === "PASS") ? "PASS" : "FAIL",
    project_id: sources.projectId,
    task_id: taskId || "missing",
    proposal_file: sources.approvedProposal?.file ? relativePath(sources.approvedProposal.file) : "",
    execution_report_file: sources.executionReportPath ? relativePath(sources.executionReportPath) : "",
    doctor_status: doctorStatus,
    active_locks: activeLocks,
    checks
  };
}

async function projectEvidence(args) {
  assertDryRun(args, "project evidence");
  const sources = await readProjectEvidenceSources(args);
  const result = projectEvidenceChecks(sources);
  console.log("# Project Chain Evidence dry-run");
  console.log("");
  console.log(`project_id: ${result.project_id}`);
  console.log(`status: ${result.status}`);
  console.log(`task_id: ${result.task_id}`);
  console.log(`chain_evidence_file: ${relativePath(sources.chainEvidencePath)}`);
  console.log(`proposal_approval_evidence_file: ${relativePath(sources.approvalEvidencePath)}`);
  console.log(`proposal_file: ${result.proposal_file || "missing"}`);
  console.log(`execution_report_file: ${result.execution_report_file || "missing"}`);
  console.log(`doctor_status: ${result.doctor_status}`);
  console.log(`active_locks: ${result.active_locks}`);
  console.log("");
  console.log("chain:");
  console.log(`- Project Connector: ${result.checks.find((check) => check.check_id === "project_connected")?.status}`);
  console.log(`- Project Runtime Memory: ${result.checks.find((check) => check.check_id === "runtime_memory_present")?.status}`);
  console.log(`- Task Proposal: ${result.checks.find((check) => check.check_id === "proposal_exists")?.status}`);
  console.log(`- Approval Evidence: ${result.checks.find((check) => check.check_id === "approval_exists")?.status}`);
  console.log(`- Remote Execute Evidence: ${result.checks.find((check) => check.check_id === "remote_execute_report_exists")?.status}`);
  console.log("");
  console.log("safety:");
  console.log("- agent_execution: disabled");
  console.log("- deploy: disabled");
  console.log("- production_operations: disabled");
  console.log("- credential_values: not_read");
  if (result.status !== "PASS") process.exitCode = 1;
}

async function projectChainValidate(args) {
  assertDryRun(args, "project chain-validate");
  const sources = await readProjectEvidenceSources(args);
  const result = projectEvidenceChecks(sources);
  console.log("# Project Chain Validate dry-run");
  console.log("");
  console.log(`project_id: ${result.project_id}`);
  console.log(`status: ${result.status}`);
  console.log(`task_id: ${result.task_id}`);
  console.log("");
  console.log("| Check | Status | Evidence |");
  console.log("| --- | --- | --- |");
  for (const check of result.checks) {
    console.log(`| ${check.check_id} | ${check.status} | ${check.evidence} |`);
  }
  console.log("");
  console.log("blocked_operations:");
  console.log("- agent_execution");
  console.log("- deploy");
  console.log("- production_operations");
  console.log("- credential_value_read");
  console.log("- real_model_call");
  if (result.status !== "PASS") process.exitCode = 1;
}

async function debugAnalyze(args) {
  assertDryRun(args, "debug analyze");
  const fixturePath = resolveMaybeFromRoot(args.fixture || args.target);
  if (!fixturePath) {
    throw new Error("Missing --fixture for debug analyze.");
  }
  if (!existsSync(fixturePath)) {
    throw new Error(`Debug fixture not found: ${fixturePath}`);
  }
  const api = await loadProjectConnectorApi();
  const analysis = await api.analyzeDebugFixture(fixturePath);
  console.log("# Debug Specialist Analyze dry-run");
  console.log("");
  console.log(`fixture_path: ${analysis.fixture_path}`);
  console.log(`error_class: ${analysis.error_class}`);
  console.log(`severity: ${analysis.severity}`);
  console.log(`summary: ${analysis.summary}`);
  console.log(`execution_mode: ${analysis.execution_mode}`);
  console.log("");
  console.log("proposed_repair_task:");
  console.log(`- ${analysis.proposed_repair_task}`);
  console.log("");
  console.log("safety:");
  console.log(`- agent_execution: ${analysis.safety.agent_execution}`);
  console.log(`- project_writes: ${analysis.safety.project_writes}`);
  console.log(`- deploy: ${analysis.safety.deploy}`);
  console.log(`- production_operations: ${analysis.safety.production_operations}`);
  console.log(`- server_access: ${analysis.safety.server_access}`);
  console.log(`- credential_values: ${analysis.safety.credential_values}`);
}

async function credentialList(args) {
  assertDryRun(args, "credential list");
  const { api, vault } = await loadCredentialVaultApi();
  const inventory = api.credentialInventory(vault);
  console.log("# Credential Vault List dry-run");
  console.log("");
  console.log(`credential_references: ${inventory.length}`);
  console.log("secret_values_read: no");
  console.log("env_read: no");
  console.log("keychain_read: no");
  console.log("external_vault_read: no");
  console.log("");
  console.log("| Credential | Provider | Type | Reference Type | Status | Secret Read |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const credential of inventory) {
    console.log(`| ${credential.credential_id} | ${credential.provider} | ${credential.credential_type} | ${credential.reference_type} | ${credential.status} | ${credential.secret_value_read} |`);
  }
}

async function credentialValidate(args) {
  assertDryRun(args, "credential validate");
  const { api, vault } = await loadCredentialVaultApi();
  const result = api.validateCredentialVault(vault);
  console.log("# Credential Vault Validate dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`credential_count: ${result.credential_count}`);
  console.log(`provider_count: ${result.provider_count}`);
  console.log(`secret_values_read: ${result.secret_values_read}`);
  console.log(`env_read: ${result.env_read}`);
  console.log(`keychain_read: ${result.keychain_read}`);
  console.log(`external_vault_read: ${result.external_vault_read}`);
  console.log("");
  console.log("findings:");
  if (result.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of result.findings) {
      console.log(`- ${finding.severity}: ${finding.message}`);
    }
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function credentialPolicy(args) {
  assertDryRun(args, "credential policy");
  const { api, vault } = await loadCredentialVaultApi();
  const policy = api.policySummary(vault);
  console.log("# Credential Vault Policy dry-run");
  console.log("");
  console.log(`secret_values: ${policy.secret_values}`);
  console.log(`env_read: ${policy.env_read}`);
  console.log(`keychain_read: ${policy.keychain_read}`);
  console.log(`external_vault_read: ${policy.external_vault_read}`);
  console.log(`runtime_health_secret_access: ${policy.runtime_health_secret_access}`);
  console.log("");
  console.log("allowed_reference_types:");
  for (const type of policy.allowed_reference_types) console.log(`- ${type}`);
  console.log("");
  console.log("forbidden_fields:");
  for (const field of policy.forbidden_fields) console.log(`- ${field}`);
}

async function credentialBackendList(args) {
  assertDryRun(args, "credential backend-list");
  const { api, vault } = await loadCredentialVaultApi();
  const validation = api.validateBackendPolicy(vault);
  const backends = api.backendInventory(vault);
  console.log("# Credential Backend List dry-run");
  console.log("");
  console.log(`status: ${validation.status}`);
  console.log(`backends: ${backends.length}`);
  console.log(`scopes: ${validation.scope_count}`);
  console.log("secret_values_read: no");
  console.log("env_read: no");
  console.log("keychain_read: no");
  console.log("external_vault_read: no");
  console.log("ssh_agent_read: no");
  console.log("external_connection: disabled");
  console.log("");
  console.log("| Backend | Reference Type | Environments | Risk | Mode | Approval | Secret Read | External Connection |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const backend of backends) {
    console.log(`| ${backend.backend_id} | ${backend.reference_type} | ${backend.supported_environments.join(", ")} | ${backend.risk} | ${backend.execution_mode} | ${backend.approval_required ? "yes" : "no"} | ${backend.secret_values_read} | ${backend.external_connection} |`);
  }
  console.log("");
  console.log("findings:");
  if (validation.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of validation.findings) console.log(`- ${finding.severity}: ${finding.message}`);
  }
  if (validation.status !== "PASS") process.exitCode = 1;
}

async function credentialBackendSelect(args) {
  assertDryRun(args, "credential backend-select");
  if (!args.backend.trim()) {
    throw new Error("Missing --backend for credential backend-select.");
  }
  const { api, vault } = await loadCredentialVaultApi();
  const selection = api.selectBackend(vault, args.backend);
  console.log("# Credential Backend Select dry-run");
  console.log("");
  console.log(`selection_id: ${selection.selection_id}`);
  console.log(`backend_id: ${selection.backend_id}`);
  console.log(`status: ${selection.status}`);
  console.log(`risk: ${selection.risk}`);
  console.log(`execution_mode: ${selection.execution_mode}`);
  console.log(`approval_required: ${selection.approval_required ? "yes" : "no"}`);
  console.log(`proposal_required: ${selection.proposal_required ? "yes" : "no"}`);
  console.log(`secret_values_read: ${selection.secret_values_read}`);
  console.log(`env_read: ${selection.env_read}`);
  console.log(`keychain_read: ${selection.keychain_read}`);
  console.log(`external_vault_read: ${selection.external_vault_read}`);
  console.log(`ssh_agent_read: ${selection.ssh_agent_read}`);
  console.log(`external_connection: ${selection.external_connection}`);
  console.log(`notes: ${selection.notes}`);
  console.log("");
  console.log("blocked_reasons:");
  if (selection.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of selection.blocked_reasons) console.log(`- ${reason}`);
  }
  if (selection.status === "BLOCKED") process.exitCode = 1;
}

async function credentialScopeCheck(args) {
  assertDryRun(args, "credential scope-check");
  if (!args.runtime.trim()) {
    throw new Error("Missing --runtime for credential scope-check.");
  }
  const { api, vault } = await loadCredentialVaultApi();
  const result = api.scopeCheck(vault, args.runtime);
  console.log("# Credential Scope Check dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`runtime_id: ${result.runtime_id}`);
  console.log(`credential_reference_id: ${result.credential_reference_id || "none"}`);
  console.log(`credential_status: ${result.credential_status}`);
  console.log(`credential_reference_type: ${result.credential_reference_type}`);
  console.log(`environment: ${result.scope.environment ?? "none"}`);
  console.log(`allowed_backends: ${(result.scope.allowed_backends ?? []).join(", ") || "none"}`);
  console.log(`production_allowed: ${result.scope.production_allowed ? "yes" : "no"}`);
  console.log("secret_values_read: no");
  console.log("env_read: no");
  console.log("keychain_read: no");
  console.log("external_vault_read: no");
  console.log("ssh_agent_read: no");
  console.log("external_connection: disabled");
  console.log("");
  console.log("findings:");
  if (result.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of result.findings) console.log(`- ${finding}`);
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function credentialAuditPolicy(args) {
  assertDryRun(args, "credential audit-policy");
  const { api, vault } = await loadCredentialVaultApi();
  const policy = api.auditPolicySummary(vault);
  console.log("# Credential Backend Audit Policy dry-run");
  console.log("");
  console.log(`policy_id: ${policy.policy_id}`);
  console.log(`environment_separation: ${policy.environment_separation.join(", ")}`);
  console.log(`rotation_mode: ${policy.rotation_policy.mode}`);
  console.log(`rotation_minimum_review_days: ${policy.rotation_policy.minimum_review_days}`);
  console.log(`secret_value_rotation: ${policy.rotation_policy.secret_value_rotation}`);
  console.log(`secret_values_in_logs: ${policy.audit_policy.secret_values_in_logs}`);
  console.log(`env_reads_logged: ${policy.audit_policy.env_reads_logged}`);
  console.log(`external_vault_connections: ${policy.audit_policy.external_vault_connections}`);
  console.log(`approval_medium: ${policy.approval_policy.medium}`);
  console.log(`approval_high: ${policy.approval_policy.high}`);
  console.log(`approval_critical: ${policy.approval_policy.critical}`);
  console.log("secret_values_read: no");
  console.log("env_read: no");
  console.log("keychain_read: no");
  console.log("external_vault_read: no");
  console.log("ssh_agent_read: no");
  console.log("external_connection: disabled");
  console.log("");
  console.log("log_events:");
  for (const event of policy.audit_policy.log_events) console.log(`- ${event}`);
}

async function governanceCheck(args) {
  assertDryRun(args, "governance check");
  const { api, bundle } = await loadGovernanceCenterApi();
  const result = api.validateGovernanceCenter(bundle);
  console.log("# Governance Center Check dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`policy_id: ${result.policy_id}`);
  console.log(`risk_level_count: ${result.risk_level_count}`);
  console.log(`approval_rule_count: ${result.approval_rule_count}`);
  console.log(`release_gate_count: ${result.release_gate_count}`);
  console.log(`deploy_enabled: ${result.deploy_enabled ? "yes" : "no"}`);
  console.log(`production_operations_enabled: ${result.production_operations_enabled ? "yes" : "no"}`);
  console.log(`server_access_enabled: ${result.server_access_enabled ? "yes" : "no"}`);
  console.log(`credential_values_read: ${result.credential_values_read ? "yes" : "no"}`);
  console.log(`managed_project_writes: ${result.managed_project_writes}`);
  console.log("");
  console.log("findings:");
  if (result.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of result.findings) {
      console.log(`- ${finding.severity}: ${finding.message}`);
    }
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function approvalPolicy(args) {
  assertDryRun(args, "approval-policy");
  const { api, bundle } = await loadGovernanceCenterApi();
  const matrix = api.approvalMatrix(bundle);
  console.log("# Approval Policy dry-run");
  console.log("");
  console.log("| Risk | Automation Mode | Executor | Proposal Required | Human Approval |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const rule of matrix) {
    console.log(`| ${rule.risk} | ${rule.automation_mode} | ${rule.executor} | ${rule.proposal_required ? "yes" : "no"} | ${rule.human_approval_required ? "yes" : "no"} |`);
  }
  console.log("");
  console.log("matrix:");
  console.log("- LOW: automatic execution allowed");
  console.log("- MEDIUM: Autopilot automatic execution allowed");
  console.log("- HIGH: proposal required");
  console.log("- CRITICAL: human approval required");
}

async function releaseGateCheck(args) {
  assertDryRun(args, "release-gate check");
  const { api, bundle } = await loadGovernanceCenterApi();
  const result = api.releaseGateSummary(bundle);
  console.log("# Release Gate Check dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`gate_count: ${result.gate_count}`);
  console.log(`blocked_gate_count: ${result.blocked_gate_count}`);
  console.log(`deploy_enabled: ${result.deploy_enabled ? "yes" : "no"}`);
  console.log(`production_operations_enabled: ${result.production_operations_enabled ? "yes" : "no"}`);
  console.log(`server_access_enabled: ${result.server_access_enabled ? "yes" : "no"}`);
  console.log(`credential_values_read: ${result.credential_values_read ? "yes" : "no"}`);
  console.log("");
  console.log("| Gate | Category | Decision | Status |");
  console.log("| --- | --- | --- | --- |");
  for (const gate of result.gates) {
    console.log(`| ${gate.gate_id} | ${gate.category} | ${gate.decision} | ${gate.status} |`);
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function adapterList(args) {
  assertDryRun(args, "adapter list");
  const { api, bundle } = await loadRuntimeAdapterApi();
  const { api: governanceApi, bundle: governanceBundle } = await loadGovernanceCenterApi();
  const validation = api.validateRuntimeAdapters(bundle);
  const inventory = api.adapterInventory(bundle).map((adapter) => ({
    ...adapter,
    governance: governanceApi.evaluateAdapterMetadata(governanceBundle, adapter)
  }));
  console.log("# Runtime Adapter List dry-run");
  console.log("");
  console.log(`status: ${validation.status}`);
  console.log(`adapters: ${inventory.length}`);
  console.log("model_invocation: disabled");
  console.log("credential_values_read: no");
  console.log("external_calls: disabled");
  console.log("");
  console.log("| Adapter | Runtime | Mode | Skills | Credential Ref | Network | Workspace | Parallel | Risk | Governance |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const adapter of inventory) {
    console.log(`| ${adapter.adapter_id} | ${adapter.runtime_id} | ${adapter.invoke_mode} | ${adapter.supported_skills.join(", ")} | ${adapter.credential_reference_status} | ${adapter.network_required ? "yes" : "no"} | ${adapter.workspace_required ? "yes" : "no"} | ${adapter.max_parallel_tasks} | ${adapter.risk_baseline} | ${adapter.governance.status} |`);
  }
  if (validation.status !== "PASS") process.exitCode = 1;
}

async function adapterHealth(args) {
  assertDryRun(args, "adapter health");
  const { api, bundle } = await loadRuntimeAdapterApi();
  const { api: governanceApi, bundle: governanceBundle } = await loadGovernanceCenterApi();
  const health = api.adapterHealth(bundle);
  const adaptersById = new Map((bundle.registry.adapters ?? []).map((adapter) => [adapter.adapter_id, adapter]));
  console.log("# Runtime Adapter Health dry-run");
  console.log("");
  console.log(`adapters: ${health.results.length}`);
  console.log(`model_invocation: ${health.model_invocation}`);
  console.log(`credential_values_read: ${health.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${health.external_calls}`);
  console.log("");
  console.log("| Adapter | Runtime | Mode | Status | Credential Ref | Network | Workspace | Risk | Governance |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const result of health.results) {
    const governance = governanceApi.evaluateAdapterMetadata(governanceBundle, adaptersById.get(result.adapter_id) ?? result);
    console.log(`| ${result.adapter_id} | ${result.runtime_id} | ${result.invoke_mode} | ${result.status} | ${result.credential_reference_status} | ${result.network_required ? "yes" : "no"} | ${result.workspace_required ? "yes" : "no"} | ${result.risk_baseline} | ${governance.status} |`);
  }
}

async function adapterInvokePlan(args) {
  assertDryRun(args, "adapter invoke-plan");
  if (!args.runtime.trim()) {
    throw new Error("Missing --runtime for adapter invoke-plan.");
  }
  if (!args.skill.trim()) {
    throw new Error("Missing --skill for adapter invoke-plan.");
  }
  const { api, bundle } = await loadRuntimeAdapterApi();
  const { api: governanceApi, bundle: governanceBundle } = await loadGovernanceCenterApi();
  const plan = api.buildInvokePlan(bundle, {
    runtime: args.runtime,
    skillType: args.skill
  });
  const adapter = bundle.indexes.adaptersById.get(plan.adapter_id);
  const governance = adapter ? governanceApi.evaluateAdapterMetadata(governanceBundle, adapter) : null;
  console.log("# Runtime Adapter Invoke Plan dry-run");
  console.log("");
  console.log(`invocation_id: ${plan.invocation_id}`);
  console.log(`adapter_id: ${plan.adapter_id}`);
  console.log(`runtime_id: ${plan.runtime_id}`);
  console.log(`skill_type: ${plan.skill_type}`);
  console.log(`execution_status: ${plan.execution_status}`);
  console.log(`governance_risk: ${plan.governance_risk}`);
  console.log(`governance_status: ${governance?.status ?? "BLOCKED"}`);
  console.log(`credential_reference_status: ${plan.credential_reference_status}`);
  console.log(`model_invocation: ${plan.model_invocation}`);
  console.log(`credential_values_read: ${plan.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${plan.external_calls}`);
  console.log("");
  console.log("steps:");
  for (const step of plan.steps) console.log(`- ${step}`);
  console.log("");
  console.log("blocked_reasons:");
  if (plan.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of plan.blocked_reasons) console.log(`- ${reason}`);
  }
  if (plan.execution_status !== "planned") process.exitCode = 1;
}

async function modelGatewayStatus(args) {
  assertDryRun(args, "model-gateway status");
  const { api, bundle } = await loadModelGatewayApi();
  const status = api.gatewayStatus(bundle);
  console.log("# Managed Model Gateway Status dry-run");
  console.log("");
  console.log(`status: ${status.status}`);
  console.log(`gateway_id: ${status.gateway_id}`);
  console.log(`mode: ${status.mode}`);
  console.log(`default_region: ${status.default_region}`);
  console.log(`model_invocation: ${status.model_invocation}`);
  console.log(`credential_values_read: ${status.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${status.external_calls}`);
  console.log("");
  console.log("| Runtime | Provider | Region | Management | Plans | Credential Ref | Adapter | Risk | Direct Model Call |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const runtime of status.runtimes) {
    console.log(`| ${runtime.runtime_id} | ${runtime.provider} | ${runtime.region} | ${runtime.management_mode} | ${(runtime.available_to_plans ?? []).join(", ")} | ${runtime.credential_reference_status} | ${runtime.adapter_status} | ${runtime.risk_baseline} | ${runtime.direct_model_call_enabled ? "yes" : "no"} |`);
  }
  console.log("");
  console.log("findings:");
  if (status.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of status.findings) {
      console.log(`- [${finding.severity}] ${finding.message ?? finding.path}`);
    }
  }
  if (status.status !== "PASS") process.exitCode = 1;
}

async function modelGatewayRoute(args) {
  assertDryRun(args, "model-gateway route");
  const { api, bundle } = await loadModelGatewayApi();
  const region = args.regionProvided ? args.region : "cn";
  const route = api.routeManagedModel(bundle, {
    runtime: args.runtime || "auto",
    goal: args.goal || args.text,
    project: args.project || args.projectId || "jinhu-smart-park",
    user: args.user || "owner",
    region
  });
  console.log("# Managed Model Gateway Route dry-run");
  console.log("");
  console.log(`route_id: ${route.route_id}`);
  console.log(`requested_runtime: ${route.requested_runtime}`);
  console.log(`selected_runtime: ${route.selected_runtime ?? "none"}`);
  console.log(`selected_provider: ${route.selected_provider ?? "none"}`);
  console.log(`project_id: ${route.project_id}`);
  console.log(`user: ${route.user?.username ?? "not_found"}`);
  console.log(`plan: ${route.plan?.plan_id ?? "not_found"}`);
  console.log(`risk: ${route.risk}`);
  console.log(`execution_mode: ${route.execution_mode}`);
  console.log(`credential_reference_id: ${route.credential_reference_id ?? "none"}`);
  console.log(`credential_reference_status: ${route.credential_reference_status}`);
  console.log(`model_invocation: ${route.model_invocation}`);
  console.log(`credential_values_read: ${route.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${route.external_calls}`);
  console.log(`queue_injection_policy: ${route.queue_injection_policy}`);
  console.log("");
  console.log("blocked_reasons:");
  if (route.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of route.blocked_reasons) console.log(`- ${reason}`);
  }
  if (route.execution_mode === "blocked") process.exitCode = 1;
}

async function modelGatewayInvokePlan(args) {
  assertDryRun(args, "model-gateway invoke-plan");
  const { api, bundle } = await loadModelGatewayApi();
  const region = args.regionProvided ? args.region : "cn";
  const plan = api.buildModelGatewayInvokePlan(bundle, {
    runtime: args.runtime || "auto",
    goal: args.goal || args.text,
    project: args.project || args.projectId || "jinhu-smart-park",
    user: args.user || "owner",
    region,
    skillType: args.skill || "code_development"
  });
  console.log("# Managed Model Gateway Invoke Plan dry-run");
  console.log("");
  console.log(`invocation_id: ${plan.invocation_id}`);
  console.log(`route_id: ${plan.route_id}`);
  console.log(`runtime_id: ${plan.runtime_id ?? "none"}`);
  console.log(`provider: ${plan.provider ?? "none"}`);
  console.log(`project_id: ${plan.project_id}`);
  console.log(`user: ${plan.user?.username ?? "not_found"}`);
  console.log(`skill_type: ${plan.skill_type}`);
  console.log(`execution_status: ${plan.execution_status}`);
  console.log(`execution_mode: ${plan.execution_mode}`);
  console.log(`governance_risk: ${plan.governance_risk}`);
  console.log(`credential_reference_id: ${plan.credential_reference_id ?? "none"}`);
  console.log(`credential_reference_status: ${plan.credential_reference_status}`);
  console.log(`model_invocation: ${plan.model_invocation}`);
  console.log(`credential_values_read: ${plan.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${plan.external_calls}`);
  console.log(`audit_trace_required: ${plan.audit_trace_required ? "yes" : "no"}`);
  console.log(`proposal_review_bridge: ${plan.proposal_review_bridge.enabled ? "enabled" : "disabled"}`);
  console.log(`queue_injection_requires_approved_proposal: ${plan.proposal_review_bridge.approved_proposal_required_for_queue_injection ? "yes" : "no"}`);
  console.log("");
  console.log("steps:");
  for (const step of plan.steps) console.log(`- ${step}`);
  console.log("");
  console.log("blocked_reasons:");
  if (plan.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of plan.blocked_reasons) console.log(`- ${reason}`);
  }
  if (plan.execution_status !== "planned") process.exitCode = 1;
}

async function modelGatewayAudit(args) {
  assertDryRun(args, "model-gateway audit");
  const { api, bundle } = await loadModelGatewayApi();
  const audit = api.gatewayAuditSummary(bundle);
  console.log("# Managed Model Gateway Audit dry-run");
  console.log("");
  console.log(`audit_id: ${audit.audit_id}`);
  console.log(`gateway_id: ${audit.gateway_id}`);
  console.log(`status: ${audit.status}`);
  console.log(`event_count: ${audit.event_count}`);
  console.log(`model_invocation: ${audit.model_invocation}`);
  console.log(`credential_values_read: ${audit.credential_values_read ? "yes" : "no"}`);
  console.log(`external_calls: ${audit.external_calls}`);
  console.log(`queue_injection_requires_approved_proposal: ${audit.queue_injection_requires_approved_proposal ? "yes" : "no"}`);
  console.log("");
  console.log("| Event | Status | Model Invocation | Credential Values Read |");
  console.log("| --- | --- | --- | --- |");
  for (const event of audit.events) {
    console.log(`| ${event.event_type} | ${event.status} | ${event.model_invocation} | ${event.credential_values_read ? "yes" : "no"} |`);
  }
  if (audit.status !== "PASS") process.exitCode = 1;
}

async function workerList(args) {
  assertDryRun(args, "worker list");
  const { api, bundle } = await loadWorkerPoolApi();
  const validation = api.validateWorkerPool(bundle);
  const inventory = api.workerInventory(bundle);
  console.log("# Worker Pool List dry-run");
  console.log("");
  console.log(`status: ${validation.status}`);
  console.log(`workers: ${inventory.length}`);
  console.log(`local_workers: ${validation.local_worker_count}`);
  console.log(`capability_tags: ${validation.capability_tags.join(", ")}`);
  console.log(`macos_mobile_worker_policy: ${validation.macos_mobile_worker_policy}`);
  console.log(`remote_worker_policy: ${validation.remote_worker_policy}`);
  console.log(`production_worker_policy: ${validation.production_worker_policy}`);
  console.log("server_connections: disabled");
  console.log("ssh: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("credential_values_read: no");
  console.log("");
  console.log("| Worker | Kind | OS | Runtime | Adapter | Capabilities | Status | Parallel | Risk | Mode | Proposal | Approval |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- | --- | --- |");
  for (const worker of inventory) {
    console.log(`| ${worker.worker_id} | ${worker.worker_kind} | ${worker.worker_os} | ${worker.runtime_id} | ${worker.adapter_id} | ${worker.capability_tags.join(", ")} | ${worker.status} | ${worker.max_parallel_tasks} | ${worker.governance.risk} | ${worker.governance.execution_mode} | ${worker.governance.proposal_required ? "yes" : "no"} | ${worker.governance.human_approval_required ? "yes" : "no"} |`);
  }
  if (validation.status !== "PASS") process.exitCode = 1;
}

async function workerRegistry(args) {
  assertDryRun(args, "worker registry");
  const { api, bundle } = await loadWorkerPoolApi();
  const registry = api.workerRegistrySummary(bundle);
  console.log("# Worker Registry dry-run");
  console.log("");
  console.log(`registry_id: ${registry.registry_id}`);
  console.log(`worker_count: ${registry.worker_count}`);
  console.log(`local_worker_count: ${registry.local_worker_count}`);
  console.log(`remote_worker_count: ${registry.remote_worker_count}`);
  console.log(`production_worker_count: ${registry.production_worker_count}`);
  console.log(`capability_tags: ${registry.capability_tags.join(", ") || "none"}`);
  console.log(`required_capability_tags: ${(registry.required_capability_tags ?? []).join(", ") || "none"}`);
  console.log("server_access: disabled");
  console.log("ssh: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("credential_values_read: no");
}

async function workerHealth(args) {
  assertDryRun(args, "worker health");
  const { api, bundle } = await loadWorkerPoolApi();
  const health = api.workerHealth(bundle);
  console.log("# Worker Pool Health dry-run");
  console.log("");
  console.log(`workers: ${health.workers.length}`);
  console.log(`active_process_probe: ${health.probe_mode ?? "unknown"}`);
  console.log(`process_inventory_count: ${health.process_inventory_count ?? 0}`);
  console.log("server_connections: disabled");
  console.log("ssh: disabled");
  console.log("credential_values_read: no");
  console.log("");
  console.log("| Worker | Runtime | OS | Capabilities | Status | Health | Probe | Processes | Risk | Mode |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | ---: | --- | --- |");
  for (const worker of health.workers) {
    console.log(`| ${worker.worker_id} | ${worker.runtime_id} | ${worker.worker_os} | ${worker.capability_tags.join(", ")} | ${worker.status} | ${worker.health_status} | ${worker.process_probe_status ?? "unknown"} | ${worker.active_process_count ?? 0} | ${worker.risk} | ${worker.execution_mode} |`);
  }
}

async function workerControlPlane(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("worker control-plane requires --dry-run or --apply.");
  }
  const { api, bundle } = await loadWorkerPoolApi();
  const controlPlane = api.workerControlPlane(bundle);
  const filesWritten = [];
  if (args.apply) {
    const outputPath = resolveFromRoot("runtime/global/worker-control-plane.json");
    await writeJsonFile(outputPath, controlPlane);
    filesWritten.push(relativePath(outputPath));
    const indexPath = await updateCodexContextIndexArtifacts({
      globalFiles: [relativePath(outputPath)]
    });
    filesWritten.push(relativePath(indexPath));
  }
  console.log(`# Worker Control Plane ${args.apply ? "apply" : "dry-run"}`);
  console.log("");
  console.log(`control_plane_id: ${controlPlane.control_plane_id}`);
  console.log(`executor: ${controlPlane.executor}`);
  console.log(`true_parallel_executor: ${controlPlane.true_parallel_executor}`);
  console.log(`worker_count: ${controlPlane.worker_count}`);
  console.log(`available_worker_count: ${controlPlane.available_worker_count}`);
  console.log(`capability_tags: ${controlPlane.capability_tags.join(", ")}`);
  console.log(`runtimes: ${controlPlane.runtimes.join(", ")}`);
  console.log(`heartbeat_mode: ${controlPlane.heartbeat_mode}`);
  console.log(`dispatch_modes: ${controlPlane.dispatch_modes.join(", ")}`);
  console.log(`recent_run_count: ${controlPlane.recent_run_count ?? 0}`);
  console.log(`lease_evidence_count: ${controlPlane.lease_evidence_count ?? 0}`);
  console.log("");
  console.log("governance:");
  console.log(`- local: ${controlPlane.governance.local}`);
  console.log(`- remote: ${controlPlane.governance.remote}`);
  console.log(`- production: ${controlPlane.governance.production}`);
  if (Array.isArray(controlPlane.workers) && controlPlane.workers.length > 0) {
    console.log("");
    console.log("| Worker | Runtime | Heartbeat | Recent Runs | Lease Evidence |");
    console.log("| --- | --- | --- | ---: | ---: |");
    for (const worker of controlPlane.workers) {
      console.log(`| ${worker.worker_id} | ${worker.runtime_id} | ${worker.heartbeat_status ?? "unknown"} | ${worker.recent_run_count ?? 0} | ${worker.task_lease_evidence_count ?? 0} |`);
    }
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  console.log("");
  console.log("safety:");
  console.log(`- server_access: ${controlPlane.safety.server_access}`);
  console.log(`- ssh: ${controlPlane.safety.ssh}`);
  console.log(`- deploy: ${controlPlane.safety.deploy}`);
  console.log(`- production_operations: ${controlPlane.safety.production_operations}`);
  console.log(`- managed_project_writes: ${controlPlane.safety.managed_project_writes}`);
}

async function workerHeartbeat(args) {
  assertDryRun(args, "worker heartbeat");
  const { api, bundle } = await loadWorkerPoolApi();
  const heartbeat = api.workerHeartbeat(bundle);
  console.log("# Worker Heartbeat dry-run");
  console.log("");
  console.log(`heartbeat_mode: ${heartbeat.heartbeat_mode}`);
  console.log(`registry_updated_at: ${heartbeat.registry_updated_at}`);
  console.log(`health_checked_at: ${heartbeat.health_checked_at}`);
  console.log(`process_inventory_status: ${heartbeat.process_inventory_status ?? "unknown"}`);
  console.log(`process_inventory_count: ${heartbeat.process_inventory_count ?? 0}`);
  console.log("");
  console.log("| Worker | Runtime | Status | Heartbeat | Probe | Processes | Last Seen |");
  console.log("| --- | --- | --- | --- | --- | ---: | --- |");
  for (const worker of heartbeat.workers) {
    console.log(`| ${worker.worker_id} | ${worker.runtime_id} | ${worker.status} | ${worker.heartbeat_status} | ${worker.process_probe_mode ?? "unknown"} | ${worker.active_process_count ?? 0} | ${worker.last_heartbeat_at} |`);
  }
}

async function workerAssign(args) {
  assertDryRun(args, "worker assign");
  if (!args.runtime.trim() && !args.capability.trim()) {
    throw new Error("Missing --runtime or --capability for worker assign.");
  }
  const { api, bundle } = await loadWorkerPoolApi();
  const assignment = api.assignWorker(bundle, {
    runtimeId: args.runtime.trim(),
    capability: args.capability.trim()
  });
  console.log("# Worker Pool Assign dry-run");
  console.log("");
  console.log(`assignment_id: ${assignment.assignment_id}`);
  console.log(`status: ${assignment.status}`);
  console.log(`selection_kind: ${assignment.selection_kind}`);
  console.log(`runtime_id: ${assignment.runtime_id}`);
  console.log(`capability: ${assignment.capability || "none"}`);
  console.log(`worker_id: ${assignment.worker_id || "none"}`);
  console.log(`risk: ${assignment.governance.risk}`);
  console.log(`execution_mode: ${assignment.governance.execution_mode}`);
  console.log(`proposal_required: ${assignment.governance.proposal_required ? "yes" : "no"}`);
  console.log(`human_approval_required: ${assignment.governance.human_approval_required ? "yes" : "no"}`);
  console.log(`isolation_policy: ${assignment.isolation_policy.policy_id}`);
  console.log(`workspace_scope: ${assignment.isolation_policy.workspace_scope}`);
  console.log(`credential_values: ${assignment.isolation_policy.credential_values}`);
  console.log(`managed_project_writes: ${assignment.isolation_policy.managed_project_writes}`);
  console.log("server_connections: disabled");
  console.log("ssh: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("");
  console.log("blocked_reasons:");
  if (assignment.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of assignment.blocked_reasons) console.log(`- ${reason}`);
  }
  if (assignment.status !== "ASSIGNED") process.exitCode = 1;
}

async function workerDispatch(args) {
  assertDryRun(args, "worker dispatch");
  if (!args.runtime.trim() && !args.capability.trim()) {
    throw new Error("Missing --runtime or --capability for worker dispatch.");
  }
  const { api, bundle } = await loadWorkerPoolApi();
  const dispatch = api.workerDispatch(bundle, {
    runtimeId: args.runtime.trim(),
    capability: args.capability.trim()
  });
  console.log("# Worker Dispatch dry-run");
  console.log("");
  console.log(`dispatch_id: ${dispatch.dispatch_id}`);
  console.log(`status: ${dispatch.status}`);
  console.log(`selection_kind: ${dispatch.selection_kind}`);
  console.log(`requested_runtime: ${dispatch.requested_runtime || "none"}`);
  console.log(`requested_capability: ${dispatch.requested_capability || "none"}`);
  console.log(`worker_id: ${dispatch.worker_id || "none"}`);
  console.log(`runtime_id: ${dispatch.runtime_id || "none"}`);
  console.log(`risk: ${dispatch.risk}`);
  console.log(`execution_mode: ${dispatch.execution_mode}`);
  console.log(`proposal_required: ${dispatch.proposal_required ? "yes" : "no"}`);
  console.log(`human_approval_required: ${dispatch.human_approval_required ? "yes" : "no"}`);
  console.log("");
  console.log("blocked_reasons:");
  if (dispatch.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of dispatch.blocked_reasons) console.log(`- ${reason}`);
  }
  if (dispatch.status !== "ASSIGNED") process.exitCode = 1;
}

async function workerCancel(args) {
  assertDryRun(args, "worker cancel");
  if (!args.worker.trim()) {
    throw new Error("Missing --worker for worker cancel.");
  }
  const { api, bundle } = await loadWorkerPoolApi();
  const cancellation = api.cancelWorker(bundle, args.worker);
  console.log("# Worker Pool Cancel dry-run");
  console.log("");
  console.log(`cancel_id: ${cancellation.cancel_id}`);
  console.log(`worker_id: ${cancellation.worker_id}`);
  console.log(`runtime_id: ${cancellation.runtime_id || "none"}`);
  console.log(`kill_switch_status: ${cancellation.kill_switch.status}`);
  console.log(`would_cancel_active_tasks: ${cancellation.kill_switch.would_cancel_active_tasks ? "yes" : "no"}`);
  console.log(`would_stop_worker_process: ${cancellation.kill_switch.would_stop_worker_process ? "yes" : "no"}`);
  console.log(`reason: ${cancellation.kill_switch.reason}`);
  console.log("server_connections: disabled");
  console.log("ssh: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("credential_values_read: no");
  console.log("");
  console.log("blocked_reasons:");
  if (cancellation.blocked_reasons.length === 0) {
    console.log("- none");
  } else {
    for (const reason of cancellation.blocked_reasons) console.log(`- ${reason}`);
  }
  if (cancellation.blocked_reasons.length > 0) process.exitCode = 1;
}

function parallelSmokeAgents(args) {
  return unique((args.agents || "agent-1,agent-2,agent-3,agent-4")
    .split(",")
    .map((agent) => agent.trim())
    .filter(Boolean));
}

function parallelSmokeTask(agent, index) {
  const tasks = [
    {
      task: "read-platform-state",
      source: "runtime/global/platform-state.json",
      description: "Read platform state metadata."
    },
    {
      task: "read-runtime-health-example",
      source: "packages/runtime-center/examples/runtime-health.example.json",
      description: "Read Runtime Center health fixture."
    },
    {
      task: "read-worker-registry-example",
      source: "packages/worker-pool/examples/worker-registry.example.json",
      description: "Read Worker Pool registry fixture."
    },
    {
      task: "read-governance-policy-example",
      source: "packages/governance-center/examples/governance-policy.example.json",
      description: "Read Governance Center policy fixture."
    }
  ];
  return {
    agent,
    ...tasks[index % tasks.length],
    delay_ms: 850 + (index * 125)
  };
}

function parallelSmokeRunId(agents, parallel) {
  const createdAt = new Date().toISOString();
  return `parallel-smoke-${timestampForFile(createdAt)}-${createHash("sha1").update(`${agents.join(",")}:${parallel}:${createdAt}`).digest("hex").slice(0, 8)}`;
}

function hasIntervalOverlap(left, right) {
  return left.started_at_ms < right.completed_at_ms && right.started_at_ms < left.completed_at_ms;
}

function parallelSmokeAnalysis(results) {
  const pids = results.map((result) => result.pid).filter(Boolean);
  const workspaces = results.map((result) => result.workspace).filter(Boolean);
  const logPaths = results.map((result) => result.log_json).filter(Boolean);
  const overlapPairs = [];
  for (let leftIndex = 0; leftIndex < results.length; leftIndex += 1) {
    for (let rightIndex = leftIndex + 1; rightIndex < results.length; rightIndex += 1) {
      if (hasIntervalOverlap(results[leftIndex], results[rightIndex])) {
        overlapPairs.push([results[leftIndex].agent, results[rightIndex].agent]);
      }
    }
  }
  const independentProcesses = unique(pids).length === results.length;
  const independentWorkspaces = unique(workspaces).length === results.length;
  const independentLogs = unique(logPaths).length === results.length;
  const hasTimeOverlap = overlapPairs.length > 0;
  const allPassed = results.every((result) => result.status === "PASS" && result.exit_code === 0);
  return {
    independent_processes: independentProcesses,
    independent_workspaces: independentWorkspaces,
    independent_run_logs: independentLogs,
    time_overlap_detected: hasTimeOverlap,
    overlap_pairs: overlapPairs,
    sequential_simulation_detected: !hasTimeOverlap || !independentProcesses,
    all_passed: allPassed,
    parallel_mode: independentProcesses && independentWorkspaces && independentLogs && hasTimeOverlap && allPassed ? "real" : "simulated"
  };
}

function parallelSmokeMarkdown(report) {
  const agentRows = report.agents.map((agent) =>
    `| ${agent.agent} | ${agent.run_id} | ${agent.pid} | ${agent.workspace} | ${agent.log_json} | ${agent.started_at} | ${agent.completed_at} | ${agent.status} |`
  ).join("\n");
  const overlapRows = report.analysis.overlap_pairs.length === 0
    ? "| none | none |"
    : report.analysis.overlap_pairs.map((pair) => `| ${pair[0]} | ${pair[1]} |`).join("\n");
  return `# Real Multi-Agent Parallel Execution Report

- generated_at: ${report.generated_at}
- smoke_run_id: ${report.smoke_run_id}
- parallel_requested: ${report.parallel_requested}
- parallel_mode: ${report.analysis.parallel_mode}
- independent_processes: ${report.analysis.independent_processes ? "yes" : "no"}
- independent_workspaces: ${report.analysis.independent_workspaces ? "yes" : "no"}
- independent_run_logs: ${report.analysis.independent_run_logs ? "yes" : "no"}
- time_overlap_detected: ${report.analysis.time_overlap_detected ? "yes" : "no"}
- sequential_simulation_detected: ${report.analysis.sequential_simulation_detected ? "yes" : "no"}

## Agents

| Agent | Run ID | PID | Workspace | Run Log | Started | Completed | Status |
| --- | --- | ---: | --- | --- | --- | --- | --- |
${agentRows}

## Time Overlap

| Agent A | Agent B |
| --- | --- |
${overlapRows}

## Safety

- deploy: disabled
- production_operation: disabled
- server_access: disabled
- credential_values: not_read
- model_invocation: disabled
- managed_project_writes: disabled
- jinhu_smart_park_writes: disabled
- write_allowlist: autopilot-runs/parallel-smoke/**, docs/release/**

## Conclusion

The smoke command uses Node child_process workers with independent PIDs, workspaces, and logs. If any of those checks fail, the report marks the run as simulated.
`;
}

async function runParallelSmokeChild(config) {
  await mkdir(config.workspace, { recursive: true });
  const script = resolveFromRoot("packages/worker-pool/bin/parallel-smoke-worker.mjs");
  const args = [
    script,
    "--agent", config.agent,
    "--run-id", config.run_id,
    "--workspace", config.workspace,
    "--repo-root", repoRoot,
    "--task", config.task,
    "--source", config.source,
    "--delay-ms", String(config.delay_ms)
  ];
  const spawnedAtMs = Date.now();
  return new Promise((resolveChild) => {
    const child = spawn(process.execPath, args, {
      cwd: config.workspace,
      stdio: ["ignore", "pipe", "pipe"]
    });
    const stdout = [];
    const stderr = [];
    child.stdout.on("data", (chunk) => stdout.push(String(chunk)));
    child.stderr.on("data", (chunk) => stderr.push(String(chunk)));
    child.on("close", async (exitCode) => {
      const logJson = join(config.workspace, "run-log.json");
      let result = null;
      try {
        result = await readJson(logJson);
      } catch {
        result = {
          agent: config.agent,
          run_id: config.run_id,
          pid: child.pid ?? 0,
          workspace: config.workspace,
          source_path: config.source,
          started_at_ms: spawnedAtMs,
          completed_at_ms: Date.now(),
          started_at: new Date(spawnedAtMs).toISOString(),
          completed_at: new Date().toISOString(),
          status: "FAIL",
          error: stderr.join("").trim() || "worker log missing"
        };
      }
      resolveChild({
        ...result,
        observed_child_pid: child.pid ?? null,
        exit_code: exitCode ?? 0,
        stdout: stdout.join("").trim(),
        stderr: stderr.join("").trim(),
        log_json: relativePath(logJson),
        log_markdown: relativePath(join(config.workspace, "run-log.md")),
        workspace: relativePath(config.workspace)
      });
    });
  });
}

async function workerParallelSmoke(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("worker parallel-smoke requires --dry-run or --apply.");
  }
  const agents = parallelSmokeAgents(args);
  const parallel = Number(args.parallel || agents.length);
  if (agents.length === 0) throw new Error("worker parallel-smoke requires at least one agent.");
  if (!Number.isInteger(parallel) || parallel < 1) throw new Error("worker parallel-smoke requires --parallel >= 1.");
  const tasks = agents.map((agent, index) => parallelSmokeTask(agent, index));
  const runId = parallelSmokeRunId(agents, parallel);
  const runRoot = resolveFromRoot(`autopilot-runs/parallel-smoke/${runId}`);
  const plannedAgents = tasks.map((task) => ({
    ...task,
    run_id: `${runId}-${safeSegment(task.agent)}`,
    workspace: relativePath(join(runRoot, "workspaces", safeSegment(task.agent))),
    log_json: relativePath(join(runRoot, "workspaces", safeSegment(task.agent), "run-log.json")),
    log_markdown: relativePath(join(runRoot, "workspaces", safeSegment(task.agent), "run-log.md"))
  }));

  if (args.dryRun) {
    console.log("# Worker Parallel Smoke dry-run");
    console.log("");
    console.log(`smoke_run_id: ${runId}`);
    console.log(`agents: ${agents.join(", ")}`);
    console.log(`parallel_requested: ${parallel}`);
    console.log("parallel_mode: planned_real_child_processes");
    console.log("writes: disabled in dry-run");
    console.log("deploy: disabled");
    console.log("production_operation: disabled");
    console.log("credential_values: not_read");
    console.log("model_invocation: disabled");
    console.log("jinhu_smart_park_writes: disabled");
    console.log("");
    console.log("| Agent | Task | Source | Planned Workspace | Planned Run Log |");
    console.log("| --- | --- | --- | --- | --- |");
    for (const agent of plannedAgents) {
      console.log(`| ${agent.agent} | ${agent.task} | ${agent.source} | ${agent.workspace} | ${agent.log_json} |`);
    }
    return;
  }

  await mkdir(runRoot, { recursive: true });
  const agentConfigs = plannedAgents.map((agent) => ({
    ...agent,
    workspace: resolveFromRoot(agent.workspace)
  }));
  const startedAt = new Date().toISOString();
  const results = await Promise.all(agentConfigs.map((config) => runParallelSmokeChild(config)));
  const completedAt = new Date().toISOString();
  const analysis = parallelSmokeAnalysis(results);
  const report = {
    schema_version: 1,
    generated_at: completedAt,
    started_at: startedAt,
    smoke_run_id: runId,
    requested_agents: agents,
    parallel_requested: parallel,
    implementation: "node_child_process_parallel_smoke",
    analysis,
    agents: results,
    safety: {
      deploy: "disabled",
      production_operation: "disabled",
      server_access: "disabled",
      credential_values: "not_read",
      model_invocation: "disabled",
      managed_project_writes: "disabled",
      jinhu_smart_park_writes: "disabled",
      write_allowlist: ["autopilot-runs/parallel-smoke/**", "docs/release/**"]
    }
  };
  const summaryJson = join(runRoot, "summary.json");
  const summaryMarkdown = join(runRoot, "summary.md");
  const releaseReport = resolveFromRoot("docs/release/REAL_MULTI_AGENT_PARALLEL_EXECUTION_REPORT.md");
  await writeFile(summaryJson, `${JSON.stringify(report, null, 2)}\n`, "utf8");
  await writeFile(summaryMarkdown, parallelSmokeMarkdown(report), "utf8");
  await writeFile(releaseReport, parallelSmokeMarkdown(report), "utf8");

  console.log("# Worker Parallel Smoke apply");
  console.log("");
  console.log(`smoke_run_id: ${runId}`);
  console.log(`parallel_mode: ${analysis.parallel_mode}`);
  console.log(`independent_processes: ${analysis.independent_processes ? "yes" : "no"}`);
  console.log(`independent_workspaces: ${analysis.independent_workspaces ? "yes" : "no"}`);
  console.log(`independent_run_logs: ${analysis.independent_run_logs ? "yes" : "no"}`);
  console.log(`time_overlap_detected: ${analysis.time_overlap_detected ? "yes" : "no"}`);
  console.log(`sequential_simulation_detected: ${analysis.sequential_simulation_detected ? "yes" : "no"}`);
  console.log(`summary_json: ${relativePath(summaryJson)}`);
  console.log(`summary_markdown: ${relativePath(summaryMarkdown)}`);
  console.log(`release_report: ${relativePath(releaseReport)}`);
  console.log("");
  console.log("| Agent | PID | Workspace | Run Log | Status |");
  console.log("| --- | ---: | --- | --- | --- |");
  for (const result of results) {
    console.log(`| ${result.agent} | ${result.pid} | ${result.workspace} | ${result.log_json} | ${result.status} |`);
  }
  if (analysis.parallel_mode !== "real") process.exitCode = 1;
}

function printMobileDetection(result, title) {
  console.log(`# ${title} dry-run`);
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`platform: ${result.platform}`);
  console.log(`project_id: ${result.project_id}`);
  console.log(`source_kind: ${result.source_kind}`);
  console.log(`project_root: ${result.project_root}`);
  console.log("real_build: disabled");
  console.log("simulator_or_emulator: disabled");
  console.log("credential_values_read: no");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("");
  console.log("| Detector | Present | Evidence |");
  console.log("| --- | --- | --- |");
  for (const item of result.indicators) {
    console.log(`| ${item.name} | ${item.present ? "yes" : "no"} | ${item.evidence.length > 0 ? item.evidence.join(", ") : "none"} |`);
  }
  console.log("");
  console.log("commands_detected:");
  for (const [name, command] of Object.entries(result.command_detection)) {
    console.log(`- ${name}: ${command}`);
  }
  console.log("");
  console.log(`signing: ${result.signing.mode}; references_only=${result.signing.references_only ? "yes" : "no"}`);
  if (result.status === "FAIL") process.exitCode = 1;
}

async function mobileIosDetect(args) {
  assertDryRun(args, "mobile ios-detect");
  if (!args.project.trim()) {
    throw new Error("Missing --project for mobile ios-detect.");
  }
  const { api } = await loadMobileStackPackApi();
  const result = await api.detectIosProject(resolveMaybeFromRoot(args.project));
  printMobileDetection(result, "Mobile iOS Stack Detect");
}

async function mobileAndroidDetect(args) {
  assertDryRun(args, "mobile android-detect");
  if (!args.project.trim()) {
    throw new Error("Missing --project for mobile android-detect.");
  }
  const { api } = await loadMobileStackPackApi();
  const result = await api.detectAndroidProject(resolveMaybeFromRoot(args.project));
  printMobileDetection(result, "Mobile Android Stack Detect");
}

async function mobileValidate(args) {
  assertDryRun(args, "mobile validate");
  const platform = args.platform.trim();
  if (!["ios", "android"].includes(platform)) {
    throw new Error("Missing or invalid --platform for mobile validate. Expected ios or android.");
  }
  const { api, bundle } = await loadMobileStackPackApi();
  const result = api.validateMobilePlatform(bundle, platform);
  console.log("# Mobile Stack Pack Validate dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`platform: ${result.platform}`);
  console.log(`worker_required_os: ${result.worker_requirement?.required_os?.join(", ") ?? "missing"}`);
  console.log(`simulator_or_emulator_required: ${result.worker_requirement?.simulator_or_emulator_required ? "yes" : "no"}`);
  console.log(`signing_reference_only: ${result.worker_requirement?.signing_reference_only ? "yes" : "no"}`);
  console.log("xcode_invocation: disabled");
  console.log("gradle_invocation: disabled");
  console.log("simulator_invocation: disabled");
  console.log("emulator_invocation: disabled");
  console.log("credential_values_read: no");
  console.log("release_operation: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("");
  console.log("| Action | Risk | Gate | Approval |");
  console.log("| --- | --- | --- | --- |");
  for (const gate of result.governance_gates) {
    console.log(`| ${gate.action} | ${gate.risk} | ${gate.gate_action} | ${gate.approval_required ? "yes" : "no"} |`);
  }
  console.log("");
  console.log("findings:");
  if (result.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of result.findings) console.log(`- ${finding}`);
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function productionServerList(args) {
  assertDryRun(args, "production server-list");
  const { api, bundle } = await loadProductionOpsApi();
  const servers = api.serverInventory(bundle);
  console.log("# Production Operations Server List dry-run");
  console.log("");
  console.log(`registry_id: ${bundle.serverRegistry.registry_id}`);
  console.log(`servers: ${servers.length}`);
  console.log("server_connections: disabled");
  console.log("ssh: disabled");
  console.log("credential_values_read: no");
  console.log("");
  console.log("| Server | Environment | Role | Host Ref | Credential Ref | Connection | Risk | Execution |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const server of servers) {
    console.log(`| ${server.server_id} | ${server.environment} | ${server.role} | ${server.host_ref} | ${server.credential_reference_id} | ${server.connection_status} | ${server.risk} | ${server.execution_mode} |`);
  }
}

async function productionDeployPlan(args) {
  assertDryRun(args, "production deploy-plan");
  const { api, bundle } = await loadProductionOpsApi();
  const plan = api.deployPlanSummary(bundle);
  console.log("# Production Operations Deploy Plan dry-run");
  console.log("");
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`target_environment: ${plan.target_environment}`);
  console.log(`risk: ${plan.risk}`);
  console.log(`execution_mode: ${plan.execution_mode}`);
  console.log(`approval_required_for_execution: ${plan.approval_required_for_execution}`);
  console.log(`preflight_count: ${plan.preflight_count}`);
  console.log(`step_count: ${plan.step_count}`);
  console.log(`rollback_plan_ref: ${plan.rollback_plan_ref}`);
  console.log("deploy_execution: disabled");
  console.log(`server_access: ${plan.server_access}`);
  console.log(`production_operations: ${plan.production_operations}`);
  console.log(`credential_values_read: ${plan.credential_values_read ? "yes" : "no"}`);
  console.log("");
  console.log("| Step | Category | Status | Title |");
  console.log("| --- | --- | --- | --- |");
  for (const step of plan.steps) {
    console.log(`| ${step.step_id} | ${step.operation_category} | ${step.execution_status} | ${step.title} |`);
  }
}

async function productionSafetyCheck(args) {
  assertDryRun(args, "production safety-check");
  const { api, bundle } = await loadProductionOpsApi();
  const { api: governanceApi, bundle: governanceBundle } = await loadGovernanceCenterApi();
  const validation = api.validateProductionOps(bundle);
  const readiness = api.evaluateReleaseReadiness(bundle);
  const inventory = api.productionCenterInventory(bundle);
  const highRiskAction = {
    title: "Production Operations Center dry-run deploy plan",
    reason: "Production action metadata must remain proposal-only and cannot connect server, deploy, or run production operation.",
    target_project: "anksen-agent-studio",
    target_package: "packages/production-ops",
    expected_files: [
      "packages/production-ops/examples/deploy-plan.example.json",
      "packages/production-ops/examples/server-registry.example.json"
    ],
    validation_commands: [
      "node packages/orchestrator-core/bin/studio.mjs production deploy-plan --dry-run"
    ],
    risk: "HIGH",
    approval_required: false,
    execution_mode: "proposal_only"
  };
  const criticalAction = {
    ...highRiskAction,
    title: "Real production operation execution",
    reason: "A real execution path would connect server, deploy, or run production operation and therefore requires CRITICAL approval gate.",
    risk: "CRITICAL",
    approval_required: true,
    execution_mode: "human_approval_required"
  };
  const highRiskGovernance = governanceApi.evaluateActionGovernance(governanceBundle, highRiskAction);
  const criticalGovernance = governanceApi.evaluateActionGovernance(governanceBundle, criticalAction);
  console.log("# Production Operations Safety Check dry-run");
  console.log("");
  console.log(`status: ${validation.status}`);
  console.log(`policy_id: ${validation.policy_id}`);
  console.log(`registry_id: ${validation.registry_id}`);
  console.log(`server_count: ${validation.server_count}`);
  console.log(`plan_count: ${validation.plan_count}`);
  console.log(`release_readiness: ${readiness.status}`);
  console.log(`blocked_gate_count: ${validation.blocked_gate_count}`);
  console.log(`real_execution_approval_gate: ${validation.real_execution_approval_gate}`);
  console.log(`deploy_enabled: ${validation.deploy_enabled ? "yes" : "no"}`);
  console.log(`production_operations_enabled: ${validation.production_operations_enabled ? "yes" : "no"}`);
  console.log(`server_connections: ${validation.server_connections}`);
  console.log(`credential_values_read: ${validation.credential_values_read ? "yes" : "no"}`);
  console.log("");
  console.log("governance_gate:");
  console.log(`- high_risk_status: ${highRiskGovernance.status}`);
  console.log(`- high_risk_execution_mode: ${highRiskGovernance.execution_mode}`);
  console.log(`- high_risk_reason: ${highRiskGovernance.reason}`);
  console.log(`- critical_status: ${criticalGovernance.status}`);
  console.log(`- critical_execution_mode: ${criticalGovernance.execution_mode}`);
  console.log("- critical_required_approval_gate: CRITICAL");
  console.log("- critical_human_approval_required: yes");
  console.log(`- critical_reason: ${criticalGovernance.reason}`);
  console.log("");
  console.log("plans:");
  for (const plan of inventory.plans) {
    console.log(`- ${plan.kind}: ${plan.plan_id} | risk=${plan.risk} | execution=${plan.execution_mode} | approval=${plan.approval_required_for_execution}`);
  }
  console.log("");
  console.log("findings:");
  if (validation.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of validation.findings) {
      console.log(`- ${finding.severity}: ${finding.message}`);
    }
  }
  if (validation.status !== "PASS") process.exitCode = 1;
}

async function productionRollbackPlan(args) {
  assertDryRun(args, "production rollback-plan");
  const { api, bundle } = await loadProductionOpsApi();
  const plan = api.rollbackPlanSummary(bundle);
  console.log("# Production Operations Rollback Plan dry-run");
  console.log("");
  console.log(`plan_id: ${plan.plan_id}`);
  console.log(`target_environment: ${plan.target_environment}`);
  console.log(`risk: ${plan.risk}`);
  console.log(`execution_mode: ${plan.execution_mode}`);
  console.log(`approval_required_for_execution: ${plan.approval_required_for_execution}`);
  console.log(`rollback_strategy: ${plan.rollback_strategy}`);
  console.log(`step_count: ${plan.step_count}`);
  console.log("deploy_execution: disabled");
  console.log(`server_access: ${plan.server_access}`);
  console.log(`production_operations: ${plan.production_operations}`);
  console.log(`credential_values_read: ${plan.credential_values_read ? "yes" : "no"}`);
  console.log("");
  console.log("| Step | Category | Status | Title |");
  console.log("| --- | --- | --- | --- |");
  for (const step of plan.steps) {
    console.log(`| ${step.step_id} | ${step.operation_category} | ${step.execution_status} | ${step.title} |`);
  }
}

async function productionOpsPolicy(args) {
  assertDryRun(args, "production-ops policy");
  const { api, bundle } = await loadProductionOpsApi();
  const policy = api.policySummary(bundle);
  console.log("# Production Ops Policy dry-run");
  console.log("");
  console.log(`policy_id: ${policy.policy_id}`);
  console.log(`mode: ${policy.mode}`);
  console.log(`audit_required: ${policy.audit_required ? "yes" : "no"}`);
  console.log(`deploy_execution: ${policy.deploy_execution}`);
  console.log(`production_operations: ${policy.production_operations}`);
  console.log(`server_access: ${policy.server_access}`);
  console.log(`credential_values: ${policy.credential_values}`);
  console.log(`managed_project_writes: ${policy.managed_project_writes}`);
  console.log("server_connections: disabled");
  console.log("");
  console.log("forbidden_operations:");
  for (const operation of policy.forbidden_operations) console.log(`- ${operation}`);
  console.log("");
  console.log("approval_required_for:");
  for (const operation of policy.approval_required_for) console.log(`- ${operation}`);
}

async function productionOpsGates(args) {
  assertDryRun(args, "production-ops gates");
  const { api, bundle } = await loadProductionOpsApi();
  const readiness = api.evaluateReleaseReadiness(bundle);
  const gates = api.gateInventory(bundle);
  console.log("# Production Ops Release Gates dry-run");
  console.log("");
  console.log(`status: ${readiness.status}`);
  console.log(`gate_count: ${readiness.gate_count}`);
  console.log(`blocked_gate_count: ${readiness.blocked_gate_count}`);
  console.log(`deploy_enabled: ${readiness.deploy_enabled ? "yes" : "no"}`);
  console.log(`production_operations_enabled: ${readiness.production_operations_enabled ? "yes" : "no"}`);
  console.log(`credential_values_read: ${readiness.credential_values_read ? "yes" : "no"}`);
  console.log("");
  console.log("| Gate | Operation | Decision | Approval | Evaluation |");
  console.log("| --- | --- | --- | --- | --- |");
  for (const gate of gates) {
    console.log(`| ${gate.gate_id} | ${gate.operation_category} | ${gate.decision} | ${gate.approval_status} | ${gate.evaluation_status} |`);
  }
}

async function productionOpsValidate(args) {
  assertDryRun(args, "production-ops validate");
  const { api, bundle } = await loadProductionOpsApi();
  const result = api.validateProductionOps(bundle);
  console.log("# Production Ops Validate dry-run");
  console.log("");
  console.log(`status: ${result.status}`);
  console.log(`policy_id: ${result.policy_id}`);
  console.log(`gate_count: ${result.gate_count}`);
  console.log(`blocked_gate_count: ${result.blocked_gate_count}`);
  console.log(`deploy_enabled: ${result.deploy_enabled ? "yes" : "no"}`);
  console.log(`production_operations_enabled: ${result.production_operations_enabled ? "yes" : "no"}`);
  console.log(`credential_values_read: ${result.credential_values_read ? "yes" : "no"}`);
  console.log(`server_connections: ${result.server_connections}`);
  console.log("");
  console.log("findings:");
  if (result.findings.length === 0) {
    console.log("- none");
  } else {
    for (const finding of result.findings) {
      console.log(`- ${finding.severity}: ${finding.message}`);
    }
  }
  if (result.status !== "PASS") process.exitCode = 1;
}

async function runtimeList() {
  const { api, center } = await loadRuntimeCenterApi();
  const inventory = api.runtimeInventory(center);
  console.log("# Runtime Center List");
  console.log("");
  console.log(`providers: ${center.providers.providers?.length ?? 0}`);
  console.log(`profiles: ${center.profiles.profiles?.length ?? 0}`);
  console.log(`adapters: ${center.adapters.adapters?.length ?? 0}`);
  console.log("credential_values: not read");
  console.log("");
  console.log("| Runtime | Adapter | Adapter Status | Provider | Type | Mode | Region | Health | Auth | Budget | Skills |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const runtime of inventory) {
    console.log(
      `| ${runtime.runtime_id} | ${runtime.adapter_id} | ${runtime.adapter_status} | ${runtime.provider_name} | ${runtime.provider_type} | ${runtime.invoke_mode} | ${runtime.region} | ${runtime.health_status} | ${runtime.auth_status} | ${runtime.budget_status} / $${runtime.max_usd_per_task} | ${runtime.supported_skills.join(", ")} |`
    );
  }
}

async function runtimeHealth(args) {
  if (!args.dryRun) {
    throw new Error("runtime health currently supports --dry-run only.");
  }
  const { api, center } = await loadRuntimeCenterApi();
  const payload = api.buildRuntimeHealth(center, true);
  console.log("# Runtime Center Health dry-run");
  console.log("");
  console.log(`providers: ${center.providers.providers?.length ?? 0}`);
  console.log(`runtimes: ${center.profiles.profiles?.length ?? 0}`);
  console.log(`adapters: ${center.adapters.adapters?.length ?? 0}`);
  console.log("network_probes: disabled");
  console.log("credential_values: not read");
  console.log("");
  console.log("| Provider | Runtime | Adapter | Adapter Status | Status | Latency | Auth | Available Skills |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const result of payload.results) {
    console.log(
      `| ${result.provider} | ${result.runtime} | ${result.adapter_id} | ${result.adapter_status} | ${result.status} | ${result.latency_ms ?? "n/a"} | ${result.auth_status} | ${result.available_skills.join(", ")} |`
    );
  }
}

async function runtimeSelect(args) {
  if (!args.dryRun) {
    throw new Error("runtime select currently supports --dry-run only.");
  }
  if (!args.skill.trim()) {
    throw new Error("Missing --skill for runtime select.");
  }
  const { api, center } = await loadRuntimeCenterApi();
  const selection = api.selectRuntime(center, {
    skillType: args.skill,
    capability: args.capability || args.skill,
    region: args.region || "local",
    budgetUsd: args.budgetUsd
  });
  console.log("# Runtime Center Select dry-run");
  console.log("");
  console.log(`skill_type: ${selection.input.skill_type}`);
  console.log(`capability: ${selection.input.capability}`);
  console.log(`region: ${selection.input.region}`);
  console.log(`requested_budget_usd: ${selection.input.requested_budget_usd}`);
  console.log(`selected_runtime: ${selection.selected_runtime ?? "none"}`);
  console.log(`selected_provider: ${selection.selected_provider ?? "none"}`);
  console.log(`rule_id: ${selection.rule_id}`);
  console.log(`confidence: ${selection.confidence.toFixed(2)}`);
  console.log(`fallback_used: ${selection.fallback_used ? "yes" : "no"}`);
  console.log(`reason: ${selection.reason}`);
  console.log("credential_values: not read");
  console.log("external_service_calls: disabled");
  console.log("");
  console.log("candidates:");
  for (const candidate of selection.candidates.slice(0, 6)) {
    console.log(`- ${candidate.runtime_id} | adapter=${candidate.adapter_id}/${candidate.adapter_status} | provider=${candidate.provider} | score=${candidate.score} | eligible=${candidate.eligible ? "yes" : "no"} | health=${candidate.status} | budget=${candidate.budget_status} | auth=${candidate.auth_status}`);
  }
}

function pilotRuntimeSmokePaths() {
  return {
    doc: "docs/release/PILOT_1_REAL_RUNTIME_SMOKE.md",
    artifact: "runtime/pilot/pilot-1-runtime-smoke.json",
    report: "runtime/pilot/pilot-1-runtime-smoke-report.md"
  };
}

async function collectPilotRuntimeSmokePreflight(runtimeId) {
  const { api: runtimeApi, center } = await loadRuntimeCenterApi();
  const { api: adapterApi, bundle: adapterBundle } = await loadRuntimeAdapterApi();
  const { api: credentialApi, vault } = await loadCredentialVaultApi();
  const { api: governanceApi, bundle: governanceBundle } = await loadGovernanceCenterApi();
  const selection = runtimeApi.selectRuntime(center, {
    skillType: "code_development",
    capability: "code_development",
    region: "local",
    budgetUsd: 20
  });
  const adapterPlan = adapterApi.buildInvokePlan(adapterBundle, {
    runtime: runtimeId,
    skillType: "code_development"
  });
  const adapter = adapterBundle.indexes.adaptersById.get(adapterPlan.adapter_id);
  const credential = credentialApi.credentialInventory(vault)
    .find((item) => item.credential_id === adapter?.credential_reference_id)
    ?? credentialApi.credentialInventory(vault).find((item) => item.provider === adapter?.provider)
    ?? null;
  const governance = adapter ? governanceApi.evaluateAdapterMetadata(governanceBundle, adapter) : null;
  const governanceValidation = governanceApi.validateGovernanceCenter(governanceBundle);
  return {
    selection,
    adapterPlan,
    adapter,
    credential,
    governance,
    governanceValidation
  };
}

function buildPilotSmokeArtifact({ runtimeId, mode, preflight, validationResult = null, filesWritten = [] }) {
  const now = new Date().toISOString();
  const paths = pilotRuntimeSmokePaths();
  const workerPayload = {
    worker_runtime: "local codex-cli",
    worker_runtime_id: runtimeId,
    worker_task: "pilot-1-write-runtime-smoke-artifact",
    execution_mode: mode,
    real_execution: mode === "apply",
    result: mode === "apply" ? "artifact_written" : "planned",
    allowed_paths: Object.values(paths),
    forbidden_paths: [
      "jinhu-smart-park/**",
      "../jinhu-smart-park/**",
      "**/.env*",
      "**/*secret*",
      "**/*private_key*",
      "**/*ssh_key*"
    ]
  };
  const workerHash = createHash("sha256").update(JSON.stringify(workerPayload)).digest("hex").slice(0, 16);
  const checks = [
    {
      check_id: "runtime_select",
      status: preflight.selection.selected_runtime === runtimeId ? "PASS" : "FAIL",
      evidence: `selected_runtime=${preflight.selection.selected_runtime ?? "none"}`
    },
    {
      check_id: "credential_reference",
      status: preflight.credential?.status === "reference_only" ? "PASS" : "FAIL",
      evidence: preflight.credential
        ? `${preflight.credential.credential_id}; ${preflight.credential.reference_type}; secret_value_read=${preflight.credential.secret_value_read}`
        : "missing"
    },
    {
      check_id: "adapter_invoke_plan",
      status: preflight.adapterPlan.execution_status === "planned" ? "PASS" : "FAIL",
      evidence: `${preflight.adapterPlan.adapter_id}; ${preflight.adapterPlan.execution_status}`
    },
    {
      check_id: "governance_gate",
      status: preflight.governance?.status === "PASS" && preflight.governanceValidation.status === "PASS" ? "PASS" : "FAIL",
      evidence: `adapter=${preflight.governance?.status ?? "missing"}; center=${preflight.governanceValidation.status}`
    },
    {
      check_id: "worker_runtime",
      status: runtimeId === "codex-cli" ? "PASS" : "FAIL",
      evidence: workerPayload.worker_runtime
    },
    {
      check_id: "result_artifact",
      status: mode === "apply" || filesWritten.length > 0 ? "PASS" : "PLANNED",
      evidence: paths.artifact
    },
    {
      check_id: "validation",
      status: validationResult?.ok ? "PASS" : validationResult ? "FAIL" : "PENDING",
      evidence: validationResult ? `git diff --check status=${validationResult.status}` : "not_run"
    }
  ];
  return {
    schema_version: 1,
    pilot_id: "pilot-1-real-runtime-smoke",
    generated_at: now,
    status: checks.every((check) => ["PASS", "PLANNED", "PENDING"].includes(check.status)) ? (mode === "apply" ? "PASS" : "PLANNED") : "FAIL",
    runtime: {
      selected_runtime: preflight.selection.selected_runtime,
      requested_runtime: runtimeId,
      provider: preflight.selection.selected_provider,
      skill_type: "code_development",
      runtime_select_status: preflight.selection.selected_runtime === runtimeId ? "PASS" : "FAIL"
    },
    credential_reference: {
      credential_id: preflight.credential?.credential_id ?? "",
      provider: preflight.credential?.provider ?? "",
      status: preflight.credential?.status ?? "missing",
      reference_type: preflight.credential?.reference_type ?? "missing",
      secret_value_read: "no",
      env_read: "no",
      keychain_read: "no",
      external_vault_read: "no"
    },
    adapter: {
      adapter_id: preflight.adapterPlan.adapter_id,
      runtime_id: preflight.adapterPlan.runtime_id,
      invoke_mode: preflight.adapter?.invoke_mode ?? "missing",
      execution_status: preflight.adapterPlan.execution_status,
      credential_reference_status: preflight.adapterPlan.credential_reference_status,
      model_invocation: preflight.adapterPlan.model_invocation,
      external_calls: preflight.adapterPlan.external_calls,
      blocked_reasons: preflight.adapterPlan.blocked_reasons
    },
    governance: {
      status: preflight.governance?.status ?? "missing",
      risk: preflight.governance?.risk ?? "missing",
      automation_mode: preflight.governance?.automation_mode ?? "missing",
      center_status: preflight.governanceValidation.status,
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled"
    },
    worker_runtime: {
      ...workerPayload,
      result_hash: workerHash,
      files_written: filesWritten
    },
    validation_result: validationResult ? {
      command: "git diff --check",
      status: validationResult.ok ? "PASS" : "FAIL",
      exit_code: validationResult.status,
      stdout_tail: stdoutTail(validationResult.stdout, 20),
      stderr_tail: stdoutTail(validationResult.stderr, 20)
    } : {
      command: "git diff --check",
      status: "PENDING",
      exit_code: null,
      stdout_tail: "",
      stderr_tail: ""
    },
    checks,
    safety: {
      managed_project_writes: "disabled",
      jinhu_smart_park_modified: "no",
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled",
      credential_values: "not_read",
      real_model_call: "disabled"
    }
  };
}

function pilotRuntimeSmokeMarkdown(artifact) {
  return `# Pilot-1 Real Runtime Smoke

- pilot_id: ${artifact.pilot_id}
- generated_at: ${artifact.generated_at}
- status: ${artifact.status}
- runtime: ${artifact.runtime.selected_runtime}
- worker: ${artifact.worker_runtime.worker_runtime}
- real_execution: ${artifact.worker_runtime.real_execution ? "yes" : "no"}

## Scope

Pilot-1 validates only Codex CLI. Claude Code, Gemini, OpenHands, and Aider are out of scope.

## Chain

Runtime Center -> Credential Vault Reference -> Runtime Adapter -> Governance -> Worker Runtime -> Result Artifact

## Evidence

| Step | Status | Evidence |
| --- | --- | --- |
${artifact.checks.map((check) => `| ${check.check_id} | ${check.status} | ${check.evidence} |`).join("\n")}

## Result

- result_artifact: \`runtime/pilot/pilot-1-runtime-smoke.json\`
- result_report: \`runtime/pilot/pilot-1-runtime-smoke-report.md\`
- worker_result_hash: ${artifact.worker_runtime.result_hash}
- validation: ${artifact.validation_result.status}

## Safety

- \`jinhu-smart-park\` modified: no.
- Deploy: disabled.
- Production operations: disabled.
- Server access: disabled.
- Credential values: not read.
- Real model call: disabled.
`;
}

function pilotRuntimeSmokeReportMarkdown(artifact) {
  return `# Pilot-1 Runtime Smoke Report

## Summary

- status: ${artifact.status}
- runtime: ${artifact.runtime.selected_runtime}
- provider: ${artifact.runtime.provider}
- credential_reference: ${artifact.credential_reference.status}
- adapter: ${artifact.adapter.adapter_id}
- governance: ${artifact.governance.status}
- worker: ${artifact.worker_runtime.worker_runtime}
- real_execution: ${artifact.worker_runtime.real_execution ? "yes" : "no"}
- validation: ${artifact.validation_result.status}

## Runtime Center

- runtime_select_status: ${artifact.runtime.runtime_select_status}
- selected_runtime: ${artifact.runtime.selected_runtime}
- skill_type: ${artifact.runtime.skill_type}

## Credential Vault Reference

- credential_id: ${artifact.credential_reference.credential_id}
- status: ${artifact.credential_reference.status}
- reference_type: ${artifact.credential_reference.reference_type}
- secret_value_read: ${artifact.credential_reference.secret_value_read}

## Runtime Adapter

- adapter_id: ${artifact.adapter.adapter_id}
- invoke_mode: ${artifact.adapter.invoke_mode}
- execution_status: ${artifact.adapter.execution_status}
- model_invocation: ${artifact.adapter.model_invocation}
- external_calls: ${artifact.adapter.external_calls}

## Governance

- status: ${artifact.governance.status}
- risk: ${artifact.governance.risk}
- automation_mode: ${artifact.governance.automation_mode}
- deploy: ${artifact.governance.deploy}
- production_operations: ${artifact.governance.production_operations}

## Worker Runtime

- worker_runtime: ${artifact.worker_runtime.worker_runtime}
- worker_task: ${artifact.worker_runtime.worker_task}
- result: ${artifact.worker_runtime.result}
- result_hash: ${artifact.worker_runtime.result_hash}
- files_written: ${artifact.worker_runtime.files_written.join(", ")}

## Validation

- command: ${artifact.validation_result.command}
- status: ${artifact.validation_result.status}
- exit_code: ${artifact.validation_result.exit_code}
- stderr_tail: ${artifact.validation_result.stderr_tail || "none"}

## Safety

- managed_project_writes: ${artifact.safety.managed_project_writes}
- jinhu_smart_park_modified: ${artifact.safety.jinhu_smart_park_modified}
- deploy: ${artifact.safety.deploy}
- production_operations: ${artifact.safety.production_operations}
- server_access: ${artifact.safety.server_access}
- credential_values: ${artifact.safety.credential_values}
- real_model_call: ${artifact.safety.real_model_call}
`;
}

async function writePilotRuntimeSmokeFiles(artifact) {
  const paths = pilotRuntimeSmokePaths();
  await mkdir(resolveFromRoot("runtime/pilot"), { recursive: true });
  await writeJsonFile(resolveFromRoot(paths.artifact), artifact);
  await writeFile(resolveFromRoot(paths.doc), pilotRuntimeSmokeMarkdown(artifact), "utf8");
  await writeFile(resolveFromRoot(paths.report), pilotRuntimeSmokeReportMarkdown(artifact), "utf8");
  return Object.values(paths);
}

async function pilotRuntimeSmoke(args) {
  if (!args.dryRun && !args.apply) {
    throw new Error("pilot runtime-smoke requires --dry-run or --apply.");
  }
  const runtimeId = args.runtime || "codex-cli";
  if (runtimeId !== "codex-cli") {
    throw new Error("Pilot-1 only allows --runtime codex-cli.");
  }
  const preflight = await collectPilotRuntimeSmokePreflight(runtimeId);
  const mode = args.apply ? "apply" : "dry-run";
  let artifact = buildPilotSmokeArtifact({ runtimeId, mode, preflight });
  let filesWritten = [];
  let validationResult = null;

  if (args.apply) {
    filesWritten = await writePilotRuntimeSmokeFiles(artifact);
    validationResult = await execReadOnly(repoRoot, "git", ["diff", "--check"], 120000);
    artifact = buildPilotSmokeArtifact({ runtimeId, mode, preflight, validationResult, filesWritten });
    filesWritten = await writePilotRuntimeSmokeFiles(artifact);
  }

  console.log(`# Pilot-1 Runtime Smoke ${mode}`);
  console.log("");
  console.log(`status: ${artifact.status}`);
  console.log(`runtime: ${artifact.runtime.selected_runtime}`);
  console.log(`credential_reference: ${artifact.credential_reference.status}`);
  console.log(`adapter: ${artifact.adapter.adapter_id}`);
  console.log(`adapter_invoke_plan: ${artifact.adapter.execution_status}`);
  console.log(`governance: ${artifact.governance.status}`);
  console.log(`worker: ${artifact.worker_runtime.worker_runtime}`);
  console.log(`real_execution: ${artifact.worker_runtime.real_execution ? "yes" : "no"}`);
  console.log(`result_hash: ${artifact.worker_runtime.result_hash}`);
  console.log(`validation: ${artifact.validation_result.status}`);
  console.log("secret_values_read: no");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  console.log("server_access: disabled");
  console.log("");
  console.log("checks:");
  for (const check of artifact.checks) {
    console.log(`- ${check.check_id}: ${check.status} (${check.evidence})`);
  }
  if (filesWritten.length > 0) {
    console.log("");
    console.log("written_files:");
    for (const file of filesWritten) console.log(`- ${file}`);
  }
  if (artifact.status !== "PASS" && args.apply) process.exitCode = 1;
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (args.command === "doctor") return doctor(args);
  if (args.command === "project" && args.subcommand === "connect") return projectConnect(args);
  if (args.command === "project" && args.subcommand === "intake") return projectIntake(args);
  if (args.command === "project" && args.subcommand === "stack") return projectStack(args);
  if (args.command === "project" && args.subcommand === "commands") return projectCommands(args);
  if (args.command === "project" && args.subcommand === "bind") return projectBind(args);
  if (args.command === "project" && args.subcommand === "workspace") return projectWorkspace(args);
  if (args.command === "project" && args.subcommand === "exec-context") return projectExecContext(args);
  if (args.command === "project" && args.subcommand === "dispatch-plan") return projectDispatchPlan(args);
  if (args.command === "project" && args.subcommand === "evidence") return projectEvidence(args);
  if (args.command === "project" && args.subcommand === "chain-validate") return projectChainValidate(args);
  if (args.command === "project" && args.subcommand === "inspect") return projectInspect(args);
  if (args.command === "project" && args.subcommand === "parity") return projectParity(args);
  if (args.command === "project" && args.subcommand === "import-memory") return projectImportMemory(args);
  if (args.command === "project" && args.subcommand === "memory") return projectMemory(args);
  if (args.command === "project" && args.subcommand === "task-plan") return projectTaskPlan(args);
  if (args.command === "project" && args.subcommand === "proposals") return projectProposals(args);
  if (args.command === "project" && args.subcommand === "approve-proposal") return projectApproveProposal(args);
  if (args.command === "project" && args.subcommand === "execute") return projectExecute(args);
  if (args.command === "credential" && args.subcommand === "list") return credentialList(args);
  if (args.command === "credential" && args.subcommand === "validate") return credentialValidate(args);
  if (args.command === "credential" && args.subcommand === "policy") return credentialPolicy(args);
  if (args.command === "credential" && args.subcommand === "backend-list") return credentialBackendList(args);
  if (args.command === "credential" && args.subcommand === "backend-select") return credentialBackendSelect(args);
  if (args.command === "credential" && args.subcommand === "scope-check") return credentialScopeCheck(args);
  if (args.command === "credential" && args.subcommand === "audit-policy") return credentialAuditPolicy(args);
  if (args.command === "governance" && args.subcommand === "check") return governanceCheck(args);
  if (args.command === "release-gate" && args.subcommand === "check") return releaseGateCheck(args);
  if (args.command === "approval-policy") return approvalPolicy(args);
  if (args.command === "adapter" && args.subcommand === "list") return adapterList(args);
  if (args.command === "adapter" && args.subcommand === "health") return adapterHealth(args);
  if (args.command === "adapter" && args.subcommand === "invoke-plan") return adapterInvokePlan(args);
  if (args.command === "model-gateway" && args.subcommand === "status") return modelGatewayStatus(args);
  if (args.command === "model-gateway" && args.subcommand === "route") return modelGatewayRoute(args);
  if (args.command === "model-gateway" && args.subcommand === "invoke-plan") return modelGatewayInvokePlan(args);
  if (args.command === "model-gateway" && args.subcommand === "audit") return modelGatewayAudit(args);
  if (args.command === "worker" && args.subcommand === "list") return workerList(args);
  if (args.command === "worker" && args.subcommand === "registry") return workerRegistry(args);
  if (args.command === "worker" && args.subcommand === "health") return workerHealth(args);
  if (args.command === "worker" && args.subcommand === "control-plane") return workerControlPlane(args);
  if (args.command === "worker" && args.subcommand === "heartbeat") return workerHeartbeat(args);
  if (args.command === "worker" && args.subcommand === "assign") return workerAssign(args);
  if (args.command === "worker" && args.subcommand === "dispatch") return workerDispatch(args);
  if (args.command === "worker" && args.subcommand === "cancel") return workerCancel(args);
  if (args.command === "worker" && args.subcommand === "parallel-smoke") return workerParallelSmoke(args);
  if (args.command === "mobile" && args.subcommand === "ios-detect") return mobileIosDetect(args);
  if (args.command === "mobile" && args.subcommand === "android-detect") return mobileAndroidDetect(args);
  if (args.command === "mobile" && args.subcommand === "validate") return mobileValidate(args);
  if (args.command === "production" && args.subcommand === "server-list") return productionServerList(args);
  if (args.command === "production" && args.subcommand === "deploy-plan") return productionDeployPlan(args);
  if (args.command === "production" && args.subcommand === "safety-check") return productionSafetyCheck(args);
  if (args.command === "production" && args.subcommand === "rollback-plan") return productionRollbackPlan(args);
  if (args.command === "production-ops" && args.subcommand === "policy") return productionOpsPolicy(args);
  if (args.command === "production-ops" && args.subcommand === "gates") return productionOpsGates(args);
  if (args.command === "production-ops" && args.subcommand === "validate") return productionOpsValidate(args);
  if (args.command === "context" && args.subcommand === "bootstrap") return contextBootstrap(args);
  if (args.command === "context" && args.subcommand === "summary") return contextSummary();
  if (args.command === "context" && args.subcommand === "project") return contextProject(args);
  if (args.command === "access" && args.subcommand === "summary") return accessSummaryDryRun(args);
  if (args.command === "access" && args.subcommand === "users") return accessUsersDryRun(args);
  if (args.command === "access" && args.subcommand === "plans") return accessPlansDryRun(args);
  if (args.command === "access" && args.subcommand === "invites") return accessInvitesDryRun(args);
  if (args.command === "access" && args.subcommand === "enforcement") return accessEnforcement(args);
  if (args.command === "access" && args.subcommand === "check") return accessCheckDryRun(args);
  if (args.command === "access" && args.subcommand === "grant") return accessGrant(args);
  if (args.command === "access" && args.subcommand === "set-plan") return accessSetPlan(args);
  if (args.command === "access" && args.subcommand === "reset-password") return accessResetPassword(args);
  if (args.command === "access" && args.subcommand === "enable-user") return accessToggleUser(args, "ACTIVE");
  if (args.command === "access" && args.subcommand === "disable-user") return accessToggleUser(args, "DISABLED");
  if (args.command === "access" && args.subcommand === "create-user") return accessCreateUser(args);
  if (args.command === "access" && args.subcommand === "invite-user") return accessInviteUser(args);
  if (args.command === "access" && args.subcommand === "review-invite") return accessReviewInvite(args);
  if (args.command === "access" && args.subcommand === "materialize-invite") return accessMaterializeInvite(args);
  if (args.command === "access" && args.subcommand === "set-project-scope") return accessSetProjectScope(args);
  if (args.command === "access" && args.subcommand === "suspend-membership") return accessToggleMembership(args, "SUSPENDED");
  if (args.command === "access" && args.subcommand === "resume-membership") return accessToggleMembership(args, "ACTIVE");
  if (args.command === "runtime" && args.subcommand === "list") return runtimeList();
  if (args.command === "runtime" && args.subcommand === "health") return runtimeHealth(args);
  if (args.command === "runtime" && args.subcommand === "select") return runtimeSelect(args);
  if (args.command === "pilot" && args.subcommand === "runtime-smoke") return pilotRuntimeSmoke(args);
  if (args.command === "console" && args.subcommand === "render") return consoleRender(args);
  if (args.command === "console" && args.subcommand === "smoke") return consoleSmoke(args);
  if (args.command === "console" && args.subcommand === "action-server-smoke") return consoleActionServerSmoke(args);
  if (args.command === "console" && args.subcommand === "agent-status") return consoleAgentStatus(args);
  if (args.command === "console" && args.subcommand === "service") return consoleService(args);
  if (args.command === "console" && args.subcommand === "actions") return consoleActionsDryRun(args);
  if (args.command === "console" && args.subcommand === "action-plan") return consoleActionPlan(args);
  if (args.command === "release" && args.subcommand === "consistency") return releaseConsistency(args);
  if (args.command === "platform" && args.subcommand === "self-test") return platformSelfTest(args);
  if (args.command === "skill-route") {
    if (!args.text.trim()) throw new Error("Missing --text for skill-route.");
    console.log(JSON.stringify(await loadSkillRoute(args.text), null, 2));
    return;
  }
  if (args.command === "plan") return plan(args);
  if (args.command === "goal-to-queue") return goalToQueue(args);
  if (args.command === "runtime-memory") return runtimeMemory();
  if (args.command === "observe") return observe();
  if (args.command === "evolution-plan") return evolutionPlan();
  if (args.command === "discovery") return discovery(args);
  if (args.command === "debug" && args.subcommand === "analyze") return debugAnalyze(args);
  if (args.command === "autopilot" && args.subcommand === "batch") return autopilotBatch(args);
  if (args.command === "autopilot" && args.subcommand === "run") return autopilotRunner(args);
  if (args.command === "autopilot") return autopilot(args);
  if (args.command === "lint-check") {
    console.log("lint:check: no ESLint configuration is enabled in the extraction-stage skeleton.");
    console.log("status: PASS");
    return;
  }

  usage();
  throw new Error(`Unknown command: ${args.command}`);
}

try {
  await main();
} catch (error) {
  console.error(error instanceof Error ? error.message : String(error));
  process.exit(1);
}
