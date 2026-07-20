import assert from "node:assert/strict";
import test from "node:test";
import { projectPortfolioWork } from "../lib/portfolio-work-projection.mjs";

const campaign = {
  id: "campaign-1", goal: "审批预算后安排园区服务", status: "COMPLETED_WITH_BLOCKERS",
  schedule: { currentCycle: 0, mode: "ONCE" }, updatedAt: "2026-07-21T01:00:00.000Z",
  initiatives: [
    { id: "finance-1", cycle: 0, applicationId: "finance-platform", domainId: "finance-management", domainName: "财务管理", title: "预算审批", status: "BLOCKED", blockedReasons: ["BUSINESS_HUMAN_APPROVAL_REQUIRED"], report: { humanApprovalRequired: true, nextAction: "COMPLETE_BUSINESS_APPROVAL_AND_RECONCILE", businessObject: { applicationId: "finance-platform", objectId: "budget-1", displayKey: "BUDGET-1", href: "/finance?record=budget-1" } } },
    { id: "park-1", cycle: 0, applicationId: "smart-park-platform", domainId: "tenant-service-workflow", domainName: "企业服务", title: "园区服务", status: "BLOCKED", blockedReasons: ["UPSTREAM_INITIATIVE_BLOCKED"], report: null },
    { id: "hr-1", cycle: 0, applicationId: "human-resources-platform", domainId: "human-resources", domainName: "人力资源", title: "不可见任务", status: "SUCCEEDED", blockedReasons: [] }
  ]
};

test("portfolio work projection exposes human breakpoints and Morning Report without crossing application visibility", () => {
  const result = projectPortfolioWork([campaign], { applicationIds: ["finance-platform", "smart-park-platform"], generatedAt: "2026-07-21T02:00:00.000Z" });
  assert.deepEqual(result.summary, { campaigns: 1, activeCampaigns: 0, initiatives: 2, humanActions: 1, blocked: 1, completed: 0 });
  assert.equal(result.humanActions[0].businessObject.objectId, "budget-1");
  assert.equal(result.blocked[0].blockedReasons[0], "UPSTREAM_INITIATIVE_BLOCKED");
  assert.equal(result.campaigns[0].initiatives.some((item) => item.applicationId === "human-resources-platform"), false);
  assert.equal(result.morningReport[0].counts.blocked, 2);
  assert.equal("initiatives" in result.morningReport[0], false);
});

test("portfolio work projection omits campaigns with no visible initiative", () => {
  const result = projectPortfolioWork([campaign], { applicationIds: ["growth-sales-platform"] });
  assert.equal(result.summary.campaigns, 0);
  assert.deepEqual(result.humanActions, []);
});
