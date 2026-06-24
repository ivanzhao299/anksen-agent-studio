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
  return `<table><thead><tr>${columns.map((column) => `<th>${escapeHtml(column.label)}</th>`).join("")}</tr></thead><tbody>${rows.map((row) => `<tr>${columns.map((column) => {
    const value = row[column.key] ?? "";
    return `<td>${column.html ? String(value) : escapeHtml(value)}</td>`;
  }).join("")}</tr>`).join("")}</tbody></table>`;
}

function list(items) {
  return `<ul>${items.map((item) => `<li>${escapeHtml(item)}</li>`).join("")}</ul>`;
}

function jsonBlock(value) {
  return `<pre>${escapeHtml(JSON.stringify(value, null, 2))}</pre>`;
}

function detailsJson(title, value) {
  return `<details class="details-drawer"><summary>${escapeHtml(title)}</summary>${jsonBlock(value)}</details>`;
}

function badge(label, value, tone = "neutral") {
  return `<div class="status-chip ${tone}"><span>${escapeHtml(label)}</span><strong>${escapeHtml(value)}</strong></div>`;
}

function normalizeToken(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function riskBadge(value) {
  return `<span class="risk-badge ${normalizeToken(value)}">风险 ${escapeHtml(value)}</span>`;
}

function statusLabel(value) {
  return `<span class="status-label ${normalizeToken(value)}">${escapeHtml(value)}</span>`;
}

function formOption(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function topStatusBar(model, data) {
  return `<div class="top-status">
    ${badge("平台状态", model.platform_status, "good")}
    ${badge("V5 / Pilot", `${model.v5_status} / READY`, "good")}
    ${badge("当前项目", model.active_project, "neutral")}
    ${badge("Worker", model.modules.workers, "neutral")}
    ${badge("风险闸门", "PASS", "good")}
    ${badge("最近运行", data.autopilot.latest_summary?.validation ?? "unknown", data.autopilot.latest_summary?.validation === "PASS" ? "good" : "warn")}
  </div>`;
}

function actionWorkbench(data, title = "任务工作台") {
  const actionOptions = data.actionServer.actions.map((item) => formOption(item.id, item.label));
  const projectOptions = data.actionServer.projects.map((item) => formOption(item.project_id, `${item.label} (${item.status})`));
  return `<section class="workbench hero-workbench">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(title)}</h2>
        <p>以目标为中心推进 Studio：生成计划、执行本地 dry-run、查看日志，所有动作都受 Governance Gate 约束。</p>
      </div>
      <span class="pill">127.0.0.1 / dry-run only</span>
    </div>
    <label for="action-goal">大目标输入框</label>
    <textarea id="action-goal" class="goal-box" placeholder="输入目标，例如：生成 Smart Park 上线计划 / 检查项目阻断项 / 继续推进 Pilot">继续推进 Pilot</textarea>
    <div class="form-grid control-grid">
      <div>
        <label for="action-project">项目选择</label>
        <select id="action-project">${projectOptions.join("")}</select>
      </div>
      <div>
        <label for="action-type">操作类型</label>
        <select id="action-type">${actionOptions.join("")}</select>
      </div>
      <div class="button-row compact">
        <button type="button" data-console-action="plan">生成计划</button>
        <button type="button" data-console-action="run">执行 dry-run</button>
        <button type="button" class="secondary" data-console-action="logs">查看日志</button>
      </div>
    </div>
    <div class="quick-row">
      <button type="button" class="secondary" data-quick-action="context-summary" data-goal="读取全局上下文">读取上下文</button>
      <button type="button" class="secondary" data-quick-action="project-inspect" data-goal="检查 Smart Park 项目状态">检查 Smart Park</button>
      <button type="button" class="secondary" data-quick-action="smart-park-go-live-plan-dry-run" data-goal="生成 Smart Park 上线计划 dry-run">生成上线计划 dry-run</button>
      <button type="button" class="secondary" data-quick-action="runtime-health" data-goal="Runtime 健康检查">Runtime 健康检查</button>
      <button type="button" class="secondary" data-quick-action="worker-health" data-goal="Worker 健康检查">Worker 健康检查</button>
      <button type="button" class="secondary" data-quick-action="governance-check" data-goal="Governance 检查">Governance 检查</button>
      <button type="button" class="secondary" data-quick-action="autopilot-dry-run" data-goal="继续推进 Pilot">Autopilot dry-run</button>
      <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="查看 Smart Park Proposal">查看 Proposal</button>
    </div>
    <div class="output-card">
      <div class="section-head small"><h3>Action Log 摘要</h3><span>${escapeHtml(data.actionServer.action_log_dir)}</span></div>
      <pre id="action-output">${escapeHtml(data.action_log.latest_summary ?? "等待操作...")}</pre>
    </div>
  </section>`;
}

function smartParkEntryPanel() {
  return `<section class="smart-entry">
    <div class="section-head">
      <div>
        <h2>Smart Park 上线入口</h2>
        <p>只生成上线计划、阻断项检查和下一步 proposal，不修改业务项目，不执行部署。</p>
      </div>
      <span class="pill warn-pill">业务项目写入禁用</span>
    </div>
    <div class="entry-grid">
      <button type="button" data-quick-action="smart-park-go-live-plan-dry-run" data-goal="生成 Smart Park 上线计划 dry-run">生成上线计划 dry-run</button>
      <button type="button" class="secondary" data-quick-action="project-inspect" data-goal="检查 Smart Park 项目状态">检查项目状态</button>
      <button type="button" class="secondary" data-quick-action="governance-check" data-goal="查看 Smart Park 当前阻断项">查看阻断项</button>
      <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="生成 Smart Park 下一步任务 proposal">生成下一步任务 proposal</button>
    </div>
  </section>`;
}

function recommendationPanel(data) {
  const recommendation = data.autopilot.latest_summary?.next_recommendation ?? "运行 Autopilot dry-run 以刷新下一步建议。";
  return `<section>
    <div class="section-head"><h2>推荐动作区</h2><span class="pill">Planning / Governance</span></div>
    <div class="kanban-grid">
      <div class="panel"><h3>下一步建议</h3><p>${escapeHtml(recommendation)}</p></div>
      <div class="panel"><h3>可自动执行任务</h3>${list(["LOW / MEDIUM 本仓库 dry-run", "Runtime health", "Worker health", "Autopilot dry-run"])}</div>
      <div class="panel"><h3>需审批任务</h3>${list(["HIGH remote worker", "CRITICAL production operation", "真实凭证后端接入"])}</div>
      <div class="panel"><h3>最近失败项</h3>${list(["无活动失败项", "SSH/production 相关动作保持 HOLD 或 proposal_only"])}</div>
    </div>
  </section>`;
}

function executionTimeline() {
  const steps = [
    ["Planning", "READY", "目标解析与 batch plan"],
    ["Governance", "PASS", "LOW/MEDIUM dry-run 放行"],
    ["Worker", "LOCAL", "仅本地 child_process / dry-run"],
    ["Validation", "PASS", "typecheck / lint / smoke"],
    ["Report", "RECORDED", "Action Log + run summary"]
  ];
  return `<section>
    <div class="section-head"><h2>执行时间线</h2><span class="pill">可观察</span></div>
    <div class="timeline">${steps.map(([name, status, detail]) => `<div class="timeline-step"><strong>${escapeHtml(name)}</strong>${statusLabel(status)}<p>${escapeHtml(detail)}</p></div>`).join("")}</div>
  </section>`;
}

function workerRows(data) {
  const latest = data.autopilot.latest?.data ?? {};
  const pids = latest.agent_pids ?? latest.parallel_evidence?.agent_pids ?? {};
  const logs = latest.parallel_evidence?.run_logs ?? {};
  const agents = ["agent-1", "agent-2", "agent-3", "agent-4", "agent-5"];
  return agents.map((agent, index) => ({
    agent,
    pid: pids[agent] ?? "idle",
    status: statusLabel(pids[agent] ? "PASS" : "READY"),
    risk: riskBadge(index === 4 ? "HIGH" : "LOW"),
    task: ["Docs / Runtime", "Governance", "Credential / Project", "Console UI", "Proposal / Architecture"][index],
    log: logs[agent] ?? data.autopilot.latest?.path ?? data.action_log.latest_path,
    duration: pids[agent] ? "overlap" : "n/a"
  }));
}

function workerPanel(data) {
  return `<section>
    <div class="section-head"><h2>Worker 实时状态</h2><span class="pill">agent-1~5 / 本地 dry-run</span></div>
    ${table(workerRows(data), [
      { key: "agent", label: "Agent" },
      { key: "pid", label: "PID" },
      { key: "status", label: "状态", html: true },
      { key: "risk", label: "风险标识", html: true },
      { key: "task", label: "任务" },
      { key: "log", label: "日志路径" },
      { key: "duration", label: "耗时" }
    ])}
  </section>`;
}

function proposalPanel() {
  const proposals = [
    { id: "smart-park-go-live-plan", risk: riskBadge("MEDIUM"), approval: statusLabel("no"), status: statusLabel("DRAFT_DRY_RUN") },
    { id: "remote-worker-runtime", risk: riskBadge("HIGH"), approval: statusLabel("yes"), status: statusLabel("PROPOSAL_ONLY") },
    { id: "production-operation", risk: riskBadge("CRITICAL"), approval: statusLabel("yes"), status: statusLabel("BLOCKED") }
  ];
  return `<section>
    <div class="section-head"><h2>Proposal 审批区</h2><span class="pill warn-pill">风险标识 / 真实写入禁用</span></div>
    ${table(proposals, [
      { key: "id", label: "proposal list" },
      { key: "risk", label: "risk", html: true },
      { key: "approval", label: "approval_required", html: true },
      { key: "status", label: "status", html: true }
    ])}
    <div class="button-row">
      <button type="button" class="secondary" data-proposal-action="proposal-review">查看</button>
      <button type="button" class="secondary" data-proposal-action="proposal-approve-dry-run">dry-run 批准</button>
      <button type="button" class="danger" data-proposal-action="proposal-reject-draft">拒绝草稿</button>
    </div>
  </section>`;
}

function projectWorkbench(data) {
  const rows = [
    { project: "jinhu-smart-park", status: "CONNECTED", policy: "read-only / dry-run", next: "go-live plan dry-run" },
    { project: "phoenix-erp", status: "WAITING_FOR_GITHUB_REPO", policy: "planned", next: "GitHub Repo Connector" },
    { project: "group-portal", status: "PLANNED", policy: "not_connected", next: "project intake" }
  ];
  return `<section>
    <div class="section-head"><h2>项目工作台</h2><span class="pill">Multi Project</span></div>
    ${table(rows, [
      { key: "project", label: "项目" },
      { key: "status", label: "状态" },
      { key: "policy", label: "策略" },
      { key: "next", label: "下一步" }
    ])}
  </section>`;
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

  document.querySelectorAll("[data-proposal-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (project) project.value = "jinhu-smart-park";
      if (action) action.value = button.getAttribute("data-proposal-action");
      if (goal) goal.value = button.textContent + " Smart Park proposal dry-run";
      show(await postJson("/api/action-plan", payload()));
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

function shell(content, activeId, model, data) {
  const route = consoleWebRoutes.find((item) => item.id === activeId) ?? consoleWebRoutes[0];
  return `<!doctype html>
<html lang="${messages.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(route.label)} - ${escapeHtml(messages.app.title)}</title>
  <style>
    :root { color-scheme: dark; --bg: #0b0f14; --nav: #0f141b; --panel: #121922; --panel-2: #16202b; --text: #e5edf5; --muted: #94a3b8; --line: #263241; --blue: #5aa9ff; --green: #34d399; --yellow: #fbbf24; --red: #fb7185; --shadow: rgba(0, 0, 0, 0.24); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: var(--bg); color: var(--text); }
    header { padding: 18px 24px 12px; border-bottom: 1px solid var(--line); background: #0d1218; position: sticky; top: 0; z-index: 3; box-shadow: 0 10px 28px var(--shadow); }
    h1 { margin: 0 0 4px; font-size: 22px; font-weight: 700; letter-spacing: 0; }
    .subhead { color: var(--muted); font-size: 13px; }
    .top-status { display: grid; grid-template-columns: repeat(6, minmax(120px, 1fr)); gap: 10px; margin-top: 14px; }
    .status-chip { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 9px 10px; min-width: 0; }
    .status-chip span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
    .status-chip strong { display: block; font-size: 13px; overflow-wrap: anywhere; }
    .status-chip.good strong { color: var(--green); }
    .status-chip.warn strong { color: var(--yellow); }
    .layout { display: grid; grid-template-columns: 244px minmax(0, 1fr); min-height: calc(100vh - 122px); }
    nav { border-right: 1px solid var(--line); background: var(--nav); padding: 14px 12px; position: sticky; top: 123px; height: calc(100vh - 123px); align-self: start; }
    nav a { display: block; color: var(--muted); text-decoration: none; padding: 9px 10px; border-radius: 6px; font-size: 14px; margin-bottom: 3px; }
    nav a:hover { color: var(--text); background: #182231; }
    nav a.active { background: #203149; color: var(--blue); font-weight: 700; }
    main { padding: 22px 24px 40px; max-width: 1480px; width: 100%; }
    section { margin-bottom: 18px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    h3 { font-size: 14px; margin: 0 0 8px; }
    p { color: var(--muted); line-height: 1.55; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .metric, .panel, .workbench, .smart-entry, .output-card { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 14px; box-shadow: 0 10px 26px var(--shadow); }
    .hero-workbench { border-color: #315a82; background: #101923; }
    .smart-entry { border-color: #315a82; background: #111923; }
    .entry-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .metric strong { display: block; font-size: 18px; overflow-wrap: anywhere; }
    table { border-collapse: collapse; width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 10px 26px var(--shadow); }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 9px 10px; font-size: 13px; vertical-align: top; }
    th { color: var(--muted); background: #172231; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    pre { background: #070b10; color: #dbeafe; border: 1px solid #1f2a37; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; line-height: 1.45; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #172b42; color: var(--blue); font-size: 12px; font-weight: 700; }
    .warn-pill { background: #3a2630; color: var(--red); }
    .safe { color: var(--green); font-weight: 700; }
    .warn { color: var(--red); font-weight: 700; }
    .risk-badge, .status-label { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; border: 1px solid var(--line); white-space: nowrap; }
    .risk-badge.low, .status-label.pass, .status-label.ready { color: var(--green); background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.35); }
    .risk-badge.medium, .status-label.local, .status-label.recorded, .status-label.draft-dry-run { color: var(--blue); background: rgba(90, 169, 255, 0.1); border-color: rgba(90, 169, 255, 0.35); }
    .risk-badge.high, .status-label.proposal-only, .status-label.yes { color: var(--yellow); background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.35); }
    .risk-badge.critical, .status-label.blocked { color: var(--red); background: rgba(251, 113, 133, 0.1); border-color: rgba(251, 113, 133, 0.35); }
    .status-label.no { color: var(--green); background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.35); }
    label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 6px; padding: 9px 10px; font: inherit; color: var(--text); background: #0c1219; }
    input:focus, select:focus, textarea:focus { outline: 2px solid rgba(90, 169, 255, 0.32); border-color: var(--blue); }
    textarea { min-height: 92px; resize: vertical; line-height: 1.45; }
    .goal-box { min-height: 128px; font-size: 15px; }
    .form-grid { display: grid; grid-template-columns: minmax(220px, 1.5fr) minmax(180px, 0.8fr) minmax(220px, 1fr); gap: 12px; align-items: end; }
    .control-grid { grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1fr) minmax(280px, auto); margin-top: 12px; }
    .button-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .button-row.compact { align-items: end; margin-top: 0; }
    button { border: 1px solid #326ba8; background: #1d4f86; color: #f8fbff; border-radius: 6px; padding: 9px 12px; font: inherit; font-weight: 700; cursor: pointer; }
    button:hover { background: #2364a8; }
    button.secondary { background: #111a25; color: var(--blue); }
    button.danger { border-color: #753241; color: var(--red); background: #1d1116; }
    .quick-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .draft-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(260px, 1fr)); gap: 12px; }
    .help { color: var(--muted); font-size: 12px; margin-top: 6px; }
    .section-head { display: flex; align-items: flex-start; justify-content: space-between; gap: 12px; margin-bottom: 12px; }
    .section-head.small { align-items: center; }
    .section-head h2, .section-head h3 { margin: 0; }
    .kanban-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 12px; }
    .timeline { display: grid; grid-template-columns: repeat(5, minmax(0, 1fr)); gap: 10px; }
    .timeline-step { background: var(--panel); border: 1px solid var(--line); border-radius: 8px; padding: 12px; position: relative; }
    .timeline-step strong { display: block; margin-bottom: 6px; }
    .timeline-step .status-label { margin-bottom: 8px; }
    .output-card { margin-top: 14px; }
    .details-drawer { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 0; overflow: hidden; box-shadow: 0 10px 26px var(--shadow); }
    .details-drawer summary { cursor: pointer; color: var(--blue); font-size: 13px; font-weight: 800; padding: 12px 14px; background: #101923; }
    .details-drawer pre { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
    ul { margin: 0; padding-left: 18px; color: var(--muted); }
    li { margin: 5px 0; }
    @media (max-width: 760px) { .layout { grid-template-columns: 1fr; } .top-status { grid-template-columns: repeat(2, minmax(0, 1fr)); } nav { position: static; height: auto; border-right: 0; border-bottom: 1px solid var(--line); display: grid; grid-template-columns: repeat(auto-fit, minmax(140px, 1fr)); gap: 4px; } main { padding: 16px; } .timeline { grid-template-columns: 1fr; } }
    @media (max-width: 900px) { .form-grid { grid-template-columns: 1fr; } }
  </style>
</head>
<body>
  <header>
    <h1>${escapeHtml(messages.app.title)}</h1>
    <div class="subhead">${escapeHtml(messages.app.subtitle)}</div>
    ${topStatusBar(model, data)}
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
  return `${actionWorkbench(data, "任务工作台")}
  ${smartParkEntryPanel()}
  ${recommendationPanel(data)}
  ${executionTimeline()}
  ${workerPanel(data)}
  ${proposalPanel()}
  ${projectWorkbench(data)}
  <section><h2>${messages.pages.dashboard.title}</h2><div class="grid">
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
  <section><h2>详情抽屉</h2>${detailsJson("查看原始 Dashboard Model JSON", model)}</section>
  <section><h2>${messages.common.safety}</h2><div class="panel">${list(Object.entries(data.safety).map(([key, value]) => `${key}: ${value}`))}</div></section>`;
}

function pageProjects(data) {
  const project = data.jinhuProjectState ?? {};
  return `${projectWorkbench(data)}
  <section><h2>${messages.pages.projects.title}</h2><div class="grid">
    ${metric(messages.pages.projects.connectedProject, "jinhu-smart-park")}
    ${metric(messages.pages.projects.phoenixErp, messages.pages.projects.phoenixStatus)}
    ${metric(messages.pages.projects.writes, data.safety.managed_project_writes)}
  </div></section>
  <section><h2>${messages.pages.projects.runtimeMemory}</h2>${detailsJson("查看原始运行记忆 JSON", project)}</section>`;
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
  return `${workerPanel(data)}
  <section><h2>${messages.pages.workers.title}</h2><div class="grid">${metric(messages.pages.dashboard.workers, rows.length)}${metric(messages.pages.workers.serverAccess, data.safety.server_access)}${metric(messages.pages.workers.modelCalls, data.safety.model_invocation)}</div></section>
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
  <section><h2>${messages.pages.planning.roadmapMemory}</h2>${detailsJson("查看原始 Roadmap Memory JSON", data.roadmapMemory)}</section>`;
}

function pageAutopilot(data) {
  return `<section><h2>${messages.pages.autopilot.title}</h2><div class="grid">
    ${metric(messages.pages.autopilot.latestRun, data.autopilot.latest?.path ?? messages.common.notFound)}
    ${metric(messages.pages.autopilot.executionMode, data.autopilot.latest_summary?.execution_mode ?? messages.common.unknown)}
    ${metric(messages.pages.autopilot.writesFromConsole, data.safety.managed_project_writes)}
  </div></section>
  <section><h2>${messages.pages.autopilot.latestRunSummary}</h2>${detailsJson("查看原始 Autopilot Run JSON", data.autopilot.latest_summary ?? {})}</section>`;
}

function pageActions(data) {
  const actions = data.consoleActions?.actions ?? [];
  return `<section><h2>${messages.pages.actions.title}</h2><div class="grid">${metric(messages.pages.actions.actions, data.actionServer.actions.length)}${metric(messages.pages.actions.defaultMode, "dry_run")}${metric(messages.pages.actions.writes, messages.common.falseValue)}${metric("Action Log", data.actionServer.action_log_dir)}</div></section>
  ${actionWorkbench(data, "操作中心")}
  ${smartParkEntryPanel()}
  ${proposalPanel()}
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
    phoenix_erp: "WAITING_FOR_GITHUB_REPO",
    group_portal: "PLANNED",
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
  return shell(body, route.id, model, data);
}
