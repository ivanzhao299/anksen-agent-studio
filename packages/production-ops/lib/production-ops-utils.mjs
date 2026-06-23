import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const productionOpsPaths = {
  policy: resolve(packageRoot, "examples/governance-policy.example.json"),
  gates: resolve(packageRoot, "examples/release-gates.example.json"),
  serverRegistry: resolve(packageRoot, "examples/server-registry.example.json"),
  environmentProvisioningPlan: resolve(packageRoot, "examples/environment-provisioning-plan.example.json"),
  deployPlan: resolve(packageRoot, "examples/deploy-plan.example.json"),
  backupPlan: resolve(packageRoot, "examples/backup-plan.example.json"),
  rollbackPlan: resolve(packageRoot, "examples/rollback-plan.example.json"),
  securityHardeningPlan: resolve(packageRoot, "examples/security-hardening-plan.example.json"),
  monitoringCheck: resolve(packageRoot, "examples/monitoring-check.example.json")
};

const forbiddenSecretFieldNames = new Set([
  "api_key",
  "secret",
  "token",
  "password",
  "private_key",
  "ssh_key",
  "credential_value"
]);

const blockedOperationCategories = new Set([
  "agent_execution",
  "managed_project_write",
  "deploy",
  "production_operation",
  "server_access",
  "credential_value_access"
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadProductionOps() {
  const [
    policy,
    gates,
    serverRegistry,
    environmentProvisioningPlan,
    deployPlan,
    backupPlan,
    rollbackPlan,
    securityHardeningPlan,
    monitoringCheck
  ] = await Promise.all([
    readJson(productionOpsPaths.policy),
    readJson(productionOpsPaths.gates),
    readJson(productionOpsPaths.serverRegistry),
    readJson(productionOpsPaths.environmentProvisioningPlan),
    readJson(productionOpsPaths.deployPlan),
    readJson(productionOpsPaths.backupPlan),
    readJson(productionOpsPaths.rollbackPlan),
    readJson(productionOpsPaths.securityHardeningPlan),
    readJson(productionOpsPaths.monitoringCheck)
  ]);
  return {
    policy,
    gates,
    serverRegistry,
    environmentProvisioningPlan,
    deployPlan,
    backupPlan,
    rollbackPlan,
    securityHardeningPlan,
    monitoringCheck,
    paths: productionOpsPaths
  };
}

function hasForbiddenSecretFields(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const findings = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (forbiddenSecretFieldNames.has(key)) {
      findings.push({
        severity: "BLOCKER",
        path: childPath.join("."),
        message: `Forbidden credential value field present: ${key}`
      });
    }
    findings.push(...hasForbiddenSecretFields(child, childPath));
  }
  return findings;
}

function evaluateGate(policy, gate) {
  const reasons = [];
  const forbiddenByPolicy = new Set(policy.forbidden_operations ?? []);
  if (forbiddenByPolicy.has(gate.operation_category)) {
    reasons.push(`operation forbidden by policy: ${gate.operation_category}`);
  }
  if (gate.decision === "BLOCK") reasons.push("gate decision is BLOCK");
  if (gate.requires_approval && gate.approval_status !== "approved") {
    reasons.push(`approval not granted: ${gate.approval_status}`);
  }
  if ((gate.evidence ?? []).some((item) => item.status === "missing")) {
    reasons.push("required evidence is missing");
  }
  if (reasons.length > 0) {
    return {
      gate_id: gate.gate_id,
      operation_category: gate.operation_category,
      status: "BLOCKED",
      reasons
    };
  }
  if (gate.decision === "REVIEW") {
    return {
      gate_id: gate.gate_id,
      operation_category: gate.operation_category,
      status: "NEEDS_REVIEW",
      reasons: ["gate decision requires review"]
    };
  }
  return {
    gate_id: gate.gate_id,
    operation_category: gate.operation_category,
    status: "PASS",
    reasons: []
  };
}

export function evaluateReleaseReadiness(bundle) {
  const gates = bundle.gates.release_gates ?? [];
  const evaluations = gates.map((gate) => evaluateGate(bundle.policy, gate));
  const blocked = evaluations.filter((gate) => gate.status === "BLOCKED");
  const review = evaluations.filter((gate) => gate.status === "NEEDS_REVIEW");
  return {
    status: blocked.length > 0 ? "BLOCKED" : review.length > 0 ? "NEEDS_REVIEW" : "PASS",
    gate_count: gates.length,
    blocked_gate_count: blocked.length,
    review_gate_count: review.length,
    evaluations,
    deploy_enabled: false,
    production_operations_enabled: false,
    credential_values_read: false
  };
}

export function policySummary(bundle) {
  return {
    policy_id: bundle.policy.policy_id,
    mode: bundle.policy.mode,
    audit_required: bundle.policy.audit_required,
    forbidden_operations: bundle.policy.forbidden_operations ?? [],
    approval_required_for: bundle.policy.approval_required_for ?? [],
    deploy_execution: bundle.policy.deploy_execution,
    production_operations: bundle.policy.production_operations,
    server_access: bundle.policy.server_access,
    credential_values: bundle.policy.credential_values,
    managed_project_writes: bundle.policy.managed_project_writes
  };
}

export function gateInventory(bundle) {
  const readiness = evaluateReleaseReadiness(bundle);
  const evaluationById = new Map(readiness.evaluations.map((gate) => [gate.gate_id, gate]));
  return (bundle.gates.release_gates ?? []).map((gate) => {
    const evaluation = evaluationById.get(gate.gate_id);
    return {
      gate_id: gate.gate_id,
      title: gate.title,
      operation_category: gate.operation_category,
      approval_status: gate.approval_status,
      decision: gate.decision,
      evaluation_status: evaluation?.status ?? "UNKNOWN",
      reasons: evaluation?.reasons ?? []
    };
  });
}

function planDocuments(bundle) {
  return [
    ["environment_provisioning", bundle.environmentProvisioningPlan],
    ["deploy", bundle.deployPlan],
    ["backup", bundle.backupPlan],
    ["rollback", bundle.rollbackPlan],
    ["security_hardening", bundle.securityHardeningPlan],
    ["monitoring", bundle.monitoringCheck]
  ];
}

function collectExecutionStatuses(value, path = []) {
  if (!value || typeof value !== "object") return [];
  const statuses = [];
  for (const [key, child] of Object.entries(value)) {
    const childPath = [...path, key];
    if (key === "execution_status") {
      statuses.push({
        path: childPath.join("."),
        value: child
      });
    }
    statuses.push(...collectExecutionStatuses(child, childPath));
  }
  return statuses;
}

function validateSafetyBlock(value, label) {
  const findings = [];
  const safety = value?.safety ?? {};
  const expected = {
    server_access: "disabled",
    deploy: "disabled",
    production_operations: "disabled",
    credential_values: "not_read"
  };
  for (const [key, expectedValue] of Object.entries(expected)) {
    if (safety[key] !== expectedValue) {
      findings.push({
        severity: "ERROR",
        document: label,
        message: `Safety field ${key} must be ${expectedValue}, got: ${safety[key]}`
      });
    }
  }
  return findings;
}

function validatePlanDocument(label, plan) {
  const findings = [];
  if (plan.mode !== "dry_run_only") {
    findings.push({
      severity: "ERROR",
      document: label,
      message: `Plan mode must be dry_run_only, got: ${plan.mode}`
    });
  }
  if (plan.risk !== "HIGH") {
    findings.push({
      severity: "ERROR",
      document: label,
      message: `Production plan risk must be HIGH, got: ${plan.risk}`
    });
  }
  if (plan.execution_mode !== "proposal_only") {
    findings.push({
      severity: "ERROR",
      document: label,
      message: `Production plan execution_mode must be proposal_only, got: ${plan.execution_mode}`
    });
  }
  if (plan.approval_required_for_execution !== "CRITICAL") {
    findings.push({
      severity: "ERROR",
      document: label,
      message: "Real execution must require CRITICAL approval gate."
    });
  }
  for (const status of collectExecutionStatuses(plan)) {
    if (status.value !== "not_executed") {
      findings.push({
        severity: "ERROR",
        document: label,
        path: status.path,
        message: `Execution status must be not_executed, got: ${status.value}`
      });
    }
  }
  findings.push(...validateSafetyBlock(plan, label));
  return findings;
}

function validateServerRegistry(registry) {
  const findings = [];
  if (registry.mode !== "dry_run_only") {
    findings.push({
      severity: "ERROR",
      document: "server_registry",
      message: `Server registry mode must be dry_run_only, got: ${registry.mode}`
    });
  }
  for (const server of registry.servers ?? []) {
    if (server.connection_status !== "not_connected") {
      findings.push({
        severity: "ERROR",
        server_id: server.server_id,
        message: "Server registry entries must remain not_connected."
      });
    }
    if (server.risk !== "HIGH" || server.execution_mode !== "proposal_only") {
      findings.push({
        severity: "ERROR",
        server_id: server.server_id,
        message: "Server registry entries must be HIGH risk and proposal_only."
      });
    }
  }
  findings.push(...validateSafetyBlock(registry, "server_registry"));
  return findings;
}

export function serverInventory(bundle) {
  return (bundle.serverRegistry.servers ?? []).map((server) => ({
    server_id: server.server_id,
    display_name: server.display_name,
    environment: server.environment,
    role: server.role,
    provider: server.provider ?? "unknown",
    region_ref: server.region_ref ?? "unknown",
    host_ref: server.host_ref,
    credential_reference_id: server.credential_reference_id,
    connection_status: server.connection_status,
    risk: server.risk,
    execution_mode: server.execution_mode
  }));
}

export function deployPlanSummary(bundle) {
  const plan = bundle.deployPlan;
  return {
    plan_id: plan.plan_id,
    mode: plan.mode,
    target_environment: plan.target_environment,
    risk: plan.risk,
    execution_mode: plan.execution_mode,
    approval_required_for_execution: plan.approval_required_for_execution,
    preflight_count: plan.preflight_checks?.length ?? 0,
    step_count: plan.steps?.length ?? 0,
    rollback_plan_ref: plan.rollback_plan_ref,
    deploy_execution: "disabled",
    server_access: plan.safety?.server_access ?? "disabled",
    production_operations: plan.safety?.production_operations ?? "disabled",
    credential_values_read: false,
    steps: plan.steps ?? []
  };
}

export function rollbackPlanSummary(bundle) {
  const plan = bundle.rollbackPlan;
  return {
    plan_id: plan.plan_id,
    mode: plan.mode,
    target_environment: plan.target_environment,
    risk: plan.risk,
    execution_mode: plan.execution_mode,
    approval_required_for_execution: plan.approval_required_for_execution,
    rollback_strategy: plan.rollback_strategy,
    step_count: plan.steps?.length ?? 0,
    deploy_execution: "disabled",
    server_access: plan.safety?.server_access ?? "disabled",
    production_operations: plan.safety?.production_operations ?? "disabled",
    credential_values_read: false,
    steps: plan.steps ?? []
  };
}

export function productionCenterInventory(bundle) {
  const plans = planDocuments(bundle).map(([kind, plan]) => ({
    kind,
    plan_id: plan.plan_id ?? plan.check_bundle_id,
    target_environment: plan.target_environment ?? plan.environment,
    risk: plan.risk,
    execution_mode: plan.execution_mode,
    approval_required_for_execution: plan.approval_required_for_execution
  }));
  return {
    server_count: bundle.serverRegistry.servers?.length ?? 0,
    plan_count: plans.length,
    plans,
    safety: {
      server_access: "disabled",
      deploy: "disabled",
      production_operations: "disabled",
      credential_values: "not_read",
      real_execution_approval_gate: "CRITICAL"
    }
  };
}

export function validateProductionOps(bundle) {
  const findings = [];
  const gates = bundle.gates.release_gates ?? [];
  const policy = bundle.policy;
  const ids = new Set();

  findings.push(...hasForbiddenSecretFields(policy));
  findings.push(...hasForbiddenSecretFields(bundle.gates));
  findings.push(...hasForbiddenSecretFields(bundle.serverRegistry));
  for (const [, plan] of planDocuments(bundle)) {
    findings.push(...hasForbiddenSecretFields(plan));
  }

  if (policy.mode !== "dry_run_only") {
    findings.push({
      severity: "ERROR",
      message: `Production Ops mode must remain dry_run_only, got: ${policy.mode}`
    });
  }

  if (policy.server_access !== "forbidden") {
    findings.push({
      severity: "ERROR",
      message: `Server access must remain forbidden, got: ${policy.server_access}`
    });
  }

  for (const category of blockedOperationCategories) {
    if (!(policy.forbidden_operations ?? []).includes(category)) {
      findings.push({
        severity: "ERROR",
        message: `Policy must forbid operation category: ${category}`
      });
    }
  }

  for (const gate of gates) {
    if (ids.has(gate.gate_id)) {
      findings.push({
        severity: "ERROR",
        gate_id: gate.gate_id,
        message: "Duplicate gate_id"
      });
    }
    ids.add(gate.gate_id);

    const evaluation = evaluateGate(policy, gate);
    if (blockedOperationCategories.has(gate.operation_category) && evaluation.status !== "BLOCKED") {
      findings.push({
        severity: "ERROR",
        gate_id: gate.gate_id,
        message: `Forbidden operation category is not blocked: ${gate.operation_category}`
      });
    }
  }

  findings.push(...validateServerRegistry(bundle.serverRegistry));
  for (const [label, plan] of planDocuments(bundle)) {
    findings.push(...validatePlanDocument(label, plan));
  }

  const readiness = evaluateReleaseReadiness(bundle);
  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    policy_id: policy.policy_id,
    registry_id: bundle.serverRegistry.registry_id,
    gate_count: gates.length,
    server_count: bundle.serverRegistry.servers?.length ?? 0,
    plan_count: planDocuments(bundle).length,
    blocked_gate_count: readiness.blocked_gate_count,
    review_gate_count: readiness.review_gate_count,
    findings,
    deploy_enabled: false,
    production_operations_enabled: false,
    credential_values_read: false,
    server_connections: "disabled",
    real_execution_approval_gate: "CRITICAL"
  };
}
