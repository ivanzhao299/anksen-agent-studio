#!/usr/bin/env node
import { resolve } from "node:path";
import { ProjectLifecycleCapability } from "../lib/project-lifecycle-capability.mjs";

const options = Object.fromEntries(process.argv.slice(2).map((value, index, values) => value.startsWith("--") ? [value.slice(2), values[index + 1]?.startsWith("--") ? true : values[index + 1]] : null).filter(Boolean));
const registryPath = resolve(String(options.registry ?? process.env.STUDIO_PROJECT_REGISTRY ?? "runtime/global/attached-project-workspace.json"));
const report = await new ProjectLifecycleCapability({ registryPath, maxManagedWorktreesPerProject: Number(options["max-worktrees"] ?? process.env.STUDIO_MAX_MANAGED_WORKTREES ?? 3) }).inspect();
process.stdout.write(`${JSON.stringify(report, null, 2)}\n`);
if (report.status !== "READY") process.exitCode = 1;
