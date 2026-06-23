#!/usr/bin/env node
import { execFile } from "node:child_process";
import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readdir, readFile, writeFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath, pathToFileURL } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(binDir);
const repoRoot = resolve(packageDir, "../..");
const execFileAsync = promisify(execFile);

const DEFAULT_PROJECT = "examples/jinhu-smart-park/project.config.example.json";

function usage() {
  console.log(`ANKSEN Agent Studio CLI

Usage:
  node packages/orchestrator-core/bin/studio.mjs doctor [--project <file>] --dry-run
  node packages/orchestrator-core/bin/studio.mjs project intake --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project stack --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project commands --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project inspect --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project parity --config <file> --dry-run
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
  node packages/orchestrator-core/bin/studio.mjs governance check --dry-run
  node packages/orchestrator-core/bin/studio.mjs release-gate check --dry-run
  node packages/orchestrator-core/bin/studio.mjs approval-policy --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter list --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter health --dry-run
  node packages/orchestrator-core/bin/studio.mjs adapter invoke-plan --runtime <runtime_id> --skill <skill_type> --dry-run
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
  node packages/orchestrator-core/bin/studio.mjs runtime list
  node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
  node packages/orchestrator-core/bin/studio.mjs runtime select --skill <skill_type> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs plan --goal "..." --dry-run
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
  const subcommand = ["project", "runtime", "credential", "governance", "release-gate", "adapter", "production", "production-ops", "context", "autopilot", "debug"].includes(command) ? rest[0] : "";
  const args = {
    command,
    subcommand,
    dryRun: rest.includes("--dry-run"),
    apply: rest.includes("--apply"),
    applyProposal: rest.includes("--apply-proposal"),
    approveHighRisk: rest.includes("--approve-high-risk"),
    summary: rest.includes("--summary"),
    text: "",
    goal: "",
    skill: "",
    runtime: "",
    capability: "",
    region: "local",
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
    } else if (arg === "--goal") {
      args.goal = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--runtime") {
      args.runtime = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--skill") {
      args.skill = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--capability") {
      args.capability = rest[index + 1] ?? "";
      index += 1;
    } else if (arg === "--region") {
      args.region = rest[index + 1] ?? "";
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
  if (snapshot.repo.branch !== "main") failures.push(`project branch must be main, got ${snapshot.repo.branch}`);
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
    console.log(`- ${proposal.task_id} | ${proposal.owner} | ${proposal.skill_type} | ${proposal.risk} | ${proposal.approval_status} | ${file}`);
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
    console.log("would_rebuild_queue_read_model: yes");
    console.log("agent_execution: disabled");
    console.log("deploy: disabled");
    console.log("production_operations: disabled");
    return;
  }

  await writeProposalJson(proposalPath, approvedProposal);
  const eventWrite = await writeProjectTaskCreatedEvent(snapshot.projectPath, snapshot.config, event);
  const rebuild = await rebuildProjectReadModel(snapshot.projectPath);
  if (!rebuild.ok) {
    throw new Error(`Project read model rebuild failed: ${rebuild.stderr || rebuild.stdout}`);
  }

  console.log("# Project Proposal Approval apply");
  console.log("");
  console.log(`proposal_file: ${proposalPath}`);
  console.log(`task_id: ${approvedProposal.task_id}`);
  console.log(`approval_status: ${approvedProposal.approval_status}`);
  console.log(`proposal_status: ${approvedProposal.proposal_status.join(", ")}`);
  console.log(`event_file: ${eventWrite.path}`);
  console.log(`event_written: ${eventWrite.written ? "yes" : "no"}`);
  console.log(`event_skipped_existing: ${eventWrite.skipped ? "yes" : "no"}`);
  console.log("queue_read_model_rebuilt: yes");
  console.log("project_allowed_writes: ops/agent-orchestrator/events/**, ops/agent-orchestrator/queue/**");
  console.log("business_code_writes: disabled");
  console.log("agent_execution: disabled");
  console.log("deploy: disabled");
  console.log("production_operations: disabled");
  if (rebuild.stdout) {
    console.log("");
    console.log("rebuild_output:");
    console.log(rebuild.stdout);
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

async function collectAutopilotContext(goal) {
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
  const runEvidence = await autopilotRunEvidence(autopilotRunFiles);

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

function buildPlanningRequest(goal, context) {
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
    }
  };
}

async function runPlanningCenter(goal) {
  const context = await collectAutopilotContext(goal);
  const request = buildPlanningRequest(goal, context);
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
  if (action.target_project !== "anksen-agent-studio") {
    return {
      allowed: false,
      execution_mode: "proposal_only",
      reason: "Action targets a managed or external project, so Autopilot Runner may only generate a proposal.",
      governance
    };
  }
  return {
    allowed: Boolean(governance.execution_allowed),
    execution_mode: governance.execution_mode,
    reason: governance.reason,
    governance
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

async function runAllowedCommand(command) {
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
  const result = await execReadOnly(repoRoot, bin, args, timeout);
  return {
    command,
    ok: result.ok,
    status: result.status,
    blocked: false,
    stdout_tail: stdoutTail(result.stdout, 40),
    stderr_tail: stdoutTail(result.stderr, 40)
  };
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

async function gitStatusShort() {
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], {
      cwd: repoRoot,
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

async function currentChangedFiles() {
  return changedFilesFromStatus(await gitStatusShort());
}

function internalTaskFromAction(goal, action, route) {
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
    validation_commands: action.validation_commands
  };
}

function executorRunPlan(goal, action, internalTask) {
  return {
    runtime_strategy: "safe-local-repository-executor",
    executor_prompt: [
      `Goal: ${goal}`,
      `Task: ${action.title}`,
      `Reason: ${action.reason}`,
      `Target package: ${action.target_package}`,
      `Expected files: ${(action.expected_files ?? []).join(", ")}`,
      "Safety: do not deploy, do not run production operations, do not read or write secret values, and do not modify managed projects."
    ].join("\n"),
    steps: [
      "Read runtime/global context files.",
      "Confirm Planning Center selected one bounded next_action.",
      `Create internal task ${internalTask.task_id}.`,
      "Execute the allowed local repository action when safety gates allow it.",
      "Run pnpm typecheck, pnpm lint:check, and git diff --check.",
      "Commit the local repository implementation.",
      "Write Autopilot run JSON and Markdown evidence.",
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

async function commitPaths(paths, message, commandsRun) {
  const uniquePaths = unique(paths).filter(Boolean);
  if (uniquePaths.length === 0) {
    return { ok: false, hash: "", message: "No paths to commit." };
  }
  const addResult = await execReadOnly(repoRoot, "git", ["add", "--", ...uniquePaths], 120000);
  commandsRun.push({
    command: `git add -- ${uniquePaths.join(" ")}`,
    ok: addResult.ok,
    status: addResult.status,
    blocked: false,
    stdout_tail: stdoutTail(addResult.stdout, 20),
    stderr_tail: stdoutTail(addResult.stderr, 20)
  });
  if (!addResult.ok) return { ok: false, hash: "", message: addResult.stderr || "git add failed" };

  const commitResult = await execReadOnly(repoRoot, "git", ["commit", "-m", message], 120000);
  commandsRun.push({
    command: `git commit -m "${message}"`,
    ok: commitResult.ok,
    status: commitResult.status,
    blocked: false,
    stdout_tail: stdoutTail(commitResult.stdout, 40),
    stderr_tail: stdoutTail(commitResult.stderr, 40)
  });
  const hash = commitResult.ok ? await execGit(repoRoot, ["rev-parse", "HEAD"]) : "";
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
    execution_gate: gate,
    internal_task: internalTask,
    executor_run_plan: runPlan,
    execution_result: executionResult,
    commands_run: commandsRun,
    changed_files: changedFiles,
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

async function runContinuousValidation(commandsRun) {
  const results = [];
  for (const command of ["pnpm typecheck", "pnpm lint:check", "git diff --check"]) {
    const result = await runAllowedCommand(command);
    commandsRun.push(result);
    results.push(result);
  }
  return validationSummary(results);
}

async function lastCommitForPath(path) {
  return execGit(repoRoot, ["log", "-1", "--format=%H", "--", path]);
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
      validationResult = await runContinuousValidation(commandsRun);
      commitHash = await lastCommitForPath(step.action.expected_files.at(-1) ?? ".");
    } else if (!gate.allowed) {
      status = "PROPOSAL_ONLY";
      executionMode = "proposal_only";
      const proposal = await step.write(parentRunId, gate);
      changedFiles = proposal.files ?? [];
      proposalId = proposal.proposal_id ?? "";
      validationResult = await runContinuousValidation(commandsRun);
      if (validationResult.status === "PASS") {
        const proposalCommit = await commitPaths(changedFiles, step.commit_message, commandsRun);
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
      validationResult = await runContinuousValidation(commandsRun);
      if (validationResult.status === "PASS") {
        const implementationCommit = await commitPaths(changedFiles, step.commit_message, commandsRun);
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
  console.log(`selected_action: ${run.selected_action.title}`);
  console.log(`target_project: ${run.selected_action.target_project}`);
  console.log(`target_package: ${run.selected_action.target_package}`);
  console.log(`risk: ${run.selected_action.risk}`);
  console.log(`gate: ${run.execution_gate.reason}`);
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

async function commitAutopilotRunnerResult(message, commandsRun) {
  const addResult = await execReadOnly(repoRoot, "git", ["add", "--all", "--", "."], 120000);
  commandsRun.push({
    command: "git add --all -- .",
    ok: addResult.ok,
    status: addResult.status,
    blocked: false,
    stdout_tail: stdoutTail(addResult.stdout, 20),
    stderr_tail: stdoutTail(addResult.stderr, 20)
  });
  if (!addResult.ok) return { ok: false, hash: "", result: addResult };

  const commitResult = await execReadOnly(repoRoot, "git", ["commit", "-m", message], 120000);
  commandsRun.push({
    command: `git commit -m "${message}"`,
    ok: commitResult.ok,
    status: commitResult.status,
    blocked: false,
    stdout_tail: stdoutTail(commitResult.stdout, 40),
    stderr_tail: stdoutTail(commitResult.stderr, 40)
  });
  const hash = commitResult.ok ? await execGit(repoRoot, ["rev-parse", "HEAD"]) : "";
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

async function writeJsonFile(path, value) {
  await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8");
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
    console.log(`- ${project.project_id}: doctor=${project.doctor_status}, repo_clean=${project.repo_clean}, memory=${project.memory_dir}`);
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
  console.log(`- repo_branch: ${state?.repo_status?.branch ?? "unknown"}`);
  console.log(`- repo_clean: ${state?.repo_status?.clean ?? "unknown"}`);
  console.log(`- doctor_status: ${state?.local_orchestrator_status?.doctor_status ?? status?.local_orchestrator_status?.doctor_status ?? "unknown"}`);
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

async function evaluateBatchTasks(tasks) {
  const results = [];
  for (const task of tasks) {
    const gate = await localExecutionGate(batchTaskAction(task));
    const risk = gate.governance?.risk ?? task.risk;
    results.push({
      ...task,
      execution_gate: gate,
      automatic_execution_allowed: Boolean(gate.allowed && !["HIGH", "CRITICAL"].includes(risk)),
      effective_execution_mode: ["HIGH", "CRITICAL"].includes(risk)
        ? "proposal_only"
        : gate.execution_mode,
      proposal_required: Boolean(task.proposal_required || ["HIGH", "CRITICAL"].includes(risk) || !gate.allowed)
    });
  }
  return results;
}

function autopilotBatchRunFiles(run) {
  return [
    `autopilot-runs/${run.run_id}.json`,
    `autopilot-runs/${run.run_id}.md`
  ];
}

function autopilotBatchMarkdown(run) {
  const rows = run.batch_plan.tasks.map((task) =>
    `| ${task.owner_agent} | ${task.task_id} | ${task.target_package} | ${task.skill_type} | ${task.runtime} | ${task.risk} | ${task.effective_execution_mode} | ${task.execution_gate.reason} |`
  ).join("\n");
  return `# Autopilot Batch Plan

- run_id: ${run.run_id}
- created_at: ${run.created_at}
- mode: ${run.mode}
- goal: ${run.goal}
- batch_id: ${run.batch_plan.batch_id}
- parallel_requested: ${run.parallel_requested}
- execution_result: ${run.execution_result.summary}

## Tasks

| Agent | Task | Target Package | Skill | Runtime | Risk | Mode | Gate |
| --- | --- | --- | --- | --- | --- | --- | --- |
${rows}

## Safety

- deploy: ${run.safety.deploy}
- production_operations: ${run.safety.production_operations}
- credential_values: ${run.safety.credential_values}
- managed_project_writes: ${run.safety.managed_project_writes}
- real_worker_execution: ${run.safety.real_worker_execution}

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
  changedFiles
}) {
  const now = new Date().toISOString();
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
    execution_mode: "batch_proposal",
    execution_result: {
      executed: false,
      implementation: "parallel-batch-planner-proposal",
      summary: mode === "dry-run"
        ? "Dry-run only. No batch proposal was written and no task was executed."
        : "Batch proposal recorded. Real parallel execution is not implemented in this MVP."
    },
    commands_run: commandsRun,
    changed_files: changedFiles,
    validation_result: {
      status: mode === "dry-run" ? "DRY_RUN" : "RECORDED",
      command_count: commandsRun.length,
      failed_commands: commandsRun.filter((command) => !command.ok).map((command) => command.command)
    },
    next_recommendation: {
      title: "Review batch plan before parallel execution",
      reason: "Parallel Autopilot Planner currently produces a governed batch proposal; the next step is approving an executor implementation for selected LOW/MEDIUM tasks.",
      command: `node packages/orchestrator-core/bin/studio.mjs autopilot batch --goal "${goal}" --dry-run`
    },
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled",
      managed_project_writes: "disabled",
      real_worker_execution: "disabled",
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
  console.log("execution: proposal_only");
  console.log("");
  console.log("| Agent | Task | Target Package | Skill | Runtime | Risk | Mode | Proposal |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const task of run.batch_plan.tasks) {
    console.log(`| ${task.owner_agent} | ${task.task_id} | ${task.target_package} | ${task.skill_type} | ${task.runtime} | ${task.risk} | ${task.effective_execution_mode} | ${task.proposal_required ? "yes" : "no"} |`);
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
  console.log("- real_worker_execution: disabled");
  if (files) {
    console.log("");
    console.log("written_files:");
    console.log(`- ${files.jsonPath}`);
    console.log(`- ${files.markdownPath}`);
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
  const { output } = await runPlanningCenter(goal);
  if (!output.batch_plan?.tasks?.length) {
    throw new Error("Planning Center did not return a batch_plan for this goal.");
  }
  const tasks = await evaluateBatchTasks(output.batch_plan.tasks);
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
    changedFiles: []
  });

  if (args.dryRun) {
    printAutopilotBatch(run);
    return;
  }

  run.changed_files = autopilotBatchRunFiles(run);
  const files = await writeAutopilotBatchRun(run);
  printAutopilotBatch(run, files);
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
  const internalTask = internalTaskFromAction(goal, selectedAction, route);
  const runPlan = executorRunPlan(goal, selectedAction, internalTask);
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
      commandsRun.push(await runAllowedCommand(command));
    }

    validationResult = validationSummary(commandsRun.filter((command) =>
      ["pnpm typecheck", "pnpm lint:check", "git diff --check"].includes(command.command)
    ));
    implementationChangedFiles = await currentChangedFiles();

    if (validationResult.status === "PASS" && executionResult.executed) {
      const implementationCommit = await commitPaths(
        implementationChangedFiles,
        commitMessageForAction(selectedAction),
        commandsRun
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
  const { request, output } = await runPlanningCenter(goal);
  console.log("# Planning Center dry-run");
  console.log("");
  console.log(`goal: ${goal}`);
  console.log(`request_id: ${request.request_id}`);
  console.log(`planning_output_id: ${output.planning_output_id}`);
  console.log(`current_stage: ${output.current_stage.stage_name}`);
  console.log(`next_action: ${output.next_action.title}`);
  console.log(`reason: ${output.reason}`);
  console.log(`target_project: ${output.target_project}`);
  console.log(`target_package: ${output.target_package}`);
  console.log(`risk: ${output.risk}`);
  console.log(`approval_required: ${output.approval_required ? "yes" : "no"}`);
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (args.command === "doctor") return doctor(args);
  if (args.command === "project" && args.subcommand === "intake") return projectIntake(args);
  if (args.command === "project" && args.subcommand === "stack") return projectStack(args);
  if (args.command === "project" && args.subcommand === "commands") return projectCommands(args);
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
  if (args.command === "governance" && args.subcommand === "check") return governanceCheck(args);
  if (args.command === "release-gate" && args.subcommand === "check") return releaseGateCheck(args);
  if (args.command === "approval-policy") return approvalPolicy(args);
  if (args.command === "adapter" && args.subcommand === "list") return adapterList(args);
  if (args.command === "adapter" && args.subcommand === "health") return adapterHealth(args);
  if (args.command === "adapter" && args.subcommand === "invoke-plan") return adapterInvokePlan(args);
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
  if (args.command === "runtime" && args.subcommand === "list") return runtimeList();
  if (args.command === "runtime" && args.subcommand === "health") return runtimeHealth(args);
  if (args.command === "runtime" && args.subcommand === "select") return runtimeSelect(args);
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
