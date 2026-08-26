import { assertTenantScope } from "../../growth-core/lib/domain-model.mjs";

const required = ["projectId", "approvalId", "goalId", "taskId", "runtimeType", "workerId", "policyVersion"];
const secretLike=value=>/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(String(value??''));
const safeRef=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,159}$/.test(value)&&!secretLike(value);
const boundedProbe=async(fn,args,timeoutMs)=>{const controller=new AbortController();let timer;try{return await Promise.race([Promise.resolve().then(()=>fn(...args,{signal:controller.signal})),new Promise((_,reject)=>{timer=setTimeout(()=>{controller.abort();reject(new Error('GROWTH_RUNTIME_EVIDENCE_PROBE_TIMEOUT'));},timeoutMs);})]);}finally{clearTimeout(timer);}};

export class PostgresGrowthRuntimeGateEvidence {
  constructor({ pool, credentialReferenceReady = async () => false, runtimeHealth = async () => ({ status: "UNPROBED" }),probeTimeoutMs=5000, env = process.env } = {}) {
    if (!pool) throw new TypeError("pool is required");
    if(!Number.isInteger(probeTimeoutMs)||probeTimeoutMs<100||probeTimeoutMs>30000)throw new TypeError("GROWTH_RUNTIME_EVIDENCE_PROBE_TIMEOUT_INVALID");
    this.pool = pool;
    this.credentialReferenceReady = credentialReferenceReady;
    this.runtimeHealth = runtimeHealth;
    this.probeTimeoutMs=probeTimeoutMs;
    this.env = env;
  }

  async readiness(scopeValue, binding) {
    const scope = assertTenantScope(scopeValue);
    if (!binding || required.some((key) => !String(binding[key] ?? "").trim()))
      return this.result("NOT_BOUND", ["EXACT_RUNTIME_BINDING_MISSING"]);
    if(required.some(key=>!safeRef(binding[key])))return this.result("NOT_BOUND",["EXACT_RUNTIME_BINDING_INVALID"]);
    if (binding.runtimeType !== "CODEX")
      return this.result("NOT_BOUND", ["RUNTIME_TYPE_UNSUPPORTED"]);
    const params = [binding.approvalId, scope.organizationId, scope.workspaceId, binding.projectId, binding.goalId, binding.taskId, binding.runtimeType, binding.workerId, binding.policyVersion],
      approval = (await this.pool.query("SELECT 1 FROM ad_runtime_approval WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND project_id=$4 AND goal_id=$5 AND task_id=$6 AND runtime_type=$7 AND worker_id=$8 AND policy_version=$9 AND status='APPROVED' AND expires_at>now() AND used_count<max_uses", params)).rowCount === 1,
      policy = (await this.pool.query("SELECT 1 FROM ad_project_runtime_policy WHERE organization_id=$1 AND workspace_id=$2 AND project_id=$3 AND policy_version=$4 AND status='ACTIVE' AND allow_push=false AND allow_merge=false AND allow_deploy=false", [scope.organizationId, scope.workspaceId, binding.projectId, binding.policyVersion])).rowCount === 1,
      worker = (await this.pool.query("SELECT 1 FROM ad_worker WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND runtime_type=$4 AND status NOT IN ('OFFLINE','ERROR')", [binding.workerId, scope.organizationId, scope.workspaceId, binding.runtimeType])).rowCount === 1,
      credential = (await this.pool.query("SELECT credential_reference_id FROM ad_credential_reference_binding WHERE organization_id=$1 AND workspace_id=$2 AND project_id=$3 AND runtime_type=$4 AND status='ACTIVE'", [scope.organizationId, scope.workspaceId, binding.projectId, binding.runtimeType])).rows[0],
      featureFlag = this.env.AUTONOMOUS_RUNTIME_CODEX_ENABLED === "true",
      credentialReferenceValid=safeRef(credential?.credential_reference_id),
      prerequisitesReady = approval && policy && worker && credentialReferenceValid && featureFlag;
    let credentialReady=false,health=null,readOnlyProbesPerformed=0;
    if(prerequisitesReady){readOnlyProbesPerformed+=1;try{credentialReady=(await boundedProbe(this.credentialReferenceReady,[credential.credential_reference_id],this.probeTimeoutMs))===true;}catch{credentialReady=false;}}
    if(credentialReady){readOnlyProbesPerformed+=1;try{health=await boundedProbe(this.runtimeHealth,[binding.runtimeType],this.probeTimeoutMs);}catch{health=null;}}
    const
      checks = { approval, policy, worker, credentialReferenceReady: credentialReady, runtimeHealth: health?.status === "HEALTHY", featureFlag },
      blockers = Object.entries(checks).filter(([, pass]) => !pass).map(([key]) => key.replace(/[A-Z]/g, (value) => `_${value}`).toUpperCase());
    return { ...this.result(blockers.length ? "NOT_READY" : "READY", blockers,readOnlyProbesPerformed), checks };
  }

  result(status, blockers,readOnlyProbesPerformed=0) {
    return { status, blockers, source: "EXISTING_RUNTIME_ACTIVATION_GATE_EVIDENCE", safety: { approvalConsumed: false, runtimeStarted: false, credentialValuesRead: false, externalCallsPerformed: readOnlyProbesPerformed>0,externalWritesPerformed:false,readOnlyProbesPerformed } };
  }
}
