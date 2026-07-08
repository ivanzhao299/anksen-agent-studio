import { copyFile, mkdir, readdir, rm, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";

const webDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(webDir, "..", "dist");
const assetsDir = join(webDir, "assets");
const outAssetsDir = join(outDir, "assets");

await rm(outDir, { recursive: true, force: true });
await mkdir(outDir, { recursive: true });
await mkdir(outAssetsDir, { recursive: true });

const buildRoutes = [...consoleWebRoutes, { path: "/login" }, { path: "/register" }];

for (const route of buildRoutes) {
  const fileName = route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
  const html = await renderConsolePage(route.path);
  await writeFile(join(outDir, fileName), html, "utf8");
}

for (const fileName of await readdir(assetsDir)) {
  await copyFile(join(assetsDir, fileName), join(outAssetsDir, fileName));
}

console.log(`Console static build generated ${buildRoutes.length} pages in ${outDir}`);
