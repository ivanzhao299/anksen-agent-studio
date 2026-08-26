import { createHash, randomUUID } from "node:crypto";
const fail = (code) => Object.assign(new Error(code), { code }),
  hash = (value) => createHash("sha256").update(String(value)).digest("hex");
const governanceEnvelope=(value,code,allowed)=>{if(!value||typeof value!=="object"||Array.isArray(value)||![Object.prototype,null].includes(Object.getPrototypeOf(value)))throw fail(code);const keys=Reflect.ownKeys(value);if(keys.some(key=>typeof key!=="string"||!allowed.has(key)))throw fail(code);const descriptors=Object.getOwnPropertyDescriptors(value),copy=Object.create(null);for(const key of keys){const descriptor=descriptors[key];if(!descriptor||!Object.hasOwn(descriptor,"value"))throw fail(code);copy[key]=descriptor.value;}return copy;};
const secretLike=value=>/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(value),safeGovernanceRef=(value,label,max=160)=>{if(typeof value!=="string")throw fail(`BUSINESS_SOURCE_${label}_INVALID`);const text=value.trim();if(!text||text.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)||secretLike(text))throw fail(`BUSINESS_SOURCE_${label}_INVALID`);return text;},safeSourceRef=(value,label,max=160)=>{if(typeof value!=="string")throw fail(`BUSINESS_SOURCE_APPROVAL_${label}_INVALID`);const text=value.trim();if(!text||text.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)||secretLike(text))throw fail(`BUSINESS_SOURCE_APPROVAL_${label}_INVALID`);return text;},safeSourceScope=value=>({organizationId:safeSourceRef(value?.organizationId,"ORGANIZATION",128),workspaceId:safeSourceRef(value?.workspaceId,"WORKSPACE",128)}),safeSourceClock=value=>{if(!(value instanceof Date)||!Number.isFinite(value.getTime()))throw fail("BUSINESS_SOURCE_APPROVAL_CLOCK_INVALID");return value;};
export class PostgresBusinessSourceGovernance {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw fail("BUSINESS_SOURCE_GOVERNANCE_POOL_REQUIRED");
    this.pool = pool;
    this.clock = clock;
  }
  async connector(id, scope) {
    scope=governanceEnvelope(scope,"BUSINESS_SOURCE_SCOPE_INVALID",new Set(["organizationId","workspaceId","projectId","tenantId","userId"]));const safeId=safeGovernanceRef(id,"CONNECTOR",160),s={organizationId:safeGovernanceRef(scope.organizationId,"ORGANIZATION",128),workspaceId:safeGovernanceRef(scope.workspaceId,"WORKSPACE",128)},
      row = (
        await this.pool.query(
          "SELECT * FROM business_data_connector WHERE id=$1 AND organization_id=$2 AND workspace_id=$3",
          [safeId, s.organizationId, s.workspaceId],
        )
      ).rows[0];
    if (!row) throw fail("BUSINESS_CONNECTOR_NOT_FOUND");
    return row;
  }
  async credentialReference(connectorId, scope = {}) {
    const connector = await this.connector(connectorId, scope);
    if (!connector.credential_reference_id)
      throw fail("BUSINESS_SOURCE_CREDENTIAL_REFERENCE_REQUIRED");
    return safeGovernanceRef(connector.credential_reference_id,"CREDENTIAL_REFERENCE",240);
  }
  present(row) {
    const evidenceFail=()=>{throw fail("BUSINESS_SOURCE_APPROVAL_EVIDENCE_INVALID");},ref=(value,max=160,{optional=false}={})=>{if(optional&&value==null)return null;try{return safeGovernanceRef(value,"APPROVAL_EVIDENCE",max);}catch{return evidenceFail();}},date=(value,{optional=false}={})=>{if(optional&&value==null)return null;if(typeof value!=="string"&&!(value instanceof Date))return evidenceFail();const parsed=new Date(value);if(!Number.isFinite(parsed.getTime()))return evidenceFail();return parsed.toISOString();},reason=row?.decision_reason;
    if(!row||typeof row!=="object"||!['PENDING','APPROVED','REJECTED','REVOKED'].includes(row.status)||!Number.isInteger(row.version)||row.version<1||reason!=null&&(typeof reason!=="string"||reason.length>240||/[\u0000-\u001f\u007f]/.test(reason)||secretLike(reason)))evidenceFail();
    return {
      id: ref(row.id),
      connectorId: ref(row.connector_id),
      tenantId: ref(row.tenant_id,80,{optional:true}),
      dataOwnerId: ref(row.data_owner_id,128),
      mappingVersion: ref(row.mapping_version,80),
      expiresAt: date(row.expires_at,{optional:true}),
      status: row.status,
      requestedBy: ref(row.requested_by,128),
      requestedAt: date(row.requested_at),
      decidedBy: ref(row.decided_by,128,{optional:true}),
      decidedAt: date(row.decided_at,{optional:true}),
      decisionReason: reason??null,
      version: row.version,
    };
  }
  async request(connectorId, input, actor = {}) {
    input=governanceEnvelope(input,"BUSINESS_SOURCE_APPROVAL_INPUT_INVALID",new Set(["tenantId","dataOwnerId","mappingVersion","expiresAt"]));actor=governanceEnvelope(actor,"BUSINESS_SOURCE_APPROVAL_ACTOR_INVALID",new Set(["organizationId","workspaceId","projectId","tenantId","userId"]));
    const expiresValue=input.expiresAt;
    if(expiresValue!=null&&expiresValue!==""&&typeof expiresValue!=="string"&&!(expiresValue instanceof Date))throw fail("BUSINESS_SOURCE_APPROVAL_EXPIRY_INVALID");
    const safeConnectorId=safeSourceRef(connectorId,"CONNECTOR"),scope=safeSourceScope(actor),requester=safeSourceRef(actor.userId,"ACTOR",128),owner=safeSourceRef(input?.dataOwnerId,"DATA_OWNER",128),mapping=safeSourceRef(input?.mappingVersion,"MAPPING",80),tenantId=input?.tenantId==null||input.tenantId===""?null:safeSourceRef(input.tenantId,"TENANT",80),expiresAt=expiresValue?new Date(expiresValue):null,now=safeSourceClock(this.clock());
    if(expiresAt&&!Number.isFinite(expiresAt.getTime()))throw fail("BUSINESS_SOURCE_APPROVAL_EXPIRY_INVALID");
    if (
      tenantId &&
      (!expiresAt ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= now.getTime() ||
        expiresAt.getTime() > now.getTime() + 366 * 86400000)
    )
      throw fail("BUSINESS_SOURCE_APPROVAL_TENANT_SCOPE_INVALID");
    const connector = await this.connector(safeConnectorId, scope);
    const existing = (
      await this.pool.query(
        "SELECT * FROM business_data_source_approval WHERE connector_id=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND status='PENDING'",
        [connector.id, tenantId],
      )
    ).rows[0];
    if (existing) return this.present(existing);
    let row;
    try{row=(await this.pool.query(
      "INSERT INTO business_data_source_approval(id,connector_id,organization_id,workspace_id,tenant_id,data_owner_id,mapping_version,expires_at,status,requested_by,requested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10) RETURNING *",
      [randomUUID(),connector.id,connector.organization_id,connector.workspace_id,tenantId,owner,mapping,expiresAt,requester,now],
    )).rows[0];}catch(error){if(error?.code==='23505'&&['uq_business_source_pending_approval_unscoped','uq_business_source_pending_approval_tenant'].includes(error?.constraint)){const concurrent=(await this.pool.query("SELECT * FROM business_data_source_approval WHERE connector_id=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND status='PENDING'",[connector.id,tenantId])).rows[0];if(concurrent)return this.present(concurrent);}throw error;}
    return this.present(row);
  }
  async decide(approvalId, input, actor = {}) {
    input=governanceEnvelope(input,"BUSINESS_SOURCE_APPROVAL_INPUT_INVALID",new Set(["decision","expectedVersion","reason"]));actor=governanceEnvelope(actor,"BUSINESS_SOURCE_APPROVAL_ACTOR_INVALID",new Set(["organizationId","workspaceId","projectId","tenantId","userId"]));
    const s=safeSourceScope(actor),safeApprovalId=safeSourceRef(approvalId,"APPROVAL"),owner=safeSourceRef(actor.userId,"ACTOR",128),decision=typeof input.decision==='string'?input.decision.toUpperCase():'',version=input.expectedVersion,reason=input.reason==null?null:typeof input.reason==='string'?input.reason.trim():null,now=safeSourceClock(this.clock());
    if (!["APPROVED", "REJECTED", "REVOKED"].includes(decision))
      throw fail("BUSINESS_SOURCE_APPROVAL_DECISION_INVALID");
    if(!Number.isInteger(version)||version<1)throw fail("BUSINESS_SOURCE_APPROVAL_VERSION_INVALID");
    if(reason!=null&&(reason.length>240||/[\u0000-\u001f\u007f]/.test(reason)||secretLike(reason)))throw fail("BUSINESS_SOURCE_APPROVAL_REASON_INVALID");
    const row = (
      await this.pool.query(
        "UPDATE business_data_source_approval SET status=$1,decided_by=$2,decided_at=$3,decision_reason=$4,version=version+1 WHERE id=$5 AND organization_id=$6 AND workspace_id=$7 AND status=CASE WHEN $1='REVOKED' THEN 'APPROVED' ELSE 'PENDING' END AND version=$8 AND data_owner_id=$9 RETURNING *",
        [
          decision,
          owner,
          now,
          reason||null,
          safeApprovalId,
          s.organizationId,
          s.workspaceId,
          version,
          owner,
        ],
      )
    ).rows[0];
    if (!row) throw fail("BUSINESS_SOURCE_APPROVAL_CONFLICT");
    return this.present(row);
  }
  async readiness(connectorId, scope = {}) {
    const connector = await this.connector(connectorId, scope),
      approval = (
        await this.pool.query(
          "SELECT * FROM business_data_source_approval WHERE connector_id=$1 ORDER BY sequence_id DESC LIMIT 1",
          [connector.id],
        )
      ).rows[0],
      checkpoint = (
        await this.pool.query(
          "SELECT * FROM business_data_sync_checkpoint WHERE connector_id=$1",
          [connector.id],
        )
      ).rows[0],
      checks = [
        { id: "CONNECTOR_ACTIVE", pass: connector.status === "ACTIVE" },
        {
          id: "NON_FIXTURE_SOURCE",
          pass: connector.connector_type !== "FIXTURE",
        },
        {
          id: "CREDENTIAL_REFERENCE",
          pass: !!connector.credential_reference_id,
        },
        { id: "DATA_OWNER_APPROVAL", pass: approval?.status === "APPROVED" },
        { id: "MAPPING_VERSION", pass: !!approval?.mapping_version },
      ];
    return {
      status: checks.every((item) => item.pass) ? "READY" : "NOT_READY",
      connectorId: connector.id,
      checks,
      approval: approval ? this.present(approval) : null,
      checkpoint: checkpoint
        ? {
            sourceCursor: checkpoint.source_cursor,
            lastObservedAt:
              checkpoint.last_observed_at?.toISOString?.() ??
              checkpoint.last_observed_at,
            lastBatchId: checkpoint.last_batch_id,
            sourceCount: Number(checkpoint.source_count),
            mappedCount: Number(checkpoint.mapped_count),
            rejectedCount: Number(checkpoint.rejected_count),
            reconciliationStatus: checkpoint.reconciliation_status,
            updatedAt:
              checkpoint.updated_at?.toISOString?.() ?? checkpoint.updated_at,
          }
        : null,
    };
  }
  async tenantReadiness(scope = {}, options = {}) {
    scope=governanceEnvelope(scope,"BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED",new Set(["organizationId","workspaceId","projectId","tenantId","userId"]));options=governanceEnvelope(options,"BUSINESS_SOURCE_TENANT_READINESS_OPTIONS_INVALID",new Set(["applicationId","limit"]));const applicationId=options.applicationId,limit=options.limit??100;
    const values=[scope.organizationId,scope.workspaceId,scope.tenantId,applicationId];
    if(!values.every(value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value.trim())))
      throw fail("BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED");
    if(typeof limit!=='number'||!Number.isInteger(limit)||limit<1)throw fail("BUSINESS_SOURCE_TENANT_READINESS_LIMIT_INVALID");
    const [organizationId,workspaceId,tenantId,app]=values.map(value=>value.trim()),s={organizationId,workspaceId},safeLimit=Math.min(100,limit),clockValue=this.clock(),now=clockValue instanceof Date?clockValue.getTime():NaN;
    if(!Number.isFinite(now))throw fail("BUSINESS_SOURCE_TENANT_READINESS_CLOCK_INVALID");
    const result =
      await this.pool.query(
        `SELECT c.id,c.status,c.connector_type,c.credential_reference_id,a.id approval_id,a.status approval_status,a.mapping_version,a.expires_at
         FROM business_data_connector c
         LEFT JOIN LATERAL (
           SELECT id,status,mapping_version,expires_at
           FROM business_data_source_approval
           WHERE connector_id=c.id AND organization_id=c.organization_id AND workspace_id=c.workspace_id AND tenant_id=$3
           ORDER BY sequence_id DESC LIMIT 1
         ) a ON true
         WHERE c.organization_id=$1 AND c.workspace_id=$2 AND c.application_id=$4
         ORDER BY c.id LIMIT $5`,
        [s.organizationId, s.workspaceId, tenantId, app,safeLimit],
      );
    const rows=result?.rows;
    if(!Array.isArray(rows)||rows.length>safeLimit)throw fail("BUSINESS_SOURCE_TENANT_READINESS_EVIDENCE_INVALID");
    const items = rows.map((row) => {
        const connectorId=safeGovernanceRef(row?.id,"TENANT_READINESS_CONNECTOR",160),credentialReference=row.credential_reference_id==null?null:safeGovernanceRef(row.credential_reference_id,"TENANT_READINESS_CREDENTIAL_REFERENCE",240),mappingVersion=row.mapping_version==null?null:safeGovernanceRef(row.mapping_version,"TENANT_READINESS_MAPPING",80),expiresAt = row.expires_at==null?null:typeof row.expires_at==='string'||row.expires_at instanceof Date?new Date(row.expires_at):null;
        if(row.expires_at!=null&&(!expiresAt||!Number.isFinite(expiresAt.getTime())))throw fail("BUSINESS_SOURCE_TENANT_READINESS_EVIDENCE_INVALID");
        const
          checks = {
            connectorActive: row.status === "ACTIVE",
            nonFixtureSource: row.connector_type !== "FIXTURE",
            credentialReferenceConfigured: Boolean(credentialReference),
            approvalGranted: row.approval_status === "APPROVED",
            mappingVersionConfigured: Boolean(mappingVersion),
            authorizationUnexpired:
              Boolean(expiresAt) && expiresAt.getTime() > now,
          };
        return {
          connectorId,
          status: Object.values(checks).every(Boolean) ? "READY" : "NOT_READY",
          checks,
          expiresAt: expiresAt?.toISOString() ?? null,
        };
      });
    return {
      status:
        items.length > 0 && items.every((item) => item.status === "READY")
          ? "READY"
          : "NOT_READY",
      source: "TENANT_SCOPED_BUSINESS_SOURCE_APPROVALS",
      summary: {
        total: items.length,
        ready: items.filter((item) => item.status === "READY").length,
        blocked: items.filter((item) => item.status !== "READY").length,
      },
      items,
      safety: { credentialValuesRead: false, externalCallsPerformed: false },
    };
  }
  async checkpoint(
    connectorId,
    input,
    scope = {},
  ) {
    input=governanceEnvelope(input,"BUSINESS_SOURCE_CHECKPOINT_INPUT_INVALID",new Set(["batch","sourceCursor","sourceCount","mappedCount","rejectedCount","mappingVersion"]));scope=governanceEnvelope(scope,"BUSINESS_SOURCE_CHECKPOINT_SCOPE_INVALID",new Set(["organizationId","workspaceId","projectId","tenantId","userId"]));const batch=governanceEnvelope(input.batch,"BUSINESS_SOURCE_CHECKPOINT_BATCH_INVALID",new Set(["id","observedAt","status","receivedCount","appliedCount","unchangedCount","errorCount","sourceCursor","connectorId","applicationId","idempotencyKey","errorSummary","createdAt","completedAt"])),{sourceCursor,sourceCount,mappedCount,rejectedCount,mappingVersion}=input;
    const checkpointRef=(value,label,max=240,{optional=false}={})=>{if(optional&&(value==null||value===""))return null;if(typeof value!=="string")throw fail(`BUSINESS_SOURCE_CHECKPOINT_${label}_INVALID`);const text=value.trim();if(!text||text.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)||secretLike(text))throw fail(`BUSINESS_SOURCE_CHECKPOINT_${label}_INVALID`);return text;},
      safeConnectorId=checkpointRef(connectorId,"CONNECTOR",160),
      safeScope={organizationId:checkpointRef(scope.organizationId,"ORGANIZATION",128),workspaceId:checkpointRef(scope.workspaceId,"WORKSPACE",128)},
      batchId=checkpointRef(batch.id,"BATCH",160),
      cursor=checkpointRef(sourceCursor,"CURSOR",240,{optional:true}),
      safeMappingVersion=checkpointRef(mappingVersion,"MAPPING",80),
      counts=[sourceCount,mappedCount,rejectedCount],
      observedAt=new Date(batch.observedAt),
      now=safeSourceClock(this.clock());
    if(!counts.every(value=>Number.isInteger(value)&&value>=0&&value<=1000000))throw fail("BUSINESS_SOURCE_CHECKPOINT_COUNT_INVALID");
    if(!Number.isFinite(observedAt.getTime())||observedAt.getTime()>now.getTime()+300000)throw fail("BUSINESS_SOURCE_CHECKPOINT_OBSERVED_AT_INVALID");
    const connector = await this.connector(safeConnectorId, safeScope),
      reconciliationStatus =
        sourceCount === mappedCount + rejectedCount
          ? "MATCHED"
          : "MISMATCH",
      reconciliationHash = hash(
        JSON.stringify({
          connectorId:safeConnectorId,
          mappingVersion:safeMappingVersion,
          sourceCursor:cursor,
          sourceCount,
          mappedCount,
          rejectedCount,
          batchId,
        }),
      );
    await this.pool.query(
      "INSERT INTO business_data_sync_checkpoint(connector_id,organization_id,workspace_id,source_cursor,last_observed_at,last_batch_id,source_count,mapped_count,rejected_count,reconciliation_status,reconciliation_hash,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(connector_id) DO UPDATE SET source_cursor=EXCLUDED.source_cursor,last_observed_at=EXCLUDED.last_observed_at,last_batch_id=EXCLUDED.last_batch_id,source_count=EXCLUDED.source_count,mapped_count=EXCLUDED.mapped_count,rejected_count=EXCLUDED.rejected_count,reconciliation_status=EXCLUDED.reconciliation_status,reconciliation_hash=EXCLUDED.reconciliation_hash,updated_at=EXCLUDED.updated_at",
      [
        connector.id,
        connector.organization_id,
        connector.workspace_id,
        cursor,
        observedAt,
        batchId,
        sourceCount,
        mappedCount,
        rejectedCount,
        reconciliationStatus,
        reconciliationHash,
        now,
      ],
    );
    return this.readiness(safeConnectorId, safeScope);
  }
}
