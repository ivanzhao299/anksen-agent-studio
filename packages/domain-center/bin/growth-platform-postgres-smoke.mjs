#!/usr/bin/env node
import { randomUUID } from 'node:crypto';
import { ensurePostgresFixture, createTestPool } from '../../orchestrator-core/lib/postgres-fixture.mjs';
import { migrateGrowthPlatform } from '../lib/growth-database.mjs';
import { PostgresGrowthStore } from '../lib/postgres-growth-store.mjs';
import { createLead } from '../../growth-core/lib/domain-model.mjs';
import { createGrowthEvent } from '../../growth-core/lib/growth-events.mjs';

await ensurePostgresFixture();
const pool=createTestPool();
const suffix=randomUUID();
const scope={organizationId:`growth-smoke-org-${suffix}`,workspaceId:'growth-smoke',tenantId:'tenant-a'};
const otherTenant={...scope,tenantId:'tenant-b'};
const leadId=`lead_${suffix}`;
const opportunityId=`opp_${suffix}`;
try{
  await migrateGrowthPlatform(pool);
  const store=new PostgresGrowthStore({pool});
  const lead=createLead({...scope,leadId,source:'WEBSITE',status:'NEW',person:{name:'Buyer'},company:{name:'Example LLC'},externalRefs:[{channel:'WEBSITE',externalId:`form-${suffix}`}],createdAt:'2026-08-26T00:00:00Z'});
  await store.upsertLead({scope,lead});
  const email=await store.resolveIdentity({scope,identityType:'EMAIL',value:'Buyer@Example.com',leadId,source:'WEBSITE'});
  const domain=await store.resolveIdentity({scope,identityType:'DOMAIN',value:'example.com',leadId,source:'LINKEDIN'});
  const repeated=await store.resolveIdentity({scope,identityType:'EMAIL',value:'buyer@example.com',leadId:`other-${suffix}`,source:'OTHER'});
  await store.recordEngagement({scope,engagement:{id:`eng_${suffix}`,leadId,kind:'RFQ',channel:'WEBSITE',payload:{productRef:'product-1'},occurredAt:'2026-08-26T01:00:00Z'}});
  const score={scoreId:`score_${suffix}`,scoreType:'LEAD_QUALITY',value:88,confidence:0.95,factors:[{name:'INTENT:RFQ',contribution:40,source:'WEBSITE',occurredAt:'2026-08-26T01:00:00Z'}],dimensions:{INTENT:40},modelVersion:'growth-score-v1',policyVersion:'smoke-policy-v1',calculatedAt:'2026-08-26T01:01:00Z'};
  const firstScore=await store.recordScore({scope,leadId,score});
  const repeatedScore=await store.recordScore({scope,leadId,score});
  await store.upsertOpportunity({scope,opportunity:{id:opportunityId,leadId,stage:'QUALIFIED',score:88},downstreamRef:{system:'MOCK_CRM',externalId:`crm-${suffix}`}});
  await store.recordRevenue({scope,revenue:{id:`rev_${suffix}`,opportunityId,leadId,amount:125000,currency:'USD',attributedAt:'2026-08-26T02:00:00Z',metadata:{orderRef:`order-${suffix}`}}});
  const event=createGrowthEvent({...scope,eventId:`evt_${suffix}`,eventType:'growth.engagement.received',subjectType:'lead',subjectId:leadId,idempotencyKey:`smoke:${suffix}`,payload:{kind:'RFQ'},occurredAt:'2026-08-26T01:00:00Z'});
  await store.appendEvent({scope,event});
  await store.appendEvent({scope,event});
  const view=await store.customer360({scope,leadId});
  const denied=await store.customer360({scope:otherTenant,leadId});
  const eventCount=Number((await pool.query('SELECT count(*)::int count FROM growth_event WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND idempotency_key=$4',[scope.organizationId,scope.workspaceId,scope.tenantId,event.idempotencyKey])).rows[0].count);
  const result={leadId,identities:view?.identities?.length,engagements:view?.engagements?.length,scoreSnapshots:view?.scoreHistory?.length,latestScore:Number(view?.latestScore?.value),scoreInserted:firstScore.inserted,scoreRepeatedInserted:repeatedScore.inserted,opportunities:view?.opportunities?.length,totalRevenue:view?.totalRevenue,eventCount,emailMatched:email.matched,domainMatched:domain.matched,repeatedMatched:repeated.matched,repeatedLeadId:repeated.leadId,crossTenantVisible:Boolean(denied)};
  if(result.identities!==2||result.engagements!==1||result.scoreSnapshots!==1||result.latestScore!==88||result.scoreInserted!==true||result.scoreRepeatedInserted!==false||result.opportunities!==1||result.totalRevenue!==125000||result.eventCount!==1||result.emailMatched!==false||result.domainMatched!==false||result.repeatedMatched!==true||result.repeatedLeadId!==leadId||result.crossTenantVisible!==false)throw new Error(`GROWTH_POSTGRES_SMOKE_FAILED ${JSON.stringify(result)}`);
  console.log(JSON.stringify({status:'SUCCEEDED',...result},null,2));
}finally{
  await pool.query('DELETE FROM growth_revenue_attribution WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_opportunity WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_engagement WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_score_snapshot WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_identity WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_event WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.query('DELETE FROM growth_lead WHERE organization_id=$1',[scope.organizationId]).catch(()=>{});
  await pool.end();
}
