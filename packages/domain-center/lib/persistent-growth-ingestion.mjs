import { createHash, randomUUID } from 'node:crypto';
import { createLead } from '../../growth-core/lib/domain-model.mjs';
import { createGrowthEvent } from '../../growth-core/lib/growth-events.mjs';
import { createScoringEngine } from '../../growth-core/lib/scoring-engine.mjs';
import { assertTenantScope } from '../../growth-core/lib/domain-model.mjs';
import { PostgresGrowthStore } from './postgres-growth-store.mjs';

const deterministicId = (scope, event) => `lead_${createHash('sha256').update([scope.organizationId,scope.workspaceId,scope.tenantId,event.source,event.externalId].join(':')).digest('hex').slice(0,24)}`;
const scopedEventId = (prefix, scope, eventId) => `${prefix}_${createHash('sha256').update([scope.organizationId,scope.workspaceId,scope.tenantId,eventId].join(':')).digest('hex').slice(0,24)}`;
const compact = (items) => items.filter((item) => item.value);
const reviewId = (scope, idempotencyKey) => `identity_review_${createHash('sha256').update([scope.organizationId,scope.workspaceId,scope.tenantId,idempotencyKey].join(':')).digest('hex').slice(0,24)}`;
const websiteEventTypes=new Set(['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','SAMPLE_REQUEST','DEMO_REQUEST','FORM_SUBMISSION','CONTENT_DOWNLOAD','PAGE_VIEW','OPT_OUT']),highIntentTypes=new Set(['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','SAMPLE_REQUEST']),safeReference=value=>typeof value==='string'&&/^[A-Za-z0-9][A-Za-z0-9._:/-]{2,159}$/.test(value)&&!/(?:^sk-|^gh[pousr]_|bearer\s|password\s*=|token\s*=|api[_-]?key\s*=|-----BEGIN|eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+\.)/i.test(value);

export class PersistentGrowthIngestionService {
  constructor({ pool, scoringPolicy = {}, clock = () => new Date().toISOString() } = {}) {
    if (!pool?.connect) throw new TypeError('transaction-capable pool is required');
    this.pool = pool;
    this.scoringPolicy = scoringPolicy;
    this.clock = clock;
  }

  async ingestWebsiteEvent({ scope: rawScope, event }) {
    const scope = assertTenantScope(rawScope),clockValue=this.clock(),now=new Date(clockValue),receivedAt=new Date(event?.provenance?.receivedAt);
    if(!Number.isFinite(now.getTime()))throw Object.assign(new Error('GROWTH_INGESTION_CLOCK_INVALID'),{code:'GROWTH_INGESTION_CLOCK_INVALID'});
    if (!event||event.source !== 'WEBSITE'||!safeReference(event.eventId)||!safeReference(event.externalId)||typeof event.sourceDomain!=='string'||!/^(?=.{1,253}$)(?:[a-z0-9](?:[a-z0-9-]{0,61}[a-z0-9])?\.)+[a-z]{2,63}$/i.test(event.sourceDomain)||!websiteEventTypes.has(event.kind)||event.highIntent!==highIntentTypes.has(event.kind)||!Array.isArray(event.productRefs)||event.productRefs.length>50||event.productRefs.some(value=>!safeReference(value))||!event.consent||typeof event.consent!=='object'||typeof event.consent.marketing!=='boolean'||typeof event.consent.optOut!=='boolean'||!Number.isFinite(receivedAt.getTime())||receivedAt.getTime()>now.getTime()+300000) throw Object.assign(new TypeError('normalized website event is required'),{code:'GROWTH_WEBSITE_EVENT_INVALID'});
    const idempotencyKey = `website:${event.sourceDomain}:${event.eventId}`;
    const client = await this.pool.connect();
    try {
      await client.query('BEGIN');
      const store = new PostgresGrowthStore({ pool: client });
      const replay = await store.findEventByIdempotencyKey({ scope, idempotencyKey });
      if (replay) {
        await client.query('COMMIT');
        return { status: 'DUPLICATE', leadId: replay.subject_id, eventId: replay.event_id };
      }

      const identities = compact([
        { identityType: 'EMAIL', value: event.email },
        { identityType: 'PHONE', value: event.phone },
        { identityType: 'DOMAIN', value: event.company?.website },
      ]);
      const matches = (await Promise.all(identities.map((identity) => store.findIdentity({ scope, ...identity })))).filter(Boolean);
      const matchedLeadIds = [...new Set(matches.map((match) => match.lead_id))];
      if (matchedLeadIds.length > 1) {
        const error = new Error('GROWTH_IDENTITY_REVIEW_REQUIRED');
        error.code = 'GROWTH_IDENTITY_REVIEW_REQUIRED';
        error.leadIds = matchedLeadIds;
        throw error;
      }

      const leadId = matchedLeadIds[0] ?? deterministicId(scope, event);
      const existing = await store.getLead({ scope, leadId });
      const externalRef = { channel: event.source, externalId: event.externalId, sourceDomain: event.sourceDomain };
      const previousRefs = existing?.external_refs ?? [];
      const externalRefs = previousRefs.some((ref) => ref.channel === externalRef.channel && ref.externalId === externalRef.externalId) ? previousRefs : [...previousRefs, externalRef];
      const scoring = createScoringEngine({ scope, policy: this.scoringPolicy, clock: this.clock });
      const score = scoring.calculate({ subjectId: leadId, factors: [
        { name: 'FIT:IDENTIFIED_COMPANY', value: event.company?.name ? 20 : 0, source: event.source },
        { name: 'INTENT:HIGH_INTENT_EVENT', value: event.highIntent ? 45 : 10, source: event.source },
        { name: 'ENGAGEMENT:CONSENT', value: event.consent?.marketing && !event.consent?.optOut ? 15 : 0, source: event.source },
      ], occurredAt: event.provenance?.receivedAt ?? this.clock() });
      const lead = createLead({ ...scope, leadId, source: existing?.source ?? event.source, status: existing?.status ?? 'NEW', person: { ...(existing?.person ?? {}), ...(event.person ?? {}) }, company: { ...(existing?.company ?? {}), ...(event.company ?? {}) }, externalRefs, score, createdAt: existing?.created_at ?? this.clock() });
      await store.upsertLead({ scope, lead: { ...lead, score } });
      for (const identity of identities) await store.resolveIdentity({ scope, ...identity, leadId, source: event.source });
      await store.recordEngagement({ scope, engagement: { id: scopedEventId('eng', scope, event.eventId), leadId, kind: event.kind, channel: event.source, payload: { message: event.message, productRefs: event.productRefs, consent: event.consent }, occurredAt: event.provenance?.receivedAt ?? this.clock() } });
      await store.recordScore({ scope, leadId, score: { ...score, scoreId: scopedEventId('score', scope, event.eventId) } });
      const auditEvent = createGrowthEvent({ ...scope, eventId: `evt_${randomUUID()}`, eventType: 'growth.engagement.received', subjectType: 'lead', subjectId: leadId, source: event.source, idempotencyKey, payload: { externalId: event.externalId, kind: event.kind, sourceDomain: event.sourceDomain }, occurredAt: event.provenance?.receivedAt ?? this.clock() });
      await store.appendEvent({ scope, event: auditEvent });
      await client.query('COMMIT');
      return { status: 'ACCEPTED', leadId, score, matchedExistingLead: Boolean(matchedLeadIds.length), identityCount: identities.length, eventId: auditEvent.eventId };
    } catch (error) {
      await client.query('ROLLBACK').catch(() => {});
      if(error?.code==='GROWTH_IDENTITY_REVIEW_REQUIRED'){
        const candidateLeadIds=[...new Set(error.leadIds)].sort(),identityTypes=compact([{identityType:'EMAIL',value:event.email},{identityType:'PHONE',value:event.phone},{identityType:'DOMAIN',value:event.company?.website}]).map(item=>item.identityType).sort(),externalIdHash=createHash('sha256').update(String(event.externalId)).digest('hex');
        await this.pool.query(`INSERT INTO growth_identity_review_case(id,organization_id,workspace_id,tenant_id,idempotency_key,source,external_id_hash,candidate_lead_ids,identity_types,status,created_at,updated_at) VALUES($1,$2,$3,$4,$5,$6,$7,$8,$9,'OPEN',$10,$10) ON CONFLICT(organization_id,workspace_id,tenant_id,idempotency_key) DO NOTHING`,[reviewId(scope,idempotencyKey),scope.organizationId,scope.workspaceId,scope.tenantId,idempotencyKey,event.source,externalIdHash,JSON.stringify(candidateLeadIds),JSON.stringify(identityTypes),this.clock()]);
        error.reviewCaseId=reviewId(scope,idempotencyKey);
      }
      throw error;
    } finally {
      client.release();
    }
  }
}
