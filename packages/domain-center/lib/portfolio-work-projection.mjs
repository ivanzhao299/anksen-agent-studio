export function projectPortfolioWork(campaigns = [], { applicationIds = [], generatedAt = new Date().toISOString() } = {}) {
  const visible = new Set(applicationIds);
  const scoped = campaigns.map((campaign) => {
    const initiatives = (campaign.initiatives ?? []).filter((item) => visible.has(item.applicationId));
    if (!initiatives.length) return null;
    const current = initiatives.filter((item) => item.cycle === campaign.schedule?.currentCycle);
    const counts = Object.fromEntries(["PENDING", "DISPATCHING", "RUNNING", "SUCCEEDED", "FAILED", "BLOCKED", "CANCELLED"].map((status) => [status.toLowerCase(), current.filter((item) => item.status === status).length]));
    return {
      id: campaign.id,
      goal: campaign.goal,
      status: campaign.status,
      cycle: Number(campaign.schedule?.currentCycle ?? 0) + 1,
      scheduleMode: campaign.schedule?.mode ?? "ONCE",
      startedAt: campaign.startedAt ?? null,
      finishedAt: campaign.finishedAt ?? null,
      updatedAt: campaign.updatedAt,
      counts,
      initiatives: current.map((item) => ({
        id: item.id,
        applicationId: item.applicationId,
        domainId: item.domainId,
        domainName: item.domainName,
        title: item.title,
        status: item.status,
        blockedReasons: item.blockedReasons ?? [],
        humanApprovalRequired: item.report?.humanApprovalRequired === true,
        nextAction: item.report?.nextAction ?? null,
        businessObject: item.report?.businessObject ?? item.businessObject ?? null,
        workItemId: item.report?.workItemId ?? null,
        resultSummary: item.report?.resultSummary ?? null,
        approvalResolution: item.approvalResolution ?? null,
        updatedAt: item.finishedAt ?? item.startedAt ?? item.createdAt
      }))
    };
  }).filter(Boolean);
  const initiatives = scoped.flatMap((campaign) => campaign.initiatives.map((item) => ({ ...item, campaignId: campaign.id, campaignGoal: campaign.goal })));
  const humanActions = initiatives.filter((item) => item.humanApprovalRequired);
  const blocked = initiatives.filter((item) => item.status === "BLOCKED" && !item.humanApprovalRequired);
  const completed = initiatives.filter((item) => item.status === "SUCCEEDED");
  return {
    schemaVersion: 1,
    generatedAt,
    source: "AUTONOMOUS_PORTFOLIO_PROJECTION",
    summary: {
      campaigns: scoped.length,
      activeCampaigns: scoped.filter((item) => ["ACTIVE", "WAITING_NEXT_CYCLE"].includes(item.status)).length,
      initiatives: initiatives.length,
      humanActions: humanActions.length,
      blocked: blocked.length,
      completed: completed.length
    },
    humanActions,
    blocked,
    morningReport: scoped.map(({ initiatives: ignored, ...campaign }) => campaign),
    campaigns: scoped
  };
}
