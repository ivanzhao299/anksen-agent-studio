import { createHash, randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, unlinkSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { spawn } from "node:child_process";
import { validateGovernedCodexConfig } from "../../../packages/orchestrator-core/lib/governed-codex-config.mjs";

const terminal = new Set(["SUCCEEDED", "FAILED", "CANCELLED", "BLOCKED"]);
const safeId = (value) => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 48) || "run";

export class GovernedRunManager {
  constructor({ repoRoot, storeDir = resolve(repoRoot, "runtime/governed-codex-runs"), runnerPath = resolve(repoRoot, "packages/orchestrator-core/bin/governed-codex-run.mjs"), spawnImpl = spawn } = {}) {
    this.repoRoot = resolve(repoRoot);
    this.storeDir = storeDir;
    this.runnerPath = runnerPath;
    this.spawnImpl = spawnImpl;
  }
  recordPath(id) { return join(this.storeDir, `${id}.json`); }
  configPath(id) { return join(this.storeDir, `${id}.config.json`); }
  logPath(id) { return join(this.storeDir, `${id}.log`); }
  approvalLockPath(id) { return join(this.storeDir, `${id}.approval.lock`); }
  async save(record) { await mkdir(this.storeDir, { recursive: true }); await writeFile(this.recordPath(record.id), `${JSON.stringify(record, null, 2)}\n`, "utf8"); return record; }
  async get(id) { if (!existsSync(this.recordPath(id))) return null; return this.reconcile(JSON.parse(await readFile(this.recordPath(id), "utf8"))); }
  async list() { if (!existsSync(this.storeDir)) return []; const files = await readdir(this.storeDir); const records = await Promise.all(files.filter((file) => file.endsWith(".json") && !file.endsWith(".config.json")).map((file) => readFile(join(this.storeDir, file), "utf8").then(JSON.parse))); return Promise.all(records.sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt))).map((record) => this.reconcile(record))); }
  async create(input, actor = {}) {
    const id = `gcr-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const projectId = safeId(input.projectId);
    const runKey = safeId(`${projectId}-${createHash("sha1").update(`${input.goal}:${id}`).digest("hex").slice(0, 10)}`);
    const config = validateGovernedCodexConfig({ runKey, projectId, projectRoot: input.projectRoot, goal: input.goal, instruction: input.instruction || input.goal, allowedPaths: input.allowedPaths, targetPaths: input.targetPaths ?? input.allowedPaths, blockedPaths: input.blockedPaths ?? [".env", ".env.*", ".git", "node_modules", ".ssh", "deploy", "infra", "terraform"], acceptanceCommands: input.acceptanceCommands ?? ["git diff --check", "pnpm typecheck", "pnpm build"], maxRuntimeSeconds: input.maxRuntimeSeconds ?? 1800, credentialReferenceId: "codex-local-session-ref", policyVersion: `${runKey}-v1` });
    await mkdir(this.storeDir, { recursive: true });
    await writeFile(this.configPath(id), `${JSON.stringify(config, null, 2)}\n`, "utf8");
    return this.save({ schemaVersion: 1, id, status: "PENDING_APPROVAL", createdAt: new Date().toISOString(), updatedAt: new Date().toISOString(), requestedBy: actor.userId ?? "unknown", approvedBy: null, approvedAt: null, projectId, projectRoot: config.projectRoot, goal: config.goal, allowedPaths: config.allowedPaths, targetPaths: config.targetPaths, maxRuntimeSeconds: config.maxRuntimeSeconds, credentialReferenceId: config.credentialReferenceId, policyVersion: config.policyVersion, pid: null, exitCode: null, report: null, error: null, safety: { maxAttempts: 1, allowCommit: false, allowPush: false, allowMerge: false, allowDeploy: false } });
  }
  async approve(id, actor = {}) {
    const record = await this.get(id);
    if (!record) throw Object.assign(new Error("GOVERNED_RUN_NOT_FOUND"), { code: "GOVERNED_RUN_NOT_FOUND" });
    if (record.status !== "PENDING_APPROVAL") throw Object.assign(new Error("GOVERNED_RUN_NOT_PENDING"), { code: "GOVERNED_RUN_NOT_PENDING" });
    let lockFd;
    try { lockFd = openSync(this.approvalLockPath(id), "wx"); } catch { throw Object.assign(new Error("GOVERNED_RUN_APPROVAL_ALREADY_CONSUMED"), { code: "GOVERNED_RUN_APPROVAL_ALREADY_CONSUMED" }); }
    closeSync(lockFd);
    let logFd;
    try {
      logFd = openSync(this.logPath(id), "a");
      const child = this.spawnImpl(process.execPath, [this.runnerPath, this.configPath(id)], { cwd: this.repoRoot, detached: true, stdio: ["ignore", logFd, logFd] });
      child.unref();
      return this.save({ ...record, status: "RUNNING", approvedBy: actor.userId ?? "unknown", approvedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), pid: child.pid });
    } catch (error) {
      try { unlinkSync(this.approvalLockPath(id)); } catch {}
      throw error;
    } finally {
      if (logFd !== undefined) closeSync(logFd);
    }
  }
  async reconcile(record) {
    if (record.status !== "RUNNING" || !record.pid) return record;
    const deadline = new Date(record.approvedAt).getTime() + (record.maxRuntimeSeconds + 60) * 1000;
    const timedOut = Number.isFinite(deadline) && Date.now() > deadline;
    if (!timedOut) { try { process.kill(record.pid, 0); return record; } catch {} }
    if (timedOut) { try { process.kill(record.pid, "SIGTERM"); } catch {} }
    let text = "";
    try { text = await readFile(this.logPath(record.id), "utf8"); } catch {}
    const succeeded = /"conclusion"\s*:\s*"SUCCEEDED"/.test(text);
    const stopped = text.match(/"conclusion"\s*:\s*"STOPPED"[\s\S]*?"code"\s*:\s*"([^"]+)"/);
    const reportMatch = text.match(/\{[\s\S]*"conclusion"\s*:\s*"SUCCEEDED"[\s\S]*\}\s*$/);
    const next = { ...record, status: succeeded ? "SUCCEEDED" : "FAILED", finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString(), exitCode: succeeded ? 0 : 1, error: succeeded ? null : timedOut ? "GOVERNED_RUN_TIMEOUT" : stopped?.[1] ?? "GOVERNED_RUN_PROCESS_EXITED", report: reportMatch ? (() => { try { return JSON.parse(reportMatch[0]); } catch { return null; } })() : null };
    await this.save(next); return next;
  }
  async cancel(id, actor = {}) {
    const record = await this.get(id); if (!record) return null; if (terminal.has(record.status)) return record;
    if (record.status === "RUNNING" && record.pid) { try { process.kill(record.pid, "SIGTERM"); } catch {} }
    return this.save({ ...record, status: "CANCELLED", cancelledBy: actor.userId ?? "unknown", finishedAt: new Date().toISOString(), updatedAt: new Date().toISOString() });
  }
}
