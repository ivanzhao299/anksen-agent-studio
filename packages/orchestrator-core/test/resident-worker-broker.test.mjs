import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import { join } from "node:path";
import { tmpdir } from "node:os";
import { ResidentWorkerBroker } from "../lib/resident-worker-broker.mjs";

test("resident worker registration, project claim, lease renewal and fenced result", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resident-worker-"));
  let now = new Date("2026-08-24T00:00:00Z");
  const broker = new ResidentWorkerBroker({ storePath: join(dir, "store.json"), clock: () => now, leaseMs: 1000 });
  try {
    const worker = await broker.register({ workerId: "mac-1", projects: [{ projectId: "studio", pathRef: "local://studio" }], capabilities: ["codex"], credentialReferenceId: "codex-local-session-ref", lifecycle: { status: "READY", fingerprint: "fleet-v1", projectCount: 1 } });
    assert.equal(worker.lifecycle.status, "READY"); assert.equal(worker.lifecycle.fingerprint, "fleet-v1");
    await broker.enqueue({ taskId: "task-1", projectId: "studio", goal: "inspect", mode: "READ_ONLY" });
    const claimed = await broker.claim("mac-1");
    assert.equal(claimed.taskId, "task-1"); assert.ok(claimed.lease.token); assert.equal(claimed.lease.fencingToken, 1);
    now = new Date("2026-08-24T00:00:00.500Z");
    await broker.renew("mac-1", "task-1", { leaseToken: claimed.lease.token, fencingToken: 1 });
    const result = await broker.complete("mac-1", "task-1", { leaseToken: claimed.lease.token, fencingToken: 1, status: "SUCCEEDED", summary: "ok" });
    assert.equal(result.status, "SUCCEEDED");
    await assert.rejects(() => broker.complete("mac-1", "task-1", { leaseToken: "old", fencingToken: 1 }), error => error.code === "LEASE_LOST");
  } finally { await rm(dir, { recursive: true, force: true }); }
});

test("write tasks require explicit approval", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resident-worker-")); const broker = new ResidentWorkerBroker({ storePath: join(dir, "store.json") });
  try { await assert.rejects(() => broker.enqueue({ projectId: "studio", goal: "edit", mode: "GOVERNED_WRITE" }), error => error.code === "WRITE_TASK_APPROVAL_REQUIRED"); }
  finally { await rm(dir, { recursive: true, force: true }); }
});

test("a read-only worker never claims an approved write task", async () => {
  const dir = await mkdtemp(join(tmpdir(), "resident-worker-")); const broker = new ResidentWorkerBroker({ storePath: join(dir, "store.json") });
  try {
    await broker.register({ workerId: "read-only", projects: [{ projectId: "studio", pathRef: "local://studio" }], capabilities: ["codex.exec.read-only"] });
    await broker.enqueue({ taskId: "write-1", projectId: "studio", goal: "edit", mode: "GOVERNED_WRITE", approved: true });
    assert.equal(await broker.claim("read-only"), null);
  } finally { await rm(dir, { recursive: true, force: true }); }
});
