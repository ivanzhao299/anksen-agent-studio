import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { evaluateConsoleActionAccess, evaluateConsoleRouteAccess } from "../../access-center/lib/access-center-utils.mjs";

const policy=JSON.parse(await readFile(new URL("../../access-center/examples/access-policy.example.json",import.meta.url),"utf8"));
const routes={strategy_operator:"strategy",hr_operator:"hr",finance_operator:"finance",sales_operator:"growthSales",manufacturing_operator:"manufacturing",smart_park_operator:"smartPark"};
const contextFor=role=>({authenticated:true,user:{username:role.role_id},capabilities:role.capabilities,direct_execute_max_risk:role.direct_execute_max_risk,project_allowlist:["jinhu-smart-park"],plan:null});

test("named business operators can use their own conventional lifecycle but not other applications",async()=>{
  for(const [roleId,route] of Object.entries(routes)){
    const role=policy.roles.find(item=>item.role_id===roleId),context=contextFor(role);
    assert.equal(evaluateConsoleRouteAccess(route,context).allowed,true,roleId);
    assert.equal(evaluateConsoleRouteAccess(route==="finance"?"hr":"finance",context).allowed,false,roleId);
    for(const actionId of ["business-record-create","business-record-note","business-record-update","business-record-transition","business-record-relate","business-related-record-create","business-approval-request","business-work-assign","business-work-control"]){assert.equal((await evaluateConsoleActionAccess({policy},{action_id:actionId,risk:["business-record-create","business-record-note","business-work-assign"].includes(actionId)?"LOW":"MEDIUM"},{user_context:context})).status,"ALLOW",`${roleId}:${actionId}`);}
    for(const actionId of ["business-approval-decision","development-commit","release-reviewed-publish"]){assert.equal((await evaluateConsoleActionAccess({policy},{action_id:actionId,risk:"MEDIUM"},{user_context:context})).status,"DENY",`${roleId}:${actionId}`);}
  }
});

test("finance reviewer can approve exact-version finance work without execution or platform authority",async()=>{
  const role=policy.roles.find(item=>item.role_id==="finance_reviewer"),context=contextFor(role);
  assert.equal(evaluateConsoleRouteAccess("finance",context).allowed,true);assert.equal(evaluateConsoleRouteAccess("hr",context).allowed,false);
  assert.equal((await evaluateConsoleActionAccess({policy},{action_id:"business-approval-decision",risk:"MEDIUM"},{user_context:context})).status,"ALLOW");
  for(const actionId of ["business-work-control","development-job-approve","identity-owner-bootstrap"]){assert.equal((await evaluateConsoleActionAccess({policy},{action_id:actionId,risk:"MEDIUM"},{user_context:context})).status,"DENY");}
  assert.equal(role.capabilities.includes("autopilot.execute.local"),false);assert.equal(role.capabilities.includes("access.manage"),false);
});

test("HR reviewer can approve exact-version HR work without Agent execution or cross-application authority",async()=>{
  const role=policy.roles.find(item=>item.role_id==="hr_reviewer"),context=contextFor(role);
  assert.equal(evaluateConsoleRouteAccess("hr",context).allowed,true);assert.equal(evaluateConsoleRouteAccess("finance",context).allowed,false);
  assert.equal((await evaluateConsoleActionAccess({policy},{action_id:"business-approval-decision",risk:"MEDIUM"},{user_context:context})).status,"ALLOW");
  for(const actionId of ["business-work-control","development-job-approve","identity-owner-bootstrap"]){assert.equal((await evaluateConsoleActionAccess({policy},{action_id:actionId,risk:"MEDIUM"},{user_context:context})).status,"DENY");}
  assert.equal(role.capabilities.includes("autopilot.plan"),false);assert.equal(role.capabilities.includes("autopilot.execute.local"),false);assert.equal(role.capabilities.includes("access.manage"),false);
});

test("sales reviewer can approve content and publish plans without publication or Runtime authority",async()=>{
  const role=policy.roles.find(item=>item.role_id==="sales_reviewer"),context=contextFor(role);
  assert.equal(evaluateConsoleRouteAccess("growthSales",context).allowed,true);assert.equal(evaluateConsoleRouteAccess("finance",context).allowed,false);
  assert.equal((await evaluateConsoleActionAccess({policy},{action_id:"business-approval-decision",risk:"MEDIUM"},{user_context:context})).status,"ALLOW");
  for(const actionId of ["business-work-control","development-job-approve","production-operation-request","identity-owner-bootstrap"]){assert.equal((await evaluateConsoleActionAccess({policy},{action_id:actionId,risk:"MEDIUM"},{user_context:context})).status,"DENY");}
  assert.equal(role.capabilities.includes("autopilot.plan"),false);assert.equal(role.capabilities.includes("autopilot.execute.local"),false);assert.equal(role.capabilities.includes("access.manage"),false);
});
