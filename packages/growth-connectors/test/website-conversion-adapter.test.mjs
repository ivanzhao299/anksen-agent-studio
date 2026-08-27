import test from 'node:test';
import assert from 'node:assert/strict';
import { createHmac } from 'node:crypto';
import { createWebsiteConversionAdapter,verifyWebhookSignature } from '../lib/website-conversion-adapter.mjs';

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

test('website replay cache is bounded while durable ingestion owns final idempotency',async()=>{assert.throws(()=>createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,maxReplayEntries:0}),/maxReplayEntries/);assert.throws(()=>createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,maxBodyBytes:Infinity}),/maxBodyBytes/);const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,clock:()=>new Date(Number(timestamp)*1000).toISOString(),maxReplayEntries:2});for(const eventId of ['cache-1','cache-2','cache-3']){const body=JSON.stringify({eventType:'PAGE_VIEW',externalId:eventId});assert.equal((await adapter.ingestWebhook({rawBody:body,headers:{'x-growth-event-id':eventId,'x-growth-timestamp':timestamp,'x-growth-signature':sign(body,eventId)}})).status,'ACCEPTED');}assert.equal(adapter.getReplaySize(),2);});

test('website secret resolution is bounded before HMAC',async()=>{let signal;const body=JSON.stringify({eventType:'PAGE_VIEW',externalId:'secret-bound'}),headers={'x-growth-event-id':'secret-bound','x-growth-timestamp':timestamp,'x-growth-signature':sign(body,'secret-bound')},oversized=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>'x'.repeat(4097),clock:()=>new Date(Number(timestamp)*1000).toISOString()});await assert.rejects(()=>oversized.ingestWebhook({rawBody:body,headers}),/SECRET_UNAVAILABLE/);const hanging=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async options=>{signal=options.signal;return new Promise(()=>{});},clock:()=>new Date(Number(timestamp)*1000).toISOString(),secretResolutionTimeoutMs:100});await assert.rejects(()=>hanging.ingestWebhook({rawBody:body,headers}),/SECRET_UNAVAILABLE/);assert.equal(signal.aborted,true);assert.throws(()=>createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,secretResolutionTimeoutMs:99}),/secretResolutionTimeoutMs/);});

test('website webhook headers are bounded before secret resolution',async()=>{let secretCalls=0;const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>{secretCalls+=1;return secret;},clock:()=>new Date(Number(timestamp)*1000).toISOString()}),body=JSON.stringify({eventType:'PAGE_VIEW'}),base={'x-growth-event-id':'header-bound','x-growth-timestamp':timestamp,'x-growth-signature':sign(body,'header-bound')};await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{...base,'x-large':'x'.repeat(8193)}}),/HEADER_INVALID/);await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:Object.fromEntries(Array.from({length:65},(_,index)=>[`x-${index}`,'v']))}),/HEADERS_TOO_LARGE/);await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{...base,'x-array':['duplicate','values']}}),/HEADER_INVALID/);assert.equal(secretCalls,0);const result=await adapter.ingestWebhook({rawBody:body,headers:new Headers(base)});assert.equal(result.status,'ACCEPTED');});

test('website webhook rejects ambiguous header collections before secrets',async()=>{let secretCalls=0;const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>{secretCalls+=1;return secret;},clock:()=>new Date(Number(timestamp)*1000).toISOString()}),body=JSON.stringify({eventType:'PAGE_VIEW'}),signature=sign(body,'ambiguous-1');await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:new Map([['x-growth-event-id','ambiguous-1'],['x-growth-timestamp',timestamp],['x-growth-signature',signature]])}),/HEADERS_INVALID/);await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{'X-Growth-Event-Id':'ambiguous-1','x-growth-event-id':'shadowed','x-growth-timestamp':timestamp,'x-growth-signature':signature}}),/HEADER_DUPLICATE/);assert.equal(secretCalls,0);});

test('website webhook validates native body and signature before secrets',async()=>{let secretCalls=0;const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>{secretCalls+=1;return secret;},clock:()=>new Date(Number(timestamp)*1000).toISOString()}),headers={'x-growth-event-id':'native-body','x-growth-timestamp':timestamp,'x-growth-signature':'not-hex'};await assert.rejects(()=>adapter.ingestWebhook({rawBody:{eventType:'PAGE_VIEW'},headers}),/rawBody is required/);await assert.rejects(()=>adapter.ingestWebhook({rawBody:'{}',headers}),/SIGNATURE_INVALID/);await assert.rejects(()=>adapter.ingestWebhook({rawBody:'{}',headers:null}),/HEADERS_INVALID/);assert.equal(secretCalls,0);});

test('website webhook normalizes a native clock before secret resolution',async()=>{let secretCalls=0;const body=JSON.stringify({eventType:'PAGE_VIEW'}),eventId='native-clock',headers={'x-growth-event-id':eventId,'x-growth-timestamp':timestamp,'x-growth-signature':sign(body,eventId)},invalid=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>{secretCalls+=1;return secret;},clock:()=>({toString:()=>new Date(Number(timestamp)*1000).toISOString()})});await assert.rejects(()=>invalid.ingestWebhook({rawBody:body,headers}),/CLOCK_INVALID/);assert.equal(secretCalls,0);const date=new Date(Number(timestamp)*1000),valid=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,clock:()=>date}),result=await valid.ingestWebhook({rawBody:body,headers});assert.equal(result.event.provenance.receivedAt,date.toISOString());assert.notEqual(result.event.provenance.receivedAt,date);});

test('webhook signature verifier denies algorithm and type coercion',()=>{const rawBody='{}',eventId='verify-1',signature=sign(rawBody,eventId);assert.equal(verifyWebhookSignature({rawBody,signature,secret,eventId,timestamp}),true);assert.throws(()=>verifyWebhookSignature({rawBody,signature,secret,eventId,timestamp,algorithm:'sha1'}),/algorithm must be sha256/);assert.throws(()=>verifyWebhookSignature({rawBody,signature:{toString:()=>signature},secret,eventId,timestamp}),/required/);assert.throws(()=>verifyWebhookSignature({rawBody,signature,secret:{toString:()=>secret},eventId,timestamp}),/required/);assert.equal(verifyWebhookSignature({rawBody,signature:'g'.repeat(64),secret,eventId,timestamp}),false);});

test('website webhook rejects unknown payload fields',async()=>{const adapter=createWebsiteConversionAdapter({domain:'example.com',secretProvider:async()=>secret,clock:()=>new Date(Number(timestamp)*1000).toISOString()});for(const [eventId,payload,pattern] of [['unknown-top',{eventType:'PAGE_VIEW',metadata:{nested:{value:'ignored'}}},/PAYLOAD_FIELD_INVALID/],['unknown-contact',{eventType:'PAGE_VIEW',contact:{email:'buyer@example.com',accessToken:'raw-secret'}},/CONTACT_FIELD_INVALID/],['unknown-consent',{eventType:'PAGE_VIEW',consent:{marketing:true,source:'implicit'}},/CONSENT_FIELD_INVALID/]]){const body=JSON.stringify(payload);await assert.rejects(()=>adapter.ingestWebhook({rawBody:body,headers:{'x-growth-event-id':eventId,'x-growth-timestamp':timestamp,'x-growth-signature':sign(body,eventId)}}),pattern);}});
