#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { PostgresAutonomousKernelStore } from "../../orchestrator-core/lib/autonomous-kernel/postgres-store.mjs";
import { migrate } from "../../orchestrator-core/lib/persistent-night-shift.mjs";
import { compileSmartParkProgram } from "../lib/smart-park-program.mjs";

await ensurePostgresFixture();
const pool = createTestPool();
try {
  if (!(await pool.query("SELECT to_regclass('ad_goal') ok")).rows[0].ok) await migrate(pool, "up");
  const supersede = await pool.connect();
  let supersededGoalId = null;
  try {
    await supersede.query("BEGIN");
    const oldGoal = (await supersede.query("SELECT * FROM ad_goal WHERE organization_id='anksen' AND workspace_id='smart-park-program' AND project_id='jinhu-smart-park' AND idempotency_key='smart-park-completion-v1' FOR UPDATE")).rows[0];
    if (oldGoal && oldGoal.status !== "CANCELLED") {
      const attempts = Number((await supersede.query("SELECT count(*) count FROM ad_task_attempt a JOIN ad_task t ON t.id=a.task_id WHERE t.goal_id=$1", [oldGoal.id])).rows[0].count);
      const nonPending = Number((await supersede.query("SELECT count(*) count FROM ad_task WHERE goal_id=$1 AND status<>'PENDING'", [oldGoal.id])).rows[0].count);
      if (attempts > 0 || nonPending > 0) throw new Error("SMART_PARK_V1_ALREADY_EXECUTED_REQUIRES_MANUAL_REVIEW");
      await supersede.query("UPDATE ad_task SET status='CANCELLED',metadata=metadata||$2::jsonb,version=version+1,updated_at=now() WHERE goal_id=$1", [oldGoal.id, JSON.stringify({ supersededBy: "smart-park-completion-v2", reason: "PRODUCT_BOUNDARY_CORRECTION" })]);
      await supersede.query("UPDATE ad_goal SET status='CANCELLED',metadata=metadata||$2::jsonb,version=version+1,updated_at=now() WHERE id=$1", [oldGoal.id, JSON.stringify({ supersededBy: "smart-park-completion-v2", reason: "PRODUCT_BOUNDARY_CORRECTION" })]);
      await supersede.query("INSERT INTO ad_outbox_event(event_id,event_type,aggregate_type,aggregate_id,aggregate_version,goal_id,project_id,payload) VALUES($1,'smart_park.program.superseded','goal',$2,$3,$2,$4,$5)", [randomUUID(), oldGoal.id, Number(oldGoal.version) + 1, oldGoal.project_id, JSON.stringify({ previousProgram: "smart-park-completion-v1", nextProgram: "smart-park-completion-v2", reason: "GROUP_PLATFORMS_REMOVED_FROM_SMART_PARK_SCOPE" })]);
      supersededGoalId = oldGoal.id;
    }
    await supersede.query("COMMIT");
  } catch (error) {
    await supersede.query("ROLLBACK");
    throw error;
  } finally {
    supersede.release();
  }
  const kernel = new PostgresAutonomousKernelStore(pool);
  const program = compileSmartParkProgram();
  const goal = await kernel.createGoal(
    { organizationId: "anksen", workspaceId: "smart-park-program", projectId: "jinhu-smart-park" },
    {
      title: program.title,
      description: "以真实代码和验收证据为准，持续完善智慧园区业务平台；集团战略、人力、财务仅作为上游集成边界。",
      source: "studio-smart-park-program",
      idempotencyKey: "smart-park-completion-v2",
      metadata: { applicationId: program.applicationId, runtimePolicy: program.runtimePolicy, longRunning: true }
    }
  );
  const submission = await kernel.submitPlan(goal.id, {
    plannerVersion: "smart-park-program-v2",
    sourceArtifactRef: "docs/SMART_PARK_COMPLETION_PROGRAM.md",
    tasks: program.tasks,
    dependencies: program.dependencies
  });
  const status = (await pool.query("SELECT status,count(*)::int count FROM ad_task WHERE goal_id=$1 GROUP BY status ORDER BY status", [goal.id])).rows;
  console.log(JSON.stringify({ status: "PLANNED", supersededGoalId, goalId: goal.id, goalStatus: "PLANNED", submissionId: submission.id, taskCount: program.tasks.length, dependencyCount: program.dependencies.length, taskStatus: status, runtimeGate: "CODEX_NOT_ACTIVATED", controlledStubCompletionForbidden: true }, null, 2));
} finally {
  await pool.end();
}
