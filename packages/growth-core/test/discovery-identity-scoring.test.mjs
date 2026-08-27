import test from 'node:test';
import assert from 'node:assert/strict';

import {
  createDiscoveryIngestion,
  createLeadGraph,
  createMockDiscoveryAdapter,
  createScoringEngine,
} from '../lib/index.mjs';

const scope = { organizationId: 'org-1', workspaceId: 'ws-1', tenantId: 'tenant-a' };

test('GA-004 discovery ingestion preserves provenance and avoids duplicate discovery events', async () => {
  const adapter = createMockDiscoveryAdapter({ prospects: [{ externalId: 'buyer-1', email: 'buyer@example.com', company: { name: 'Buyer LLC' } }] });
  const ingestion = createDiscoveryIngestion({ scope, adapter, clock: () => '2026-08-26T00:00:00.000Z' });
  const first = await ingestion.ingest({ operationId: 'op-1', query: { market: 'UAE' } });
  const second = await ingestion.ingest({ operationId: 'op-2', query: { market: 'UAE' } });
  assert.equal(first[0].provenance.operationId, 'op-1');
  assert.equal(second[0].provenance.operationId, 'op-2');
  assert.equal(ingestion.prospects.size, 1);
  assert.equal(ingestion.events.length, 1);
});

test('GA-005 identities from two sources can resolve to one canonical subject with evidence', () => {
  const graph = createLeadGraph({ scope, clock: () => '2026-08-26T00:00:00.000Z' });
  const a = graph.upsertSourceProfile({ source: 'LINKEDIN', externalId: 'li-1', email: 'buyer@example.com', company: { name: 'Buyer LLC' } });
  const b = graph.upsertSourceProfile({ source: 'WEBSITE', externalId: 'web-1', email: 'buyer@example.com', company: { name: 'Buyer LLC' } });
  const result = graph.resolve(b, [a]);
  assert.equal(result.match.sourceProfileId, a.sourceProfileId);
  assert.ok(result.confidence >= 0.8);
  assert.ok(result.evidence.includes('EMAIL') || result.evidence.includes('EXACT_FINGERPRINT'));
  graph.attach({ canonicalId: 'lead-1', canonicalType: 'lead', sourceProfileId: a.sourceProfileId, confidence: result.confidence, evidence: result.evidence });
  graph.attach({ canonicalId: 'lead-1', canonicalType: 'lead', sourceProfileId: b.sourceProfileId, confidence: 1, evidence: ['SOURCE_PROFILE'] });
  const view = graph.customer360('lead-1');
  assert.equal(view.sourceProfiles.length, 2);
});

test('GA-006 scoring is explainable, tenant configurable, decayed and historical', () => {
  const scoring = createScoringEngine({
    scope,
    policy: { halfLifeDays: 30, base: 5, version: 'tenant-policy-v1' },
  });
  const score = scoring.calculate({
    subjectId: 'lead-1',
    occurredAt: '2026-08-26T00:00:00.000Z',
    factors: [
      { name: 'FIT:company', value: 30, weight: 1, occurredAt: '2026-08-26T00:00:00.000Z', source: 'profile' },
      { name: 'INTENT:rfq', value: 50, weight: 1, occurredAt: '2026-07-27T00:00:00.000Z', source: 'website' },
    ],
  });
  assert.ok(score.value > 55 && score.value < 65);
  assert.equal(score.policyVersion, 'tenant-policy-v1');
  assert.equal(score.factors.length, 2);
  assert.equal(scoring.getHistory('lead-1').length, 1);
});

test('identity resolution remains tenant isolated', () => {
  const graph = createLeadGraph({ scope });
  const a = graph.upsertSourceProfile({ source: 'A', externalId: '1', email: 'a@x.com' });
  assert.throws(() => graph.resolve({ ...a, tenantId: 'tenant-b' }, [a]), /cross-tenant/);
});
