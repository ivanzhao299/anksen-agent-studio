#!/usr/bin/env node
import { createManagedCapabilityAppCenter } from "../lib/managed-capability-app-center.mjs";

const [command = "status", ...rest] = process.argv.slice(2), options = {};
for (let index = 0; index < rest.length; index += 2) { const key = rest[index]; if (!key?.startsWith("--") || !rest[index + 1]) throw new Error(`Invalid argument: ${key}`); options[key.slice(2)] = rest[index + 1]; }
const required = (name) => { const value = String(options[name] ?? "").trim(); if (!value) throw new Error(`--${name} is required`); return value; };
const center = createManagedCapabilityAppCenter({ repoRoot: process.cwd() });
try {
  const result = command === "status" ? await center.dashboard({ includeProjectState: options.details === "true" })
    : command === "project" ? await center.projectState(required("app"), required("project"))
    : command === "link" ? await center.deepLink(required("app"), options.project ?? null)
    : command === "handoff" ? await center.createHandoff(required("app"), { mode: options.mode, projectId: required("project"), title: options.title, pipelineType: options.pipeline, goal: required("goal") }, { userId: options.user ?? "studio-cli", workspaceId: options.workspace ?? "anksen-agent-studio-local" })
    : (() => { throw new Error(`Unknown command: ${command}`); })();
  process.stdout.write(`${JSON.stringify(result, null, 2)}\n`);
} catch (error) { process.stderr.write(`${JSON.stringify({ status: "FAILED", code: error.code ?? "CAPABILITY_APP_CLI_FAILED", reason: error.message }, null, 2)}\n`); process.exitCode = 1; }
