import { defineBusinessIntegrationAdapter } from '../../growth-core/lib/business-integration.mjs';
import {assertBoundedOutboundPayload,assertCredentialToken,assertOfficialApiConfiguration,cancelResponseBody,readBoundedJson,resolveCredentialWithTimeout,safeRetryAfter} from './official-api-safety.mjs';

const referencePattern=/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const unsafeReference=/(?:^sk-|bearer\s+|password\s*=|token\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i;
const assertRef=(value,label)=>{if(typeof value!=='string'||!referencePattern.test(value)||unsafeReference.test(value))throw Object.assign(new Error(`${label}_REFERENCE_INVALID`),{code:`OFFICIAL_BUSINESS_API_${label}_REFERENCE_INVALID`,retryable:false});return value;};

export function createOfficialApiBusinessAdapter({id,system,capabilities=[],endpoint,credentialReferenceId,credentialResolver,allowedHostnames=[],enabled=false,requiresApproval=true,timeoutMs=10_000,maxResponseBytes=64*1024,fetchImpl=globalThis.fetch,allowHttpForTest=false}={}){
  const target=assertOfficialApiConfiguration({endpoint,allowedHostnames,allowHttpForTest,enabled,requiresApproval,timeoutMs,maxResponseBytes,errorPrefix:'OFFICIAL_BUSINESS_API'});
  if(typeof credentialResolver!=='function')throw new TypeError('credentialResolver is required');
  if(typeof fetchImpl!=='function')throw new TypeError('fetch implementation is required');
  const credentialRef=assertRef(credentialReferenceId,'CREDENTIAL');
  const definition=defineBusinessIntegrationAdapter({id,system,capabilities,riskLevel:'HIGH',requiresApproval,async execute(request){
    if(!enabled)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_DISABLED'),{code:'OFFICIAL_BUSINESS_API_DISABLED',retryable:false});
    if(requiresApproval)assertRef(request.approvalRef,'APPROVAL');
    const credential=await resolveCredentialWithTimeout(credentialResolver,{credentialReferenceId:credentialRef,system,id},timeoutMs,'OFFICIAL_BUSINESS_API'),accessToken=assertCredentialToken(credential?.accessToken,'OFFICIAL_BUSINESS_API'),operationId=assertRef(request.operationId,'OPERATION'),payload=assertBoundedOutboundPayload(request.payload,'OFFICIAL_BUSINESS_API');
    const controller=new AbortController(),timeout=setTimeout(()=>controller.abort(),timeoutMs);
    try{
      const response=await fetchImpl(target,{method:'POST',redirect:'error',headers:{'content-type':'application/json',authorization:`Bearer ${accessToken}`,'idempotency-key':operationId},body:JSON.stringify({objectType:request.objectType,leadRef:assertRef(request.leadId,'LEAD'),approvalRef:request.approvalRef,payload,tenant:{organizationId:request.organizationId,workspaceId:request.workspaceId,tenantId:request.tenantId}}),signal:controller.signal});
      if(!response.ok){const code=`OFFICIAL_BUSINESS_API_HTTP_${response.status}`,retryAfter=safeRetryAfter(response.headers.get('retry-after'));await cancelResponseBody(response);throw Object.assign(new Error(code),{code,retryable:response.status===429||response.status>=500,status:response.status,retryAfter});}
      const body=await readBoundedJson(response,maxResponseBytes,'OFFICIAL_BUSINESS_API');
      if(!body||typeof body!=='object'||Array.isArray(body)||Object.getPrototypeOf(body)!==Object.prototype)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_RESPONSE_PAYLOAD_INVALID'),{code:'OFFICIAL_BUSINESS_API_RESPONSE_PAYLOAD_INVALID',retryable:false});
      const externalId=body.id??body.externalId;if(!externalId)throw Object.assign(new Error('OFFICIAL_BUSINESS_API_EXTERNAL_ID_REQUIRED'),{code:'OFFICIAL_BUSINESS_API_EXTERNAL_ID_REQUIRED',retryable:false});
      return{externalId:assertRef(externalId,'EXTERNAL_ID'),status:body.status==null?null:assertRef(body.status,'EXTERNAL_STATUS'),metadata:{system,operationId}};
    }catch(error){if(error?.name==='AbortError')throw Object.assign(new Error('OFFICIAL_BUSINESS_API_TIMEOUT'),{code:'OFFICIAL_BUSINESS_API_TIMEOUT',retryable:true});if(String(error?.code??'').startsWith('OFFICIAL_BUSINESS_API_'))throw error;throw Object.assign(new Error('OFFICIAL_BUSINESS_API_NETWORK_FAILED'),{code:'OFFICIAL_BUSINESS_API_NETWORK_FAILED',retryable:true});}finally{clearTimeout(timeout);}
  }});
  return Object.freeze({...definition,endpoint:target.origin,credentialReferenceId:credentialRef,enabled});
}
