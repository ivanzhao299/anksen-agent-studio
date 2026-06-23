import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

async function readJsonIfExists(path) {
  if (!existsSync(path)) return null;
  try {
    return await readJson(path);
  } catch {
    return null;
  }
}

async function listDir(path) {
  if (!existsSync(path)) return [];
  return readdir(path, { withFileTypes: true });
}

function resolveProjectPath(configPath, config, repoRoot) {
  const localPath = config.intake?.local_path ?? config.project_root;
  const fromRepoRoot = resolve(repoRoot, localPath);
  if (existsSync(fromRepoRoot)) return fromRepoRoot;
  return resolve(dirname(configPath), localPath);
}

async function gitMetadata(projectPath) {
  const result = {
    is_git_repository: false,
    branch: "unknown",
    head: "unknown",
    remote_url_present: false
  };
  if (!existsSync(join(projectPath, ".git"))) return result;
  result.is_git_repository = true;
  try {
    const { stdout } = await execFileAsync("git", ["branch", "--show-current"], { cwd: projectPath, timeout: 120000 });
    result.branch = stdout.trim() || "unknown";
  } catch {
    result.branch = "unknown";
  }
  try {
    const { stdout } = await execFileAsync("git", ["log", "--oneline", "-1"], { cwd: projectPath, timeout: 120000 });
    result.head = stdout.trim() || "unknown";
  } catch {
    result.head = "unknown";
  }
  try {
    const { stdout } = await execFileAsync("git", ["remote", "get-url", "origin"], { cwd: projectPath, timeout: 120000 });
    result.remote_url_present = Boolean(stdout.trim());
  } catch {
    result.remote_url_present = false;
  }
  return result;
}

function hasHint(config, matcher) {
  return (config.detected_stack_hints ?? []).some((hint) => matcher(String(hint).toLowerCase()));
}

function statusFromProbe(projectPath, paths, hinted = false) {
  if (paths.some((path) => existsSync(join(projectPath, path)))) return "present";
  return hinted ? "hinted" : "missing";
}

async function packageScripts(projectPath) {
  const packageJson = await readJsonIfExists(join(projectPath, "package.json"));
  return Object.keys(packageJson?.scripts ?? {}).sort();
}

function detectStackLabels(config, detection) {
  const labels = new Set(config.detected_stack_hints ?? []);
  if (detection.package_json === "present") labels.add("package.json");
  if (detection.pnpm_workspace === "present") labels.add("pnpm workspace");
  if (detection.nextjs !== "missing") labels.add("Next.js");
  if (detection.nestjs !== "missing") labels.add("NestJS");
  if (detection.typescript !== "missing") labels.add("TypeScript");
  if (detection.prisma_postgresql !== "missing") labels.add("Prisma/PostgreSQL");
  if (detection.docker !== "missing") labels.add("Docker");
  if (detection.cicd !== "missing") labels.add("CI/CD");
  return [...labels].sort();
}

export async function buildProjectIntake(configPath, repoRoot) {
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config, repoRoot);
  const projectExists = existsSync(projectPath);
  const repo = projectExists ? await gitMetadata(projectPath) : {
    is_git_repository: false,
    branch: "missing",
    head: "missing",
    remote_url_present: Boolean(config.intake?.git_url)
  };
  return {
    schema_version: 1,
    project_id: config.project_id,
    project_name: config.project_name ?? config.project_id,
    source_type: config.intake?.source_type ?? "local_path",
    local_path: projectPath,
    git_url_present: Boolean(config.intake?.git_url),
    zip_placeholder_present: Boolean(config.intake?.zip_placeholder),
    project_exists: projectExists,
    repo_metadata: {
      default_branch: config.default_branch ?? config.intake?.repo_metadata?.default_branch ?? "unknown",
      package_manager: config.package_manager ?? config.intake?.repo_metadata?.package_manager ?? "unknown",
      is_git_repository: repo.is_git_repository,
      branch: repo.branch,
      head: repo.head,
      remote_url_present: repo.remote_url_present
    },
    safety: {
      dry_run_only: true,
      project_writes: "disabled",
      agent_execution: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled"
    }
  };
}

export async function detectProjectStack(configPath, repoRoot) {
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config, repoRoot);
  const projectExists = existsSync(projectPath);
  const scripts = projectExists ? await packageScripts(projectPath) : [];
  const detection = {
    schema_version: 1,
    project_id: config.project_id,
    project_path: projectPath,
    project_exists: projectExists,
    package_json: existsSync(join(projectPath, "package.json")) ? "present" : "missing",
    pnpm_workspace: existsSync(join(projectPath, "pnpm-workspace.yaml")) ? "present" : "missing",
    nextjs: statusFromProbe(projectPath, ["next.config.js", "next.config.mjs", "next.config.ts", "apps/web/next.config.js", "apps/web/next.config.mjs"], hasHint(config, (hint) => hint.includes("next"))),
    nestjs: statusFromProbe(projectPath, ["nest-cli.json", "apps/api/nest-cli.json"], hasHint(config, (hint) => hint.includes("nestjs") || hint.includes("nest"))),
    typescript: statusFromProbe(projectPath, ["tsconfig.json", "apps/web/tsconfig.json", "apps/api/tsconfig.json"], hasHint(config, (hint) => hint.includes("typescript"))),
    prisma_postgresql: statusFromProbe(projectPath, ["prisma/schema.prisma", "database/migrations", "packages/database/prisma/schema.prisma"], hasHint(config, (hint) => hint.includes("postgres") || hint.includes("prisma"))),
    docker: statusFromProbe(projectPath, ["Dockerfile", "docker-compose.yml", "docker-compose.yaml"], hasHint(config, (hint) => hint.includes("docker"))),
    cicd: existsSync(join(projectPath, ".github/workflows")) ? "present" : "missing",
    scripts
  };
  return {
    ...detection,
    detected_stack: detectStackLabels(config, detection)
  };
}

function commandFromScripts(kind, scripts, packageManager) {
  if (scripts.includes(kind)) return {
    kind,
    command: `${packageManager} ${kind}`,
    source: "package_json",
    executable_in_mvp: false
  };
  return null;
}

function configCommand(kind, config) {
  const command = (config.available_commands ?? []).find((candidate) => {
    const value = String(candidate).toLowerCase();
    if (kind === "doctor") return value.includes(" doctor");
    return value.includes(kind);
  });
  return command ? {
    kind,
    command,
    source: "config",
    executable_in_mvp: false
  } : null;
}

export async function detectProjectCommands(configPath, repoRoot) {
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config, repoRoot);
  const packageManager = config.package_manager ?? "pnpm";
  const scripts = existsSync(projectPath) ? await packageScripts(projectPath) : [];
  const commands = [];
  commands.push({
    kind: "install",
    command: `${packageManager} install`,
    source: (config.available_commands ?? []).some((command) => String(command).includes("install")) ? "config" : "detected_default",
    executable_in_mvp: false
  });
  for (const kind of ["typecheck", "lint", "test", "build", "dev"]) {
    commands.push(commandFromScripts(kind, scripts, packageManager) ?? configCommand(kind, config) ?? {
      kind,
      command: `${packageManager} ${kind}`,
      source: "detected_default",
      executable_in_mvp: false
    });
  }
  const doctor = configCommand("doctor", config);
  if (doctor) commands.push(doctor);
  return {
    schema_version: 1,
    project_id: config.project_id,
    project_path: projectPath,
    project_exists: existsSync(projectPath),
    command_count: commands.length,
    commands,
    safety: {
      command_execution: "disabled",
      dry_run_only: true
    }
  };
}

export async function analyzeDebugFixture(fixturePath) {
  const text = await readFile(fixturePath, "utf8");
  const lower = text.toLowerCase();
  let errorClass = "unknown";
  if (lower.includes("type error") || lower.includes("ts2322") || lower.includes("ts2307")) errorClass = "type";
  else if (lower.includes("eslint") || lower.includes("lint")) errorClass = "lint";
  else if (lower.includes("jest") || lower.includes("vitest") || lower.includes("test failed")) errorClass = "test";
  else if (lower.includes("next build") || lower.includes("build failed") || lower.includes("failed to compile")) errorClass = "build";
  else if (lower.includes("runtimeerror") || lower.includes("uncaught") || lower.includes("exception")) errorClass = "runtime";

  const severity = errorClass === "runtime" || errorClass === "build" ? "HIGH" : errorClass === "unknown" ? "LOW" : "MEDIUM";
  const proposedRepairTask = {
    build: "Create a proposal to inspect build output, identify the failing module, and add a focused local fix with typecheck/build validation.",
    type: "Create a proposal to inspect TypeScript diagnostics, update the affected types/imports, and validate with typecheck.",
    lint: "Create a proposal to inspect lint diagnostics, apply the smallest style or safety fix, and validate with lint.",
    test: "Create a proposal to inspect failing tests, isolate the expected behavior, and validate with the targeted test plus typecheck.",
    runtime: "Create a proposal to inspect runtime stack trace, add a guarded fix, and validate without production operations.",
    unknown: "Create a proposal to classify the fixture manually before any repair."
  }[errorClass];

  return {
    schema_version: 1,
    fixture_path: fixturePath,
    error_class: errorClass,
    severity,
    summary: `Debug Specialist classified fixture as ${errorClass}.`,
    proposed_repair_task: proposedRepairTask,
    execution_mode: "proposal_only",
    safety: {
      agent_execution: "disabled",
      project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled",
      credential_values: "disabled"
    }
  };
}
