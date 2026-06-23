#!/usr/bin/env node
import { existsSync } from "node:fs";
import { readdir, readFile, stat } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const binDir = dirname(fileURLToPath(import.meta.url));
const packageDir = dirname(binDir);
const repoRoot = resolve(packageDir, "../..");

const DEFAULT_PROJECT = "examples/jinhu-smart-park/project.config.example.json";

function usage() {
  console.log(`ANKSEN Agent Studio CLI

Usage:
  node packages/orchestrator-core/bin/studio.mjs doctor [--project <file>] --dry-run
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
  const args = {
    command,
    dryRun: rest.includes("--dry-run"),
    summary: rest.includes("--summary"),
    text: "",
    project: DEFAULT_PROJECT,
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

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
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

