export type RiskLevel = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type AutomationMode =
  | "automatic_execute"
  | "autopilot_execute"
  | "proposal_only"
  | "human_approval_required";

export type GovernanceDecision = "ALLOW" | "PROPOSAL_ONLY" | "HUMAN_APPROVAL_REQUIRED" | "BLOCK";

export type GovernanceCheckStatus = "PASS" | "BLOCKED" | "NEEDS_APPROVAL";

export interface ApprovalRule {
  readonly risk: RiskLevel;
  readonly automation_mode: AutomationMode;
  readonly approval_required: boolean;
  readonly proposal_required: boolean;
  readonly human_approval_required: boolean;
}

export interface RiskRule {
  readonly risk: RiskLevel;
  readonly rank: number;
  readonly automation_mode: AutomationMode;
  readonly summary: string;
}

export interface GovernancePolicy {
  readonly schema_version: number;
  readonly policy_id: string;
  readonly mode: "dry_run_only";
  readonly scope: "local_repository_only";
  readonly enforcement_order: readonly [
    "governance_check",
    "approval_policy",
    "release_gate",
    "execution_decision"
  ];
}

export interface ReleaseGateRule {
  readonly gate_id: string;
  readonly title: string;
  readonly category: string;
  readonly decision: "PASS" | "BLOCK" | "REVIEW";
  readonly expected_block: boolean;
}

export interface GovernanceEvaluation {
  readonly status: GovernanceCheckStatus;
  readonly decision: GovernanceDecision;
  readonly risk: RiskLevel;
  readonly automation_mode: AutomationMode;
  readonly approval_required: boolean;
  readonly proposal_required: boolean;
  readonly human_approval_required: boolean;
  readonly reason: string;
}

export const approvalMatrix: readonly ApprovalRule[] = [
  {
    risk: "LOW",
    automation_mode: "automatic_execute",
    approval_required: false,
    proposal_required: false,
    human_approval_required: false
  },
  {
    risk: "MEDIUM",
    automation_mode: "autopilot_execute",
    approval_required: false,
    proposal_required: false,
    human_approval_required: false
  },
  {
    risk: "HIGH",
    automation_mode: "proposal_only",
    approval_required: false,
    proposal_required: true,
    human_approval_required: false
  },
  {
    risk: "CRITICAL",
    automation_mode: "human_approval_required",
    approval_required: true,
    proposal_required: true,
    human_approval_required: true
  }
];

export function ruleForRisk(risk: RiskLevel): ApprovalRule {
  return approvalMatrix.find((rule) => rule.risk === risk) ?? approvalMatrix[3];
}

export function evaluateGovernanceRisk(risk: RiskLevel): GovernanceEvaluation {
  const rule = ruleForRisk(risk);
  if (rule.human_approval_required) {
    return {
      status: "NEEDS_APPROVAL",
      decision: "HUMAN_APPROVAL_REQUIRED",
      risk,
      automation_mode: rule.automation_mode,
      approval_required: rule.approval_required,
      proposal_required: rule.proposal_required,
      human_approval_required: rule.human_approval_required,
      reason: "CRITICAL risk requires explicit human approval."
    };
  }
  if (rule.proposal_required) {
    return {
      status: "BLOCKED",
      decision: "PROPOSAL_ONLY",
      risk,
      automation_mode: rule.automation_mode,
      approval_required: rule.approval_required,
      proposal_required: rule.proposal_required,
      human_approval_required: rule.human_approval_required,
      reason: "HIGH risk must stop at proposal-only mode."
    };
  }
  return {
    status: "PASS",
    decision: "ALLOW",
    risk,
    automation_mode: rule.automation_mode,
    approval_required: rule.approval_required,
    proposal_required: rule.proposal_required,
    human_approval_required: rule.human_approval_required,
    reason: `${risk} risk is allowed by the approval matrix.`
  };
}
