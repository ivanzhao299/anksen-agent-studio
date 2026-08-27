import test from 'node:test';
import assert from 'node:assert/strict';
import { defineTenantPack, assertTenantChannelAction, selectIcp } from '../lib/index.mjs';

const base={organizationId:'org',workspaceId:'growth',tenantId:'tenant-a',name:'Tenant A',brands:[{id:'brand-a',name:'Brand A'}],markets:[{id:'us',country:'US'}],icps:[{id:'buyer',name:'Buyer',roles:['BUYER'],industries:['INDUSTRIAL'],markets:['us']}],channelPolicies:{EMAIL:{enabled:true,allowedCapabilities:['SEND_MESSAGE'],requiresApproval:['SEND_MESSAGE'],dailyWriteLimit:20}}};

test('tenant pack is industry agnostic and policy gated',()=>{const pack=defineTenantPack(base);assert.equal(pack.tenantId,'tenant-a');assert.equal(selectIcp(pack,{marketId:'us',role:'BUYER'}).length,1);const action=assertTenantChannelAction(pack,{channel:'EMAIL',capability:'SEND_MESSAGE'});assert.equal(action.allowed,true);assert.equal(action.approvalRequired,true);assert.equal(action.dailyWriteLimit,20);assert.throws(()=>assertTenantChannelAction(pack,{channel:'EMAIL',capability:'PUBLISH_CONTENT'}),/denied/)});

test('unrelated second tenant uses same schema without fork',()=>{const pack=defineTenantPack({...base,tenantId:'tenant-food',name:'Food Distribution',brands:[{id:'food',name:'Food'}],markets:[{id:'laos',country:'LA'}],icps:[{id:'wholesaler',name:'Wholesaler',roles:['OWNER'],industries:['FOOD_DISTRIBUTION'],markets:['laos']}],channelPolicies:{WEBSITE:{enabled:true,allowedCapabilities:['RECEIVE_WEBHOOK'],requiresApproval:[]}}});assert.equal(pack.icps[0].industries[0],'FOOD_DISTRIBUTION');assert.equal(pack.markets[0].country,'LA')});

test('tenant pack requires brand market and ICP',()=>{assert.throws(()=>defineTenantPack({...base,brands:[]}),/brand/);assert.throws(()=>defineTenantPack({...base,markets:[]}),/market/);assert.throws(()=>defineTenantPack({...base,icps:[]}),/ICP/)});

test('optional Runtime activation binding is exact, immutable and CODEX-only',()=>{
  const runtimeActivationBinding={projectId:'growth-project',approvalId:'approval-1',goalId:'goal-1',taskId:'task-1',runtimeType:'CODEX',workerId:'worker-1',policyVersion:'policy-v1',ignored:'not-projected'},pack=defineTenantPack({...base,metadata:{runtimeActivationBinding}});
  assert.deepEqual(pack.metadata.runtimeActivationBinding,{projectId:'growth-project',approvalId:'approval-1',goalId:'goal-1',taskId:'task-1',runtimeType:'CODEX',workerId:'worker-1',policyVersion:'policy-v1'});
  assert.equal(Object.isFrozen(pack.metadata.runtimeActivationBinding),true);
  assert.throws(()=>defineTenantPack({...base,metadata:{runtimeActivationBinding:{...runtimeActivationBinding,taskId:''}}}),/taskId is required/);
  assert.throws(()=>defineTenantPack({...base,metadata:{runtimeActivationBinding:{...runtimeActivationBinding,runtimeType:'CONTROLLED_STUB'}}}),/must be CODEX/);
});
