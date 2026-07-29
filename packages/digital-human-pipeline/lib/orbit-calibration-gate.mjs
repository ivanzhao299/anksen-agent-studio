const round = value => Math.round(value * 1_000_000) / 1_000_000;

function viewMap(report) {
  return new Map((report.views ?? []).map(view => [Number(view.angle), view]));
}

export function evaluateOrbitCalibrationCandidate({
  baseline,
  candidate,
  proposal,
  thresholds = {}
}) {
  const minimumMeanImprovement = thresholds.minimumMeanImprovement ?? 0.003;
  const minimumFrontImprovement = thresholds.minimumFrontImprovement ?? 0;
  const maximumSingleViewRegression = thresholds.maximumSingleViewRegression ?? 0.02;
  const baselineViews = viewMap(baseline);
  const candidateViews = viewMap(candidate);
  const views = [...baselineViews.entries()].map(([angle, baselineView]) => {
    const candidateView = candidateViews.get(angle);
    return {
      angle,
      baselineIou: baselineView.iou,
      candidateIou: candidateView?.iou ?? null,
      delta:
        candidateView?.iou == null
          ? null
          : round(candidateView.iou - baselineView.iou)
    };
  });
  const missingAngles = views
    .filter(view => view.candidateIou == null)
    .map(view => view.angle);
  const regressions = views.filter(
    view => view.delta != null && view.delta < -maximumSingleViewRegression
  );
  const meanIouDelta = round(
    candidate.summary.meanIou - baseline.summary.meanIou
  );
  const frontIouDelta = round(
    candidate.summary.frontIou - baseline.summary.frontIou
  );

  const checks = {
    reportsComplete: missingAngles.length === 0,
    candidateNotFailed: candidate.status !== "FAIL",
    meanImproved: meanIouDelta >= minimumMeanImprovement,
    authoritativeFrontNotRegressed:
      frontIouDelta >= minimumFrontImprovement,
    noMaterialSingleViewRegression: regressions.length === 0,
    masterOverwriteDisabled: proposal?.automaticMasterOverwrite !== true
  };
  const promotionEligible = Object.values(checks).every(Boolean);

  return {
    schemaVersion: 1,
    status: promotionEligible
      ? "PROMOTION_ELIGIBLE_FOR_OWNER_REVIEW"
      : "REJECTED_KEEP_BASELINE",
    promotionEligible,
    automaticMasterOverwrite: false,
    authority: {
      frontView: "identity-and-proportion-master",
      generatedHiddenViews: "directional-reference-only",
      generatedViewsAreMetric: false
    },
    thresholds: {
      minimumMeanImprovement,
      minimumFrontImprovement,
      maximumSingleViewRegression
    },
    comparison: {
      baselineStatus: baseline.status,
      candidateStatus: candidate.status,
      baselineMeanIou: baseline.summary.meanIou,
      candidateMeanIou: candidate.summary.meanIou,
      meanIouDelta,
      baselineFrontIou: baseline.summary.frontIou,
      candidateFrontIou: candidate.summary.frontIou,
      frontIouDelta,
      missingAngles,
      regressions,
      views
    },
    checks,
    decision: promotionEligible
      ? "Candidate may proceed to visual owner review; the master remains unchanged."
      : "Keep the current master. Refit semantic parts or improve observations before rebuilding another candidate."
  };
}
