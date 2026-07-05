import { createServer } from "node:http";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  currentSessionSummary,
  loadAccessCenter,
  loginToAccessCenter,
  logoutFromAccessCenter,
  resolveSessionContext
} from "../../../packages/access-center/lib/access-center-utils.mjs";
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
const allowedPaths = new Set([...consoleWebRoutes.map((route) => route.path), "/login"]);
const webDir = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(webDir, "assets");
const staticAssets = new Map([
  ["/assets/anksen-logo.svg", { path: join(assetsDir, "anksen-logo.svg"), type: "image/svg+xml; charset=utf-8" }],
  ["/assets/login-panel-image.png", { path: join(assetsDir, "login-panel-image.png"), type: "image/png" }]
]);

function localOnly(request) {
  return ["127.0.0.1", "::1", "::ffff:127.0.0.1"].includes(request.socket.remoteAddress ?? "");
}

function sendJson(response, status, value, extraHeaders = {}) {
  response.writeHead(status, {
    "content-type": "application/json; charset=utf-8",
    "cache-control": "no-store",
    ...extraHeaders
  });
  response.end(`${JSON.stringify(value, null, 2)}\n`);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) chunks.push(chunk);
  for (const chunk of chunks) {
    total += chunk.length;
    if (total > 12 * 1024 * 1024) {
      throw new Error("Console request body exceeds 12MB limit.");
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.trim() ? JSON.parse(text) : {};
}

function parseCookies(request) {
  return Object.fromEntries(
    String(request.headers.cookie ?? "")
      .split(";")
      .map((part) => part.trim())
      .filter(Boolean)
      .map((entry) => {
        const separator = entry.indexOf("=");
        if (separator < 0) return [entry, ""];
        return [entry.slice(0, separator), decodeURIComponent(entry.slice(separator + 1))];
      })
  );
}

function sessionTokenFromRequest(request) {
  return parseCookies(request).anksen_session ?? "";
}

function sessionCookie(token, ttlHours) {
  return `anksen_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict; Max-Age=${Math.max(60, Number(ttlHours ?? 12) * 60 * 60)}`;
}

function clearSessionCookie() {
  return "anksen_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

const server = createServer(async (request, response) => {
  try {
    if (!localOnly(request)) {
      sendJson(response, 403, { status: "BLOCKED", reason: "Console Action Server only accepts local 127.0.0.1 requests." });
      return;
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/dashboard" || url.pathname === "/login" ? "/" : url.pathname;
    const accessBundle = await loadAccessCenter();
    const sessionToken = sessionTokenFromRequest(request);
    const accessContext = await resolveSessionContext(accessBundle, {
      session_token: sessionToken,
      allow_default_user: false
    });
    const isAuthRoute = pathname === "/api/access/login" || pathname === "/api/access/logout" || pathname === "/api/access/session";
    const actionRunMatch = pathname.match(/^\/api\/actions\/([^/]+)$/);
    const actionCancelMatch = pathname.match(/^\/api\/actions\/([^/]+)\/cancel$/);
    if (request.method === "POST" && pathname === "/api/access/login") {
      const body = await readJsonBody(request);
      const result = await loginToAccessCenter(body.username, body.password, {
        user_agent: request.headers["user-agent"] ?? "unknown"
      });
      if (result.status !== "ALLOW") {
        sendJson(response, 401, result);
        return;
      }
      sendJson(response, 200, result, {
        "set-cookie": sessionCookie(result.token, accessBundle.policy.session_ttl_hours)
      });
      return;
    }
    if (request.method === "POST" && pathname === "/api/access/logout") {
      if (sessionToken) await logoutFromAccessCenter(sessionToken);
      sendJson(response, 200, { status: "PASS" }, {
        "set-cookie": clearSessionCookie()
      });
      return;
    }
    if (request.method === "GET" && pathname === "/api/access/session") {
      sendJson(response, 200, await currentSessionSummary(accessBundle, sessionToken, { allow_default_user: false }));
      return;
    }
    if (pathname.startsWith("/api/") && !isAuthRoute && !accessContext.authenticated) {
      sendJson(response, 401, {
        status: "AUTH_REQUIRED",
        reason: "Console Action Server requires a local Studio login before invoking actions."
      });
      return;
    }
    if (request.method === "POST" && pathname === "/api/actions/start") {
      sendJson(response, 202, await startConversationAction(await readJsonBody(request), {
        session_token: sessionToken,
        user_context: accessContext,
        access_bundle: accessBundle,
        allow_default_user: false
      }));
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
      sendJson(response, 200, await createActionPlan(await readJsonBody(request), {
        session_token: sessionToken,
        user_context: accessContext,
        access_bundle: accessBundle,
        allow_default_user: false
      }));
      return;
    }
    if (request.method === "POST" && pathname === "/api/action-run") {
      sendJson(response, 200, await executeConsoleAction(await readJsonBody(request), {
        session_token: sessionToken,
        user_context: accessContext,
        access_bundle: accessBundle,
        allow_default_user: false
      }));
      return;
    }
    if (request.method === "GET" && pathname === "/api/action-log/latest") {
      sendJson(response, 200, await latestActionLog() ?? { status: "EMPTY", path: null });
      return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && staticAssets.has(pathname)) {
      const asset = staticAssets.get(pathname);
      response.writeHead(200, {
        "content-type": asset.type,
        "cache-control": "no-store"
      });
      response.end(request.method === "HEAD" ? undefined : await readFile(asset.path));
      return;
    }
    if (!allowedPaths.has(pathname)) {
      response.writeHead(404, { "content-type": "text/plain; charset=utf-8" });
      response.end("Console route not found.");
      return;
    }
    const sessionSummary = await currentSessionSummary(accessBundle, sessionToken, { allow_default_user: false });
    const html = await renderConsolePage(pathname, {
      ...accessContext,
      entitlement: sessionSummary.entitlement ?? accessContext.entitlement ?? null,
      session: sessionSummary.session ?? null,
      membership: sessionSummary.membership ?? accessContext.membership ?? null
    });
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
