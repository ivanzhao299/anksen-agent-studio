import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { assertBusinessDatabaseUrl, resolveBusinessDatabaseUrl } from "../lib/business-database.mjs";

test("business database configuration is local, explicit and credential-backed", () => {
  const url = "postgresql://business:password@127.0.0.1:4330/anksen_studio_business";
  assert.equal(assertBusinessDatabaseUrl(url), url);
  assert.equal(resolveBusinessDatabaseUrl({ BUSINESS_DATABASE_URL: url }), url);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://business:password@db.example.com/prod"), /REMOTE_DENIED/);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://business:password@127.0.0.1/postgres"), /NAME_DENIED/);
  assert.throws(() => assertBusinessDatabaseUrl("postgresql://127.0.0.1/anksen_business"), /CREDENTIAL_REQUIRED/);
});

test("Office deployment provisions and verifies isolated business PostgreSQL before restart", async () => {
  const compose = await readFile(new URL("../../../infrastructure/business-data/docker-compose.yml", import.meta.url), "utf8");
  const deployData = await readFile(new URL("../../../scripts/deploy-business-data.sh", import.meta.url), "utf8");
  const deploy = await readFile(new URL("../../../scripts/deploy.sh", import.meta.url), "utf8");
  const server = await readFile(new URL("../../../apps/console/web/server.mjs", import.meta.url), "utf8");
  assert.match(compose, /127\.0\.0\.1:\$\{BUSINESS_DB_PORT:-54330\}:5432/);
  assert.match(compose, /business-db-data/);
  assert.match(deployData, /openssl rand -hex 32/);
  assert.match(deployData, /BUSINESS_DATABASE_REQUIRED=true/);
  assert.match(deployData, /already occupied by another service/);
  assert.match(deployData, /business-database-migrate\.mjs/);
  assert.match(deploy, /deploy-business-data\.sh/);
  assert.match(server, /createBusinessApplicationRuntime/);
  assert.match(server, /businessRuntime\.pool/);
});
