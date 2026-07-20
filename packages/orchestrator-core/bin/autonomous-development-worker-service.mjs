#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const runtimeDir = resolve(repoRoot, "runtime/autonomous-development");
const pidPath = resolve(runtimeDir, "worker.pid");
const workerPath = resolve(repoRoot, "packages/orchestrator-core/bin/autonomous-development-worker.mjs");
const action = process.argv[2] || "status";

async function pid() {
  if (!existsSync(pidPath)) return null;
  const value = Number((await readFile(pidPath, "utf8")).trim());
  if (!Number.isInteger(value)) return null;
  try { process.kill(value, 0); return value; } catch { await rm(pidPath, { force: true }); return null; }
}

await mkdir(runtimeDir, { recursive: true });
if (action === "status") {
  const runningPid = await pid();
  console.log(JSON.stringify({ status: runningPid ? "RUNNING" : "STOPPED", pid: runningPid }, null, 2));
} else if (action === "start") {
  const existing = await pid();
  if (existing) { console.log(JSON.stringify({ status: "ALREADY_RUNNING", pid: existing }, null, 2)); process.exit(0); }
  const stdout = openSync(resolve(runtimeDir, "worker.out.log"), "a");
  const stderr = openSync(resolve(runtimeDir, "worker.err.log"), "a");
  const child = spawn(process.execPath, [workerPath], { cwd: repoRoot, detached: true, stdio: ["ignore", stdout, stderr], env: process.env });
  child.unref();
  await writeFile(pidPath, `${child.pid}\n`, "utf8");
  console.log(JSON.stringify({ status: "STARTED", pid: child.pid }, null, 2));
} else if (action === "stop") {
  const runningPid = await pid();
  if (!runningPid) { console.log(JSON.stringify({ status: "ALREADY_STOPPED" }, null, 2)); process.exit(0); }
  process.kill(runningPid, "SIGTERM");
  await rm(pidPath, { force: true });
  console.log(JSON.stringify({ status: "STOPPING", pid: runningPid }, null, 2));
} else {
  throw new Error(`Unsupported action: ${action}`);
}
