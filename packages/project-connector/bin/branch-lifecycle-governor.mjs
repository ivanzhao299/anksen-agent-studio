#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { BranchLifecycleGovernor } from "../lib/branch-lifecycle-governor.mjs";

const args = process.argv.slice(2);
const value = name => { const index = args.indexOf(name); return index >= 0 ? args[index + 1] : null; };
const list = name => String(value(name) ?? "").split(",").map(item => item.trim()).filter(Boolean);
const governor = new BranchLifecycleGovernor();

if (args.includes("apply")) {
  const planPath = value("--plan");
  const confirmFingerprint = value("--confirm-fingerprint");
  if (!planPath || !confirmFingerprint) throw new Error("apply requires --plan and --confirm-fingerprint");
  const plan = JSON.parse(await readFile(planPath, "utf8"));
  process.stdout.write(`${JSON.stringify(governor.apply({ plan, confirmFingerprint }), null, 2)}\n`);
} else {
  const projectRoot = value("--repo");
  const projectId = value("--project-id");
  if (!projectRoot || !projectId) throw new Error("audit requires --repo and --project-id");
  const plan = governor.audit({
    projectId,
    projectRoot,
    remote: value("--remote") ?? "origin",
    defaultBranch: value("--default-branch") ?? "main",
    retentionDays: Number(value("--retention-days") ?? 90),
    protectedBranches: list("--protected-branches"),
    openPrBranches: list("--open-pr-branches"),
  });
  process.stdout.write(`${JSON.stringify(plan, null, 2)}\n`);
}

