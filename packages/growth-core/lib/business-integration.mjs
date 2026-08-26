import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant } from './growth-events.mjs';

const unsafeRef=/(?:^sk-|bearer\s+|password\s*=|token\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i;
const assertRequestRef=(value,label)=>{if(typeof value!=='string'||!/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/.test(value)||unsafeRef.test(value))throw new TypeError(`integration ${label} is invalid`);return value;};

export function defineBusinessIntegrationAdapter(definition) {
  if (!definition?.id) throw new TypeError('integration adapter id is required');
  const capabilities = Object.freeze([...(definition.capabilities ?? [])]);
  return Object.freeze({
    id: definition.id,
    system: definition.system ?? 'UNKNOWN',
    capabilities,
    riskLevel: definition.riskLevel ?? 'MEDIUM',
    requiresApproval: definition.requiresApproval ?? false,
    metadata: Object.freeze({ ...(definition.metadata ?? {}) }),
    execute: definition.execute,
  });
}

export async function handoffCommercialObject({ scope: rawScope, adapter, objectType, lead, payload = {}, operationId, approvalRef = null }) {
  const scope = assertTenantScope(rawScope);
  assertSameTenant(scope, lead);
  if (!adapter?.execute) throw new Error('integration adapter execute() is required');
  if (!adapter.capabilities?.includes(objectType)) throw new Error(`integration capability denied: ${objectType}`);
  operationId=assertRequestRef(operationId,'operationId');
  if (adapter.requiresApproval && !approvalRef) throw new Error('integration approvalRef is required');
  if (approvalRef) approvalRef=assertRequestRef(approvalRef,'approvalRef');
  const request = Object.freeze({ ...scope, objectType, leadId: lead.leadId, payload: Object.freeze({ ...payload }), operationId, approvalRef });
  const result = await adapter.execute(request);
  if (!result?.externalId) throw new Error('downstream system must return authoritative externalId');
  return Object.freeze({
    ...scope,
    adapterId: adapter.id,
    system: adapter.system,
    objectType,
    leadId: lead.leadId,
    externalId: result.externalId,
    externalStatus: result.status ?? null,
    operationId,
    approvalRef,
    authoritative: true,
    metadata: Object.freeze({ ...(result.metadata ?? {}) }),
  });
}
