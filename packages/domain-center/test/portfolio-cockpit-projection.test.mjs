import test from "node:test";
import assert from "node:assert/strict";
import { projectPortfolioCockpit } from "../lib/portfolio-cockpit-projection.mjs";

test("portfolio cockpit projects actionable signals per independent business application", () => {
  const applications = [{ id: "finance-platform", path: "/finance" }, { id: "hr-platform", path: "/hr" }];
  const result = projectPortfolioCockpit({
    applications,
    portfolioWork: { campaigns: [{ id: "campaign-1", status: "ACTIVE", initiatives: [
      { applicationId: "finance-platform", status: "BLOCKED", humanApprovalRequired: true },
      { applicationId: "hr-platform", status: "RUNNING", humanApprovalRequired: false }
    ] }] },
    exceptions: [{ applicationId: "finance-platform" }],
    professionalResults: [{ applicationId: "finance-platform", decision: "REVIEW_REQUIRED" }, { applicationId: "hr-platform", decision: "PASS" }]
  });
  assert.deepEqual(result.map((item) => [item.id, item.path, item.operations.signal]), [
    ["finance-platform", "/finance", "ACTION_REQUIRED"],
    ["hr-platform", "/hr", "RUNNING"]
  ]);
  assert.equal(result[0].operations.humanActions, 1);
  assert.equal(result[0].operations.exceptions, 1);
  assert.equal(result[0].operations.professional.reviewRequired, 1);
  assert.equal(result[1].operations.professional.pass, 1);
});
