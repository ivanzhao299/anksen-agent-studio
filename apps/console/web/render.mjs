import { consoleWebRoutes } from "./routes.mjs";
import { buildConsoleDashboardModel, loadConsoleLocalData } from "./data.mjs";
import { getConsoleMessages } from "./i18n/index.mjs";
import { evaluateConsoleRouteAccess, visibleConsoleRouteIds } from "../../../packages/access-center/lib/access-center-utils.mjs";
import { domainCenterSummary, loadDomainRuntimeRegistry, resolveDomainCapability } from "../../../packages/domain-center/lib/domain-center.mjs";

const messages = getConsoleMessages();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function routeHref(path, activeProjectId = "") {
  if (!activeProjectId) return path;
  const separator = path.includes("?") ? "&" : "?";
  return `${path}${separator}project=${encodeURIComponent(activeProjectId)}`;
}

function navIcon(id) {
  const paths = {
    dashboard: '<path d="M3 10.5 10 4l7 6.5v6a1.5 1.5 0 0 1-1.5 1.5h-11A1.5 1.5 0 0 1 3 16.5z"/><path d="M8 18v-5h4v5"/>',
    execution: '<circle cx="10" cy="10" r="7.5"/><path d="m8.5 7 4.5 3-4.5 3z"/>',
    domains: '<path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z"/>',
    projects: '<path d="M2.5 6.5h6l1.5 2h7.5v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M2.5 8.5v-3a2 2 0 0 1 2-2h3l1.5 2h4"/>',
    autopilot: '<path d="M3 17V9m5 8V5m5 12v-6m5 6V3"/>',
    actions: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><path d="M12 14.5h5m-2.5-2.5v5"/>',
    config: '<circle cx="10" cy="10" r="2.5"/><path d="M16.4 12.5a1.4 1.4 0 0 0 .3 1.5l.1.1-2.7 2.7-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.9 1.3V18H8.4v-.3a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1-2.7-2.7.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.9H2V8.4h.3a1.4 1.4 0 0 0 1.3-.9A1.4 1.4 0 0 0 3.3 6l-.1-.1 2.7-2.7.1.1a1.4 1.4 0 0 0 1.5.3 1.4 1.4 0 0 0 .9-1.3V2h3.2v.3a1.4 1.4 0 0 0 .9 1.3A1.4 1.4 0 0 0 14 3.3l.1-.1 2.7 2.7-.1.1a1.4 1.4 0 0 0-.3 1.5 1.4 1.4 0 0 0 1.3.9h.3v3.2h-.3a1.4 1.4 0 0 0-1.3.9Z"/>'
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[id] ?? '<circle cx="10" cy="10" r="2"/>'}</svg>`;
}

function nav(activeId, auth = {}, activeProjectId = "") {
  const visibleRoutes = new Set(visibleConsoleRouteIds(auth));
  const primaryIds = ["dashboard", "execution", "domains", "projects", "autopilot"];
  const renderLinks = (ids) => ids.map((id) => consoleWebRoutes.find((route) => route.id === id)).filter((route) => route && visibleRoutes.has(route.id)).map((route) => {
    const active = route.id === activeId ? "active" : "";
    return `<a class="${active}" href="${routeHref(route.navPath, activeProjectId)}" title="${escapeHtml(route.label)}"><span class="nav-icon">${navIcon(route.id)}</span><span class="nav-label">${escapeHtml(route.label)}</span></a>`;
  }).join("");
  return `<nav class="top-nav"><span class="nav-group-label">Workspace</span>${renderLinks(primaryIds)}<span class="nav-spacer"></span><span class="nav-group-label">System</span>${renderLinks(["actions", "config"])}</nav>`;
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

function inlineDetails(title, value) {
  return `<details class="mini-details"><summary>${escapeHtml(title)}</summary>${jsonBlock(value)}</details>`;
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

function toneLabel(label, tone = "local") {
  return `<span class="status-label ${normalizeToken(tone)}">${escapeHtml(label)}</span>`;
}

function executionModeForRisk(risk) {
  if (risk === "CRITICAL") return "human_approval_required";
  if (risk === "HIGH") return "proposal_only";
  return "direct_execute";
}

function governanceGateForRisk(risk) {
  if (risk === "CRITICAL") return "HUMAN_APPROVAL_REQUIRED";
  if (risk === "HIGH") return "PROPOSAL_ONLY";
  return "ALLOW_DIRECT_EXECUTE";
}

function executionModeLabel(mode = "dry_run_only") {
  if (mode === "human_approval_required") return "human_approval_required";
  if (mode === "proposal_only") return "proposal_only";
  if (mode === "direct_execute") return "direct_execute";
  return "dry_run_only";
}

function governanceGateForMode(mode = "dry_run_only") {
  if (mode === "human_approval_required") return "HUMAN_APPROVAL_REQUIRED";
  if (mode === "proposal_only") return "PROPOSAL_ONLY";
  if (mode === "direct_execute") return "ALLOW_DIRECT_EXECUTE";
  return "ALLOW_DRY_RUN";
}

function formOption(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function projectStatusText(item = {}) {
  if (item.connection_status === "CONNECTED" || item.status === "CONNECTED") return "已连接";
  if (item.connection_status === "NOT_CONNECTED" || item.status === "NOT_CONNECTED") return "未连接";
  if (item.connection_status === "PLANNED" || item.status === "PLANNED") return "规划中";
  return item.connection_status ?? item.status ?? "未知";
}

function projectDisplayLabel(item) {
  return `${item.project_id}（${projectStatusText(item)}）`;
}

function lifecycleSummary(data) {
  return data.project_router.lifecycle_summary ?? {
    total: 0,
    pending_approval: 0,
    proposal_only: 0,
    ready_inject: 0,
    injected: 0,
    blocked: 0,
    proposal_missing: 0
  };
}

function lifecycleRecords(data) {
  return data.project_router.lifecycle_records ?? [];
}

function workspaceModeOptions() {
  return [
    formOption("auto", "自动", true),
    formOption("agent", "指定 Agent"),
    formOption("plan_only", "只生成计划")
  ].join("");
}

function aiAgentOptions() {
  return [
    formOption("auto", "自动选择", true),
    formOption("codex-cli", "Codex CLI"),
    formOption("claude-code", "Claude Code"),
    formOption("gemini-cli", "Gemini CLI"),
    formOption("deepseek-chat", "DeepSeek"),
    formOption("qwen-plus", "通义千问"),
    formOption("openhands", "OpenHands"),
    formOption("aider", "Aider"),
    formOption("local-agent", "Local Agent")
  ].join("");
}

function topStatusBar(model, data, auth = {}) {
  const chips = [
    { value: `项目 · ${model.active_project}`, tone: "primary" },
    { value: `${model.modules.workers} 个 Worker 在线`, tone: "default" },
    { value: (data.autopilot.latest_summary?.validation ?? "unknown") === "PASS" ? "系统运行正常" : "系统需要关注", tone: (data.autopilot.latest_summary?.validation ?? "unknown") === "PASS" ? "success" : "warning" }
  ];
  return `<div class="top-status compact">
    ${chips.map((chip) => `<span class="top-status-pill ${chip.tone}">${escapeHtml(chip.value)}</span>`).join("")}
  </div>`;
}

function authHeaderBar(auth = {}) {
  if (auth.authenticated) {
    const primaryRole = Array.isArray(auth.roles) && auth.roles.length > 0
      ? (auth.roles[0].display_name || auth.roles[0].role_id)
      : "已授权";
    return `<div class="auth-strip">
      <div class="auth-identity">
        <strong>${escapeHtml(auth.user?.display_name || auth.user?.username || "已登录")}</strong>
        <span>${escapeHtml(primaryRole)}</span>
      </div>
      <div class="auth-actions">
        <button type="button" id="auth-logout" class="secondary auth-logout">退出</button>
      </div>
    </div>`;
  }
  return "";
}

function alertTone(level = "info") {
  if (level === "warning") return "warn-pill";
  if (level === "notice") return "pill";
  return "pill";
}

function accessEntitlementPanel(auth = {}) {
  const entitlement = auth.entitlement ?? null;
  if (!auth.authenticated || !entitlement) return "";
  const alerts = Array.isArray(entitlement.alerts) ? entitlement.alerts : [];
  const runtimeText = Array.isArray(entitlement.runtime_allowlist) && entitlement.runtime_allowlist.length > 0
    ? (entitlement.runtime_allowlist.includes("*") ? "全 Runtime" : entitlement.runtime_allowlist.join(" / "))
    : "未配置";
  const projectScopeText = entitlement.project_scope_limit == null || entitlement.project_scope_usage == null
    ? "不限"
    : `${entitlement.project_scope_usage}/${entitlement.project_scope_limit}`;
  const seatsText = entitlement.seat_limit == null || entitlement.seat_usage == null
    ? "不限"
    : `${entitlement.seat_usage}/${entitlement.seat_limit}`;
  return `<section class="panel access-entitlement-panel">
    <div class="section-head small">
      <h2>当前套餐边界</h2>
      <span class="pill">${escapeHtml(entitlement.plan_name)}</span>
    </div>
    <div class="grid">
      ${metric("席位", seatsText)}
      ${metric("项目范围", projectScopeText)}
      ${metric("并发上限", entitlement.worker_parallel_limit ?? "不限")}
      ${metric("Runtime", runtimeText)}
    </div>
    ${alerts.length > 0 ? `<div class="entitlement-alerts">${alerts.map((alert) => `<div class="entitlement-alert ${alert.level}">
      <div class="entitlement-alert-head">
        <strong>${escapeHtml(alert.title)}</strong>
        <span class="${alertTone(alert.level)}">${escapeHtml(alert.level === "warning" ? "需处理" : alert.level === "notice" ? "关注" : "提示")}</span>
      </div>
      <p>${escapeHtml(alert.detail)}</p>
      ${alert.action ? `<p class="help">${escapeHtml(alert.action)}</p>` : ""}
    </div>`).join("")}</div>` : `<p class="help">当前套餐额度运行正常，可继续本地安全执行。</p>`}
  </section>`;
}

function routeForbiddenPage(route, auth = {}) {
  const decision = evaluateConsoleRouteAccess(route.id, auth);
  return `<section class="panel">
    <div class="section-head small">
      <h2>当前账号未开通此模块</h2>
      <span class="pill warn-pill">Access Center</span>
    </div>
    <p>${escapeHtml(route.label)} 需要额外能力后才会展示或访问。请联系管理员为当前账号分配对应角色、套餐或项目范围。</p>
    <div class="grid" style="margin-top:12px;">
      ${metric("模块", route.label)}
      ${metric("缺少能力", decision.missing_capabilities.join(", ") || "none")}
      ${metric("当前直执上限", auth.direct_execute_max_risk || "LOW")}
    </div>
  </section>`;
}

function authVisualPanel() {
  return `<div class="auth-product-panel" aria-hidden="true">
    <span class="auth-orb orb-a"></span>
    <span class="auth-orb orb-b"></span>
    <span class="auth-line line-a"></span>
    <span class="auth-line line-b"></span>
    <span class="auth-node node-a"></span>
    <span class="auth-node node-b"></span>
    <span class="auth-node node-c"></span>
  </div>`;
}

function accessEntryPage(_data) {
  return `<section class="auth-shell auth-entry-shell">
    ${authVisualPanel()}
    <div class="auth-side entry-side">
      <span class="auth-kicker">Agent Studio</span>
      <h2>统一 AI 工作台</h2>
      <div class="auth-path-actions">
        <a class="primary-action auth-link-button" href="/login">登录</a>
        <a class="link-button auth-link-button" href="/register">申请加入</a>
      </div>
    </div>
  </section>`;
}

function accessLoginPage(_data) {
  return `<section class="auth-shell">
    ${authVisualPanel()}
    <div class="auth-side">
      <div class="auth-card-head">
        <span class="auth-kicker">Console Access</span>
        <h3>登录</h3>
      </div>
      <form id="auth-login-form" class="auth-form">
        <div>
          <label for="auth-username">用户名</label>
          <input id="auth-username" name="username" type="text" placeholder="请输入用户名" autocomplete="username">
        </div>
        <div>
          <label for="auth-password">密码</label>
          <input id="auth-password" name="password" type="password" placeholder="请输入密码" autocomplete="current-password">
        </div>
        <div class="button-row">
          <button type="submit" class="primary-action auth-submit-button">登录</button>
        </div>
        <p id="auth-status" class="help auth-status-copy">仅限已授权账号 · <a href="/register">申请加入</a></p>
      </form>
    </div>
  </section>`;
}

function accessRegisterPage(_data) {
  return `<section class="auth-shell">
    ${authVisualPanel()}
    <div class="auth-side">
      <div class="auth-card-head">
        <span class="auth-kicker">Team Beta</span>
        <h3>申请加入</h3>
      </div>
      <form id="auth-register-form" class="auth-form">
        <div>
          <label for="register-display-name">姓名</label>
          <input id="register-display-name" name="display_name" type="text" placeholder="请输入姓名" autocomplete="name">
        </div>
        <div>
          <label for="register-username">用户名</label>
          <input id="register-username" name="username" type="text" placeholder="请输入用户名" autocomplete="username">
        </div>
        <div>
          <label for="register-request-type">申请类型</label>
          <select id="register-request-type" name="request_type">
            ${formOption("viewer", "只读观察 / Starter", true)}
            ${formOption("operator", "项目执行 / Team")}
            ${formOption("reviewer", "审批审阅 / Team")}
          </select>
        </div>
        <div>
          <label for="register-comment">申请说明</label>
          <textarea id="register-comment" name="request_comment" placeholder="项目或使用场景"></textarea>
        </div>
        <div class="button-row">
          <button type="submit" class="primary-action auth-submit-button">提交申请</button>
        </div>
        <p id="auth-status" class="help auth-status-copy">已有账号？<a href="/login">返回登录</a></p>
      </form>
    </div>
  </section>`;
}

function actionWorkbench(data, title = "统一 AI 开发工作台") {
  const activeProjectId = data.active_project_id
    ?? data.actionServer.projects[0]?.project_id
    ?? data.project_router.projects?.[0]?.project_id
    ?? "workspace";
  const activeProjectLabel = data.active_project?.project_name ?? data.active_project?.label ?? activeProjectId;
  const projectOptions = data.actionServer.projects.map((item) => formOption(item.project_id, projectDisplayLabel(item), item.project_id === activeProjectId));
  const projectCards = data.actionServer.projects.map((item) => `<button type="button" class="project-row${item.project_id === activeProjectId ? " active" : ""}" data-project-select="${escapeHtml(item.project_id)}">
    <strong>${escapeHtml(item.label)}</strong>
    <span>${escapeHtml(projectStatusText(item))}</span>
  </button>`);
  const flowSteps = ["已理解目标", "选择项目", "Agent/Runtime", "生成计划", "Governance", "执行/审批", "结果报告"];
  const quickActions = [
    ["context-summary", "读取上下文"],
    ["project-inspect", "检查当前项目"],
    ["project-dispatch", "生成派发计划"],
    ["proposal-review", "待审批 Proposal"],
    ["release-local-preview", "本地预览"],
    ["release-server-preview", "服务器预览"],
    ["release-reviewed-publish", "发布确认"],
    ["worker-health", "Worker 状态"],
    ["ai-runtime-status", "Codex / Claude"]
  ];
  return `<section class="workspace-shell">
    <aside class="project-rail">
      <div class="rail-header">
        <span class="rail-label">项目</span>
        <span class="pill">Pilot</span>
      </div>
      <div class="project-list">${projectCards.join("")}</div>
    </aside>
    <div class="ai-workspace chat-workspace">
      <div class="workspace-hero compact-hero">
        <div class="workspace-title">
          <span class="eyebrow">Antigravity Mode</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="workspace-meta">
          <span class="meta-chip">127.0.0.1</span>
          <span class="meta-chip">LOCAL</span>
          <span class="meta-chip">READ-SAFE</span>
        </div>
      </div>
      ${accessEntitlementPanel(data.renderAuth ?? {})}
      <div class="quick-row compact-quick-row">
        ${quickActions.map(([id, label]) => {
          const goal = id === "project-inspect"
            ? `检查 ${activeProjectLabel}`
            : id === "project-dispatch"
              ? `为 ${activeProjectLabel} 生成派发计划`
              : id === "proposal-review"
                ? `查看 ${activeProjectLabel} 待审批 Proposal`
                : id === "ai-runtime-status"
                  ? "检查 Codex / Claude 接入状态"
                  : label;
          return `<button type="button" class="quick-chip" data-quick-action="${escapeHtml(id)}" data-goal="${escapeHtml(goal)}">${escapeHtml(label)}</button>`;
        }).join("")}
      </div>
      <div id="conversation-stream" class="conversation-stream" aria-live="polite">
        <div class="terminal-line assistant">$ READY</div>
      </div>
      <div class="execution-console">
        <div class="timeline-strip">
          <span class="timeline-label">执行</span>
          <span id="run-state" class="timeline-state ready">待操作</span>
          <div id="flow-rail" class="flow-rail">${flowSteps.map((name, index) => `<span class="flow-step pending"><span class="flow-dot"></span><strong>${escapeHtml(name)}</strong></span>${index < flowSteps.length - 1 ? '<span class="flow-separator">→</span>' : ""}`).join("")}</div>
        </div>
        <details class="run-details">
          <summary>展开详情</summary>
          <div class="action-feedback-grid">
            <div><span>run_id</span><strong id="action-run-id">未生成</strong></div>
            <div><span>状态</span><strong id="action-status" class="status-label ready">待操作</strong></div>
            <div><span>风险</span><strong id="action-risk">未评估</strong></div>
            <div><span>日志路径</span><strong id="action-log-path">${escapeHtml(data.action_log.latest_path ?? "未生成")}</strong></div>
          </div>
          <label for="action-command">命令摘要</label>
          <pre id="action-command">等待开始</pre>
          <label for="action-output">结果摘要</label>
          <pre id="action-output">${escapeHtml(data.action_log.latest_summary ?? "输入目标后点击开始。")}</pre>
          <label for="action-error">stderr / error message</label>
          <pre id="action-error">无</pre>
        </details>
      </div>
      <div class="composer">
        <label for="action-goal">目标</label>
        <textarea id="action-goal" class="goal-box command-input" placeholder="输入目标，例如：继续推进当前项目巡检闭环">继续推进 ${escapeHtml(activeProjectLabel)}</textarea>
        <div class="attachment-toolbar">
          <div class="attachment-toolbar-head">
            <label class="attachment-label" for="action-attachments">图片 / 文件</label>
            <button type="button" id="attachment-trigger" class="secondary attach-button">上传附件</button>
            <input id="action-attachments" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.doc,.docx,.xls,.xlsx" hidden>
          </div>
          <div id="attachment-list" class="attachment-list empty">
            <span class="attachment-empty">未添加附件。上传图片后会生成预览，开始执行时会把文件写入本地 action log 附件目录并交给 Agent 读取。</span>
          </div>
        </div>
        <div class="workspace-controls">
          <div>
            <label for="action-project">项目</label>
            <select id="action-project">${projectOptions.join("")}</select>
          </div>
          <div>
            <label for="action-mode">模式</label>
            <select id="action-mode">${workspaceModeOptions()}</select>
          </div>
          <div>
            <label for="action-agent">Agent</label>
            <select id="action-agent">${aiAgentOptions()}</select>
          </div>
          <input type="hidden" id="action-type" value="workspace-default">
          <input type="hidden" id="proposal-task-id" value="">
          <button type="button" class="primary-action start-button" data-console-action="start">开始</button>
          <button type="button" class="danger cancel-button" data-console-action="cancel">停止</button>
        </div>
      </div>
    </div>
    <aside class="advanced-config">
      <div class="rail-header">
        <span class="rail-label">侧栏</span>
        <span class="pill">折叠信息</span>
      </div>
      <div class="side-stack">
        <div class="side-panel">
          <span class="side-kicker">当前策略</span>
          <div class="policy-strip compact-policy">
            <span>${riskBadge("LOW")} 直执</span>
            <span>${riskBadge("MEDIUM")} 直执</span>
            <span>${riskBadge("HIGH")} Proposal</span>
            <span>${riskBadge("CRITICAL")} 审批</span>
          </div>
        </div>
        <div class="side-panel">
          <span class="side-kicker">日志</span>
          <p id="side-log-path">${escapeHtml(data.action_log.latest_path ?? data.actionServer.action_log_dir)}</p>
        </div>
      </div>
      <details>
        <summary>运行环境</summary>
      </details>
      <details>
        <summary>Agent 调度</summary>
      </details>
      <details>
        <summary>认证与凭证</summary>
      </details>
      <details>
        <summary>安全审批</summary>
      </details>
      <details>
        <summary>项目配置</summary>
      </details>
    </aside>
  </section>`;
}

function smartParkEntryPanel(data) {
  const activeProjectLabel = data.active_project?.project_name ?? data.active_project?.label ?? data.active_project_id ?? "当前项目";
  return `<section class="smart-entry">
    <div class="section-head">
      <div>
        <h2>${escapeHtml(activeProjectLabel)} 工作入口</h2>
        <p>先检查当前项目状态、派发计划和待审批 Proposal；不会绕过治理闸门，也不会写入业务项目。</p>
      </div>
      <span class="pill warn-pill">生产审批不可绕过</span>
    </div>
    <div class="entry-grid">
      <button type="button" data-quick-action="project-inspect" data-goal="${escapeHtml(`检查 ${activeProjectLabel}`)}">检查当前项目</button>
      <button type="button" class="secondary" data-quick-action="project-dispatch" data-goal="${escapeHtml(`为 ${activeProjectLabel} 生成派发计划`)}">生成派发计划</button>
      <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="${escapeHtml(`查看 ${activeProjectLabel} 待审批 Proposal`)}">查看待审批 Proposal</button>
      <button type="button" class="secondary" data-quick-action="autopilot-dry-run" data-goal="${escapeHtml(`继续推进 ${activeProjectLabel}`)}">Autopilot 规划</button>
      <button type="button" class="secondary" data-quick-action="worker-health" data-goal="查看 Worker 状态">查看 Worker 状态</button>
    </div>
  </section>`;
}

function recommendationPanel(data) {
  const lifecycle = lifecycleSummary(data);
  const recommendation = data.project_router.lifecycle_next_recommendation
    ?? data.autopilot.latest_summary?.next_recommendation
    ?? "运行 Autopilot dry-run 以刷新下一步建议。";
  const directItems = data.project_router.lifecycle_direct_actions?.length
    ? data.project_router.lifecycle_direct_actions
    : ["当前没有可直接注入的 Proposal。先生成 dispatch plan 或完成审批。"];
  const approvalItems = data.project_router.lifecycle_approval_items?.length
    ? data.project_router.lifecycle_approval_items
    : ["当前没有待审批 Proposal。"];
  const blockerItems = data.project_router.lifecycle_blocker_items?.length
    ? data.project_router.lifecycle_blocker_items
    : ["当前没有 queue audit / proposal 阻断项。"];
  const completedItems = data.project_router.lifecycle_completed_items?.length
    ? data.project_router.lifecycle_completed_items
    : ["当前还没有已入队任务。"];
  return `<section>
    <div class="section-head"><h2>推荐动作区</h2><span class="pill">Planning / Governance</span></div>
    <div class="grid">
      ${metric("待审批", lifecycle.pending_approval)}
      ${metric("待注入", lifecycle.ready_inject)}
      ${metric("已入队", lifecycle.injected)}
      ${metric("阻断项", lifecycle.blocked + lifecycle.proposal_missing)}
    </div>
    <div class="kanban-grid">
      <div class="panel"><h3>下一步建议</h3><p>${escapeHtml(recommendation)}</p></div>
      <div class="panel"><h3>可直接执行</h3>${list(directItems)}</div>
      <div class="panel"><h3>仍需审批</h3>${list(approvalItems)}</div>
      <div class="panel"><h3>已完成/阻断</h3>${list([...completedItems.slice(0, 2), ...blockerItems.slice(0, 2)])}</div>
    </div>
  </section>`;
}

function projectLifecycleOverview(data) {
  const lifecycle = lifecycleSummary(data);
  const recommendation = data.project_router.lifecycle_next_recommendation
    ?? "先生成 dispatch plan，再完成 Proposal 审批与 queue injection。";
  const activeProjectLabel = data.active_project?.project_name ?? data.active_project?.label ?? data.active_project_id ?? "当前项目";
  const directItems = data.project_router.lifecycle_direct_actions?.length
    ? data.project_router.lifecycle_direct_actions.slice(0, 3)
    : ["当前没有可直接注入的任务。"];
  const blockerItems = data.project_router.lifecycle_blocker_items?.length
    ? data.project_router.lifecycle_blocker_items.slice(0, 3)
    : ["当前没有阻断项。"];
  return `<section>
    <div class="section-head"><h2>项目闭环状态</h2><span class="pill">project router lifecycle</span></div>
    <div class="grid">
      ${metric("派发总数", lifecycle.total)}
      ${metric("待审批", lifecycle.pending_approval)}
      ${metric("待注入", lifecycle.ready_inject)}
      ${metric("已入队", lifecycle.injected)}
      ${metric("阻断项", lifecycle.blocked + lifecycle.proposal_missing)}
    </div>
    <div class="kanban-grid">
      <div class="panel">
        <h3>当前建议</h3>
        <p>${escapeHtml(recommendation)}</p>
        <div class="button-row compact-row" style="margin-top:10px;">
          <button type="button" class="secondary" data-quick-action="project-inspect" data-goal="${escapeHtml(`检查 ${activeProjectLabel}`)}">检查项目</button>
          <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="${escapeHtml(`查看 ${activeProjectLabel} Proposal`)}">查看 Proposal</button>
        </div>
      </div>
      <div class="panel"><h3>可直接推进</h3>${list(directItems)}</div>
      <div class="panel"><h3>当前阻断</h3>${list(blockerItems)}</div>
    </div>
  </section>`;
}

function executionTimeline() {
  const steps = [
    ["Planning", "READY", "目标解析与 batch plan"],
    ["Governance", "PASS", "LOW/MEDIUM 直接执行，HIGH/CRITICAL 拦截"],
    ["Worker", "LOCAL", "仅本地 child_process allowlist"],
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
    <div class="section-head"><h2>Worker 实时状态</h2><span class="pill">agent-1~5 / 本地执行</span></div>
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

function dispatchLifecyclePanel(data) {
  const records = lifecycleRecords(data);
  const rows = records.slice(0, 8).map((item) => ({
    task: item.task_id,
    stage: `<div class="proposal-evidence">
      ${toneLabel(item.dispatch_stage === "missing" ? "未生成 dispatch plan" : item.dispatch_stage, item.dispatch_stage === "missing" ? "blocked" : "local")}
      <span class="help">${escapeHtml(item.runtime_id)} / ${escapeHtml(item.worker_id)} / ${escapeHtml(item.execution_route)}</span>
    </div>`,
    proposal: toneLabel(item.approval_status, item.approval_status === "APPROVED" ? "pass" : "proposal-only"),
    queue: `<div class="proposal-evidence">
      ${toneLabel(item.queue_audit_status, item.queue_audit_status === "PASS" ? "pass" : item.queue_audit_status === "missing" ? "local" : "blocked")}
      <span class="help">queue: ${escapeHtml(item.queue_task_status)} / audit: ${escapeHtml(item.audit_id || "none")} / preflight: ${escapeHtml(item.controlled_queue_status || "missing")} / claim: ${escapeHtml(item.worker_claim_status || "missing")} / rebuild: ${escapeHtml(item.queue_rebuild_status || "unknown")}</span>
    </div>`,
    next: `<div class="proposal-evidence">
      ${toneLabel(item.lifecycle_label, item.lifecycle)}
      <span class="help">${escapeHtml(item.blockers[0] ?? item.next_stage ?? "无")}${item.approved_at ? ` / approved_at: ${escapeHtml(item.approved_at)}` : ""}</span>
    </div>`
  }));
  return `<section>
    <div class="section-head"><h2>派发闭环总览</h2><span class="pill">dispatch → proposal → queue audit</span></div>
    ${rows.length > 0 ? table(rows, [
      { key: "task", label: "task" },
      { key: "stage", label: "dispatch", html: true },
      { key: "proposal", label: "proposal", html: true },
      { key: "queue", label: "queue audit", html: true },
      { key: "next", label: "next", html: true }
    ]) : `<div class="panel"><p class="help">当前没有派发闭环记录。先生成 dispatch plan。</p></div>`}
  </section>`;
}

function proposalPanel(data) {
  const records = lifecycleRecords(data);
  const summary = lifecycleSummary(data);
  const rows = records.slice(0, 8).map((item) => {
    const risk = item.risk ?? "MEDIUM";
    const approvalStatus = item.approval_status ?? "PROPOSED";
    const queueAuditStatus = item.queue_audit_status ?? "missing";
    const queueTaskStatus = item.queue_task_status ?? "pending";
    const lifecycleLabel = item.lifecycle_label ?? "待注入";
    const lifecycleTone = item.lifecycle ?? "ready_inject";
    const blockerLabel = item.blockers[0] ?? "LOW / MEDIUM 可直接审批并入队";
    const blockerTone = item.lifecycle === "blocked" ? "blocked" : item.lifecycle === "needs_approval" ? "proposal-only" : item.lifecycle === "injected" ? "pass" : "ready";
    let actionHtml = `<div class="button-row compact-row">
      <button type="button" class="secondary" data-proposal-action="proposal-review" data-proposal-task="${escapeHtml(item.task_id ?? "")}">查看</button>
      <button type="button" class="secondary" data-proposal-action="proposal-approve-dry-run" data-proposal-task="${escapeHtml(item.task_id ?? "")}">审批 dry-run</button>
      <button type="button" class="primary" data-proposal-action="proposal-approve-apply" data-proposal-task="${escapeHtml(item.task_id ?? "")}">审批并入队</button>
    </div>`;

    if (item.lifecycle === "injected") {
      actionHtml = `<div class="button-row compact-row">
        <button type="button" class="secondary" data-proposal-action="proposal-review" data-proposal-task="${escapeHtml(item.task_id ?? "")}">查看</button>
        ${item.worker_claim_status === "PASS" || item.controlled_queue_status === "CLAIMED_DRY_RUN_READY"
          ? `<span class="help">Worker 已领取</span>`
          : `<button type="button" class="primary" data-proposal-action="worker-claim-preflight" data-proposal-task="${escapeHtml(item.task_id ?? "")}">领取 Worker</button>`}
      </div>`;
    } else if (item.lifecycle === "proposal_only") {
      actionHtml = `<div class="button-row compact-row">
        <button type="button" class="secondary" data-proposal-action="proposal-review" data-proposal-task="${escapeHtml(item.task_id ?? "")}">查看</button>
        <span class="help">保持人工审批</span>
      </div>`;
    }

    return {
      id: item.task_id,
      risk: riskBadge(risk),
      approval: toneLabel(approvalStatus, approvalStatus === "APPROVED" ? "pass" : "proposal-only"),
      lifecycle: toneLabel(lifecycleLabel, lifecycleTone),
      blocker: `<div class="proposal-evidence">
        ${toneLabel(blockerLabel, blockerTone)}
        <span class="help">queue: ${escapeHtml(queueTaskStatus)} / audit: ${escapeHtml(queueAuditStatus)} / preflight: ${escapeHtml(item.controlled_queue_status || "missing")} / claim: ${escapeHtml(item.worker_claim_status || "missing")}${item.approved_by ? ` / by: ${escapeHtml(item.approved_by)}` : ""}</span>
      </div>`,
      evidence: `<div class="proposal-evidence">
        <span class="help">${escapeHtml(item.audit_id || "no_audit_id")}${item.queue_event_file ? ` / event: ${escapeHtml(item.queue_event_file)}` : ""}</span>
        ${item.dispatch_path ? inlineDetails("dispatch", item.dispatch) : ""}
        ${item.proposal_path ? inlineDetails("proposal", item.proposal) : ""}
        ${item.audit_path ? inlineDetails("audit", item.audit) : ""}
        ${item.worker_claim_path ? inlineDetails("claim", item.worker_claim) : ""}
      </div>`,
      actions: actionHtml
    };
  });
  return `<section>
    <div class="section-head"><h2>Proposal 审批区</h2><span class="pill warn-pill">业务代码写入仍禁用</span></div>
    <div class="grid">
      ${metric("总 Proposal", summary.total)}
      ${metric("待审批", summary.pending_approval)}
      ${metric("待注入", summary.ready_inject)}
      ${metric("已入队", summary.injected)}
      ${metric("已领取", summary.worker_claimed)}
      ${metric("人工审批", summary.proposal_only)}
      ${metric("入队受阻", summary.blocked + summary.proposal_missing)}
    </div>
    <div class="panel">
      <p class="help">LOW / MEDIUM 可在 Console 内审批并注入任务队列；HIGH / CRITICAL 保持 proposal_only；所有项目业务代码写入仍通过独立受控流程执行。</p>
    </div>
    ${rows.length > 0 ? table(rows, [
      { key: "id", label: "proposal list" },
      { key: "risk", label: "risk", html: true },
      { key: "approval", label: "approval_required", html: true },
      { key: "lifecycle", label: "lifecycle", html: true },
      { key: "blocker", label: "evidence / blocker", html: true },
      { key: "evidence", label: "details", html: true },
      { key: "actions", label: "action", html: true }
    ]) : `<div class="panel"><p class="help">当前没有可审 Proposal。先执行项目派发计划，再进入 Proposal Review。</p></div>`}
  </section>`;
}

const releaseStageCatalog = [
  { id: "local_preview", label: "本地预览", hint: "本地 build / smoke / consistency key" },
  { id: "server_preview", label: "服务器预览", hint: "确认远端预览与本地快照一致" },
  { id: "reviewed_publish", label: "Reviewed Publish", hint: "最终确认 reviewed publish 快照" }
];

function releaseStageAction(stageId) {
  if (stageId === "local_preview") {
    return {
      actionId: "release-local-preview",
      label: "确认本地预览",
      goal: "确认本地预览一致性"
    };
  }
  if (stageId === "server_preview") {
    return {
      actionId: "release-server-preview",
      label: "确认服务器预览",
      goal: "确认服务器预览一致性"
    };
  }
  if (stageId === "reviewed_publish") {
    return {
      actionId: "release-reviewed-publish",
      label: "确认发布",
      goal: "确认 reviewed publish 一致性"
    };
  }
  return null;
}

function releaseGateTone(status) {
  if (status === "PASS") return "pass";
  if (status === "PENDING_REVIEW" || status === "READY") return "ready";
  if (status === "missing" || status === "pending") return "local";
  return "blocked";
}

function releasePromotionViewModel(data) {
  const release = data.release_consistency ?? {};
  const stageMap = new Map((Array.isArray(release.promotion_stages) ? release.promotion_stages : []).map((stage) => [stage.stage_id, stage]));
  const warnings = Array.isArray(release.warnings) ? release.warnings : [];
  const currentIndex = releaseStageCatalog.findIndex((stage) => stage.id === release.promotion_next_stage);
  const stages = releaseStageCatalog.map((definition, index) => {
    const stage = stageMap.get(definition.id) ?? {};
    const status = stage.status ?? "missing";
    const previousDefinition = index > 0 ? releaseStageCatalog[index - 1] : null;
    const previousStage = previousDefinition ? stageMap.get(previousDefinition.id) : null;
    const previousPassed = previousDefinition ? previousStage?.status === "PASS" : true;
    const action = releaseStageAction(definition.id);
    const runnable = Boolean(action) && previousPassed && status !== "PASS";
    const blockedReason = !previousPassed
      ? `等待 ${previousDefinition.label} 通过后再继续。`
      : (stage.gate_reason || (status === "PASS" ? "当前阶段已通过。" : "尚未生成该阶段记录。"));
    return {
      ...definition,
      status,
      tone: releaseGateTone(status),
      consistencyKey: stage.consistency_key || stage.source_consistency_key || release.promotion_consistency_key || "pending",
      recordedAt: stage.recorded_at || "pending",
      dependsOn: stage.depends_on || previousDefinition?.id || "none",
      current: currentIndex >= 0 ? index === currentIndex : release.promotion_next_stage === "completed" && index === releaseStageCatalog.length - 1,
      runnable,
      action,
      blockedReason,
      checkCount: Array.isArray(stage.checks) ? stage.checks.length : 0
    };
  });

  const passCount = stages.filter((stage) => stage.status === "PASS").length;
  const nextStageLabel = release.promotion_next_stage === "completed"
    ? "全部完成"
    : (releaseStageCatalog.find((stage) => stage.id === release.promotion_next_stage)?.label ?? "未生成");
  const overallLabel = warnings.length > 0 && release.status === "PASS"
    ? "PASS_WITH_WARNINGS"
    : (release.status ?? "未生成");

  return {
    release,
    stages,
    warnings,
    passCount,
    nextStageLabel,
    overallLabel
  };
}

function releasePromotionPanel(data) {
  const { release, stages, warnings, passCount, nextStageLabel, overallLabel } = releasePromotionViewModel(data);
  const stageRows = stages.map((stage) => ({
    stage: stage.label,
    status: toneLabel(stage.status === "PASS" ? "PASS" : stage.status, stage.tone),
    key: stage.consistencyKey,
    recorded: stage.recordedAt,
    depends_on: stage.dependsOn,
    action: stage.runnable && stage.action
      ? `<button type="button" class="secondary" data-quick-action="${escapeHtml(stage.action.actionId)}" data-goal="${escapeHtml(stage.action.goal)}">${escapeHtml(stage.action.label)}</button>`
      : `<span class="help">${escapeHtml(stage.status === "PASS" ? "已确认" : stage.blockedReason)}</span>`
  }));
  return `<section>
    <div class="section-head"><h2>发布闸门</h2><span class="pill">local / server / reviewed</span></div>
    <div class="grid">
      ${metric("一致性状态", overallLabel)}
      ${metric("Consistency Key", release.promotion_consistency_key ?? "未生成")}
      ${metric("已通过", `${passCount}/${stages.length}`)}
      ${metric("下一闸门", nextStageLabel)}
      ${metric("Warnings", warnings.length)}
    </div>
    <div class="kanban-grid">
      ${stages.map((stage) => `<div class="panel">
        <div class="section-head small">
          <h3>${escapeHtml(stage.label)}</h3>
          ${toneLabel(stage.status === "PASS" ? "PASS" : stage.status, stage.tone)}
        </div>
        <p class="help">${escapeHtml(stage.hint)}</p>
        <div class="grid" style="margin-top:10px;">
          ${metric("依赖", stage.dependsOn)}
          ${metric("检查项", stage.checkCount)}
        </div>
        <p class="help" style="margin-top:10px;">${escapeHtml(stage.blockedReason)}</p>
        <div class="button-row compact-row" style="margin-top:10px;">
          ${stage.runnable && stage.action
            ? `<button type="button" class="primary" data-quick-action="${escapeHtml(stage.action.actionId)}" data-goal="${escapeHtml(stage.action.goal)}">${escapeHtml(stage.action.label)}</button>`
            : `<span class="help">${escapeHtml(stage.status === "PASS" ? "当前阶段已完成" : "等待条件满足")}</span>`}
        </div>
      </div>`).join("")}
    </div>
    ${warnings.length > 0 ? `<div class="panel">
      <div class="section-head small"><h3>当前告警</h3><span class="pill warn-pill">${warnings.length} 项</span></div>
      ${list(warnings)}
    </div>` : `<div class="panel"><p class="help">当前没有 release promotion 告警，可以继续按闸门推进。</p></div>`}
    ${stageRows.length > 0 ? table(stageRows, [
      { key: "stage", label: "阶段" },
      { key: "status", label: "status", html: true },
      { key: "key", label: "consistency key" },
      { key: "recorded", label: "recorded_at" },
      { key: "depends_on", label: "depends_on" },
      { key: "action", label: "动作", html: true }
    ]) : `<div class="panel"><p class="help">尚未生成 release consistency 工件。先执行 <code>studio release consistency --dry-run</code>。</p></div>`}
  </section>`;
}

function projectWorkbench(data) {
  const rows = (data.project_router.projects ?? []).map((item) => ({
    project: item.project_id,
    status: projectStatusText(item),
    policy: item.write_policy === "disabled" ? "guarded / read-safe" : item.write_policy,
    next: item.connection_status === "CONNECTED" ? "dispatch / inspect" : "attach / bind"
  }));
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
  const authLoginForm = document.getElementById("auth-login-form");
  const authRegisterForm = document.getElementById("auth-register-form");
  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
  const registerDisplayName = document.getElementById("register-display-name");
  const registerUsername = document.getElementById("register-username");
  const registerRequestType = document.getElementById("register-request-type");
  const registerComment = document.getElementById("register-comment");
  const authStatus = document.getElementById("auth-status");
  const authLogout = document.getElementById("auth-logout");
  const output = document.getElementById("action-output");
  const errorOutput = document.getElementById("action-error");
  const statusEl = document.getElementById("action-status");
  const commandEl = document.getElementById("action-command");
  const riskEl = document.getElementById("action-risk");
  const logPathEl = document.getElementById("action-log-path");
  const sideLogPathEl = document.getElementById("side-log-path");
  const runIdEl = document.getElementById("action-run-id");
  const runStateEl = document.getElementById("run-state");
  const conversationStream = document.getElementById("conversation-stream");
  const flowRail = document.getElementById("flow-rail");
  const attachmentInput = document.getElementById("action-attachments");
  const attachmentTrigger = document.getElementById("attachment-trigger");
  const attachmentList = document.getElementById("attachment-list");
  const goal = document.getElementById("action-goal");
  const project = document.getElementById("action-project");
  const action = document.getElementById("action-type");
  const proposalTask = document.getElementById("proposal-task-id");
  const modeSelect = document.getElementById("action-mode");
  const agent = document.getElementById("action-agent");
  const projectConnectId = document.getElementById("project-connect-id");
  const projectConnectName = document.getElementById("project-connect-name");
  const projectConnectSource = document.getElementById("project-connect-source");
  const projectConnectLocalPath = document.getElementById("project-connect-local-path");
  const projectConnectUrl = document.getElementById("project-connect-url");
  const projectConnectBranch = document.getElementById("project-connect-branch");
  const projectConnectPackageManager = document.getElementById("project-connect-package-manager");
  const projectConnectType = document.getElementById("project-connect-type");
  const projectConnectDescription = document.getElementById("project-connect-description");
  const draftStatus = document.getElementById("config-draft-status");
  const currentProjectValue = () => (project ? project.value : "jinhu-smart-park");
  let currentRunId = null;
  let pollTimer = null;
  let selectedAttachments = [];
  const runAttachmentCache = new Map();
  const terminalStatuses = new Set(["PASS", "FAIL", "BLOCKED", "NEEDS_APPROVAL", "CANCELLED"]);
  const defaultTimeline = ["已理解目标", "选择项目", "Agent/Runtime", "生成计划", "Governance", "执行/审批", "结果报告"];

  function setAuthStatus(message, tone = "neutral") {
    if (!authStatus) return;
    authStatus.textContent = message || "未登录";
    authStatus.className = "help auth-status " + tone;
  }

  function normalize(value) {
    return String(value || "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
  }

  function escapeClient(value) {
    return String(value == null ? "" : value)
      .replaceAll("&", "&amp;")
      .replaceAll("<", "&lt;")
      .replaceAll(">", "&gt;")
      .replaceAll('"', "&quot;")
      .replaceAll("'", "&#39;");
  }

  function clipClient(value, maxLength) {
    const text = String(value == null ? "" : value);
    return text.length > maxLength ? text.slice(0, maxLength) + "\\n...输出已截断，完整内容见 action log。" : text;
  }

  function attachmentFingerprint(attachment) {
    return [attachment.name || "", attachment.size || attachment.size_bytes || "", attachment.lastModified || "", attachment.stored_path || ""].join("::");
  }

  function fileKind(attachment) {
    return String(attachment.kind || "").toLowerCase() === "image" || String(attachment.type || attachment.mime_type || "").startsWith("image/")
      ? "image"
      : "file";
  }

  function attachmentPreviewFor(attachment, cached = []) {
    const fingerprint = attachmentFingerprint(attachment);
    return cached.find((item) => attachmentFingerprint(item) === fingerprint || (item.name === attachment.name && Number(item.size || item.size_bytes) === Number(attachment.size || attachment.size_bytes)));
  }

  function renderAttachmentCard(attachment, options = {}) {
    const preview = options.preview || null;
    const kind = fileKind(attachment);
    const thumb = kind === "image" && preview?.previewUrl
      ? '<img class="attachment-thumb" src="' + escapeClient(preview.previewUrl) + '" alt="' + escapeClient(attachment.name || "attachment") + '">'
      : '<span class="attachment-thumb attachment-thumb-fallback">' + (kind === "image" ? "图" : "文") + '</span>';
    const meta = [
      attachment.mime_type || attachment.type || "application/octet-stream",
      attachment.size_label || (attachment.size ? Math.max(1, Math.round(Number(attachment.size) / 1024)) + " KB" : ""),
      attachment.width && attachment.height ? attachment.width + "×" + attachment.height : "",
      attachment.stored_path || ""
    ].filter(Boolean).join(" · ");
    const excerpt = attachment.text_excerpt || preview?.textExcerpt || "";
    const removable = options.removable
      ? '<button type="button" class="attachment-remove" data-attachment-remove="' + escapeClient(attachmentFingerprint(attachment)) + '">移除</button>'
      : "";
    return '<div class="attachment-card ' + kind + '">' + thumb + '<div class="attachment-meta"><strong>' + escapeClient(attachment.name || "未命名附件") + '</strong><span>' + escapeClient(meta || kind) + '</span>' + (excerpt ? '<em>' + escapeClient(clipClient(excerpt, 140)) + '</em>' : "") + '</div>' + removable + '</div>';
  }

  function renderAttachmentList() {
    if (!attachmentList) return;
    if (selectedAttachments.length === 0) {
      attachmentList.className = "attachment-list empty";
      attachmentList.innerHTML = '<span class="attachment-empty">未添加附件。上传图片后会生成预览，开始执行时会把文件写入本地 action log 附件目录并交给 Agent 读取。</span>';
      return;
    }
    attachmentList.className = "attachment-list";
    attachmentList.innerHTML = selectedAttachments.map((attachment) => renderAttachmentCard(attachment, {
      preview: attachment,
      removable: true
    })).join("");
    attachmentList.querySelectorAll("[data-attachment-remove]").forEach((button) => {
      button.addEventListener("click", () => {
        selectedAttachments = selectedAttachments.filter((item) => attachmentFingerprint(item) !== button.getAttribute("data-attachment-remove"));
        renderAttachmentList();
      });
    });
  }

  function readAsDataURL(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("readAsDataURL failed"));
      reader.readAsDataURL(file);
    });
  }

  function readAsText(file) {
    return new Promise((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => reject(reader.error || new Error("readAsText failed"));
      reader.readAsText(file);
    });
  }

  function readImageSize(dataUrl) {
    return new Promise((resolve, reject) => {
      const image = new Image();
      image.onload = () => resolve({ width: image.naturalWidth, height: image.naturalHeight });
      image.onerror = () => reject(new Error("image decode failed"));
      image.src = dataUrl;
    });
  }

  function isTextLike(file) {
    return String(file.type || "").startsWith("text/")
      || String(file.type || "").includes("json")
      || [".md", ".txt", ".json", ".csv", ".log", ".yaml", ".yml"].some((ext) => file.name.toLowerCase().endsWith(ext));
  }

  async function normalizeAttachment(file) {
    const dataUrl = await readAsDataURL(file);
    const attachment = {
      name: file.name,
      type: file.type || "application/octet-stream",
      size: file.size,
      lastModified: file.lastModified,
      kind: String(file.type || "").startsWith("image/") ? "image" : "file",
      data_url: dataUrl,
      previewUrl: String(file.type || "").startsWith("image/") ? dataUrl : "",
      textExcerpt: ""
    };
    if (attachment.kind === "image") {
      try {
        const size = await readImageSize(dataUrl);
        attachment.width = size.width;
        attachment.height = size.height;
      } catch {}
    }
    if (isTextLike(file)) {
      try {
        attachment.textExcerpt = clipClient(await readAsText(file), 1200);
      } catch {}
    }
    return attachment;
  }

  function setStatus(value) {
    if (!statusEl) return;
    const statusClass = {
      "待操作": "ready",
      "生成中": "local",
      "执行中": "local",
      "成功": "pass",
      "失败": "blocked",
      "需审批": "proposal-only",
      "已取消": "cancelled"
    }[value] || normalize(value);
    statusEl.textContent = value;
    statusEl.className = "status-label " + statusClass;
    if (runStateEl) {
      runStateEl.textContent = value;
      runStateEl.className = "timeline-state " + statusClass;
    }
  }

  function setText(element, value) {
    if (element) element.textContent = value || "无";
  }

  function statusFromRecord(record, fallback) {
    if (fallback) return fallback;
    if (record && record.status === "QUEUED") return "生成中";
    if (record && record.status === "RUNNING") return "执行中";
    if (record && record.status === "CANCELLED") return "已取消";
    if (record && record.result && record.result.status === "PASS") return "成功";
    if (record && record.result && record.result.status === "FAIL") return "失败";
    if (record && record.result && record.result.status === "BLOCKED") return "需审批";
    if (record && record.result && record.result.status === "NEEDS_APPROVAL") return "需审批";
    if (record && record.result && record.result.status === "CANCELLED") return "已取消";
    if (record && record.plan && record.plan.approval_required) return "需审批";
    if (record && record.plan) return "成功";
    return "待操作";
  }

  function renderActionResult(record, fallbackStatus) {
    const plan = record && record.plan ? record.plan : {};
    const result = record && record.result ? record.result : {};
    setStatus(statusFromRecord(record, fallbackStatus));
    setText(runIdEl, record && record.run_id ? record.run_id : (plan.plan_id || "未生成"));
    setText(commandEl, plan.command || plan.plan_command || record.command_summary || "未生成");
    setText(riskEl, plan.risk || "未评估");
    setText(logPathEl, record && record.logs ? (record.logs.json || record.logs.markdown || plan.log_path) : (plan.log_path || "未生成"));
    setText(sideLogPathEl, record && record.logs ? (record.logs.json || record.logs.markdown || plan.log_path) : (plan.log_path || "未生成"));
    const humanSummary = result.stdout_summary || [
      plan.plan_id ? "计划已生成" : "等待操作",
      plan.action_label ? "动作：" + plan.action_label : "",
      plan.target_project ? "项目：" + plan.target_project : "",
      plan.agent ? "Agent：" + plan.agent : "",
      plan.agent_fallback ? plan.agent_fallback : "",
      plan.workspace_mode ? "模式：" + plan.workspace_mode : "",
      plan.governance_gate ? "治理闸门：" + plan.governance_gate : ""
    ].filter(Boolean).join("\\n");
    setText(output, humanSummary);
    setText(errorOutput, result.stderr_summary || result.error || "");
  }

  function renderAttachmentBlock(attachments, runId) {
    if (!attachments || attachments.length === 0) return "";
    const cached = runId ? (runAttachmentCache.get(runId) || []) : attachments;
    return '<div class="attachment-bubble">' + attachments.map((attachment) => renderAttachmentCard(attachment, {
      preview: attachmentPreviewFor(attachment, cached)
    })).join("") + '</div>';
  }

  function optimisticMessages(body, attachments) {
    const text = escapeClient(body.goal || "继续推进 Pilot");
    const projectText = escapeClient(body.project_id || currentProjectValue());
    const agentText = escapeClient(body.agent || "auto");
    const modeText = escapeClient(body.workspace_mode || "auto");
    if (!conversationStream) return;
    conversationStream.innerHTML = [
      '<div class="terminal-line user">> ' + text + '</div>',
      renderAttachmentBlock(attachments),
      '<div class="terminal-line assistant">$ 已理解目标</div>',
      '<div class="terminal-line assistant">$ 项目 ' + projectText + '</div>',
      '<div class="terminal-line running">$ Agent/Runtime ' + agentText + ' / ' + modeText + ' ...</div>'
    ].join("");
    renderTimeline({ timeline: defaultTimeline.map((name, index) => ({ name, status: index === 0 ? "RUNNING" : "PENDING" })) });
    conversationStream.scrollTop = conversationStream.scrollHeight;
  }

  function renderConversation(record) {
    if (!conversationStream) return;
    const messages = Array.isArray(record && record.messages) ? record.messages : [];
    const transcript = Array.isArray(record && record.transcript) ? record.transcript : [];
    const attachments = Array.isArray(record?.plan?.attachments) ? record.plan.attachments : [];
    const lines = messages.map((message) => {
      const role = message.role === "user" ? "user" : "assistant";
      const prefix = role === "user" ? "> " : "$ ";
      const phase = message.phase ? "[" + escapeClient(message.phase) + "] " : "";
      return '<div class="terminal-line ' + role + '">' + prefix + phase + escapeClient(message.content) + '</div>';
    });
    if (attachments.length) lines.splice(1, 0, renderAttachmentBlock(attachments, record?.run_id));
    const logPath = record && record.logs ? (record.logs.json || record.logs.markdown || "") : (record && record.plan ? record.plan.log_path : "");
    const result = record && record.result ? record.result : {};
    if (record && record.run_id) lines.push('<div class="terminal-line assistant">$ run_id ' + escapeClient(record.run_id) + '</div>');
    if (logPath) lines.push('<div class="terminal-line assistant">$ log ' + escapeClient(logPath) + '</div>');
    if (transcript.length) {
      transcript.forEach((entry) => {
        const cssClass = escapeClient(entry.className || entry.source || "assistant");
        const prefix = entry.source === "stderr" ? "! " : (entry.source === "user" ? "> " : "$ ");
        lines.push('<div class="terminal-line ' + cssClass + '">' + prefix + escapeClient(entry.content) + '</div>');
      });
    } else if (result.stdout_summary) {
      lines.push('<div class="terminal-line assistant">$ 输出\\n' + escapeClient(clipClient(result.stdout_summary, 2200)) + '</div>');
    }
    if (result.stderr_summary) {
      lines.push('<div class="terminal-line fail">$ error\\n' + escapeClient(clipClient(result.stderr_summary, 1200)) + '</div>');
    }
    conversationStream.innerHTML = lines.join("");
    if (!terminalStatuses.has(record.status || "")) {
      conversationStream.innerHTML += '<div class="terminal-line running">$ 运行中 ... 正在刷新状态</div>';
    }
    conversationStream.scrollTop = conversationStream.scrollHeight;
  }

  function renderTimeline(record) {
    if (!flowRail || !Array.isArray(record && record.timeline)) return;
    flowRail.innerHTML = record.timeline.map((step, index) => {
      const status = normalize(step.status);
      const separator = index < record.timeline.length - 1 ? '<span class="flow-separator">→</span>' : "";
      return '<span class="flow-step ' + status + '"><span class="flow-dot"></span><strong>' + escapeClient(step.name) + '</strong><em>' + escapeClient(step.status) + '</em></span>' + separator;
    }).join("");
  }

  function renderRun(record) {
    renderActionResult(record);
    renderConversation(record);
    renderTimeline(record);
  }

  function actionForMode() {
    const selectedMode = modeSelect ? modeSelect.value : "auto";
    const selectedAgent = agent ? agent.value : "auto";
    if (selectedMode === "plan_only") return "goal-plan";
    if (selectedAttachments.length > 0) return "agent-real-plan";
    if (selectedMode === "agent" || selectedAgent !== "auto") return "agent-real-plan";
    return "workspace-goal";
  }

  function projectConnectPayload() {
    return {
      connect_project_id: projectConnectId ? projectConnectId.value.trim() : "",
      connect_project_name: projectConnectName ? projectConnectName.value.trim() : "",
      connect_source_type: projectConnectSource ? projectConnectSource.value.trim() : "auto",
      connect_local_path: projectConnectLocalPath ? projectConnectLocalPath.value.trim() : "",
      connect_url: projectConnectUrl ? projectConnectUrl.value.trim() : "",
      connect_default_branch: projectConnectBranch ? projectConnectBranch.value.trim() : "",
      connect_package_manager: projectConnectPackageManager ? projectConnectPackageManager.value.trim() : "",
      connect_project_type: projectConnectType ? projectConnectType.value.trim() : "",
      connect_description: projectConnectDescription ? projectConnectDescription.value.trim() : ""
    };
  }

  function payload(actionOverride) {
    const effectiveActionId = actionOverride || actionForMode();
    const body = {
      goal: goal ? goal.value : "继续推进 Pilot",
      project_id: currentProjectValue(),
      action_id: effectiveActionId,
      task_id: proposalTask && String(effectiveActionId).startsWith("proposal-") ? proposalTask.value : "",
      workspace_mode: modeSelect ? modeSelect.value : "auto",
      agent: agent ? agent.value : "auto",
      attachments: selectedAttachments.map((attachment) => ({
        name: attachment.name,
        type: attachment.type,
        size: attachment.size,
        lastModified: attachment.lastModified,
        kind: attachment.kind,
        width: attachment.width,
        height: attachment.height,
        text_excerpt: attachment.textExcerpt,
        data_url: attachment.data_url
      }))
    };
    if (String(effectiveActionId).startsWith("project-connect-")) {
      Object.assign(body, projectConnectPayload());
    }
    return body;
  }

  async function postJson(url, body) {
    const response = await fetch(url, {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify(body)
    });
    const text = await response.text();
    let value;
    try {
      value = text ? JSON.parse(text) : {};
    } catch (error) {
      value = { status: "FAIL", error: text || String(error) };
    }
    if (!response.ok) {
      if (response.status === 401) {
        setAuthStatus(value.reason || "登录态失效，请重新登录。", "error");
      }
      throw new Error(value.error || value.reason || text || "Action Server request failed");
    }
    return value;
  }

  async function startAction(actionOverride) {
    const body = payload(actionOverride);
    const submittedAttachments = [...selectedAttachments];
    currentRunId = null;
    if (pollTimer) clearTimeout(pollTimer);
    optimisticMessages(body, submittedAttachments);
    setStatus("执行中");
    const record = await postJson("/api/actions/start", body);
    currentRunId = record.run_id;
    runAttachmentCache.set(currentRunId, submittedAttachments);
    selectedAttachments = [];
    renderAttachmentList();
    renderRun(record);
    schedulePoll();
  }

  async function pollRun() {
    if (!currentRunId) return;
    const response = await fetch("/api/actions/" + encodeURIComponent(currentRunId));
    const record = await response.json();
    renderRun(record);
    if (!terminalStatuses.has(record.status || "")) schedulePoll();
  }

  function schedulePoll() {
    if (pollTimer) clearTimeout(pollTimer);
    pollTimer = setTimeout(() => {
      pollRun().catch((error) => {
        renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
      });
    }, 900);
  }

  async function cancelCurrentRun() {
    if (!currentRunId) {
      renderActionResult({ result: { status: "CANCELLED", stdout_summary: "当前没有运行中的任务。" } }, "待操作");
      return;
    }
    if (pollTimer) clearTimeout(pollTimer);
    const record = await postJson("/api/actions/" + encodeURIComponent(currentRunId) + "/cancel", {});
    renderRun(record);
  }

  document.querySelectorAll("[data-console-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const buttonMode = button.getAttribute("data-console-action");
      try {
        if (buttonMode === "start") {
          await startAction();
        }
        if (buttonMode === "cancel") {
          await cancelCurrentRun();
        }
        if (buttonMode === "plan") {
          setStatus("生成中");
          renderActionResult(await postJson("/api/action-plan", payload("autopilot-dry-run")));
        }
        if (buttonMode === "run") {
          setStatus("执行中");
          renderActionResult(await postJson("/api/action-run", payload()));
        }
        if (buttonMode === "logs") {
          setStatus("生成中");
          const latest = await (await fetch("/api/action-log/latest")).json();
          renderActionResult(latest.data || latest, "成功");
        }
      } catch (error) {
        renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
      }
    });
  });

  document.querySelectorAll("[data-quick-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (action) action.value = button.getAttribute("data-quick-action");
      if (proposalTask) proposalTask.value = "";
      if (goal) goal.value = button.getAttribute("data-goal") || goal.value;
      const quickAction = button.getAttribute("data-quick-action");
      setStatus("执行中");
      try {
        await startAction(quickAction);
      } catch (error) {
        renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
      }
    });
  });

  document.querySelectorAll("[data-proposal-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      if (action) action.value = button.getAttribute("data-proposal-action");
      if (proposalTask) proposalTask.value = button.getAttribute("data-proposal-task") || "";
      if (goal) goal.value = button.textContent + " " + currentProjectValue() + " proposal";
      const proposalAction = button.getAttribute("data-proposal-action");
      setStatus("生成中");
      try {
        await startAction(proposalAction);
      } catch (error) {
        renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
      }
    });
  });

  document.querySelectorAll("[data-project-connect-action]").forEach((button) => {
    button.addEventListener("click", async () => {
      const connectAction = button.getAttribute("data-project-connect-action");
      if (action) action.value = connectAction;
      if (goal) goal.value = goal.value || "接入新项目";
      setStatus(connectAction === "project-connect-apply" ? "执行中" : "生成中");
      try {
        await startAction(connectAction);
      } catch (error) {
        renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
      }
    });
  });

  document.querySelectorAll("[data-project-select]").forEach((button) => {
    button.addEventListener("click", () => {
      const value = button.getAttribute("data-project-select");
      if (project) project.value = value;
      document.querySelectorAll("[data-project-select]").forEach((item) => item.classList.toggle("active", item === button));
      const url = new URL(window.location.href);
      url.searchParams.set("project", value || "");
      window.location.assign(url.pathname + url.search);
    });
  });

  project?.addEventListener("change", () => {
    document.querySelectorAll("[data-project-select]").forEach((item) => item.classList.toggle("active", item.getAttribute("data-project-select") === project.value));
    const url = new URL(window.location.href);
    url.searchParams.set("project", project.value || "");
    window.history.replaceState({}, "", url.pathname + url.search);
  });

  attachmentTrigger?.addEventListener("click", () => attachmentInput?.click());
  attachmentInput?.addEventListener("change", async () => {
    const files = [...(attachmentInput.files || [])].slice(0, 6);
    if (files.length === 0) return;
    try {
      const next = await Promise.all(files.map((file) => normalizeAttachment(file)));
      selectedAttachments = [...selectedAttachments, ...next].slice(0, 6);
      renderAttachmentList();
      if (attachmentInput) attachmentInput.value = "";
    } catch (error) {
      renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
    }
  });

  renderAttachmentList();

  authLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setAuthStatus("登录中...", "pending");
      await postJson("/api/access/login", {
        username: authUsername ? authUsername.value.trim() : "",
        password: authPassword ? authPassword.value : ""
      });
      setAuthStatus("登录成功，正在进入工作台...", "success");
      window.setTimeout(() => window.location.assign("/"), 180);
    } catch (error) {
      setAuthStatus(String(error && error.message ? error.message : error), "error");
    }
  });

  authRegisterForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      const displayName = registerDisplayName ? registerDisplayName.value.trim() : "";
      const username = registerUsername ? registerUsername.value.trim() : "";
      if (!displayName || !username) {
        setAuthStatus("请填写姓名和用户名。", "error");
        return;
      }
      setAuthStatus("正在提交申请...", "pending");
      const result = await postJson("/api/access/register", {
        display_name: displayName,
        username,
        request_type: registerRequestType ? registerRequestType.value : "viewer",
        request_comment: registerComment ? registerComment.value.trim() : ""
      });
      setAuthStatus("申请已提交，等待管理员审批。申请编号：" + (result.invite_id || "已生成"), "success");
      authRegisterForm.reset();
    } catch (error) {
      setAuthStatus(String(error && error.message ? error.message : error), "error");
    }
  });

  authLogout?.addEventListener("click", async () => {
    try {
      await postJson("/api/access/logout", {});
    } finally {
      window.location.reload();
    }
  });

  if (goal) {
    goal.addEventListener("keydown", (event) => {
      if (event.key === "Enter" && !event.shiftKey) {
        event.preventDefault();
        startAction().catch((error) => {
          renderActionResult({ result: { status: "FAIL", stderr_summary: String(error && error.message ? error.message : error) } });
        });
      }
    });
  }

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

function shell(content, activeId, model, data, auth = {}) {
  const route = consoleWebRoutes.find((item) => item.id === activeId) ?? consoleWebRoutes[0];
  const gated = data.access?.summary?.allow_anonymous_console_read !== true && !auth.authenticated;
  const forbidden = !gated && !evaluateConsoleRouteAccess(route.id, auth).allowed;
  const authView = data.authView ?? "entry";
  const authRoute = data.authRoute === true;
  const gatedPage = authView === "login"
    ? accessLoginPage(data)
    : authView === "register"
      ? accessRegisterPage(data)
      : accessEntryPage(data);
  const useAuthLayout = gated || authRoute;
  const mainContent = useAuthLayout ? gatedPage : (forbidden ? routeForbiddenPage(route, auth) : content);
  const headerClass = useAuthLayout ? "login-header" : "";
  const headerMeta = useAuthLayout
    ? ""
    : `${authHeaderBar(auth)}
    ${topStatusBar(model, data, auth)}
    ${nav(activeId, auth, data.active_project_id ?? data.project_router.projects?.[0]?.project_id ?? "")}`;
  const pageTitle = useAuthLayout ? `登录 - ${messages.app.title}` : `${route.label} - ${messages.app.title}`;
  return `<!doctype html>
<html lang="${messages.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root { color-scheme: dark; --canvas: #070a10; --surface-1:#0d121c; --surface-2:#121925; --surface-3:#182131; --elevated:#202b3d; --bg:var(--canvas); --nav:var(--surface-1); --panel:var(--surface-2); --panel-2:var(--surface-3); --text:#f7f8fa; --muted:#98a2b3; --line:rgba(255,255,255,.08); --primary:#4f7cff; --primary-hover:#6b91ff; --blue:#53b1fd; --cyan:#28c7e8; --purple:#8b72ff; --green:#32d583; --yellow:#fdb022; --red:#f97066; --shadow:rgba(0,0,0,.24); --sidebar-width:248px; }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, "SF Pro Text", "PingFang SC", "Microsoft YaHei", ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:radial-gradient(circle at 72% -10%,rgba(79,124,255,.10),transparent 30%),var(--canvas); color: var(--text); }
    body.login-gated { color-scheme: dark; background:
      radial-gradient(circle at 18% 12%, rgba(77, 147, 255, 0.22), transparent 28%),
      radial-gradient(circle at 72% 18%, rgba(55, 210, 255, 0.12), transparent 30%),
      linear-gradient(180deg, #0f1724 0%, #101a28 48%, #0b111a 100%); color: #f5f8fc; }
    header { padding: 12px 24px 10px; border-bottom: 1px solid rgba(148,163,184,.14); background: rgba(7, 12, 20, 0.94); backdrop-filter: blur(18px); position: sticky; top: 0; z-index: 3; box-shadow: 0 8px 24px var(--shadow); }
    header.login-header { padding: 14px 22px; background: rgba(9, 15, 24, 0.72); border-bottom-color: rgba(140, 177, 220, 0.12); box-shadow: none; position: relative; backdrop-filter: blur(18px); color: #f5f8fc; }
    header.login-header .subhead { color: #8ea1b8; }
    header:not(.login-header) .auth-strip { position: absolute; top: 12px; right: 24px; width: auto; margin: 0; padding: 0; border: 0; }
    header:not(.login-header) .auth-identity { text-align: right; }
    header:not(.login-header) .auth-identity span { display: none; }
    header:not(.login-header) .top-status { position: absolute; right: 24px; bottom: 12px; margin: 0; }
    .brand-row { display: flex; align-items: center; justify-content: space-between; gap: 16px; }
    .brand-lockup { display: flex; align-items: center; gap: 10px; min-width: 0; }
    .logo-frame { display: inline-flex; align-items: center; justify-content: center; width: 46px; height: 40px; flex: 0 0 auto; border: 0; border-radius: 0; background: transparent; padding: 0; box-shadow: none; }
    .brand-logo { display: block; width: 100%; height: 100%; object-fit: contain; }
    .brand-copy { min-width: 0; }
    h1 { margin: 0; font-size: 15px; font-weight: 700; letter-spacing: 0; }
    .subhead { color: var(--muted); font-size: 11px; margin-top: 3px; }
    .auth-strip { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-top: 8px; padding-top: 8px; border-top: 1px solid rgba(255, 255, 255, 0.04); }
    .auth-strip.unauth { align-items: flex-start; }
    .auth-identity { min-width: 0; }
    .auth-identity.compact strong { font-size: 11px; text-transform: uppercase; letter-spacing: 0.08em; color: #d9e4f2; }
    .auth-identity.compact span { font-size: 12px; color: #93a4b8; max-width: 520px; }
    .auth-identity strong { display: block; font-size: 12px; }
    .auth-identity span { display: block; color: var(--muted); font-size: 11px; line-height: 1.45; margin-top: 2px; }
    .auth-actions { display: inline-flex; align-items: center; gap: 8px; flex-wrap: wrap; }
    .auth-logout { min-height: 30px; padding: 6px 10px; }
    .top-status { display: flex; flex-wrap: wrap; gap: 6px; margin-top: 8px; color: var(--muted); font-size: 11px; line-height: 1.35; }
    .top-status.compact { align-items: center; }
    .top-status-pill { display: inline-flex; align-items: center; min-height: 24px; padding: 0 9px; border-radius: 999px; border: 1px solid #1f2b38; background: #0b1118; color: #c2cfde; white-space: nowrap; font-size: 11px; font-weight: 700; }
    .top-status-pill.primary { background: #111927; color: #dbeafe; border-color: #243041; }
    .top-status-pill.success { color: var(--green); border-color: rgba(52, 211, 153, 0.28); background: rgba(14, 27, 21, 0.92); }
    .top-status-pill.warning { color: var(--yellow); border-color: rgba(251, 191, 36, 0.28); background: rgba(33, 23, 8, 0.92); }
    .status-chip { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 9px 10px; min-width: 0; }
    .status-chip span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 3px; }
    .status-chip strong { display: block; font-size: 13px; overflow-wrap: anywhere; }
    .status-chip.good strong { color: var(--green); }
    .status-chip.warn strong { color: var(--yellow); }
    .top-nav { display: flex; align-items: center; gap: 4px; overflow-x: auto; margin-top: 10px; padding: 2px 440px 2px 0; scrollbar-width: thin; }
    .top-nav a { display: inline-flex; align-items: center; color: var(--muted); text-decoration: none; padding: 8px 12px; border-radius: 9px; font-size: 13px; white-space: nowrap; border: 1px solid transparent; background: transparent; }
    .top-nav a:hover { color: var(--text); background: rgba(148,163,184,.08); }
    .top-nav a.active { background: rgba(59,130,246,.13); color: #dbeafe; border-color: rgba(96,165,250,.2); font-weight: 700; }
    main { padding: 28px 24px 48px; max-width: 1240px; width: 100%; margin: 0 auto; }
    section { margin-bottom: 24px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    h3 { font-size: 14px; margin: 0 0 8px; }
    p { color: var(--muted); line-height: 1.55; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .metric, .panel, .workbench, .smart-entry, .output-card { background: var(--panel); border: 1px solid var(--line); border-radius: 14px; padding: 16px; box-shadow: 0 10px 30px var(--shadow); }
    .product-hero { display:flex; align-items:center; justify-content:space-between; gap:24px; padding:26px 28px; border:1px solid rgba(96,165,250,.24); border-radius:18px; background:linear-gradient(135deg, rgba(37,99,235,.2), rgba(14,165,233,.05) 58%, rgba(17,28,43,.95)); box-shadow:0 18px 48px rgba(2,8,23,.3); }
    .product-hero h2 { font-size:28px; margin:6px 0 8px; letter-spacing:-.02em; }
    .product-hero p { max-width:680px; font-size:14px; }
    .hero-actions { display:flex; gap:10px; flex-wrap:wrap; flex:0 0 auto; }
    .primary-link { display:inline-flex; align-items:center; justify-content:center; min-height:42px; padding:10px 16px; border-radius:10px; color:#fff; background:#2563eb; text-decoration:none; font-weight:800; border:1px solid rgba(147,197,253,.3); }
    .primary-link:hover { background:#3474e8; }
    .summary-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; }
    .command-center-hero { position:relative; isolation:isolate; overflow:hidden; max-width:1060px; margin:0 auto 22px; padding:28px 34px 24px; }
    .command-center-copy { position:relative; z-index:1; max-width:720px; margin:0 auto 20px; text-align:center; }
    .command-center-copy h2 { margin:7px 0 8px; font-size:32px; line-height:1.1; letter-spacing:-.04em; }
    .command-center-copy p { color:var(--muted); font-size:14px; }
    .command-orb { position:absolute; z-index:-1; border-radius:50%; filter:blur(10px); pointer-events:none; }
    .command-orb-a { width:320px; height:240px; top:-175px; left:18%; background:radial-gradient(circle,rgba(79,124,255,.2),transparent 67%); }
    .command-orb-b { width:260px; height:220px; right:10%; bottom:-180px; background:radial-gradient(circle,rgba(126,87,194,.15),transparent 68%); }
    .command-box { position:relative; z-index:1; max-width:760px; margin:0 auto; padding:8px; border:1px solid rgba(122,145,194,.22); border-radius:15px; background:rgba(8,12,20,.9); box-shadow:0 18px 50px rgba(0,0,0,.25),0 0 0 1px rgba(255,255,255,.02) inset; }
    .command-box > textarea { min-height:126px; padding:16px 17px; border:0; background:transparent; font-size:15px; line-height:1.65; resize:none; }
    .command-box > textarea:focus { outline:0; }
    .command-compose-footer { display:flex; align-items:center; gap:12px; padding:9px 7px 1px 10px; border-top:1px solid rgba(148,163,184,.1); }
    .command-compose-footer > .primary-action { flex:0 0 auto; min-height:42px; padding:9px 15px; }
    .suggestion-row { display:flex; align-items:center; gap:7px; flex:1 1 auto; flex-wrap:wrap; padding:0; border:0; }
    .suggestion-row > span { margin-right:2px; color:#667085; font-size:11px; }
    .suggestion-row button { min-height:28px; padding:4px 9px; border-color:transparent; border-radius:999px; background:rgba(255,255,255,.035); color:#8f9bb0; font-size:11px; font-weight:600; }
    .suggestion-row button:hover { color:#dbe5ff; border-color:rgba(124,145,191,.18); }
    .recent-outcomes { border:0; border-radius:0; background:transparent; }
    .run-pulse { width:9px; height:9px; border-radius:50%; background:#7c6cff; box-shadow:0 0 0 6px rgba(124,108,255,.1); }
    .compact-progress { height:3px; margin:14px 0 0 25px; overflow:hidden; border-radius:999px; background:#232c3c; }
    .compact-progress i { display:block; width:57%; height:100%; border-radius:inherit; background:linear-gradient(90deg,#4f7cff,#8b6cff); }
    .current-run-strip { display:grid; grid-template-columns:12px minmax(0,1fr) auto; gap:14px; align-items:center; max-width:1120px; margin:0 auto 22px; padding:16px 18px; border:1px solid var(--line); border-radius:14px; background:rgba(13,19,31,.68); }
    .current-run-copy h2 { margin:3px 0; font-size:17px; }
    .current-run-copy p { color:var(--muted); font-size:11px; }
    .current-run-copy .compact-progress { height:2px; margin:10px 0 0; }
    .current-run-actions { display:flex; align-items:center; gap:8px; }
    .attention-chip,.clear-chip { display:inline-flex; align-items:center; min-height:29px; padding:4px 9px; border-radius:999px; font-size:11px; font-weight:700; text-decoration:none; }
    .attention-chip { color:#fbbf24; background:rgba(251,191,36,.09); border:1px solid rgba(251,191,36,.2); }
    .clear-chip { color:#66d9aa; background:rgba(52,211,153,.07); }
    .recent-outcomes { max-width:1120px; margin:0 auto 18px; padding:18px 2px 4px; }
    .recent-outcomes h2 { margin:5px 0 0; }
    .quiet-link { color:#9eb5e9; font-size:12px; text-decoration:none; }
    .activity-feed { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:12px; }
    .activity-item { display:grid; grid-template-columns:34px minmax(0,1fr); gap:10px; align-items:start; padding:14px; border:1px solid rgba(148,163,184,.11); border-radius:12px; background:rgba(13,19,31,.46); }
    .activity-icon { display:grid; place-items:center; width:30px; height:30px; border-radius:9px; background:rgba(79,124,255,.1); color:#8eabff; font-size:11px; }
    .activity-icon.success { background:rgba(52,211,153,.09); color:#34d399; }
    .activity-item p { margin-top:3px; color:var(--muted); font-size:12px; }
    .activity-item time { grid-column:2; color:#596579; font-size:11px; }
    .operations-hero { max-width:900px; padding:22px 0 8px; }
    .operations-hero h2 { margin:7px 0 8px; font-size:32px; letter-spacing:-.035em; }
    .operations-hero p { max-width:680px; color:var(--muted); }
    .operation-card-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:14px; margin:20px 0; }
    .operation-card { display:grid; grid-template-columns:42px minmax(0,1fr) auto; gap:14px; align-items:start; min-height:142px; padding:20px; border:1px solid var(--line); border-radius:16px; background:rgba(13,19,31,.76); color:var(--text); text-decoration:none; transition:border-color .16s ease,transform .16s ease,background .16s ease; }
    .operation-card:hover { transform:translateY(-2px); border-color:rgba(104,139,226,.34); background:rgba(17,25,41,.9); }
    .operation-card-icon { display:grid; place-items:center; width:40px; height:40px; border-radius:11px; background:rgba(79,124,255,.11); color:#8eabff; }
    .operation-card-icon svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .operation-card h3 { margin:1px 0 7px; }
    .operation-card p { color:var(--muted); font-size:12px; line-height:1.55; }
    .operation-card small { display:block; margin-top:13px; color:#77849a; }
    .operation-arrow { color:#64748b; }
    .system-strip { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; margin-bottom:20px; overflow:hidden; border:1px solid var(--line); border-radius:14px; background:var(--line); }
    .system-strip > div { display:grid; gap:5px; padding:15px; background:#0d131e; }
    .system-strip span { color:var(--muted); font-size:11px; }
    .system-strip strong { font-size:12px; }
    .summary-card { padding:18px; border-radius:14px; border:1px solid var(--line); background:linear-gradient(180deg, rgba(20,33,50,.96), rgba(15,25,39,.96)); transition:transform .16s ease,border-color .16s ease; }
    .summary-card:hover { transform:translateY(-2px); border-color:rgba(96,165,250,.3); }
    .summary-card span { display:block; color:var(--muted); font-size:12px; margin-bottom:9px; }
    .summary-card strong { display:block; font-size:24px; letter-spacing:-.02em; overflow-wrap:anywhere; }
    .summary-card small { display:block; color:var(--muted); margin-top:7px; line-height:1.45; }
    .product-grid { display:grid; grid-template-columns:minmax(0,1.4fr) minmax(280px,.8fr); gap:16px; }
    .goal-layout { display:grid; grid-template-columns:minmax(0,1.7fr) minmax(280px,.7fr); gap:18px; align-items:start; }
    .goal-sidebar { position:sticky; top:96px; }
    .domain-hero { margin-bottom:22px; }
    .domain-summary { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-bottom:28px; }
    .domain-summary>div { padding:18px 20px; border:1px solid var(--line); border-radius:14px; background:linear-gradient(145deg,rgba(24,33,49,.92),rgba(13,18,28,.92)); }
    .domain-summary span { display:block; color:var(--muted); font-size:13px; }
    .domain-summary strong { display:block; margin-top:7px; font-size:26px; }
    .domain-grid { display:grid; grid-template-columns:repeat(3,minmax(0,1fr)); gap:14px; }
    .application-suite { margin-bottom:18px; padding:20px; border:1px solid var(--line); border-radius:18px; background:rgba(11,16,25,.72); }
    .application-suite-head { display:flex; align-items:flex-start; justify-content:space-between; gap:18px; margin-bottom:16px; }
    .application-suite-head h2 { margin:3px 0 5px; font-size:21px; }
    .application-suite-head p { margin:0; color:var(--muted); }
    .application-badge { min-width:44px; height:44px; display:grid; place-items:center; border:1px solid rgba(79,124,255,.28); border-radius:12px; color:#b9caff; background:rgba(79,124,255,.09); font-size:11px; font-weight:800; }
    .domain-card { min-height:300px; padding:20px; border:1px solid var(--line); border-radius:14px; background:linear-gradient(150deg,rgba(24,33,49,.92),rgba(13,18,28,.96)); box-shadow:0 16px 34px rgba(0,0,0,.12); display:flex; flex-direction:column; transition:.18s ease; }
    .domain-card:hover { transform:translateY(-2px); border-color:rgba(79,124,255,.38); }
    .domain-card-head { display:flex; align-items:center; justify-content:space-between; gap:12px; }
    .domain-mark { width:44px; height:44px; display:grid; place-items:center; border-radius:12px; background:rgba(79,124,255,.12); color:#8fb0ff; font-size:13px; font-weight:800; }
    .domain-card h3 { margin:18px 0 2px; font-size:20px; }
    .domain-card small { color:#718096; }
    .domain-card p { color:var(--muted); line-height:1.65; }
    .domain-owner { margin:4px 0 12px; padding:10px 12px; border-radius:9px; background:rgba(255,255,255,.025); }
    .domain-owner span { display:block; color:#718096; font-size:11px; }
    .domain-owner strong { display:block; margin-top:3px; color:#c9d2df; font-size:12px; }
    .domain-bindings { display:grid; gap:5px; }
    .domain-binding { display:flex; align-items:center; justify-content:space-between; gap:12px; font-size:11px; color:#8793a5; }
    .domain-binding strong { font-size:10px; font-weight:700; }
    .domain-skills { display:flex; flex-wrap:wrap; gap:6px; }
    .domain-skills span { padding:5px 8px; border:1px solid var(--line); border-radius:7px; color:#aab4c4; font-size:11px; }
    .domain-card-foot { margin-top:auto; padding-top:18px; }
    .domain-next { color:#8390a3; font-size:12px; line-height:1.5; }
    .domain-architecture { margin-top:28px; display:flex; align-items:center; justify-content:space-between; gap:32px; }
    .domain-architecture>div:first-child { max-width:520px; }
    .domain-flow { display:flex; align-items:center; flex-wrap:wrap; gap:8px; }
    .domain-flow span { padding:8px 10px; border:1px solid rgba(79,124,255,.24); border-radius:8px; background:rgba(79,124,255,.08); color:#b9caff; font-size:12px; }
    .domain-flow i { color:#596579; font-style:normal; }
    .stage-rail { display:grid; grid-template-columns:repeat(5,1fr); gap:0; margin-top:18px; }
    .stage-item { position:relative; padding:24px 8px 0; color:#667085; font-size:11px; text-align:center; }
    .stage-item::before { content:""; position:absolute; top:7px; left:0; right:0; height:2px; background:var(--surface-3); }
    .stage-item::after { content:""; position:absolute; top:2px; left:50%; width:12px; height:12px; margin-left:-6px; border-radius:50%; background:#344054; border:2px solid var(--surface-2); }
    .stage-item.active { color:#dbe5ff; font-weight:700; }
    .stage-item.active::before { background:rgba(79,124,255,.52); }
    .stage-item.active::after { background:var(--primary); box-shadow:0 0 0 4px rgba(79,124,255,.12); }
    .attention-card { border-left:3px solid var(--yellow); }
    .empty-state { padding:34px 20px; text-align:center; color:var(--muted); }
    .empty-state strong { display:block; color:var(--text); margin-bottom:6px; }
    .simple-list { display:grid; gap:10px; margin-top:12px; }
    .simple-row { display:flex; align-items:center; justify-content:space-between; gap:14px; padding:12px 0; border-bottom:1px solid rgba(148,163,184,.12); }
    .simple-row:last-child { border-bottom:0; }
    .simple-row strong { font-size:13px; }
    .simple-row span { color:var(--muted); font-size:12px; text-align:right; line-height:1.45; }
    .advanced-section { border:1px solid var(--line); border-radius:14px; background:rgba(10,18,30,.68); overflow:hidden; }
    .advanced-section > summary { cursor:pointer; padding:15px 17px; font-weight:800; color:#cbd5e1; }
    .advanced-section > .advanced-body { padding:0 16px 16px; }
    .home-diagnostics { max-width:1120px; margin:18px auto 0; background:transparent; }
    .home-diagnostics > summary { display:flex; align-items:center; gap:10px; padding:13px 16px; }
    .home-diagnostics > summary small { color:#667085; font-size:11px; font-weight:500; }
    .home-diagnostics[open] > summary { border-bottom:1px solid rgba(148,163,184,.1); }
    .home-diagnostics > .advanced-body { padding:16px; }
    .diagnostic-snapshot { display:grid; grid-template-columns:repeat(4,1fr); gap:1px; overflow:hidden; border:1px solid var(--line); border-radius:12px; background:var(--line); }
    .diagnostic-snapshot > div { display:flex; align-items:center; justify-content:space-between; gap:12px; padding:13px 14px; background:#0d131e; }
    .diagnostic-snapshot span { color:var(--muted); font-size:11px; }
    .diagnostic-snapshot strong { font-size:14px; }
    .diagnostic-links { display:grid; grid-template-columns:repeat(3,1fr); gap:10px; margin-top:12px; }
    .diagnostic-links > a { display:grid; grid-template-columns:34px minmax(0,1fr) auto; gap:10px; align-items:center; padding:13px; border:1px solid rgba(148,163,184,.12); border-radius:12px; background:rgba(13,19,31,.5); color:var(--text); text-decoration:none; }
    .diagnostic-links > a:hover { border-color:rgba(104,139,226,.32); background:rgba(17,25,41,.72); }
    .diagnostic-links p { margin-top:3px; color:var(--muted); font-size:11px; line-height:1.4; }
    .diagnostic-links > a > span:last-child { color:#69768c; }
    .diagnostic-link-icon { display:grid; place-items:center; width:32px; height:32px; border-radius:9px; background:rgba(79,124,255,.1); color:#8eabff; }
    .diagnostic-link-icon svg { width:17px; height:17px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .access-entitlement-panel { margin-bottom: 8px; padding: 10px 12px; }
    .entitlement-alerts { display: grid; gap: 8px; margin-top: 10px; }
    .entitlement-alert { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: #0c1219; }
    .entitlement-alert.warning { border-color: rgba(251, 191, 36, 0.24); background: rgba(33, 23, 8, 0.35); }
    .entitlement-alert.notice { border-color: rgba(133, 183, 255, 0.22); background: rgba(17, 25, 39, 0.52); }
    .entitlement-alert.info { border-color: rgba(148, 163, 184, 0.18); background: rgba(12, 18, 25, 0.9); }
    .entitlement-alert-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .entitlement-alert-head strong { font-size: 13px; }
    .workspace-shell { display: grid; grid-template-columns: 160px minmax(0, 1fr) 220px; gap: 10px; align-items: start; }
    .auth-shell { display: grid; grid-template-columns: minmax(360px, 1fr) 360px; gap: 22px; align-items: stretch; justify-content: center; max-width: 1040px; margin: 28px auto 0; }
    .auth-entry-shell { grid-template-columns: minmax(380px, 1fr) 360px; }
    .auth-product-panel, .auth-side { position: relative; overflow: hidden; border-radius: 22px; }
    .auth-product-panel { min-height: 500px; background:
      radial-gradient(circle at 62% 40%, rgba(79, 142, 255, 0.24), transparent 20%),
      radial-gradient(circle at 36% 62%, rgba(36, 211, 255, 0.1), transparent 24%),
      linear-gradient(140deg, rgba(19, 31, 48, 0.14), rgba(5, 10, 18, 0.04)); }
    .auth-product-panel::before { content: ""; position: absolute; inset: 32px; border-radius: 18px; background:
      linear-gradient(120deg, transparent 0%, rgba(139, 184, 255, 0.08) 48%, transparent 52%),
      linear-gradient(180deg, rgba(255,255,255,0.03), transparent); }
    .auth-product-panel::after { content: ""; position: absolute; inset: auto 14% 14% 18%; height: 1px; background: linear-gradient(90deg, transparent, rgba(118, 184, 255, 0.5), transparent); box-shadow: 0 0 28px rgba(85, 164, 255, 0.32); }
    .auth-orb { position: absolute; border-radius: 999px; filter: blur(2px); opacity: 0.62; }
    .orb-a { width: 240px; height: 240px; left: 18%; top: 22%; background: radial-gradient(circle, rgba(78, 151, 255, 0.22), transparent 68%); }
    .orb-b { width: 180px; height: 180px; right: 20%; bottom: 18%; background: radial-gradient(circle, rgba(65, 215, 255, 0.16), transparent 70%); }
    .auth-line { position: absolute; height: 1px; width: 42%; background: linear-gradient(90deg, transparent, rgba(170, 206, 255, 0.42), transparent); transform-origin: center; }
    .line-a { left: 24%; top: 42%; transform: rotate(-18deg); }
    .line-b { right: 18%; top: 58%; transform: rotate(18deg); }
    .auth-node { position: absolute; width: 8px; height: 8px; border-radius: 3px; background: rgba(96, 165, 250, 0.78); box-shadow: 0 0 18px rgba(96, 165, 250, 0.72); }
    .node-a { left: 33%; top: 44%; }
    .node-b { right: 31%; top: 54%; }
    .node-c { right: 39%; bottom: 31%; width: 12px; height: 12px; }
    .auth-side { align-self: center; padding: 30px; background: rgba(15, 26, 41, 0.84); color: #f6f9fd; backdrop-filter: blur(20px); border: 1px solid rgba(129, 160, 202, 0.22); box-shadow: 0 28px 80px rgba(0, 0, 0, 0.24); }
    .entry-side { align-self: center; min-height: 300px; display: flex; flex-direction: column; justify-content: center; }
    .auth-kicker { display: inline-block; margin-bottom: 9px; color: #9abcf1; font-size: 10px; font-weight: 900; letter-spacing: 0.22em; text-transform: uppercase; }
    .auth-card-head h3, .auth-side h2 { color: #f6f9fd; font-size: 30px; line-height: 1.05; margin: 0; letter-spacing: 0; }
    .auth-form { display: grid; gap: 14px; margin-top: 24px; }
    .auth-form input, .auth-form select, .auth-form textarea { min-height: 46px; border-radius: 12px; background: rgba(6, 12, 20, 0.78); border-color: rgba(130, 166, 211, 0.24); color: #f6f9fd; padding: 11px 12px; font-size: 14px; box-shadow: none; }
    .auth-form textarea { min-height: 86px; }
    .auth-form input::placeholder, .auth-form textarea::placeholder { color: #748aa5; }
    .auth-form label { color: #e7edf6; }
    .auth-submit-button, .auth-link-button.primary-action { width: 100%; min-height: 46px; border-radius: 12px; background: linear-gradient(180deg, #3976d6, #24599f); border-color: rgba(118, 174, 255, 0.28); color: #fff; box-shadow: 0 16px 36px rgba(26, 94, 185, 0.22); }
    .auth-submit-button:hover, .auth-link-button.primary-action:hover { background: linear-gradient(180deg, #4383ec, #2e66b6); }
    .auth-path-actions { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; margin-top: 28px; max-width: 320px; }
    .auth-link-button { min-height: 46px; border-radius: 12px; text-decoration: none; display: inline-flex; align-items: center; justify-content: center; font-weight: 800; }
    .auth-form .button-row { margin-top: 4px; }
    .auth-status-copy { margin-top: 2px; font-size: 12px; color: #64748b; }
    .auth-status-copy a { color: #2563eb; font-weight: 800; text-decoration: none; }
    .auth-status.error { color: var(--red); }
    .auth-status.success { color: var(--green); }
    .auth-status.pending { color: var(--blue); }
    .ai-workspace, .advanced-config, .project-rail { background: linear-gradient(180deg, rgba(16, 21, 29, 0.92), rgba(11, 14, 20, 0.96)); border: 1px solid var(--line); border-radius: 10px; padding: 10px; box-shadow: 0 8px 22px var(--shadow); }
    .project-rail { position: sticky; top: 90px; }
    .rail-header { display: flex; align-items: center; justify-content: space-between; gap: 8px; margin-bottom: 8px; }
    .rail-label { color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; }
    .project-list { display: grid; gap: 10px; }
    .project-row { display: flex; flex-direction: column; align-items: flex-start; gap: 3px; text-align: left; border: 1px solid transparent; background: transparent; color: var(--muted); border-radius: 8px; padding: 8px 10px; box-shadow: none; }
    .project-row:hover { background: #0f131a; color: var(--text); }
    .project-row.active { border-color: #243041; background: #0f141c; color: var(--text); }
    .project-row strong, .project-row span { display: block; overflow-wrap: anywhere; }
    .project-row strong { font-size: 13px; font-weight: 700; }
    .project-row span { color: inherit; font-size: 11px; opacity: 0.74; }
    .chat-workspace { min-height: calc(100vh - 118px); display: flex; flex-direction: column; }
    .workspace-hero { display: flex; align-items: flex-end; justify-content: space-between; gap: 12px; margin-bottom: 8px; }
    .workspace-hero.compact-hero { padding-bottom: 2px; border-bottom: 1px solid rgba(255, 255, 255, 0.03); }
    .workspace-title { min-width: 0; }
    .workspace-hero h2 { font-size: 16px; line-height: 1.15; margin: 3px 0 0; letter-spacing: 0; }
    .eyebrow { color: #a7b9d3; font-size: 10px; font-weight: 800; text-transform: uppercase; letter-spacing: 0.12em; }
    .workspace-meta { display: inline-flex; align-items: center; gap: 6px; flex-wrap: wrap; }
    .meta-chip { display: inline-flex; align-items: center; min-height: 22px; padding: 0 8px; border-radius: 999px; border: 1px solid #223043; color: #a7b9d3; background: #0a0e14; font-size: 11px; font-weight: 700; }
    .capability-strip { display: flex; flex-wrap: wrap; gap: 8px; margin: 0 0 16px; }
    .capability-strip span { border: 1px solid #2b3b50; background: #0b1118; color: #c7d2df; border-radius: 999px; padding: 5px 9px; font-size: 12px; font-weight: 700; }
    .command-input { min-height: 92px; font-size: 14px; background: #090d13; border-color: #233041; }
    .conversation-stream { display: block; flex: 1 1 auto; min-height: 320px; max-height: 54vh; overflow: auto; padding: 10px 12px; border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; background: #05070a; font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; box-shadow: inset 0 0 0 1px rgba(255, 255, 255, 0.02); }
    .terminal-line { color: #d7e2ef; font-size: 13px; line-height: 1.58; white-space: pre-wrap; overflow-wrap: anywhere; padding: 1px 0; }
    .terminal-line.user { color: #8bd3ff; }
    .terminal-line.assistant { color: #d7e2ef; }
    .terminal-line.running { color: var(--green); }
    .terminal-line.fail { color: var(--red); }
    .chat-message { display: grid; grid-template-columns: 36px minmax(0, 1fr); gap: 10px; align-items: start; }
    .chat-message.user { grid-template-columns: minmax(0, 1fr) 36px; }
    .chat-message.user .message-avatar { grid-column: 2; grid-row: 1; background: #132947; color: var(--blue); border-color: rgba(90, 169, 255, 0.35); }
    .chat-message.user .message-body { grid-column: 1; grid-row: 1; background: #111a25; }
    .message-avatar { display: inline-flex; align-items: center; justify-content: center; width: 36px; height: 36px; border-radius: 8px; background: #12301f; color: var(--green); font-size: 12px; font-weight: 900; border: 1px solid rgba(52, 211, 153, 0.35); }
    .message-body { border: 1px solid var(--line); border-radius: 8px; background: #0d141d; padding: 11px; }
    .message-body strong { display: block; margin-bottom: 5px; }
    .message-body p { font-size: 13px; white-space: pre-wrap; }
    .typing { display: inline-flex; gap: 4px; align-items: center; margin-left: 6px; }
    .typing span { width: 5px; height: 5px; border-radius: 50%; background: var(--green); animation: pulse 1s infinite ease-in-out; }
    .typing span:nth-child(2) { animation-delay: 0.15s; }
    .typing span:nth-child(3) { animation-delay: 0.3s; }
    @keyframes pulse { 0%, 80%, 100% { opacity: 0.25; transform: translateY(0); } 40% { opacity: 1; transform: translateY(-2px); } }
    .workspace-controls { display: grid; grid-template-columns: minmax(150px, 1fr) minmax(120px, 0.7fr) minmax(150px, 0.8fr) minmax(72px, auto) minmax(72px, auto); gap: 8px; align-items: end; margin-top: 8px; }
    .workspace-controls button { white-space: nowrap; min-width: 72px; }
    .attachment-toolbar { margin-top: 10px; border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 10px; background: #070b10; padding: 10px; }
    .attachment-toolbar-head { display: flex; align-items: center; gap: 8px; flex-wrap: wrap; margin-bottom: 10px; }
    .attachment-label { margin: 0; font-size: 12px; color: var(--muted); font-weight: 700; }
    .attach-button { min-height: 34px; }
    .attachment-list { display: grid; grid-template-columns: repeat(auto-fit, minmax(220px, 1fr)); gap: 8px; }
    .attachment-list.empty { display: block; }
    .attachment-empty { display: block; color: var(--muted); font-size: 12px; line-height: 1.5; }
    .attachment-bubble { display: grid; grid-template-columns: repeat(auto-fit, minmax(200px, 1fr)); gap: 8px; margin: 8px 0 10px; }
    .attachment-card { display: grid; grid-template-columns: 56px minmax(0, 1fr) auto; gap: 10px; align-items: center; border: 1px solid #1c2430; border-radius: 10px; background: #0a0f15; padding: 8px; }
    .attachment-card.image { background: linear-gradient(180deg, rgba(18, 24, 33, 0.92), rgba(10, 15, 21, 0.98)); }
    .attachment-thumb { width: 56px; height: 56px; border-radius: 8px; object-fit: cover; display: block; border: 1px solid #243041; background: #05070a; }
    .attachment-thumb-fallback { display: inline-flex; align-items: center; justify-content: center; font-size: 12px; font-weight: 800; color: #b8c6d8; }
    .attachment-meta { min-width: 0; display: grid; gap: 2px; }
    .attachment-meta strong { font-size: 12px; overflow-wrap: anywhere; }
    .attachment-meta span, .attachment-meta em { color: var(--muted); font-size: 11px; font-style: normal; line-height: 1.4; overflow-wrap: anywhere; }
    .attachment-remove { min-height: 30px; padding: 6px 10px; border-radius: 8px; background: #0e141d; color: #c7d2df; }
    .start-button, .cancel-button { min-height: 40px; }
    .execution-console { margin-top: 8px; border: 1px solid rgba(255, 255, 255, 0.04); border-radius: 8px; background: #06080b; padding: 7px 10px; }
    .timeline-strip { display: flex; align-items: center; gap: 9px; min-width: 0; white-space: nowrap; }
    .timeline-label { color: var(--text); font-size: 12px; font-weight: 800; flex: 0 0 auto; }
    .timeline-state { display: inline-flex; align-items: center; min-height: 20px; padding: 1px 7px; border-radius: 999px; font-size: 11px; font-weight: 800; color: var(--muted); background: #0b1118; flex: 0 0 auto; }
    .timeline-state.pass { color: var(--green); }
    .timeline-state.local { color: var(--blue); }
    .timeline-state.proposal-only { color: var(--yellow); }
    .timeline-state.blocked, .timeline-state.cancelled { color: var(--red); }
    .flow-rail { display: flex; align-items: center; gap: 6px; min-width: 0; overflow-x: auto; padding: 1px 0; scrollbar-width: thin; }
    .flow-step { display: inline-flex; align-items: center; gap: 5px; border: 0; border-radius: 0; background: transparent; padding: 0; min-height: auto; color: var(--muted); font-family: ui-monospace, SFMono-Regular, Menlo, Monaco, Consolas, "Liberation Mono", monospace; flex: 0 0 auto; }
    .flow-dot { width: 6px; height: 6px; border-radius: 999px; background: currentColor; opacity: 0.62; flex: 0 0 auto; }
    .flow-separator { color: #405064; font-size: 11px; flex: 0 0 auto; }
    .flow-step.running { color: var(--blue); }
    .flow-step.running .flow-dot { opacity: 1; animation: flowPulse 1s infinite ease-in-out; }
    .flow-step.pass { color: var(--green); }
    .flow-step.needs-approval, .flow-step.blocked { color: var(--yellow); }
    .flow-step.fail, .flow-step.cancelled { color: var(--red); }
    .flow-step.pending { color: #536174; }
    .flow-step strong { display: inline; margin: 0; font-size: 12px; font-weight: 700; }
    .flow-step em { color: inherit; font-size: 10px; font-style: normal; opacity: 0.72; }
    @keyframes flowPulse { 0%, 100% { transform: scale(0.82); box-shadow: 0 0 0 0 rgba(90, 169, 255, 0.38); } 50% { transform: scale(1.25); box-shadow: 0 0 0 5px rgba(90, 169, 255, 0); } }
    .conversation-result { display: grid; grid-template-columns: 38px minmax(0, 1fr); gap: 12px; align-items: start; }
    .assistant-avatar { display: inline-flex; align-items: center; justify-content: center; width: 38px; height: 38px; border-radius: 8px; background: #12301f; color: var(--green); font-weight: 900; border: 1px solid rgba(52, 211, 153, 0.35); }
    .assistant-message { min-width: 0; }
    .advanced-config { position: sticky; top: 90px; }
    .advanced-config details { border: 1px solid var(--line); border-radius: 8px; background: #090d13; margin-top: 8px; overflow: hidden; }
    .advanced-config summary { cursor: pointer; padding: 11px 12px; font-weight: 800; color: var(--text); }
    .advanced-config p { border-top: 1px solid var(--line); padding: 11px 12px; font-size: 12px; }
    .composer { position: sticky; bottom: 0; margin-top: 8px; padding-top: 10px; background: linear-gradient(180deg, rgba(13, 17, 23, 0.18), rgba(13, 17, 23, 0.92) 24%, rgba(13, 17, 23, 0.98)); border-top: 1px solid rgba(255, 255, 255, 0.03); }
    .run-details summary { cursor: pointer; color: var(--blue); font-size: 13px; font-weight: 800; margin-bottom: 10px; }
    .hero-workbench { border-color: #315a82; background: #101923; }
    .smart-entry { border-color: #315a82; background: #111923; }
    .entry-grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 10px; }
    .metric span { display: block; color: var(--muted); font-size: 12px; margin-bottom: 4px; }
    .metric strong { display: block; font-size: 18px; overflow-wrap: anywhere; }
    .proposal-evidence { display: grid; gap: 6px; min-width: 0; }
    .proposal-evidence .help { margin-top: 0; }
    .mini-details { border: 1px solid rgba(255, 255, 255, 0.05); border-radius: 8px; background: #0a0e14; overflow: hidden; }
    .mini-details summary { cursor: pointer; padding: 6px 8px; color: var(--blue); font-size: 11px; font-weight: 700; }
    .mini-details pre { margin: 0; border: 0; border-radius: 0; box-shadow: none; font-size: 11px; max-height: 220px; }
    table { border-collapse: collapse; width: 100%; background: var(--panel); border: 1px solid var(--line); border-radius: 8px; overflow: hidden; box-shadow: 0 10px 26px var(--shadow); }
    th, td { text-align: left; border-bottom: 1px solid var(--line); padding: 9px 10px; font-size: 13px; vertical-align: top; }
    th { color: var(--muted); background: #172231; font-weight: 700; }
    tr:last-child td { border-bottom: 0; }
    pre { background: #070b10; color: #dbeafe; border: 1px solid #1f2a37; padding: 12px; border-radius: 8px; overflow: auto; font-size: 12px; line-height: 1.45; }
    .pill { display: inline-block; padding: 3px 8px; border-radius: 999px; background: #0f141c; color: #b8c6d8; font-size: 11px; font-weight: 700; border: 1px solid #223043; }
    .warn-pill { background: #191117; color: var(--red); }
    .safe { color: var(--green); font-weight: 700; }
    .warn { color: var(--red); font-weight: 700; }
    .risk-badge, .status-label { display: inline-flex; align-items: center; min-height: 22px; padding: 2px 8px; border-radius: 999px; font-size: 12px; font-weight: 800; border: 1px solid var(--line); white-space: nowrap; }
    .risk-badge.low, .status-label.pass, .status-label.ready, .status-label.direct-execute-ready { color: var(--green); background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.35); }
    .risk-badge.medium, .status-label.local, .status-label.recorded, .status-label.draft-dry-run { color: var(--blue); background: rgba(90, 169, 255, 0.1); border-color: rgba(90, 169, 255, 0.35); }
    .risk-badge.high, .status-label.proposal-only, .status-label.yes { color: var(--yellow); background: rgba(251, 191, 36, 0.1); border-color: rgba(251, 191, 36, 0.35); }
    .risk-badge.critical, .status-label.blocked, .status-label.cancelled { color: var(--red); background: rgba(251, 113, 133, 0.1); border-color: rgba(251, 113, 133, 0.35); }
    .status-label.no { color: var(--green); background: rgba(52, 211, 153, 0.1); border-color: rgba(52, 211, 153, 0.35); }
    label { display: block; font-size: 13px; font-weight: 700; margin-bottom: 6px; }
    input, select, textarea { width: 100%; border: 1px solid var(--line); border-radius: 8px; padding: 9px 10px; font: inherit; color: var(--text); background: #0a0e14; }
    input:focus, select:focus, textarea:focus { outline: 2px solid rgba(90, 169, 255, 0.32); border-color: var(--blue); }
    textarea { min-height: 92px; resize: vertical; line-height: 1.45; }
    .goal-box { min-height: 128px; font-size: 15px; }
    .form-grid { display: grid; grid-template-columns: minmax(220px, 1.5fr) minmax(180px, 0.8fr) minmax(220px, 1fr); gap: 12px; align-items: end; }
    .control-grid { grid-template-columns: minmax(180px, 0.8fr) minmax(220px, 1fr) minmax(280px, auto); margin-top: 12px; }
    .button-row { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 12px; }
    .button-row.compact { align-items: end; margin-top: 0; }
    button { border: 1px solid #223043; background: #121821; color: #e8eef7; border-radius: 8px; padding: 9px 12px; font: inherit; font-weight: 700; cursor: pointer; box-shadow: none; }
    button:hover { background: #171e29; }
    button.primary-action { background: linear-gradient(180deg, #1e3a5f, #173253); border-color: #29496f; }
    button.primary-action:hover { background: linear-gradient(180deg, #21426b, #1a3a61); }
    button.secondary { background: #0a0e14; color: #c8d3e2; }
    button.danger { border-color: #4b2430; color: #fda4af; background: #140c10; }
    .link-button { display: inline-flex; align-items: center; justify-content: center; min-height: 39px; padding: 9px 12px; border: 1px solid #223043; border-radius: 8px; background: #0a0e14; color: #c8d3e2; text-decoration: none; font: inherit; font-weight: 700; }
    .link-button:hover { background: #171e29; color: #e8eef7; }
    .quick-row { display: flex; gap: 6px; flex-wrap: wrap; margin-top: 8px; }
    .compact-quick-row { margin-bottom: 8px; }
    .quick-chip { min-height: 30px; padding: 6px 10px; border-radius: 999px; background: #090d13; color: #b8c6d8; font-size: 12px; font-weight: 600; }
    .quick-chip:hover { color: var(--text); background: #0d1218; }
    .policy-strip { display: flex; gap: 8px; flex-wrap: wrap; margin-top: 8px; padding: 0; border: 0; border-radius: 0; background: transparent; }
    .policy-strip span { display: inline-flex; align-items: center; gap: 6px; color: var(--muted); font-size: 12px; }
    .side-stack { display: grid; gap: 8px; margin-bottom: 8px; }
    .side-panel { border: 1px solid var(--line); border-radius: 8px; background: #090d13; padding: 10px; }
    .side-kicker { display: block; color: var(--muted); font-size: 11px; font-weight: 700; text-transform: uppercase; letter-spacing: 0.08em; margin-bottom: 8px; }
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
    .action-feedback-grid { display: grid; grid-template-columns: minmax(120px, 0.5fr) minmax(220px, 1.4fr) minmax(120px, 0.5fr) minmax(220px, 1.1fr); gap: 10px; margin-bottom: 12px; }
    .action-feedback-grid div { border: 1px solid var(--line); border-radius: 8px; background: #0c1219; padding: 10px; min-width: 0; }
    .action-feedback-grid span { display: block; color: var(--muted); font-size: 11px; margin-bottom: 5px; }
    .action-feedback-grid strong { display: block; font-size: 12px; overflow-wrap: anywhere; }
    .details-drawer { border: 1px solid var(--line); background: var(--panel); border-radius: 8px; padding: 0; overflow: hidden; box-shadow: 0 10px 26px var(--shadow); }
    .details-drawer summary { cursor: pointer; color: var(--blue); font-size: 13px; font-weight: 800; padding: 12px 14px; background: #101923; }
    .details-drawer pre { margin: 0; border: 0; border-radius: 0; box-shadow: none; }
    ul { margin: 0; padding-left: 18px; color: var(--muted); }
    li { margin: 5px 0; }
    body:not(.login-gated) header:not(.login-header) { position:fixed; inset:0 auto 0 0; width:var(--sidebar-width); height:100vh; padding:22px 16px 16px; border:0; border-right:1px solid var(--line); background:rgba(13,18,28,.96); box-shadow:none; display:flex; flex-direction:column; backdrop-filter:blur(20px); }
    body:not(.login-gated) header:not(.login-header) .brand-row { flex:0 0 auto; padding:0 6px 20px; border-bottom:1px solid var(--line); }
    .sidebar-toggle,.mobile-sidebar-toggle { display:inline-flex; align-items:center; justify-content:center; width:32px; height:32px; min-height:32px; padding:0; border-radius:8px; color:#98a2b3; background:transparent; }
    .mobile-sidebar-toggle { display:none; }
    body:not(.login-gated) header:not(.login-header) .logo-frame { width:38px; height:34px; }
    body:not(.login-gated) header:not(.login-header) .subhead { color:#667085; }
    body:not(.login-gated) header:not(.login-header) .top-nav { order:2; flex:1 1 auto; display:flex; flex-direction:column; align-items:stretch; gap:3px; margin:14px 0 0; padding:0; overflow-y:auto; }
    body:not(.login-gated) header:not(.login-header) .top-nav a { min-height:40px; padding:9px 11px; border-radius:9px; gap:10px; }
    body:not(.login-gated) header:not(.login-header) .top-nav a.active { background:rgba(79,124,255,.14); border-color:rgba(107,145,255,.22); color:#fff; }
    .nav-icon { display:grid; place-items:center; width:20px; color:#7f8ea3; }
    .nav-icon svg { width:20px; height:20px; fill:none; stroke:currentColor; stroke-width:1.7; stroke-linecap:round; stroke-linejoin:round; }
    .top-nav a.active .nav-icon { color:#8eabff; }
    .nav-group-label { padding:13px 11px 6px; color:#596579; font-size:10px; font-weight:800; letter-spacing:.14em; text-transform:uppercase; }
    .nav-spacer { flex:1 1 auto; min-height:20px; }
    body:not(.login-gated) header:not(.login-header) .top-status { order:3; position:static; display:grid; gap:5px; margin:12px 0 0; padding:12px 4px 0; border-top:1px solid var(--line); }
    body:not(.login-gated) header:not(.login-header) .top-status-pill { min-height:22px; padding:0; border:0; background:transparent; font-weight:600; }
    body:not(.login-gated) header:not(.login-header) .auth-strip { order:4; position:static; width:auto; margin:10px 0 0; padding:12px 4px 0; border-top:1px solid var(--line); }
    body:not(.login-gated) header:not(.login-header) .auth-identity { text-align:left; }
    body:not(.login-gated) header:not(.login-header) .auth-identity span { display:block; }
    body:not(.login-gated) main { width:auto; max-width:none; margin-left:var(--sidebar-width); padding:0 32px 56px; overflow-x:hidden; }
    body.sidebar-collapsed { --sidebar-width:72px; }
    body.sidebar-collapsed header:not(.login-header) { padding-left:10px; padding-right:10px; }
    body.sidebar-collapsed header:not(.login-header) .brand-row { flex-direction:column; justify-content:center; gap:8px; padding-left:0; padding-right:0; }
    body.sidebar-collapsed header:not(.login-header) .brand-copy,body.sidebar-collapsed header:not(.login-header) .nav-label,body.sidebar-collapsed header:not(.login-header) .nav-group-label,body.sidebar-collapsed header:not(.login-header) .top-status,body.sidebar-collapsed header:not(.login-header) .auth-identity { display:none; }
    body.sidebar-collapsed header:not(.login-header) .brand-lockup { display:flex; }
    body.sidebar-collapsed header:not(.login-header) .logo-frame { width:32px; height:29px; }
    body.sidebar-collapsed header:not(.login-header) .top-nav a { justify-content:center; padding:9px; }
    body.sidebar-collapsed header:not(.login-header) .nav-icon { width:20px; }
    body.sidebar-collapsed header:not(.login-header) .auth-strip { justify-content:center; padding-left:0; padding-right:0; }
    body.sidebar-collapsed header:not(.login-header) .auth-logout { width:32px; overflow:hidden; color:transparent; position:relative; }
    body.sidebar-collapsed header:not(.login-header) .auth-logout::after { content:"↪"; color:#98a2b3; position:absolute; inset:0; display:grid; place-items:center; }
    .app-toolbar { height:72px; margin:0 -32px 28px; padding:0 32px; border-bottom:1px solid var(--line); display:flex; align-items:center; justify-content:space-between; gap:16px; background:rgba(7,10,16,.78); backdrop-filter:blur(16px); position:sticky; top:0; z-index:2; }
    .app-toolbar h2 { margin:0; font-size:18px; }
    .app-toolbar-actions { display:flex; align-items:center; gap:8px; }
    .language-switch { min-height:34px; width:auto; padding:6px 30px 6px 10px; background:var(--surface-1); font-size:12px; }
    .metric,.panel,.workbench,.smart-entry,.output-card { box-shadow:none; }
    button.primary-action,.primary-link { background:var(--primary); border-color:rgba(255,255,255,.12); box-shadow:0 8px 24px rgba(79,124,255,.18); }
    button.primary-action:hover,.primary-link:hover { background:var(--primary-hover); }
    table { box-shadow:none; }
    @media (max-width: 1100px) { .domain-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width: 760px) { .brand-row { align-items: flex-start; } .logo-frame { width:72px; height:40px; } main { padding:18px 14px 36px; } .product-hero { align-items:flex-start; flex-direction:column; padding:22px; } .product-hero h2 { font-size:24px; } .command-center-hero { padding:22px 0 20px; } .command-center-copy h2 { font-size:28px; } .command-compose-footer { align-items:stretch; flex-direction:column; } .current-run-strip { grid-template-columns:12px minmax(0,1fr); } .current-run-actions { grid-column:2; align-items:flex-start; flex-wrap:wrap; } .diagnostic-snapshot { grid-template-columns:repeat(2,1fr); } .domain-summary,.domain-grid { grid-template-columns:1fr; } .application-suite-head { flex-direction:column-reverse; } .domain-architecture { align-items:flex-start; flex-direction:column; } .diagnostic-links,.activity-feed,.operation-card-grid,.system-strip,.summary-grid,.product-grid,.goal-layout,.timeline,.action-feedback-grid,.flow-rail,.conversation-result,.chat-message,.chat-message.user,.attachment-bubble,.attachment-list { grid-template-columns:1fr; } .activity-item { grid-template-columns:34px minmax(0,1fr); } .activity-item time { grid-column:2; } .goal-sidebar { position:static; } .stage-rail { overflow-x:auto; min-width:520px; } .chat-message.user .message-avatar,.chat-message.user .message-body { grid-column:auto; grid-row:auto; } .workspace-hero { display:block; } .workspace-meta { margin-top:8px; } .auth-strip,.auth-actions,.auth-help-row { align-items:flex-start; flex-direction:column; } .auth-card-head h3,.auth-side h2 { font-size:28px; } .auth-product-panel { min-height:180px; } .auth-product-panel::before { inset:18px; } .auth-side { padding:24px; } .auth-path-actions { grid-template-columns:1fr; } }
    .sidebar-scrim { display:none; }
    @media (max-width: 900px) { body:not(.login-gated) header:not(.login-header) { position:fixed; inset:0 auto 0 0; width:260px; height:100vh; padding:18px 14px; transform:translateX(-105%); transition:transform .2s ease; z-index:20; } body.sidebar-open header:not(.login-header) { transform:translateX(0); } body.sidebar-open .sidebar-scrim { display:block; position:fixed; inset:0; z-index:19; border:0; border-radius:0; background:rgba(0,0,0,.56); backdrop-filter:blur(2px); } body:not(.login-gated) header:not(.login-header) .brand-row { padding:0 4px 16px; } body:not(.login-gated) header:not(.login-header) .top-nav { flex-direction:column; overflow-y:auto; margin-top:12px; } body:not(.login-gated) header:not(.login-header) .nav-group-label,body:not(.login-gated) header:not(.login-header) .nav-spacer,body:not(.login-gated) header:not(.login-header) .top-status,body:not(.login-gated) header:not(.login-header) .auth-strip { display:flex; } body:not(.login-gated) main,body.sidebar-collapsed main { margin-left:0; padding:0 16px 40px; } .app-toolbar { height:60px; margin:0 -16px 20px; padding:0 16px; } .mobile-sidebar-toggle { display:inline-flex; } .sidebar-toggle { display:none; } .form-grid,.workspace-controls,.workspace-shell,.auth-shell,.auth-entry-shell { grid-template-columns:1fr; } .advanced-config,.project-rail { position:static; } .auth-side { order:-1; justify-self:stretch; } }
  </style>
</head>
<body class="${useAuthLayout ? "login-gated" : ""}">
  <header class="${headerClass}">
    <div class="brand-row">
      <div class="brand-lockup">
        <span class="logo-frame"><img class="brand-logo" src="/assets/anksen-logo.svg" alt="ANKSEN Logo"></span>
        <div class="brand-copy">
          <h1 data-i18n-raw>${escapeHtml(messages.app.title)}</h1>
          <div class="subhead">${escapeHtml(messages.app.subtitle)}</div>
        </div>
      </div>
      ${useAuthLayout ? "" : `<button id="sidebar-toggle" class="sidebar-toggle" type="button" aria-label="折叠侧栏" title="折叠侧栏">‹</button>`}
    </div>
    ${headerMeta}
  </header>
  ${useAuthLayout ? "" : `<button id="sidebar-scrim" class="sidebar-scrim" type="button" aria-label="关闭导航"></button>`}
  <main>${useAuthLayout ? "" : `<div class="app-toolbar"><div style="display:flex;align-items:center;gap:10px"><button id="mobile-sidebar-toggle" class="mobile-sidebar-toggle" type="button" aria-label="打开导航">☰</button><div><span class="eyebrow">ANKSEN STUDIO</span><h2>${escapeHtml(route.label)}</h2></div></div><div class="app-toolbar-actions"><span class="status-label pass">● ${escapeHtml(data.active_project_id ?? "Workspace")}</span><select id="language-switch" class="language-switch" aria-label="Language"><option value="zh-CN">简体中文</option><option value="en">English</option></select></div></div>`}${mainContent}</main>
  ${interactiveScript()}
  <script>
  (() => {
    const sidebarToggle = document.getElementById('sidebar-toggle');
    const mobileSidebarToggle = document.getElementById('mobile-sidebar-toggle');
    const sidebarScrim = document.getElementById('sidebar-scrim');
    const collapsed = localStorage.getItem('anksen-sidebar-collapsed') === 'true';
    if (collapsed && window.innerWidth > 900) document.body.classList.add('sidebar-collapsed');
    function syncSidebarLabel() {
      if (!sidebarToggle) return;
      const isCollapsed = document.body.classList.contains('sidebar-collapsed');
      sidebarToggle.textContent = isCollapsed ? '›' : '‹';
      sidebarToggle.title = isCollapsed ? '展开侧栏' : '折叠侧栏';
      sidebarToggle.setAttribute('aria-label', sidebarToggle.title);
      for (const link of document.querySelectorAll('.top-nav a')) link.title = isCollapsed ? (link.querySelector('.nav-label')?.textContent || '') : '';
    }
    sidebarToggle?.addEventListener('click', () => {
      document.body.classList.toggle('sidebar-collapsed');
      localStorage.setItem('anksen-sidebar-collapsed', String(document.body.classList.contains('sidebar-collapsed')));
      syncSidebarLabel();
    });
    mobileSidebarToggle?.addEventListener('click', () => document.body.classList.add('sidebar-open'));
    sidebarScrim?.addEventListener('click', () => document.body.classList.remove('sidebar-open'));
    document.querySelectorAll('.top-nav a').forEach((link) => link.addEventListener('click', () => document.body.classList.remove('sidebar-open')));
    syncSidebarLabel();
    const select = document.getElementById('language-switch');
    if (!select) return;
    const dictionary = {
      '首页':'Home','运行':'Runs','领域中心':'Domain Center','项目':'Projects','报告':'Reports','运行管理':'Operations','设置':'Settings','任务':'Tasks','Agent':'Workers','运行时':'Runtime','治理':'Governance',
      '新建目标':'New goal','查看运行报告':'View reports','今日概览':'Today overview','当前进展':'Current progress','快捷入口':'Quick links','查看全部':'View all','打开':'Open',
      '你想让 Studio 完成什么？':'What should Studio accomplish?','开始执行':'Start execution','刷新状态':'Refresh','执行进度':'Execution progress','任务列表':'Tasks','执行结果':'Results','系统准备度':'Readiness',
      '执行摘要':'Execution summary','等待批准':'Awaiting approval','等待调度':'Awaiting scheduling','发布检查':'Release check','任务进展':'Task progress','批准状态':'Approval','当前进展':'Progress','技术详情与审计证据':'Technical details and audit evidence'
      ,'从一个目标开始，让 Studio 完成剩下的工作':'Start with a goal. Let Studio handle the rest.','你想让 Studio 完成什么？':'What should Studio accomplish?','目标':'Goal','系统状态':'System status','当前项目':'Current project','执行中的任务':'Running tasks','需要批准':'Needs approval','计划已生成':'Plan created','任务已进入队列':'Tasks queued','最新检查':'Latest check','项目管理':'Project management','运行资源':'Runtime resources','高级任务中心':'Advanced task center','查看技术运行详情':'View technical runtime details'
      ,'执行边界':'Execution boundaries','自动提交':'Auto commit','推送与部署':'Push and deploy','关闭':'Off','禁止':'Blocked','需要关注':'Needs attention','系统已就绪':'System ready','安全模式':'Safe mode','已完成':'Completed','执行中':'Running','等待执行':'Queued','需要处理':'Needs attention','失败':'Failed','状态':'Status','优先级':'Priority','风险':'Risk','成功任务':'Successful tasks','失败任务':'Failed tasks','阻塞任务':'Blocked tasks','系统准备度':'Readiness'
      ,'本轮结论':'Run summary','需要决策':'Decisions needed','计划与调度':'Planning and scheduling','安全检查':'Safety checks','发布动作':'Release actions','一切正常':'All clear','任务进展':'Task progress','已批准':'Approved','无需批准':'No approval required','等待人工确认':'Awaiting confirmation','等待进入队列':'Awaiting queue','已进入执行队列':'Queued for execution','查看 Session、Worker、Approval 与原始报告':'View session, workers, approvals and raw report'
      ,'项目管理':'Project management','当前项目上下文':'Current project context','项目组合':'Project portfolio','连接状态':'Connection status','执行路由':'Execution route','分支':'Branch','仓库状态':'Repository status','写入策略':'Write policy','已连接':'Connected','未连接':'Not connected','规划中':'Planned','项目上下文':'Project context','派发计划':'Dispatch plans','生命周期':'Lifecycle','阻塞原因':'Block reason'
      ,'操作中心':'Operations center','操作数量':'Actions','默认模式':'Default mode','写入':'Writes','操作':'Action','意图':'Intent','执行模式':'Execution mode','治理闸门':'Governance gate','生成计划':'Generate plan','执行任务':'Execute task','取消':'Cancel','等待操作':'Ready','生成中':'Planning','需审批':'Approval required','已取消':'Cancelled'
      ,'Worker 节点':'Workers','服务器访问':'Server access','模型调用':'Model calls','能力标签':'Capabilities','类型':'Type','系统':'System','在线':'Online','离线':'Offline','健康状态':'Health','运行状态':'Runtime status','配置数量':'Profiles','供应方':'Providers','外部调用':'External calls'
      ,'配置中心':'Settings','当前账号':'Current account','当前套餐':'Current plan','直执上限':'Direct-execution limit','项目范围':'Project scope','可见路由':'Visible routes','可执行动作':'Allowed actions','账号、角色与套餐':'Accounts, roles and plans','角色数':'Roles','用户数':'Users','并发上限':'Concurrency limit','账号':'Account','主角色':'Primary role','套餐':'Plan','角色矩阵':'Role matrix','范围策略':'Scope policy','能力':'Capabilities','关键能力':'Key capabilities','套餐矩阵':'Plan matrix','层级':'Tier','席位':'Seats','并发':'Concurrency','路由与动作授权':'Route and action access','路由':'Route','可见性':'Visibility','所需能力':'Required capabilities','缺失能力':'Missing capabilities','授权结果':'Access result','原因':'Reason','团队邀请与审批草稿':'Team invitations and approval drafts','邀请总数':'Invitations','待审批':'Pending approval','已落成':'Provisioned','保存草稿':'Save draft','重置草稿':'Reset draft'
      ,'凭证':'Credentials','引用数量':'References','后端数量':'Backends','密钥明文':'Plaintext secrets','凭证文件':'Credential files','治理策略':'Governance policy','发布闸门':'Release gates','生产操作':'Production operations','治理来源':'Governance sources','规划':'Planning','路线记忆':'Roadmap memory','里程碑完成度':'Milestone progress','里程碑':'Milestone','记忆中心':'Memory center','全局上下文':'Global context','必读文件':'Required reading','安全边界':'Safety boundaries','项目上下文清单':'Project context inventory','最近决策':'Recent decisions','日期':'Date','决策':'Decision','来源':'Source','数据源':'Data sources','原始上下文详情':'Raw context details'
      ,'登录':'Sign in','申请加入':'Request access','用户名':'Username','密码':'Password','姓名':'Name','申请类型':'Request type','申请说明':'Request details','提交申请':'Submit request','返回登录':'Back to sign in','退出':'Sign out','折叠侧栏':'Collapse sidebar','展开侧栏':'Expand sidebar','打开导航':'Open navigation','关闭导航':'Close navigation','简体中文':'Simplified Chinese'
      ,'正常':'Healthy','关注':'Attention','全部通过':'All checks passed','存在待处理项':'Items need attention','尚无发布检查':'No release check yet','低':'Low','中':'Medium','高':'High','严重':'Critical','全部在线':'All online','安全演练':'Safe simulation','受控执行':'Controlled execution','未开始':'Not started','待处理':'Pending','全部完成':'Completed','未生成':'Not generated','未知':'Unknown','未配置':'Not configured','不限':'Unlimited','全部项目':'All projects','无':'None','是':'Yes','否':'No'
      ,'Studio 平台所有者':'Studio Owner','平台所有者':'Platform Owner','内部预览':'Internal Preview','Studio 内测管理员':'Studio Beta Admin','工作台管理员':'Workspace Admin','Studio 运营执行者':'Studio Operator','运营执行者':'Operator','Studio 只读观察者':'Studio Viewer','只读观察者':'Viewer','UAT 审阅者':'UAT Reviewer','审批审阅者':'Approval Reviewer','安全管理员':'Security Admin','全部能力':'All capabilities','全部 Runtime':'All runtimes'
      ,'仅保存浏览器草稿，不写真实凭证。':'Drafts are stored in this browser only. No credentials are written.','草稿仅保存在浏览器 localStorage，不写仓库、不写真实凭证。':'Drafts stay in browser storage and never write to the repository or credentials.','允许路由':'Allowed routes','允许动作':'Allowed actions','拒绝动作':'Denied actions','当前 Runtime 白名单':'Current runtime allowlist','阶段':'Stage','依赖':'Dependency','检查项':'Checks','本地预览':'Local preview','服务器预览':'Server preview','当前阶段已完成':'Stage completed','已确认':'Confirmed','下一闸门':'Next gate','已通过':'Passed','一致性状态':'Consistency status','查看草稿模式配置':'View draft configuration','项目配置':'Project configuration','Runtime 配置':'Runtime configuration','Worker 配置':'Worker configuration','Credential Reference 配置':'Credential reference configuration','Governance 策略查看':'Governance policy'
      ,'当前没有待处理邀请，可直接创建新 invite。':'There are no pending invitations. You can create a new invite.','当前没有 invite 草稿。可通过 CLI 先创建：':'There is no invitation draft. Create one with the CLI:','账号 owner 已通过 Access Center 校验。':'Account owner passed Access Center validation.','当前没有 release promotion 告警，可以继续按闸门推进。':'There are no release-promotion warnings. Gate progression may continue.'
      ,'想让 Studio 完成什么？':'What should Studio accomplish?','描述结果，Studio 会负责规划、调度、执行和报告。':'Describe the outcome. Studio will plan, schedule, execute, and report.','输入目标，例如：完善 Runtime 文档并生成检查报告':'Enter a goal, for example: improve Runtime docs and generate a report','开始运行':'Run','试试':'Try','完善 Runtime 文档':'Improve Runtime documentation','生成项目风险报告':'Generate a project risk report','整理最近运行结果':'Summarize recent runs','运行正常':'Healthy','任务已调度':'Tasks scheduled','等待队列':'Awaiting queue','查看运行':'View run','无需处理':'All clear','当前没有等待批准或阻塞的操作。':'No approvals or blocked operations need attention.','最近结果':'Recent outcomes','查看全部报告 →':'View all reports →','任务图已提交':'Task graph submitted','运行边界已生效':'Runtime boundaries enforced','真实 Codex、推送和部署仍保持关闭':'Real Codex, push, and deploy remain disabled','运行管理':'Operations','日常工作无需进入这里。需要诊断任务、Worker、Runtime 或审批时，再打开对应模块。':'You only need this area to diagnose tasks, workers, runtime, or approvals.','任务与队列':'Tasks and queue','查看任务生命周期、调度队列和执行证据。':'Inspect task lifecycle, scheduling queues, and execution evidence.','检查在线 Worker、领取状态与租约健康度。':'Inspect worker health, claims, and leases.','查看 Runtime Adapter、限制与执行模式。':'Review runtime adapters, limits, and execution modes.','处理审批、策略和 Activation Readiness。':'Manage approvals, policy, and activation readiness.','外部写入':'External writes','可用操作':'Available actions','审计日志':'Audit log','持续记录':'Continuously recorded','打开高级操作台':'Open advanced operations','高级操作台':'Advanced operations'
      ,'已规划':'Planned','已调度':'Scheduled','验证':'Validating','最近':'Recently','自动':'Automatic','持续':'Continuous','最新检查全部通过':'Latest check passed','项能力':' capabilities','运行证据已保存':'Runtime evidence saved','高风险步骤不会自动执行。':'High-risk steps never run automatically.','查看审批':'Review approvals','默认模式':'Default mode'
      ,'自主工作区':'Autonomous workspace','当前运行':'Current run','项已调度':' scheduled','项等待队列':' awaiting queue','项待批准':' awaiting approval','描述你想完成的目标、背景和预期结果……':'Describe the goal, context, constraints, and expected outcome…'
      ,'高级运行信息':'Advanced runtime information','仅在诊断问题时查看':'Open only when diagnosing an issue','已进入队列':'Queued','系统检查':'System checks','需关注':'Needs attention','查看完整生命周期、调度与审计证据':'View the full lifecycle, scheduling, and audit evidence','查看执行模式、Adapter 和安全边界':'Review execution modes, adapters, and safety boundaries','查看结果、决策事项和验证记录':'Review outcomes, decisions, and validation records','执行报告':'Execution reports'
      ,'一个 Studio，覆盖多个专业领域':'One Studio for multiple professional domains','所有领域共享项目、身份、Kernel、Scheduler、Worker、Runtime、审批和报告。领域包只定义专业合同、技能组合和验收标准。':'All domains share projects, identity, kernel, scheduler, workers, runtime, approvals, and reports.','新建跨领域目标':'New cross-domain goal','领域总数':'Total domains','正式可用':'Active','具备基础':'Foundation','规划中':'Planned','专业领域':'Professional domains','直接选择领域，或在首页输入目标让 Studio 自动识别。':'Select a domain or let Studio detect it from the goal.','可使用':'Available','基础能力已具备':'Foundation available','进入领域':'Open domain','统一运行架构':'Unified runtime architecture','Domain Pack 不是独立应用':'Domain packs are not separate apps','领域选择只改变专业规划和验收方式，不复制底层平台。跨领域 Goal 可以组合多个 Pack，并继续形成一张统一 Task Graph。':'Domain selection changes professional planning and acceptance without duplicating the platform.'
      ,'应用与业务领域':'Applications and business domains','一个 Studio 统一承载软件工厂、视频工厂和智慧园区 ERP。业务域定义专业 Workflow，Agent 与 Runner 由运行时按 Skills 分配。':'One Studio hosts Software Factory, Video Factory, and Smart Park ERP. Business workflows define the work while runtime assigns agents and runners by skill.','业务应用':'Business applications','业务领域':'Business domains','当前可运行':'Runnable now','在线 Runner':'Online runners','软件工厂':'Software Factory','视频工厂':'Video Factory','智慧园区 ERP':'Smart Park ERP','软件研发':'Software Engineering','视频生产':'Video Production','战略执行':'Strategy Execution','人力资源':'Human Resources','财务管理':'Finance Management','业务工作流':'Business workflow','可以运行':'Runnable','能力未接通':'Capability unavailable','缺少 Runner':'Runner missing','创建领域目标':'Create domain goal','统一执行内核':'Unified execution kernel','业务领域与执行资源严格分层':'Business domains and execution resources are separated','应用负责产品入口，领域 Workflow 负责业务步骤，Skill 描述能力，Agent 承担阶段职责，在线 Runner 执行任务；所有任务继续进入同一个持久化 Kernel。':'Applications provide product entry points, domain workflows define business steps, skills describe capabilities, agents own stage responsibilities, and online runners execute every task through the same persistent kernel.','应用':'Application','业务域':'Business domain','应用与业务领域':'Application and business domain','自动识别（通用执行）':'Auto-detect (general execution)','选择业务领域后，将使用该领域的 Workflow 与 Skills；当前为安全演练模式。':'Selecting a business domain activates its workflow and skills. Safe simulation mode remains enabled.'
    };
    const originals = new WeakMap();
    const attributeOriginals = new WeakMap();
    let applying = false;
    let currentLanguage = 'zh-CN';
    function translated(value, language) {
      if (language !== 'en') return value;
      if (dictionary[value]) return dictionary[value];
      let phrase = value;
      for (const [source, target] of Object.entries(dictionary).sort((a,b) => b[0].length - a[0].length)) {
        if (source.length > 1 && phrase.includes(source)) phrase = phrase.replaceAll(source, target);
      }
      if (phrase !== value) return phrase;
      const patterns = [
        [/^(\d+) 项$/, '$1 items'], [/^(\d+) 角色$/, '$1 roles'], [/^(\d+) 套餐$/, '$1 plans'], [/^(\d+) 个执行计划$/, '$1 execution plans'], [/^(\d+) 个 Worker 在线$/, '$1 workers online'],
        [/^(\d+) 项等待进入队列$/, '$1 awaiting queue'], [/^(\d+) 项等待调度$/, '$1 awaiting scheduling'], [/^风险 (LOW|MEDIUM|HIGH|CRITICAL)$/, 'Risk $1'],
        [/^下一阶段：已完成$/, 'Next stage: completed'], [/^项目 · (.+)$/, 'Project · $1']
      ];
      for (const [pattern, replacement] of patterns) if (pattern.test(value)) return value.replace(pattern, replacement);
      return value;
    }
    function localizeTextNode(node, language) {
      if (!node.parentElement || node.parentElement.closest('pre,code,script,style,[data-i18n-raw]')) return;
      const raw = node.nodeValue || '';
      const trimmed = raw.trim();
      if (!trimmed) return;
      if (!originals.has(node)) originals.set(node, trimmed);
      const original = originals.get(node);
      const next = translated(original, language);
      node.nodeValue = raw.replace(trimmed, next);
    }
    function localizeTree(root, language) {
      const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
      const nodes = [];
      while (walker.nextNode()) nodes.push(walker.currentNode);
      nodes.forEach((node) => localizeTextNode(node, language));
      const elements = root.querySelectorAll ? [root, ...root.querySelectorAll('[placeholder],[aria-label],[title]')] : [];
      for (const element of elements) {
        if (!(element instanceof Element)) continue;
        let saved = attributeOriginals.get(element);
        if (!saved) { saved = {}; attributeOriginals.set(element, saved); }
        for (const attr of ['placeholder','aria-label','title']) {
          if (!element.hasAttribute(attr)) continue;
          if (saved[attr] == null) saved[attr] = element.getAttribute(attr) || '';
          element.setAttribute(attr, translated(saved[attr], language));
        }
      }
    }
    function applyLanguage(language) {
      applying = true;
      currentLanguage = language;
      document.documentElement.lang = language;
      const titleParts = document.title.split(' - ');
      if (!document.documentElement.dataset.originalTitle) document.documentElement.dataset.originalTitle = titleParts[0];
      document.title = (language === 'en' ? translated(document.documentElement.dataset.originalTitle, language) : document.documentElement.dataset.originalTitle) + ' - ANKSEN Studio';
      localizeTree(document.body, language);
      localStorage.setItem('anksen-language', language);
      select.value = language;
      applying = false;
    }
    select.addEventListener('change', () => applyLanguage(select.value));
    applyLanguage(localStorage.getItem('anksen-language') || 'zh-CN');
    new MutationObserver((records) => {
      if (applying) return;
      applying = true;
      for (const record of records) for (const node of record.addedNodes) {
        if (node.nodeType === Node.TEXT_NODE) localizeTextNode(node, currentLanguage);
        else if (node.nodeType === Node.ELEMENT_NODE) localizeTree(node, currentLanguage);
      }
      applying = false;
    }).observe(document.body, {childList:true,subtree:true});
  })();
  </script>
</body>
</html>`;
}

function pageDashboard(_model, data) {
  const release = data.release_consistency ?? {};
  const lifecycle = lifecycleSummary(data);
  const projectName = data.active_project?.project_name ?? data.active_project?.label ?? data.active_project_id ?? "当前项目";
  const healthy = (data.autopilot.latest_summary?.validation ?? "unknown") === "PASS";
  const goalTitle = data.autopilot.latest_summary?.goal ?? data.autopilot.latest_summary?.title ?? "完善 Runtime 文档";
  const executionHref = routeHref("/execution", data.active_project_id);
  return `<section class="command-center-hero">
    <div class="command-orb command-orb-a"></div><div class="command-orb command-orb-b"></div>
    <div class="command-center-copy"><span class="eyebrow">自主工作区</span><h2>想让 Studio 完成什么？</h2><p>描述结果，Studio 会负责规划、调度、执行和报告。</p></div>
    <div class="command-box"><textarea id="command-goal" rows="4" placeholder="描述你想完成的目标、背景和预期结果……"></textarea><div class="command-compose-footer"><div class="suggestion-row"><span>试试</span><button type="button" data-command-suggestion="完善 Runtime 文档">完善 Runtime 文档</button><button type="button" data-command-suggestion="检查项目并生成风险报告">生成项目风险报告</button><button type="button" data-command-suggestion="整理最近运行结果">整理最近运行结果</button></div><button id="command-run" class="primary-action" type="button">开始运行 <span aria-hidden="true">→</span></button></div></div>
  </section>
  <section class="current-run-strip"><span class="run-pulse"></span><div class="current-run-copy"><span class="eyebrow">当前运行 · 执行中</span><h2>${escapeHtml(goalTitle)}</h2><p>${escapeHtml(projectName)} · ${escapeHtml(lifecycle.injected)} 项已调度 · ${escapeHtml(lifecycle.ready_inject)} 项等待队列</p><div class="compact-progress"><i></i></div></div><div class="current-run-actions"><span class="status-label ${healthy ? "pass" : "local"}">${healthy ? "运行正常" : "安全演练"}</span>${lifecycle.pending_approval > 0 ? `<a class="attention-chip" href="${routeHref("/governance", data.active_project_id)}">${escapeHtml(lifecycle.pending_approval)} 项待批准</a>` : `<span class="clear-chip">✓ 无需处理</span>`}<a class="link-button" href="${executionHref}">查看运行</a></div></section>
  <section class="recent-outcomes"><div class="section-head"><h2>最近结果</h2><a class="quiet-link" href="${routeHref("/autopilot", data.active_project_id)}">查看全部报告 →</a></div><div class="activity-feed">
    <div class="activity-item"><span class="activity-icon success">✓</span><div><strong>最新检查${healthy ? "全部通过" : "已完成"}</strong><p>${escapeHtml(release.status ?? "运行证据已保存")}</p></div><time>最近</time></div>
    <div class="activity-item"><span class="activity-icon">↗</span><div><strong>任务图已提交</strong><p>${escapeHtml(data.project_router.dispatch_plan_count ?? 0)} 个执行计划可供 Scheduler 消费</p></div><time>自动</time></div>
    <div class="activity-item"><span class="activity-icon">●</span><div><strong>运行边界已生效</strong><p>真实 Codex、推送和部署仍保持关闭</p></div><time>持续</time></div>
  </div></section>
  <details class="advanced-section home-diagnostics"><summary><span>高级运行信息</span><small>仅在诊断问题时查看</small></summary><div class="advanced-body">
    <div class="diagnostic-snapshot"><div><span>已进入队列</span><strong>${escapeHtml(lifecycle.injected)}</strong></div><div><span>等待队列</span><strong>${escapeHtml(lifecycle.ready_inject)}</strong></div><div><span>等待批准</span><strong>${escapeHtml(lifecycle.pending_approval)}</strong></div><div><span>系统检查</span><strong class="${healthy ? "safe" : "warn"}">${healthy ? "正常" : "需关注"}</strong></div></div>
    <div class="diagnostic-links"><a href="${routeHref("/actions", data.active_project_id)}"><span class="diagnostic-link-icon">${navIcon("actions")}</span><div><strong>任务与队列</strong><p>查看完整生命周期、调度与审计证据</p></div><span>→</span></a><a href="${routeHref("/runtime", data.active_project_id)}"><span class="diagnostic-link-icon">${navIcon("projects")}</span><div><strong>Runtime</strong><p>查看执行模式、Adapter 和安全边界</p></div><span>→</span></a><a href="${routeHref("/autopilot", data.active_project_id)}"><span class="diagnostic-link-icon">${navIcon("autopilot")}</span><div><strong>执行报告</strong><p>查看结果、决策事项和验证记录</p></div><span>→</span></a></div>
  </div></details>
  <script>(()=>{const input=document.getElementById('command-goal'),run=document.getElementById('command-run');const openRun=()=>{const goal=input.value.trim();if(!goal){input.focus();return;}const url=new URL('${executionHref}',location.origin);url.searchParams.set('goal',goal);location.href=url.pathname+url.search;};run.addEventListener('click',openRun);input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();openRun();}});document.querySelectorAll('[data-command-suggestion]').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.commandSuggestion;input.focus();}));})();</script>`;
}

async function pageDomains(data) {
  const center = domainCenterSummary();
  const runtimeRegistry = await loadDomainRuntimeRegistry();
  const workers = (runtimeRegistry.workerRegistry.workers ?? []).filter(worker=>worker.status==="available");
  const activeProject = data.active_project_id ?? "workspace";
  let readyDomains = 0;
  const applications = center.applications.map(application => {
    const cards = application.domains.map(domain => {
      const capability = resolveDomainCapability(domain, runtimeRegistry);
      const ready = capability.status === "READY";
      if (ready) readyDomains += 1;
      const executionUrl = `${routeHref("/execution",activeProject)}${routeHref("/execution",activeProject).includes("?") ? "&" : "?"}domain=${encodeURIComponent(domain.id)}`;
      const bindings = capability.stages.map(binding => `<div class="domain-binding"><span title="${escapeHtml(binding.skillType)}">${escapeHtml(binding.businessSkillId.replaceAll("_"," "))}</span><strong class="${binding.ready?"safe":"warn"}">${binding.ready?escapeHtml(binding.workerKey):"缺少 Runner"}</strong></div>`).join("");
      const stages = domain.workflow.map(item=>item.title).join(" → ");
      const missing = capability.skills.filter(item=>!item.ready).map(item=>`${item.skillType.replaceAll("_"," ")} Runner 待接入`).join(" · ");
      return `<article class="domain-card" data-domain="${escapeHtml(domain.id)}"><div class="domain-card-head"><span class="domain-mark">${escapeHtml(domain.icon)}</span><span class="status-label ${ready?"pass":"pending"}">${ready?"可以运行":"能力未接通"}</span></div><h3>${escapeHtml(domain.name)}</h3><small>${escapeHtml(domain.nameEn)}</small><p>${escapeHtml(domain.summary)}</p><div class="domain-owner"><span>业务工作流</span><strong>${escapeHtml(stages)}</strong></div><div class="domain-bindings">${bindings}</div><div class="domain-card-foot">${ready?`<a class="primary-link" href="${executionUrl}">创建领域目标</a>`:`<span class="domain-next">${escapeHtml(missing)}</span>`}</div></article>`;
    }).join("");
    return `<section class="application-suite" data-application="${escapeHtml(application.id)}"><div class="application-suite-head"><div><span class="eyebrow">业务应用</span><h2>${escapeHtml(application.name)} <small>${escapeHtml(application.nameEn)}</small></h2><p>${escapeHtml(application.summary)}</p></div><span class="application-badge">${escapeHtml(application.icon)}</span></div><div class="domain-grid">${cards}</div></section>`;
  }).join("");
  return `<section class="product-hero domain-hero"><div><span class="eyebrow">Business Applications</span><h2>应用与业务领域</h2><p>一个 Studio 统一承载软件工厂、视频工厂和智慧园区 ERP。业务域定义专业 Workflow，Agent 与 Runner 由运行时按 Skills 分配。</p></div><div class="hero-actions"><a class="primary-link" href="${routeHref("/execution",activeProject)}">新建长期目标</a></div></section>
  <section class="domain-summary"><div><span>业务应用</span><strong>${center.applicationCount}</strong></div><div><span>业务领域</span><strong>${center.domainCount}</strong></div><div><span>当前可运行</span><strong>${readyDomains}</strong></div><div><span>在线 Runner</span><strong>${workers.length}</strong></div></section>
  ${applications}
  <section class="panel domain-architecture"><div><span class="eyebrow">统一执行内核</span><h2>业务领域与执行资源严格分层</h2><p>应用负责产品入口，领域 Workflow 负责业务步骤，Skill 描述能力，Agent 承担阶段职责，在线 Runner 执行任务；所有任务继续进入同一个持久化 Kernel。</p></div><div class="domain-flow"><span>应用</span><i>→</i><span>业务域</span><i>→</i><span>Workflow</span><i>→</i><span>Skills</span><i>→</i><span>Agent / Runner</span><i>→</i><span>Kernel</span></div></section>`;
}

function pageProjects(data) {
  const project = data.active_project_state ?? {};
  const activeProjectLabel = data.active_project?.project_name ?? data.active_project?.label ?? data.active_project_id ?? "当前项目";
  const activeProjectId = data.active_project_id ?? data.project_router.projects?.[0]?.project_id ?? "workspace";
  const workspaceProjects = data.project_router.workspace?.projects ?? [];
  const dispatchPlans = data.project_router.dispatch_plans ?? [];
  const lifecycleMap = new Map(lifecycleRecords(data).map((item) => [item.task_id, item]));
  const rows = workspaceProjects.map((item) => ({
    project: item.project_id,
    status: item.connection_status,
    route: item.execution_route,
    branch: item.repo_branch,
    clean: item.repo_clean,
    write_policy: item.write_policy
  }));
  const connectedProjectCount = workspaceProjects.filter((item) => item.connection_status === "CONNECTED").length;
  const plannedProjectCount = workspaceProjects.filter((item) => item.connection_status !== "CONNECTED").length;
  return `${projectWorkbench(data)}
  <section>
    <div class="section-head"><h2>当前项目上下文</h2><span class="pill">${escapeHtml(activeProjectId)}</span></div>
    <div class="kanban-grid">
      <div class="panel">
        <div class="grid">
          ${metric("当前项目", activeProjectLabel)}
          ${metric("连接状态", data.active_project?.connection_status ?? "unknown")}
          ${metric("执行路由", data.active_project?.execution_route ?? "managed_project_repo")}
          ${metric("写入策略", data.active_project?.write_policy ?? "disabled")}
        </div>
        <div class="button-row" style="margin-top:12px;">
          <button type="button" class="secondary" data-quick-action="project-inspect" data-goal="${escapeHtml(`检查 ${activeProjectLabel}`)}">检查项目</button>
          <button type="button" class="secondary" data-quick-action="project-dispatch" data-goal="${escapeHtml(`为 ${activeProjectLabel} 生成派发计划`)}">生成派发计划</button>
          <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="${escapeHtml(`查看 ${activeProjectLabel} 待审批 Proposal`)}">查看 Proposal</button>
          <a class="secondary link-button" href="${escapeHtml(routeHref("/actions", activeProjectId))}">切到任务台</a>
        </div>
      </div>
    </div>
  </section>
  <section>
    <div class="section-head"><h2>接入新项目</h2><span class="pill">GitHub / 本地目录 / 链接占位</span></div>
    <div class="kanban-grid">
      <div class="panel">
        <p class="help">支持三种入口：直接绑定本地目录、粘贴 GitHub / Git 仓库地址自动接入，或先登记一个链接地址 / Zip 占位项目。当前只写 Studio 的连接器、绑定和运行记忆，不会写业务仓库。</p>
        <div class="form-grid">
          <div>
            <label for="project-connect-id">项目 ID</label>
            <input id="project-connect-id" type="text" placeholder="可留空，系统自动推断">
          </div>
          <div>
            <label for="project-connect-name">项目名称</label>
            <input id="project-connect-name" type="text" placeholder="可留空，自动生成">
          </div>
          <div>
            <label for="project-connect-source">接入方式</label>
            <select id="project-connect-source">
              ${formOption("auto", "自动识别地址", true)}
              ${formOption("local_path", "本地目录")}
              ${formOption("git_url", "GitHub / Git 仓库")}
              ${formOption("zip_placeholder", "链接地址 / Zip 占位")}
            </select>
          </div>
          <div>
            <label for="project-connect-local-path">本地路径</label>
            <input id="project-connect-local-path" type="text" placeholder="../my-project or /absolute/path">
          </div>
          <div>
            <label for="project-connect-url">地址 / 仓库 URL</label>
            <input id="project-connect-url" type="text" placeholder="https://github.com/org/repo or https://example.com/archive.zip">
          </div>
          <div>
            <label for="project-connect-branch">默认分支</label>
            <input id="project-connect-branch" type="text" placeholder="main">
          </div>
          <div>
            <label for="project-connect-package-manager">包管理器</label>
            <input id="project-connect-package-manager" type="text" placeholder="pnpm / npm / yarn">
          </div>
          <div>
            <label for="project-connect-type">项目类型</label>
            <input id="project-connect-type" type="text" placeholder="business-repository">
          </div>
          <div>
            <label for="project-connect-description">说明</label>
            <input id="project-connect-description" type="text" placeholder="可选，记录该项目用途">
          </div>
        </div>
        <div class="button-row">
          <button type="button" class="secondary" data-project-connect-action="project-connect-dry-run">生成连接草稿</button>
          <button type="button" class="primary" data-project-connect-action="project-connect-apply">写入并接入工作区</button>
        </div>
      </div>
    </div>
  </section>
  <section><h2>${messages.pages.projects.title}</h2><div class="grid">
    ${metric(messages.pages.projects.connectedProject, connectedProjectCount)}
    ${metric(messages.pages.projects.phoenixErp, plannedProjectCount)}
    ${metric(messages.pages.projects.writes, data.safety.managed_project_writes)}
    ${metric("挂接绑定", data.project_router.binding_count)}
    ${metric("Proposal", data.project_router.proposal_count ?? 0)}
    ${metric("Queue Audit", data.project_router.queue_injection_audit_count ?? 0)}
  </div></section>
  ${projectLifecycleOverview(data)}
  <section><h2>Attached Project Workspace</h2>${rows.length > 0 ? table(rows, [
    { key: "project", label: "项目" },
    { key: "status", label: "连接" },
    { key: "route", label: "路由" },
    { key: "branch", label: "分支" },
    { key: "clean", label: "仓库" },
    { key: "write_policy", label: "写入策略" }
  ]) : `<div class="panel"><p class="help">尚未生成绑定快照。先执行 <code>studio project bind --apply</code> 与 <code>studio project workspace --apply</code>。</p></div>`}</section>
  <section><h2>Project Dispatch Plans</h2>${dispatchPlans.length > 0 ? table(dispatchPlans.slice(0, 8).map((item) => {
    const taskId = item.data?.task_id ?? "unknown";
    const lifecycle = lifecycleMap.get(taskId);
    const isInjected = lifecycle?.lifecycle === "injected";
    const isManualOnly = lifecycle?.lifecycle === "needs_approval" && ["HIGH", "CRITICAL"].includes(lifecycle?.risk ?? "");
    return {
      project: item.project_id,
      task_id: taskId,
      stage: item.data?.pipeline_stage ?? "unknown",
      proposal: statusLabel(lifecycle?.approval_status ?? "missing"),
      audit: statusLabel(lifecycle?.queue_audit_status ?? "missing"),
      runtime: item.data?.worker_route?.runtime_id ?? item.data?.task_candidate?.runtime ?? "unknown",
      worker: item.data?.worker_route?.worker_id ?? "none",
      closure: toneLabel(lifecycle?.lifecycle_label ?? "待补 proposal", lifecycle?.lifecycle ?? "proposal_missing"),
      next: `<div class="proposal-evidence">
        <span class="help">${escapeHtml(lifecycle?.blockers?.[0] ?? item.data?.recommended_next_stage ?? "unknown")}</span>
        <div class="button-row compact-row">
          <button type="button" class="secondary" data-proposal-action="proposal-review" data-proposal-task="${escapeHtml(taskId)}">查看</button>
          ${isInjected
            ? (lifecycle?.worker_claim_status === "PASS" || lifecycle?.controlled_queue_status === "CLAIMED_DRY_RUN_READY"
                ? `<span class="help">Worker 已领取</span>`
                : `<button type="button" class="primary" data-proposal-action="worker-claim-preflight" data-proposal-task="${escapeHtml(taskId)}">领取 Worker</button>`)
            : isManualOnly
              ? `<span class="help">人工审批</span>`
              : `<button type="button" class="primary" data-proposal-action="proposal-approve-apply" data-proposal-task="${escapeHtml(taskId)}">审批并入队</button>`}
        </div>
      </div>`,
      evidence: `<div class="proposal-evidence">
        ${item.path ? inlineDetails("dispatch", item.data ?? {}) : ""}
        ${lifecycle?.proposal_path ? inlineDetails("proposal", lifecycle.proposal) : ""}
        ${lifecycle?.audit_path ? inlineDetails("audit", lifecycle.audit) : ""}
        ${lifecycle?.worker_claim_path ? inlineDetails("claim", lifecycle.worker_claim) : ""}
      </div>`
    };
  }), [
    { key: "project", label: "项目" },
    { key: "task_id", label: "任务" },
    { key: "stage", label: "阶段" },
    { key: "proposal", label: "Proposal", html: true },
    { key: "audit", label: "Queue Audit", html: true },
    { key: "runtime", label: "Runtime" },
    { key: "worker", label: "Worker" },
    { key: "closure", label: "闭环状态", html: true },
    { key: "next", label: "下一步", html: true },
    { key: "evidence", label: "证据", html: true }
  ]) : `<div class="panel"><p class="help">尚未生成派发计划。先执行 <code>studio project dispatch-plan --project ${escapeHtml(data.active_project_id ?? data.project_router.projects?.[0]?.project_id ?? "workspace")} --text "..." --apply</code>。</p></div>`}</section>
  <section><h2>${escapeHtml(`${activeProjectLabel} 运行记忆`)}</h2>${detailsJson("查看原始运行记忆 JSON", project)}</section>`;
}

function pageRuntime(data) {
  const rows = data.runtime.examples.map((item) => ({ path: item.path, keys: Object.keys(item.data ?? {}).join(", ") || messages.common.notFound }));
  return `<section><h2>${messages.pages.runtime.title}</h2><div class="grid">${metric(messages.pages.runtime.profiles, data.runtime.profile_count)}${metric(messages.pages.runtime.providers, data.runtime.provider_count)}${metric(messages.pages.runtime.externalCalls, data.safety.external_calls)}</div></section>
  <section>${table(rows, [{ key: "path", label: messages.common.file }, { key: "keys", label: messages.common.keys }])}</section>`;
}

function pageWorkers(data) {
  const workers = data.workers.control_plane?.workers ?? data.workers.registry?.workers ?? [];
  const controlPlane = data.workers.control_plane ?? {};
  const rows = workers.map((worker) => ({
    worker_id: worker.worker_id,
    kind: worker.worker_kind ?? "local",
    os: worker.worker_os ?? "unknown",
    capabilities: (worker.capability_tags ?? []).join(", "),
    risk: worker.risk,
    status: worker.status,
    heartbeat: worker.heartbeat_status ?? "unknown",
    recent_runs: worker.recent_run_count ?? 0,
    lease_evidence: worker.task_lease_evidence_count ?? 0
  }));
  const leaseRows = workers.flatMap((worker) =>
    (worker.task_lease_evidence ?? []).map((record) => ({
      worker_id: worker.worker_id,
      task_id: record.task_id,
      stage: record.stage,
      status: record.status,
      project_id: record.project_id,
      path: record.evidence_path
    }))
  );
  const recentRunRows = workers.flatMap((worker) =>
    (worker.recent_runs ?? []).map((record) => ({
      worker_id: worker.worker_id,
      source: record.source,
      task: record.task,
      status: record.status,
      started_at: record.started_at,
      path: record.evidence_path
    }))
  );
  return `${workerPanel(data)}
  <section><h2>${messages.pages.workers.title}</h2><div class="grid">${metric(messages.pages.dashboard.workers, rows.length)}${metric(messages.pages.workers.serverAccess, data.safety.server_access)}${metric(messages.pages.workers.modelCalls, data.safety.model_invocation)}${metric("控制面", controlPlane.true_parallel_executor ?? "未生成")}</div></section>
  <section><h2>Worker Control Plane</h2><div class="grid">
    ${metric("Executor", controlPlane.executor ?? "metadata_only")}
    ${metric("Heartbeat", controlPlane.heartbeat_mode ?? "未生成")}
    ${metric("调度模式", Array.isArray(controlPlane.dispatch_modes) ? controlPlane.dispatch_modes.join(" / ") : "未生成")}
    ${metric("Runtimes", Array.isArray(controlPlane.runtimes) ? controlPlane.runtimes.join(", ") : "未生成")}
    ${metric("最近运行", controlPlane.recent_run_count ?? 0)}
    ${metric("租约证据", controlPlane.lease_evidence_count ?? 0)}
  </div></section>
  <section>${table(rows, [{ key: "worker_id", label: messages.pages.workers.worker }, { key: "kind", label: messages.pages.workers.kind }, { key: "os", label: messages.pages.workers.os }, { key: "capabilities", label: messages.pages.workers.capabilities }, { key: "risk", label: messages.common.risk }, { key: "status", label: messages.common.status }, { key: "heartbeat", label: "Heartbeat" }, { key: "recent_runs", label: "最近运行" }, { key: "lease_evidence", label: "租约证据" }])}</section>
  <section><h2>任务租约证据</h2>${table(leaseRows, [{ key: "worker_id", label: messages.pages.workers.worker }, { key: "task_id", label: "任务" }, { key: "stage", label: "阶段" }, { key: "status", label: messages.common.status }, { key: "project_id", label: "项目" }, { key: "path", label: messages.common.file }])}</section>
  <section><h2>最近运行历史</h2>${table(recentRunRows, [{ key: "worker_id", label: messages.pages.workers.worker }, { key: "source", label: "来源" }, { key: "task", label: "任务" }, { key: "status", label: messages.common.status }, { key: "started_at", label: "开始时间" }, { key: "path", label: messages.common.file }])}</section>`;
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

function planningOverviewPanel(data) {
  const roadmap = data.roadmapMemory ?? {};
  const next = roadmap.next_recommended_action ?? {};
  const milestones = Array.isArray(roadmap.milestones) ? roadmap.milestones : [];
  const completed = milestones.filter((item) => item.completed).length;
  return `<section>
    <div class="section-head"><h2>规划信号</h2><span class="pill">global roadmap memory</span></div>
    <div class="grid">
      ${metric("当前阶段", roadmap.current_stage ?? "未生成")}
      ${metric("下一阶段", roadmap.next_stage ?? "未生成")}
      ${metric("里程碑", `${completed}/${milestones.length}`)}
      ${metric("目标", roadmap.goal ?? "未生成")}
    </div>
    <div class="kanban-grid">
      <div class="panel">
        <h3>下一步建议</h3>
        <p>${escapeHtml(next.title ?? "先刷新 roadmap memory。")}</p>
        <p class="help">${escapeHtml(next.reason ?? "尚未生成原因说明。")}</p>
      </div>
      <div class="panel">
        <h3>执行边界</h3>
        ${list([
          `target: ${next.target_project ?? "unknown"} / ${next.target_package ?? "unknown"}`,
          `risk: ${next.risk ?? "unknown"}`,
          `approval_required: ${String(next.approval_required ?? false)}`,
          `mode: ${next.execution_mode ?? "unknown"}`
        ])}
      </div>
      <div class="panel">
        <h3>校验命令</h3>
        ${list(Array.isArray(next.validation_commands) && next.validation_commands.length > 0 ? next.validation_commands : ["未生成 validation commands"])}
      </div>
    </div>
  </section>`;
}

function planningRoadmapTable(data) {
  const stages = Array.isArray(data.v5Roadmap?.stages) ? data.v5Roadmap.stages : [];
  const rows = stages.map((stage) => ({
    id: stage.id,
    title: stage.title,
    risk: riskBadge(stage.risk_level ?? "MEDIUM"),
    automation: stage.automation_level ?? "unknown",
    approval: toneLabel(stage.approval_required ? "需审批" : "可自动推进", stage.approval_required ? "proposal-only" : "pass"),
    target: `${stage.target_project ?? "unknown"} / ${stage.target_package ?? "unknown"}`
  }));
  return `<section>
    <div class="section-head"><h2>V5 路线图</h2><span class="pill">master plan</span></div>
    ${rows.length > 0 ? table(rows, [
      { key: "id", label: "阶段" },
      { key: "title", label: "标题" },
      { key: "risk", label: "风险", html: true },
      { key: "automation", label: "自动化" },
      { key: "approval", label: "审批", html: true },
      { key: "target", label: "目标包" }
    ]) : `<div class="panel"><p class="help">尚未生成 V5 路线图。</p></div>`}
  </section>`;
}

function pagePlanning(data) {
  const roadmap = data.roadmapMemory ?? {};
  const milestoneRows = (Array.isArray(roadmap.milestones) ? roadmap.milestones : []).map((item) => ({
    id: item.id,
    title: item.title,
    status: toneLabel(item.completed ? "已完成" : "待完成", item.completed ? "pass" : "ready")
  }));
  return `<section><h2>${messages.pages.planning.title}</h2><div class="grid">
    ${metric(messages.pages.planning.roadmapMemory, messages.common.loaded)}
    ${metric(messages.pages.planning.v5Roadmap, Array.isArray(data.v5Roadmap?.stages) ? `${data.v5Roadmap.stages.length} stages` : messages.common.loaded)}
    ${metric(messages.pages.planning.externalCalls, data.safety.external_calls)}
    ${metric("停止策略", roadmap.stop_policy ?? "未生成")}
  </div></section>
  ${planningOverviewPanel(data)}
  ${planningRoadmapTable(data)}
  <section><div class="section-head"><h2>里程碑完成度</h2><span class="pill">milestones</span></div>
    ${milestoneRows.length > 0 ? table(milestoneRows, [
      { key: "id", label: "ID" },
      { key: "title", label: "里程碑" },
      { key: "status", label: "状态", html: true }
    ]) : `<div class="panel"><p class="help">当前没有里程碑记录。</p></div>`}
  </section>
  <section><h2>${messages.pages.planning.roadmapMemory}</h2>${detailsJson("查看原始 Roadmap Memory JSON", data.roadmapMemory)}</section>`;
}

function pageAutopilot(data) {
  // Morning Report is the legacy Kernel contract name; the product UI presents it as Execution Report.
  const lifecycle = lifecycleSummary(data);
  const release = data.release_consistency ?? {};
  const queueRows = lifecycleRecords(data).slice(0, 8).map((item, index) => {
    const approvalText = item.approval_status === "APPROVED"
      ? "已批准"
      : item.approval_status === "APPROVAL_NOT_REQUIRED"
        ? "无需批准"
        : item.approval_status === "REJECTED"
          ? "已拒绝"
          : "待确认";
    const progressText = item.lifecycle === "proposal_only"
      ? "等待人工确认"
      : item.lifecycle === "ready_inject"
        ? "等待进入队列"
        : item.lifecycle === "injected"
          ? "已进入执行队列"
          : item.lifecycle_label ?? "待处理";
    return {
    task: `<strong>任务 ${index + 1}</strong>`,
    approval: toneLabel(approvalText, (item.approval_status ?? "") === "APPROVED" ? "pass" : "proposal-only"),
    queue: `<div class="proposal-evidence">
      ${toneLabel(item.queue_audit_status ?? "missing", (item.queue_audit_status ?? "") === "PASS" ? "pass" : (item.queue_audit_status ?? "") === "missing" ? "local" : "blocked")}
      <span class="help">queue: ${escapeHtml(item.queue_task_status ?? "pending")} / preflight: ${escapeHtml(item.controlled_queue_status ?? "missing")} / claim: ${escapeHtml(item.worker_claim_status ?? "missing")}</span>
    </div>`,
    next: `<div class="proposal-evidence">${toneLabel(progressText, item.lifecycle ?? "idle")}</div>`,
    evidence: `<div class="proposal-evidence">
      ${item.dispatch_path ? inlineDetails("dispatch", item.dispatch) : ""}
      ${item.proposal_path ? inlineDetails("proposal", item.proposal) : ""}
      ${item.audit_path ? inlineDetails("audit", item.audit) : ""}
      ${item.worker_claim_path ? inlineDetails("claim", item.worker_claim) : ""}
    </div>`
  }});
  const healthy = (release.status ?? "") === "PASS";
  return `<section class="product-hero"><div><span class="eyebrow">Execution Reports</span><h2>执行报告</h2><p>查看每轮运行完成的工作、需要批准的事项和系统健康状态。审计证据保留在下方技术详情中。</p></div><div class="hero-actions"><a class="primary-link" href="${routeHref("/execution", data.active_project_id)}">新建目标</a></div></section>
  <section><div class="section-head"><h2>执行摘要</h2><span class="status-label ${healthy ? "pass" : "proposal-only"}">${healthy ? "检查通过" : "需要关注"}</span></div><div class="summary-grid">
    <div class="summary-card"><span>已进入执行</span><strong>${escapeHtml(lifecycle.injected)}</strong><small>Scheduler 已接收</small></div>
    <div class="summary-card"><span>等待批准</span><strong>${escapeHtml(lifecycle.pending_approval)}</strong><small>需要你的决策</small></div>
    <div class="summary-card"><span>等待调度</span><strong>${escapeHtml(lifecycle.ready_inject)}</strong><small>尚未进入队列</small></div>
    <div class="summary-card"><span>发布检查</span><strong>${healthy ? "通过" : "待确认"}</strong><small>下一阶段：${(release.promotion_next_stage ?? "completed") === "completed" ? "已完成" : escapeHtml(release.promotion_next_stage)}</small></div>
  </div></section>
  <section class="product-grid"><div class="panel"><div class="section-head small"><h2>本轮结论</h2><span class="status-label ${healthy ? "pass" : "proposal-only"}">● ${healthy ? "运行完成" : "需要复核"}</span></div><p style="font-size:16px;color:var(--text)">Studio 已完成本轮调度与发布检查，${lifecycle.injected} 项任务已进入执行，${lifecycle.pending_approval > 0 ? `${lifecycle.pending_approval} 项等待你的批准。` : "没有需要你立即处理的审批。"}</p><div class="simple-list"><div class="simple-row"><strong>计划与调度</strong><span>${lifecycle.ready_inject > 0 ? `${lifecycle.ready_inject} 项等待调度` : "全部处理完成"}</span></div><div class="simple-row"><strong>安全检查</strong><span>${healthy ? "全部通过" : "存在待确认项"}</span></div><div class="simple-row"><strong>发布动作</strong><span>未执行推送、合并或部署</span></div></div></div><div class="panel ${lifecycle.pending_approval > 0 ? "attention-card" : ""}"><h2>需要决策</h2>${lifecycle.pending_approval > 0 ? `<div class="simple-list"><div class="simple-row"><strong>待批准任务</strong><span>${lifecycle.pending_approval} 项</span></div></div>` : `<div class="empty-state"><strong>一切正常</strong>当前没有需要你处理的事项。</div>`}</div></section>
  <section><div class="section-head"><div><h2>任务进展</h2><p class="help">最近 8 项任务</p></div></div>${queueRows.length > 0 ? table(queueRows, [
    { key: "task", label: "任务", html: true },
    { key: "approval", label: "批准状态", html: true },
    { key: "next", label: "当前进展", html: true }
  ]) : `<div class="panel"><p class="help">还没有运行记录。新建一个目标后，进展会显示在这里。</p></div>`}</section>
  <details class="advanced-section"><summary>技术详情与审计证据</summary><div class="advanced-body">
    <section><h2>队列与证据</h2>${queueRows.length > 0 ? table(queueRows, [
      { key: "task", label: "Task", html: true }, { key: "queue", label: "Queue Audit", html: true }, { key: "evidence", label: "Evidence", html: true }
    ]) : ""}</section>${releasePromotionPanel(data)}${detailsJson("原始运行数据", data.autopilot.latest_summary ?? {})}
  </div></details>`;
}

function pageActions(data) {
  const actions = data.actionServer.actions ?? [];
  const operationCards = [
    ["任务与队列", "查看任务生命周期、调度队列和执行证据。", "#advanced-operations", `${actions.length} 项能力`],
    ["Workers", "检查在线 Worker、领取状态与租约健康度。", "/workers", "运行资源"],
    ["Runtime", "查看 Runtime Adapter、限制与执行模式。", "/runtime", "安全边界"],
    ["Approvals", "处理审批、策略和 Activation Readiness。", "/governance", "治理"],
  ];
  return `<section class="operations-hero"><span class="eyebrow">Operations</span><h2>运行管理</h2><p>日常工作无需进入这里。需要诊断任务、Worker、Runtime 或审批时，再打开对应模块。</p></section>
  <section class="operation-card-grid">${operationCards.map(([title, description, href, meta]) => `<a class="operation-card" href="${href.startsWith("#") ? href : routeHref(href, data.active_project_id)}"><span class="operation-card-icon">${navIcon(title === "Workers" ? "execution" : title === "Runtime" ? "projects" : title === "Approvals" ? "config" : "actions")}</span><div><h3>${title}</h3><p>${description}</p><small>${meta}</small></div><span class="operation-arrow">→</span></a>`).join("")}</section>
  <section class="system-strip"><div><span>默认模式</span><strong>Controlled execution</strong></div><div><span>外部写入</span><strong>关闭</strong></div><div><span>可用操作</span><strong>${actions.length}</strong></div><div><span>审计日志</span><strong>持续记录</strong></div></section>
  <details id="advanced-operations" class="advanced-section"><summary>打开高级操作台</summary><div class="advanced-body">
  ${actionWorkbench(data, "高级操作台")}${smartParkEntryPanel(data)}${recommendationPanel(data)}${dispatchLifecyclePanel(data)}${proposalPanel(data)}${releasePromotionPanel(data)}
  <section>${table(actions.map((action) => ({
    id: action.id,
    intent: action.label,
    risk: riskBadge(action.risk),
    mode: executionModeLabel(action.executionMode),
    gate: governanceGateForMode(action.executionMode)
  })), [{ key: "id", label: messages.pages.actions.action }, { key: "intent", label: messages.pages.actions.intent }, { key: "risk", label: messages.common.risk, html: true }, { key: "mode", label: messages.common.mode }, { key: "gate", label: messages.common.gate }])}</section></div></details>`;
}

function pageConfig(data) {
  const access = data.access ?? {};
  const summary = access.summary ?? {};
  const enforcement = access.enforcement ?? {};
  const release = data.release_consistency ?? {};
  const roles = Array.isArray(access.roles) ? access.roles : [];
  const plans = Array.isArray(access.plans) ? access.plans : [];
  const users = Array.isArray(access.users) ? access.users : [];
  const memberships = Array.isArray(access.memberships) ? access.memberships : [];
  const routeChecks = Array.isArray(access.route_checks) ? access.route_checks : [];
  const actionChecks = Array.isArray(access.action_checks) ? access.action_checks : [];
  const inviteSummary = access.invite_summary ?? { invite_count: 0, pending_invite_count: 0, approved_invite_count: 0, materialized_invite_count: 0, invites: [] };
  const roleMap = new Map(roles.map((role) => [role.role_id, role]));
  const planMap = new Map(plans.map((plan) => [plan.plan_id, plan]));
  const currentMembership = memberships.find((membership) => membership.user_id === summary.current_user?.user_id) ?? null;
  const actionMetaMap = new Map((data.actionServer.actions ?? []).map((actionItem) => [actionItem.id, actionItem]));
  const roleRows = roles.map((role) => ({
    role: role.display_name || role.role_id,
    scope: role.project_scope_mode || "workspace",
    capabilities: role.capabilities?.includes("*")
      ? "全部能力"
      : `${role.capability_count ?? role.capabilities?.length ?? 0} 项`,
    highlights: role.capabilities?.includes("*")
      ? "*"
      : (role.capabilities ?? []).slice(0, 4).join(", ")
  }));
  const planRows = plans.map((plan) => ({
    plan: plan.display_name || plan.plan_id,
    tier: plan.tier || "unknown",
    seats: plan.seat_limit ?? "不限",
    parallel: plan.worker_parallel_limit ?? "不限",
    direct: plan.direct_execute_max_risk ?? "LOW",
    runtimes: Array.isArray(plan.runtime_allowlist) && plan.runtime_allowlist.length > 0
      ? (plan.runtime_allowlist.includes("*") ? "全部 Runtime" : plan.runtime_allowlist.join(", "))
      : "未配置"
  }));
  const userRows = users.map((user) => {
    const membership = memberships.find((item) => item.user_id === user.user_id) ?? null;
    return {
      account: `${user.display_name || user.username} (${user.username})`,
      role: roleMap.get(user.primary_role_id)?.display_name || user.primary_role_id || "未分配",
      plan: planMap.get(user.default_plan_id)?.display_name || user.default_plan_id || "未分配",
      scope: Array.isArray(membership?.project_allowlist) && membership.project_allowlist.length > 0
        ? (membership.project_allowlist.includes("*") ? "全部项目" : membership.project_allowlist.join(", "))
        : "未配置",
      status: statusLabel(user.status || "UNKNOWN")
    };
  });
  const routeRows = routeChecks.map((check) => ({
    route: check.route_id,
    status: toneLabel(check.allowed ? "ALLOW" : "DENY", check.allowed ? "pass" : "blocked"),
    capabilities: Array.isArray(check.required_capabilities) ? check.required_capabilities.join(", ") : "none",
    missing: Array.isArray(check.missing_capabilities) && check.missing_capabilities.length > 0
      ? check.missing_capabilities.join(", ")
      : "none"
  }));
  const actionRows = actionChecks.map((check) => {
    const actionMeta = actionMetaMap.get(check.action_id) ?? {};
    return {
      action: check.action_id,
      risk: riskBadge(actionMeta.risk ?? "LOW"),
      mode: check.execution_mode || actionMeta.executionMode || "unknown",
      access: toneLabel(check.status || "UNKNOWN", check.status === "ALLOW" ? "pass" : "blocked"),
      scope: Array.isArray(check.project_scope) && check.project_scope.length > 0
        ? (check.project_scope.includes("*") ? "全部项目" : check.project_scope.join(", "))
        : "none",
      reason: check.reason || "未提供"
    };
  });
  const inviteRows = (inviteSummary.invites ?? []).slice(0, 6).map((invite) => ({
    username: invite.username,
    role: invite.requested_role_name,
    plan: invite.requested_plan_name,
    scope: (invite.requested_project_allowlist ?? []).join(", ") || "none",
    status: statusLabel(invite.status),
    next: invite.next_action === "review_invite"
      ? `review ${invite.invite_id}`
      : invite.next_action === "materialize_invite"
        ? `materialize ${invite.invite_id}`
        : "none"
  }));
  const projectDraft = {
    active_project_id: data.active_project_id ?? data.project_router.projects?.[0]?.project_id ?? "workspace",
    projects: (data.project_router.projects ?? []).map((project) => ({
      project_id: project.project_id,
      connection_status: project.connection_status,
      doctor_status: project.doctor_status,
      execution_route: project.execution_route,
      write_policy: project.write_policy
    })),
    managed_project_writes: false
  };
  const runtimeDraft = {
    default_runtime: "codex-cli",
    mode: "pilot_production",
    direct_execute_allowed_for: ["LOW", "MEDIUM"],
    high_risk_policy: "proposal_only",
    critical_risk_policy: "human_approval_required",
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
    LOW: "direct_execute",
    MEDIUM: "direct_execute",
    HIGH: "proposal_only",
    CRITICAL: "human_approval_required"
  };
  return `<section><h2>${messages.pages.config.title}</h2><div class="grid">
    ${metric("当前账号", summary.current_user?.display_name || summary.current_user?.username || "未登录")}
    ${metric("当前套餐", summary.current_plan?.display_name || summary.current_plan?.plan_id || "未分配")}
    ${metric("直执上限", summary.direct_execute_max_risk || "LOW")}
    ${metric("项目范围", Array.isArray(currentMembership?.project_allowlist) && currentMembership.project_allowlist.length > 0 ? (currentMembership.project_allowlist.includes("*") ? "全部项目" : currentMembership.project_allowlist.join(", ")) : "未配置")}
    ${metric("Access Enforcement", enforcement.policy_id ?? "未生成")}
    ${metric("可见路由", enforcement.summary?.visible_route_count ?? "未生成")}
    ${metric("可执行动作", enforcement.summary?.allowed_action_count ?? "未生成")}
    ${metric("Release Consistency", release.status ?? "未生成")}
  </div><p class="help">${messages.pages.config.draftOnly}</p></section>
  <section>
    <div class="section-head"><h2>账号、角色与套餐</h2><span class="pill">Access Center</span></div>
    <div class="grid">
      ${metric("角色数", summary.role_count ?? roles.length)}
      ${metric("用户数", summary.user_count ?? users.length)}
      ${metric("Membership", summary.membership_count ?? memberships.length)}
      ${metric("并发上限", summary.current_plan_limits?.worker_parallel_limit ?? "不限")}
    </div>
    ${userRows.length > 0 ? table(userRows, [
      { key: "account", label: "账号" },
      { key: "role", label: "主角色" },
      { key: "plan", label: "套餐" },
      { key: "scope", label: "项目范围" },
      { key: "status", label: "状态", html: true }
    ]) : `<div class="panel"><p class="help">当前没有可见账号。</p></div>`}
  </section>
  <section class="kanban-grid">
    <div class="panel">
      <div class="section-head small"><h3>角色矩阵</h3><span class="pill">${roles.length} 角色</span></div>
      ${roleRows.length > 0 ? table(roleRows, [
        { key: "role", label: "角色" },
        { key: "scope", label: "范围策略" },
        { key: "capabilities", label: "能力" },
        { key: "highlights", label: "关键能力" }
      ]) : `<p class="help">当前没有角色定义。</p>`}
    </div>
    <div class="panel">
      <div class="section-head small"><h3>套餐矩阵</h3><span class="pill">${plans.length} 套餐</span></div>
      ${planRows.length > 0 ? table(planRows, [
        { key: "plan", label: "套餐" },
        { key: "tier", label: "层级" },
        { key: "seats", label: "席位" },
        { key: "parallel", label: "并发" },
        { key: "direct", label: "直执上限" },
        { key: "runtimes", label: "Runtime" }
      ]) : `<p class="help">当前没有套餐定义。</p>`}
    </div>
  </section>
  <section>
    <div class="section-head"><h2>路由与动作授权</h2><span class="pill">Route / Action Gate</span></div>
    <div class="grid">
      ${metric("允许路由", routeChecks.filter((check) => check.allowed).length)}
      ${metric("允许动作", actionChecks.filter((check) => check.status === "ALLOW").length)}
      ${metric("拒绝动作", actionChecks.filter((check) => check.status !== "ALLOW").length)}
      ${metric("当前 Runtime 白名单", Array.isArray(summary.current_plan_limits?.runtime_allowlist) && summary.current_plan_limits.runtime_allowlist.length > 0 ? (summary.current_plan_limits.runtime_allowlist.includes("*") ? "全部 Runtime" : `${summary.current_plan_limits.runtime_allowlist.length} 项`) : "未配置")}
    </div>
    ${routeRows.length > 0 ? table(routeRows, [
      { key: "route", label: "路由" },
      { key: "status", label: "可见性", html: true },
      { key: "capabilities", label: "所需能力" },
      { key: "missing", label: "缺失能力" }
    ]) : `<div class="panel"><p class="help">当前没有路由授权结果。</p></div>`}
    ${actionRows.length > 0 ? table(actionRows, [
      { key: "action", label: "动作" },
      { key: "risk", label: "风险", html: true },
      { key: "mode", label: "执行模式" },
      { key: "access", label: "授权结果", html: true },
      { key: "scope", label: "项目范围" },
      { key: "reason", label: "原因" }
    ]) : `<div class="panel"><p class="help">当前没有动作授权结果。</p></div>`}
  </section>
  ${releasePromotionPanel(data)}
  <section>
    <div class="section-head"><h2>团队邀请与审批草稿</h2><span class="pill">Access Center</span></div>
    <div class="grid">
      ${metric("邀请总数", inviteSummary.invite_count ?? 0)}
      ${metric("待审批", inviteSummary.pending_invite_count ?? 0)}
      ${metric("已批准", inviteSummary.approved_invite_count ?? 0)}
      ${metric("已落成", inviteSummary.materialized_invite_count ?? 0)}
    </div>
    <p class="help">${inviteSummary.pending_invite_count > 0 ? "先 review-invite，审批通过后再 materialize-invite 初始化登录密码。" : inviteSummary.approved_invite_count > 0 ? "已批准邀请还需要 materialize-invite 才会成为正式本地账号。" : "当前没有待处理邀请，可直接创建新 invite。"}</p>
    ${inviteRows.length > 0 ? table(inviteRows, [
      { key: "username", label: "用户名" },
      { key: "role", label: "角色" },
      { key: "plan", label: "套餐" },
      { key: "scope", label: "项目范围" },
      { key: "status", label: "状态", html: true },
      { key: "next", label: "下一步" }
    ]) : `<div class="panel"><p class="help">当前没有 invite 草稿。可通过 CLI 先创建：<code>studio access invite-user --user ... --dry-run</code></p></div>`}
  </section>
  <details class="details-drawer" open>
    <summary>查看草稿模式配置</summary>
    <section class="draft-grid">
      <div class="panel"><label for="draft-project">${messages.pages.config.projects}</label><textarea id="draft-project" data-config-draft>${escapeHtml(JSON.stringify(projectDraft, null, 2))}</textarea></div>
      <div class="panel"><label for="draft-runtime">${messages.pages.config.runtime}</label><textarea id="draft-runtime" data-config-draft>${escapeHtml(JSON.stringify(runtimeDraft, null, 2))}</textarea></div>
      <div class="panel"><label for="draft-worker">${messages.pages.config.workers}</label><textarea id="draft-worker" data-config-draft>${escapeHtml(JSON.stringify(workerDraft, null, 2))}</textarea></div>
      <div class="panel"><label for="draft-credential">${messages.pages.config.credentials}</label><textarea id="draft-credential" data-config-draft>${escapeHtml(JSON.stringify(credentialDraft, null, 2))}</textarea></div>
      <div class="panel"><label for="draft-governance">${messages.pages.config.governance}</label><textarea id="draft-governance" data-config-draft>${escapeHtml(JSON.stringify(governanceDraft, null, 2))}</textarea></div>
    </section>
    <section class="panel"><div class="button-row"><button type="button" data-config-save>保存草稿</button><button type="button" class="danger" data-config-reset>重置草稿</button></div><p id="config-draft-status" class="help">草稿仅保存在浏览器 localStorage，不写仓库、不写真实凭证。</p></section>
  </details>`;
}

function pageMemory(data) {
  const globalFiles = Array.isArray(data.codexContextIndex?.global_context_files) ? data.codexContextIndex.global_context_files : [];
  const projectContexts = Array.isArray(data.codexContextIndex?.project_contexts) ? data.codexContextIndex.project_contexts : [];
  const requiredReading = Array.isArray(data.codexContextIndex?.required_reading) ? data.codexContextIndex.required_reading : [];
  const decisions = Array.isArray(data.decisionLog?.decisions) ? data.decisionLog.decisions : [];
  const projectRows = projectContexts.map((item) => ({
    project: item.project_id,
    files: Array.isArray(item.files) ? item.files.length : 0,
    key_files: (Array.isArray(item.files) ? item.files.slice(0, 3) : []).join(", ")
  }));
  const activeProjectLabel = data.active_project?.project_name ?? data.active_project?.label ?? data.active_project_id ?? "当前项目";
  const decisionRows = decisions.slice(0, 6).map((item) => ({
    date: item.date,
    title: item.title,
    source: item.source
  }));
  return `<section><h2>${messages.pages.memory.title}</h2><div class="grid">
    ${metric(messages.pages.memory.platformState, messages.common.loaded)}
    ${metric(messages.pages.memory.contextIndex, Object.keys(data.codexContextIndex ?? {}).length)}
    ${metric(messages.pages.memory.projectMemory, activeProjectLabel)}
    ${metric("全局文件", globalFiles.length)}
    ${metric("项目上下文", projectContexts.length)}
    ${metric("必读文件", requiredReading.length)}
    ${metric("决策记录", decisions.length)}
  </div></section>
  <section>
    <div class="section-head"><h2>记忆结构</h2><span class="pill">runtime/global + runtime/projects</span></div>
    <div class="kanban-grid">
      <div class="panel"><h3>全局上下文</h3>${list(globalFiles.length > 0 ? globalFiles : ["未生成"] )}</div>
      <div class="panel"><h3>必读文件</h3>${list(requiredReading.length > 0 ? requiredReading : ["未生成"] )}</div>
      <div class="panel"><h3>安全边界</h3>${list(Array.isArray(data.codexContextIndex?.safety_boundaries) ? data.codexContextIndex.safety_boundaries : ["未生成"] )}</div>
    </div>
  </section>
  <section><div class="section-head"><h2>项目上下文清单</h2><span class="pill">project memory</span></div>
    ${projectRows.length > 0 ? table(projectRows, [
      { key: "project", label: "项目" },
      { key: "files", label: "文件数" },
      { key: "key_files", label: "关键文件" }
    ]) : `<div class="panel"><p class="help">当前没有项目上下文。</p></div>`}
  </section>
  <section><div class="section-head"><h2>最近决策</h2><span class="pill">decision log</span></div>
    ${decisionRows.length > 0 ? table(decisionRows, [
      { key: "date", label: "日期" },
      { key: "title", label: "决策" },
      { key: "source", label: "来源" }
    ]) : `<div class="panel"><p class="help">当前没有决策记录。</p></div>`}
  </section>
  <section><h2>${messages.common.dataSources}</h2>${list([...data.data_sources.files, ...data.data_sources.directories, data.data_sources.autopilot_latest])}</section>
  <section><h2>Control Plane Snapshots</h2><div class="grid">
    ${metric("Workspace", data.project_router.workspace?.workspace_id ?? "未生成")}
    ${metric("Worker", data.workers.control_plane?.control_plane_id ?? "未生成")}
    ${metric("Access", data.access.enforcement?.policy_id ?? "未生成")}
    ${metric("Release", data.release_consistency?.status ?? "未生成")}
  </div></section>
  <section><h2>原始上下文详情</h2>
    ${detailsJson("查看 Platform State JSON", data.platformState ?? {})}
    ${detailsJson("查看 Codex Context Index JSON", data.codexContextIndex ?? {})}
    ${detailsJson("查看 Decision Log JSON", data.decisionLog ?? {})}
  </section>`;
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

function pageExecution() {
  const domainOptions = domainCenterSummary().applications.map(application => `<optgroup label="${escapeHtml(application.name)}">${application.domains.map(domain=>`<option value="${escapeHtml(domain.id)}">${escapeHtml(domain.name)}</option>`).join("")}</optgroup>`).join("");
  return `<section class="product-hero"><div><span class="eyebrow">New Goal</span><h2>你想让 Studio 完成什么？</h2><p>用一句话描述结果。Studio 会自动拆解任务、安排 Worker，并在结束后生成可审计的报告。</p></div></section>
  <div class="goal-layout"><div>
    <section class="panel"><div class="form-grid"><div><label for="aec-domain">应用与业务领域</label><select id="aec-domain"><option value="">自动识别（通用执行）</option>${domainOptions}</select></div><div><label for="aec-goal">目标</label><input id="aec-goal" value="完善 Runtime 文档" placeholder="例如：制定年度战略执行计划" style="width:100%;padding:13px"></div></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button id="aec-submit" type="button" class="primary-action">开始执行</button></div><div class="stage-rail" aria-label="Execution stages"><span class="stage-item active">Planning</span><span class="stage-item active">Scheduled</span><span class="stage-item active">Running</span><span class="stage-item active">Validating</span><span class="stage-item active">Completed</span></div><div class="section-head small" style="margin:14px 0 0"><p id="aec-status" class="help">选择业务领域后，将使用该领域的 Workflow 与 Skills；当前为安全演练模式。</p><button id="aec-refresh" type="button" class="secondary">刷新状态</button></div></section>
    <section><div class="section-head"><div><h2>执行进度</h2><p class="help">从目标到报告的完整闭环</p></div><span id="aec-health" class="status-label local">正在加载</span></div><div id="aec-metrics" class="summary-grid"></div></section>
    <section><div class="section-head"><div><h2>任务列表</h2><p class="help">自动规划生成的工作项</p></div></div><div id="aec-tasks" class="panel"><div class="empty-state"><strong>正在读取任务</strong>请稍候…</div></div></section>
    <section><div class="panel"><h2>执行结果</h2><div id="aec-report-summary" class="simple-list">加载中…</div></div></section>
  </div><aside class="goal-sidebar"><section class="panel"><div class="section-head small"><h2>执行边界</h2><span class="status-label pass">● Safe</span></div><div class="simple-list"><div class="simple-row"><strong>项目</strong><span>jinhu-smart-park</span></div><div class="simple-row"><strong>Runtime</strong><span>Controlled Stub</span></div><div class="simple-row"><strong>自动提交</strong><span>关闭</span></div><div class="simple-row"><strong>推送与部署</strong><span>禁止</span></div></div></section><section class="panel attention-card"><h2>需要关注</h2><div id="aec-readiness-summary" class="simple-list">加载中…</div></section></aside></div>
  <details class="advanced-section"><summary>查看 Session、Worker、Approval 与原始报告</summary><div class="advanced-body"><section class="kanban-grid"><div class="panel"><h3>Session / Goal</h3><pre id="aec-session">加载中…</pre></div><div class="panel"><h3>Readiness</h3><pre id="aec-readiness">加载中…</pre></div><div class="panel"><h3>Worker / Runtime</h3><pre id="aec-workers">加载中…</pre></div><div class="panel"><h3>Approval</h3><pre id="aec-approvals">加载中…</pre></div></section><pre id="aec-report" class="panel">加载中…</pre></div></details>
  <script>
  (() => { const q=id=>document.getElementById(id), esc=v=>String(v??"").replace(/[&<>\"]/g,c=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;"}[c]));
    const params=new URLSearchParams(location.search),requestedGoal=params.get('goal'),requestedDomain=params.get('domain');if(requestedGoal)q('aec-goal').value=requestedGoal;if(requestedDomain&&[...q('aec-domain').options].some(option=>option.value===requestedDomain))q('aec-domain').value=requestedDomain;
    async function load(){const r=await fetch('/api/aec/dashboard',{cache:'no-store'});if(!r.ok)throw new Error(await r.text());render(await r.json());}
    function render(d){const done=d.overnight?.succeeded??0, health=(d.readiness?.status??d.readiness?.ready??'UNKNOWN'),statusText=s=>({SUCCEEDED:'已完成',RUNNING:'执行中',QUEUED:'等待执行',BLOCKED:'需要处理',FAILED:'失败'}[s]||s),riskText=s=>({LOW:'低',MEDIUM:'中',HIGH:'高',CRITICAL:'严重'}[s]||s);const m=[['Session',statusText(d.session?.status??'未开始'),'本次自主执行'],['Goal',statusText(d.goal?.status??'未开始'),'目标状态'],['任务',d.tasks.length,'自动规划生成'],['已完成',done,'本次运行结果']];q('aec-metrics').innerHTML=m.map(x=>'<div class="summary-card"><span>'+esc(x[0])+'</span><strong>'+esc(x[1])+'</strong><small>'+esc(x[2])+'</small></div>').join('');q('aec-health').textContent=String(health)==='READY'||health===true?'系统已就绪':'安全模式';q('aec-health').className='status-label '+((String(health)==='READY'||health===true)?'pass':'local');q('aec-session').textContent=JSON.stringify({session:d.session,goal:d.goal},null,2);q('aec-readiness').textContent=JSON.stringify(d.readiness,null,2);q('aec-tasks').innerHTML=d.tasks.length?'<table><thead><tr><th>任务</th><th>状态</th><th>优先级</th><th>风险</th></tr></thead><tbody>'+d.tasks.map(t=>'<tr><td>'+esc(t.title)+'</td><td><span class="status-label '+(t.status==='SUCCEEDED'?'pass':'local')+'">● '+esc(statusText(t.status))+'</span></td><td>'+esc(t.priority)+'</td><td>'+esc(riskText(t.risk_level))+'</td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>还没有任务</strong>输入目标并开始执行后，任务会自动出现在这里。</div>';q('aec-report-summary').innerHTML=[['成功任务',done],['失败任务',d.overnight?.failed??0],['阻塞任务',d.blocked.length],['运行时',d.runtime.type==='CONTROLLED_STUB'?'安全演练':d.runtime.type]].map(x=>'<div class="simple-row"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join('');q('aec-readiness-summary').innerHTML=[['Worker',d.workers.length?'全部在线':'离线'],['待处理队列',d.queue.length+' 项'],['需要批准',d.approvals.length+' 项'],['执行模式',d.runtime.type==='CONTROLLED_STUB'?'安全演练':'受控执行']].map(x=>'<div class="simple-row"><strong>'+esc(x[0])+'</strong><span>'+esc(x[1])+'</span></div>').join('');q('aec-workers').textContent=JSON.stringify({workers:d.workers,runtime:d.runtime},null,2);q('aec-approvals').textContent=JSON.stringify(d.approvals,null,2);q('aec-report').textContent=JSON.stringify({executionSummary:d.overnight,executionReport:d.morningReport},null,2);}
    q('aec-refresh').onclick=()=>load().catch(e=>q('aec-status').textContent=e.message);q('aec-submit').onclick=async()=>{q('aec-submit').disabled=true;q('aec-status').textContent='正在执行自主闭环…';try{const domainId=q('aec-domain').value,endpoint=domainId?'/api/domain/goals':'/api/aec/goals';const r=await fetch(endpoint,{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({title:q('aec-goal').value,domainId})});const body=await r.json();if(!r.ok)throw new Error(body.reason||body.message||JSON.stringify(body));q('aec-status').textContent='完成：'+(body.report?.sessionStatus||body.status);render(body.dashboard);}catch(e){q('aec-status').textContent='失败：'+e.message;}finally{q('aec-submit').disabled=false;}};load().catch(e=>q('aec-status').textContent=e.message);
  })();</script>`;
}

function normalizeRenderAuth(auth, data) {
  if (auth && typeof auth.authenticated === "boolean" && auth.user) {
    return {
      authenticated: auth.authenticated,
      auth_source: auth.auth_source ?? "local_password_session",
      user: auth.user ?? null,
      membership: auth.membership ?? null,
      roles: auth.roles ?? [],
      plan: auth.plan ?? null,
      capabilities: auth.capabilities ?? [],
      feature_flags: auth.feature_flags ?? [],
      project_allowlist: auth.project_allowlist ?? [],
      can_manage_access: auth.can_manage_access ?? false,
      direct_execute_max_risk: auth.direct_execute_max_risk ?? "LOW",
      entitlement: auth.entitlement ?? null,
      session: auth.session ?? null,
      workspace_id: auth.workspace_id ?? null
    };
  }
  if (auth && auth.authenticated === false) {
    return {
      authenticated: false,
      auth_source: "anonymous",
      user: null,
      membership: null,
      roles: [],
      plan: null,
      capabilities: [],
      feature_flags: [],
      project_allowlist: [],
      can_manage_access: false,
      direct_execute_max_risk: "LOW",
      entitlement: null,
      session: auth.session ?? null,
      workspace_id: null
    };
  }
  if (auth && typeof auth.authenticated === "boolean" && auth.session) {
    return {
      authenticated: auth.authenticated,
      auth_source: auth.session.auth_source ?? auth.auth_source ?? "local_password_session",
      user: auth.session.user ?? null,
      membership: auth.session.membership ?? null,
      roles: auth.session.roles ?? [],
      plan: auth.session.plan ?? null,
      capabilities: auth.session.capabilities ?? [],
      feature_flags: auth.session.feature_flags ?? [],
      project_allowlist: auth.session.project_allowlist ?? [],
      can_manage_access: auth.session.can_manage_access ?? false,
      direct_execute_max_risk: auth.session.direct_execute_max_risk ?? "LOW",
      entitlement: auth.session.entitlement ?? null,
      session: auth.session.session ?? null,
      workspace_id: auth.session.workspace_id ?? null
    };
  }
  return {
    authenticated: true,
    auth_source: "preview",
    user: data.access?.default_console_user ?? {
      user_id: "preview-owner",
      username: "preview-owner",
      display_name: "Preview Owner"
    },
    roles: (data.access?.summary?.current_roles ?? []).map((roleId) => ({
      role_id: roleId,
      display_name: roleId
    })),
    plan: data.access?.summary?.current_plan ?? {
      plan_id: "internal_preview",
      display_name: "Internal Preview",
      tier: "internal"
    },
    capabilities: ["*"],
    feature_flags: ["*"],
    project_allowlist: ["*"],
    can_manage_access: true,
    direct_execute_max_risk: data.access?.summary?.direct_execute_max_risk ?? "MEDIUM",
    entitlement: data.access?.summary?.current_entitlement ?? null
  };
}

export async function renderConsolePage(pathname = "/", auth = null, options = {}) {
  const data = await loadConsoleLocalData(options);
  const resolvedAuth = normalizeRenderAuth(auth, data);
  data.renderAuth = resolvedAuth;
  data.authView = pathname === "/login" ? "login" : pathname === "/register" ? "register" : "entry";
  data.authRoute = pathname === "/login" || pathname === "/register";
  const model = await buildConsoleDashboardModel(options);
  const gated = data.access?.summary?.allow_anonymous_console_read !== true && !resolvedAuth.authenticated;
  const route = consoleWebRoutes.find((item) => item.path === pathname) ?? consoleWebRoutes[0];
  const contentById = {
    dashboard: () => pageDashboard(model, data),
    execution: () => pageExecution(),
    domains: () => pageDomains(data),
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
  const body = gated
    ? ""
    : await (contentById[route.id] ?? contentById.dashboard)();
  return shell(body, route.id, model, data, resolvedAuth);
}
