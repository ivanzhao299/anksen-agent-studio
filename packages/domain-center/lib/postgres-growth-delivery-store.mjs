import { createHash, randomUUID } from 'node:crypto';
import { assertTenantScope } from '../../growth-core/lib/domain-model.mjs';

const fingerprint = (value) => createHash('sha256').update(JSON.stringify(value)).digest('hex');
const cleanError = (error) => ({ code: String(error?.code ?? 'DELIVERY_FAILED').slice(0,100), message: String(error?.message ?? error ?? 'delivery failed').slice(0,500), retryable: Boolean(error?.retryable), status: Number.isInteger(error?.status) ? error.status : null });

export class PostgresGrowthDeliveryStore {
  constructor({ pool, clock = () => new Date() } = {}) { if (!pool) throw new TypeError('pool is required'); this.pool=pool; this.clock=clock; }

  async register({ scope: rawScope, idempotencyKey, operationType='PUBLISH', adapterId, capability='PUBLISH_CONTENT', assetRef, approvalRef=null, maxAttempts=3 }) {
    const scope=assertTenantScope(rawScope), id=`delivery_${randomUUID()}`, now=this.clock();
    if(!idempotencyKey||!adapterId||!assetRef)throw new TypeError('idempotencyKey, adapterId and assetRef are required');
    const requestFingerprint=fingerprint({operationType,adapterId,capability,assetRef,approvalRef});
    const inserted=await this.pool.query(`INSERT INTO growth_delivery_operation(id,organization_id,workspace_id,tenant_id,idempotency_key,operation_type,adapter_id,capability,asset_ref,approval_ref,request_fingerprint,status,max_attempts,created_at,updated_at)
      VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,'READY',$12,$13,$13) ON CONFLICT(organization_id,workspace_id,tenant_id,idempotency_key) DO NOTHING RETURNING *`,[id,scope.organizationId,scope.workspaceId,scope.tenantId,idempotencyKey,operationType,adapterId,capability,assetRef,approvalRef,requestFingerprint,maxAttempts,now]);
    if(inserted.rowCount)return{duplicate:false,operation:inserted.rows[0]};
    const existing=await this.getByIdempotencyKey(scope,idempotencyKey);
    if(!existing)throw new Error('DELIVERY_IDEMPOTENCY_CONFLICT_UNREADABLE');
    if(existing.request_fingerprint!==requestFingerprint)throw Object.assign(new Error('DELIVERY_IDEMPOTENCY_PAYLOAD_MISMATCH'),{code:'DELIVERY_IDEMPOTENCY_PAYLOAD_MISMATCH'});
    return{duplicate:true,operation:existing};
  }

  async getByIdempotencyKey(rawScope,idempotencyKey){const scope=assertTenantScope(rawScope),result=await this.pool.query('SELECT * FROM growth_delivery_operation WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND idempotency_key=$4',[scope.organizationId,scope.workspaceId,scope.tenantId,idempotencyKey]);return result.rows[0]??null;}
  async get(rawScope,id){const scope=assertTenantScope(rawScope),result=await this.pool.query('SELECT * FROM growth_delivery_operation WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4',[id,scope.organizationId,scope.workspaceId,scope.tenantId]);return result.rows[0]??null;}

  async beginAttempt({scope:rawScope,id,expectedVersion}){const scope=assertTenantScope(rawScope),now=this.clock(),result=await this.pool.query(`UPDATE growth_delivery_operation SET status='RUNNING',attempts=attempts+1,version=version+1,updated_at=$5 WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 AND version=$6 AND status IN ('READY','RETRYABLE') AND (next_attempt_at IS NULL OR next_attempt_at<=$5) AND attempts<max_attempts RETURNING *`,[id,scope.organizationId,scope.workspaceId,scope.tenantId,now,expectedVersion]);if(!result.rowCount)throw Object.assign(new Error('DELIVERY_NOT_EXECUTABLE_OR_VERSION_CONFLICT'),{code:'DELIVERY_NOT_EXECUTABLE_OR_VERSION_CONFLICT'});return result.rows[0];}

  async complete({scope:rawScope,id,expectedVersion,result:external}){const scope=assertTenantScope(rawScope),now=this.clock(),result=await this.pool.query(`UPDATE growth_delivery_operation SET status='COMPLETED',external_id=$5,external_status=$6,reconciliation_status='PENDING',last_error=NULL,version=version+1,updated_at=$7 WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 AND version=$8 AND status='RUNNING' RETURNING *`,[id,scope.organizationId,scope.workspaceId,scope.tenantId,external.externalId,external.status??null,now,expectedVersion]);if(!result.rowCount)throw Object.assign(new Error('DELIVERY_COMPLETION_VERSION_CONFLICT'),{code:'DELIVERY_COMPLETION_VERSION_CONFLICT'});return result.rows[0];}

  async fail({scope:rawScope,id,expectedVersion,error,retryAt=null}){const scope=assertTenantScope(rawScope),current=await this.get(scope,id);if(!current||current.version!==expectedVersion||current.status!=='RUNNING')throw Object.assign(new Error('DELIVERY_FAILURE_VERSION_CONFLICT'),{code:'DELIVERY_FAILURE_VERSION_CONFLICT'});const retryable=Boolean(error?.retryable)&&current.attempts<current.max_attempts,status=retryable?'RETRYABLE':'FAILED',now=this.clock(),result=await this.pool.query(`UPDATE growth_delivery_operation SET status=$5,next_attempt_at=$6,last_error=$7,version=version+1,updated_at=$8 WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 AND version=$9 AND status='RUNNING' RETURNING *`,[id,scope.organizationId,scope.workspaceId,scope.tenantId,status,retryable?retryAt:null,cleanError(error),now,expectedVersion]);if(!result.rowCount)throw Object.assign(new Error('DELIVERY_FAILURE_VERSION_CONFLICT'),{code:'DELIVERY_FAILURE_VERSION_CONFLICT'});return result.rows[0];}

  async reconcile({scope:rawScope,id,expectedVersion,observedExternalId,observedStatus}){const scope=assertTenantScope(rawScope),current=await this.get(scope,id);if(!current||current.status!=='COMPLETED')throw Object.assign(new Error('DELIVERY_NOT_RECONCILABLE'),{code:'DELIVERY_NOT_RECONCILABLE'});const reconciliationStatus=current.external_id===observedExternalId&&(!observedStatus||current.external_status===observedStatus)?'MATCHED':'MISMATCH',now=this.clock(),result=await this.pool.query(`UPDATE growth_delivery_operation SET reconciliation_status=$5,version=version+1,updated_at=$6 WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 AND version=$7 RETURNING *`,[id,scope.organizationId,scope.workspaceId,scope.tenantId,reconciliationStatus,now,expectedVersion]);if(!result.rowCount)throw Object.assign(new Error('DELIVERY_RECONCILIATION_VERSION_CONFLICT'),{code:'DELIVERY_RECONCILIATION_VERSION_CONFLICT'});return result.rows[0];}
}

export async function executeGrowthDelivery({store,scope,operation,adapter,retryAt=null}){
  const running=await store.beginAttempt({scope,id:operation.id,expectedVersion:operation.version});
  try{const result=await adapter.publish({scope,operationId:operation.idempotency_key,assetRef:operation.asset_ref,approvalRef:operation.approval_ref});return await store.complete({scope,id:operation.id,expectedVersion:running.version,result});}
  catch(error){return await store.fail({scope,id:operation.id,expectedVersion:running.version,error,retryAt});}
}
