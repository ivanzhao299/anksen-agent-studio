import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant } from './growth-events.mjs';

export function createFollowUpOrchestrator({ scope: rawScope, policy = {}, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const plans = [];
  const stopKinds = new Set(policy.stopOnKinds ?? ['RFQ','QUOTE_REQUEST','CONTACT_REQUEST','ORDER','OPT_OUT']);
  const maxAttempts = Number(policy.maxAttempts ?? 5);
  const minHoursBetween = Number(policy.minHoursBetween ?? 24);

  function plan({ lead, engagements = [], attempts = [], preferredChannels = [] }) {
    assertSameTenant(scope, lead);
    for (const item of engagements) if (item?.organizationId) assertSameTenant(scope, item);
    const ordered = [...engagements].sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt));
    const latest = ordered[0];
    if (ordered.some((e) => e.consent?.optOut === true || stopKinds.has(String(e.kind).toUpperCase()))) {
      return Object.freeze({ ...scope, leadId: lead.leadId, action: 'STOP', reason: 'STOP_CONDITION_MET', createdAt: clock() });
    }
    if (attempts.length >= maxAttempts) return Object.freeze({ ...scope, leadId: lead.leadId, action: 'STOP', reason: 'MAX_ATTEMPTS_REACHED', createdAt: clock() });
    const lastAttempt = [...attempts].sort((a,b)=>new Date(b.occurredAt)-new Date(a.occurredAt))[0];
    if (lastAttempt) {
      const elapsedHours = (new Date(clock()).getTime() - new Date(lastAttempt.occurredAt).getTime()) / 3600000;
      if (elapsedHours < minHoursBetween) return Object.freeze({ ...scope, leadId: lead.leadId, action: 'WAIT', reason: 'CADENCE_GUARDRAIL', retryAfterHours: Math.ceil(minHoursBetween - elapsedHours), createdAt: clock() });
    }
    const channel = preferredChannels[0] ?? latest?.channel ?? policy.defaultChannel ?? 'EMAIL';
    const result = Object.freeze({ ...scope, leadId: lead.leadId, action: 'FOLLOW_UP', channel, attemptNumber: attempts.length + 1, approvalRequired: Boolean(policy.approvalRequiredChannels?.includes(channel)), reason: 'CADENCE_ELIGIBLE', createdAt: clock() });
    plans.push(result);
    return result;
  }

  return { plan, plans };
}
