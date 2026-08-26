import test from 'node:test';
import assert from 'node:assert/strict';
import {createServer} from 'node:http';
import {once} from 'node:events';
import {createLead} from '../../growth-core/lib/domain-model.mjs';
import {handoffCommercialObject} from '../../growth-core/lib/business-integration.mjs';
import {createOfficialApiBusinessAdapter} from '../lib/official-api-business-adapter.mjs';

const scope={organizationId:'org-1',workspaceId:'growth',tenantId:'tenant-a'},lead=createLead({...scope,leadId:'lead-1',source:'WEBSITE'});
async function fixture(handler){const server=createServer(handler);server.listen(0,'127.0.0.1');await once(server,'listening');return{server,endpoint:`http://127.0.0.1:${server.address().port}/rfq`};}

test('official business handoff is default-disabled and approval gated',async()=>{const adapter=createOfficialApiBusinessAdapter({id:'crm-v1',system:'CRM',capabilities:['RFQ'],endpoint:'http://127.0.0.1/rfq',allowedHostnames:['127.0.0.1'],allowHttpForTest:true,credentialReferenceId:'vault-ref/crm',credentialResolver:async()=>({accessToken:'ephemeral'})});await assert.rejects(()=>handoffCommercialObject({scope,adapter,objectType:'RFQ',lead,operationId:'op-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_BUSINESS_API_DISABLED');await assert.rejects(()=>handoffCommercialObject({scope,adapter,objectType:'RFQ',lead,operationId:'op-2'}),/approvalRef/);});

test('official business handoff returns only authoritative references',async()=>{let captured;const{server,endpoint}=await fixture(async(request,response)=>{let body='';for await(const chunk of request)body+=chunk;captured={headers:request.headers,body};response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'RFQ-001',status:'OPEN'}));});try{const adapter=createOfficialApiBusinessAdapter({id:'crm-v1',system:'CRM',capabilities:['RFQ'],endpoint,allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,credentialReferenceId:'vault-ref/crm',credentialResolver:async()=>({accessToken:'ephemeral-secret'})});const result=await handoffCommercialObject({scope,adapter,objectType:'RFQ',lead,payload:{quantity:100},operationId:'op-1',approvalRef:'approval/ref-1'});assert.equal(result.externalId,'RFQ-001');assert.equal(result.authoritative,true);assert.equal(captured.headers['idempotency-key'],'op-1');assert.doesNotMatch(captured.body,/ephemeral-secret|vault-ref\/crm/);assert.doesNotMatch(JSON.stringify(result),/ephemeral-secret/);}finally{server.close();}});
