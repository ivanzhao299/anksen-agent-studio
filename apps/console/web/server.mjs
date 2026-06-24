import { createServer } from "node:http";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";

const port = Number(process.env.PORT ?? 4317);
const allowedPaths = new Set(consoleWebRoutes.map((route) => route.path));

const server = createServer(async (request, response) => {
  try {
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/dashboard" ? "/" : url.pathname;
    if (!allowedPaths.has(pathname)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Console route not found.");
      return;
    }
    const html = await renderConsolePage(pathname);
    response.writeHead(200, {
      "content-type": "text/html; charset=utf-8",
      "cache-control": "no-store"
    });
    response.end(html);
  } catch (error) {
    response.writeHead(500, { "content-type": "text/plain; charset=utf-8" });
    response.end(`Console render error: ${error instanceof Error ? error.message : String(error)}`);
  }
});

server.listen(port, "127.0.0.1", () => {
  console.log(`ANKSEN Agent Studio Console running at http://127.0.0.1:${port}`);
  console.log("Mode: local read-only pilot. No external calls, deploy, production operations, model calls, or secret reads.");
});
