import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, relative, resolve } from "node:path";
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

function relativeRepoPath(repoRoot, targetPath) {
  if (!targetPath) return "";
  const resolvedPath = resolve(targetPath);
  const relativePath = relative(repoRoot, resolvedPath).replaceAll("\\", "/");
  if (relativePath === "") return ".";
  return relativePath && !relativePath.startsWith("..") ? relativePath : resolvedPath;
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
    remote_url_present: false,
    clean: "unknown",
    dirty_files: []
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
  try {
    const { stdout } = await execFileAsync("git", ["status", "--short"], { cwd: projectPath, timeout: 120000 });
    const dirtyFiles = stdout.split("\n").map((line) => line.trim()).filter(Boolean);
    result.clean = dirtyFiles.length === 0 ? "yes" : "no";
    result.dirty_files = dirtyFiles;
  } catch {
    result.clean = "unknown";
    result.dirty_files = [];
  }
  return result;
}

function normalizeWritePolicy(value) {
  if (value === "enabled" || value === "approval_required" || value === "disabled") return value;
  return "disabled";
}

function normalizeOperationPolicy(value) {
  if (value === "allowed" || value === "manual_approval_required" || value === "forbidden") return value;
  return "forbidden";
}

function deriveWritePolicy(config, projectState) {
  if (projectState?.safety?.project_writes) return normalizeWritePolicy(projectState.safety.project_writes);
  if (config.inspection?.allow_project_writes === true) return "approval_required";
  return "disabled";
}

function deriveOperationPolicy(config, key) {
  return normalizeOperationPolicy(config.production_operations?.[key]);
}

function runtimeProjectContextDir(repoRoot, projectId) {
  return resolve(repoRoot, "runtime/projects", projectId);
}

async function loadRuntimeProjectContext(repoRoot, projectId) {
  const contextDir = runtimeProjectContextDir(repoRoot, projectId);
  const [projectState, status, binding] = await Promise.all([
    readJsonIfExists(join(contextDir, "project-state.json")),
    readJsonIfExists(join(contextDir, "agent-studio-status.json")),
    readJsonIfExists(join(contextDir, "binding.json"))
  ]);
  return { contextDir, projectState, status, binding };
}

function resolveRuntimeMemoryDirectory(projectPath, config, projectState) {
  const runtimeMemoryDir = String(projectState?.runtime_memory_status?.directory ?? config.runtime_memory?.directory ?? "").trim();
  if (!runtimeMemoryDir) return "";
  if (runtimeMemoryDir.startsWith("/")) return runtimeMemoryDir;
  return resolve(projectPath, runtimeMemoryDir);
}

function resolveWorktrees(configPath, config, repoRoot) {
  return Object.entries(config.worktrees ?? {}).map(([slot, path]) => {
    const absolutePath = resolveProjectPath(configPath, { ...config, intake: { ...(config.intake ?? {}), local_path: path }, project_root: path }, repoRoot);
    return {
      slot,
      path: absolutePath,
      path_display: relativeRepoPath(repoRoot, absolutePath),
      exists: existsSync(absolutePath)
    };
  });
}

async function discoverProjectConfigs(repoRoot) {
  const examplesDir = resolve(repoRoot, "examples");
  const entries = await listDir(examplesDir);
  const configs = [];
  for (const entry of entries) {
    if (!entry.isDirectory()) continue;
    const configPath = join(examplesDir, entry.name, "project.config.example.json");
    if (existsSync(configPath)) configs.push(configPath);
  }
  return configs.sort();
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

export async function buildProjectBinding(configPath, repoRoot) {
  const config = await readJson(configPath);
  const projectPath = resolveProjectPath(configPath, config, repoRoot);
  const runtimeContext = await loadRuntimeProjectContext(repoRoot, config.project_id);
  const projectState = runtimeContext.projectState ?? {};
  const status = runtimeContext.status ?? {};
  const repo = projectState.repo_status?.branch
    ? {
      is_git_repository: true,
      branch: String(projectState.repo_status.branch ?? "unknown"),
      head: String(projectState.repo_status.head ?? "unknown"),
      remote_url_present: Boolean(config.intake?.git_url),
      clean: String(projectState.repo_status.clean ?? "unknown"),
      dirty_files: Array.isArray(projectState.repo_status.dirty_files) ? projectState.repo_status.dirty_files : []
    }
    : await gitMetadata(projectPath);
  const connectionStatus = String(projectState.connection_status ?? (projectState.project_exists === false ? "NOT_CONNECTED" : existsSync(projectPath) ? "CONNECTED" : "NOT_CONNECTED"));
  const doctorStatus = String(projectState.local_orchestrator_status?.doctor_status ?? status.local_orchestrator_status?.doctor_status ?? "unknown");
  const runtimeMemoryDir = resolveRuntimeMemoryDirectory(projectPath, config, projectState);
  const worktrees = resolveWorktrees(configPath, config, repoRoot);
  const bindingStatus = runtimeContext.binding
    ? "attached"
    : projectState.project_id
      ? "context_ready"
      : existsSync(projectPath)
        ? "config_only"
        : "planned";

  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_id: config.project_id,
    project_name: config.project_name ?? config.project_id,
    project_type: config.project_type ?? "managed-project",
    description: config.description ?? "",
    binding_status: bindingStatus,
    config_path: relativeRepoPath(repoRoot, configPath),
    context_dir: relativeRepoPath(repoRoot, runtimeContext.contextDir),
    connector: {
      source_type: config.intake?.source_type ?? "local_path",
      mode: config.mode ?? "external_project_adapter",
      connection_status: connectionStatus,
      doctor_status: doctorStatus,
      default_branch: config.default_branch ?? config.intake?.repo_metadata?.default_branch ?? "unknown",
      package_manager: config.package_manager ?? config.intake?.repo_metadata?.package_manager ?? "unknown"
    },
    execution: {
      execution_route: config.project_id === "anksen-agent-studio" ? "studio_repo" : "managed_project_repo",
      repo_path: projectPath,
      repo_path_display: relativeRepoPath(repoRoot, projectPath),
      repo_resolved: existsSync(projectPath),
      repo_branch: repo.branch,
      repo_head: repo.head,
      repo_clean: repo.clean,
      dirty_files: repo.dirty_files,
      remote_url_present: repo.remote_url_present
    },
    workspace: {
      state_dir: config.state_dir ?? "",
      runtime_memory_dir: runtimeMemoryDir,
      runtime_memory_dir_display: relativeRepoPath(repoRoot, runtimeMemoryDir),
      worktree_count: worktrees.length,
      worktrees
    },
    policies: {
      write_policy: deriveWritePolicy(config, projectState),
      deploy_policy: deriveOperationPolicy(config, "deploy"),
      production_operation_policy: deriveOperationPolicy(config, "migration"),
      credential_values: "disabled",
      dry_run_only: true
    },
    path_policies: {
      read_paths: config.read_paths ?? [],
      write_paths: config.write_paths ?? [],
      frozen_paths: config.frozen_paths ?? [],
      guarded_paths: config.guarded_paths ?? []
    },
    recommended_use: [
      "Use project bind to attach the config and runtime memory into a stable execution route.",
      "Use project exec-context before any task execution to confirm repo path, branch, write policy, and doctor status.",
      "Use project workspace to inspect every attached managed repository in one control-plane summary."
    ],
    safety: {
      agent_execution: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read"
    }
  };
}

export async function buildWorkspaceBindingSummary(repoRoot) {
  const configPaths = await discoverProjectConfigs(repoRoot);
  const bindings = await Promise.all(configPaths.map((configPath) => buildProjectBinding(configPath, repoRoot)));
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    workspace_id: "anksen-agent-studio-local",
    mode: "attached_project_execution_foundation",
    project_count: bindings.length,
    connected_project_count: bindings.filter((binding) => binding.connector.connection_status === "CONNECTED").length,
    planned_project_count: bindings.filter((binding) => binding.connector.connection_status !== "CONNECTED").length,
    writable_project_count: bindings.filter((binding) => binding.policies.write_policy !== "disabled").length,
    managed_repo_routed_count: bindings.filter((binding) => binding.execution.execution_route === "managed_project_repo").length,
    projects: bindings.map((binding) => ({
      project_id: binding.project_id,
      project_name: binding.project_name,
      project_type: binding.project_type,
      binding_status: binding.binding_status,
      context_dir: binding.context_dir,
      config_path: binding.config_path,
      connection_status: binding.connector.connection_status,
      doctor_status: binding.connector.doctor_status,
      execution_route: binding.execution.execution_route,
      repo_path_display: binding.execution.repo_path_display,
      repo_branch: binding.execution.repo_branch,
      repo_clean: binding.execution.repo_clean,
      write_policy: binding.policies.write_policy,
      deploy_policy: binding.policies.deploy_policy,
      production_operation_policy: binding.policies.production_operation_policy,
      worktree_count: binding.workspace.worktree_count
    })),
    safety: {
      managed_project_writes: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "disabled"
    }
  };
}

export async function buildExecContextSummary(projectId, repoRoot) {
  if (projectId === "anksen-agent-studio") {
    const repo = await gitMetadata(repoRoot);
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      project_id: "anksen-agent-studio",
      project_name: "ANKSEN Agent Studio",
      resolved: true,
      execution_route: "studio_repo",
      repo_path: repoRoot,
      repo_path_display: relativeRepoPath(repoRoot, repoRoot),
      repo_branch: repo.branch,
      repo_head: repo.head,
      repo_clean: repo.clean,
      connection_status: "CONNECTED",
      doctor_status: "GO",
      write_policy: "enabled",
      deploy_policy: "forbidden",
      production_operation_policy: "forbidden",
      runtime_memory_dir: resolve(repoRoot, "runtime/global"),
      worktrees: [],
      write_paths: ["runtime/**", "docs/**", "packages/**", "apps/**"],
      guarded_paths: ["**/.env*", "**/*secret*", "**/*private_key*"],
      recommended_checks: [
        "Studio repo execution is local and governed by console/access/runtime policy.",
        "Use release consistency before promoting local changes to a shared environment."
      ]
    };
  }
  const configPaths = await discoverProjectConfigs(repoRoot);
  const match = configPaths.find((configPath) => configPath.includes(`/${projectId}/`));
  if (!match) {
    return {
      schema_version: 1,
      generated_at: new Date().toISOString(),
      project_id: projectId,
      resolved: false,
      reason: `No project config found for ${projectId}.`
    };
  }
  const binding = await buildProjectBinding(match, repoRoot);
  return {
    schema_version: 1,
    generated_at: new Date().toISOString(),
    project_id: binding.project_id,
    project_name: binding.project_name,
    resolved: binding.execution.repo_resolved,
    execution_route: binding.execution.execution_route,
    repo_path: binding.execution.repo_path,
    repo_path_display: binding.execution.repo_path_display,
    repo_branch: binding.execution.repo_branch,
    repo_head: binding.execution.repo_head,
    repo_clean: binding.execution.repo_clean,
    connection_status: binding.connector.connection_status,
    doctor_status: binding.connector.doctor_status,
    write_policy: binding.policies.write_policy,
    deploy_policy: binding.policies.deploy_policy,
    production_operation_policy: binding.policies.production_operation_policy,
    runtime_memory_dir: binding.workspace.runtime_memory_dir,
    worktrees: binding.workspace.worktrees,
    write_paths: binding.path_policies.write_paths,
    guarded_paths: binding.path_policies.guarded_paths,
    recommended_checks: [
      "Verify doctor status before dispatch.",
      "Respect guarded paths even when execution route is resolved.",
      "Keep deploy and production operations disabled from Studio execution flows."
    ]
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
