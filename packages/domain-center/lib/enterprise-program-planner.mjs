import { createHash } from "node:crypto";
import { domainCenterSummary, resolveDomainCapability } from "./domain-center.mjs";

const aliases={
  "enterprise-strategy-platform":["战略","经营目标","集团目标","okr","kpi","strategy"],
  "human-resources-platform":["人力","组织","岗位","招聘","员工","绩效","人才","hr"],
  "finance-platform":["财务","预算","资金","核算","报销","finance"],
  "ai-growth-sales-platform":["增长","销售","营销","获客","客户","内容矩阵","growth","sales"],
  "intelligent-manufacturing-erp":["生产","制造","工厂","bom","sop","wms","制造erp"],
  "smart-park-platform":["智慧园区","园区","招商","租赁","园区服务","smart park"],
  "software-factory":["studio开发","软件开发","代码开发","software factory"],
  "video-factory":["视频工厂","视频制作","剪辑","video factory"],
  "graphic-design-studio":["平面设计","视觉设计","品牌设计","海报","画册","展板","宣传单","修图","图片精修","psd","photoshop","graphic design","poster"]
};
const normalize=value=>String(value??"").trim().toLowerCase().replace(/\s+/g," ");
const contains=(text,value)=>text.includes(normalize(value));
const unique=values=>[...new Set(values)];
const digest=value=>createHash("sha256").update(JSON.stringify(value)).digest("hex");

export class EnterpriseProgramPlanner{
  constructor({registry,catalog=domainCenterSummary()}={}){if(!registry)throw Object.assign(new Error("REGISTRY_REQUIRED"),{code:"REGISTRY_REQUIRED"});this.registry=registry;this.catalog=catalog;}
  plan(goal,{allowedApplicationIds=null}={}){
    const text=normalize(goal);if(!text)throw Object.assign(new Error("ENTERPRISE_PROGRAM_GOAL_REQUIRED"),{code:"ENTERPRISE_PROGRAM_GOAL_REQUIRED"});
    const allowed=allowedApplicationIds?new Set(allowedApplicationIds):null,mentions=[];
    for(const application of this.catalog.applications){const matched=unique([application.name,application.nameEn,...(aliases[application.id]??[])].filter(value=>contains(text,value)));if(matched.length)mentions.push({application,matched,position:Math.min(...matched.map(value=>text.indexOf(normalize(value))))});}
    if(!mentions.length)return{schemaVersion:1,plannerVersion:"enterprise-rule-planner-v1",status:"CLARIFICATION_REQUIRED",goal:String(goal).trim(),workstreams:[],blockedReasons:[],clarification:{code:"BUSINESS_APPLICATION_NOT_IDENTIFIED",message:"请明确目标涉及的业务平台，例如战略、人力、财务、增长销售、生产制造或智慧园区。"},llmUsed:false};
    const forbidden=mentions.filter(item=>allowed&&!allowed.has(item.application.id));if(forbidden.length)return{schemaVersion:1,plannerVersion:"enterprise-rule-planner-v1",status:"BLOCKED",goal:String(goal).trim(),workstreams:[],blockedReasons:forbidden.map(item=>`APPLICATION_FORBIDDEN:${item.application.id}`),clarification:null,llmUsed:false};
    const ordered=mentions.sort((a,b)=>a.position-b.position),sequential=/先.+(?:再|然后|之后|最后)/.test(text),broad=/全部|全面|整体|全域|所有/.test(text);
    const workstreams=ordered.map((item,index)=>{const domainMatches=item.application.domains.map(domain=>({domain,matched:unique((domain.keywords??[]).filter(value=>contains(text,value)))})).filter(value=>value.matched.length),domains=broad||!domainMatches.length?item.application.domains:domainMatches.map(value=>value.domain),capabilities=domains.map(domain=>resolveDomainCapability(domain,this.registry)),blockedReasons=capabilities.flatMap(value=>value.blockedReasons);return{sequence:index+1,applicationId:item.application.id,applicationName:item.application.name,domainIds:domains.map(domain=>domain.id),domainNames:domains.map(domain=>domain.name),dependsOn:sequential&&index?[ordered[index-1].application.id]:[],matchedKeywords:unique([...item.matched,...domainMatches.flatMap(value=>value.matched)]),status:blockedReasons.length?"BLOCKED":"READY",blockedReasons:unique(blockedReasons)};});
    const core={schemaVersion:1,plannerVersion:"enterprise-rule-planner-v1",goal:String(goal).trim(),workstreams,dependencyMode:sequential?"EXPLICIT_SEQUENCE":"PARALLEL",llmUsed:false},blockedReasons=unique(workstreams.flatMap(item=>item.blockedReasons));return{...core,planHash:digest(core),status:blockedReasons.length?"BLOCKED":"REVIEW_REQUIRED",blockedReasons,clarification:null};
  }
  validate(plan){if(!plan||plan.schemaVersion!==1||!plan.planHash||!plan.workstreams?.length)throw Object.assign(new Error("ENTERPRISE_PROGRAM_PLAN_INVALID"),{code:"ENTERPRISE_PROGRAM_PLAN_INVALID"});const{planHash,status,blockedReasons,clarification,...core}=plan;if(digest(core)!==planHash)throw Object.assign(new Error("ENTERPRISE_PROGRAM_PLAN_HASH_MISMATCH"),{code:"ENTERPRISE_PROGRAM_PLAN_HASH_MISMATCH"});if(status!=="REVIEW_REQUIRED"||blockedReasons?.length||plan.workstreams.some(item=>item.status!=="READY"))throw Object.assign(new Error("ENTERPRISE_PROGRAM_PLAN_BLOCKED"),{code:"ENTERPRISE_PROGRAM_PLAN_BLOCKED",reasons:blockedReasons??[]});return plan;}
}
