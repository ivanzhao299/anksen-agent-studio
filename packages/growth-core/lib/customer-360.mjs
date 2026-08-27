import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant } from './growth-events.mjs';

export function buildCustomer360({
  scope: rawScope,
  lead,
  identityView = null,
  engagements = [],
  scoreHistory = [],
  opportunities = [],
  attributionTouches = [],
  qualification = {},
  clock = () => new Date().toISOString(),
}) {
  const scope = assertTenantScope(rawScope);
  assertSameTenant(scope, lead);
  for (const item of [...engagements, ...scoreHistory, ...opportunities, ...attributionTouches]) {
    if (item?.organizationId) assertSameTenant(scope, item);
  }

  const latestScore = [...scoreHistory].sort((a, b) => new Date(b.calculatedAt ?? 0) - new Date(a.calculatedAt ?? 0))[0] ?? lead.score ?? null;
  const orderedEngagements = [...engagements].sort((a, b) => new Date(b.occurredAt ?? 0) - new Date(a.occurredAt ?? 0));
  const threshold = Number(qualification.minScore ?? 70);
  const qualified = Number(latestScore?.value ?? 0) >= threshold;
  const reasons = [];
  if (qualified) reasons.push(`SCORE_AT_OR_ABOVE_${threshold}`);
  if (orderedEngagements.some((e) => ['RFQ', 'QUOTE_REQUEST', 'CONTACT_REQUEST'].includes(String(e.kind).toUpperCase()))) reasons.push('HIGH_INTENT_ENGAGEMENT');
  if (opportunities.length) reasons.push('OPPORTUNITY_EXISTS');

  const sourceChannels = new Set();
  for (const ref of lead.externalRefs ?? []) if (ref.channel) sourceChannels.add(ref.channel);
  for (const e of engagements) if (e.channel) sourceChannels.add(e.channel);
  for (const p of identityView?.sourceProfiles ?? []) if (p.source) sourceChannels.add(p.source);

  return Object.freeze({
    ...scope,
    leadId: lead.leadId,
    status: lead.status,
    person: lead.person,
    company: lead.company,
    marketId: lead.marketId,
    icpId: lead.icpId,
    source: lead.source,
    sourceChannels: Object.freeze([...sourceChannels]),
    identities: Object.freeze([...(identityView?.sourceProfiles ?? [])]),
    identityLinks: Object.freeze([...(identityView?.identityLinks ?? [])]),
    latestScore,
    scoreHistory: Object.freeze([...scoreHistory]),
    engagements: Object.freeze(orderedEngagements),
    opportunities: Object.freeze([...opportunities]),
    attributionTouches: Object.freeze([...attributionTouches]),
    qualification: Object.freeze({ qualified, threshold, reasons: Object.freeze(reasons) }),
    generatedAt: clock(),
  });
}

export function explainQualification(view) {
  if (!view?.qualification) throw new TypeError('customer360 qualification view is required');
  return Object.freeze({
    leadId: view.leadId,
    qualified: view.qualification.qualified,
    score: view.latestScore?.value ?? null,
    threshold: view.qualification.threshold,
    reasons: view.qualification.reasons,
    latestEngagement: view.engagements?.[0] ?? null,
    sourceChannels: view.sourceChannels ?? [],
  });
}
