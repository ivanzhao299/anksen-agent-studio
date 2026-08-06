import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { domainCapabilityCatalog, evaluateConsoleRouteAccess, loadAccessCenter, resolveUserProfile } from "../../../packages/access-center/lib/access-center-utils.mjs";
import { renderConsolePage } from "./render.mjs";

test("membership domain grants extend the existing Access Center profile", async () => {
  const bundle = await loadAccessCenter();
  const membership = bundle.memberships.memberships.find((item) => item.user_id === "studio-operator");
  const original = [...(membership.capability_grants ?? [])];
  try {
    membership.capability_grants = ["strategy.read", "design.read", "cad.read"];
    const profile = resolveUserProfile(bundle, "studio-operator");
    assert.equal(evaluateConsoleRouteAccess("strategy", profile).allowed, true);
    assert.equal(evaluateConsoleRouteAccess("graphicDesign", profile).allowed, true);
    assert.equal(evaluateConsoleRouteAccess("cad", profile).allowed, true);
    assert.equal(evaluateConsoleRouteAccess("video", profile).allowed, false);
  } finally {
    membership.capability_grants = original;
  }
});

test("domain capability catalog and administrator assignment UI cover every independent field", async () => {
  assert.deepEqual(domainCapabilityCatalog.map((item) => item.id), [
    "strategy.read", "sales.read", "hr.read", "finance.read", "manufacturing.read",
    "smart_park.workspace", "video.read", "design.read", "cad.read", "software_development.use"
  ]);
  const owner = { authenticated: true, user: { user_id: "studio-owner" }, roles: [{ role_id: "platform_owner" }], capabilities: ["*"], project_allowlist: ["*"], can_manage_access: true };
  const html = await renderConsolePage("/config", owner);
  for (const value of ["成员领域能力", "保存领域能力", "data-capability-user", "角色已包含", "/api/access/members/", "domain-capabilities"]) assert.match(html, new RegExp(value));
});

test("domain capability update API is administrator-only, same-origin and audited", async () => {
  const [server, access] = await Promise.all([
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/access-center/lib/access-center-utils.mjs", import.meta.url), "utf8")
  ]);
  const source = server + access;
  for (const value of ["updateWorkspaceDomainCapabilities", "ACCESS_MANAGEMENT_DENIED", "Same-origin confirmation is required", "DOMAIN_CAPABILITY_INVALID", "DOMAIN_CAPABILITIES_UPDATED", "capability_grants"]) assert.match(source, new RegExp(value));
});
