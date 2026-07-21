const amount = (value) => Number.isFinite(Number(value)) ? Number(value) : 0;
const add = (items) => items.reduce((total, item) => total + amount(item.fields?.amount), 0);

export function projectFinanceControlReport({ records = [], relations = [], generatedAt = new Date().toISOString(), source = "BUSINESS_APPLICATION_STORE" } = {}) {
  const budgets = records.filter((item) => item.applicationId === "finance-platform" && item.objectType === "budget");
  const expenses = records.filter((item) => item.applicationId === "finance-platform" && item.objectType === "expense");
  const controls = relations.filter((item) => item.applicationId === "finance-platform" && item.relationType === "CONTROLS");
  const linkedExpenseIds = new Set(controls.map((item) => item.targetRecordId));
  const rows = budgets.map((budget) => {
    const expenseIds = new Set(controls.filter((item) => item.sourceRecordId === budget.id).map((item) => item.targetRecordId));
    const linked = expenses.filter((item) => expenseIds.has(item.id));
    const pending = linked.filter((item) => ["SUBMITTED", "UNDER_REVIEW", "WAITING_APPROVAL"].includes(item.status));
    const approved = linked.filter((item) => item.status === "APPROVED");
    const paid = linked.filter((item) => item.status === "PAID");
    const committedAmount = add([...approved, ...paid]);
    const pendingAmount = add(pending);
    const budgetAmount = amount(budget.fields?.amount);
    return {
      budget: { id: budget.id, displayKey: budget.displayKey, title: budget.title, status: budget.status, version: budget.version, href: `/finance?record=${budget.id}` },
      fiscalYear: budget.fields?.fiscalYear ?? null,
      department: budget.fields?.department ?? null,
      budgetCode: budget.fields?.budgetCode ?? null,
      currency: budget.fields?.currency ?? null,
      budgetAmount,
      committedAmount,
      pendingAmount,
      paidAmount: add(paid),
      workflowHeadroom: budgetAmount - committedAmount,
      projectedHeadroom: budgetAmount - committedAmount - pendingAmount,
      linkedExpenses: linked.length,
      pendingExpenses: pending.length,
      approvedExpenses: approved.length,
      paidExpenses: paid.length,
      overCommitted: committedAmount > budgetAmount
    };
  });
  const currencies = [...new Set(rows.map((item) => item.currency).filter(Boolean))].sort().map((currency) => {
    const scoped = rows.filter((item) => item.currency === currency);
    return { currency, budgetAmount: scoped.reduce((sum, item) => sum + item.budgetAmount, 0), committedAmount: scoped.reduce((sum, item) => sum + item.committedAmount, 0), pendingAmount: scoped.reduce((sum, item) => sum + item.pendingAmount, 0), paidAmount: scoped.reduce((sum, item) => sum + item.paidAmount, 0) };
  });
  const unlinkedExpenses = expenses.filter((item) => !linkedExpenseIds.has(item.id) && !["DRAFT", "REJECTED"].includes(item.status)).map((item) => ({ id: item.id, displayKey: item.displayKey, title: item.title, status: item.status, amount: amount(item.fields?.amount), currency: item.fields?.currency ?? null, href: `/finance?record=${item.id}` }));
  return {
    schemaVersion: 1,
    generatedAt,
    source,
    basis: "WORKFLOW_RECORDS_NOT_GENERAL_LEDGER",
    summary: { budgets: rows.length, activeBudgets: rows.filter((item) => item.budget.status === "ACTIVE").length, linkedExpenses: linkedExpenseIds.size, unlinkedExpenses: unlinkedExpenses.length, overCommittedBudgets: rows.filter((item) => item.overCommitted).length },
    currencies,
    budgets: rows,
    unlinkedExpenses,
    limitations: ["Workflow headroom is calculated from linked approved and paid expense records; it is not a general-ledger balance.", "Pending exposure is shown separately and is never counted as an approved posting.", "Amounts in different currencies are never combined."]
  };
}
