import { createHash } from "node:crypto";

const templates = {
  SOFTWARE_DELIVERY: [
    { suffix:"ANALYZE",title:"Analyze goal and repository",capability:"planning",riskLevel:"LOW" },
    { suffix:"IMPLEMENT",title:"Implement requested change",capability:"code_development",riskLevel:"MEDIUM",after:"ANALYZE" },
    { suffix:"VALIDATE",title:"Validate implementation",capability:"validation_testing",riskLevel:"LOW",after:"IMPLEMENT" }
  ],
  DOCUMENTATION: [
    { suffix:"ANALYZE",title:"Analyze documentation goal",capability:"planning",riskLevel:"LOW" },
    { suffix:"DRAFT",title:"Create documentation",capability:"document_generation",riskLevel:"LOW",after:"ANALYZE" },
    { suffix:"VALIDATE",title:"Review documentation",capability:"validation_testing",riskLevel:"LOW",after:"DRAFT" }
  ],
  GENERIC: [
    { suffix:"ANALYZE",title:"Analyze goal",capability:"planning",riskLevel:"LOW" },
    { suffix:"EXECUTE",title:"Execute goal",capability:"general_execution",riskLevel:"MEDIUM",after:"ANALYZE" },
    { suffix:"VALIDATE",title:"Validate outcome",capability:"validation_testing",riskLevel:"LOW",after:"EXECUTE" }
  ]
};
const canonical=(value)=>Array.isArray(value)?value.map(canonical):value&&typeof value==="object"?Object.fromEntries(Object.keys(value).sort().map(k=>[k,canonical(value[k])])):value;
const digest=(value)=>createHash("sha256").update(JSON.stringify(canonical(value))).digest("hex").slice(0,16);
const slug=(value)=>String(value).toUpperCase().replace(/[^A-Z0-9]+/g,"_").replace(/^_|_$/g,"").slice(0,32)||"GOAL";
export class PlannerValidationError extends Error{constructor(code,message){super(message);this.name="PlannerValidationError";this.code=code;}}
export class RulePlannerEngine {
  selectTemplate(goal){const text=`${goal.title} ${goal.description??""}`.toLowerCase();if(/代码|实现|开发|修复|重构|api|service|parser|schema|worker|preview|test|build|feature|bug/.test(text))return"SOFTWARE_DELIVERY";if(/文档|说明|手册|document|readme|guide/.test(text))return"DOCUMENTATION";return"GENERIC";}
  createGraph(goal,{now=new Date()}={}){if(!goal?.id||!goal?.title?.trim())throw new PlannerValidationError("INVALID_GOAL","Goal id and title are required");const templateId=this.selectTemplate(goal),prefix=slug(goal.id),steps=templates[templateId],requestedRisk=["LOW","MEDIUM","HIGH","CRITICAL"].includes(goal.metadata?.riskLevel)?goal.metadata.riskLevel:null;const tasks=steps.map(step=>({taskKey:`${prefix}_${step.suffix}`,title:step.title,description:`${step.title}: ${goal.title}`,priority:step.suffix==="IMPLEMENT"||step.suffix==="EXECUTE"?"P1":"P2",riskLevel:requestedRisk??step.riskLevel,requiredCapabilities:[step.capability],maxAttempts:3,metadata:{templateId,goalTitle:goal.title,constraints:goal.metadata?.constraints??[],acceptanceCriteria:goal.metadata?.acceptanceCriteria??[],approvalStatus:requestedRisk==="CRITICAL"?"REQUIRED":"APPROVED",ruleEngine:true}}));const dependencies=steps.filter(s=>s.after).map(step=>({taskKey:`${prefix}_${step.suffix}`,dependsOnTaskKey:`${prefix}_${step.after}`,dependencyType:"SUCCESS_REQUIRED",requiredStatus:"SUCCEEDED"}));const plannerVersion=`rule-planner-v1-${digest({goal,templateId,tasks,dependencies})}`;return{schemaVersion:1,plannerVersion,goalId:goal.id,templateId,generatedAt:now.toISOString(),tasks,dependencies,metadata:{engine:"RULE_TEMPLATE",llmUsed:false,constraints:goal.metadata?.constraints??[],acceptanceCriteria:goal.metadata?.acceptanceCriteria??[]}};}
}
export class PlannerService {
  constructor({kernel,engine=new RulePlannerEngine()}={}){if(!kernel?.submitPlan)throw new PlannerValidationError("KERNEL_REQUIRED","Autonomous Kernel submitPlan port is required");this.kernel=kernel;this.engine=engine;}
  planGoal(goal,options){return this.engine.createGraph(goal,options);}
  async planAndSubmit(goal,options){const graph=this.planGoal(goal,options);const submission=await this.kernel.submitPlan(goal.id,{plannerVersion:graph.plannerVersion,sourceArtifactRef:null,tasks:graph.tasks,dependencies:graph.dependencies});return{graph,submission};}
}
export const plannerApi={planGoal:"PlannerService.planGoal(goal, options?)",planAndSubmit:"PlannerService.planAndSubmit(goal, options?)"};
