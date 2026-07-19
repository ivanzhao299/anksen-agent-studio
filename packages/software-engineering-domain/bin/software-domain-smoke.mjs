#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { SmokeKernelFixture } from "../../orchestrator-core/lib/night-shift-smoke.mjs";
import { evaluateSoftwareEngineeringAcceptance, SoftwareEngineeringPlanner } from "../lib/software-engineering-domain.mjs";

const contract = JSON.parse(await readFile(new URL("../examples/software-engineering-contract.example.json", import.meta.url), "utf8"));
const executionEvidence = JSON.parse(await readFile(new URL("../fixtures/execution-evidence.example.json", import.meta.url), "utf8"));
const kernel = new SmokeKernelFixture();
kernel.createGoal({ id: contract.contractId, title: contract.objective });
const { graph } = await new SoftwareEngineeringPlanner({ kernel }).planAndSubmit(contract);
while (kernel.goals.get(contract.contractId).status !== "SUCCEEDED") {
  kernel.schedulerTick(contract.contractId);
  let claim;
  while ((claim = kernel.claimNext(contract.contractId, "software-domain-worker"))) {
    await kernel.markRunning(claim);
    await kernel.complete(claim, { status: "SUCCEEDED", fencingToken: claim.lease.fencingToken });
  }
}
const acceptance = evaluateSoftwareEngineeringAcceptance(contract, executionEvidence);
const report = { status: acceptance.status, runtime: "CONTROLLED_STUB", realRuntimeEnabled: false, contractId: contract.contractId, plannerVersion: graph.plannerVersion, tasks: graph.tasks.length, claims: kernel.claimCount, attempts: kernel.attempts.size, activeLeases: [...kernel.leases.values()].filter(lease => lease.status === "ACTIVE").length, goalStatus: kernel.goals.get(contract.contractId).status, acceptance };
if (report.status !== "PASS" || report.goalStatus !== "SUCCEEDED" || report.claims !== 3 || report.activeLeases !== 0) throw new Error("SOFTWARE_DOMAIN_SMOKE_FAILED");
console.log(JSON.stringify(report, null, 2));
