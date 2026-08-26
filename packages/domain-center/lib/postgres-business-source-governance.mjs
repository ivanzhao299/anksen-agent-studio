import { createHash, randomUUID } from "node:crypto";
const fail = (code) => Object.assign(new Error(code), { code }),
  scopeOf = (value) => ({
    organizationId: String(value.organizationId ?? ""),
    workspaceId: String(value.workspaceId ?? ""),
  }),
  hash = (value) => createHash("sha256").update(String(value)).digest("hex");
export class PostgresBusinessSourceGovernance {
  constructor({ pool, clock = () => new Date() } = {}) {
    if (!pool) throw fail("BUSINESS_SOURCE_GOVERNANCE_POOL_REQUIRED");
    this.pool = pool;
    this.clock = clock;
  }
  async connector(id, scope) {
    const s = scopeOf(scope),
      row = (
        await this.pool.query(
          "SELECT * FROM business_data_connector WHERE id=$1 AND organization_id=$2 AND workspace_id=$3",
          [id, s.organizationId, s.workspaceId],
        )
      ).rows[0];
    if (!row) throw fail("BUSINESS_CONNECTOR_NOT_FOUND");
    return row;
  }
  async credentialReference(connectorId, scope = {}) {
    const connector = await this.connector(connectorId, scope);
    if (!connector.credential_reference_id)
      throw fail("BUSINESS_SOURCE_CREDENTIAL_REFERENCE_REQUIRED");
    return connector.credential_reference_id;
  }
  present(row) {
    return {
      id: row.id,
      connectorId: row.connector_id,
      tenantId: row.tenant_id ?? null,
      dataOwnerId: row.data_owner_id,
      mappingVersion: row.mapping_version,
      expiresAt: row.expires_at?.toISOString?.() ?? row.expires_at ?? null,
      status: row.status,
      requestedBy: row.requested_by,
      requestedAt: row.requested_at?.toISOString?.() ?? row.requested_at,
      decidedBy: row.decided_by,
      decidedAt: row.decided_at?.toISOString?.() ?? row.decided_at,
      decisionReason: row.decision_reason,
      version: row.version,
    };
  }
  async request(connectorId, input, actor = {}) {
    const connector = await this.connector(connectorId, actor),
      owner = String(input.dataOwnerId ?? "").trim(),
      mapping = String(input.mappingVersion ?? "").trim(),
      tenantId = String(input.tenantId ?? "").trim() || null,
      expiresAt = input.expiresAt ? new Date(input.expiresAt) : null;
    if (!owner || !mapping || mapping.length > 80)
      throw fail("BUSINESS_SOURCE_APPROVAL_INPUT_INVALID");
    if (
      tenantId &&
      (!/^[a-z0-9][a-z0-9._-]{1,79}$/i.test(tenantId) ||
        !expiresAt ||
        !Number.isFinite(expiresAt.getTime()) ||
        expiresAt.getTime() <= this.clock().getTime() ||
        expiresAt.getTime() > this.clock().getTime() + 366 * 86400000)
    )
      throw fail("BUSINESS_SOURCE_APPROVAL_TENANT_SCOPE_INVALID");
    const existing = (
      await this.pool.query(
        "SELECT * FROM business_data_source_approval WHERE connector_id=$1 AND tenant_id IS NOT DISTINCT FROM $2 AND status='PENDING'",
        [connector.id, tenantId],
      )
    ).rows[0];
    if (existing) return this.present(existing);
    const row = (
      await this.pool.query(
        "INSERT INTO business_data_source_approval(id,connector_id,organization_id,workspace_id,tenant_id,data_owner_id,mapping_version,expires_at,status,requested_by,requested_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'PENDING',$9,$10) RETURNING *",
        [
          randomUUID(),
          connector.id,
          connector.organization_id,
          connector.workspace_id,
          tenantId,
          owner,
          mapping,
          expiresAt,
          actor.userId ?? "unknown",
          this.clock(),
        ],
      )
    ).rows[0];
    return this.present(row);
  }
  async decide(approvalId, input, actor = {}) {
    const s = scopeOf(actor),
      decision = String(input.decision ?? "").toUpperCase();
    if (!["APPROVED", "REJECTED", "REVOKED"].includes(decision))
      throw fail("BUSINESS_SOURCE_APPROVAL_DECISION_INVALID");
    const row = (
      await this.pool.query(
        "UPDATE business_data_source_approval SET status=$1,decided_by=$2,decided_at=$3,decision_reason=$4,version=version+1 WHERE id=$5 AND organization_id=$6 AND workspace_id=$7 AND status=CASE WHEN $1='REVOKED' THEN 'APPROVED' ELSE 'PENDING' END AND version=$8 AND data_owner_id=$9 RETURNING *",
        [
          decision,
          actor.userId ?? "unknown",
          this.clock(),
          String(input.reason ?? "").slice(0, 240) || null,
          approvalId,
          s.organizationId,
          s.workspaceId,
          Number(input.expectedVersion),
          actor.userId ?? "",
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
  async tenantReadiness(scope = {}, { applicationId,limit=100 } = {}) {
    const s = scopeOf(scope),
      tenantId = String(scope.tenantId ?? "").trim(),
      app = String(applicationId ?? "").trim(),safeLimit=Math.max(1,Math.min(100,Number(limit)||100)),clockValue=this.clock(),now=clockValue instanceof Date?clockValue.getTime():NaN;
    if (![s.organizationId,s.workspaceId,tenantId,app].every(value=>/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(value)))
      throw fail("BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED");
    if(!Number.isFinite(now))throw fail("BUSINESS_SOURCE_TENANT_READINESS_CLOCK_INVALID");
    const rows = (
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
      )
    ).rows;
    const items = rows.map((row) => {
        const expiresAt = row.expires_at ? new Date(row.expires_at) : null,
          checks = {
            connectorActive: row.status === "ACTIVE",
            nonFixtureSource: row.connector_type !== "FIXTURE",
            credentialReferenceConfigured: Boolean(row.credential_reference_id),
            approvalGranted: row.approval_status === "APPROVED",
            mappingVersionConfigured: Boolean(row.mapping_version),
            authorizationUnexpired:
              Boolean(expiresAt) && expiresAt.getTime() > now,
          };
        return {
          connectorId: row.id,
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
    {
      batch,
      sourceCursor,
      sourceCount,
      mappedCount,
      rejectedCount,
      mappingVersion,
    },
    scope = {},
  ) {
    const connector = await this.connector(connectorId, scope),
      reconciliationStatus =
        Number(sourceCount) === Number(mappedCount) + Number(rejectedCount)
          ? "MATCHED"
          : "MISMATCH",
      reconciliationHash = hash(
        JSON.stringify({
          connectorId,
          mappingVersion,
          sourceCursor,
          sourceCount,
          mappedCount,
          rejectedCount,
          batchId: batch.id,
        }),
      );
    await this.pool.query(
      "INSERT INTO business_data_sync_checkpoint(connector_id,organization_id,workspace_id,source_cursor,last_observed_at,last_batch_id,source_count,mapped_count,rejected_count,reconciliation_status,reconciliation_hash,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12) ON CONFLICT(connector_id) DO UPDATE SET source_cursor=EXCLUDED.source_cursor,last_observed_at=EXCLUDED.last_observed_at,last_batch_id=EXCLUDED.last_batch_id,source_count=EXCLUDED.source_count,mapped_count=EXCLUDED.mapped_count,rejected_count=EXCLUDED.rejected_count,reconciliation_status=EXCLUDED.reconciliation_status,reconciliation_hash=EXCLUDED.reconciliation_hash,updated_at=EXCLUDED.updated_at",
      [
        connector.id,
        connector.organization_id,
        connector.workspace_id,
        sourceCursor || null,
        batch.observedAt,
        batch.id,
        sourceCount,
        mappedCount,
        rejectedCount,
        reconciliationStatus,
        reconciliationHash,
        this.clock(),
      ],
    );
    return this.readiness(connectorId, scope);
  }
}
