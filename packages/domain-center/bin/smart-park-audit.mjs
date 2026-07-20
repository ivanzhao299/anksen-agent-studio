#!/usr/bin/env node
import { auditSmartPark } from "../lib/smart-park-audit.mjs";

const root = process.argv.slice(2).find((value) => value !== "--") ?? process.env.SMART_PARK_REPO_ROOT;
if (!root) {
  console.error("Usage: pnpm smart-park:audit -- /absolute/path/to/jinhu-smart-park");
  process.exit(2);
}
const report = await auditSmartPark(root);
console.log(JSON.stringify(report, null, 2));
if (!report.allConfiguredEvidenceMatched) process.exitCode = 1;
