#!/usr/bin/env node
import { mkdir, readFile, rm, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { homedir } from "node:os";
import { spawnSync } from "node:child_process";

const label = "com.anksen.agent-studio.mac-resident-worker";
const home = homedir(), configDir = resolve(home, ".anksen-agent-studio"), plist = resolve(home, "Library/LaunchAgents", `${label}.plist`);
const worker = resolve(new URL("./mac-resident-worker.mjs", import.meta.url).pathname), config = resolve(configDir, "mac-resident-worker.json");
const action = process.argv[2] ?? "status", uid = process.getuid();
const launchctl = (...args) => spawnSync("launchctl", args, { encoding: "utf8" });
if (action === "install") {
  await mkdir(resolve(home, "Library/LaunchAgents"), { recursive: true }); await mkdir(configDir, { recursive: true });
  const xml = `<?xml version="1.0" encoding="UTF-8"?>\n<!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd">\n<plist version="1.0"><dict><key>Label</key><string>${label}</string><key>ProgramArguments</key><array><string>${process.execPath}</string><string>${worker}</string></array><key>EnvironmentVariables</key><dict><key>HOME</key><string>${home}</string><key>PATH</key><string>/opt/homebrew/bin:/usr/local/bin:/usr/bin:/bin</string><key>STUDIO_RESIDENT_CONFIG</key><string>${config}</string></dict><key>RunAtLoad</key><true/><key>KeepAlive</key><true/><key>ThrottleInterval</key><integer>10</integer><key>StandardOutPath</key><string>${resolve(configDir, "worker.out.log")}</string><key>StandardErrorPath</key><string>${resolve(configDir, "worker.err.log")}</string></dict></plist>\n`;
  await writeFile(plist, xml, { mode: 0o600 }); console.log(JSON.stringify({ status: "INSTALLED_NOT_ENABLED", plist, next: "enable" }, null, 2));
} else if (action === "enable") {
  launchctl("bootout", `gui/${uid}`, plist); const result = launchctl("bootstrap", `gui/${uid}`, plist); if (result.status !== 0) throw new Error(result.stderr || "LAUNCH_AGENT_ENABLE_FAILED"); console.log(JSON.stringify({ status: "ENABLED", label }, null, 2));
} else if (action === "disable") {
  launchctl("bootout", `gui/${uid}`, plist); console.log(JSON.stringify({ status: "DISABLED", label }, null, 2));
} else if (action === "uninstall") {
  launchctl("bootout", `gui/${uid}`, plist); await rm(plist, { force: true }); console.log(JSON.stringify({ status: "UNINSTALLED", label }, null, 2));
} else {
  const result = launchctl("print", `gui/${uid}/${label}`); console.log(JSON.stringify({ status: result.status === 0 ? "RUNNING" : "STOPPED", label }, null, 2));
}
