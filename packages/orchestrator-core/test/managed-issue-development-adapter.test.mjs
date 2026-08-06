import test from "node:test";
import assert from "node:assert/strict";
import { ManagedIssueDevelopmentAdapter } from "../lib/managed-issue-development-adapter.mjs";

test("approved Smart Park issues become governed Studio development jobs without a second queue", async () => {
  const requests = [];
  const job = { id: "dev-1", status: "PENDING_APPROVAL", artifacts: [], events: [], updatedAt: "2026-08-06T00:00:00Z" };
  const jobs = {
    create: async input => { job.input = input; return job; },
    event: async (value, type, payload) => { value.events.push({ type, ...payload }); return value; },
    approve: async () => { job.status = "QUEUED"; return job; },
    get: async () => job
  };
  const fetchImpl = async (url, init = {}) => {
    requests.push({ url, init });
    const data = url.includes("/runner/ready")
      ? [{ issueNo: "SP-1" }]
      : { issueNo: "SP-1", title: "提交失败", description: "详情页无法提交", route: "/workorders/1", acceptanceCriteria: "单元测试通过", approvedBy: "admin", leaseToken: "lease-1" };
    return { ok: true, json: async () => ({ data }) };
  };
  const adapter = new ManagedIssueDevelopmentAdapter({ apiBaseUrl: "https://smart.example/api", token: "ref-token", project: { projectId: "jinhu-smart-park", projectRoot: "/srv/jinhu-smart-park", allowedPaths: ["apps"], acceptanceCommands: ["pnpm test"] }, jobs, fetchImpl });
  const [created] = await adapter.syncReady();
  assert.equal(created.status, "QUEUED");
  assert.equal(job.input.projectId, "jinhu-smart-park");
  assert.deepEqual(job.input.acceptanceCriteria, ["单元测试通过"]);
  assert.equal(job.managedIssue.issueNo, "SP-1");
  assert.match(requests[1].init.headers.authorization, /^Bearer /);
});

test("result writeback cannot claim release without project release evidence", async () => {
  let body;
  const adapter = new ManagedIssueDevelopmentAdapter({
    apiBaseUrl: "https://smart.example/api", token: "token",
    project: { projectRoot: "/srv/project" }, jobs: {},
    fetchImpl: async (_url, init) => { body = JSON.parse(init.body); return { ok: true, json: async () => ({ data: body }) }; }
  });
  await adapter.writeBack({ id: "dev-1", updatedAt: "now", managedIssue: { issueNo: "SP-1", leaseToken: "lease" }, commit: { hash: "a".repeat(40) }, changedPaths: ["apps/api/a.ts"], validation: { status: "PASS" }, artifacts: [] });
  assert.equal(body.runner_status, "WAITING_REVIEW");
  assert.equal(body.release_evidence, undefined);
});

test("resident development worker wires the adapter without embedding a second scheduler", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../bin/autonomous-development-worker.mjs", import.meta.url), "utf8"));
  assert.match(source, /ManagedIssueDevelopmentAdapter/);
  assert.match(source, /managedIssueAdapter\.syncReady/);
  assert.match(source, /managedIssueAdapter\.writeBack/);
  assert.match(source, /ManagedIssueReleaseController/);
  assert.match(source, /SMART_PARK_AUTO_RELEASE/);
  assert.doesNotMatch(source, /class\s+(?:Planner|Scheduler|Worker|Queue)/);
});

test("release controller requires branch CI, fast-forward main and production workflow evidence", async () => {
  const source = await import("node:fs/promises").then(fs => fs.readFile(new URL("../lib/managed-issue-release-controller.mjs", import.meta.url), "utf8"));
  assert.match(source, /waitWorkflow\("CI"/);
  assert.match(source, /"Release Smoke"/);
  assert.match(source, /merge-base.*--is-ancestor/s);
  assert.match(source, /"HEAD:main"/);
  assert.match(source, /waitWorkflow\("Deploy Production"/);
  assert.match(source, /PRODUCTION_SMOKE_FAILED/);
  assert.doesNotMatch(source, /--force/);
});
