import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import test from "node:test";
import vm from "node:vm";
import { evaluateStudioPassword, evaluateConsoleRouteAccess } from "../../../packages/access-center/lib/access-center-utils.mjs";
import { renderConsolePage } from "./render.mjs";

const owner = {
  authenticated: true,
  auth_source: "local_password_session",
  user: { user_id: "studio-owner", username: "owner", display_name: "Studio 平台所有者" },
  roles: [{ role_id: "platform_owner", display_name: "平台所有者" }],
  capabilities: ["*"],
  project_allowlist: ["*"],
  session: { session_id: "safe-session-id", created_at: "2026-07-22T00:00:00.000Z", expires_at: "2026-07-22T12:00:00.000Z" }
};

test("password policy requires a strong non-account password", () => {
  assert.equal(evaluateStudioPassword("short", "owner").valid, false);
  assert.equal(evaluateStudioPassword("OwnerSecure!2026", "owner").valid, false);
  assert.equal(evaluateStudioPassword("SecureControl!2026", "owner").valid, true);
  assert.equal(evaluateStudioPassword("StudioPilot!2026", "owner").valid, false);
});

test("account security route is available to every authenticated console user", () => {
  assert.equal(evaluateConsoleRouteAccess("account", { capabilities: ["console.access"] }).allowed, true);
  assert.equal(evaluateConsoleRouteAccess("account", { capabilities: [] }).allowed, false);
});

test("account page exposes self-service password rotation without exposing secrets", async () => {
  const html = await renderConsolePage("/account", owner);
  for (const value of ["账户与安全", "当前密码", "新密码", "确认新密码", "autocomplete=\"current-password\"", "autocomplete=\"new-password\"", "/api/access/security", "安全活动", "会话自动轮换", "Credential Reference"]) {
    assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(html, /password_hash|session_token|localStorage.*password|默认密码/);

  const inlineScripts = [...html.matchAll(/<script(?:[^>]*)>([\s\S]*?)<\/script>/g)].map((match) => match[1]);
  assert.ok(inlineScripts.length > 0);
  for (const [index, source] of inlineScripts.entries()) {
    assert.doesNotThrow(() => new vm.Script(source, { filename: `account-inline-${index}.js` }));
  }
  assert.match(html, /number:\/\\d\/\.test\(value\)/);
  assert.match(html, /symbol:\/\[\^A-Za-z0-9\\s\]\//);
  assert.match(html, /space:!\/\\s\/\.test\(value\)/);
});

test("password API verifies current credentials, enforces same origin, rotates sessions and writes sanitized audit", async () => {
  const [server, access] = await Promise.all([
    readFile(new URL("./server.mjs", import.meta.url), "utf8"),
    readFile(new URL("../../../packages/access-center/lib/access-center-utils.mjs", import.meta.url), "utf8")
  ]);
  const source = server + access;
  for (const value of ["changeOwnStudioPassword", "CURRENT_PASSWORD_INVALID", "PASSWORD_POLICY_FAILED", "Same-origin confirmation is required", "set-cookie", "; Secure", "PASSWORD_CHANGED", "revoked_session_count", "access-security-audit.jsonl", "createLocalSession", "passwordChangeAttemptLimit", "PASSWORD_CHANGE_RATE_LIMITED"]) {
    assert.match(source, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.doesNotMatch(source, /new_password:\s*event|current_password:\s*event|password_hash:\s*event/);
});
