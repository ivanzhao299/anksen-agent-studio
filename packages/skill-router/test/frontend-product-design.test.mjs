import test from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";

const readJson=async path=>JSON.parse(await readFile(new URL(path,import.meta.url),"utf8"));

test("frontend product design is a routed native capability with delivery evidence",async()=>{
  const skills=await readJson("../registry/skill-registry.json"),rules=await readJson("../registry/skill-router-rules.json"),skill=skills.skills.find(item=>item.skill_type==="frontend_product_design"),rule=rules.rules.find(item=>item.skill_type==="frontend_product_design"),instructions=await readFile(new URL("../skills/frontend-product-design/SKILL.md",import.meta.url),"utf8");
  assert.equal(skill.default_agent,"agent-4");
  assert.equal(rule.task_type,"frontend_ui_design");
  assert.ok(rule.confidence_boost>15);
  for(const phrase of ["experience thesis","Default to cardless composition","desktop and narrow mobile widths","accessibility and interaction-state evidence"])assert.match(instructions,new RegExp(phrase,"i"));
});

test("popular design sources are commit-pinned, licensed and non-executable",async()=>{
  const registry=await readJson("../registry/capability-resources.json"),ids=["openai-frontend-skill","emil-design-engineering","ui-ux-pro-max"];
  for(const id of ids){const resource=registry.resources.find(item=>item.resource_id===id);assert.match(resource.source_commit,/^[a-f0-9]{40}$/);assert.ok(resource.license);assert.equal(resource.side_effect_policy,"READ_ONLY_REFERENCE");assert.equal(resource.governance.execute_embedded_commands,false);assert.ok(resource.items.length>=1);}
});
