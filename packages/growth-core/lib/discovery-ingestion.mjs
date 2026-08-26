import { assertTenantScope } from './domain-model.mjs';
import { assertAdapterCanExecute } from './channel-adapter.mjs';
import { createGrowthEvent } from './growth-events.mjs';

export function createDiscoveryIngestion({ scope: rawScope, adapter, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  if (!adapter?.discover) throw new Error('discovery adapter is required');
  const prospects = new Map();
  const events = [];

  async function ingest({ query = {}, operationId = `discover_${crypto.randomUUID()}` } = {}) {
    assertAdapterCanExecute({ adapter, scope, capability: 'DISCOVER', operationId });
    const rows = await adapter.discover({ scope, operationId, query });
    const output = [];
    for (const row of rows) {
      if (!row.externalId) throw new TypeError('discovered prospect externalId is required');
      const prospectId = `${adapter.id}:${row.externalId}`;
      const existing = prospects.get(prospectId);
      const prospect = Object.freeze({
        ...scope,
        prospectId,
        sourceAdapterId: adapter.id,
        sourceChannel: adapter.channel,
        externalId: row.externalId,
        person: Object.freeze({ ...(row.person ?? {}) }),
        company: Object.freeze({ ...(row.company ?? {}) }),
        email: row.email ?? null,
        phone: row.phone ?? null,
        website: row.website ?? null,
        provenance: Object.freeze({
          operationId,
          query: Object.freeze({ ...query }),
          sourceObservedAt: row.observedAt ?? null,
          ingestedAt: clock(),
        }),
        firstSeenAt: existing?.firstSeenAt ?? clock(),
        lastSeenAt: clock(),
      });
      prospects.set(prospectId, prospect);
      if (!existing) {
        events.push(createGrowthEvent({
          ...scope,
          eventId: `evt_${crypto.randomUUID()}`,
          eventType: 'growth.prospect.discovered',
          subjectType: 'prospect',
          subjectId: prospectId,
          payload: { adapterId: adapter.id, channel: adapter.channel, operationId },
          occurredAt: clock(),
          idempotencyKey: `prospect:${prospectId}`,
        }));
      }
      output.push(prospect);
    }
    return output;
  }

  return { ingest, prospects, events };
}
