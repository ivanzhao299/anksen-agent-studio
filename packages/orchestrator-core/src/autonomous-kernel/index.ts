export type GoalStatus = "DRAFT" | "READY" | "PLANNING" | "PLANNED" | "RUNNING" | "PAUSED" | "BLOCKED" | "VALIDATING" | "SUCCEEDED" | "FAILED" | "CANCELLED";
export type TaskStatus = "PENDING" | "READY" | "QUEUED" | "CLAIMED" | "RUNNING" | "VALIDATING" | "REPAIRING" | "RETRY_WAIT" | "SUCCEEDED" | "FAILED" | "BLOCKED" | "CANCELLED";
export type DependencyType = "FINISH_TO_START" | "SUCCESS_REQUIRED" | "OPTIONAL" | "ARTIFACT_REQUIRED";
export type AttemptStatus = "CREATED" | "CLAIMED" | "RUNNING" | "SUCCEEDED" | "FAILED" | "TIMED_OUT" | "CANCELLED" | "LOST";

export interface StudioScope { organizationId: string; workspaceId: string; projectId: string; }
export interface GoalContract extends StudioScope { id: string; title: string; description: string; source: string; status: GoalStatus; idempotencyKey: string; version: number; metadata: Record<string, unknown>; }
export interface TaskContract { id: string; goalId: string; projectId: string; key: string; title: string; description: string; status: TaskStatus; priority: "P0" | "P1" | "P2" | "P3"; riskLevel: "LOW" | "MEDIUM" | "HIGH" | "CRITICAL"; requiredCapabilities: string[]; maxAttempts: number; output: Record<string, unknown>; metadata: Record<string, unknown>; version: number; }
export interface TaskDependencyContract { id: string; goalId: string; taskId: string; dependsOnTaskId: string; dependencyType: DependencyType; requiredStatus: TaskStatus; }
export interface TaskAttemptContract { id: string; taskId: string; attemptNumber: number; status: AttemptStatus; workerId: string | null; leaseId: string | null; artifactRefs: string[]; commitHash: string | null; metadata: Record<string, unknown>; }
export interface WorkerProfileAdapter { workerId: string; workerKey: string; runtimeType: string; capabilities: string[]; maxConcurrency: number; enabled: boolean; }
export interface RuntimeAdapterPort { execute(input: unknown): Promise<{ status: "NOT_EXECUTED"; reasonCode: "NO_RUNTIME_CONFIGURED" }>; }
export type RuntimeApprovalStatus = "PENDING"|"APPROVED"|"REJECTED"|"EXPIRED"|"REVOKED"|"CONSUMED";
export interface ProjectRuntimePolicy { organizationId:string; workspaceId:string; projectId:string; policyVersion:string; projectRoot:string; allowedPaths:string[]; blockedPaths:string[]; allowedCommands:string[]; blockedCommands:string[]; maxRuntimeSeconds:number; maxAttempts:number; allowCommit:boolean; allowPush:false; allowMerge:false; allowDeploy:false; }
export interface RuntimeApproval { id:string; organizationId:string; workspaceId:string; projectId:string; goalId:string; taskId:string; runtimeType:"CODEX"; workerId:string; policyVersion:string; status:RuntimeApprovalStatus; expiresAt:string; maxUses:number; usedCount:number; }
