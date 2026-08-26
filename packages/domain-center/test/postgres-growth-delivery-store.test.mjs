import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { ensurePostgresFixture, createTestPool } from '../../orchestrator-core/lib/postgres-fixture.mjs';
import { migrateGrowthPlatform } from '../lib/growth-database.mjs';
import { PostgresGrowthDeliveryStore, executeGrowthDelivery, executeBusinessHandoffDelivery } from '../lib/postgres-growth-delivery-store.mjs';

test('delivery ledger is idempotent, retryable, CAS-protected and reconcilable', async () => {
  await ensurePostgresFixture();
  const pool=createTestPool(),suffix=randomUUID(),scope={organizationId:`delivery-${suffix}`,workspaceId:'growth',tenantId:'tenant-a'},other={...scope,tenantId:'tenant-b'};
  try{
    await migrateGrowthPlatform(pool);
    const store=new PostgresGrowthDeliveryStore({pool,clock:()=>new Date('2026-08-26T04:00:00Z')});
    const input={scope,idempotencyKey:`publish-${suffix}`,adapterId:'official-v1',assetRef:'asset/ref-1',approvalRef:'approval/ref-1',maxAttempts:3};
    const registered=await store.register(input),duplicate=await store.register(input);
    assert.equal(registered.duplicate,false);assert.equal(duplicate.duplicate,true);assert.equal(duplicate.operation.id,registered.operation.id);
    await assert.rejects(()=>store.register({...input,assetRef:'asset/ref-2'}),error=>error.code==='DELIVERY_IDEMPOTENCY_PAYLOAD_MISMATCH');
    assert.equal(await store.get(other,registered.operation.id),null);

    let calls=0;
    const adapter={async publish(){calls+=1;if(calls===1)throw Object.assign(new Error('rate limited: secret-not-stored'),{code:'OFFICIAL_API_HTTP_429',retryable:true,status:429});return{externalId:'post-1',status:'PUBLISHED'};}};
    const retryable=await executeGrowthDelivery({store,scope,operation:registered.operation,adapter,retryAt:new Date('2026-08-26T04:00:00Z')});
    assert.equal(retryable.status,'RETRYABLE');assert.equal(retryable.attempts,1);assert.equal(retryable.last_error.code,'OFFICIAL_API_HTTP_429');
    const completed=await executeGrowthDelivery({store,scope,operation:retryable,adapter});
    assert.equal(completed.status,'COMPLETED');assert.equal(completed.attempts,2);assert.equal(completed.external_id,'post-1');
    await assert.rejects(()=>store.beginAttempt({scope,id:completed.id,expectedVersion:completed.version}),error=>error.code==='DELIVERY_NOT_EXECUTABLE_OR_VERSION_CONFLICT');
    const mismatch=await store.reconcile({scope,id:completed.id,expectedVersion:completed.version,observedExternalId:'different',observedStatus:'PUBLISHED'});
    assert.equal(mismatch.reconciliation_status,'MISMATCH');
    const matched=await store.reconcile({scope,id:completed.id,expectedVersion:mismatch.version,observedExternalId:'post-1',observedStatus:'PUBLISHED'});
    assert.equal(matched.reconciliation_status,'MATCHED');
    const dashboard=await store.dashboard(scope);assert.equal(dashboard.summary.completed,1);assert.equal(dashboard.summary.actionRequired,0);assert.deepEqual(dashboard.items,[]);assert.doesNotMatch(JSON.stringify(dashboard),/approval\/ref-1|asset\/ref-1|request_fingerprint/);
    assert.doesNotMatch(JSON.stringify(matched),/secret-not-stored|Bearer|accessToken/);
  }finally{await pool.query('DELETE FROM growth_delivery_operation WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});await pool.end();}
});

test('non-retryable delivery failure becomes terminal without another external call', async () => {
  await ensurePostgresFixture();
  const pool=createTestPool(),suffix=randomUUID(),scope={organizationId:`delivery-terminal-${suffix}`,workspaceId:'growth',tenantId:'tenant-a'};
  try{
    await migrateGrowthPlatform(pool);const store=new PostgresGrowthDeliveryStore({pool});const operation=(await store.register({scope,idempotencyKey:`publish-${suffix}`,adapterId:'official-v1',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'})).operation;
    const failed=await executeGrowthDelivery({store,scope,operation,adapter:{async publish(){throw Object.assign(new Error('approval rejected'),{code:'OFFICIAL_API_APPROVAL_REQUIRED',retryable:false});}}});
    assert.equal(failed.status,'FAILED');assert.equal(failed.next_attempt_at,null);
    await assert.rejects(()=>executeGrowthDelivery({store,scope,operation:failed,adapter:{async publish(){throw new Error('must not run');}}}),error=>error.code==='DELIVERY_NOT_EXECUTABLE_OR_VERSION_CONFLICT');
  }finally{await pool.query('DELETE FROM growth_delivery_operation WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});await pool.end();}
});

test('GA-013 business handoff reuses delivery ledger with source references only',async()=>{
  await ensurePostgresFixture();const pool=createTestPool(),suffix=randomUUID(),scope={organizationId:`handoff-${suffix}`,workspaceId:'growth',tenantId:'tenant-a'};
  try{await migrateGrowthPlatform(pool);const store=new PostgresGrowthDeliveryStore({pool}),operation=(await store.register({scope,idempotencyKey:`handoff-${suffix}`,operationType:'BUSINESS_HANDOFF',adapterId:'crm-v1',capability:'RFQ',assetRef:`lead-${suffix}`,approvalRef:`approval-${suffix}`})).operation;
    const adapter={async execute(request){assert.deepEqual(request.payload,{sourceRef:`lead-${suffix}`});assert.equal(request.approvalRef,`approval-${suffix}`);return{externalId:`RFQ-${suffix}`,status:'OPEN'};}};
    const completed=await executeBusinessHandoffDelivery({store,scope,operation,adapter});assert.equal(completed.status,'COMPLETED');assert.equal(completed.external_id,`RFQ-${suffix}`);assert.equal(completed.operation_type,'BUSINESS_HANDOFF');assert.equal(completed.asset_ref,`lead-${suffix}`);assert.equal('payload' in completed,false);
  }finally{await pool.query('DELETE FROM growth_delivery_operation WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});await pool.end();}
});
