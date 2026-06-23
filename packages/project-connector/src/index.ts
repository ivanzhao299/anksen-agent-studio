export interface ProjectConnectorConfig {
  readonly projectId: string;
  readonly projectRoot: string;
  readonly stateDir: string;
  readonly frozenPaths: readonly string[];
}

export const projectConnectorStatus = "skeleton";

