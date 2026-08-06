import { existsSync, readFileSync, readdirSync } from "node:fs";
import { readdir, readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const webDir = dirname(fileURLToPath(import.meta.url));
const repoRoot = resolve(webDir, "../../..");
const runtimeProjectsDir = resolve(repoRoot, "runtime/projects");
const workspacePath = resolve(repoRoot, "runtime/global/attached-project-workspace.json");

const fallbackProjects = [
  {
    project_id: "anksen-agent-studio",
    project_name: "ANKSEN Agent Studio",
    connection_status: "CONNECTED",
    doctor_status: "PASS",
    execution_route: "governed_codex_runtime",
    repo_branch: "main",
    repo_clean: "yes",
    write_policy: "approval_required",
    config_path: "",
    repo_path_display: repoRoot
  },
  {
    project_id: "jinhu-smart-park",
    project_name: "Jinhu Smart Park",
    connection_status: "CONNECTED",
    doctor_status: "CONDITIONAL_GO",
    execution_route: "managed_project_repo",
    repo_branch: "feature/engineering-project-delivery-runtime",
    repo_clean: "yes",
    write_policy: "disabled",
    config_path: "examples/jinhu-smart-park/project.config.example.json"
  },
  {
    project_id: "phoenix-erp-v3",
    project_name: "Phoenix ERP V3",
    connection_status: "NOT_CONNECTED",
    doctor_status: "NOT_CONNECTED",
    execution_route: "managed_project_repo",
    repo_branch: "planned",
    repo_clean: "not_connected",
    write_policy: "disabled",
    config_path: "examples/phoenix-erp/project.config.example.json",
    repo_path_display: "/Users/mac/Documents/phoenix-erp-v3"
  }
];

function safeParseJson(text) {
  try {
    return JSON.parse(text);
  } catch {
    return null;
  }
}

function projectStatePath(projectId) {
  return join(runtimeProjectsDir, projectId, "project-state.json");
}

function projectBindingPath(projectId) {
  return join(runtimeProjectsDir, projectId, "binding.json");
}

function normalizeProjectRecord(projectId, workspaceProject = {}, state = {}, binding = {}) {
  const connector = binding.connector ?? {};
  const execution = binding.execution ?? {};
  return {
    project_id: projectId,
    label: workspaceProject.project_name ?? binding.project_name ?? state.project_name ?? projectId,
    project_name: workspaceProject.project_name ?? binding.project_name ?? state.project_name ?? projectId,
    project_type: workspaceProject.project_type ?? binding.project_type ?? state.project_type ?? "managed-project",
    connection_status: workspaceProject.connection_status ?? connector.connection_status ?? state.connection_status ?? (state.project_exists === false ? "NOT_CONNECTED" : "CONNECTED"),
    doctor_status: workspaceProject.doctor_status ?? connector.doctor_status ?? state.local_orchestrator_status?.doctor_status ?? "unknown",
    execution_route: workspaceProject.execution_route ?? execution.execution_route ?? "managed_project_repo",
    repo_branch: workspaceProject.repo_branch ?? execution.repo_branch ?? state.repo_status?.branch ?? "unknown",
    repo_clean: workspaceProject.repo_clean ?? execution.repo_clean ?? state.repo_status?.clean ?? "unknown",
    write_policy: workspaceProject.write_policy ?? binding.policies?.write_policy ?? state.safety?.project_writes ?? "disabled",
    config_path: workspaceProject.config_path ?? binding.config_path ?? `examples/${projectId}/project.config.example.json`,
    repo_path_display: workspaceProject.repo_path_display ?? execution.repo_path_display ?? state.project_path ?? "not_connected"
  };
}

function fallbackRegistry() {
  return fallbackProjects.map((project) => ({
    ...project,
    label: project.project_name
  }));
}

async function readRuntimeProjectRecords() {
  if (!existsSync(runtimeProjectsDir)) return { states: new Map(), bindings: new Map() };
  const entries = await readdir(runtimeProjectsDir, { withFileTypes: true });
  const states = new Map();
  const bindings = new Map();
  await Promise.all(entries.filter((entry) => entry.isDirectory()).map(async (entry) => {
    const [state, binding] = await Promise.all([
      existsSync(projectStatePath(entry.name))
        ? readFile(projectStatePath(entry.name), "utf8").then(safeParseJson)
        : Promise.resolve(null),
      existsSync(projectBindingPath(entry.name))
        ? readFile(projectBindingPath(entry.name), "utf8").then(safeParseJson)
        : Promise.resolve(null)
    ]);
    if (state) states.set(entry.name, state);
    if (binding) bindings.set(entry.name, binding);
  }));
  return { states, bindings };
}

function listRuntimeProjectDirsSync() {
  try {
    return existsSync(runtimeProjectsDir)
      ? readdirSync(runtimeProjectsDir, { withFileTypes: true }).filter((entry) => entry.isDirectory()).map((entry) => entry.name)
      : [];
  } catch {
    return [];
  }
}

function readRuntimeProjectRecordsSyncSafe() {
  const states = new Map();
  const bindings = new Map();
  for (const projectId of listRuntimeProjectDirsSync()) {
    const state = existsSync(projectStatePath(projectId))
      ? safeParseJson(readFileSync(projectStatePath(projectId), "utf8"))
      : null;
    const binding = existsSync(projectBindingPath(projectId))
      ? safeParseJson(readFileSync(projectBindingPath(projectId), "utf8"))
      : null;
    if (state) states.set(projectId, state);
    if (binding) bindings.set(projectId, binding);
  }
  return { states, bindings };
}

function buildRegistry(workspace, states, bindings) {
  const workspaceProjects = Array.isArray(workspace?.projects) ? workspace.projects : [];
  const workspaceMap = new Map(workspaceProjects.map((project) => [project.project_id, project]));
  const fallbackMap = new Map(fallbackProjects.map((project) => [project.project_id, project]));
  const ids = workspaceProjects.length > 0
    ? new Set(workspaceProjects.map((project) => project.project_id))
    : new Set([...states.keys(), ...bindings.keys(), ...fallbackProjects.map((project) => project.project_id)]);
  const registry = [...ids].sort((left, right) => left.localeCompare(right)).map((projectId) =>
    normalizeProjectRecord(projectId, workspaceMap.get(projectId) ?? fallbackMap.get(projectId), states.get(projectId), bindings.get(projectId))
  );
  return registry.length > 0 ? registry : fallbackRegistry();
}

export async function loadProjectRegistry() {
  const workspace = existsSync(workspacePath)
    ? safeParseJson(await readFile(workspacePath, "utf8"))
    : null;
  const { states, bindings } = await readRuntimeProjectRecords();
  return buildRegistry(workspace, states, bindings);
}

export function loadProjectRegistrySync() {
  const workspace = existsSync(workspacePath)
    ? safeParseJson(readFileSync(workspacePath, "utf8"))
    : null;
  const { states, bindings } = readRuntimeProjectRecordsSyncSafe();
  return buildRegistry(workspace, states, bindings);
}

export function resolveActiveProjectId(requestedProjectId, projects) {
  const requested = String(requestedProjectId ?? "").trim();
  if (requested && projects.some((project) => project.project_id === requested)) return requested;
  const connected = projects.find((project) => project.connection_status === "CONNECTED");
  return connected?.project_id ?? projects[0]?.project_id ?? "jinhu-smart-park";
}
