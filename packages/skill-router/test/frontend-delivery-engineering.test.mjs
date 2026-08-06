import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson = async (path) => JSON.parse(await readFile(new URL(path, import.meta.url), "utf8"));

test("frontend delivery engineering is registered as an evidence-bearing routed capability", async () => {
  const skills = await readJson("../registry/skill-registry.json");
  const rules = await readJson("../registry/skill-router-rules.json");
  const skill = skills.skills.find((item) => item.skill_type === "frontend_delivery_engineering");
  const rule = rules.rules.find((item) => item.skill_type === "frontend_delivery_engineering");

  assert.equal(skill.default_agent, "agent-4");
  assert.equal(skill.default_runtime, "codex-cli");
  assert.ok(skill.expected_output_types.includes("browser evidence"));
  assert.equal(rule.task_type, "frontend_end_to_end_delivery");
  assert.ok(rule.confidence_boost > 80);
  for (const keyword of ["playwright", "github actions", "pr comments", "figma to code"]) {
    assert.ok(rule.keywords.includes(keyword));
  }
});

test("the native skill covers all nine modules and fails closed on unavailable evidence", async () => {
  const root = new URL("../skills/frontend-delivery-engineering/", import.meta.url);
  const instructions = await readFile(new URL("SKILL.md", root), "utf8");
  const modules = await readFile(new URL("references/modules.md", root), "utf8");
  const gates = await readFile(new URL("references/delivery-gates.md", root), "utf8");
  const metadata = await readFile(new URL("agents/openai.yaml", root), "utf8");
  const frontmatter = instructions.match(/^---\n([\s\S]*?)\n---/)?.[1] ?? "";

  for (const phrase of [
    "Frontend product design",
    "Figma design implementation",
    "Web design quality review",
    "React and Next.js engineering",
    "Playwright E2E",
    "Real-browser operation",
    "GitHub Actions CI repair",
    "PR review comment closure",
    "Requirement/code to design structure"
  ]) {
    assert.match(modules, new RegExp(phrase, "i"));
  }
  assert.match(instructions, /Never claim Figma, browser, CI, deployment, or review completion without corresponding tool evidence/i);
  assert.match(frontmatter, /^name: frontend-delivery-engineering$/m);
  assert.match(frontmatter, /^description: "[^"]+"$/m);
  assert.match(gates, /Use HOLD for unavailable tools/i);
  assert.match(metadata, /\$frontend-delivery-engineering/);
});
