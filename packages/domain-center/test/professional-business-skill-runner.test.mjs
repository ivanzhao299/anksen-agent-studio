import test from "node:test";
import assert from "node:assert/strict";
import { ProfessionalBusinessSkillRunner,professionalBusinessSkillContracts } from "../lib/professional-business-skill-runner.mjs";

const expense={applicationId:"finance-platform",objectType:"expense",fields:{expenseDate:"2026-07-21",department:"运营中心",category:"采购",amount:2600,currency:"CNY",budgetCode:"OPS-01"}};
const budget={applicationId:"finance-platform",objectType:"budget",displayKey:"BUD-2026-OPS",status:"ACTIVE",fields:{fiscalYear:2026,department:"运营中心",budgetCode:"OPS-01",amount:10000,currency:"CNY"}};

test("finance professional runner produces a reviewable pass from authoritative linked records",()=>{const result=new ProfessionalBusinessSkillRunner().execute({record:expense,relatedRecords:[budget]});assert.equal(result.outcomeType,"FINANCE_EXPENSE_BUDGET_CHECK");assert.equal(result.decision,"PASS");assert.equal(result.checks.every(item=>item.status==="PASS"),true);assert.equal(result.recommendation,"SUBMIT_FOR_HUMAN_APPROVAL");assert.equal(result.facts.expenseAmount,2600);assert.equal(result.facts.budgetAmount,10000);});

test("finance professional runner blocks missing budget and does not infer remaining balance",()=>{const result=new ProfessionalBusinessSkillRunner().execute({record:expense,relatedRecords:[]});assert.equal(result.decision,"BLOCKED");assert.equal(result.checks.find(item=>item.code==="ACTIVE_BUDGET_LINKED").status,"FAIL");assert.match(result.limitations.join(" "),/remaining budget/);assert.equal(new ProfessionalBusinessSkillRunner().execute({record:{applicationId:"human-resources-platform",objectType:"employee"}}),null);});

test("professional registry binds application, object, Skill, Agent and Runner without a second scheduler",()=>{const contract=professionalBusinessSkillContracts[0];assert.deepEqual({applicationId:contract.applicationId,objectType:contract.objectType,businessSkillId:contract.businessSkillId,agentId:contract.agentId,runnerId:contract.runnerId,runtimeType:contract.runtimeType,status:contract.status},{applicationId:"finance-platform",objectType:"expense",businessSkillId:"financial_control_validation",agentId:"finance-control-agent",runnerId:"finance-expense-rule-runner-v1",runtimeType:"PROFESSIONAL_RULE_ENGINE",status:"ACTIVE"});assert.equal(contract.humanApprovalRequired,true);});
