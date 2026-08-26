import { assertTenantScope } from './domain-model.mjs';
import { assertAdapterCanExecute } from './channel-adapter.mjs';
import { assertTenantChannelAction } from './tenant-kit.mjs';

export function createPublishingService({scope:rawScope,tenantPack,adapter,clock=()=>new Date().toISOString(),maxAttempts=3}={}){
  const scope=assertTenantScope(rawScope);
  if(!tenantPack)throw new Error('tenantPack is required');
  if(!adapter)throw new Error('adapter is required');
  const operations=new Map();

  function createPlan({assetRef,channel=adapter.channel,scheduledAt=null,createdBy='SYSTEM'}={}){
    if(!assetRef)throw new TypeError('assetRef is required');
    const policy=assertTenantChannelAction(tenantPack,{channel,capability:'PUBLISH_CONTENT'});
    const plan=Object.freeze({planId:`publish_${crypto.randomUUID()}`,...scope,assetRef,channel,scheduledAt,status:policy.approvalRequired?'WAITING_APPROVAL':'READY',approvalRequired:policy.approvalRequired,createdBy,createdAt:clock(),attempts:0});
    operations.set(plan.planId,{...plan});
    return operations.get(plan.planId);
  }

  function approve(planId,{reviewerId}={}){
    const plan=requirePlan(planId);
    if(!plan.approvalRequired)return plan;
    if(!reviewerId)throw new TypeError('reviewerId is required');
    if(plan.status!=='WAITING_APPROVAL')throw new Error(`publish plan cannot be approved from ${plan.status}`);
    Object.assign(plan,{status:'READY',approvedBy:reviewerId,approvedAt:clock()});
    return Object.freeze({...plan});
  }

  async function execute(planId,{operationId=planId}={}){
    const plan=requirePlan(planId);
    if(plan.status==='COMPLETED')return Object.freeze({...plan});
    if(plan.status!=='READY'&&plan.status!=='RETRYABLE')throw new Error(`publish plan not executable from ${plan.status}`);
    if(plan.scheduledAt&&new Date(plan.scheduledAt).getTime()>new Date(clock()).getTime())return Object.freeze({...plan,status:'SCHEDULED'});
    assertAdapterCanExecute({adapter,scope,capability:'PUBLISH_CONTENT',operationId});
    if(typeof adapter.publish!=='function')throw new Error('adapter publish implementation required');
    plan.status='RUNNING';plan.attempts+=1;plan.updatedAt=clock();
    try{
      const result=await adapter.publish({scope,operationId,assetRef:plan.assetRef,channel:plan.channel});
      Object.assign(plan,{status:'COMPLETED',result,resultRef:result?.externalId??result?.url??null,completedAt:clock(),updatedAt:clock()});
      return Object.freeze({...plan});
    }catch(error){
      Object.assign(plan,{status:plan.attempts<maxAttempts?'RETRYABLE':'FAILED',lastError:{code:error.code??'PUBLISH_FAILED',message:String(error.message??error).slice(0,500)},updatedAt:clock()});
      return Object.freeze({...plan});
    }
  }

  function requirePlan(planId){const plan=operations.get(planId);if(!plan)throw new Error('publish plan not found');return plan;}
  return{createPlan,approve,execute,operations};
}
