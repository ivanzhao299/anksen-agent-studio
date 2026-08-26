const REQUIRED_SCOPE_FIELDS = ['organizationId', 'workspaceId', 'tenantId'];

export const GROWTH_ENTITY_TYPES = Object.freeze([
  'tenant',
  'brand',
  'market',
  'icp',
  'prospect',
  'lead',
  'identity',
  'signal',
  'score',
  'campaign',
  'content_asset',
  'channel_account',
  'engagement',
  'opportunity',
  'attribution_touch',
]);

export function assertTenantScope(scope) {
  if (!scope || typeof scope !== 'object') {
    throw new TypeError('scope must be an object');
  }
  for (const field of REQUIRED_SCOPE_FIELDS) {
    if (typeof scope[field] !== 'string' || !/^[A-Za-z0-9][A-Za-z0-9._:/-]{0,127}$/.test(scope[field].trim())) {
      throw new TypeError(`scope.${field} is required`);
    }
  }
  return Object.freeze({
    organizationId: scope.organizationId.trim(),
    workspaceId: scope.workspaceId.trim(),
    tenantId: scope.tenantId.trim(),
  });
}

export function createGrowthTenant(input) {
  const scope = assertTenantScope(input);
  if (typeof input.name !== 'string' || input.name.trim() === '') {
    throw new TypeError('tenant name is required');
  }
  return Object.freeze({
    ...scope,
    type: 'tenant',
    name: input.name.trim(),
    status: input.status ?? 'ACTIVE',
    locale: input.locale ?? 'en',
    timezone: input.timezone ?? 'UTC',
    metadata: Object.freeze({ ...(input.metadata ?? {}) }),
  });
}

export function createLead(input) {
  const scope = assertTenantScope(input);
  if (typeof input.leadId !== 'string' || input.leadId.trim() === '') {
    throw new TypeError('leadId is required');
  }
  if (typeof input.source !== 'string' || input.source.trim() === '') {
    throw new TypeError('source is required');
  }
  return Object.freeze({
    ...scope,
    type: 'lead',
    leadId: input.leadId.trim(),
    source: input.source.trim(),
    status: input.status ?? 'NEW',
    person: Object.freeze({ ...(input.person ?? {}) }),
    company: Object.freeze({ ...(input.company ?? {}) }),
    marketId: input.marketId ?? null,
    icpId: input.icpId ?? null,
    externalRefs: Object.freeze([...(input.externalRefs ?? [])]),
    createdAt: input.createdAt ?? new Date().toISOString(),
  });
}

export function createExplainableScore(input) {
  const scope = assertTenantScope(input);
  if (typeof input.subjectId !== 'string' || input.subjectId.trim() === '') {
    throw new TypeError('subjectId is required');
  }
  if (!Number.isFinite(input.value) || input.value < 0 || input.value > 100) {
    throw new RangeError('score value must be between 0 and 100');
  }
  const factors = Array.isArray(input.factors) ? input.factors : [];
  for (const factor of factors) {
    if (!factor || typeof factor.name !== 'string' || !Number.isFinite(factor.contribution)) {
      throw new TypeError('each score factor requires name and numeric contribution');
    }
  }
  return Object.freeze({
    ...scope,
    type: 'score',
    scoreType: input.scoreType ?? 'LEAD_QUALITY',
    subjectId: input.subjectId.trim(),
    value: input.value,
    confidence: input.confidence ?? 1,
    factors: Object.freeze(factors.map((factor) => Object.freeze({ ...factor }))),
    modelVersion: input.modelVersion ?? 'v1',
    calculatedAt: input.calculatedAt ?? new Date().toISOString(),
  });
}
