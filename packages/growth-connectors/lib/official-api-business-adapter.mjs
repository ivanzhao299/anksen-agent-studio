import { defineBusinessIntegrationAdapter } from '../../growth-core/lib/business-integration.mjs';

const referencePattern=/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const unsafeReference=/(?:^sk-|bearer\s+|password\s*=|token\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i;
const assertRef=(value,label)=>{if(!referencePattern.test(String(value??''))||unsafeReference.test(String(value)))throw new Error(`${label}_REFERENCE_INVALID`);return String(value);};

export function createOfficialApiBusinessAdapter({id,system,capabilities=[],endpoint,credentialReferenceId,credentialResolver,allowedHostnames=[],enabled=false,requiresApproval=true,timeoutMs=10_000,fetchImpl=globalThis.fetch,allowHttpForTest=false}={}){
  const target=new URL(endpoint);
  if(target.protocol!=='https:'&&!allowHttpForTest)throw new Error('OFFICIAL_BUSINESS_API_HTTPS_REQUIRED');
  if(!allowedHostnames.includes(target.hostname))throw new Error('OFFICIAL_BUSINESS_API_HOST_DENIED');
  if(typeof credentialResolver!=='function')throw new TypeError('credentialResolver is required');
  const credentialRef=assertRef(credentialReferenceId,'CREDENTIAL');
  const definition=defineBusinessIntegrationAdapter({id,system,capabilities,riskLevel:'HIGH',requiresApproval,async execute(request){
    if(!enabled)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_DISABLED'),{code:'OFFICIAL_BUSINESS_API_DISABLED',retryable:false});
    if(requiresApproval)assertRef(request.approvalRef,'APPROVAL');
    const credential=await credentialResolver({credentialReferenceId:credentialRef,system,id});
    if(!credential?.accessToken)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_CREDENTIAL_UNAVAILABLE'),{code:'OFFICIAL_BUSINESS_API_CREDENTIAL_UNAVAILABLE',retryable:false});
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(target,{method:'POST',headers:{'content-type':'application/json',authorization:`Bearer ${credential.accessToken}`,'idempotency-key':request.operationId},body:JSON.stringify({objectType:request.objectType,leadRef:assertRef(request.leadId,'LEAD'),approvalRef:request.approvalRef,payload:request.payload,tenant:{organizationId:request.organizationId,workspaceId:request.workspaceId,tenantId:request.tenantId}}),signal:controller.signal});
      let body={};try{body=await response.json();}catch{}
      if(!response.ok){const code=`OFFICIAL_BUSINESS_API_HTTP_${response.status}`;throw Object.assign(new Error(code),{code,retryable:response.status===429||response.status>=500,status:response.status,retryAfter:response.headers.get('retry-after')??null});}
      const externalId=body.id??body.externalId;if(!externalId)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_EXTERNAL_ID_REQUIRED'),{code:'OFFICIAL_BUSINESS_API_EXTERNAL_ID_REQUIRED',retryable:false});
      return{externalId:String(externalId),status:body.status??null,metadata:{system,operationId:request.operationId}};
    }catch(error){if(error?.name==='AbortError')throw Object.assign(new Error('OFFICIAL_BUSINESS_API_TIMEOUT'),{code:'OFFICIAL_BUSINESS_API_TIMEOUT',retryable:true});throw error;}finally{clearTimeout(timeout);}
  }});
  return Object.freeze({...definition,endpoint:target.origin,credentialReferenceId:credentialRef,enabled:Boolean(enabled)});
}
