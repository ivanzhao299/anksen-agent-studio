import { createHash } from "node:crypto";
import { existsSync } from "node:fs";
import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");
const repoRoot = resolve(packageRoot, "../..");

export const modelGatewayPaths = {
  gateway: resolve(packageRoot, "examples/managed-model-gateway.example.json"),
  request: resolve(packageRoot, "examples/model-gateway-request.example.json"),
  audit: resolve(packageRoot, "examples/model-gateway-audit.example.json"),
  adapters: resolve(repoRoot, "packages/runtime-adapters/examples/runtime-adapters.example.json"),
  credentials: resolve(repoRoot, "packages/credential-vault/examples/credential-references.example.json"),
  planEntitlements: resolve(repoRoot, "packages/access-center/examples/plan-entitlements.example.json"),
  accessUsers: resolve(repoRoot, "runtime/global/access-users.json"),
  accessEnforcement: resolve(repoRoot, "runtime/global/access-enforcement.json")
};

const requiredManagedRuntimes = ["deepseek-chat", "qwen-plus"];
const forbiddenFieldNames = new Set(["api_key", "secret", "token", "password", "private_key", "ssh_key", "credential_value"]);
const riskOrder = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];

async function readJson(path, fallback = null) {
  if (!existsSync(path)) return fallback;
  return JSON.parse(await readFile(path, "utf8"));
}

function byId(items, idField) {
  return new Map((items ?? []).map((item) => [item[idField], item]));
}

function stableId(parts) {
  return createHash("sha1").update(parts.join(":")).digest("hex").slice(0, 12);
}

function rankRisk(risk) {
  const index = riskOrder.indexOf(risk);
  return index >= 0 ? index : riskOrder.length - 1;
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

function findUser(bundle, username) {
  const requested = String(username || "owner").trim().toLowerCase();
  return (bundle.accessUsers.users ?? []).find((user) => user.username?.toLowerCase() === requested || user.user_id === requested) ?? null;
}

function findPlan(bundle, user) {
  const planId = user?.default_plan_id ?? "internal_preview";
  return (bundle.planEntitlements.plans ?? []).find((plan) => plan.plan_id === planId) ?? null;
}

function runtimeAllowedByPlan(plan, runtimeId) {
  const allowlist = plan?.runtime_allowlist ?? [];
  return allowlist.includes("*") || allowlist.includes(runtimeId) || allowlist.includes("auto");
}

function planHasRuntimeCapability(plan) {
  const capabilities = plan?.capabilities ?? [];
  return capabilities.includes("*") || capabilities.includes("agent.runtime.readonly") || capabilities.includes("agent.runtime.status");
}

function credentialReference(bundle, credentialReferenceId) {
  if (!credentialReferenceId) return null;
  return bundle.indexes.credentialsById.get(credentialReferenceId) ?? null;
}

function credentialReferenceStatus(bundle, runtime) {
  if (!runtime?.credential_reference_id) return "not_required";
  const credential = credentialReference(bundle, runtime.credential_reference_id);
  if (!credential) return "missing";
  return credential.status === "reference_only" || credential.status === "not_required" ? "reference_only" : credential.status;
}

function resolveGatewayRuntime(bundle, runtimeId) {
  return bundle.indexes.gatewayRuntimesById.get(runtimeId) ?? null;
}

function chooseAutoRuntime(bundle, plan, region = "cn") {
  const preferred = bundle.gateway.policies?.default_runtime_by_region?.[region] ?? bundle.gateway.policies?.default_runtime_by_region?.cn;
  const fallbackOrder = [preferred, ...(bundle.gateway.policies?.fallback_order ?? [])].filter(Boolean);
  for (const runtimeId of fallbackOrder) {
    const runtime = resolveGatewayRuntime(bundle, runtimeId);
    if (runtime && runtimeAllowedByPlan(plan, runtimeId)) return runtime;
  }
  return (bundle.gateway.runtimes ?? []).find((runtime) => runtimeAllowedByPlan(plan, runtime.runtime_id)) ?? null;
}

function executionModeFor(runtime, plan) {
  if (!runtime) return "blocked";
  if (runtime.risk_baseline === "CRITICAL") return "human_approval_required";
  if (runtime.risk_baseline === "HIGH") return "proposal_only";
  if (rankRisk(runtime.risk_baseline) > rankRisk(plan?.direct_execute_max_risk ?? "LOW")) return "proposal_only";
  return "gateway_invoke_plan_allowed";
}

function adapterStatus(bundle, runtime) {
  const adapter = bundle.indexes.adaptersById.get(runtime?.adapter_id ?? "") ?? null;
  if (!adapter) return "missing";
  if (adapter.runtime_id !== runtime.runtime_id) return "runtime_mismatch";
  return "present";
}

export async function loadModelGateway() {
  const [gateway, requestExample, auditExample, adapterRegistry, credentials, planEntitlements, accessUsers, accessEnforcement] = await Promise.all([
    readJson(modelGatewayPaths.gateway),
    readJson(modelGatewayPaths.request),
    readJson(modelGatewayPaths.audit),
    readJson(modelGatewayPaths.adapters, { adapters: [] }),
    readJson(modelGatewayPaths.credentials, { credential_references: [] }),
    readJson(modelGatewayPaths.planEntitlements, { plans: [] }),
    readJson(modelGatewayPaths.accessUsers, { users: [] }),
    readJson(modelGatewayPaths.accessEnforcement, null)
  ]);
  return {
    gateway,
    requestExample,
    auditExample,
    adapterRegistry,
    credentials,
    planEntitlements,
    accessUsers,
    accessEnforcement,
    paths: modelGatewayPaths,
    indexes: {
      gatewayRuntimesById: byId(gateway.runtimes, "runtime_id"),
      adaptersById: byId(adapterRegistry.adapters, "adapter_id"),
      credentialsById: byId(credentials.credential_references, "credential_id")
    }
  };
}

export function validateModelGateway(bundle) {
  const findings = [
    ...hasForbiddenFields(bundle.gateway),
    ...hasForbiddenFields(bundle.requestExample),
    ...hasForbiddenFields(bundle.auditExample)
  ];
  const runtimeIds = new Set((bundle.gateway.runtimes ?? []).map((runtime) => runtime.runtime_id));
  for (const runtimeId of requiredManagedRuntimes) {
    if (!runtimeIds.has(runtimeId)) {
      findings.push({
        severity: "ERROR",
        runtime_id: runtimeId,
        message: `Missing required managed runtime: ${runtimeId}`
      });
    }
  }
  for (const runtime of bundle.gateway.runtimes ?? []) {
    if (runtime.direct_model_call_enabled !== false) {
      findings.push({
        severity: "ERROR",
        runtime_id: runtime.runtime_id,
        message: "direct_model_call_enabled must remain false in MVP."
      });
    }
    if (adapterStatus(bundle, runtime) !== "present") {
      findings.push({
        severity: "ERROR",
        runtime_id: runtime.runtime_id,
        message: `Runtime adapter is not aligned: ${adapterStatus(bundle, runtime)}`
      });
    }
    if (credentialReferenceStatus(bundle, runtime) === "missing") {
      findings.push({
        severity: "ERROR",
        runtime_id: runtime.runtime_id,
        credential_reference_id: runtime.credential_reference_id,
        message: "Credential reference is missing."
      });
    }
  }
  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    runtime_count: (bundle.gateway.runtimes ?? []).length,
    managed_runtime_count: (bundle.gateway.runtimes ?? []).filter((runtime) => runtime.management_mode === "admin_managed_reference").length,
    model_invocation: "disabled",
    credential_values_read: false,
    findings
  };
}

export function gatewayStatus(bundle) {
  const validation = validateModelGateway(bundle);
  return {
    schema_version: 1,
    checked_at: new Date().toISOString(),
    status: validation.status,
    gateway_id: bundle.gateway.gateway_id,
    mode: bundle.gateway.mode,
    default_region: bundle.gateway.default_region,
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    runtimes: (bundle.gateway.runtimes ?? []).map((runtime) => ({
      runtime_id: runtime.runtime_id,
      provider: runtime.provider,
      display_name: runtime.display_name,
      region: runtime.region,
      management_mode: runtime.management_mode,
      available_to_plans: runtime.available_to_plans ?? [],
      credential_reference_status: credentialReferenceStatus(bundle, runtime),
      adapter_status: adapterStatus(bundle, runtime),
      risk_baseline: runtime.risk_baseline,
      direct_model_call_enabled: runtime.direct_model_call_enabled
    })),
    findings: validation.findings
  };
}

export function routeManagedModel(bundle, options = {}) {
  const requestedRuntime = String(options.runtime || "auto").trim() || "auto";
  const projectId = String(options.projectId || options.project || "jinhu-smart-park").trim() || "jinhu-smart-park";
  const user = findUser(bundle, options.user);
  const plan = findPlan(bundle, user);
  const selected = requestedRuntime === "auto"
    ? chooseAutoRuntime(bundle, plan, options.region || bundle.gateway.default_region || "cn")
    : resolveGatewayRuntime(bundle, requestedRuntime);
  const blockedReasons = [];
  if (!user) blockedReasons.push(`Access user not found: ${options.user || "owner"}.`);
  if (!plan) blockedReasons.push("Access plan could not be resolved.");
  if (!planHasRuntimeCapability(plan)) blockedReasons.push("Plan is missing agent runtime capability.");
  if (!selected) blockedReasons.push(`Runtime is not registered in Managed Model Gateway: ${requestedRuntime}.`);
  if (selected && !runtimeAllowedByPlan(plan, selected.runtime_id)) blockedReasons.push(`Runtime is not allowed by plan ${plan?.plan_id ?? "unknown"}: ${selected.runtime_id}.`);
  if (selected && !(selected.available_to_plans ?? []).includes(plan?.plan_id) && !(selected.available_to_plans ?? []).includes("enterprise")) {
    blockedReasons.push(`Runtime does not list plan availability for ${plan?.plan_id ?? "unknown"}.`);
  }
  if (selected && credentialReferenceStatus(bundle, selected) === "missing") blockedReasons.push(`Credential reference is missing: ${selected.credential_reference_id}.`);
  if (selected && adapterStatus(bundle, selected) !== "present") blockedReasons.push(`Adapter is not present for runtime: ${selected.adapter_id}.`);

  const risk = selected?.risk_baseline ?? "CRITICAL";
  const plannedExecutionMode = blockedReasons.length > 0 ? "blocked" : executionModeFor(selected, plan);
  const routeId = `model-route-${stableId([requestedRuntime, selected?.runtime_id ?? "none", projectId, options.user ?? "owner", new Date().toISOString()])}`;
  return {
    schema_version: 1,
    route_id: routeId,
    created_at: new Date().toISOString(),
    requested_runtime: requestedRuntime,
    selected_runtime: selected?.runtime_id ?? null,
    selected_provider: selected?.provider ?? null,
    project_id: projectId,
    user: user ? {
      user_id: user.user_id,
      username: user.username,
      display_name: user.display_name,
      default_plan_id: user.default_plan_id
    } : null,
    plan: plan ? {
      plan_id: plan.plan_id,
      display_name: plan.display_name,
      direct_execute_max_risk: plan.direct_execute_max_risk,
      worker_parallel_limit: plan.worker_parallel_limit,
      runtime_allowlist: plan.runtime_allowlist
    } : null,
    region: selected?.region ?? options.region ?? bundle.gateway.default_region,
    risk,
    execution_mode: plannedExecutionMode,
    credential_reference_id: selected?.credential_reference_id ?? null,
    credential_reference_status: selected ? credentialReferenceStatus(bundle, selected) : "missing",
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    queue_injection_policy: "requires_approved_proposal_audit_trace",
    blocked_reasons: blockedReasons
  };
}

export function buildModelGatewayInvokePlan(bundle, options = {}) {
  const route = routeManagedModel(bundle, options);
  const invocationId = `model-gateway-plan-${stableId([route.route_id, options.goal ?? "", new Date().toISOString()])}`;
  const selected = route.selected_runtime ? resolveGatewayRuntime(bundle, route.selected_runtime) : null;
  const isBlocked = route.execution_mode === "blocked" || !selected;
  return {
    schema_version: 1,
    invocation_id: invocationId,
    created_at: new Date().toISOString(),
    route_id: route.route_id,
    requested_runtime: route.requested_runtime,
    runtime_id: route.selected_runtime,
    provider: route.selected_provider,
    project_id: route.project_id,
    user: route.user,
    skill_type: options.skillType ?? "code_development",
    goal_summary: String(options.goal ?? "").slice(0, 240),
    dry_run: true,
    execution_status: isBlocked ? "blocked" : "planned",
    execution_mode: route.execution_mode,
    governance_risk: route.risk,
    credential_reference_id: route.credential_reference_id,
    credential_reference_status: route.credential_reference_status,
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    audit_trace_required: true,
    proposal_review_bridge: {
      enabled: true,
      high_or_critical_to_proposal: true,
      approved_proposal_required_for_queue_injection: true
    },
    steps: isBlocked ? [
      "Stop before execution because the managed model route is blocked.",
      "Return blocked reasons for Console and proposal review."
    ] : [
      `Resolve managed runtime ${route.selected_runtime} through Managed Model Gateway.`,
      `Confirm plan ${route.plan?.plan_id ?? "unknown"} allows runtime selection.`,
      "Confirm Credential Vault reference presence only; do not read env, keychain, vault, or API key value.",
      "Generate a dispatch plan record for Proposal Review or LOW/MEDIUM queue entry.",
      "Write audit trace before any future queue injection.",
      "Return invoke plan without calling DeepSeek, Qwen, OpenAI, Claude, Gemini, Aider, or any external model."
    ],
    blocked_reasons: route.blocked_reasons,
    route
  };
}

export function gatewayAuditSummary(bundle) {
  const validation = validateModelGateway(bundle);
  return {
    schema_version: 1,
    audit_id: `model-gateway-audit-${stableId([new Date().toISOString(), bundle.gateway.gateway_id])}`,
    created_at: new Date().toISOString(),
    gateway_id: bundle.gateway.gateway_id,
    status: validation.status,
    event_count: (bundle.auditExample.events ?? []).length,
    model_invocation: "disabled",
    credential_values_read: false,
    external_calls: "disabled",
    queue_injection_requires_approved_proposal: Boolean(bundle.gateway.policies?.queue_injection_requires_approved_proposal),
    events: bundle.auditExample.events ?? [],
    findings: validation.findings
  };
}
