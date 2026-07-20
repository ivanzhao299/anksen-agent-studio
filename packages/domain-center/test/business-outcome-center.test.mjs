import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { BusinessOutcomeCenter } from "../lib/business-outcome-center.mjs";
import { renderConsolePage } from "../../../apps/console/web/render.mjs";

async function fixture(now = new Date("2026-07-20T08:00:00.000Z")) {
  const repoRoot = await mkdtemp(join(tmpdir(), "studio-outcomes-"));
  let current = now;
  return { center: new BusinessOutcomeCenter({ repoRoot, clock: () => current }), advance(minutes) { current = new Date(current.getTime() + minutes * 60000); } };
}

test("defines separate source contracts for all eight business applications", async () => {
  const { center } = await fixture();
  const catalog = center.catalog();
  assert.equal(catalog.length, 8);
  assert.equal(catalog.every((item) => item.metrics.length === 3), true);
  assert.equal((await center.dashboard()).applications.every((item) => item.status === "AWAITING_CONNECTOR"), true);
});

test("connector stores credential references only and non-manual sources require one", async () => {
  const { center } = await fixture();
  await assert.rejects(() => center.registerConnector({ applicationId: "finance-platform", sourceType: "API_SNAPSHOT" }), /CREDENTIAL_REFERENCE_REQUIRED/);
  const connector = await center.registerConnector({ id: "finance-read-model", applicationId: "finance-platform", sourceType: "API_SNAPSHOT", sourceLabel: "Finance close API", credentialReferenceId: "vault-ref-finance-read", freshnessMinutes: 60 }, { userId: "owner" });
  assert.equal(connector.credentialReferenceId, "vault-ref-finance-read");
  assert.equal(JSON.stringify(connector).includes("password"), false);
});

test("ingestion is idempotent and produces a verified source-backed result", async () => {
  const { center } = await fixture();
  const connector = await center.registerConnector({ id: "park-manual", applicationId: "smart-park-platform", sourceType: "MANUAL_ATTESTED", sourceLabel: "Park signed report", freshnessMinutes: 60 });
  const input = { connectorId: connector.id, idempotencyKey: "park-2026-07-20", evidenceRef: "report://park/2026-07-20", observedAt: "2026-07-20T07:50:00.000Z", values: [{ metricId: "occupancy_rate", value: 88.5 }, { metricId: "collection_rate", value: 96 }, { metricId: "open_safety_findings", value: 3 }] };
  const first = await center.ingest(input, { userId: "operator" });
  const second = await center.ingest(input, { userId: "operator" });
  assert.equal(first.duplicate, false);
  assert.equal(second.duplicate, true);
  const park = (await center.dashboard()).applications.find((item) => item.applicationId === "smart-park-platform");
  assert.equal(park.status, "VERIFIED");
  assert.equal(park.latest.quality.coverage, 1);
  assert.equal(park.latest.values[0].name, "园区出租率");
});

test("quality rules reject invalid values and secret-like evidence", async () => {
  const { center } = await fixture();
  const connector = await center.registerConnector({ id: "growth-manual", applicationId: "ai-growth-sales-platform", sourceType: "MANUAL_ATTESTED", sourceLabel: "Growth report" });
  await assert.rejects(() => center.ingest({ connectorId: connector.id, idempotencyKey: "bad-percent", evidenceRef: "report://growth/1", observedAt: "2026-07-20T07:50:00.000Z", values: [{ metricId: "lead_to_order_rate", value: 101 }] }), /OUTCOME_PERCENT_RANGE/);
  await assert.rejects(() => center.ingest({ connectorId: connector.id, idempotencyKey: "secret", evidenceRef: "api_key=plaintext", observedAt: "2026-07-20T07:50:00.000Z", values: [{ metricId: "qualified_leads", value: 1 }] }), /OUTCOME_EVIDENCE_SECRET_RISK/);
});

test("partial data is warned and becomes stale using connector freshness", async () => {
  const context = await fixture();
  const connector = await context.center.registerConnector({ id: "strategy-report", applicationId: "enterprise-strategy-platform", sourceType: "MANUAL_ATTESTED", sourceLabel: "Strategy review", freshnessMinutes: 30 });
  await context.center.ingest({ connectorId: connector.id, idempotencyKey: "strategy-1", evidenceRef: "report://strategy/review-1", observedAt: "2026-07-20T07:50:00.000Z", values: [{ metricId: "objective_completion_rate", value: 72 }] });
  let result = (await context.center.dashboard()).applications.find((item) => item.applicationId === "enterprise-strategy-platform");
  assert.equal(result.status, "QUALITY_WARNING");
  assert.ok(result.latest.quality.warnings.includes("PARTIAL_METRIC_COVERAGE"));
  context.advance(60);
  result = (await context.center.dashboard()).applications.find((item) => item.applicationId === "enterprise-strategy-platform");
  assert.equal(result.status, "STALE");
});

test("Console exposes source-backed outcomes without fabricating values", async () => {
  const html = await renderConsolePage("/outcomes", { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] });
  const server = await readFile(new URL("../../../apps/console/web/server.mjs", import.meta.url), "utf8");
  assert.match(html, /经营结果中心/);
  assert.match(html, /Credential Reference/);
  assert.match(html, /\/api\/outcomes\/dashboard/);
  assert.match(server, /businessOutcomeCenter\.dashboard/);
  assert.match(server, /outcome-snapshot-ingest/);
});
