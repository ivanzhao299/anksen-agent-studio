import { randomUUID } from "node:crypto";
import { closeSync, existsSync, openSync, statSync, unlinkSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { compileDomainWorkflow, getStudioApplication, getStudioDomain } from "./domain-center.mjs";
import { getEnterpriseApplication } from "./enterprise-applications.mjs";
import { getBusinessObjectDefinition } from "./business-object-definitions.mjs";

const terminal = new Set(["SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED"]);
const positiveInt = (value, fallback, max = Number.MAX_SAFE_INTEGER) => {
  const parsed = Number(value ?? fallback);
  if (!Number.isInteger(parsed) || parsed < 1 || parsed > max) throw Object.assign(new Error("PORTFOLIO_LIMIT_INVALID"), { code: "PORTFOLIO_LIMIT_INVALID" });
  return parsed;
};
const safeId = (value) => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 60) || "campaign";
const checkpoint=(campaign,type,data={},at=new Date().toISOString())=>{campaign.checkpoints??=[];campaign.checkpoints.push({sequence:campaign.checkpoints.length+1,type,at,...data});if(campaign.checkpoints.length>500)campaign.checkpoints=campaign.checkpoints.slice(-500);};

function normalizeWorkstreams(input){
  const requested=Array.isArray(input.workstreams)&&input.workstreams.length?input.workstreams:[{applicationId:input.applicationId,domainIds:input.domainIds,dependsOn:[]}];
  if(requested.length>12)throw Object.assign(new Error("PORTFOLIO_WORKSTREAM_LIMIT"),{code:"PORTFOLIO_WORKSTREAM_LIMIT"});
  const ids=new Set(),streams=requested.map((item,index)=>{const application=getStudioApplication(String(item.applicationId??""));if(ids.has(application.id))throw Object.assign(new Error(`PORTFOLIO_APPLICATION_DUPLICATE:${application.id}`),{code:"PORTFOLIO_APPLICATION_DUPLICATE"});ids.add(application.id);const domainIds=Array.isArray(item.domainIds)&&item.domainIds.length?[...new Set(item.domainIds)]:application.domainIds;if(!domainIds.length||domainIds.length>20)throw Object.assign(new Error("PORTFOLIO_DOMAIN_LIMIT"),{code:"PORTFOLIO_DOMAIN_LIMIT"});for(const domainId of domainIds)if(getStudioDomain(domainId).applicationId!==application.id)throw Object.assign(new Error(`DOMAIN_APPLICATION_MISMATCH:${domainId}`),{code:"DOMAIN_APPLICATION_MISMATCH"});return{sequence:index+1,applicationId:application.id,applicationName:application.name,domainIds,dependsOn:[...new Set((item.dependsOn??[]).map(String))]};});
  for(const stream of streams)for(const dependency of stream.dependsOn)if(!ids.has(dependency)||dependency===stream.applicationId)throw Object.assign(new Error(`PORTFOLIO_DEPENDENCY_INVALID:${stream.applicationId}:${dependency}`),{code:"PORTFOLIO_DEPENDENCY_INVALID"});
  const visiting=new Set(),visited=new Set(),byId=new Map(streams.map(item=>[item.applicationId,item]));const visit=id=>{if(visiting.has(id))throw Object.assign(new Error("PORTFOLIO_DEPENDENCY_CYCLE"),{code:"PORTFOLIO_DEPENDENCY_CYCLE"});if(visited.has(id))return;visiting.add(id);for(const dependency of byId.get(id).dependsOn)visit(dependency);visiting.delete(id);visited.add(id);};for(const id of ids)visit(id);
  return streams;
}

export class AutonomousPortfolioService {
  constructor({ repoRoot, registry, dispatcher, clock = () => new Date(), storeDir = resolve(repoRoot, "runtime/autonomous-portfolio") } = {}) {
    if (!registry) throw Object.assign(new Error("REGISTRY_REQUIRED"), { code: "REGISTRY_REQUIRED" });
    if (typeof dispatcher !== "function") throw Object.assign(new Error("DISPATCHER_REQUIRED"), { code: "DISPATCHER_REQUIRED" });
    this.repoRoot = resolve(repoRoot);
    this.registry = registry;
    this.dispatcher = dispatcher;
    this.clock = clock;
    this.storeDir = storeDir;
  }

  path(id) { return join(this.storeDir, `${safeId(id)}.json`); }
  lockPath(id) { return join(this.storeDir, `${safeId(id)}.tick.lock`); }
  proposalLockPath(id) { return join(this.storeDir, `${safeId(id)}.proposal.lock`); }
  async save(campaign) { await mkdir(this.storeDir, { recursive: true }); await writeFile(this.path(campaign.id), `${JSON.stringify(campaign, null, 2)}\n`, "utf8"); return campaign; }
  async get(id,scope=null) { if (!existsSync(this.path(id))) return null;const campaign=JSON.parse(await readFile(this.path(id), "utf8"));return scope&&((campaign.organizationId??"studio-org")!==scope.organizationId||(campaign.workspaceId??"studio-workspace")!==scope.workspaceId)?null:campaign; }
  async list(scope=null) {
    if (!existsSync(this.storeDir)) return [];
    const names = (await readdir(this.storeDir)).filter((name) => name.endsWith(".json"));
    const campaigns = await Promise.all(names.map((name) => readFile(join(this.storeDir, name), "utf8").then(JSON.parse)));
    return campaigns.filter(campaign=>!scope||((campaign.organizationId??"studio-org")===scope.organizationId&&(campaign.workspaceId??"studio-workspace")===scope.workspaceId)).sort((a, b) => String(b.createdAt).localeCompare(String(a.createdAt)));
  }

  buildInitiatives(campaignId, cycle, workstreams, goal) {
    const initiatives=workstreams.flatMap(stream=>stream.domainIds.map((domainId,index)=>{
      const application=getStudioApplication(stream.applicationId);
      const domain = getStudioDomain(domainId);
      if (domain.applicationId !== application.id) throw Object.assign(new Error(`DOMAIN_APPLICATION_MISMATCH:${domainId}`), { code: "DOMAIN_APPLICATION_MISMATCH" });
      const workflow = compileDomainWorkflow(`${goal} · ${domain.name}`, this.registry, { explicitDomainId: domainId, goalId: `${campaignId}-${cycle}-${index}` });
      return {
        id: `${campaignId}-${cycle}-${safeId(application.id)}-${safeId(domainId)}`,
        cycle,
        sequence: stream.sequence*100+index+1,
        applicationId: application.id,
        domainId,
        domainName: domain.name,
        title: `${goal} · ${domain.name}`,
        status: workflow.status === "READY" ? "PENDING" : "BLOCKED",
        dependsOn: [],
        skillPack: domain.skillPack,
        agentAssignments: workflow.assignments.map((item) => ({ stage: item.key, businessSkillId: item.businessSkillId, skillType: item.skillType, agentId: item.agentId, workerKey: item.workerKey, runtimeId: item.runtimeId, status: item.status })),
        taskEstimate: workflow.tasks.length,
        tokenEstimate: workflow.tasks.length * 5000,
        runtimeMinuteEstimate: workflow.tasks.length * 5,
        blockedReasons: workflow.blockedReasons,
        sessionKey: `portfolio-${campaignId}-${cycle}-${safeId(domainId)}`,
        report: null,
        error: null,
        createdAt: this.clock().toISOString(),
        startedAt: null,
        finishedAt: null
      };
    }));
    for(const initiative of initiatives){const stream=workstreams.find(item=>item.applicationId===initiative.applicationId);initiative.dependsOn=initiatives.filter(item=>stream.dependsOn.includes(item.applicationId)).map(item=>item.id);}
    return initiatives;
  }

  async create(input, actor = {}) {
    const goal = String(input.goal ?? "").trim();
    if (!goal) throw Object.assign(new Error("PORTFOLIO_GOAL_REQUIRED"), { code: "PORTFOLIO_GOAL_REQUIRED" });
    const workstreams=normalizeWorkstreams(input),application=workstreams.length===1?getStudioApplication(workstreams[0].applicationId):null;
    const id = `portfolio-${Date.now()}-${randomUUID().slice(0, 8)}`;
    const scheduleMode = input.scheduleMode === "RECURRING" ? "RECURRING" : "ONCE";
    const maxCycles = scheduleMode === "RECURRING" ? positiveInt(input.maxCycles, 4, 52) : 1;
    const initiatives=this.buildInitiatives(id,0,workstreams,goal),businessObjectProposals=initiatives.map((initiative,index)=>{const app=getEnterpriseApplication(initiative.applicationId),compatible=(app?.objectTypes??[]).filter(item=>getBusinessObjectDefinition(app.id,item.id).workflowDomainId===initiative.domainId),type=compatible.find(item=>item.primary)??compatible[0]??null,schema=type?getBusinessObjectDefinition(app.id,type.id):null;return{id:`${id}-proposal-${index+1}`,sequence:index+1,initiativeDomainId:initiative.domainId,applicationId:initiative.applicationId,applicationName:app?.name??initiative.applicationId,objectType:type?.id??null,objectTypeName:type?.name??null,title:`${goal} · ${initiative.domainName}`,displayKey:`PROGRAM-${safeId(id).slice(-16).toUpperCase()}-${index+1}`,requiredFields:(schema?.fields??[]).filter(item=>item.required).map(item=>({key:item.key,label:item.label,type:item.type,options:item.options??null,min:item.min??null,max:item.max??null,referenceOnly:item.referenceOnly===true})),status:type?"NEEDS_INPUT":"UNSUPPORTED",blockedReason:type?null:`BUSINESS_OBJECT_SCHEMA_MISSING:${initiative.applicationId}:${initiative.domainId}`,record:null,materializedAt:null,materializedBy:null};});
    const campaign = {
      schemaVersion: 2,
      id,
      status: "DRAFT",
      applicationId: application?.id??null,
      applicationName: application?.name??`${workstreams.length} 个业务平台`,
      applicationIds:workstreams.map(item=>item.applicationId),
      workstreams,
      plannerEvidence:input.plannerPlan?{plannerVersion:String(input.plannerPlan.plannerVersion),planHash:String(input.plannerPlan.planHash),dependencyMode:String(input.plannerPlan.dependencyMode),llmUsed:input.plannerPlan.llmUsed===true,confirmedBy:actor.userId??"unknown"}:null,
      projectId: safeId(input.projectId || "anksen-agent-studio"),
      organizationId:actor.organizationId??"studio-org",workspaceId:actor.workspaceId??"studio-workspace",
      goal,
      domainIds: workstreams.flatMap(item=>item.domainIds),
      schedule: { mode: scheduleMode, intervalMinutes: scheduleMode === "RECURRING" ? positiveInt(input.intervalMinutes, 1440, 525600) : null, maxCycles, currentCycle: 0, nextRunAt: new Date(input.startAt || this.clock()).toISOString() },
      budget: { maxTasks: positiveInt(input.maxTasks, Math.max(20, workstreams.reduce((sum,item)=>sum+item.domainIds.length,0) * 4), 1000), maxTokenEstimate: positiveInt(input.maxTokenEstimate, Math.max(100000, workstreams.reduce((sum,item)=>sum+item.domainIds.length,0) * 20000), 100000000), maxRuntimeMinutes: positiveInt(input.maxRuntimeMinutes, Math.max(120, workstreams.reduce((sum,item)=>sum+item.domainIds.length,0) * 20), 100000), maxCostUsd: Number(input.maxCostUsd ?? 20) },
      usage: { reservedTasks: 0, reservedTokenEstimate: 0, reservedRuntimeMinutes: 0, actualTasks: 0, actualRuntimeExecutions: 0, actualTokenUsage: null, actualCostUsd: null },
      initiatives,
      businessObjectProposals,
      createdBy: actor.userId ?? "unknown",
      approvedBy: null,
      createdAt: this.clock().toISOString(),
      updatedAt: this.clock().toISOString(),
      startedAt: null,
      finishedAt: null,
      lastTickAt: null,
      errors: [],checkpoints:[]
    };
    if (!Number.isFinite(campaign.budget.maxCostUsd) || campaign.budget.maxCostUsd < 0) throw Object.assign(new Error("PORTFOLIO_COST_LIMIT_INVALID"), { code: "PORTFOLIO_COST_LIMIT_INVALID" });
    checkpoint(campaign,"CAMPAIGN_CREATED",{actorId:campaign.createdBy,workstreamCount:workstreams.length});return this.save(campaign);
  }

  async activate(id, actor = {}) {
    const campaign = await this.get(id);
    if (!campaign) throw Object.assign(new Error("PORTFOLIO_NOT_FOUND"), { code: "PORTFOLIO_NOT_FOUND" });
    if (campaign.status !== "DRAFT" && campaign.status !== "PAUSED") throw Object.assign(new Error("PORTFOLIO_NOT_ACTIVATABLE"), { code: "PORTFOLIO_NOT_ACTIVATABLE" });
    if(campaign.plannerEvidence&&campaign.businessObjectProposals?.some(item=>item.status!=="MATERIALIZED"))throw Object.assign(new Error("PORTFOLIO_BUSINESS_OBJECTS_REQUIRED"),{code:"PORTFOLIO_BUSINESS_OBJECTS_REQUIRED",pendingProposalIds:campaign.businessObjectProposals.filter(item=>item.status!=="MATERIALIZED").map(item=>item.id)});
    campaign.status = "ACTIVE";
    campaign.approvedBy = actor.userId ?? "unknown";
    campaign.startedAt ??= this.clock().toISOString();
    campaign.updatedAt = this.clock().toISOString();
    checkpoint(campaign,"CAMPAIGN_ACTIVATED",{actorId:campaign.approvedBy},campaign.updatedAt);
    return this.save(campaign);
  }

  withinBudget(campaign, initiative) {
    return campaign.usage.reservedTasks + initiative.taskEstimate <= campaign.budget.maxTasks && campaign.usage.reservedTokenEstimate + initiative.tokenEstimate <= campaign.budget.maxTokenEstimate && campaign.usage.reservedRuntimeMinutes + initiative.runtimeMinuteEstimate <= campaign.budget.maxRuntimeMinutes;
  }

  async tickOne(campaign, now) {
    for (const item of campaign.initiatives.filter((candidate) => candidate.status === "DISPATCHING" && now.getTime() - new Date(candidate.startedAt).getTime() > 10 * 60 * 1000)) {
      item.status = "PENDING";
      item.error = "RECOVERED_STALE_DISPATCH";
      campaign.usage.reservedTasks = Math.max(0, campaign.usage.reservedTasks - item.taskEstimate);
      campaign.usage.reservedTokenEstimate = Math.max(0, campaign.usage.reservedTokenEstimate - item.tokenEstimate);
      campaign.usage.reservedRuntimeMinutes = Math.max(0, campaign.usage.reservedRuntimeMinutes - item.runtimeMinuteEstimate);
    }
    if (campaign.status === "WAITING_NEXT_CYCLE" && new Date(campaign.schedule.nextRunAt) <= now) {
      const cycle = campaign.schedule.currentCycle + 1;
      campaign.schedule.currentCycle = cycle;
      const next=this.buildInitiatives(campaign.id, cycle, campaign.workstreams, campaign.goal);for(const item of next){const proposal=campaign.businessObjectProposals?.find(value=>value.applicationId===item.applicationId&&value.initiativeDomainId===item.domainId&&value.record);if(proposal)item.businessObject=proposal.record;}campaign.initiatives.push(...next);
      campaign.status = "ACTIVE";
    }
    if (campaign.status !== "ACTIVE" || new Date(campaign.schedule.nextRunAt) > now) return campaign;
    const cycleItems=campaign.initiatives.filter(item=>item.cycle===campaign.schedule.currentCycle),byId=new Map(cycleItems.map(item=>[item.id,item]));
    for(const item of cycleItems.filter(item=>item.status==="PENDING")){const dependencies=item.dependsOn.map(id=>byId.get(id)).filter(Boolean);if(dependencies.some(value=>["FAILED","BLOCKED","CANCELLED"].includes(value.status))){item.status="BLOCKED";item.blockedReasons=[...item.blockedReasons,"UPSTREAM_INITIATIVE_BLOCKED"];checkpoint(campaign,"INITIATIVE_BLOCKED",{initiativeId:item.id,reason:"UPSTREAM_INITIATIVE_BLOCKED"},now.toISOString());}}
    const initiative = cycleItems.find(item=>item.status==="PENDING"&&item.dependsOn.every(id=>byId.get(id)?.status==="SUCCEEDED"));
    if (!initiative) {
      if (cycleItems.some((item) => item.status === "DISPATCHING" || item.status === "RUNNING")) return campaign;
      if(cycleItems.some(item=>item.status==="PENDING")){campaign.status="BLOCKED";campaign.errors.push({at:now.toISOString(),code:"PORTFOLIO_DEPENDENCY_DEADLOCK",message:"No dependency-ready initiative"});return campaign;}
      const failed = cycleItems.some((item) => item.status === "FAILED" || item.status === "BLOCKED");
      if (campaign.schedule.mode === "RECURRING" && campaign.schedule.currentCycle + 1 < campaign.schedule.maxCycles) {
        campaign.status = "WAITING_NEXT_CYCLE";
        campaign.schedule.nextRunAt = new Date(now.getTime() + campaign.schedule.intervalMinutes * 60000).toISOString();
      } else {
        campaign.status = failed ? "COMPLETED_WITH_BLOCKERS" : "SUCCEEDED";
        campaign.finishedAt = now.toISOString();
      }
      return campaign;
    }
    if(campaign.plannerEvidence&&!initiative.businessObject){initiative.status="BLOCKED";initiative.blockedReasons=[...initiative.blockedReasons,"INITIATIVE_BUSINESS_OBJECT_REQUIRED"];checkpoint(campaign,"INITIATIVE_BLOCKED",{initiativeId:initiative.id,reason:"INITIATIVE_BUSINESS_OBJECT_REQUIRED"},now.toISOString());return campaign;}
    if (!this.withinBudget(campaign, initiative)) {
      initiative.status = "BLOCKED";
      initiative.blockedReasons = [...initiative.blockedReasons, "CAMPAIGN_BUDGET_EXCEEDED"];
      campaign.status = "BUDGET_BLOCKED";
      return campaign;
    }
    campaign.usage.reservedTasks += initiative.taskEstimate;
    campaign.usage.reservedTokenEstimate += initiative.tokenEstimate;
    campaign.usage.reservedRuntimeMinutes += initiative.runtimeMinuteEstimate;
    initiative.status = "DISPATCHING";
    initiative.startedAt = now.toISOString();
    checkpoint(campaign,"INITIATIVE_DISPATCHING",{initiativeId:initiative.id,applicationId:initiative.applicationId,domainId:initiative.domainId},initiative.startedAt);
    await this.save(campaign);
    try {
      const result = await this.dispatcher({ campaign, initiative });
      initiative.status = result.status === "SUCCEEDED" ? "SUCCEEDED" : result.status === "BLOCKED" ? "BLOCKED" : "FAILED";
      initiative.report = result.report ?? null;
      initiative.kernel = { sessionKey: initiative.sessionKey, goalId: result.report?.goalId ?? null, sessionId: result.report?.sessionId ?? null,businessObject:result.report?.businessObject??initiative.businessObject??null,capabilityContractId:result.report?.capabilityContractId??null,capabilityContractHash:result.report?.capabilityContractHash??null };
      initiative.finishedAt = this.clock().toISOString();
      campaign.usage.actualTasks += Number(result.report?.totalTasks ?? initiative.taskEstimate);
      campaign.usage.actualRuntimeExecutions += Number(result.report?.runtimeExecutionCount ?? 0);
      checkpoint(campaign,"INITIATIVE_FINISHED",{initiativeId:initiative.id,status:initiative.status,sessionId:initiative.kernel.sessionId},initiative.finishedAt);
    } catch (error) {
      initiative.status = error?.code === "WORKFLOW_BLOCKED" ? "BLOCKED" : "FAILED";
      initiative.error = error instanceof Error ? error.message : String(error);
      initiative.blockedReasons = [...initiative.blockedReasons, ...(error?.workflow?.blockedReasons ?? [])];
      initiative.finishedAt = this.clock().toISOString();
      campaign.errors.push({ at: this.clock().toISOString(), initiativeId: initiative.id, code: error?.code ?? "DISPATCH_FAILED", message: initiative.error });
      checkpoint(campaign,"INITIATIVE_FINISHED",{initiativeId:initiative.id,status:initiative.status,error:initiative.error},initiative.finishedAt);
    }
    return campaign;
  }

  async tick(id = null) {
    const campaigns = id ? [await this.get(id)].filter(Boolean) : await this.list();
    const results = [];
    for (const campaign of campaigns) {
      if (!["ACTIVE", "WAITING_NEXT_CYCLE"].includes(campaign.status)) { results.push(campaign); continue; }
      let fd;
      try {
        await mkdir(this.storeDir, { recursive: true });
        if (existsSync(this.lockPath(campaign.id)) && Date.now() - statSync(this.lockPath(campaign.id)).mtimeMs > 10 * 60 * 1000) unlinkSync(this.lockPath(campaign.id));
        fd = openSync(this.lockPath(campaign.id), "wx");
      } catch { results.push(campaign); continue; }
      closeSync(fd);
      try {
        const current = await this.get(campaign.id);
        current.lastTickAt = this.clock().toISOString();
        current.updatedAt = current.lastTickAt;
        results.push(await this.save(await this.tickOne(current, this.clock())));
      } finally { try { unlinkSync(this.lockPath(campaign.id)); } catch {} }
    }
    return id ? results[0] ?? null : results;
  }

  async pause(id, actor = {}) {
    const campaign = await this.get(id);
    if (!campaign) return null;
    if (terminal.has(campaign.status)) return campaign;
    campaign.status = "PAUSED";
    campaign.pausedBy = actor.userId ?? "unknown";
    campaign.updatedAt = this.clock().toISOString();
    checkpoint(campaign,"CAMPAIGN_PAUSED",{actorId:campaign.pausedBy},campaign.updatedAt);
    return this.save(campaign);
  }

  async materializeProposal(id,proposalId,{actor={},createOrLoad}={}){
    if(typeof createOrLoad!=="function")throw Object.assign(new Error("PORTFOLIO_PROPOSAL_WRITER_REQUIRED"),{code:"PORTFOLIO_PROPOSAL_WRITER_REQUIRED"});await mkdir(this.storeDir,{recursive:true});let fd;try{fd=openSync(this.proposalLockPath(id),"wx");}catch{throw Object.assign(new Error("PORTFOLIO_PROPOSAL_BUSY"),{code:"PORTFOLIO_PROPOSAL_BUSY"});}closeSync(fd);try{const campaign=await this.get(id,{organizationId:actor.organizationId,workspaceId:actor.workspaceId});if(!campaign)throw Object.assign(new Error("PORTFOLIO_NOT_FOUND"),{code:"PORTFOLIO_NOT_FOUND"});if(!["DRAFT","PAUSED"].includes(campaign.status))throw Object.assign(new Error("PORTFOLIO_PROPOSAL_CAMPAIGN_STATE_DENIED"),{code:"PORTFOLIO_PROPOSAL_CAMPAIGN_STATE_DENIED"});const proposal=campaign.businessObjectProposals?.find(item=>item.id===proposalId);if(!proposal)throw Object.assign(new Error("PORTFOLIO_PROPOSAL_NOT_FOUND"),{code:"PORTFOLIO_PROPOSAL_NOT_FOUND"});if(proposal.status==="UNSUPPORTED"||!proposal.objectType)throw Object.assign(new Error(proposal.blockedReason??"PORTFOLIO_PROPOSAL_UNSUPPORTED"),{code:"PORTFOLIO_PROPOSAL_UNSUPPORTED"});if(proposal.record)return{campaign,proposal,resumed:true};const record=await createOrLoad(proposal);proposal.status="MATERIALIZED";proposal.record={id:record.id,applicationId:record.applicationId,objectType:record.objectType,displayKey:record.displayKey,title:record.title,status:record.status,version:record.version,href:`${getEnterpriseApplication(record.applicationId).path}?record=${record.id}`};for(const initiative of campaign.initiatives.filter(item=>item.applicationId===proposal.applicationId&&item.domainId===proposal.initiativeDomainId))initiative.businessObject=proposal.record;proposal.materializedAt=this.clock().toISOString();proposal.materializedBy=actor.userId??"unknown";campaign.updatedAt=proposal.materializedAt;checkpoint(campaign,"BUSINESS_OBJECT_MATERIALIZED",{proposalId:proposal.id,initiativeDomainId:proposal.initiativeDomainId,applicationId:proposal.applicationId,recordId:record.id,displayKey:record.displayKey},proposal.materializedAt);await this.save(campaign);return{campaign,proposal,resumed:false};}finally{try{unlinkSync(this.proposalLockPath(id));}catch{}}
  }
}
