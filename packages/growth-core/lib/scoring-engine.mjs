import { assertTenantScope, createExplainableScore } from './domain-model.mjs';

export function createScoringEngine({ scope: rawScope, policy = {}, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const history = [];

  function calculate({ subjectId, factors = [], occurredAt = clock() }) {
    const nowMs = new Date(occurredAt).getTime();
    const halfLifeDays = Number(policy.halfLifeDays ?? 30);
    const weighted = factors.map((factor) => {
      const base = Number(factor.value ?? factor.contribution ?? 0);
      const weight = Number(factor.weight ?? 1);
      const eventAt = new Date(factor.occurredAt ?? occurredAt).getTime();
      const ageDays = Math.max(0, (nowMs - eventAt) / 86400000);
      const decay = halfLifeDays > 0 ? Math.pow(0.5, ageDays / halfLifeDays) : 1;
      const contribution = base * weight * decay;
      return { name: factor.name, value: base, weight, decay, contribution, occurredAt: factor.occurredAt ?? occurredAt, source: factor.source ?? null };
    });
    const grouped = { FIT: 0, INTENT: 0, ENGAGEMENT: 0, OPPORTUNITY: 0 };
    for (const factor of weighted) {
      const bucket = String(factor.name ?? '').split(':')[0].toUpperCase();
      if (bucket in grouped) grouped[bucket] += factor.contribution;
    }
    const total = Math.max(0, Math.min(100, Number(policy.base ?? 0) + weighted.reduce((sum, f) => sum + f.contribution, 0)));
    const score = createExplainableScore({
      ...scope,
      subjectId,
      value: Math.round(total * 100) / 100,
      scoreType: policy.scoreType ?? 'LEAD_QUALITY',
      confidence: Number(policy.confidence ?? 1),
      factors: weighted.map((f) => ({ name: f.name, contribution: Math.round(f.contribution * 100) / 100, source: f.source, occurredAt: f.occurredAt })),
      modelVersion: policy.version ?? 'growth-score-v1',
      calculatedAt: occurredAt,
    });
    const snapshot = Object.freeze({ ...score, dimensions: Object.freeze(grouped), policyVersion: policy.version ?? 'growth-score-v1' });
    history.push(snapshot);
    return snapshot;
  }

  function getHistory(subjectId) {
    return history.filter((item) => item.subjectId === subjectId);
  }

  return { calculate, getHistory, history };
}
