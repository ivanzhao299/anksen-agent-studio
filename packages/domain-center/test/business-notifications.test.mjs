import test from "node:test";
import assert from "node:assert/strict";
import { projectBusinessNotifications } from "../lib/business-notifications.mjs";

test("business notifications are stable, role-filtered projections of exceptions and approvals",()=>{
  const input={applicationIds:["finance-platform"],generatedAt:"2026-07-21T10:00:00.000Z",exceptions:[{id:"record:r1",applicationId:"finance-platform",applicationName:"集团财务平台",objectId:"r1",displayKey:"EXP-1",title:"异常费用",status:"REJECTED",version:3,ownerId:"owner",href:"/finance?record=r1",updatedAt:"2026-07-21T09:00:00.000Z"},{id:"record:p1",applicationId:"smart-park-platform",applicationName:"智慧园区",objectId:"p1",displayKey:"P-1",title:"不可见故障",status:"FAULT",version:2,href:"/smart-park?record=p1",updatedAt:"2026-07-21T09:30:00.000Z"}],approvals:[{id:"a1",applicationId:"finance-platform",businessRecordId:"r2",objectVersion:4,fromStatus:"WAITING_APPROVAL",requestedStatus:"APPROVED",status:"PENDING",requestedBy:"requester",createdAt:"2026-07-21T09:10:00.000Z",businessObject:{title:"预算审批",displayKey:"BUD-1",href:"/finance?record=r2"}}]};
  const first=projectBusinessNotifications(input),replayed=projectBusinessNotifications(input);
  assert.deepEqual(first,replayed);assert.equal(first.summary.total,2);assert.equal(first.summary.actionRequired,1);assert.equal(first.summary.critical,0);assert.ok(first.items.every(item=>item.applicationId==="finance-platform"));assert.equal(new Set(first.items.map(item=>item.idempotencyKey)).size,2);assert.ok(first.items.every(item=>item.href.startsWith("/finance")));
});
