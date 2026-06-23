export type ProjectWritePolicy = "disabled" | "approval_required" | "enabled";
export type ProjectOperationPolicy = "forbidden" | "manual_approval_required" | "allowed";

export interface ManagedProjectWorkspaceEntry {
  readonly project_id: string;
  readonly display_name: string;
  readonly memory_dir: string;
  readonly source_memory_dir?: string;
  readonly connector_status: "available" | "missing" | "disabled";
  readonly doctor_status: string;
  readonly repo_clean: string;
  readonly write_policy: ProjectWritePolicy;
  readonly deploy_policy: ProjectOperationPolicy;
  readonly production_operation_policy: ProjectOperationPolicy;
  readonly context_files: readonly string[];
}

export interface MultiProjectWorkspace {
  readonly schema_version: number;
  readonly generated_at: string;
  readonly workspace_id: string;
  readonly mode: "read_only";
  readonly projects: readonly ManagedProjectWorkspaceEntry[];
  readonly safety: {
    readonly managed_project_writes: "disabled";
    readonly deploy: "disabled";
    readonly production_operations: "disabled";
    readonly credential_values: "disabled";
  };
}

export const multiProjectWorkspaceFixture: MultiProjectWorkspace = {
  "schema_version": 1,
  "generated_at": "2026-06-23T14:33:43.655Z",
  "workspace_id": "anksen-agent-studio-local",
  "mode": "read_only",
  "projects": [
    {
      "project_id": "jinhu-smart-park",
      "display_name": "jinhu-smart-park",
      "memory_dir": "runtime/projects/jinhu-smart-park",
      "source_memory_dir": "examples/jinhu-smart-park/runtime-memory",
      "connector_status": "available",
      "doctor_status": "GO",
      "repo_clean": "yes",
      "write_policy": "disabled",
      "deploy_policy": "forbidden",
      "production_operation_policy": "forbidden",
      "context_files": [
        "runtime/projects/jinhu-smart-park/project-state.json",
        "runtime/projects/jinhu-smart-park/architecture.json",
        "runtime/projects/jinhu-smart-park/agent-studio-status.json",
        "runtime/projects/jinhu-smart-park/handoff-summary.md"
      ]
    }
  ],
  "safety": {
    "managed_project_writes": "disabled",
    "deploy": "disabled",
    "production_operations": "disabled",
    "credential_values": "disabled"
  }
} as const;

export function listWorkspaceProjects(workspace: MultiProjectWorkspace = multiProjectWorkspaceFixture) {
  return workspace.projects.map((project) => ({
    project_id: project.project_id,
    connector_status: project.connector_status,
    doctor_status: project.doctor_status,
    repo_clean: project.repo_clean,
    memory_dir: project.memory_dir
  }));
}

export function projectWorkspaceSafety(workspace: MultiProjectWorkspace = multiProjectWorkspaceFixture) {
  return {
    project_count: workspace.projects.length,
    writable_project_count: workspace.projects.filter((project) => project.write_policy !== "disabled").length,
    deploy_enabled_count: workspace.projects.filter((project) => project.deploy_policy === "allowed").length,
    production_operation_enabled_count: workspace.projects.filter((project) => project.production_operation_policy === "allowed").length,
    credential_values: workspace.safety.credential_values
  };
}
