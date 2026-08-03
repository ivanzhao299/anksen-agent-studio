#!/usr/bin/env node
import { spawn, spawnSync } from "node:child_process";
import { constants } from "node:fs";
import { access, mkdir, readFile, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { ensurePostgresFixture } from "../lib/postgres-fixture.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const runtimeDir = resolve(repoRoot, "runtime/autonomous-development");
const workerPath = resolve(repoRoot, "packages/orchestrator-core/bin/autonomous-development-worker.mjs");
const statePath = resolve(runtimeDir, "supervisor-state.json");
const incidentPath = resolve(runtimeDir, "supervisor-incident.json");
const pidPath = resolve(runtimeDir, "worker.pid");
const codexPath = "/Applications/ChatGPT.app/Contents/Resources/codex";
let stopping = false, child = null;
process.on("SIGTERM", () => { stopping = true; child?.kill("SIGTERM"); });
process.on("SIGINT", () => { stopping = true; child?.kill("SIGTERM"); });
const wait = ms => new Promise(resolvePromise => setTimeout(resolvePromise, ms));

async function preflight() {
  await mkdir(runtimeDir, { recursive: true });
  await access(runtimeDir, constants.R_OK | constants.W_OK);
  const version = spawnSync(codexPath, ["--version"], { encoding: "utf8" });
  const login = spawnSync(codexPath, ["login", "status"], { encoding: "utf8" });
  if (version.status !== 0 || login.status !== 0) throw Object.assign(new Error("CODEX_HEALTH_FAILED"), { code: "CODEX_HEALTH_FAILED" });
  await ensurePostgresFixture();
  return { codexVersion: version.stdout.trim(), login: login.stdout.trim(), postgres: "READY", store: "READ_WRITE" };
}

function runWorker() {
  return new Promise(resolvePromise => {
    child = spawn(process.execPath, [workerPath], { cwd: repoRoot, env: process.env, stdio: "inherit" });
    child.once("exit", (code, signal) => { child = null; resolvePromise({ code, signal }); });
  });
}

let restarts = [];
await mkdir(runtimeDir,{recursive:true});
await writeFile(pidPath,`${process.pid}\n`,`utf8`);
while (!stopping) {
  try {
    const health = await preflight();
    await writeFile(statePath, `${JSON.stringify({ status: "HEALTHY", supervisorPid: process.pid, health, restarts, checkedAt: new Date().toISOString() }, null, 2)}\n`);
  } catch (error) {
    await writeFile(incidentPath, `${JSON.stringify({ status: "PREFLIGHT_FAILED", code: error.code ?? error.message, at: new Date().toISOString(), supervisorPid: process.pid }, null, 2)}\n`);
    process.exitCode = 1;
    break;
  }
  const result = await runWorker();
  if (stopping) break;
  const now = Date.now();
  restarts = restarts.filter(value => now - value < 5 * 60 * 1000);
  restarts.push(now);
  if (restarts.length > 3) {
    await writeFile(incidentPath, `${JSON.stringify({ status: "CRASH_LOOP", restarts: restarts.length, windowSeconds: 300, lastResult: result, at: new Date().toISOString() }, null, 2)}\n`);
    await writeFile(statePath, `${JSON.stringify({ status: "CRASH_LOOP", supervisorPid: process.pid, restarts, at: new Date().toISOString() }, null, 2)}\n`);
    process.exitCode = 1;
    break;
  }
  await wait(Math.min(30_000, 1000 * (2 ** (restarts.length - 1))));
}
