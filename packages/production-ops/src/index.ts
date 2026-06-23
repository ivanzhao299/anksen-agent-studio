export type ProductionOpsMode = "dry_run_only";

export type OperationCategory =
  | "documentation_only"
  | "local_repo_change"
  | "agent_execution"
  | "managed_project_write"
  | "deploy"
  | "production_operation"
  | "server_access"
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
  readonly server_access: "forbidden";
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

export type ProductionPlanRisk = "HIGH";
export type ProductionPlanExecutionMode = "proposal_only";
export type ProductionRealExecutionApprovalGate = "CRITICAL";
export type ProductionExecutionStatus = "not_executed";

export interface ProductionOpsSafety {
  readonly server_access: "disabled";
  readonly deploy: "disabled";
  readonly production_operations: "disabled";
  readonly credential_values: "not_read";
}

export interface ServerRegistryEntry {
  readonly server_id: string;
  readonly display_name: string;
  readonly environment: string;
  readonly role: string;
  readonly provider?: string;
  readonly region_ref?: string;
  readonly host_ref: string;
  readonly credential_reference_id: string;
  readonly connection_status: "not_connected";
  readonly risk: ProductionPlanRisk;
  readonly execution_mode: ProductionPlanExecutionMode;
  readonly notes?: string;
}

export interface ServerRegistry {
  readonly schema_version: number;
  readonly registry_id: string;
  readonly mode: ProductionOpsMode;
  readonly servers: readonly ServerRegistryEntry[];
  readonly safety: ProductionOpsSafety;
}

export interface ProductionPlanStep {
  readonly step_id: string;
  readonly title: string;
  readonly operation_category: Extract<OperationCategory, "deploy" | "production_operation" | "server_access">;
  readonly execution_status: ProductionExecutionStatus;
  readonly notes?: string;
}

export interface ProductionPlan {
  readonly schema_version: number;
  readonly plan_id: string;
  readonly mode: ProductionOpsMode;
  readonly target_environment: string;
  readonly risk: ProductionPlanRisk;
  readonly execution_mode: ProductionPlanExecutionMode;
  readonly approval_required_for_execution: ProductionRealExecutionApprovalGate;
  readonly steps: readonly ProductionPlanStep[];
  readonly safety: ProductionOpsSafety;
}

export interface DeployPlan extends ProductionPlan {
  readonly preflight_checks: readonly {
    readonly check_id: string;
    readonly title: string;
    readonly status: "planned" | "blocked" | "not_run";
  }[];
  readonly rollback_plan_ref: string;
}

export interface RollbackPlan extends ProductionPlan {
  readonly rollback_strategy: string;
}

export const productionOpsPolicy: ProductionOpsMode = "dry_run_only";

export const forbiddenOperationCategories: readonly OperationCategory[] = [
  "agent_execution",
  "managed_project_write",
  "deploy",
  "production_operation",
  "server_access",
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
