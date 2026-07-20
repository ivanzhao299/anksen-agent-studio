import test from "node:test";
import assert from "node:assert/strict";
import { availableBusinessTransitions, businessWorkflowGoal, getBusinessObjectDefinition, validateBusinessObjectFields } from "../lib/business-object-definitions.mjs";

test("strategy, HR and finance have domain-specific schemas and review states", () => {
  const strategy = getBusinessObjectDefinition("enterprise-strategy-platform", "objective");
  const hr = getBusinessObjectDefinition("human-resources-platform", "recruitment_case");
  const finance = getBusinessObjectDefinition("finance-platform", "expense");
  assert.equal(strategy.agentReviewStatus, "WAITING_REVIEW");
  assert.equal(hr.agentReviewStatus, "WAITING_APPROVAL");
  assert.equal(finance.agentReviewStatus, "WAITING_APPROVAL");
  assert.deepEqual(availableBusinessTransitions("finance-platform", "expense", "UNDER_REVIEW"), ["WAITING_APPROVAL", "REJECTED", "BLOCKED"]);
  assert.match(businessWorkflowGoal("finance-platform", { objectType: "expense", title: "EXP-001" }), /预算科目/);
});

test("business field validation normalizes numbers and rejects invalid values", () => {
  const fields = validateBusinessObjectFields("finance-platform", "expense", { expenseDate: "2026-07-20", department: "财务中心", category: "差旅", amount: "88.50", currency: "CNY", budgetCode: "TRAVEL", description: "出差" });
  assert.equal(fields.amount, 88.5);
  assert.throws(() => validateBusinessObjectFields("finance-platform", "expense", { expenseDate: "2026-07-20" }), (error) => error.code === "BUSINESS_FIELD_REQUIRED");
});
