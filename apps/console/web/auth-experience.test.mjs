import test from "node:test";
import assert from "node:assert/strict";
import { renderConsolePage } from "./render.mjs";

test("login and registration use the theme-native workstation access experience", async () => {
  const auth = { authenticated: false };
  const login = await renderConsolePage("/login", auth);
  const register = await renderConsolePage("/register", auth);

  for (const html of [login, register]) {
    assert.match(html, /Enterprise AI Workstation/);
    assert.match(html, /从一句话，到可验证的成果。/);
    assert.match(html, /理解目标/);
    assert.match(html, /组织工作流/);
    assert.match(html, /调用 Agent/);
    assert.match(html, /验证交付/);
    assert.match(html, /body\.login-gated \{ color-scheme:light/);
    assert.match(html, /Auth gateway: theme-native credentials first/);
    assert.match(html, /auth-form input,html\[data-theme\] body\.login-gated \.auth-form select/);
    assert.match(html, /background:var\(--theme-surface-soft\)/);
    assert.match(html, /auth-flow-preview \{ margin:42px 0 28px/);
    assert.doesNotMatch(html, /class="auth-(?:orb|node|line)/);
  }

  assert.match(login, /登录工作台/);
  assert.match(login, /aria-busy/);
  assert.match(register, /申请加入工作台/);
});
