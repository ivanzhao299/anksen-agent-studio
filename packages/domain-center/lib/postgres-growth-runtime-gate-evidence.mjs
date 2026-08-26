import { assertTenantScope } from "../../growth-core/lib/domain-model.mjs";

const required = ["projectId", "approvalId", "goalId", "taskId", "runtimeType", "workerId", "policyVersion"];

export class PostgresGrowthRuntimeGateEvidence {
  constructor({ pool, credentialReferenceReady = async () => false, runtimeHealth = async () => ({ status: "UNPROBED" }), env = process.env } = {}) {
    if (!pool) throw new TypeError("pool is required");
    this.pool = pool;
    this.credentialReferenceReady = credentialReferenceReady;
    this.runtimeHealth = runtimeHealth;
    this.env = env;
  }

  async readiness(scopeValue, binding) {
    const scope = assertTenantScope(scopeValue);
    if (!binding || required.some((key) => !String(binding[key] ?? "").trim()))
      return this.result("NOT_BOUND", ["EXACT_RUNTIME_BINDING_MISSING"]);
    const params = [binding.approvalId, scope.organizationId, scope.workspaceId, binding.projectId, binding.goalId, binding.taskId, binding.runtimeType, binding.workerId, binding.policyVersion],
      approval = (await this.pool.query("SELECT 1 FROM ad_runtime_approval WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND project_id=$4 AND goal_id=$5 AND task_id=$6 AND runtime_type=$7 AND worker_id=$8 AND policy_version=$9 AND status='APPROVED' AND expires_at>now() AND used_count<max_uses", params)).rowCount === 1,
      policy = (await this.pool.query("SELECT 1 FROM ad_project_runtime_policy WHERE organization_id=$1 AND workspace_id=$2 AND project_id=$3 AND policy_version=$4 AND status='ACTIVE' AND allow_push=false AND allow_merge=false AND allow_deploy=false", [scope.organizationId, scope.workspaceId, binding.projectId, binding.policyVersion])).rowCount === 1,
      worker = (await this.pool.query("SELECT 1 FROM ad_worker WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND runtime_type=$4 AND status NOT IN ('OFFLINE','ERROR')", [binding.workerId, scope.organizationId, scope.workspaceId, binding.runtimeType])).rowCount === 1,
      credential = (await this.pool.query("SELECT credential_reference_id FROM ad_credential_reference_binding WHERE organization_id=$1 AND workspace_id=$2 AND project_id=$3 AND runtime_type=$4 AND status='ACTIVE'", [scope.organizationId, scope.workspaceId, binding.projectId, binding.runtimeType])).rows[0],
      credentialReady = Boolean(credential) && (await this.credentialReferenceReady(credential.credential_reference_id)) === true,
      health = await this.runtimeHealth(binding.runtimeType),
      checks = { approval, policy, worker, credentialReferenceReady: credentialReady, runtimeHealth: health?.status === "HEALTHY", featureFlag: this.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED === "true" },
      blockers = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key.replace(/[A-Z]/g, (value) => `_${value}`).toUpperCase());
    return { ...this.result(blockers.length ? "NOT_READY" : "READY", blockers), checks };
  }

  result(status, blockers) {
    return { status, blockers, source: "EXISTING_RUNTIME_ACTIVATION_GATE_EVIDENCE", safety: { approvalConsumed: false, runtimeStarted: false, credentialValuesRead: false, externalCallsPerformed: false } };
  }
}
