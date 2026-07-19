import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import { isPublicIdentityPath, normalizeIdentityRuntimeConfig } from "../../../apps/console/web/identity-service.mjs";

test("identity runtime config requires one HTTPS Studio origin and the canonical MCP resource", () => {
  const config = normalizeIdentityRuntimeConfig({
    authMode: "oauth",
    publicUrl: "https://studio.cnjinhu.com/mcp",
    issuer: "https://studio.cnjinhu.com/auth/realms/anksen",
    jwksUri: "https://studio.cnjinhu.com/auth/realms/anksen/protocol/openid-connect/certs",
    metadataUri: "https://studio.cnjinhu.com/auth/realms/anksen/.well-known/openid-configuration",
  });
  assert.equal(config.upstreamOrigin, "http://127.0.0.1:4320");
  assert.equal(config.metadataProbeUri, config.metadataUri);
  assert.equal(config.jwksFetchUri, config.jwksUri);
  assert.throws(() => normalizeIdentityRuntimeConfig({ ...config, publicUrl: "https://other.example/mcp" }), /one public origin/);
  assert.throws(() => normalizeIdentityRuntimeConfig({ ...config, publicUrl: "https://studio.cnjinhu.com" }), /must use \/mcp/);
  assert.throws(() => normalizeIdentityRuntimeConfig({ ...config, metadataProbeUri: "http://identity.internal/metadata" }), /loopback HTTP/);
  assert.throws(() => normalizeIdentityRuntimeConfig({ ...config, jwksFetchUri: "http://identity.internal/jwks" }), /loopback HTTP/);
});

test("identity reverse proxy exposes only the anksen realm and login assets", () => {
  for (const path of [
    "/auth/realms/anksen/.well-known/openid-configuration",
    "/auth/realms/anksen/protocol/openid-connect/auth",
    "/auth/realms/anksen/login-actions/authenticate",
    "/auth/resources/abc/login/keycloak/css/login.css",
  ]) assert.equal(isPublicIdentityPath(path), true, path);
  for (const path of [
    "/auth/admin/",
    "/auth/realms/master/protocol/openid-connect/auth",
    "/auth/health/ready",
    "/auth/metrics",
    "/auth/realms/another",
    "/auth/realms/anksen-evil/.well-known/openid-configuration",
  ]) assert.equal(isPublicIdentityPath(path), false, path);
});

test("production identity manifests pin Keycloak, bind loopback, and retain MCP audience claims", async () => {
  const compose = await readFile(new URL("../../../infrastructure/identity/docker-compose.yml", import.meta.url), "utf8");
  const realm = JSON.parse(await readFile(new URL("../../../infrastructure/identity/realm/anksen-realm.json", import.meta.url), "utf8"));
  const profiles = JSON.parse(await readFile(new URL("../../../infrastructure/identity/client-policies/cimd-profiles.json", import.meta.url), "utf8"));
  assert.match(compose, /quay\.io\/keycloak\/keycloak:26\.6\.4/);
  assert.match(compose, /127\.0\.0\.1:4320:8080/);
  assert.equal(realm.realm, "anksen");
  assert.equal(realm.registrationAllowed, false);
  assert.equal(realm.bruteForceProtected, true);
  const identityScope = realm.clientScopes.find((scope) => scope.name === "studio-identity");
  const audience = identityScope.protocolMappers.find((mapper) => mapper.protocolMapper === "oidc-audience-mapper");
  assert.equal(audience.config["included.custom.audience"], "https://studio.cnjinhu.com/mcp");
  assert.deepEqual(profiles.profiles[0].executors[0].configuration["cimd-allow-permitted-domains"], ["*.chatgpt.com", "*.openai.com"]);
});
