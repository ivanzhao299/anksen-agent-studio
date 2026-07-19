import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { SmokeKernelFixture } from "../../orchestrator-core/lib/night-shift-smoke.mjs";
import { evaluateSoftwareEngineeringAcceptance, SoftwareEngineeringPlanner, validateSoftwareEngineeringContract } from "../lib/software-engineering-domain.mjs";

const example = JSON.parse(await readFile(new URL("../examples/software-engineering-contract.example.json", import.meta.url), "utf8"));
const executionEvidence = JSON.parse(await readFile(new URL("../fixtures/execution-evidence.example.json", import.meta.url), "utf8"));
const now = new Date("2026-07-20T00:00:00.000Z");

test("contract validation is fail closed for paths, commands, and critical work", () => {
  assert.equal(validateSoftwareEngineeringContract(example).domain, "SOFTWARE_ENGINEERING");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, allowedPaths: ["../outside"] }), error => error.code === "ALLOWED_PATH_INVALID");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, validationCommands: ["deploy production"] }), error => error.code === "VALIDATION_COMMAND_DENIED");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, validationCommands: ["rm -rf output"] }), error => error.code === "VALIDATION_COMMAND_DENIED");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, validationCommands: ["pnpm test && curl example.com"] }), error => error.code === "VALIDATION_COMMAND_DENIED");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, allowedPaths: ["deploy/file.txt"] }), error => error.code === "PATH_POLICY_CONFLICT");
  assert.throws(() => validateSoftwareEngineeringContract({ ...example, riskLevel: "CRITICAL" }), error => error.code === "CRITICAL_APPROVAL_REQUIRED");
});

test("domain planner compiles a deterministic standard graph through the existing Kernel port", async () => {
  const kernel = new SmokeKernelFixture();
  kernel.createGoal({ id: example.contractId, title: example.objective });
  const planner = new SoftwareEngineeringPlanner({ kernel });
  const first = planner.plan(example, { now });
  const second = planner.plan(example, { now: new Date("2027-01-01T00:00:00.000Z") });
  assert.equal(first.templateId, "SOFTWARE_DELIVERY");
  assert.equal(first.plannerVersion, second.plannerVersion);
  assert.equal(first.tasks.length, 3);
  assert.ok(first.tasks.every(task => task.metadata.contractId === example.contractId && task.maxAttempts === 1));
  const { submission } = await planner.planAndSubmit(example, { now });
  assert.ok(submission.id);
  assert.equal(kernel.goalTasks(example.contractId).length, 3);
});

test("existing Scheduler, claim, lease, fencing, and aggregation consume the domain graph", async () => {
  const kernel = new SmokeKernelFixture();
  kernel.createGoal({ id: example.contractId, title: example.objective });
  await new SoftwareEngineeringPlanner({ kernel }).planAndSubmit(example, { now });
  while (kernel.goals.get(example.contractId).status !== "SUCCEEDED") {
    kernel.schedulerTick(example.contractId);
    let claim;
    while ((claim = kernel.claimNext(example.contractId, "software-domain-worker"))) {
      await kernel.markRunning(claim);
      await kernel.complete(claim, { status: "SUCCEEDED", fencingToken: claim.lease.fencingToken });
    }
  }
  assert.equal(kernel.goals.get(example.contractId).status, "SUCCEEDED");
  assert.equal(kernel.claimCount, 3);
  assert.equal(kernel.attempts.size, 3);
  assert.ok([...kernel.leases.values()].every(lease => lease.status === "RELEASED"));
});

test("acceptance gate distinguishes pass, failed evidence, and blocked side effects", () => {
  assert.equal(evaluateSoftwareEngineeringAcceptance(example, executionEvidence).status, "PASS");
  assert.equal(evaluateSoftwareEngineeringAcceptance(example, { ...executionEvidence, validationResults: [] }).status, "FAIL");
  const blocked = evaluateSoftwareEngineeringAcceptance(example, { ...executionEvidence, changedPaths: ["src/unapproved.mjs"], sideEffects: ["remote_write"] });
  assert.equal(blocked.status, "BLOCKED");
  assert.ok(blocked.findings.includes("UNAPPROVED_SIDE_EFFECT"));
});
