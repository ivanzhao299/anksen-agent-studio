#!/usr/bin/env node
import { spawn } from "node:child_process";
import { existsSync, openSync } from "node:fs";
import { copyFile, mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { assertRepositoryIdentity } from "../lib/repository-identity.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
assertRepositoryIdentity(repoRoot);
const runtimeDir = resolve(repoRoot, "runtime/autonomous-development");
const pidPath = resolve(runtimeDir, "worker.pid");
const supervisorPath = resolve(repoRoot, "packages/orchestrator-core/bin/autonomous-development-worker-supervisor.mjs");
const launchAgentLabel = "com.anksen.agent-studio.autonomous-development";
const launchAgentSource = resolve(runtimeDir, `${launchAgentLabel}.plist`);
const launchAgentTarget = resolve(homedir(), "Library/LaunchAgents", `${launchAgentLabel}.plist`);
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
  const child = spawn(process.execPath, [supervisorPath], { cwd: repoRoot, detached: true, stdio: ["ignore", stdout, stderr], env: process.env });
  child.unref();
  await writeFile(pidPath, `${child.pid}\n`, "utf8");
  console.log(JSON.stringify({ status: "STARTED", pid: child.pid }, null, 2));
} else if (action === "stop") {
  const runningPid = await pid();
  if (!runningPid) { console.log(JSON.stringify({ status: "ALREADY_STOPPED" }, null, 2)); process.exit(0); }
  process.kill(runningPid, "SIGTERM");
  await rm(pidPath, { force: true });
  console.log(JSON.stringify({ status: "STOPPING", pid: runningPid }, null, 2));
} else if (action === "install") {
  const plist=`<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${launchAgentLabel}</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${supervisorPath}</string></array><key>WorkingDirectory</key><string>${repoRoot}</string><key>EnvironmentVariables</key><dict><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin:/usr/sbin:/sbin</string><key>HOME</key><string>${homedir()}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><dict><key>SuccessfulExit</key><false/></dict><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${resolve(runtimeDir,"worker.out.log")}</string><key>StandardErrorPath</key><string>${resolve(runtimeDir,"worker.err.log")}</string></dict></plist>\n`;
  await writeFile(launchAgentSource,plist,"utf8");await mkdir(resolve(launchAgentTarget,".."),{recursive:true});await copyFile(launchAgentSource,launchAgentTarget);
  console.log(JSON.stringify({status:"INSTALLED",label:launchAgentLabel,path:launchAgentTarget,loaded:false,note:"Use launchctl bootstrap only after the current detached service is stopped."},null,2));
} else if(action==="uninstall"){
  await rm(launchAgentTarget,{force:true});console.log(JSON.stringify({status:"UNINSTALLED",label:launchAgentLabel,path:launchAgentTarget},null,2));
} else {
  throw new Error(`Unsupported action: ${action}`);
}
