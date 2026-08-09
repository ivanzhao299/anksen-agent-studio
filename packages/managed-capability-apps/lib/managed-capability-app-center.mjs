import { randomUUID } from "node:crypto";
import { execFile } from "node:child_process";
import { existsSync } from "node:fs";
import { mkdir, readFile, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { dirname, resolve, sep } from "node:path";
import { fileURLToPath } from "node:url";
import { promisify } from "node:util";

const execFileAsync = promisify(execFile);
const libDir = dirname(fileURLToPath(import.meta.url));
const defaultRepoRoot = resolve(libDir, "../../..");

function expandHome(value) {
  return value === "~" ? homedir() : value.startsWith("~/") ? resolve(homedir(), value.slice(2)) : value;
}

export function validateManagedCapabilityAppRegistry(registry) {
  const errors = [];
  if (registry?.schema_version !== 1) errors.push("schema_version must be 1");
  if (!Array.isArray(registry?.apps)) errors.push("apps must be an array");
  const ids = new Set();
  for (const app of registry?.apps ?? []) {
    if (!/^[a-z0-9][a-z0-9-]+$/.test(app.app_id ?? "")) errors.push(`invalid app_id: ${app.app_id}`);
    if (ids.has(app.app_id)) errors.push(`duplicate app_id: ${app.app_id}`);
    ids.add(app.app_id);
    if (app.boundary?.integration_mode !== "INDEPENDENT_MANAGED_APP") errors.push(`${app.app_id}: integration must remain independent`);
    if (app.boundary?.studio_orchestration !== "HANDOFF_ONLY") errors.push(`${app.app_id}: Studio may only hand off work`);
    if (app.boundary?.progress !== "READ_ONLY_PROJECTION") errors.push(`${app.app_id}: progress must be read-only`);
    if (app.deployment?.commit && !/^[a-f0-9]{40}$/.test(app.deployment.commit)) errors.push(`${app.app_id}: deployment commit must be a full SHA`);
  }
  if (errors.length) throw Object.assign(new Error(errors.join("; ")), { code: "MANAGED_CAPABILITY_APP_REGISTRY_INVALID", errors });
  return registry;
}

export async function loadManagedCapabilityAppRegistry({ repoRoot = defaultRepoRoot, registryPath } = {}) {
  const path = registryPath ?? resolve(repoRoot, "runtime/global/managed-capability-app-registry.json");
  return validateManagedCapabilityAppRegistry(JSON.parse(await readFile(path, "utf8")));
}

export function resolveCapabilityAppInstallation(app, env = process.env) {
  const candidates = [env[app.installation.root_env], ...(app.installation.local_path_candidates ?? [])]
    .filter(Boolean)
    .map((value) => resolve(expandHome(String(value))));
  const root = candidates.find((candidate) => existsSync(resolve(candidate, app.installation.manifest)));
  return { root: root ?? null, candidates, manifest_found: Boolean(root), python: root ? resolve(root, app.installation.python) : null, bridge: root ? resolve(root, app.installation.bridge_entry) : null };
}

async function defaultBridgeInvoker({ app, installation, operation, args = [] }) {
  if (!installation.root || !installation.python || !installation.bridge) throw Object.assign(new Error(`Managed app is not installed: ${app.app_id}`), { code: "CAPABILITY_APP_NOT_INSTALLED" });
  const { stdout } = await execFileAsync(installation.python, [installation.bridge, operation, ...args], { cwd: installation.root, timeout: 30000, maxBuffer: 16 * 1024 * 1024, env: { ...process.env, PYTHONUNBUFFERED: "1" } });
  const payload = JSON.parse(stdout);
  if (!payload.ok) throw Object.assign(new Error(payload.message ?? "Capability app bridge failed"), { code: payload.error ?? "CAPABILITY_APP_BRIDGE_FAILED", payload });
  return payload;
}

function findApp(registry, appId) {
  const app = registry.apps.find((candidate) => candidate.app_id === appId);
  if (!app) throw Object.assign(new Error(`Unknown managed capability app: ${appId}`), { code: "CAPABILITY_APP_NOT_FOUND" });
  return app;
}

function safeProjectId(value) {
  const projectId = String(value ?? "");
  if (!/^[a-z0-9][a-z0-9-]{1,62}$/.test(projectId)) throw Object.assign(new Error("Invalid external project id"), { code: "CAPABILITY_APP_PROJECT_ID_INVALID" });
  return projectId;
}

function safeArtifactPath(value) {
  const artifactPath = String(value ?? "").replaceAll("\\", "/");
  if (!/^(renders|artifacts)\/[A-Za-z0-9._/-]+$/.test(artifactPath) || artifactPath.includes("../")) throw Object.assign(new Error("Invalid capability artifact path"), { code: "CAPABILITY_APP_ARTIFACT_PATH_INVALID" });
  return artifactPath;
}

export function createManagedCapabilityAppCenter({ repoRoot = defaultRepoRoot, registry = null, env = process.env, bridgeInvoker = defaultBridgeInvoker } = {}) {
  const getRegistry = async () => registry ?? loadManagedCapabilityAppRegistry({ repoRoot });
  const invoke = async (app, operation, args = []) => bridgeInvoker({ app, installation: resolveCapabilityAppInstallation(app, env), operation, args });
  return {
    async dashboard({ includeProjectState = false } = {}) {
      const loaded = await getRegistry();
      const apps = await Promise.all(loaded.apps.map(async (app) => {
        const installation = resolveCapabilityAppInstallation(app, env);
        if (!installation.root) return { ...app, status: "UNAVAILABLE", installation, health: null, projects: [], error: "installation manifest not found" };
        try {
          const [health, projects] = await Promise.all([invoke(app, "health"), invoke(app, "projects")]);
          const summaries = projects.projects ?? [];
          const project_states = includeProjectState ? Object.fromEntries(await Promise.all(summaries.slice(0, 20).map(async (project) => {
            try { const state = await invoke(app, "project-state", ["--project-id", safeProjectId(project.project_id)]); return [project.project_id, state.state ? { ...state.state, studio_handoff: state.handoff ?? null, render_job: state.render_job ?? null } : null]; }
            catch { return [project.project_id, null]; }
          }))) : {};
          return { ...app, status: health.status, installation, health, projects: summaries, project_states, error: null };
        } catch (error) { return { ...app, status: "NOT_READY", installation, health: null, projects: [], error: error.message }; }
      }));
      return { schema_version: 1, registry_id: loaded.registry_id, architecture: "FEDERATED_INDEPENDENT_APPS", studio_role: "CONTROL_PLANE_AND_HANDOFF", apps };
    },
    async projectState(appId, projectId) { const loaded = await getRegistry(); return invoke(findApp(loaded, appId), "project-state", ["--project-id", safeProjectId(projectId)]); },
    async deepLink(appId, projectId = null) { const loaded = await getRegistry(); const app = findApp(loaded, appId); return invoke(app, "deep-link", projectId ? ["--project-id", safeProjectId(projectId)] : []); },
    async stageAsset(appId, projectId, inputPath, name) {
      const loaded = await getRegistry(), app = findApp(loaded, appId);
      return invoke(app, "stage-asset", ["--project-id", safeProjectId(projectId), "--input", resolve(String(inputPath)), "--name", String(name)]);
    },
    async startRender(appId, projectId) {
      const loaded = await getRegistry(), app = findApp(loaded, appId);
      return invoke(app, "start-render", ["--project-id", safeProjectId(projectId)]);
    },
    async artifact(appId, projectId, requestedPath) {
      const loaded = await getRegistry();
      const app = findApp(loaded, appId);
      const installation = resolveCapabilityAppInstallation(app, env);
      if (!installation.root) throw Object.assign(new Error("Capability app is unavailable"), { code: "CAPABILITY_APP_NOT_INSTALLED" });
      const id = safeProjectId(projectId), relativePath = safeArtifactPath(requestedPath), root = resolve(installation.root, "projects", id), candidate = resolve(root, relativePath);
      if (!candidate.startsWith(`${root}${sep}`)) throw Object.assign(new Error("Artifact escapes project root"), { code: "CAPABILITY_APP_ARTIFACT_PATH_INVALID" });
      const state = await invoke(app, "project-state", ["--project-id", id]);
      const allowed = new Set((state.state?.media?.renders ?? []).map((item) => resolve(root, item.path)).concat(Object.values(state.state?.artifacts ?? {}).flatMap((item) => item?.outputs ?? []).map((item) => resolve(String(item.path ?? "")))));
      if (!allowed.has(candidate)) throw Object.assign(new Error("Artifact is not declared by the external project"), { code: "CAPABILITY_APP_ARTIFACT_NOT_DECLARED" });
      const info = await stat(candidate);
      if (!info.isFile()) throw Object.assign(new Error("Artifact is not a file"), { code: "CAPABILITY_APP_ARTIFACT_NOT_FOUND" });
      return { path: candidate, size: info.size, contentType: candidate.endsWith(".mp4") ? "video/mp4" : candidate.endsWith(".webm") ? "video/webm" : "application/octet-stream" };
    },
    async createHandoff(appId, input, actor = {}) {
      const loaded = await getRegistry(), app = findApp(loaded, appId), projectId = safeProjectId(input.projectId), handoffId = `handoff-${randomUUID()}`;
      const handoff = { version: "1.0", handoff_id: handoffId, created_at: new Date().toISOString(), source_system: "anksen-agent-studio", handoff_mode: input.mode === "create_project" ? "create_project" : "observe_existing", goal: String(input.goal ?? "").trim(), project: { project_id: projectId, title: String(input.title ?? projectId).trim(), pipeline_type: String(input.pipelineType ?? "hybrid").trim() }, assets: Array.isArray(input.assets) ? input.assets : [], authorization: { local_project_write: true, external_publish: false }, metadata: { actor_user_id: actor.userId ?? null, actor_workspace_id: actor.workspaceId ?? null, studio_execution: "not_used", studio_queue: "not_used" } };
      if (!handoff.goal) throw Object.assign(new Error("Goal is required"), { code: "CAPABILITY_APP_GOAL_REQUIRED" });
      const handoffDir = resolve(repoRoot, "runtime/workspaces/capability-app-handoffs");
      await mkdir(handoffDir, { recursive: true });
      const handoffPath = resolve(handoffDir, `${handoffId}.json`);
      await writeFile(handoffPath, `${JSON.stringify(handoff, null, 2)}\n`, { mode: 0o600 });
      const accepted = await invoke(app, "accept-handoff", ["--input", handoffPath]), record = { handoff, accepted, app_id: appId };
      await writeFile(resolve(handoffDir, `${handoffId}.receipt.json`), `${JSON.stringify(record, null, 2)}\n`, { mode: 0o600 });
      return record;
    }
  };
}
