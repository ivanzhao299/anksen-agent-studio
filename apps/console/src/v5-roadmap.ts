export interface ConsoleV5RoadmapEntry {
  readonly id: string;
  readonly label: string;
  readonly risk: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
  readonly executionMode: "local_repo_execute" | "proposal_only";
  readonly ownerAgent: string;
}

export interface ConsoleV5StageCompletion {
  readonly id: "V5-A" | "V5-B" | "V5-C" | "V5-D" | "V5-E" | "V5-F";
  readonly title: string;
  readonly risk: "MEDIUM" | "HIGH" | "CRITICAL";
  readonly executionMode: "local_repo_execute" | "proposal_only";
  readonly expectedFiles: readonly string[];
  readonly presentFiles: readonly string[];
  readonly missingFiles: readonly string[];
  readonly proposalOnly: boolean;
}

export interface ConsoleV5RunHistoryEntry {
  readonly batchId: string;
  readonly mode: "integration_review" | "parallel_batch";
  readonly validation: "PASS" | "DRY_RUN";
  readonly duplicateRisk: "LOW" | "MEDIUM" | "HIGH";
  readonly summaryFile: string;
}

export const consoleV5BatchEntries: readonly ConsoleV5RoadmapEntry[] = [
  { id: "agent-1-docs", label: "Docs / Manual", risk: "LOW", executionMode: "local_repo_execute", ownerAgent: "agent-1" },
  { id: "agent-2-governance", label: "Governance / Validation", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-2" },
  { id: "agent-3-projects", label: "Project Operations", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-3" },
  { id: "agent-4-console", label: "Console Entrypoints", risk: "MEDIUM", executionMode: "local_repo_execute", ownerAgent: "agent-4" },
  { id: "agent-5-production", label: "Runtime / Production Proposal", risk: "HIGH", executionMode: "proposal_only", ownerAgent: "agent-5" }
] as const;

export const consoleV5BatchSafety = {
  batch_id: "batch-plan-feb72f17e4",
  real_worker_execution: "disabled",
  deploy: "disabled",
  production_operations: "disabled",
  credential_values: "not_read",
  managed_project_writes: "disabled"
} as const;

export const consoleV5StageCompletion: readonly ConsoleV5StageCompletion[] = [
  {
    id: "V5-A",
    title: "Enterprise Runtime",
    risk: "MEDIUM",
    executionMode: "local_repo_execute",
    expectedFiles: [
      "packages/runtime-center/schemas/enterprise-runtime.schema.json",
      "packages/runtime-center/examples/enterprise-runtime.example.json",
      "docs/release/V5_ENTERPRISE_RUNTIME_MVP.md"
    ],
    presentFiles: [
      "packages/runtime-center/schemas/enterprise-runtime.schema.json",
      "packages/runtime-center/examples/enterprise-runtime.example.json",
      "docs/release/V5_ENTERPRISE_RUNTIME_MVP.md"
    ],
    missingFiles: [],
    proposalOnly: false
  },
  {
    id: "V5-B",
    title: "Enterprise Credential Vault",
    risk: "HIGH",
    executionMode: "proposal_only",
    expectedFiles: ["docs/release/V5_ENTERPRISE_CREDENTIAL_VAULT_PROPOSAL.md"],
    presentFiles: ["docs/release/V5_ENTERPRISE_CREDENTIAL_VAULT_PROPOSAL.md"],
    missingFiles: [],
    proposalOnly: true
  },
  {
    id: "V5-C",
    title: "Multi Project Operations",
    risk: "MEDIUM",
    executionMode: "local_repo_execute",
    expectedFiles: [
      "packages/project-connector/schemas/multi-project-operations.schema.json",
      "packages/project-connector/examples/multi-project-operations.example.json",
      "docs/release/V5_MULTI_PROJECT_OPERATIONS_MVP.md"
    ],
    presentFiles: [
      "packages/project-connector/schemas/multi-project-operations.schema.json",
      "packages/project-connector/examples/multi-project-operations.example.json",
      "docs/release/V5_MULTI_PROJECT_OPERATIONS_MVP.md"
    ],
    missingFiles: [],
    proposalOnly: false
  },
  {
    id: "V5-D",
    title: "Production Operations",
    risk: "CRITICAL",
    executionMode: "proposal_only",
    expectedFiles: ["docs/release/V5_PRODUCTION_OPERATIONS_PROPOSAL.md"],
    presentFiles: ["docs/release/V5_PRODUCTION_OPERATIONS_PROPOSAL.md"],
    missingFiles: [],
    proposalOnly: true
  },
  {
    id: "V5-E",
    title: "Enterprise Console",
    risk: "MEDIUM",
    executionMode: "local_repo_execute",
    expectedFiles: [
      "apps/console/src/v5-roadmap.ts",
      "docs/release/V5_ENTERPRISE_CONSOLE_MVP.md"
    ],
    presentFiles: [
      "apps/console/src/v5-roadmap.ts",
      "docs/release/V5_ENTERPRISE_CONSOLE_MVP.md"
    ],
    missingFiles: [],
    proposalOnly: false
  },
  {
    id: "V5-F",
    title: "Autonomous Software Factory",
    risk: "CRITICAL",
    executionMode: "proposal_only",
    expectedFiles: ["docs/release/V5_AUTONOMOUS_SOFTWARE_FACTORY_PROPOSAL.md"],
    presentFiles: ["docs/release/V5_AUTONOMOUS_SOFTWARE_FACTORY_PROPOSAL.md"],
    missingFiles: [],
    proposalOnly: true
  }
] as const;

const expectedFileCount = consoleV5StageCompletion.reduce((total, stage) => total + stage.expectedFiles.length, 0);
const presentFileCount = consoleV5StageCompletion.reduce((total, stage) => total + stage.presentFiles.length, 0);

export const consoleV5CompletionSummary = {
  declared_stage_count: consoleV5StageCompletion.length,
  expected_file_count: expectedFileCount,
  present_file_count: presentFileCount,
  missing_file_count: expectedFileCount - presentFileCount,
  completion_percent: Math.round((presentFileCount / expectedFileCount) * 100),
  proposal_only_stage_count: consoleV5StageCompletion.filter((stage) => stage.proposalOnly).length,
  executable_stage_count: consoleV5StageCompletion.filter((stage) => !stage.proposalOnly).length,
  duplicate_batch_risk: "HIGH",
  recommended_mode: "integration_or_productization"
} as const;

export const consoleV5RemainingGaps = [
  "Replace repeated template batch generation with stage-specific integration tasks.",
  "Connect Console views to the V5 completion model and proposal queues.",
  "Add dry-run runtime smoke proposal before any real Worker activity.",
  "Keep V5-B, V5-D, and V5-F proposal-only until explicit approval gates exist."
] as const;

export const consoleV5RecentRunHistory: readonly ConsoleV5RunHistoryEntry[] = [
  {
    batchId: "batch-plan-feb72f17e4",
    mode: "parallel_batch",
    validation: "PASS",
    duplicateRisk: "HIGH",
    summaryFile: "autopilot-runs/batch-plan-feb72f17e4-summary.md"
  },
  {
    batchId: "batch-plan-27701878e5",
    mode: "parallel_batch",
    validation: "PASS",
    duplicateRisk: "HIGH",
    summaryFile: "autopilot-runs/batch-plan-27701878e5-summary.md"
  },
  {
    batchId: "batch-plan-aa65800cca",
    mode: "parallel_batch",
    validation: "PASS",
    duplicateRisk: "HIGH",
    summaryFile: "autopilot-runs/batch-plan-aa65800cca-summary.md"
  }
] as const;
