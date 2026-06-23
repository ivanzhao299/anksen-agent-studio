export type PlanningRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export interface PlanningRequest {
  readonly schema_version: number;
  readonly request_id: string;
  readonly created_at: string;
  readonly goal: string;
  readonly inputs: Record<string, unknown>;
  readonly constraints: {
    readonly max_steps: number;
    readonly agent_execution: "disabled" | "approval_required" | "enabled";
    readonly managed_project_writes: "disabled" | "approval_required" | "enabled";
    readonly deploy: "disabled" | "approval_required" | "enabled";
    readonly production_operations: "disabled" | "approval_required" | "enabled";
    readonly credential_values: "disabled" | "approval_required" | "enabled";
  };
}

export interface PlanningAction {
  readonly title: string;
  readonly reason: string;
  readonly target_project: string;
  readonly target_package: string;
  readonly expected_files: readonly string[];
  readonly validation_commands: readonly string[];
  readonly risk: PlanningRisk;
  readonly approval_required: boolean;
  readonly execution_mode: "local_repo_execute" | "proposal_only" | "approval_gate" | "blocked" | "human_approval_required";
}

export interface PlanningBatchTask {
  readonly task_id: string;
  readonly owner_agent: `agent-${1 | 2 | 3 | 4 | 5}`;
  readonly target_package: string;
  readonly skill_type: string;
  readonly runtime: string;
  readonly allowed_paths: readonly string[];
  readonly forbidden_paths: readonly string[];
  readonly risk: PlanningRisk;
  readonly dependencies: readonly string[];
  readonly validation_commands: readonly string[];
  readonly execution_mode?: "local_repo_execute" | "proposal_only" | "human_approval_required";
  readonly approval_required?: boolean;
  readonly proposal_required?: boolean;
}

export interface PlanningBatchPlan {
  readonly batch_id: string;
  readonly tasks: readonly PlanningBatchTask[];
}

export interface PlanningOutput {
  readonly schema_version: number;
  readonly planning_output_id: string;
  readonly source_request_id: string;
  readonly goal: string;
  readonly current_stage: Record<string, unknown>;
  readonly next_action: PlanningAction;
  readonly reason: string;
  readonly target_project: string;
  readonly target_package: string;
  readonly expected_files: readonly string[];
  readonly validation_commands: readonly string[];
  readonly risk: PlanningRisk;
  readonly approval_required: boolean;
  readonly execution_mode?: "local_repo_execute" | "proposal_only" | "approval_gate" | "blocked" | "human_approval_required";
  readonly batch_plan?: PlanningBatchPlan;
  readonly stop_condition: string;
}

export const planningCenterVersion = "0.1.0";
