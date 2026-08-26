import { assertTenantScope, createLead, calculateLeadScore } from './domain-model.mjs';
import { createGrowthEvent } from './growth-events.mjs';

const now = () => new Date().toISOString();
const id = (prefix) => `${prefix}_${crypto.randomUUID()}`;

export function createGrowthEngine({ scope, adapter, scorePolicy, downstream, clock = now }) {
  if (!scope || !adapter) throw new Error('scope and adapter are required');
  const events = [];
  const leads = new Map();
  const identities = new Map();
  const engagements = [];
  const opportunities = new Map();
  const revenue = [];

  const emit = (type, subject, data = {}) => {
    const event = createGrowthEvent({ scope, type, subject, data, occurredAt: clock() });
    events.push(event);
    return event;
  };

  const identityKey = (prospect) => [prospect.email, prospect.phone, prospect.website, prospect.externalId].filter(Boolean).map(v => String(v).trim().toLowerCase()).sort().join('|');

  async function discover(query = {}) {
    const prospects = await adapter.discover({ scope, query });
    const created = [];
    for (const prospect of prospects) {
      const key = identityKey(prospect) || `${adapter.id}:${prospect.externalId}`;
      let leadId = identities.get(key);
      if (!leadId) {
        const lead = createLead({ scope, id: id('lead'), source: adapter.id, profile: prospect, status: 'NEW', createdAt: clock() });
        leads.set(lead.id, lead); identities.set(key, lead.id); leadId = lead.id;
        emit('prospect.discovered', { type: 'lead', id: lead.id }, { source: adapter.id });
        emit('lead.normalized', { type: 'lead', id: lead.id }, { identityKey: key });
      }
      created.push(leads.get(leadId));
    }
    return created;
  }

  function score(leadId, signals = []) {
    const lead = requireLead(leadId);
    const result = calculateLeadScore({ scope, leadId, signals, policy: scorePolicy });
    lead.score = result; lead.updatedAt = clock();
    emit('score.calculated', { type: 'lead', id: leadId }, { score: result.score, contributions: result.contributions });
    return result;
  }

  function recordEngagement(leadId, engagement) {
    requireLead(leadId); assertTenantScope(scope, engagement.scope || scope);
    const row = { id: id('eng'), leadId, ...engagement, scope, occurredAt: engagement.occurredAt || clock() };
    engagements.push(row); emit('engagement.received', { type: 'lead', id: leadId }, { kind: row.kind, channel: row.channel });
    return row;
  }

  async function qualify(leadId, criteria = {}) {
    const lead = requireLead(leadId);
    const minScore = criteria.minScore ?? 70;
    if ((lead.score?.score ?? 0) < minScore) return { qualified: false, reason: 'SCORE_BELOW_THRESHOLD' };
    const opportunity = { id: id('opp'), scope, leadId, stage: 'QUALIFIED', score: lead.score.score, createdAt: clock() };
    opportunities.set(opportunity.id, opportunity);
    emit('opportunity.qualified', { type: 'opportunity', id: opportunity.id }, { leadId });
    if (downstream?.upsertOpportunity) await downstream.upsertOpportunity({ scope, lead, opportunity });
    return { qualified: true, opportunity };
  }

  function attributeRevenue(opportunityId, amount, currency = 'USD') {
    const opportunity = opportunities.get(opportunityId); if (!opportunity) throw new Error('opportunity not found');
    const row = { id: id('rev'), scope, opportunityId, leadId: opportunity.leadId, amount, currency, attributedAt: clock() };
    revenue.push(row); emit('revenue.attributed', { type: 'opportunity', id: opportunityId }, { amount, currency, leadId: opportunity.leadId });
    return row;
  }

  function recommendNextBestAction(leadId) {
    const lead = requireLead(leadId); const scoreValue = lead.score?.score ?? 0;
    const recent = engagements.filter(e => e.leadId === leadId).at(-1);
    if (scoreValue >= 80 && recent) return { action: 'HUMAN_SALES_CONTACT', priority: 'HIGH', reason: 'HIGH_INTENT_WITH_ENGAGEMENT' };
    if (scoreValue >= 60) return { action: 'PERSONALIZED_NURTURE', priority: 'MEDIUM', reason: 'PROMISING_LEAD' };
    return { action: 'CONTENT_NURTURE', priority: 'LOW', reason: 'EARLY_STAGE' };
  }

  function report() {
    const totalRevenue = revenue.reduce((sum, r) => sum + Number(r.amount || 0), 0);
    return { scope, leads: leads.size, engagements: engagements.length, opportunities: opportunities.size, attributedRevenue: totalRevenue, eventCount: events.length, generatedAt: clock() };
  }

  function requireLead(leadId) { const lead = leads.get(leadId); if (!lead) throw new Error('lead not found'); assertTenantScope(scope, lead.scope); return lead; }
  return { discover, score, recordEngagement, qualify, attributeRevenue, recommendNextBestAction, report, events, leads, opportunities };
}
