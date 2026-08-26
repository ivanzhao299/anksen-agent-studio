import { defineChannelAdapter, assertAdapterCanExecute } from '../../growth-core/lib/channel-adapter.mjs';
import {assertCredentialToken,assertOfficialApiConfiguration,readBoundedJson} from './official-api-safety.mjs';

const referencePattern = /^[A-Za-z0-9][A-Za-z0-9._:/-]{2,255}$/;
const secretPattern = /(?:^sk-|bearer\s+|password\s*=|token\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i;

function assertReference(value, label) {
  if (!referencePattern.test(String(value ?? '')) || secretPattern.test(String(value))) throw Object.assign(new Error(`${label}_REFERENCE_INVALID`),{code:`OFFICIAL_API_${label}_REFERENCE_INVALID`,retryable:false});
  return String(value);
}

export function createOfficialApiPublishingAdapter({
  id,
  channel,
  endpoint,
  credentialReferenceId,
  credentialResolver,
  allowedHostnames = [],
  enabled = false,
  requiresApproval = true,
  timeoutMs = 10_000,
  maxResponseBytes=64*1024,
  fetchImpl = globalThis.fetch,
  allowHttpForTest = false,
} = {}) {
  const target=assertOfficialApiConfiguration({endpoint,allowedHostnames,allowHttpForTest,enabled,requiresApproval,timeoutMs,maxResponseBytes,errorPrefix:'OFFICIAL_API'});
  if (typeof credentialResolver !== 'function') throw new TypeError('credentialResolver is required');
  if (typeof fetchImpl !== 'function') throw new TypeError('fetch implementation is required');
  const credentialRef = assertReference(credentialReferenceId, 'CREDENTIAL');
  const adapter = defineChannelAdapter({ id, channel, transport: 'OFFICIAL_API', capabilities: ['PUBLISH_CONTENT'], riskLevel: 'HIGH', requiresApproval });

  async function publish({ scope, operationId, assetRef, approvalRef = null } = {}) {
    assertAdapterCanExecute({ adapter, scope, capability: 'PUBLISH_CONTENT', operationId });
    if (!enabled) throw Object.assign(new Error('OFFICIAL_API_CONNECTOR_DISABLED'), { code: 'OFFICIAL_API_CONNECTOR_DISABLED', retryable: false });
    const safeAssetRef = assertReference(assetRef, 'ASSET');
    if (adapter.requiresApproval && !approvalRef) throw Object.assign(new Error('OFFICIAL_API_APPROVAL_REQUIRED'), { code: 'OFFICIAL_API_APPROVAL_REQUIRED', retryable: false });
    if (approvalRef) assertReference(approvalRef, 'APPROVAL');
    const credential = await credentialResolver({ credentialReferenceId: credentialRef, channel: adapter.channel, adapterId: adapter.id });
    const accessToken=assertCredentialToken(credential?.accessToken,'OFFICIAL_API'),safeOperationId=assertReference(operationId,'OPERATION');
    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), timeoutMs);
    try {
      const response = await fetchImpl(target, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: `Bearer ${accessToken}`, 'idempotency-key': safeOperationId },
        body: JSON.stringify({ assetRef: safeAssetRef, approvalRef, tenant: { organizationId: scope.organizationId, workspaceId: scope.workspaceId, tenantId: scope.tenantId } }),
        signal: controller.signal,
      });
      if (!response.ok) {
        const code = `OFFICIAL_API_HTTP_${response.status}`;
        throw Object.assign(new Error(code), { code, retryable: response.status === 429 || response.status >= 500, status: response.status, retryAfter: response.headers.get('retry-after') ?? null });
      }
      const payload=await readBoundedJson(response,maxResponseBytes,'OFFICIAL_API');
      const externalId = payload.id ?? payload.externalId;
      if (!externalId) throw Object.assign(new Error('OFFICIAL_API_EXTERNAL_ID_REQUIRED'), { code: 'OFFICIAL_API_EXTERNAL_ID_REQUIRED', retryable: false });
      return Object.freeze({ externalId: assertReference(externalId,'EXTERNAL_ID'), status: assertReference(payload.status??'PUBLISHED','EXTERNAL_STATUS'), adapterId: adapter.id, channel: adapter.channel, operationId:safeOperationId, retryable: false });
    } catch (error) {
      if (error?.name === 'AbortError') throw Object.assign(new Error('OFFICIAL_API_TIMEOUT'), { code: 'OFFICIAL_API_TIMEOUT', retryable: true });
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  return Object.freeze({ ...adapter, endpoint: target.origin, credentialReferenceId: credentialRef, enabled, publish });
}
