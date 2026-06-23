export interface ProjectConnectorConfig {
  readonly schema_version?: number;
  readonly project_id: string;
  readonly project_name?: string;
  readonly project_type?: string;
  readonly description?: string;
  readonly project_root: string;
  readonly state_dir: string;
  readonly mode?: string;
  readonly default_branch?: string;
  readonly package_manager?: string;
  readonly worktrees?: Record<string, string>;
  readonly detected_stack_hints?: readonly string[];
  readonly available_commands?: readonly string[];
  readonly read_paths?: readonly string[];
  readonly write_paths?: readonly string[];
  readonly frozen_paths: readonly string[];
  readonly guarded_paths?: readonly string[];
  readonly runtime_memory?: {
    readonly directory?: string;
    readonly summary_file?: string;
    readonly platform_state_file?: string;
    readonly validate_command?: string;
  };
  readonly inspection?: {
    readonly dry_run_only?: boolean;
    readonly allow_agent_execution?: boolean;
    readonly allow_project_writes?: boolean;
    readonly allow_deploy?: boolean;
    readonly allow_production_operations?: boolean;
  };
  readonly production_operations?: Record<string, "forbidden" | "manual_approval_required" | "allowed">;
}

export {
  listWorkspaceProjects,
  multiProjectWorkspaceFixture,
  projectWorkspaceSafety,
  type ManagedProjectWorkspaceEntry,
  type MultiProjectWorkspace,
  type ProjectOperationPolicy,
  type ProjectWritePolicy
} from "./workspace.js";

export const projectConnectorStatus = "multi-project-workspace-mvp";
