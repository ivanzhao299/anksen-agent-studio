import { getEnterpriseApplication } from "./enterprise-applications.mjs";

const decisions=new Set(["PASS","REVIEW_REQUIRED","BLOCKED"]);
const bounded=(value,fallback,max)=>Math.max(0,Math.min(Number(value)||fallback,max));

export function projectProfessionalResult(workItem){
  const result=workItem?.resultSummary,outcome=result?.professionalOutcome,application=getEnterpriseApplication(workItem?.applicationId);
  if(!application||result?.resultType!=="PROFESSIONAL_BUSINESS_OUTCOME"||result.businessOutcomeProduced!==true||!outcome)return null;
  return Object.freeze({id:`professional-result:${workItem.id}:v${workItem.version}`,applicationId:application.id,applicationName:application.name,workItemId:workItem.id,workVersion:Number(workItem.version),workStatus:workItem.status,businessObject:{...workItem.businessObject,href:`${application.path}?record=${workItem.businessObject.objectId}`},outcomeType:outcome.outcomeType,decision:outcome.decision,runnerId:outcome.runnerId,skillId:outcome.skillId,agentId:outcome.agentId,checks:outcome.checks,facts:outcome.facts,recommendation:outcome.recommendation,limitations:outcome.limitations,generatedAt:outcome.generatedAt,runtimeMode:result.runtimeMode,nextAction:result.nextAction,updatedAt:workItem.updatedAt});
}

export function professionalResultPage(workItems,{applicationIds=[],applicationId=null,decision=null,limit=50,offset=0}={}){
  const allowed=new Set(applicationIds),requestedDecision=String(decision??"").trim().toUpperCase(),normalizedDecision=!requestedDecision?null:decisions.has(requestedDecision)?requestedDecision:"__INVALID__",safeOffset=bounded(offset,0,100000),safeLimit=Math.max(1,bounded(limit,50,100));
  const all=workItems.map(projectProfessionalResult).filter(Boolean).filter(item=>allowed.has(item.applicationId)&&(!applicationId||item.applicationId===applicationId)&&(!normalizedDecision||item.decision===normalizedDecision)).sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))),items=all.slice(safeOffset,safeOffset+safeLimit);
  return Object.freeze({items,total:all.length,pagination:{limit:safeLimit,offset:safeOffset,hasMore:safeOffset+items.length<all.length},summary:{pass:all.filter(item=>item.decision==="PASS").length,reviewRequired:all.filter(item=>item.decision==="REVIEW_REQUIRED").length,blocked:all.filter(item=>item.decision==="BLOCKED").length,waitingHuman:all.filter(item=>["WAITING_APPROVAL","WAITING_REVIEW"].includes(item.workStatus)).length}});
}
