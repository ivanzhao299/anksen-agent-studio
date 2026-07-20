import { randomUUID } from "node:crypto";
import { assertEnterpriseApplication } from "./enterprise-applications.mjs";
import { availableBusinessTransitions, getBusinessObjectDefinition, validateBusinessObjectFields } from "./business-object-definitions.mjs";
import { assertBusinessRelationContract, relationContractsFor } from "./business-relation-definitions.mjs";

const terminal = new Set(["COMPLETED", "CANCELLED", "PAID", "ARCHIVED", "TERMINATED", "WRITTEN_OFF"]);
const scopeOf = (value = {}) => {
  const organizationId = String(value.organizationId ?? "").trim();
  const workspaceId = String(value.workspaceId ?? "").trim();
  if (!organizationId || !workspaceId) throw Object.assign(new Error("BUSINESS_SCOPE_REQUIRED"), { code: "BUSINESS_SCOPE_REQUIRED" });
  return { organizationId, workspaceId };
};
const iso = (value) => value instanceof Date ? value.toISOString() : value;

export class PostgresBusinessApplicationStore {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw new Error("BUSINESS_DATABASE_POOL_REQUIRED");
    this.pool = pool;
    this.clock = clock;
  }

  async transaction(work) {
    const client = await this.pool.connect();
    try {
      await client.query("BEGIN");
      const result = await work(client);
      await client.query("COMMIT");
      return result;
    } catch (error) {
      await client.query("ROLLBACK").catch(() => {});
      throw error;
    } finally {
      client.release();
    }
  }

  presentRecord(row) {
    return {
      id: row.id, applicationId: row.application_id, objectType: row.object_type, displayKey: row.display_key,
      title: row.title, status: row.status, version: row.version, ownerId: row.owner_id, fields: row.fields,
      source: row.source, createdBy: row.created_by, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at),
      availableTransitions: availableBusinessTransitions(row.application_id, row.object_type, row.status),
      schema: getBusinessObjectDefinition(row.application_id, row.object_type)
    };
  }

  presentWork(row) {
    const application = assertEnterpriseApplication(row.application_id);
    return {
      id: row.id, applicationId: row.application_id,
      businessObject: { objectType: row.business_object_type, objectId: row.business_record_id, displayKey: row.business_display_key, version: row.business_object_version, href: `${application.path}?record=${row.business_record_id}` },
      title: row.title, status: row.status, assignmentType: row.assignment_type, assigneeId: row.assignee_id,
      version: row.version,
      delegatedBy: row.delegated_by, priority: row.priority, idempotencyKey: row.idempotency_key,
      kernelTaskId: row.kernel_task_id, kernelGoalId: row.kernel_goal_id, sessionId: row.session_id,
      resultRef: row.result_ref, createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
    };
  }

  presentEvent(row) {
    return {
      id: row.id, sequence: Number(row.sequence), type: row.event_type, event_type: row.event_type, applicationId: row.application_id,
      objectType: row.object_type, objectId: row.object_id, objectVersion: row.object_version,
      workItemId: row.work_item_id, actorId: row.actor_id, payload: row.payload,
      createdAt: iso(row.created_at)
    };
  }

  presentApproval(row) {
    return {
      id: row.id, applicationId: row.application_id, businessRecordId: row.business_record_id,
      objectVersion: row.object_version, fromStatus: row.from_status, requestedStatus: row.requested_status,
      status: row.status, requestedBy: row.requested_by, reviewedBy: row.reviewed_by,
      comment: row.comment, idempotencyKey: row.idempotency_key,
      createdAt: iso(row.created_at), reviewedAt: iso(row.reviewed_at)
    };
  }

  presentRelation(row, recordId) {
    const outgoing=row.source_record_id===recordId,targetId=outgoing?row.target_record_id:row.source_record_id;
    return {id:row.id,applicationId:row.application_id,relationType:row.relation_type,direction:outgoing?"OUTGOING":"INCOMING",createdBy:row.created_by,createdAt:iso(row.created_at),record:{id:targetId,objectType:outgoing?row.target_object_type:row.source_object_type,displayKey:outgoing?row.target_display_key:row.source_display_key,title:outgoing?row.target_title:row.source_title,status:outgoing?row.target_status:row.source_status,href:`${assertEnterpriseApplication(row.application_id).path}?record=${targetId}`}};
  }

  async listRecords(applicationId, options = {}) {
    assertEnterpriseApplication(applicationId);
    const scope = scopeOf(options);
    const params = [scope.organizationId, scope.workspaceId, applicationId];
    let sql = "SELECT * FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3";
    if (options.objectType) { params.push(options.objectType); sql += ` AND object_type=$${params.length}`; }
    sql += " ORDER BY updated_at DESC";
    return (await this.pool.query(sql, params)).rows.map((row) => this.presentRecord(row));
  }

  async getRecord(applicationId, id, actor = {}) {
    assertEnterpriseApplication(applicationId);
    const scope = scopeOf(actor);
    const row = (await this.pool.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4", [id, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
    return row ? this.presentRecord(row) : null;
  }

  async recordDetail(applicationId, id, actor = {}) {
    const scope = scopeOf(actor), record = await this.getRecord(applicationId, id, scope);
    if (!record) return null;
    const [work, events, approvals, relations, candidates] = await Promise.all([
      this.pool.query("SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND business_record_id=$4 ORDER BY updated_at DESC", [scope.organizationId, scope.workspaceId, applicationId, id]),
      this.pool.query("SELECT * FROM business_application_event WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND object_id=$4 ORDER BY sequence DESC", [scope.organizationId, scope.workspaceId, applicationId, id]),
      this.pool.query("SELECT * FROM business_approval WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND business_record_id=$4 ORDER BY created_at DESC", [scope.organizationId, scope.workspaceId, applicationId, id]),
      this.pool.query("SELECT x.*,s.object_type source_object_type,s.display_key source_display_key,s.title source_title,s.status source_status,t.object_type target_object_type,t.display_key target_display_key,t.title target_title,t.status target_status FROM business_record_relation x JOIN business_application_record s ON s.id=x.source_record_id JOIN business_application_record t ON t.id=x.target_record_id WHERE x.organization_id=$1 AND x.workspace_id=$2 AND x.application_id=$3 AND (x.source_record_id=$4 OR x.target_record_id=$4) ORDER BY x.created_at DESC",[scope.organizationId,scope.workspaceId,applicationId,id]),
      this.pool.query("SELECT id,object_type,display_key,title,status FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND id<>$4 ORDER BY updated_at DESC",[scope.organizationId,scope.workspaceId,applicationId,id])
    ]);
    const contracts=relationContractsFor(applicationId,record.objectType),relatedIds=new Set(relations.rows.flatMap(row=>[row.source_record_id,row.target_record_id]));
    return { record, workItems: work.rows.map((row) => this.presentWork(row)), approvals: approvals.rows.map((row) => this.presentApproval(row)), relations:relations.rows.map(row=>this.presentRelation(row,id)), relationOptions:contracts.flatMap(contract=>candidates.rows.filter(candidate=>!relatedIds.has(candidate.id)&&((contract.sourceType===record.objectType&&candidate.object_type===contract.targetType)||(contract.targetType===record.objectType&&candidate.object_type===contract.sourceType))).map(candidate=>({contract,direction:contract.sourceType===record.objectType?"OUTGOING":"INCOMING",record:{id:candidate.id,objectType:candidate.object_type,displayKey:candidate.display_key,title:candidate.title,status:candidate.status}}))), timeline: events.rows.map((row) => this.presentEvent(row)) };
  }

  async createRelation(applicationId,sourceRecordId,input,actor={}){
    const scope=scopeOf(actor),targetRecordId=String(input.targetRecordId??""),relationType=String(input.relationType??"").toUpperCase(),actorId=String(actor.userId??"unknown");
    return this.transaction(async client=>{
      const rows=(await client.query("SELECT * FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND id=ANY($4::uuid[]) FOR SHARE",[scope.organizationId,scope.workspaceId,applicationId,[sourceRecordId,targetRecordId]])).rows,source=rows.find(row=>row.id===sourceRecordId),target=rows.find(row=>row.id===targetRecordId);
      if(!source||!target)throw Object.assign(new Error("BUSINESS_RELATION_RECORD_NOT_FOUND"),{code:"BUSINESS_RELATION_RECORD_NOT_FOUND"});
      const contract=assertBusinessRelationContract(applicationId,source.object_type,target.object_type,relationType),id=randomUUID(),now=this.clock();
      const inserted=(await client.query("INSERT INTO business_record_relation(id,organization_id,workspace_id,application_id,source_record_id,target_record_id,relation_type,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,workspace_id,source_record_id,target_record_id,relation_type) DO NOTHING RETURNING *",[id,scope.organizationId,scope.workspaceId,applicationId,source.id,target.id,contract.relationType,actorId,now])).rows[0],row=inserted??(await client.query("SELECT * FROM business_record_relation WHERE organization_id=$1 AND workspace_id=$2 AND source_record_id=$3 AND target_record_id=$4 AND relation_type=$5",[scope.organizationId,scope.workspaceId,source.id,target.id,contract.relationType])).rows[0];
      if(inserted)await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.record.related',$4,$5,$6,$7,$8,$9,$10)",[randomUUID(),scope.organizationId,scope.workspaceId,applicationId,source.object_type,source.id,source.version,actorId,{relationId:row.id,relationType:contract.relationType,targetRecordId:target.id,targetDisplayKey:target.display_key},now]);
      return {...this.presentRelation({...row,source_object_type:source.object_type,source_display_key:source.display_key,source_title:source.title,source_status:source.status,target_object_type:target.object_type,target_display_key:target.display_key,target_title:target.title,target_status:target.status},source.id),label:contract.label};
    });
  }

  async requestApproval(applicationId, recordId, input, actor = {}) {
    const scope = scopeOf(actor), actorId = String(actor.userId ?? "unknown");
    return this.transaction(async (client) => {
      const record = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR UPDATE", [recordId, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
      if (!record) throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"), { code: "BUSINESS_RECORD_NOT_FOUND" });
      if (record.status !== "WAITING_APPROVAL" || Number(input.expectedVersion) !== record.version || !availableBusinessTransitions(applicationId, record.object_type, record.status).includes(input.requestedStatus)) throw Object.assign(new Error("BUSINESS_APPROVAL_REQUEST_DENIED"), { code: "BUSINESS_APPROVAL_REQUEST_DENIED" });
      const idempotencyKey = String(input.idempotencyKey ?? `${record.id}:${record.version}:${input.requestedStatus}`), now = this.clock(), id = randomUUID();
      const inserted = (await client.query("INSERT INTO business_approval(id,organization_id,workspace_id,application_id,business_record_id,object_version,from_status,requested_status,status,requested_by,comment,idempotency_key,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10,$11,$12) ON CONFLICT(organization_id,workspace_id,idempotency_key) DO NOTHING RETURNING *", [id, scope.organizationId, scope.workspaceId, applicationId, record.id, record.version, record.status, input.requestedStatus, actorId, String(input.comment ?? ""), idempotencyKey, now])).rows[0];
      const approval = inserted ?? (await client.query("SELECT * FROM business_approval WHERE organization_id=$1 AND workspace_id=$2 AND idempotency_key=$3", [scope.organizationId, scope.workspaceId, idempotencyKey])).rows[0];
      if (inserted) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.approval.requested',$4,$5,$6,$7,$8,$9,$10)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, record.object_type, record.id, record.version, actorId, { approvalId: approval.id, requestedStatus: approval.requested_status }, now]);
      return this.presentApproval(approval);
    });
  }

  async decideApproval(applicationId, approvalId, input, actor = {}) {
    const scope = scopeOf(actor), decision = String(input.decision ?? "").toUpperCase(), actorId = String(actor.userId ?? "unknown");
    if (!["APPROVED", "REJECTED"].includes(decision)) throw Object.assign(new Error("BUSINESS_APPROVAL_DECISION_INVALID"), { code: "BUSINESS_APPROVAL_DECISION_INVALID" });
    return this.transaction(async (client) => {
      const approval = (await client.query("SELECT * FROM business_approval WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR UPDATE", [approvalId, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
      if (!approval || approval.status !== "PENDING") throw Object.assign(new Error("BUSINESS_APPROVAL_NOT_PENDING"), { code: "BUSINESS_APPROVAL_NOT_PENDING" });
      const record = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 FOR UPDATE", [approval.business_record_id, scope.organizationId, scope.workspaceId])).rows[0];
      if (!record || record.version !== approval.object_version || record.status !== approval.from_status) throw Object.assign(new Error("BUSINESS_APPROVAL_STALE"), { code: "BUSINESS_APPROVAL_STALE" });
      const now = this.clock();
      if (decision === "APPROVED") {
        const allowed = availableBusinessTransitions(applicationId, record.object_type, record.status);
        if (!allowed.includes(approval.requested_status)) throw Object.assign(new Error("BUSINESS_RECORD_TRANSITION_DENIED"), { code: "BUSINESS_RECORD_TRANSITION_DENIED" });
        await client.query("UPDATE business_application_record SET status=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4", [approval.requested_status, now, record.id, record.version]);
      }
      const updated = (await client.query("UPDATE business_approval SET status=$1,reviewed_by=$2,comment=COALESCE(NULLIF($3,''),comment),reviewed_at=$4 WHERE id=$5 RETURNING *", [decision, actorId, String(input.comment ?? ""), now, approval.id])).rows[0];
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.approval.decided',$4,$5,$6,$7,$8,$9,$10)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, record.object_type, record.id, decision === "APPROVED" ? record.version + 1 : record.version, actorId, { approvalId: approval.id, decision, requestedStatus: approval.requested_status }, now]);
      return { approval: this.presentApproval(updated), record: this.presentRecord(decision === "APPROVED" ? { ...record, status: approval.requested_status, version: record.version + 1, updated_at: now } : record) };
    });
  }

  async createRecord(applicationId, input, actor = {}) {
    const application = assertEnterpriseApplication(applicationId), scope = scopeOf(actor);
    const type = application.objectTypes.find((item) => item.id === input.objectType);
    if (!type) throw Object.assign(new Error("BUSINESS_OBJECT_TYPE_DENIED"), { code: "BUSINESS_OBJECT_TYPE_DENIED" });
    const title = String(input.title ?? "").trim();
    if (!title) throw Object.assign(new Error("BUSINESS_RECORD_TITLE_REQUIRED"), { code: "BUSINESS_RECORD_TITLE_REQUIRED" });
    const schema = getBusinessObjectDefinition(applicationId, type.id), fields = validateBusinessObjectFields(applicationId, type.id, input.fields);
    const id = randomUUID(), now = this.clock(), displayKey = String(input.displayKey ?? "").trim() || `${type.id.toUpperCase()}-${Date.now()}`, ownerId = String(input.ownerId ?? actor.userId ?? "unassigned"), createdBy = String(actor.userId ?? "unknown");
    return this.transaction(async (client) => {
      const row = (await client.query("INSERT INTO business_application_record(id,organization_id,workspace_id,application_id,object_type,display_key,title,status,owner_id,fields,version,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,$12) RETURNING *", [id, scope.organizationId, scope.workspaceId, applicationId, type.id, displayKey, title, schema.initialStatus, ownerId, fields, createdBy, now])).rows[0];
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.created',$4,$5,$6,1,$7,$8,$9)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, type.id, id, createdBy, { displayKey, title, status: schema.initialStatus }, now]);
      return this.presentRecord(row);
    });
  }

  async transitionRecord(applicationId, id, input, actor = {}) {
    const scope = scopeOf(actor), expectedVersion = Number(input.expectedVersion), actorId = String(actor.userId ?? "unknown");
    return this.transaction(async (client) => {
      const row = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR UPDATE", [id, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
      if (!row) throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"), { code: "BUSINESS_RECORD_NOT_FOUND" });
      if (expectedVersion !== row.version) throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"), { code: "BUSINESS_RECORD_VERSION_CONFLICT" });
      const fromStatus = row.status, allowed = availableBusinessTransitions(applicationId, row.object_type, fromStatus);
      if (fromStatus === "WAITING_APPROVAL") throw Object.assign(new Error("BUSINESS_APPROVAL_REQUIRED"), { code: "BUSINESS_APPROVAL_REQUIRED", allowed });
      if (!allowed.includes(input.status) || terminal.has(fromStatus)) throw Object.assign(new Error("BUSINESS_RECORD_TRANSITION_DENIED"), { code: "BUSINESS_RECORD_TRANSITION_DENIED", allowed });
      const now = this.clock();
      const updated = (await client.query("UPDATE business_application_record SET status=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 RETURNING *", [input.status, now, id, expectedVersion])).rows[0];
      if (!updated) throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"), { code: "BUSINESS_RECORD_VERSION_CONFLICT" });
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.changed',$4,$5,$6,$7,$8,$9,$10)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, row.object_type, id, updated.version, actorId, { fromStatus, toStatus: input.status }, now]);
      return this.presentRecord(updated);
    });
  }

  async createWorkItem(input, actor = {}) {
    const application = assertEnterpriseApplication(input.applicationId), scope = scopeOf(actor), assignmentType = input.assignmentType === "AGENT" ? "AGENT" : "HUMAN", assigneeId = String(input.assigneeId ?? actor.userId ?? "unassigned"), delegatedBy = String(actor.userId ?? "unknown");
    return this.transaction(async (client) => {
      const record = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR SHARE", [input.businessObjectId, scope.organizationId, scope.workspaceId, application.id])).rows[0];
      if (!record) throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"), { code: "BUSINESS_RECORD_NOT_FOUND" });
      const idempotencyKey = String(input.idempotencyKey ?? `${assignmentType}:${record.id}:${record.version}:${assigneeId}`), id = randomUUID(), now = this.clock();
      const inserted = (await client.query("INSERT INTO business_work_item(id,organization_id,workspace_id,application_id,business_record_id,business_object_type,business_display_key,business_object_version,title,status,assignment_type,assignee_id,delegated_by,priority,idempotency_key,kernel_task_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN',$10,$11,$12,$13,$14,$15,$16,$16) ON CONFLICT(organization_id,workspace_id,idempotency_key) DO NOTHING RETURNING *", [id, scope.organizationId, scope.workspaceId, application.id, record.id, record.object_type, record.display_key, record.version, String(input.title ?? `处理 ${record.title}`), assignmentType, assigneeId, delegatedBy, input.priority ?? "MEDIUM", idempotencyKey, input.kernelTaskId ?? null, now])).rows[0];
      const row = inserted ?? (await client.query("SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND idempotency_key=$3", [scope.organizationId, scope.workspaceId, idempotencyKey])).rows[0];
      if (inserted) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.assigned',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), scope.organizationId, scope.workspaceId, application.id, record.object_type, record.id, record.version, id, delegatedBy, { assignmentType, assigneeId, idempotencyKey }, now]);
      return this.presentWork(row);
    });
  }

  async myWork(options = {}) {
    const scope = scopeOf(options), params = [scope.organizationId, scope.workspaceId, String(options.userId ?? "")];
    let sql = "SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND (assignee_id=$3 OR delegated_by=$3)";
    if (options.applicationId) { params.push(options.applicationId); sql += ` AND application_id=$${params.length}`; }
    sql += " ORDER BY updated_at DESC";
    const items = (await this.pool.query(sql, params)).rows.map((row) => this.presentWork(row));
    return { items, summary: { total: items.length, human: items.filter((item) => item.assignmentType === "HUMAN").length, agent: items.filter((item) => item.assignmentType === "AGENT").length, blocked: items.filter((item) => item.status === "BLOCKED").length, waitingApproval: items.filter((item) => ["WAITING_APPROVAL", "WAITING_REVIEW"].includes(item.status)).length } };
  }

  async approvalInbox(options = {}) {
    const scope = scopeOf(options), rows = (await this.pool.query("SELECT a.*,r.display_key,r.title record_title,r.object_type FROM business_approval a JOIN business_application_record r ON r.id=a.business_record_id WHERE a.organization_id=$1 AND a.workspace_id=$2 AND a.status='PENDING' ORDER BY a.created_at", [scope.organizationId, scope.workspaceId])).rows;
    return rows.map((row) => ({ ...this.presentApproval(row), businessObject: { objectType: row.object_type, objectId: row.business_record_id, displayKey: row.display_key, title: row.record_title, href: `${assertEnterpriseApplication(row.application_id).path}?record=${row.business_record_id}` } }));
  }

  async controlWorkItem(workItemId, input, actor = {}) {
    const scope = scopeOf(actor), action = String(input.action ?? "").toUpperCase(), actorId = String(actor.userId ?? "unknown"), expectedVersion = Number(input.expectedVersion);
    const allowedActions = new Set(["PAUSE", "RESUME", "TAKE_OVER", "REASSIGN", "RETRY", "CANCEL"]);
    if (!allowedActions.has(action)) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_INVALID"), { code: "BUSINESS_WORK_CONTROL_INVALID" });
    return this.transaction(async (client) => {
      const row = (await client.query("SELECT * FROM business_work_item WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 FOR UPDATE", [workItemId, scope.organizationId, scope.workspaceId])).rows[0];
      if (!row) throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: "WORK_ITEM_NOT_FOUND" });
      if (row.version !== expectedVersion) throw Object.assign(new Error("BUSINESS_WORK_VERSION_CONFLICT"), { code: "BUSINESS_WORK_VERSION_CONFLICT" });
      if (["COMPLETED", "CANCELLED"].includes(row.status)) throw Object.assign(new Error("BUSINESS_WORK_TERMINAL"), { code: "BUSINESS_WORK_TERMINAL" });
      if (row.kernel_goal_id) {
        const active = (await client.query("SELECT EXISTS(SELECT 1 FROM ad_task_lease l JOIN ad_task t ON t.id=l.task_id WHERE t.goal_id=$1 AND l.status='ACTIVE' AND l.expires_at>now()) active", [row.kernel_goal_id])).rows[0].active;
        if (active) throw Object.assign(new Error("BUSINESS_WORK_ACTIVE_LEASE"), { code: "BUSINESS_WORK_ACTIVE_LEASE" });
      }
      let status = row.status, assignmentType = row.assignment_type, assigneeId = row.assignee_id;
      if (action === "PAUSE") { if (row.assignment_type !== "AGENT" || !["OPEN", "BLOCKED", "WAITING_APPROVAL"].includes(row.status)) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_DENIED"), { code: "BUSINESS_WORK_CONTROL_DENIED" }); status = "PAUSED"; }
      if (action === "RESUME") { if (row.status !== "PAUSED") throw Object.assign(new Error("BUSINESS_WORK_CONTROL_DENIED"), { code: "BUSINESS_WORK_CONTROL_DENIED" }); status = "OPEN"; }
      if (action === "RETRY") { if (row.status !== "BLOCKED") throw Object.assign(new Error("BUSINESS_WORK_CONTROL_DENIED"), { code: "BUSINESS_WORK_CONTROL_DENIED" }); status = "OPEN"; }
      if (action === "TAKE_OVER") { if (row.assignment_type !== "AGENT" || !["OPEN", "PAUSED", "BLOCKED", "WAITING_APPROVAL"].includes(row.status)) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_DENIED"), { code: "BUSINESS_WORK_CONTROL_DENIED" }); status = "OPEN"; assignmentType = "HUMAN"; assigneeId = String(input.assigneeId ?? actorId); }
      if (action === "REASSIGN") { if (!["OPEN", "PAUSED", "BLOCKED", "WAITING_APPROVAL"].includes(row.status) || !String(input.assigneeId ?? "").trim()) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_DENIED"), { code: "BUSINESS_WORK_CONTROL_DENIED" }); assignmentType = input.assignmentType === "AGENT" ? "AGENT" : "HUMAN"; assigneeId = String(input.assigneeId).trim(); status = row.status === "BLOCKED" ? "OPEN" : row.status; }
      if (action === "CANCEL") status = "CANCELLED";
      const now = this.clock(), updated = (await client.query("UPDATE business_work_item SET status=$1,assignment_type=$2,assignee_id=$3,version=version+1,updated_at=$4 WHERE id=$5 AND version=$6 RETURNING *", [status, assignmentType, assigneeId, now, row.id, expectedVersion])).rows[0];
      if (!updated) throw Object.assign(new Error("BUSINESS_WORK_VERSION_CONFLICT"), { code: "BUSINESS_WORK_VERSION_CONFLICT" });
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.controlled',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), row.organization_id, row.workspace_id, row.application_id, row.business_object_type, row.business_record_id, row.business_object_version, row.id, actorId, { action, fromStatus: row.status, toStatus: status, fromAssignmentType: row.assignment_type, assignmentType, assigneeId, workVersion: updated.version, reason: String(input.reason ?? "") }, now]);
      return this.presentWork(updated);
    });
  }

  async applicationReport(applicationId, options = {}) {
    const application = assertEnterpriseApplication(applicationId), scope = scopeOf(options), params = [scope.organizationId, scope.workspaceId, applicationId];
    const [records, work, approvals, relations] = await Promise.all([
      this.pool.query("SELECT object_type,status,count(*)::int count FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 GROUP BY object_type,status ORDER BY object_type,status", params),
      this.pool.query("SELECT assignment_type,status,count(*)::int count FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 GROUP BY assignment_type,status ORDER BY assignment_type,status", params),
      this.pool.query("SELECT status,count(*)::int count FROM business_approval WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 GROUP BY status ORDER BY status", params),
      this.pool.query("SELECT relation_type,count(*)::int count FROM business_record_relation WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 GROUP BY relation_type ORDER BY relation_type",params)
    ]);
    const recent = (await this.pool.query("SELECT * FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 ORDER BY updated_at DESC LIMIT 8", params)).rows.map((row) => this.presentRecord(row));
    const sum = (rows) => rows.reduce((total, row) => total + row.count, 0), group = (rows, key) => Object.fromEntries(rows.map((row) => [row[key], row.count]));
    const attentionStatuses = new Set(["BLOCKED", "OVERDUE", "REJECTED", "SHORTAGE", "FAULT", "ESCALATED"]), attention = records.rows.filter((row) => attentionStatuses.has(row.status)).reduce((total, row) => total + row.count, 0);
    return { generatedAt: this.clock().toISOString(), source: "POSTGRESQL_BUSINESS_APPLICATION_STORE", application: { id: application.id, name: application.name, path: application.path }, totalRecords: sum(records.rows), byStatus: group(records.rows, "status"), byObjectType: records.rows.reduce((result, row) => ({ ...result, [row.object_type]: (result[row.object_type] ?? 0) + row.count }), {}), businessChains:{total:sum(relations.rows),byType:group(relations.rows,"relation_type")}, work: { total: sum(work.rows), human: work.rows.filter((row) => row.assignment_type === "HUMAN").reduce((total, row) => total + row.count, 0), agent: work.rows.filter((row) => row.assignment_type === "AGENT").reduce((total, row) => total + row.count, 0), blocked: work.rows.filter((row) => row.status === "BLOCKED").reduce((total, row) => total + row.count, 0) }, approvals: group(approvals.rows, "status"), pendingApprovals: approvals.rows.find((row) => row.status === "PENDING")?.count ?? 0, attention, recentRecords: recent.map((record) => ({ id: record.id, displayKey: record.displayKey, title: record.title, objectType: record.objectType, status: record.status, updatedAt: record.updatedAt, href: `${application.path}?record=${record.id}` })) };
  }

  async attachWorkflow(workItemId, { goalId, sessionId, report, status = "WAITING_APPROVAL" }) {
    return this.transaction(async (client) => {
      const now = this.clock(), resultRef = report ? `night-shift-report:${sessionId}` : null;
      const row = (await client.query("UPDATE business_work_item SET kernel_goal_id=$1,session_id=$2,result_ref=$3,status=$4,version=version+1,updated_at=$5 WHERE id=$6 RETURNING *", [goalId, sessionId, resultRef, status, now, workItemId])).rows[0];
      if (!row) throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: "WORK_ITEM_NOT_FOUND" });
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.runtime.attached',$4,$5,$6,$7,$8,'runtime',$9,$10)", [randomUUID(), row.organization_id, row.workspace_id, row.application_id, row.business_object_type, row.business_record_id, row.business_object_version, row.id, { goalId, sessionId, status, resultRef }, now]);
      return this.presentWork(row);
    });
  }

  async completeWorkflow(workItemId, { goalId, sessionId, report, workStatus, businessStatus = null, expectedObjectVersion = null, expectedWorkVersion = null, actorId = "runtime" }) {
    return this.transaction(async (client) => {
      const now = this.clock(), resultRef = report ? `night-shift-report:${sessionId}` : null;
      const work = (await client.query("SELECT * FROM business_work_item WHERE id=$1 FOR UPDATE", [workItemId])).rows[0];
      if (!work) throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: "WORK_ITEM_NOT_FOUND" });
      if (expectedWorkVersion !== null && work.version !== Number(expectedWorkVersion)) throw Object.assign(new Error("BUSINESS_WORK_VERSION_CONFLICT"), { code: "BUSINESS_WORK_VERSION_CONFLICT" });
      let record = null;
      if (businessStatus) {
        record = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 FOR UPDATE", [work.business_record_id, work.organization_id, work.workspace_id])).rows[0];
        if (!record) throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"), { code: "BUSINESS_RECORD_NOT_FOUND" });
        if (record.version !== Number(expectedObjectVersion)) throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"), { code: "BUSINESS_RECORD_VERSION_CONFLICT" });
        const allowed = availableBusinessTransitions(record.application_id, record.object_type, record.status);
        if (!allowed.includes(businessStatus)) throw Object.assign(new Error("BUSINESS_RECORD_TRANSITION_DENIED"), { code: "BUSINESS_RECORD_TRANSITION_DENIED", allowed });
        record = (await client.query("UPDATE business_application_record SET status=$1,version=version+1,updated_at=$2 WHERE id=$3 AND version=$4 RETURNING *", [businessStatus, now, record.id, expectedObjectVersion])).rows[0];
        if (!record) throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"), { code: "BUSINESS_RECORD_VERSION_CONFLICT" });
      }
      const updatedWork = (await client.query("UPDATE business_work_item SET kernel_goal_id=$1,session_id=$2,result_ref=$3,status=$4,version=version+1,updated_at=$5 WHERE id=$6 RETURNING *", [goalId, sessionId, resultRef, workStatus, now, workItemId])).rows[0];
      if (record) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.workflow-transitioned',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), work.organization_id, work.workspace_id, work.application_id, work.business_object_type, work.business_record_id, record.version, work.id, actorId, { toStatus: businessStatus, goalId, sessionId }, now]);
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.runtime.completed',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), work.organization_id, work.workspace_id, work.application_id, work.business_object_type, work.business_record_id, record?.version ?? work.business_object_version, work.id, actorId, { goalId, sessionId, status: workStatus, resultRef }, now]);
      return { workItem: this.presentWork(updatedWork), record: record ? this.presentRecord(record) : null };
    });
  }

  async events(options = {}) {
    const scope = scopeOf(options), params = [scope.organizationId, scope.workspaceId];
    let sql = "SELECT * FROM business_application_event WHERE organization_id=$1 AND workspace_id=$2";
    if (options.applicationId) { params.push(options.applicationId); sql += ` AND application_id=$${params.length}`; }
    sql += " ORDER BY sequence";
    return (await this.pool.query(sql, params)).rows.map((row) => this.presentEvent(row));
  }
}
