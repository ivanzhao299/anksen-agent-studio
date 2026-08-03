import { mkdir, readFile, rm } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const release = resolve(root, "release");
const manifestPath = resolve(dist, "manifest.json");
const manifest = JSON.parse(await readFile(manifestPath, "utf8"));

if (manifest.manifestVersion < 4 || manifest.host?.app !== "PS") {
  throw new Error("CCX packaging requires a Photoshop Manifest v4 or newer.");
}
if (!/^\d+\.\d+\.\d+$/.test(manifest.version ?? "")) {
  throw new Error('Manifest version must use the "x.y.z" form.');
}
if (!Array.isArray(manifest.icons)) {
  throw new Error("Manifest must declare an icons array for Adobe UDT packaging compatibility.");
}
for (const entrypoint of manifest.entrypoints ?? []) {
  if (entrypoint.type === "panel" && !Array.isArray(entrypoint.icons)) {
    throw new Error(`Panel ${entrypoint.id} must declare an icons array.`);
  }
}

await mkdir(release, { recursive: true });
const filename = `${manifest.id}_${manifest.host.app}.ccx`;
const output = resolve(release, filename);
await rm(output, { force: true });

// Adobe UXP Developer Tool emits a deflated ZIP container directly with the
// .ccx extension. Build that container from dist; never rename an arbitrary ZIP.
const result = spawnSync("zip", ["-9", "-q", "-r", output, ".", "-x", "*.ccx", "*.xdx", ".DS_Store"], {
  cwd: dist,
  encoding: "utf8"
});
if (result.status !== 0) {
  throw new Error(`CCX packaging failed: ${result.stderr || result.stdout}`);
}

const verification = spawnSync("unzip", ["-t", output], { encoding: "utf8" });
if (verification.status !== 0) {
  throw new Error(`CCX verification failed: ${verification.stderr || verification.stdout}`);
}

console.log(JSON.stringify({
  status: "PASS",
  format: "Adobe UXP CCX (deflated ZIP container)",
  plugin_id: manifest.id,
  version: manifest.version,
  output
}, null, 2));
