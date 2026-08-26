import test from 'node:test';
import assert from 'node:assert/strict';
import { PostgresGrowthStore } from '../lib/postgres-growth-store.mjs';

const scope = { organizationId: 'org-1', workspaceId: 'workspace-1', tenantId: 'tenant-1' };

test('persistent identity resolution is atomic, normalized and tenant scoped', async () => {
  const calls = [];
  const pool = {
    async query(sql, values) {
      calls.push({ sql, values });
      if (sql.includes('INSERT INTO growth_identity')) return { rowCount: 0, rows: [] };
      return { rowCount: 1, rows: [{ lead_id: 'lead-existing' }] };
    }
  };
  const store = new PostgresGrowthStore({ pool });

  await assert.rejects(()=>store.resolveIdentity({scope,identityType:'SOCIAL',value:'person',leadId:'lead-new'}),error=>error.code==='GROWTH_IDENTITY_TYPE_INVALID');
  await assert.rejects(()=>store.resolveIdentity({scope,identityType:'EMAIL',value:'not-an-email',leadId:'lead-new'}),error=>error.code==='GROWTH_IDENTITY_VALUE_INVALID');
  await assert.rejects(()=>store.resolveIdentity({scope,identityType:'EMAIL',value:'person@example.com',leadId:'lead-new',source:'growth-core'}),error=>error.code==='GROWTH_IDENTITY_SOURCE_INVALID');

  const result = await store.resolveIdentity({ scope, identityType: 'EMAIL', value: '  Person@Example.COM ', leadId: 'lead-new' });

  assert.deepEqual(result, { leadId: 'lead-existing', matched: true });
  assert.match(calls[0].sql, /ON CONFLICT\(organization_id,workspace_id,tenant_id,identity_type,normalized_value\) DO NOTHING/);
  assert.deepEqual(calls[0].values.slice(1, 7), ['org-1', 'workspace-1', 'tenant-1', 'lead-new', 'EMAIL', 'person@example.com']);
  assert.deepEqual(calls[1].values.slice(0, 3), ['org-1', 'workspace-1', 'tenant-1']);
  await store.findIdentity({scope,identityType:'PHONE',value:'+1 (202) 555-0100'});
  assert.equal(calls.at(-1).values.at(-1),'+12025550100');
  await assert.rejects(()=>store.findIdentity({scope,identityType:'DOMAIN',value:'https://example.com'}),error=>error.code==='GROWTH_IDENTITY_VALUE_INVALID');
});

test('persistent opportunity upsert fails closed on a cross-tenant id collision', async () => {
  const store = new PostgresGrowthStore({ pool: { query: async () => ({ rowCount: 0, rows: [] }) } });
  await assert.rejects(
    store.upsertOpportunity({ scope, opportunity: { id: 'opp-shared', leadId: 'lead-1', stage: 'QUALIFIED', score: 85 } }),
    /cross-tenant growth opportunity update denied/
  );
});

test('persistent opportunity upsert returns the tenant-scoped record', async () => {
  const row = { id: 'opp-1', organization_id: 'org-1', workspace_id: 'workspace-1', tenant_id: 'tenant-1' };
  const pool = { query: async (sql, values) => {
    assert.match(sql, /RETURNING \*/);
    assert.deepEqual(values.slice(1, 4), ['org-1', 'workspace-1', 'tenant-1']);
    return { rowCount: 1, rows: [row] };
  } };
  const store = new PostgresGrowthStore({ pool });
  assert.equal(await store.upsertOpportunity({ scope, opportunity: { id: 'opp-1', leadId: 'lead-1', stage: 'QUALIFIED' } }), row);
});

test('score history is append-only and idempotent within tenant scope', async () => {
  const calls = [];
  const row = { id: 'score-1', tenant_id: 'tenant-1', value: '88' };
  const pool = { query: async (sql, values) => {
    calls.push({ sql, values });
    if (sql.includes('INSERT INTO growth_score_snapshot')) return { rowCount: 0, rows: [] };
    return { rowCount: 1, rows: [row] };
  } };
  const store = new PostgresGrowthStore({ pool });
  const result = await store.recordScore({ scope, leadId: 'lead-1', score: { scoreType: 'LEAD_QUALITY', value: 88, confidence: 0.9, factors: [], dimensions: {}, modelVersion: 'model-v1', policyVersion: 'policy-v1', calculatedAt: '2026-08-26T00:00:00Z' } });
  assert.deepEqual(result, { inserted: false, snapshot: row });
  assert.match(calls[0].sql, /ON CONFLICT\(id\) DO NOTHING/);
  assert.deepEqual(calls[1].values.slice(1, 5), ['org-1', 'workspace-1', 'tenant-1', 'lead-1']);
});

test('canonical events validate immutable input before SQL',async()=>{let queries=0;const store=new PostgresGrowthStore({pool:{async query(){queries+=1;throw new Error('must not query');}},clock:()=>new Date('2026-08-27T00:00:00Z')}),event={eventId:'event-1',eventType:'growth.engagement.received',subjectType:'lead',subjectId:'lead-1',source:'WEBSITE',idempotencyKey:'website:event-1',payload:{kind:'RFQ'},schemaVersion:1,occurredAt:'2026-08-27T00:00:00Z'};for(const invalid of [{...event,eventType:'growth.unknown'},{...event,eventId:'sk-secret'},{...event,payload:{text:'x'.repeat(65537)}},{...event,occurredAt:'2026-08-27T00:05:01Z'}])await assert.rejects(()=>store.appendEvent({scope,event:invalid}));assert.equal(queries,0);});

test('canonical leads validate root data before SQL',async()=>{let queries=0;const store=new PostgresGrowthStore({pool:{async query(){queries+=1;throw new Error('must not query');}},clock:()=>new Date('2026-08-27T00:00:00Z')}),lead={leadId:'lead-1',source:'WEBSITE',status:'NEW',person:{},company:{},externalRefs:[],score:null,createdAt:'2026-08-27T00:00:00Z'};for(const invalid of [{...lead,leadId:'sk-secret'},{...lead,status:'new'},{...lead,person:[]},{...lead,company:{text:'x'.repeat(32769)}},{...lead,createdAt:'2026-08-27T00:05:01Z'}])await assert.rejects(()=>store.upsertLead({scope,lead:invalid}));assert.equal(queries,0);});
