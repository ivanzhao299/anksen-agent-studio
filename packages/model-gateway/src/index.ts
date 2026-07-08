export type ManagedModelGatewayRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";

export type ManagedModelExecutionMode =
  | "gateway_invoke_plan_allowed"
  | "proposal_only"
  | "human_approval_required"
  | "blocked";

export interface ManagedModelRuntime {
  readonly runtime_id: string;
  readonly provider: string;
  readonly adapter_id: string;
  readonly display_name: string;
  readonly region: "cn" | "global" | "local" | "self-hosted";
  readonly management_mode: "admin_managed_reference" | "user_bring_your_own" | "external_cli_session";
  readonly credential_reference_id?: string;
  readonly supported_skills: readonly string[];
  readonly available_to_plans: readonly string[];
  readonly risk_baseline: ManagedModelGatewayRisk;
  readonly max_parallel_tasks: number;
  readonly direct_model_call_enabled: false;
}

export interface ManagedModelRoute {
  readonly route_id: string;
  readonly requested_runtime: string;
  readonly selected_runtime: string | null;
  readonly execution_mode: ManagedModelExecutionMode;
  readonly credential_values_read: false;
  readonly model_invocation: "disabled";
  readonly blocked_reasons: readonly string[];
}

export interface ManagedModelInvokePlan {
  readonly invocation_id: string;
  readonly route_id: string;
  readonly runtime_id: string | null;
  readonly execution_status: "planned" | "blocked";
  readonly model_invocation: "disabled";
  readonly credential_values_read: false;
  readonly external_calls: "disabled";
  readonly audit_trace_required: true;
  readonly steps: readonly string[];
}

export const managedModelGatewayVersion = "0.1.0";
