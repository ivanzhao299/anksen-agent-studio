const ACTIVE_CAMPAIGN_STATUSES = new Set(["ACTIVE", "WAITING_NEXT_CYCLE"]);

export function projectPortfolioCockpit({ applications = [], portfolioWork = {}, exceptions = [], professionalResults = [] } = {}) {
  const campaigns = portfolioWork.campaigns ?? [];
  return applications.map((application) => {
    const appCampaigns = campaigns.map((campaign) => ({
      ...campaign,
      initiatives: (campaign.initiatives ?? []).filter((item) => item.applicationId === application.id)
    })).filter((campaign) => campaign.initiatives.length > 0);
    const initiatives = appCampaigns.flatMap((campaign) => campaign.initiatives);
    const appExceptions = exceptions.filter((item) => item.applicationId === application.id);
    const appResults = professionalResults.filter((item) => item.applicationId === application.id);
    const humanActions = initiatives.filter((item) => item.humanApprovalRequired === true).length;
    const blocked = initiatives.filter((item) => item.status === "BLOCKED" && item.humanApprovalRequired !== true).length;
    const activeCampaigns = appCampaigns.filter((item) => ACTIVE_CAMPAIGN_STATUSES.has(item.status)).length;
    const professional = {
      total: appResults.length,
      pass: appResults.filter((item) => item.decision === "PASS").length,
      reviewRequired: appResults.filter((item) => item.decision === "REVIEW_REQUIRED").length,
      blocked: appResults.filter((item) => item.decision === "BLOCKED").length
    };
    const signal = humanActions > 0 || appExceptions.length > 0 || professional.reviewRequired > 0 || professional.blocked > 0
      ? "ACTION_REQUIRED"
      : activeCampaigns > 0 || initiatives.some((item) => ["DISPATCHING", "RUNNING"].includes(item.status))
        ? "RUNNING"
        : professional.pass > 0 || initiatives.some((item) => item.status === "SUCCEEDED")
          ? "RESULT_AVAILABLE"
          : "IDLE";
    return {
      ...application,
      operations: {
        signal,
        campaigns: appCampaigns.length,
        activeCampaigns,
        initiatives: initiatives.length,
        humanActions,
        blocked,
        completed: initiatives.filter((item) => item.status === "SUCCEEDED").length,
        exceptions: appExceptions.length,
        professional
      }
    };
  });
}
