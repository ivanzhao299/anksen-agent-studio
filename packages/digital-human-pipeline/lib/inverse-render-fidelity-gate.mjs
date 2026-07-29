const metricPaths = Object.freeze([
  ["meanSilhouetteIou", "meanSilhouetteIou"],
  ["frontSilhouetteIou", "frontSilhouetteIou"],
  ["frontEdgeChamferSimilarity", "frontEdgeChamferSimilarity"],
  ["frontStructuralSimilarity", "frontStructuralSimilarity"],
  ["frontColorMaterialSimilarity", "frontColorMaterialSimilarity"],
  ["frontComposite", "frontComposite"],
  ["minimumSemanticComposite", "minimumSemanticComposite"]
]);

function finiteMetric(report, key) {
  const value = report?.summary?.[key];
  if (!Number.isFinite(value)) {
    const error = new Error(`INVERSE_RENDER_METRIC_MISSING:${key}`);
    error.code = "INVERSE_RENDER_METRIC_MISSING";
    throw error;
  }
  return value;
}

export function evaluateInverseRenderCandidate({ baseline, candidate }) {
  const deltas = Object.fromEntries(
    metricPaths.map(([id, key]) => [
      id,
      Number((finiteMetric(candidate, key) - finiteMetric(baseline, key)).toFixed(6))
    ])
  );
  const frontRegressions = Object.entries(deltas)
    .filter(([key, value]) => key.startsWith("front") && value < 0)
    .map(([key]) => key);
  const candidateGatesPass = Object.values(candidate.gates ?? {}).every(
    value => value === "PASS"
  );
  const semanticBaseline = new Map(
    (baseline.authoritativeFrontSemanticRegions ?? []).map(region => [
      region.id,
      region.composite
    ])
  );
  const semanticRegressions = (candidate.authoritativeFrontSemanticRegions ?? [])
    .filter(
      region =>
        semanticBaseline.has(region.id) &&
        Number(region.composite) < Number(semanticBaseline.get(region.id))
    )
    .map(region => region.id);
  const meaningfulGain =
    deltas.frontComposite >= 0.01 ||
    deltas.minimumSemanticComposite >= 0.015 ||
    deltas.frontEdgeChamferSimilarity >= 0.015;
  const promotable =
    candidateGatesPass &&
    frontRegressions.length === 0 &&
    semanticRegressions.length === 0 &&
    meaningfulGain;
  return {
    schemaVersion: 1,
    check: "INVERSE_RENDER_CANDIDATE_PROMOTION",
    status: promotable ? "PASS_AWAITING_VISUAL_OWNER_REVIEW" : "REJECTED_KEEP_BASELINE",
    promotable,
    automaticMasterOverwrite: false,
    deltas,
    frontRegressions,
    semanticRegressions,
    meaningfulGain,
    candidateGatesPass,
    nextAction: promotable
      ? "VISUAL_OWNER_COMPARE_AND_APPROVE"
      : "REWORK_FAILED_FIDELITY_REGIONS"
  };
}
