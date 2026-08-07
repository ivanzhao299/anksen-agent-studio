export type OrchestratorCapability =
  | "goal-engine"
  | "planner-agent"
  | "event-store"
  | "task-queue"
  | "audit"
  | "integration"
  | "finalize";

export const orchestratorCoreCapabilities: OrchestratorCapability[] = [
  "goal-engine",
  "planner-agent",
  "event-store",
  "task-queue",
  "audit",
  "integration",
  "finalize"
];

export * from "./autonomous-kernel/index.js";
export const avernetCompatibilityGatewayStatus = "provider-gateway-v1";

export interface StudioGatewayGoalRequest {
  readonly title: string;
  readonly description?: string;
  readonly organizationId?: string;
  readonly workspaceId?: string;
  readonly projectId: string;
  readonly idempotencyKey: string;
  readonly constraints?: readonly string[];
  readonly acceptanceCriteria?: readonly string[];
}

export interface StudioGatewayError {
  readonly error: { readonly code: string; readonly message: string; readonly requestId: string; readonly details?: unknown };
}
