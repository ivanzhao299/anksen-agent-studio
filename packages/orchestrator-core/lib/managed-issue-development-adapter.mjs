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
  constructor({ apiBaseUrl, token, credentials, project, jobs, fetchImpl = globalThis.fetch, runnerId = "studio-resident-runner" }) {
    if (!apiBaseUrl || (!token && (!credentials?.username || !credentials?.password)) || !project?.projectRoot || !jobs || !fetchImpl) throw new Error("MANAGED_ISSUE_ADAPTER_CONFIG_REQUIRED");
    this.apiBaseUrl = apiBaseUrl.replace(/\/$/, "");
    this.token = token;
    this.credentials = credentials;
    this.project = project;
    this.jobs = jobs;
    this.fetch = fetchImpl;
    this.runnerId = runnerId;
  }

  headers(idempotencyKey) {
    return { authorization: `Bearer ${this.token}`, "content-type": "application/json", ...(idempotencyKey ? { "idempotency-key": idempotencyKey } : {}) };
  }

  async request(path, init = {}) {
    if (!this.token) await this.authenticate();
    let response = await this.fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: { ...this.headers(init.idempotencyKey), ...init.headers } });
    if (response.status === 401 && this.credentials) {
      await this.authenticate();
      response = await this.fetch(`${this.apiBaseUrl}${path}`, { ...init, headers: { ...this.headers(init.idempotencyKey), ...init.headers } });
    }
    await ensureOk(response, "MANAGED_ISSUE_API");
    const envelope = await response.json();
    return envelope?.data ?? envelope;
  }

  async authenticate() {
    const response = await this.fetch(`${this.apiBaseUrl}/auth/login`, {
      method: "POST", headers: { "content-type": "application/json" },
      body: JSON.stringify({ username: this.credentials.username, password: this.credentials.password, tenantId: this.credentials.tenantId, parkId: this.credentials.parkId })
    });
    await ensureOk(response, "MANAGED_ISSUE_LOGIN");
    const envelope = await response.json();
    const result = envelope?.data ?? envelope;
    if (!result?.accessToken) throw new Error("MANAGED_ISSUE_LOGIN_TOKEN_MISSING");
    this.token = result.accessToken;
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
    const projectRoot = await this.provisionWorktree(claim.issueNo);
    const job = await this.jobs.create({
      projectId: this.project.projectId,
      projectRoot,
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

  async provisionWorktree(issueNo) {
    if (!this.project.worktreeRoot) return this.project.projectRoot;
    const branch = `runner/${String(issueNo).toLowerCase().replace(/[^a-z0-9-]+/g, "-")}`;
    const target = resolve(this.project.worktreeRoot, branch.replaceAll("/", "-"));
    await mkdir(this.project.worktreeRoot, { recursive: true });
    const run = (args) => spawnSync("git", ["-C", this.project.projectRoot, ...args], { encoding: "utf8" });
    const fetch = run(["fetch", "origin", "main"]);
    if (fetch.status !== 0) throw new Error(`MANAGED_PROJECT_FETCH_FAILED:${fetch.stderr}`);
    const removeBranch = run(["branch", "-D", branch]);
    if (removeBranch.status !== 0 && !/not found|not exist/i.test(`${removeBranch.stdout}${removeBranch.stderr}`)) throw new Error("MANAGED_PROJECT_STALE_BRANCH_FAILED");
    const added = run(["worktree", "add", "-b", branch, target, "origin/main"]);
    if (added.status !== 0) throw new Error(`MANAGED_PROJECT_WORKTREE_FAILED:${added.stderr}`);
    return target;
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
import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";
import { spawnSync } from "node:child_process";
