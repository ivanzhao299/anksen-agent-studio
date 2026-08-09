export type ManagedCapabilityAppStatus = "READY" | "NOT_READY" | "UNAVAILABLE";

export interface ManagedCapabilityAppDefinition {
  readonly app_id: string;
  readonly name: string;
  readonly category: string;
  readonly license: string;
  readonly capabilities: readonly string[];
  readonly installation: {
    readonly root_env: string;
    readonly local_path_candidates: readonly string[];
    readonly manifest: string;
    readonly bridge_entry: string;
    readonly python: string;
  };
  readonly native_ui: {
    readonly origin: string;
    readonly project_path_template: string;
  };
  readonly boundary: {
    readonly integration_mode: "INDEPENDENT_MANAGED_APP";
    readonly studio_orchestration: "HANDOFF_ONLY";
    readonly progress: "READ_ONLY_PROJECTION";
    readonly artifacts: "READ_ONLY_DISCOVERY";
  };
}

export const managedCapabilityAppsStatus = "independent-app-bridge-v1" as const;
