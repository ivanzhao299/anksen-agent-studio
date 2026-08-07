import test from "node:test";
import assert from "node:assert/strict";
import { renderConsolePage } from "./render.mjs";

const owner = { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] };

test("representative Studio surfaces share the 2026 visual system", async () => {
  const pages = await Promise.all([
    renderConsolePage("/", owner),
    renderConsolePage("/cockpit", owner),
    renderConsolePage("/strategy", owner),
    renderConsolePage("/design", owner),
    renderConsolePage("/cad", owner),
    renderConsolePage("/config", owner),
    renderConsolePage("/login", { authenticated: false }),
  ]);

  for (const html of pages) {
    assert.match(html, /data-design-system="studio-2026"/);
    assert.match(html, /--studio-primary:#5b5ce2/);
    assert.match(html, /Studio 2026 visual system/);
    assert.match(html, /prefers-reduced-motion:reduce/);
  }
});

test("the visual system covers legacy operational surfaces instead of only the chat shell", async () => {
  const html = await renderConsolePage("/config", owner);
  for (const selector of [
    ".application-suite",
    ".domain-card",
    ".advanced-section",
    ".details-drawer",
    ".summary-card",
    ".operation-card",
    "table",
  ]) {
    assert.match(html, new RegExp(selector.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  }
  assert.match(html, /@keyframes studio-aurora/);
});

test("the primary workstation applies the prompt-first mission canvas", async () => {
  const html = await renderConsolePage("/", owner);
  for (const value of [
    "Frontend delivery engineering: mission canvas",
    "data-workstation=\"personal-ai\"",
    "data-interface-model=\"mission-canvas\"",
    "workspace-orientation",
    "workspace-live-state",
    "从一个意图开始",
    "描述目标、背景、约束和完成标准",
    "grid-template-columns:172px minmax(560px,1fr) 192px",
    ".page-dashboard .composer { order:3",
    ".page-dashboard .quick-row { order:4",
    "project-rail,.page-dashboard .advanced-config { display:none",
  ]) assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /Personal AI Workstation/);
});

test("the cockpit uses a compact theme-native command deck", async () => {
  const html = await renderConsolePage("/cockpit", owner);
  for (const value of [
    "data-interface-model=\"command-deck\"",
    "Command deck: operational launch surface",
    "grid-template-columns:minmax(360px,.85fr) minmax(480px,1.15fr)",
    "background:var(--theme-surface)",
    "box-shadow:none",
    "从常用任务开始",
    "目标、背景与预期结果",
  ]) assert.ok(html.includes(value), `missing cockpit contract: ${value}`);
  assert.doesNotMatch(html, /min-height:calc\(100vh - 190px\)/);
});

test("sidebar expansion restores labels and every route has a distinct icon contract", async () => {
  const html = await renderConsolePage("/", owner);
  for (const label of [
    "集团驾驶舱",
    "我的工作",
    "战略执行",
    "人力资源",
    "财务管理",
    "增长销售",
    "制造 ERP",
    "智慧园区",
    "视频工厂",
    "凭证",
  ]) assert.ok(html.includes(`<span class="nav-label">${label}</span>`));

  assert.doesNotMatch(html, /page-dashboard header:not\(\.login-header\) \.nav-label,[\s\S]{0,240}display:none!important/);
  assert.doesNotMatch(html, /class="nav-icon"><svg[^>]*><circle cx="10" cy="10" r="2"\/><\/svg>/);
  assert.match(html, /body\.sidebar-collapsed header:not\(\.login-header\) \.brand-copy,body\.sidebar-collapsed header:not\(\.login-header\) \.nav-label/);
  assert.match(html, /syncSidebarLabel\(\);/);
});

test("theme personalization is shared by authenticated and access surfaces", async () => {
  const [workstation, login] = await Promise.all([
    renderConsolePage("/", owner),
    renderConsolePage("/login", { authenticated: false }),
  ]);

  for (const html of [workstation, login]) {
    assert.match(html, /id="theme-switch"/);
    assert.match(html, /aria-label="外观主题"/);
    for (const theme of ["system", "light", "dark", "ocean", "forest", "sunset"]) {
      assert.match(html, new RegExp(`value="${theme}"`));
    }
    assert.match(html, /localStorage\.getItem\('anksen-theme'\)/);
    assert.match(html, /prefers-color-scheme: dark/);
    assert.match(html, /themeMedia\.addEventListener/);
  }

  assert.match(workstation, /Semantic theme system/);
  assert.match(workstation, /:root\[data-theme="dark"\]/);
  assert.match(workstation, /:root\[data-theme="ocean"\]/);
  assert.match(workstation, /--theme-accent:#397447/);
  assert.match(workstation, /--theme-accent:#c45d2d/);
  assert.match(login, /login-theme-switch/);
});

test("dark appearance keeps business hero and legacy surfaces on semantic theme colors", async () => {
  const html = await renderConsolePage("/hr", owner);

  for (const contract of [
    "html[data-theme] .product-hero {",
    "background:linear-gradient(135deg,var(--theme-surface)",
    "html[data-theme] .product-hero h2 { color:var(--theme-text); }",
    "html[data-theme] .product-hero p { color:var(--theme-text-soft); }",
    "html[data-theme] .application-badge",
    "html[data-theme] .advanced-section > summary",
    "html[data-theme] .simple-row",
  ]) assert.match(html, new RegExp(contract.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
});
