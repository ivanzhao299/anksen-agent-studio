import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import {
  createAccessInvite,
  currentSessionSummary,
  evaluateConsoleActionAccess,
  evaluateConsoleRouteAccess,
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
import { AutonomousPortfolioService } from "../../../packages/domain-center/lib/autonomous-portfolio.mjs";
import { BusinessOutcomeCenter } from "../../../packages/domain-center/lib/business-outcome-center.mjs";
import { AutonomousDevelopmentJobs } from "../../../packages/orchestrator-core/lib/autonomous-development-jobs.mjs";
import { BusinessApplicationStore } from "../../../packages/domain-center/lib/business-application-store.mjs";
import { enterpriseApplicationSummary, getEnterpriseApplication } from "../../../packages/domain-center/lib/enterprise-applications.mjs";
import { createBusinessTaskBinding } from "../../../packages/orchestrator-core/lib/business-task-binding.mjs";
import { GatewayAuthenticator, SlidingWindowRateLimiter, StudioGateway, gatewayErrorResponse } from "../../../packages/orchestrator-core/lib/studio-gateway.mjs";
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../../../packages/orchestrator-core/lib/studio-mcp-oauth.mjs";
import { createStudioMcpRequestHandler } from "../../../packages/orchestrator-core/lib/studio-mcp-server.mjs";
import { loadIdentityRuntimeConfig, proxyIdentityRequest } from "./identity-service.mjs";
import { IdentityOwnerBootstrap, renderIdentityOwnerBootstrapPage } from "./identity-owner-bootstrap.mjs";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";
import { GovernedRunManager } from "./governed-run-manager.mjs";
import { loadProjectRegistrySync } from "./project-registry.mjs";
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
const repoRoot = resolve(webDir, "../../..");
const assetsDir = join(webDir, "assets");
const staticAssets = new Map([
  ["/assets/anksen-logo.svg", { path: join(assetsDir, "anksen-logo.svg"), type: "image/svg+xml; charset=utf-8" }]
]);
const autonomousExecutionCenter = new AutonomousExecutionCenter();
const governedRunManager = new GovernedRunManager({ repoRoot });
const portfolioRegistry = await loadDomainRuntimeRegistry();
const dispatchPortfolioInitiative = async ({ campaign, initiative }) => {
  await ensurePostgresFixture();
  const pool = createTestPool();
  try {
    if (!(await pool.query("SELECT to_regclass('ad_night_shift_session') ok")).rows[0].ok) await migrate(pool, "up");
    const service = new PersistentDomainWorkflowService(pool, { registry: portfolioRegistry });
    const submitted = await service.submit({ sessionKey: initiative.sessionKey, goal: initiative.title, explicitDomainId: initiative.domainId, scope: { organizationId: "studio-org", workspaceId: "studio-workspace", projectId: campaign.projectId } });
    await service.runDaemon({ pollMs: 5, idleTimeoutMs: 100, maxRuntimeMs: 60000 });
    const report = await service.night.loadReport(submitted.session.id);
    return { status: report?.sessionStatus ?? "FAILED", report };
  } finally { await pool.end(); }
};
const autonomousPortfolio = new AutonomousPortfolioService({ repoRoot, registry: portfolioRegistry, dispatcher: dispatchPortfolioInitiative });
const businessOutcomeCenter = new BusinessOutcomeCenter({ repoRoot });
const autonomousDevelopmentJobs = new AutonomousDevelopmentJobs({ repoRoot });
const businessApplicationStore = new BusinessApplicationStore({ repoRoot });
setInterval(() => autonomousPortfolio.tick().catch((error) => console.error("portfolio tick failed", error?.code ?? error?.message ?? error)), 30000).unref();
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
      const outcomes = await businessOutcomeCenter.dashboard();
      const outcomesByApplication = new Map(outcomes.applications.map((item) => [item.applicationId, item]));
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
          businessResults: outcomesByApplication.get(application.id) ?? { status: "AWAITING_CONNECTOR", metrics: [], latest: null }
        }))
      });
      return;
    }
    if (request.method === "GET" && pathname === "/api/outcomes/catalog") {
      sendJson(response, 200, { contracts: businessOutcomeCenter.catalog(), connectors: await businessOutcomeCenter.connectors() });
      return;
    }
    if (request.method === "GET" && pathname === "/api/business/applications") {
      const summary=enterpriseApplicationSummary();
      sendJson(response,200,{...summary,applications:summary.applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed)});
      return;
    }
    if (request.method === "GET" && pathname === "/api/work") {
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      sendJson(response,200,await businessApplicationStore.myWork({userId:accessContext.user?.user_id,applicationId:url.searchParams.get("applicationId")}));
      return;
    }
    const businessRecords=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records$/);
    if (businessRecords) {
      const applicationId=decodeURIComponent(businessRecords[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}
      const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}
      if(request.method==="GET"){sendJson(response,200,{application:app,records:await businessApplicationStore.listRecords(app.id,{objectType:url.searchParams.get("objectType")})});return;}
      if(request.method==="POST"){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-create",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.createRecord(app.id,await readJsonBody(request),{userId:accessContext.user?.user_id}));}catch(error){sendJson(response,400,{status:error.code??"BUSINESS_RECORD_INVALID",reason:error.message});}return;}
    }
    const businessTransition=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/transition$/);
    if(request.method==="POST"&&businessTransition){const applicationId=decodeURIComponent(businessTransition[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-transition",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,200,await businessApplicationStore.transitionRecord(app.id,decodeURIComponent(businessTransition[2]),await readJsonBody(request),{userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_TRANSITION_FAILED",reason:error.message});}return;}
    const businessWork=pathname.match(/^\/api\/business\/applications\/([^/]+)\/work$/);
    if(request.method==="POST"&&businessWork){
      const applicationId=decodeURIComponent(businessWork[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}
      const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-work-assign",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}
      let pool=null;
      try{
        const body=await readJsonBody(request),actor={userId:accessContext.user?.user_id},record=await businessApplicationStore.getRecord(app.id,body.businessObjectId);if(!record)throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"),{code:"BUSINESS_RECORD_NOT_FOUND"});
        const item=await businessApplicationStore.createWorkItem({...body,applicationId:app.id},actor);
        if(item.assignmentType!=="AGENT"){sendJson(response,201,item);return;}
        const catalog=domainCenterSummary(),domain=catalog.applications.find(value=>value.id===app.id)?.domains?.[0];if(!domain)throw Object.assign(new Error("APPLICATION_WORKFLOW_NOT_FOUND"),{code:"APPLICATION_WORKFLOW_NOT_FOUND"});
        const stage=domain.workflow[0],binding=createBusinessTaskBinding({scope:{organizationId:accessContext.organization_id??"anksen-local",workspaceId:accessContext.workspace_id,projectId:"anksen-agent-studio",applicationId:app.id,domainId:domain.id,userId:actor.userId},businessObject:{systemId:app.id,objectType:record.objectType,objectId:record.id,version:record.version,displayKey:record.displayKey,href:`${app.path}?record=${record.id}`},workflow:{definitionId:`${domain.id}-workflow`,definitionVersion:"1",instanceId:item.id,stageId:stage.key},skill:{businessSkillId:stage.businessSkillId,skillId:stage.skillType,skillType:stage.skillType,requiredCapabilities:[stage.skillType],riskLevel:"LOW"},execution:{assignmentPolicy:"CAPABILITY",preferredRuntimeId:"controlled-stub",memoryScopeKey:`${app.id}:${record.objectType}:${record.id}`},writeback:{operation:"TRANSITION",expectedObjectVersion:record.version,eventType:"business.object.workflow.review-ready"}});
        await ensurePostgresFixture();pool=createTestPool();await migrate(pool,"up");const service=new PersistentDomainWorkflowService(pool,{registry:portfolioRegistry});const submitted=await service.submit({sessionKey:`business-work:${item.id}`,goal:item.title,explicitDomainId:domain.id,businessTaskBinding:binding,scope:binding.scope});await service.runDaemon({pollMs:5,idleTimeoutMs:50,maxRuntimeMs:5000});const report=await service.night.loadReport(submitted.session.id),nextStatus=report?.sessionStatus==="SUCCEEDED"?"WAITING_APPROVAL":"BLOCKED";await businessApplicationStore.attachWorkflow(item.id,{goalId:submitted.goal?.id??submitted.session.goal_id,sessionId:submitted.session.id,report,status:nextStatus});if(nextStatus==="WAITING_APPROVAL")await businessApplicationStore.transitionRecord(app.id,record.id,{expectedVersion:record.version,status:"WAITING_APPROVAL"},actor);sendJson(response,201,{...await businessApplicationStore.myWork({userId:actor.userId,applicationId:app.id}),workItemId:item.id,workflowStatus:nextStatus,report});
      }catch(error){sendJson(response,400,{status:error.code??"BUSINESS_WORK_INVALID",reason:error.message});}finally{if(pool)await pool.end();}return;
    }
    if (request.method === "GET" && pathname === "/api/outcomes/dashboard") {
      sendJson(response, 200, await businessOutcomeCenter.dashboard());
      return;
    }
    if (request.method === "GET" && pathname === "/api/development/jobs") {
      sendJson(response, 200, { jobs: await autonomousDevelopmentJobs.list(), worker: await autonomousDevelopmentJobs.workerStatus() });
      return;
    }
    const developmentJob = pathname.match(/^\/api\/development\/jobs\/([^/]+)$/);
    if (request.method === "GET" && developmentJob) {
      const job = await autonomousDevelopmentJobs.get(decodeURIComponent(developmentJob[1]));
      sendJson(response, job ? 200 : 404, job ?? { status: "JOB_NOT_FOUND" });
      return;
    }
    const developmentArtifact = pathname.match(/^\/api\/development\/jobs\/([^/]+)\/artifacts\/([^/]+)$/);
    if (request.method === "GET" && developmentArtifact) {
      const artifact = await autonomousDevelopmentJobs.readArtifact(decodeURIComponent(developmentArtifact[1]), decodeURIComponent(developmentArtifact[2]));
      sendJson(response, artifact ? 200 : 404, artifact ?? { status: "ARTIFACT_NOT_FOUND" });
      return;
    }
    if (request.method === "POST" && pathname === "/api/development/jobs") {
      const body = await readJsonBody(request);
      const project = loadProjectRegistrySync().find(item => item.project_id === body.projectId && item.connection_status === "CONNECTED");
      if (!project || !project.repo_path_display || project.repo_path_display === "not_connected") { sendJson(response, 400, { status: "PROJECT_NOT_CONNECTED" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "development-job-create", project_id: project.project_id, risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await autonomousDevelopmentJobs.create({ ...body, projectRoot: project.repo_path_display }, { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "DEVELOPMENT_JOB_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    const developmentAction = pathname.match(/^\/api\/development\/jobs\/([^/]+)\/(clarify|approve|pause|cancel|commit)$/);
    if (request.method === "POST" && developmentAction) {
      const body = await readJsonBody(request), job = await autonomousDevelopmentJobs.get(decodeURIComponent(developmentAction[1]));
      if (!job) { sendJson(response, 404, { status: "JOB_NOT_FOUND" }); return; }
      const action = developmentAction[2], access = await evaluateConsoleActionAccess(accessBundle, { action_id: action === "commit" ? "development-commit" : action === "approve" ? "development-job-approve" : "development-job-control", project_id: job.projectId, risk: action === "commit" || action === "approve" ? "MEDIUM" : "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try {
        const actor = { userId: accessContext.user?.user_id };
        const result = action === "clarify" ? await autonomousDevelopmentJobs.clarify(job.id, body.answer, actor) : action === "approve" ? await autonomousDevelopmentJobs.approve(job.id, actor) : action === "pause" ? await autonomousDevelopmentJobs.pause(job.id, actor) : action === "cancel" ? await autonomousDevelopmentJobs.cancel(job.id, actor) : await autonomousDevelopmentJobs.approveCommit(job.id, actor);
        sendJson(response, 200, result);
      } catch (error) { sendJson(response, 409, { status: error?.code ?? error?.message, reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (request.method === "POST" && pathname === "/api/outcomes/connectors") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "outcome-connector-register", risk: "MEDIUM" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await businessOutcomeCenter.registerConnector(await readJsonBody(request), { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "OUTCOME_CONNECTOR_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (request.method === "POST" && pathname === "/api/outcomes/snapshots") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "outcome-snapshot-ingest", risk: "MEDIUM" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await businessOutcomeCenter.ingest(await readJsonBody(request), { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "OUTCOME_SNAPSHOT_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (request.method === "GET" && pathname === "/api/portfolio/campaigns") {
      sendJson(response, 200, { campaigns: await autonomousPortfolio.list(), catalog: domainCenterSummary() });
      return;
    }
    if (request.method === "POST" && pathname === "/api/portfolio/campaigns") {
      const body = await readJsonBody(request);
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "portfolio-create", project_id: String(body.projectId ?? "anksen-agent-studio"), risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await autonomousPortfolio.create(body, { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "PORTFOLIO_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    const portfolioAction = pathname.match(/^\/api\/portfolio\/campaigns\/([^/]+)\/(activate|tick|pause)$/);
    if (request.method === "POST" && portfolioAction) {
      const campaign = await autonomousPortfolio.get(decodeURIComponent(portfolioAction[1]));
      if (!campaign) { sendJson(response, 404, { status: "PORTFOLIO_NOT_FOUND" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: `portfolio-${portfolioAction[2]}`, project_id: campaign.projectId, risk: portfolioAction[2] === "activate" ? "MEDIUM" : "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      const result = portfolioAction[2] === "activate" ? await autonomousPortfolio.activate(campaign.id, { userId: accessContext.user?.user_id }) : portfolioAction[2] === "pause" ? await autonomousPortfolio.pause(campaign.id, { userId: accessContext.user?.user_id }) : await autonomousPortfolio.tick(campaign.id);
      sendJson(response, 200, result);
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
    if (request.method === "GET" && pathname === "/api/governed-runs") {
      sendJson(response, 200, { runs: await governedRunManager.list() });
      return;
    }
    if (request.method === "POST" && pathname === "/api/governed-runs") {
      const body = await readJsonBody(request);
      const project = loadProjectRegistrySync().find((item) => item.project_id === body.projectId && item.connection_status === "CONNECTED");
      if (!project || !project.repo_path_display || project.repo_path_display === "not_connected") { sendJson(response, 400, { status: "PROJECT_NOT_CONNECTED" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "agent-real-plan", project_id: project.project_id, risk: "MEDIUM" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      const paths = Array.isArray(body.allowedPaths) ? body.allowedPaths : String(body.allowedPaths ?? "").split("\n").map((item) => item.trim()).filter(Boolean);
      try {
        const record = await governedRunManager.create({ projectId: project.project_id, projectRoot: project.repo_path_display, goal: body.goal, instruction: body.instruction, allowedPaths: paths, targetPaths: paths, maxRuntimeSeconds: body.maxRuntimeSeconds }, { userId: accessContext.user?.user_id });
        sendJson(response, 201, record);
      } catch (error) {
        sendJson(response, 400, { status: "INVALID_GOVERNED_RUN", reason: error instanceof Error ? error.message : String(error) });
      }
      return;
    }
    const governedApprove = pathname.match(/^\/api\/governed-runs\/([^/]+)\/approve$/);
    if (request.method === "POST" && governedApprove) {
      const record = await governedRunManager.get(decodeURIComponent(governedApprove[1]));
      if (!record) { sendJson(response, 404, { status: "GOVERNED_RUN_NOT_FOUND" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "proposal-approve-apply", project_id: record.projectId, risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      sendJson(response, 200, await governedRunManager.approve(decodeURIComponent(governedApprove[1]), { userId: accessContext.user?.user_id })); return;
    }
    const governedCancel = pathname.match(/^\/api\/governed-runs\/([^/]+)\/cancel$/);
    if (request.method === "POST" && governedCancel) {
      const record = await governedRunManager.get(decodeURIComponent(governedCancel[1]));
      if (!record) { sendJson(response, 404, { status: "GOVERNED_RUN_NOT_FOUND" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "proposal-approve-apply", project_id: record.projectId, risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      sendJson(response, 200, await governedRunManager.cancel(record.id, { userId: accessContext.user?.user_id })); return;
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
