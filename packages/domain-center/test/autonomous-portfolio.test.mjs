import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { AutonomousPortfolioService } from "../lib/autonomous-portfolio.mjs";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";
import { renderConsolePage } from "../../../apps/console/web/render.mjs";

async function setup({ dispatcher, now = new Date("2026-07-20T00:00:00.000Z") } = {}) {
  const repoRoot = await mkdtemp(join(tmpdir(), "studio-portfolio-"));
  const registry = await loadDomainRuntimeRegistry();
  let current = now;
  const service = new AutonomousPortfolioService({
    repoRoot,
    registry,
    dispatcher: dispatcher ?? (async ({ initiative }) => ({ status: "SUCCEEDED", report: { sessionId: initiative.id, goalId: initiative.id, totalTasks: initiative.taskEstimate, runtimeExecutionCount: initiative.taskEstimate } })),
    clock: () => current
  });
  return { service,repoRoot, advance(minutes) { current = new Date(current.getTime() + minutes * 60000); } };
}

test("composes a durable campaign from real domain skills and agent assignments", async () => {
  const { service } = await setup();
  const campaign = await service.create({ applicationId: "software-factory", projectId: "anksen-agent-studio", goal: "Improve Studio runtime", maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 }, { userId: "owner" });
  assert.equal(campaign.status, "DRAFT");
  assert.equal(campaign.initiatives.length, 1);
  assert.deepEqual(campaign.initiatives[0].skillPack, ["solution_planning", "software_delivery", "quality_validation", "delivery_reporting"]);
  assert.equal(campaign.initiatives[0].agentAssignments.length, 4);
  assert.equal(campaign.usage.actualTokenUsage, null);
  assert.equal((await service.list())[0].createdBy, "owner");
});

test("activation and ticks dispatch once through the injected existing kernel bridge", async () => {
  let calls = 0;
  const { service } = await setup({ dispatcher: async ({ initiative }) => { calls += 1; return { status: "SUCCEEDED", report: { sessionId: "session-1", goalId: "goal-1", totalTasks: initiative.taskEstimate, runtimeExecutionCount: 4,businessObject:{objectId:"record-1"},capabilityContractId:"contract-1",capabilityContractHash:"hash-1" } }; } });
  const draft = await service.create({ applicationId: "software-factory", goal: "Deliver one safe cycle", maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await service.activate(draft.id, { userId: "approver" });
  await Promise.all([service.tick(draft.id), service.tick(draft.id)]);
  assert.equal(calls, 1);
  const completed = await service.tick(draft.id);
  assert.equal(completed.status, "SUCCEEDED");
  assert.equal(completed.initiatives[0].kernel.sessionId, "session-1");
  assert.equal(completed.initiatives[0].kernel.businessObject.objectId,"record-1");
  assert.equal(completed.initiatives[0].kernel.capabilityContractId,"contract-1");
  assert.equal(completed.approvedBy, "approver");
});

test("budget gate blocks before dispatch without expanding limits", async () => {
  let calls = 0;
  const { service } = await setup({ dispatcher: async () => { calls += 1; return { status: "SUCCEEDED" }; } });
  const draft = await service.create({ applicationId: "software-factory", goal: "Stay bounded", maxTasks: 1, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await service.activate(draft.id);
  const blocked = await service.tick(draft.id);
  assert.equal(blocked.status, "BUDGET_BLOCKED");
  assert.equal(calls, 0);
  assert.ok(blocked.initiatives[0].blockedReasons.includes("CAMPAIGN_BUDGET_EXCEEDED"));
});

test("recurring campaign persists the next cycle and resumes when due", async () => {
  const fixture = await setup();
  const draft = await fixture.service.create({ applicationId: "software-factory", goal: "Weekly improvement", scheduleMode: "RECURRING", intervalMinutes: 60, maxCycles: 2, maxTasks: 20, maxTokenEstimate: 100000, maxRuntimeMinutes: 100 });
  await fixture.service.activate(draft.id);
  await fixture.service.tick(draft.id);
  let waiting = await fixture.service.tick(draft.id);
  assert.equal(waiting.status, "WAITING_NEXT_CYCLE");
  fixture.advance(61);
  const resumed = await fixture.service.tick(draft.id);
  assert.equal(resumed.schedule.currentCycle, 1);
  assert.equal(resumed.initiatives.filter((item) => item.cycle === 1).length, 1);
});

test("cross-application program waits for upstream business platform and records durable checkpoints",async()=>{
  const dispatched=[];const{service}=await setup({dispatcher:async({initiative})=>{dispatched.push(initiative.applicationId);return{status:"SUCCEEDED",report:{sessionId:`session-${dispatched.length}`,goalId:`goal-${dispatched.length}`,totalTasks:initiative.taskEstimate,runtimeExecutionCount:initiative.taskEstimate}};}});
  const draft=await service.create({goal:"从战略目标推进到预算控制",workstreams:[{applicationId:"enterprise-strategy-platform",domainIds:["strategy-execution"]},{applicationId:"finance-platform",domainIds:["finance-management"],dependsOn:["enterprise-strategy-platform"]}],maxTasks:20,maxTokenEstimate:200000,maxRuntimeMinutes:200},{userId:"chairman"});
  assert.equal(draft.schemaVersion,2);assert.deepEqual(draft.applicationIds,["enterprise-strategy-platform","finance-platform"]);assert.equal(draft.initiatives[1].dependsOn[0],draft.initiatives[0].id);
  await service.activate(draft.id,{userId:"chairman"});await service.tick(draft.id);assert.deepEqual(dispatched,["enterprise-strategy-platform"]);await service.tick(draft.id);assert.deepEqual(dispatched,["enterprise-strategy-platform","finance-platform"]);const completed=await service.tick(draft.id);assert.equal(completed.status,"SUCCEEDED");assert.deepEqual(completed.checkpoints.filter(item=>item.type==="INITIATIVE_FINISHED").map(item=>item.status),["SUCCEEDED","SUCCEEDED"]);
});

test("cross-application dependency failure blocks downstream work without dispatch",async()=>{
  let calls=0;const{service}=await setup({dispatcher:async()=>{calls++;return{status:"FAILED",report:{totalTasks:4,runtimeExecutionCount:1}};}});const draft=await service.create({goal:"受控跨平台任务",workstreams:[{applicationId:"human-resources-platform",domainIds:["human-resources"]},{applicationId:"finance-platform",domainIds:["finance-management"],dependsOn:["human-resources-platform"]}],maxTasks:20,maxTokenEstimate:200000,maxRuntimeMinutes:200});await service.activate(draft.id);await service.tick(draft.id);const blocked=await service.tick(draft.id);assert.equal(calls,1);assert.equal(blocked.initiatives[1].status,"BLOCKED");assert.ok(blocked.initiatives[1].blockedReasons.includes("UPSTREAM_INITIATIVE_BLOCKED"));assert.equal(blocked.status,"COMPLETED_WITH_BLOCKERS");
});

test("accepted business approval reconciles the blocked initiative and releases only its downstream work",async()=>{const actor={userId:"chairman",organizationId:"studio-org",workspaceId:"studio-workspace"},record={id:"expense-1",applicationId:"finance-platform",objectType:"expense",status:"APPROVED",version:4,schema:{agentReviewStatus:"WAITING_APPROVAL"}},dispatched=[];const{service}=await setup({dispatcher:async({initiative})=>{dispatched.push(initiative.applicationId);return initiative.applicationId==="finance-platform"?{status:"BLOCKED",report:{humanApprovalRequired:true,businessObject:{objectId:record.id,applicationId:record.applicationId},blockedReasons:["BUSINESS_HUMAN_APPROVAL_REQUIRED","BUSINESS_WORK_WAITING_APPROVAL"]}}:{status:"SUCCEEDED",report:{sessionId:"park-session",goalId:"park-goal",totalTasks:1,runtimeExecutionCount:1}};}}),draft=await service.create({goal:"财务审批后安排园区服务",workstreams:[{applicationId:"finance-platform",domainIds:["finance-management"]},{applicationId:"smart-park-platform",domainIds:["tenant-service-workflow"],dependsOn:["finance-platform"]}],maxTasks:20,maxTokenEstimate:200000,maxRuntimeMinutes:200},actor);await service.activate(draft.id,actor);await service.tick(draft.id);const stopped=await service.tick(draft.id);assert.equal(stopped.status,"COMPLETED_WITH_BLOCKERS");assert.equal(stopped.initiatives[1].status,"BLOCKED");const resumed=await service.resolveHumanApproval(draft.id,stopped.initiatives[0].id,{actor,record});assert.equal(resumed.status,"ACTIVE");assert.equal(resumed.initiatives[0].status,"SUCCEEDED");assert.equal(resumed.initiatives[1].status,"PENDING");assert.equal(resumed.initiatives[0].approvalResolution.recordVersion,4);assert.equal(resumed.checkpoints.at(-1).type,"HUMAN_APPROVAL_RECONCILED");await service.tick(draft.id);assert.deepEqual(dispatched,["finance-platform","smart-park-platform"]);});

test("approval reconciliation rejects pending and rework transitions",async()=>{const actor={userId:"owner",organizationId:"studio-org",workspaceId:"studio-workspace"},reference={objectId:"expense-2",applicationId:"finance-platform"},{service}=await setup({dispatcher:async()=>({status:"BLOCKED",report:{humanApprovalRequired:true,businessObject:reference,blockedReasons:["BUSINESS_HUMAN_APPROVAL_REQUIRED"]}})}),draft=await service.create({applicationId:"finance-platform",domainIds:["finance-management"],goal:"费用审批"},actor);await service.activate(draft.id,actor);const blocked=await service.tick(draft.id),initiative=blocked.initiatives[0],base={id:"expense-2",applicationId:"finance-platform",objectType:"expense",version:2,schema:{agentReviewStatus:"WAITING_APPROVAL"}};await assert.rejects(()=>service.resolveHumanApproval(draft.id,initiative.id,{actor,record:{...base,status:"WAITING_APPROVAL"}}),error=>error.code==="PORTFOLIO_APPROVAL_STILL_PENDING");await assert.rejects(()=>service.resolveHumanApproval(draft.id,initiative.id,{actor,record:{...base,status:"REJECTED"}}),error=>error.code==="PORTFOLIO_APPROVAL_NOT_ACCEPTED");});

test("cross-application program rejects cyclic dependencies before persistence",async()=>{const{service}=await setup();await assert.rejects(()=>service.create({goal:"错误依赖",workstreams:[{applicationId:"human-resources-platform",dependsOn:["finance-platform"]},{applicationId:"finance-platform",dependsOn:["human-resources-platform"]}]}),error=>error.code==="PORTFOLIO_DEPENDENCY_CYCLE");});

test("campaign reads fail closed outside the owning organization and workspace",async()=>{const{service}=await setup();const campaign=await service.create({applicationId:"finance-platform",goal:"租户隔离任务"},{userId:"owner",organizationId:"org-a",workspaceId:"workspace-a"});assert.equal((await service.list({organizationId:"org-a",workspaceId:"workspace-a"})).length,1);assert.equal((await service.list({organizationId:"org-b",workspaceId:"workspace-a"})).length,0);assert.equal(await service.get(campaign.id,{organizationId:"org-a",workspaceId:"workspace-b"}),null);});

test("business object proposals require formal fields and materialize idempotently through the owning application writer",async()=>{const{service}=await setup(),campaign=await service.create({applicationId:"finance-platform",goal:"建立年度预算"},{userId:"finance-owner",organizationId:"org-a",workspaceId:"workspace-a"}),proposal=campaign.businessObjectProposals[0];assert.equal(proposal.objectType,"budget");assert.equal(proposal.initiativeDomainId,"finance-management");assert.ok(proposal.requiredFields.some(item=>item.key==="budgetCode"));let writes=0;const createOrLoad=async current=>{writes++;return{id:"budget-1",applicationId:current.applicationId,objectType:current.objectType,displayKey:current.displayKey,title:current.title,status:"DRAFT",version:1};},actor={userId:"finance-owner",organizationId:"org-a",workspaceId:"workspace-a"},first=await service.materializeProposal(campaign.id,proposal.id,{actor,createOrLoad}),second=await service.materializeProposal(campaign.id,proposal.id,{actor,createOrLoad});assert.equal(first.proposal.status,"MATERIALIZED");assert.equal(first.campaign.initiatives[0].businessObject.id,"budget-1");assert.equal(second.resumed,true);assert.equal(writes,1);assert.equal(second.proposal.record.href,"/finance?record=budget-1");assert.equal(second.campaign.checkpoints.at(-1).type,"BUSINESS_OBJECT_MATERIALIZED");});

test("Smart Park IoT initiative proposes its own credential-reference-only conventional record",async()=>{const{service}=await setup(),campaign=await service.create({applicationId:"smart-park-platform",domainIds:["iot-platform"],goal:"完善园区 IoT"},{userId:"owner"}),proposal=campaign.businessObjectProposals[0];assert.equal(proposal.status,"NEEDS_INPUT");assert.equal(proposal.objectType,"iot_device");assert.equal(proposal.initiativeDomainId,"iot-platform");assert.equal(proposal.requiredFields.find(item=>item.key==="credentialReferenceId").referenceOnly,true);});

test("Planner-generated Campaign cannot activate before every proposed business object is materialized",async()=>{const{service}=await setup(),campaign=await service.create({applicationId:"finance-platform",goal:"建立正式预算",plannerPlan:{plannerVersion:"enterprise-rule-planner-v1",planHash:"hash",dependencyMode:"PARALLEL",llmUsed:false}},{userId:"owner"});await assert.rejects(()=>service.activate(campaign.id,{userId:"approver"}),error=>error.code==="PORTFOLIO_BUSINESS_OBJECTS_REQUIRED");await service.materializeProposal(campaign.id,campaign.businessObjectProposals[0].id,{actor:{userId:"owner",organizationId:"studio-org",workspaceId:"studio-workspace"},createOrLoad:async proposal=>({id:"budget-2",applicationId:proposal.applicationId,objectType:proposal.objectType,displayKey:proposal.displayKey,title:proposal.title,status:"DRAFT",version:1})});assert.equal((await service.activate(campaign.id,{userId:"approver"})).status,"ACTIVE");});

test("proposal materialization uses the conventional application's field validation and record ledger",async()=>{const{service,repoRoot}=await setup(),store=new BusinessApplicationStore({repoRoot}),actor={userId:"finance-owner",organizationId:"org-ledger",workspaceId:"workspace-ledger"},campaign=await service.create({applicationId:"finance-platform",goal:"建立受控预算"},actor),proposal=campaign.businessObjectProposals[0];await assert.rejects(()=>service.materializeProposal(campaign.id,proposal.id,{actor,createOrLoad:item=>store.createRecord(item.applicationId,{objectType:item.objectType,displayKey:item.displayKey,title:item.title,fields:{}},actor)}),error=>error.code==="BUSINESS_FIELD_REQUIRED");const result=await service.materializeProposal(campaign.id,proposal.id,{actor,createOrLoad:item=>store.createRecord(item.applicationId,{objectType:item.objectType,displayKey:item.displayKey,title:item.title,fields:{fiscalYear:2027,department:"集团运营",budgetCode:"OPS",amount:100000,currency:"CNY"}},actor)}),record=await store.getRecord("finance-platform",result.proposal.record.id,actor);assert.equal(record.displayKey,proposal.displayKey);assert.equal(record.fields.amount,100000);assert.equal((await store.recordDetail("finance-platform",record.id,actor)).timeline[0].type,"business.object.created");});

test("Studio exposes the portfolio product route and authenticated lifecycle API", async () => {
  const html = await renderConsolePage("/portfolio", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  const workHtml = await renderConsolePage("/work", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  const server = await readFile(new URL("../../../apps/console/web/server.mjs", import.meta.url), "utf8");
  const access = await readFile(new URL("../../access-center/lib/access-center-utils.mjs", import.meta.url), "utf8");
  assert.match(html, /集团长期任务编排/);
  assert.match(html, /智能拆解目标/);
  assert.match(html, /正式业务对象提案/);
  assert.match(html, /data-materialize-proposal/);
  assert.match(html, /portfolio-plan-preview/);
  assert.match(html, /\/api\/portfolio\/plan/);
  assert.match(html, /Skill \/ Agent/);
  assert.match(html, /\/api\/portfolio\/campaigns/);
  assert.match(server, /AutonomousPortfolioService/);
  assert.match(server, /EnterpriseProgramPlanner/);
  assert.match(server, /PORTFOLIO_APPLICATION_FORBIDDEN/);
  assert.match(server, /PORTFOLIO_PLANNER_PLAN_MISMATCH/);
  assert.match(server, /materializeProposal/);
  assert.match(server, /PORTFOLIO_PROPOSAL_NOT_FOUND/);
  assert.match(server, /PORTFOLIO_BUSINESS_OBJECT_DOMAIN_MISMATCH/);
  assert.match(server, /businessTaskBinding/);
  assert.match(server, /capabilityProtocol/);
  assert.match(server, /PORTFOLIO_BUSINESS_OBJECTS_NOT_READY/);
  assert.match(server, /ResidentBusinessWorkRunner/);
  assert.match(server, /getWorkItemForRunner/);
  assert.match(server, /completed\.status==="COMPLETED"/);
  assert.match(html, /复核审批并续跑/);
  assert.match(server, /PORTFOLIO_APPROVAL_STILL_PENDING/);
  assert.match(server, /resolveHumanApproval/);
  assert.match(workHtml, /跨平台人工断点/);
  assert.match(workHtml, /\/api\/portfolio\/work-report/);
  assert.match(server, /projectPortfolioWork/);
  assert.match(server, /`portfolio-\$\{portfolioAction\[2\]\}`/);
  assert.match(access, /"portfolio-activate"/);
  assert.match(access, /"portfolio-reconcile"/);
  assert.match(server, /runDaemon/);
});
