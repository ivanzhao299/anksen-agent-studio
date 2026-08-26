import test from 'node:test';
import assert from 'node:assert/strict';
import { createServer } from 'node:http';
import { once } from 'node:events';
import { createOfficialApiPublishingAdapter } from '../lib/official-api-publishing-adapter.mjs';
import {readBoundedJson} from '../lib/official-api-safety.mjs';

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
  for(const allowedHostnames of [[],['*.example.com'],['allowed.example','allowed.example'],Array.from({length:51},(_,index)=>`host-${index}.example`),[123]])assert.throws(()=>createOfficialApiPublishingAdapter({id:'bad',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({})}),/HOST_ALLOWLIST_INVALID/);
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

test('official API connector bounds and sanitizes credential resolution',async()=>{let signal;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'http://127.0.0.1/publish',allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,timeoutMs:100,credentialReferenceId:'vault-ref/test',credentialResolver:async input=>{signal=input.signal;return new Promise(()=>{});}});await assert.rejects(()=>adapter.publish({scope,operationId:'op-timeout',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_CREDENTIAL_TIMEOUT'&&error.retryable===true);assert.equal(signal.aborted,true);const failed=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'http://127.0.0.1/publish',allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>{throw new Error('vault secret detail');}});await assert.rejects(()=>failed.publish({scope,operationId:'op-failed',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_CREDENTIAL_RESOLUTION_FAILED'&&!error.message.includes('secret detail'));});

test('official API connector requires strict JSON responses and sanitizes retry hints',async()=>{let mode='content';const{server,endpoint}=await fixture((_request,response)=>{if(mode==='retry'){response.writeHead(429,{'retry-after':'token=secret'});response.end('blocked');return;}response.writeHead(200,{'content-type':mode==='content'?'text/html':'application/json'});response.end(mode==='content'?'<html></html>':'not-json');});try{const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint,allowedHostnames:['127.0.0.1'],allowHttpForTest:true,enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'})}),input={scope,assetRef:'asset/ref-1',approvalRef:'approval/ref-1'};await assert.rejects(()=>adapter.publish({...input,operationId:'op-content'}),error=>error.code==='OFFICIAL_API_RESPONSE_CONTENT_TYPE_INVALID');mode='json';await assert.rejects(()=>adapter.publish({...input,operationId:'op-json'}),error=>error.code==='OFFICIAL_API_RESPONSE_JSON_INVALID');mode='retry';await assert.rejects(()=>adapter.publish({...input,operationId:'op-retry'}),error=>error.code==='OFFICIAL_API_HTTP_429'&&error.retryAfter===null&&!JSON.stringify(error).includes('secret'));}finally{server.close();}});

test('official API connector denies redirects and sanitizes network failures',async()=>{let options;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames:['allowed.example'],enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'}),fetchImpl:async(_target,input)=>{options=input;throw new Error('redirect to token=secret');}});await assert.rejects(()=>adapter.publish({scope,operationId:'op-network',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_NETWORK_FAILED'&&error.retryable===true&&!error.message.includes('secret'));assert.equal(options.redirect,'error');});

test('bounded JSON reader cancels rejected response streams',async()=>{for(const headers of [new Headers({'content-type':'text/plain'}),new Headers({'content-type':'application/json','content-length':'1000'})]){let cancellations=0;const response={headers,body:{async cancel(){cancellations+=1;}}};await assert.rejects(()=>readBoundedJson(response,64,'OFFICIAL_API'));assert.equal(cancellations,1);}});

test('bounded JSON reader rejects malformed declared lengths',async()=>{for(const contentLength of ['-1','1.5','64x','9007199254740992']){let cancellations=0;const response={headers:new Headers({'content-type':'application/json','content-length':contentLength}),body:{async cancel(){cancellations+=1;}}};await assert.rejects(()=>readBoundedJson(response,64,'OFFICIAL_API'),error=>['OFFICIAL_API_RESPONSE_CONTENT_LENGTH_INVALID','OFFICIAL_API_RESPONSE_TOO_LARGE'].includes(error.code)&&error.retryable===false);assert.equal(cancellations,1);}});

test('official API connector rejects non-object and coerced authoritative responses',async()=>{let payload=null;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames:['allowed.example'],enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'}),fetchImpl:async()=>new Response(JSON.stringify(payload),{status:200,headers:{'content-type':'application/json'}})}),input={scope,operationId:'op-response',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'};await assert.rejects(()=>adapter.publish(input),error=>error.code==='OFFICIAL_API_RESPONSE_PAYLOAD_INVALID'&&error.retryable===false);payload={id:123,status:'PUBLISHED'};await assert.rejects(()=>adapter.publish(input),error=>error.code==='OFFICIAL_API_EXTERNAL_ID_REFERENCE_INVALID'&&error.retryable===false);});

test('official API connector validates request controls before credentials',async()=>{let credentialCalls=0;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames:['allowed.example'],enabled:true,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>{credentialCalls+=1;return{accessToken:'ephemeral'};}});await assert.rejects(()=>adapter.publish({scope,operationId:'token=secret',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_OPERATION_REFERENCE_INVALID');assert.equal(credentialCalls,0);});

test('official API connector enforces timeout when fetch ignores abort',async()=>{let signal;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames:['allowed.example'],enabled:true,timeoutMs:100,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'}),fetchImpl:async(_target,options)=>{signal=options.signal;return new Promise(()=>{});}});await assert.rejects(()=>adapter.publish({scope,operationId:'op-timeout-fetch',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_TIMEOUT'&&error.retryable===true);assert.equal(signal.aborted,true);});

test('official API connector timeout covers response body consumption',async()=>{let signal;const adapter=createOfficialApiPublishingAdapter({id:'official-v1',channel:'TEST',endpoint:'https://allowed.example/publish',allowedHostnames:['allowed.example'],enabled:true,timeoutMs:100,credentialReferenceId:'vault-ref/test',credentialResolver:async()=>({accessToken:'ephemeral'}),fetchImpl:async(_target,options)=>{signal=options.signal;return{ok:true,headers:new Headers({'content-type':'application/json'}),body:{getReader(){return{read:async()=>new Promise(()=>{}),cancel:async()=>{},releaseLock(){}};}}};}});await assert.rejects(()=>adapter.publish({scope,operationId:'op-timeout-body',assetRef:'asset/ref-1',approvalRef:'approval/ref-1'}),error=>error.code==='OFFICIAL_API_TIMEOUT');assert.equal(signal.aborted,true);});
