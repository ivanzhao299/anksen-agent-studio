import { createServer } from "node:http";
import { randomUUID } from "node:crypto";
import { createReadStream } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, join, resolve } from "node:path";
import { hostname } from "node:os";
import { fileURLToPath } from "node:url";
import {
  accessSecuritySummary,
  changeOwnStudioPassword,
  createAccessInvite,
  currentSessionSummary,
  evaluateConsoleActionAccess,
  evaluateConsoleRouteAccess,
  loadAccessCenter,
  loginToAccessCenter,
  logoutFromAccessCenter,
  resolveSessionContext,
  updateWorkspaceDomainCapabilities
} from "../../../packages/access-center/lib/access-center-utils.mjs";
import { AutonomousExecutionCenter } from "../../../packages/orchestrator-core/lib/autonomous-execution-center.mjs";
import { createTestPool, ensurePostgresFixture } from "../../../packages/orchestrator-core/lib/postgres-fixture.mjs";
import { migrate } from "../../../packages/orchestrator-core/lib/persistent-night-shift.mjs";
import { domainCenterSummary, loadDomainRuntimeRegistry } from "../../../packages/domain-center/lib/domain-center.mjs";
import { PersistentDomainWorkflowService } from "../../../packages/domain-center/lib/persistent-domain-workflow.mjs";
import { ResidentBusinessWorkRunner } from "../../../packages/domain-center/lib/resident-business-work-runner.mjs";
import { PostgresBusinessRunnerRegistry } from "../../../packages/domain-center/lib/business-runner-registry.mjs";
import { PersistentBusinessWorkExecutor } from "../../../packages/domain-center/lib/persistent-business-work-executor.mjs";
import { AutonomousPortfolioService } from "../../../packages/domain-center/lib/autonomous-portfolio.mjs";
import { BusinessOutcomeCenter } from "../../../packages/domain-center/lib/business-outcome-center.mjs";
import { AutonomousDevelopmentJobs } from "../../../packages/orchestrator-core/lib/autonomous-development-jobs.mjs";
import { assessAutonomousDevelopmentReadiness } from "../../../packages/orchestrator-core/lib/autonomous-development-readiness.mjs";
import { bearerToken, ResidentWorkerBroker, tokenMatches } from "../../../packages/orchestrator-core/lib/resident-worker-broker.mjs";
import { createBusinessApplicationRuntime } from "../../../packages/domain-center/lib/business-database.mjs";
import { PostgresGrowthDeliveryStore } from "../../../packages/domain-center/lib/postgres-growth-delivery-store.mjs";
import { PostgresGrowthIdentityReviewStore } from "../../../packages/domain-center/lib/postgres-growth-identity-review-store.mjs";
import { PostgresGrowthConnectorEvidence } from "../../../packages/domain-center/lib/postgres-growth-connector-evidence.mjs";
import { PostgresGrowthConnectorBindingStore } from "../../../packages/domain-center/lib/postgres-growth-connector-binding-store.mjs";
import { GrowthConnectorActivationGate } from "../../../packages/domain-center/lib/growth-connector-activation-gate.mjs";
import { GrowthProductionOperationsPolicy } from "../../../packages/domain-center/lib/growth-production-operations-policy.mjs";
import { assessGrowthPilotReadiness } from "../../../packages/growth-core/lib/pilot-readiness.mjs";
import { defineTenantPack } from "../../../packages/growth-core/lib/tenant-kit.mjs";
import { enterpriseApplicationSummary, getEnterpriseApplication } from "../../../packages/domain-center/lib/enterprise-applications.mjs";
import { businessApprovalAccepted, businessWorkflowGoal } from "../../../packages/domain-center/lib/business-object-definitions.mjs";
import { projectBusinessNotifications } from "../../../packages/domain-center/lib/business-notifications.mjs";
import { buildBusinessDelegationPreview } from "../../../packages/domain-center/lib/business-delegation-preview.mjs";
import { buildBusinessCapabilityProtocol } from "../../../packages/domain-center/lib/business-capability-protocol.mjs";
import { EnterpriseProgramPlanner } from "../../../packages/domain-center/lib/enterprise-program-planner.mjs";
import { projectBusinessWorkExecution } from "../../../packages/domain-center/lib/business-work-execution.mjs";
import { projectPortfolioWork } from "../../../packages/domain-center/lib/portfolio-work-projection.mjs";
import { projectPortfolioCockpit } from "../../../packages/domain-center/lib/portfolio-cockpit-projection.mjs";
import { createBusinessTaskBinding } from "../../../packages/orchestrator-core/lib/business-task-binding.mjs";
import { CadAgentSdk } from "../../../packages/engineering-cad-center/lib/index.mjs";
import { ProfessionalRunnerCapabilityRegistry } from "../../../packages/skill-router/lib/professional-runner-capabilities.mjs";
import { CapabilityResourceRegistry } from "../../../packages/skill-router/lib/capability-resource-registry.mjs";
import { implementedProfessionalAdapterIds } from "../../../packages/skill-router/lib/professional-media-adapters.mjs";
import { createManagedCapabilityAppCenter } from "../../../packages/managed-capability-apps/lib/managed-capability-app-center.mjs";
import { createCapabilityUploadStore } from "../../../packages/managed-capability-apps/lib/capability-upload-store.mjs";
import { projectProfessionalArtifacts } from "../../../packages/skill-router/lib/professional-artifact-projection.mjs";
import { GatewayAuthenticator, SlidingWindowRateLimiter, StudioGateway, gatewayErrorResponse } from "../../../packages/orchestrator-core/lib/studio-gateway.mjs";
import { AvernetProviderGateway, AvernetGatewayError, FileAvernetBridgeStore } from "../../../packages/orchestrator-core/lib/avernet-provider-gateway.mjs";
import { checkAuthorizationServerMetadata, StudioOAuthVerifier } from "../../../packages/orchestrator-core/lib/studio-mcp-oauth.mjs";
import { createStudioMcpRequestHandler } from "../../../packages/orchestrator-core/lib/studio-mcp-server.mjs";
import { loadIdentityRuntimeConfig, proxyIdentityRequest } from "./identity-service.mjs";
import { IdentityOwnerBootstrap, renderIdentityOwnerBootstrapPage } from "./identity-owner-bootstrap.mjs";
import { renderConsolePage } from "./render.mjs";
import { consoleWebRoutes } from "./routes.mjs";
import { GovernedRunManager } from "./governed-run-manager.mjs";
import { AgentAdminService } from "./agent-admin-service.mjs";
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
  ["/assets/anksen-logo.svg", { path: join(assetsDir, "anksen-logo.svg"), type: "image/svg+xml; charset=utf-8" }],
  ["/assets/business-work-execution.js", { path: join(assetsDir, "business-work-execution.js"), type: "text/javascript; charset=utf-8" }]
]);
const autonomousExecutionCenter = new AutonomousExecutionCenter();
const cadAgentSdk = new CadAgentSdk();
const governedRunManager = new GovernedRunManager({ repoRoot });
const agentAdminService = new AgentAdminService({ repoRoot });
const managedCapabilityAppCenter = createManagedCapabilityAppCenter({ repoRoot });
const capabilityUploadStore = createCapabilityUploadStore({ repoRoot, center: managedCapabilityAppCenter });
const portfolioRegistry = await loadDomainRuntimeRegistry();
const businessRuntime = await createBusinessApplicationRuntime({ repoRoot });
const businessApplicationStore = businessRuntime.store;
const businessDataConnectorStore = businessRuntime.connectorStore;
const businessSourceGovernance = businessRuntime.sourceGovernance;
const growthDeliveryStore = businessRuntime.pool ? new PostgresGrowthDeliveryStore({ pool: businessRuntime.pool }) : null;
const growthIdentityReviewStore = businessRuntime.pool ? new PostgresGrowthIdentityReviewStore({ pool: businessRuntime.pool }) : null;
const growthConnectorEvidence = businessRuntime.pool ? new PostgresGrowthConnectorEvidence({ pool: businessRuntime.pool }) : null;
const growthConnectorBindingStore = businessRuntime.pool ? new PostgresGrowthConnectorBindingStore({ pool: businessRuntime.pool }) : null;
const growthConnectorActivationGate = businessRuntime.pool ? new GrowthConnectorActivationGate({ pool: businessRuntime.pool }) : null;
const growthProductionOperationsPolicy = new GrowthProductionOperationsPolicy();
const kingTurfPilotReadinessInput = JSON.parse(await readFile(join(repoRoot, "packages/growth-core/examples/kingturf.pilot-readiness.json"), "utf8"));
const kingTurfTenantPack = defineTenantPack(JSON.parse(await readFile(join(repoRoot, "packages/growth-core/examples/kingturf.tenant-pack.json"), "utf8")));
const unavailableGrowthOperations=Object.freeze({identityReviewBacklog:null,failedDeliveries:null,reconciliationMismatches:null,source:"NOT_CONNECTED",identityReviewSource:"NOT_PERSISTED"});
const loadGrowthPilotOperations=async scope=>{if(!growthDeliveryStore)return unavailableGrowthOperations;try{return await growthDeliveryStore.readinessOperations(scope);}catch(error){if(error?.code==="42P01")return{...unavailableGrowthOperations,source:"MIGRATION_REQUIRED"};throw error;}};
const loadGrowthPilotConnectors=async scope=>{const connectors=kingTurfPilotReadinessInput.connectors.map(item=>({...item}));if(!growthConnectorBindingStore)return connectors;try{const [bindings,publishing]=await Promise.all([growthConnectorBindingStore.readiness(scope),growthConnectorEvidence?.publishing(scope,{platforms:kingTurfTenantPack.metadata.publishingAccountPlatforms??[]})??null]);return connectors.map(item=>{const binding=bindings.find(value=>value.kind===item.kind);return{...item,credentialReferenceConfigured:Boolean(binding?.credentialReferenceConfigured)&&(item.kind!=='PUBLISHING'||publishing?.credentialReferenceConfigured===true),health:binding?.health??'MISSING_BINDING',evidenceSource:item.kind==='PUBLISHING'?'CONNECTOR_BINDING_AND_CHANNEL_ACCOUNT':'GROWTH_CONNECTOR_BINDING',credentialValuesRead:false};});}catch(error){if(error?.code==="42P01")return connectors;throw error;}};
const passwordChangeFailures = new Map();
const passwordChangeWindowMs = 15 * 60 * 1000;
const passwordChangeAttemptLimit = 5;
const acquireWorkflowPool = async () => {
  if (businessRuntime.pool) return { pool: businessRuntime.pool, ownsPool: false };
  await ensurePostgresFixture();
  return { pool: createTestPool(), ownsPool: true };
};
const enqueueBusinessWork = async ({ app, record, item, actor }) => {
  if(item.sessionId)return{workItem:item,resumed:true};
  const preview=buildBusinessDelegationPreview({application:app,record,registry:portfolioRegistry});if(preview.blockedReasons.includes("BUSINESS_RECORD_NOT_READY_FOR_AGENT"))throw Object.assign(new Error("BUSINESS_RECORD_NOT_READY_FOR_AGENT"),{code:"BUSINESS_RECORD_NOT_READY_FOR_AGENT",preview});if(preview.status!=="READY")throw Object.assign(new Error(preview.blockedReasons.join(",")),{code:"BUSINESS_DELEGATION_BLOCKED",preview});
  if(preview.workflow.domainId!==record.schema.workflowDomainId)throw Object.assign(new Error("BUSINESS_WORKFLOW_DOMAIN_MISMATCH"),{code:"BUSINESS_WORKFLOW_DOMAIN_MISMATCH"});
  const detail=await businessApplicationStore.recordDetail(app.id,record.id,actor),approved=detail?.workItems?.find(value=>value.id===item.id)?.delegationPlan;if(!approved?.capabilityProtocol?.contractHash)throw Object.assign(new Error("BUSINESS_CAPABILITY_APPROVAL_REQUIRED"),{code:"BUSINESS_CAPABILITY_APPROVAL_REQUIRED"});if(approved.capabilityProtocol.contractHash!==preview.capabilityProtocol.contractHash)throw Object.assign(new Error("BUSINESS_CAPABILITY_CHANGED_REAPPROVAL_REQUIRED"),{code:"BUSINESS_CAPABILITY_CHANGED_REAPPROVAL_REQUIRED",approvedContractHash:approved.capabilityProtocol.contractHash,currentContractHash:preview.capabilityProtocol.contractHash});
  const catalog=domainCenterSummary(),application=catalog.applications.find(value=>value.id===app.id),domain=application.domains.find(value=>value.id===preview.workflow.domainId);
  const stage=domain.workflow[0],binding=createBusinessTaskBinding({scope:{organizationId:actor.organizationId??"anksen-local",workspaceId:actor.workspaceId,projectId:"anksen-agent-studio",applicationId:app.id,domainId:domain.id,userId:actor.userId},businessObject:{systemId:app.id,objectType:record.objectType,objectId:record.id,version:record.version,displayKey:record.displayKey,href:`${app.path}?record=${record.id}`},workflow:{definitionId:`${domain.id}-workflow`,definitionVersion:"1",instanceId:item.id,stageId:stage.key},skill:{businessSkillId:stage.businessSkillId,skillId:stage.skillType,skillType:stage.skillType,requiredCapabilities:[stage.skillType],riskLevel:domain.riskLevel??"LOW"},execution:{assignmentPolicy:"CAPABILITY",preferredRuntimeId:"controlled-stub",memoryScopeKey:`${app.id}:${record.objectType}:${record.id}`},writeback:{operation:"TRANSITION",expectedObjectVersion:record.version,eventType:`${app.id}.${record.objectType}.review-ready`}});
  let pool=null,ownsPool=false;
  try{
    ({pool,ownsPool}=await acquireWorkflowPool());if(!(await pool.query("SELECT to_regclass('ad_night_shift_session') ok")).rows[0].ok)await migrate(pool,"up");
    const service=new PersistentDomainWorkflowService(pool,{registry:portfolioRegistry}),submitted=await service.submit({sessionKey:`business-work:${item.id}:v${item.version}`,goal:item.title,explicitDomainId:domain.id,businessTaskBinding:binding,capabilityProtocol:preview.capabilityProtocol,scope:binding.scope}),runningItem=await businessApplicationStore.attachWorkflow(item.id,{goalId:submitted.goal?.id??submitted.session.goal_id,sessionId:submitted.session.id,report:null,status:"RUNNING",expectedWorkVersion:item.version});
    return{workItem:runningItem,sessionId:submitted.session.id,goalId:submitted.goal?.id??submitted.session.goal_id,resumed:submitted.resumed===true};
  }finally{if(pool&&ownsPool)await pool.end();}
};
const businessWorkExecutor=new PersistentBusinessWorkExecutor({store:businessApplicationStore,registry:portfolioRegistry,acquirePool:acquireWorkflowPool});
const businessRunnerRegistry=businessRuntime.pool?new PostgresBusinessRunnerRegistry({pool:businessRuntime.pool,offlineAfterMs:Number(process.env.BUSINESS_RUNNER_OFFLINE_AFTER_MS??15000)}):null;
const businessRunnerNodeKey=process.env.BUSINESS_RUNNER_NODE_KEY??`studio-console:${hostname()}`;
const businessWorkRunner=new ResidentBusinessWorkRunner({store:businessApplicationStore,pool:businessRuntime.pool,executeWork:item=>businessWorkExecutor.execute(item),pollMs:Number(process.env.BUSINESS_RUNNER_POLL_MS??1000),concurrency:Number(process.env.BUSINESS_RUNNER_CONCURRENCY??2),nodeRegistry:businessRunnerRegistry,nodeKey:businessRunnerNodeKey,onError:(error,item)=>console.error("Business runner error",item?.id??"unknown",error?.code??error?.message??error)});
const dispatchPortfolioInitiative = async ({ campaign, initiative }) => {
  const actor={organizationId:campaign.organizationId??"studio-org",workspaceId:campaign.workspaceId??"studio-workspace",userId:campaign.approvedBy??campaign.createdBy},app=getEnterpriseApplication(initiative.applicationId),record=initiative.businessObject?await businessApplicationStore.getRecord(app.id,initiative.businessObject.id,actor):null;
  if(!record)throw Object.assign(new Error("PORTFOLIO_BUSINESS_OBJECT_NOT_FOUND"),{code:"PORTFOLIO_BUSINESS_OBJECT_NOT_FOUND"});if(record.schema.workflowDomainId!==initiative.domainId)throw Object.assign(new Error("PORTFOLIO_BUSINESS_OBJECT_DOMAIN_MISMATCH"),{code:"PORTFOLIO_BUSINESS_OBJECT_DOMAIN_MISMATCH"});const delegationPlan=buildBusinessDelegationPreview({application:app,record,registry:portfolioRegistry});if(delegationPlan.status!=="READY")return{status:"BLOCKED",report:{businessObject:{applicationId:app.id,objectType:record.objectType,objectId:record.id,displayKey:record.displayKey,version:record.version,href:`${app.path}?record=${record.id}`},blockedReasons:delegationPlan.blockedReasons,nextAction:"ADVANCE_BUSINESS_OBJECT_TO_AGENT_REVIEW_STATE"}};
  const assigneeId=delegationPlan.capabilityProtocol.professionalStage?.agentId??delegationPlan.stages[0].agentId,item=await businessApplicationStore.createWorkItem({applicationId:app.id,businessObjectId:record.id,assignmentType:"AGENT",assigneeId,title:initiative.title,priority:"MEDIUM",idempotencyKey:`portfolio:${campaign.id}:${initiative.id}:v${record.version}`,delegationPlan},actor),execution=await enqueueBusinessWork({app,record,item,actor});businessWorkRunner.wake();const deadline=Date.now()+60000;let completed=await businessApplicationStore.getWorkItemForRunner(item.id);while(completed&&["OPEN","RUNNING"].includes(completed.status)&&Date.now()<deadline){await new Promise(resolve=>setTimeout(resolve,100));completed=await businessApplicationStore.getWorkItemForRunner(item.id);}if(!completed||["OPEN","RUNNING"].includes(completed.status))throw Object.assign(new Error("PORTFOLIO_BUSINESS_WORK_TIMEOUT"),{code:"PORTFOLIO_BUSINESS_WORK_TIMEOUT"});const latestRecord=await businessApplicationStore.getRecord(app.id,record.id,actor),humanApprovalRequired=completed.status==="WAITING_APPROVAL"||latestRecord?.status===latestRecord?.schema?.agentReviewStatus,succeeded=completed.status==="COMPLETED"&&!humanApprovalRequired,blockedReasons=[...(humanApprovalRequired?["BUSINESS_HUMAN_APPROVAL_REQUIRED"]:[]),...(completed.status!=="COMPLETED"&&completed.status!=="WAITING_APPROVAL"?[`BUSINESS_WORK_${completed.status}`]:[])];return{status:succeeded?"SUCCEEDED":"BLOCKED",report:{sessionId:execution.sessionId??completed.sessionId,goalId:execution.goalId??completed.kernelGoalId,totalTasks:completed.resultSummary?.summary?.totalTasks??0,runtimeExecutionCount:completed.resultSummary?.summary?.runtimeExecutionCount??0,businessObject:{applicationId:app.id,objectType:latestRecord?.objectType??record.objectType,objectId:record.id,displayKey:record.displayKey,version:latestRecord?.version??record.version,status:latestRecord?.status??record.status,agentReviewStatus:latestRecord?.schema?.agentReviewStatus,href:`${app.path}?record=${record.id}`},workItemId:completed.id,workStatus:completed.status,resultSummary:completed.resultSummary,humanApprovalRequired,blockedReasons,nextAction:humanApprovalRequired?"COMPLETE_BUSINESS_APPROVAL_AND_RECONCILE":completed.resultSummary?.nextAction??null,capabilityContractId:delegationPlan.capabilityProtocol.contractId,capabilityContractHash:delegationPlan.capabilityProtocol.contractHash}};
};
const autonomousPortfolio = new AutonomousPortfolioService({ repoRoot, registry: portfolioRegistry, dispatcher: dispatchPortfolioInitiative });
const enterpriseProgramPlanner=new EnterpriseProgramPlanner({registry:portfolioRegistry});
const businessOutcomeCenter = new BusinessOutcomeCenter({ repoRoot });
const autonomousDevelopmentJobs = new AutonomousDevelopmentJobs({ repoRoot });
const residentWorkerBroker = new ResidentWorkerBroker({
  storePath: resolve(process.env.STUDIO_RESIDENT_WORKER_STORE ?? join(repoRoot, "runtime/resident-workers/store.json")),
  leaseMs: Number(process.env.STUDIO_RESIDENT_WORKER_LEASE_MS ?? 45_000)
});
const capabilityResourceRegistry=new CapabilityResourceRegistry({repoRoot});
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
const avernetProviderGateway = process.env.AVERNET_PROVIDER_TOKEN ? new AvernetProviderGateway({
  studioGateway,
  store: new FileAvernetBridgeStore(resolve(repoRoot, "runtime/avernet/provider-bridge.json")),
  providerId: process.env.AVERNET_PROVIDER_ID ?? "anksen-studio",
  providerToken: process.env.AVERNET_PROVIDER_TOKEN
}) : null;

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

function sendCapabilityArtifact(request, response, artifact) {
  const range = String(request.headers.range ?? "");
  let start = 0, end = artifact.size - 1, status = 200;
  if (range) {
    const match = range.match(/^bytes=(\d*)-(\d*)$/);
    if (!match) { response.writeHead(416, { "content-range": `bytes */${artifact.size}` }); response.end(); return; }
    start = match[1] ? Number(match[1]) : 0;
    end = match[2] ? Number(match[2]) : artifact.size - 1;
    if (!Number.isInteger(start) || !Number.isInteger(end) || start < 0 || end < start || end >= artifact.size) { response.writeHead(416, { "content-range": `bytes */${artifact.size}` }); response.end(); return; }
    status = 206;
  }
  response.writeHead(status, { "content-type": artifact.contentType, "content-length": String(end - start + 1), "accept-ranges": "bytes", "cache-control": "private, no-store", ...(status === 206 ? { "content-range": `bytes ${start}-${end}/${artifact.size}` } : {}) });
  if (request.method === "HEAD") { response.end(); return; }
  createReadStream(artifact.path, { start, end }).on("error", () => response.destroy()).pipe(response);
}

async function readJsonBody(request) {
  const chunks = [];
  let total = 0;
  for await (const chunk of request) chunks.push(chunk);
  for (const chunk of chunks) {
    total += chunk.length;
    if (total > 16 * 1024 * 1024) {
      throw new Error("Console request body exceeds 16MB limit.");
    }
  }
  const text = Buffer.concat(chunks).toString("utf8");
  return text.trim() ? JSON.parse(text) : {};
}

async function readRawBody(request, limit = 600 * 1024) {
  const chunks = []; let total = 0;
  for await (const chunk of request) { total += chunk.length; if (total > limit) throw new Error("Request body exceeds capability upload chunk limit."); chunks.push(chunk); }
  return Buffer.concat(chunks);
}

function requireSameOrigin(request) {
  const expectedOrigin = identityRuntime ? new URL(identityRuntime.publicUrl).origin : `http://${request.headers.host ?? "localhost"}`;
  const forwardedOrigin = `${String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim()}://${String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost").split(",")[0].trim()}`;
  const origin = String(request.headers.origin ?? "");
  return Boolean(origin && (origin === expectedOrigin || origin === forwardedOrigin));
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

function sessionCookie(token, ttlHours, secure = false) {
  return `anksen_session=${encodeURIComponent(token)}; Path=/; HttpOnly; SameSite=Strict${secure ? "; Secure" : ""}; Max-Age=${Math.max(60, Number(ttlHours ?? 12) * 60 * 60)}`;
}

function clearSessionCookie() {
  return "anksen_session=; Path=/; HttpOnly; SameSite=Strict; Max-Age=0";
}

const server = createServer(async (request, response) => {
  try {
    if (identityRuntime && proxyIdentityRequest(request, response, { upstreamOrigin: identityRuntime.upstreamOrigin, publicOrigin: new URL(identityRuntime.publicUrl).origin })) return;
    if (studioMcpHandler && await studioMcpHandler(request, response)) return;
    if (!localOnly(request) && !String(request.url ?? "").startsWith("/api/v1/") && !String(request.url ?? "").startsWith("/api/avernet/") && !String(request.url ?? "").startsWith("/api/resident-workers/")) {
      sendJson(response, 403, { status: "BLOCKED", reason: "Console Action Server only accepts local 127.0.0.1 requests." });
      return;
    }
    const url = new URL(request.url ?? "/", `http://${request.headers.host ?? "localhost"}`);
    const pathname = url.pathname === "/dashboard" ? "/" : url.pathname;
    if (pathname.startsWith("/api/resident-workers/")) {
      const configuredToken = String(process.env.STUDIO_RESIDENT_WORKER_TOKEN ?? "");
      if (configuredToken.length < 32 || !tokenMatches(bearerToken(request), configuredToken)) { sendJson(response, 401, { status: "RESIDENT_WORKER_UNAUTHORIZED" }, { "www-authenticate": "Bearer" }); return; }
      try {
        const register = pathname === "/api/resident-workers/register";
        const heartbeat = pathname.match(/^\/api\/resident-workers\/([^/]+)\/heartbeat$/);
        const claim = pathname.match(/^\/api\/resident-workers\/([^/]+)\/claim$/);
        const lease = pathname.match(/^\/api\/resident-workers\/([^/]+)\/tasks\/([^/]+)\/lease$/);
        const result = pathname.match(/^\/api\/resident-workers\/([^/]+)\/tasks\/([^/]+)\/result$/);
        if (request.method === "POST" && register) { sendJson(response, 200, await residentWorkerBroker.register(await readJsonBody(request))); return; }
        if (request.method === "POST" && heartbeat) { sendJson(response, 200, await residentWorkerBroker.heartbeat(decodeURIComponent(heartbeat[1]), await readJsonBody(request))); return; }
        if (request.method === "POST" && claim) { sendJson(response, 200, { task: await residentWorkerBroker.claim(decodeURIComponent(claim[1])) }); return; }
        if (request.method === "POST" && lease) { sendJson(response, 200, await residentWorkerBroker.renew(decodeURIComponent(lease[1]), decodeURIComponent(lease[2]), await readJsonBody(request))); return; }
        if (request.method === "POST" && result) { sendJson(response, 200, await residentWorkerBroker.complete(decodeURIComponent(result[1]), decodeURIComponent(result[2]), await readJsonBody(request))); return; }
        sendJson(response, 404, { status: "RESIDENT_WORKER_ROUTE_NOT_FOUND" }); return;
      } catch (error) { sendJson(response, error?.code === "LEASE_LOST" ? 409 : 400, { status: error?.code ?? "RESIDENT_WORKER_REQUEST_FAILED", reason: error instanceof Error ? error.message : String(error) }); return; }
    }
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
    if (pathname.startsWith("/api/avernet/")) {
      if (!avernetProviderGateway) { sendJson(response, 503, { ok:false,error:{code:"provider_not_configured",message:"Avernet Provider Gateway is disabled until its credential reference is configured.",retryable:true} }); return; }
      try {
        if (request.method === "GET" && pathname === "/api/avernet/provider/manifest") { avernetProviderGateway.authenticate(request.headers);sendJson(response,200,avernetProviderGateway.botManifest());return; }
        if (request.method === "POST" && pathname === "/api/avernet/provider/messages") { const body=await readJsonBody(request),projectIds=String(process.env.AVERNET_ALLOWED_PROJECT_IDS??"").split(",").map(value=>value.trim()).filter(Boolean),result=await avernetProviderGateway.handle(body,{headers:request.headers,actor:{userId:`avernet:${process.env.AVERNET_PROVIDER_ID??"anksen-studio"}`,organizationId:process.env.AVERNET_ORGANIZATION_ID??"studio-org",workspaceId:process.env.AVERNET_WORKSPACE_ID??"studio-workspace",projectIds}});sendJson(response,200,result);return; }
        sendJson(response,404,{ok:false,error:{code:"not_found",message:"Avernet provider route not found",retryable:false}});return;
      } catch (error) { const known=error instanceof AvernetGatewayError;sendJson(response,known?error.status:500,{ok:false,error:{code:known?error.code:"internal_error",message:known?error.message:"Avernet provider request failed",retryable:known?error.retryable:false}});return; }
    }
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
        "set-cookie": sessionCookie(result.token, accessBundle.policy.session_ttl_hours, Boolean(identityRuntime) || String(request.headers["x-forwarded-proto"] ?? "") === "https")
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
    const capabilityProjectMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/projects\/([^/]+)$/);
    const capabilityMediaMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/projects\/([^/]+)\/media\/(.+)$/);
    const capabilityHandoffMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/handoffs$/);
    const capabilityUploadInitMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/uploads$/);
    const capabilityUploadChunkMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/uploads\/([^/]+)\/chunks\/(\d+)$/);
    const capabilityUploadCompleteMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/uploads\/([^/]+)\/complete$/);
    const capabilityRenderMatch = pathname.match(/^\/api\/capability-apps\/([^/]+)\/projects\/([^/]+)\/render$/);
    if (request.method === "GET" && pathname === "/api/capability-apps") {
      const routeAccess = evaluateConsoleRouteAccess("capabilityApps", accessContext); if (!routeAccess.allowed) { sendJson(response, 403, routeAccess); return; }
      sendJson(response, 200, await managedCapabilityAppCenter.dashboard({ includeProjectState: true })); return;
    }
    if (request.method === "GET" && capabilityProjectMatch) {
      const routeAccess = evaluateConsoleRouteAccess("capabilityApps", accessContext); if (!routeAccess.allowed) { sendJson(response, 403, routeAccess); return; }
      try { sendJson(response, 200, await managedCapabilityAppCenter.projectState(decodeURIComponent(capabilityProjectMatch[1]), decodeURIComponent(capabilityProjectMatch[2]))); }
      catch (error) { sendJson(response, 404, { status: error.code ?? "CAPABILITY_APP_PROJECT_FAILED", reason: error.message }); } return;
    }
    if ((request.method === "GET" || request.method === "HEAD") && capabilityMediaMatch) {
      const routeAccess = evaluateConsoleRouteAccess("capabilityApps", accessContext); if (!routeAccess.allowed) { sendJson(response, 403, routeAccess); return; }
      try { sendCapabilityArtifact(request, response, await managedCapabilityAppCenter.artifact(decodeURIComponent(capabilityMediaMatch[1]), decodeURIComponent(capabilityMediaMatch[2]), decodeURIComponent(capabilityMediaMatch[3]))); }
      catch (error) { sendJson(response, 404, { status: error.code ?? "CAPABILITY_APP_ARTIFACT_FAILED", reason: error.message }); } return;
    }
    if (request.method === "POST" && capabilityHandoffMatch) {
      if (!requireSameOrigin(request)) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "capability-app-handoff", risk: "MEDIUM" }, { user_context: accessContext }); if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { const body = await readJsonBody(request); sendJson(response, 201, await managedCapabilityAppCenter.createHandoff(decodeURIComponent(capabilityHandoffMatch[1]), body, { userId: accessContext.user?.user_id, workspaceId: accessContext.workspace_id })); }
      catch (error) { sendJson(response, 400, { status: error.code ?? "CAPABILITY_APP_HANDOFF_FAILED", reason: error.message }); } return;
    }
    if (request.method === "POST" && capabilityUploadInitMatch) {
      if (!requireSameOrigin(request)) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "capability-app-upload", risk: "MEDIUM" }, { user_context: accessContext }); if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { const body = await readJsonBody(request); sendJson(response, 201, await capabilityUploadStore.initialize({ ...body, appId: decodeURIComponent(capabilityUploadInitMatch[1]) }, { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error.code ?? "CAPABILITY_UPLOAD_FAILED", reason: error.message }); } return;
    }
    if (request.method === "PUT" && capabilityUploadChunkMatch) {
      if (!requireSameOrigin(request)) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "capability-app-upload", risk: "MEDIUM" }, { user_context: accessContext }); if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 200, await capabilityUploadStore.putChunk(decodeURIComponent(capabilityUploadChunkMatch[2]), capabilityUploadChunkMatch[3], await readRawBody(request))); }
      catch (error) { sendJson(response, 400, { status: error.code ?? "CAPABILITY_UPLOAD_FAILED", reason: error.message }); } return;
    }
    if (request.method === "POST" && capabilityUploadCompleteMatch) {
      if (!requireSameOrigin(request)) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "capability-app-upload", risk: "MEDIUM" }, { user_context: accessContext }); if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 200, await capabilityUploadStore.complete(decodeURIComponent(capabilityUploadCompleteMatch[2]))); }
      catch (error) { sendJson(response, 400, { status: error.code ?? "CAPABILITY_UPLOAD_FAILED", reason: error.message }); } return;
    }
    if (request.method === "POST" && capabilityRenderMatch) {
      if (!requireSameOrigin(request)) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "capability-app-render", risk: "MEDIUM" }, { user_context: accessContext }); if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 202, await managedCapabilityAppCenter.startRender(decodeURIComponent(capabilityRenderMatch[1]), decodeURIComponent(capabilityRenderMatch[2]))); }
      catch (error) { sendJson(response, 400, { status: error.code ?? "CAPABILITY_RENDER_FAILED", reason: error.message }); } return;
    }
    const domainCapabilityMemberMatch = pathname.match(/^\/api\/access\/members\/([^/]+)\/domain-capabilities$/);
    if (domainCapabilityMemberMatch) {
      if (!accessContext.can_manage_access && !(accessContext.capabilities ?? []).some((item) => item === "*" || item === "access.manage")) {
        sendJson(response, 403, { status: "ACCESS_MANAGEMENT_DENIED", reason: "管理员权限不足。" });
        return;
      }
      if (request.method !== "PATCH") {
        sendJson(response, 405, { status: "METHOD_NOT_ALLOWED" }, { allow: "PATCH" });
        return;
      }
      const expectedOrigin = identityRuntime ? new URL(identityRuntime.publicUrl).origin : `http://${request.headers.host ?? "localhost"}`;
      const forwardedOrigin = `${String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim()}://${String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost").split(",")[0].trim()}`;
      const requestOrigin = String(request.headers.origin ?? "");
      if (!requestOrigin || (requestOrigin !== expectedOrigin && requestOrigin !== forwardedOrigin)) {
        sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." });
        return;
      }
      try {
        const body = await readJsonBody(request);
        const result = await updateWorkspaceDomainCapabilities(
          accessBundle,
          decodeURIComponent(domainCapabilityMemberMatch[1]),
          body.capability_ids ?? body.capabilityIds ?? [],
          { actor: accessContext }
        );
        sendJson(response, 200, result);
      } catch (error) {
        const code = error?.code ?? "DOMAIN_CAPABILITY_UPDATE_FAILED";
        sendJson(response, code === "ACCESS_USER_NOT_FOUND" ? 404 : code === "ACCESS_MANAGEMENT_DENIED" ? 403 : 400, {
          status: code,
          reason: error instanceof Error ? error.message : String(error)
        });
      }
      return;
    }
    if (pathname === "/api/admin/agents" || pathname === "/api/admin/agents/audit" || pathname.startsWith("/api/admin/agents/")) {
      const routeAccess = evaluateConsoleRouteAccess("agentAdmin", accessContext);
      if (!routeAccess.allowed) { sendJson(response, 403, { status: "AGENT_ADMIN_ACCESS_DENIED", ...routeAccess }); return; }
      if (request.method === "GET" && pathname === "/api/admin/agents") {
        sendJson(response, 200, await agentAdminService.dashboard());
        return;
      }
      if (request.method === "GET" && pathname === "/api/admin/agents/audit") {
        sendJson(response, 200, { status: "READY", audits: await agentAdminService.audits(url.searchParams.get("limit")) });
        return;
      }
      const agentMatch = pathname.match(/^\/api\/admin\/agents\/([^/]+)$/);
      if ((request.method === "PUT" || request.method === "PATCH") && agentMatch) {
        const expectedOrigin = `http://${request.headers.host ?? "localhost"}`;
        const forwardedOrigin = `${String(request.headers["x-forwarded-proto"] ?? "http").split(",")[0].trim()}://${String(request.headers["x-forwarded-host"] ?? request.headers.host ?? "localhost").split(",")[0].trim()}`;
        const requestOrigin = String(request.headers.origin ?? "");
        if (requestOrigin && requestOrigin !== expectedOrigin && requestOrigin !== forwardedOrigin) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
        try {
          sendJson(response, 200, await agentAdminService.updateAgent(decodeURIComponent(agentMatch[1]), await readJsonBody(request), accessContext.user));
        } catch (error) {
          sendJson(response, error?.code?.endsWith("NOT_FOUND") ? 404 : 400, { status: error?.code ?? "AGENT_CONFIGURATION_INVALID", reason: error instanceof Error ? error.message : String(error) });
        }
        return;
      }
      sendJson(response, 405, { status: "METHOD_NOT_ALLOWED" }, { allow: "GET, PUT, PATCH" });
      return;
    }
    if (pathname === "/api/access/security") {
      if (request.method === "GET") {
        sendJson(response, 200, await accessSecuritySummary(accessBundle, accessContext.user.user_id, accessContext.session));
        return;
      }
      if (request.method === "POST") {
        const attemptKey = accessContext.user.user_id;
        const previousAttempt = passwordChangeFailures.get(attemptKey);
        const activeAttempt = previousAttempt && Date.now() - previousAttempt.startedAt < passwordChangeWindowMs ? previousAttempt : { count: 0, startedAt: Date.now() };
        if (activeAttempt.count >= passwordChangeAttemptLimit) { sendJson(response, 429, { status: "PASSWORD_CHANGE_RATE_LIMITED", reason: "密码验证失败次数过多，请 15 分钟后重试。" }); return; }
        const expectedOrigin = identityRuntime ? new URL(identityRuntime.publicUrl).origin : `http://${request.headers.host ?? "localhost"}`;
        if (String(request.headers.origin ?? "") !== expectedOrigin) { sendJson(response, 403, { status: "BLOCKED", reason: "Same-origin confirmation is required." }); return; }
        const body = await readJsonBody(request);
        try {
          const result = await changeOwnStudioPassword(accessBundle, {
            user_id: accessContext.user.user_id,
            current_password: body.currentPassword,
            new_password: body.newPassword,
            user_agent: request.headers["user-agent"] ?? "unknown"
          });
          passwordChangeFailures.delete(attemptKey);
          sendJson(response, 200, { status: result.status, session: result.session, revoked_session_count: result.revoked_session_count, audit_status: result.audit_status }, {
            "set-cookie": sessionCookie(result.token, accessBundle.policy.session_ttl_hours, Boolean(identityRuntime) || String(request.headers["x-forwarded-proto"] ?? "") === "https")
          });
        } catch (error) {
          if (error?.code === "CURRENT_PASSWORD_INVALID") passwordChangeFailures.set(attemptKey, { count: activeAttempt.count + 1, startedAt: activeAttempt.startedAt });
          sendJson(response, error?.code === "CURRENT_PASSWORD_INVALID" ? 401 : 400, { status: "PASSWORD_CHANGE_FAILED", code: error?.code ?? "PASSWORD_CHANGE_FAILED", reason: error instanceof Error ? error.message : String(error), details: error?.details ?? null });
        }
        return;
      }
      sendJson(response, 405, { status: "METHOD_NOT_ALLOWED" }, { allow: "GET, POST" });
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
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"};
      const visibleApplications=domainCenterSummary().applications.map(application=>({application,app:getEnterpriseApplication(application.id)})).filter(({app})=>app&&evaluateConsoleRouteAccess(app.routeId,accessContext).allowed);
      const applicationIds=visibleApplications.map(({application})=>application.id);
      const [progress,outcomes,campaigns,exceptions,professionalResults] = await Promise.all([
        autonomousExecutionCenter.getPortfolioProgress(),
        businessOutcomeCenter.dashboard(),
        autonomousPortfolio.list(scope),
        businessApplicationStore.businessExceptions({...scope,applicationIds,limit:100}),
        businessApplicationStore.professionalResults({...scope,applicationIds,limit:100})
      ]);
      const byApplication = new Map(progress.applications.map((item) => [item.application_id, item]));
      const outcomesByApplication = new Map(outcomes.applications.map((item) => [item.applicationId, item]));
      const portfolioWork=projectPortfolioWork(campaigns,{applicationIds});
      const applications=projectPortfolioCockpit({applications:visibleApplications.map(({application,app})=>({id:application.id,name:application.name,nameEn:application.nameEn,icon:application.icon,summary:application.summary,domainCount:application.domains.length,path:app.path})),portfolioWork,exceptions:exceptions.items,professionalResults:professionalResults.items});
      sendJson(response, 200, {
        generatedAt: progress.generatedAt,
        source: progress.source,
        workSummary:portfolioWork.summary,
        applications: applications.map((application) => ({
          ...application,
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
    if (request.method === "GET" && pathname === "/api/business/data-connectors") {
      if (!businessDataConnectorStore) { sendJson(response, 503, { status: "BUSINESS_DATA_CONNECTORS_REQUIRE_POSTGRESQL" }); return; }
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"};
      const connectors=await businessDataConnectorStore.list(scope),governed=await Promise.all(connectors.map(async connector=>({...connector,readiness:businessSourceGovernance?await businessSourceGovernance.readiness(connector.id,scope):null})));
      sendJson(response,200,{backend:businessRuntime.backend,connectors:governed});return;
    }
    const businessDataConnectorBatches=pathname.match(/^\/api\/business\/data-connectors\/([^/]+)\/batches$/);
    if(request.method==="GET"&&businessDataConnectorBatches){
      if(!businessDataConnectorStore){sendJson(response,503,{status:"BUSINESS_DATA_CONNECTORS_REQUIRE_POSTGRESQL"});return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"};
      sendJson(response,200,{batches:await businessDataConnectorStore.batches(decodeURIComponent(businessDataConnectorBatches[1]),scope)});return;
    }
    if (request.method === "GET" && pathname === "/api/business/applications") {
      const summary=enterpriseApplicationSummary();
      sendJson(response,200,{...summary,backend:businessRuntime.backend,applications:summary.applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed)});
      return;
    }
    if (request.method === "GET" && pathname === "/api/business/reports") {
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applications=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed),reports=await Promise.all(applications.map(app=>businessApplicationStore.applicationReport(app.id,scope)));
      sendJson(response,200,{generatedAt:new Date().toISOString(),backend:businessRuntime.backend,reports});return;
    }
    if (request.method === "GET" && pathname === "/api/business/exceptions") {
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const capabilities=accessContext.capabilities??[],scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),result=await businessApplicationStore.businessExceptions({...scope,applicationIds,limit:url.searchParams.get("limit")});
      sendJson(response,200,{...result,backend:businessRuntime.backend,canOperate:capabilities.some(value=>value==="*"||value==="business.operate"),canControl:capabilities.some(value=>value==="*"||value==="business.work.control")});return;
    }
    if (request.method === "GET" && pathname === "/api/business/notifications") {
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const capabilities=accessContext.capabilities??[],scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),[exceptions,allApprovals]=await Promise.all([businessApplicationStore.businessExceptions({...scope,applicationIds,limit:url.searchParams.get("limit")}),businessApplicationStore.approvalInbox(scope)]),canApprove=capabilities.some(value=>value==="*"||value==="proposal.approve"),approvals=canApprove?allApprovals.filter(item=>applicationIds.includes(item.applicationId)):[],notifications=projectBusinessNotifications({exceptions:exceptions.items,approvals,applicationIds,generatedAt:new Date().toISOString()});
      sendJson(response,200,{...notifications,backend:businessRuntime.backend});return;
    }
    if (request.method === "GET" && pathname === "/api/business/search") {
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),result=await businessApplicationStore.searchRecords({...scope,applicationIds,query:url.searchParams.get("q"),status:url.searchParams.get("status"),ownerId:url.searchParams.get("ownerId"),limit:url.searchParams.get("limit"),offset:url.searchParams.get("offset")});
      sendJson(response,200,{...result,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/results"){
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),requestedApplication=url.searchParams.get("applicationId");if(requestedApplication&&!applicationIds.includes(requestedApplication)){sendJson(response,403,{status:"BUSINESS_RESULT_APPLICATION_FORBIDDEN"});return;}const applicationId=requestedApplication||null;
      sendJson(response,200,{...await businessApplicationStore.professionalResults({...scope,applicationIds,applicationId,decision:url.searchParams.get("decision"),limit:url.searchParams.get("limit"),offset:url.searchParams.get("offset")}),backend:businessRuntime.backend,generatedAt:new Date().toISOString()});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/finance/control-report"){
      const access=evaluateConsoleRouteAccess("finance",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},report=await businessApplicationStore.financeControlReport(scope);sendJson(response,200,{...report,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/hr/workforce-pipeline"){
      const access=evaluateConsoleRouteAccess("hr",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},report=await businessApplicationStore.hrWorkforcePipeline(scope);sendJson(response,200,{...report,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/manufacturing/fulfillment-report"){
      const access=evaluateConsoleRouteAccess("manufacturing",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},report=await businessApplicationStore.manufacturingFulfillmentReport(scope);sendJson(response,200,{...report,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/smart-park/operations-report"){
      const access=evaluateConsoleRouteAccess("smartPark",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},report=await businessApplicationStore.smartParkOperationsReport(scope);sendJson(response,200,{...report,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/growth-sales/funnel-report"){
      const access=evaluateConsoleRouteAccess("growthSales",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},report=await businessApplicationStore.growthSalesFunnelReport(scope);sendJson(response,200,{...report,backend:businessRuntime.backend});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/growth-sales/delivery-dashboard"){
      const access=evaluateConsoleRouteAccess("growthSales",accessContext);if(!access.allowed){sendJson(response,403,access);return;}if(!growthDeliveryStore){sendJson(response,503,{status:"GROWTH_DELIVERY_REQUIRES_POSTGRESQL"});return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",tenantId:accessContext.tenant_id??"default"};try{sendJson(response,200,{...await growthDeliveryStore.dashboard(scope,{limit:url.searchParams.get("limit")}),backend:"POSTGRESQL"});}catch(error){if(error?.code==="42P01"){sendJson(response,503,{status:"GROWTH_DELIVERY_MIGRATION_REQUIRED"});return;}throw error;}return;
    }
    if(request.method==="GET"&&pathname==="/api/business/growth-sales/pilot-readiness"){
      const access=evaluateConsoleRouteAccess("growthSales",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const scope={organizationId:kingTurfTenantPack.organizationId,workspaceId:kingTurfTenantPack.workspaceId,tenantId:kingTurfTenantPack.tenantId},scopeMismatch=(accessContext.organization_id&&accessContext.organization_id!==scope.organizationId)||(accessContext.workspace_id&&accessContext.workspace_id!==scope.workspaceId)||(accessContext.tenant_id&&accessContext.tenant_id!==scope.tenantId);if(scopeMismatch){sendJson(response,404,{status:"GROWTH_PILOT_TENANT_NOT_CONFIGURED"});return;}const [operations,connectors,productionOperations]=await Promise.all([loadGrowthPilotOperations(scope),loadGrowthPilotConnectors(scope),growthProductionOperationsPolicy.status()]),governance={...kingTurfPilotReadinessInput.governance,productionOperationsPolicyAuthorized:productionOperations.status==='AUTHORIZED',productionOperationsPolicySource:productionOperations.gateId},report=assessGrowthPilotReadiness({tenantPack:kingTurfTenantPack,...kingTurfPilotReadinessInput,governance,connectors,operations});sendJson(response,200,{organizationId:report.organizationId,workspaceId:report.workspaceId,tenantId:report.tenantId,status:report.status,implementationReady:report.implementationReady,activationReady:report.activationReady,implementation:report.implementation,activation:report.activation,blockers:report.blockers,safety:report.safety,generatedAt:report.generatedAt,source:"VERSIONED_PILOT_EVIDENCE_WITH_LIVE_OPERATIONS",operationsSource:{delivery:operations.source,identityReview:operations.identityReviewSource,publishingCredential:connectors.find(item=>item.kind==='PUBLISHING')?.evidenceSource??"NOT_CONNECTED",productionOperations:productionOperations.gateId??"MISSING"}});return;
    }
    if(request.method==="GET"&&pathname==="/api/business/growth-sales/connector-activation-preflights"){
      const access=evaluateConsoleRouteAccess("growthSales",accessContext);if(!access.allowed){sendJson(response,403,access);return;}if(!growthConnectorActivationGate){sendJson(response,503,{status:"GROWTH_CONNECTOR_ACTIVATION_REQUIRES_POSTGRESQL"});return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",tenantId:accessContext.tenant_id??"default"};try{const [preflights,productionOperations]=await Promise.all([growthConnectorActivationGate.listPreflights({scope,limit:url.searchParams.get("limit")}),growthProductionOperationsPolicy.status()]);sendJson(response,200,{...preflights,productionOperations,backend:"POSTGRESQL"});}catch(error){if(error?.code==="42P01"){sendJson(response,503,{status:"GROWTH_CONNECTOR_ACTIVATION_MIGRATION_REQUIRED"});return;}throw error;}return;
    }
    if(request.method==="GET"&&pathname==="/api/business/growth-sales/identity-reviews"){
      const access=evaluateConsoleRouteAccess("growthSales",accessContext);if(!access.allowed){sendJson(response,403,access);return;}if(!growthIdentityReviewStore){sendJson(response,503,{status:"GROWTH_IDENTITY_REVIEW_REQUIRES_POSTGRESQL"});return;}const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",tenantId:accessContext.tenant_id??"default"};try{sendJson(response,200,{...await growthIdentityReviewStore.list(scope,{status:url.searchParams.get("status")??"OPEN",limit:url.searchParams.get("limit")}),backend:"POSTGRESQL"});}catch(error){if(error?.code==="42P01"){sendJson(response,503,{status:"GROWTH_IDENTITY_REVIEW_MIGRATION_REQUIRED"});return;}throw error;}return;
    }
    const growthIdentityReviewDecision=pathname.match(/^\/api\/business\/growth-sales\/identity-reviews\/([^/]+)\/decision$/);
    if(request.method==="POST"&&growthIdentityReviewDecision){const routeAccess=evaluateConsoleRouteAccess("growthSales",accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}if(!growthIdentityReviewStore){sendJson(response,503,{status:"GROWTH_IDENTITY_REVIEW_REQUIRES_POSTGRESQL"});return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"growth-identity-review-decision",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}const body=await readJsonBody(request),scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",tenantId:accessContext.tenant_id??"default"};try{sendJson(response,200,{case:await growthIdentityReviewStore.decide({scope,id:decodeURIComponent(growthIdentityReviewDecision[1]),expectedVersion:Number(body.expectedVersion),decision:String(body.decision??""),resolutionLeadId:body.resolutionLeadId?String(body.resolutionLeadId):null,reason:String(body.reason??""),actorId:accessContext.user?.user_id??"unknown"})});}catch(error){sendJson(response,409,{status:error.code??"GROWTH_IDENTITY_REVIEW_DECISION_FAILED",reason:error.message});}return;}
    const growthDeliveryRetry=pathname.match(/^\/api\/business\/growth-sales\/deliveries\/([^/]+)\/retry$/),growthDeliveryReconcile=pathname.match(/^\/api\/business\/growth-sales\/deliveries\/([^/]+)\/reconcile$/);
    if(request.method==="POST"&&(growthDeliveryRetry||growthDeliveryReconcile)){
      const routeAccess=evaluateConsoleRouteAccess("growthSales",accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}if(!growthDeliveryStore){sendJson(response,503,{status:"GROWTH_DELIVERY_REQUIRES_POSTGRESQL"});return;}const actionId=growthDeliveryRetry?"growth-delivery-retry":"growth-delivery-reconcile",access=await evaluateConsoleActionAccess(accessBundle,{action_id:actionId,risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}const body=await readJsonBody(request),scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",tenantId:accessContext.tenant_id??"default"},id=decodeURIComponent((growthDeliveryRetry??growthDeliveryReconcile)[1]),actorId=accessContext.user?.user_id??"unknown";try{const operation=growthDeliveryRetry?await growthDeliveryStore.requestRetry({scope,id,expectedVersion:Number(body.expectedVersion),actorId}):await growthDeliveryStore.reconcile({scope,id,expectedVersion:Number(body.expectedVersion),observedExternalId:String(body.observedExternalId??""),observedStatus:body.observedStatus?String(body.observedStatus):null,actorId});sendJson(response,200,{operation:{id:operation.id,status:operation.status,attempts:Number(operation.attempts),maxAttempts:Number(operation.max_attempts),retryAt:operation.next_attempt_at?.toISOString?.()??operation.next_attempt_at??null,reconciliationStatus:operation.reconciliation_status,version:Number(operation.version)}});}catch(error){sendJson(response,409,{status:error.code??"GROWTH_DELIVERY_CONTROL_FAILED",reason:error.message});}return;
    }
    if(request.method==="GET"&&pathname==="/api/business/capabilities"){
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}const catalog=domainCenterSummary(),visibleApplications=catalog.applications.filter(item=>{const app=getEnterpriseApplication(item.id);return app&&evaluateConsoleRouteAccess(app.routeId,accessContext).allowed;}),protocols=visibleApplications.flatMap(item=>{const app=getEnterpriseApplication(item.id);return item.domains.map(domain=>buildBusinessCapabilityProtocol({application:app,domain,registry:portfolioRegistry}));}),professional=protocols.filter(item=>item.professionalStage);
      const knowledgeResources=await capabilityResourceRegistry.inventory();sendJson(response,200,{schemaVersion:2,generatedAt:new Date().toISOString(),protocols,knowledgeResources,summary:{applications:visibleApplications.length,workflows:protocols.length,ready:protocols.filter(item=>item.status==="READY").length,blocked:protocols.filter(item=>item.status==="BLOCKED").length,professionalRunners:professional.length,knowledgeResources:knowledgeResources.summary.ready,designPresets:knowledgeResources.summary.items,executionOnly:protocols.filter(item=>item.outcomeMode==="EXECUTION_EVIDENCE_ONLY").length}});return;
    }
    const businessApplicationReport=pathname.match(/^\/api\/business\/applications\/([^/]+)\/report$/);
    if(request.method==="GET"&&businessApplicationReport){const applicationId=decodeURIComponent(businessApplicationReport[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}sendJson(response,200,{backend:businessRuntime.backend,report:await businessApplicationStore.applicationReport(app.id,{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"})});return;}
    if (request.method === "GET" && pathname === "/api/work") {
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},capabilities=accessContext.capabilities??[],canApprove=capabilities.some(value=>value==="*"||value==="proposal.approve"),canControl=capabilities.some(value=>value==="*"||value==="business.work.control"),canManage=capabilities.some(value=>value==="*"||value==="business.manage"),work=await businessApplicationStore.myWork({...scope,userId:accessContext.user?.user_id,includeAll:canManage,applicationId:url.searchParams.get("applicationId")}),visibleApplicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),approvals=canApprove?(await businessApplicationStore.approvalInbox(scope)).filter(item=>visibleApplicationIds.includes(item.applicationId)):[];
      const runnerFleet=canManage&&businessRunnerRegistry?await businessRunnerRegistry.dashboard():null,runnerCapabilities=canManage?portfolioRegistry.professionalCapabilities:null,professionalArtifacts=canManage?await projectProfessionalArtifacts({repoRoot}):null;
      sendJson(response,200,{...work,items:work.items.map(item=>({...item,execution:item.execution??projectBusinessWorkExecution({workItem:item})})),approvals,canApprove,canControl,canManage,runner:businessWorkRunner.snapshot(),runnerFleet,runnerCapabilities,professionalArtifacts,summary:{...work.summary,pendingApprovals:approvals.length},backend:businessRuntime.backend});
      return;
    }
    if(request.method==="GET"&&pathname==="/api/portfolio/work-report"){
      const access=evaluateConsoleRouteAccess("work",accessContext);if(!access.allowed){sendJson(response,403,access);return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"},applicationIds=enterpriseApplicationSummary().applications.filter(app=>evaluateConsoleRouteAccess(app.routeId,accessContext).allowed).map(app=>app.id),campaigns=await autonomousPortfolio.list(scope);
      sendJson(response,200,projectPortfolioWork(campaigns,{applicationIds}));return;
    }
    const businessRecords=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records$/);
    if (businessRecords) {
      const applicationId=decodeURIComponent(businessRecords[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}
      const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"};
      if(request.method==="GET"){sendJson(response,200,{application:app,backend:businessRuntime.backend,...await businessApplicationStore.recordPage(app.id,{...scope,query:url.searchParams.get("q"),objectType:url.searchParams.get("objectType"),status:url.searchParams.get("status"),ownerId:url.searchParams.get("ownerId"),limit:url.searchParams.get("limit"),offset:url.searchParams.get("offset")})});return;}
      if(request.method==="POST"){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-create",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.createRecord(app.id,await readJsonBody(request),{...scope,userId:accessContext.user?.user_id}));}catch(error){sendJson(response,400,{status:error.code??"BUSINESS_RECORD_INVALID",reason:error.message});}return;}
    }
    const businessTransition=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/transition$/);
    const businessRecordNote=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/notes$/);
    const businessDelegationPreview=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/delegation-preview$/);
    const businessRecordRelation=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/relations$/);
    const businessRelatedRecord=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/related-records$/);
    const businessRecordDetail=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)$/);
    if(request.method==="GET"&&businessDelegationPreview){const applicationId=decodeURIComponent(businessDelegationPreview[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-work-assign",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}const actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id},record=await businessApplicationStore.getRecord(app.id,decodeURIComponent(businessDelegationPreview[2]),actor);if(!record){sendJson(response,404,{status:"BUSINESS_RECORD_NOT_FOUND"});return;}sendJson(response,200,buildBusinessDelegationPreview({application:app,record,registry:portfolioRegistry}));return;}
    if(request.method==="POST"&&businessRecordNote){const applicationId=decodeURIComponent(businessRecordNote[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-note",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.addRecordNote(app.id,decodeURIComponent(businessRecordNote[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_RECORD_NOTE_FAILED",reason:error.message});}return;}
    if(request.method==="PATCH"&&businessRecordDetail){const applicationId=decodeURIComponent(businessRecordDetail[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-update",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,200,await businessApplicationStore.updateRecord(app.id,decodeURIComponent(businessRecordDetail[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_RECORD_UPDATE_FAILED",reason:error.message});}return;}
    if(request.method==="POST"&&businessRelatedRecord){const applicationId=decodeURIComponent(businessRelatedRecord[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-related-record-create",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.createRelatedRecord(app.id,decodeURIComponent(businessRelatedRecord[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_RELATED_RECORD_FAILED",reason:error.message});}return;}
    if(request.method==="POST"&&businessRecordRelation){const applicationId=decodeURIComponent(businessRecordRelation[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-relate",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.createRelation(app.id,decodeURIComponent(businessRecordRelation[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_RELATION_FAILED",reason:error.message});}return;}
    if(request.method==="GET"&&businessRecordDetail){const applicationId=decodeURIComponent(businessRecordDetail[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const detail=await businessApplicationStore.recordDetail(app.id,decodeURIComponent(businessRecordDetail[2]),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"});if(detail)detail.workItems=detail.workItems.map(item=>({...item,execution:item.execution??projectBusinessWorkExecution({workItem:item})}));sendJson(response,detail?200:404,detail??{status:"BUSINESS_RECORD_NOT_FOUND"});return;}
    const businessApprovalRequest=pathname.match(/^\/api\/business\/applications\/([^/]+)\/records\/([^/]+)\/approvals$/);
    if(request.method==="POST"&&businessApprovalRequest){const applicationId=decodeURIComponent(businessApprovalRequest[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-approval-request",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,201,await businessApplicationStore.requestApproval(app.id,decodeURIComponent(businessApprovalRequest[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_APPROVAL_FAILED",reason:error.message});}return;}
    const businessApprovalDecision=pathname.match(/^\/api\/business\/applications\/([^/]+)\/approvals\/([^/]+)\/decision$/);
    if(request.method==="POST"&&businessApprovalDecision){const applicationId=decodeURIComponent(businessApprovalDecision[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-approval-decision",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,200,await businessApplicationStore.decideApproval(app.id,decodeURIComponent(businessApprovalDecision[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_APPROVAL_FAILED",reason:error.message});}return;}
    if(request.method==="POST"&&businessTransition){const applicationId=decodeURIComponent(businessTransition[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-transition",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{sendJson(response,200,await businessApplicationStore.transitionRecord(app.id,decodeURIComponent(businessTransition[2]),await readJsonBody(request),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id}));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_TRANSITION_FAILED",reason:error.message});}return;}
    const businessWork=pathname.match(/^\/api\/business\/applications\/([^/]+)\/work$/);
    const businessWorkControl=pathname.match(/^\/api\/business\/work\/([^/]+)\/control$/);
    const businessRunnerControl=pathname.match(/^\/api\/business\/runners\/([^/]+)\/control$/);
    if(request.method==="GET"&&pathname==="/api/business/runners"){
      const routeAccess=evaluateConsoleRouteAccess("work",accessContext),capabilities=accessContext.capabilities??[],canManage=capabilities.some(value=>value==="*"||value==="business.manage");if(!routeAccess.allowed||!canManage){sendJson(response,403,{status:"BUSINESS_RUNNER_ACCESS_DENIED"});return;}if(!businessRunnerRegistry){sendJson(response,503,{status:"BUSINESS_RUNNER_REGISTRY_UNAVAILABLE"});return;}sendJson(response,200,await businessRunnerRegistry.dashboard());return;
    }
    if(request.method==="GET"&&pathname==="/api/business/runner-capabilities"){
      const routeAccess=evaluateConsoleRouteAccess("work",accessContext),capabilities=accessContext.capabilities??[],canManage=capabilities.some(value=>value==="*"||value==="business.manage");if(!routeAccess.allowed||!canManage){sendJson(response,403,{status:"BUSINESS_RUNNER_ACCESS_DENIED"});return;}sendJson(response,200,portfolioRegistry.professionalCapabilities);return;
    }
    if(request.method==="POST"&&pathname==="/api/business/runner-capabilities/preflight"){
      const routeAccess=evaluateConsoleRouteAccess("work",accessContext),capabilities=accessContext.capabilities??[],canManage=capabilities.some(value=>value==="*"||value==="business.manage");if(!routeAccess.allowed||!canManage){sendJson(response,403,{status:"BUSINESS_RUNNER_ACCESS_DENIED"});return;}const body=await readJsonBody(request);sendJson(response,200,await new ProfessionalRunnerCapabilityRegistry({credentialReferenceIds:String(process.env.STUDIO_PROFESSIONAL_CREDENTIAL_REFERENCES??"").split(",").filter(Boolean),registeredAdapterIds:implementedProfessionalAdapterIds}).preflight(body));return;
    }
    if(request.method==="POST"&&pathname==="/api/cad/analyze"){
      const routeAccess=evaluateConsoleRouteAccess("cad",accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"cad-document-analyze",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"&&!(accessContext.capabilities??[]).includes("*")){sendJson(response,403,access);return;}
      try{const body=await readJsonBody(request),filename=String(body.filename??""),content=Buffer.from(String(body.contentBase64??""),"base64"),document=cadAgentSdk.parseDocument({filename,content});sendJson(response,200,{status:"PASS",document,previewSvg:cadAgentSdk.preview(document),report:cadAgentSdk.generateReport(document)});}catch(error){sendJson(response,400,{status:error.code??"CAD_ANALYSIS_FAILED",reason:error.message,details:error.details??{}});}return;
    }
    if(request.method==="POST"&&businessRunnerControl){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-runner-control",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}if(!businessRunnerRegistry){sendJson(response,503,{status:"BUSINESS_RUNNER_REGISTRY_UNAVAILABLE"});return;}try{const body=await readJsonBody(request),nodeKey=decodeURIComponent(businessRunnerControl[1]),node=await businessRunnerRegistry.control(nodeKey,{desiredState:body.desiredState,expectedVersion:body.expectedVersion,actorId:accessContext.user?.user_id});if(nodeKey===businessRunnerNodeKey&&node.desiredState==="ONLINE")businessWorkRunner.wake();sendJson(response,200,{node});}catch(error){sendJson(response,error.code==="BUSINESS_RUNNER_NODE_NOT_FOUND"?404:409,{status:error.code??"BUSINESS_RUNNER_CONTROL_FAILED",reason:error.message});}return;}
    if(request.method==="POST"&&businessWorkControl){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-work-control",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}try{const body=await readJsonBody(request),capabilities=accessContext.capabilities??[],actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id,canManageBusiness:capabilities.some(value=>value==="*"||value==="business.manage")},item=await businessApplicationStore.controlWorkItem(decodeURIComponent(businessWorkControl[1]),body,actor);let execution=null;if(item.assignmentType==="AGENT"&&["RESUME","REASSIGN"].includes(String(body.action??"").toUpperCase())){const app=getEnterpriseApplication(item.applicationId),record=app?await businessApplicationStore.getRecord(app.id,item.businessObject.objectId,actor):null;if(!app||!record)throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"),{code:"BUSINESS_RECORD_NOT_FOUND"});execution=await enqueueBusinessWork({app,record,item,actor});businessWorkRunner.wake();}sendJson(response,200,{item,execution});}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_WORK_CONTROL_FAILED",reason:error.message});}return;}
    if(request.method==="POST"&&businessWork){
      const applicationId=decodeURIComponent(businessWork[1]),app=getEnterpriseApplication(applicationId);if(!app){sendJson(response,404,{status:"APPLICATION_NOT_FOUND"});return;}
      const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-work-assign",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}
      try{
        const body=await readJsonBody(request),actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id},record=await businessApplicationStore.getRecord(app.id,body.businessObjectId,actor);if(!record)throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"),{code:"BUSINESS_RECORD_NOT_FOUND"});
        if(body.assignmentType==="AGENT"&&record.version!==Number(body.expectedObjectVersion))throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"),{code:"BUSINESS_RECORD_VERSION_CONFLICT"});
        let delegationPlan=null;if(body.assignmentType==="AGENT"){delegationPlan=buildBusinessDelegationPreview({application:app,record,registry:portfolioRegistry});if(delegationPlan.status!=="READY")throw Object.assign(new Error(delegationPlan.blockedReasons.join(",")),{code:"BUSINESS_DELEGATION_BLOCKED"});}
        const item=await businessApplicationStore.createWorkItem({...body,delegationPlan,title:body.title??businessWorkflowGoal(app.id,record),applicationId:app.id},actor);
        if(item.assignmentType!=="AGENT"){sendJson(response,201,item);return;}
        const execution=await enqueueBusinessWork({app,record,item,actor});businessWorkRunner.wake();sendJson(response,202,{status:execution.workItem.status==="RUNNING"?"QUEUED":execution.workItem.status,workItemId:item.id,execution,...await businessApplicationStore.myWork({...actor,applicationId:app.id})});
      }catch(error){sendJson(response,400,{status:error.code??"BUSINESS_WORK_INVALID",reason:error.message});}return;
    }
    if (request.method === "GET" && pathname === "/api/outcomes/dashboard") {
      sendJson(response, 200, await businessOutcomeCenter.dashboard());
      return;
    }
    if (request.method === "GET" && pathname === "/api/development/jobs") {
      sendJson(response, 200, { jobs: await autonomousDevelopmentJobs.list(), worker: await autonomousDevelopmentJobs.workerStatus(), readiness: await assessAutonomousDevelopmentReadiness({ root: repoRoot }),operations:await autonomousDevelopmentJobs.operations() });
      return;
    }
    if (request.method === "GET" && pathname === "/api/resident-worker-control") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "agent-real-plan", project_id: "anksen-agent-studio", risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      sendJson(response, 200, await residentWorkerBroker.dashboard()); return;
    }
    if (request.method === "POST" && pathname === "/api/resident-worker-control/tasks") {
      const body = await readJsonBody(request);
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "agent-real-plan", project_id: String(body.projectId ?? ""), risk: body.mode === "GOVERNED_WRITE" ? "HIGH" : "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await residentWorkerBroker.enqueue(body, { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "RESIDENT_TASK_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if(request.method==="GET"&&pathname==="/api/development/audit-export"){sendJson(response,200,await autonomousDevelopmentJobs.auditExport());return;}
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
    if(request.method==="POST"&&pathname==="/api/business/data-connectors"){
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-data-connector-register",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}if(!businessDataConnectorStore){sendJson(response,503,{status:"BUSINESS_DATA_CONNECTORS_REQUIRE_POSTGRESQL"});return;}
      try{const body=await readJsonBody(request),actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id};sendJson(response,201,await businessDataConnectorStore.register(body,actor));}catch(error){sendJson(response,400,{status:error.code??"BUSINESS_CONNECTOR_INVALID",reason:error.message});}return;
    }
    const businessDataConnectorIngest=pathname.match(/^\/api\/business\/data-connectors\/([^/]+)\/ingest$/);
    if(request.method==="POST"&&businessDataConnectorIngest){
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-data-connector-ingest",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}if(!businessDataConnectorStore){sendJson(response,503,{status:"BUSINESS_DATA_CONNECTORS_REQUIRE_POSTGRESQL"});return;}
      try{const body=await readJsonBody(request),actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id};sendJson(response,200,await businessDataConnectorStore.ingest(decodeURIComponent(businessDataConnectorIngest[1]),body,actor));}catch(error){sendJson(response,400,{status:error.code??"BUSINESS_SYNC_FAILED",reason:error.message});}return;
    }
    const businessSourceApprovalRequest=pathname.match(/^\/api\/business\/data-connectors\/([^/]+)\/approvals$/);
    if(request.method==="POST"&&businessSourceApprovalRequest){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-data-source-approval-request",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}if(!businessSourceGovernance){sendJson(response,503,{status:"BUSINESS_SOURCE_GOVERNANCE_REQUIRES_POSTGRESQL"});return;}try{const body=await readJsonBody(request),actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id};sendJson(response,201,await businessSourceGovernance.request(decodeURIComponent(businessSourceApprovalRequest[1]),body,actor));}catch(error){sendJson(response,400,{status:error.code??"BUSINESS_SOURCE_APPROVAL_FAILED",reason:error.message});}return;}
    const businessSourceApprovalDecision=pathname.match(/^\/api\/business\/data-source-approvals\/([^/]+)\/decision$/);
    if(request.method==="POST"&&businessSourceApprovalDecision){const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-data-source-approval-decision",risk:"MEDIUM"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}if(!businessSourceGovernance){sendJson(response,503,{status:"BUSINESS_SOURCE_GOVERNANCE_REQUIRES_POSTGRESQL"});return;}try{const body=await readJsonBody(request),actor={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id};sendJson(response,200,await businessSourceGovernance.decide(decodeURIComponent(businessSourceApprovalDecision[1]),body,actor));}catch(error){sendJson(response,409,{status:error.code??"BUSINESS_SOURCE_APPROVAL_CONFLICT",reason:error.message});}return;}
    if (request.method === "POST" && pathname === "/api/outcomes/snapshots") {
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "outcome-snapshot-ingest", risk: "MEDIUM" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try { sendJson(response, 201, await businessOutcomeCenter.ingest(await readJsonBody(request), { userId: accessContext.user?.user_id })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "OUTCOME_SNAPSHOT_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    if (request.method === "GET" && pathname === "/api/portfolio/campaigns") {
      const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"};sendJson(response, 200, { campaigns: await autonomousPortfolio.list(scope), catalog: domainCenterSummary() });
      return;
    }
    if(request.method==="POST"&&pathname==="/api/portfolio/plan"){
      const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"portfolio-create",project_id:"anksen-agent-studio",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}const body=await readJsonBody(request),allowedApplicationIds=domainCenterSummary().applications.filter(item=>{const app=getEnterpriseApplication(item.id);return app&&evaluateConsoleRouteAccess(app.routeId,accessContext).allowed;}).map(item=>item.id);try{sendJson(response,200,enterpriseProgramPlanner.plan(body.goal,{allowedApplicationIds}));}catch(error){sendJson(response,400,{status:error?.code??"ENTERPRISE_PROGRAM_PLAN_INVALID",reason:error instanceof Error?error.message:String(error)});}return;
    }
    if (request.method === "POST" && pathname === "/api/portfolio/campaigns") {
      const body = await readJsonBody(request);
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: "portfolio-create", project_id: String(body.projectId ?? "anksen-agent-studio"), risk: "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      try {const allowedApplicationIds=new Set(domainCenterSummary().applications.filter(item=>{const app=getEnterpriseApplication(item.id);return app&&evaluateConsoleRouteAccess(app.routeId,accessContext).allowed;}).map(item=>item.id)),requestedApplicationIds=(body.workstreams?.length?body.workstreams.map(item=>item.applicationId):[body.applicationId]).map(String);if(requestedApplicationIds.some(id=>!allowedApplicationIds.has(id)))throw Object.assign(new Error("PORTFOLIO_APPLICATION_FORBIDDEN"),{code:"PORTFOLIO_APPLICATION_FORBIDDEN"});if(body.plannerPlan){enterpriseProgramPlanner.validate(body.plannerPlan);if(JSON.stringify(body.plannerPlan.workstreams.map(item=>({applicationId:item.applicationId,domainIds:item.domainIds,dependsOn:item.dependsOn})))!==JSON.stringify((body.workstreams??[]).map(item=>({applicationId:item.applicationId,domainIds:item.domainIds,dependsOn:item.dependsOn}))))throw Object.assign(new Error("PORTFOLIO_PLANNER_PLAN_MISMATCH"),{code:"PORTFOLIO_PLANNER_PLAN_MISMATCH"});}sendJson(response, 201, await autonomousPortfolio.create(body, { userId: accessContext.user?.user_id,organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace" })); }
      catch (error) { sendJson(response, 400, { status: error?.code ?? "PORTFOLIO_INVALID", reason: error instanceof Error ? error.message : String(error) }); }
      return;
    }
    const portfolioProposal=pathname.match(/^\/api\/portfolio\/campaigns\/([^/]+)\/proposals\/([^/]+)\/materialize$/);
    if(request.method==="POST"&&portfolioProposal){const scope={organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace",userId:accessContext.user?.user_id},campaign=await autonomousPortfolio.get(decodeURIComponent(portfolioProposal[1]),scope);if(!campaign){sendJson(response,404,{status:"PORTFOLIO_NOT_FOUND"});return;}const proposal=campaign.businessObjectProposals?.find(item=>item.id===decodeURIComponent(portfolioProposal[2])),app=proposal?getEnterpriseApplication(proposal.applicationId):null;if(!proposal||!app){sendJson(response,404,{status:"PORTFOLIO_PROPOSAL_NOT_FOUND"});return;}const routeAccess=evaluateConsoleRouteAccess(app.routeId,accessContext);if(!routeAccess.allowed){sendJson(response,403,routeAccess);return;}const access=await evaluateConsoleActionAccess(accessBundle,{action_id:"business-record-create",risk:"LOW"},{user_context:accessContext});if(access.status!=="ALLOW"){sendJson(response,403,access);return;}const body=await readJsonBody(request);try{const result=await autonomousPortfolio.materializeProposal(campaign.id,proposal.id,{actor:scope,createOrLoad:async current=>{const page=await businessApplicationStore.recordPage(app.id,{...scope,query:current.displayKey,limit:20}),existing=page.items.find(item=>item.displayKey===current.displayKey);return existing??businessApplicationStore.createRecord(app.id,{objectType:current.objectType,displayKey:current.displayKey,title:String(body.title??current.title),ownerId:body.ownerId,fields:body.fields??{}},scope);}});sendJson(response,result.resumed?200:201,result);}catch(error){sendJson(response,error.code==="PORTFOLIO_PROPOSAL_BUSY"?409:400,{status:error.code??"PORTFOLIO_PROPOSAL_INVALID",reason:error.message,field:error.field??null});}return;}
    const portfolioAction = pathname.match(/^\/api\/portfolio\/campaigns\/([^/]+)\/(activate|tick|pause|reconcile)$/);
    if (request.method === "POST" && portfolioAction) {
      const campaign = await autonomousPortfolio.get(decodeURIComponent(portfolioAction[1]),{organizationId:accessContext.organization_id??"studio-org",workspaceId:accessContext.workspace_id??"studio-workspace"});
      if (!campaign) { sendJson(response, 404, { status: "PORTFOLIO_NOT_FOUND" }); return; }
      const access = await evaluateConsoleActionAccess(accessBundle, { action_id: `portfolio-${portfolioAction[2]}`, project_id: campaign.projectId, risk: ["activate","reconcile"].includes(portfolioAction[2]) ? "MEDIUM" : "LOW" }, { user_context: accessContext });
      if (access.status !== "ALLOW") { sendJson(response, 403, access); return; }
      if(portfolioAction[2]==="activate"&&campaign.plannerEvidence){const actor={organizationId:campaign.organizationId,workspaceId:campaign.workspaceId,userId:accessContext.user?.user_id},notReady=[];for(const proposal of campaign.businessObjectProposals??[]){if(!proposal.record){notReady.push({proposalId:proposal.id,code:proposal.blockedReason??"BUSINESS_OBJECT_REQUIRED"});continue;}const app=getEnterpriseApplication(proposal.applicationId),record=await businessApplicationStore.getRecord(app.id,proposal.record.id,actor);if(!record){notReady.push({proposalId:proposal.id,code:"BUSINESS_RECORD_NOT_FOUND"});continue;}const preview=buildBusinessDelegationPreview({application:app,record,registry:portfolioRegistry});if(preview.status!=="READY")notReady.push({proposalId:proposal.id,recordId:record.id,href:proposal.record.href,code:"BUSINESS_RECORD_NOT_READY_FOR_AGENT",reasons:preview.blockedReasons});}if(notReady.length){sendJson(response,409,{status:"PORTFOLIO_BUSINESS_OBJECTS_NOT_READY",items:notReady});return;}}
      if(portfolioAction[2]==="reconcile"){const actor={organizationId:campaign.organizationId,workspaceId:campaign.workspaceId,userId:accessContext.user?.user_id},waiting=campaign.initiatives.filter(item=>item.status==="BLOCKED"&&item.report?.humanApprovalRequired===true);let result=campaign,resolved=0;for(const initiative of waiting){const reference=initiative.report.businessObject,app=getEnterpriseApplication(reference.applicationId),record=await businessApplicationStore.getRecord(app.id,reference.objectId,actor);if(record&&businessApprovalAccepted(record.applicationId,record.objectType,record.status)){result=await autonomousPortfolio.resolveHumanApproval(campaign.id,initiative.id,{actor,record});resolved++;}}if(!resolved){sendJson(response,409,{status:"PORTFOLIO_APPROVAL_STILL_PENDING",waiting:waiting.map(item=>({initiativeId:item.id,businessObject:item.report.businessObject,nextAction:item.report.nextAction}))});return;}sendJson(response,200,{...result,reconciled:resolved});return;}
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
      const { pool, ownsPool } = await acquireWorkflowPool();
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
        if (ownsPool) await pool.end();
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
  businessWorkRunner.start();
  console.log(`ANKSEN Studio running at http://${bindHost}:${port}`);
  console.log("Mode: Pilot Production. LOW/MEDIUM local allowlist actions execute; HIGH stays proposal-only; CRITICAL requires human approval.");
  console.log("No deploy, production operations, model calls, managed project writes, or secret reads.");
});

let shuttingDown=false;
const shutdown=async signal=>{if(shuttingDown)return;shuttingDown=true;console.log(`Stopping ANKSEN Studio (${signal})`);await businessWorkRunner.stop();server.close(async()=>{if(businessRuntime.pool)await businessRuntime.pool.end().catch(()=>{});process.exit(0);});setTimeout(()=>process.exit(1),10000).unref();};
process.once("SIGTERM",()=>void shutdown("SIGTERM"));
process.once("SIGINT",()=>void shutdown("SIGINT"));
