import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant } from './growth-events.mjs';

export function createQualificationEngine({ scope: rawScope, policy = {}, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const history = [];

  function evaluate({ lead, score = null, engagements = [], opportunity = null }) {
    assertSameTenant(scope, lead);
    for (const item of engagements) if (item?.organizationId) assertSameTenant(scope, item);
    const value = Number(score?.value ?? lead.score?.value ?? 0);
    const mqlThreshold = Number(policy.mqlThreshold ?? 60);
    const sqlThreshold = Number(policy.sqlThreshold ?? 75);
    const highIntentKinds = new Set(policy.highIntentKinds ?? ['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','SAMPLE_REQUEST']);
    const hasHighIntent = engagements.some((e) => highIntentKinds.has(String(e.kind).toUpperCase()));
    const optedOut = engagements.some((e) => e.consent?.optOut === true);
    let stage = 'LEAD';
    const reasons = [];
    if (optedOut) { stage = 'DISQUALIFIED'; reasons.push('OPT_OUT'); }
    else if (opportunity) { stage = 'SQL'; reasons.push('OPPORTUNITY_EXISTS'); }
    else if (value >= sqlThreshold || hasHighIntent) { stage = 'SQL'; if (value >= sqlThreshold) reasons.push('SQL_SCORE'); if (hasHighIntent) reasons.push('HIGH_INTENT'); }
    else if (value >= mqlThreshold) { stage = 'MQL'; reasons.push('MQL_SCORE'); }
    else reasons.push('BELOW_MQL_THRESHOLD');

    const result = Object.freeze({
      ...scope,
      leadId: lead.leadId,
      stage,
      score: value,
      reasons: Object.freeze(reasons),
      evaluatedAt: clock(),
      policyVersion: policy.version ?? 'qualification-v1',
    });
    history.push(result);
    return result;
  }

  function nextBestAction(result) {
    if (result.stage === 'DISQUALIFIED') return { action: 'STOP_OUTREACH', priority: 'NONE', approvalRequired: false };
    if (result.stage === 'SQL') return { action: 'HUMAN_SALES_CONTACT', priority: 'HIGH', approvalRequired: false };
    if (result.stage === 'MQL') return { action: 'PERSONALIZED_NURTURE', priority: 'MEDIUM', approvalRequired: false };
    return { action: 'CONTENT_NURTURE', priority: 'LOW', approvalRequired: false };
  }

  return { evaluate, nextBestAction, history };
}
