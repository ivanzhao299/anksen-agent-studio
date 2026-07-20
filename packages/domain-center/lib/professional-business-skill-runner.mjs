const check=(code,pass,actual,expected)=>({code,status:pass?"PASS":"FAIL",actual,expected});

export const professionalBusinessSkillContracts=Object.freeze([Object.freeze({contractVersion:"1",applicationId:"finance-platform",objectType:"expense",domainId:"finance-management",businessSkillId:"financial_control_validation",agentId:"finance-control-agent",agentRole:"FINANCE_CONTROL_AGENT",runnerId:"finance-expense-rule-runner-v1",runtimeType:"PROFESSIONAL_RULE_ENGINE",inputObjects:["expense","budget"],requiredRelation:"CONTROLS",outputType:"FINANCE_EXPENSE_BUDGET_CHECK",humanApprovalRequired:true,status:"ACTIVE"})]);

export class ProfessionalBusinessSkillRunner {
  supports(record){return record?.applicationId==="finance-platform"&&record?.objectType==="expense";}

  execute({record,relatedRecords=[]}={}){
    if(!this.supports(record))return null;
    const expense=record.fields??{},budgets=relatedRecords.filter(item=>item.applicationId==="finance-platform"&&item.objectType==="budget"),budget=budgets.find(item=>item.status==="ACTIVE"&&item.fields?.budgetCode===expense.budgetCode&&item.fields?.department===expense.department&&item.fields?.currency===expense.currency)??null,expenseYear=Number(String(expense.expenseDate??"").slice(0,4)),checks=[
      check("ACTIVE_BUDGET_LINKED",Boolean(budget),budget?.displayKey??null,"ACTIVE budget linked through CONTROLS"),
      check("BUDGET_CODE_MATCH",Boolean(budget&&budget.fields.budgetCode===expense.budgetCode),expense.budgetCode,budget?.fields?.budgetCode??null),
      check("DEPARTMENT_MATCH",Boolean(budget&&budget.fields.department===expense.department),expense.department,budget?.fields?.department??null),
      check("CURRENCY_MATCH",Boolean(budget&&budget.fields.currency===expense.currency),expense.currency,budget?.fields?.currency??null),
      check("FISCAL_YEAR_MATCH",Boolean(budget&&Number(budget.fields.fiscalYear)===expenseYear),expenseYear,budget?Number(budget.fields.fiscalYear):null),
      check("SINGLE_EXPENSE_WITHIN_BUDGET",Boolean(budget&&Number(expense.amount)<=Number(budget.fields.amount)),Number(expense.amount),budget?Number(budget.fields.amount):null)
    ],failed=checks.filter(item=>item.status==="FAIL"),decision=!budget?"BLOCKED":failed.length?"REVIEW_REQUIRED":"PASS";
    const contract=professionalBusinessSkillContracts[0];return{schemaVersion:1,outcomeType:contract.outputType,runnerId:contract.runnerId,skillId:contract.businessSkillId,agentId:contract.agentId,agentRole:contract.agentRole,decision,checks,facts:{expenseAmount:Number(expense.amount),budgetAmount:budget?Number(budget.fields.amount):null,currency:expense.currency??null,budgetCode:expense.budgetCode??null,department:expense.department??null,expenseDate:expense.expenseDate??null,budgetDisplayKey:budget?.displayKey??null},recommendation:decision==="PASS"?"SUBMIT_FOR_HUMAN_APPROVAL":"HOLD_AND_REVIEW",limitations:["Checks one expense against the linked budget ceiling.","Does not calculate consumed or remaining budget without posted-ledger data."],generatedAt:new Date().toISOString()};
  }
}
