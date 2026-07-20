import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp } from "node:fs/promises";
import { tmpdir } from "node:os";
import { resolve } from "node:path";
import { BusinessApplicationStore } from "../lib/business-application-store.mjs";

test("business search returns only scoped authoritative records with stable pagination",async()=>{
  const root=await mkdtemp(resolve(tmpdir(),"business-search-")),store=new BusinessApplicationStore({repoRoot:root}),finance={organizationId:"org-a",workspaceId:"ws-a",userId:"finance-owner"};
  await store.createRecord("finance-platform",{objectType:"expense",displayKey:"EXP-SEARCH-1",title:"运营采购费用",fields:{expenseDate:"2026-07-21",department:"运营",category:"采购",amount:100,currency:"CNY",budgetCode:"OPS",description:"测试"}},finance);
  await store.createRecord("smart-park-platform",{objectType:"service_order",displayKey:"SRV-SEARCH-1",title:"园区采购报修",fields:{enterpriseName:"测试企业",serviceType:"报修",location:"A座",slaHours:4,description:"测试"}},finance);
  await store.createRecord("finance-platform",{objectType:"expense",displayKey:"EXP-OTHER",title:"其他租户采购",fields:{expenseDate:"2026-07-21",department:"运营",category:"采购",amount:100,currency:"CNY",budgetCode:"OPS",description:"测试"}},{...finance,organizationId:"org-b"});
  const result=await store.searchRecords({...finance,applicationIds:["finance-platform"],query:"采购",limit:1});
  assert.equal(result.pagination.total,1);assert.equal(result.pagination.hasMore,false);assert.equal(result.items[0].displayKey,"EXP-SEARCH-1");assert.equal(result.items[0].href.includes("/finance?record="),true);assert.equal(result.items[0].applicationName,"集团财务平台");assert.equal(result.items[0].fields,undefined);
  assert.equal((await store.searchRecords({...finance,applicationIds:["smart-park-platform"],query:"采购"})).items[0].displayKey,"SRV-SEARCH-1");
  assert.equal((await store.searchRecords({...finance,organizationId:"missing",applicationIds:["finance-platform"],query:"采购"})).pagination.total,0);
});
