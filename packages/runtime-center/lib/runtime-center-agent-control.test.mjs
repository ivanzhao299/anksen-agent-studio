import test from "node:test";
import assert from "node:assert/strict";
import { selectRuntime } from "./runtime-center-utils.mjs";

function centerWithControl(agents) {
  const profiles = [
    { runtime_id: "primary", adapter_id: "primary", provider: "provider-a", region: "local", supported_skills: ["code_development"], max_parallel_tasks: 8 },
    { runtime_id: "secondary", adapter_id: "secondary", provider: "provider-b", region: "local", supported_skills: ["code_development"], max_parallel_tasks: 8 }
  ];
  const providers = new Map([
    ["provider-a", { provider_id: "provider-a", health_status: "healthy", auth_modes: ["none"], capabilities: ["code_development"] }],
    ["provider-b", { provider_id: "provider-b", health_status: "healthy", auth_modes: ["none"], capabilities: ["code_development"] }]
  ]);
  const budgets = new Map(profiles.map((profile) => [profile.runtime_id, { budget_status: "within_budget", max_usd_per_task: 10, max_parallel_tasks: 6 }]));
  return {
    profiles: { profiles },
    selection: { rules: [] },
    indexes: {
      providers,
      credentialsByProvider: new Map(),
      adaptersById: new Map(profiles.map((profile) => [profile.adapter_id, { adapter_id: profile.adapter_id }])),
      budgets,
      agentControl: new Map(Object.entries(agents))
    }
  };
}

test("admin-disabled runtime is excluded from selection", () => {
  const result = selectRuntime(centerWithControl({ primary: { enabled: false, priority: 1 } }), { skillType: "code_development" });
  assert.equal(result.selected_runtime, "secondary");
  assert.equal(result.candidates.find((candidate) => candidate.runtime_id === "primary").admin_enabled, false);
});

test("admin priority and parallel limit affect the existing selector", () => {
  const result = selectRuntime(centerWithControl({
    primary: { enabled: true, priority: 80, max_parallel_tasks: 5 },
    secondary: { enabled: true, priority: 1, max_parallel_tasks: 2 }
  }), { skillType: "code_development" });
  assert.equal(result.selected_runtime, "secondary");
  assert.equal(result.candidates.find((candidate) => candidate.runtime_id === "secondary").max_parallel_tasks, 2);
});
