export type WorkerKind = "local" | "remote" | "production";
export type WorkerRisk = "LOW" | "MEDIUM" | "HIGH" | "CRITICAL";
export type WorkerMode = "local_repo_execute" | "proposal_only" | "human_approval_required";

export interface WorkerProfile {
  readonly worker_id: string;
  readonly display_name: string;
  readonly worker_kind: WorkerKind;
  readonly runtime_id: string;
  readonly adapter_id: string;
  readonly status: "available" | "unavailable" | "disabled";
  readonly supported_skills: readonly string[];
  readonly max_parallel_tasks: number;
  readonly risk: WorkerRisk;
  readonly execution_mode: WorkerMode;
}

export interface WorkerRegistry {
  readonly schema_version: number;
  readonly registry_id: string;
  readonly workers: readonly WorkerProfile[];
}

export interface WorkerAssignment {
  readonly assignment_id: string;
  readonly worker_id: string;
  readonly runtime_id: string;
  readonly status: "ASSIGNED" | "BLOCKED";
  readonly dry_run: boolean;
}
