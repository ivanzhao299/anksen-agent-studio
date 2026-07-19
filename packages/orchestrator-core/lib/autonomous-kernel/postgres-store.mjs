import { randomBytes, randomUUID, createHash } from "node:crypto";
import { validateGraph } from "./domain.mjs";

const canonicalize = (value) => Array.isArray(value)
  ? value.map(canonicalize)
  : value && typeof value === "object"
    ? Object.fromEntries(Object.keys(value).sort().map((key) => [key, canonicalize(value[key])]))
    : value;
const stableHash = (value) => createHash("sha256").update(JSON.stringify(canonicalize(value))).digest("hex");

export class PostgresAutonomousKernelStore {
  constructor(pool) { this.pool = pool; }
  async transaction(work) { const client = await this.pool.connect(); try { await client.query("BEGIN"); const result = await work(client); await client.query("COMMIT"); return result; } catch (error) { await client.query("ROLLBACK"); throw error; } finally { client.release(); } }

  async createGoal(scope, input) {
    return this.transaction(async (client) => {
      const fingerprint = stableHash(input);
      const existing = await client.query("SELECT * FROM ad_goal WHERE organization_id=$1 AND workspace_id=$2 AND project_id=$3 AND idempotency_key=$4 FOR UPDATE", [scope.organizationId, scope.workspaceId, scope.projectId, input.idempotencyKey]);
      if (existing.rows[0]) { if (existing.rows[0].request_fingerprint !== fingerprint) throw new Error("GOAL_IDEMPOTENCY_CONFLICT"); return existing.rows[0]; }
      const id = randomUUID();
      const inserted = await client.query("INSERT INTO ad_goal(id,organization_id,workspace_id,project_id,title,description,source,status,idempotency_key,request_fingerprint,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,'DRAFT',$8,$9,$10) RETURNING *", [id, scope.organizationId, scope.workspaceId, scope.projectId, input.title, input.description, input.source, input.idempotencyKey, fingerprint, input.metadata ?? {}]);
      await this.outbox(client, "autonomous.goal.created", "goal", id, id, scope.projectId, 1, { status: "DRAFT" }); return inserted.rows[0];
    });
  }

  async submitPlan(goalId, input) {
    const graph = { tasks: input.tasks.map((task) => ({ ...task, key: task.taskKey ?? task.key })), dependencies: input.dependencies };
    const validation = validateGraph(graph);
    if (!validation.valid) throw new Error(`INVALID_TASK_GRAPH:${validation.errors.map((error) => error.code).join(",")}`);
    return this.transaction(async (client) => {
      const fingerprint = stableHash({ tasks: input.tasks, dependencies: input.dependencies });
      const prior = (await client.query("SELECT * FROM ad_planner_submission WHERE goal_id=$1 AND planner_version=$2 FOR UPDATE", [goalId, input.plannerVersion])).rows[0];
      if (prior) { if (prior.graph_fingerprint !== fingerprint) throw new Error("PLANNER_IDEMPOTENCY_CONFLICT"); return prior; }
      const goal = (await client.query("SELECT * FROM ad_goal WHERE id=$1 FOR UPDATE", [goalId])).rows[0];
      if (!goal) throw new Error("GOAL_NOT_FOUND");
      const ids = new Map(input.tasks.map((task) => [task.taskKey ?? task.key, randomUUID()]));
      for (const task of input.tasks) { const taskKey = task.taskKey ?? task.key; await client.query("INSERT INTO ad_task(id,organization_id,workspace_id,goal_id,project_id,task_key,title,description,priority,risk_level,status,max_attempts,required_capabilities,metadata) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,'PENDING',$11,$12,$13)", [ids.get(taskKey), goal.organization_id, goal.workspace_id, goalId, goal.project_id, taskKey, task.title, task.description ?? "", task.priority ?? "P2", task.riskLevel ?? "MEDIUM", task.maxAttempts ?? 3, JSON.stringify(task.requiredCapabilities ?? []), task.metadata ?? {}]); }
      for (const dependency of input.dependencies) await client.query("INSERT INTO ad_task_dependency(id,goal_id,task_id,depends_on_task_id,dependency_type,required_status) VALUES($1,$2,$3,$4,$5,$6)", [randomUUID(), goalId, ids.get(dependency.taskKey), ids.get(dependency.dependsOnTaskKey), dependency.dependencyType ?? "HARD", dependency.requiredStatus ?? "SUCCEEDED"]);
      const submission = (await client.query("INSERT INTO ad_planner_submission(id,goal_id,planner_version,graph_fingerprint,source_artifact_ref,graph_snapshot) VALUES($1,$2,$3,$4,$5,$6) RETURNING *", [randomUUID(), goalId, input.plannerVersion, fingerprint, input.sourceArtifactRef ?? null, { tasks: input.tasks, dependencies: input.dependencies }])).rows[0];
      await client.query("UPDATE ad_goal SET status='PLANNED',version=version+1 WHERE id=$1", [goalId]);
      await this.outbox(client, "autonomous.goal.planned", "goal", goalId, goalId, goal.project_id, Number(goal.version) + 1, { graphFingerprint: fingerprint });
      return submission;
    });
  }

  async registerWorker(scope, input) {
    return this.transaction(async (client) => (await client.query(`INSERT INTO ad_worker(id,organization_id,workspace_id,worker_key,name,runtime_type,status,max_concurrency,capabilities,metadata)
      VALUES($1,$2,$3,$4,$5,$6,'IDLE',$7,$8,$9)
      ON CONFLICT(organization_id,workspace_id,worker_key) DO UPDATE SET name=excluded.name,runtime_type=excluded.runtime_type,max_concurrency=excluded.max_concurrency,capabilities=excluded.capabilities,metadata=excluded.metadata,last_heartbeat_at=now(),version=ad_worker.version+1 RETURNING *`,
    [input.id ?? randomUUID(), scope.organizationId, scope.workspaceId, input.workerKey, input.displayName, input.runtimeType ?? "none", input.maxConcurrency, JSON.stringify(input.capabilities ?? []), input.metadata ?? {}])).rows[0]);
  }

  async openSession(workerId, ttlSeconds = 120) {
    return this.transaction(async (client) => {
      const sessionId = randomUUID();
      await client.query("UPDATE ad_worker_session SET status='CLOSED',ended_at=now() WHERE worker_id=$1 AND status='ACTIVE'", [workerId]);
      return (await client.query("INSERT INTO ad_worker_session(id,session_id,worker_id,status,started_at,last_heartbeat_at,expires_at) VALUES($1,$1,$2,'ACTIVE',now(),now(),now()+($3||' seconds')::interval) RETURNING *", [sessionId, workerId, ttlSeconds])).rows[0];
    });
  }

  async heartbeat({ workerId, sessionId, ttlSeconds = 120 }) {
    return this.transaction(async (client) => {
      const session = await client.query("UPDATE ad_worker_session SET last_heartbeat_at=now(),expires_at=now()+($3||' seconds')::interval,version=version+1 WHERE session_id=$1 AND worker_id=$2 AND status='ACTIVE' RETURNING *", [sessionId, workerId, ttlSeconds]);
      if (session.rowCount !== 1) throw new Error("SESSION_INACTIVE");
      await client.query("UPDATE ad_worker SET last_heartbeat_at=now(),version=version+1 WHERE id=$1", [workerId]);
      return session.rows[0];
    });
  }

  async setDrain(workerId, draining = true) {
    return this.transaction(async (client) => (await client.query("UPDATE ad_worker SET status=$2,version=version+1 WHERE id=$1 RETURNING *", [workerId, draining ? "DRAINING" : "IDLE"])).rows[0]);
  }

  async schedulerTick({ dryRun = true, limit = 100 } = {}) {
    return this.transaction(async (client) => {
      const candidates = (await client.query("SELECT t.* FROM ad_task t JOIN ad_goal g ON g.id=t.goal_id WHERE t.status IN ('PENDING','BLOCKED','READY') AND g.status IN ('PLANNED','RUNNING') ORDER BY t.created_at,t.task_key FOR UPDATE OF t SKIP LOCKED LIMIT $1", [limit])).rows;
      if (dryRun) return { dryRun: true, candidates, changed: [] };
      const changed = [];
      for (const task of candidates) {
        const deps = (await client.query("SELECT d.*,p.status AS predecessor_status FROM ad_task_dependency d JOIN ad_task p ON p.id=d.depends_on_task_id WHERE d.task_id=$1", [task.id])).rows;
        const failed = deps.some((d) => d.dependency_type !== "OPTIONAL" && ["FAILED", "CANCELLED", "BLOCKED"].includes(d.predecessor_status));
        const ready = deps.every((d) => d.dependency_type === "OPTIONAL" || d.predecessor_status === "SUCCEEDED");
        const next = failed ? "BLOCKED" : ready ? (task.status === "READY" ? "QUEUED" : "READY") : "BLOCKED";
        if (next === task.status) continue;
        const row = await client.query("UPDATE ad_task SET status=$2,ready_at=CASE WHEN $2='READY' THEN now() ELSE ready_at END,version=version+1 WHERE id=$1 AND version=$3 RETURNING version", [task.id, next, task.version]);
        if (row.rowCount !== 1) throw new Error("TASK_VERSION_CONFLICT");
        await this.transition(client, "TASK", task.id, task.goal_id, task.project_id, task.status, next, row.rows[0].version, "scheduler", null);
        await this.outbox(client, `autonomous.task.${next.toLowerCase()}`, "task", task.id, task.goal_id, task.project_id, row.rows[0].version, { previousStatus: task.status, status: next });
        changed.push({ taskId: task.id, previous: task.status, next });
      }
      return { dryRun: false, candidates, changed };
    });
  }

  async reapExpired({ limit = 100 } = {}) {
    return this.transaction(async (client) => {
      const leases = (await client.query("SELECT * FROM ad_task_lease WHERE status='ACTIVE' AND expires_at<=now() ORDER BY expires_at FOR UPDATE SKIP LOCKED LIMIT $1", [limit])).rows;
      for (const lease of leases) {
        await client.query("UPDATE ad_task_lease SET status='EXPIRED',released_at=now(),version=version+1 WHERE id=$1 AND status='ACTIVE'", [lease.id]);
        await client.query("UPDATE ad_task_attempt SET status='LOST',finished_at=now() WHERE id=$1 AND status IN ('CLAIMED','RUNNING')", [lease.attempt_id]);
        await client.query("UPDATE ad_task SET status=CASE WHEN (SELECT count(*) FROM ad_task_attempt WHERE task_id=$1)<max_attempts THEN 'QUEUED' ELSE 'FAILED' END,version=version+1 WHERE id=$1 AND status IN ('CLAIMED','RUNNING')", [lease.task_id]);
        await client.query("UPDATE ad_worker SET active_claims=GREATEST(active_claims-1,0),status=CASE WHEN status='DRAINING' THEN status ELSE 'IDLE' END,version=version+1 WHERE id=$1", [lease.worker_id]);
      }
      return leases.map(({ id, task_id: taskId }) => ({ leaseId: id, taskId }));
    });
  }

  async claimNext({ organizationId, workspaceId, projectId = null, goalId = null, workerId, sessionId, capabilities, leaseSeconds = 60 }) {
    return this.transaction(async (client) => {
      const worker = (await client.query("SELECT * FROM ad_worker WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 FOR UPDATE", [workerId, organizationId, workspaceId])).rows[0];
      if (!worker || ["DRAINING", "OFFLINE", "ERROR"].includes(worker.status) || worker.active_claims >= worker.max_concurrency) throw new Error("WORKER_NOT_CLAIMABLE");
      const session = (await client.query("SELECT * FROM ad_worker_session WHERE session_id=$1 AND worker_id=$2 AND status='ACTIVE' AND expires_at>now() FOR UPDATE", [sessionId, workerId])).rows[0]; if (!session) throw new Error("SESSION_INACTIVE");
      const task = (await client.query(`SELECT t.* FROM ad_task t JOIN ad_goal g ON g.id=t.goal_id WHERE t.organization_id=$1 AND t.workspace_id=$2 AND t.status='QUEUED' AND g.status='RUNNING' AND ($3::text IS NULL OR t.project_id=$3) AND ($4::uuid IS NULL OR t.goal_id=$4) AND t.required_capabilities <@ $5::jsonb AND (t.risk_level<>'CRITICAL' OR t.metadata->>'approvalStatus'='APPROVED') ORDER BY CASE t.priority WHEN 'P0' THEN 0 WHEN 'P1' THEN 1 WHEN 'P2' THEN 2 ELSE 3 END,t.ready_at,t.created_at,t.task_key FOR UPDATE OF t SKIP LOCKED LIMIT 1`, [organizationId, workspaceId, projectId, goalId, JSON.stringify(capabilities)])).rows[0];
      if (!task) throw new Error("NO_CLAIMABLE_TASK");
      const attemptNumber = Number((await client.query("SELECT COALESCE(MAX(attempt_number),0)+1 AS value FROM ad_task_attempt WHERE task_id=$1", [task.id])).rows[0].value); if (attemptNumber > task.max_attempts) throw new Error("ATTEMPT_LIMIT");
      const fencingToken = Number((await client.query("SELECT COALESCE(MAX(fencing_token),0)+1 AS value FROM ad_task_lease WHERE task_id=$1", [task.id])).rows[0].value);
      const attemptId = randomUUID(), leaseId = randomUUID(), leaseToken = randomBytes(32).toString("hex");
      await client.query("INSERT INTO ad_task_attempt(id,task_id,attempt_number,status,worker_id,metadata) VALUES($1,$2,$3,'CLAIMED',$4,$5)", [attemptId, task.id, attemptNumber, workerId, { sessionId }]);
      await client.query("INSERT INTO ad_task_lease(id,task_id,attempt_id,worker_id,session_id,lease_token,fencing_token,status,acquired_at,heartbeat_at,expires_at) VALUES($1,$2,$3,$4,$5,$6,$7,'ACTIVE',now(),now(),now()+($8||' seconds')::interval)", [leaseId, task.id, attemptId, workerId, sessionId, leaseToken, fencingToken, leaseSeconds]);
      await client.query("UPDATE ad_task_attempt SET lease_id=$1 WHERE id=$2", [leaseId, attemptId]);
      const changed = await client.query("UPDATE ad_task SET status='CLAIMED',version=version+1 WHERE id=$1 AND status='QUEUED' AND version=$2 RETURNING version", [task.id, task.version]); if (changed.rowCount !== 1) throw new Error("TASK_VERSION_CONFLICT");
      await client.query("UPDATE ad_worker SET status='CLAIMED',active_claims=active_claims+1,version=version+1 WHERE id=$1", [workerId]);
      await this.transition(client, "TASK", task.id, task.goal_id, task.project_id, "QUEUED", "CLAIMED", changed.rows[0].version, workerId, fencingToken);
      await this.outbox(client, "autonomous.task.claimed", "task", task.id, task.goal_id, task.project_id, changed.rows[0].version, { attemptId, leaseId, workerId, sessionId, fencingToken });
      return { taskId: task.id, attemptId, leaseId, leaseToken, fencingToken, taskVersion: changed.rows[0].version };
    });
  }

  async fencedUpdate(proof, update) {
    return this.transaction(async (client) => {
      const lease = (await client.query("SELECT * FROM ad_task_lease WHERE id=$1 FOR UPDATE", [proof.leaseId])).rows[0];
      if (!lease || lease.status !== "ACTIVE" || lease.expires_at <= new Date() || lease.lease_token !== proof.leaseToken || Number(lease.fencing_token) !== proof.fencingToken || lease.worker_id !== proof.workerId || lease.session_id !== proof.sessionId || lease.version !== proof.expectedVersion) throw new Error("FENCING_REJECTED");
      return update(client, lease);
    });
  }

  async renewLease(proof, leaseSeconds = 60) {
    return this.fencedUpdate(proof, async (client, lease) => (await client.query("UPDATE ad_task_lease SET heartbeat_at=now(),expires_at=now()+($2||' seconds')::interval,version=version+1 WHERE id=$1 AND version=$3 RETURNING *", [lease.id, leaseSeconds, proof.expectedVersion])).rows[0]);
  }

  async releaseLease(proof, { attemptStatus = "CANCELLED", taskStatus = "QUEUED" } = {}) {
    return this.fencedUpdate(proof, async (client, lease) => {
      await client.query("UPDATE ad_task_lease SET status='RELEASED',released_at=now(),version=version+1 WHERE id=$1", [lease.id]);
      await client.query("UPDATE ad_task_attempt SET status=$2,finished_at=now() WHERE id=$1", [lease.attempt_id, attemptStatus]);
      await client.query("UPDATE ad_task SET status=$2,version=version+1 WHERE id=$1", [lease.task_id, taskStatus]);
      await client.query("UPDATE ad_worker SET active_claims=GREATEST(active_claims-1,0),status=CASE WHEN status='DRAINING' THEN status ELSE 'IDLE' END,version=version+1 WHERE id=$1", [lease.worker_id]);
      return { leaseId: lease.id, status: "RELEASED" };
    });
  }
  async outbox(client, type, aggregateType, entityId, goalId, projectId, version, payload) { await client.query("INSERT INTO ad_outbox_event(event_id,event_type,aggregate_type,aggregate_id,aggregate_version,goal_id,project_id,payload) VALUES($1,$2,$3,$4,$5,$6,$7,$8)", [randomUUID(), type, aggregateType, entityId, version, goalId, projectId, { entityId, goalId, projectId, version, timestamp: new Date().toISOString(), ...payload }]); }
  async transition(client, type, entityId, goalId, projectId, previous, next, version, actorId, fencingToken) { await client.query("INSERT INTO ad_state_transition(id,transition_key,entity_type,entity_id,goal_id,project_id,actor_type,actor_id,previous_status,next_status,reason_code,entity_version,metadata) VALUES($1,$2,$3,$4,$5,$6,'WORKER',$7,$8,$9,$10,$11,$12)", [randomUUID(), `${type}:${entityId}:${version}:${next}`, type, entityId, goalId, projectId, actorId, previous, next, "KERNEL_TRANSITION", version, { fencingToken }]); }
}
