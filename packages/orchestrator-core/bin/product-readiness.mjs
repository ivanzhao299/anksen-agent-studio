#!/usr/bin/env node
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";
import { assessProductReadiness } from "../lib/product-readiness.mjs";

const args = process.argv.slice(2).filter((arg) => arg !== "--");
if (args.some((arg) => arg !== "--json")) {
  console.error("Usage: product-readiness [--json]");
  process.exitCode = 2;
} else {
  const root = resolve(dirname(fileURLToPath(import.meta.url)), "../../..");
  const report = await assessProductReadiness({ root });
  if (args.includes("--json")) console.log(JSON.stringify(report, null, 2));
  else {
    console.log(`ANKSEN Studio product readiness: ${report.status} (${report.summary.ready}/${report.summary.total})`);
    for (const check of report.checks) {
      const gaps = check.evidence.filter((item) => item.status !== "PRESENT").length;
      console.log(`${check.status.padEnd(8)} ${check.label}${gaps ? ` (${gaps} evidence gap${gaps === 1 ? "" : "s"})` : ""}`);
    }
    console.log("Real runtime remains disabled unless explicitly approved and activated.");
  }
}
