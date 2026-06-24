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
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } nav { border-right: 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px; } main { padding: 16px; } }
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
  return `<section><h2>${messages.pages.actions.title}</h2><div class="grid">${metric(messages.pages.actions.actions, actions.length)}${metric(messages.pages.actions.defaultMode, "read_only")}${metric(messages.pages.actions.writes, messages.common.falseValue)}</div></section>
  <section>${table(actions.map((action) => ({
    id: action.id,
    intent: action.intent,
    risk: action.risk,
    mode: `${action.mode}/${action.executionMode}`,
    gate: action.governance_gate
  })), [{ key: "id", label: messages.pages.actions.action }, { key: "intent", label: messages.pages.actions.intent }, { key: "risk", label: messages.common.risk }, { key: "mode", label: messages.common.mode }, { key: "gate", label: messages.common.gate }])}</section>`;
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
    memory: () => pageMemory(data),
    pilotStatus: () => pagePilotStatus(data)
  };
  const body = await (contentById[route.id] ?? contentById.dashboard)();
  return shell(body, route.id, model);
}
