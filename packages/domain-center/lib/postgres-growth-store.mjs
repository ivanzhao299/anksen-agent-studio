import { randomUUID } from 'node:crypto';
import { assertTenantScope } from '../../growth-core/lib/domain-model.mjs';
import {GROWTH_EVENT_TYPES} from '../../growth-core/lib/growth-events.mjs';

const json = (value, fallback) => JSON.stringify(value ?? fallback);
const fail=code=>Object.assign(new Error(code),{code});
const normalizeIdentity=(identityType,value,{optional=false}={})=>{if(!['EMAIL','PHONE','DOMAIN'].includes(identityType))throw fail('GROWTH_IDENTITY_TYPE_INVALID');const raw=String(value??'').trim().toLowerCase();if(!raw&&optional)return null;let normalized=raw;if(identityType==='PHONE')normalized=raw.replace(/[\s().-]/g,'');if(identityType==='DOMAIN')normalized=raw.replace(/\.$/,'');const valid=identityType==='EMAIL'?normalized.length<=320&&/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(normalized):identityType==='PHONE'?/^\+?\d{7,20}$/.test(normalized):/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/.test(normalized);if(!valid)throw fail('GROWTH_IDENTITY_VALUE_INVALID');return normalized;};
const assertIdentitySource=value=>{const source=String(value??'');if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(source))throw fail('GROWTH_IDENTITY_SOURCE_INVALID');return source;};
const safeCanonicalRef=(value,label,{optional=false,max=255}={})=>{if(optional&&(value==null||value===''))return null;const text=String(value??'');if(text.length>max||!/^[A-Za-z0-9][A-Za-z0-9._:/-]*$/.test(text)||/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(text))throw fail(`GROWTH_${label}_REFERENCE_INVALID`);return text;};
const safeJson=(value,label,{kind='object',maxBytes=65536,nullable=false}={})=>{if(nullable&&value==null)return null;if((kind==='object'&&(!value||typeof value!=='object'||Array.isArray(value)))||(kind==='array'&&!Array.isArray(value)))throw fail(`GROWTH_${label}_INVALID`);let serialized;try{serialized=JSON.stringify(value);}catch{throw fail(`GROWTH_${label}_INVALID`);}if(Buffer.byteLength(serialized)>maxBytes)throw fail(`GROWTH_${label}_INVALID`);return serialized;};
const safeEventRef=(value,options)=>safeCanonicalRef(value,'EVENT',options);
const safeEventPayload=value=>safeJson(value,'EVENT_PAYLOAD');

export class PostgresGrowthStore {
  constructor({ pool,clock=()=>new Date() }) {
    if (!pool) throw new Error('pool is required');
    this.pool = pool;
    this.clock=clock;
  }

  async upsertLead({ scope, lead }) {
    const s = assertTenantScope(scope),now=this.clock(),createdAt=new Date(lead?.createdAt??now);
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail('GROWTH_LEAD_CLOCK_INVALID');
    if(!lead||typeof lead!=='object')throw fail('GROWTH_LEAD_INVALID');
    const leadId=safeCanonicalRef(lead.leadId,'LEAD',{max:160}),source=safeCanonicalRef(lead.source,'LEAD_SOURCE',{max:64}),status=String(lead.status??'NEW'),person=safeJson(lead.person??{},'LEAD_PERSON',{maxBytes:32768}),company=safeJson(lead.company??{},'LEAD_COMPANY',{maxBytes:32768}),externalRefs=safeJson(lead.externalRefs??[],'LEAD_EXTERNAL_REFS',{kind:'array'}),score=safeJson(lead.score,'LEAD_SCORE',{nullable:true}),marketId=safeCanonicalRef(lead.marketId,'LEAD_MARKET',{optional:true,max:160}),icpId=safeCanonicalRef(lead.icpId,'LEAD_ICP',{optional:true,max:160});
    if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(status))throw fail('GROWTH_LEAD_STATUS_INVALID');
    if(!Number.isFinite(createdAt.getTime())||createdAt.getTime()>now.getTime()+300000)throw fail('GROWTH_LEAD_TIME_INVALID');
    const result = await this.pool.query(
      `INSERT INTO growth_lead(id,organization_id,workspace_id,tenant_id,source,status,person,company,market_id,icp_id,external_refs,score,created_at,updated_at)
       VALUES($1,$2,$3,$4,$5,$6,$7::jsonb,$8::jsonb,$9,$10,$11::jsonb,$12::jsonb,$13,$14)
       ON CONFLICT(id) DO UPDATE SET status=EXCLUDED.status,person=EXCLUDED.person,company=EXCLUDED.company,market_id=EXCLUDED.market_id,icp_id=EXCLUDED.icp_id,external_refs=EXCLUDED.external_refs,score=EXCLUDED.score,updated_at=EXCLUDED.updated_at
       WHERE growth_lead.organization_id=EXCLUDED.organization_id AND growth_lead.workspace_id=EXCLUDED.workspace_id AND growth_lead.tenant_id=EXCLUDED.tenant_id
       RETURNING *`,
      [leadId, s.organizationId, s.workspaceId, s.tenantId, source, status, person, company, marketId, icpId, externalRefs, score, createdAt, now]
    );
    if (!result.rowCount) throw new Error('cross-tenant growth lead update denied');
    return result.rows[0];
  }

  async getLead({ scope, leadId }) {
    const s = assertTenantScope(scope);
    const result = await this.pool.query(
      `SELECT * FROM growth_lead WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4`,
      [leadId, s.organizationId, s.workspaceId, s.tenantId]
    );
    return result.rows[0] ?? null;
  }

  async findIdentity({ scope, identityType, value }) {
    const s = assertTenantScope(scope), normalizedValue = normalizeIdentity(identityType,value,{optional:true});
    if (!normalizedValue) return null;
    const result = await this.pool.query(
      `SELECT lead_id,identity_type,normalized_value,source FROM growth_identity WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND identity_type=$4 AND normalized_value=$5`,
      [s.organizationId, s.workspaceId, s.tenantId, identityType, normalizedValue]
    );
    return result.rows[0] ?? null;
  }

  async findEventByIdempotencyKey({ scope, idempotencyKey }) {
    const s = assertTenantScope(scope);
    const result = await this.pool.query(
      `SELECT event_id,subject_id,event_type,occurred_at FROM growth_event WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND idempotency_key=$4`,
      [s.organizationId, s.workspaceId, s.tenantId, idempotencyKey]
    );
    return result.rows[0] ?? null;
  }

  async resolveIdentity({ scope, identityType, value, leadId, source = 'GROWTH_CORE' }) {
    const s = assertTenantScope(scope), normalizedValue = normalizeIdentity(identityType,value),safeSource=assertIdentitySource(source);
    const inserted = await this.pool.query(
      `INSERT INTO growth_identity(id,organization_id,workspace_id,tenant_id,lead_id,identity_type,normalized_value,source)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8 FROM growth_lead WHERE id=$5 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4
       ON CONFLICT(organization_id,workspace_id,tenant_id,identity_type,normalized_value) DO NOTHING
       RETURNING lead_id`,
      [randomUUID(), s.organizationId, s.workspaceId, s.tenantId, leadId, identityType, normalizedValue, safeSource]
    );
    if (inserted.rowCount) return { leadId: inserted.rows[0].lead_id, matched: false };
    const existing = await this.pool.query(
      `SELECT lead_id FROM growth_identity WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND identity_type=$4 AND normalized_value=$5`,
      [s.organizationId, s.workspaceId, s.tenantId, identityType, normalizedValue]
    );
    if (!existing.rowCount) throw Object.assign(new Error('GROWTH_IDENTITY_TENANT_LEAD_REQUIRED_OR_CONFLICT'),{code:'GROWTH_IDENTITY_TENANT_LEAD_REQUIRED_OR_CONFLICT'});
    return { leadId: existing.rows[0].lead_id, matched: true };
  }

  async appendEvent({ scope, event }) {
    const s = assertTenantScope(scope),now=this.clock(),occurredAt=new Date(event?.occurredAt);
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail('GROWTH_EVENT_CLOCK_INVALID');
    if(!event||!GROWTH_EVENT_TYPES.includes(event.eventType))throw fail('GROWTH_EVENT_TYPE_INVALID');
    const eventId=safeEventRef(event.eventId,{max:160}),subjectType=safeEventRef(event.subjectType,{optional:true,max:64}),subjectId=safeEventRef(event.subjectId,{max:160}),source=safeEventRef(event.source,{max:64}),idempotencyKey=safeEventRef(event.idempotencyKey),payload=safeEventPayload(event.payload??{}),schemaVersion=Number(event.schemaVersion??1);
    if(!Number.isInteger(schemaVersion)||schemaVersion<1||schemaVersion>100)throw fail('GROWTH_EVENT_SCHEMA_VERSION_INVALID');
    if(!Number.isFinite(occurredAt.getTime())||occurredAt.getTime()>now.getTime()+300000)throw fail('GROWTH_EVENT_TIME_INVALID');
    const result = await this.pool.query(
      `INSERT INTO growth_event(event_id,organization_id,workspace_id,tenant_id,event_type,subject_type,subject_id,source,idempotency_key,payload,schema_version,occurred_at)
       VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb,$11,$12) ON CONFLICT DO NOTHING RETURNING event_id`,
      [eventId, s.organizationId, s.workspaceId, s.tenantId, event.eventType, subjectType, subjectId, source, idempotencyKey, payload, schemaVersion, occurredAt]
    );
    if(result.rowCount)return{inserted:true,eventId:result.rows[0].event_id};
    const existing=await this.pool.query(`SELECT event_id FROM growth_event WHERE organization_id=$1 AND workspace_id=$2 AND tenant_id=$3 AND idempotency_key=$4 AND event_type=$5 AND subject_type IS NOT DISTINCT FROM $6 AND subject_id=$7 AND source=$8 AND payload=$9::jsonb AND schema_version=$10 AND occurred_at=$11`,[s.organizationId,s.workspaceId,s.tenantId,idempotencyKey,event.eventType,subjectType,subjectId,source,payload,schemaVersion,occurredAt]);
    if(!existing.rowCount)throw Object.assign(new Error('GROWTH_EVENT_IDEMPOTENCY_MISMATCH_OR_SCOPE_CONFLICT'),{code:'GROWTH_EVENT_IDEMPOTENCY_MISMATCH_OR_SCOPE_CONFLICT'});
    return{inserted:false,eventId:existing.rows[0].event_id};
  }

  async recordEngagement({ scope, engagement }) {
    const s = assertTenantScope(scope),now=this.clock(),occurredAt=new Date(engagement?.occurredAt);
    if(!(now instanceof Date)||!Number.isFinite(now.getTime()))throw fail('GROWTH_ENGAGEMENT_CLOCK_INVALID');
    if(!engagement||typeof engagement!=='object')throw fail('GROWTH_ENGAGEMENT_INVALID');
    const id=safeCanonicalRef(engagement.id,'ENGAGEMENT',{max:160}),leadId=safeCanonicalRef(engagement.leadId,'ENGAGEMENT_LEAD',{max:160}),kind=String(engagement.kind??''),channel=safeCanonicalRef(engagement.channel,'ENGAGEMENT_CHANNEL',{optional:true,max:64}),payload=safeJson(engagement.payload??{},'ENGAGEMENT_PAYLOAD');
    if(!/^[A-Z][A-Z0-9_]{1,63}$/.test(kind))throw fail('GROWTH_ENGAGEMENT_KIND_INVALID');
    if(!Number.isFinite(occurredAt.getTime())||occurredAt.getTime()>now.getTime()+300000)throw fail('GROWTH_ENGAGEMENT_TIME_INVALID');
    const result=await this.pool.query(
      `INSERT INTO growth_engagement(id,organization_id,workspace_id,tenant_id,lead_id,kind,channel,payload,occurred_at) SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb,$9 FROM growth_lead WHERE id=$5 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 RETURNING id`,
      [id, s.organizationId, s.workspaceId, s.tenantId, leadId, kind, channel, payload, occurredAt]
    );
    if(!result.rowCount)throw Object.assign(new Error('GROWTH_ENGAGEMENT_TENANT_LEAD_REQUIRED'),{code:'GROWTH_ENGAGEMENT_TENANT_LEAD_REQUIRED'});
  }

  async recordScore({ scope, leadId, score }) {
    const s = assertTenantScope(scope);
    const scoreId = score.scoreId ?? randomUUID();
    const result = await this.pool.query(
      `INSERT INTO growth_score_snapshot(id,organization_id,workspace_id,tenant_id,lead_id,score_type,value,confidence,factors,dimensions,model_version,policy_version,calculated_at)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9::jsonb,$10::jsonb,$11,$12,$13 FROM growth_lead WHERE id=$5 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4
       ON CONFLICT(id) DO NOTHING
       RETURNING *`,
      [scoreId, s.organizationId, s.workspaceId, s.tenantId, leadId, score.scoreType, score.value, score.confidence, json(score.factors, []), json(score.dimensions, {}), score.modelVersion, score.policyVersion ?? score.modelVersion, score.calculatedAt]
    );
    if (result.rowCount) return { inserted: true, snapshot: result.rows[0] };
    const existing = await this.pool.query(
      `SELECT * FROM growth_score_snapshot WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 AND lead_id=$5`,
      [scoreId, s.organizationId, s.workspaceId, s.tenantId, leadId]
    );
    if (!existing.rowCount) throw Object.assign(new Error('GROWTH_SCORE_TENANT_LEAD_REQUIRED_OR_CONFLICT'),{code:'GROWTH_SCORE_TENANT_LEAD_REQUIRED_OR_CONFLICT'});
    return { inserted: false, snapshot: existing.rows[0] };
  }

  async upsertOpportunity({ scope, opportunity, downstreamRef = null }) {
    const s = assertTenantScope(scope);
    const result = await this.pool.query(
      `INSERT INTO growth_opportunity(id,organization_id,workspace_id,tenant_id,lead_id,stage,score,downstream_ref)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8::jsonb FROM growth_lead WHERE id=$5 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4
       ON CONFLICT(id) DO UPDATE SET stage=EXCLUDED.stage,score=EXCLUDED.score,downstream_ref=EXCLUDED.downstream_ref,updated_at=now()
       WHERE growth_opportunity.organization_id=EXCLUDED.organization_id AND growth_opportunity.workspace_id=EXCLUDED.workspace_id AND growth_opportunity.tenant_id=EXCLUDED.tenant_id
       RETURNING *`,
      [opportunity.id, s.organizationId, s.workspaceId, s.tenantId, opportunity.leadId, opportunity.stage, opportunity.score ?? null, json(downstreamRef, null)]
    );
    if (!result.rowCount) throw new Error('cross-tenant growth opportunity update denied');
    return result.rows[0];
  }

  async recordRevenue({ scope, revenue }) {
    const s = assertTenantScope(scope);
    const result=await this.pool.query(
      `INSERT INTO growth_revenue_attribution(id,organization_id,workspace_id,tenant_id,opportunity_id,lead_id,amount,currency,attributed_at,metadata)
       SELECT $1,$2,$3,$4,$5,$6,$7,$8,$9,$10::jsonb FROM growth_opportunity o JOIN growth_lead l ON l.id=$6 AND l.organization_id=$2 AND l.workspace_id=$3 AND l.tenant_id=$4 WHERE o.id=$5 AND o.lead_id=$6 AND o.organization_id=$2 AND o.workspace_id=$3 AND o.tenant_id=$4 RETURNING growth_revenue_attribution.id`,
      [revenue.id, s.organizationId, s.workspaceId, s.tenantId, revenue.opportunityId, revenue.leadId, revenue.amount, revenue.currency, revenue.attributedAt, json(revenue.metadata, {})]
    );if(!result.rowCount)throw Object.assign(new Error('GROWTH_REVENUE_TENANT_RELATION_REQUIRED'),{code:'GROWTH_REVENUE_TENANT_RELATION_REQUIRED'});
  }

  async customer360({ scope, leadId }) {
    const s = assertTenantScope(scope);
    const [lead, identities, engagements, scores, opportunities, revenue, events] = await Promise.all([
      this.pool.query(`SELECT * FROM growth_lead WHERE id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT identity_type,normalized_value,source,created_at FROM growth_identity WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY created_at`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT id,kind,channel,payload,occurred_at FROM growth_engagement WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY occurred_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT id,score_type,value,confidence,factors,dimensions,model_version,policy_version,calculated_at FROM growth_score_snapshot WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY calculated_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT id,stage,score,downstream_ref,created_at,updated_at FROM growth_opportunity WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY updated_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT opportunity_id,amount,currency,attributed_at,metadata FROM growth_revenue_attribution WHERE lead_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY attributed_at DESC`, [leadId,s.organizationId,s.workspaceId,s.tenantId]),
      this.pool.query(`SELECT event_type,subject_type,subject_id,payload,occurred_at FROM growth_event WHERE subject_id=$1 AND organization_id=$2 AND workspace_id=$3 AND tenant_id=$4 ORDER BY occurred_at DESC LIMIT 200`, [leadId,s.organizationId,s.workspaceId,s.tenantId])
    ]);
    if (!lead.rowCount) return null;
    const totalRevenue = revenue.rows.reduce((sum,row)=>sum+Number(row.amount||0),0);
    return { scope:s, lead:lead.rows[0], identities:identities.rows, engagements:engagements.rows, scoreHistory:scores.rows, latestScore:scores.rows[0] ?? lead.rows[0].score ?? null, opportunities:opportunities.rows, revenue:revenue.rows, totalRevenue, timeline:events.rows };
  }
}
