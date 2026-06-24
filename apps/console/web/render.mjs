import { consoleWebRoutes } from "./routes.mjs";
import { buildConsoleDashboardModel, loadConsoleLocalData } from "./data.mjs";
import { getConsoleMessages } from "./i18n/index.mjs";

const messages = getConsoleMessages();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nav(activeId) {
  return `<nav>${consoleWebRoutes.map((route) => {
    const active = route.id === activeId ? "active" : "";
    return `<a class="${active}" href="${route.navPath}">${escapeHtml(route.label)}</a>`;
  }).join("")}</nav>`;
}

function metric(label, value) {
  return `<div class="metric"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function table(rows, columns) {
  return `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => `<td>${escapeHtml(row[column.key])}</td>`).join("")}</tr>`).join("")}</tbody></table>`;
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function formOption(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function interactiveScript() {
  return `<script>
(() => {
  const output = document.getElementById("action-output");
  const goal = document.getElementById("action-goal");
  const project = document.getElementById("action-project");
  const action = document.getElementById("action-type");
  const draftStatus = document.getElementById("config-draft-status");

  function show(value) {
    if (output) output.textContent = typeof value === "string" ? value : JSON.stringify(value, null, 2);
  }

  function payload() {
    return {
      goal: goal ? goal.value : "继续推进 Pilot",
      project_id: project ? project.value : "jinhu-smart-park",
      action_id: action ? action.value : "context-summary"
    };
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    return response.json();
  }

  document.querySelectorAll("[data-console-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const mode = button.getAttribute("data-console-action");
      try {
        if (mode === "plan") show(await postJson("/api/action-plan", payload()));
        if (mode === "run") show(await postJson("/api/action-run", payload()));
        if (mode === "logs") show(await (await fetch("/api/action-log/latest")).json());
      } catch (error) {
        show({ status: "FAIL", error: String(error && error.message ? error.message : error) });
      }
    });
  });

  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (project) project.value = "jinhu-smart-park";
      if (action) action.value = button.getAttribute("data-quick-action");
      if (goal) goal.value = button.getAttribute("data-goal") || goal.value;
      show(await postJson("/api/action-run", payload()));
    });
  });

  const draftKey = "anksen-console-config-drafts";
  const draftFields = [...document.querySelectorAll("[data-config-draft]")];
  if (draftFields.length > 0) {
    const saved = JSON.parse(localStorage.getItem(draftKey) || "{}");
    for (const field of draftFields) {
      if (saved[field.id]) field.value = saved[field.id];
    }
    document.querySelector("[data-config-save]")?.addEventListener("click", () => {
      const next = {};
      for (const field of draftFields) next[field.id] = field.value;
      localStorage.setItem(draftKey, JSON.stringify(next));
      if (draftStatus) draftStatus.textContent = "草稿已保存到浏览器本地存储，未写入仓库。";
    });
    document.querySelector("[data-config-reset]")?.addEventListener("click", () => {
      localStorage.removeItem(draftKey);
      location.reload();
    });
  }
})();
</script>`;
}

function shell(content, activeId, model) {
  const route = consoleWebRoutes.find((item) => item.id === activeId) ?? consoleWebRoutes[0];
  return `<!doctype html>
<html lang="${messages.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(route.label)} - ${escapeHtml(messages.app.title)}</title>
  <style>
    :root { color-scheme: light; --bg: #f7f8fa; --panel: #ffffff; --text: #1f2933; --muted: #52606d; --line: #d9e2ec; --blue: #1261a6; --green: #1f7a4d; --red: #b42318; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 18px 24px 12px; border-bottom: 1px solid var(--line); background: var(--panel); position: sticky; top: 0; z-index: 2; }
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: 0; }
    .subhead { color: var(--muted); font-size: 13px; }
    .layout { display: grid; grid-template-columns: 240px minmax(0, 1fr); min-height: calc(100vh - 76px); }
    nav { border-right: 1px solid var(--line); background: #fff; padding: 12px; }
    nav a { display: block; color: var(--text); text-decoration: none; padding: 9px 10px; border-radius: 6px; font-size: 14px; }
    nav a.active { background: #e7f0fa; color: var(--blue); font-weight: 700; }
    main { padding: 20px 24px 36px; max-width: 1280px; width: 100%; }
    section { margin-bottom: 18px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .metric, .panel { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .metric strong { display: block; font-size: 18px; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 9px 10px; font-size: 13px; vertical-align: top; }
    th { color: var(--muted); background: #f0f4f8; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    pre { background: #101828; color: #f8fafc; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; line-height: 1.45; }
    .pill { display: inline-block; padding: 2px 7px; border-radius: 999px; background: #e7f0fa; color: var(--blue); font-size: 12px; font-weight: 700; }
    .safe { color: var(--green); font-weight: 700; }
    .warn { color: var(--red); font-weight: 700; }
    label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; font: inherit; color: var(--text); background: #fff; }
    textarea { min-height: 92px; resize: vertical; line-height: 1.45; }
    .form-grid { display: grid; grid-template-columns: minmax(220px, 1.5fr) minmax(180px, 0.8fr) minmax(220px, 1fr); gap: 12px; align-items: end; }
    .button-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    button { border: 1px solid var(--blue); background: var(--blue); color: #fff; border-radius: 6px; padding: 9px 12px; font: inherit; font-weight: 700; cursor: pointer; }
    button.secondary { background: #fff; color: var(--blue); }
    button.danger { border-color: var(--red); color: var(--red); background: #fff; }
    .quick-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 8px; }
    .draft-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .help { color: var(--muted); font-size: 12px; margin-top: 6px; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } nav { border-right: 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px; } main { padding: 16px; } }
    @media (max-width: 900px) { .form-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(messages.app.title)}</h1>
    <div class="subhead">${escapeHtml(messages.app.subtitle)}</div>
  </header>
  <div class="layout">
    ${nav(activeId)}
    <main>${content}</main>
  </div>
  ${interactiveScript()}
</body>
</html>`;
}

function pageDashboard(model, data) {
  return `<section><h2>${messages.pages.dashboard.title}</h2><div class="grid">
    ${metric(messages.pages.dashboard.platform, model.platform_status)}
    ${metric("V5", model.v5_status)}
    ${metric(messages.pages.dashboard.activeProject, model.active_project)}
    ${metric(messages.pages.dashboard.latestAutopilot, model.modules.latest_autopilot_run)}
  </div></section>
  <section><h2>${messages.pages.dashboard.moduleCounts}</h2><div class="grid">
    ${metric(messages.pages.dashboard.runtimeProfiles, model.modules.runtime_profiles)}
    ${metric(messages.pages.dashboard.workers, model.modules.workers)}
    ${metric(messages.pages.dashboard.credentialRefs, model.modules.credential_references)}
    ${metric(messages.pages.dashboard.credentialBackends, model.modules.credential_backends)}
    ${metric(messages.pages.dashboard.governanceGates, model.modules.governance_release_gates)}
  </div></section>
  <section><h2>${messages.common.safety}</h2><div class="panel">${list(Object.entries(data.safety).map(([key, value]) => `${key}: ${value}`))}</div></section>`;
}

function pageProjects(data) {
  const project = data.jinhuProjectState ?? {};
  return `<section><h2>${messages.pages.projects.title}</h2><div class="grid">
    ${metric(messages.pages.projects.connectedProject, "jinhu-smart-park")}
    ${metric(messages.pages.projects.phoenixErp, messages.pages.projects.phoenixStatus)}
    ${metric(messages.pages.projects.writes, data.safety.managed_project_writes)}
  </div></section>
  <section><h2>${messages.pages.projects.runtimeMemory}</h2>${jsonBlock(project)}</section>`;
}

function pageRuntime(data) {
  const rows = data.runtime.examples.map((item) => ({ path: item.path, keys: Object.keys(item.data ?? {}).join(", ") || messages.common.notFound }));
  return `<section><h2>${messages.pages.runtime.title}</h2><div class="grid">${metric(messages.pages.runtime.profiles, data.runtime.profile_count)}${metric(messages.pages.runtime.providers, data.runtime.provider_count)}${metric(messages.pages.runtime.externalCalls, data.safety.external_calls)}</div></section>
  <section>${table(rows, [{ key: "path", label: messages.common.file }, { key: "keys", label: messages.common.keys }])}</section>`;
}

function pageWorkers(data) {
  const workers = data.workers.registry?.workers ?? [];
  const rows = workers.map((worker) => ({
    worker_id: worker.worker_id,
    kind: worker.worker_kind,
    os: worker.worker_os,
    capabilities: (worker.capability_tags ?? []).join(", "),
    risk: worker.risk,
    status: worker.status
  }));
  return `<section><h2>${messages.pages.workers.title}</h2><div class="grid">${metric(messages.pages.dashboard.workers, rows.length)}${metric(messages.pages.workers.serverAccess, data.safety.server_access)}${metric(messages.pages.workers.modelCalls, data.safety.model_invocation)}</div></section>
  <section>${table(rows, [{ key: "worker_id", label: messages.pages.workers.worker }, { key: "kind", label: messages.pages.workers.kind }, { key: "os", label: messages.pages.workers.os }, { key: "capabilities", label: messages.pages.workers.capabilities }, { key: "risk", label: messages.common.risk }, { key: "status", label: messages.common.status }])}</section>`;
}

function pageCredentials(data) {
  return `<section><h2>${messages.pages.credentials.title}</h2><div class="grid">
    ${metric(messages.pages.credentials.references, data.credentials.reference_count)}
    ${metric(messages.pages.credentials.backends, data.credentials.backend_count)}
    ${metric(messages.pages.credentials.secretValues, data.safety.credential_values)}
  </div></section>
  <section><h2>${messages.pages.credentials.files}</h2>${table(data.credentials.examples.map((item) => ({ path: item.path, keys: Object.keys(item.data ?? {}).join(", ") })), [{ key: "path", label: messages.common.file }, { key: "keys", label: messages.common.keys }])}</section>`;
}

function pageGovernance(data) {
  return `<section><h2>${messages.pages.governance.title}</h2><div class="grid">
    ${metric(messages.pages.governance.policy, data.governance.policy_id)}
    ${metric(messages.pages.governance.releaseGates, data.governance.release_gate_count)}
    ${metric(messages.pages.governance.productionOps, data.safety.production_operations)}
  </div></section>
  <section><h2>${messages.pages.governance.sources}</h2>${table(data.governance.examples.map((item) => ({ path: item.path, keys: Object.keys(item.data ?? {}).join(", ") })), [{ key: "path", label: messages.common.file }, { key: "keys", label: messages.common.keys }])}</section>`;
}

function pagePlanning(data) {
  return `<section><h2>${messages.pages.planning.title}</h2><div class="grid">
    ${metric(messages.pages.planning.roadmapMemory, messages.common.loaded)}
    ${metric(messages.pages.planning.v5Roadmap, Array.isArray(data.v5Roadmap?.stages) ? `${data.v5Roadmap.stages.length} stages` : messages.common.loaded)}
    ${metric(messages.pages.planning.externalCalls, data.safety.external_calls)}
  </div></section>
  <section><h2>${messages.pages.planning.roadmapMemory}</h2>${jsonBlock(data.roadmapMemory)}</section>`;
}

function pageAutopilot(data) {
  return `<section><h2>${messages.pages.autopilot.title}</h2><div class="grid">
    ${metric(messages.pages.autopilot.latestRun, data.autopilot.latest?.path ?? messages.common.notFound)}
    ${metric(messages.pages.autopilot.executionMode, data.autopilot.latest_summary?.execution_mode ?? messages.common.unknown)}
    ${metric(messages.pages.autopilot.writesFromConsole, data.safety.managed_project_writes)}
  </div></section>
  <section><h2>${messages.pages.autopilot.latestRunSummary}</h2>${jsonBlock(data.autopilot.latest_summary ?? {})}</section>`;
}

function pageActions(data) {
  const actions = data.consoleActions?.actions ?? [];
  const actionOptions = data.actionServer.actions.map((item) => formOption(item.id, item.label));
  const projectOptions = data.actionServer.projects.map((item) => formOption(item.project_id, `${item.label} (${item.status})`));
  return `<section><h2>${messages.pages.actions.title}</h2><div class="grid">${metric(messages.pages.actions.actions, data.actionServer.actions.length)}${metric(messages.pages.actions.defaultMode, "dry_run")}${metric(messages.pages.actions.writes, messages.common.falseValue)}${metric("Action Log", data.actionServer.action_log_dir)}</div></section>
  <section class="panel">
    <div class="form-grid">
      <div>
        <label for="action-goal">目标/任务描述</label>
        <textarea id="action-goal" placeholder="输入要推进的目标，例如：继续推进 Pilot">继续推进 Pilot</textarea>
      </div>
      <div>
        <label for="action-project">项目选择</label>
        <select id="action-project">${projectOptions.join("")}</select>
      </div>
      <div>
        <label for="action-type">操作类型</label>
        <select id="action-type">${actionOptions.join("")}</select>
      </div>
    </div>
    <div class="button-row">
      <button type="button" data-console-action="plan">生成计划</button>
      <button type="button" data-console-action="run">执行 dry-run</button>
      <button type="button" class="secondary" data-console-action="logs">查看日志</button>
    </div>
    <p class="help">本地 Action Server 只监听 127.0.0.1；所有操作强制 dry-run，写入 action log，不读取密钥，不部署，不执行生产操作。</p>
  </section>
  <section><h2>Smart Park 快捷入口</h2><div class="quick-grid">
    <button type="button" data-quick-action="smart-park-go-live-plan-dry-run" data-goal="生成 jinhu-smart-park 上线计划 dry-run">生成上线计划 dry-run</button>
    <button type="button" class="secondary" data-quick-action="project-inspect" data-goal="检查 jinhu-smart-park 项目状态">检查项目状态</button>
    <button type="button" class="secondary" data-quick-action="governance-check" data-goal="查看 jinhu-smart-park 上线阻断项">查看阻断项</button>
    <button type="button" class="secondary" data-quick-action="autopilot-dry-run" data-goal="生成 jinhu-smart-park 下一步任务 proposal">生成下一步任务 proposal</button>
  </div></section>
  <section><h2>命令输出摘要 / 风险 / 审批 / 日志</h2><pre id="action-output">等待操作...</pre></section>
  <section>${table(actions.map((action) => ({
    id: action.id,
    intent: action.intent,
    risk: action.risk,
    mode: `${action.mode}/${action.executionMode}`,
    gate: action.governance_gate
  })), [{ key: "id", label: messages.pages.actions.action }, { key: "intent", label: messages.pages.actions.intent }, { key: "risk", label: messages.common.risk }, { key: "mode", label: messages.common.mode }, { key: "gate", label: messages.common.gate }])}</section>`;
}

function pageConfig(data) {
  const projectDraft = {
    project_id: "jinhu-smart-park",
    connected: true,
    phoenix_erp: "planned / not_connected",
    managed_project_writes: false
  };
  const runtimeDraft = {
    default_runtime: "codex-cli",
    mode: "dry_run_only",
    external_model_calls: "disabled"
  };
  const workerDraft = {
    worker_pool: "local_only",
    allowed_capabilities: ["codex", "web", "backend", "mobile-ios", "mobile-android"],
    remote_workers: "proposal_only"
  };
  const credentialDraft = {
    credential_values: "not_read",
    storage: "reference_only",
    allowed_references: ["vault_path", "env_ref", "keychain_ref", "external_vault_ref"]
  };
  const governanceDraft = {
    LOW: "execute dry-run",
    MEDIUM: "autopilot dry-run",
    HIGH: "proposal_only",
    CRITICAL: "human_approval_required"
  };
  return `<section><h2>${messages.pages.config.title}</h2><div class="grid">
    ${metric(messages.pages.config.projects, "draft")}
    ${metric(messages.pages.config.runtime, "dry-run")}
    ${metric(messages.pages.config.credentials, "reference_only")}
    ${metric(messages.pages.config.governance, data.governance.policy_id)}
  </div><p class="help">${messages.pages.config.draftOnly}</p></section>
  <section class="draft-grid">
    <div class="panel"><label for="draft-project">${messages.pages.config.projects}</label><textarea id="draft-project" data-config-draft>${escapeHtml(JSON.stringify(projectDraft, null, 2))}</textarea></div>
    <div class="panel"><label for="draft-runtime">${messages.pages.config.runtime}</label><textarea id="draft-runtime" data-config-draft>${escapeHtml(JSON.stringify(runtimeDraft, null, 2))}</textarea></div>
    <div class="panel"><label for="draft-worker">${messages.pages.config.workers}</label><textarea id="draft-worker" data-config-draft>${escapeHtml(JSON.stringify(workerDraft, null, 2))}</textarea></div>
    <div class="panel"><label for="draft-credential">${messages.pages.config.credentials}</label><textarea id="draft-credential" data-config-draft>${escapeHtml(JSON.stringify(credentialDraft, null, 2))}</textarea></div>
    <div class="panel"><label for="draft-governance">${messages.pages.config.governance}</label><textarea id="draft-governance" data-config-draft>${escapeHtml(JSON.stringify(governanceDraft, null, 2))}</textarea></div>
  </section>
  <section class="panel"><div class="button-row"><button type="button" data-config-save>保存草稿</button><button type="button" class="danger" data-config-reset>重置草稿</button></div><p id="config-draft-status" class="help">草稿仅保存在浏览器 localStorage，不写仓库、不写真实凭证。</p></section>`;
}

function pageMemory(data) {
  return `<section><h2>${messages.pages.memory.title}</h2><div class="grid">
    ${metric(messages.pages.memory.platformState, messages.common.loaded)}
    ${metric(messages.pages.memory.contextIndex, Object.keys(data.codexContextIndex ?? {}).length)}
    ${metric(messages.pages.memory.projectMemory, "jinhu-smart-park")}
  </div></section>
  <section><h2>${messages.common.dataSources}</h2>${list([...data.data_sources.files, ...data.data_sources.directories, data.data_sources.autopilot_latest])}</section>`;
}

function pagePilotStatus(data) {
  const pilots = [
    { pilot: "Pilot-1 Real Runtime Smoke", status: "PASS" },
    { pilot: "Pilot-2 Worker Pool", status: "PASS" },
    { pilot: "Pilot-3 Credential Backend Policy", status: "PASS" },
    { pilot: "Pilot-4 Console Pilot Scope", status: "PASS" },
    { pilot: "Pilot-5 Console Productization", status: "IN_PROGRESS" }
  ];
  return `<section><h2>${messages.pages.pilotStatus.title}</h2>${table(pilots, [{ key: "pilot", label: messages.pages.pilotStatus.pilot }, { key: "status", label: messages.common.status }])}</section>
  <section><h2>${messages.pages.pilotStatus.safetyBoundary}</h2><div class="panel"><span class="safe">${escapeHtml(messages.common.noExternalCalls)}</span></div></section>`;
}

export async function renderConsolePage(pathname = "/") {
  const data = await loadConsoleLocalData();
  const model = await buildConsoleDashboardModel();
  const route = consoleWebRoutes.find((item) => item.path === pathname) ?? consoleWebRoutes[0];
  const contentById = {
    dashboard: () => pageDashboard(model, data),
    projects: () => pageProjects(data),
    runtime: () => pageRuntime(data),
    workers: () => pageWorkers(data),
    credentials: () => pageCredentials(data),
    governance: () => pageGovernance(data),
    planning: () => pagePlanning(data),
    autopilot: () => pageAutopilot(data),
    actions: () => pageActions(data),
    config: () => pageConfig(data),
    memory: () => pageMemory(data),
    pilotStatus: () => pagePilotStatus(data)
  };
  const body = await (contentById[route.id] ?? contentById.dashboard)();
  return shell(body, route.id, model);
}
