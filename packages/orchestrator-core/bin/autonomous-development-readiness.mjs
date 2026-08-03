#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessAutonomousDevelopmentReadiness } from "../lib/autonomous-development-readiness.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.some((arg) => arg !== "--json")) {
  console.error("Usage: autonomous-development-readiness [--json]");
  process.exitCode = 2;
} else {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const report = await assessAutonomousDevelopmentReadiness({ root });
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`Autonomous development readiness: ${report.status} (${report.summary.ready}/${report.summary.total})`);
    for (const check of report.checks) console.log(`${check.status.padEnd(8)} ${check.label}: ${check.detail}`);
    console.log(`Runtime truth: control=${report.maturity.controlPlane} codex=${report.maturity.codexRuntime} autonomous=${report.maturity.autonomousDevelopment}`);
    console.log("Human gates retained: diff/commit, push, merge, deploy, production operations, and secret-value access.");
  }
}
