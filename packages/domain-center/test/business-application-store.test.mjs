import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";

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
  await assert.rejects(() => store.transitionRecord("finance-platform", record.id, { expectedVersion: 0, status: "SUBMITTED" }, { userId: "finance-user" }), (error) => error.code === "BUSINESS_RECORD_VERSION_CONFLICT");
  await assert.rejects(() => store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "PAID" }, { userId: "finance-user" }), (error) => error.code === "BUSINESS_RECORD_TRANSITION_DENIED");
  const submitted = await store.transitionRecord("finance-platform", record.id, { expectedVersion: 1, status: "SUBMITTED" }, { userId: "finance-user" });
  assert.equal(submitted.version, 2);
  assert.deepEqual(submitted.availableTransitions, ["UNDER_REVIEW", "REJECTED"]);
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
