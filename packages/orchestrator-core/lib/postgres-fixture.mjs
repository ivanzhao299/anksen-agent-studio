import pg from "pg";
import { existsSync, mkdirSync } from "node:fs";
import { spawnSync } from "node:child_process";
import { resolve } from "node:path";

const { Pool } = pg;
const repoRoot = resolve(new URL("../../..", import.meta.url).pathname);
const localFixtureRoot = resolve(repoRoot, "runtime/postgres-fixture");
const localDataDir = resolve(localFixtureRoot, "data");
const localLogPath = resolve(localFixtureRoot, "postgres.log");

export const fixture = {
  container: "anksen-night-shift-pg-test",
  database: "anksen_night_shift_test",
  port: 55439,
  url: "postgresql://postgres:postgres@127.0.0.1:55439/anksen_night_shift_test",
};

export function assertTestDatabaseUrl(value) {
  if (!value) throw new Error("TEST_DATABASE_URL_REQUIRED");
  const url = new URL(value);
  if (!["127.0.0.1", "localhost"].includes(url.hostname) || !/(test|fixture)/i.test(url.pathname)) {
    throw new Error("UNSAFE_TEST_DATABASE_URL");
  }
  return value;
}

function available(command) {
  return spawnSync(command, ["--version"], { encoding: "utf8" }).status === 0;
}

function dockerFixture() {
  if (!available("docker")) return false;
  let state = spawnSync("docker", ["inspect", "-f", "{{.State.Running}}", fixture.container], { encoding: "utf8" });
  if (state.status !== 0) {
    state = spawnSync("docker", ["run", "-d", "--name", fixture.container, "-e", "POSTGRES_PASSWORD=postgres", "-e", `POSTGRES_DB=${fixture.database}`, "-p", `127.0.0.1:${fixture.port}:5432`, "postgres:16-alpine"], { encoding: "utf8" });
  } else if (state.stdout.trim() !== "true") {
    state = spawnSync("docker", ["start", fixture.container], { encoding: "utf8" });
  }
  if (state.status !== 0) throw new Error(`DOCKER_FIXTURE_FAILED:${state.stderr}`);
  return true;
}

function localFixture() {
  if (!available("initdb") || !available("pg_ctl") || !available("createdb")) {
    throw new Error("POSTGRES_FIXTURE_UNAVAILABLE: install Docker or local PostgreSQL tools");
  }
  mkdirSync(localFixtureRoot, { recursive: true });
  if (!existsSync(resolve(localDataDir, "PG_VERSION"))) {
    const initialized = spawnSync("initdb", ["-D", localDataDir, "-U", "postgres", "-A", "trust", "--no-locale", "--encoding=UTF8"], { encoding: "utf8" });
    if (initialized.status !== 0) throw new Error(`LOCAL_POSTGRES_INIT_FAILED:${initialized.stderr}`);
  }
  const status = spawnSync("pg_ctl", ["-D", localDataDir, "status"], { encoding: "utf8" });
  if (status.status !== 0) {
    const started = spawnSync("pg_ctl", ["-D", localDataDir, "-l", localLogPath, "-o", `-h 127.0.0.1 -p ${fixture.port}`, "-w", "start"], { encoding: "utf8" });
    if (started.status !== 0) throw new Error(`LOCAL_POSTGRES_START_FAILED:${started.stderr}`);
  }
  const created = spawnSync("createdb", ["-h", "127.0.0.1", "-p", String(fixture.port), "-U", "postgres", fixture.database], { encoding: "utf8" });
  if (created.status !== 0 && !/already exists/i.test(created.stderr)) throw new Error(`LOCAL_POSTGRES_DATABASE_FAILED:${created.stderr}`);
}

export async function ensurePostgresFixture() {
  if (!dockerFixture()) localFixture();
  process.env.TEST_DATABASE_URL = fixture.url;
  for (let index = 0; index < 60; index += 1) {
    const pool = new Pool({ connectionString: fixture.url, max: 1 });
    try {
      await pool.query("SELECT 1");
      await pool.end();
      return fixture.url;
    } catch {
      await pool.end().catch(() => {});
      await new Promise(resolvePromise => setTimeout(resolvePromise, 250));
    }
  }
  throw new Error("POSTGRES_FIXTURE_TIMEOUT");
}

export function createTestPool(url = process.env.TEST_DATABASE_URL) {
  return new Pool({ connectionString: assertTestDatabaseUrl(url), max: 10 });
}
