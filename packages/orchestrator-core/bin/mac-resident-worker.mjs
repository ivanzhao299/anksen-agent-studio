#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, realpathSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { homedir } from "node:os";
import { ProjectLifecycleCapability } from "../../project-connector/lib/project-lifecycle-capability.mjs";
import { assertRepositoryIdentity } from "../lib/repository-identity.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
assertRepositoryIdentity(repoRoot);

const configPath = resolve(process.env.STUDIO_RESIDENT_CONFIG ?? `${homedir()}/.anksen-agent-studio/mac-resident-worker.json`);
const config = JSON.parse(await readFile(configPath, "utf8"));
const token = (await readFile(resolve(config.tokenFile), "utf8")).trim();
if (!token) throw new Error("RESIDENT_WORKER_TOKEN_EMPTY");
const baseUrl = String(config.baseUrl).replace(/\/$/, ""), workerId = String(config.workerId);
const pollMs = Math.max(1000, Number(config.pollMs ?? 5000)), once = process.argv.includes("--once");
const codex = resolve(config.codexPath ?? "/opt/homebrew/bin/codex");
let active = null, stopping = false;
const lifecycle = config.projectRegistryFile ? new ProjectLifecycleCapability({ registryPath: config.projectRegistryFile, ownershipStateDir: config.workspaceOwnershipStateDir, maxManagedWorktreesPerProject: Number(config.maxManagedWorktreesPerProject ?? 3) }) : null;
let lifecycleSnapshot = null, lifecycleSnapshotAt = 0;

const api = async (path, body) => {
  const response = await fetch(`${baseUrl}${path}`, { method: "POST", headers: { authorization: `Bearer ${token}`, "content-type": "application/json" }, body: JSON.stringify(body ?? {}), signal: AbortSignal.timeout(Number(config.requestTimeoutMs ?? 20_000)) });
  const value = await response.json().catch(() => ({}));
  if (!response.ok) throw Object.assign(new Error(value.reason ?? value.status ?? `HTTP_${response.status}`), { code: value.status ?? `HTTP_${response.status}` });
  return value;
};
const configuredProjectRows = () => Object.entries(config.projects ?? {}).map(([projectId, path]) => {
  const canonical = realpathSync(resolve(path));
  return { projectId, path: canonical, pathRef: `local://${projectId}` };
});
const refreshLifecycle = async () => {
  if (lifecycle && (!lifecycleSnapshot || Date.now() - lifecycleSnapshotAt > Number(config.projectInventoryRefreshMs ?? 60_000))) {
    lifecycleSnapshot = await lifecycle.inspect(); lifecycleSnapshotAt = Date.now();
  }
  return lifecycleSnapshot;
};
const projectRows = async ({ requireReady = true } = {}) => {
  if (!lifecycle) return configuredProjectRows();
  await refreshLifecycle();
  if (requireReady && lifecycleSnapshot.status !== "READY") throw Object.assign(new Error("PROJECT_LIFECYCLE_CAPABILITY_BLOCKED"), { code: "PROJECT_LIFECYCLE_CAPABILITY_BLOCKED", report: lifecycleSnapshot });
  return lifecycleSnapshot.projects;
};
const projectPath = async projectId => (await projectRows()).find(item => item.projectId === projectId)?.path;
const runCodex = (task, cwd) => new Promise((resolveRun, rejectRun) => {
  const output = resolve(dirname(configPath), `result-${task.taskId}.txt`);
  const guard = "Do not modify files, do not commit, push, deploy, or contact external services. Inspect only and return concise evidence.";
  const prompt = `${guard}\n\nTask: ${task.goal}\n\nInstruction: ${task.instruction}`;
  const child = spawn(codex, ["exec", "--ephemeral", "--sandbox", "read-only", "--cd", cwd, "--output-last-message", output, prompt], { cwd, env: { ...process.env, CODEX_HOME: resolve(config.codexHome ?? `${homedir()}/.codex`) }, stdio: ["ignore", "pipe", "pipe"] });
  let stdout = "", stderr = "";
  child.stdout.on("data", chunk => { stdout = `${stdout}${chunk}`.slice(-200_000); });
  child.stderr.on("data", chunk => { stderr = `${stderr}${chunk}`.slice(-200_000); });
  child.on("error", rejectRun);
  child.on("exit", async code => resolveRun({ code, stdout, stderr, summary: existsSync(output) ? await readFile(output, "utf8") : stderr || stdout }));
});
async function execute(task) {
  const cwd = await projectPath(task.projectId);
  if (!cwd) throw new Error("PROJECT_MAPPING_MISSING");
  if (task.mode !== "READ_ONLY") throw new Error("GOVERNED_WRITE_NOT_ENABLED_ON_WORKER");
  active = task.taskId;
  const renew = setInterval(() => api(`/api/resident-workers/${encodeURIComponent(workerId)}/tasks/${encodeURIComponent(task.taskId)}/lease`, { leaseToken: task.lease.token, fencingToken: task.lease.fencingToken }).catch(error => { console.error("lease renewal failed", error.code ?? error.message); stopping = true; }), Math.max(1000, Math.floor(Number(config.leaseHeartbeatMs ?? 15000))));
  renew.unref();
  try {
    const result = await runCodex(task, cwd), status = result.code === 0 ? "SUCCEEDED" : "FAILED";
    return await api(`/api/resident-workers/${encodeURIComponent(workerId)}/tasks/${encodeURIComponent(task.taskId)}/result`, { leaseToken: task.lease.token, fencingToken: task.lease.fencingToken, status, summary: result.summary, evidence: { exitCode: result.code, projectPathRef: `local://${task.projectId}`, credentialReferenceId: config.credentialReferenceId ?? "codex-local-session-ref", stderrTail: result.stderr.slice(-4000) } });
  } finally { clearInterval(renew); active = null; }
}
async function cycle({ claim }) {
  const rows = await projectRows({ requireReady: false }), publicProjects = rows.map(({ projectId, pathRef }) => ({ projectId, pathRef }));
  await api("/api/resident-workers/register", { workerId, projects: publicProjects, capabilities: ["codex.exec.read-only", "lease-heartbeat", "result-callback", "project-lifecycle-governance-v1"], credentialReferenceId: config.credentialReferenceId ?? "codex-local-session-ref", autoExecute: config.autoExecute === true, lifecycle: lifecycleSnapshot ? { status: lifecycleSnapshot.status, fingerprint: lifecycleSnapshot.fingerprint, inspectedAt: lifecycleSnapshot.inspectedAt, projectCount: lifecycleSnapshot.projectCount, violations: lifecycleSnapshot.violations.map(({ code, projectId, count, limit }) => ({ code, projectId, count, limit })) } : null });
  await api(`/api/resident-workers/${encodeURIComponent(workerId)}/heartbeat`, { activeTaskId: active });
  if (!claim || lifecycleSnapshot?.status !== "READY") return null;
  const task = await api(`/api/resident-workers/${encodeURIComponent(workerId)}/claim`, {});
  return task.task ? execute(task.task) : null;
}
process.on("SIGTERM", () => { stopping = true; }); process.on("SIGINT", () => { stopping = true; });
if (once) {
  const result = await cycle({ claim: true });
  process.stdout.write(`${JSON.stringify({ status: result ? result.status : "IDLE", taskId: result?.taskId ?? null }, null, 2)}\n`);
} else {
  while (!stopping) { try { await cycle({ claim: config.autoExecute === true }); } catch (error) { console.error(new Date().toISOString(), error.code ?? error.message); } await new Promise(resolveWait => setTimeout(resolveWait, pollMs)); }
}
