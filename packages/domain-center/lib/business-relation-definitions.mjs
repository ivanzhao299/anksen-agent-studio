const contract=(applicationId,sourceType,targetType,relationType,label)=>Object.freeze({applicationId,sourceType,targetType,relationType,label});

export const businessRelationContracts=Object.freeze([
  contract("enterprise-strategy-platform","objective","kpi","MEASURED_BY","目标指标"),
  contract("human-resources-platform","recruitment_case","onboarding_case","RESULTS_IN","招聘转入职"),
  contract("finance-platform","budget","expense","CONTROLS","预算控制费用"),
  contract("ai-growth-sales-platform","lead","opportunity","CONVERTS_TO","线索转商机"),
  contract("intelligent-manufacturing-erp","bom","work_order","USED_BY","BOM 用于工单"),
  contract("smart-park-platform","enterprise","service_order","REQUESTS","企业发起服务")
]);

export function relationContractsFor(applicationId,objectType){return businessRelationContracts.filter(item=>item.applicationId===applicationId&&(item.sourceType===objectType||item.targetType===objectType));}
export function assertBusinessRelationContract(applicationId,sourceType,targetType,relationType){const value=businessRelationContracts.find(item=>item.applicationId===applicationId&&item.sourceType===sourceType&&item.targetType===targetType&&item.relationType===relationType);if(!value)throw Object.assign(new Error("BUSINESS_RELATION_DENIED"),{code:"BUSINESS_RELATION_DENIED"});return value;}
