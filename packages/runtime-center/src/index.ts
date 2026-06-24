export type RuntimeProviderType = "api" | "cli" | "browser" | "remote-worker";

export type RuntimeHealthStatus = "unknown" | "healthy" | "degraded" | "unavailable" | "disabled";

export interface RuntimeProvider {
  readonly provider_id: string;
  readonly provider_name: string;
  readonly provider_type: RuntimeProviderType;
  readonly auth_modes: readonly string[];
  readonly capabilities: readonly string[];
  readonly health_status: RuntimeHealthStatus;
}

export interface RuntimeProfile {
  readonly runtime_id: string;
  readonly adapter_id: string;
  readonly provider: string;
  readonly invoke_mode: "api" | "cli" | "browser" | "remote-worker" | "local";
  readonly supported_skills: readonly string[];
  readonly max_parallel_tasks: number;
  readonly health_status: RuntimeHealthStatus;
}

export interface RuntimeBudget {
  readonly runtime_id: string;
  readonly budget_status: "unknown" | "within_budget" | "limited" | "disabled";
  readonly max_usd_per_task: number;
  readonly max_minutes_per_task: number;
  readonly max_parallel_tasks: number;
}

export interface CredentialReference {
  readonly credential_id: string;
  readonly credential_type: "api_key_ref" | "oauth_ref" | "local_login_ref" | "ssh_ref" | "none";
  readonly vault_path: string;
  readonly provider: string;
}

export interface RuntimeSelectionInput {
  readonly skill_type: string;
  readonly capability: string;
  readonly region: string;
  readonly requested_budget_usd: number;
}

export interface RuntimeSelectionResult {
  readonly input: RuntimeSelectionInput;
  readonly selected_runtime: string | null;
  readonly selected_provider: string | null;
  readonly rule_id: string;
  readonly confidence: number;
  readonly fallback_used: boolean;
  readonly reason: string;
}

export interface EnterpriseRuntimeProfile {
  readonly runtime_id: string;
  readonly adapter_id: string;
  readonly tenant_scope: "local_studio" | "single_workspace" | "multi_project";
  readonly supported_skills: readonly string[];
  readonly capability_scores: Readonly<Record<string, number>>;
  readonly credential_policy: "none" | "reference_presence_only" | "proposal_required";
  readonly network_policy: "disabled" | "metadata_only" | "approval_required";
  readonly workspace_policy: "read_only" | "local_repo_only" | "approval_required";
  readonly concurrency_policy: {
    readonly max_parallel_tasks: number;
    readonly path_overlap_policy: "isolate_conflicts" | "sequential_only";
  };
  readonly invocation_policy: "invoke_plan_only" | "disabled" | "approval_required";
}

export interface EnterpriseRuntimeControlPlane {
  readonly schema_version: number;
  readonly runtime_control_plane_id: string;
  readonly mode: "read_only" | "dry_run_only";
  readonly profiles: readonly EnterpriseRuntimeProfile[];
  readonly selection_policy: {
    readonly default_strategy: "highest_safe_capability" | "lowest_risk" | "manual_selection";
    readonly governance_gate_required: boolean;
    readonly credential_values_available: false;
  };
}

export const runtimeCenterVersion = "0.1.0";
