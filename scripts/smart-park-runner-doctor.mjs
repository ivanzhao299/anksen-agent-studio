#!/usr/bin/env node
import { spawnSync } from "node:child_process";
import { existsSync, readFileSync } from "node:fs";

const envFile = process.env.SMART_PARK_RUNNER_ENV_FILE || "/etc/anksen-runner/smart-park-runner.env";
const checks = [];
const check = (name, pass, detail) => checks.push({ name, status: pass ? "PASS" : "FAIL", detail });
check("environment file", existsSync(envFile), envFile);
if (existsSync(envFile)) {
  const text = readFileSync(envFile, "utf8");
  check("runner credentials configured", /SMART_PARK_RUNNER_USER=.+/.test(text) && /SMART_PARK_RUNNER_PASSWORD=.+/.test(text), "username/password must be external secrets");
  check("auto release switch explicit", /SMART_PARK_AUTO_RELEASE=(true|false)/.test(text), "must be explicitly configured");
}
for (const command of ["git", "node", "pnpm", "codex"]) check(`binary ${command}`, spawnSync("sh", ["-lc", `command -v ${command}`]).status === 0, command);
const studio = process.env.ANKSEN_STUDIO_ROOT || "/srv/agent-studio";
const project = process.env.SMART_PARK_PROJECT_ROOT || "/srv/managed-projects/jinhu-smart-park/state";
for (const [name, root] of [["studio", studio], ["smart park", project]]) {
  const status = spawnSync("git", ["-C", root, "status", "--porcelain"], { encoding: "utf8" });
  check(`${name} repository clean`, status.status === 0 && !status.stdout.trim(), root);
}
const failed = checks.filter(item => item.status === "FAIL");
console.log(JSON.stringify({ status: failed.length ? "HOLD" : "READY", checks }, null, 2));
process.exitCode = failed.length ? 1 : 0;
