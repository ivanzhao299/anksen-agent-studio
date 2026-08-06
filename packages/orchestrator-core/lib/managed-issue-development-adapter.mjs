const ensureOk = async (response, operation) => {
  if (response.ok) return response;
  const body = await response.text().catch(() => "");
  throw Object.assign(new Error(`${operation}_FAILED:${response.status}:${body.slice(0, 300)}`), { code: `${operation}_FAILED` });
};

const evidenceFor = (criteria, commands) => criteria.map((criterion, index) => ({
  criterion,
  type: "TEST",
  reference: commands[Math.min(index, commands.length - 1)]
}));

export class ManagedIssueDevelopmentAdapter {
  constructor({ apiBaseUrl, token, project, jobs, fetchImpl = globalThis.fetch, runnerId = "studio-resident-runner" }) {
    if (!apiBaseUrl || !token || !project?.projectRoot || !jobs || !fetchImpl) throw new Error("MANAGED_ISSUE_ADAPTER_CONFIG_REQUIRED");
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.token = token;
    this.project = project;
    this.jobs = jobs;
    this.fetch = fetchImpl;
    this.runnerId = runnerId;
  }

  headers(idempotencyKey) {
    return { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) };
  }

  async request(path, init = {}) {
    const response = await this.fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: { ...this.headers(init.idempotencyKey), ...init.headers } });
    await ensureOk(response, "MANAGED_ISSUE_API");
    const envelope = await response.json();
    return envelope?.data ?? envelope;
  }

  async syncReady({ limit = 10 } = {}) {
    const issues = await this.request(`/admin-issues/runner/ready?limit=${Math.min(Math.max(limit, 1), 25)}`);
    const created = [];
    for (const issue of issues) created.push(await this.intake(issue));
    return created;
  }

  async intake(issue) {
    const claim = await this.request(`/admin-issues/${encodeURIComponent(issue.issueNo)}/runner/claim`, {
      method: "POST", idempotencyKey: `managed-issue-claim-${issue.issueNo}`,
      body: JSON.stringify({ runner_id: this.runnerId })
    });
    const criteria = String(claim.acceptanceCriteria ?? "").split("\n").map(value => value.trim()).filter(Boolean);
    const commands = this.project.acceptanceCommands?.length ? this.project.acceptanceCommands : ["git diff --check"];
    const job = await this.jobs.create({
      projectId: this.project.projectId,
      projectRoot: this.project.projectRoot,
      goal: `[${claim.issueNo}] ${claim.title}\n\n${claim.description}\n\n页面：${claim.route}`,
      allowedPaths: this.project.allowedPaths,
      acceptanceCriteria: criteria,
      acceptanceCommands: commands,
      acceptanceEvidence: evidenceFor(criteria, commands),
      maxRuntimeSeconds: this.project.maxRuntimeSeconds ?? 1800,
      maxRepairAttempts: this.project.maxRepairAttempts ?? 1
    }, { userId: claim.approvedBy ?? "smart-park-admin" });
    job.managedIssue = { system: "jinhu-smart-park", issueNo: claim.issueNo, leaseToken: claim.leaseToken };
    await this.jobs.event(job, "MANAGED_ISSUE_LINKED", { system: "jinhu-smart-park", issueNo: claim.issueNo });
    if (job.status === "PENDING_APPROVAL") await this.jobs.approve(job.id, { userId: claim.approvedBy ?? "smart-park-admin" });
    return this.jobs.get(job.id);
  }

  async writeBack(job, { releaseEvidence } = {}) {
    const link = job?.managedIssue;
    if (!link?.issueNo || !link?.leaseToken) throw new Error("MANAGED_ISSUE_LINK_REQUIRED");
    const validation = job.validation?.status === "PASS" || job.validation?.conclusion === "SUCCESS"
      ? { status: "PASS", job_id: job.id, artifacts: job.artifacts?.map(item => ({ id: item.id, sha256: item.sha256 })) ?? [] }
      : { status: "FAIL", job_id: job.id, error: job.error ?? null };
    const released = releaseEvidence?.status === "PASS" || releaseEvidence?.conclusion === "SUCCESS";
    const completed = Boolean(job.commit?.hash && job.changedPaths?.length && validation.status === "PASS");
    return this.request(`/admin-issues/${encodeURIComponent(link.issueNo)}/runner/result`, {
      method: "POST", idempotencyKey: `managed-issue-result-${link.issueNo}-${job.updatedAt}`,
      body: JSON.stringify({
        lease_token: link.leaseToken,
        runner_status: released ? "SUCCEEDED" : completed ? "WAITING_REVIEW" : "FAILED",
        summary: released ? "修复已通过 CI、部署和生产健康检查。" : completed ? "修复和验证已完成，等待项目发布流水线。" : "Runner 未能完成修复，请管理员复核。",
        implementation_commit: job.commit?.hash,
        changed_files: job.changedPaths,
        validation_evidence: validation,
        release_evidence: releaseEvidence
      })
    });
  }
}
