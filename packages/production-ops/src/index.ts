export type ProductionOpsMode = "dry_run_only";

export type OperationCategory =
  | "documentation_only"
  | "local_repo_change"
  | "agent_execution"
  | "managed_project_write"
  | "deploy"
  | "production_operation"
  | "credential_value_access";

export type ApprovalStatus = "not_required" | "required" | "approved" | "rejected";

export type GateDecision = "PASS" | "BLOCK" | "REVIEW";

export type GateEvaluationStatus = "PASS" | "BLOCKED" | "NEEDS_REVIEW";

export interface GovernancePolicy {
  readonly schema_version: number;
  readonly policy_id: string;
  readonly mode: ProductionOpsMode;
  readonly forbidden_operations: readonly OperationCategory[];
  readonly approval_required_for: readonly OperationCategory[];
  readonly audit_required: boolean;
  readonly credential_values: "forbidden";
  readonly deploy_execution: "forbidden";
  readonly production_operations: "forbidden";
  readonly managed_project_writes: "approval_required";
}

export interface ReleaseEvidence {
  readonly evidence_id: string;
  readonly evidence_type: "proposal" | "validation" | "approval" | "audit" | "policy";
  readonly source_path: string;
  readonly status: "present" | "missing" | "not_required";
}

export interface ReleaseGate {
  readonly gate_id: string;
  readonly title: string;
  readonly operation_category: OperationCategory;
  readonly requires_approval: boolean;
  readonly approval_status: ApprovalStatus;
  readonly decision: GateDecision;
  readonly evidence: readonly ReleaseEvidence[];
}

export interface GateEvaluation {
  readonly gate_id: string;
  readonly status: GateEvaluationStatus;
  readonly reasons: readonly string[];
}

export interface ReleaseReadiness {
  readonly status: "PASS" | "BLOCKED" | "NEEDS_REVIEW";
  readonly gate_count: number;
  readonly blocked_gate_count: number;
  readonly review_gate_count: number;
  readonly evaluations: readonly GateEvaluation[];
  readonly deploy_enabled: false;
  readonly production_operations_enabled: false;
  readonly credential_values_read: false;
}

export const productionOpsPolicy: ProductionOpsMode = "dry_run_only";

export const forbiddenOperationCategories: readonly OperationCategory[] = [
  "agent_execution",
  "managed_project_write",
  "deploy",
  "production_operation",
  "credential_value_access"
];

export function evaluateReleaseGate(policy: GovernancePolicy, gate: ReleaseGate): GateEvaluation {
  const reasons: string[] = [];
  if (policy.forbidden_operations.includes(gate.operation_category)) {
    reasons.push(`operation forbidden by policy: ${gate.operation_category}`);
  }
  if (gate.decision === "BLOCK") {
    reasons.push("gate decision is BLOCK");
  }
  if (gate.requires_approval && gate.approval_status !== "approved") {
    reasons.push(`approval not granted: ${gate.approval_status}`);
  }
  if (gate.evidence.some((item) => item.status === "missing")) {
    reasons.push("required evidence is missing");
  }
  if (reasons.length > 0) {
    return {
      gate_id: gate.gate_id,
      status: "BLOCKED",
      reasons
    };
  }
  if (gate.decision === "REVIEW") {
    return {
      gate_id: gate.gate_id,
      status: "NEEDS_REVIEW",
      reasons: ["gate decision requires review"]
    };
  }
  return {
    gate_id: gate.gate_id,
    status: "PASS",
    reasons: []
  };
}

export function evaluateReleaseReadiness(policy: GovernancePolicy, gates: readonly ReleaseGate[]): ReleaseReadiness {
  const evaluations = gates.map((gate) => evaluateReleaseGate(policy, gate));
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
