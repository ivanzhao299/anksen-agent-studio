import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAccessInvite,
  currentSessionSummary,
  evaluateConsoleActionAccess,
  loadAccessCenter,
  loginToAccessCenter,
  logoutFromAccessCenter,
  resolveSessionContext
} from "../../../packages/access-center/lib/access-center-utils.mjs";
import { AutonomousExecutionCenter } from "../../../packages/orchestrator-core/lib/autonomous-execution-center.mjs";
import { createTestPool, ensurePostgresFixture } from "../../../packages/orchestrator-core/lib/postgres-fixture.mjs";
import { migrate } from "../../../packages/orchestrator-core/lib/persistent-night-shift.mjs";
import { domainCenterSummary, loadDomainRuntimeRegistry } from "../../../packages/domain-center/lib/domain-center.mjs";
import { PersistentDomainWorkflowService } from "../../../packages/domain-center/lib/persistent-domain-workflow.mjs";
import { GatewayAuthenticator, SlidingWindowRateLimiter, StudioGateway, gatewayErrorResponse } from "../../../packages/orchestrator-core/lib/studio-gateway.mjs";
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../../../packages/orchestrator-core/lib/studio-mcp-oauth.mjs";
import { createStudioMcpRequestHandler } from "../../../packages/orchestrator-core/lib/studio-mcp-server.mjs";
import { loadIdentityRuntimeConfig, proxyIdentityRequest } from "./identity-service.mjs";
import { IdentityOwnerBootstrap, renderIdentityOwnerBootstrapPage } from "./identity-owner-bootstrap.mjs";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";
import {
  cancelConversationAction,
  createActionPlan,
  executeConsoleAction,
  getConversationAction,
  getLatestConversationAction,
  getRuntimeIdentityUsage,
  latestActionLog,
  startConversationAction
} from "./action-server.mjs";

const port = Number(process.env.PORT ?? 4317);
const allowedPaths = new Set([...consoleWebRoutes.map((route) => route.path), "/login", "/register", "/identity-bootstrap"]);
const webDir = dirname(fileURLToPath(import.meta.url));
const assetsDir = join(webDir, "assets");
const staticAssets = new Map([
  ["/assets/anksen-logo.svg", { path: join(assetsDir, "anksen-logo.svg"), type: "image/svg+xml; charset=utf-8" }]
]);
const autonomousExecutionCenter = new AutonomousExecutionCenter();
const identityRuntime = await loadIdentityRuntimeConfig();
const identityOwnerBootstrap = identityRuntime ? new IdentityOwnerBootstrap({ upstreamOrigin: identityRuntime.upstreamOrigin }) : null;
const mcpOauthEnabled = identityRuntime?.authMode === "oauth";
let studioMcpHandler = null;
if (mcpOauthEnabled) {
  const verifier = new StudioOAuthVerifier({
    resource: identityRuntime.publicUrl,
    issuer: identityRuntime.issuer,
    jwksUri: identityRuntime.jwksUri,
    jwksFetchUri: identityRuntime.jwksFetchUri
  });
  let readiness;
  try {
    const authorizationServer = await checkAuthorizationServerMetadata({ issuer: verifier.issuer, expectedJwksUri: verifier.jwksUri, metadataUri: identityRuntime.metadataProbeUri });
    readiness = { status: authorizationServer.status, authentication: "oauth2", authorizationServer: verifier.issuer, failures: authorizationServer.failures };
  } catch (error) {
    readiness = { status: "NOT_READY", authentication: "oauth2", authorizationServer: verifier.issuer, failures: [error instanceof Error ? error.message : String(error)] };
  }
  studioMcpHandler = createStudioMcpRequestHandler({ oauthVerifier: verifier, executionCenter: autonomousExecutionCenter, rateLimit: identityRuntime.rateLimit, readiness, probePrefix: "/mcp" });
}
const entries = (value) => Object.fromEntries(String(value ?? "").split(",").map((item) => item.trim()).filter(Boolean).map((item) => { const separator = item.indexOf(":"); return separator < 1 ? [item, ""] : [item.slice(0, separator), item.slice(separator + 1)]; }));
const studioGateway = new StudioGateway({
  executionCenter: autonomousExecutionCenter,
  authenticator: new GatewayAuthenticator({ serviceTokens: entries(process.env.STUDIO_GATEWAY_SERVICE_TOKENS), signingSecrets: entries(process.env.STUDIO_GATEWAY_SIGNING_SECRETS) }),
  rateLimiter: new SlidingWindowRateLimiter({ limit: Number(process.env.STUDIO_GATEWAY_RATE_LIMIT ?? 30) })
});

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
    if (identityRuntime && proxyIdentityRequest(request, response, { upstreamOrigin: identityRuntime.upstreamOrigin, publicOrigin: new URL(identityRuntime.publicUrl).origin })) return;
    if (studioMcpHandler && await studioMcpHandler(request, response)) return;
    if (!localOnly(request) && !String(request.url ?? "").startsWith("/api/v1/")) {
      sendJson(response, 403, { status: "BLOCKED", reason: "Console Action Server only accepts local 127.0.0.1 requests." });
      return;
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/dashboard" ? "/" : url.pathname;
    const accessBundle = await loadAccessCenter();
    const sessionToken = sessionTokenFromRequest(request);
    const accessContext = await resolveSessionContext(accessBundle, {
      session_token: sessionToken,
      allow_default_user: false
    });
    if (
      (request.method === "GET" || request.method === "HEAD")
      && (pathname === "/login" || pathname === "/register")
      && accessContext.authenticated
    ) {
      response.writeHead(303, {
        location: "/",
        "cache-control": "no-store"
      });
      response.end();
      return;
    }
    const isAuthRoute = pathname === "/api/access/login" || pathname === "/api/access/register" || pathname === "/api/access/logout" || pathname === "/api/access/session";
    const actionRunMatch = pathname.match(/^\/api\/actions\/([^/]+)$/);
    const actionCancelMatch = pathname.match(/^\/api\/actions\/([^/]+)\/cancel$/);
    const gatewayGoalMatch = pathname.match(/^\/api\/v1\/goals\/([^/]+)$/);
    const gatewayGraphMatch = pathname.match(/^\/api\/v1\/goals\/([^/]+)\/task-graph$/);
    const gatewaySessionMatch = pathname.match(/^\/api\/v1\/night-shift\/sessions\/([^/]+)$/);
    const gatewayReportMatch = pathname.match(/^\/api\/v1\/night-shift\/sessions\/([^/]+)\/morning-report$/);
    const gatewayContext = (body = {}) => ({ method: request.method ?? "GET", pathname, headers: request.headers, body, sessionContext: accessContext });
    if (pathname.startsWith("/api/v1/")) {
      const requestId = String(request.headers["x-request-id"] ?? randomUUID());
      try {
        let result;
        if (request.method === "POST" && pathname === "/api/v1/goals") {
          const body = await readJsonBody(request);
          result = await studioGateway.createGoal({ ...body, idempotencyKey: body.idempotencyKey ?? request.headers["idempotency-key"] }, gatewayContext(body));
          sendJson(response, 201, { ...result, requestId });
          return;
        }
        if (request.method === "GET" && gatewayGraphMatch) result = await studioGateway.getTaskGraph(decodeURIComponent(gatewayGraphMatch[1]), gatewayContext());
        else if (request.method === "GET" && gatewayGoalMatch) result = await studioGateway.getGoal(decodeURIComponent(gatewayGoalMatch[1]), gatewayContext());
        else if (request.method === "GET" && gatewayReportMatch) result = await studioGateway.getMorningReport(decodeURIComponent(gatewayReportMatch[1]), gatewayContext());
        else if (request.method === "GET" && gatewaySessionMatch) result = await studioGateway.getSession(decodeURIComponent(gatewaySessionMatch[1]), gatewayContext());
        else if (request.method === "GET" && pathname === "/api/v1/readiness") result = await studioGateway.getReadiness(gatewayContext());
        else { sendJson(response, 404, { error: { code: "NOT_FOUND", message: "Gateway route not found.", requestId } }); return; }
        sendJson(response, 200, { ...result, requestId });
      } catch (error) {
        const failure = gatewayErrorResponse(error, requestId);
        sendJson(response, failure.status, failure.body, failure.status === 401 ? { "www-authenticate": "Bearer" } : {});
      }
      return;
    }
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
    if (request.method === "POST" && pathname === "/api/access/register") {
      const body = await readJsonBody(request);
      const requestType = String(body.request_type ?? body.requestType ?? "viewer").trim();
      const requestProfiles = {
        viewer: { role_id: "viewer", plan_id: "starter" },
        operator: { role_id: "operator", plan_id: "team" },
        reviewer: { role_id: "reviewer", plan_id: "team" }
      };
      const profile = requestProfiles[requestType] ?? requestProfiles.viewer;
      try {
        const result = await createAccessInvite(accessBundle, {
          username: body.username,
          display_name: body.display_name ?? body.displayName,
          role_id: profile.role_id,
          plan_id: profile.plan_id,
          project_allowlist: body.project_allowlist ?? body.projectAllowlist ?? ["jinhu-smart-park"],
          request_comment: body.request_comment ?? body.requestComment,
          requested_by_user_id: "self-registration",
          requested_by_name: "注册申请"
        });
        sendJson(response, 202, {
          status: "PENDING_APPROVAL",
          invite_id: result.invite.invite_id,
          requested_role_id: result.invite.requested_role_id,
          requested_plan_id: result.invite.requested_plan_id,
          approval_required: true,
          next_step: "管理员审批后初始化账号密码。"
        });
      } catch (error) {
        sendJson(response, 409, {
          status: "REGISTRATION_REJECTED",
          reason: error instanceof Error ? error.message : String(error)
        });
      }
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
    if (pathname === "/identity-bootstrap" || pathname === "/api/identity/owner-bootstrap") {
      if (!accessContext.authenticated) {
        if (pathname === "/identity-bootstrap") {
          response.writeHead(303, { location: "/login", "cache-control": "no-store" });
          response.end();
        } else sendJson(response, 401, { status: "AUTH_REQUIRED", reason: "Studio 平台所有者登录后才能初始化身份密码。" });
        return;
      }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "identity-owner-bootstrap", risk: "MEDIUM" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      if (!identityOwnerBootstrap) { sendJson(response, 503, { status: "NOT_READY", reason: "Studio identity runtime is not configured." }); return; }
      if (request.method === "GET" && pathname === "/identity-bootstrap") {
        const status = await identityOwnerBootstrap.status();
        response.writeHead(200, { "content-type": "text/html; charset=utf-8", "cache-control": "no-store" });
        response.end(renderIdentityOwnerBootstrapPage(status));
        return;
      }
      if (request.method === "GET") { sendJson(response, 200, await identityOwnerBootstrap.status()); return; }
      if (request.method === "POST") {
        const expectedOrigin = new URL(identityRuntime.publicUrl).origin;
        if (String(request.headers.origin ?? "") !== expectedOrigin) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
        const body = await readJsonBody(request);
        try {
          sendJson(response, 200, await identityOwnerBootstrap.initialize({ password: body.password, actor: accessContext.user }));
        } catch (error) {
          sendJson(response, Number(error?.status ?? 400), { status: "FAILED", code: error?.code ?? "IDENTITY_INITIALIZATION_FAILED", reason: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      sendJson(response, 405, { status: "METHOD_NOT_ALLOWED" }, { allow: "GET, POST" });
      return;
    }
    if (request.method === "GET" && pathname === "/api/aec/dashboard") {
      sendJson(response, 200, await autonomousExecutionCenter.getDashboard());
      return;
    }
    if (request.method === "GET" && pathname === "/api/portfolio/dashboard") {
      const progress = await autonomousExecutionCenter.getPortfolioProgress();
      const byApplication = new Map(progress.applications.map((item) => [item.application_id, item]));
      sendJson(response, 200, {
        generatedAt: progress.generatedAt,
        source: progress.source,
        applications: domainCenterSummary().applications.map((application) => ({
          id: application.id,
          name: application.name,
          nameEn: application.nameEn,
          icon: application.icon,
          summary: application.summary,
          domainCount: application.domains.length,
          progress: byApplication.get(application.id) ?? null,
          businessResults: { status: "AWAITING_SOURCE", metrics: [] }
        }))
      });
      return;
    }
    if (request.method === "POST" && pathname === "/api/aec/goals") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "aec-goal", risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      const body = await readJsonBody(request), title = String(body.title ?? "").trim();
      if (!title) { sendJson(response, 400, { status: "INVALID_GOAL", reason: "Goal title is required." }); return; }
      sendJson(response, 201, await autonomousExecutionCenter.createGoal({ title, userContext: accessContext }));
      return;
    }
    if (request.method === "POST" && pathname === "/api/domain/goals") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "aec-goal", risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      const body = await readJsonBody(request), title = String(body.title ?? "").trim(), domainId = String(body.domainId ?? "").trim();
      if (!title || !domainId) { sendJson(response, 400, { status: "INVALID_DOMAIN_GOAL", reason: "Goal title and domainId are required." }); return; }
      await ensurePostgresFixture();
      const pool = createTestPool();
      try {
        if (!(await pool.query("SELECT to_regclass('ad_night_shift_session') ok")).rows[0].ok) await migrate(pool, "up");
        const service = new PersistentDomainWorkflowService(pool, { registry: await loadDomainRuntimeRegistry() });
        const sessionKey = `domain-console-${randomUUID()}`;
        const submitted = await service.submit({ sessionKey, goal: title, explicitDomainId: domainId, scope: { organizationId: accessContext.organization_id ?? "studio-org", workspaceId: accessContext.workspace_id ?? "studio-workspace", projectId: body.projectId ?? "jinhu-smart-park" } });
        const runner = await service.runDaemon({ pollMs: 5, idleTimeoutMs: 50, maxRuntimeMs: 5000 });
        const report = await service.night.loadReport(submitted.session.id);
        sendJson(response, 201, { status: report.sessionStatus, application: submitted.workflow.application, domain: submitted.workflow.domain, workflow: submitted.workflow, runner, report, dashboard: await autonomousExecutionCenter.getDashboard() });
      } catch (error) {
        if (error?.code === "WORKFLOW_BLOCKED") {
          sendJson(response, 409, { status: "BLOCKED", reason: "该业务领域所需的专业 Runner 尚未接通。", blockedReasons: error.workflow?.blockedReasons ?? [], workflow: error.workflow ?? null });
          return;
        }
        if (error?.code === "DOMAIN_NOT_FOUND") {
          sendJson(response, 404, { status: "DOMAIN_NOT_FOUND", reason: "未找到指定业务领域。" });
          return;
        }
        throw error;
      } finally {
        await pool.end();
      }
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
    if (request.method === "GET" && pathname === "/api/actions/latest") {
      const run = await getLatestConversationAction();
      sendJson(response, run ? 200 : 404, run ?? { status: "EMPTY" });
      return;
    }
    if (request.method === "GET" && pathname === "/api/runtime/identity-usage") {
      sendJson(response, 200, await getRuntimeIdentityUsage());
      return;
    }
    if (request.method === "GET" && actionRunMatch) {
      const run = await getConversationAction(decodeURIComponent(actionRunMatch[1]));
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
    }, {
      activeProjectId: url.searchParams.get("project") || undefined
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

const bindHost = process.env.STUDIO_BIND_HOST ?? "127.0.0.1";
server.listen(port, bindHost, () => {
  console.log(`ANKSEN Studio running at http://${bindHost}:${port}`);
  console.log("Mode: Pilot Production. LOW/MEDIUM local allowlist actions execute; HIGH stays proposal-only; CRITICAL requires human approval.");
  console.log("No deploy, production operations, model calls, managed project writes, or secret reads.");
});
