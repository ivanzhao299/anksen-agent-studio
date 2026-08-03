import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { approvalScopeDigest, assertWorkspaceWithinScope, captureGitWorkspace, deliveryReport, repairDecision } from "../lib/autonomous-development-policy.mjs";

const git = (root, args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });

test("workspace digest changes with tracked and untracked content and rejects scope drift", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-policy-"));
  git(root, ["init"]); git(root, ["config", "user.email", "studio@test.local"]); git(root, ["config", "user.name", "Studio Test"]);
  await mkdir(resolve(root, "src")); await writeFile(resolve(root, "src/index.js"), "export const value = 1;\n");
  git(root, ["add", "."]); git(root, ["commit", "-m", "fixture"]);
  const clean = captureGitWorkspace(root); assert.deepEqual(clean.paths, []);
  await writeFile(resolve(root, "src/index.js"), "export const value = 2;\n");
  const changed = assertWorkspaceWithinScope(captureGitWorkspace(root), ["src"]);
  assert.notEqual(changed.digest, clean.digest);
  assert.throws(() => assertWorkspaceWithinScope(changed, ["docs"]), /WORKSPACE_SCOPE_DRIFT/);
});

test("repair policy is bounded and stops repeated non-improving validation", () => {
  const validation = { status: "FAIL", checks: [{ command: "pnpm test", status: 1, output: "same failure" }] };
  const first = repairDecision({ validation, maxRepairAttempts: 2 });
  assert.equal(first.action, "REPAIR");
  assert.equal(repairDecision({ validation, previousFingerprints: [first.fingerprint], repairsUsed: 1, maxRepairAttempts: 2 }).reason, "NON_IMPROVING_VALIDATION");
  assert.equal(repairDecision({ validation, repairsUsed: 2, maxRepairAttempts: 2 }).reason, "REPAIR_BUDGET_EXHAUSTED");
});

test("approval digest and delivery report retain human release boundaries", () => {
  const scope = { projectId: "fixture", projectRoot: "/tmp/fixture", allowedPaths: ["src"], blockedPaths: [".git"], acceptanceCommands: ["pnpm test"], maxRuntimeSeconds: 600, maxRepairAttempts: 1 };
  assert.match(approvalScopeDigest(scope), /^[0-9a-f]{64}$/);
  const report = deliveryReport({ id: "job", goal: "Improve fixture", projectId: "fixture", status: "AWAITING_DIFF_APPROVAL", changedPaths: ["src/a.js"], validation: { status: "PASS", checks: [] }, repairAttemptsUsed: 1, maxRepairAttempts: 1 });
  assert.equal(report.nextAction, "HUMAN_DIFF_REVIEW");
  assert.equal(report.automaticActions.push, false);
});
