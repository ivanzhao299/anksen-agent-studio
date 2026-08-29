import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
import { AutonomousDevelopmentJobs } from "../lib/autonomous-development-jobs.mjs";

const git = (root, args) => spawnSync("git", ["-C", root, ...args], { encoding: "utf8" });

test("development jobs require clarification, approval, worker claim and human commit approval", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-development-"));
  const project = resolve(root, "project");
  await mkdir(project);
  git(project, ["init"]); git(project, ["config", "user.email", "studio@test.local"]); git(project, ["config", "user.name", "Studio Test"]);
  await writeFile(resolve(project, "README.md"), "# Fixture\n", "utf8"); git(project, ["add", "README.md"]); git(project, ["commit", "-m", "fixture"]);
  const manager = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime") });
  const unclear = await manager.create({ projectId: "fixture", projectRoot: project, goal: "改文档", allowedPaths: ["docs/result.md"], maxRepairAttempts: 2 });
  assert.equal(unclear.status, "NEEDS_CLARIFICATION");
  await manager.clarify(unclear.id, "新增一份带验收内容的结果文档", { userId: "owner" });
  const approved = await manager.approve(unclear.id, { userId: "owner" });
  assert.equal(approved.approvalScope.maxRepairAttempts, 2);
  assert.equal(approved.approvalScope.commit, false);
  const claimed = await manager.claim({ id: "worker-1", pid: 42 });
  assert.equal(claimed.status, "RUNNING");
  assert.equal((await manager.claim({ id: "worker-2", pid: 43 })), null);
  await manager.artifact(claimed, "plan", "verified plan");
  assert.equal((await manager.readArtifact(claimed.id, claimed.artifacts[0].id)).content, "verified plan");
  await mkdir(resolve(project, "docs")); await writeFile(resolve(project, "docs/result.md"), "# Result\n", "utf8");
  claimed.status = "AWAITING_DIFF_APPROVAL"; await manager.save(claimed);
  const committed = await manager.approveCommit(claimed.id, { userId: "owner" });
  assert.equal(committed.status, "COMMITTED");
  assert.match(committed.commit.hash, /^[0-9a-f]{40}$/);
});

test("development jobs reject an unbounded repair budget", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-development-budget-"));
  const project = resolve(root, "project");
  await mkdir(project);
  git(project, ["init"]);
  const manager = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime") });
  await assert.rejects(
    manager.create({ projectId: "fixture", projectRoot: project, goal: "Implement a bounded fixture change", allowedPaths: ["src"], acceptanceCriteria: ["tests pass"], acceptanceCommands:["git diff --check"],acceptanceEvidence:[{criterion:"tests pass",type:"TEST",reference:"git diff --check"}], maxRepairAttempts: 3 }),
    (error) => error.code === "REPAIR_BUDGET_INVALID",
  );
});

test("worker heartbeat is evidence-backed and becomes offline", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-heartbeat-"));
  let now = new Date("2026-07-20T00:00:00.000Z");
  const manager = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime"), clock: () => now });
  assert.equal((await manager.workerStatus()).status, "OFFLINE");
  await manager.heartbeat({ id: "resident", pid: 7 });
  assert.equal((await manager.workerStatus()).status, "IDLE");
  now = new Date("2026-07-20T00:00:16.000Z");
  assert.equal((await manager.workerStatus()).status, "OFFLINE");
});

test("approval is bound to the clean project baseline and orphaned side effects require review", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-development-recovery-"));
  const project = resolve(root, "project");
  await mkdir(project);
  git(project, ["init"]); git(project, ["config", "user.email", "studio@test.local"]); git(project, ["config", "user.name", "Studio Test"]);
  await writeFile(resolve(project, "README.md"), "# Fixture\n"); git(project, ["add", "."]); git(project, ["commit", "-m", "fixture"]);
  const manager = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime"), processAlive: () => false });
  const job = await manager.create({ projectId: "fixture", projectRoot: project, goal: "Implement a bounded and verifiable fixture change", allowedPaths: ["src"], acceptanceCriteria: ["typecheck passes"],acceptanceCommands:["git diff --check"],acceptanceEvidence:[{criterion:"typecheck passes",type:"TEST",reference:"git diff --check"}] });
  const approved = await manager.approve(job.id, { userId: "owner" });
  assert.match(approved.approvalScopeDigest, /^[0-9a-f]{64}$/);
  const claimed = await manager.claim({ id: "worker", pid: 999999 });
  claimed.stage = "IMPLEMENTING"; await manager.save(claimed);
  const [reconciled] = await manager.reconcileOrphanedJobs();
  assert.equal(reconciled.status, "RECOVERY_REQUIRED");
  assert.equal(reconciled.recovery.sideEffectsPossible, true);
});

test("dirty projects fail preflight instead of absorbing existing user changes", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-development-dirty-"));
  const project = resolve(root, "project");
  await mkdir(project); git(project, ["init"]);
  await writeFile(resolve(project, "user-change.txt"), "preserve me\n");
  const manager = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime") });
  const job = await manager.create({ projectId: "fixture", projectRoot: project, goal: "Implement a bounded and verifiable fixture change", allowedPaths: ["src"], acceptanceCriteria: ["tests pass"],acceptanceCommands:["git diff --check"],acceptanceEvidence:[{criterion:"tests pass",type:"TEST",reference:"git diff --check"}] });
  assert.equal(job.status, "PREFLIGHT_BLOCKED");
  assert.deepEqual(job.preflight.existingChangedPaths, ["user-change.txt"]);
});

test("job persistence stays readable during concurrent status polling", async () => {
  const root = await mkdtemp(resolve(tmpdir(), "studio-development-atomic-")), project = resolve(root, "project");
  await mkdir(project); git(project, ["init"]); git(project, ["config", "user.email", "studio@test.local"]); git(project, ["config", "user.name", "Studio Test"]); await writeFile(resolve(project, "README.md"), "fixture\n"); git(project, ["add", "."]); git(project, ["commit", "-m", "fixture"]);
  const jobs = new AutonomousDevelopmentJobs({ repoRoot: root, storeDir: resolve(root, "runtime") });
  try {
    const job = await jobs.create({ projectId: "atomic-job", projectRoot: project, goal: "Keep persisted development job state atomically readable during concurrent polling", acceptanceCriteria: ["job JSON remains readable"], acceptanceCommands: ["git diff --check"], acceptanceEvidence: [{ criterion: "job JSON remains readable", type: "TEST", reference: "git diff --check" }], allowedPaths: ["result.txt"] }, { userId: "owner" });
    await Promise.all(Array.from({ length: 40 }, async (_, index) => {
      job.stage = `POLL_${index}`; await Promise.all([jobs.save(job), jobs.get(job.id), jobs.list()]);
    }));
    assert.equal((await jobs.get(job.id)).id, job.id);
  } finally { await rm(root, { recursive: true, force: true }); }
});

test("worker routes implementation through the governed runtime and four real roles", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../bin/autonomous-development-worker.mjs", import.meta.url), "utf8"));
  for (const role of ["PLANNER", "IMPLEMENTER", "VALIDATOR", "REVIEWER"]) assert.match(source, new RegExp(`role[:=]\"?${role}|\"${role}\"`));
  assert.match(source, /governed-codex-run\.mjs/);
  assert.match(source, /policySafeInstruction/);
  assert.match(source, /repairDecision/);
  assert.match(source, /expectedBaselineDigest/);
  assert.match(source, /NON_IMPROVING_VALIDATION|REPAIR_DECISION/);
});
