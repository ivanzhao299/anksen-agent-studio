import { createHash, randomUUID } from "node:crypto";
import { existsSync } from "node:fs";
import { mkdir, readFile, readdir, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { getStudioApplication } from "./domain-center.mjs";

const metric = (id, name, unit, direction = "HIGHER_IS_BETTER") => Object.freeze({ id, name, unit, direction });

export const businessOutcomeContracts = Object.freeze({
  "software-factory": [metric("delivery_success_rate", "交付成功率", "PERCENT"), metric("lead_time_days", "交付周期", "DAYS", "LOWER_IS_BETTER"), metric("escaped_defects", "生产逃逸缺陷", "COUNT", "LOWER_IS_BETTER")],
  "video-factory": [metric("assets_completed", "完成内容资产", "COUNT"), metric("approval_pass_rate", "内容审核通过率", "PERCENT"), metric("publish_ready_count", "可发布内容", "COUNT")],
  "enterprise-strategy-platform": [metric("objective_completion_rate", "战略目标完成率", "PERCENT"), metric("kpi_on_track_rate", "KPI 正常率", "PERCENT"), metric("overdue_initiatives", "逾期重点任务", "COUNT", "LOWER_IS_BETTER")],
  "human-resources-platform": [metric("active_headcount", "在岗人数", "COUNT", "NEUTRAL"), metric("critical_role_fill_rate", "关键岗位到岗率", "PERCENT"), metric("regrettable_attrition_rate", "关键人才流失率", "PERCENT", "LOWER_IS_BETTER")],
  "finance-platform": [metric("budget_variance_rate", "预算偏差率", "PERCENT", "LOWER_IS_BETTER"), metric("cash_balance", "可用资金", "CURRENCY", "NEUTRAL"), metric("overdue_receivables", "逾期应收", "CURRENCY", "LOWER_IS_BETTER")],
  "ai-growth-sales-platform": [metric("qualified_leads", "有效线索", "COUNT"), metric("lead_to_order_rate", "线索成交率", "PERCENT"), metric("attributed_revenue", "归因收入", "CURRENCY")],
  "intelligent-manufacturing-erp": [metric("plan_attainment", "生产计划达成率", "PERCENT"), metric("first_pass_yield", "一次合格率", "PERCENT"), metric("inventory_turnover", "库存周转率", "RATIO")],
  "smart-park-platform": [metric("occupancy_rate", "园区出租率", "PERCENT"), metric("collection_rate", "应收回款率", "PERCENT"), metric("open_safety_findings", "未闭环安全隐患", "COUNT", "LOWER_IS_BETTER")]
});

const safeId = (value) => String(value ?? "").replace(/[^a-z0-9._-]+/gi, "-").replace(/^-+|-+$/g, "").slice(0, 80);
const hash = (value) => createHash("sha256").update(value).digest("hex");

export class BusinessOutcomeCenter {
  constructor({ repoRoot, clock = () => new Date(), storeDir = resolve(repoRoot, "runtime/business-outcomes") } = {}) {
    this.repoRoot = resolve(repoRoot);
    this.clock = clock;
    this.storeDir = storeDir;
    this.connectorDir = join(storeDir, "connectors");
    this.snapshotDir = join(storeDir, "snapshots");
    this.eventDir = join(storeDir, "events");
  }
  connectorPath(id) { return join(this.connectorDir, `${safeId(id)}.json`); }
  snapshotPath(id) { return join(this.snapshotDir, `${safeId(id)}.json`); }
  eventPath(id) { return join(this.eventDir, `${safeId(id)}.json`); }
  async save(path, value) { await mkdir(resolve(path, ".."), { recursive: true }); await writeFile(path, `${JSON.stringify(value, null, 2)}\n`, "utf8"); return value; }
  async readAll(dir) { if (!existsSync(dir)) return []; const files = (await readdir(dir)).filter((name) => name.endsWith(".json")); return Promise.all(files.map((name) => readFile(join(dir, name), "utf8").then(JSON.parse))); }
  catalog() {
    return Object.entries(businessOutcomeContracts).map(([applicationId, metrics]) => {
      const application = getStudioApplication(applicationId);
      return { applicationId, applicationName: application.name, metrics };
    });
  }
  async registerConnector(input, actor = {}) {
    const applicationId = String(input.applicationId ?? "");
    if (!businessOutcomeContracts[applicationId]) throw Object.assign(new Error("OUTCOME_APPLICATION_INVALID"), { code: "OUTCOME_APPLICATION_INVALID" });
    const sourceType = String(input.sourceType ?? "");
    if (!["MANUAL_ATTESTED", "API_SNAPSHOT", "SQL_READ_MODEL", "WEBHOOK"].includes(sourceType)) throw Object.assign(new Error("OUTCOME_SOURCE_TYPE_INVALID"), { code: "OUTCOME_SOURCE_TYPE_INVALID" });
    const credentialReferenceId = String(input.credentialReferenceId ?? "").trim() || null;
    if (sourceType !== "MANUAL_ATTESTED" && !credentialReferenceId) throw Object.assign(new Error("CREDENTIAL_REFERENCE_REQUIRED"), { code: "CREDENTIAL_REFERENCE_REQUIRED" });
    const id = safeId(input.id || `outcome-${applicationId}-${randomUUID().slice(0, 8)}`);
    if (!id) throw Object.assign(new Error("OUTCOME_CONNECTOR_ID_INVALID"), { code: "OUTCOME_CONNECTOR_ID_INVALID" });
    const freshnessMinutes = Number(input.freshnessMinutes ?? 1440);
    if (!Number.isInteger(freshnessMinutes) || freshnessMinutes < 1 || freshnessMinutes > 525600) throw Object.assign(new Error("OUTCOME_FRESHNESS_INVALID"), { code: "OUTCOME_FRESHNESS_INVALID" });
    const connector = { schemaVersion: 1, id, applicationId, sourceType, sourceLabel: String(input.sourceLabel ?? sourceType).trim(), credentialReferenceId, freshnessMinutes, status: "ACTIVE", createdBy: actor.userId ?? "unknown", createdAt: this.clock().toISOString(), updatedAt: this.clock().toISOString() };
    if (existsSync(this.connectorPath(id))) throw Object.assign(new Error("OUTCOME_CONNECTOR_EXISTS"), { code: "OUTCOME_CONNECTOR_EXISTS" });
    return this.save(this.connectorPath(id), connector);
  }
  async connectors() { return (await this.readAll(this.connectorDir)).sort((a, b) => a.applicationId.localeCompare(b.applicationId)); }
  async getConnector(id) { return existsSync(this.connectorPath(id)) ? JSON.parse(await readFile(this.connectorPath(id), "utf8")) : null; }
  validateValues(connector, values) {
    const contracts = businessOutcomeContracts[connector.applicationId];
    if (!Array.isArray(values) || values.length === 0) throw Object.assign(new Error("OUTCOME_VALUES_REQUIRED"), { code: "OUTCOME_VALUES_REQUIRED" });
    const seen = new Set();
    return values.map((item) => {
      const contract = contracts.find((candidate) => candidate.id === item.metricId);
      if (!contract || seen.has(item.metricId)) throw Object.assign(new Error(`OUTCOME_METRIC_INVALID:${item.metricId}`), { code: "OUTCOME_METRIC_INVALID" });
      seen.add(item.metricId);
      const value = Number(item.value);
      if (!Number.isFinite(value)) throw Object.assign(new Error(`OUTCOME_VALUE_INVALID:${item.metricId}`), { code: "OUTCOME_VALUE_INVALID" });
      if (contract.unit === "PERCENT" && (value < 0 || value > 100)) throw Object.assign(new Error(`OUTCOME_PERCENT_RANGE:${item.metricId}`), { code: "OUTCOME_PERCENT_RANGE" });
      if (["COUNT", "CURRENCY", "DAYS", "RATIO"].includes(contract.unit) && value < 0) throw Object.assign(new Error(`OUTCOME_NEGATIVE_VALUE:${item.metricId}`), { code: "OUTCOME_NEGATIVE_VALUE" });
      return { metricId: contract.id, name: contract.name, value, unit: contract.unit, direction: contract.direction };
    });
  }
  async ingest(input, actor = {}) {
    const connector = await this.getConnector(input.connectorId);
    if (!connector || connector.status !== "ACTIVE") throw Object.assign(new Error("OUTCOME_CONNECTOR_NOT_ACTIVE"), { code: "OUTCOME_CONNECTOR_NOT_ACTIVE" });
    const idempotencyKey = String(input.idempotencyKey ?? "").trim();
    const evidenceRef = String(input.evidenceRef ?? "").trim();
    if (!idempotencyKey || !evidenceRef) throw Object.assign(new Error("OUTCOME_EVIDENCE_REQUIRED"), { code: "OUTCOME_EVIDENCE_REQUIRED" });
    if (/token|password|secret|api[_-]?key/i.test(evidenceRef)) throw Object.assign(new Error("OUTCOME_EVIDENCE_SECRET_RISK"), { code: "OUTCOME_EVIDENCE_SECRET_RISK" });
    const snapshotId = `snapshot-${hash(`${connector.id}:${idempotencyKey}`).slice(0, 32)}`;
    if (existsSync(this.snapshotPath(snapshotId))) return { snapshot: JSON.parse(await readFile(this.snapshotPath(snapshotId), "utf8")), duplicate: true };
    const observedAt = new Date(input.observedAt);
    const now = this.clock();
    if (!Number.isFinite(observedAt.getTime()) || observedAt.getTime() > now.getTime() + 5 * 60000) throw Object.assign(new Error("OUTCOME_OBSERVED_AT_INVALID"), { code: "OUTCOME_OBSERVED_AT_INVALID" });
    const values = this.validateValues(connector, input.values);
    const expected = businessOutcomeContracts[connector.applicationId].length;
    const coverage = values.length / expected;
    const ageMinutes = Math.max(0, Math.round((now.getTime() - observedAt.getTime()) / 60000));
    const freshness = ageMinutes <= connector.freshnessMinutes ? "FRESH" : "STALE";
    const qualityStatus = coverage === 1 && freshness === "FRESH" ? "PASS" : "WARN";
    const snapshot = { schemaVersion: 1, id: snapshotId, connectorId: connector.id, applicationId: connector.applicationId, sourceType: connector.sourceType, sourceLabel: connector.sourceLabel, evidenceRef, observedAt: observedAt.toISOString(), ingestedAt: now.toISOString(), ingestedBy: actor.userId ?? "unknown", quality: { status: qualityStatus, coverage, freshness, ageMinutes, warnings: [...(coverage < 1 ? ["PARTIAL_METRIC_COVERAGE"] : []), ...(freshness === "STALE" ? ["SOURCE_DATA_STALE"] : [])] }, values };
    await this.save(this.snapshotPath(snapshotId), snapshot);
    await this.save(this.eventPath(`event-${randomUUID()}`), { eventType: "business.outcome.snapshot_ingested", aggregateId: snapshot.id, applicationId: snapshot.applicationId, connectorId: connector.id, evidenceRefHash: hash(evidenceRef), occurredAt: now.toISOString(), actorId: actor.userId ?? "unknown" });
    return { snapshot, duplicate: false };
  }
  async dashboard() {
    const connectors = await this.connectors();
    const snapshots = await this.readAll(this.snapshotDir);
    const now = this.clock();
    return { generatedAt: now.toISOString(), applications: this.catalog().map((contract) => {
      const applicationConnectors = connectors.filter((item) => item.applicationId === contract.applicationId && item.status === "ACTIVE");
      const latest = snapshots.filter((item) => item.applicationId === contract.applicationId).sort((a, b) => String(b.observedAt).localeCompare(String(a.observedAt)))[0] ?? null;
      if (!applicationConnectors.length) return { ...contract, status: "AWAITING_CONNECTOR", connectorCount: 0, latest: null };
      if (!latest) return { ...contract, status: "AWAITING_SOURCE", connectorCount: applicationConnectors.length, latest: null };
      const connector = applicationConnectors.find((item) => item.id === latest.connectorId);
      const ageMinutes = Math.max(0, Math.round((now.getTime() - new Date(latest.observedAt).getTime()) / 60000));
      const stale = !connector || ageMinutes > connector.freshnessMinutes;
      return { ...contract, status: stale ? "STALE" : latest.quality.status === "PASS" ? "VERIFIED" : "QUALITY_WARNING", connectorCount: applicationConnectors.length, latest: { ...latest, quality: { ...latest.quality, freshness: stale ? "STALE" : "FRESH", ageMinutes } } };
    }) };
  }
}
