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
const sign = (body) => createHmac('sha256', secret).update(body).digest('hex');
const normalizedEvent = async (adapter, eventId, payload) => {
  const body = JSON.stringify(payload);
  const result = await adapter.ingestWebhook({ rawBody: body, headers: { 'x-growth-event-id': eventId, 'x-growth-signature': sign(body) } });
  return result.event;
};

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
    await assert.rejects(
      service.ingestWebsiteEvent({ scope, event: { eventId: `conflict-${suffix}`, source: 'WEBSITE', sourceDomain: 'example.com', externalId: `form-${suffix}`, kind: 'RFQ', highIntent: true, email: 'conflict@example.com', phone: null, person: {}, company: { website: 'example.com' }, productRefs: [], consent: {}, provenance: { receivedAt: '2026-08-26T00:00:00Z' } } }),
      (error) => error.code === 'GROWTH_IDENTITY_REVIEW_REQUIRED' && error.leadIds.length === 2
    );
    const mutationCount = Number((await pool.query(`SELECT count(*) count FROM growth_event WHERE organization_id=$1`, [scope.organizationId])).rows[0].count);
    assert.equal(mutationCount, 0);
  } finally {
    for (const table of ['growth_score_snapshot','growth_engagement','growth_identity','growth_event','growth_lead']) await pool.query(`DELETE FROM ${table} WHERE organization_id=$1`, [scope.organizationId]).catch(() => {});
    await pool.end();
  }
});
