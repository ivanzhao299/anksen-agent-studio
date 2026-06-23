export type ConsoleActionId =
  | "context_summary"
  | "planning_dry_run"
  | "runtime_health"
  | "governance_check"
  | "production_safety_check"
  | "autopilot_dry_run";

export type ConsoleActionScope =
  | "context"
  | "planning"
  | "runtime"
  | "governance"
  | "production_ops"
  | "autopilot";

export interface ConsoleActionDescriptor {
  readonly id: ConsoleActionId;
  readonly label: string;
  readonly scope: ConsoleActionScope;
  readonly command: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH";
  readonly executionMode: "dry_run_only" | "proposal_only";
  readonly requiresApproval: boolean;
  readonly readOnly: true;
  readonly source: string;
  readonly disabledReason?: string;
}

export const consoleActions: readonly ConsoleActionDescriptor[] = [
  {
    id: "context_summary",
    label: "Context Summary",
    scope: "context",
    command: "node packages/orchestrator-core/bin/studio.mjs context summary",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "runtime/global"
  },
  {
    id: "planning_dry_run",
    label: "Planning Dry Run",
    scope: "planning",
    command: "node packages/orchestrator-core/bin/studio.mjs plan --goal \"继续推进 V4\" --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/planning-center"
  },
  {
    id: "runtime_health",
    label: "Runtime Health",
    scope: "runtime",
    command: "node packages/orchestrator-core/bin/studio.mjs runtime health --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/runtime-center"
  },
  {
    id: "governance_check",
    label: "Governance Check",
    scope: "governance",
    command: "node packages/orchestrator-core/bin/studio.mjs governance check --dry-run",
    risk: "LOW",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "packages/governance-center"
  },
  {
    id: "production_safety_check",
    label: "Production Safety Check",
    scope: "production_ops",
    command: "node packages/orchestrator-core/bin/studio.mjs production safety-check --dry-run",
    risk: "HIGH",
    executionMode: "proposal_only",
    requiresApproval: true,
    readOnly: true,
    source: "packages/production-ops",
    disabledReason: "Production operations remain proposal-only from the Console."
  },
  {
    id: "autopilot_dry_run",
    label: "Autopilot Dry Run",
    scope: "autopilot",
    command: "node packages/orchestrator-core/bin/studio.mjs autopilot run --goal \"继续推进 V4\" --dry-run",
    risk: "MEDIUM",
    executionMode: "dry_run_only",
    requiresApproval: false,
    readOnly: true,
    source: "autopilot-runs"
  }
] as const;

export function listConsoleActions() {
  return consoleActions;
}

export function getConsoleAction(id: string) {
  return consoleActions.find((action) => action.id === id) ?? null;
}
