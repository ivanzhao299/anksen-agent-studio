import { createHash } from "node:crypto";
import { readdir, readFile, stat } from "node:fs/promises";
import { join, relative, resolve } from "node:path";

const domainChecks = Object.freeze([
  { id: "platform-governance", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/orgs/orgs.controller.ts", "apps/api/src/modules/users/users.controller.ts", "apps/api/src/modules/roles/roles.controller.ts", "apps/api/src/modules/saas-modules/saas-modules.controller.ts", "apps/api/src/modules/audit/audit.controller.ts", "apps/web/app/system/orgs/page.tsx"] },
  { id: "strategy-execution", status: "MISSING", absent: ["apps/api/src/modules/strategy", "apps/web/app/strategy"] },
  { id: "human-resources", status: "FOUNDATION_ONLY", required: ["apps/api/src/modules/orgs/entities/org.entity.ts", "apps/api/src/modules/orgs/entities/post.entity.ts", "apps/api/src/modules/users/entities/user.entity.ts"], absent: ["apps/api/src/modules/human-resources", "apps/web/app/hr"] },
  { id: "finance-management", status: "PARTIAL", required: ["apps/api/src/modules/leasing-receivables/leasing-receivables.controller.ts", "apps/api/src/modules/leasing-payments/leasing-payments.controller.ts", "apps/api/src/modules/leasing-invoices/leasing-invoices.controller.ts", "apps/web/app/finance/receivables/page.tsx"], absent: ["apps/api/src/modules/general-ledger", "apps/api/src/modules/budgets", "apps/api/src/modules/accounts-payable"] },
  { id: "asset-space", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/assets/assets.controller.ts", "apps/api/src/modules/assets/entities/asset-unit.entity.ts", "apps/web/app/assets/units/page.tsx", "scripts/e2e/s2b-smoke.mjs"] },
  { id: "investment-leasing", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/leasing-leads/leasing-leads.controller.ts", "apps/api/src/modules/leasing-contracts/leasing-contracts.controller.ts", "apps/api/src/modules/leasing-checkouts/leasing-checkouts.controller.ts", "apps/web/app/leasing/contracts/page.tsx", "scripts/e2e/s3c-contract-smoke.mjs"] },
  { id: "tenant-service-workflow", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/work-orders/work-orders.controller.ts", "apps/api/src/modules/workflow/workflow.controller.ts", "apps/web/app/tenant/service/page.tsx", "apps/web/app/workorders/list/page.tsx"] },
  { id: "safety-management", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/safety-hazards/safety-hazards.controller.ts", "apps/api/src/modules/safety-inspect-tasks/safety-inspect-tasks.controller.ts", "apps/api/src/modules/safety-emergency/safety-emergencies.controller.ts", "apps/api/src/modules/safety-work-permits/safety-work-permits.controller.ts", "scripts/e2e/s5a-safety-smoke.mjs"] },
  { id: "engineering-management", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/engineering/engineering-projects.controller.ts", "apps/api/src/modules/engineering/engineering-acceptances.controller.ts", "apps/api/src/modules/engineering/engineering-phase1.integration.spec.ts", "apps/web/app/engineering/projects/page.tsx"] },
  { id: "iot-platform", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/iot/iot-devices.controller.ts", "apps/api/src/modules/iot/iot-rules.controller.ts", "apps/api/src/modules/iot/iot-scenes.controller.ts", "scripts/e2e/s9a-iot-device-hub-smoke.mjs"] },
  { id: "energy-management", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/energy/energy-meters.controller.ts", "apps/api/src/modules/energy/energy-billing-items.controller.ts", "apps/api/src/modules/energy/energy-allocation-rules.controller.ts", "scripts/e2e/s9f-energy-billing-tenant-smoke.mjs"] },
  { id: "video-security", status: "IMPLEMENTED_BASELINE", required: ["apps/api/src/modules/video-cameras/video-cameras.controller.ts", "apps/api/src/modules/video-cameras/video-alerts.controller.ts", "apps/api/src/modules/video-cameras/video-evidences.controller.ts", "scripts/e2e/s8f-video-alert-dashboard-smoke.mjs"] },
  { id: "robot-operations", status: "PARTIAL", required: ["apps/api/src/modules/robots/robots.controller.ts", "apps/api/src/modules/robots/adapters/ezviz-cleaning-robot.adapter.ts", "apps/web/app/robots/cleaning/page.tsx"], absent: ["scripts/e2e/robot-operations-smoke.mjs"] },
  { id: "digital-twin", status: "PROTOTYPE", required: ["apps/web/app/bim/overview/page.tsx"], absent: ["apps/api/src/modules/bim"] },
  { id: "ai-operations", status: "PROTOTYPE", required: ["apps/web/app/ai/assistant/page.tsx", "apps/api/src/modules/ai-work-plans/ai-work-plans.controller.ts"], absent: ["apps/api/src/modules/ai-assistant"] },
  { id: "executive-cockpit", status: "PROTOTYPE", required: ["apps/web/app/cockpit/overview/page.tsx"], absent: ["apps/api/src/modules/cockpit"] }
]);

async function exists(path) {
  try { await stat(path); return true; } catch { return false; }
}

async function walk(directory) {
  const entries = await readdir(directory, { withFileTypes: true });
  const values = [];
  for (const entry of entries) {
    if (["node_modules", ".git", ".next", "dist"].includes(entry.name)) continue;
    const path = join(directory, entry.name);
    if (entry.isDirectory()) values.push(...await walk(path));
    else values.push(path);
  }
  return values;
}

export async function auditSmartPark(rootInput) {
  const root = resolve(rootInput);
  const packagePath = join(root, "package.json");
  if (!await exists(packagePath)) throw Object.assign(new Error("SMART_PARK_ROOT_INVALID"), { code: "SMART_PARK_ROOT_INVALID" });
  const packageJson = JSON.parse(await readFile(packagePath, "utf8"));
  if (packageJson.name !== "jinhu-smart-park") throw Object.assign(new Error("SMART_PARK_REPOSITORY_MISMATCH"), { code: "SMART_PARK_REPOSITORY_MISMATCH" });
  const files = await walk(root);
  const relativeFiles = files.map((path) => relative(root, path)).sort();
  const domains = [];
  for (const check of domainChecks) {
    const required = await Promise.all((check.required ?? []).map(async (path) => ({ path, exists: await exists(join(root, path)) })));
    const absent = await Promise.all((check.absent ?? []).map(async (path) => ({ path, absent: !await exists(join(root, path)) })));
    domains.push({ id: check.id, status: check.status, evidenceComplete: required.every((item) => item.exists) && absent.every((item) => item.absent), required, absent });
  }
  const count = (predicate) => relativeFiles.filter(predicate).length;
  return {
    schemaVersion: 1,
    repository: packageJson.name,
    root,
    generatedAt: new Date().toISOString(),
    sourceFingerprint: createHash("sha256").update(relativeFiles.join("\n")).digest("hex"),
    counts: {
      apiModuleDirectories: (await readdir(join(root, "apps/api/src/modules"), { withFileTypes: true })).filter((entry) => entry.isDirectory()).length,
      apiControllers: count((path) => path.startsWith("apps/api/src/modules/") && path.endsWith(".controller.ts")),
      entities: count((path) => path.includes("/entities/") && path.endsWith(".entity.ts")),
      webPages: count((path) => path.startsWith("apps/web/app/") && path.endsWith("/page.tsx")),
      smokeTests: count((path) => path.startsWith("scripts/e2e/") && path.includes("smoke") && path.endsWith(".mjs"))
    },
    domains,
    summary: Object.fromEntries(["IMPLEMENTED_BASELINE", "PARTIAL", "PROTOTYPE", "FOUNDATION_ONLY", "MISSING"].map((status) => [status, domains.filter((domain) => domain.status === status).length])),
    allConfiguredEvidenceMatched: domains.every((domain) => domain.evidenceComplete)
  };
}

export { domainChecks as smartParkDomainChecks };
