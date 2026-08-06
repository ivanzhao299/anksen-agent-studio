import { spawnSync } from "node:child_process";

const sleep = ms => new Promise(resolve => setTimeout(resolve, ms));
const run = (command, args, cwd) => {
  const result = spawnSync(command, args, { cwd, encoding: "utf8", timeout: 180000 });
  if (result.status !== 0) throw new Error(`${command.toUpperCase()}_FAILED:${result.stderr || result.stdout}`);
  return result.stdout.trim();
};

export class ManagedIssueReleaseController {
  constructor({ jobs, adapter, repository, productionUrl, pollSeconds = 20, maxWaitMinutes = 60 }) {
    this.jobs = jobs; this.adapter = adapter; this.repository = repository;
    this.productionUrl = productionUrl; this.pollMs = pollSeconds * 1000; this.maxWaitMs = maxWaitMinutes * 60000;
  }

  async release(job) {
    if (job.status === "AWAITING_DIFF_APPROVAL") job = await this.jobs.approveCommit(job.id, { userId: "managed-issue-release-controller" });
    if (job.status !== "COMMITTED" || !job.commit?.hash || !job.managedIssue) throw new Error("MANAGED_ISSUE_NOT_RELEASE_READY");
    const branch = run("git", ["branch", "--show-current"], job.projectRoot);
    if (!branch.startsWith("runner/")) throw new Error("MANAGED_ISSUE_BRANCH_INVALID");
    run("git", ["push", "--set-upstream", "origin", branch], job.projectRoot);
    await this.waitWorkflow("CI", job.commit.hash, ["Lint, Typecheck, Build", "Release Smoke"]);
    run("git", ["fetch", "origin", "main"], job.projectRoot);
    const ancestor = spawnSync("git", ["-C", job.projectRoot, "merge-base", "--is-ancestor", "origin/main", "HEAD"]);
    if (ancestor.status !== 0) throw new Error("MAIN_ADVANCED_REBASE_REQUIRED");
    run("git", ["push", "origin", "HEAD:main"], job.projectRoot);
    await this.waitWorkflow("Deploy Production", job.commit.hash, ["Verify production release", "Deploy to production host"]);
    const response = await fetch(this.productionUrl, { signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`PRODUCTION_SMOKE_FAILED:${response.status}`);
    const released = await this.adapter.writeBack(job, { releaseEvidence: { status: "PASS", workflow: "Deploy Production", commit: job.commit.hash, production_url: this.productionUrl } });
    job.commit.pushed = true; job.managedIssue.resultWrittenAt = new Date().toISOString(); job.release = { status: "RELEASED", mergeCommit: job.commit.hash, at: new Date().toISOString() };
    await this.jobs.event(job, "MANAGED_ISSUE_RELEASED", job.release);
    return released;
  }

  async api(path) {
    const response = await fetch(`https://api.github.com/repos/${this.repository}${path}`, { headers: { accept: "application/vnd.github+json", "user-agent": "anksen-smart-park-runner" }, signal: AbortSignal.timeout(15000) });
    if (!response.ok) throw new Error(`GITHUB_API_FAILED:${response.status}`);
    return response.json();
  }

  async waitWorkflow(name, sha, requiredJobs = []) {
    const deadline = Date.now() + this.maxWaitMs;
    while (Date.now() < deadline) {
      const payload = await this.api(`/actions/runs?head_sha=${encodeURIComponent(sha)}&per_page=30`);
      const workflow = payload.workflow_runs.find(item => item.name === name);
      if (workflow?.status === "completed") {
        if (workflow.conclusion !== "success") throw new Error(`${name === "CI" ? "CI" : "DEPLOY"}_FAILED:${workflow.conclusion}`);
        if (requiredJobs.length) {
          const detail = await this.api(`/actions/runs/${workflow.id}/jobs?per_page=100`);
          for (const required of requiredJobs) {
            const job = detail.jobs.find(item => item.name === required);
            if (!job || job.conclusion !== "success") throw new Error(`REQUIRED_JOB_FAILED:${required}:${job?.conclusion || "missing"}`);
          }
        }
        return workflow;
      }
      await sleep(this.pollMs);
    }
    throw new Error(`${name === "CI" ? "CI" : "DEPLOY"}_TIMEOUT`);
  }
}
