import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";
import {
  cancelConversationAction,
  createActionPlan,
  executeConsoleAction,
  getConversationAction,
  latestActionLog,
  startConversationAction
} from "./action-server.mjs";

const port = Number(process.env.PORT ?? 4317);
const allowedPaths = new Set(consoleWebRoutes.map((route) => route.path));
const webDir = dirname(fileURLToPath(import.meta.url));
const logoPath = join(webDir, "assets", "anksen-logo.svg");

function localOnly(request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
}

function sendJson(response, status, value) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store"
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  for await (const chunk of request) chunks.push(chunk);
  const text = Buffer.concat(chunks).toString("utf8");
  return text.trim() ? JSON.parse(text) : {};
}

const server = createServer(async (request, response) => {
  try {
    if (!localOnly(request)) {
      sendJson(response, 403, { status: "BLOCKED", reason: "Console Action Server only accepts local 127.0.0.1 requests." });
      return;
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/dashboard" ? "/" : url.pathname;
    const actionRunMatch = pathname.match(/^\/api\/actions\/([^/]+)$/);
    const actionCancelMatch = pathname.match(/^\/api\/actions\/([^/]+)\/cancel$/);
    if (request.method === "POST" && pathname === "/api/actions/start") {
      sendJson(response, 202, await startConversationAction(await readJsonBody(request)));
      return;
    }
    if (request.method === "GET" && actionRunMatch) {
      const run = getConversationAction(decodeURIComponent(actionRunMatch[1]));
      sendJson(response, run ? 200 : 404, run ?? { status: "NOT_FOUND", run_id: actionRunMatch[1] });
      return;
    }
    if (request.method === "POST" && actionCancelMatch) {
      const run = await cancelConversationAction(decodeURIComponent(actionCancelMatch[1]));
      sendJson(response, run ? 200 : 404, run ?? { status: "NOT_FOUND", run_id: actionCancelMatch[1] });
      return;
    }
    if (request.method === "POST" && pathname === "/api/action-plan") {
      sendJson(response, 200, await createActionPlan(await readJsonBody(request)));
      return;
    }
    if (request.method === "POST" && pathname === "/api/action-run") {
      sendJson(response, 200, await executeConsoleAction(await readJsonBody(request)));
      return;
    }
    if (request.method === "GET" && pathname === "/api/action-log/latest") {
      sendJson(response, 200, await latestActionLog() ?? { status: "EMPTY", path: null });
      return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && pathname === "/assets/anksen-logo.svg") {
      response.writeHead(200, {
        "content-type": "image/svg+xml; charset=utf-8",
        "cache-control": "no-store"
      });
      response.end(request.method === "HEAD" ? undefined : await readFile(logoPath));
      return;
    }
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
  console.log("Mode: Pilot Production. LOW/MEDIUM local allowlist actions execute; HIGH stays proposal-only; CRITICAL requires human approval.");
  console.log("No deploy, production operations, model calls, managed project writes, or secret reads.");
});
