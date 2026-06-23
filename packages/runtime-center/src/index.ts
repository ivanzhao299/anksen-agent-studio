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
  readonly provider: string;
  readonly invoke_mode: "api" | "cli" | "browser" | "remote-worker" | "local";
  readonly supported_skills: readonly string[];
  readonly max_parallel_tasks: number;
  readonly health_status: RuntimeHealthStatus;
}

export const runtimeCenterVersion = "0.1.0";
