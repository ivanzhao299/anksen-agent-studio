import { cp, mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";

const root = resolve(import.meta.dirname, "..");
const dist = resolve(root, "dist");
const validation = spawnSync(process.execPath, [resolve(root, "scripts/validate.mjs")], { encoding: "utf8" });
if (validation.status !== 0) {
  process.stderr.write(validation.stdout + validation.stderr);
  process.exit(validation.status || 1);
}

await mkdir(resolve(dist, "src"), { recursive: true });
await mkdir(resolve(dist, "assets"), { recursive: true });
await mkdir(resolve(dist, "icons"), { recursive: true });
await mkdir(resolve(dist, "examples"), { recursive: true });
await mkdir(resolve(dist, "schemas"), { recursive: true });
for (const file of ["manifest.json", "index.html", "styles.css"]) await cp(resolve(root, file), resolve(dist, file));

// UXP's module loader is intentionally smaller than Node's. Bundle local
// CommonJS modules and leave only the native UXP/Photoshop modules external.
const bundle = spawnSync(
  "pnpm",
  ["exec", "esbuild", resolve(root, "index.js"), "--bundle", "--format=cjs", "--platform=neutral", "--external:uxp", "--external:photoshop", `--outfile=${resolve(dist, "index.js")}`],
  { encoding: "utf8" }
);
if (bundle.status !== 0) {
  process.stderr.write(bundle.stdout + bundle.stderr);
  process.exit(bundle.status || 1);
}
for (const file of await readdir(resolve(root, "assets"))) await cp(resolve(root, "assets", file), resolve(dist, "assets", file));
for (const file of await readdir(resolve(root, "icons"))) await cp(resolve(root, "icons", file), resolve(dist, "icons", file));
for (const file of await readdir(resolve(root, "examples"))) await cp(resolve(root, "examples", file), resolve(dist, "examples", file));
for (const file of await readdir(resolve(root, "schemas"))) await cp(resolve(root, "schemas", file), resolve(dist, "schemas", file));

const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const buildInfo = {
  schema_version: 3,
  plugin_id: manifest.id,
  version: manifest.version,
  host: manifest.host,
  built_at: new Date().toISOString(),
  ccx_status: "ready_for_uxp_developer_tool_packaging",
  capability_status: {
    document_inspection: "VERIFIED_OFFLINE",
    operation_dsl: "VERIFIED_OFFLINE",
    capability_registry: "VERIFIED_OFFLINE",
    photoshop_command_graph: "VERIFIED_OFFLINE",
    advanced_atomic_operations: "PARTIALLY_VERIFIED_PHOTOSHOP_27_9",
    print_preflight: "VERIFIED_OFFLINE",
    artifact_manifest: "VERIFIED_OFFLINE",
    photoshop_execution: "VERIFIED_PHOTOSHOP_27_9"
  },
  host_acceptance: {
    host: "Adobe Photoshop 2026 v27.9 on macOS",
    evidence: "anksen-capability-v3-20260804-002631",
    command_count: 24,
    psd: { width: 2400, height: 3600, layers: 7 },
    remaining_operations_are_explicitly_marked: "HOST_ACCEPTANCE_REQUIRED"
  },
  note: "Use UXP Developer Tool > Package. Do not rename a ZIP archive to .ccx."
};
await writeFile(resolve(dist, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(JSON.stringify({ status: "PASS", output: dist, ...buildInfo }, null, 2));
