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
  readonly intake?: ProjectIntakeConfig;
}

export type ProjectIntakeSourceType = "local_path" | "git_url" | "zip_placeholder";

export interface ProjectIntakeConfig {
  readonly source_type: ProjectIntakeSourceType;
  readonly local_path?: string;
  readonly git_url?: string;
  readonly zip_placeholder?: string;
  readonly repo_metadata?: ProjectRepoMetadata;
}

export interface ProjectRepoMetadata {
  readonly default_branch?: string;
  readonly package_manager?: string;
  readonly monorepo?: boolean;
  readonly repository_kind?: string;
}

export interface ProjectStackDetection {
  readonly project_id: string;
  readonly project_exists: boolean;
  readonly detected_stack: readonly string[];
  readonly package_json: "present" | "missing";
  readonly pnpm_workspace: "present" | "missing";
  readonly nextjs: "present" | "missing" | "hinted";
  readonly nestjs: "present" | "missing" | "hinted";
  readonly typescript: "present" | "missing" | "hinted";
  readonly prisma_postgresql: "present" | "missing" | "hinted";
  readonly docker: "present" | "missing" | "hinted";
  readonly cicd: "present" | "missing";
  readonly scripts: readonly string[];
}

export interface ProjectCommandDetection {
  readonly project_id: string;
  readonly commands: readonly {
    readonly kind: "install" | "typecheck" | "lint" | "test" | "build" | "dev" | "doctor";
    readonly command: string;
    readonly source: "package_json" | "config" | "detected_default";
    readonly executable_in_mvp: false;
  }[];
}

export interface DebugSpecialistAnalysis {
  readonly fixture_path: string;
  readonly error_class: "build" | "type" | "lint" | "test" | "runtime" | "unknown";
  readonly severity: "LOW" | "MEDIUM" | "HIGH";
  readonly summary: string;
  readonly proposed_repair_task: string;
  readonly execution_mode: "proposal_only";
}

export interface MultiProjectOperationReadiness {
  readonly kind: string;
  readonly command: string;
  readonly execution_policy: "dry_run_only" | "disabled" | "approval_required";
}

export interface MultiProjectOperationEntry {
  readonly project_id: string;
  readonly memory_source: string;
  readonly operation_policy: "read_only" | "proposal_only";
  readonly write_policy: "disabled" | "approval_required";
  readonly detected_stack: readonly string[];
  readonly command_readiness: readonly MultiProjectOperationReadiness[];
}

export interface MultiProjectOperationsPlan {
  readonly schema_version: number;
  readonly workspace_id: string;
  readonly mode: "read_only" | "proposal_only";
  readonly portfolio: {
    readonly managed_project_count: number;
    readonly write_policy: "disabled" | "approval_required";
    readonly command_execution_policy: "dry_run_only" | "disabled";
  };
  readonly projects: readonly MultiProjectOperationEntry[];
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

export interface IsolatedTaskWorkspace {
  readonly projectId: string;
  readonly taskId: string;
  readonly actorId: string;
  readonly sourceProjectRoot: string;
  readonly sourceDigest: string;
  readonly sourceHead: string;
  readonly remoteHead: string;
  readonly defaultBranch: string;
  readonly branch: `codex/${string}`;
  readonly worktreePath: string;
  readonly allowedPaths: readonly string[];
  readonly createdAt: string;
  readonly status: "ACTIVE" | "COMPLETED" | "ABANDONED";
}

export const gitWorkspaceIsolationStatus = "worktree-isolation-v1";
