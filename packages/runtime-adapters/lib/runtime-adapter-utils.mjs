import { createHash } from "node:crypto";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const runtimeAdapterPaths = {
  adapters: resolve(packageRoot, "examples/runtime-adapters.example.json"),
  invocation: resolve(packageRoot, "examples/adapter-invocation.example.json"),
  result: resolve(packageRoot, "examples/adapter-result.example.json")
};

const requiredAdapters = ["codex-cli", "claude-code", "gemini-cli", "openhands", "aider", "local-agent"];
const requiredGuardrails = [
  "dry_run_invocation_plan_only",
  "no_model_invocation",
  "no_secret_value_read",
  "no_deploy",
  "no_production_operation",
  "no_managed_project_write"
];
const forbiddenFieldNames = new Set(["api_key", "secret", "token", "password", "private_key", "ssh_key", "credential_value"]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

function byId(items, idField) {
  return new Map((items ?? []).map((item) => [item[idField], item]));
}

export async function loadRuntimeAdapters() {
  const [registry, invocationExample, resultExample] = await Promise.all([
    readJson(runtimeAdapterPaths.adapters),
    readJson(runtimeAdapterPaths.invocation),
    readJson(runtimeAdapterPaths.result)
  ]);
  return {
    registry,
    invocationExample,
    resultExample,
    paths: runtimeAdapterPaths,
    indexes: {
      adaptersById: byId(registry.adapters, "adapter_id"),
      adaptersByRuntime: byId(registry.adapters, "runtime_id")
    }
  };
}

function hasForbiddenFields(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (forbiddenFieldNames.has(key)) {
      findings.push({
        severity: "BLOCKER",
        path: childPath.join("."),
        message: `Forbidden credential value field present: ${key}`
      });
    }
    findings.push(...hasForbiddenFields(child, childPath));
  }
  return findings;
}

export function credentialReferenceStatus(adapter) {
  if (!adapter.credential_reference_required) return "not_required";
  return adapter.credential_reference_id ? "reference_only" : "missing";
}

export function adapterInventory(bundle) {
  return (bundle.registry.adapters ?? []).map((adapter) => ({
    adapter_id: adapter.adapter_id,
    runtime_id: adapter.runtime_id,
    provider: adapter.provider,
    invoke_mode: adapter.invoke_mode,
    supported_skills: adapter.supported_skills ?? [],
    credential_reference_required: adapter.credential_reference_required,
    credential_reference_status: credentialReferenceStatus(adapter),
    network_required: adapter.network_required,
    workspace_required: adapter.workspace_required,
    max_parallel_tasks: adapter.max_parallel_tasks,
    health_status: adapter.health_status,
    risk_baseline: adapter.risk_baseline,
    guardrail_count: (adapter.guardrails ?? []).length
  }));
}

export function adapterHealth(bundle) {
  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    dry_run: true,
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    results: adapterInventory(bundle).map((adapter) => ({
      adapter_id: adapter.adapter_id,
      runtime_id: adapter.runtime_id,
      provider: adapter.provider,
      status: adapter.health_status,
      invoke_mode: adapter.invoke_mode,
      credential_reference_status: adapter.credential_reference_status,
      network_required: adapter.network_required,
      workspace_required: adapter.workspace_required,
      max_parallel_tasks: adapter.max_parallel_tasks,
      risk_baseline: adapter.risk_baseline,
      notes: "Dry-run adapter health only. No runtime, model, CLI, browser, webhook, remote worker, credential value, server, deploy, or production operation was executed."
    }))
  };
}

function stableId(parts) {
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 10);
}

function resolveAdapter(bundle, runtime) {
  return bundle.indexes.adaptersById.get(runtime) ?? bundle.indexes.adaptersByRuntime.get(runtime) ?? null;
}

function blockedReasons(adapter, skillType) {
  const reasons = [];
  if (!adapter) {
    reasons.push("Runtime adapter is not registered.");
    return reasons;
  }
  if (!(adapter.supported_skills ?? []).includes(skillType)) {
    reasons.push(`Adapter does not support skill: ${skillType}`);
  }
  if (credentialReferenceStatus(adapter) === "missing") {
    reasons.push("Credential reference is required but missing.");
  }
  for (const guardrail of requiredGuardrails) {
    if (!(adapter.guardrails ?? []).includes(guardrail)) {
      reasons.push(`Missing guardrail: ${guardrail}`);
    }
  }
  return reasons;
}

export function buildInvokePlan(bundle, options) {
  const runtime = options.runtime;
  const skillType = options.skillType;
  const adapter = resolveAdapter(bundle, runtime);
  const reasons = blockedReasons(adapter, skillType);
  const invocationId = `adapter-plan-${stableId([runtime, skillType, new Date().toISOString()])}`;
  if (!adapter) {
    return {
      schema_version: 1,
      invocation_id: invocationId,
      created_at: new Date().toISOString(),
      adapter_id: runtime,
      runtime_id: runtime,
      skill_type: skillType,
      dry_run: true,
      execution_status: "blocked",
      model_invocation: "disabled",
      credential_values_read: false,
      external_calls: "disabled",
      credential_reference_status: "missing",
      governance_risk: "CRITICAL",
      steps: ["Stop because the requested runtime adapter is not registered."],
      blocked_reasons: reasons
    };
  }
  return {
    schema_version: 1,
    invocation_id: invocationId,
    created_at: new Date().toISOString(),
    adapter_id: adapter.adapter_id,
    runtime_id: adapter.runtime_id,
    skill_type: skillType,
    dry_run: true,
    execution_status: reasons.length === 0 ? "planned" : "blocked",
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    credential_reference_status: credentialReferenceStatus(adapter),
    governance_risk: adapter.risk_baseline,
    steps: [
      `Resolve adapter ${adapter.adapter_id} from Runtime Adapter Marketplace.`,
      `Confirm invoke mode ${adapter.invoke_mode} is represented as metadata only.`,
      `Confirm skill ${skillType} ${adapter.supported_skills.includes(skillType) ? "is supported" : "is not supported"}.`,
      "Confirm Credential Vault reference presence only; do not read a secret value.",
      "Run Governance Center metadata check before any future execution path.",
      "Return dry-run invocation plan without invoking a model, CLI, browser, webhook, or remote worker."
    ],
    blocked_reasons: reasons
  };
}

export function validateRuntimeAdapters(bundle) {
  const findings = [...hasForbiddenFields(bundle.registry)];
  const adapters = bundle.registry.adapters ?? [];
  const adapterIds = new Set(adapters.map((adapter) => adapter.adapter_id));
  const seen = new Set();

  for (const required of requiredAdapters) {
    if (!adapterIds.has(required)) {
      findings.push({
        severity: "ERROR",
        message: `Missing required runtime adapter: ${required}`
      });
    }
  }

  for (const adapter of adapters) {
    if (seen.has(adapter.adapter_id)) {
      findings.push({
        severity: "ERROR",
        adapter_id: adapter.adapter_id,
        message: "Duplicate adapter_id"
      });
    }
    seen.add(adapter.adapter_id);

    for (const guardrail of requiredGuardrails) {
      if (!(adapter.guardrails ?? []).includes(guardrail)) {
        findings.push({
          severity: "ERROR",
          adapter_id: adapter.adapter_id,
          message: `Missing guardrail: ${guardrail}`
        });
      }
    }

    if (adapter.credential_reference_required && !adapter.credential_reference_id) {
      findings.push({
        severity: "ERROR",
        adapter_id: adapter.adapter_id,
        message: "credential_reference_required is true but credential_reference_id is missing"
      });
    }
  }

  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    adapter_count: adapters.length,
    required_adapter_count: requiredAdapters.length,
    findings,
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled"
  };
}
