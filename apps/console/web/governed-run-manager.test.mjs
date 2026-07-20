import assert from "node:assert/strict";
import { mkdtemp, mkdir, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { GovernedRunManager } from "./governed-run-manager.mjs";

async function fixture() {
  const repoRoot = await mkdtemp(join(tmpdir(), "studio-governed-run-"));
  await mkdir(join(repoRoot, "docs"));
  return repoRoot;
}

test("creates a persistent, single-attempt governed proposal", async () => {
  const repoRoot = await fixture();
  const manager = new GovernedRunManager({ repoRoot });
  const record = await manager.create({
    projectId: "fixture-project",
    projectRoot: repoRoot,
    goal: "Update runtime documentation",
    allowedPaths: ["docs/runtime.md"],
    acceptanceCommands: ["git diff --check"]
  }, { userId: "owner-1" });

  assert.equal(record.status, "PENDING_APPROVAL");
  assert.equal(record.requestedBy, "owner-1");
  assert.deepEqual(record.safety, { maxAttempts: 1, allowCommit: false, allowPush: false, allowMerge: false, allowDeploy: false });
  const config = JSON.parse(await readFile(manager.configPath(record.id), "utf8"));
  assert.equal(config.credentialReferenceId, "codex-local-session-ref");
  assert.deepEqual(config.allowedPaths, ["docs/runtime.md"]);
});

test("requires a separate approval before spawning the resident process", async () => {
  const repoRoot = await fixture();
  let invocation = null;
  const manager = new GovernedRunManager({
    repoRoot,
    spawnImpl(command, args, options) {
      invocation = { command, args, options };
      return { pid: process.pid, unref() {} };
    }
  });
  const proposal = await manager.create({ projectId: "fixture-project", projectRoot: repoRoot, goal: "Add a report", allowedPaths: ["docs/report.md"], acceptanceCommands: ["git diff --check"] });
  const approved = await manager.approve(proposal.id, { userId: "approver-1" });

  assert.equal(approved.status, "RUNNING");
  assert.equal(approved.approvedBy, "approver-1");
  assert.equal(invocation.command, process.execPath);
  assert.equal(invocation.options.detached, true);
  await assert.rejects(() => manager.approve(proposal.id), /GOVERNED_RUN_NOT_PENDING/);
});

test("rejects paths outside the explicit safe boundary", async () => {
  const repoRoot = await fixture();
  const manager = new GovernedRunManager({ repoRoot });
  await assert.rejects(() => manager.create({ projectId: "fixture-project", projectRoot: repoRoot, goal: "Change secrets", allowedPaths: [".env"] }), /\.env/);
});
