#!/usr/bin/env node
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { PostgresAutonomousKernelStore } from "../../orchestrator-core/lib/autonomous-kernel/postgres-store.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { compileAiGrowthSalesProgram } from "../lib/ai-growth-sales-program.mjs";

await ensurePostgresFixture();
const pool = createTestPool();
try {
  if (!(await pool.query("SELECT to_regclass('ad_goal') ok")).rows[0].ok) await migrate(pool, "up");
  const kernel = new PostgresAutonomousKernelStore(pool);
  const program = compileAiGrowthSalesProgram();
  const goal = await kernel.createGoal(
    { organizationId: "anksen", workspaceId: "growth-sales-program", projectId: "ai-growth-sales-platform" },
    {
      title: program.title,
      description: "建设可接入多产品、全流程可审计、外部动作受审批约束的 AI 增长与销售平台。",
      source: "studio-ai-growth-sales-program",
      idempotencyKey: "ai-growth-sales-platform-v1",
      metadata: { applicationId: program.applicationId, runtimePolicy: program.runtimePolicy, longRunning: true }
    }
  );
  const submission = await kernel.submitPlan(goal.id, { plannerVersion: "ai-growth-sales-program-v1", sourceArtifactRef: "docs/AI_GROWTH_SALES_PLATFORM.md", tasks: program.tasks, dependencies: program.dependencies });
  const status = (await pool.query("SELECT status,count(*)::int count FROM ad_task WHERE goal_id=$1 GROUP BY status ORDER BY status", [goal.id])).rows;
  console.log(JSON.stringify({ status: "PLANNED", goalId: goal.id, goalStatus: "PLANNED", submissionId: submission.id, taskCount: program.tasks.length, dependencyCount: program.dependencies.length, taskStatus: status, externalActions: "APPROVAL_REQUIRED", realConnectors: "NOT_ACTIVATED", controlledStubCompletionForbidden: true }, null, 2));
} finally {
  await pool.end();
}
