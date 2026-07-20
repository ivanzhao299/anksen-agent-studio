import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";
import { buildBusinessDelegationPreview } from "../lib/business-delegation-preview.mjs";
import { getEnterpriseApplication } from "../lib/enterprise-applications.mjs";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";

const expenseFields = { expenseDate: "2026-07-20", department: "市场部", category: "差旅", amount: 1280.5, currency: "CNY", budgetCode: "TRAVEL-01", description: "客户拜访" };

test("conventional finance records enforce domain fields and lifecycle", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "business-app-"));
  const store = new BusinessApplicationStore({ repoRoot: root });
  await assert.rejects(
    () => store.createRecord("finance-platform", { objectType: "expense", title: "缺少财务字段" }, { userId: "owner" }),
    (error) => error.code === "BUSINESS_FIELD_REQUIRED"
  );
  const record = await store.createRecord("finance-platform", { objectType: "expense", title: "差旅费用审核", ownerId: "finance-user", fields: expenseFields }, { userId: "owner" });
  assert.equal(record.status, "DRAFT");
  assert.match(record.displayKey, /^EXPENSE-/);
  assert.equal(record.fields.amount, 1280.5);
  assert.deepEqual(record.availableTransitions, ["SUBMITTED"]);
  const work = await store.createWorkItem({ applicationId: "finance-platform", businessObjectId: record.id, title: "复核发票", assigneeId: "finance-user", assignmentType: "HUMAN" }, { userId: "manager" });
  assert.equal(work.businessObject.objectId, record.id);
  assert.equal((await store.myWork({ userId: "finance-user" })).summary.human, 1);
  assert.equal((await store.myWork({ userId: "unrelated-operator" })).summary.total, 0);
  assert.equal((await store.myWork({ userId: "workspace-admin", includeAll: true })).summary.total, 1);
  await assert.rejects(() => store.transitionRecord("finance-platform", record.id, { expectedVersion: 0, status: "SUBMITTED" }, { userId: "finance-user" }), (error) => error.code === "BUSINESS_RECORD_VERSION_CONFLICT");
  await assert.rejects(() => store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "PAID" }, { userId: "finance-user" }), (error) => error.code === "BUSINESS_RECORD_TRANSITION_DENIED");
  const submitted = await store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "SUBMITTED" }, { userId: "finance-user" });
  assert.equal(submitted.version, 2);
  assert.deepEqual(submitted.availableTransitions, ["UNDER_REVIEW", "REJECTED"]);
  const detail = await store.recordDetail("finance-platform", record.id);
  assert.equal(detail.record.id, record.id);
  assert.equal(detail.workItems[0].id, work.id);
  assert.deepEqual(detail.timeline.map((item) => item.type), ["business.object.changed", "business.work.assigned", "business.object.created"]);
  await store.transitionRecord("finance-platform", record.id, { expectedVersion: 2, status: "UNDER_REVIEW" }, { userId: "finance-user" });
  await store.transitionRecord("finance-platform", record.id, { expectedVersion: 3, status: "WAITING_APPROVAL" }, { userId: "finance-user" });
  await assert.rejects(() => store.transitionRecord("finance-platform", record.id, { expectedVersion: 4, status: "APPROVED" }, { userId: "finance-user" }), (error) => error.code === "BUSINESS_APPROVAL_REQUIRED");
  const approval = await store.requestApproval("finance-platform", record.id, { expectedVersion: 4, requestedStatus: "APPROVED" }, { userId: "finance-user" });
  assert.equal(approval.status, "PENDING");
  assert.equal((await store.approvalInbox({}))[0].businessObject.href, `/finance?record=${record.id}`);
  const decision = await store.decideApproval("finance-platform", approval.id, { decision: "APPROVED", comment: "预算与票据已复核" }, { userId: "finance-manager" });
  assert.equal(decision.record.status, "APPROVED");
  assert.equal(decision.record.version, 5);
  assert.equal((await store.recordDetail("finance-platform", record.id)).approvals[0].reviewedBy, "finance-manager");
  assert.equal((await store.approvalInbox({})).length, 0);
  const report = await store.applicationReport("finance-platform");
  assert.equal(report.totalRecords, 1);
  assert.equal(report.byObjectType.expense, 1);
  assert.equal(report.byStatus.APPROVED, 1);
  assert.equal(report.work.human, 1);
  assert.equal(report.approvals.APPROVED, 1);
  assert.equal(report.recentRecords[0].href, `/finance?record=${record.id}`);
  await assert.rejects(() => store.controlWorkItem(work.id, { action: "REASSIGN", expectedVersion: 1, assignmentType: "AGENT", assigneeId: "agent-finance" }, { userId: "unrelated-operator" }), (error) => error.code === "BUSINESS_WORK_CONTROL_FORBIDDEN");
  const manager = { userId: "finance-manager", canManageBusiness: true };
  const agentAssignment = await store.controlWorkItem(work.id, { action: "REASSIGN", expectedVersion: 1, assignmentType: "AGENT", assigneeId: "agent-finance" }, manager);
  assert.equal(agentAssignment.assignmentType, "AGENT");
  const paused = await store.controlWorkItem(work.id, { action: "PAUSE", expectedVersion: 2, reason: "等待补充票据" }, manager);
  assert.equal(paused.status, "PAUSED");
  await assert.rejects(() => store.controlWorkItem(work.id, { action: "RESUME", expectedVersion: 2 }, manager), (error) => error.code === "BUSINESS_WORK_VERSION_CONFLICT");
  const takeover = await store.controlWorkItem(work.id, { action: "TAKE_OVER", expectedVersion: 3, assigneeId: "finance-user" }, manager);
  assert.equal(takeover.assignmentType, "HUMAN");
  assert.equal(takeover.status, "OPEN");
  assert.equal(takeover.version, 4);
});

test("business record updates are versioned, validated, audited and draft-only",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-update-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"update-org",workspaceId:"update-workspace",userId:"finance-user"},record=await store.createRecord("finance-platform",{objectType:"expense",title:"待修改费用",ownerId:"old-owner",fields:expenseFields},scope);
  assert.equal(record.editable,true);const updated=await store.updateRecord("finance-platform",record.id,{expectedVersion:1,title:"已修改费用",ownerId:"new-owner",fields:{amount:1380.5}},scope);assert.equal(updated.version,2);assert.equal(updated.title,"已修改费用");assert.equal(updated.ownerId,"new-owner");assert.equal(updated.fields.amount,1380.5);assert.equal(updated.fields.description,expenseFields.description);
  await assert.rejects(()=>store.updateRecord("finance-platform",record.id,{expectedVersion:1,title:"过期修改"},scope),error=>error.code==="BUSINESS_RECORD_VERSION_CONFLICT");await assert.rejects(()=>store.updateRecord("finance-platform",record.id,{expectedVersion:2,fields:{amount:0}},scope),error=>error.code==="BUSINESS_FIELD_INVALID");
  const submitted=await store.transitionRecord("finance-platform",record.id,{expectedVersion:2,status:"SUBMITTED"},scope);assert.equal(submitted.editable,false);await assert.rejects(()=>store.updateRecord("finance-platform",record.id,{expectedVersion:3,title:"审批中修改"},scope),error=>error.code==="BUSINESS_RECORD_NOT_EDITABLE");
  const event=(await store.recordDetail("finance-platform",record.id,scope)).timeline.find(item=>item.type==="business.object.updated");assert.deepEqual(event.payload.changedFields,["amount"]);assert.equal(event.payload.titleChanged,true);assert.equal(event.payload.ownerChanged,true);
});

test("business record notes are immutable exact-version scoped timeline events",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-notes-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"notes-org",workspaceId:"notes-workspace",userId:"finance-user"},record=await store.createRecord("finance-platform",{objectType:"expense",title:"费用备注测试",fields:expenseFields},scope);
  const note=await store.addRecordNote("finance-platform",record.id,{expectedVersion:1,text:"  已核对原始票据，等待负责人确认。  "},scope);assert.equal(note.type,"business.record.note.added");assert.equal(note.objectVersion,1);assert.equal(note.payload.text,"已核对原始票据，等待负责人确认。");assert.equal((await store.getRecord("finance-platform",record.id,scope)).version,1);
  await store.updateRecord("finance-platform",record.id,{expectedVersion:1,title:"费用备注测试（更新）"},scope);
  await assert.rejects(()=>store.addRecordNote("finance-platform",record.id,{expectedVersion:1,text:"过期备注"},scope),error=>error.code==="BUSINESS_RECORD_VERSION_CONFLICT");
  await assert.rejects(()=>store.addRecordNote("finance-platform",record.id,{expectedVersion:2,text:"token=super-secret-value"},scope),error=>error.code==="BUSINESS_RECORD_NOTE_SECRET_REJECTED");
  await assert.rejects(()=>store.addRecordNote("finance-platform",record.id,{expectedVersion:2,text:"跨租户"},{...scope,organizationId:"other"}),error=>error.code==="BUSINESS_RECORD_NOT_FOUND");
  const timeline=(await store.recordDetail("finance-platform",record.id,scope)).timeline;assert.equal(timeline.filter(item=>item.type==="business.record.note.added").length,1);assert.equal(timeline.find(item=>item.type==="business.record.note.added").actorId,"finance-user");
});

test("application record pages apply literal scoped filters and stable pagination",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-list-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"list-org",workspaceId:"list-workspace",userId:"finance-a"};
  for(let index=0;index<3;index+=1)await store.createRecord("finance-platform",{objectType:"expense",title:index===1?"差旅 % 专项":"日常费用 "+index,displayKey:`LIST-${index}`,ownerId:index===2?"finance-b":"finance-a",fields:{...expenseFields,amount:100+index}},scope);
  await store.createRecord("finance-platform",{objectType:"budget",title:"年度预算",displayKey:"LIST-BUDGET",ownerId:"finance-a",fields:{fiscalYear:2027,department:"运营",budgetCode:"OPS-2027",amount:10000,currency:"CNY"}},scope);
  const first=await store.recordPage("finance-platform",{...scope,limit:2,offset:0});assert.equal(first.records.length,2);assert.equal(first.pagination.total,4);assert.equal(first.pagination.hasMore,true);const second=await store.recordPage("finance-platform",{...scope,limit:2,offset:2});assert.equal(second.records.length,2);assert.equal(new Set([...first.records,...second.records].map(item=>item.id)).size,4);
  assert.equal((await store.recordPage("finance-platform",{...scope,query:"%"})).pagination.total,1);assert.equal((await store.recordPage("finance-platform",{...scope,objectType:"expense",ownerId:"finance-b"})).pagination.total,1);assert.equal((await store.recordPage("finance-platform",{...scope,objectType:"budget"})).pagination.total,1);assert.equal((await store.recordPage("finance-platform",{...scope,organizationId:"foreign"})).pagination.total,0);
});

test("file work assignment atomically audits the approved delegation plan once",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-delegation-audit-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"delegation-org",workspaceId:"delegation-workspace",userId:"finance-user"},created=await store.createRecord("finance-platform",{objectType:"expense",title:"委派审计费用",fields:expenseFields},scope);await store.transitionRecord("finance-platform",created.id,{expectedVersion:1,status:"SUBMITTED"},scope);const record=await store.transitionRecord("finance-platform",created.id,{expectedVersion:2,status:"UNDER_REVIEW"},scope),delegationPlan=buildBusinessDelegationPreview({application:getEnterpriseApplication("finance-platform"),record,registry:await loadDomainRuntimeRegistry()}),input={applicationId:"finance-platform",businessObjectId:record.id,assignmentType:"AGENT",assigneeId:"agent-business-operator",delegationPlan};const first=await store.createWorkItem(input,scope),duplicate=await store.createWorkItem(input,scope);assert.equal(first.id,duplicate.id);const detail=await store.recordDetail("finance-platform",record.id,scope),event=detail.timeline.find(item=>item.type==="business.work.delegation-approved"),work=(await store.myWork(scope)).items.find(item=>item.id===first.id);assert.equal(detail.timeline.filter(item=>item.type==="business.work.delegation-approved").length,1);assert.equal(event.workItemId,first.id);assert.equal(event.objectVersion,3);assert.equal(event.payload.domainId,"finance-management");assert.equal(event.payload.stages.length,4);assert.equal(event.payload.executionRuntime,"CONTROLLED_STUB");assert.equal(event.payload.realRuntimeEnabled,false);assert.equal(detail.workItems[0].delegationPlan.domainId,"finance-management");assert.equal(detail.workItems[0].delegationPlan.stages.length,4);assert.equal(work.delegationPlan.executionRuntime,"CONTROLLED_STUB");await assert.rejects(()=>store.createWorkItem({...input,idempotencyKey:"mismatch",delegationPlan:{...delegationPlan,businessObject:{...delegationPlan.businessObject,objectId:"other"}}},scope),error=>error.code==="BUSINESS_DELEGATION_PLAN_MISMATCH");
});

test("file fallback persists one version-bound resident workflow attachment",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-resident-attachment-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"resident-org",workspaceId:"resident-workspace",userId:"operator"},record=await store.createRecord("finance-platform",{objectType:"expense",title:"常驻执行绑定",fields:expenseFields},scope),work=await store.createWorkItem({applicationId:"finance-platform",businessObjectId:record.id,assignmentType:"AGENT",assigneeId:"agent-finance"},scope),input={goalId:"11111111-1111-4111-8111-111111111111",sessionId:"22222222-2222-4222-8222-222222222222",report:null,status:"RUNNING",expectedWorkVersion:work.version},attached=await store.attachWorkflow(work.id,input),duplicate=await store.attachWorkflow(work.id,input);assert.equal(attached.version,2);assert.equal(duplicate.version,2);assert.equal((await store.runnableAgentWorkItems())[0].id,work.id);assert.equal((await store.getWorkItemForRunner(work.id)).sessionId,input.sessionId);await assert.rejects(()=>store.attachWorkflow(work.id,{...input,sessionId:"33333333-3333-4333-8333-333333333333"}),error=>error.code==="BUSINESS_WORK_VERSION_CONFLICT");
});

test("strategy and HR records expose different authoritative fields", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "business-app-domain-"));
  const store = new BusinessApplicationStore({ repoRoot: root });
  const objective = await store.createRecord("enterprise-strategy-platform", { objectType: "objective", title: "提高经营性现金流", fields: { period: "2027-2029", perspective: "增长", targetValue: 20, unit: "%", responsibleCenter: "集团经营中心" } }, { userId: "strategy-owner" });
  const recruitment = await store.createRecord("human-resources-platform", { objectType: "recruitment_case", title: "招聘财务分析经理", fields: { department: "财务中心", positionName: "财务分析经理", headcount: 1, targetDate: "2026-09-01", employmentType: "全职", reason: "补充经营分析能力" } }, { userId: "hr-owner" });
  assert.equal(objective.fields.responsibleCenter, "集团经营中心");
  assert.equal(recruitment.fields.positionName, "财务分析经理");
  assert.notDeepEqual(objective.schema.fields.map((item) => item.key), recruitment.schema.fields.map((item) => item.key));
});

test("growth, manufacturing and Smart Park records keep operational data and routing", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "business-app-operations-"));
  const store = new BusinessApplicationStore({ repoRoot: root });
  const lead = await store.createRecord("ai-growth-sales-platform", { objectType: "lead", title: "园区设备客户线索", fields: { source: "官网", contactName: "李经理", company: "示例制造", contactChannel: "authorized-ref-001", consentStatus: "已授权", interest: "能源管理" } }, { userId: "sales-user" });
  const order = await store.createRecord("intelligent-manufacturing-erp", { objectType: "work_order", title: "WO-2026-001", fields: { productCode: "P-001", quantity: 100, unit: "台", dueDate: "2026-08-20", plant: "一号工厂", priority: "关键" } }, { userId: "planner" });
  const service = await store.createRecord("smart-park-platform", { objectType: "service_order", title: "空调报修", fields: { enterpriseName: "示例企业", serviceType: "报修", location: "A1-302", slaHours: 4, description: "空调无法启动" } }, { userId: "park-user" });
  assert.equal(lead.schema.workflowDomainId, "lead-intelligence");
  assert.equal(order.schema.workflowDomainId, "production-planning");
  assert.equal(service.schema.workflowDomainId, "tenant-service-workflow");
  assert.deepEqual(lead.availableTransitions, ["NEW"]);
  assert.deepEqual(order.availableTransitions, ["PLANNED"]);
  assert.deepEqual(service.availableTransitions, ["OPEN"]);
});

test("file fallback preserves typed business record relations",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-relations-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"relation-org",workspaceId:"relation-workspace",userId:"planner"};
  const budget=await store.createRecord("finance-platform",{objectType:"budget",title:"运营预算",fields:{fiscalYear:2027,department:"运营",budgetCode:"OPS",amount:1000,currency:"CNY"}},scope),expense=await store.createRecord("finance-platform",{objectType:"expense",title:"运营费用",fields:expenseFields},scope),relation=await store.createRelation("finance-platform",budget.id,{targetRecordId:expense.id,relationType:"CONTROLS"},scope),detail=await store.recordDetail("finance-platform",budget.id,scope);
  assert.equal(detail.relations[0].id,relation.id);assert.equal(detail.relations[0].record.id,expense.id);assert.deepEqual((await store.applicationReport("finance-platform",scope)).businessChains,{total:1,byType:{CONTROLS:1}});
  await assert.rejects(()=>store.createRelation("finance-platform",expense.id,{targetRecordId:budget.id,relationType:"CONTROLS"},scope),error=>error.code==="BUSINESS_RELATION_DENIED");
});

test("file fallback atomically creates an idempotent downstream business transaction",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-related-create-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"sales-org",workspaceId:"sales-workspace",userId:"sales-owner"};
  const lead=await store.createRecord("ai-growth-sales-platform",{objectType:"lead",title:"能源管理线索",displayKey:"LEAD-ATOMIC-1",fields:{source:"官网",contactName:"李经理",company:"示例制造",contactChannel:"authorized-ref-001",consentStatus:"已授权",interest:"能源管理"}},scope),input={objectType:"opportunity",relationType:"CONVERTS_TO",title:"示例制造能源管理商机",displayKey:"OPP-ATOMIC-1",fields:{customerName:"示例制造",productCode:"ENERGY",estimatedAmount:100000,probability:30,expectedCloseDate:"2026-09-30",owner:"sales-owner"}};
  await assert.rejects(()=>store.createRelatedRecord("ai-growth-sales-platform",lead.id,input,scope),error=>error.code==="BUSINESS_RELATED_SOURCE_STATUS_DENIED");
  await store.transitionRecord("ai-growth-sales-platform",lead.id,{expectedVersion:1,status:"NEW"},scope);await store.transitionRecord("ai-growth-sales-platform",lead.id,{expectedVersion:2,status:"QUALIFYING"},scope);await store.transitionRecord("ai-growth-sales-platform",lead.id,{expectedVersion:3,status:"WAITING_APPROVAL"},scope);const qualification=await store.requestApproval("ai-growth-sales-platform",lead.id,{expectedVersion:4,requestedStatus:"QUALIFIED"},scope);await store.decideApproval("ai-growth-sales-platform",qualification.id,{decision:"APPROVED"},scope);
  await assert.rejects(()=>store.createRelatedRecord("ai-growth-sales-platform",lead.id,{...input,displayKey:"OPP-INVALID",fields:{...input.fields,owner:""}},scope),error=>error.code==="BUSINESS_FIELD_REQUIRED");
  assert.equal((await store.listRecords("ai-growth-sales-platform",scope)).length,1);
  const first=await store.createRelatedRecord("ai-growth-sales-platform",lead.id,input,scope),duplicate=await store.createRelatedRecord("ai-growth-sales-platform",lead.id,input,scope),detail=await store.recordDetail("ai-growth-sales-platform",lead.id,scope);
  assert.equal(first.created,true);assert.equal(duplicate.created,false);assert.equal(first.record.id,duplicate.record.id);assert.equal(detail.relations.length,1);assert.equal(detail.relations[0].record.id,first.record.id);assert.equal((await store.listRecords("ai-growth-sales-platform",scope)).length,2);
});
