#!/usr/bin/env node
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { PostgresAutonomousKernelStore } from "../../orchestrator-core/lib/autonomous-kernel/postgres-store.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { compileManufacturingErpProgram } from "../lib/manufacturing-erp-program.mjs";

await ensurePostgresFixture();
const pool = createTestPool();
try {
  if (!(await pool.query("SELECT to_regclass('ad_goal') ok")).rows[0].ok) await migrate(pool, "up");
  const kernel = new PostgresAutonomousKernelStore(pool);
  const program = compileManufacturingErpProgram();
  const goal = await kernel.createGoal(
    { organizationId: "anksen", workspaceId: "manufacturing-erp-program", projectId: "intelligent-manufacturing-erp" },
    { title: program.title, description: "建设面向集团自有生产企业、从产品工程到交付追溯的智能制造 ERP。", source: "studio-manufacturing-erp-program", idempotencyKey: "intelligent-manufacturing-erp-v1", metadata: { applicationId: program.applicationId, runtimePolicy: program.runtimePolicy, longRunning: true } }
  );
  const submission = await kernel.submitPlan(goal.id, { plannerVersion: "manufacturing-erp-program-v1", sourceArtifactRef: "docs/INTELLIGENT_MANUFACTURING_ERP.md", tasks: program.tasks, dependencies: program.dependencies });
  const status = (await pool.query("SELECT status,count(*)::int count FROM ad_task WHERE goal_id=$1 GROUP BY status ORDER BY status", [goal.id])).rows;
  console.log(JSON.stringify({ status: "PLANNED", goalId: goal.id, submissionId: submission.id, taskCount: program.tasks.length, dependencyCount: program.dependencies.length, taskStatus: status, productionIntegration: "APPROVAL_REQUIRED", controlledStubCompletionForbidden: true }, null, 2));
} finally {
  await pool.end();
}
