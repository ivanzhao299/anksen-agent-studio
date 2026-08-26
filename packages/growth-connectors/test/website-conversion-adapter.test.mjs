import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWebsiteConversionAdapter } from '../lib/website-conversion-adapter.mjs';

const secret='test-secret';
const sign=(body)=>createHmac('sha256',secret).update(body).digest('hex');

test('signed website RFQ is normalized and replay protected',async()=>{
  const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,clock:()=> '2026-08-26T12:00:00Z'});
  const body=JSON.stringify({eventType:'RFQ',externalId:'form-1',contact:{email:'buyer@example.com',name:'Buyer',company:'Example LLC'},market:'AE',productRefs:['product-1'],message:'Need quotation',consent:{marketing:true}});
  const headers={'x-growth-event-id':'evt-1','x-growth-signature':sign(body)};
  const result=await adapter.ingestWebhook({rawBody:body,headers});
  assert.equal(result.status,'ACCEPTED');
  assert.equal(result.event.highIntent,true);
  assert.equal(result.event.email,'buyer@example.com');
  assert.equal(result.event.sourceDomain,'example.com');
  const replay=await adapter.ingestWebhook({rawBody:body,headers});
  assert.equal(replay.status,'DUPLICATE');
  assert.equal(adapter.getReplaySize(),1);
});

test('website adapter rejects invalid signature, malformed JSON, and oversized body',async()=>{
  const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,maxBodyBytes:64});
  const body=JSON.stringify({eventType:'CONTACT_REQUEST'});
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{'x-growth-event-id':'bad-1','x-growth-signature':'bad'}}),/SIGNATURE_INVALID/);
  const malformed='{bad';
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:malformed,headers:{'x-growth-event-id':'bad-2','x-growth-signature':sign(malformed)}}),/JSON_INVALID/);
  const oversized=JSON.stringify({eventType:'RFQ',message:'x'.repeat(100)});
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:oversized,headers:{'x-growth-event-id':'bad-3','x-growth-signature':sign(oversized)}}),/BODY_TOO_LARGE/);
});
