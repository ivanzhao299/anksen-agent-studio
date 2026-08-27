import test from 'node:test';
import assert from 'node:assert/strict';

import {
  assertSameTenant,
  createExplainableScore,
  createGrowthEvent,
  createLead,
  createMockDiscoveryAdapter,
  defineChannelAdapter,
} from '../lib/index.mjs';

const scope = {
  organizationId: 'org-001',
  workspaceId: 'ws-001',
  tenantId: 'tenant-alpha',
};

test('lead model requires tenant scope and preserves source', () => {
  const lead = createLead({
    ...scope,
    leadId: 'lead-001',
    source: 'website',
    person: { name: 'Buyer A' },
    company: { name: 'Example Co' },
  });
  assert.equal(lead.tenantId, 'tenant-alpha');
  assert.equal(lead.source, 'website');
  assert.equal(lead.status, 'NEW');
});

test('tenant scope identifiers are bounded and index safe',()=>{for(const unsafeScope of [{organizationId:'bad scope',workspaceId:'growth',tenantId:'tenant'},{organizationId:'org',workspaceId:'growth',tenantId:'x'.repeat(129)},{organizationId:'org\nadmin',workspaceId:'growth',tenantId:'tenant'}])assert.throws(()=>createLead({...unsafeScope,leadId:'lead-1',source:'WEBSITE'}),/scope\./);});

test('explainable score enforces 0-100 range and factors', () => {
  const score = createExplainableScore({
    ...scope,
    subjectId: 'lead-001',
    value: 82,
    factors: [
      { name: 'company_fit', contribution: 30 },
      { name: 'intent', contribution: 52 },
    ],
  });
  assert.equal(score.value, 82);
  assert.equal(score.factors.length, 2);
  assert.throws(() => createExplainableScore({ ...scope, subjectId: 'x', value: 101 }), /between 0 and 100/);
});

test('channel adapter declares explicit capabilities and approval policy', () => {
  const adapter = defineChannelAdapter({
    id: 'message-adapter',
    channel: 'EXAMPLE',
    capabilities: ['SEND_MESSAGE'],
    riskLevel: 'HIGH',
  });
  assert.equal(adapter.requiresApproval, true);
  assert.deepEqual(adapter.capabilities, ['SEND_MESSAGE']);
});

test('mock discovery adapter proves read-only discovery seam', async () => {
  const adapter = createMockDiscoveryAdapter({ prospects: [{ externalId: 'p-1', company: 'Example Co' }] });
  const result = await adapter.discover({ scope, operationId: 'discover-001' });
  assert.equal(result.length, 1);
  assert.equal(result[0].externalId, 'p-1');
});

test('canonical growth event is tenant scoped and idempotent', () => {
  const event = createGrowthEvent({
    ...scope,
    eventId: 'evt-001',
    eventType: 'growth.lead.normalized',
    subjectType: 'lead',
    subjectId: 'lead-001',
    payload: { source: 'website' },
  });
  assert.equal(event.idempotencyKey, 'evt-001');
  assert.equal(event.tenantId, 'tenant-alpha');
});

test('cross-tenant operations fail closed', () => {
  assert.equal(assertSameTenant(scope, { ...scope }), true);
  assert.throws(
    () => assertSameTenant(scope, { ...scope, tenantId: 'tenant-beta' }),
    /cross-tenant growth operation denied/,
  );
});
