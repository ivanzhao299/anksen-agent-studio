import assert from "node:assert/strict";
import { mkdtemp, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { createManagedCapabilityAppCenter, validateManagedCapabilityAppRegistry } from "../lib/managed-capability-app-center.mjs";

const app = { app_id: "openmontage", name: "OpenMontage", category: "video", license: "AGPL-3.0", capabilities: ["video-composition"], installation: { root_env: "TEST_APP_ROOT", local_path_candidates: [], manifest: "integration.manifest.json", bridge_entry: "bridge.py", python: "python" }, native_ui: { origin: "http://127.0.0.1:4750", project_path_template: "/p/{project_id}" }, boundary: { integration_mode: "INDEPENDENT_MANAGED_APP", studio_orchestration: "HANDOFF_ONLY", progress: "READ_ONLY_PROJECTION", artifacts: "READ_ONLY_DISCOVERY" }, deployment: { commit: "3cfb65c7270a334acd05fc56dc4c99552c7b8f87" } };

test("registry rejects embedded orchestration and unpinned deployments", () => {
  assert.throws(() => validateManagedCapabilityAppRegistry({ schema_version: 1, apps: [{ ...app, boundary: { ...app.boundary, studio_orchestration: "EMBEDDED" } }] }), /hand off/);
  assert.throws(() => validateManagedCapabilityAppRegistry({ schema_version: 1, apps: [{ ...app, deployment: { commit: "main" } }] }), /full SHA/);
});

test("dashboard projects external state without a Studio runtime", async () => {
  const root = await mkdtemp(join(tmpdir(), "capability-app-"));
  await writeFile(join(root, "integration.manifest.json"), "{}\n");
  const center = createManagedCapabilityAppCenter({ repoRoot: root, env: { TEST_APP_ROOT: root }, registry: { schema_version: 1, registry_id: "test", apps: [app] }, bridgeInvoker: async ({ operation }) => operation === "health" ? { ok: true, status: "READY" } : operation === "projects" ? { ok: true, projects: [{ project_id: "demo" }] } : { ok: true, state: { media: { renders: [] } }, handoff: { handoff_id: "handoff-1" }, render_job: { status: "RUNNING" } } });
  const dashboard = await center.dashboard({ includeProjectState: true });
  assert.equal(dashboard.architecture, "FEDERATED_INDEPENDENT_APPS");
  assert.equal(dashboard.apps[0].project_states.demo.studio_handoff.handoff_id, "handoff-1");
  assert.equal(dashboard.apps[0].project_states.demo.render_job.status, "RUNNING");
});

test("artifact access rejects traversal before reading external files", async () => {
  const center = createManagedCapabilityAppCenter({ registry: { schema_version: 1, registry_id: "test", apps: [app] }, env: {} });
  await assert.rejects(() => center.artifact("openmontage", "demo", "../../secret"), /unavailable|Invalid/);
});
