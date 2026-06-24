export type ConsoleActionId =
  | "context-summary"
  | "runtime-health"
  | "project-inspect"
  | "worker-health"
  | "worker-status"
  | "credential-validate"
  | "governance-check"
  | "autopilot-run"
  | "autopilot-execute"
  | "smart-park-continue"
  | "smart-park-blockers"
  | "smart-park-go-live-plan"
  | "smart-park-go-live-plan-dry-run"
  | "pending-proposals"
  | "proposal-review"
  | "proposal-approve-dry-run"
  | "production-operation-request"
  | "proposal-reject-draft"
  | "proposal-approve";

export type ConsoleActionScope =
  | "context"
  | "runtime"
  | "project"
  | "worker"
  | "credential"
  | "governance"
  | "autopilot"
  | "smart_park"
  | "proposal";

export type ConsoleActionRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type ConsoleActionMode = "read_only" | "dry_run" | "direct_execute";
export type ConsoleExecutionMode = "dry_run_only" | "direct_execute" | "proposal_only" | "human_approval_required";
export type ConsoleGovernanceGate = "ALLOW_DRY_RUN" | "ALLOW_DIRECT_EXECUTE" | "PROPOSAL_ONLY" | "HUMAN_APPROVAL_REQUIRED";

export interface ConsoleActionDescriptor {
  readonly id: ConsoleActionId;
  readonly label: string;
  readonly intent: string;
  readonly scope: ConsoleActionScope;
  readonly command: string;
  readonly risk: ConsoleActionRisk;
  readonly mode: ConsoleActionMode;
  readonly executionMode: ConsoleExecutionMode;
  readonly requiresApproval: boolean;
  readonly readOnly: true;
  readonly write_enabled: false;
  readonly production_enabled: false;
  readonly source: string;
  readonly governance_gate: ConsoleGovernanceGate;
  readonly disabledReason?: string;
}

export interface ConsoleActionPlan {
  readonly schema_version: 1;
  readonly plan_id: string;
  readonly action_id: ConsoleActionId;
  readonly label: string;
  readonly intent: string;
  readonly status: "PLANNED_DRY_RUN" | "PLANNED_EXECUTION" | "PROPOSAL_ONLY" | "BLOCKED";
  readonly risk: ConsoleActionRisk;
  readonly execution_mode: ConsoleExecutionMode;
  readonly mode: ConsoleActionMode;
  readonly write_enabled: false;
  readonly production_enabled: false;
  readonly dry_run: boolean;
  readonly command: string;
  readonly requires_approval: boolean;
  readonly governance_gate: ConsoleGovernanceGate;
  readonly steps: readonly string[];
  readonly safety: {
    readonly deploy: "disabled";
    readonly production_operations: "disabled";
    readonly server_access: "disabled";
    readonly credential_values: "not_read";
    readonly managed_project_writes: "disabled";
    readonly model_invocation: "disabled";
  };
  readonly blocked_reasons: readonly string[];
}

export const consoleActionCenter = {
  action_center_id: "pilot-4-console-action-center",
  default_mode: "pilot_production",
  direct_execute_allowed_for: ["LOW", "MEDIUM"],
  high_risk_policy: "proposal_only",
  critical_risk_policy: "human_approval_required",
  write_enabled: false,
  production_enabled: false
} as const;

export const consoleActions: readonly ConsoleActionDescriptor[] = [
  {
    id: "context-summary",
    label: "Context Summary",
    intent: "context summary",
    scope: "context",
    command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    risk: "LOW",
    mode: "read_only",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/global",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "runtime-health",
    label: "Runtime Health",
    intent: "runtime health",
    scope: "runtime",
    command: "node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run",
    risk: "LOW",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "packages/runtime-center",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "project-inspect",
    label: "Project Inspect",
    intent: "project inspect",
    scope: "project",
    command: "node packages/orchestrator-core/bin/studio.mjs project inspect --config examples/jinhu-smart-park/project.config.example.json --dry-run",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "packages/project-connector",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "worker-health",
    label: "Worker Health",
    intent: "worker health",
    scope: "worker",
    command: "node packages/orchestrator-core/bin/studio.mjs worker health --dry-run",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "packages/worker-pool",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "credential-validate",
    label: "Credential Validate",
    intent: "credential validate",
    scope: "credential",
    command: "node packages/orchestrator-core/bin/studio.mjs credential validate --dry-run",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "packages/credential-vault",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "governance-check",
    label: "Governance Check",
    intent: "governance check",
    scope: "governance",
    command: "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
    risk: "LOW",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "packages/governance-center",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "autopilot-run",
    label: "Autopilot Dry Run",
    intent: "autopilot dry-run",
    scope: "autopilot",
    command: "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"继续推进 V5\" --dry-run",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "autopilot-runs",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "smart-park-go-live-plan-dry-run",
    label: "Smart Park Go-Live Plan Dry Run",
    intent: "smart-park go-live plan dry-run",
    scope: "smart_park",
    command: "node packages/orchestrator-core/bin/studio.mjs project chain-validate --project jinhu-smart-park --dry-run",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/projects/jinhu-smart-park",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "proposal-review",
    label: "Proposal Review",
    intent: "proposal review",
    scope: "proposal",
    command: "node packages/orchestrator-core/bin/studio.mjs project proposals --config examples/jinhu-smart-park/project.config.example.json",
    risk: "MEDIUM",
    mode: "read_only",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/projects",
    governance_gate: "ALLOW_DRY_RUN"
  },
  {
    id: "proposal-approve-dry-run",
    label: "Proposal Approve Dry Run",
    intent: "proposal approve dry-run",
    scope: "proposal",
    command: "node packages/orchestrator-core/bin/studio.mjs project proposals --config examples/jinhu-smart-park/project.config.example.json",
    risk: "HIGH",
    mode: "dry_run",
    executionMode: "proposal_only",
    requiresApproval: true,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/projects",
    governance_gate: "PROPOSAL_ONLY",
    disabledReason: "Console can only generate an approval dry-run. Real approval requires a separate explicit proposal id and approved command."
  },
  {
    id: "proposal-reject-draft",
    label: "Proposal Reject Draft",
    intent: "proposal reject draft",
    scope: "proposal",
    command: "node packages/orchestrator-core/bin/studio.mjs project proposals --config examples/jinhu-smart-park/project.config.example.json",
    risk: "MEDIUM",
    mode: "dry_run",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/projects",
    governance_gate: "ALLOW_DRY_RUN",
    disabledReason: "Reject draft is logged as a Console draft only and does not mutate proposal state."
  },
  {
    id: "proposal-approve",
    label: "Proposal Approve",
    intent: "proposal approval",
    scope: "proposal",
    command: "",
    risk: "HIGH",
    mode: "read_only",
    executionMode: "proposal_only",
    requiresApproval: true,
    readOnly: true,
    write_enabled: false,
    production_enabled: false,
    source: "runtime/projects",
    governance_gate: "PROPOSAL_ONLY",
    disabledReason: "Console cannot approve proposals directly. Approval requires explicit proposal id, governance gate, and a separate approved command."
  }
] as const;

export function listConsoleActions() {
  return consoleActions;
}

export function getConsoleAction(id: string) {
  return consoleActions.find((action) => action.id === id) ?? null;
}

function executionModeForRisk(risk: ConsoleActionRisk): ConsoleExecutionMode {
  if (risk === "CRITICAL") return "human_approval_required";
  if (risk === "HIGH") return "proposal_only";
  return "direct_execute";
}

function governanceGateForRisk(risk: ConsoleActionRisk): ConsoleGovernanceGate {
  if (risk === "CRITICAL") return "HUMAN_APPROVAL_REQUIRED";
  if (risk === "HIGH") return "PROPOSAL_ONLY";
  return "ALLOW_DIRECT_EXECUTE";
}

export function buildConsoleActionPlan(id: string): ConsoleActionPlan | null {
  const action = getConsoleAction(id);
  if (!action) return null;
  const executionMode = executionModeForRisk(action.risk);
  const proposalOnly = executionMode === "proposal_only" || executionMode === "human_approval_required";
  const blockedReasons = [
    ...(action.disabledReason ? [action.disabledReason] : []),
    ...(action.risk === "HIGH" ? ["HIGH actions stay proposal-only from the Console."] : []),
    ...(action.risk === "CRITICAL" ? ["CRITICAL actions require explicit human approval and cannot be executed from the Console."] : [])
  ];
  return {
    schema_version: 1,
    plan_id: `console-action-plan-${action.id}`,
    action_id: action.id,
    label: action.label,
    intent: action.intent,
    status: executionMode === "human_approval_required" ? "BLOCKED" : proposalOnly ? "PROPOSAL_ONLY" : "PLANNED_EXECUTION",
    risk: action.risk,
    execution_mode: executionMode,
    mode: proposalOnly ? action.mode : "direct_execute",
    write_enabled: false,
    production_enabled: false,
    dry_run: false,
    command: action.command,
    requires_approval: proposalOnly,
    governance_gate: governanceGateForRisk(action.risk),
    steps: [
      "Read Console action intent metadata.",
      "Apply Governance Gate before command execution.",
      proposalOnly ? "Generate or review a proposal; do not execute the action." : "Execute the local allowlist command from the Console Action Server.",
      "Keep deploy, production operations, managed project writes, model calls, and credential value reads disabled."
    ],
    safety: {
      deploy: "disabled",
      production_operations: "disabled",
      server_access: "disabled",
      credential_values: "not_read",
      managed_project_writes: "disabled",
      model_invocation: "disabled"
    },
    blocked_reasons: blockedReasons
  };
}
