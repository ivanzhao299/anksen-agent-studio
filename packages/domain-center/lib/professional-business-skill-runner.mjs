const check=(code,pass,actual,expected)=>({code,status:pass?"PASS":"FAIL",actual,expected});

const contracts=[
  {contractVersion:"1",applicationId:"finance-platform",objectType:"expense",domainId:"finance-management",businessSkillId:"financial_control_validation",agentId:"finance-control-agent",agentRole:"FINANCE_CONTROL_AGENT",runnerId:"finance-expense-rule-runner-v1",runtimeType:"PROFESSIONAL_RULE_ENGINE",inputObjects:["expense","budget"],requiredRelations:["CONTROLS"],outputType:"FINANCE_EXPENSE_BUDGET_CHECK",humanApprovalRequired:true,status:"ACTIVE"},
  {contractVersion:"1",applicationId:"intelligent-manufacturing-erp",objectType:"work_order",domainId:"production-planning",businessSkillId:"production_release_readiness",agentId:"manufacturing-readiness-agent",agentRole:"MANUFACTURING_PLANNING_AGENT",runnerId:"manufacturing-work-order-readiness-runner-v1",runtimeType:"PROFESSIONAL_RULE_ENGINE",inputObjects:["work_order","bom","routing_sop","inventory"],requiredRelations:["USED_BY","GOVERNS","ALLOCATED_TO"],outputType:"MANUFACTURING_WORK_ORDER_READINESS_CHECK",humanApprovalRequired:true,status:"ACTIVE"}
];

export const professionalBusinessSkillContracts=Object.freeze(contracts.map(item=>Object.freeze({...item,inputObjects:Object.freeze(item.inputObjects),requiredRelations:Object.freeze(item.requiredRelations)})));

const contractFor=record=>professionalBusinessSkillContracts.find(item=>item.applicationId===record?.applicationId&&item.objectType===record?.objectType&&item.status==="ACTIVE")??null;
const csv=value=>String(value??"").split(/[，,;；\n]/).map(item=>item.trim()).filter(Boolean);
const requirements=value=>csv(value).map(item=>{const [materialCode,quantity="1"]=item.split(":").map(part=>part.trim());return{materialCode,quantity:Number(quantity)}}).filter(item=>item.materialCode&&Number.isFinite(item.quantity)&&item.quantity>0);

export class ProfessionalBusinessSkillRunner {
  constructor({clock=()=>new Date()}={}){this.clock=clock;}
  supports(record){return Boolean(contractFor(record));}

  finance(record,relatedRecords,contract){
    const expense=record.fields??{},budgets=relatedRecords.filter(item=>item.applicationId==="finance-platform"&&item.objectType==="budget"),budget=budgets.find(item=>item.status==="ACTIVE"&&item.fields?.budgetCode===expense.budgetCode&&item.fields?.department===expense.department&&item.fields?.currency===expense.currency)??null,expenseYear=Number(String(expense.expenseDate??"").slice(0,4)),checks=[
      check("ACTIVE_BUDGET_LINKED",Boolean(budget),budget?.displayKey??null,"ACTIVE budget linked through CONTROLS"),
      check("BUDGET_CODE_MATCH",Boolean(budget&&budget.fields.budgetCode===expense.budgetCode),expense.budgetCode,budget?.fields?.budgetCode??null),
      check("DEPARTMENT_MATCH",Boolean(budget&&budget.fields.department===expense.department),expense.department,budget?.fields?.department??null),
      check("CURRENCY_MATCH",Boolean(budget&&budget.fields.currency===expense.currency),expense.currency,budget?.fields?.currency??null),
      check("FISCAL_YEAR_MATCH",Boolean(budget&&Number(budget.fields.fiscalYear)===expenseYear),expenseYear,budget?Number(budget.fields.fiscalYear):null),
      check("SINGLE_EXPENSE_WITHIN_BUDGET",Boolean(budget&&Number(expense.amount)<=Number(budget.fields.amount)),Number(expense.amount),budget?Number(budget.fields.amount):null)
    ],failed=checks.filter(item=>item.status==="FAIL"),decision=!budget?"BLOCKED":failed.length?"REVIEW_REQUIRED":"PASS";
    return this.result(contract,decision,checks,{expenseAmount:Number(expense.amount),budgetAmount:budget?Number(budget.fields.amount):null,currency:expense.currency??null,budgetCode:expense.budgetCode??null,department:expense.department??null,expenseDate:expense.expenseDate??null,budgetDisplayKey:budget?.displayKey??null},decision==="PASS"?"SUBMIT_FOR_HUMAN_APPROVAL":"HOLD_AND_REVIEW",["Checks one expense against the linked budget ceiling.","Does not calculate consumed or remaining budget without posted-ledger data."]);
  }

  manufacturing(record,relatedRecords,contract){
    const order=record.fields??{},now=this.clock(),today=now.toISOString().slice(0,10),releasedBoms=relatedRecords.filter(item=>item.objectType==="bom"&&item.status==="RELEASED").sort((a,b)=>String(b.fields?.effectiveDate??"").localeCompare(String(a.fields?.effectiveDate??""))),releasedSops=relatedRecords.filter(item=>item.objectType==="routing_sop"&&item.status==="RELEASED").sort((a,b)=>String(b.fields?.effectiveDate??"").localeCompare(String(a.fields?.effectiveDate??""))),bom=releasedBoms.find(item=>item.fields?.productCode===order.productCode&&item.fields?.plant===order.plant&&item.fields?.effectiveDate<=today)??releasedBoms[0]??null,sop=releasedSops.find(item=>item.fields?.productCode===order.productCode&&item.fields?.plant===order.plant&&item.fields?.effectiveDate<=today)??releasedSops[0]??null,inventories=relatedRecords.filter(item=>item.objectType==="inventory"&&item.status==="COMPLETED"),inventoryFresh=inventories.length>0&&inventories.every(item=>Number.isFinite(Date.parse(item.updatedAt))&&now.getTime()-Date.parse(item.updatedAt)<=24*60*60*1000),required=requirements(bom?.fields?.componentRequirements),available=new Map();
    for(const item of inventories){const key=item.fields?.materialCode;available.set(key,(available.get(key)??0)+Number(item.fields?.quantity??0));}
    const shortage=required.filter(item=>(available.get(item.materialCode)??0)<item.quantity*Number(order.quantity??0)),checks=[
      check("RELEASED_BOM_LINKED",Boolean(bom),bom?.displayKey??null,"RELEASED BOM linked through USED_BY"),
      check("BOM_PRODUCT_MATCH",Boolean(bom&&bom.fields?.productCode===order.productCode),bom?.fields?.productCode??null,order.productCode??null),
      check("BOM_PLANT_MATCH",Boolean(bom&&bom.fields?.plant===order.plant),bom?.fields?.plant??null,order.plant??null),
      check("BOM_EFFECTIVE",Boolean(bom&&bom.fields?.effectiveDate<=today),bom?.fields?.effectiveDate??null,`on or before ${today}`),
      check("BOM_REQUIREMENTS_DECLARED",required.length>0,required.length,"> 0 component requirements"),
      check("BOM_COMPONENT_COUNT_MATCH",Boolean(bom&&required.length===Number(bom.fields?.componentCount)),required.length,bom?Number(bom.fields?.componentCount):null),
      check("RELEASED_SOP_LINKED",Boolean(sop),sop?.displayKey??null,"RELEASED SOP linked through GOVERNS"),
      check("SOP_PRODUCT_MATCH",Boolean(sop&&sop.fields?.productCode===order.productCode),sop?.fields?.productCode??null,order.productCode??null),
      check("SOP_PLANT_MATCH",Boolean(sop&&sop.fields?.plant===order.plant),sop?.fields?.plant??null,order.plant??null),
      check("SOP_EFFECTIVE",Boolean(sop&&sop.fields?.effectiveDate<=today),sop?.fields?.effectiveDate??null,`on or before ${today}`),
      check("CONTROLLED_SOP_REFERENCE",Boolean(sop?.fields?.controlledDocumentRef),sop?.fields?.controlledDocumentRef??null,"non-empty controlled document reference"),
      check("WMS_INVENTORY_LINKED",inventories.length>0,inventories.length,"> 0 COMPLETED inventory records linked through ALLOCATED_TO"),
      check("WMS_SNAPSHOT_FRESH",inventoryFresh,inventories.map(item=>item.updatedAt??null).join(","),"all inventory evidence updated within 24 hours"),
      check("MATERIALS_AVAILABLE",required.length>0&&shortage.length===0,shortage.map(item=>`${item.materialCode}:${available.get(item.materialCode)??0}/${item.quantity*Number(order.quantity??0)}`).join(",")||"none","no shortages")
    ],missingCore=!bom||!sop||inventories.length===0||required.length===0||!inventoryFresh,decision=missingCore||shortage.length?"BLOCKED":checks.some(item=>item.status==="FAIL")?"REVIEW_REQUIRED":"PASS";
    return this.result(contract,decision,checks,{workOrderDisplayKey:record.displayKey??null,productCode:order.productCode??null,plant:order.plant??null,plannedQuantity:Number(order.quantity),unit:order.unit??null,dueDate:order.dueDate??null,bomDisplayKey:bom?.displayKey??null,bomRevision:bom?.fields?.revision??null,sopDisplayKey:sop?.displayKey??null,sopRevision:sop?.fields?.revision??null,inventoryRecordCount:inventories.length,inventoryFresh,requiredMaterials:required,shortages:shortage},decision==="PASS"?"SUBMIT_WORK_ORDER_RELEASE_FOR_HUMAN_APPROVAL":"HOLD_PRODUCTION_RELEASE",["Checks declared BOM component quantities against linked WMS inventory snapshots no older than 24 hours.","Does not reserve stock, calculate capacity, sequence operations, or release the work order automatically."]);
  }

  result(contract,decision,checks,facts,recommendation,limitations){return{schemaVersion:1,outcomeType:contract.outputType,runnerId:contract.runnerId,skillId:contract.businessSkillId,agentId:contract.agentId,agentRole:contract.agentRole,decision,checks,facts,recommendation,limitations,generatedAt:this.clock().toISOString()};}

  execute({record,relatedRecords=[]}={}){const contract=contractFor(record);if(!contract)return null;return contract.applicationId==="finance-platform"?this.finance(record,relatedRecords,contract):this.manufacturing(record,relatedRecords,contract);}
}
