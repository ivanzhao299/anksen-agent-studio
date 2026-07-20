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
    const events = await restarted.events(scope);
    assert.deepEqual(events.map((event) => event.event_type), ["business.object.created", "business.object.changed", "business.work.assigned", "business.object.workflow-transitioned", "business.work.runtime.completed", "business.object.changed", "business.approval.requested", "business.approval.decided"]);
    assert.equal(events.filter((event) => event.event_type === "business.work.assigned").length, 1);
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
