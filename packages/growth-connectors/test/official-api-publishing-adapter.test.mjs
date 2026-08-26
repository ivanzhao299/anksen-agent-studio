import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOfficialApiPublishingAdapter } from '../lib/official-api-publishing-adapter.mjs';

const scope = { organizationId: 'org-1', workspaceId: 'growth', tenantId: 'tenant-a' };

async function fixture(handler) {
  const server = createServer(handler);
  server.listen(0, '127.0.0.1');
  await once(server, 'listening');
  return { server, endpoint: `http://127.0.0.1:${server.address().port}/publish` };
}

test('official API connector is disabled by default and requires governed references', async () => {
  const adapter = createOfficialApiPublishingAdapter({ id: 'official-v1', channel: 'TEST', endpoint: 'http://127.0.0.1/publish', allowedHostnames: ['127.0.0.1'], allowHttpForTest: true, credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({ accessToken: 'ephemeral' }) });
  await assert.rejects(() => adapter.publish({ scope, operationId: 'op-1', assetRef: 'asset/ref-1', approvalRef: 'approval/ref-1' }), (error) => error.code === 'OFFICIAL_API_CONNECTOR_DISABLED');
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'https://denied.example/publish', allowedHostnames: ['allowed.example'], credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({}) }), /HOST_DENIED/);
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'https://allowed.example/publish', allowedHostnames: ['allowed.example'], credentialReferenceId: 'token=plaintext', credentialResolver: async () => ({}) }), /REFERENCE_INVALID/);
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'https://allowed.example/publish', allowedHostnames: ['allowed.example'], credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({}),enabled:'false' }), /BOOLEAN_CONFIGURATION_REQUIRED/);
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'https://allowed.example/publish', allowedHostnames: ['allowed.example'], credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({}),timeoutMs:Infinity }), /TIMEOUT_INVALID/);
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'http://allowed.example/publish', allowedHostnames: ['allowed.example'], allowHttpForTest:true,credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({}) }), /HTTPS_REQUIRED/);
  assert.throws(() => createOfficialApiPublishingAdapter({ id: 'bad', channel: 'TEST', endpoint: 'https://user:secret@allowed.example/publish', allowedHostnames: ['allowed.example'],credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({}) }), /ENDPOINT_INVALID/);
});

test('official API connector rejects oversized success responses',async()=>{const{server,endpoint}=await fixture((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'x'.repeat(200)}));});try{const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint,allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,maxResponseBytes:64,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'})});await assert.rejects(()=>adapter.publish({scope,operationId:'op-large',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_RESPONSE_TOO_LARGE'&&error.retryable===false);}finally{server.close();}});

test('official API connector rejects unsafe authoritative references',async()=>{const{server,endpoint}=await fixture((_request,response)=>{response.writeHead(200,{'content-type':'application/json'});response.end(JSON.stringify({id:'sk-remote-secret',status:'PUBLISHED'}));});try{const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint,allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'})});await assert.rejects(()=>adapter.publish({scope,operationId:'op-unsafe',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_EXTERNAL_ID_REFERENCE_INVALID');}finally{server.close();}});

test('official API connector sends one idempotent approved write without leaking credentials', async () => {
  let captured;
  const { server, endpoint } = await fixture(async (request, response) => {
    let body = '';
    for await (const chunk of request) body += chunk;
    captured = { headers: request.headers, body };
    response.writeHead(200, { 'content-type': 'application/json' });
    response.end(JSON.stringify({ id: 'external-post-1', status: 'PUBLISHED',url:'https://remote.example/post?token=secret' }));
  });
  try {
    const adapter = createOfficialApiPublishingAdapter({ id: 'official-v1', channel: 'TEST', endpoint, allowedHostnames: ['127.0.0.1'], allowHttpForTest: true, enabled: true, credentialReferenceId: 'vault-ref/test', credentialResolver: async ({ credentialReferenceId }) => { assert.equal(credentialReferenceId, 'vault-ref/test'); return { accessToken: 'ephemeral-secret' }; } });
    await assert.rejects(() => adapter.publish({ scope, operationId: 'op-1', assetRef: 'asset/ref-1' }), (error) => error.code === 'OFFICIAL_API_APPROVAL_REQUIRED');
    const result = await adapter.publish({ scope, operationId: 'op-1', assetRef: 'asset/ref-1', approvalRef: 'approval/ref-1' });
    assert.equal(result.externalId, 'external-post-1');
    assert.equal('url' in result,false);
    assert.equal(captured.headers['idempotency-key'], 'op-1');
    assert.match(captured.headers.authorization, /^Bearer /);
    assert.doesNotMatch(captured.body, /ephemeral-secret|vault-ref\/test/);
  } finally { server.close(); }
});

test('official API connector classifies rate limit and server failures as retryable', async () => {
  const { server, endpoint } = await fixture((_request, response) => { response.writeHead(429, { 'content-type': 'application/json', 'retry-after': '30' }); response.end('{}'); });
  try {
    const adapter = createOfficialApiPublishingAdapter({ id: 'official-v1', channel: 'TEST', endpoint, allowedHostnames: ['127.0.0.1'], allowHttpForTest: true, enabled: true, credentialReferenceId: 'vault-ref/test', credentialResolver: async () => ({ accessToken: 'ephemeral' }) });
    await assert.rejects(() => adapter.publish({ scope, operationId: 'op-rate', assetRef: 'asset/ref-1', approvalRef: 'approval/ref-1' }), (error) => error.code === 'OFFICIAL_API_HTTP_429' && error.retryable === true && error.retryAfter === '30');
  } finally { server.close(); }
});
