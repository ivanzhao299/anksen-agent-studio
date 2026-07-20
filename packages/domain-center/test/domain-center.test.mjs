import test from "node:test";
import assert from "node:assert/strict";
import { domainCenterSummary, getStudioDomain, routeStudioDomain, studioDomains } from "../lib/domain-center.mjs";
import { renderConsolePage } from "../../../apps/console/web/render.mjs";
import { consoleWebRoutes } from "../../../apps/console/web/routes.mjs";

test("catalog exposes ten unique packs over one control plane without claiming all are implemented", () => {
  assert.equal(studioDomains.length,10);
  assert.equal(new Set(studioDomains.map(item=>item.id)).size,10);
  assert.deepEqual(domainCenterSummary(),{...domainCenterSummary(),schemaVersion:1,total:10,active:1,foundation:7,planned:2,singleControlPlane:true});
  assert.equal(getStudioDomain("software-engineering").maturity,"ACTIVE");
});

test("explicit selection wins and unknown explicit domains fail closed", () => {
  assert.equal(routeStudioDomain("生成报告",{explicitDomainId:"quality-security"}).domainId,"quality-security");
  assert.throws(()=>routeStudioDomain("goal",{explicitDomainId:"unknown"}),error=>error.code==="DOMAIN_NOT_FOUND");
});

test("goal routing is deterministic and reports uncertainty", () => {
  assert.equal(routeStudioDomain("开发 iOS Swift 移动端应用").domainId,"mobile-engineering");
  assert.equal(routeStudioDomain("分析 ERP 指标并生成 BI 报表").domainId,"data-analytics");
  assert.equal(routeStudioDomain("整理一个目标").source,"FALLBACK");
});

test("one Console exposes the Domain Center and all ten packs", async () => {
  assert.ok(consoleWebRoutes.some(route=>route.id==="domains"&&route.path==="/domains"));
  const html=await renderConsolePage("/domains",{authenticated:true,capabilities:["*"],project_allowlist:["*"]});
  assert.match(html,/一个 Studio，覆盖多个专业领域/);
  assert.equal((html.match(/class="domain-card"/g)??[]).length,10);
  assert.match(html,/software-engineering/);
  assert.match(html,/基础能力已具备/);
});
