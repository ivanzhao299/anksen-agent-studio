import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { validateGovernedCodexConfig, governedCodexSafety } from "../lib/governed-codex-config.mjs";

const root = new URL("../../..", import.meta.url).pathname.replace(/\/$/, "");
const valid = {
  runKey: "product-readiness-001",
  projectId: "anksen-agent-studio",
  projectRoot: root,
  goal: "Improve product readiness",
  instruction: "Improve the bounded product-readiness files and validate the result.",
  allowedPaths: ["docs/autonomous-development", "packages/orchestrator-core/test/product-readiness.test.mjs"],
  targetPaths: ["docs/autonomous-development", "packages/orchestrator-core/test/product-readiness.test.mjs"],
  blockedPaths: [".env", ".git", "node_modules"],
  acceptanceCommands: ["git diff --check", "pnpm typecheck", "pnpm build"],
};

test("governed Codex config accepts a bounded repository policy", () => {
  const config = validateGovernedCodexConfig(valid);
  assert.equal(config.maxRuntimeSeconds, 1800);
  assert.deepEqual(governedCodexSafety, { maxAttempts: 1, allowCommit: false, allowPush: false, allowMerge: false, allowDeploy: false });
});

test("governed Codex config rejects traversal, secrets, and arbitrary checks", () => {
  assert.throws(() => validateGovernedCodexConfig({ ...valid, allowedPaths: ["../outside"] }), error => error.code === "PATH_POLICY_INVALID");
  assert.throws(() => validateGovernedCodexConfig({ ...valid, allowedPaths: [".env.local"], targetPaths: [".env.local"] }), error => error.code === "PATH_POLICY_INVALID");
  assert.throws(() => validateGovernedCodexConfig({ ...valid, acceptanceCommands: ["sh release.sh"] }), error => error.code === "ACCEPTANCE_COMMAND_DENIED");
});

test("governed runner preserves one-shot activation and fail-closed cleanup", async () => {
  const source = await readFile(new URL("../bin/governed-codex-run.mjs", import.meta.url), "utf8");
  assert.match(source, /maxAttempts: 1/);
  assert.match(source, /failures\.length === 1 && failures\[0\] === "FEATURE_FLAG"/);
  assert.match(source, /process\.env\.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "true"/);
  assert.ok((source.match(/process\.env\.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false"/g) ?? []).length >= 3);
  assert.match(source, /approval\.status === "CONSUMED"/);
  assert.match(source, /attempt_number === 1/);
  assert.match(source, /CHANGED_PATH_DENIED/);
});
