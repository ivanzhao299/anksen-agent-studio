import { randomBytes, randomUUID, timingSafeEqual } from "node:crypto";
import { mkdir, readFile, rename, writeFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";

const nowIso = clock => clock().toISOString();
const cleanId = value => String(value ?? "").trim().replace(/[^a-zA-Z0-9._:-]/g, "-").slice(0, 120);
const copy = value => JSON.parse(JSON.stringify(value));

export function bearerToken(request) {
  const match = String(request.headers?.authorization ?? "").match(/^Bearer\s+(.+)$/i);
  return match?.[1]?.trim() ?? "";
}

export function tokenMatches(actual, expected) {
  const left = Buffer.from(String(actual ?? "")), right = Buffer.from(String(expected ?? ""));
  return left.length > 0 && left.length === right.length && timingSafeEqual(left, right);
}

export class ResidentWorkerBroker {
  constructor({ storePath, clock = () => new Date(), leaseMs = 45_000 } = {}) {
    this.storePath = resolve(storePath);
    this.clock = clock;
    this.leaseMs = leaseMs;
    this.serial = Promise.resolve();
  }
  async locked(operation) {
    const next = this.serial.then(operation, operation);
    this.serial = next.catch(() => {});
    return next;
  }
  async load() {
    try { return JSON.parse(await readFile(this.storePath, "utf8")); }
    catch (error) {
      if (error?.code !== "ENOENT") throw error;
      return { schemaVersion: 1, workers: {}, tasks: {}, fencing: 0 };
    }
  }
  async save(store) {
    await mkdir(dirname(this.storePath), { recursive: true });
    const temporary = `${this.storePath}.${process.pid}.${randomUUID()}.tmp`;
    await writeFile(temporary, `${JSON.stringify(store, null, 2)}\n`, { mode: 0o600 });
    await rename(temporary, this.storePath);
  }
  async register(input) {
    return this.locked(async () => {
      const workerId = cleanId(input.workerId);
      if (!workerId) throw Object.assign(new Error("WORKER_ID_REQUIRED"), { code: "WORKER_ID_REQUIRED" });
      const projects = Array.isArray(input.projects) ? input.projects.map(item => ({ projectId: cleanId(item.projectId), pathRef: String(item.pathRef ?? "").trim() })).filter(item => item.projectId && item.pathRef) : [];
      if (!projects.length) throw Object.assign(new Error("WORKER_PROJECTS_REQUIRED"), { code: "WORKER_PROJECTS_REQUIRED" });
      const store = await this.load(), at = nowIso(this.clock);
      store.workers[workerId] = { workerId, status: "ONLINE", registeredAt: store.workers[workerId]?.registeredAt ?? at, lastHeartbeatAt: at, projects, capabilities: [...new Set((input.capabilities ?? []).map(String))], credentialReferenceId: String(input.credentialReferenceId ?? "codex-local-session-ref"), lifecycle: input.lifecycle && typeof input.lifecycle === "object" ? { status: String(input.lifecycle.status ?? "UNKNOWN"), fingerprint: String(input.lifecycle.fingerprint ?? ""), inspectedAt: String(input.lifecycle.inspectedAt ?? at), projectCount: Number(input.lifecycle.projectCount ?? projects.length) } : null, autoExecute: input.autoExecute === true, activeTaskId: null };
      await this.save(store);
      return copy(store.workers[workerId]);
    });
  }
  async heartbeat(workerId, input = {}) {
    return this.locked(async () => {
      const store = await this.load(), worker = store.workers[cleanId(workerId)];
      if (!worker) throw Object.assign(new Error("WORKER_NOT_REGISTERED"), { code: "WORKER_NOT_REGISTERED" });
      worker.status = "ONLINE"; worker.lastHeartbeatAt = nowIso(this.clock); worker.activeTaskId = input.activeTaskId ?? worker.activeTaskId ?? null;
      await this.save(store); return copy(worker);
    });
  }
  async enqueue(input, actor = {}) {
    return this.locked(async () => {
      const projectId = cleanId(input.projectId), goal = String(input.goal ?? "").trim();
      if (!projectId || !goal) throw Object.assign(new Error("TASK_PROJECT_AND_GOAL_REQUIRED"), { code: "TASK_PROJECT_AND_GOAL_REQUIRED" });
      const mode = input.mode === "GOVERNED_WRITE" ? "GOVERNED_WRITE" : "READ_ONLY";
      if (mode === "GOVERNED_WRITE" && input.approved !== true) throw Object.assign(new Error("WRITE_TASK_APPROVAL_REQUIRED"), { code: "WRITE_TASK_APPROVAL_REQUIRED" });
      const store = await this.load(), taskId = cleanId(input.taskId) || randomUUID(), at = nowIso(this.clock);
      if (store.tasks[taskId]) return copy(store.tasks[taskId]);
      store.tasks[taskId] = { taskId, projectId, goal, instruction: String(input.instruction ?? goal), mode, status: "QUEUED", allowedPaths: Array.isArray(input.allowedPaths) ? input.allowedPaths.map(String) : [], acceptanceCommands: Array.isArray(input.acceptanceCommands) ? input.acceptanceCommands.map(String) : [], createdAt: at, createdBy: actor.userId ?? "studio", approvedAt: mode === "GOVERNED_WRITE" ? at : null, lease: null, result: null };
      await this.save(store); return copy(store.tasks[taskId]);
    });
  }
  async claim(workerId) {
    return this.locked(async () => {
      const store = await this.load(), id = cleanId(workerId), worker = store.workers[id];
      if (!worker) throw Object.assign(new Error("WORKER_NOT_REGISTERED"), { code: "WORKER_NOT_REGISTERED" });
      const now = this.clock(), projectIds = new Set(worker.projects.map(item => item.projectId));
      for (const task of Object.values(store.tasks)) if (task.status === "LEASED" && new Date(task.lease.expiresAt) <= now) { task.status = "QUEUED"; task.lease = null; }
      const capabilities = new Set(worker.capabilities);
      const task = Object.values(store.tasks).filter(item => item.status === "QUEUED" && projectIds.has(item.projectId) && (item.mode === "READ_ONLY" || capabilities.has("codex.exec.governed-write"))).sort((a, b) => a.createdAt.localeCompare(b.createdAt))[0];
      worker.lastHeartbeatAt = now.toISOString();
      if (!task) { await this.save(store); return null; }
      const leaseToken = randomBytes(32).toString("base64url"), fencingToken = ++store.fencing;
      task.status = "LEASED"; task.lease = { workerId: id, token: leaseToken, fencingToken, claimedAt: now.toISOString(), expiresAt: new Date(now.getTime() + this.leaseMs).toISOString() };
      worker.activeTaskId = task.taskId; await this.save(store);
      return { ...copy(task), lease: { ...copy(task.lease), token: leaseToken } };
    });
  }
  async renew(workerId, taskId, input) {
    return this.locked(async () => {
      const store = await this.load(), task = store.tasks[cleanId(taskId)], lease = task?.lease;
      if (!task || task.status !== "LEASED" || lease.workerId !== cleanId(workerId) || lease.fencingToken !== Number(input.fencingToken) || !tokenMatches(input.leaseToken, lease.token)) throw Object.assign(new Error("LEASE_LOST"), { code: "LEASE_LOST" });
      lease.expiresAt = new Date(this.clock().getTime() + this.leaseMs).toISOString();
      store.workers[lease.workerId].lastHeartbeatAt = nowIso(this.clock); await this.save(store);
      return { taskId: task.taskId, fencingToken: lease.fencingToken, expiresAt: lease.expiresAt };
    });
  }
  async complete(workerId, taskId, input) {
    return this.locked(async () => {
      const store = await this.load(), task = store.tasks[cleanId(taskId)], lease = task?.lease;
      if (!task || task.status !== "LEASED" || lease.workerId !== cleanId(workerId) || lease.fencingToken !== Number(input.fencingToken) || !tokenMatches(input.leaseToken, lease.token)) throw Object.assign(new Error("LEASE_LOST"), { code: "LEASE_LOST" });
      task.status = input.status === "SUCCEEDED" ? "SUCCEEDED" : "FAILED";
      task.result = { status: task.status, summary: String(input.summary ?? "").slice(0, 100_000), evidence: input.evidence ?? {}, completedAt: nowIso(this.clock), workerId: lease.workerId, fencingToken: lease.fencingToken };
      task.lease = { workerId: lease.workerId, fencingToken: lease.fencingToken, claimedAt: lease.claimedAt, expiresAt: lease.expiresAt };
      store.workers[lease.workerId].activeTaskId = null; await this.save(store); return copy(task);
    });
  }
  async dashboard() {
    const store = await this.load();
    return { workers: Object.values(store.workers).map(copy), tasks: Object.values(store.tasks).map(task => ({ ...copy(task), lease: task.lease ? { ...copy(task.lease), token: undefined } : null })) };
  }
}
