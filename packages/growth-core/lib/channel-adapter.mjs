import { assertTenantScope } from './domain-model.mjs';

export const CHANNEL_CAPABILITIES = Object.freeze([
  'DISCOVER',
  'READ_PROFILE',
  'READ_CONTENT',
  'READ_ENGAGEMENT',
  'PUBLISH_CONTENT',
  'SEND_MESSAGE',
  'RECEIVE_WEBHOOK',
]);

export const CHANNEL_RISK_LEVELS = Object.freeze(['LOW', 'MEDIUM', 'HIGH']);

export function defineChannelAdapter(definition) {
  if (!definition || typeof definition !== 'object') {
    throw new TypeError('adapter definition is required');
  }
  if (typeof definition.id !== 'string' || definition.id.trim() === '') {
    throw new TypeError('adapter id is required');
  }
  if (typeof definition.channel !== 'string' || definition.channel.trim() === '') {
    throw new TypeError('channel is required');
  }
  const capabilities = [...new Set(definition.capabilities ?? [])];
  for (const capability of capabilities) {
    if (!CHANNEL_CAPABILITIES.includes(capability)) {
      throw new TypeError(`unsupported channel capability: ${capability}`);
    }
  }
  const riskLevel = definition.riskLevel ?? 'LOW';
  if (!CHANNEL_RISK_LEVELS.includes(riskLevel)) {
    throw new TypeError(`unsupported risk level: ${riskLevel}`);
  }

  return Object.freeze({
    id: definition.id.trim(),
    channel: definition.channel.trim(),
    transport: definition.transport ?? 'OFFICIAL_API',
    capabilities: Object.freeze(capabilities),
    riskLevel,
    requiresApproval: definition.requiresApproval ?? riskLevel === 'HIGH',
    rateLimitPolicy: Object.freeze({ ...(definition.rateLimitPolicy ?? {}) }),
    metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
  });
}

export function assertAdapterCanExecute({ adapter, scope, capability, operationId }) {
  const tenantScope = assertTenantScope(scope);
  if (!adapter?.capabilities?.includes(capability)) {
    throw new Error(`adapter ${adapter?.id ?? 'unknown'} does not support ${capability}`);
  }
  if (typeof operationId !== 'string' || operationId.trim() === '') {
    throw new TypeError('operationId is required for idempotency');
  }
  return Object.freeze({
    ...tenantScope,
    adapterId: adapter.id,
    capability,
    operationId: operationId.trim(),
    approvalRequired: adapter.requiresApproval === true,
  });
}

export function createMockDiscoveryAdapter({ prospects = [] } = {}) {
  const adapter = defineChannelAdapter({
    id: 'mock-discovery-v1',
    channel: 'MOCK',
    transport: 'READ_ONLY_FIXTURE',
    capabilities: ['DISCOVER', 'READ_PROFILE'],
    riskLevel: 'LOW',
  });

  return Object.freeze({
    ...adapter,
    async discover({ scope, operationId }) {
      assertAdapterCanExecute({ adapter, scope, capability: 'DISCOVER', operationId });
      return prospects.map((prospect) => Object.freeze({ ...prospect }));
    },
  });
}
