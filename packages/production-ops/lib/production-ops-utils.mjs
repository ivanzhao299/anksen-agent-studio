import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const productionOpsPaths = {
  policy: resolve(packageRoot, "examples/governance-policy.example.json"),
  gates: resolve(packageRoot, "examples/release-gates.example.json")
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
  "credential_value_access"
]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadProductionOps() {
  const [policy, gates] = await Promise.all([
    readJson(productionOpsPaths.policy),
    readJson(productionOpsPaths.gates)
  ]);
  return {
    policy,
    gates,
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

export function validateProductionOps(bundle) {
  const findings = [];
  const gates = bundle.gates.release_gates ?? [];
  const policy = bundle.policy;
  const ids = new Set();

  findings.push(...hasForbiddenSecretFields(policy));
  findings.push(...hasForbiddenSecretFields(bundle.gates));

  if (policy.mode !== "dry_run_only") {
    findings.push({
      severity: "ERROR",
      message: `Production Ops mode must remain dry_run_only, got: ${policy.mode}`
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

  const readiness = evaluateReleaseReadiness(bundle);
  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    policy_id: policy.policy_id,
    gate_count: gates.length,
    blocked_gate_count: readiness.blocked_gate_count,
    review_gate_count: readiness.review_gate_count,
    findings,
    deploy_enabled: false,
    production_operations_enabled: false,
    credential_values_read: false,
    server_connections: "disabled"
  };
}
