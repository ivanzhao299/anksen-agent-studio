import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { ensurePostgresFixture, createTestPool } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { createBusinessApplicationRuntime, importLegacyBusinessApplicationFile } from "../lib/business-database.mjs";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";
import { PostgresBusinessApplicationStore } from "../lib/postgres-business-application-store.mjs";
import { PersistentNightShiftService } from "../../orchestrator-core/lib/persistent-night-shift.mjs";

const expenseFields = { expenseDate: "2026-07-21", department: "运营中心", category: "采购", amount: 2600, currency: "CNY", budgetCode: "OPS-01", description: "运营物资" };

test("PostgreSQL business store is scoped, transactional, idempotent and restart-readable", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(), suffix = randomUUID(), scope = { organizationId: `org-${suffix}`, workspaceId: `workspace-${suffix}`, userId: "finance-user" };
  try {
    const runtime = await createBusinessApplicationRuntime({ repoRoot: process.cwd(), pool });
    assert.equal(runtime.backend, "POSTGRESQL");
    const store = runtime.store;
    const record = await store.createRecord("finance-platform", { objectType: "expense", title: "采购费用", displayKey: `EXP-${suffix}`, fields: expenseFields }, scope);
    assert.equal(record.version, 1);
    assert.equal(record.source, "POSTGRESQL_BUSINESS_APPLICATION_STORE");
    assert.equal((await store.listRecords("finance-platform", scope)).length, 1);
    assert.equal(await store.getRecord("finance-platform", record.id, { organizationId: "other-org", workspaceId: scope.workspaceId }), null);

    const transitions = await Promise.allSettled([
      store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "SUBMITTED" }, scope),
      store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "SUBMITTED" }, scope)
    ]);
    assert.equal(transitions.filter((item) => item.status === "fulfilled").length, 1);
    assert.equal(transitions.filter((item) => item.status === "rejected" && item.reason.code === "BUSINESS_RECORD_VERSION_CONFLICT").length, 1);

    const idempotencyKey = `work:${suffix}`;
    const [first, duplicate] = await Promise.all([
      store.createWorkItem({ applicationId: "finance-platform", businessObjectId: record.id, assignmentType: "HUMAN", assigneeId: "finance-user", idempotencyKey }, scope),
      store.createWorkItem({ applicationId: "finance-platform", businessObjectId: record.id, assignmentType: "HUMAN", assigneeId: "finance-user", idempotencyKey }, scope)
    ]);
    assert.equal(first.id, duplicate.id);
    const goalId = randomUUID(), sessionId = randomUUID();
    await assert.rejects(() => store.completeWorkflow(first.id, { goalId, sessionId, report: { status: "SUCCEEDED" }, workStatus: "WAITING_APPROVAL", businessStatus: "UNDER_REVIEW", expectedObjectVersion: 1 }), (error) => error.code === "BUSINESS_RECORD_VERSION_CONFLICT");
    assert.equal((await store.myWork(scope)).items[0].status, "OPEN", "work update must roll back with the record transition");
    await store.completeWorkflow(first.id, { goalId, sessionId, report: { status: "SUCCEEDED" }, workStatus: "WAITING_APPROVAL", businessStatus: "UNDER_REVIEW", expectedObjectVersion: 2 });

    const restarted = new PostgresBusinessApplicationStore({ pool });
    const work = await restarted.myWork(scope);
    assert.equal(work.items.length, 1);
    assert.equal(work.items[0].sessionId, sessionId);
    assert.equal(work.summary.waitingApproval, 1);
    const recoveredRecord = await restarted.getRecord("finance-platform", record.id, scope);
    assert.equal(recoveredRecord.status, "UNDER_REVIEW");
    assert.equal(recoveredRecord.version, 3);
    const detail = await restarted.recordDetail("finance-platform", record.id, scope);
    assert.equal(detail.record.id, record.id);
    assert.equal(detail.workItems.length, 1);
    assert.equal(detail.timeline[0].type, "business.work.runtime.completed");
    assert.equal(await restarted.recordDetail("finance-platform", record.id, { organizationId: "other-org", workspaceId: scope.workspaceId }), null);
    await restarted.transitionRecord("finance-platform", record.id, { expectedVersion: 3, status: "WAITING_APPROVAL" }, scope);
    await assert.rejects(() => restarted.transitionRecord("finance-platform", record.id, { expectedVersion: 4, status: "APPROVED" }, scope), (error) => error.code === "BUSINESS_APPROVAL_REQUIRED");
    const approval = await restarted.requestApproval("finance-platform", record.id, { expectedVersion: 4, requestedStatus: "APPROVED" }, scope);
    assert.equal((await restarted.requestApproval("finance-platform", record.id, { expectedVersion: 4, requestedStatus: "APPROVED" }, scope)).id, approval.id);
    assert.equal((await restarted.approvalInbox(scope))[0].businessObject.href, `/finance?record=${record.id}`);
    const approved = await restarted.decideApproval("finance-platform", approval.id, { decision: "APPROVED" }, { ...scope, userId: "finance-manager" });
    assert.equal(approved.record.status, "APPROVED");
    await assert.rejects(() => restarted.decideApproval("finance-platform", approval.id, { decision: "APPROVED" }, scope), (error) => error.code === "BUSINESS_APPROVAL_NOT_PENDING");
    assert.equal((await restarted.recordDetail("finance-platform", record.id, scope)).approvals[0].status, "APPROVED");
    assert.equal((await restarted.approvalInbox(scope)).length, 0);
    const report = await restarted.applicationReport("finance-platform", scope);
    assert.equal(report.totalRecords, 1);
    assert.equal(report.byObjectType.expense, 1);
    assert.equal(report.byStatus.APPROVED, 1);
    assert.equal(report.work.human, 1);
    assert.equal(report.approvals.APPROVED, 1);
    assert.equal(report.recentRecords[0].href, `/finance?record=${record.id}`);
    assert.equal((await restarted.myWork({ ...scope, userId: "unrelated-operator" })).summary.total, 0);
    assert.equal((await restarted.myWork({ ...scope, userId: "workspace-admin", includeAll: true })).summary.total, 1);
    await assert.rejects(() => restarted.controlWorkItem(first.id, { action: "REASSIGN", expectedVersion: 2, assignmentType: "AGENT", assigneeId: "agent-finance" }, { ...scope, userId: "unrelated-operator" }), (error) => error.code === "BUSINESS_WORK_CONTROL_FORBIDDEN");
    const reassigned = await restarted.controlWorkItem(first.id, { action: "REASSIGN", expectedVersion: 2, assignmentType: "AGENT", assigneeId: "agent-finance" }, scope);
    assert.equal(reassigned.assignmentType, "AGENT");
    const paused = await restarted.controlWorkItem(first.id, { action: "PAUSE", expectedVersion: 3 }, scope);
    assert.equal(paused.status, "PAUSED");
    await assert.rejects(() => restarted.controlWorkItem(first.id, { action: "RESUME", expectedVersion: 3 }, scope), (error) => error.code === "BUSINESS_WORK_VERSION_CONFLICT");
    const takeover = await restarted.controlWorkItem(first.id, { action: "TAKE_OVER", expectedVersion: 4, assigneeId: "finance-user" }, { ...scope, userId: "finance-manager", canManageBusiness: true });
    assert.equal(takeover.assignmentType, "HUMAN");
    assert.equal(takeover.status, "OPEN");
    assert.equal(takeover.version, 5);
    const events = await restarted.events(scope);
    assert.deepEqual(events.map((event) => event.event_type), ["business.object.created", "business.object.changed", "business.work.assigned", "business.object.workflow-transitioned", "business.work.runtime.completed", "business.object.changed", "business.approval.requested", "business.approval.decided", "business.work.controlled", "business.work.controlled", "business.work.controlled"]);
    assert.equal(events.filter((event) => event.event_type === "business.work.assigned").length, 1);
  } finally {
    await pool.end();
  }
});

test("business work control refuses to bypass an active Kernel lease", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(), suffix = randomUUID(), scope = { organizationId: `lease-org-${suffix}`, workspaceId: `lease-workspace-${suffix}`, userId: "operator" };
  try {
    const runtime = await createBusinessApplicationRuntime({ repoRoot: process.cwd(), pool }), store = runtime.store;
    const record = await store.createRecord("finance-platform", { objectType: "expense", title: "租约控制测试", displayKey: `LEASE-${suffix}`, fields: expenseFields }, scope);
    const work = await store.createWorkItem({ applicationId: "finance-platform", businessObjectId: record.id, assignmentType: "AGENT", assigneeId: "agent-finance" }, scope);
    const night = new PersistentNightShiftService(pool), sessionKey = `business-control-${suffix}`;
    const session = await night.acceptGoal(sessionKey, { id: sessionKey, title: "验证业务工作控制租约", scope: { ...scope, projectId: "business-control-test" } });
    const identity = await night.registerWorker(`business-control-worker-${suffix}`, scope);
    let claim = null;
    for (let attempt = 0; attempt < 5 && !claim; attempt += 1) {
      await night.tick(session, `business-control-scheduler-${suffix}-${attempt}`);
      claim = await night.claim(session, identity);
    }
    assert.ok(claim?.leaseId);
    const attached = await store.attachWorkflow(work.id, { goalId: session.goal_id, sessionId: session.id, report: null, status: "RUNNING" });
    await assert.rejects(() => store.controlWorkItem(work.id, { action: "PAUSE", expectedVersion: attached.version }, scope), (error) => error.code === "BUSINESS_WORK_ACTIVE_LEASE");
    assert.equal((await store.myWork(scope)).items[0].status, "RUNNING");
  } finally {
    await pool.end();
  }
});

test("legacy file import is lossless and idempotent", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(), root = await mkdtemp(resolve(tmpdir(), "business-legacy-")), storePath = resolve(root, "store.json"), suffix = randomUUID(), scope = { organizationId: `legacy-org-${suffix}`, workspaceId: `legacy-workspace-${suffix}`, userId: "legacy-user" };
  try {
    await createBusinessApplicationRuntime({ repoRoot: process.cwd(), pool });
    const legacy = new BusinessApplicationStore({ repoRoot: root, storePath });
    const record = await legacy.createRecord("finance-platform", { objectType: "expense", title: "历史费用", displayKey: `LEGACY-${suffix}`, fields: expenseFields }, scope);
    const work = await legacy.createWorkItem({ applicationId: "finance-platform", businessObjectId: record.id, assignmentType: "HUMAN", assigneeId: "legacy-user" }, scope);
    const first = await importLegacyBusinessApplicationFile({ pool, storePath });
    const second = await importLegacyBusinessApplicationFile({ pool, storePath });
    assert.deepEqual({ records: first.records, workItems: first.workItems, events: first.events }, { records: 1, workItems: 1, events: 2 });
    assert.deepEqual({ records: second.records, workItems: second.workItems, events: second.events }, { records: 0, workItems: 0, events: 0 });
    const restarted = new PostgresBusinessApplicationStore({ pool });
    assert.equal((await restarted.getRecord("finance-platform", record.id, scope)).displayKey, `LEGACY-${suffix}`);
    assert.equal((await restarted.myWork(scope)).items[0].id, work.id);
  } finally {
    await pool.end();
  }
});

test("business record relations are typed, scoped, idempotent and restart-readable",async()=>{
  await ensurePostgresFixture();
  const pool=createTestPool(),suffix=randomUUID(),scope={organizationId:`relation-org-${suffix}`,workspaceId:`relation-workspace-${suffix}`,userId:"finance-controller"};
  try{
    const runtime=await createBusinessApplicationRuntime({repoRoot:process.cwd(),pool}),store=runtime.store;
    const budget=await store.createRecord("finance-platform",{objectType:"budget",title:"年度运营预算",displayKey:`BUD-${suffix}`,fields:{fiscalYear:2027,department:"运营中心",budgetCode:"OPS-2027",amount:100000,currency:"CNY"}},scope),expense=await store.createRecord("finance-platform",{objectType:"expense",title:"预算内采购",displayKey:`REL-EXP-${suffix}`,fields:expenseFields},scope),input={targetRecordId:expense.id,relationType:"CONTROLS"},first=await store.createRelation("finance-platform",budget.id,input,scope),duplicate=await store.createRelation("finance-platform",budget.id,input,scope);
    assert.equal(first.id,duplicate.id);
    const restarted=new PostgresBusinessApplicationStore({pool}),detail=await restarted.recordDetail("finance-platform",budget.id,scope),reverse=await restarted.recordDetail("finance-platform",expense.id,scope);
    assert.equal(detail.relations[0].record.id,expense.id);assert.equal(detail.relations[0].direction,"OUTGOING");assert.equal(reverse.relations[0].record.id,budget.id);assert.equal(reverse.relations[0].direction,"INCOMING");assert.equal(detail.relationOptions.length,0);assert.deepEqual((await restarted.applicationReport("finance-platform",scope)).businessChains,{total:1,byType:{CONTROLS:1}});
    assert.equal(await restarted.recordDetail("finance-platform",budget.id,{organizationId:"foreign",workspaceId:scope.workspaceId}),null);
    await assert.rejects(()=>store.createRelation("finance-platform",expense.id,{targetRecordId:budget.id,relationType:"CONTROLS"},scope),error=>error.code==="BUSINESS_RELATION_DENIED");
    const event=(await store.events(scope)).find(item=>item.type==="business.record.related");assert.equal(event.payload.targetRecordId,expense.id);
    const atomicBudget=await store.createRecord("finance-platform",{objectType:"budget",title:"原子事务预算",displayKey:`BUD-ATOMIC-${suffix}`,fields:{fiscalYear:2027,department:"市场中心",budgetCode:"MKT-2027",amount:50000,currency:"CNY"}},scope),relatedInput={objectType:"expense",relationType:"CONTROLS",title:"市场活动费用",displayKey:`EXP-ATOMIC-${suffix}`,fields:{...expenseFields,department:"市场中心",budgetCode:"MKT-2027"}};
    await assert.rejects(()=>store.createRelatedRecord("finance-platform",atomicBudget.id,{...relatedInput,displayKey:`EXP-INVALID-${suffix}`,fields:{...relatedInput.fields,description:""}},scope),error=>error.code==="BUSINESS_FIELD_REQUIRED");
    const firstAtomic=await store.createRelatedRecord("finance-platform",atomicBudget.id,relatedInput,scope),duplicateAtomic=await store.createRelatedRecord("finance-platform",atomicBudget.id,relatedInput,scope),atomicDetail=await store.recordDetail("finance-platform",atomicBudget.id,scope);
    assert.equal(firstAtomic.created,true);assert.equal(duplicateAtomic.created,false);assert.equal(firstAtomic.record.id,duplicateAtomic.record.id);assert.equal(atomicDetail.relations.length,1);assert.equal(atomicDetail.relations[0].record.id,firstAtomic.record.id);
    assert.equal((await store.events(scope)).filter(item=>item.type==="business.object.created"&&item.payload?.sourceRecordId===atomicBudget.id).length,1);
  }finally{await pool.end();}
});
