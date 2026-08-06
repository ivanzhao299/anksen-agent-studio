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

test("the primary workstation applies the cardless product-design capability", async () => {
  const html = await renderConsolePage("/", owner);
  for (const value of [
    "cardless editorial workstation",
    "data-workstation=\"personal-ai\"",
    "data-interface-model=\"cardless-editorial\"",
    "workspace-orientation",
    "workspace-live-state",
    "常用意图",
    "直接描述目标、约束和期望结果",
    "grid-template-columns:196px minmax(520px,1fr) 232px",
    "project-rail,.page-dashboard .advanced-config { display:none",
  ]) assert.match(html, new RegExp(value.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")));
  assert.doesNotMatch(html, /Personal AI Workstation/);
});
