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

export const runtimeCenterVersion = "0.1.0";
