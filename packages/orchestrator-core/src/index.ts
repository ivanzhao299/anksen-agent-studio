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
