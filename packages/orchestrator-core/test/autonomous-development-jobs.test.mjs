import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
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
  const unclear = await manager.create({ projectId: "fixture", projectRoot: project, goal: "改文档", allowedPaths: ["docs/result.md"] });
  assert.equal(unclear.status, "NEEDS_CLARIFICATION");
  await manager.clarify(unclear.id, "新增一份带验收内容的结果文档", { userId: "owner" });
  await manager.approve(unclear.id, { userId: "owner" });
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

test("worker routes implementation through the governed runtime and four real roles", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../bin/autonomous-development-worker.mjs", import.meta.url), "utf8"));
  for (const role of ["PLANNER", "IMPLEMENTER", "VALIDATOR", "REVIEWER"]) assert.match(source, new RegExp(`role[:=]\"?${role}|\"${role}\"`));
  assert.match(source, /governed-codex-run\.mjs/);
  assert.match(source, /policySafeInstruction/);
});
