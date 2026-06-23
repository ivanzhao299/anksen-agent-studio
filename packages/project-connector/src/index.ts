export interface ProjectConnectorConfig {
  readonly schema_version?: number;
  readonly projectId: string;
  readonly projectName?: string;
  readonly projectRoot: string;
  readonly stateDir: string;
  readonly readPaths?: readonly string[];
  readonly writePaths?: readonly string[];
  readonly frozenPaths: readonly string[];
  readonly guardedPaths?: readonly string[];
}

export const projectConnectorStatus = "skeleton";
