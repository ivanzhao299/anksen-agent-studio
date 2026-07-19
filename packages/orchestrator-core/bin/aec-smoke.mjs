#!/usr/bin/env node
import { AutonomousExecutionCenter } from "../lib/autonomous-execution-center.mjs";

const center = new AutonomousExecutionCenter();
const result = await center.createGoal({
  title: "完善 Runtime 文档",
  userContext: {
    authenticated: true,
    user: { user_id: "beta-001-smoke" },
    capabilities: ["console.access", "autopilot.execute.local"],
  },
});

const summary = {
  sessionKey: result.sessionKey,
  sessionStatus: result.dashboard.session?.status,
  goalStatus: result.dashboard.goal?.status,
  taskStates: result.dashboard.tasks.map((task) => task.status),
  runtime: result.dashboard.runtime,
  morningReport: result.dashboard.morningReport,
  readiness: result.dashboard.readiness,
};

if (
  summary.sessionStatus !== "SUCCEEDED" ||
  summary.goalStatus !== "SUCCEEDED" ||
  summary.taskStates.some((status) => status !== "SUCCEEDED") ||
  summary.runtime.type !== "CONTROLLED_STUB" ||
  summary.runtime.realRuntimeEnabled
) {
  throw new Error(`AEC smoke failed: ${JSON.stringify(summary)}`);
}

console.log(JSON.stringify(summary, null, 2));
