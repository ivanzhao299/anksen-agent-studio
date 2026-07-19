import assert from "node:assert/strict";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { ActivationDenied, ActivationGateService } from "../lib/activation-gate.mjs";

test("Activation Gate accepts Access Center wildcard and a single-file policy", async () => {
  const root = await mkdtemp(join(tmpdir(), "beta-002-policy-"));
  try {
    const gate = new ActivationGateService({});
    const scope = { organizationId: "org", workspaceId: "workspace", projectId: "fixture" };
    const actor = { authenticated: true, workspaceId: "workspace", projectAllowlist: ["*"], capabilities: ["*"] };
    assert.doesNotThrow(() => gate.assertRbac(actor, scope, "runtime.codex.execute"));
    assert.doesNotThrow(() => gate.validatePolicy({ projectRoot: root, allowedPaths: ["docs/codex-first-run.md"], blockedPaths: [".env", "~/.ssh", "~/Library/Keychains"], maxRuntimeSeconds: 600, maxAttempts: 1, allowPush: false, allowMerge: false, allowDeploy: false }));
    assert.throws(() => gate.assertRbac({ ...actor, capabilities: [] }, scope, "runtime.codex.execute"), error => error instanceof ActivationDenied && error.code === "RBAC_DENIED");
  } finally {
    await rm(root, { recursive: true, force: true });
  }
});

test("Beta-002 source keeps all readiness and one-shot safety gates", async () => {
  const [gate, drill, runtime] = await Promise.all([
    readFile(new URL("../lib/activation-gate.mjs", import.meta.url), "utf8"),
    readFile(new URL("../bin/beta-002-controlled-codex.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../runtime-adapters/lib/runtime-core.mjs", import.meta.url), "utf8"),
  ]);
  for (const check of ["PROJECT_ROOT", "ALLOWED_PATHS", "BLOCKED_PATHS", "RUNTIME_TIMEOUT", "WORKER_AUTHORIZATION", "FEATURE_FLAG"]) assert.match(gate, new RegExp(check));
  assert.match(drill, /failedBeforeFlag\.length === 1/);
  assert.match(drill, /process\.env\.AUTONOMOUS_RUNTIME_CODEX_ENABLED = "false"/);
  assert.match(drill, /maxUses: 1/);
  assert.match(drill, /maxAttempts: 1/);
  assert.match(runtime, /execArgs/);
});
