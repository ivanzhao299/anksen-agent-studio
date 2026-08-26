import { assertTenantScope } from './domain-model.mjs';

export const GROWTH_EVENT_TYPES = Object.freeze([
  'growth.prospect.discovered',
  'growth.lead.normalized',
  'growth.signal.observed',
  'growth.score.calculated',
  'growth.content.published',
  'growth.engagement.received',
  'growth.opportunity.qualified',
  'growth.revenue.attributed',
]);

export function createGrowthEvent(input) {
  const scope = assertTenantScope(input);
  if (!GROWTH_EVENT_TYPES.includes(input.eventType)) {
    throw new TypeError(`unsupported growth event type: ${input.eventType}`);
  }
  if (typeof input.eventId !== 'string' || input.eventId.trim() === '') {
    throw new TypeError('eventId is required');
  }
  if (typeof input.subjectId !== 'string' || input.subjectId.trim() === '') {
    throw new TypeError('subjectId is required');
  }

  return Object.freeze({
    eventId: input.eventId.trim(),
    eventType: input.eventType,
    occurredAt: input.occurredAt ?? new Date().toISOString(),
    ...scope,
    subjectType: input.subjectType ?? null,
    subjectId: input.subjectId.trim(),
    source: input.source ?? 'growth-core',
    causationId: input.causationId ?? null,
    correlationId: input.correlationId ?? null,
    idempotencyKey: input.idempotencyKey ?? input.eventId.trim(),
    schemaVersion: input.schemaVersion ?? 1,
    payload: Object.freeze({ ...(input.payload ?? {}) }),
  });
}

export function assertSameTenant(left, right) {
  const leftScope = assertTenantScope(left);
  const rightScope = assertTenantScope(right);
  if (
    leftScope.organizationId !== rightScope.organizationId ||
    leftScope.workspaceId !== rightScope.workspaceId ||
    leftScope.tenantId !== rightScope.tenantId
  ) {
    throw new Error('cross-tenant growth operation denied');
  }
  return true;
}
