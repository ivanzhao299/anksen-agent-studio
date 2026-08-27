import test from 'node:test';
import assert from 'node:assert/strict';
import {
  buildGrowthCockpit,
  createAttributionEngine,
  createEngagementIngestion,
  createFollowUpOrchestrator,
  createLead,
  createQualificationEngine,
  defineBusinessIntegrationAdapter,
  handoffCommercialObject,
  traceRevenuePath,
} from '../lib/index.mjs';

const scope={organizationId:'org-1',workspaceId:'ws-1',tenantId:'tenant-a'};

test('GA-011/012 engagement drives SQL and a human sales next action',()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'website'});
  const engagement=createEngagementIngestion({scope});
  const row=engagement.ingest({leadId:'lead-1',kind:'RFQ',channel:'WEBSITE',sourceEventId:'form-1'});
  assert.equal(engagement.recommendResponse('lead-1').action,'HUMAN_SALES_RESPONSE');
  const qualification=createQualificationEngine({scope,policy:{mqlThreshold:60,sqlThreshold:75}});
  const result=qualification.evaluate({lead,score:{value:62},engagements:[row]});
  assert.equal(result.stage,'SQL');
  assert.equal(qualification.nextBestAction(result).action,'HUMAN_SALES_CONTACT');
});

test('GA-013 downstream system remains authoritative and approval referenced',async()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'website'});
  const adapter=defineBusinessIntegrationAdapter({id:'crm-1',system:'CRM',capabilities:['RFQ'],requiresApproval:true,async execute(req){assert.equal(req.leadId,'lead-1');assert.equal(req.approvalRef,'approval:handoff-1');return{externalId:'RFQ-2026-001',status:'OPEN'}}});
  await assert.rejects(()=>handoffCommercialObject({scope,adapter,objectType:'RFQ',lead,payload:{quantity:1000},operationId:'op-denied'}),/approvalRef/);
  const ref=await handoffCommercialObject({scope,adapter,objectType:'RFQ',lead,payload:{quantity:1000},operationId:'op-1',approvalRef:'approval:handoff-1'});
  assert.equal(ref.authoritative,true);
  assert.equal(ref.externalId,'RFQ-2026-001');
  assert.equal(ref.approvalRef,'approval:handoff-1');
});

test('GA-014 follow-up stops on conversion or opt-out',()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'website'});
  const follow=createFollowUpOrchestrator({scope,policy:{maxAttempts:3,minHoursBetween:24}});
  assert.equal(follow.plan({lead,engagements:[{...scope,kind:'OPT_OUT',consent:{optOut:true}}]}).action,'STOP');
  assert.equal(follow.plan({lead,engagements:[{...scope,kind:'ORDER'}]}).action,'STOP');
});

test('GA-015/017 revenue can be traced through attribution into the cockpit',()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'LINKEDIN'});
  const attribution=createAttributionEngine({scope,model:'LINEAR'});
  const t1=attribution.recordTouch({leadId:'lead-1',channel:'LINKEDIN',campaignId:'c1',contentId:'v1',occurredAt:'2026-08-01T00:00:00.000Z'});
  const t2=attribution.recordTouch({leadId:'lead-1',channel:'WEBSITE',campaignId:'c1',contentId:'landing',occurredAt:'2026-08-20T00:00:00.000Z'});
  const conversion=attribution.attribute({leadId:'lead-1',opportunityId:'opp-1',amount:100000,currency:'USD',convertedAt:'2026-08-26T00:00:00.000Z'});
  assert.equal(conversion.allocations.length,2);
  const cockpit=buildGrowthCockpit({scope,funnel:{leads:10,mql:5,sql:3,opportunities:2,orders:1,revenue:100000},attribution:attribution.summarize()});
  assert.equal(cockpit.conversion.opportunityToOrder,0.5);
  const path=traceRevenuePath({revenue:conversion,opportunity:{id:'opp-1'},lead,touches:[t1,t2]});
  assert.equal(path.leadId,'lead-1');
  assert.equal(path.touches.length,2);
});
