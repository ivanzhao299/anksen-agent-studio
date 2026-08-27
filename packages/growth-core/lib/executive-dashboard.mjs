import { assertTenantScope } from './domain-model.mjs';

export function buildGrowthCockpit({ scope: rawScope, funnel = {}, channels = [], markets = [], content = [], attribution = {}, recommendations = [], exceptions = [], generatedAt = new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const normalizedFunnel = Object.freeze({
    prospects: Number(funnel.prospects ?? 0),
    leads: Number(funnel.leads ?? 0),
    mql: Number(funnel.mql ?? 0),
    sql: Number(funnel.sql ?? 0),
    opportunities: Number(funnel.opportunities ?? 0),
    rfqs: Number(funnel.rfqs ?? 0),
    quotes: Number(funnel.quotes ?? 0),
    orders: Number(funnel.orders ?? 0),
    revenue: Number(funnel.revenue ?? 0),
  });
  const conversion = Object.freeze({
    leadToMql: normalizedFunnel.leads ? normalizedFunnel.mql / normalizedFunnel.leads : 0,
    mqlToSql: normalizedFunnel.mql ? normalizedFunnel.sql / normalizedFunnel.mql : 0,
    sqlToOpportunity: normalizedFunnel.sql ? normalizedFunnel.opportunities / normalizedFunnel.sql : 0,
    opportunityToOrder: normalizedFunnel.opportunities ? normalizedFunnel.orders / normalizedFunnel.opportunities : 0,
  });
  return Object.freeze({
    ...scope,
    funnel: normalizedFunnel,
    conversion,
    channels: Object.freeze(channels.map((row) => Object.freeze({ ...row }))),
    markets: Object.freeze(markets.map((row) => Object.freeze({ ...row }))),
    content: Object.freeze(content.map((row) => Object.freeze({ ...row }))),
    attribution: Object.freeze({ ...attribution }),
    recommendations: Object.freeze(recommendations.map((row) => Object.freeze({ ...row }))),
    exceptions: Object.freeze(exceptions.map((row) => Object.freeze({ ...row }))),
    generatedAt,
  });
}

export function traceRevenuePath({ revenue, opportunity, lead, touches = [] }) {
  if (!revenue || !opportunity || !lead) throw new TypeError('revenue, opportunity and lead are required');
  return Object.freeze({
    revenueId: revenue.id ?? revenue.conversionId ?? null,
    amount: revenue.amount,
    currency: revenue.currency,
    opportunityId: opportunity.id ?? opportunity.opportunityId,
    leadId: lead.leadId,
    source: lead.source,
    touches: Object.freeze(touches.map((touch) => Object.freeze({
      touchId: touch.touchId ?? touch.id,
      channel: touch.channel,
      campaignId: touch.campaignId ?? null,
      contentId: touch.contentId ?? null,
      occurredAt: touch.occurredAt,
    }))),
  });
}
