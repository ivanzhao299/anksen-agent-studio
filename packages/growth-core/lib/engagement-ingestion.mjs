import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant, createGrowthEvent } from './growth-events.mjs';

const HIGH_INTENT = new Set(['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','DEMO_REQUEST','SAMPLE_REQUEST']);

export function createEngagementIngestion({ scope: rawScope, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const engagements = new Map();
  const events = [];

  function ingest(input) {
    if (input.scope) assertSameTenant(scope, input.scope);
    if (!input.leadId || !input.kind) throw new TypeError('leadId and kind are required');
    const id = input.id ?? `eng_${crypto.randomUUID()}`;
    const existing = engagements.get(id);
    if (existing) return existing;
    const row = Object.freeze({
      ...scope,
      id,
      leadId: input.leadId,
      kind: String(input.kind).toUpperCase(),
      channel: input.channel ?? null,
      direction: input.direction ?? 'INBOUND',
      text: input.text ?? null,
      payload: Object.freeze({ ...(input.payload ?? {}) }),
      occurredAt: input.occurredAt ?? clock(),
      sourceEventId: input.sourceEventId ?? null,
      consent: Object.freeze({ ...(input.consent ?? {}) }),
    });
    engagements.set(id, row);
    events.push(createGrowthEvent({
      ...scope,
      eventId: `evt_${crypto.randomUUID()}`,
      eventType: 'growth.engagement.received',
      subjectType: 'lead',
      subjectId: row.leadId,
      payload: { engagementId: id, kind: row.kind, channel: row.channel },
      occurredAt: row.occurredAt,
      idempotencyKey: input.sourceEventId ? `engagement:${input.sourceEventId}` : `engagement:${id}`,
    }));
    return row;
  }

  function recommendResponse(leadId) {
    const rows = [...engagements.values()].filter((e) => e.leadId === leadId).sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt));
    const latest = rows[0];
    if (!latest) return { action: 'NO_ACTION', reason: 'NO_ENGAGEMENT' };
    if (latest.consent?.optOut === true) return { action: 'STOP_OUTREACH', reason: 'OPT_OUT' };
    if (HIGH_INTENT.has(latest.kind)) return { action: 'HUMAN_SALES_RESPONSE', priority: 'HIGH', reason: `HIGH_INTENT_${latest.kind}` };
    if (latest.kind === 'COMMENT' || latest.kind === 'MESSAGE') return { action: 'DRAFT_PERSONALIZED_RESPONSE', priority: 'MEDIUM', reason: latest.kind };
    return { action: 'CONTINUE_NURTURE', priority: 'LOW', reason: latest.kind };
  }

  return { ingest, recommendResponse, engagements, events };
}
