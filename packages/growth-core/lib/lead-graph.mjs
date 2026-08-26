import { assertTenantScope } from './domain-model.mjs';
import { assertSameTenant } from './growth-events.mjs';

const normalize = (value) => String(value ?? '').trim().toLowerCase();
const fingerprint = (profile) => [profile.email, profile.phone, profile.website, profile.externalId]
  .filter(Boolean)
  .map(normalize)
  .sort()
  .join('|');

export function createLeadGraph({ scope: rawScope, clock = () => new Date().toISOString() }) {
  const scope = assertTenantScope(rawScope);
  const people = new Map();
  const companies = new Map();
  const sourceProfiles = new Map();
  const links = new Map();
  const mergeHistory = [];

  function upsertSourceProfile(input) {
    if (input.scope) assertSameTenant(scope, input.scope);
    if (!input.source || !input.externalId) throw new TypeError('source and externalId are required');
    const sourceProfileId = `${input.source}:${input.externalId}`;
    const profile = Object.freeze({
      ...scope,
      sourceProfileId,
      source: input.source,
      externalId: input.externalId,
      person: Object.freeze({ ...(input.person ?? {}) }),
      company: Object.freeze({ ...(input.company ?? {}) }),
      email: input.email ?? null,
      phone: input.phone ?? null,
      website: input.website ?? null,
      observedAt: input.observedAt ?? clock(),
      provenance: Object.freeze({ ...(input.provenance ?? {}) }),
    });
    sourceProfiles.set(sourceProfileId, profile);
    return profile;
  }

  function resolve(profile, candidates = []) {
    if (profile.scope) assertSameTenant(scope, profile.scope);
    const exact = fingerprint(profile);
    const ranked = candidates.map((candidate) => {
      assertSameTenant(scope, candidate);
      const candidateFp = fingerprint(candidate);
      let confidence = 0;
      const evidence = [];
      if (exact && candidateFp === exact) { confidence = 1; evidence.push('EXACT_FINGERPRINT'); }
      else {
        if (profile.email && normalize(profile.email) === normalize(candidate.email)) { confidence += 0.55; evidence.push('EMAIL'); }
        if (profile.phone && normalize(profile.phone) === normalize(candidate.phone)) { confidence += 0.35; evidence.push('PHONE'); }
        if (profile.website && normalize(profile.website) === normalize(candidate.website)) { confidence += 0.25; evidence.push('WEBSITE'); }
        if (profile.company?.name && normalize(profile.company.name) === normalize(candidate.company?.name)) { confidence += 0.15; evidence.push('COMPANY_NAME'); }
      }
      return { candidate, confidence: Math.min(1, confidence), evidence };
    }).sort((a, b) => b.confidence - a.confidence);
    const best = ranked[0] ?? null;
    return {
      match: best?.confidence >= 0.8 ? best.candidate : null,
      reviewRequired: Boolean(best && best.confidence >= 0.55 && best.confidence < 0.8),
      confidence: best?.confidence ?? 0,
      evidence: best?.evidence ?? [],
      alternatives: ranked.slice(0, 3),
    };
  }

  function attach({ canonicalId, canonicalType, sourceProfileId, confidence = 1, evidence = [] }) {
    if (!sourceProfiles.has(sourceProfileId)) throw new Error('source profile not found');
    const linkId = `${canonicalType}:${canonicalId}:${sourceProfileId}`;
    const link = Object.freeze({ ...scope, linkId, canonicalId, canonicalType, sourceProfileId, confidence, evidence: Object.freeze([...evidence]), linkedAt: clock(), status: 'ACTIVE' });
    links.set(linkId, link);
    return link;
  }

  function merge({ fromId, intoId, canonicalType, reason, actor = 'SYSTEM' }) {
    if (!fromId || !intoId || fromId === intoId) throw new TypeError('distinct fromId and intoId are required');
    const event = Object.freeze({ ...scope, mergeId: `merge_${crypto.randomUUID()}`, fromId, intoId, canonicalType, reason: reason ?? 'IDENTITY_RESOLUTION', actor, mergedAt: clock(), reversedAt: null });
    mergeHistory.push(event);
    return event;
  }

  function customer360(canonicalId) {
    const related = [...links.values()].filter((l) => l.canonicalId === canonicalId && l.status === 'ACTIVE');
    return {
      ...scope,
      canonicalId,
      sourceProfiles: related.map((l) => sourceProfiles.get(l.sourceProfileId)).filter(Boolean),
      identityLinks: related,
      generatedAt: clock(),
    };
  }

  return { upsertSourceProfile, resolve, attach, merge, customer360, people, companies, sourceProfiles, links, mergeHistory };
}
