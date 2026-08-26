import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createTestPool,
  ensurePostgresFixture,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { createBusinessApplicationRuntime } from "../lib/business-database.mjs";
import { migrateGrowthPlatform } from "../lib/growth-database.mjs";
import { PostgresBusinessSourceGovernance } from "../lib/postgres-business-source-governance.mjs";
import { PostgresBusinessDataConnectorStore } from "../lib/postgres-business-data-connector.mjs";

test("growth source readiness validates and bounds evidence before SQL",async()=>{let queries=0;const governance=new PostgresBusinessSourceGovernance({pool:{async query(){queries+=1;throw new Error("must not query");}},clock:()=>new Date(Number.NaN)}),scope={organizationId:"org",workspaceId:"growth",tenantId:"tenant"};await assert.rejects(()=>governance.tenantReadiness(scope,{applicationId:"ai-growth-sales-platform"}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_CLOCK_INVALID");await assert.rejects(()=>governance.tenantReadiness({...scope,organizationId:123},{applicationId:"ai-growth-sales-platform"}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED");await assert.rejects(()=>governance.tenantReadiness(scope,{applicationId:123}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_SCOPE_REQUIRED");await assert.rejects(()=>governance.tenantReadiness(scope,{applicationId:"ai-growth-sales-platform",limit:"100"}),error=>error.code==="BUSINESS_SOURCE_TENANT_READINESS_LIMIT_INVALID");assert.equal(queries,0);let values,sql;const bounded=new PostgresBusinessSourceGovernance({pool:{async query(statement,params){sql=statement;values=params;return{rows:[]};}},clock:()=>new Date("2026-08-26T00:00:00Z")});await bounded.tenantReadiness(scope,{applicationId:"ai-growth-sales-platform",limit:999});assert.match(sql,/LIMIT \$5/);assert.equal(values[4],100);});

test("growth source approval writes validate before SQL",async()=>{let queries=0;const governance=new PostgresBusinessSourceGovernance({pool:{async query(){queries+=1;throw new Error('must not query');}},clock:()=>new Date('2026-08-26T00:00:00Z')}),actor={organizationId:'org',workspaceId:'growth',userId:'data-owner'};await assert.rejects(()=>governance.request(123,{tenantId:'tenant',dataOwnerId:'data-owner',mappingVersion:'v1',expiresAt:'2026-08-27T00:00:00Z'},actor),error=>error.code==='BUSINESS_SOURCE_APPROVAL_CONNECTOR_INVALID');await assert.rejects(()=>governance.request('connector-1',{tenantId:'tenant',dataOwnerId:'data-owner',mappingVersion:'token=secret',expiresAt:'2026-08-27T00:00:00Z'},actor),error=>error.code==='BUSINESS_SOURCE_APPROVAL_MAPPING_INVALID');await assert.rejects(()=>governance.decide('approval-1',{decision:'APPROVED',expectedVersion:'1'},actor),error=>error.code==='BUSINESS_SOURCE_APPROVAL_VERSION_INVALID');await assert.rejects(()=>governance.decide('approval-1',{decision:'APPROVED',expectedVersion:1,reason:'token=secret'},actor),error=>error.code==='BUSINESS_SOURCE_APPROVAL_REASON_INVALID');assert.equal(queries,0);});

test("growth source checkpoint validates reconciliation evidence before SQL",async()=>{let queries=0;const governance=new PostgresBusinessSourceGovernance({pool:{async query(){queries+=1;throw new Error('must not query');}},clock:()=>new Date('2026-08-26T00:00:00Z')}),scope={organizationId:'org',workspaceId:'growth'},base={batch:{id:'batch-1',observedAt:'2026-08-25T23:59:00Z'},sourceCursor:'cursor-1',sourceCount:1,mappedCount:1,rejectedCount:0,mappingVersion:'map-v1'};await assert.rejects(()=>governance.checkpoint('connector-1',{...base,sourceCount:'1'},scope),error=>error.code==='BUSINESS_SOURCE_CHECKPOINT_COUNT_INVALID');await assert.rejects(()=>governance.checkpoint('connector-1',{...base,sourceCursor:'token=secret'},scope),error=>error.code==='BUSINESS_SOURCE_CHECKPOINT_CURSOR_INVALID');await assert.rejects(()=>governance.checkpoint('connector-1',{...base,batch:{...base.batch,observedAt:'2026-08-26T00:06:00Z'}},scope),error=>error.code==='BUSINESS_SOURCE_CHECKPOINT_OBSERVED_AT_INVALID');assert.equal(queries,0);});

test("growth source connector reads reject coerced controls and secret values",async()=>{let queries=0;const invalid=new PostgresBusinessSourceGovernance({pool:{async query(){queries+=1;throw new Error('must not query');}}});await assert.rejects(()=>invalid.connector(123,{organizationId:'org',workspaceId:'growth'}),error=>error.code==='BUSINESS_SOURCE_CONNECTOR_INVALID');await assert.rejects(()=>invalid.credentialReference('connector-1',{organizationId:{toString:()=>"org"},workspaceId:'growth'}),error=>error.code==='BUSINESS_SOURCE_ORGANIZATION_INVALID');assert.equal(queries,0);const poisoned=new PostgresBusinessSourceGovernance({pool:{async query(){return{rows:[{id:'connector-1',credential_reference_id:'token=raw-secret'}]};}}});await assert.rejects(()=>poisoned.credentialReference('connector-1',{organizationId:'org',workspaceId:'growth'}),error=>error.code==='BUSINESS_SOURCE_CREDENTIAL_REFERENCE_INVALID');});

test("growth source readiness rejects poisoned database evidence",async()=>{const scope={organizationId:'org',workspaceId:'growth',tenantId:'tenant'},input={applicationId:'ai-growth-sales-platform'},governanceFor=rows=>new PostgresBusinessSourceGovernance({pool:{async query(){return{rows};}},clock:()=>new Date('2026-08-26T00:00:00Z')});await assert.rejects(()=>governanceFor([{id:'connector-1',credential_reference_id:'credential/ref',mapping_version:'map-v1',expires_at:{toString:()=>"2026-08-27T00:00:00Z"}}]).tenantReadiness(scope,input),error=>error.code==='BUSINESS_SOURCE_TENANT_READINESS_EVIDENCE_INVALID');await assert.rejects(()=>governanceFor([{id:'token=raw-secret',credential_reference_id:'credential/ref',mapping_version:'map-v1',expires_at:'2026-08-27T00:00:00Z'}]).tenantReadiness(scope,input),error=>error.code==='BUSINESS_SOURCE_TENANT_READINESS_CONNECTOR_INVALID');await assert.rejects(()=>governanceFor(Array.from({length:101},(_,index)=>({id:`connector-${index}`}))).tenantReadiness(scope,{...input,limit:999}),error=>error.code==='BUSINESS_SOURCE_TENANT_READINESS_EVIDENCE_INVALID');});

test("growth source approval presentation rejects poisoned rows",()=>{const governance=new PostgresBusinessSourceGovernance({pool:{}}),base={id:'approval-1',connector_id:'connector-1',tenant_id:'tenant',data_owner_id:'owner-1',mapping_version:'map-v1',expires_at:new Date('2026-08-27T00:00:00Z'),status:'APPROVED',requested_by:'owner-1',requested_at:new Date('2026-08-26T00:00:00Z'),decided_by:'owner-1',decided_at:new Date('2026-08-26T00:01:00Z'),decision_reason:'approved',version:2};assert.equal(governance.present(base).requestedAt,'2026-08-26T00:00:00.000Z');for(const row of [{...base,requested_by:'token=raw-secret'},{...base,decision_reason:'password=raw-secret'},{...base,expires_at:{toString:()=>"2026-08-27T00:00:00Z"}},{...base,version:'2'}])assert.throws(()=>governance.present(row),error=>error.code==='BUSINESS_SOURCE_APPROVAL_EVIDENCE_INVALID');});

test("growth source ingestion validates its envelope before SQL",async()=>{let queries=0;const pool={async query(){queries+=1;throw new Error('must not query');}},store=new PostgresBusinessDataConnectorStore({pool}),scope={organizationId:'org',workspaceId:'growth'},record={sourceRecordKey:'lead-1',objectType:'lead',displayKey:'LEAD-1',title:'Lead 1',ownerId:'sales',fields:{}},base={idempotencyKey:'batch-1',evidenceRef:'source://growth/batch-1',observedAt:'2026-08-26T00:00:00Z',records:[record]};await assert.rejects(()=>store.ingest(123,base,scope),error=>error.code==='BUSINESS_SYNC_CONNECTOR_INVALID');await assert.rejects(()=>store.ingest('connector-1',{...base,idempotencyKey:{toString:()=>"batch-1"}},scope),error=>error.code==='BUSINESS_SYNC_IDEMPOTENCY_INVALID');await assert.rejects(()=>store.ingest('connector-1',{...base,records:[{...record,title:{toString:()=>"Lead 1"}}]},scope),error=>error.code==='BUSINESS_SYNC_TITLE_INVALID');await assert.rejects(()=>store.ingest('connector-1',{...base,evidenceRef:'token=raw-secret'},scope),error=>error.code==='BUSINESS_SYNC_EVIDENCE_INVALID');const invalidClock=new PostgresBusinessDataConnectorStore({pool,clock:()=>({getTime:()=>Date.now()})});await assert.rejects(()=>invalidClock.ingest('connector-1',base,scope),error=>error.code==='BUSINESS_SYNC_CLOCK_INVALID');assert.equal(queries,0);});

test("growth source ingestion rolls back poisoned existing evidence",async()=>{let rolledBack=false,mutations=0,rootQueries=0;const connector={id:'connector-1',organization_id:'org',workspace_id:'growth',application_id:'human-resources-platform',status:'ACTIVE',allowed_object_types:['position']},client={async query(sql){if(sql==='BEGIN'||sql==='COMMIT')return{rows:[]};if(sql==='ROLLBACK'){rolledBack=true;return{rows:[]};}if(sql.startsWith('SELECT * FROM business_application_record'))return{rows:[{id:'record-1',object_type:'position',version:1,source_observed_at:{valueOf:()=>0}}]};mutations+=1;return{rows:[]};},release(){}},pool={async query(){rootQueries+=1;return rootQueries===1?{rows:[connector]}:{rows:[]};},async connect(){return client;}},store=new PostgresBusinessDataConnectorStore({pool,clock:()=>new Date('2026-08-26T00:00:00Z')}),input={idempotencyKey:'batch-1',evidenceRef:'source://growth/batch-1',observedAt:'2026-08-25T23:59:00Z',records:[{sourceRecordKey:'position-1',objectType:'position',displayKey:'POS-1',title:'Position 1',ownerId:'hr',fields:{positionCode:'P1',positionName:'Position 1',department:'HR',jobFamily:'Operations',grade:'M1',headcount:1}}]};await assert.rejects(()=>store.ingest('connector-1',input,{organizationId:'org',workspaceId:'growth'}),error=>error.code==='BUSINESS_SYNC_EXISTING_EVIDENCE_INVALID');assert.equal(rolledBack,true);assert.equal(mutations,0);});

test("growth data-owner approval is tenant scoped, expiring and credential-value free", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(),
    suffix = randomUUID(),
    scope = {
      organizationId: `source-approval-${suffix}`,
      workspaceId: "growth",
      tenantId: "tenant-a",
    },
    owner = { ...scope, userId: "growth-data-owner" };
  let now = new Date("2026-08-26T10:00:00Z");
  try {
    const runtime = await createBusinessApplicationRuntime({
      repoRoot: process.cwd(),
      pool,
    });
    await migrateGrowthPlatform(pool);
    const connector = await runtime.connectorStore.register(
        {
          id: `growth-source-${suffix}`,
          applicationId: "ai-growth-sales-platform",
          sourceSystem: "governed-growth-source",
          connectorType: "API",
          credentialReferenceId: "growth-source-credential-ref",
          allowedObjectTypes: ["lead"],
          freshnessSeconds: 3600,
        },
        owner,
      ),
      governance = new PostgresBusinessSourceGovernance({
        pool,
        clock: () => now,
      }),
      pending = await governance.request(
        connector.id,
        {
          tenantId: scope.tenantId,
          dataOwnerId: owner.userId,
          mappingVersion: "growth-map-v1",
          expiresAt: "2026-08-27T10:00:00Z",
        },
        owner,
      ),
      approved = await governance.decide(
        pending.id,
        {
          decision: "APPROVED",
          expectedVersion: pending.version,
          reason: "Approved tenant source mapping",
        },
        owner,
      );
    assert.equal(approved.status, "APPROVED");
    const ready = await governance.tenantReadiness(scope, {
      applicationId: "ai-growth-sales-platform",
    });
    assert.equal(ready.status, "READY");
    assert.deepEqual(ready.summary, { total: 1, ready: 1, blocked: 0 });
    assert.deepEqual(ready.safety, {
      credentialValuesRead: false,
      externalCallsPerformed: false,
    });
    const revoked = await governance.decide(
      approved.id,
      {
        decision: "REVOKED",
        expectedVersion: approved.version,
        reason: "Rotate the governed authorization",
      },
      owner,
    );
    assert.equal(revoked.status, "REVOKED");
    assert.equal(
      (
        await governance.tenantReadiness(scope, {
          applicationId: "ai-growth-sales-platform",
        })
      ).status,
      "NOT_READY",
    );
    const replacementPending = await governance.request(
        connector.id,
        {
          tenantId: scope.tenantId,
          dataOwnerId: owner.userId,
          mappingVersion: "growth-map-v2",
          expiresAt: "2026-08-27T10:00:00Z",
        },
        owner,
      ),
      replacement = await governance.decide(
        replacementPending.id,
        {
          decision: "APPROVED",
          expectedVersion: replacementPending.version,
          reason: "Approve replacement authorization",
        },
        owner,
      ),
      latest = await governance.tenantReadiness(scope, {
        applicationId: "ai-growth-sales-platform",
      });
    assert.equal(replacement.status, "APPROVED");
    assert.equal(latest.status, "READY");
    const sequences = (
      await pool.query(
        "SELECT sequence_id FROM business_data_source_approval WHERE connector_id=$1 ORDER BY sequence_id",
        [connector.id],
      )
    ).rows.map((row) => Number(row.sequence_id));
    assert.equal(sequences.length, 2);
    assert.ok(sequences[1] > sequences[0]);
    const otherTenant = await governance.tenantReadiness(
      { ...scope, tenantId: "tenant-b" },
      { applicationId: "ai-growth-sales-platform" },
    );
    assert.equal(otherTenant.status, "NOT_READY");
    assert.equal(otherTenant.items[0].checks.approvalGranted, false);
    now = new Date("2026-08-27T10:00:01Z");
    const expired = await governance.tenantReadiness(scope, {
      applicationId: "ai-growth-sales-platform",
    });
    assert.equal(expired.status, "NOT_READY");
    assert.equal(expired.items[0].checks.authorizationUnexpired, false);
    assert.doesNotMatch(
      JSON.stringify(ready) + JSON.stringify(otherTenant) + JSON.stringify(expired),
      /growth-source-credential-ref|Approved tenant source mapping/,
    );
  } finally {
    await pool
      .query("DELETE FROM business_data_source_approval WHERE organization_id=$1", [
        scope.organizationId,
      ])
      .catch(() => {});
    await pool
      .query("DELETE FROM business_data_connector WHERE organization_id=$1", [
        scope.organizationId,
      ])
      .catch(() => {});
    await pool.end();
  }
});
