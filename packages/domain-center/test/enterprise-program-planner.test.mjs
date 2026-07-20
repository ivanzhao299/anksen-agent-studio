import assert from "node:assert/strict";
import test from "node:test";
import { loadDomainRuntimeRegistry } from "../lib/domain-center.mjs";
import { EnterpriseProgramPlanner } from "../lib/enterprise-program-planner.mjs";

const planner=async()=>new EnterpriseProgramPlanner({registry:await loadDomainRuntimeRegistry()});

test("rule planner decomposes an explicit sequential enterprise goal without an LLM",async()=>{const service=await planner(),plan=service.plan("先完成人力组织配置，然后建立财务预算，最后推进生产制造",{allowedApplicationIds:["human-resources-platform","finance-platform","intelligent-manufacturing-erp"]});assert.equal(plan.status,"REVIEW_REQUIRED");assert.equal(plan.llmUsed,false);assert.deepEqual(plan.workstreams.map(item=>item.applicationId),["human-resources-platform","finance-platform","intelligent-manufacturing-erp"]);assert.deepEqual(plan.workstreams[1].dependsOn,["human-resources-platform"]);assert.deepEqual(plan.workstreams[2].dependsOn,["finance-platform"]);assert.equal(service.validate(plan),plan);});

test("broad Smart Park goal selects every Park domain but still requires human review",async()=>{const service=await planner(),plan=service.plan("全面完善智慧园区全部业务",{allowedApplicationIds:["smart-park-platform"]});assert.equal(plan.status,"REVIEW_REQUIRED");assert.equal(plan.workstreams.length,1);assert.ok(plan.workstreams[0].domainIds.length>=10);assert.deepEqual(plan.workstreams[0].dependsOn,[]);});

test("ambiguous goal requests clarification instead of inventing an application",async()=>{const plan=(await planner()).plan("全面提升工作效率和质量");assert.equal(plan.status,"CLARIFICATION_REQUIRED");assert.equal(plan.workstreams.length,0);assert.equal(plan.clarification.code,"BUSINESS_APPLICATION_NOT_IDENTIFIED");});

test("mentioning an application outside RBAC scope fails closed",async()=>{const plan=(await planner()).plan("完善财务预算和智慧园区招商",{allowedApplicationIds:["smart-park-platform"]});assert.equal(plan.status,"BLOCKED");assert.ok(plan.blockedReasons.includes("APPLICATION_FORBIDDEN:finance-platform"));assert.equal(plan.workstreams.length,0);});

test("modified Planner output cannot be confirmed",async()=>{const service=await planner(),plan=service.plan("完善财务预算",{allowedApplicationIds:["finance-platform"]}),changed={...plan,workstreams:plan.workstreams.map(item=>({...item,domainIds:["human-resources"]}))};assert.throws(()=>service.validate(changed),error=>error.code==="ENTERPRISE_PROGRAM_PLAN_HASH_MISMATCH");});
