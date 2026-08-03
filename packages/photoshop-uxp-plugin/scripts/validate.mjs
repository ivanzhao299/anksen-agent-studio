import { readFile, access } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dirname, "..");
const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const required = ["index.html", "index.js", "styles.css", "src/job-contract.cjs", "src/jinhu-template.cjs", "src/photoshop-executor.cjs"];
const failures = [];

if (manifest.manifestVersion !== 5) failures.push("manifestVersion must be 5");
if (manifest.host?.app !== "PS") failures.push("host.app must be PS");
if (!manifest.host?.minVersion) failures.push("host.minVersion is required");
if (!manifest.entrypoints?.some(entry => entry.type === "panel")) failures.push("a panel entrypoint is required");
if (manifest.requiredPermissions?.network?.domains?.some(domain => domain === "*" || domain.includes("localhost"))) failures.push("network domains must be explicit governed HTTPS endpoints");

for (const file of required) {
  try { await access(resolve(root, file)); } catch { failures.push(`missing file: ${file}`); }
}

if (failures.length) {
  console.error(JSON.stringify({ status: "FAIL", failures }, null, 2));
  process.exitCode = 1;
} else {
  console.log(JSON.stringify({ status: "PASS", manifestVersion: 5, host: "PS", files: required.length }, null, 2));
}
