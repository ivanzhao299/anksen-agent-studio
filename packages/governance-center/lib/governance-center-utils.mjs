import { readFile } from "node:fs/promises";
import { dirname, resolve } from "node:path";
import { fileURLToPath } from "node:url";

const libDir = dirname(fileURLToPath(import.meta.url));
const packageRoot = resolve(libDir, "..");

export const governanceCenterPaths = {
  governancePolicy: resolve(packageRoot, "examples/governance-policy.example.json"),
  approvalPolicy: resolve(packageRoot, "examples/approval-policy.example.json"),
  releaseGates: resolve(packageRoot, "examples/release-gates.example.json"),
  riskPolicy: resolve(packageRoot, "examples/risk-policy.example.json")
};

const requiredRisks = ["LOW", "MEDIUM", "HIGH", "CRITICAL"];
const forbiddenFieldNames = new Set(["api_key", "secret", "token", "password", "private_key", "ssh_key", "credential_value"]);
const blockedCategories = new Set(["managed_project_write", "deploy", "production_operation", "credential_value_access", "server_access"]);

async function readJson(path) {
  return JSON.parse(await readFile(path, "utf8"));
}

export async function loadGovernanceCenter() {
  const [governancePolicy, approvalPolicy, releaseGates, riskPolicy] = await Promise.all([
    readJson(governanceCenterPaths.governancePolicy),
    readJson(governanceCenterPaths.approvalPolicy),
    readJson(governanceCenterPaths.releaseGates),
    readJson(governanceCenterPaths.riskPolicy)
  ]);
  return {
    governancePolicy,
    approvalPolicy,
    releaseGates,
    riskPolicy,
    paths: governanceCenterPaths
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

function approvalRule(bundle, risk) {
  return (bundle.approvalPolicy.approval_matrix ?? []).find((rule) => rule.risk === risk) ?? null;
}

function riskRule(bundle, risk) {
  return (bundle.riskPolicy.risk_levels ?? []).find((rule) => rule.risk === risk) ?? null;
}

function actionText(action) {
  return [
    action.title,
    action.reason,
    action.target_project,
    action.target_package,
    ...(action.expected_files ?? []),
    ...(action.validation_commands ?? [])
  ].join(" ").toLowerCase();
}

function detectActionCategories(action) {
  const text = actionText(action);
  const categories = new Set(["local_repo_change"]);
  if ((action.expected_files ?? []).every((file) => String(file).startsWith("docs/"))) {
    categories.add("documentation_only");
  }
  if (action.target_project !== "anksen-agent-studio") {
    categories.add("managed_project_write");
  }
  if (/\b(execute deploy|run deploy|deploy execution|deploy:|production deploy)\b/.test(text)) {
    categories.add("deploy");
  }
  if (/\b(production migration|production seed|production reset|production cleanup|production data write|prod:)\b/.test(text)) {
    categories.add("production_operation");
  }
  if (/\b(server access|ssh into|connect server|remote server)\b/.test(text)) {
    categories.add("server_access");
  }
  if (/\b(real api key|private key value|ssh key value|secret value|credential value access)\b/.test(text)) {
    categories.add("credential_value_access");
  }
  return [...categories];
}

export function approvalMatrix(bundle) {
  return (bundle.approvalPolicy.approval_matrix ?? []).map((rule) => ({
    risk: rule.risk,
    automation_mode: rule.automation_mode,
    approval_required: rule.approval_required,
    proposal_required: rule.proposal_required,
    human_approval_required: rule.human_approval_required,
    executor: rule.executor
  }));
}

export function releaseGateSummary(bundle) {
  const gates = bundle.releaseGates.release_gates ?? [];
  const unexpected = gates.filter((gate) => blockedCategories.has(gate.category) && !(gate.expected_block && gate.decision === "BLOCK"));
  return {
    status: unexpected.length === 0 ? "PASS" : "FAIL",
    gate_count: gates.length,
    blocked_gate_count: gates.filter((gate) => gate.decision === "BLOCK").length,
    unexpected_gate_count: unexpected.length,
    deploy_enabled: false,
    production_operations_enabled: false,
    server_access_enabled: false,
    credential_values_read: false,
    gates: gates.map((gate) => ({
      gate_id: gate.gate_id,
      category: gate.category,
      decision: gate.decision,
      expected_block: gate.expected_block,
      status: blockedCategories.has(gate.category) && gate.expected_block && gate.decision === "BLOCK" ? "EXPECTED_BLOCK" : gate.decision
    }))
  };
}

export function validateGovernanceCenter(bundle) {
  const findings = [
    ...hasForbiddenFields(bundle.governancePolicy),
    ...hasForbiddenFields(bundle.approvalPolicy),
    ...hasForbiddenFields(bundle.releaseGates),
    ...hasForbiddenFields(bundle.riskPolicy)
  ];

  if (bundle.governancePolicy.mode !== "dry_run_only") {
    findings.push({
      severity: "ERROR",
      message: `Governance policy mode must remain dry_run_only, got: ${bundle.governancePolicy.mode}`
    });
  }

  if (bundle.governancePolicy.scope !== "local_repository_only") {
    findings.push({
      severity: "ERROR",
      message: `Governance policy scope must remain local_repository_only, got: ${bundle.governancePolicy.scope}`
    });
  }

  for (const risk of requiredRisks) {
    if (!approvalRule(bundle, risk)) {
      findings.push({
        severity: "ERROR",
        message: `Approval matrix is missing risk level: ${risk}`
      });
    }
    if (!riskRule(bundle, risk)) {
      findings.push({
        severity: "ERROR",
        message: `Risk policy is missing risk level: ${risk}`
      });
    }
  }

  const expectedModes = {
    LOW: "automatic_execute",
    MEDIUM: "autopilot_execute",
    HIGH: "proposal_only",
    CRITICAL: "human_approval_required"
  };
  for (const [risk, mode] of Object.entries(expectedModes)) {
    const rule = approvalRule(bundle, risk);
    if (rule && rule.automation_mode !== mode) {
      findings.push({
        severity: "ERROR",
        message: `Approval matrix for ${risk} must use ${mode}, got: ${rule.automation_mode}`
      });
    }
  }

  const releaseGate = releaseGateSummary(bundle);
  if (releaseGate.status !== "PASS") {
    findings.push({
      severity: "ERROR",
      message: "Release gate policy does not block every forbidden category."
    });
  }

  const hardFailures = findings.filter((finding) => ["ERROR", "BLOCKER"].includes(finding.severity));
  return {
    status: hardFailures.length === 0 ? "PASS" : "FAIL",
    policy_id: bundle.governancePolicy.policy_id,
    risk_level_count: requiredRisks.length,
    approval_rule_count: bundle.approvalPolicy.approval_matrix?.length ?? 0,
    release_gate_count: bundle.releaseGates.release_gates?.length ?? 0,
    findings,
    deploy_enabled: false,
    production_operations_enabled: false,
    server_access_enabled: false,
    credential_values_read: false,
    managed_project_writes: "disabled_without_explicit_approval"
  };
}

export function evaluateActionGovernance(bundle, action) {
  const risk = requiredRisks.includes(action.risk) ? action.risk : "CRITICAL";
  const rule = approvalRule(bundle, risk);
  const categories = detectActionCategories(action);
  const blocked = categories.filter((category) => blockedCategories.has(category));
  const releaseGateStatus = blocked.length === 0 ? "PASS" : "BLOCKED";

  if (!rule) {
    return {
      status: "BLOCKED",
      decision: "PROPOSAL_ONLY",
      execution_allowed: false,
      execution_mode: "proposal_only",
      risk,
      categories,
      governance_check: "FAIL",
      approval_policy: "FAIL",
      release_gate: releaseGateStatus,
      reason: `No approval rule exists for risk ${risk}.`
    };
  }

  if (blocked.length > 0) {
    return {
      status: "BLOCKED",
      decision: "PROPOSAL_ONLY",
      execution_allowed: false,
      execution_mode: "proposal_only",
      risk,
      categories,
      governance_check: "PASS",
      approval_policy: "PASS",
      release_gate: "BLOCKED",
      automation_mode: rule.automation_mode,
      approval_required: rule.approval_required,
      proposal_required: true,
      human_approval_required: rule.human_approval_required,
      reason: `Release gate blocked forbidden categories: ${blocked.join(", ")}.`
    };
  }

  if (rule.automation_mode === "human_approval_required") {
    return {
      status: "NEEDS_APPROVAL",
      decision: "HUMAN_APPROVAL_REQUIRED",
      execution_allowed: false,
      execution_mode: "human_approval_required",
      risk,
      categories,
      governance_check: "PASS",
      approval_policy: "PASS",
      release_gate: "PASS",
      automation_mode: rule.automation_mode,
      approval_required: true,
      proposal_required: true,
      human_approval_required: true,
      reason: "CRITICAL risk requires explicit human approval."
    };
  }

  if (rule.automation_mode === "proposal_only") {
    return {
      status: "BLOCKED",
      decision: "PROPOSAL_ONLY",
      execution_allowed: false,
      execution_mode: "proposal_only",
      risk,
      categories,
      governance_check: "PASS",
      approval_policy: "PASS",
      release_gate: "PASS",
      automation_mode: rule.automation_mode,
      approval_required: rule.approval_required,
      proposal_required: true,
      human_approval_required: false,
      reason: "HIGH risk must stop at proposal-only mode."
    };
  }

  return {
    status: "PASS",
    decision: "ALLOW",
    execution_allowed: true,
    execution_mode: "local_repo_execute",
    risk,
    categories,
    governance_check: "PASS",
    approval_policy: "PASS",
    release_gate: "PASS",
    automation_mode: rule.automation_mode,
    approval_required: false,
    proposal_required: false,
    human_approval_required: false,
    reason: `${risk} risk is allowed by governance, approval policy, and release gates.`
  };
}

export function evaluateAdapterMetadata(bundle, adapter) {
  const risk = requiredRisks.includes(adapter.risk_baseline) ? adapter.risk_baseline : "CRITICAL";
  const rule = approvalRule(bundle, risk);
  const categories = new Set(["runtime_adapter"]);
  if (adapter.invoke_mode === "remote-worker" || adapter.invoke_mode === "webhook") categories.add("server_access");
  if (adapter.credential_reference_required) categories.add("credential_reference_required");
  if (adapter.workspace_required) categories.add("workspace_required");
  if (adapter.network_required) categories.add("network_required");

  if (!rule) {
    return {
      adapter_id: adapter.adapter_id,
      status: "BLOCKED",
      risk,
      automation_mode: "proposal_only",
      categories: [...categories],
      reason: `No approval rule exists for adapter risk ${risk}.`
    };
  }

  if (rule.automation_mode === "human_approval_required") {
    return {
      adapter_id: adapter.adapter_id,
      status: "NEEDS_APPROVAL",
      risk,
      automation_mode: rule.automation_mode,
      categories: [...categories],
      reason: "Adapter metadata is CRITICAL risk and requires human approval."
    };
  }

  if (rule.automation_mode === "proposal_only") {
    return {
      adapter_id: adapter.adapter_id,
      status: "PROPOSAL_ONLY",
      risk,
      automation_mode: rule.automation_mode,
      categories: [...categories],
      reason: "Adapter metadata is HIGH risk and must stop at proposal-only mode."
    };
  }

  return {
    adapter_id: adapter.adapter_id,
    status: "PASS",
    risk,
    automation_mode: rule.automation_mode,
    categories: [...categories],
    reason: `Adapter metadata is ${risk} risk and may proceed through ${rule.automation_mode} after dry-run gates.`
  };
}
