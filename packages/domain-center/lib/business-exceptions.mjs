import { assertEnterpriseApplication } from "./enterprise-applications.mjs";

export const businessRecordExceptionStatuses = Object.freeze(["AT_RISK", "BLOCKED", "OVERDUE", "REJECTED", "SHORTAGE", "FAULT", "ESCALATED"]);
export const businessWorkExceptionStatuses = Object.freeze(["BLOCKED"]);

const countBy = (items, key) => items.reduce((result, item) => ({ ...result, [item[key]]: (result[item[key]] ?? 0) + 1 }), {});

export function presentBusinessRecordException(record) {
  const application = assertEnterpriseApplication(record.applicationId);
  return { id: `record:${record.id}`, type: "BUSINESS_RECORD", applicationId: application.id, applicationName: application.name, objectType: record.objectType, objectId: record.id, displayKey: record.displayKey, title: record.title, status: record.status, version: record.version, resolutionActions: record.availableTransitions ?? [], reasonCode: `RECORD_${record.status}`, ownerId: record.ownerId, assigneeId: null, agentBlocked: false, href: `${application.path}?record=${record.id}`, updatedAt: record.updatedAt };
}

export function presentBusinessWorkException(work) {
  const application = assertEnterpriseApplication(work.applicationId), object = work.businessObject;
  return { id: `work:${work.id}`, type: "WORK_ITEM", workItemId: work.id, applicationId: application.id, applicationName: application.name, objectType: object.objectType, objectId: object.objectId, displayKey: object.displayKey, title: work.title, status: work.status, version: work.version, resolutionActions: work.status === "BLOCKED" ? ["RETRY", ...(work.assignmentType === "AGENT" ? ["TAKE_OVER"] : [])] : [], reasonCode: `WORK_${work.status}`, ownerId: work.delegatedBy, assigneeId: work.assigneeId, assignmentType: work.assignmentType, agentBlocked: work.assignmentType === "AGENT" && work.status === "BLOCKED", href: object.href ?? `${application.path}?record=${object.objectId}`, updatedAt: work.updatedAt };
}

export function businessExceptionResult(items, generatedAt, source) {
  const ordered = [...items].sort((a, b) => String(b.updatedAt).localeCompare(String(a.updatedAt)));
  return { generatedAt, source, items: ordered, summary: { total: ordered.length, records: ordered.filter((item) => item.type === "BUSINESS_RECORD").length, workItems: ordered.filter((item) => item.type === "WORK_ITEM").length, agentBlocked: ordered.filter((item) => item.agentBlocked).length, byApplication: countBy(ordered, "applicationId"), byStatus: countBy(ordered, "status") } };
}
