import { randomUUID } from "node:crypto";
import { assertEnterpriseApplication } from "./enterprise-applications.mjs";
import { availableBusinessTransitions, businessRecordEditable, getBusinessObjectDefinition, validateBusinessObjectFields } from "./business-object-definitions.mjs";
import { assertBusinessRelationContract, relationContractsFor } from "./business-relation-definitions.mjs";
import { businessExceptionResult, businessRecordExceptionStatuses, businessWorkExceptionStatuses, presentBusinessRecordException, presentBusinessWorkException } from "./business-exceptions.mjs";
import { businessSearchResult, normalizeBusinessSearch, presentBusinessSearchRecord } from "./business-record-search.mjs";
import { validateBusinessRecordNote } from "./business-record-notes.mjs";
import { businessRecordListResult, normalizeBusinessRecordList } from "./business-record-list.mjs";
import { businessDelegationAuditPayload, presentBusinessDelegationProjection } from "./business-delegation-preview.mjs";
import { projectBusinessWorkExecution } from "./business-work-execution.mjs";
import { presentBusinessWorkResultSummary } from "./business-work-result.mjs";

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
      editable: businessRecordEditable(row.application_id,row.object_type,row.status),
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
      resultRef: row.result_ref, resultSummary: presentBusinessWorkResultSummary(row.result_summary), createdAt: iso(row.created_at), updatedAt: iso(row.updated_at)
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

  async kernelExecutionEvidence(goalIds) {
    const ids=[...new Set(goalIds.filter(Boolean))];
    if(!ids.length)return new Map();
    const available=(await this.pool.query("SELECT to_regclass('ad_task') task,to_regclass('ad_task_attempt') attempt,to_regclass('ad_worker') worker")).rows[0];
    if(!available.task||!available.attempt||!available.worker)return new Map();
    const rows=(await this.pool.query(`SELECT t.goal_id,t.id task_id,t.task_key,t.title,t.status task_status,t.risk_level,
      t.metadata->>'skillType' skill_type,t.metadata->>'agentId' agent_id,t.metadata->>'workerKey' planned_worker,
      t.metadata#>>'{businessTaskBinding,skill,businessSkillId}' business_skill_id,
      t.metadata#>>'{businessTaskBinding,workflow,stageId}' stage_id,
      a.id attempt_id,a.attempt_number,a.status attempt_status,a.validation_result,a.started_at,a.finished_at,
      w.worker_key actual_worker,w.name worker_name,w.runtime_type,w.status worker_status,
      l.status lease_status
      FROM ad_task t
      LEFT JOIN LATERAL(SELECT * FROM ad_task_attempt x WHERE x.task_id=t.id ORDER BY x.attempt_number DESC LIMIT 1)a ON true
      LEFT JOIN ad_worker w ON w.id=a.worker_id
      LEFT JOIN ad_task_lease l ON l.id=a.lease_id
      WHERE t.goal_id=ANY($1::uuid[]) ORDER BY t.created_at,t.task_key`,[ids])).rows,map=new Map(ids.map(id=>[id,[]]));
    for(const row of rows){
      const result=row.validation_result&&Object.keys(row.validation_result).length?row.validation_result:null;
      map.get(row.goal_id)?.push({taskId:row.task_id,taskKey:row.task_key,title:row.title,taskStatus:row.task_status,riskLevel:row.risk_level,stageId:row.stage_id,businessSkillId:row.business_skill_id,skillType:row.skill_type,agentId:row.agent_id,plannedWorker:row.planned_worker,attempt:row.attempt_id?{id:row.attempt_id,number:row.attempt_number,status:row.attempt_status,startedAt:iso(row.started_at),finishedAt:iso(row.finished_at)}:null,runner:row.actual_worker?{workerKey:row.actual_worker,name:row.worker_name,runtimeType:row.runtime_type,status:row.worker_status}:null,lease:row.lease_status?{status:row.lease_status}:null,runtimeResult:result?{executionId:result.executionId??null,runtimeType:result.runtimeType??row.runtime_type,status:result.status??row.attempt_status,exitCode:result.exitCode??null,startedAt:result.startedAt??null,finishedAt:result.finishedAt??null,durationMs:result.durationMs??null,errorCode:result.errorCode??null,fencingValidated:result.fencingValidated===true}:null});
    }
    return map;
  }

  async kernelSessionEvidence(sessionIds,scope) {
    const ids=[...new Set(sessionIds.filter(Boolean))];if(!ids.length)return new Map();
    const available=(await this.pool.query("SELECT to_regclass('ad_night_shift_session') session")).rows[0];if(!available.session)return new Map();
    const rows=(await this.pool.query("SELECT s.id,s.status,s.scheduler_tick_count,s.worker_claim_count,s.runtime_execution_count,s.error_summary,s.report,s.started_at,s.finished_at,s.updated_at FROM ad_night_shift_session s JOIN ad_goal g ON g.id=s.goal_id WHERE s.id=ANY($1::uuid[]) AND g.organization_id=$2 AND g.workspace_id=$3",[ids,scope.organizationId,scope.workspaceId])).rows;
    return new Map(rows.map(row=>[row.id,{status:row.status,schedulerTickCount:row.scheduler_tick_count,workerClaimCount:row.worker_claim_count,runtimeExecutionCount:row.runtime_execution_count,errorSummary:row.error_summary,report:row.report,startedAt:iso(row.started_at),finishedAt:iso(row.finished_at),updatedAt:iso(row.updated_at)}]));
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

  async recordPage(applicationId,options={}) {
    assertEnterpriseApplication(applicationId);const scope=scopeOf(options),filter=normalizeBusinessRecordList(options),params=[scope.organizationId,scope.workspaceId,applicationId],conditions=["organization_id=$1","workspace_id=$2","application_id=$3"];
    if(filter.query){params.push(filter.query);conditions.push(`(position(lower($${params.length}) in lower(display_key))>0 OR position(lower($${params.length}) in lower(title))>0 OR position(lower($${params.length}) in lower(owner_id))>0)`);}
    if(filter.objectType){params.push(filter.objectType);conditions.push(`object_type=$${params.length}`);}
    if(filter.status){params.push(filter.status);conditions.push(`status=$${params.length}`);}
    if(filter.ownerId){params.push(filter.ownerId);conditions.push(`owner_id=$${params.length}`);}
    params.push(filter.limit,filter.offset);const rows=(await this.pool.query(`SELECT *,count(*) OVER()::int total_count FROM business_application_record WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC,id LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows,items=rows.map(row=>this.presentRecord(row)),total=rows[0]?.total_count??(filter.offset?Number((await this.pool.query(`SELECT count(*)::int count FROM business_application_record WHERE ${conditions.join(" AND ")}`,params.slice(0,-2))).rows[0].count):0);return businessRecordListResult({items,total,filter,generatedAt:this.clock().toISOString(),source:"POSTGRESQL_BUSINESS_APPLICATION_STORE"});
  }

  async searchRecords(options={}) {
    const scope=scopeOf(options),search=normalizeBusinessSearch(options);
    if(!search.applicationIds.length)return businessSearchResult({items:[],total:0,search,generatedAt:this.clock().toISOString(),source:"POSTGRESQL_BUSINESS_APPLICATION_STORE"});
    const params=[scope.organizationId,scope.workspaceId,search.applicationIds],conditions=["organization_id=$1","workspace_id=$2","application_id=ANY($3::text[])"];
    if(search.query){params.push(search.query);conditions.push(`(position(lower($${params.length}) in lower(display_key))>0 OR position(lower($${params.length}) in lower(title))>0 OR position(lower($${params.length}) in lower(owner_id))>0)`);}
    if(search.status){params.push(search.status);conditions.push(`status=$${params.length}`);}
    if(search.ownerId){params.push(search.ownerId);conditions.push(`owner_id=$${params.length}`);}
    params.push(search.limit,search.offset);const rows=(await this.pool.query(`SELECT *,count(*) OVER()::int total_count FROM business_application_record WHERE ${conditions.join(" AND ")} ORDER BY updated_at DESC,id LIMIT $${params.length-1} OFFSET $${params.length}`,params)).rows,items=rows.map(row=>presentBusinessSearchRecord(this.presentRecord(row))),total=rows[0]?.total_count??(search.offset?Number((await this.pool.query(`SELECT count(*)::int count FROM business_application_record WHERE ${conditions.join(" AND ")}`,params.slice(0,-2))).rows[0].count):0);
    return businessSearchResult({items,total,search,generatedAt:this.clock().toISOString(),source:"POSTGRESQL_BUSINESS_APPLICATION_STORE"});
  }

  async getRecord(applicationId, id, actor = {}) {
    assertEnterpriseApplication(applicationId);
    const scope = scopeOf(actor);
    const row = (await this.pool.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4", [id, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
    return row ? this.presentRecord(row) : null;
  }

  async updateRecord(applicationId,id,input,actor={}) {
    const scope=scopeOf(actor),actorId=String(actor.userId??"unknown");return this.transaction(async client=>{const row=(await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR UPDATE",[id,scope.organizationId,scope.workspaceId,applicationId])).rows[0];if(!row)throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"),{code:"BUSINESS_RECORD_NOT_FOUND"});if(row.version!==Number(input.expectedVersion))throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"),{code:"BUSINESS_RECORD_VERSION_CONFLICT"});if(!businessRecordEditable(applicationId,row.object_type,row.status))throw Object.assign(new Error("BUSINESS_RECORD_NOT_EDITABLE"),{code:"BUSINESS_RECORD_NOT_EDITABLE"});const title=String(input.title??row.title).trim(),ownerId=String(input.ownerId??row.owner_id).trim();if(!title)throw Object.assign(new Error("BUSINESS_RECORD_TITLE_REQUIRED"),{code:"BUSINESS_RECORD_TITLE_REQUIRED"});if(!ownerId)throw Object.assign(new Error("BUSINESS_RECORD_OWNER_REQUIRED"),{code:"BUSINESS_RECORD_OWNER_REQUIRED"});const fields=validateBusinessObjectFields(applicationId,row.object_type,{...row.fields,...(input.fields??{})}),changedFields=Object.keys(fields).filter(key=>JSON.stringify(fields[key])!==JSON.stringify(row.fields?.[key])),now=this.clock(),updated=(await client.query("UPDATE business_application_record SET title=$1,owner_id=$2,fields=$3,version=version+1,updated_at=$4 WHERE id=$5 AND version=$6 RETURNING *",[title,ownerId,fields,now,row.id,row.version])).rows[0];if(!updated)throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"),{code:"BUSINESS_RECORD_VERSION_CONFLICT"});await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.updated',$4,$5,$6,$7,$8,$9,$10)",[randomUUID(),scope.organizationId,scope.workspaceId,applicationId,row.object_type,row.id,updated.version,actorId,{changedFields,titleChanged:title!==row.title,ownerChanged:ownerId!==row.owner_id},now]);return this.presentRecord(updated);});
  }

  async addRecordNote(applicationId,id,input,actor={}) {
    const scope=scopeOf(actor),actorId=String(actor.userId??"unknown"),text=validateBusinessRecordNote(input.text);
    return this.transaction(async client=>{const row=(await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR SHARE",[id,scope.organizationId,scope.workspaceId,applicationId])).rows[0];if(!row)throw Object.assign(new Error("BUSINESS_RECORD_NOT_FOUND"),{code:"BUSINESS_RECORD_NOT_FOUND"});if(row.version!==Number(input.expectedVersion))throw Object.assign(new Error("BUSINESS_RECORD_VERSION_CONFLICT"),{code:"BUSINESS_RECORD_VERSION_CONFLICT"});const created=(await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.record.note.added',$4,$5,$6,$7,$8,$9,$10) RETURNING *",[randomUUID(),scope.organizationId,scope.workspaceId,applicationId,row.object_type,row.id,row.version,actorId,{text},this.clock()])).rows[0];return this.presentEvent(created);});
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
    const contracts=relationContractsFor(applicationId,record.objectType),relatedIds=new Set(relations.rows.flatMap(row=>[row.source_record_id,row.target_record_id])),evidence=await this.kernelExecutionEvidence(work.rows.map(row=>row.kernel_goal_id)),sessions=await this.kernelSessionEvidence(work.rows.map(row=>row.session_id),scope);
    const delegationPlans=new Map(events.rows.filter(row=>row.event_type==="business.work.delegation-approved"&&row.work_item_id).map(row=>[row.work_item_id,presentBusinessDelegationProjection(row.payload)]));
    return { record, workItems: work.rows.map((row) => {const item=this.presentWork(row),tasks=evidence.get(row.kernel_goal_id)??[];return{...item,delegationPlan:delegationPlans.get(row.id)??null,execution:projectBusinessWorkExecution({workItem:item,tasks,session:sessions.get(row.session_id)??null}),executionEvidence:tasks};}), approvals: approvals.rows.map((row) => this.presentApproval(row)), relations:relations.rows.map(row=>this.presentRelation(row,id)), relationOptions:contracts.flatMap(contract=>candidates.rows.filter(candidate=>!relatedIds.has(candidate.id)&&((contract.sourceType===record.objectType&&candidate.object_type===contract.targetType)||(contract.targetType===record.objectType&&candidate.object_type===contract.sourceType))).map(candidate=>({contract,direction:contract.sourceType===record.objectType?"OUTGOING":"INCOMING",record:{id:candidate.id,objectType:candidate.object_type,displayKey:candidate.display_key,title:candidate.title,status:candidate.status}}))), timeline: events.rows.map((row) => this.presentEvent(row)) };
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

  async createRelatedRecord(applicationId, sourceRecordId, input, actor = {}) {
    const application = assertEnterpriseApplication(applicationId), scope = scopeOf(actor), actorId = String(actor.userId ?? "unknown");
    const targetType = String(input.objectType ?? ""), relationType = String(input.relationType ?? "").toUpperCase(), title = String(input.title ?? "").trim(), displayKey = String(input.displayKey ?? "").trim();
    if (!application.objectTypes.some((item) => item.id === targetType)) throw Object.assign(new Error("BUSINESS_OBJECT_TYPE_DENIED"), { code: "BUSINESS_OBJECT_TYPE_DENIED" });
    if (!title) throw Object.assign(new Error("BUSINESS_RECORD_TITLE_REQUIRED"), { code: "BUSINESS_RECORD_TITLE_REQUIRED" });
    if (!displayKey) throw Object.assign(new Error("BUSINESS_RELATED_DISPLAY_KEY_REQUIRED"), { code: "BUSINESS_RELATED_DISPLAY_KEY_REQUIRED" });
    const schema = getBusinessObjectDefinition(applicationId, targetType), fields = validateBusinessObjectFields(applicationId, targetType, input.fields), ownerId = String(input.ownerId ?? actor.userId ?? "unassigned");
    return this.transaction(async (client) => {
      const source = (await client.query("SELECT * FROM business_application_record WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND application_id=$4 FOR SHARE", [sourceRecordId, scope.organizationId, scope.workspaceId, applicationId])).rows[0];
      if (!source) throw Object.assign(new Error("BUSINESS_RELATION_RECORD_NOT_FOUND"), { code: "BUSINESS_RELATION_RECORD_NOT_FOUND" });
      const contract = assertBusinessRelationContract(applicationId, source.object_type, targetType, relationType);
      if (!contract.sourceStatuses.includes(source.status)) throw Object.assign(new Error("BUSINESS_RELATED_SOURCE_STATUS_DENIED"), { code: "BUSINESS_RELATED_SOURCE_STATUS_DENIED", allowed: contract.sourceStatuses, current: source.status });
      const now = this.clock(), targetId = randomUUID();
      const inserted = (await client.query("INSERT INTO business_application_record(id,organization_id,workspace_id,application_id,object_type,display_key,title,status,owner_id,fields,version,created_by,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,1,$11,$12,$12) ON CONFLICT(organization_id,workspace_id,application_id,display_key) DO NOTHING RETURNING *", [targetId, scope.organizationId, scope.workspaceId, applicationId, targetType, displayKey, title, schema.initialStatus, ownerId, fields, actorId, now])).rows[0];
      const target = inserted ?? (await client.query("SELECT * FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=$3 AND display_key=$4 FOR SHARE", [scope.organizationId, scope.workspaceId, applicationId, displayKey])).rows[0];
      if (!target || target.object_type !== targetType) throw Object.assign(new Error("BUSINESS_RELATED_IDEMPOTENCY_CONFLICT"), { code: "BUSINESS_RELATED_IDEMPOTENCY_CONFLICT" });
      const relationId = randomUUID(), relationInserted = (await client.query("INSERT INTO business_record_relation(id,organization_id,workspace_id,application_id,source_record_id,target_record_id,relation_type,created_by,created_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9) ON CONFLICT(organization_id,workspace_id,source_record_id,target_record_id,relation_type) DO NOTHING RETURNING *", [relationId, scope.organizationId, scope.workspaceId, applicationId, source.id, target.id, contract.relationType, actorId, now])).rows[0];
      const relation = relationInserted ?? (await client.query("SELECT * FROM business_record_relation WHERE organization_id=$1 AND workspace_id=$2 AND source_record_id=$3 AND target_record_id=$4 AND relation_type=$5", [scope.organizationId, scope.workspaceId, source.id, target.id, contract.relationType])).rows[0];
      if (inserted) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.created',$4,$5,$6,1,$7,$8,$9)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, targetType, target.id, actorId, { displayKey, title, status: schema.initialStatus, sourceRecordId: source.id }, now]);
      if (relationInserted) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,actor_id,payload,created_at) VALUES($1,$2,$3,'business.record.related',$4,$5,$6,$7,$8,$9,$10)", [randomUUID(), scope.organizationId, scope.workspaceId, applicationId, source.object_type, source.id, source.version, actorId, { relationId: relation.id, relationType: contract.relationType, targetRecordId: target.id, targetDisplayKey: target.display_key, createdAtomically: true }, now]);
      return { record: this.presentRecord(target), relation: { ...this.presentRelation({ ...relation, source_object_type: source.object_type, source_display_key: source.display_key, source_title: source.title, source_status: source.status, target_object_type: target.object_type, target_display_key: target.display_key, target_title: target.title, target_status: target.status }, source.id), label: contract.label }, created: Boolean(inserted) };
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
      const delegationPlan=input.delegationPlan?businessDelegationAuditPayload(input.delegationPlan):null;if(delegationPlan&&(delegationPlan.businessObjectVersion!==record.version||delegationPlan.businessObjectId!==record.id||delegationPlan.applicationId!==application.id||delegationPlan.objectType!==record.object_type))throw Object.assign(new Error("BUSINESS_DELEGATION_PLAN_MISMATCH"),{code:"BUSINESS_DELEGATION_PLAN_MISMATCH"});
      const idempotencyKey = String(input.idempotencyKey ?? `${assignmentType}:${record.id}:${record.version}:${assigneeId}`), id = randomUUID(), now = this.clock();
      const inserted = (await client.query("INSERT INTO business_work_item(id,organization_id,workspace_id,application_id,business_record_id,business_object_type,business_display_key,business_object_version,title,status,assignment_type,assignee_id,delegated_by,priority,idempotency_key,kernel_task_id,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN',$10,$11,$12,$13,$14,$15,$16,$16) ON CONFLICT(organization_id,workspace_id,idempotency_key) DO NOTHING RETURNING *", [id, scope.organizationId, scope.workspaceId, application.id, record.id, record.object_type, record.display_key, record.version, String(input.title ?? `处理 ${record.title}`), assignmentType, assigneeId, delegatedBy, input.priority ?? "MEDIUM", idempotencyKey, input.kernelTaskId ?? null, now])).rows[0];
      const row = inserted ?? (await client.query("SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND idempotency_key=$3", [scope.organizationId, scope.workspaceId, idempotencyKey])).rows[0];
      if (inserted) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.assigned',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), scope.organizationId, scope.workspaceId, application.id, record.object_type, record.id, record.version, id, delegatedBy, { assignmentType, assigneeId, idempotencyKey }, now]);
      if(inserted&&delegationPlan)await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.delegation-approved',$4,$5,$6,$7,$8,$9,$10,$11)",[randomUUID(),scope.organizationId,scope.workspaceId,application.id,record.object_type,record.id,record.version,id,delegatedBy,delegationPlan,now]);
      return this.presentWork(row);
    });
  }

  async myWork(options = {}) {
    const scope = scopeOf(options), params = [scope.organizationId, scope.workspaceId];
    let sql = "SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2";
    if (!options.includeAll) { params.push(String(options.userId ?? "")); sql += ` AND (assignee_id=$${params.length} OR delegated_by=$${params.length})`; }
    if (options.applicationId) { params.push(options.applicationId); sql += ` AND application_id=$${params.length}`; }
    sql += " ORDER BY updated_at DESC";
    const items = (await this.pool.query(sql, params)).rows.map((row) => this.presentWork(row));
    const planRows=items.length?(await this.pool.query("SELECT work_item_id,payload FROM business_application_event WHERE organization_id=$1 AND workspace_id=$2 AND event_type='business.work.delegation-approved' AND work_item_id=ANY($3::uuid[]) ORDER BY sequence DESC",[scope.organizationId,scope.workspaceId,items.map(item=>item.id)])).rows:[];
    const plans=new Map(planRows.map(row=>[row.work_item_id,presentBusinessDelegationProjection(row.payload)])),evidence=await this.kernelExecutionEvidence(items.map(item=>item.kernelGoalId)),sessions=await this.kernelSessionEvidence(items.map(item=>item.sessionId),scope),projected=items.map(item=>{const tasks=evidence.get(item.kernelGoalId)??[];return{...item,delegationPlan:plans.get(item.id)??null,execution:projectBusinessWorkExecution({workItem:item,tasks,session:sessions.get(item.sessionId)??null})};});
    return { items:projected, summary: { total: projected.length, human: projected.filter((item) => item.assignmentType === "HUMAN").length, agent: projected.filter((item) => item.assignmentType === "AGENT").length, blocked: projected.filter((item) => item.status === "BLOCKED").length, waitingApproval: projected.filter((item) => ["WAITING_APPROVAL", "WAITING_REVIEW"].includes(item.status)).length } };
  }

  async approvalInbox(options = {}) {
    const scope = scopeOf(options), rows = (await this.pool.query("SELECT a.*,r.display_key,r.title record_title,r.object_type FROM business_approval a JOIN business_application_record r ON r.id=a.business_record_id WHERE a.organization_id=$1 AND a.workspace_id=$2 AND a.status='PENDING' ORDER BY a.created_at", [scope.organizationId, scope.workspaceId])).rows;
    return rows.map((row) => ({ ...this.presentApproval(row), businessObject: { objectType: row.object_type, objectId: row.business_record_id, displayKey: row.display_key, title: row.record_title, href: `${assertEnterpriseApplication(row.application_id).path}?record=${row.business_record_id}` } }));
  }

  async businessExceptions(options = {}) {
    const scope = scopeOf(options), applicationIds = [...new Set(options.applicationIds ?? [])], limit = Math.max(1, Math.min(Number(options.limit) || 100, 200));
    if (!applicationIds.length) return businessExceptionResult([], this.clock().toISOString(), "POSTGRESQL_BUSINESS_APPLICATION_STORE");
    const [records, work] = await Promise.all([
      this.pool.query("SELECT * FROM business_application_record WHERE organization_id=$1 AND workspace_id=$2 AND application_id=ANY($3::text[]) AND status=ANY($4::text[]) ORDER BY updated_at DESC LIMIT $5", [scope.organizationId, scope.workspaceId, applicationIds, businessRecordExceptionStatuses, limit]),
      this.pool.query("SELECT * FROM business_work_item WHERE organization_id=$1 AND workspace_id=$2 AND application_id=ANY($3::text[]) AND status=ANY($4::text[]) ORDER BY updated_at DESC LIMIT $5", [scope.organizationId, scope.workspaceId, applicationIds, businessWorkExceptionStatuses, limit])
    ]);
    const items = [...records.rows.map((row) => presentBusinessRecordException(this.presentRecord(row))), ...work.rows.map((row) => presentBusinessWorkException(this.presentWork(row)))].sort((a,b)=>String(b.updatedAt).localeCompare(String(a.updatedAt))).slice(0,limit);
    return businessExceptionResult(items, this.clock().toISOString(), "POSTGRESQL_BUSINESS_APPLICATION_STORE");
  }

  async controlWorkItem(workItemId, input, actor = {}) {
    const scope = scopeOf(actor), action = String(input.action ?? "").toUpperCase(), actorId = String(actor.userId ?? "unknown"), expectedVersion = Number(input.expectedVersion);
    const allowedActions = new Set(["PAUSE", "RESUME", "TAKE_OVER", "REASSIGN", "RETRY", "CANCEL"]);
    if (!allowedActions.has(action)) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_INVALID"), { code: "BUSINESS_WORK_CONTROL_INVALID" });
    return this.transaction(async (client) => {
      const row = (await client.query("SELECT * FROM business_work_item WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 FOR UPDATE", [workItemId, scope.organizationId, scope.workspaceId])).rows[0];
      if (!row) throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"), { code: "WORK_ITEM_NOT_FOUND" });
      if (action === "RETRY" && row.session_id) throw Object.assign(new Error("BUSINESS_WORK_NEW_DELEGATION_REQUIRED"), { code: "BUSINESS_WORK_NEW_DELEGATION_REQUIRED" });
      if (!actor.canManageBusiness && actorId !== row.assignee_id && actorId !== row.delegated_by) throw Object.assign(new Error("BUSINESS_WORK_CONTROL_FORBIDDEN"), { code: "BUSINESS_WORK_CONTROL_FORBIDDEN" });
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

  async runnableAgentWorkItems({limit=20}={}) {
    const bounded=Math.max(1,Math.min(Number(limit)||20,100)),rows=(await this.pool.query("SELECT * FROM business_work_item WHERE assignment_type='AGENT' AND status='RUNNING' AND kernel_goal_id IS NOT NULL AND session_id IS NOT NULL ORDER BY updated_at,id LIMIT $1",[bounded])).rows;
    return rows.map(row=>({...this.presentWork(row),organizationId:row.organization_id,workspaceId:row.workspace_id}));
  }

  async getWorkItemForRunner(workItemId) {
    const row=(await this.pool.query("SELECT * FROM business_work_item WHERE id=$1",[workItemId])).rows[0];return row?{...this.presentWork(row),organizationId:row.organization_id,workspaceId:row.workspace_id}:null;
  }

  async attachWorkflow(workItemId, { goalId, sessionId, report, status = "WAITING_APPROVAL", expectedWorkVersion = null }) {
    return this.transaction(async (client) => {
      const now = this.clock(), resultRef = report ? `night-shift-report:${sessionId}` : null;
      const row = (await client.query("UPDATE business_work_item SET kernel_goal_id=$1,session_id=$2,result_ref=$3,status=$4,version=version+1,updated_at=$5 WHERE id=$6 AND ($7::int IS NULL OR version=$7) AND session_id IS NULL RETURNING *", [goalId, sessionId, resultRef, status, now, workItemId, expectedWorkVersion])).rows[0];
      if (!row) {const existing=(await client.query("SELECT session_id,version FROM business_work_item WHERE id=$1",[workItemId])).rows[0];if(!existing)throw Object.assign(new Error("WORK_ITEM_NOT_FOUND"),{code:"WORK_ITEM_NOT_FOUND"});if(existing.session_id===sessionId)return this.presentWork((await client.query("SELECT * FROM business_work_item WHERE id=$1",[workItemId])).rows[0]);throw Object.assign(new Error("BUSINESS_WORK_VERSION_CONFLICT"),{code:"BUSINESS_WORK_VERSION_CONFLICT"});}
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.runtime.attached',$4,$5,$6,$7,$8,'runtime',$9,$10)", [randomUUID(), row.organization_id, row.workspace_id, row.application_id, row.business_object_type, row.business_record_id, row.business_object_version, row.id, { goalId, sessionId, status, resultRef }, now]);
      return this.presentWork(row);
    });
  }

  async completeWorkflow(workItemId, { goalId, sessionId, report, resultSummary = null, workStatus, businessStatus = null, expectedObjectVersion = null, expectedWorkVersion = null, actorId = "runtime" }) {
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
      const updatedWork = (await client.query("UPDATE business_work_item SET kernel_goal_id=$1,session_id=$2,result_ref=$3,result_summary=$4,status=$5,version=version+1,updated_at=$6 WHERE id=$7 RETURNING *", [goalId, sessionId, resultRef, resultSummary, workStatus, now, workItemId])).rows[0];
      if (record) await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.object.workflow-transitioned',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), work.organization_id, work.workspace_id, work.application_id, work.business_object_type, work.business_record_id, record.version, work.id, actorId, { toStatus: businessStatus, goalId, sessionId }, now]);
      await client.query("INSERT INTO business_application_event(id,organization_id,workspace_id,event_type,application_id,object_type,object_id,object_version,work_item_id,actor_id,payload,created_at) VALUES($1,$2,$3,'business.work.runtime.completed',$4,$5,$6,$7,$8,$9,$10,$11)", [randomUUID(), work.organization_id, work.workspace_id, work.application_id, work.business_object_type, work.business_record_id, record?.version ?? work.business_object_version, work.id, actorId, { goalId, sessionId, status: workStatus, resultRef, resultType: resultSummary?.resultType??null, businessOutcomeProduced: resultSummary?.businessOutcomeProduced===true }, now]);
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
