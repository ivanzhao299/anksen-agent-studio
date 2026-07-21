import { getBusinessObjectDefinition } from "./business-object-definitions.mjs";
import { businessRelationContracts } from "./business-relation-definitions.mjs";
import { enterpriseApplications } from "./enterprise-applications.mjs";
import { professionalBusinessSkillContracts } from "./professional-business-skill-runner.mjs";

const coreApplications=Object.freeze([
  {id:"enterprise-strategy-platform",operator:"strategy_operator",reviewer:"strategy_reviewer"},
  {id:"human-resources-platform",operator:"hr_operator",reviewer:"hr_reviewer"},
  {id:"finance-platform",operator:"finance_operator",reviewer:"finance_reviewer"},
  {id:"ai-growth-sales-platform",operator:"sales_operator",reviewer:"sales_reviewer"},
  {id:"intelligent-manufacturing-erp",operator:"manufacturing_operator",reviewer:"manufacturing_reviewer"},
  {id:"smart-park-platform",operator:"smart_park_operator",reviewer:"smart_park_reviewer"}
]);
const requiredRuntimeArtifacts=Object.freeze(["businessApplicationStore","PostgresBusinessApplicationStore","PersistentDomainWorkflowService","ResidentBusinessWorkRunner","PersistentNightShiftService"]);
const hasAll=(values,required)=>required.every(item=>values.includes(item));

export function evaluateEnterpriseFoundationReadiness({applications=enterpriseApplications,relations=businessRelationContracts,professionalContracts=professionalBusinessSkillContracts,roles=[],routes=[],runtimeArtifacts=[]}={}){
  const checks=[],add=(id,pass,evidence)=>checks.push({id,status:pass?"PASS":"FAIL",evidence}),applicationIds=new Set(applications.map(item=>item.id)),paths=applications.map(item=>item.path),routePaths=new Set(routes.map(item=>item.path));
  add("INDEPENDENT_APPLICATION_ENDPOINTS",new Set(paths).size===paths.length&&applications.every(item=>item.path.startsWith("/")&&routePaths.has(item.path)),applications.map(item=>item.path));
  add("SHARED_COCKPIT_AND_WORK",routePaths.has("/cockpit")&&routePaths.has("/work"),["/cockpit","/work"]);
  const missingObjects=[];for(const application of applications)for(const object of application.objectTypes)try{getBusinessObjectDefinition(application.id,object.id);}catch{missingObjects.push(`${application.id}:${object.id}`);}
  add("CONVENTIONAL_BUSINESS_OBJECTS",missingObjects.length===0,{applications:applications.length,objects:applications.reduce((sum,item)=>sum+item.objectTypes.length,0),missing:missingObjects});
  const roleMap=new Map(roles.map(item=>[item.role_id,item])),roleFailures=[];for(const expected of coreApplications){const app=applications.find(item=>item.id===expected.id),operator=roleMap.get(expected.operator),reviewer=roleMap.get(expected.reviewer),capability=app?.capabilities?.[0];if(!operator||!hasAll(operator.capabilities,["console.access","work.read",capability,"business.operate","business.work.control","autopilot.plan"])||operator.capabilities.includes("proposal.approve"))roleFailures.push(`${expected.operator}:INVALID`);if(!reviewer||!hasAll(reviewer.capabilities,["console.access","work.read",capability,"business.operate","proposal.approve"])||reviewer.capabilities.some(value=>["autopilot.plan","autopilot.execute.local","business.work.control","access.manage"].includes(value)))roleFailures.push(`${expected.reviewer}:INVALID`);}
  add("LEAST_PRIVILEGE_OPERATOR_REVIEWER_ROLES",roleFailures.length===0,{expected:coreApplications.length*2,failures:roleFailures});
  const relationCoverage=coreApplications.map(item=>({applicationId:item.id,count:relations.filter(relation=>relation.applicationId===item.id).length}));add("TYPED_BUSINESS_RELATION_CHAINS",relationCoverage.every(item=>item.count>0),relationCoverage);
  const professionalCoverage=coreApplications.map(item=>({applicationId:item.id,count:professionalContracts.filter(contract=>contract.applicationId===item.id&&contract.status==="ACTIVE").length}));add("PROFESSIONAL_AGENT_SKILL_RUNNER_COVERAGE",professionalCoverage.every(item=>item.count>0),professionalCoverage);
  const invalidProfessional=professionalContracts.filter(item=>!applicationIds.has(item.applicationId)||!item.businessSkillId||!item.agentId||!item.runnerId||item.runtimeType!=="PROFESSIONAL_RULE_ENGINE"||item.humanApprovalRequired!==true);add("PROFESSIONAL_PROTOCOL_FAIL_CLOSED",invalidProfessional.length===0,invalidProfessional.map(item=>item.runnerId));
  add("SHARED_PERSISTENT_RUNTIME",hasAll(runtimeArtifacts,requiredRuntimeArtifacts),{required:requiredRuntimeArtifacts,available:runtimeArtifacts});
  const failures=checks.filter(item=>item.status==="FAIL").map(item=>item.id);return{schemaVersion:1,status:failures.length?"NOT_READY":"READY",generatedAt:new Date().toISOString(),summary:{applications:applications.length,coreBusinessApplications:coreApplications.length,objectTypes:applications.reduce((sum,item)=>sum+item.objectTypes.length,0),relations:relations.length,professionalRunners:professionalContracts.length,checks:checks.length,passed:checks.length-failures.length,failed:failures.length},checks,failures};
}

export const enterpriseFoundationCoreApplications=coreApplications;
export const enterpriseFoundationRuntimeArtifacts=requiredRuntimeArtifacts;
