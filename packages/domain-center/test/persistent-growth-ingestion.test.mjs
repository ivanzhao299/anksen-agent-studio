import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac, randomUUID } from 'node:crypto';
import { ensurePostgresFixture, createTestPool } from '../../orchestrator-core/lib/postgres-fixture.mjs';
import { createWebsiteConversionAdapter } from '../../growth-connectors/lib/website-conversion-adapter.mjs';
import { migrateGrowthPlatform } from '../lib/growth-database.mjs';
import { PersistentGrowthIngestionService } from '../lib/persistent-growth-ingestion.mjs';
import { PostgresGrowthStore } from '../lib/postgres-growth-store.mjs';
import { createLead } from '../../growth-core/lib/domain-model.mjs';

const secret = 'persistent-growth-test-secret';
const webhookTimestamp = String(Date.parse('2026-08-26T03:00:00Z') / 1000);
const sign = (body,eventId) => createHmac('sha256', secret).update(`${webhookTimestamp}.${eventId}.`).update(body).digest('hex');
const normalizedEvent = async (adapter, eventId, payload) => {
  const body = JSON.stringify(payload);
  const result = await adapter.ingestWebhook({ rawBody: body, headers: { 'x-growth-event-id': eventId, 'x-growth-timestamp':webhookTimestamp,'x-growth-signature': sign(body,eventId) } });
  return result.event;
};

test('persistent ingress rejects adapter bypass payloads before a transaction',async()=>{let connections=0;const service=new PersistentGrowthIngestionService({pool:{connect(){connections+=1;throw new Error('must not connect');}},clock:()=> '2026-08-26T03:00:00Z'}),scope={organizationId:'org',workspaceId:'growth',tenantId:'tenant'},base={eventId:'evt-safe',source:'WEBSITE',sourceDomain:'example.com',externalId:'form-safe',kind:'RFQ',highIntent:true,productRefs:[],consent:{marketing:false,optOut:false},provenance:{receivedAt:'2026-08-26T03:00:00Z'}};for(const event of [{...base,eventId:'sk-secret'},{...base,highIntent:false},{...base,productRefs:'product-1'},{...base,provenance:{receivedAt:'2026-08-26T03:05:01Z'}}])await assert.rejects(()=>service.ingestWebsiteEvent({scope,event}),error=>error.code==='GROWTH_WEBSITE_EVENT_INVALID');assert.equal(connections,0);});

test('signed website events close a tenant-scoped persistent ingestion loop', async () => {
  await ensurePostgresFixture();
  const pool = createTestPool();
  const suffix = randomUUID();
  const scope = { organizationId: `growth-ingest-${suffix}`, workspaceId: 'growth', tenantId: 'tenant-a' };
  const otherScope = { ...scope, tenantId: 'tenant-b' };
  const adapter = createWebsiteConversionAdapter({ domain: 'example.com', secretProvider: async () => secret, clock: () => '2026-08-26T03:00:00Z' });
  const service = new PersistentGrowthIngestionService({ pool, scoringPolicy: { version: 'ingestion-v1', base: 5 }, clock: () => '2026-08-26T03:00:00Z' });
  try {
    await migrateGrowthPlatform(pool);
    const firstEvent = await normalizedEvent(adapter, `evt-${suffix}-1`, { eventType: 'RFQ', externalId: `form-${suffix}-1`, contact: { email: 'buyer@example.com', name: 'Buyer', company: 'Example LLC', companyWebsite: 'example.com' }, consent: { marketing: true } });
    const first = await service.ingestWebsiteEvent({ scope, event: firstEvent });
    assert.equal(first.status, 'ACCEPTED');
    assert.equal(first.matchedExistingLead, false);
    assert.equal(first.score.value, 85);

    const replay = await service.ingestWebsiteEvent({ scope, event: firstEvent });
    assert.deepEqual({ status: replay.status, leadId: replay.leadId }, { status: 'DUPLICATE', leadId: first.leadId });

    const secondEvent = await normalizedEvent(adapter, `evt-${suffix}-2`, { eventType: 'CONTACT_REQUEST', externalId: `form-${suffix}-2`, contact: { email: 'BUYER@example.com', name: 'Buyer' }, consent: { marketing: true } });
    const second = await service.ingestWebsiteEvent({ scope, event: secondEvent });
    assert.equal(second.leadId, first.leadId);
    assert.equal(second.matchedExistingLead, true);

    const other = await service.ingestWebsiteEvent({ scope: otherScope, event: { ...secondEvent, eventId: `evt-${suffix}-other`, externalId: `form-${suffix}-other` } });
    assert.notEqual(other.leadId, first.leadId);
    const view = await new PostgresGrowthStore({ pool }).customer360({ scope, leadId: first.leadId });
    assert.equal(view.engagements.length, 2);
    assert.equal(view.scoreHistory.length, 2);
    assert.equal(view.identities.length, 2);
    assert.equal(await new PostgresGrowthStore({ pool }).customer360({ scope: otherScope, leadId: first.leadId }), null);
  } finally {
    for (const table of ['growth_revenue_attribution','growth_opportunity','growth_score_snapshot','growth_engagement','growth_identity','growth_event','growth_lead']) {
      await pool.query(`DELETE FROM ${table} WHERE organization_id=$1`, [scope.organizationId]).catch(() => {});
    }
    await pool.end();
  }
});

test('conflicting identities require review and roll back all mutations', async () => {
  await ensurePostgresFixture();
  const pool = createTestPool();
  const suffix = randomUUID();
  const scope = { organizationId: `growth-conflict-${suffix}`, workspaceId: 'growth', tenantId: 'tenant-a' };
  try {
    await migrateGrowthPlatform(pool);
    const store = new PostgresGrowthStore({ pool });
    for (const leadId of [`lead-email-${suffix}`, `lead-domain-${suffix}`]) await store.upsertLead({ scope, lead: createLead({ ...scope, leadId, source: 'SEED' }) });
    await store.resolveIdentity({ scope, identityType: 'EMAIL', value: 'conflict@example.com', leadId: `lead-email-${suffix}`, source: 'SEED' });
    await store.resolveIdentity({ scope, identityType: 'DOMAIN', value: 'example.com', leadId: `lead-domain-${suffix}`, source: 'SEED' });
    const service = new PersistentGrowthIngestionService({ pool });
    const conflictEvent={ eventId: `conflict-${suffix}`, source: 'WEBSITE', sourceDomain: 'example.com', externalId: `form-${suffix}`, kind: 'RFQ', highIntent: true, email: 'conflict@example.com', phone: null, person: {}, company: { website: 'example.com' }, productRefs: [], consent: {marketing:false,optOut:false}, provenance: { receivedAt: '2026-08-26T00:00:00Z' } };
    await assert.rejects(
      service.ingestWebsiteEvent({ scope, event: conflictEvent }),
      (error) => error.code === 'GROWTH_IDENTITY_REVIEW_REQUIRED' && error.leadIds.length === 2 && error.reviewCaseId.startsWith('identity_review_')
    );
    await assert.rejects(service.ingestWebsiteEvent({ scope, event: conflictEvent }),error=>error.code==='GROWTH_IDENTITY_REVIEW_REQUIRED');
    const mutationCount = Number((await pool.query(`SELECT count(*) count FROM growth_event WHERE organization_id=$1`, [scope.organizationId])).rows[0].count);
    assert.equal(mutationCount, 0);
    const cases=(await pool.query(`SELECT candidate_lead_ids,identity_types,status,external_id_hash FROM growth_identity_review_case WHERE organization_id=$1`,[scope.organizationId])).rows;assert.equal(cases.length,1);assert.equal(cases[0].status,'OPEN');assert.deepEqual(cases[0].candidate_lead_ids.sort(),[`lead-domain-${suffix}`,`lead-email-${suffix}`].sort());assert.deepEqual(cases[0].identity_types,['DOMAIN','EMAIL']);assert.doesNotMatch(JSON.stringify(cases),new RegExp(`form-${suffix}|conflict@example.com|example.com`));
  } finally {
    for (const table of ['growth_identity_review_case','growth_score_snapshot','growth_engagement','growth_identity','growth_event','growth_lead']) await pool.query(`DELETE FROM ${table} WHERE organization_id=$1`, [scope.organizationId]).catch(() => {});
    await pool.end();
  }
});
