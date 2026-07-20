#!/usr/bin/env node
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { PostgresAutonomousKernelStore } from "../../orchestrator-core/lib/autonomous-kernel/postgres-store.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { compileSmartParkProgram } from "../lib/smart-park-program.mjs";

await ensurePostgresFixture();
const pool = createTestPool();
try {
  if (!(await pool.query("SELECT to_regclass('ad_goal') ok")).rows[0].ok) await migrate(pool, "up");
  const kernel = new PostgresAutonomousKernelStore(pool);
  const program = compileSmartParkProgram();
  const goal = await kernel.createGoal(
    { organizationId: "anksen", workspaceId: "smart-park-program", projectId: "jinhu-smart-park" },
    {
      title: program.title,
      description: "以真实代码和验收证据为准，持续完善智慧园区 ERP 全业务域。",
      source: "studio-smart-park-program",
      idempotencyKey: "smart-park-completion-v1",
      metadata: { applicationId: program.applicationId, runtimePolicy: program.runtimePolicy, longRunning: true }
    }
  );
  const submission = await kernel.submitPlan(goal.id, {
    plannerVersion: "smart-park-program-v1",
    sourceArtifactRef: "docs/SMART_PARK_COMPLETION_PROGRAM.md",
    tasks: program.tasks,
    dependencies: program.dependencies
  });
  const status = (await pool.query("SELECT status,count(*)::int count FROM ad_task WHERE goal_id=$1 GROUP BY status ORDER BY status", [goal.id])).rows;
  console.log(JSON.stringify({ status: "PLANNED", goalId: goal.id, goalStatus: "PLANNED", submissionId: submission.id, taskCount: program.tasks.length, dependencyCount: program.dependencies.length, taskStatus: status, runtimeGate: "CODEX_NOT_ACTIVATED", controlledStubCompletionForbidden: true }, null, 2));
} finally {
  await pool.end();
}
