import { mkdir, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";

const webDir = dirname(fileURLToPath(import.meta.url));
const outDir = join(webDir, "..", "dist");

await mkdir(outDir, { recursive: true });

for (const route of consoleWebRoutes) {
  const fileName = route.path === "/" ? "index.html" : `${route.path.slice(1)}.html`;
  const html = await renderConsolePage(route.path);
  await writeFile(join(outDir, fileName), html, "utf8");
}

console.log(`Console static build generated ${consoleWebRoutes.length} pages in ${outDir}`);
