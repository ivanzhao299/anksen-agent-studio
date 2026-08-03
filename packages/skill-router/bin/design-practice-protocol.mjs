#!/usr/bin/env node
import { readFile } from "node:fs/promises";
import { resolve } from "node:path";
import { DesignPracticeProtocol } from "../lib/design-practice-protocol.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const inputPath = resolve(repoRoot, process.argv[2] || "packages/skill-router/examples/design-practice-request.example.json");
const request = JSON.parse(await readFile(inputPath, "utf8"));
const plan = await new DesignPracticeProtocol({ repoRoot }).compile(request);
console.log(JSON.stringify(plan, null, 2));
if (plan.plannerReadiness !== "READY_FOR_EXISTING_PLANNER") process.exitCode = 2;
