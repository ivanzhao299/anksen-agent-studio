import test from 'node:test';
import assert from 'node:assert/strict';
import { buildCustomer360, createLead, createExplainableScore, explainQualification } from '../lib/index.mjs';

const scope={organizationId:'org-1',workspaceId:'ws-1',tenantId:'tenant-a'};

test('GA-007 customer 360 explains why a lead is qualified',()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'website',person:{name:'Buyer'},company:{name:'Example Co'},externalRefs:[{channel:'WEBSITE'}]});
  const score=createExplainableScore({...scope,subjectId:'lead-1',value:84,factors:[{name:'FIT:company',contribution:34},{name:'INTENT:rfq',contribution:50}],calculatedAt:'2026-08-26T00:00:00.000Z'});
  const engagement={...scope,id:'eng-1',leadId:'lead-1',kind:'RFQ',channel:'WEBSITE',occurredAt:'2026-08-26T01:00:00.000Z'};
  const view=buildCustomer360({scope,lead,scoreHistory:[score],engagements:[engagement],qualification:{minScore:70},clock:()=> '2026-08-26T02:00:00.000Z'});
  assert.equal(view.qualification.qualified,true);
  assert.ok(view.qualification.reasons.includes('HIGH_INTENT_ENGAGEMENT'));
  const explanation=explainQualification(view);
  assert.equal(explanation.score,84);
  assert.equal(explanation.latestEngagement.kind,'RFQ');
});

test('GA-007 customer 360 fails closed across tenants',()=>{
  const lead=createLead({...scope,leadId:'lead-1',source:'website'});
  assert.throws(()=>buildCustomer360({scope,lead,engagements:[{...scope,tenantId:'tenant-b'}]}),/cross-tenant/);
});
