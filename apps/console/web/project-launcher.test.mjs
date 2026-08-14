import test from "node:test";
import assert from "node:assert/strict";
import { renderConsolePage } from "./render.mjs";

const owner = { authenticated: true, capabilities: ["*"], project_allowlist: ["*"] };

test("projects surface uses the minimal three-path project launcher", async () => {
  const html = await renderConsolePage("/projects", owner);
  for (const contract of [
    'data-interface-model="project-launcher"',
    "从项目开始",
    "创建新项目",
    "选择本地仓库",
    "选择项目文件夹",
    'data-project-source="new_project"',
    'data-project-kind="repository"',
    'data-project-kind="folder"',
    "项目运行与治理详情",
  ]) assert.ok(html.includes(contract), `missing project launcher contract: ${contract}`);

  assert.ok(html.indexOf("创建新项目") < html.indexOf("项目运行与治理详情"));
  assert.match(html, /project-entry-grid\{display:grid;grid-template-columns:repeat\(3,1fr\)/);
});

test("new projects are routed through the existing governed connector", async () => {
  const html = await renderConsolePage("/projects", owner);
  assert.match(html, /id="project-connect-source" type="hidden" value="new_project"/);
  assert.match(html, /data-project-connect-action="project-connect-dry-run"/);
  assert.match(html, /data-project-connect-action="project-connect-apply"/);
  assert.match(html, /Studio 将创建该文件夹、README、\.gitignore，并初始化 main 分支/);
  assert.match(html, /项目代码写入和部署仍需单独批准/);
});
