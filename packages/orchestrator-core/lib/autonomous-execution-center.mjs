import { randomUUID } from "node:crypto";
import { readFile } from "node:fs/promises";
import {
  createTestPool,
  ensurePostgresFixture,
} from "./postgres-fixture.mjs";
import {
  migrate,
  PersistentNightShiftService,
} from "./persistent-night-shift.mjs";
import { SessionProjectionConsumer } from "./activation-gate.mjs";

async function readyPool() {
  await ensurePostgresFixture();
  const pool = createTestPool();
  const existing = (
    await pool.query(
      "SELECT to_regclass('ad_night_shift_session') session, to_regclass('ad_runtime_approval') approval",
    )
  ).rows[0];

  if (!existing.session) {
    await migrate(pool, "up");
  } else if (!existing.approval) {
    const activationMigration = await readFile(
      new URL("../migrations/003_codex_activation_gate.up.sql", import.meta.url),
      "utf8",
    );
    await pool.query(activationMigration);
  }
  return pool;
}

function requireExecutionAccess(userContext) {
  if (!userContext?.authenticated) {
    throw Object.assign(new Error("AUTH_REQUIRED"), { code: "AUTH_REQUIRED" });
  }
  const capabilities = userContext.capabilities ?? [];
  if (
    !capabilities.includes("*") &&
    !capabilities.includes("autopilot.execute.local")
  ) {
    throw Object.assign(new Error("RBAC_DENIED"), { code: "RBAC_DENIED" });
  }
}

export class AutonomousExecutionCenter {
  async createGoal({ title, userContext }) {
    requireExecutionAccess(userContext);
    const pool = await readyPool();
    try {
      // PersistentNightShiftService is the existing Planner + Kernel + Scheduler +
      // Resident Worker composition root. AEC deliberately adds no second engine.
      const kernel = new PersistentNightShiftService(pool);
      const sessionKey = `aec-${randomUUID()}`;
      const session = await kernel.acceptGoal(sessionKey, {
        id: sessionKey,
        title,
        description: title,
        metadata: {
          riskLevel: "LOW",
          createdBy: userContext.user?.user_id ?? "studio-user",
        },
      });
      const report = await kernel.run(session.session_key);
      await new SessionProjectionConsumer(
        pool,
        "aec-session-projection-v1",
      ).replay();
      return { sessionKey, report, dashboard: await this.dashboard(pool) };
    } finally {
      await pool.end();
    }
  }

  async getDashboard() {
    const pool = await readyPool();
    try {
      return await this.dashboard(pool);
    } finally {
      await pool.end();
    }
  }

  async dashboard(pool) {
    const session = (
      await pool.query(
        "SELECT * FROM ad_night_shift_session ORDER BY created_at DESC LIMIT 1",
      )
    ).rows[0] ?? null;
    const goal = session?.goal_id
      ? (await pool.query("SELECT * FROM ad_goal WHERE id=$1", [session.goal_id]))
          .rows[0]
      : null;
    const tasks = session?.goal_id
      ? (
          await pool.query(
            "SELECT id, task_key, title, status, priority, risk_level FROM ad_task WHERE goal_id=$1 ORDER BY created_at, task_key",
            [session.goal_id],
          )
        ).rows
      : [];
    const workers = (
      await pool.query(
        "SELECT worker_key, status, active_claims, max_concurrency, runtime_type, last_heartbeat_at FROM ad_worker ORDER BY worker_key",
      )
    ).rows;
    const approvals = (
      await pool.query(
        "SELECT status, count(*)::int count FROM ad_runtime_approval GROUP BY status ORDER BY status",
      )
    ).rows;
    const projection = session
      ? (
          await pool.query(
            "SELECT * FROM ad_session_projection WHERE session_id=$1",
            [session.id],
          )
        ).rows[0] ?? null
      : null;
    const attempts = session
      ? (
          await pool.query(
            "SELECT count(*)::int n FROM ad_task_attempt a JOIN ad_task t ON t.id=a.task_id WHERE t.goal_id=$1",
            [session.goal_id],
          )
        ).rows[0].n
      : 0;
    const queue = tasks.filter((task) => task.status === "QUEUED");
    const blocked = tasks.filter((task) => task.status === "BLOCKED");
    const succeeded = tasks.filter((task) => task.status === "SUCCEEDED");

    return {
      generatedAt: new Date().toISOString(),
      session,
      goal,
      tasks,
      workers,
      queue,
      blocked,
      runtime: {
        type: "CONTROLLED_STUB",
        executions: session?.runtime_execution_count ?? 0,
        realRuntimeEnabled: false,
      },
      approvals,
      morningReport: session?.report ?? projection?.morning_report ?? null,
      overnight: {
        total: tasks.length,
        succeeded: succeeded.length,
        failed: tasks.filter((task) => task.status === "FAILED").length,
        blocked: blocked.length,
        attempts,
      },
      readiness: {
        status: "READY_FOR_CONTROLLED_STUB",
        postgresql: true,
        kernelMigration: true,
        planner: true,
        scheduler: true,
        worker: workers.some(
          (worker) => !["OFFLINE", "ERROR"].includes(worker.status),
        ),
        runtime: "CONTROLLED_STUB",
        codexFeatureFlag: false,
      },
    };
  }
}
