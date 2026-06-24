export interface ConsoleV5RoadmapEntry {
  readonly id: string;
  readonly label: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly executionMode: "local_repo_execute" | "proposal_only";
  readonly ownerAgent: string;
}

export const consoleV5BatchEntries: readonly ConsoleV5RoadmapEntry[] = [
  { id: "agent-1-docs", label: "Docs / Manual", risk: "LOW", executionMode: "local_repo_execute", ownerAgent: "agent-1" },
  { id: "agent-2-governance", label: "Governance / Validation", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-2" },
  { id: "agent-3-projects", label: "Project Operations", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-3" },
  { id: "agent-4-console", label: "Console Entrypoints", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-4" },
  { id: "agent-5-production", label: "Runtime / Production Proposal", risk: "HIGH", executionMode: "proposal_only", ownerAgent: "agent-5" }
] as const;

export const consoleV5BatchSafety = {
  batch_id: "batch-plan-3158df1d0b",
  real_worker_execution: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  credential_values: "not_read",
  managed_project_writes: "disabled"
} as const;
