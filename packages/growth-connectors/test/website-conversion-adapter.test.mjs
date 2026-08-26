import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWebsiteConversionAdapter } from '../lib/website-conversion-adapter.mjs';

const secret='test-secret';
const timestamp='1787755200';
const sign=(body,eventId,timestampValue=timestamp)=>createHmac('sha256',secret).update(`${timestampValue}.${eventId}.`).update(body).digest('hex');

test('signed website RFQ is normalized and replay protected',async()=>{
  const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,clock:()=>new Date(Number(timestamp)*1000).toISOString()});
  const body=JSON.stringify({eventType:'RFQ',externalId:'form-1',contact:{email:'buyer@example.com',name:'Buyer',company:'Example LLC'},market:'AE',productRefs:['product-1'],message:'Need quotation',consent:{marketing:true,optOut:false}});
  const headers={'x-growth-event-id':'evt-1','x-growth-timestamp':timestamp,'x-growth-signature':sign(body,'evt-1')};
  const result=await adapter.ingestWebhook({rawBody:body,headers});
  assert.equal(result.status,'ACCEPTED');
  assert.equal(result.event.highIntent,true);
  assert.equal(result.event.email,'buyer@example.com');
  assert.equal(result.event.sourceDomain,'example.com');
  assert.equal(result.event.consent.optOut,false);
  const replay=await adapter.ingestWebhook({rawBody:body,headers});
  assert.equal(replay.status,'DUPLICATE');
  assert.equal(adapter.getReplaySize(),1);
});

test('website adapter rejects invalid signature, malformed JSON, and oversized body',async()=>{
  const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,maxBodyBytes:64,clock:()=>new Date(Number(timestamp)*1000).toISOString()});
  const body=JSON.stringify({eventType:'CONTACT_REQUEST'});
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{'x-growth-event-id':'bad-1','x-growth-timestamp':timestamp,'x-growth-signature':'bad'}}),/SIGNATURE_INVALID/);
  const malformed='{bad';
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:malformed,headers:{'x-growth-event-id':'bad-2','x-growth-timestamp':timestamp,'x-growth-signature':sign(malformed,'bad-2')}}),/JSON_INVALID/);
  const oversized=JSON.stringify({eventType:'RFQ',message:'x'.repeat(100)});
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:oversized,headers:{'x-growth-event-id':'bad-3','x-growth-timestamp':timestamp,'x-growth-signature':sign(oversized,'bad-3')}}),/BODY_TOO_LARGE/);
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{'x-growth-event-id':'bad-4','x-growth-timestamp':String(Number(timestamp)-301),'x-growth-signature':sign(body,'bad-4',String(Number(timestamp)-301))}}),/TIMESTAMP_INVALID/);
  await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{...{'x-growth-event-id':'changed-id','x-growth-timestamp':timestamp},'x-growth-signature':sign(body,'original-id')}}),/SIGNATURE_INVALID/);
  for(const [eventId,payload,pattern] of [
    ['bad-5',{eventType:'UNKNOWN'},/EVENT_TYPE_INVALID/],
    ['bad-6',{eventType:'RFQ',productRefs:'product-1'},/PRODUCT_REFS_INVALID/],
    ['bad-7',{eventType:'RFQ',consent:{marketing:'false'}},/CONSENT_INVALID/],
    ['bad-8',{eventType:'RFQ',externalId:'sk-raw-secret'},/EXTERNAL_ID_INVALID/],
  ]){const raw=JSON.stringify(payload);await assert.rejects(()=>adapter.ingestWebhook({rawBody:raw,headers:{'x-growth-event-id':eventId,'x-growth-timestamp':timestamp,'x-growth-signature':sign(raw,eventId)}}),pattern);}
});
