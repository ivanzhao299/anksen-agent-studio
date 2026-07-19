import assert from "node:assert/strict";
import { mkdtemp, readFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import test from "node:test";
import { IdentityOwnerBootstrap, parseIdentityEnvironment, validateOwnerPassword } from "../../../apps/console/web/identity-owner-bootstrap.mjs";

test("identity owner password policy and environment parser reject unsafe input", () => {
  assert.deepEqual(parseIdentityEnvironment("KEYCLOAK_ADMIN_USERNAME=admin\nKEYCLOAK_ADMIN_PASSWORD=a=b\n"), {
    KEYCLOAK_ADMIN_USERNAME: "admin",
    KEYCLOAK_ADMIN_PASSWORD: "a=b",
  });
  assert.throws(() => parseIdentityEnvironment("bad-key=value"), /invalid key/);
  assert.throws(() => validateOwnerPassword("short"), /16/);
  assert.equal(validateOwnerPassword("Strong-Owner-2026!"), "Strong-Owner-2026!");
  assert.throws(() => new IdentityOwnerBootstrap({ upstreamOrigin: "https://identity.example" }), /loopback/);
});

test("identity owner bootstrap resets exactly one user without persisting the password", async () => {
  const directory = await mkdtemp(join(tmpdir(), "anksen-identity-owner-"));
  const envPath = join(directory, ".env");
  const markerPath = join(directory, "marker.json");
  await import("node:fs/promises").then(({ writeFile }) => writeFile(envPath, [
    "KEYCLOAK_ADMIN_USERNAME=bootstrap-admin",
    "KEYCLOAK_ADMIN_PASSWORD=admin-secret",
    "STUDIO_IDENTITY_BOOTSTRAP_USERNAME=studio-admin",
    "",
  ].join("\n"), { mode: 0o600 }));
  const calls = [];
  const fetchImpl = async (url, options = {}) => {
    calls.push({ url, options });
    if (String(url).endsWith("/token")) return new Response(JSON.stringify({ access_token: "admin-token" }), { status: 200 });
    if (String(url).includes("/users?")) return new Response(JSON.stringify([{ id: "user-1", username: "studio-admin" }]), { status: 200 });
    if (String(url).endsWith("/reset-password")) return new Response(null, { status: 204 });
    return new Response(null, { status: 404 });
  };
  const bootstrap = new IdentityOwnerBootstrap({ upstreamOrigin: "http://127.0.0.1:4320", envPath, markerPath, fetchImpl });
  assert.equal((await bootstrap.status()).status, "PENDING");
  const result = await bootstrap.initialize({ password: "Strong-Owner-2026!", actor: { user_id: "platform-owner" } });
  assert.equal(result.status, "INITIALIZED");
  const reset = calls.find((call) => String(call.url).endsWith("/reset-password"));
  assert.deepEqual(JSON.parse(reset.options.body), { type: "password", value: "Strong-Owner-2026!", temporary: false });
  const marker = await readFile(markerPath, "utf8");
  assert.doesNotMatch(marker, /Strong-Owner/);
  assert.match(marker, /platform-owner/);
  assert.equal((await bootstrap.status()).status, "INITIALIZED");
  await assert.rejects(() => bootstrap.initialize({ password: "Another-Owner-2026!" }), /已经完成初始化/);
});
