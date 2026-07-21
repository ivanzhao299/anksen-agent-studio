import test from "node:test";
import assert from "node:assert/strict";
import { projectFinanceControlReport } from "../lib/finance-control-report.mjs";

const record=(id,objectType,status,fields)=>({id,applicationId:"finance-platform",objectType,displayKey:id.toUpperCase(),title:id,status,version:1,fields});

test("finance control report separates approved commitment, pending exposure and currencies",()=>{
  const records=[
    record("budget-cny","budget","ACTIVE",{fiscalYear:2026,department:"Operations",budgetCode:"OPS",amount:1000,currency:"CNY"}),
    record("budget-usd","budget","ACTIVE",{fiscalYear:2026,department:"Sales",budgetCode:"TRAVEL",amount:500,currency:"USD"}),
    record("expense-paid","expense","PAID",{amount:200,currency:"CNY"}),
    record("expense-approved","expense","APPROVED",{amount:300,currency:"CNY"}),
    record("expense-pending","expense","WAITING_APPROVAL",{amount:250,currency:"CNY"}),
    record("expense-unlinked","expense","UNDER_REVIEW",{amount:80,currency:"USD"})
  ],relations=["expense-paid","expense-approved","expense-pending"].map((targetRecordId,index)=>({id:String(index),applicationId:"finance-platform",sourceRecordId:"budget-cny",targetRecordId,relationType:"CONTROLS"})),report=projectFinanceControlReport({records,relations,generatedAt:"2026-07-21T01:00:00.000Z"}),cny=report.budgets.find(item=>item.budget.displayKey==="BUDGET-CNY");
  assert.equal(cny.committedAmount,500);
  assert.equal(cny.pendingAmount,250);
  assert.equal(cny.workflowHeadroom,500);
  assert.equal(cny.projectedHeadroom,250);
  assert.equal(report.summary.unlinkedExpenses,1);
  assert.deepEqual(report.currencies.map(item=>item.currency),["CNY","USD"]);
  assert.equal(report.basis,"WORKFLOW_RECORDS_NOT_GENERAL_LEDGER");
});

test("finance control report flags workflow over-commitment without claiming a ledger balance",()=>{
  const records=[record("budget","budget","ACTIVE",{amount:100,currency:"CNY"}),record("expense","expense","APPROVED",{amount:120,currency:"CNY"})],relations=[{applicationId:"finance-platform",sourceRecordId:"budget",targetRecordId:"expense",relationType:"CONTROLS"}],report=projectFinanceControlReport({records,relations});
  assert.equal(report.budgets[0].overCommitted,true);
  assert.equal(report.summary.overCommittedBudgets,1);
  assert.match(report.limitations.join(" "),/not a general-ledger balance/);
});
