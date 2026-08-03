import { cp, mkdir, readFile, writeFile } from "node:fs/promises";
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
await cp(resolve(root, "assets", "jinhu-logo.jpg"), resolve(dist, "assets", "jinhu-logo.jpg"));
await cp(resolve(root, "examples", "jinhu-poster-job.example.json"), resolve(dist, "examples", "jinhu-poster-job.example.json"));
await cp(resolve(root, "schemas", "photoshop-design-job.schema.json"), resolve(dist, "schemas", "photoshop-design-job.schema.json"));

const manifest = JSON.parse(await readFile(resolve(root, "manifest.json"), "utf8"));
const buildInfo = {
  schema_version: 1,
  plugin_id: manifest.id,
  version: manifest.version,
  host: manifest.host,
  built_at: new Date().toISOString(),
  ccx_status: "ready_for_uxp_developer_tool_packaging",
  note: "Use UXP Developer Tool > Package. Do not rename a ZIP archive to .ccx."
};
await writeFile(resolve(dist, "build-info.json"), `${JSON.stringify(buildInfo, null, 2)}\n`);
console.log(JSON.stringify({ status: "PASS", output: dist, ...buildInfo }, null, 2));
