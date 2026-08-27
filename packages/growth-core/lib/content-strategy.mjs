import { assertTenantScope } from './domain-model.mjs';

const required=(value,name)=>{if(typeof value!=='string'||!value.trim())throw new TypeError(`${name} is required`);return value.trim()};

export function createContentBrief(input){
  const scope=assertTenantScope(input);
  const briefId=input.briefId??`brief_${crypto.randomUUID()}`;
  const objectives=Array.isArray(input.objectives)?input.objectives.filter(Boolean):[];
  if(!objectives.length)throw new TypeError('at least one objective is required');
  const claims=(input.claims??[]).map((claim)=>Object.freeze({text:required(claim.text,'claim.text'),verified:claim.verified===true,evidenceRef:claim.evidenceRef??null}));
  if(input.contentPolicy?.forbidUnverifiedClaims!==false&&claims.some((claim)=>!claim.verified))throw new Error('unverified content claim denied');
  return Object.freeze({...scope,briefId,type:'content_brief',brandId:required(input.brandId,'brandId'),marketId:required(input.marketId,'marketId'),icpId:required(input.icpId,'icpId'),objectives:Object.freeze(objectives),productRefs:Object.freeze([...(input.productRefs??[])]),insightRefs:Object.freeze([...(input.insightRefs??[])]),contentFormats:Object.freeze([...(input.contentFormats??['SHORT_VIDEO'])]),locales:Object.freeze([...(input.locales??['en'])]),claims:Object.freeze(claims),status:input.status??'DRAFT',approvalRequired:input.contentPolicy?.humanApprovalBeforePublish!==false,createdAt:input.createdAt??new Date().toISOString()});
}

export function approveContentBrief(brief,{reviewerId,approvedAt=new Date().toISOString()}={}){
  if(!brief?.briefId)throw new TypeError('brief is required');
  if(!reviewerId)throw new TypeError('reviewerId is required');
  if(!['DRAFT','WAITING_APPROVAL'].includes(brief.status))throw new Error(`brief cannot be approved from ${brief.status}`);
  return Object.freeze({...brief,status:'APPROVED',approvedBy:reviewerId,approvedAt});
}

export function createContentProductionJob({brief,factory='VIDEO_FACTORY',templateRef=null,variants=[]}={}){
  if(!brief?.briefId)throw new TypeError('approved brief is required');
  if(brief.approvalRequired&&brief.status!=='APPROVED')throw new Error('content brief approval required');
  const resolvedVariants=variants.length?variants:brief.locales.flatMap((locale)=>brief.contentFormats.map((format)=>({locale,format})));
  return Object.freeze({jobId:`content_job_${crypto.randomUUID()}`,organizationId:brief.organizationId,workspaceId:brief.workspaceId,tenantId:brief.tenantId,briefId:brief.briefId,factory,templateRef,status:'QUEUED',variants:Object.freeze(resolvedVariants.map((v)=>Object.freeze({...v}))),createdAt:new Date().toISOString()});
}
