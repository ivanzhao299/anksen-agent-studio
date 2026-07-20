#!/usr/bin/env node
import { resolve } from "node:path";
import { createBusinessApplicationRuntime, importLegacyBusinessApplicationFile } from "../lib/business-database.mjs";

const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const runtime = await createBusinessApplicationRuntime({ repoRoot, requirePostgres: true });
try {
  const state = (await runtime.pool.query("SELECT to_regclass('business_application_record') records,to_regclass('business_work_item') work,to_regclass('business_application_event') events")).rows[0];
  if (!state.records || !state.work || !state.events) throw new Error("BUSINESS_DATABASE_MIGRATION_INCOMPLETE");
  const legacy = await importLegacyBusinessApplicationFile({ pool: runtime.pool, storePath: resolve(repoRoot, "runtime/business-applications/store.json") });
  console.log(JSON.stringify({ status: "READY", backend: runtime.backend, records: true, workItems: true, events: true, legacy }));
} finally {
  if (runtime.ownsPool) await runtime.pool.end();
}
