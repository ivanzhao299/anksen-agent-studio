import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, mkdir, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { assessAutonomousDevelopmentReadiness } from "../lib/autonomous-development-readiness.mjs";

test("readiness stays truthful when repository evidence exists but runtime proof is absent", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-autonomy-readiness-"));
  const report = await assessAutonomousDevelopmentReadiness({ root, codexPath: resolve(root, "missing-codex") });
  assert.equal(report.status, "CONTROL_PLANE_READY");
  assert.equal(report.maturity.codexRuntime, "NOT_READY");
  assert.equal(report.maturity.autonomousDevelopment, "NOT_READY");
  assert.equal(report.safety.automaticPush, false);
  assert.equal(report.maturity.productionAutonomy,"DISABLED");
  assert.equal(report.checks.find((item) => item.id === "bounded-repair").status, "BLOCKED");
});

test("readiness recognizes bounded repair implementation evidence", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-autonomy-readiness-"));
  const workerDir = resolve(root, "packages/orchestrator-core/bin");
  await mkdir(workerDir, { recursive: true });
  await writeFile(resolve(workerDir, "autonomous-development-worker.mjs"), "repairDecision expectedBaselineDigest REPAIR_DECISION");
  const report = await assessAutonomousDevelopmentReadiness({ root, codexPath: resolve(root, "missing") });
  assert.equal(report.checks.find((item) => item.id === "bounded-repair").status, "READY");
});

test("readiness recognizes a live worker and real four-role evidence without overstating full autonomy", async () => {
  const root = await mkdtemp(join(tmpdir(), "studio-autonomy-readiness-"));
  const runtimeDir = resolve(root, "runtime/autonomous-development");
  const jobsDir = resolve(runtimeDir, "jobs");
  const codexPath = resolve(root, "codex");
  await mkdir(jobsDir, { recursive: true });
  await writeFile(codexPath, "#!/bin/sh\n", { mode: 0o755 });
  await writeFile(resolve(runtimeDir, "worker-heartbeat.json"), JSON.stringify({ workerId: "worker-1", status: "IDLE", lastHeartbeatAt: "2026-08-02T00:00:00.000Z" }));
  await writeFile(resolve(jobsDir, "job.json"), JSON.stringify({ id: "job-1", status: "AWAITING_DIFF_APPROVAL", agentInstances: ["PLANNER", "IMPLEMENTER", "VALIDATOR", "REVIEWER"].map((role) => ({ role, runtimeType: "CODEX", status: "SUCCEEDED" })) }));
  const report = await assessAutonomousDevelopmentReadiness({ root, codexPath, now: new Date("2026-08-02T00:00:05.000Z") });
  assert.equal(report.status, "CODEX_RUNTIME_READY");
  assert.equal(report.maturity.codexRuntime, "READY");
  assert.equal(report.maturity.autonomousDevelopment, "NOT_READY");
  assert.equal(report.checks.find((item) => item.id === "proven-run").status, "READY");
});
