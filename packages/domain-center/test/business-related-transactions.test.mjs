import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";

const cases = [
  { applicationId:"enterprise-strategy-platform", relationType:"MEASURED_BY", source:{objectType:"objective",title:"提升经营质量",displayKey:"OBJ-CHAIN",fields:{period:"2027-2029",perspective:"运营",targetValue:20,unit:"%",responsibleCenter:"经营中心"}}, target:{objectType:"kpi",title:"经营质量指标",displayKey:"KPI-CHAIN",fields:{period:"2027",baseline:10,targetValue:20,actualValue:12,unit:"%",ownerDepartment:"经营中心"}} },
  { applicationId:"human-resources-platform", relationType:"RESULTS_IN", source:{objectType:"recruitment_case",title:"招聘经营分析经理",displayKey:"REC-CHAIN",fields:{department:"经营中心",positionName:"经营分析经理",headcount:1,targetDate:"2026-10-01",employmentType:"全职",reason:"补充经营分析能力"}}, target:{objectType:"onboarding_case",title:"经营分析经理入职",displayKey:"ONB-CHAIN",fields:{employeeName:"候选人甲",department:"经营中心",positionName:"经营分析经理",startDate:"2026-10-01",manager:"经营中心负责人"}} },
  { applicationId:"finance-platform", relationType:"CONTROLS", source:{objectType:"budget",title:"市场年度预算",displayKey:"BUD-CHAIN",fields:{fiscalYear:2027,department:"市场中心",budgetCode:"MKT-2027",amount:500000,currency:"CNY"}}, target:{objectType:"expense",title:"市场活动费用",displayKey:"EXP-CHAIN",fields:{expenseDate:"2026-09-01",department:"市场中心",category:"采购",amount:20000,currency:"CNY",budgetCode:"MKT-2027",description:"市场活动物料"}} },
  { applicationId:"ai-growth-sales-platform", relationType:"CONVERTS_TO", source:{objectType:"lead",title:"制造企业线索",displayKey:"LEAD-CHAIN",fields:{source:"官网",contactName:"李经理",company:"示例制造",contactChannel:"authorized-ref-001",consentStatus:"已授权",interest:"能源管理"}}, target:{objectType:"opportunity",title:"能源管理商机",displayKey:"OPP-CHAIN",fields:{customerName:"示例制造",productCode:"ENERGY",estimatedAmount:100000,probability:30,expectedCloseDate:"2026-12-01",owner:"销售经理"}} },
  { applicationId:"intelligent-manufacturing-erp", relationType:"USED_BY", source:{objectType:"bom",title:"能源网关 BOM",displayKey:"BOM-CHAIN",fields:{productCode:"GW-01",revision:"A",plant:"一号工厂",effectiveDate:"2026-08-01",componentCount:12,componentRequirements:"MAT-01:2,MAT-02:1"}}, target:{objectType:"work_order",title:"能源网关生产工单",displayKey:"WO-CHAIN",fields:{productCode:"GW-01",quantity:100,unit:"台",dueDate:"2026-09-15",plant:"一号工厂",priority:"关键"}} },
  { applicationId:"smart-park-platform", relationType:"REQUESTS", source:{objectType:"enterprise",title:"示例制造企业",displayKey:"ENT-CHAIN",fields:{creditCode:"91330000EXAMPLE",industry:"智能制造",contactName:"王经理",contactPhone:"authorized-ref-002",requestedArea:2000}}, target:{objectType:"service_order",title:"厂房空调报修",displayKey:"SVC-CHAIN",fields:{enterpriseName:"示例制造企业",serviceType:"报修",location:"A1 厂房",slaHours:4,description:"空调无法启动"}} }
];

const readiness = {
  "enterprise-strategy-platform": ["ACTIVE"],
  "human-resources-platform": ["OPEN","SCREENING","INTERVIEWING","OFFER","WAITING_APPROVAL",{approve:"COMPLETED"}],
  "finance-platform": ["SUBMITTED","WAITING_APPROVAL",{approve:"APPROVED"},"ACTIVE"],
  "ai-growth-sales-platform": ["NEW","QUALIFYING","WAITING_APPROVAL",{approve:"QUALIFIED"}],
  "intelligent-manufacturing-erp": ["ENGINEERING_REVIEW","WAITING_APPROVAL",{approve:"RELEASED"}],
  "smart-park-platform": ["PROSPECT","QUALIFYING","WAITING_APPROVAL",{approve:"ADMITTED"}]
};

async function matureSource(store,item,record,scope){
  let current=record;
  for(const step of readiness[item.applicationId]){
    if(typeof step==="string")current=await store.transitionRecord(item.applicationId,current.id,{expectedVersion:current.version,status:step},scope);
    else{const approval=await store.requestApproval(item.applicationId,current.id,{expectedVersion:current.version,requestedStatus:step.approve},scope);current=(await store.decideApproval(item.applicationId,approval.id,{decision:"APPROVED"},scope)).record;}
  }
  return current;
}

test("six independent applications execute atomic source-to-downstream business transactions", async () => {
  const root=await mkdtemp(resolve(tmpdir(),"enterprise-related-transactions-")),store=new BusinessApplicationStore({repoRoot:root}),scope={organizationId:"enterprise-org",workspaceId:"enterprise-workspace",userId:"business-operator"};
  for(const item of cases){
    const draft=await store.createRecord(item.applicationId,item.source,scope);await assert.rejects(()=>store.createRelatedRecord(item.applicationId,draft.id,{...item.target,relationType:item.relationType},scope),error=>error.code==="BUSINESS_RELATED_SOURCE_STATUS_DENIED");const source=await matureSource(store,item,draft,scope),first=await store.createRelatedRecord(item.applicationId,source.id,{...item.target,relationType:item.relationType},scope),duplicate=await store.createRelatedRecord(item.applicationId,source.id,{...item.target,relationType:item.relationType},scope),detail=await store.recordDetail(item.applicationId,source.id,scope),report=await store.applicationReport(item.applicationId,scope);
    assert.equal(first.created,true,item.applicationId);assert.equal(duplicate.created,false,item.applicationId);assert.equal(first.record.id,duplicate.record.id,item.applicationId);assert.equal(detail.relations.length,1,item.applicationId);assert.equal(detail.relations[0].record.id,first.record.id,item.applicationId);assert.deepEqual(report.businessChains,{total:1,byType:{[item.relationType]:1}},item.applicationId);
  }
  const data=await store.load();
  assert.equal(data.records.length,12);assert.equal(data.relations.length,6);assert.equal(data.events.filter(item=>item.type==="business.record.related"&&item.payload?.createdAtomically).length,6);
});
