export type DiscoveryMode = "fixture" | "manual-manifest" | "authorized-browser-runtime";

export interface DiscoveryTargetSummary {
  readonly targetId: string;
  readonly targetName: string;
  readonly mode: DiscoveryMode;
  readonly authorizationRequired: true;
}

