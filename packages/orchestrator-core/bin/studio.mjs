#!/usr/bin/env node
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";
import { fileURLToPath } from "node:url";

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
  node packages/orchestrator-core/bin/studio.mjs skill-route --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs goal-to-queue --text "..." [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs runtime-memory --summary
  node packages/orchestrator-core/bin/studio.mjs observe [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs evolution-plan [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs discovery --target <file> [--dry-run]
  node packages/orchestrator-core/bin/studio.mjs lint-check

All apply/execution flows are intentionally disabled in the extraction-stage CLI.`);
}

function parseArgs(argv) {
  const [command, ...rest] = argv;
  const subcommand = command === "project" ? rest[0] : "";
  const args = {
    command,
    subcommand,
    dryRun: rest.includes("--dry-run"),
    summary: rest.includes("--summary"),
    text: "",
    project: DEFAULT_PROJECT,
    config: "",
    target: ""
  };

  for (let index = 0; index < rest.length; index += 1) {
    const arg = rest[index];
    if (arg === "--text") {
      args.text = rest[index + 1] ?? "";
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

async function main() {
  const args = parseArgs(process.argv.slice(2));
  if (!args.command || args.command === "--help" || args.command === "-h") {
    usage();
    return;
  }

  if (args.command === "doctor") return doctor(args);
  if (args.command === "project" && args.subcommand === "inspect") return projectInspect(args);
  if (args.command === "project" && args.subcommand === "parity") return projectParity(args);
  if (args.command === "skill-route") {
    if (!args.text.trim()) throw new Error("Missing --text for skill-route.");
    console.log(JSON.stringify(await loadSkillRoute(args.text), null, 2));
    return;
  }
  if (args.command === "goal-to-queue") return goalToQueue(args);
  if (args.command === "runtime-memory") return runtimeMemory();
  if (args.command === "observe") return observe();
  if (args.command === "evolution-plan") return evolutionPlan();
  if (args.command === "discovery") return discovery(args);
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
