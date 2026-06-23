export type RuntimeAdapterInvokeMode = "cli" | "api" | "browser" | "remote-worker" | "webhook";

export type RuntimeAdapterRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type RuntimeAdapterHealthStatus = "unknown" | "healthy" | "degraded" | "unavailable" | "disabled";

export interface RuntimeAdapter {
  readonly adapter_id: string;
  readonly runtime_id: string;
  readonly provider: string;
  readonly invoke_mode: RuntimeAdapterInvokeMode;
  readonly supported_skills: readonly string[];
  readonly credential_reference_required: boolean;
  readonly credential_reference_id?: string;
  readonly network_required: boolean;
  readonly workspace_required: boolean;
  readonly max_parallel_tasks: number;
  readonly health_status: RuntimeAdapterHealthStatus;
  readonly risk_baseline: RuntimeAdapterRisk;
  readonly guardrails: readonly string[];
}

export interface AdapterInvocationPlan {
  readonly invocation_id: string;
  readonly adapter_id: string;
  readonly runtime_id: string;
  readonly skill_type: string;
  readonly dry_run: true;
  readonly execution_status: "planned" | "blocked";
  readonly model_invocation: "disabled";
  readonly credential_values_read: false;
  readonly external_calls: "disabled";
  readonly steps: readonly string[];
}

export interface AdapterResult {
  readonly result_id: string;
  readonly invocation_id: string;
  readonly adapter_id: string;
  readonly status: "planned" | "blocked" | "not_executed";
  readonly dry_run: true;
  readonly model_invocation: "disabled";
  readonly credential_values_read: false;
}

export const runtimeAdapterMarketplaceVersion = "0.1.0";
