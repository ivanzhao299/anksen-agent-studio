import test from "node:test";
import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import {
  createTestPool,
  ensurePostgresFixture,
} from "../../orchestrator-core/lib/postgres-fixture.mjs";
import { migrateGrowthPlatform } from "../lib/growth-database.mjs";

test("authoritative Growth audit streams reject database update and delete", async () => {
  await ensurePostgresFixture();
  const pool = createTestPool(),
    suffix = randomUUID(),
    eventId = `immutable-event-${suffix}`;
  try {
    await migrateGrowthPlatform(pool);
    const tables = [
        "growth_event",
        "growth_score_snapshot",
        "growth_delivery_event",
        "growth_identity_review_event",
        "growth_connector_binding_event",
      ],
      triggers = (
        await pool.query(
          "SELECT c.relname FROM pg_trigger t JOIN pg_class c ON c.oid=t.tgrelid WHERE NOT t.tgisinternal AND t.tgname=c.relname||'_immutable' AND c.relname=ANY($1::text[])",
          [tables],
        )
      ).rows.map((row) => row.relname);
    assert.deepEqual(new Set(triggers), new Set(tables));
    await pool.query(
      "INSERT INTO growth_event(event_id,organization_id,workspace_id,tenant_id,event_type,subject_id,source,idempotency_key,occurred_at) VALUES($1,$2,'growth','tenant','growth.signal.observed','subject','TEST',$3,now())",
      [eventId, `audit-${suffix}`, `immutable-${suffix}`],
    );
    await assert.rejects(
      () =>
        pool.query("UPDATE growth_event SET source='TAMPERED' WHERE event_id=$1", [
          eventId,
        ]),
      (error) => error.code === "55000",
    );
    await assert.rejects(
      () => pool.query("DELETE FROM growth_event WHERE event_id=$1", [eventId]),
      (error) => error.code === "55000",
    );
  } finally {
    await pool.end();
  }
});
