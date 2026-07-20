const criticalStatuses = new Set(["BLOCKED", "SHORTAGE", "FAULT", "ESCALATED"]);

const countBy = (items, key) => items.reduce((result,item)=>({...result,[item[key]]:(result[item[key]]??0)+1}),{});

export function projectBusinessNotifications({ exceptions = [], approvals = [], applicationIds = [], generatedAt = new Date().toISOString(), source = "BUSINESS_NOTIFICATION_PROJECTION" } = {}) {
  const allowed = new Set(applicationIds), items = [];
  for (const item of exceptions) {
    if (!allowed.has(item.applicationId)) continue;
    const severity = criticalStatuses.has(item.status) ? "CRITICAL" : "WARNING", id = `exception:${item.id}:${item.version}:${item.status}`;
    items.push({ id, idempotencyKey:id, type:"BUSINESS_EXCEPTION", severity, applicationId:item.applicationId, applicationName:item.applicationName, title:item.title, message:item.agentBlocked?"Agent 工作阻塞，需要重试或人工接管。":`业务单据处于 ${item.status} 状态，需要按业务流程处置。`, sourceId:item.id, objectId:item.objectId, displayKey:item.displayKey, accountableId:item.assigneeId??item.ownerId??null, href:item.href, occurredAt:item.updatedAt });
  }
  for (const item of approvals) {
    if (!allowed.has(item.applicationId) || item.status !== "PENDING") continue;
    const id = `approval:${item.id}:${item.objectVersion}`;
    items.push({ id, idempotencyKey:id, type:"APPROVAL_REQUIRED", severity:"ACTION_REQUIRED", applicationId:item.applicationId, applicationName:null, title:item.businessObject.title, message:`${item.requestedBy} 申请 ${item.fromStatus} → ${item.requestedStatus}`, sourceId:item.id, objectId:item.businessRecordId, displayKey:item.businessObject.displayKey, accountableId:null, href:item.businessObject.href, occurredAt:item.createdAt });
  }
  items.sort((a,b)=>String(b.occurredAt).localeCompare(String(a.occurredAt))||a.id.localeCompare(b.id));
  return { generatedAt, source, items, summary:{ total:items.length, critical:items.filter(item=>item.severity==="CRITICAL").length, actionRequired:items.filter(item=>item.severity==="ACTION_REQUIRED").length, byType:countBy(items,"type"), byApplication:countBy(items,"applicationId") } };
}
