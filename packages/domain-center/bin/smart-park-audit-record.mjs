#!/usr/bin/env node
import { randomUUID } from "node:crypto";
import { createTestPool, ensurePostgresFixture } from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { auditSmartPark } from "../lib/smart-park-audit.mjs";

const root = process.argv.slice(2).find((value) => value !== "--") ?? process.env.SMART_PARK_REPO_ROOT;
if (!root) {
  console.error("Usage: pnpm smart-park:audit:record -- /absolute/path/to/jinhu-smart-park");
  process.exit(2);
}
const report = await auditSmartPark(root);
if (!report.allConfiguredEvidenceMatched) throw new Error("SMART_PARK_AUDIT_EVIDENCE_MISMATCH");
await ensurePostgresFixture();
const pool = createTestPool();
try {
  const client = await pool.connect();
  try {
    await client.query("BEGIN");
    const goal = (await client.query("SELECT * FROM ad_goal WHERE organization_id='anksen' AND workspace_id='smart-park-program' AND project_id='jinhu-smart-park' AND idempotency_key='smart-park-completion-v2' FOR UPDATE")).rows[0];
    if (!goal) throw new Error("SMART_PARK_PROGRAM_GOAL_NOT_FOUND");
    const task = (await client.query("SELECT * FROM ad_task WHERE goal_id=$1 AND task_key='SP-000' FOR UPDATE", [goal.id])).rows[0];
    if (!task) throw new Error("SMART_PARK_AUDIT_TASK_NOT_FOUND");
    const evidence = {
      status: "RECORDED_AWAITING_WORKER_VERIFICATION",
      reportPath: "docs/SMART_PARK_SP000_CURRENT_STATE_AUDIT.md",
      sourceFingerprint: report.sourceFingerprint,
      generatedAt: report.generatedAt,
      counts: report.counts,
      summary: report.summary,
      allConfiguredEvidenceMatched: report.allConfiguredEvidenceMatched
    };
    await client.query("UPDATE ad_task SET metadata=metadata||$2::jsonb,version=version+1,updated_at=now() WHERE id=$1", [task.id, JSON.stringify({ auditCheckpoint: evidence })]);
    await client.query("INSERT INTO ad_outbox_event(event_id,event_type,aggregate_type,aggregate_id,aggregate_version,goal_id,project_id,payload) VALUES($1,'smart_park.audit.recorded','task',$2,$3,$4,$5,$6)", [randomUUID(), task.id, Number(task.version) + 1, goal.id, goal.project_id, JSON.stringify({ taskKey: task.task_key, ...evidence })]);
    await client.query("COMMIT");
    console.log(JSON.stringify({ status: evidence.status, goalId: goal.id, taskId: task.id, taskKey: task.task_key, taskStatus: task.status, checkpoint: evidence }, null, 2));
  } catch (error) {
    await client.query("ROLLBACK");
    throw error;
  } finally {
    client.release();
  }
} finally {
  await pool.end();
}
