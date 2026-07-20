const contract=(applicationId,sourceType,targetType,relationType,label,sourceStatuses)=>Object.freeze({applicationId,sourceType,targetType,relationType,label,sourceStatuses:Object.freeze(sourceStatuses)});

export const businessRelationContracts=Object.freeze([
  contract("enterprise-strategy-platform","objective","kpi","MEASURED_BY","目标分解指标",["ACTIVE","AT_RISK","WAITING_REVIEW"]),
  contract("enterprise-strategy-platform","objective","initiative","DELIVERED_BY","目标分解举措",["ACTIVE","AT_RISK","WAITING_REVIEW"]),
  contract("enterprise-strategy-platform","objective","strategy_review","REVIEWED_IN","目标进入复盘",["ACTIVE","AT_RISK","WAITING_REVIEW","COMPLETED"]),
  contract("human-resources-platform","position","recruitment_case","STAFFED_BY","岗位发起招聘",["ACTIVE"]),
  contract("human-resources-platform","recruitment_case","onboarding_case","RESULTS_IN","招聘转入职",["COMPLETED"]),
  contract("human-resources-platform","onboarding_case","employee","CREATES","入职建立员工档案",["COMPLETED"]),
  contract("finance-platform","budget","expense","CONTROLS","预算控制费用",["ACTIVE"]),
  contract("finance-platform","budget","payable","FUNDS","预算形成应付",["ACTIVE"]),
  contract("ai-growth-sales-platform","product","campaign","PROMOTED_BY","产品发起营销活动",["ACTIVE"]),
  contract("ai-growth-sales-platform","lead","opportunity","CONVERTS_TO","合格线索转商机",["QUALIFIED"]),
  contract("ai-growth-sales-platform","lead","customer","BECOMES","合格线索建立客户",["QUALIFIED","CONVERTED"]),
  contract("ai-growth-sales-platform","customer","opportunity","HAS_OPPORTUNITY","客户发起商机",["ACTIVE"]),
  contract("intelligent-manufacturing-erp","material","bom","USED_IN","物料进入 BOM",["ACTIVE"]),
  contract("intelligent-manufacturing-erp","bom","work_order","USED_BY","已放行 BOM 创建工单",["RELEASED"]),
  contract("intelligent-manufacturing-erp","work_order","quality_case","GENERATES","工单产生质量事件",["RELEASED","IN_PRODUCTION","COMPLETED","BLOCKED"]),
  contract("smart-park-platform","enterprise","service_order","REQUESTS","入园企业发起服务",["ADMITTED","ACTIVE"]),
  contract("smart-park-platform","enterprise","lease_contract","SIGNS","入园企业签订租约",["ADMITTED","ACTIVE"]),
  contract("smart-park-platform","space","lease_contract","ALLOCATED_BY","空间形成租约",["RESERVED","OCCUPIED"]),
  contract("smart-park-platform","lease_contract","meter","METERED_BY","租约绑定能源表计",["SIGNED","ACTIVE","RENEWED"])
]);

export function relationContractsFor(applicationId,objectType){return businessRelationContracts.filter(item=>item.applicationId===applicationId&&(item.sourceType===objectType||item.targetType===objectType));}
export function assertBusinessRelationContract(applicationId,sourceType,targetType,relationType){const value=businessRelationContracts.find(item=>item.applicationId===applicationId&&item.sourceType===sourceType&&item.targetType===targetType&&item.relationType===relationType);if(!value)throw Object.assign(new Error("BUSINESS_RELATION_DENIED"),{code:"BUSINESS_RELATION_DENIED"});return value;}
