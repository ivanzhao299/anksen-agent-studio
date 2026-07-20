import { createHash, randomUUID } from "node:crypto";
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

function deterministicUuid(value) {
  const hex = createHash("sha256").update(value).digest("hex").slice(0, 32).split("");
  hex[12] = "5";
  hex[16] = ((Number.parseInt(hex[16], 16) & 3) | 8).toString(16);
  const joined = hex.join("");
  return `${joined.slice(0, 8)}-${joined.slice(8, 12)}-${joined.slice(12, 16)}-${joined.slice(16, 20)}-${joined.slice(20)}`;
}

export class AutonomousExecutionCenter {
  async createGoal({ title, description = "", constraints = [], acceptanceCriteria = [], idempotencyKey, scope, userContext }) {
    requireExecutionAccess(userContext);
    const pool = await readyPool();
    try {
      // PersistentNightShiftService is the existing Planner + Kernel + Scheduler +
      // Resident Worker composition root. AEC deliberately adds no second engine.
      const kernel = new PersistentNightShiftService(pool);
      const key = idempotencyKey || randomUUID();
      const sessionKey = `aec-${createHash("sha256").update(`${scope?.organizationId ?? "test-org"}:${scope?.workspaceId ?? "test-workspace"}:${scope?.projectId ?? "test-project"}:${key}`).digest("hex").slice(0, 32)}`;
      const session = await kernel.acceptGoal(sessionKey, {
        id: key,
        title,
        description: description || title,
        constraints,
        acceptanceCriteria,
        scope,
        source: "studio-gateway",
        metadata: {
          riskLevel: "LOW",
          createdBy: userContext.user?.user_id ?? "studio-user",
        },
      });
      const report = await kernel.run(session.session_key);
      const goal = (await pool.query("SELECT version,project_id FROM ad_goal WHERE id=$1", [report.goalId])).rows[0];
      await pool.query(
        "INSERT INTO ad_outbox_event(event_id,event_type,aggregate_type,aggregate_id,aggregate_version,goal_id,project_id,payload) VALUES($1,'studio.gateway.goal_completed','goal',$2,$3,$2,$4,$5) ON CONFLICT(event_id) DO NOTHING",
        [deterministicUuid(`studio.gateway.goal_completed:${sessionKey}`), report.goalId, goal.version, goal.project_id, { sessionKey, actorId: userContext.principalId ?? userContext.user?.user_id ?? "studio-user", authType: userContext.authType ?? "access_center", runtime: "CONTROLLED_STUB", constraintCount: constraints.length, acceptanceCriteriaCount: acceptanceCriteria.length }],
      );
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

  async getGoal(goalId) {
    return this.withPool(async (pool) => {
      const goal = (await pool.query("SELECT * FROM ad_goal WHERE id=$1", [goalId])).rows[0];
      if (!goal) throw Object.assign(new Error("GOAL_NOT_FOUND"), { code: "GOAL_NOT_FOUND" });
      return goal;
    });
  }

  async getTaskGraph(goalId) {
    return this.withPool(async (pool) => {
      const goal = (await pool.query("SELECT * FROM ad_goal WHERE id=$1", [goalId])).rows[0];
      if (!goal) throw Object.assign(new Error("GOAL_NOT_FOUND"), { code: "GOAL_NOT_FOUND" });
      const tasks = (await pool.query("SELECT * FROM ad_task WHERE goal_id=$1 ORDER BY created_at,task_key", [goalId])).rows;
      const dependencies = (await pool.query("SELECT * FROM ad_task_dependency WHERE goal_id=$1 ORDER BY created_at,id", [goalId])).rows;
      return { goal, tasks, dependencies };
    });
  }

  async getSession(sessionKey) {
    return this.withPool(async (pool) => {
      const session = (await pool.query("SELECT * FROM ad_night_shift_session WHERE session_key=$1", [sessionKey])).rows[0];
      if (!session) throw Object.assign(new Error("SESSION_NOT_FOUND"), { code: "SESSION_NOT_FOUND" });
      return session;
    });
  }

  async getMorningReport(sessionKey) {
    const session = await this.getSession(sessionKey);
    return { sessionKey, report: session.report ?? null, status: session.status };
  }

  async getReadiness() {
    const dashboard = await this.getDashboard();
    return dashboard.readiness;
  }

  async getPortfolioProgress() {
    return this.withPool(async (pool) => {
      const rows = (await pool.query(`
        SELECT DISTINCT ON (g.metadata->>'applicationId')
          g.metadata->>'applicationId' application_id,
          g.id goal_id,g.title,g.status goal_status,g.created_at,g.updated_at,
          count(t.id)::int task_count,
          count(t.id) FILTER (WHERE t.status='SUCCEEDED')::int succeeded_count,
          count(t.id) FILTER (WHERE t.status='FAILED')::int failed_count,
          count(t.id) FILTER (WHERE t.status='BLOCKED')::int blocked_count,
          count(t.id) FILTER (WHERE t.status IN ('READY','QUEUED','CLAIMED','RUNNING','VALIDATING'))::int active_count,
          count(t.id) FILTER (WHERE t.status='PENDING')::int pending_count
        FROM ad_goal g LEFT JOIN ad_task t ON t.goal_id=g.id
        WHERE coalesce(g.metadata->>'applicationId','')<>''
        GROUP BY g.id,g.metadata->>'applicationId'
        ORDER BY g.metadata->>'applicationId',g.created_at DESC
      `)).rows;
      return { generatedAt: new Date().toISOString(), source: "AUTONOMOUS_KERNEL", applications: rows };
    });
  }

  async withPool(work) {
    const pool = await readyPool();
    try { return await work(pool); } finally { await pool.end(); }
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
