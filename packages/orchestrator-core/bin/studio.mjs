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
  node packages/orchestrator-core/bin/studio.mjs project inspect --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project parity --config <file> --dry-run
  node packages/orchestrator-core/bin/studio.mjs project import-memory --config <file> [--dry-run|--apply]
  node packages/orchestrator-core/bin/studio.mjs project memory --config <file> --summary
  node packages/orchestrator-core/bin/studio.mjs project task-plan --config <file> --text "..." [--dry-run|--apply-proposal]
  node packages/orchestrator-core/bin/studio.mjs project proposals --config <file>
  node packages/orchestrator-core/bin/studio.mjs project approve-proposal --config <file> --task-id <task_id> [--dry-run|--apply --approve-high-risk]
  node packages/orchestrator-core/bin/studio.mjs project execute --config <file> --task-id <task_id> [--dry-run|--apply --parallel 1]
  node packages/orchestrator-core/bin/studio.mjs skill-route --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs runtime list
  node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run
  node packages/orchestrator-core/bin/studio.mjs runtime select --skill <skill_type> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs plan --goal "..." --dry-run
  node packages/orchestrator-core/bin/studio.mjs goal-to-queue --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs runtime-memory --summary
  node packages/orchestrator-core/bin/studio.mjs observe [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs evolution-plan [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs discovery --target <file> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs autopilot --goal "..." [--dry-run|--apply --max-steps 1]
  node packages/orchestrator-core/bin/studio.mjs lint-check

Project execution is available only through explicit project execute --apply. Deploy and production operations remain disabled.`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const subcommand = ["project", "runtime"].includes(command) ? rest[0] : "";
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
    capability: "",
    region: "local",
    budgetUsd: null,
    taskId: "",
    project: DEFAULT_PROJECT,
    config: "",
    target: "",
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

async function collectAutopilotContext(goal) {
  const readmePath = resolveFromRoot("README.md");
  const releaseDocs = await listFilesSafe(resolveFromRoot("docs/release"));
  const runtimeMemoryFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/runtime-memory"));
  const proposalFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/task-proposals"));
  const executionReportFiles = await listFilesSafe(resolveFromRoot("examples/jinhu-smart-park/execution-reports"));
  const packageEvidenceFiles = (await listFilesSafe(resolveFromRoot("packages")))
    .filter((file) => file.includes("/schemas/") || file.includes("/examples/"));
  const projectState = await readJsonIfExists(resolveFromRoot("examples/jinhu-smart-park/runtime-memory/project-state.json"));
  const agentStudioStatus = await readJsonIfExists(resolveFromRoot("examples/jinhu-smart-park/runtime-memory/agent-studio-status.json"));
  const runtimeProviders = await readJsonIfExists(resolveFromRoot("packages/runtime-center/examples/runtime-providers.example.json"));
  const runtimeProfiles = await readJsonIfExists(resolveFromRoot("packages/runtime-center/examples/runtime-profiles.example.json"));

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
      runtime_center_prd_present: releaseDocNames.includes("docs/release/AGENT_RUNTIME_CENTER_PRD.md")
    },
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
      runtime_profiles: runtimeProfiles?.profiles?.map((profile) => profile.runtime_id) ?? []
    },
    stage: {
      extraction_completed: extractionCompleted,
      remote_execute_completed: remoteExecuteCompleted,
      next_stage: "V4-I Agent Runtime Center",
      runtime_center_bootstrapped: runtimeCenterExists
    },
    evidence: {
      latest_execution_report: relativePath(latestFile(executionReportFiles)),
      latest_task_proposal: relativePath(latestFile(proposalFiles.filter((file) => file.endsWith(".json"))))
    }
  };
}

function planningCenterEngineUrl() {
  return pathToFileURL(resolve(packageDir, "../planning-center/lib/planning-engine.mjs")).href;
}

function runtimeCenterUtilsUrl() {
  return pathToFileURL(resolve(packageDir, "../runtime-center/lib/runtime-center-utils.mjs")).href;
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
        next_stage: context.stage.next_stage
      },
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
  if (action.risk === "HIGH" && !action.approval_required) {
    throw new Error("Internal autopilot policy violation: HIGH risk action must require approval.");
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

async function runtimeList() {
  const { api, center } = await loadRuntimeCenterApi();
  const inventory = api.runtimeInventory(center);
  console.log("# Runtime Center List");
  console.log("");
  console.log(`providers: ${center.providers.providers?.length ?? 0}`);
  console.log(`profiles: ${center.profiles.profiles?.length ?? 0}`);
  console.log("credential_values: not read");
  console.log("");
  console.log("| Runtime | Provider | Type | Mode | Region | Health | Auth | Budget | Skills |");
  console.log("| --- | --- | --- | --- | --- | --- | --- | --- | --- |");
  for (const runtime of inventory) {
    console.log(
      `| ${runtime.runtime_id} | ${runtime.provider_name} | ${runtime.provider_type} | ${runtime.invoke_mode} | ${runtime.region} | ${runtime.health_status} | ${runtime.auth_status} | ${runtime.budget_status} / $${runtime.max_usd_per_task} | ${runtime.supported_skills.join(", ")} |`
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
  console.log("network_probes: disabled");
  console.log("credential_values: not read");
  console.log("");
  console.log("| Provider | Runtime | Status | Latency | Auth | Available Skills |");
  console.log("| --- | --- | --- | --- | --- | --- |");
  for (const result of payload.results) {
    console.log(
      `| ${result.provider} | ${result.runtime} | ${result.status} | ${result.latency_ms ?? "n/a"} | ${result.auth_status} | ${result.available_skills.join(", ")} |`
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
    console.log(`- ${candidate.runtime_id} | provider=${candidate.provider} | score=${candidate.score} | eligible=${candidate.eligible ? "yes" : "no"} | health=${candidate.status} | budget=${candidate.budget_status} | auth=${candidate.auth_status}`);
  }
}

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (args.command === "doctor") return doctor(args);
  if (args.command === "project" && args.subcommand === "inspect") return projectInspect(args);
  if (args.command === "project" && args.subcommand === "parity") return projectParity(args);
  if (args.command === "project" && args.subcommand === "import-memory") return projectImportMemory(args);
  if (args.command === "project" && args.subcommand === "memory") return projectMemory(args);
  if (args.command === "project" && args.subcommand === "task-plan") return projectTaskPlan(args);
  if (args.command === "project" && args.subcommand === "proposals") return projectProposals(args);
  if (args.command === "project" && args.subcommand === "approve-proposal") return projectApproveProposal(args);
  if (args.command === "project" && args.subcommand === "execute") return projectExecute(args);
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
