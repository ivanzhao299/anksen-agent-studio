import { consoleWebRoutes } from "./routes.mjs";
import { buildConsoleDashboardModel, loadConsoleLocalData } from "./data.mjs";
import { getConsoleMessages } from "./i18n/index.mjs";
import { evaluateConsoleRouteAccess, visibleConsoleRouteIds } from "../../../packages/access-center/lib/access-center-utils.mjs";
import { domainCenterSummary, loadDomainRuntimeRegistry, resolveDomainCapability } from "../../../packages/domain-center/lib/domain-center.mjs";
import { getEnterpriseApplication } from "../../../packages/domain-center/lib/enterprise-applications.mjs";
import { getBusinessObjectDefinition } from "../../../packages/domain-center/lib/business-object-definitions.mjs";
import { businessRelationContracts } from "../../../packages/domain-center/lib/business-relation-definitions.mjs";

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
    development: '<path d="m7 6-4 4 4 4M13 6l4 4-4 4M11.5 3l-3 14"/>',
    portfolio: '<path d="M3 5h14v11H3z"/><path d="M7 5V3h6v2M3 9h14M8 9v2h4V9"/>',
    outcomes: '<path d="M3 17V9m5 8V4m5 13v-6m4 6V7"/><path d="m3 7 5-4 5 5 4-3"/>',
    domains: '<path d="M3 3h5v5H3zM12 3h5v5h-5zM3 12h5v5H3zM12 12h5v5h-5z"/>',
    cad: '<path d="M3 3h14v14H3zM6 14l3-8 3 8m-5-3h4M14 6v8"/>',
    graphicDesign: '<path d="M4 16 14.5 5.5l2 2L6 18H4z"/><path d="m12.5 7.5 2 2M3 4h6M3 8h3"/>',
    projects: '<path d="M2.5 6.5h6l1.5 2h7.5v7a2 2 0 0 1-2 2h-11a2 2 0 0 1-2-2z"/><path d="M2.5 8.5v-3a2 2 0 0 1 2-2h3l1.5 2h4"/>',
    autopilot: '<path d="M3 17V9m5 8V5m5 12v-6m5 6V3"/>',
    actions: '<rect x="3" y="3" width="5" height="5" rx="1"/><rect x="12" y="3" width="5" height="5" rx="1"/><rect x="3" y="12" width="5" height="5" rx="1"/><path d="M12 14.5h5m-2.5-2.5v5"/>',
    agentAdmin: '<circle cx="7" cy="7" r="3"/><path d="M2.5 17c.4-3 1.9-5 4.5-5 1.6 0 2.8.7 3.6 1.8M14.5 10v2m0 4v2m-4-4h2m4 0h2"/><circle cx="14.5" cy="14" r="3.5"/>',
    account: '<circle cx="10" cy="7" r="3"/><path d="M4 17c.5-3.2 2.5-5 6-5s5.5 1.8 6 5"/><path d="M15.5 8.5v-2l1.5-.8 1.5.8v2c0 1.3-.6 2.4-1.5 2.9-.9-.5-1.5-1.6-1.5-2.9Z"/>',
    config: '<circle cx="10" cy="10" r="2.5"/><path d="M16.4 12.5a1.4 1.4 0 0 0 .3 1.5l.1.1-2.7 2.7-.1-.1a1.4 1.4 0 0 0-1.5-.3 1.4 1.4 0 0 0-.9 1.3V18H8.4v-.3a1.4 1.4 0 0 0-.9-1.3 1.4 1.4 0 0 0-1.5.3l-.1.1-2.7-2.7.1-.1a1.4 1.4 0 0 0 .3-1.5 1.4 1.4 0 0 0-1.3-.9H2V8.4h.3a1.4 1.4 0 0 0 1.3-.9A1.4 1.4 0 0 0 3.3 6l-.1-.1 2.7-2.7.1.1a1.4 1.4 0 0 0 1.5.3 1.4 1.4 0 0 0 .9-1.3V2h3.2v.3a1.4 1.4 0 0 0 .9 1.3A1.4 1.4 0 0 0 14 3.3l.1-.1 2.7 2.7-.1.1a1.4 1.4 0 0 0-.3 1.5 1.4 1.4 0 0 0 1.3.9h.3v3.2h-.3a1.4 1.4 0 0 0-1.3.9Z"/>'
  };
  return `<svg viewBox="0 0 20 20" aria-hidden="true">${paths[id] ?? '<circle cx="10" cy="10" r="2"/>'}</svg>`;
}

function nav(activeId, auth = {}, activeProjectId = "") {
  const visibleRoutes = new Set(visibleConsoleRouteIds(auth));
  const primaryIds = ["cockpit", "work", "strategy", "hr", "finance", "growthSales", "manufacturing", "smartPark", "video", "graphicDesign", "cad"];
  const renderLinks = (ids) => ids.map((id) => consoleWebRoutes.find((route) => route.id === id)).filter((route) => route && visibleRoutes.has(route.id)).map((route) => {
    const active = route.id === activeId ? "active" : "";
    return `<a class="${active}" href="${routeHref(route.navPath, activeProjectId)}" title="${escapeHtml(route.label)}"><span class="nav-icon">${navIcon(route.id)}</span><span class="nav-label">${escapeHtml(route.label)}</span></a>`;
  }).join("");
  return `<nav class="top-nav"><span class="nav-group-label">Business</span>${renderLinks(primaryIds)}<span class="nav-group-label">Intelligence</span>${renderLinks(["development","execution","portfolio","outcomes"])}<span class="nav-spacer"></span><span class="nav-group-label">System</span>${renderLinks(["projects","actions","agentAdmin","credentials","account","config"])}</nav>`;
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
        <a class="auth-account-link" href="/account" title="账户与安全"><strong>${escapeHtml(auth.user?.display_name || auth.user?.username || "已登录")}</strong></a>
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
  const stages = ["理解目标", "组织工作流", "调用 Agent", "验证交付"];
  return `<div class="auth-product-panel">
    <div class="auth-product-copy">
      <span class="auth-kicker">Enterprise AI Workstation</span>
      <h2>从一句话，到可验证的成果。</h2>
      <p>统一管理项目、Agent、模型与业务工作流，让目标持续推进到测试、交付和发布。</p>
    </div>
    <div class="auth-flow-preview" aria-label="Studio 自动工作流">
      ${stages.map((stage, index) => `<div class="auth-flow-step"><span>${String(index + 1).padStart(2, "0")}</span><strong>${stage}</strong>${index < stages.length - 1 ? "<i></i>" : ""}</div>`).join("")}
    </div>
    <div class="auth-capability-row" aria-label="工作台能力">
      <span>8 个项目</span><span>多模型编排</span><span>全程审计</span>
    </div>
  </div>`;
}

function accessEntryPage(_data) {
  return `<section class="auth-shell auth-entry-shell">
    ${authVisualPanel()}
    <div class="auth-side entry-side">
      <span class="auth-kicker">Agent Studio</span>
      <h2>统一 AI 工作台</h2>
      <p class="auth-intro">登录后直接描述目标。Studio 会识别领域、定位项目并组织完整执行链路。</p>
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
        <span class="auth-kicker">Welcome back</span>
        <h3>登录工作台</h3>
        <p>继续推进项目、业务与创意任务。</p>
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
          <button type="submit" class="primary-action auth-submit-button"><span>登录</span><i aria-hidden="true">→</i></button>
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
        <span class="auth-kicker">Workspace access</span>
        <h3>申请加入工作台</h3>
        <p>提交用途和所需权限，审批后即可进入对应项目空间。</p>
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
          <button type="submit" class="primary-action auth-submit-button"><span>提交申请</span><i aria-hidden="true">→</i></button>
        </div>
        <p id="auth-status" class="help auth-status-copy">已有账号？<a href="/login">返回登录</a></p>
      </form>
    </div>
  </section>`;
}

function actionWorkbench(data, title = "ANKSEN 工作站") {
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
  const flowSteps = ["理解", "定位项目", "规划", "执行", "验证", "交付"];
  const quickActions = [
    ["agent-real-plan", "制定战略", "制定公司战略目标、关键指标和执行计划"],
    ["agent-real-plan", "推进销售", "分析销售目标并形成获客、转化和跟进工作流"],
    ["agent-real-plan", "人力规划", "分析组织与人力需求并形成可执行方案"],
    ["agent-real-plan", "平面设计", "创建平面设计任务并交付可编辑 PSD、PNG 和 PDF"],
    ["agent-real-plan", "开发产品", `分析并推进 ${activeProjectLabel} 的产品开发任务`],
    ["project-inspect", "检查项目", `检查 ${activeProjectLabel} 当前状态和阻断项`],
    ["context-summary", "整理进展", `整理 ${activeProjectLabel} 最近任务、结果和下一步`]
  ];
  return `<section class="workspace-shell">
    <aside class="project-rail">
      <div class="rail-header">
        <span class="rail-label">项目</span>
        <span class="pill">${data.actionServer.projects.length}</span>
      </div>
      <div class="project-list">${projectCards.join("")}</div>
    </aside>
    <div class="ai-workspace chat-workspace">
      <div class="workspace-hero compact-hero">
        <div class="workspace-title">
          <span class="eyebrow">Personal AI Workstation</span>
          <h2>${escapeHtml(title)}</h2>
        </div>
        <div class="workspace-meta">
          <span class="meta-chip">${escapeHtml(activeProjectLabel)}</span>
          <span class="meta-chip">AI 协作中</span>
        </div>
      </div>
      ${accessEntitlementPanel(data.renderAuth ?? {})}
      <div class="quick-row compact-quick-row">
        ${quickActions.map(([id, label, suggestedGoal]) => {
          const goal = suggestedGoal ?? label;
          return `<button type="button" class="quick-chip" data-quick-action="${escapeHtml(id)}" data-goal="${escapeHtml(goal)}">${escapeHtml(label)}</button>`;
        }).join("")}
      </div>
      <div id="conversation-stream" class="conversation-stream" aria-live="polite">
        <div class="welcome-message">
          <span class="welcome-mark">A</span>
          <div><strong>今天想推进什么？</strong><p>描述目标即可。我会定位仓库、拆解任务、调用合适的 Agent，并持续汇报执行结果。</p></div>
        </div>
      </div>
      <div class="execution-console">
        <div class="timeline-strip">
          <span class="timeline-label">进度</span>
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
        <label class="sr-only" for="action-goal">任务</label>
        <textarea id="action-goal" class="goal-box command-input" placeholder="交给 Studio 一项任务……"></textarea>
        <div class="attachment-toolbar">
          <div class="attachment-toolbar-head">
            <label class="attachment-label" for="action-attachments">上下文</label>
            <button type="button" id="attachment-trigger" class="secondary attach-button">＋ 添加文件</button>
            <input id="action-attachments" type="file" multiple accept="image/*,.pdf,.txt,.md,.json,.csv,.log,.doc,.docx,.xls,.xlsx" hidden>
          </div>
          <div id="attachment-list" class="attachment-list empty">
            <span class="attachment-empty">可添加图片、文档或数据文件</span>
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
          <button type="button" class="primary-action start-button" data-console-action="start">发送 ↑</button>
          <button type="button" class="danger cancel-button" data-console-action="cancel">停止</button>
        </div>
      </div>
    </div>
    <aside class="advanced-config">
      <div class="rail-header">
        <span class="rail-label">工作站状态</span>
        <span class="pill">按需查看</span>
      </div>
      <div class="side-stack">
        <div class="side-panel">
          <span class="side-kicker">自动执行范围</span>
          <div class="policy-strip compact-policy workstation-automation-summary">
            <span><b>自动</b> 分析与规划</span>
            <span><b>自动</b> 测试与报告</span>
            <span><b>按项目</b> 提交与发布</span>
            <span><b>资格控制</b> 生产部署</span>
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
  const requestedGoal = new URLSearchParams(window.location.search).get("goal");
  if (goal && requestedGoal) goal.value = requestedGoal;
  const currentProjectValue = () => (project ? project.value : "jinhu-smart-park");
  let currentRunId = null;
  let pollTimer = null;
  let selectedAttachments = [];
  const runAttachmentCache = new Map();
  const terminalStatuses = new Set(["PASS", "FAIL", "BLOCKED", "NEEDS_APPROVAL", "CANCELLED", "RECOVERY_REQUIRED"]);
  const defaultTimeline = ["已理解目标", "选择项目", "Agent/Runtime", "生成计划", "Governance", "执行/审批", "结果报告"];

  function setAuthStatus(message, tone = "neutral") {
    if (!authStatus) return;
    authStatus.textContent = message || "未登录";
    authStatus.className = "help auth-status " + tone;
  }

  function setAuthBusy(form, busy, label) {
    const button = form?.querySelector('button[type="submit"]');
    if (!button) return;
    const text = button.querySelector("span");
    if (!button.dataset.idleLabel && text) button.dataset.idleLabel = text.textContent;
    button.disabled = busy;
    if (text) text.textContent = busy ? label : (button.dataset.idleLabel || text.textContent);
    form.setAttribute("aria-busy", String(busy));
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
    if (record && record.status === "RECOVERY_REQUIRED") return "需要恢复确认";
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
  if (conversationStream) {
    fetch("/api/actions/latest", { cache: "no-store" }).then(async (response) => response.ok ? response.json() : null).then((record) => {
      if (!record?.run_id || currentRunId) return;
      currentRunId = record.run_id;
      renderRun(record);
      if (!terminalStatuses.has(record.status || "")) schedulePoll();
    }).catch(() => {});
  }

  authLoginForm?.addEventListener("submit", async (event) => {
    event.preventDefault();
    try {
      setAuthBusy(authLoginForm, true, "正在登录…");
      setAuthStatus("登录中...", "pending");
      await postJson("/api/access/login", {
        username: authUsername ? authUsername.value.trim() : "",
        password: authPassword ? authPassword.value : ""
      });
      setAuthStatus("登录成功，正在进入工作台...", "success");
      window.setTimeout(() => window.location.assign("/"), 180);
    } catch (error) {
      setAuthStatus(String(error && error.message ? error.message : error), "error");
      setAuthBusy(authLoginForm, false, "");
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
      setAuthBusy(authRegisterForm, true, "正在提交…");
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
    } finally {
      setAuthBusy(authRegisterForm, false, "");
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
    .auth-account-link { color:inherit; text-decoration:none; }
    .auth-account-link:hover strong { color:var(--blue); }
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
    .portfolio-cockpit { max-width:1180px; margin:0 auto 24px; padding:22px 0 8px; }
    .portfolio-cockpit .section-head { align-items:flex-end; }
    .portfolio-cockpit .section-head p { margin:7px 0 0; color:var(--muted); }
    .portfolio-grid { display:grid; grid-template-columns:repeat(4,minmax(0,1fr)); gap:12px; margin-top:16px; }
    .portfolio-card { display:block; min-height:190px; padding:18px; color:inherit; text-decoration:none; border:1px solid var(--line); border-radius:16px; background:linear-gradient(150deg,rgba(25,34,51,.94),rgba(12,17,27,.96)); transition:transform .18s ease,border-color .18s ease,box-shadow .18s ease; }
    .portfolio-card:hover { transform:translateY(-2px); border-color:rgba(96,165,250,.55); box-shadow:0 16px 36px rgba(0,0,0,.2); }
    .portfolio-card-head { display:flex; align-items:center; justify-content:space-between; gap:10px; }
    .portfolio-icon { display:grid; place-items:center; min-width:38px; height:30px; padding:0 8px; border-radius:9px; color:#dbeafe; background:rgba(59,130,246,.16); font-size:11px; font-weight:800; letter-spacing:.05em; }
    .portfolio-state { padding:4px 8px; border-radius:999px; font-size:11px; color:var(--muted); background:rgba(148,163,184,.1); }
    .portfolio-state.active { color:#93c5fd; background:rgba(59,130,246,.13); }
    .portfolio-state.pass { color:#6ee7b7; background:rgba(16,185,129,.13); }
    .portfolio-state.blocked { color:#fca5a5; background:rgba(239,68,68,.13); }
    .portfolio-card h3 { margin:15px 0 7px; font-size:17px; }
    .portfolio-card>p { min-height:42px; margin:0; color:var(--muted); font-size:12px; line-height:1.55; }
    .portfolio-progress { height:5px; margin:15px 0 12px; overflow:hidden; border-radius:999px; background:rgba(148,163,184,.12); }
    .portfolio-progress i { display:block; width:0; height:100%; border-radius:inherit; background:linear-gradient(90deg,#3b82f6,#22d3ee); transition:width .35s ease; }
    .portfolio-meta { display:flex; align-items:center; justify-content:space-between; gap:7px; color:var(--muted); font-size:10px; }
    .portfolio-meta strong { color:var(--text); font-size:11px; }
    .portfolio-signal-grid { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:8px; margin:16px 0 12px; }
    .portfolio-signal-grid span { padding:8px 10px; border:1px solid rgba(148,163,184,.13); border-radius:10px; background:rgba(15,23,42,.42); color:var(--muted); font-size:10px; }
    .portfolio-signal-grid strong { display:block; margin-bottom:2px; color:var(--text); font-size:16px; }
    .portfolio-entry-footer { display:flex; align-items:center; justify-content:space-between; gap:12px; padding-top:11px; border-top:1px solid rgba(148,163,184,.13); color:var(--muted); font-size:10px; }
    .portfolio-entry-footer strong { flex:none; color:#7dd3fc; font-size:11px; }
    [data-portfolio-app][data-signal="ACTION_REQUIRED"] { border-color:rgba(251,146,60,.34); }
    [data-portfolio-app][data-signal="RUNNING"] { border-color:rgba(96,165,250,.34); }
    [data-portfolio-app][data-signal="RESULT_AVAILABLE"] { border-color:rgba(52,211,153,.3); }
    .portfolio-source { margin:12px 2px 0; color:var(--muted); font-size:11px; }
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
    .cad-workbench { grid-template-columns:minmax(320px,.82fr) minmax(420px,1.18fr); }
    .cad-dropzone { display:grid; place-items:center; min-height:220px; padding:26px; border:1px dashed #33465f; border-radius:14px; background:linear-gradient(145deg,rgba(35,55,82,.22),rgba(8,13,20,.52)); text-align:center; cursor:pointer; transition:border-color .16s ease,background .16s ease,transform .16s ease; }
    .cad-dropzone:hover,.cad-dropzone:focus-visible,.cad-dropzone.drag-active { border-color:var(--blue); background:rgba(47,109,181,.12); outline:none; }
    .cad-dropzone.drag-active { transform:translateY(-1px); }
    .cad-drop-icon { display:grid; place-items:center; width:48px; height:48px; margin:0 auto 14px; border:1px solid rgba(90,169,255,.3); border-radius:14px; background:rgba(90,169,255,.1); color:var(--blue); font-size:24px; }
    .cad-dropzone strong { display:block; margin-bottom:7px; font-size:16px; }
    .cad-dropzone span { display:block; color:var(--muted); font-size:12px; line-height:1.6; }
    .cad-format-row { display:flex; justify-content:center; gap:6px; flex-wrap:wrap; margin-top:13px; }
    .cad-format { padding:3px 7px; border:1px solid var(--line); border-radius:999px; color:var(--muted); font-size:10px; font-weight:800; }
    .cad-format.ready { color:var(--green); border-color:rgba(52,211,153,.3); background:rgba(52,211,153,.07); }
    .cad-file-card { display:none; align-items:center; gap:12px; margin-top:12px; padding:12px; border:1px solid var(--line); border-radius:10px; background:#0a0f16; }
    .cad-file-card.visible { display:flex; }
    .cad-file-icon { display:grid; place-items:center; flex:0 0 38px; height:38px; border-radius:9px; background:rgba(90,169,255,.1); color:var(--blue); font-size:11px; font-weight:900; }
    .cad-file-meta { min-width:0; flex:1; }
    .cad-file-meta strong,.cad-file-meta span { display:block; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
    .cad-file-meta span { margin-top:3px; color:var(--muted); font-size:11px; }
    .cad-file-remove { min-height:32px; padding:5px 9px; }
    .cad-message { min-height:20px; }
    .cad-message.error { color:var(--red); }
    .cad-message.success { color:var(--green); }
    .cad-message.warning { color:var(--yellow); }
    .account-security-grid { display:grid; grid-template-columns:minmax(280px,.7fr) minmax(420px,1.3fr); gap:14px; }
    .account-fact { display:flex; justify-content:space-between; gap:16px; padding:11px 0; border-bottom:1px solid var(--line); }
    .account-fact:last-child { border-bottom:0; }
    .account-fact span { color:var(--muted); font-size:12px; }
    .account-fact strong { text-align:right; overflow-wrap:anywhere; }
    .password-field { position:relative; }
    .password-field input { padding-right:64px; }
    .password-toggle { position:absolute; right:5px; top:5px; min-height:30px; padding:4px 8px; border:0; background:transparent; color:var(--muted); font-size:11px; }
    .password-requirements { display:grid; grid-template-columns:repeat(2,minmax(0,1fr)); gap:7px; margin:12px 0; padding:12px; border:1px solid var(--line); border-radius:10px; background:#0a0f16; }
    .password-requirement { color:var(--muted); font-size:11px; }
    .password-requirement::before { content:'○'; margin-right:6px; }
    .password-requirement.pass { color:var(--green); }
    .password-requirement.pass::before { content:'✓'; }
    .security-event { display:grid; grid-template-columns:minmax(0,1fr) auto; gap:8px; padding:10px 0; border-bottom:1px solid var(--line); }
    .security-event:last-child { border-bottom:0; }
    .security-event time { color:var(--muted); font-size:11px; }
    .success-text { color:var(--green); }
    .error-text { color:var(--red); }
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
    /* Workstation visual system: conversation first, operational detail on demand. */
    :root { color-scheme:light; --canvas:#f6f7f9; --surface-1:#ffffff; --surface-2:#ffffff; --surface-3:#f2f4f7; --elevated:#ffffff; --bg:var(--canvas); --nav:#ffffff; --panel:#ffffff; --panel-2:#f2f4f7; --text:#101828; --muted:#667085; --line:#e4e7ec; --primary:#2563eb; --primary-hover:#1d4ed8; --blue:#2563eb; --cyan:#0891b2; --purple:#7c3aed; --green:#059669; --yellow:#d97706; --red:#dc2626; --shadow:rgba(16,24,40,.06); --sidebar-width:220px; }
    body:not(.login-gated) { background:linear-gradient(180deg,#fff 0,#f8fafc 34%,#f5f7fa 100%); color:var(--text); }
    .sr-only { position:absolute!important; width:1px!important; height:1px!important; padding:0!important; margin:-1px!important; overflow:hidden!important; clip:rect(0,0,0,0)!important; white-space:nowrap!important; border:0!important; }
    body:not(.login-gated) header:not(.login-header) { background:rgba(255,255,255,.9); border-right-color:#eaecf0; backdrop-filter:blur(24px); }
    body:not(.login-gated) header:not(.login-header) .top-nav a { color:#667085; }
    body:not(.login-gated) header:not(.login-header) .top-nav a:hover { color:#101828; background:#f2f4f7; }
    body:not(.login-gated) header:not(.login-header) .top-nav a.active { background:#eef4ff; border-color:#dbe7ff; color:#175cd3; }
    body:not(.login-gated) header:not(.login-header) .top-status-pill { color:#667085; }
    body:not(.login-gated) header:not(.login-header) .auth-identity strong { color:#344054; }
    .app-toolbar { background:rgba(255,255,255,.86); border-bottom-color:#eaecf0; }
    .workspace-shell { max-width:1440px; margin:0 auto; grid-template-columns:188px minmax(0,1fr) 196px; gap:18px; }
    .ai-workspace,.advanced-config,.project-rail { background:rgba(255,255,255,.82); border:1px solid #eaecf0; border-radius:18px; box-shadow:0 12px 36px rgba(16,24,40,.04); }
    .ai-workspace { padding:18px; }
    .project-rail,.advanced-config { padding:14px; }
    .project-row { color:#667085; border-radius:10px; padding:10px 11px; }
    .project-row:hover { background:#f7f9fc; color:#344054; }
    .project-row.active { border-color:#d6e4ff; background:#f0f5ff; color:#1849a9; }
    .rail-label,.eyebrow,.side-kicker { color:#667085; }
    .pill,.meta-chip { background:#f8fafc; border-color:#e4e7ec; color:#475467; }
    .chat-workspace { min-height:calc(100vh - 114px); }
    .workspace-hero.compact-hero { padding:2px 2px 14px; border-bottom-color:#f0f1f3; }
    .workspace-hero h2 { font-size:22px; letter-spacing:-.02em; }
    .quick-row { gap:8px; margin:12px 0; }
    .quick-chip { min-height:34px; padding:7px 12px; background:#fff; border-color:#e4e7ec; color:#475467; box-shadow:0 1px 2px rgba(16,24,40,.03); }
    .quick-chip:hover { color:#175cd3; border-color:#b2ccff; background:#f5f8ff; }
    .conversation-stream { min-height:360px; max-height:56vh; padding:28px; border:0; border-radius:16px; background:linear-gradient(180deg,#fbfcfe,#fff); box-shadow:inset 0 0 0 1px #f0f1f3; font-family:inherit; }
    .welcome-message { min-height:280px; display:flex; align-items:center; justify-content:center; gap:14px; color:#344054; }
    .welcome-message > div { max-width:520px; }
    .welcome-message strong { display:block; margin-bottom:5px; font-size:21px; letter-spacing:-.02em; }
    .welcome-message p { font-size:14px; }
    .welcome-mark { display:grid; place-items:center; width:42px; height:42px; flex:0 0 auto; border-radius:14px; color:#fff; background:linear-gradient(145deg,#2563eb,#7c3aed); font-weight:850; box-shadow:0 10px 24px rgba(37,99,235,.2); }
    .terminal-line { color:#344054; font-family:ui-monospace,SFMono-Regular,Menlo,monospace; }
    .terminal-line.assistant { color:#344054; }
    .message-body { border-color:#eaecf0; background:#fff; }
    .chat-message.user .message-body { background:#eff6ff; border-color:#dbeafe; }
    .message-avatar,.assistant-avatar { background:#ecfdf3; color:#027a48; border-color:#abefc6; }
    .chat-message.user .message-avatar { background:#eff4ff; color:#175cd3; border-color:#b2ccff; }
    .execution-console { margin:12px 0 0; padding:8px 12px; border-color:#eaecf0; background:#fafbfc; }
    .timeline-state,.flow-step { background:transparent; color:#667085; }
    .flow-step.pending { color:#98a2b3; }
    .flow-separator { color:#d0d5dd; }
    .composer { margin-top:12px; padding:14px; border:1px solid #dfe3e8; border-radius:16px; background:#fff; box-shadow:0 16px 42px rgba(16,24,40,.09); }
    .command-input,.goal-box { min-height:104px; border:0; padding:4px; background:#fff; color:#101828; resize:none; font-size:16px; box-shadow:none; }
    .command-input:focus,.goal-box:focus { outline:0; border:0; }
    .command-input::placeholder { color:#98a2b3; }
    .attachment-toolbar { margin-top:8px; padding:8px 0; border:0; border-top:1px solid #f0f1f3; border-radius:0; background:transparent; }
    .attachment-toolbar-head { margin-bottom:4px; }
    .attachment-empty { color:#98a2b3; }
    .workspace-controls { grid-template-columns:minmax(150px,1fr) minmax(110px,.65fr) minmax(140px,.8fr) auto auto; }
    input,select,textarea { color:#101828; background:#fff; border-color:#d0d5dd; }
    select { min-height:40px; }
    button { border-color:#d0d5dd; background:#fff; color:#344054; }
    button:hover { background:#f9fafb; }
    button.secondary { background:#fff; color:#475467; }
    button.primary-action { background:#2563eb; border-color:#2563eb; color:#fff; box-shadow:0 4px 12px rgba(37,99,235,.18); }
    button.primary-action:hover { background:#1d4ed8; }
    button.danger { border-color:transparent; color:#b42318; background:#fff; }
    .side-panel,.advanced-config details { background:#fff; border-color:#eaecf0; }
    .advanced-config summary { color:#475467; }
    .risk-badge.low,.status-label.pass,.status-label.ready,.status-label.direct-execute-ready { color:#027a48; background:#ecfdf3; border-color:#abefc6; }
    .risk-badge.medium,.status-label.local,.status-label.recorded,.status-label.draft-dry-run { color:#175cd3; background:#eff4ff; border-color:#b2ccff; }
    .risk-badge.high,.status-label.proposal-only,.status-label.yes { color:#b54708; background:#fffaeb; border-color:#fedf89; }
    .risk-badge.critical,.status-label.blocked,.status-label.cancelled { color:#b42318; background:#fef3f2; border-color:#fecdca; }
    .run-details pre,pre { background:#101828; color:#f2f4f7; border-color:#1d2939; }
    .command-center-hero { max-width:980px; min-height:calc(100vh - 190px); display:flex; flex-direction:column; justify-content:center; padding:40px 28px 80px; }
    .command-center-copy { margin-bottom:26px; }
    .command-center-copy h2 { font-size:40px; color:#101828; }
    .command-box { max-width:820px; width:100%; padding:12px; border-color:#dfe3e8; border-radius:22px; background:#fff; box-shadow:0 20px 60px rgba(16,24,40,.12); }
    .command-box > textarea { min-height:156px; color:#101828; background:#fff; font-size:17px; }
    .command-box > textarea::placeholder { color:#98a2b3; }
    .command-compose-footer { padding:12px 8px 2px 12px; border-top-color:#f0f1f3; }
    .suggestion-row button { background:#f7f8fa; color:#667085; }
    .suggestion-row button:hover { color:#175cd3; border-color:#dbe7ff; background:#f0f5ff; }
    .page-dashboard { --sidebar-width:76px; }
    .page-dashboard header:not(.login-header) { width:76px; padding:20px 12px; }
    .page-dashboard header:not(.login-header) .brand-copy,
    .page-dashboard header:not(.login-header) .nav-label,
    .page-dashboard header:not(.login-header) .nav-group-label,
    .page-dashboard header:not(.login-header) .nav-spacer,
    .page-dashboard header:not(.login-header) .top-status,
    .page-dashboard header:not(.login-header) .auth-strip { display:none!important; }
    .page-dashboard header:not(.login-header) .brand-row { justify-content:center; }
    .page-dashboard header:not(.login-header) .logo-frame { width:42px; height:38px; }
    .page-dashboard header:not(.login-header) .top-nav { align-items:center; gap:7px; margin-top:22px; overflow:hidden; }
    .page-dashboard header:not(.login-header) .top-nav a { justify-content:center; width:44px; height:42px; padding:0; }
    .page-dashboard header:not(.login-header) .top-nav a[href^="/strategy"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/hr"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/finance"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/growth-sales"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/manufacturing"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/smart-park"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/video"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/cad"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/execution"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/portfolio"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/outcomes"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/credentials"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/account"],
    .page-dashboard header:not(.login-header) .top-nav a[href^="/config"] { display:none; }
    .page-dashboard main { margin-left:76px; max-width:none; padding-bottom:0; }
    .page-dashboard .app-toolbar { border-bottom-color:transparent; background:rgba(255,255,255,.62); }
    .page-dashboard .portfolio-cockpit,
    .page-dashboard .current-run-strip,
    .page-dashboard .recent-outcomes,
    .page-dashboard .home-diagnostics { display:none; }
    .page-dashboard main { padding:0 24px 24px; }
    .page-dashboard .app-toolbar { height:64px; margin:0 -24px 18px; padding:0 24px; }
    .page-dashboard .workspace-shell { grid-template-columns:190px minmax(520px,1fr) 210px; max-width:1500px; min-height:calc(100vh - 104px); gap:14px; }
    .page-dashboard .chat-workspace { min-height:calc(100vh - 104px); }
    .page-dashboard .conversation-stream { max-height:none; min-height:300px; }
    .page-dashboard .advanced-config,.page-dashboard .project-rail { top:82px; }
    .page-dashboard .access-entitlement-panel { display:none; }
    .page-dashboard .quick-row { margin-top:14px; }
    .page-dashboard .conversation-stream { min-height:340px; }
    .workstation-field-guide { display:flex; align-items:center; justify-content:center; gap:8px; flex-wrap:wrap; max-width:980px; margin:14px auto 0; }
    .workstation-field-guide span { padding:5px 10px; border:1px solid #e4e7ec; border-radius:999px; background:rgba(255,255,255,.72); color:#667085; font-size:11px; }
    .workstation-automation-summary { display:grid; gap:7px; }
    .workstation-automation-summary span { justify-content:space-between; padding:7px 0; border-bottom:1px solid #f0f1f3; }
    .workstation-automation-summary span:last-child { border-bottom:0; }
    .workstation-automation-summary b { color:#344054; font-size:11px; }
    table { box-shadow:none; }
    body.login-gated { color-scheme:light; min-height:100vh; background:#f7f8fa; color:#101828; }
    body.login-gated .login-header { position:relative; z-index:2; padding:22px clamp(22px,4vw,56px); border:0; border-bottom:1px solid #eaecf0; background:rgba(255,255,255,.92); backdrop-filter:blur(20px); box-shadow:none; }
    body.login-gated .login-header .brand-row { max-width:1440px; margin:0 auto; padding:0; }
    body.login-gated .login-header .logo-frame { width:38px; height:34px; border:1px solid #eaecf0; background:#fff; box-shadow:0 1px 2px rgba(16,24,40,.05); }
    body.login-gated .login-header h1 { color:#101828; font-size:15px; }
    body.login-gated .login-header .subhead { color:#98a2b3; }
    body.login-gated main { display:grid; place-items:center; min-height:calc(100vh - 79px); width:auto; max-width:none; padding:clamp(24px,5vw,72px); }
    body.login-gated .auth-shell { width:min(1120px,100%); max-width:none; margin:0; grid-template-columns:minmax(0,1.18fr) minmax(360px,.82fr); gap:0; overflow:hidden; border:1px solid #e4e7ec; border-radius:24px; background:#fff; box-shadow:0 24px 80px rgba(16,24,40,.10); }
    body.login-gated .auth-product-panel { min-height:590px; display:flex; flex-direction:column; justify-content:space-between; padding:clamp(36px,5vw,64px); border-radius:0; background:linear-gradient(145deg,#f8faff 0%,#eef4ff 52%,#f7f5ff 100%); }
    body.login-gated .auth-product-panel::before { inset:auto -80px -150px auto; width:380px; height:380px; border-radius:50%; background:radial-gradient(circle,rgba(105,65,198,.13),transparent 68%); }
    body.login-gated .auth-product-panel::after { display:none; }
    .auth-product-copy { position:relative; z-index:1; max-width:540px; }
    .auth-product-copy .auth-kicker { color:#175cd3; }
    .auth-product-copy h2 { max-width:520px; margin:16px 0 18px; color:#101828; font-size:clamp(38px,4.2vw,60px); line-height:1.04; letter-spacing:-.045em; }
    .auth-product-copy p { max-width:500px; margin:0; color:#475467; font-size:16px; line-height:1.75; }
    .auth-flow-preview { position:relative; z-index:1; display:grid; grid-template-columns:repeat(4,1fr); margin:46px 0 30px; padding:22px; border:1px solid rgba(178,204,255,.8); border-radius:18px; background:rgba(255,255,255,.7); box-shadow:0 12px 36px rgba(23,92,211,.07); backdrop-filter:blur(16px); }
    .auth-flow-step { position:relative; display:grid; gap:7px; min-width:0; padding:0 14px; }
    .auth-flow-step:first-child { padding-left:0; }
    .auth-flow-step:last-child { padding-right:0; }
    .auth-flow-step span { color:#528bdb; font-size:10px; font-weight:800; letter-spacing:.12em; }
    .auth-flow-step strong { color:#344054; font-size:12px; white-space:nowrap; }
    .auth-flow-step i { position:absolute; top:18px; right:-4px; width:8px; height:8px; border-top:1.5px solid #84adf1; border-right:1.5px solid #84adf1; transform:rotate(45deg); }
    .auth-capability-row { position:relative; z-index:1; display:flex; flex-wrap:wrap; gap:8px; }
    .auth-capability-row span { padding:7px 10px; border:1px solid rgba(178,204,255,.8); border-radius:999px; background:rgba(255,255,255,.62); color:#475467; font-size:11px; font-weight:700; }
    body.login-gated .auth-side { align-self:stretch; display:flex; flex-direction:column; justify-content:center; padding:clamp(34px,5vw,60px); border:0; border-left:1px solid #eaecf0; border-radius:0; background:#fff; color:#101828; box-shadow:none; backdrop-filter:none; }
    body.login-gated .auth-side .auth-kicker { color:#2563eb; }
    body.login-gated .auth-card-head h3,body.login-gated .auth-side h2 { color:#101828; font-size:32px; line-height:1.12; letter-spacing:-.025em; }
    body.login-gated .auth-card-head p,.auth-intro { margin:10px 0 0; color:#667085; font-size:14px; line-height:1.6; }
    body.login-gated .auth-form { gap:17px; margin-top:30px; }
    body.login-gated .auth-form label { display:block; margin-bottom:7px; color:#344054; font-size:12px; font-weight:700; }
    body.login-gated .auth-form input,body.login-gated .auth-form select,body.login-gated .auth-form textarea { min-height:48px; border:1px solid #d0d5dd; border-radius:11px; background:#fff; color:#101828; font-size:14px; box-shadow:0 1px 2px rgba(16,24,40,.04); transition:border-color .16s ease,box-shadow .16s ease; }
    body.login-gated .auth-form input:focus,body.login-gated .auth-form select:focus,body.login-gated .auth-form textarea:focus { outline:0; border-color:#84adf1; box-shadow:0 0 0 4px #eef4ff; }
    body.login-gated .auth-form input::placeholder,body.login-gated .auth-form textarea::placeholder { color:#98a2b3; }
    body.login-gated .auth-submit-button,body.login-gated .auth-link-button.primary-action { display:flex; align-items:center; justify-content:space-between; min-height:50px; padding:0 18px; border:1px solid #175cd3; border-radius:11px; background:#175cd3; color:#fff; box-shadow:0 8px 18px rgba(23,92,211,.18); }
    body.login-gated .auth-submit-button:hover,body.login-gated .auth-link-button.primary-action:hover { background:#1849a9; }
    body.login-gated .auth-submit-button:disabled { cursor:wait; opacity:.65; }
    body.login-gated .auth-link-button:not(.primary-action) { border:1px solid #d0d5dd; background:#fff; color:#344054; }
    body.login-gated .auth-status-copy { color:#667085; }
    body.login-gated .auth-status { min-height:20px; padding:9px 10px; border-radius:8px; background:#f9fafb; }
    body.login-gated .auth-status.pending { background:#eef4ff; color:#175cd3; }
    body.login-gated .auth-status.success { background:#ecfdf3; color:#027a48; }
    body.login-gated .auth-status.error { background:#fef3f2; color:#b42318; }
    body.login-gated .auth-path-actions { max-width:none; }
    .capability-assignment-list { display:grid; gap:14px; }
    .domain-capability-assignment { padding:20px; }
    .domain-capability-grid { display:grid; grid-template-columns:repeat(5,minmax(0,1fr)); gap:9px; }
    .domain-capability-option { display:flex; align-items:flex-start; gap:9px; min-width:0; padding:11px; border:1px solid #e4e7ec; border-radius:11px; background:#fff; cursor:pointer; }
    .domain-capability-option:hover { border-color:#b2ccff; background:#f8faff; }
    .domain-capability-option.inherited { background:#f9fafb; cursor:default; }
    .domain-capability-option input { flex:0 0 auto; width:16px; height:16px; margin:2px 0 0; accent-color:#2563eb; }
    .domain-capability-option span { min-width:0; }
    .domain-capability-option strong,.domain-capability-option small { display:block; }
    .domain-capability-option strong { color:#344054; font-size:12px; }
    .domain-capability-option small { margin-top:4px; color:#667085; font-size:10px; line-height:1.45; }
    .capability-assignment-actions { align-items:center; justify-content:space-between; margin-top:14px; }
    .capability-assignment-actions .help { margin:0; }
    /* Studio 2026 visual system: one calm, expressive surface language across every domain. */
    :root {
      --studio-ink:#111827;
      --studio-muted:#64748b;
      --studio-primary:#5b5ce2;
      --studio-primary-strong:#4647c8;
      --studio-violet:#8b5cf6;
      --studio-cyan:#06b6d4;
      --studio-border:rgba(15,23,42,.09);
      --studio-glass:rgba(255,255,255,.78);
      --studio-shadow-sm:0 1px 2px rgba(15,23,42,.04),0 8px 24px rgba(15,23,42,.035);
      --studio-shadow-lg:0 24px 70px rgba(46,51,90,.11);
      --studio-radius:18px;
    }
    body:not(.login-gated) { position:relative; min-height:100vh; background:#f7f8fc; color:var(--studio-ink); }
    body:not(.login-gated)::before { content:""; position:fixed; inset:0; z-index:-1; pointer-events:none; background:radial-gradient(circle at 82% 4%,rgba(139,92,246,.11),transparent 29%),radial-gradient(circle at 48% 34%,rgba(6,182,212,.07),transparent 25%),radial-gradient(circle at 12% 92%,rgba(91,92,226,.08),transparent 28%),linear-gradient(180deg,#fbfcff 0%,#f6f7fb 100%); animation:studio-aurora 18s ease-in-out infinite alternate; }
    body:not(.login-gated) header:not(.login-header) { border-right:1px solid var(--studio-border); background:rgba(252,252,255,.82); box-shadow:8px 0 32px rgba(31,41,55,.035); }
    body:not(.login-gated) header:not(.login-header) .top-nav a { transition:color .18s ease,background .18s ease,transform .18s ease; }
    body:not(.login-gated) header:not(.login-header) .top-nav a:hover { background:rgba(91,92,226,.07); color:#3435a9; transform:translateX(2px); }
    body:not(.login-gated) header:not(.login-header) .top-nav a.active { border-color:rgba(91,92,226,.14); background:linear-gradient(135deg,rgba(91,92,226,.13),rgba(139,92,246,.08)); color:#3f40b4; box-shadow:inset 3px 0 0 var(--studio-primary); }
    body:not(.login-gated) header:not(.login-header) .top-nav a.active .nav-icon { color:var(--studio-primary); }
    .app-toolbar { border-bottom-color:var(--studio-border); background:rgba(250,251,255,.76); box-shadow:0 8px 28px rgba(15,23,42,.025); }
    h1,h2,h3,h4 { color:var(--studio-ink); letter-spacing:-.025em; }
    .eyebrow { color:var(--studio-primary); font-weight:800; letter-spacing:.12em; }
    .product-hero { position:relative; isolation:isolate; overflow:hidden; padding:clamp(24px,4vw,42px); border:1px solid rgba(91,92,226,.12); border-radius:24px; background:linear-gradient(135deg,rgba(255,255,255,.94),rgba(245,243,255,.9) 52%,rgba(236,254,255,.72)); box-shadow:var(--studio-shadow-lg); }
    .product-hero::after { content:""; position:absolute; z-index:-1; width:320px; height:320px; top:-210px; right:-70px; border-radius:50%; background:conic-gradient(from 90deg,rgba(91,92,226,.23),rgba(6,182,212,.16),rgba(139,92,246,.2),rgba(91,92,226,.23)); filter:blur(8px); }
    .product-hero h2 { color:#111827; font-size:clamp(28px,3.2vw,44px); line-height:1.06; letter-spacing:-.045em; }
    .product-hero p { max-width:760px; color:#5b6577; line-height:1.75; }
    .panel,.metric,.workbench,.smart-entry,.output-card,.summary-card,.operation-card,.portfolio-card,.application-suite,.domain-card,.advanced-section,.details-drawer,.side-panel,.diagnostic-card,.diagnostic-snapshot,.current-run-strip,.recent-outcomes { border:1px solid var(--studio-border); background:var(--studio-glass); color:var(--studio-ink); box-shadow:var(--studio-shadow-sm); backdrop-filter:blur(18px); }
    .panel,.workbench,.smart-entry,.output-card,.operation-card,.portfolio-card,.application-suite,.advanced-section,.details-drawer { border-radius:var(--studio-radius); }
    .metric,.summary-card,.diagnostic-card { border-radius:15px; }
    .domain-card { min-height:0; border-radius:18px; background:linear-gradient(145deg,rgba(255,255,255,.94),rgba(248,250,255,.88)); transition:transform .22s ease,border-color .22s ease,box-shadow .22s ease; }
    .domain-card:hover,.portfolio-card:hover,.operation-card:hover { transform:translateY(-3px); border-color:rgba(91,92,226,.22); box-shadow:0 18px 44px rgba(61,64,120,.09); }
    .domain-card h3,.application-suite h2,.domain-card small { color:var(--studio-ink); }
    .domain-card p,.application-suite-head p,.help { color:var(--studio-muted); }
    .application-suite { padding:clamp(18px,3vw,28px); }
    .application-badge,.domain-mark,.domain-icon { border-color:rgba(91,92,226,.14); background:linear-gradient(145deg,#f0efff,#ecfeff); color:var(--studio-primary); box-shadow:0 8px 22px rgba(91,92,226,.09); }
    .advanced-section { overflow:hidden; }
    .advanced-section > summary,.details-drawer summary { color:#394150; background:rgba(248,250,252,.72); transition:background .18s ease,color .18s ease; }
    .advanced-section > summary:hover,.details-drawer summary:hover { color:var(--studio-primary); background:rgba(91,92,226,.055); }
    .advanced-section[open] > summary,.details-drawer[open] summary { border-bottom:1px solid var(--studio-border); }
    .simple-list,.activity-feed { border-color:var(--studio-border); }
    .simple-row,.activity-item { border-color:var(--studio-border); background:rgba(255,255,255,.62); transition:background .16s ease,transform .16s ease; }
    .simple-row:hover,.activity-item:hover { background:rgba(245,246,255,.94); }
    table { overflow:hidden; border:1px solid var(--studio-border); border-radius:16px; background:rgba(255,255,255,.82); box-shadow:var(--studio-shadow-sm); }
    th { color:#5b6474; background:#f7f8fc; font-size:11px; letter-spacing:.055em; text-transform:uppercase; }
    th,td { border-color:var(--studio-border); }
    tbody tr { transition:background .15s ease; }
    tbody tr:hover { background:rgba(91,92,226,.035); }
    input,select,textarea { border-color:#d8dce6; border-radius:11px; box-shadow:0 1px 2px rgba(15,23,42,.025); transition:border-color .16s ease,box-shadow .16s ease,background .16s ease; }
    input:focus,select:focus,textarea:focus { outline:0; border-color:rgba(91,92,226,.58); box-shadow:0 0 0 4px rgba(91,92,226,.09); }
    button,.primary-link { border-radius:11px; transition:transform .16s ease,box-shadow .16s ease,background .16s ease,border-color .16s ease; }
    button:hover,.primary-link:hover { transform:translateY(-1px); }
    button.primary-action,.primary-link { border-color:transparent; background:linear-gradient(135deg,var(--studio-primary),var(--studio-violet)); color:#fff; box-shadow:0 10px 24px rgba(91,92,226,.23); }
    button.primary-action:hover,.primary-link:hover { background:linear-gradient(135deg,var(--studio-primary-strong),#7c3aed); box-shadow:0 14px 30px rgba(91,92,226,.28); }
    .quick-chip,.pill,.meta-chip,.status-label { backdrop-filter:blur(8px); }
    .conversation-stream,.composer,.command-box,.ai-workspace,.advanced-config,.project-rail { border-color:var(--studio-border); box-shadow:var(--studio-shadow-sm); }
    .composer:focus-within,.command-box:focus-within { border-color:rgba(91,92,226,.3); box-shadow:0 22px 62px rgba(55,58,118,.13),0 0 0 4px rgba(91,92,226,.055); }
    .welcome-mark { background:linear-gradient(145deg,var(--studio-primary),var(--studio-violet) 58%,var(--studio-cyan)); box-shadow:0 12px 30px rgba(91,92,226,.25); }
    body.login-gated { background:radial-gradient(circle at 15% 10%,rgba(91,92,226,.11),transparent 30%),radial-gradient(circle at 90% 90%,rgba(6,182,212,.08),transparent 28%),#f8f9fc; }
    body.login-gated .auth-shell { border-color:var(--studio-border); box-shadow:var(--studio-shadow-lg); }
    body.login-gated .auth-product-panel { background:linear-gradient(145deg,#f7f7ff 0%,#eeefff 48%,#ecfeff 100%); }
    body.login-gated .auth-submit-button,body.login-gated .auth-link-button.primary-action { border-color:transparent; background:linear-gradient(135deg,var(--studio-primary),var(--studio-violet)); box-shadow:0 12px 28px rgba(91,92,226,.23); }
    .domain-capability-option { transition:border-color .16s ease,background .16s ease,transform .16s ease; }
    .domain-capability-option:hover { transform:translateY(-1px); border-color:rgba(91,92,226,.28); background:#f8f7ff; }
    .domain-capability-option input { accent-color:var(--studio-primary); }
    @keyframes studio-aurora { from { transform:scale(1) translate3d(0,0,0); filter:saturate(1); } to { transform:scale(1.04) translate3d(0,-1.2%,0); filter:saturate(1.08); } }
    @media (prefers-reduced-motion:reduce) { *,*::before,*::after { scroll-behavior:auto!important; animation-duration:.01ms!important; animation-iteration-count:1!important; transition-duration:.01ms!important; } }
    @media (max-width: 1100px) { .domain-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width: 1200px) { .domain-capability-grid { grid-template-columns:repeat(3,minmax(0,1fr)); } }
    @media (max-width: 1000px) { .portfolio-grid { grid-template-columns:repeat(2,minmax(0,1fr)); } }
    @media (max-width: 760px) { .portfolio-grid,.domain-capability-grid { grid-template-columns:1fr; } .capability-assignment-actions { align-items:stretch; flex-direction:column; } }
    @media (max-width: 760px) { .brand-row { align-items: flex-start; } .logo-frame { width:72px; height:40px; } main { padding:18px 14px 36px; } .product-hero { align-items:flex-start; flex-direction:column; padding:22px; } .product-hero h2 { font-size:24px; } .command-center-hero { padding:22px 0 20px; } .command-center-copy h2 { font-size:28px; } .command-compose-footer { align-items:stretch; flex-direction:column; } .current-run-strip { grid-template-columns:12px minmax(0,1fr); } .current-run-actions { grid-column:2; align-items:flex-start; flex-wrap:wrap; } .diagnostic-snapshot { grid-template-columns:repeat(2,1fr); } .domain-summary,.domain-grid { grid-template-columns:1fr; } .application-suite-head { flex-direction:column-reverse; } .domain-architecture { align-items:flex-start; flex-direction:column; } .diagnostic-links,.activity-feed,.operation-card-grid,.system-strip,.summary-grid,.product-grid,.goal-layout,.timeline,.action-feedback-grid,.flow-rail,.conversation-result,.chat-message,.chat-message.user,.attachment-bubble,.attachment-list,.cad-workbench { grid-template-columns:1fr; } .cad-dropzone { min-height:190px; padding:20px 14px; } .activity-item { grid-template-columns:34px minmax(0,1fr); } .activity-item time { grid-column:2; } .goal-sidebar { position:static; } .stage-rail { overflow-x:auto; min-width:520px; } .chat-message.user .message-avatar,.chat-message.user .message-body { grid-column:auto; grid-row:auto; } .workspace-hero { display:block; } .workspace-meta { margin-top:8px; } .auth-strip,.auth-actions,.auth-help-row { align-items:flex-start; flex-direction:column; } .auth-card-head h3,.auth-side h2 { font-size:28px; } .auth-product-panel { min-height:180px; } .auth-product-panel::before { inset:18px; } .auth-side { padding:24px; } .auth-path-actions { grid-template-columns:1fr; } body.login-gated .login-header { padding:16px 20px; } body.login-gated .login-header .brand-row { align-items:center; } body.login-gated .login-header .logo-frame { width:38px; height:34px; } body.login-gated main { min-height:auto; padding:18px; } body.login-gated .auth-shell { display:flex; flex-direction:column; width:100%; border-radius:18px; } body.login-gated .auth-side { order:0; border:0; padding:30px; } body.login-gated .auth-product-panel { order:1; min-height:auto; padding:30px; border-top:1px solid #eaecf0; } .auth-product-copy h2 { font-size:34px; } .auth-flow-preview { grid-template-columns:1fr 1fr; gap:18px; margin:30px 0 22px; } .auth-flow-step { padding:0; } .auth-flow-step i { display:none; } }
    @media (max-width: 760px) { .account-security-grid,.password-requirements { grid-template-columns:1fr; } }
    .sidebar-scrim { display:none; }
    @media (max-width: 900px) { body:not(.login-gated) header:not(.login-header) { position:fixed; inset:0 auto 0 0; width:260px; height:100vh; padding:18px 14px; transform:translateX(-105%); transition:transform .2s ease; z-index:20; } body.sidebar-open header:not(.login-header) { transform:translateX(0); } body.sidebar-open .sidebar-scrim { display:block; position:fixed; inset:0; z-index:19; border:0; border-radius:0; background:rgba(0,0,0,.56); backdrop-filter:blur(2px); } body:not(.login-gated) header:not(.login-header) .brand-row { padding:0 4px 16px; } body:not(.login-gated) header:not(.login-header) .top-nav { flex-direction:column; overflow-y:auto; margin-top:12px; } body:not(.login-gated) header:not(.login-header) .nav-group-label,body:not(.login-gated) header:not(.login-header) .nav-spacer,body:not(.login-gated) header:not(.login-header) .top-status,body:not(.login-gated) header:not(.login-header) .auth-strip { display:flex; } body:not(.login-gated) main,body.sidebar-collapsed main { margin-left:0; padding:0 16px 40px; } .app-toolbar { height:60px; margin:0 -16px 20px; padding:0 16px; } .mobile-sidebar-toggle { display:inline-flex; } .sidebar-toggle { display:none; } .form-grid,.workspace-controls,.workspace-shell,.auth-shell,.auth-entry-shell { grid-template-columns:1fr; } .advanced-config,.project-rail { position:static; } .auth-side { order:-1; justify-self:stretch; } }
  </style>
</head>
<body data-design-system="studio-2026" class="${useAuthLayout ? "login-gated" : `page-${escapeHtml(activeId)}`}">
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
      ,'账户与安全':'Account & Security','维护当前 Studio 本地登录账号。密码只在本次加密请求中提交，服务端仅保存 scrypt 哈希，不写入 Goal、Task、日志或 Credential Reference。':'Manage the current Studio local account. Passwords are sent only in this encrypted request; the server stores only an scrypt hash.','本地身份 · 已认证':'Local identity · Authenticated','显示名称':'Display name','用户名':'Username','角色':'Role','认证来源':'Authentication source','会话创建':'Session created','会话到期':'Session expires','修改密码':'Change password','成功后会撤销该账号的旧会话，并为当前浏览器签发新会话。':'Old sessions are revoked after success and this browser receives a new session.','会话自动轮换':'Automatic session rotation','当前密码':'Current password','新密码':'New password','确认新密码':'Confirm new password','至少 12 个字符':'At least 12 characters','包含大写字母':'Contains uppercase letter','包含小写字母':'Contains lowercase letter','包含数字':'Contains number','包含特殊符号':'Contains symbol','不含空格':'No whitespace','不包含用户名':'Does not contain username','两次输入一致':'Passwords match','更新密码':'Update password','显示当前密码':'Show current password','显示新密码':'Show new password','显示确认密码':'Show password confirmation','安全活动':'Security activity','仅显示当前账号的密码安全事件，不记录密码、哈希、Cookie 或会话令牌。':'Only password-security events for this account are shown. Passwords, hashes, cookies, and session tokens are never recorded.','刷新':'Refresh'
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
      ,'应用与业务领域':'Applications and business domains','统一 AI 业务驾驶舱承载多个边界清晰的平台。集团管理、增长销售、智慧园区和生产工厂各自独立，通过受控接口协作；所有进展与业务结果统一呈现。':'A unified AI business cockpit hosts multiple clearly bounded platforms. Group management, growth and sales, Smart Park, and production factories remain independent, collaborate through governed interfaces, and expose progress and outcomes in one place.','业务应用':'Business applications','业务领域':'Business domains','当前可运行':'Runnable now','在线 Runner':'Online runners','软件工厂':'Software Factory','视频工厂':'Video Factory','集团战略执行平台':'Enterprise Strategy Platform','集团人力资源平台':'Enterprise HR Platform','集团财务平台':'Enterprise Finance Platform','AI 增长与销售平台':'AI Growth & Sales Platform','智能制造 ERP 平台':'Intelligent Manufacturing ERP','智慧园区业务平台':'Smart Park Business Platform','软件研发':'Software Engineering','视频生产':'Video Production','战略执行':'Strategy Execution','人力资源':'Human Resources','财务管理':'Finance Management','业务工作流':'Business workflow','可以运行':'Runnable','能力未接通':'Capability unavailable','缺少 Runner':'Runner missing','创建领域目标':'Create domain goal','统一执行内核':'Unified execution kernel','业务领域与执行资源严格分层':'Business domains and execution resources are separated','应用负责产品入口，领域 Workflow 负责业务步骤，Skill 描述能力，Agent 承担阶段职责，在线 Runner 执行任务；所有任务继续进入同一个持久化 Kernel。':'Applications provide product entry points, domain workflows define business steps, skills describe capabilities, agents own stage responsibilities, and online runners execute every task through the same persistent kernel.','应用':'Application','业务域':'Business domain','应用与业务领域':'Application and business domain','自动识别（通用执行）':'Auto-detect (general execution)','选择业务领域后，将使用该领域的 Workflow 与 Skills；当前为安全演练模式。':'Selecting a business domain activates its workflow and skills. Safe simulation mode remains enabled.'
      ,'长期任务':'Long-running work','经营结果':'Business outcomes','集团长期任务编排':'Enterprise long-task orchestration','新建 Campaign':'New campaign','长期目标':'Long-term goal','运行计划':'Schedule','执行一轮':'Run once','周期续跑':'Recurring','任务预算':'Task budget','运行时间预算（分钟）':'Runtime budget (minutes)','生成长期任务草稿':'Create campaign draft','Campaign 运行看板':'Campaign dashboard','批准并启动':'Approve and start','立即调度一项':'Dispatch one now','暂停':'Pause','经营结果中心':'Business Outcome Center','业务平台结果':'Business application outcomes','只展示已接入数据源的真实快照；过期或覆盖不完整的数据会明确标记。':'Only source-backed snapshots are shown. Stale or incomplete data is explicitly marked.','接入指标数据源':'Connect metric source','注册 Connector':'Register connector','来源类型':'Source type','人工签认快照':'Attested manual snapshot','来源名称':'Source name','有效时长（分钟）':'Freshness window (minutes)','注册数据源':'Register source','提交来源快照':'Submit source snapshot','数据观察时间':'Observed at','来源证据引用':'Evidence reference','提交指标快照':'Submit metric snapshot','刷新结果':'Refresh outcomes'
      ,'自主开发':'Autonomous Development','真实自主开发':'Real autonomous development','目标项目':'Target project','最长运行时间':'Maximum runtime','开发目标':'Development goal','允许修改路径（每行一个）':'Allowed paths (one per line)','验收标准（每行一项）':'Acceptance criteria (one per line)','验证命令（每行一个）':'Validation commands (one per line)','创建真实开发任务':'Create real development job','自主开发队列':'Autonomous development queue','真实 Agent':'Real agents','变更文件':'Changed files','提交澄清':'Submit clarification','批准真实执行':'Approve real execution','批准 Diff 并 Commit':'Approve diff and commit','Worker 在线':'Worker online','Worker 执行中':'Worker busy','Worker 离线':'Worker offline','真实执行中':'Running with real Codex','等待 Diff 审批':'Awaiting diff approval','需要返工':'Needs rework'
      ,'集团驾驶舱':'Group Cockpit','我的工作':'My Work','工作队列':'Work queue','我的待办':'My tasks','Agent 工作':'Agent work','阻塞/待审批':'Blocked / approval','业务单据':'Business record','打开单据 →':'Open record →','战略执行':'Strategy Execution','人力资源':'Human Resources','财务管理':'Finance','增长销售':'Growth & Sales','制造 ERP':'Manufacturing ERP','智慧园区':'Smart Park','视频工厂':'Video Factory','业务应用':'Business application','业务对象':'Business objects','首条智能流程':'First intelligent workflow','Runtime 关闭时':'With Runtime off','智能驱动':'Intelligent operation','新建业务记录':'Create business record','业务类型':'Record type','业务编号':'Record number','标题':'Title','保存业务记录':'Save business record','业务台账':'Business records','传统业务记录与状态。智能工作始终关联到这里的正式单据。':'Conventional business records and states. Intelligent work always references an authoritative record.','负责人':'Owner','分配给我':'Assign to me','委派智能助手':'Delegate to assistant','智能流程':'Intelligent workflow','查看我的工作 →':'View My Work →'
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
  const executionHref = routeHref("/actions", data.active_project_id);
  const portfolio = domainCenterSummary();
  const portfolioCards = portfolio.applications.map((application) => {const app=getEnterpriseApplication(application.id),path=app?.path??(application.id==="graphic-design-studio"?"/design":"/domains");return `<a class="portfolio-card" data-portfolio-app="${escapeHtml(application.id)}" href="${routeHref(path, data.active_project_id)}"><div class="portfolio-card-head"><span class="portfolio-icon">${escapeHtml(application.icon)}</span><span class="portfolio-state pending" data-portfolio-state>读取业务信号</span></div><h3>${escapeHtml(application.name)}</h3><p>${escapeHtml(application.summary)}</p><div class="portfolio-signal-grid"><span><strong data-portfolio-campaigns>0</strong> 运行计划</span><span><strong data-portfolio-actions>0</strong> 人工断点</span><span><strong data-portfolio-exceptions>0</strong> 业务异常</span><span><strong data-portfolio-professional>0</strong> 专业结果</span></div><div class="portfolio-entry-footer"><span data-portfolio-result>业务结果待接入</span><strong>进入业务应用 →</strong></div></a>`;}).join("");
  return `<section class="command-center-hero">
    <div class="command-orb command-orb-a"></div><div class="command-orb command-orb-b"></div>
    <div class="command-center-copy"><span class="eyebrow">自主工作区</span><h2>想让 Studio 完成什么？</h2><p>描述结果，Studio 会负责规划、调度、执行和报告。</p></div>
    <div class="command-box"><textarea id="command-goal" rows="4" placeholder="描述你想完成的目标、背景和预期结果……"></textarea><div class="command-compose-footer"><div class="suggestion-row"><span>试试</span><button type="button" data-command-suggestion="完善 Runtime 文档">完善 Runtime 文档</button><button type="button" data-command-suggestion="检查项目并生成风险报告">生成项目风险报告</button><button type="button" data-command-suggestion="整理最近运行结果">整理最近运行结果</button></div><button id="command-run" class="primary-action" type="button">开始运行 <span aria-hidden="true">→</span></button></div></div>
  </section>
  <section class="portfolio-cockpit"><div class="section-head"><div><span class="eyebrow">AI Business Portfolio</span><h2>集团业务驾驶舱</h2><p>从集团目标直接进入各独立业务应用，查看当前运行、人工断点、业务异常和专业结果。</p></div><a class="quiet-link" href="${routeHref("/work", data.active_project_id)}">查看跨应用工作 →</a></div><div class="portfolio-grid">${portfolioCards}</div><p class="portfolio-source" id="portfolio-source">正在读取 Campaign、业务记录与专业结果…</p></section>
  <section class="portfolio-cockpit"><div class="section-head"><div><span class="eyebrow">Live Business Operations</span><h2>实时业务运行</h2><p>来自各独立业务应用正式记录的运行概览，可直接下钻，不包含推测指标。</p></div><span id="business-operations-source" class="pill">正在读取事务数据库</span></div><div id="business-operations-grid" class="portfolio-grid"><div class="panel empty-state"><strong>正在汇总业务应用</strong></div></div></section>
  <script>(()=>{const grid=document.getElementById('business-operations-grid'),source=document.getElementById('business-operations-source'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));fetch('/api/business/reports',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('business reports unavailable'))).then(body=>{grid.innerHTML=body.reports.map(report=>'<a class="portfolio-card" href="'+esc(report.application.path)+'"><div class="portfolio-card-head"><span class="portfolio-icon">'+esc(report.totalRecords)+'</span><span class="portfolio-state '+(report.attention?'blocked':'pass')+'">'+(report.attention?esc(report.attention)+' 项需关注':'运行正常')+'</span></div><h3>'+esc(report.application.name)+'</h3><p>'+esc(Object.keys(report.byObjectType).length)+' 类业务对象 · '+esc(report.work.total)+' 项工作</p><div class="simple-list"><div class="simple-row"><span>正式记录</span><strong>'+esc(report.totalRecords)+'</strong></div><div class="simple-row"><span>业务链</span><strong>'+esc(report.businessChains?.total??0)+'</strong></div><div class="simple-row"><span>待审批</span><strong>'+esc(report.pendingApprovals)+'</strong></div><div class="simple-row"><span>Agent 工作</span><strong>'+esc(report.work.agent)+'</strong></div></div></a>').join('')||'<div class="panel empty-state"><strong>尚无可访问业务应用</strong></div>';source.textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{grid.innerHTML='<div class="panel empty-state"><strong>业务数据暂不可用</strong>系统不会推测或伪造数据。</div>';source.textContent='数据源不可用';});})();</script>
  <section class="portfolio-cockpit"><div class="section-head"><div><span class="eyebrow">Professional Outcomes</span><h2>专业业务结果</h2><p>由各平台专业 Skill Runner 对正式业务记录生成；规则通过不等于人工审批完成。</p></div><a class="quiet-link" href="/work#professional-business-results">进入结果中心 →</a></div><div id="cockpit-professional-summary" class="summary-grid"></div><div id="cockpit-professional-results" class="panel"><div class="empty-state"><strong>正在读取专业结果</strong></div></div></section>
  <script>(()=>{const summary=document.getElementById('cockpit-professional-summary'),list=document.getElementById('cockpit-professional-results'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));fetch('/api/business/results?limit=8',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('professional results unavailable'))).then(body=>{summary.innerHTML=[['专业结果',body.total],['规则通过',body.summary.pass],['需人工复核',body.summary.reviewRequired],['证据阻塞',body.summary.blocked]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong></div>').join('');list.innerHTML=body.items.length?'<div class="simple-list">'+body.items.map(item=>'<a class="simple-row" href="'+esc(item.businessObject.href)+'"><div><strong>'+esc(item.applicationName)+' · '+esc(item.businessObject.displayKey)+'</strong><small>'+esc(item.skillId)+' · '+esc(item.runnerId)+'</small></div><div><span class="status-label '+(item.decision==='PASS'?'pass':item.decision==='BLOCKED'?'blocked':'pending')+'">'+esc(item.decision)+'</span><small>'+esc(item.nextAction)+'</small></div></a>').join('')+'</div>':'<div class="empty-state"><strong>尚无专业业务结果</strong>这里只展示持久化的专业 Runner 结果，不使用任务完成数冒充业务成果。</div>';}).catch(()=>{summary.innerHTML='';list.innerHTML='<div class="empty-state"><strong>专业结果暂不可用</strong>系统不会推测或伪造业务结果。</div>';});})();</script>
  <section class="portfolio-cockpit"><div class="section-head"><div><span class="eyebrow">Action Feed</span><h2>行动提醒</h2><p>由正式异常和待审批事实生成；没有虚构“未读”状态。</p></div><a class="quiet-link" href="/work">进入我的工作 →</a></div><div id="business-notification-summary" class="summary-grid"></div><div id="business-notification-list" class="panel"><div class="empty-state"><strong>正在读取行动提醒</strong></div></div></section>
  <script>(()=>{const summary=document.getElementById('business-notification-summary'),list=document.getElementById('business-notification-list'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));fetch('/api/business/notifications',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('notifications unavailable'))).then(body=>{summary.innerHTML=[['全部提醒',body.summary.total],['关键异常',body.summary.critical],['需要审批',body.summary.actionRequired]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong></div>').join('');list.innerHTML=body.items.length?'<div class="simple-list">'+body.items.slice(0,8).map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.message)+'</small></div><span class="status-label '+(item.severity==='CRITICAL'?'blocked':'pending')+'">'+esc(item.severity)+'</span></a>').join('')+'</div>':'<div class="empty-state"><strong>当前没有需要行动的业务事项</strong></div>';}).catch(()=>{summary.innerHTML='';list.innerHTML='<div class="empty-state"><strong>行动提醒暂不可用</strong>系统不会推测提醒。</div>';});})();</script>
  <section class="portfolio-cockpit"><div class="section-head"><div><span class="eyebrow">Business Search</span><h2>查找业务记录</h2><p>在当前角色可访问的平台中查找正式编号、标题或负责人。</p></div><span id="business-search-source" class="pill">事务业务数据</span></div><div class="panel"><div class="form-grid"><div><label for="business-search-query">编号、标题或负责人</label><input id="business-search-query" placeholder="例如：费用单、客户名称、业务编号"></div><div><label for="business-search-status">业务状态</label><select id="business-search-status"><option value="">全部状态</option><option>BLOCKED</option><option>WAITING_APPROVAL</option><option>ACTIVE</option><option>OPEN</option><option>COMPLETED</option><option>REJECTED</option><option>OVERDUE</option><option>FAULT</option></select></div></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button id="business-search-run" class="primary" type="button">查找记录</button></div></div><div id="business-search-results" class="panel"><div class="empty-state"><strong>输入条件查找正式业务记录</strong></div></div></section>
  <script>(()=>{const query=document.getElementById('business-search-query'),status=document.getElementById('business-search-status'),button=document.getElementById('business-search-run'),results=document.getElementById('business-search-results'),source=document.getElementById('business-search-source'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function search(){button.disabled=true;try{const params=new URLSearchParams({q:query.value,status:status.value,limit:'20'}),response=await fetch('/api/business/search?'+params,{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.reason||'搜索不可用');source.textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+body.pagination.total+' 条';results.innerHTML=body.items.length?'<table><thead><tr><th>业务平台</th><th>编号</th><th>业务记录</th><th>负责人</th><th>状态</th><th></th></tr></thead><tbody>'+body.items.map(item=>'<tr><td>'+esc(item.applicationName)+'</td><td>'+esc(item.displayKey)+'</td><td><strong>'+esc(item.title)+'</strong><small>'+esc(item.objectTypeName)+'</small></td><td>'+esc(item.ownerId)+'</td><td><span class="status-label local">'+esc(item.status)+'</span></td><td><a class="quiet-link" href="'+esc(item.href)+'">打开记录 →</a></td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>没有匹配的业务记录</strong>请调整关键词或状态。</div>';}catch(error){results.innerHTML='<div class="empty-state"><strong>'+esc(error.message)+'</strong></div>';}finally{button.disabled=false;}}button.onclick=search;query.addEventListener('keydown',event=>{if(event.key==='Enter')search();});})();</script>
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
  <script>(()=>{const input=document.getElementById('command-goal'),run=document.getElementById('command-run');const openRun=()=>{const goal=input.value.trim();if(!goal){input.focus();return;}const url=new URL('${executionHref}',location.origin);url.searchParams.set('goal',goal);location.href=url.pathname+url.search;};run.addEventListener('click',openRun);input.addEventListener('keydown',event=>{if(event.key==='Enter'&&(event.metaKey||event.ctrlKey)){event.preventDefault();openRun();}});document.querySelectorAll('[data-command-suggestion]').forEach(button=>button.addEventListener('click',()=>{input.value=button.dataset.commandSuggestion;input.focus();}));const source=document.getElementById('portfolio-source'),set=(card,selector,value)=>{const node=card.querySelector(selector);if(node)node.textContent=value;};fetch('/api/portfolio/dashboard',{cache:'no-store'}).then(response=>{if(!response.ok)throw new Error('portfolio unavailable');return response.json();}).then(body=>{for(const app of body.applications){const card=document.querySelector('[data-portfolio-app="'+CSS.escape(app.id)+'"]');if(!card)continue;const operations=app.operations??{},state=card.querySelector('[data-portfolio-state]'),signal=operations.signal??'IDLE',labels={ACTION_REQUIRED:'需要处理',RUNNING:'正在运行',RESULT_AVAILABLE:'有新结果',IDLE:'暂无运行任务'},classes={ACTION_REQUIRED:'blocked',RUNNING:'active',RESULT_AVAILABLE:'pass',IDLE:'planned'};card.dataset.signal=signal;state.textContent=labels[signal]??labels.IDLE;state.className='portfolio-state '+(classes[signal]??classes.IDLE);set(card,'[data-portfolio-campaigns]',operations.activeCampaigns??operations.campaigns??0);set(card,'[data-portfolio-actions]',operations.humanActions??0);set(card,'[data-portfolio-exceptions]',operations.exceptions??0);set(card,'[data-portfolio-professional]',operations.professional?.total??0);const outcome=app.businessResults,primary=outcome.latest?.values?.[0],result=card.querySelector('[data-portfolio-result]');result.textContent=outcome.status==='VERIFIED'&&primary?primary.name+' '+primary.value+(primary.unit==='PERCENT'?'%':''):operations.professional?.reviewRequired?'专业结果待复核':operations.professional?.blocked?'专业结果被阻塞':operations.professional?.pass?'专业检查已通过':operations.humanActions?'有业务事项等待人工批准':operations.exceptions?'存在需要处理的业务异常':'尚无可验证业务结果';card.title=(operations.initiatives??0)+' 项当前业务计划 · 点击进入业务应用';}source.textContent='数据源：Autonomous Portfolio + 业务事务记录 + 专业 Runner · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{source.textContent='业务运行数据暂不可用；未展示的数据不会被推测或伪造。';});})();</script>`;
}

function pageWorkstation(data) {
  return `${actionWorkbench(data, "个人 AI 工作站")}
  <section class="workstation-field-guide" aria-label="工作站能力">
    <span>战略</span><span>业务</span><span>销售</span><span>人力</span><span>软件开发</span><span>平面设计</span><span>视频</span><span>工程 CAD</span>
  </section>`;
}

function pageOutcomes() {
  return `<section class="product-hero"><div><span class="eyebrow">Business Outcomes</span><h2>经营结果中心</h2><p>把战略、人员、财务、增长、制造和园区等业务系统的权威指标接入统一驾驶舱。任务完成度与业务结果严格分开，所有数字保留来源、观察时间和质量状态。</p></div><button id="outcome-refresh" class="secondary" type="button">刷新结果</button></section>
  <section><div class="section-head"><div><h2>业务平台结果</h2><p class="help">只展示已接入数据源的真实快照；过期或覆盖不完整的数据会明确标记。</p></div><span id="outcome-summary" class="pill">正在读取</span></div><div id="outcome-cards" class="portfolio-grid"></div></section>
  <section class="panel"><div class="section-head"><div><h2>权威业务数据连接器</h2><p class="help">将财务、HR、制造、园区与销售来源映射到现有业务对象；记录同步批次、数据新鲜度和失败证据。</p></div><span id="business-connector-backend" class="pill">正在检查</span></div><div id="business-connector-list" class="simple-list"><div class="simple-row"><span>数据来源</span><strong>正在读取</strong></div></div><p class="help">连接器配置与数据写入需要业务管理员权限；页面不会显示 Credential Reference 的真实值。</p></section>
  <details class="advanced-section"><summary>接入指标数据源</summary><div class="advanced-body">
    <section class="kanban-grid"><div class="panel"><h2>1. 注册 Connector</h2><div class="form-grid"><div><label for="outcome-application">业务平台</label><select id="outcome-application"></select></div><div><label for="outcome-source-type">来源类型</label><select id="outcome-source-type"><option value="MANUAL_ATTESTED">人工签认快照</option><option value="API_SNAPSHOT">API 快照</option><option value="SQL_READ_MODEL">只读数据模型</option><option value="WEBHOOK">Webhook</option></select></div><div><label for="outcome-source-label">来源名称</label><input id="outcome-source-label" placeholder="例如：集团财务月结报表"></div><div><label for="outcome-credential-ref">Credential Reference</label><input id="outcome-credential-ref" placeholder="非人工来源必须填写引用 ID"></div><div><label for="outcome-freshness">有效时长（分钟）</label><input id="outcome-freshness" type="number" min="1" value="1440"></div></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button id="outcome-register" class="primary" type="button">注册数据源</button></div></div>
    <div class="panel"><h2>2. 提交来源快照</h2><div class="form-grid"><div><label for="outcome-connector">Connector</label><select id="outcome-connector"></select></div><div><label for="outcome-observed-at">数据观察时间</label><input id="outcome-observed-at" type="datetime-local"></div><div style="grid-column:1/-1"><label for="outcome-evidence">来源证据引用</label><input id="outcome-evidence" placeholder="例如：report://finance/2026-07-close"></div></div><div id="outcome-metric-inputs" class="form-grid" style="margin-top:12px"></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button id="outcome-ingest" class="primary" type="button">提交指标快照</button></div></div></section>
    <p id="outcome-message" class="help">Credential 只允许填写引用 ID。不得输入 Token、密码、Key 或其他明文凭据。</p>
  </div></details>
  <script>(()=>{let catalog=[],connectors=[];const cards=document.getElementById('outcome-cards'),summary=document.getElementById('outcome-summary'),message=document.getElementById('outcome-message'),appSelect=document.getElementById('outcome-application'),connectorSelect=document.getElementById('outcome-connector'),metricBox=document.getElementById('outcome-metric-inputs');
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const unit=u=>({PERCENT:'%',COUNT:'',CURRENCY:' 元',DAYS:' 天',RATIO:''}[u]??'');
  const call=async(url,options={})=>{const response=await fetch(url,{headers:{'content-type':'application/json'},...options}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||'请求失败');return body;};
  const renderMetrics=()=>{const connector=connectors.find(c=>c.id===connectorSelect.value),contract=catalog.find(c=>c.applicationId===connector?.applicationId);metricBox.innerHTML=(contract?.metrics||[]).map(m=>'<div><label for="metric-'+esc(m.id)+'">'+esc(m.name)+'（'+esc(m.unit)+'）</label><input id="metric-'+esc(m.id)+'" data-metric-id="'+esc(m.id)+'" type="number" step="any" min="0" placeholder="输入来源值"></div>').join('');};
  const load=async()=>{const [dashboard,meta]=await Promise.all([call('/api/outcomes/dashboard'),call('/api/outcomes/catalog')]);catalog=meta.contracts||[];connectors=meta.connectors||[];appSelect.innerHTML=catalog.map(c=>'<option value="'+esc(c.applicationId)+'">'+esc(c.applicationName)+'</option>').join('');connectorSelect.innerHTML=connectors.length?connectors.map(c=>'<option value="'+esc(c.id)+'">'+esc(c.sourceLabel)+' · '+esc(c.applicationId)+'</option>').join(''):'<option value="">暂无 Connector</option>';renderMetrics();const verified=dashboard.applications.filter(a=>a.status==='VERIFIED').length;summary.textContent=verified+' / '+dashboard.applications.length+' 已验证';cards.innerHTML=dashboard.applications.map(a=>{const latest=a.latest,values=latest?.values||[];return '<article class="portfolio-card"><div class="portfolio-card-head"><span class="portfolio-icon">KPI</span><span class="portfolio-state '+(a.status==='VERIFIED'?'pass':a.status==='STALE'||a.status==='QUALITY_WARNING'?'blocked':'planned')+'">'+esc(a.status)+'</span></div><h3>'+esc(a.applicationName)+'</h3><p>'+(latest?'来源：'+esc(latest.sourceLabel)+' · '+new Date(latest.observedAt).toLocaleString():'尚无通过校验的来源快照')+'</p><div class="simple-list" style="margin-top:12px">'+(values.length?values.map(v=>'<div class="simple-row"><span>'+esc(v.name)+'</span><strong>'+esc(v.value)+unit(v.unit)+'</strong></div>').join(''):'<div class="simple-row"><span>指标合同</span><strong>'+a.metrics.length+' 项</strong></div>')+'</div></article>';}).join('');const backend=document.getElementById('business-connector-backend'),list=document.getElementById('business-connector-list');try{const source=await call('/api/business/data-connectors');backend.textContent=source.backend==='POSTGRESQL'?'PostgreSQL · 受治理':'未启用';backend.className='pill '+(source.backend==='POSTGRESQL'?'pass':'');list.innerHTML=source.connectors.length?source.connectors.map(c=>{const stale=!c.lastSuccessAt||Date.now()-new Date(c.lastSuccessAt).getTime()>c.freshnessSeconds*1000;return '<div class="simple-row"><span><strong>'+esc(c.sourceSystem)+'</strong><small>'+esc(c.applicationId)+' · '+esc(c.connectorType)+' · '+esc((c.allowedObjectTypes||[]).join('、'))+'</small></span><strong class="'+(c.status==='ACTIVE'&&!stale?'safe':'warn')+'">'+esc(c.status==='ACTIVE'?(stale?'数据待更新':'可信可用'):c.status)+'</strong></div>';}).join(''):'<div class="simple-row"><span>尚未接入权威业务数据源</span><strong>0</strong></div>';}catch(error){backend.textContent='连接器不可用';list.innerHTML='<div class="simple-row"><span>'+esc(error.message)+'</span><strong>需检查</strong></div>';}};
  document.getElementById('outcome-register').addEventListener('click',async()=>{try{await call('/api/outcomes/connectors',{method:'POST',body:JSON.stringify({applicationId:appSelect.value,sourceType:document.getElementById('outcome-source-type').value,sourceLabel:document.getElementById('outcome-source-label').value,credentialReferenceId:document.getElementById('outcome-credential-ref').value,freshnessMinutes:Number(document.getElementById('outcome-freshness').value)})});message.textContent='Connector 已注册，可以提交第一份来源快照。';await load();}catch(error){message.textContent=error.message;}});
  document.getElementById('outcome-ingest').addEventListener('click',async()=>{try{const values=[...document.querySelectorAll('[data-metric-id]')].filter(input=>input.value!=='').map(input=>({metricId:input.dataset.metricId,value:Number(input.value)}));const observed=document.getElementById('outcome-observed-at').value;await call('/api/outcomes/snapshots',{method:'POST',body:JSON.stringify({connectorId:connectorSelect.value,idempotencyKey:connectorSelect.value+':'+observed,evidenceRef:document.getElementById('outcome-evidence').value,observedAt:new Date(observed).toISOString(),values})});message.textContent='快照已校验并写入经营结果中心。';await load();}catch(error){message.textContent=error.message;}});connectorSelect.addEventListener('change',renderMetrics);document.getElementById('outcome-refresh').addEventListener('click',load);document.getElementById('outcome-observed-at').value=new Date(Date.now()-new Date().getTimezoneOffset()*60000).toISOString().slice(0,16);load().catch(error=>{message.textContent=error.message;});})();</script>`;
}

function pagePortfolio(data) {
  const catalog = domainCenterSummary();
  const catalogJson = JSON.stringify(catalog.applications.map((application) => ({ id: application.id, name: application.name, domainCount: application.domains.length }))).replaceAll("<", "\\u003c");
  const projectOptions = (data.project_router.projects ?? []).filter((project) => project.connection_status === "CONNECTED").map((project) => `<option value="${escapeHtml(project.project_id)}">${escapeHtml(project.project_name ?? project.project_id)}</option>`).join("");
  const applicationOptions = catalog.applications.map((application) => `<option value="${escapeHtml(application.id)}">${escapeHtml(application.name)} · ${application.domains.length} 个领域</option>`).join("");
  return `<section class="product-hero"><div><span class="eyebrow">Autonomous Portfolio</span><h2>集团长期任务编排</h2><p>以业务平台为边界，把长期目标分解为领域 Initiative，并为每个阶段绑定真实 Skill、Agent 与在线 Runner。所有执行继续进入同一持久化 Kernel。</p></div><span class="status-label pass">● Resident scheduler</span></section>
  <section class="panel"><div class="section-head"><div><h2>新建 Campaign</h2><p class="help">创建后保持草稿；授权人批准才会进入常驻调度。默认使用 CONTROLLED_STUB，不会自动启用真实 Codex。</p></div><span class="pill">预算先行</span></div>
    <div class="form-grid">
      <div><label for="portfolio-application">业务平台（可多选，选择顺序形成依赖链）</label><select id="portfolio-application" multiple size="6">${applicationOptions}</select></div>
      <div><label for="portfolio-project">执行项目</label><select id="portfolio-project">${projectOptions}</select></div>
      <div style="grid-column:1/-1"><label for="portfolio-goal">长期目标</label><textarea id="portfolio-goal" rows="3" placeholder="例如：在未来四周完善智慧园区全部核心业务闭环并形成每周验收报告"></textarea></div>
      <div><label for="portfolio-mode">运行计划</label><select id="portfolio-mode"><option value="ONCE">执行一轮</option><option value="RECURRING">周期续跑</option></select></div>
      <div><label for="portfolio-interval">续跑间隔（分钟）</label><input id="portfolio-interval" type="number" min="1" value="1440"></div>
      <div><label for="portfolio-cycles">最多周期</label><input id="portfolio-cycles" type="number" min="1" max="52" value="4"></div>
      <div><label for="portfolio-tasks">任务预算</label><input id="portfolio-tasks" type="number" min="1" value="100"></div>
      <div><label for="portfolio-tokens">Token 预留上限</label><input id="portfolio-tokens" type="number" min="1" value="500000"></div>
      <div><label for="portfolio-runtime">运行时间预算（分钟）</label><input id="portfolio-runtime" type="number" min="1" value="600"></div>
    </div>
    <div id="portfolio-plan-preview" class="panel" style="display:none;margin-top:14px"></div><div class="button-row" style="justify-content:space-between;margin-top:14px"><p id="portfolio-message" class="help">先由规则 Planner 生成可审查草案；不会使用 LLM，也不会自动批准执行。</p><div class="button-row"><button id="portfolio-plan" class="secondary" type="button">智能拆解目标</button><button id="portfolio-create" class="primary-action" type="button">确认并生成草稿</button></div></div>
  </section>
  <section><div class="section-head"><div><h2>Campaign 运行看板</h2><p class="help">草稿、预算、周期、领域进度和 Kernel 执行证据</p></div><button id="portfolio-refresh" class="secondary" type="button">刷新</button></div><div id="portfolio-campaigns"><div class="empty-state"><strong>正在读取长期任务</strong></div></div></section>
  <details class="advanced-section"><summary>执行模型与安全边界</summary><div class="advanced-body"><div class="domain-flow"><span>Campaign</span><i>→</i><span>业务平台</span><i>→</i><span>领域 Initiative</span><i>→</i><span>Skill / Agent</span><i>→</i><span>Kernel</span><i>→</i><span>报告</span></div><p class="help">常驻调度器每 30 秒检查已批准 Campaign。文件锁防止多 Tick 重复派发；固定 Session Key 让进程恢复后仍保持幂等。预算不足、缺少 Agent 或缺少在线 Runner 时进入 BLOCKED，不扩大权限。</p></div></details>
  <script>
  (()=>{const catalog=${catalogJson},box=document.getElementById('portfolio-campaigns'),message=document.getElementById('portfolio-message'),preview=document.getElementById('portfolio-plan-preview');let plannerPlan=null;
  const esc=(v)=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const call=async(url,options={})=>{const response=await fetch(url,{headers:{'content-type':'application/json'},...options});const body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||'请求失败');return body;};
  const labels={DRAFT:'草稿',ACTIVE:'运行中',WAITING_NEXT_CYCLE:'等待下轮',SUCCEEDED:'已完成',COMPLETED_WITH_BLOCKERS:'完成但有阻塞',BUDGET_BLOCKED:'预算阻塞',PAUSED:'已暂停'};
  const render=(campaigns)=>{if(!campaigns.length){box.innerHTML='<div class="panel empty-state"><strong>还没有长期任务</strong>从上方选择一个或多个业务平台并创建第一项 Campaign。</div>';return;}box.innerHTML=campaigns.map(c=>{const current=c.initiatives.filter(i=>i.cycle===c.schedule.currentCycle),done=current.filter(i=>i.status==='SUCCEEDED').length,apps=(c.workstreams||[]).map(w=>w.applicationName).join(' → ')||c.applicationName,proposals=(c.businessObjectProposals||[]).map(p=>p.record?'<a class="simple-row" href="'+esc(p.record.href)+'"><div><strong>'+esc(p.applicationName)+' · '+esc(p.record.displayKey)+'</strong><small>'+esc(p.record.title)+'</small></div><span class="status-label pass">已创建</span></a>':p.status==='UNSUPPORTED'?'<div class="simple-row"><div><strong>'+esc(p.applicationName)+' · '+esc(p.initiativeDomainId)+'</strong><small>该领域尚无兼容的传统业务对象 Schema</small></div><span class="status-label blocked">暂不可执行</span></div>':'<details class="advanced-section"><summary>'+esc(p.applicationName)+' · 待创建'+esc(p.objectTypeName)+'</summary><div class="advanced-body"><label>标题</label><input data-proposal-title value="'+esc(p.title)+'"><div class="form-grid">'+p.requiredFields.map(f=>'<div><label>'+esc(f.label)+'</label>'+(f.options?'<select data-proposal-field="'+esc(f.key)+'">'+f.options.map(o=>'<option value="'+esc(o)+'">'+esc(o)+'</option>').join('')+'</select>':'<input data-proposal-field="'+esc(f.key)+'" type="'+(f.type==='number'?'number':f.type==='date'?'date':'text')+'"'+(f.min!==null?' min="'+esc(f.min)+'"':'')+(f.max!==null?' max="'+esc(f.max)+'"':'')+'>')+'</div>').join('')+'</div><div class="button-row" style="justify-content:flex-end"><button data-materialize-proposal data-campaign="'+esc(c.id)+'" data-proposal="'+esc(p.id)+'">确认创建正式记录</button></div></div></details>').join('');return '<article class="panel" style="margin-bottom:14px"><div class="section-head"><div><span class="eyebrow">'+esc(apps)+' · Cycle '+esc(c.schedule.currentCycle+1)+'</span><h2>'+esc(c.goal)+'</h2><p class="help">'+esc(c.id)+' · '+esc(c.projectId)+' · Checkpoint '+esc((c.checkpoints||[]).length)+'</p></div><span class="status-label '+(c.status==='SUCCEEDED'?'pass':c.status.includes('BLOCK')?'blocked':c.status==='ACTIVE'?'local':'pending')+'">● '+esc(labels[c.status]||c.status)+'</span></div><div class="grid"><div class="metric"><span>领域进度</span><strong>'+done+' / '+current.length+'</strong></div><div class="metric"><span>任务预算</span><strong>'+c.usage.reservedTasks+' / '+c.budget.maxTasks+'</strong></div><div class="metric"><span>Token 预留</span><strong>'+c.usage.reservedTokenEstimate.toLocaleString()+' / '+c.budget.maxTokenEstimate.toLocaleString()+'</strong></div><div class="metric"><span>Runtime 执行</span><strong>'+c.usage.actualRuntimeExecutions+'</strong></div></div><section style="margin-top:14px"><h3>正式业务对象提案</h3><p class="help">补齐必填字段后才写入各自业务平台；Planner 不生成业务事实。</p>'+proposals+'</section><div class="simple-list" style="margin-top:12px">'+current.map(i=>'<div class="simple-row"><div><strong>'+esc(i.domainName)+'</strong><small>'+esc(i.applicationId)+' · '+esc(i.skillPack.join(' · '))+(i.dependsOn?.length?' · 上游 '+esc(i.dependsOn.length):'')+'</small></div><div><span class="status-label '+(i.status==='SUCCEEDED'?'pass':i.status==='BLOCKED'||i.status==='FAILED'?'blocked':i.status==='PENDING'?'pending':'local')+'">'+esc(i.status)+'</span><small>'+esc(i.agentAssignments.map(a=>a.agentId||'缺少 Agent').join(' / '))+'</small></div></div>').join('')+'</div><div class="button-row" style="justify-content:flex-end;margin-top:12px">'+(current.some(i=>i.status==='BLOCKED'&&i.report?.humanApprovalRequired)?'<button class="secondary" data-portfolio-action="reconcile" data-id="'+esc(c.id)+'">复核审批并续跑</button>':'')+(c.status==='DRAFT'||c.status==='PAUSED'?'<button class="primary" data-portfolio-action="activate" data-id="'+esc(c.id)+'">'+(c.status==='PAUSED'?'恢复运行':'批准并启动')+'</button>':'')+(c.status==='ACTIVE'||c.status==='WAITING_NEXT_CYCLE'?'<button class="secondary" data-portfolio-action="tick" data-id="'+esc(c.id)+'">立即调度一项</button><button class="danger" data-portfolio-action="pause" data-id="'+esc(c.id)+'">暂停</button>':'')+'</div></article>';}).join('');};
  const refresh=async()=>{try{const body=await call('/api/portfolio/campaigns');render(body.campaigns||[]);}catch(error){message.textContent=error.message;}};
  document.getElementById('portfolio-goal').addEventListener('input',()=>{plannerPlan=null;preview.style.display='none';});document.getElementById('portfolio-plan').addEventListener('click',async()=>{const goal=document.getElementById('portfolio-goal').value.trim();if(!goal){message.textContent='请先填写长期目标。';return;}try{plannerPlan=await call('/api/portfolio/plan',{method:'POST',body:JSON.stringify({goal})});if(plannerPlan.status!=='REVIEW_REQUIRED'){preview.style.display='block';preview.innerHTML='<strong>'+esc(plannerPlan.status)+'</strong><p>'+esc(plannerPlan.clarification?.message||plannerPlan.blockedReasons?.join(' · '))+'</p>';plannerPlan=null;return;}const select=document.getElementById('portfolio-application');[...select.options].forEach(option=>option.selected=plannerPlan.workstreams.some(item=>item.applicationId===option.value));preview.style.display='block';preview.innerHTML='<div class="section-head"><div><strong>Planner 草案</strong><p class="help">'+esc(plannerPlan.dependencyMode)+' · 未使用 LLM · '+esc(plannerPlan.planHash.slice(0,12))+'</p></div><span class="status-label pending">等待人工确认</span></div><div class="simple-list">'+plannerPlan.workstreams.map(item=>'<div class="simple-row"><div><strong>'+esc(item.applicationName)+'</strong><small>'+esc(item.domainNames.join(' · '))+'</small></div><small>'+(item.dependsOn.length?'依赖 '+esc(item.dependsOn.join(' / ')):'可并行启动')+'</small></div>').join('')+'</div>';message.textContent='请检查平台、领域和依赖；确认后只会创建待批准 Campaign。';}catch(error){message.textContent=error.message;}});
  document.getElementById('portfolio-create').addEventListener('click',async()=>{const button=document.getElementById('portfolio-create'),selected=[...document.getElementById('portfolio-application').selectedOptions].map(option=>option.value),planned=plannerPlan?.goal===document.getElementById('portfolio-goal').value.trim(),workstreams=planned?plannerPlan.workstreams.map(item=>({applicationId:item.applicationId,domainIds:item.domainIds,dependsOn:item.dependsOn})):selected.map((applicationId,index)=>({applicationId,dependsOn:index?[selected[index-1]]:[]})),payload={workstreams,plannerPlan:planned?plannerPlan:null,projectId:document.getElementById('portfolio-project').value,goal:document.getElementById('portfolio-goal').value.trim(),scheduleMode:document.getElementById('portfolio-mode').value,intervalMinutes:Number(document.getElementById('portfolio-interval').value),maxCycles:Number(document.getElementById('portfolio-cycles').value),maxTasks:Number(document.getElementById('portfolio-tasks').value),maxTokenEstimate:Number(document.getElementById('portfolio-tokens').value),maxRuntimeMinutes:Number(document.getElementById('portfolio-runtime').value)};if(!payload.goal){message.textContent='请先填写长期目标。';return;}if(!workstreams.length){message.textContent='请至少选择一个业务平台。';return;}button.disabled=true;try{await call('/api/portfolio/campaigns',{method:'POST',body:JSON.stringify(payload)});message.textContent='跨平台草稿已生成。请检查依赖、Skill、Agent 与预算后批准。';plannerPlan=null;preview.style.display='none';await refresh();}catch(error){message.textContent=error.message;}finally{button.disabled=false;}});
  box.addEventListener('click',async(event)=>{const proposalButton=event.target.closest('[data-materialize-proposal]');if(proposalButton){const form=proposalButton.closest('details'),fields={};form.querySelectorAll('[data-proposal-field]').forEach(input=>fields[input.dataset.proposalField]=input.value);if(!confirm('确认后将通过该业务平台的正式事务接口创建记录，是否继续？'))return;proposalButton.disabled=true;try{await call('/api/portfolio/campaigns/'+encodeURIComponent(proposalButton.dataset.campaign)+'/proposals/'+encodeURIComponent(proposalButton.dataset.proposal)+'/materialize',{method:'POST',body:JSON.stringify({title:form.querySelector('[data-proposal-title]').value,fields})});message.textContent='正式业务记录已创建并关联到 Campaign。';await refresh();}catch(error){message.textContent=error.message;proposalButton.disabled=false;}return;}const button=event.target.closest('[data-portfolio-action]');if(!button)return;if(button.dataset.portfolioAction==='activate'&&!confirm('批准后常驻调度器将按预算自动派发领域任务，是否继续？'))return;button.disabled=true;try{await call('/api/portfolio/campaigns/'+encodeURIComponent(button.dataset.id)+'/'+button.dataset.portfolioAction,{method:'POST',body:'{}'});await refresh();}catch(error){message.textContent=error.message;button.disabled=false;}});document.getElementById('portfolio-refresh').addEventListener('click',refresh);refresh();})();
  </script>`;
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
  return `<section class="product-hero domain-hero"><div><span class="eyebrow">Business Applications</span><h2>应用与业务领域</h2><p>统一 AI 业务驾驶舱承载多个边界清晰的平台。集团管理、增长销售、智慧园区和生产工厂各自独立，通过受控接口协作；所有进展与业务结果统一呈现。</p></div><div class="hero-actions"><a class="primary-link" href="${routeHref("/execution",activeProject)}">新建长期目标</a></div></section>
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

function pageAgentAdmin() {
  return `<style>
    .agent-admin-hero{display:flex;align-items:flex-start;justify-content:space-between;gap:24px;padding:24px 26px;background:var(--surface-2);border:1px solid var(--line);border-radius:8px}
    .agent-admin-hero h1{font-size:28px;margin:5px 0 8px}.agent-admin-hero p{margin:0;color:var(--muted);max-width:720px}.agent-admin-lock{display:flex;align-items:center;gap:8px;color:var(--green);font-weight:700;white-space:nowrap}
    .agent-admin-summary{display:grid;grid-template-columns:repeat(5,minmax(0,1fr));gap:10px;margin:12px 0}.agent-admin-summary .summary-card strong{font-size:24px}
    .agent-admin-toolbar{display:grid;grid-template-columns:minmax(220px,1fr) 180px 180px auto;gap:10px;align-items:end}.agent-admin-toolbar label,.agent-form-grid label{display:grid;gap:6px;color:var(--muted);font-size:12px;font-weight:700}.agent-admin-toolbar input,.agent-admin-toolbar select,.agent-form-grid input,.agent-form-grid select{width:100%;min-height:42px}
    .agent-admin-table-wrap{overflow:auto}.agent-admin-table{min-width:1050px}.agent-admin-table td{vertical-align:middle}.agent-name{display:grid;gap:3px}.agent-name strong{font-size:14px}.agent-name span{font-size:11px;color:var(--muted)}.agent-skills{display:flex;gap:5px;flex-wrap:wrap}.agent-skill{font-size:10px;color:#b8c5d6;border:1px solid var(--line);padding:3px 6px;border-radius:999px}.agent-health{display:grid;gap:4px}.agent-health span{font-size:11px;color:var(--muted)}
    .agent-switch{display:inline-flex;align-items:center;gap:7px}.agent-switch-dot{width:9px;height:9px;border-radius:50%;background:var(--muted)}.agent-switch-dot.on{background:var(--green);box-shadow:0 0 0 4px rgba(50,213,131,.12)}
    .agent-admin-dialog{width:min(760px,calc(100vw - 32px));max-height:calc(100vh - 40px);padding:0;border:1px solid #29374a;border-radius:8px;background:#0d141f;color:var(--text);box-shadow:0 24px 80px rgba(0,0,0,.55)}.agent-admin-dialog::backdrop{background:rgba(1,5,10,.72);backdrop-filter:blur(5px)}.agent-dialog-head,.agent-dialog-foot{display:flex;justify-content:space-between;align-items:center;gap:12px;padding:18px 20px;border-bottom:1px solid var(--line)}.agent-dialog-foot{border-top:1px solid var(--line);border-bottom:0}.agent-dialog-body{padding:20px;overflow:auto}.agent-dialog-head h2{margin:0;font-size:20px}.agent-dialog-section{margin-bottom:20px}.agent-dialog-section h3{margin:0 0 10px;font-size:14px}.agent-form-grid{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:12px}.agent-plan-list{display:grid;grid-template-columns:repeat(2,minmax(0,1fr));gap:8px}.agent-plan-option{display:flex!important;grid-template-columns:none!important;align-items:center;gap:8px!important;padding:10px;border:1px solid var(--line);border-radius:6px;color:var(--text)!important}.agent-plan-option input{width:16px!important;min-height:16px!important}.agent-message{min-height:20px;color:var(--muted);font-size:12px}.agent-message.success{color:var(--green)}.agent-message.error{color:var(--red)}
    .agent-audit-list{display:grid;gap:8px}.agent-audit-row{display:grid;grid-template-columns:190px 1fr 160px;gap:12px;padding:10px 0;border-bottom:1px solid var(--line);font-size:12px}.agent-audit-row span{color:var(--muted)}
    @media(max-width:900px){.agent-admin-summary{grid-template-columns:repeat(2,minmax(0,1fr))}.agent-admin-toolbar{grid-template-columns:1fr 1fr}.agent-admin-hero{display:grid}.agent-form-grid{grid-template-columns:1fr}}
  </style>
  <section class="agent-admin-hero"><div><span class="eyebrow">ADMIN CONTROL SURFACE</span><h1>Agent 控制中心</h1><p>统一管理现有 Runtime Adapter 的启停、路由优先级、并发、凭证引用、套餐范围和费用参数。配置只影响控制策略，不保存任何密钥明文。</p></div><div class="agent-admin-lock"><span aria-hidden="true">●</span>仅管理员可见</div></section>
  <div id="agent-summary" class="agent-admin-summary"><div class="summary-card"><span>正在读取</span><strong>—</strong></div></div>
  <section><div class="section-head"><div><h2>Agent 配置</h2><p class="help">认证栏只显示引用是否存在；健康状态来自 Registry 声明和 Worker 映射，不冒充实时模型调用。</p></div><button id="agent-refresh" class="secondary" type="button">刷新</button></div>
    <div class="panel agent-admin-toolbar"><label>搜索<input id="agent-search" type="search" placeholder="Agent、Provider、技能"></label><label>Provider<select id="agent-provider"><option value="">全部 Provider</option></select></label><label>状态<select id="agent-enabled"><option value="">全部状态</option><option value="true">已启用</option><option value="false">已停用</option></select></label><button id="agent-clear" class="secondary" type="button">清除筛选</button></div>
    <div class="panel agent-admin-table-wrap"><table class="agent-admin-table"><thead><tr><th>Agent / Runtime</th><th>调用方式</th><th>认证</th><th>Worker</th><th>调度</th><th>费用</th><th>状态</th><th>操作</th></tr></thead><tbody id="agent-rows"><tr><td colspan="8">正在读取 Agent Registry…</td></tr></tbody></table></div>
  </section>
  <section><div class="section-head"><div><h2>配置审计</h2><p class="help">仅记录操作者、Agent 和变化字段，不记录凭证内容。</p></div></div><div id="agent-audits" class="panel agent-audit-list"><span class="help">暂无配置变更</span></div></section>
  <dialog id="agent-dialog" class="agent-admin-dialog"><form id="agent-form" method="dialog"><div class="agent-dialog-head"><div><span class="eyebrow">AGENT POLICY</span><h2 id="agent-dialog-title">配置 Agent</h2></div><button id="agent-close" class="icon-button" type="button" aria-label="关闭">×</button></div><div class="agent-dialog-body">
    <div class="agent-dialog-section"><h3>运行与调度</h3><div class="agent-form-grid"><label>启用状态<select name="enabled"><option value="true">启用</option><option value="false">停用</option></select></label><label>路由优先级<input name="priority" type="number" min="1" max="100" required></label><label>最大并发任务<input name="max_parallel_tasks" type="number" min="1" max="64" required></label><label>凭证引用<select name="credential_reference_id"></select></label></div></div>
    <div class="agent-dialog-section"><h3>套餐可用范围</h3><div id="agent-plan-options" class="agent-plan-list"></div></div>
    <div class="agent-dialog-section"><h3>费用参数</h3><div class="agent-form-grid"><label>币种<select name="currency"><option>CNY</option><option>USD</option></select></label><label>计费单位<select name="billing_unit"><option value="task">任务</option><option value="request">请求</option><option value="minute">分钟</option><option value="million_tokens">百万 Token</option></select></label><label>单位成本<input name="unit_cost" type="number" min="0" step="0.0001" required></label><label>月度预算<input name="monthly_budget" type="number" min="0" step="0.01" required></label></div></div>
    <p id="agent-message" class="agent-message" role="status" aria-live="polite"></p></div><div class="agent-dialog-foot"><span class="help">保存后写入本地策略覆盖层并生成审计记录。</span><div class="button-row"><button id="agent-cancel" class="secondary" type="button">取消</button><button id="agent-save" class="primary-action" type="submit">保存配置</button></div></div></form></dialog>
  <script>(()=>{const state={data:null,current:null};const esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));const els={summary:document.getElementById('agent-summary'),rows:document.getElementById('agent-rows'),audits:document.getElementById('agent-audits'),search:document.getElementById('agent-search'),provider:document.getElementById('agent-provider'),enabled:document.getElementById('agent-enabled'),dialog:document.getElementById('agent-dialog'),form:document.getElementById('agent-form'),title:document.getElementById('agent-dialog-title'),plans:document.getElementById('agent-plan-options'),message:document.getElementById('agent-message')};const badge=(value,type='local')=>'<span class="status-label '+type+'">'+esc(value)+'</span>';const renderSummary=()=>{const s=state.data.summary,b=s.monthly_budget_by_currency??{};els.summary.innerHTML=[['Agent 总数',s.total],['已启用',s.enabled],['凭证引用就绪',s.credential_ready],['Worker 可用',s.worker_ready],['月度预算','¥ '+Number(b.CNY??0).toLocaleString('zh-CN')+' / $ '+Number(b.USD??0).toLocaleString('en-US')]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong></div>').join('');};const filtered=()=>state.data.agents.filter(agent=>{const q=els.search.value.trim().toLowerCase();return(!q||[agent.adapter_id,agent.runtime_id,agent.provider,...agent.supported_skills].join(' ').toLowerCase().includes(q))&&(!els.provider.value||agent.provider===els.provider.value)&&(!els.enabled.value||String(agent.enabled)===els.enabled.value);});const renderRows=()=>{const agents=filtered();els.rows.innerHTML=agents.length?agents.map(agent=>'<tr><td><div class="agent-name"><strong>'+esc(agent.adapter_id)+'</strong><span>'+esc(agent.provider)+' · '+esc(agent.runtime_id)+'</span><div class="agent-skills">'+agent.supported_skills.slice(0,3).map(skill=>'<span class="agent-skill">'+esc(skill)+'</span>').join('')+'</div></div></td><td>'+esc(agent.invoke_mode)+'</td><td><div class="agent-health">'+badge(agent.credential_state,agent.credential_state==='REFERENCE_MISSING'?'blocked':'pass')+'<span>'+esc(agent.credential_reference?.credential_id??'无需引用')+'</span></div></td><td><div class="agent-health"><strong>'+agent.workers.filter(worker=>worker.status==='available').length+' / '+agent.workers.length+'</strong><span>可用 / 已映射</span></div></td><td><div class="agent-health"><strong>P'+esc(agent.priority)+' · '+esc(agent.max_parallel_tasks)+' 并发</strong><span>'+agent.allowed_plan_ids.length+' 个套餐</span></div></td><td><div class="agent-health"><strong>'+esc(agent.currency)+' '+Number(agent.unit_cost).toLocaleString()+' / '+esc(agent.billing_unit)+'</strong><span>月预算 '+Number(agent.monthly_budget).toLocaleString()+'</span></div></td><td><span class="agent-switch"><i class="agent-switch-dot '+(agent.enabled?'on':'')+'"></i>'+(agent.enabled?'启用':'停用')+'</span></td><td><button class="secondary" type="button" data-agent-edit="'+esc(agent.adapter_id)+'">配置</button></td></tr>').join(''):'<tr><td colspan="8">没有匹配的 Agent。</td></tr>';els.rows.querySelectorAll('[data-agent-edit]').forEach(button=>button.onclick=()=>openAgent(button.dataset.agentEdit));};const renderAudits=audits=>{els.audits.innerHTML=audits.length?audits.map(audit=>'<div class="agent-audit-row"><span>'+new Date(audit.occurred_at).toLocaleString('zh-CN')+'</span><strong>'+esc(audit.adapter_id)+' · '+esc((audit.changed_fields??[]).join('、')||'无字段变化')+'</strong><span>'+esc(audit.actor_user_id)+'</span></div>').join(''):'<span class="help">暂无配置变更</span>';};const load=async()=>{els.rows.innerHTML='<tr><td colspan="8">正在读取 Agent Registry…</td></tr>';const [data,audits]=await Promise.all([fetch('/api/admin/agents').then(async response=>{const body=await response.json();if(!response.ok)throw new Error(body.reason||body.status);return body;}),fetch('/api/admin/agents/audit').then(response=>response.json())]);state.data=data;els.provider.innerHTML='<option value="">全部 Provider</option>'+[...new Set(data.agents.map(agent=>agent.provider))].sort().map(provider=>'<option>'+esc(provider)+'</option>').join('');renderSummary();renderRows();renderAudits(audits.audits??[]);};const openAgent=id=>{const agent=state.data.agents.find(item=>item.adapter_id===id);if(!agent)return;state.current=agent;els.title.textContent='配置 '+agent.adapter_id;els.form.elements.enabled.value=String(agent.enabled);els.form.elements.priority.value=agent.priority;els.form.elements.max_parallel_tasks.value=agent.max_parallel_tasks;els.form.elements.currency.value=agent.currency;els.form.elements.billing_unit.value=agent.billing_unit;els.form.elements.unit_cost.value=agent.unit_cost;els.form.elements.monthly_budget.value=agent.monthly_budget;els.form.elements.credential_reference_id.innerHTML='<option value="">不绑定凭证引用</option>'+state.data.credentials.map(ref=>'<option value="'+esc(ref.credential_id)+'">'+esc(ref.credential_id)+' · '+esc(ref.status)+'</option>').join('');els.form.elements.credential_reference_id.value=agent.credential_reference?.credential_id??'';els.plans.innerHTML=state.data.plans.map(plan=>'<label class="agent-plan-option"><input type="checkbox" name="allowed_plan_ids" value="'+esc(plan.plan_id)+'" '+(agent.allowed_plan_ids.includes(plan.plan_id)?'checked':'')+'>'+esc(plan.display_name)+'</label>').join('');els.message.textContent='';els.message.className='agent-message';els.dialog.showModal();};els.form.onsubmit=async event=>{event.preventDefault();const button=document.getElementById('agent-save');button.disabled=true;els.message.textContent='正在保存策略…';try{const payload={enabled:els.form.elements.enabled.value==='true',priority:Number(els.form.elements.priority.value),max_parallel_tasks:Number(els.form.elements.max_parallel_tasks.value),credential_reference_id:els.form.elements.credential_reference_id.value||null,allowed_plan_ids:[...els.form.querySelectorAll('[name=allowed_plan_ids]:checked')].map(input=>input.value),currency:els.form.elements.currency.value,billing_unit:els.form.elements.billing_unit.value,unit_cost:Number(els.form.elements.unit_cost.value),monthly_budget:Number(els.form.elements.monthly_budget.value)};const response=await fetch('/api/admin/agents/'+encodeURIComponent(state.current.adapter_id),{method:'PUT',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status);els.message.textContent='配置已保存并写入审计记录。';els.message.className='agent-message success';await load();setTimeout(()=>els.dialog.close(),450);}catch(error){els.message.textContent=error.message;els.message.className='agent-message error';}finally{button.disabled=false;}};document.getElementById('agent-close').onclick=document.getElementById('agent-cancel').onclick=()=>els.dialog.close();document.getElementById('agent-refresh').onclick=()=>load().catch(error=>{els.rows.innerHTML='<tr><td colspan="8">'+esc(error.message)+'</td></tr>';});document.getElementById('agent-clear').onclick=()=>{els.search.value='';els.provider.value='';els.enabled.value='';renderRows();};[els.search,els.provider,els.enabled].forEach(input=>input.addEventListener(input.tagName==='INPUT'?'input':'change',renderRows));load().catch(error=>{els.rows.innerHTML='<tr><td colspan="8">读取失败：'+esc(error.message)+'</td></tr>';});})();</script>`;
}

function pageCredentials(data) {
  return `<section class="product-hero"><div><span class="eyebrow">Runtime Identity & Usage</span><h2>AI 运行身份与用量</h2><p>统一查看 Codex 与其他智能体的认证方式、Credential Reference 位置和 Runtime 报告的 Token 用量。页面永远不读取或显示密钥值。</p></div><button id="runtime-usage-refresh" class="secondary" type="button">刷新状态</button></section>
  <section class="domain-summary"><div><span>Runtime</span><strong id="runtime-count">—</strong></div><div><span>已安装</span><strong id="runtime-installed">—</strong></div><div><span>运行次数</span><strong id="runtime-runs">—</strong></div><div><span>已报告 Token</span><strong id="runtime-tokens">—</strong></div></section>
  <section class="panel"><div class="section-head"><div><h2>认证方式与位置</h2><p class="help">CLI Session 由对应 CLI 在本机用户会话中管理；API 凭据只显示 Reference ID 与后端位置。</p></div><span class="status-label pass">密钥值不暴露</span></div><div class="table-scroll"><table><thead><tr><th>Runtime</th><th>Provider</th><th>安装</th><th>认证策略</th><th>Credential Reference</th><th>类型</th><th>引用位置</th><th>状态</th></tr></thead><tbody id="runtime-identity-body"><tr><td colspan="8">正在读取…</td></tr></tbody></table></div></section>
  <section class="panel"><div class="section-head"><div><h2>Token 使用统计</h2><p class="help">只汇总 Runtime 明确报告的 Token。未报告的运行单独计数，不进行推算。</p></div><span id="runtime-usage-time" class="pill">—</span></div><div class="table-scroll"><table><thead><tr><th>Runtime</th><th>运行</th><th>已报告</th><th>未报告</th><th>输入</th><th>输出</th><th>缓存</th><th>总计</th><th>完整性</th></tr></thead><tbody id="runtime-usage-body"><tr><td colspan="9">正在读取…</td></tr></tbody></table></div></section>
  <script>(()=>{const q=id=>document.getElementById(id),esc=v=>String(v??'—').replace(/[&<>\"]/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c])),num=v=>v==null?'未报告':Number(v).toLocaleString();async function load(){const r=await fetch('/api/runtime/identity-usage',{cache:'no-store'});if(!r.ok)throw new Error(await r.text());const d=await r.json();q('runtime-count').textContent=d.summary.runtimeCount;q('runtime-installed').textContent=d.summary.installedCount;q('runtime-runs').textContent=d.summary.runCount;q('runtime-tokens').textContent=num(d.summary.totalTokens);q('runtime-usage-time').textContent=new Date(d.generatedAt).toLocaleString();q('runtime-identity-body').innerHTML=d.runtimes.map(x=>'<tr><td>'+esc(x.runtimeId)+'</td><td>'+esc(x.provider)+'</td><td>'+esc(x.installed?'已安装':'未安装')+'</td><td>'+esc(x.credentialPolicy)+'</td><td>'+esc(x.credentialReferenceId)+'</td><td>'+esc(x.credentialReferenceType)+'</td><td>'+esc(x.credentialReferenceLocation)+'</td><td>'+esc(x.credentialStatus)+'</td></tr>').join('');q('runtime-usage-body').innerHTML=d.runtimes.map(x=>'<tr><td>'+esc(x.runtimeId)+'</td><td>'+num(x.usage.runCount)+'</td><td>'+num(x.usage.reportedRunCount)+'</td><td>'+num(x.usage.unreportedRunCount)+'</td><td>'+num(x.usage.inputTokens)+'</td><td>'+num(x.usage.outputTokens)+'</td><td>'+num(x.usage.cachedTokens)+'</td><td>'+num(x.usage.totalTokens)+'</td><td>'+esc(x.usage.status)+'</td></tr>').join('');}q('runtime-usage-refresh').onclick=()=>load().catch(e=>q('runtime-usage-time').textContent=e.message);load().catch(e=>q('runtime-usage-time').textContent=e.message);})();</script>`;
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
  const governedProjects = (data.project_router.projects ?? []).filter((project) => project.connection_status === "CONNECTED" && project.repo_path_display && project.repo_path_display !== "not_connected");
  const governedProjectOptions = governedProjects.map((project) => `<option value="${escapeHtml(project.project_id)}">${escapeHtml(project.project_name ?? project.label ?? project.project_id)}</option>`).join("");
  const operationCards = [
    ["任务与队列", "查看任务生命周期、调度队列和执行证据。", "#advanced-operations", `${actions.length} 项能力`],
    ["Workers", "检查在线 Worker、领取状态与租约健康度。", "/workers", "运行资源"],
    ["Runtime", "查看 Runtime Adapter、限制与执行模式。", "/runtime", "安全边界"],
    ["AI 身份与用量", "查看 Codex/Agent 认证引用、安装状态与 Token 用量。", "/credentials", "认证与成本"],
    ["Approvals", "处理审批、策略和 Activation Readiness。", "/governance", "治理"],
  ];
  return `<section class="operations-hero"><span class="eyebrow">Operations</span><h2>运行管理</h2><p>日常工作无需进入这里。需要诊断任务、Worker、Runtime 或审批时，再打开对应模块。</p></section>
  <section class="panel" id="governed-codex-center">
    <div class="section-head"><div><span class="eyebrow">Governed Codex Worker</span><h2>受控自主开发</h2><p class="help">先生成执行提案，再由授权人批准一次真实 Codex 执行。Task、Attempt、Lease、Fencing 与报告证据完整保留。</p></div><span class="status-label proposal-only">需人工批准</span></div>
    <div class="form-grid">
      <div><label for="governed-project">目标项目</label><select id="governed-project">${governedProjectOptions || '<option value="">暂无已连接项目</option>'}</select></div>
      <div><label for="governed-timeout">最长运行时间</label><select id="governed-timeout"><option value="600">10 分钟</option><option value="1200">20 分钟</option><option value="1800" selected>30 分钟</option></select></div>
      <div style="grid-column:1/-1"><label for="governed-goal">开发目标</label><textarea id="governed-goal" rows="3" placeholder="说明要完成的功能、验收条件和不可触碰的边界"></textarea></div>
      <div style="grid-column:1/-1"><label for="governed-paths">允许修改的路径（每行一个）</label><textarea id="governed-paths" rows="3" placeholder="例如：&#10;apps/console/web/render.mjs&#10;apps/console/web/render.test.mjs"></textarea></div>
    </div>
    <div class="button-row" style="justify-content:space-between;margin-top:14px"><p id="governed-run-status" class="help">不会自动提交、推送、合并或部署；仓库不干净时执行 Gate 会拒绝启动。</p><button id="governed-create" type="button" class="primary-action">生成执行提案</button></div>
    <div id="governed-runs" class="simple-list" style="margin-top:16px"><div class="empty-state"><strong>正在读取执行记录</strong></div></div>
  </section>
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
  })), [{ key: "id", label: messages.pages.actions.action }, { key: "intent", label: messages.pages.actions.intent }, { key: "risk", label: messages.common.risk, html: true }, { key: "mode", label: messages.common.mode }, { key: "gate", label: messages.common.gate }])}</section></div></details>
  <script>
  (() => {
    const list=document.getElementById("governed-runs"), status=document.getElementById("governed-run-status"); if(!list)return;
    const esc=(value)=>String(value??"").replace(/[&<>"']/g,(char)=>({"&":"&amp;","<":"&lt;",">":"&gt;",'"':"&quot;","'":"&#39;"})[char]);
    const labels={PENDING_APPROVAL:"等待批准",RUNNING:"执行中",SUCCEEDED:"已完成",FAILED:"失败",CANCELLED:"已取消",BLOCKED:"已阻塞"};
    const tones={PENDING_APPROVAL:"proposal-only",RUNNING:"local",SUCCEEDED:"pass",FAILED:"blocked",CANCELLED:"pending",BLOCKED:"blocked"};
    const call=async(url,options={})=>{const response=await fetch(url,{headers:{"content-type":"application/json"},...options});const body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||"请求失败");return body;};
    const render=(runs)=>{if(!runs.length){list.innerHTML='<div class="empty-state"><strong>还没有执行提案</strong>填写目标与路径后生成第一份受控提案。</div>';return;}list.innerHTML=runs.map((run)=>'<div class="simple-row" style="align-items:flex-start;gap:18px"><div style="min-width:0;flex:1"><div style="display:flex;align-items:center;gap:8px;flex-wrap:wrap"><strong>'+esc(run.goal)+'</strong><span class="status-label '+(tones[run.status]||"pending")+'">● '+esc(labels[run.status]||run.status)+'</span></div><small>'+esc(run.projectId)+' · '+esc((run.allowedPaths||[]).join(", "))+' · '+esc(run.id)+'</small>'+(run.error?'<p class="help">'+esc(run.error)+'</p>':'')+'</div><div class="button-row compact-row">'+(run.status==="PENDING_APPROVAL"?'<button class="primary" data-governed-approve="'+esc(run.id)+'">批准并启动</button>':'')+(run.status==="RUNNING"?'<button class="danger" data-governed-cancel="'+esc(run.id)+'">停止</button>':'')+'</div></div>').join("");};
    const refresh=async()=>{try{const body=await call("/api/governed-runs");render(body.runs||[]);if((body.runs||[]).some((run)=>run.status==="RUNNING"))window.setTimeout(refresh,2500);}catch(error){status.textContent=error.message;}};
    document.getElementById("governed-create").addEventListener("click",async()=>{const button=document.getElementById("governed-create");const payload={projectId:document.getElementById("governed-project").value,goal:document.getElementById("governed-goal").value.trim(),allowedPaths:document.getElementById("governed-paths").value.split("\\n").map((item)=>item.trim()).filter(Boolean),maxRuntimeSeconds:Number(document.getElementById("governed-timeout").value)};if(!payload.goal||!payload.allowedPaths.length){status.textContent="请填写开发目标，并至少指定一个允许修改的路径。";return;}button.disabled=true;status.textContent="正在生成受控执行提案……";try{await call("/api/governed-runs",{method:"POST",body:JSON.stringify(payload)});status.textContent="提案已生成。请复核项目、路径与目标后再批准。";await refresh();}catch(error){status.textContent=error.message;}finally{button.disabled=false;}});
    list.addEventListener("click",async(event)=>{const approve=event.target.closest("[data-governed-approve]"),cancel=event.target.closest("[data-governed-cancel]");if(approve){if(!window.confirm("批准后将启动一次真实 Codex 执行。确认项目和允许路径均正确？"))return;approve.disabled=true;status.textContent="正在通过 Activation Gate 并启动 Worker……";try{await call("/api/governed-runs/"+encodeURIComponent(approve.dataset.governedApprove)+"/approve",{method:"POST",body:"{}"});await refresh();}catch(error){status.textContent=error.message;approve.disabled=false;}}if(cancel){cancel.disabled=true;try{await call("/api/governed-runs/"+encodeURIComponent(cancel.dataset.governedCancel)+"/cancel",{method:"POST",body:"{}"});await refresh();}catch(error){status.textContent=error.message;cancel.disabled=false;}}});refresh();
  })();
  </script>`;
}

function pageAccount(auth = {}) {
  const user = auth.user ?? {};
  const role = auth.roles?.[0]?.display_name || auth.roles?.[0]?.role_id || "已授权用户";
  const session = auth.session ?? {};
  return `<section class="hero"><div><span class="eyebrow">Account Security</span><h1>账户与安全</h1><p>维护当前 Studio 本地登录账号。密码只在本次加密请求中提交，服务端仅保存 scrypt 哈希，不写入 Goal、Task、日志或 Credential Reference。</p></div><span class="status-label pass">本地身份 · 已认证</span></section>
  <section class="account-security-grid"><div class="panel"><div class="section-head small"><h2>当前账号</h2><span class="pill">Access Center</span></div><div class="account-fact"><span>显示名称</span><strong>${escapeHtml(user.display_name || user.username || "—")}</strong></div><div class="account-fact"><span>用户名</span><strong>${escapeHtml(user.username || "—")}</strong></div><div class="account-fact"><span>角色</span><strong>${escapeHtml(role)}</strong></div><div class="account-fact"><span>认证来源</span><strong>${escapeHtml(auth.auth_source || "local_password_session")}</strong></div><div class="account-fact"><span>会话创建</span><strong>${escapeHtml(session.created_at ? new Date(session.created_at).toLocaleString("zh-CN") : "—")}</strong></div><div class="account-fact"><span>会话到期</span><strong>${escapeHtml(session.expires_at ? new Date(session.expires_at).toLocaleString("zh-CN") : "—")}</strong></div><p class="help">这是 Studio 网页账号。Codex、Claude 和 API 密钥仍在“凭证”中以 Credential Reference 管理；Keycloak MCP 身份是另一条认证边界。</p></div>
  <div class="panel"><div class="section-head small"><div><h2>修改密码</h2><p class="help">成功后会撤销该账号的旧会话，并为当前浏览器签发新会话。</p></div><span class="status-label local">会话自动轮换</span></div><form id="password-change-form" autocomplete="off"><label for="current-password">当前密码</label><div class="password-field"><input id="current-password" name="currentPassword" type="password" autocomplete="current-password" required><button class="password-toggle" type="button" data-password-toggle="current-password" aria-label="显示当前密码">显示</button></div><label for="new-password" style="display:block;margin-top:12px">新密码</label><div class="password-field"><input id="new-password" name="newPassword" type="password" autocomplete="new-password" minlength="12" required><button class="password-toggle" type="button" data-password-toggle="new-password" aria-label="显示新密码">显示</button></div><label for="confirm-password" style="display:block;margin-top:12px">确认新密码</label><div class="password-field"><input id="confirm-password" name="confirmPassword" type="password" autocomplete="new-password" minlength="12" required><button class="password-toggle" type="button" data-password-toggle="confirm-password" aria-label="显示确认密码">显示</button></div><div id="password-requirements" class="password-requirements"><span data-rule="length" class="password-requirement">至少 12 个字符</span><span data-rule="upper" class="password-requirement">包含大写字母</span><span data-rule="lower" class="password-requirement">包含小写字母</span><span data-rule="number" class="password-requirement">包含数字</span><span data-rule="symbol" class="password-requirement">包含特殊符号</span><span data-rule="space" class="password-requirement">不含空格</span><span data-rule="username" class="password-requirement">不包含用户名</span><span data-rule="match" class="password-requirement">两次输入一致</span></div><div class="button-row"><button id="password-submit" class="primary-action" type="submit" disabled>更新密码</button></div><p id="password-change-status" class="help" role="status" aria-live="polite">请输入当前密码和符合要求的新密码。</p></form></div></section>
  <section class="panel"><div class="section-head small"><div><h2>安全活动</h2><p class="help">仅显示当前账号的密码安全事件，不记录密码、哈希、Cookie 或会话令牌。</p></div><button id="security-refresh" class="secondary" type="button">刷新</button></div><div id="security-events"><p class="help">正在读取安全活动…</p></div></section>
  <script>(()=>{const q=id=>document.getElementById(id),form=q('password-change-form'),current=q('current-password'),next=q('new-password'),confirm=q('confirm-password'),submit=q('password-submit'),status=q('password-change-status'),events=q('security-events'),username=${JSON.stringify(String(user.username ?? "").toLowerCase())},esc=value=>String(value??'').replace(/[&<>"']/g,char=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[char]));const rules=()=>{const value=next.value,checks={length:value.length>=12,upper:/[A-Z]/.test(value),lower:/[a-z]/.test(value),number:/\d/.test(value),symbol:/[^A-Za-z0-9\s]/.test(value),space:!\s/.test(value),username:!username||!value.toLowerCase().includes(username),match:value.length>0&&value===confirm.value};Object.entries(checks).forEach(([key,pass])=>document.querySelector('[data-rule="'+key+'"]').classList.toggle('pass',pass));submit.disabled=!(current.value&&Object.values(checks).every(Boolean));return checks;};[current,next,confirm].forEach(input=>input.addEventListener('input',rules));document.querySelectorAll('[data-password-toggle]').forEach(button=>button.onclick=()=>{const input=q(button.dataset.passwordToggle),show=input.type==='password';input.type=show?'text':'password';button.textContent=show?'隐藏':'显示';button.setAttribute('aria-label',(show?'隐藏':'显示')+input.labels?.[0]?.textContent);});const renderEvents=list=>{events.innerHTML=list.length?list.map(item=>'<div class="security-event"><div><strong>'+esc(item.event_type==='PASSWORD_CHANGED'?'密码已更新':'密码更新被拒绝')+'</strong><p class="help">'+(item.event_type==='PASSWORD_CHANGED'?'旧会话已撤销 '+Number(item.revoked_session_count||0)+' 个':'原因：当前密码验证失败')+'</p></div><time>'+esc(new Date(item.occurred_at).toLocaleString())+'</time></div>').join(''):'<p class="help">当前账号还没有密码安全事件。</p>';};const load=async()=>{const response=await fetch('/api/access/security',{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.reason||'无法读取安全活动');renderEvents(body.recent_events||[]);};q('security-refresh').onclick=()=>load().catch(error=>events.innerHTML='<p class="help">'+esc(error.message)+'</p>');form.onsubmit=async event=>{event.preventDefault();if(!Object.values(rules()).every(Boolean))return;submit.disabled=true;status.className='help';status.textContent='正在验证当前密码并轮换会话…';try{const response=await fetch('/api/access/security',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({currentPassword:current.value,newPassword:next.value})}),body=await response.json();current.value='';next.value='';confirm.value='';rules();if(!response.ok)throw new Error(body.reason||'密码更新失败');status.className='help success-text';status.textContent='密码已更新，旧会话已撤销 '+Number(body.revoked_session_count||0)+' 个。当前浏览器已获得新会话。';await load();}catch(error){status.className='help error-text';status.textContent=error.message;}finally{rules();}};load().catch(error=>events.innerHTML='<p class="help">'+esc(error.message)+'</p>');})();</script>`;
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
  const domainCapabilities = Array.isArray(access.domain_capabilities) ? access.domain_capabilities : [];
  const canManageDomainCapabilities = data.renderAuth?.can_manage_access === true || (data.renderAuth?.capabilities ?? []).includes("*") || (data.renderAuth?.capabilities ?? []).includes("access.manage");
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
  const capabilityAssignments = users.map((user) => {
    const membership = memberships.find((item) => item.user_id === user.user_id) ?? null;
    const directGrants = new Set(membership?.capability_grants ?? []);
    const roleCapabilities = new Set((membership?.role_ids ?? [user.primary_role_id]).flatMap((roleId) => roleMap.get(roleId)?.capabilities ?? []));
    const hasAll = roleCapabilities.has("*");
    return `<form class="panel domain-capability-assignment" data-capability-user="${escapeHtml(user.user_id)}">
      <div class="section-head small"><div><h3>${escapeHtml(user.display_name || user.username)}</h3><p class="help">${escapeHtml(user.username)} · ${escapeHtml(roleMap.get(user.primary_role_id)?.display_name || user.primary_role_id || "未分配角色")}</p></div><span class="pill">${directGrants.size} 项直接授权</span></div>
      <div class="domain-capability-grid">${domainCapabilities.map((capability) => {
        const inherited = hasAll || roleCapabilities.has(capability.id);
        const checked = inherited || directGrants.has(capability.id);
        return `<label class="domain-capability-option${inherited ? " inherited" : ""}"><input type="checkbox" value="${escapeHtml(capability.id)}"${checked ? " checked" : ""}${inherited ? " disabled" : ""}><span><strong>${escapeHtml(capability.label)}</strong><small>${escapeHtml(inherited ? "角色已包含" : capability.description)}</small></span></label>`;
      }).join("")}</div>
      <div class="button-row capability-assignment-actions"><span class="help" role="status" data-capability-status>${canManageDomainCapabilities ? "勾选后保存，仅调整该成员的直接领域授权。" : "当前账号只能查看授权。"}</span>${canManageDomainCapabilities ? '<button type="submit" class="primary-action">保存领域能力</button>' : ""}</div>
    </form>`;
  }).join("");
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
  <section>
    <div class="section-head"><div><h2>成员领域能力</h2><p class="help">角色提供基础权限，管理员可在这里为单个成员追加领域能力；保存后导航、页面、API 和 Agent 工作流同步生效。</p></div><span class="pill">${domainCapabilities.length} 个领域</span></div>
    <div class="capability-assignment-list">${capabilityAssignments || '<div class="panel"><p class="help">当前没有可分配成员。</p></div>'}</div>
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
  <script>(()=>{document.querySelectorAll('[data-capability-user]').forEach(form=>form.addEventListener('submit',async event=>{event.preventDefault();const button=form.querySelector('button[type="submit"]'),status=form.querySelector('[data-capability-status]'),capabilityIds=[...form.querySelectorAll('input[type="checkbox"]:checked:not(:disabled)')].map(input=>input.value);button.disabled=true;status.textContent='正在保存…';try{const response=await fetch('/api/access/members/'+encodeURIComponent(form.dataset.capabilityUser)+'/domain-capabilities',{method:'PATCH',headers:{'content-type':'application/json'},body:JSON.stringify({capability_ids:capabilityIds})}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status);status.textContent='已保存 '+body.membership.capability_grants.length+' 项直接领域授权。';status.className='help auth-status success';}catch(error){status.textContent=error.message;status.className='help auth-status error';}finally{button.disabled=false;}}));})();</script>
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

function pageDevelopment(data) {
  const projects=(data.project_router.projects??[]).filter(project=>project.connection_status==="CONNECTED"&&project.repo_path_display&&project.repo_path_display!=="not_connected");
  const options=projects.map(project=>`<option value="${escapeHtml(project.project_id)}">${escapeHtml(project.project_name??project.project_id)}</option>`).join("");
  return `<section class="product-hero"><div><span class="eyebrow">Autonomous Development</span><h2>真实自主开发</h2><p>从一句目标开始，由四个独立 Codex Agent 完成规划、实现、验证和审查。真实写入必须经过项目策略与一次性 Approval，结果进入人工 Diff 审批。</p></div><span id="development-worker" class="status-label pending">● 检查 Worker</span></section>
  <section class="panel"><div class="form-grid"><div><label for="development-project">目标项目</label><select id="development-project">${options}</select></div><div><label for="development-timeout">最长运行时间</label><select id="development-timeout"><option value="600">10 分钟</option><option value="1200">20 分钟</option><option value="1800" selected>30 分钟</option></select></div><div><label for="development-repairs">自动返修预算</label><select id="development-repairs"><option value="0">不自动返修</option><option value="1" selected>最多 1 次</option><option value="2">最多 2 次</option></select></div><div style="grid-column:1/-1"><label for="development-goal">开发目标</label><textarea id="development-goal" rows="4" placeholder="描述要实现的真实功能、业务边界和期望结果"></textarea></div><div style="grid-column:1/-1"><label for="development-paths">允许修改路径（每行一个）</label><textarea id="development-paths" rows="3" placeholder="apps/console/web/render.mjs"></textarea></div><div style="grid-column:1/-1"><label for="development-acceptance">验收标准（每行一项）</label><textarea id="development-acceptance" rows="3" placeholder="页面可以完成目标操作&#10;定向测试通过&#10;不修改允许路径之外的文件"></textarea></div><div style="grid-column:1/-1"><label for="development-commands">验证命令（每行一个）</label><textarea id="development-commands" rows="3">git diff --check</textarea></div></div><div class="button-row" style="justify-content:space-between;margin-top:14px"><p id="development-message" class="help">一次批准覆盖限定路径内的实现、验证和返修；Commit、Push、Merge、Deploy 不在批准范围内。</p><button id="development-create" class="primary-action" type="button">创建真实开发任务</button></div></section>
  <section><div class="section-head"><div><h2>自主开发就绪度</h2><p class="help">分别呈现控制面、真实 Runtime、自动返修和运行证据，不以代码存在代替真实可用。</p></div><span id="development-readiness" class="status-label pending">正在检查</span></div><div id="development-readiness-checks" class="summary-grid"></div></section>
  <section><div class="section-head"><div><h2>运营指标与告警</h2><p class="help">队列、成功率、修复率、成本、卡住任务和依赖异常</p></div></div><div id="development-operations" class="summary-grid"></div><div id="development-alerts" class="simple-list"></div></section>
  <section><div class="section-head"><div><h2>自主开发队列</h2><p class="help">真实 Agent、运行事件、Token、文件变更与人工决策</p></div><button id="development-refresh" class="secondary" type="button">刷新</button></div><div id="development-jobs"><div class="empty-state"><strong>正在读取任务</strong></div></div></section>
  <dialog id="development-artifact-dialog" style="width:min(1000px,92vw);max-height:86vh"><div class="section-head"><h2 id="development-artifact-title">Artifact</h2><button id="development-artifact-close" class="secondary">关闭</button></div><pre id="development-artifact-content" style="max-height:70vh;overflow:auto;white-space:pre-wrap"></pre></dialog>
  <script>(()=>{const box=document.getElementById('development-jobs'),message=document.getElementById('development-message'),workerBadge=document.getElementById('development-worker'),readinessBadge=document.getElementById('development-readiness'),readinessChecks=document.getElementById('development-readiness-checks'),operationsBox=document.getElementById('development-operations'),alertsBox=document.getElementById('development-alerts'),dialog=document.getElementById('development-artifact-dialog');const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const call=async(url,options={})=>{const response=await fetch(url,{headers:{'content-type':'application/json'},...options}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||'请求失败');return body;};const statusLabel={PREFLIGHT_BLOCKED:'工作区预检阻断',NEEDS_CLARIFICATION:'需要澄清',PENDING_APPROVAL:'等待批准',QUEUED:'等待 Worker',RUNNING:'真实执行中',RECOVERY_REQUIRED:'恢复需人工复核',AWAITING_DIFF_APPROVAL:'等待 Diff 审批',NEEDS_REWORK:'需要返工',FAILED:'失败',CANCELLED:'已取消',COMMITTED:'已提交'};
  const render=body=>{const worker=body.worker,readiness=body.readiness,ops=body.operations;workerBadge.textContent='● '+(worker.status==='IDLE'?'Worker 在线':worker.status==='BUSY'?'Worker 执行中':'Worker 离线');workerBadge.className='status-label '+(worker.status==='IDLE'?'pass':worker.status==='BUSY'?'local':'blocked');readinessBadge.textContent=readiness.status;readinessBadge.className='status-label '+(readiness.maturity.autonomousDevelopment==='READY'?'pass':readiness.maturity.codexRuntime==='READY'?'local':'pending');readinessChecks.innerHTML=readiness.checks.map(check=>'<div class="summary-card"><span>'+esc(check.label)+'</span><strong>'+esc(check.status)+'</strong><small>'+esc(check.detail)+'</small></div>').join('');operationsBox.innerHTML=[['队列',ops.queueDepth],['运行中',ops.running],['成功率',ops.successRate==null?'—':Math.round(ops.successRate*100)+'%'],['Token',Number(ops.tokens).toLocaleString()]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+item[1]+'</strong></div>').join('');alertsBox.innerHTML=ops.alerts.length?ops.alerts.map(alert=>'<div class="simple-row"><strong>'+esc(alert.code)+'</strong><span>'+esc(alert.severity)+'</span></div>').join(''):'<div class="simple-row"><strong>无活动告警</strong><span>PASS</span></div>';if(!body.jobs.length){box.innerHTML='<div class="panel empty-state"><strong>还没有真实开发任务</strong></div>';return;}box.innerHTML=body.jobs.map(job=>'<article class="panel" style="margin-bottom:14px"><div class="section-head"><div><span class="eyebrow">'+esc(job.projectId)+' · '+esc(job.id)+' · '+esc(job.queuePolicy?.priority||'P2')+'</span><h2>'+esc(job.goal)+'</h2><p class="help">'+esc(job.allowedPaths.join(' · '))+' · '+esc(job.stage||'未开始')+'</p></div><span class="status-label '+(job.status==='COMMITTED'||job.status==='AWAITING_DIFF_APPROVAL'?'pass':job.status==='RUNNING'||job.status==='QUEUED'?'local':job.status==='FAILED'||job.status==='NEEDS_REWORK'||job.status==='PREFLIGHT_BLOCKED'||job.status==='RECOVERY_REQUIRED'?'blocked':'pending')+'">● '+esc(statusLabel[job.status]||job.status)+'</span></div><div class="grid"><div class="metric"><span>真实 Agent</span><strong>'+job.agentInstances.length+' / 4+</strong></div><div class="metric"><span>自动返修</span><strong>'+Number(job.repairAttemptsUsed||0)+' / '+Number(job.maxRepairAttempts||0)+'</strong></div><div class="metric"><span>验收证据</span><strong>'+esc(job.acceptanceEvidence?.status||'旧任务')+'</strong></div><div class="metric"><span>变更文件</span><strong>'+job.changedPaths.length+'</strong></div></div>'+(job.preflight?.status==='BLOCKED'?'<div class="attention-card panel" style="margin-top:12px"><strong>检测到审批前已有改动</strong><p class="help">'+esc(job.preflight.existingChangedPaths.join(' · '))+'</p></div>':'')+(job.recovery?'<div class="attention-card panel" style="margin-top:12px"><strong>'+esc(job.recovery.decision)+'</strong><p class="help">'+esc(job.recovery.previousStage)+' · 副作用可能性 '+esc(job.recovery.sideEffectsPossible)+'</p></div>':'')+(job.clarification.questions.length&&!job.clarification.answer?'<div class="attention-card panel" style="margin-top:12px"><strong>'+esc(job.clarification.questions.join(' '))+'</strong><textarea data-clarification="'+esc(job.id)+'" rows="2" placeholder="输入补充说明"></textarea></div>':'')+'<div class="simple-list" style="margin-top:12px">'+job.agentInstances.map(agent=>'<div class="simple-row"><div><strong>'+esc(agent.role)+'</strong><small>'+esc((agent.skillPack||[]).join(' · '))+'</small></div><div><span>'+esc(agent.status)+'</span><small>'+Number(agent.tokenUsage?.input_tokens||0).toLocaleString()+' tokens</small></div></div>').join('')+'</div><div class="button-row" style="margin-top:12px;flex-wrap:wrap">'+job.artifacts.map(a=>'<button class="secondary" data-artifact="'+esc(a.id)+'" data-id="'+esc(job.id)+'">'+esc(a.type)+(a.sha256?' ✓':'')+'</button>').join('')+'<span style="flex:1"></span>'+(job.status==='NEEDS_CLARIFICATION'?'<button class="primary" data-action="clarify" data-id="'+esc(job.id)+'">提交澄清</button>':'')+(job.status==='PENDING_APPROVAL'||job.status==='PAUSED'?'<button class="primary" data-action="approve" data-id="'+esc(job.id)+'">批准真实执行</button>':'')+(job.status==='QUEUED'||job.status==='RUNNING'?'<button class="danger" data-action="cancel" data-id="'+esc(job.id)+'">取消</button>':'')+(job.status==='AWAITING_DIFF_APPROVAL'?'<button class="primary" data-action="commit" data-id="'+esc(job.id)+'">批准 Diff 并 Commit</button>':'')+'</div></article>').join('');};const refresh=async()=>render(await call('/api/development/jobs'));
  document.getElementById('development-create').onclick=async()=>{const button=document.getElementById('development-create'),lines=id=>document.getElementById(id).value.split('\n').map(v=>v.trim()).filter(Boolean),criteria=lines('development-acceptance'),commands=lines('development-commands');button.disabled=true;try{await call('/api/development/jobs',{method:'POST',body:JSON.stringify({projectId:document.getElementById('development-project').value,goal:document.getElementById('development-goal').value,allowedPaths:lines('development-paths'),acceptanceCriteria:criteria,acceptanceCommands:commands,acceptanceEvidence:criteria.map(criterion=>({criterion,type:'TEST',reference:commands.find(command=>/test/.test(command))||commands[0]})),priority:'P2',maxRuntimeSeconds:Number(document.getElementById('development-timeout').value),maxRepairAttempts:Number(document.getElementById('development-repairs').value)})});message.textContent='任务已创建，请完成澄清或批准。一次批准将覆盖限定路径内的实现、验证和有限返修。';await refresh();}catch(error){message.textContent=error.message;}finally{button.disabled=false;}};box.onclick=async event=>{const artifact=event.target.closest('[data-artifact]'),action=event.target.closest('[data-action]');if(artifact){const result=await call('/api/development/jobs/'+encodeURIComponent(artifact.dataset.id)+'/artifacts/'+encodeURIComponent(artifact.dataset.artifact));document.getElementById('development-artifact-title').textContent=result.artifact.type;document.getElementById('development-artifact-content').textContent=result.content;dialog.showModal();return;}if(!action)return;if((action.dataset.action==='approve'||action.dataset.action==='commit')&&!confirm(action.dataset.action==='approve'?'确认一次性批准当前项目、路径、验收命令、时限及返修预算？':'确认当前 Diff 后创建本地 Commit？'))return;const body=action.dataset.action==='clarify'?{answer:document.querySelector('[data-clarification="'+CSS.escape(action.dataset.id)+'"]').value}:{};try{await call('/api/development/jobs/'+encodeURIComponent(action.dataset.id)+'/'+action.dataset.action,{method:'POST',body:JSON.stringify(body)});await refresh();}catch(error){message.textContent=error.message;}};document.getElementById('development-artifact-close').onclick=()=>dialog.close();document.getElementById('development-refresh').onclick=()=>refresh().catch(error=>message.textContent=error.message);refresh().catch(error=>message.textContent=error.message);setInterval(()=>refresh().catch(error=>message.textContent=error.message),4000);})();</script>`;
}

function pageMyWork(data) {
  const capabilities=data.renderAuth?.capabilities??[],canControl=capabilities.some(value=>value==="*"||value==="business.work.control"),canManage=capabilities.some(value=>value==="*"||value==="business.manage");
  return `${canControl?"":"<style>#work-list [data-work-action]{display:none}</style>"}<section class="product-hero"><div><span class="eyebrow">My Work</span><h2>${canManage?"工作区工作":"我的工作"}</h2><p>${canManage?"集中处置当前工作区的业务待办、Agent 工作、阻塞与人工接管。":"集中处理分配给我的业务待办、我委派给 Agent 的工作、待审批事项、阻塞和分析结果。"}这里展示业务工作，不暴露内部租约、进程或 Fencing 信息。</p></div><button id="work-refresh" class="secondary" type="button">刷新</button></section><script>window.addEventListener('DOMContentLoaded',()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function loadApprovedPlans(){const response=await fetch('/api/work',{cache:'no-store'}),body=await response.json();if(!response.ok)return;const items=body.items.filter(item=>item.delegationPlan);let section=document.getElementById('approved-delegation-plans');if(!section){section=document.createElement('section');section.id='approved-delegation-plans';document.getElementById('work-list').parentElement.insertAdjacentElement('afterend',section);}section.innerHTML=items.length?'<div class="section-head"><div><h2>已批准智能执行方案</h2><p class="help">直接投影不可变委派审计，不建立第二套编排状态。</p></div></div><div class="panel simple-list">'+items.map(item=>'<a class="simple-row" href="'+esc(item.businessObject.href)+'"><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.delegationPlan.domainId)+' · '+esc(item.delegationPlan.workflowDefinitionId)+' · '+esc(item.delegationPlan.stages.length)+' 阶段</small></div><div><span class="status-label pass">已批准</span><small>'+esc(item.delegationPlan.executionRuntime)+' · '+esc(item.delegationPlan.expectedWritebackStatus)+'</small></div></a>').join('')+'</div>':'';}loadApprovedPlans().catch(()=>{});document.getElementById('work-refresh').addEventListener('click',()=>setTimeout(()=>loadApprovedPlans().catch(()=>{}),100));});</script><script>window.addEventListener('DOMContentLoaded',()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),label={PASS:'通过，待人工处理',REVIEW_REQUIRED:'需要人工复核',BLOCKED:'证据不足'};async function loadProfessionalResults(){const response=await fetch('/api/business/results?limit=50',{cache:'no-store'}),body=await response.json();if(!response.ok)return;let section=document.getElementById('professional-business-results');if(!section){section=document.createElement('section');section.id='professional-business-results';document.getElementById('work-approval-section').insertAdjacentElement('afterend',section);}const cards=[['专业结果',body.total],['规则通过',body.summary.pass],['需复核',body.summary.reviewRequired],['证据阻塞',body.summary.blocked]];section.innerHTML='<div class="section-head"><div><h2>专业业务结果</h2><p class="help">由各业务平台的专业 Skill Runner 生成，保留来源、检查项和人工决策边界。</p></div><span class="pill">'+esc(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+'</span></div><div class="summary-grid">'+cards.map(x=>'<div class="summary-card"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('')+'</div>'+(body.items.length?'<div class="panel simple-list">'+body.items.map(item=>{const passed=(item.checks||[]).filter(check=>check.status==='PASS').length,total=(item.checks||[]).length;return'<a class="simple-row" href="'+esc(item.businessObject.href)+'"><div><strong>'+esc(item.applicationName)+' · '+esc(item.businessObject.displayKey)+'</strong><small>'+esc(item.skillId)+' · '+esc(item.runnerId)+' · 检查 '+passed+'/'+total+'</small></div><div><span class="status-label '+(item.decision==='PASS'?'pass':item.decision==='BLOCKED'?'blocked':'pending')+'">'+esc(label[item.decision]||item.decision)+'</span><small>'+esc(item.nextAction)+' · '+esc(new Date(item.updatedAt).toLocaleString())+'</small></div></a>';}).join('')+'</div>':'<div class="panel empty-state"><strong>尚无专业业务结果</strong>完成受控 Agent 工作后，专业 Runner 的结果会出现在这里。</div>');}loadProfessionalResults().catch(()=>{});document.getElementById('work-refresh').addEventListener('click',()=>setTimeout(()=>loadProfessionalResults().catch(()=>{}),100));});</script>
  <section><div class="section-head"><div><h2>智能能力协议</h2><p class="help">明确区分通用流程 Agent、专业业务 Agent 与只读知识资源，并校验 Workflow、Skill、Runner 能力是否完整。</p></div><span id="capability-protocol-status" class="pill">正在校验</span></div><div id="capability-protocol-summary" class="summary-grid"></div><div id="capability-resource-list" class="panel"><div class="empty-state"><strong>正在读取知识资源</strong></div></div><div id="capability-protocol-list" class="panel"><div class="empty-state"><strong>正在读取能力协议</strong></div></div></section><script>window.addEventListener('DOMContentLoaded',()=>{const summary=document.getElementById('capability-protocol-summary'),list=document.getElementById('capability-protocol-list'),resources=document.getElementById('capability-resource-list'),status=document.getElementById('capability-protocol-status'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));fetch('/api/business/capabilities',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('能力协议不可用'))).then(body=>{status.textContent=body.summary.blocked?'存在阻断':'协议完整';status.className='status-label '+(body.summary.blocked?'blocked':'pass');summary.innerHTML=[['业务应用',body.summary.applications],['Workflow',body.summary.workflows],['专业 Runner',body.summary.professionalRunners],['设计预设',body.summary.designPresets],['能力阻断',body.summary.blocked]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong></div>').join('');resources.innerHTML='<div class="simple-list">'+body.knowledgeResources.resources.map(item=>'<div class="simple-row"><div><strong>'+esc(item.display_name)+'</strong><small>'+esc(item.provider)+' · '+esc(item.license)+' · '+esc(item.installed_commit?.slice(0,12))+'</small></div><div><span class="status-label '+(item.integrity_status==='PASS'?'pass':'blocked')+'">'+esc(item.integrity_status)+'</span><small>'+esc(item.item_count)+' 个 DESIGN.md · 显式选择 · 只读参考</small></div></div>').join('')+'</div>';const professional=body.protocols.filter(item=>item.professionalStage);list.innerHTML=professional.length?'<div class="simple-list">'+professional.map(item=>'<div class="simple-row"><div><strong>'+esc(item.applicationId)+' · '+esc(item.domainId)+'</strong><small>通用执行 '+esc(item.stages.map(stage=>stage.agent.agentId).join(' → '))+'</small></div><div><span class="status-label '+(item.status==='READY'?'pass':'blocked')+'">'+esc(item.outcomeMode)+'</span><small>专业 Agent '+esc(item.professionalStage.agentId)+' · Runner '+esc(item.professionalStage.runnerId)+' · 人工审批 '+(item.professionalStage.humanApprovalRequired?'必须':'缺失')+'</small></div></div>').join('')+'</div>':'<div class="empty-state"><strong>尚无专业能力协议</strong></div>';}).catch(error=>{status.textContent='协议不可用';status.className='status-label blocked';list.innerHTML='<div class="empty-state"><strong>'+esc(error.message)+'</strong></div>';});});</script>
  <section><div class="section-head"><div><h2>跨平台人工断点</h2><p class="help">直接投影长期 Campaign 的人工审批和依赖阻塞；完成审批后回到长期任务复核续跑。</p></div><a class="quiet-link" href="/portfolio">进入长期任务 →</a></div><div id="portfolio-work-summary" class="summary-grid"></div><div id="portfolio-human-actions" class="panel"><div class="empty-state"><strong>正在读取跨平台任务</strong></div></div></section><script>window.addEventListener('DOMContentLoaded',()=>{const summary=document.getElementById('portfolio-work-summary'),box=document.getElementById('portfolio-human-actions'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));async function loadPortfolioWork(){const response=await fetch('/api/portfolio/work-report',{cache:'no-store'}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||'跨平台任务不可用');summary.innerHTML=[['长期任务',body.summary.campaigns],['运行中',body.summary.activeCampaigns],['待人工处理',body.summary.humanActions],['依赖阻塞',body.summary.blocked]].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong></div>').join('');const items=[...body.humanActions,...body.blocked];box.innerHTML=items.length?'<div class="simple-list">'+items.map(item=>'<a class="simple-row" href="/portfolio"><div><strong>'+esc(item.campaignGoal)+'</strong><small>'+esc(item.domainName)+' · '+esc(item.businessObject?.displayKey||item.applicationId)+'</small></div><div><span class="status-label '+(item.humanApprovalRequired?'pending':'blocked')+'">'+(item.humanApprovalRequired?'等待业务审批':'依赖阻塞')+'</span><small>'+esc(item.nextAction||item.blockedReasons.join(' · '))+'</small></div></a>').join('')+'</div>':'<div class="empty-state"><strong>当前没有跨平台人工断点</strong>长期 Campaign 的审批和依赖异常会统一出现在这里。</div>';}loadPortfolioWork().catch(error=>box.textContent=error.message);document.getElementById('work-refresh').addEventListener('click',()=>loadPortfolioWork().catch(error=>box.textContent=error.message));});</script>
  <section class="summary-grid" id="work-summary"></section><section><div class="section-head"><div><h2>Agent 在线执行</h2><p class="help">从统一 Kernel 读取排队、运行、阻塞和完成进度；不暴露租约与 Fencing。</p></div><span class="pill">自动刷新</span></div><div id="work-execution-live" class="panel"><div class="empty-state"><strong>正在读取在线执行状态</strong></div></div></section><script src="/assets/business-work-execution.js"></script><section><div class="section-head"><div><h2>异常与阻塞</h2><p class="help">来自可访问业务应用的正式异常单据和阻塞工作，可直接回到原业务端点处置。</p></div><span id="work-exception-source" class="pill">正在读取</span></div><div id="work-exceptions" class="panel"><div class="empty-state"><strong>正在读取业务异常</strong></div></div></section><section id="work-approval-section"><div class="section-head"><div><h2>待我审批</h2><p class="help">审批绑定业务对象版本，单据变化后旧审批自动失效。</p></div></div><div id="work-approvals" class="panel"><div class="empty-state"><strong>正在读取审批</strong></div></div></section><section><div class="section-head"><div><h2>工作队列</h2><p class="help">每项工作都可返回对应业务单据。</p></div></div><div id="work-list" class="panel"><div class="empty-state"><strong>正在读取工作</strong></div></div></section>
  <script>(()=>{const list=document.getElementById('work-list'),exceptions=document.getElementById('work-exceptions'),exceptionSource=document.getElementById('work-exception-source'),approvals=document.getElementById('work-approvals'),approvalSection=document.getElementById('work-approval-section'),summary=document.getElementById('work-summary'),esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),controls=item=>{if(['COMPLETED','CANCELLED'].includes(item.status))return'';const buttons=[];if(item.assignmentType==='AGENT'&&['OPEN','BLOCKED','WAITING_APPROVAL'].includes(item.status))buttons.push(['PAUSE','暂停']);if(item.status==='PAUSED')buttons.push(['RESUME','恢复']);if(item.status==='BLOCKED')buttons.push(['RETRY','重试']);if(item.assignmentType==='AGENT'&&['OPEN','PAUSED','BLOCKED','WAITING_APPROVAL'].includes(item.status))buttons.push(['TAKE_OVER','人工接管']);if(['OPEN','PAUSED','BLOCKED','WAITING_APPROVAL'].includes(item.status))buttons.push(['REASSIGN','重新分配']);return'<div class="button-row">'+buttons.map(action=>'<button class="secondary" data-work-action="'+action[0]+'" data-work-id="'+esc(item.id)+'" data-work-version="'+esc(item.version)+'">'+action[1]+'</button>').join('')+'</div>';};async function load(){const [workResponse,exceptionResponse]=await Promise.all([fetch('/api/work',{cache:'no-store'}),fetch('/api/business/exceptions',{cache:'no-store'})]),body=await workResponse.json(),exceptionBody=await exceptionResponse.json();if(!workResponse.ok)throw new Error(body.reason||'工作队列不可用');if(!exceptionResponse.ok)throw new Error(exceptionBody.reason||'异常中心不可用');const cards=[['全部工作',body.summary.total],['我的待办',body.summary.human],['业务异常',exceptionBody.summary.total],['Agent 阻塞',exceptionBody.summary.agentBlocked]];summary.innerHTML=cards.map(x=>'<div class="summary-card"><span>'+x[0]+'</span><strong>'+x[1]+'</strong></div>').join('');exceptionSource.textContent=(exceptionBody.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(exceptionBody.generatedAt).toLocaleString();exceptions.innerHTML=exceptionBody.items.length?'<table><thead><tr><th>业务应用</th><th>业务对象</th><th>异常</th><th>责任人</th><th>更新时间</th><th></th></tr></thead><tbody>'+exceptionBody.items.map(item=>'<tr><td>'+esc(item.applicationName)+'</td><td><strong>'+esc(item.title)+'</strong><small>'+esc(item.displayKey)+'</small></td><td><span class="status-label blocked">'+esc(item.status)+'</span><small>'+(item.agentBlocked?'Agent 工作阻塞':'业务状态异常')+'</small></td><td>'+esc(item.assigneeId||item.ownerId||'未分配')+'</td><td>'+esc(new Date(item.updatedAt).toLocaleString())+'</td><td><a class="quiet-link" href="'+esc(item.href)+'">打开单据 →</a></td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>当前没有业务异常</strong>这里只显示正式业务状态和阻塞工作项。</div>';approvalSection.hidden=!body.canApprove;approvals.innerHTML=body.approvals.length?'<table><thead><tr><th>业务单据</th><th>申请人</th><th>审批动作</th><th>版本</th><th></th></tr></thead><tbody>'+body.approvals.map(item=>'<tr><td><strong>'+esc(item.businessObject.title)+'</strong><small>'+esc(item.businessObject.displayKey)+'</small></td><td>'+esc(item.requestedBy)+'</td><td>'+esc(item.fromStatus)+' → '+esc(item.requestedStatus)+'</td><td>v'+esc(item.objectVersion)+'</td><td><a class="quiet-link" href="'+esc(item.businessObject.href)+'">打开并审批 →</a></td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>当前没有待审批事项</strong></div>';list.innerHTML=body.items.length?'<table><thead><tr><th>工作</th><th>业务单据</th><th>执行者</th><th>状态</th><th>控制</th><th></th></tr></thead><tbody>'+body.items.map(item=>'<tr><td><strong>'+esc(item.title)+'</strong><small>工作版本 v'+esc(item.version)+'</small></td><td>'+esc(item.businessObject.displayKey)+'</td><td>'+(item.assignmentType==='AGENT'?'智能助手':'业务人员')+'<small>'+esc(item.assigneeId)+'</small></td><td>'+esc(item.status)+'</td><td>'+controls(item)+'</td><td><a class="quiet-link" href="'+esc(item.businessObject.href)+'">打开单据 →</a></td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>当前没有待办</strong>业务系统分配的人工和 Agent 工作会出现在这里。</div>';}list.onclick=async event=>{const button=event.target.closest('[data-work-action]');if(!button)return;const action=button.dataset.workAction,payload={action,expectedVersion:Number(button.dataset.workVersion)},needsAssignee=action==='REASSIGN';if(needsAssignee){const assigneeId=prompt('输入新的人员或 Agent ID');if(!assigneeId)return;payload.assigneeId=assigneeId;payload.assignmentType=confirm('分配给 Agent？选择“取消”则分配给业务人员。')?'AGENT':'HUMAN';}if(action==='TAKE_OVER'&&!confirm('确认停止自动推进并由你人工接管？'))return;try{const response=await fetch('/api/business/work/'+encodeURIComponent(button.dataset.workId)+'/control',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify(payload)}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status);await load();}catch(error){alert(error.message);}};document.getElementById('work-refresh').onclick=()=>load().catch(error=>list.textContent=error.message);load().catch(error=>list.textContent=error.message);})();</script>`;
}

function pageBusinessApplication(application, data) {
  const applicationView={...application,objectTypes:application.objectTypes.map(type=>({...type,schema:getBusinessObjectDefinition(application.id,type.id)})),relationContracts:businessRelationContracts.filter(item=>item.applicationId===application.id)};
  const appJson=JSON.stringify(applicationView).replaceAll("<","\\u003c"),capabilities=data.renderAuth.capabilities??[],canOperate=capabilities.some(value=>value==="*"||value==="business.operate"),canApprove=capabilities.some(value=>value==="*"||value==="proposal.approve");
  const typeOptions=application.objectTypes.map(type=>`<option value="${escapeHtml(type.id)}">${escapeHtml(type.name)}</option>`).join(""),filterTypeOptions=`<option value="">全部业务类型</option>${typeOptions}`,statusOptions=[...new Set(applicationView.objectTypes.flatMap(type=>[type.schema.initialStatus,...Object.keys(type.schema.transitions),...Object.values(type.schema.transitions).flat()]))].sort().map(status=>`<option value="${escapeHtml(status)}">${escapeHtml(status)}</option>`).join("");
  const financeControl=application.id==="finance-platform"?`<section><div class="section-head"><div><span class="eyebrow">Finance Control</span><h2>预算费用控制台</h2><p class="help">按正式预算、费用状态和 CONTROLS 关系计算工作流口径；不冒充总账余额。</p></div><span id="finance-control-source" class="pill">正在读取</span></div><div id="finance-control-summary" class="summary-grid"></div><div id="finance-control-currencies" class="panel" style="margin-top:12px"></div><div id="finance-control-budgets" class="panel" style="margin-top:12px"></div><div id="finance-control-unlinked" class="panel" style="margin-top:12px"></div></section>
  <script>(()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),money=(value,currency)=>new Intl.NumberFormat('zh-CN',{style:'currency',currency:currency||'CNY',maximumFractionDigits:2}).format(Number(value||0));fetch('/api/business/finance/control-report',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('finance control unavailable'))).then(body=>{document.getElementById('finance-control-summary').innerHTML=[['预算',body.summary.budgets,'正式预算记录'],['活动预算',body.summary.activeBudgets,'可建立费用控制关系'],['未挂预算费用',body.summary.unlinkedExpenses,'已进入流程但缺少 CONTROLS'],['超预算',body.summary.overCommittedBudgets,'已批及已付超出预算']].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong><small>'+item[2]+'</small></div>').join('');document.getElementById('finance-control-currencies').innerHTML='<div class="section-head"><h3>按币种汇总</h3><span class="status-label local">不跨币种合并</span></div><div class="simple-list">'+(body.currencies.length?body.currencies.map(item=>'<div class="simple-row"><strong>'+esc(item.currency)+'</strong><span>预算 '+money(item.budgetAmount,item.currency)+' · 已承诺 '+money(item.committedAmount,item.currency)+' · 待审 '+money(item.pendingAmount,item.currency)+' · 已付 '+money(item.paidAmount,item.currency)+'</span></div>').join(''):'<div class="empty-state"><strong>尚无预算数据</strong></div>')+'</div>';document.getElementById('finance-control-budgets').innerHTML='<div class="section-head"><h3>预算控制明细</h3><span class="status-label '+(body.summary.overCommittedBudgets?'blocked':'pass')+'">'+(body.summary.overCommittedBudgets?'存在超预算':'当前无超预算')+'</span></div>'+(body.budgets.length?'<table><thead><tr><th>预算</th><th>责任范围</th><th>预算金额</th><th>已承诺</th><th>待审暴露</th><th>工作流余量</th><th>费用</th></tr></thead><tbody>'+body.budgets.map(item=>'<tr><td><a class="quiet-link" href="'+esc(item.budget.href)+'">'+esc(item.budget.displayKey)+'</a><small>'+esc(item.budget.status)+'</small></td><td>'+esc(item.department)+'<small>'+esc(item.fiscalYear)+' · '+esc(item.budgetCode)+'</small></td><td>'+money(item.budgetAmount,item.currency)+'</td><td>'+money(item.committedAmount,item.currency)+'</td><td>'+money(item.pendingAmount,item.currency)+'</td><td><strong class="'+(item.overCommitted?'danger':'safe')+'">'+money(item.workflowHeadroom,item.currency)+'</strong><small>含待审后 '+money(item.projectedHeadroom,item.currency)+'</small></td><td>'+esc(item.linkedExpenses)+'<small>待审 '+esc(item.pendingExpenses)+' · 已批 '+esc(item.approvedExpenses)+' · 已付 '+esc(item.paidExpenses)+'</small></td></tr>').join('')+'</tbody></table>':'<div class="empty-state"><strong>尚无正式预算</strong>先建立并审批预算，再从 ACTIVE 预算创建或关联费用单。</div>');document.getElementById('finance-control-unlinked').innerHTML='<div class="section-head"><h3>控制缺口</h3><span class="status-label '+(body.unlinkedExpenses.length?'blocked':'pass')+'">'+esc(body.unlinkedExpenses.length)+' 项</span></div><div class="simple-list">'+(body.unlinkedExpenses.length?body.unlinkedExpenses.map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(item.displayKey)+' · '+esc(item.title)+'</strong><small>'+esc(item.status)+'</small></div><span>'+money(item.amount,item.currency)+'</span></a>').join(''):'<div class="empty-state"><strong>所有在途费用均已关联预算</strong></div>')+'</div><p class="help">工作流余量只使用已关联且状态为 APPROVED 或 PAID 的费用；待审金额单独展示，最终财务余额仍以权威总账为准。</p>';document.getElementById('finance-control-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{document.getElementById('finance-control-summary').innerHTML='';document.getElementById('finance-control-budgets').innerHTML='<div class="empty-state"><strong>预算费用控制数据暂不可用</strong></div>';document.getElementById('finance-control-source').textContent='数据源不可用';});})();</script>`:"";
  const hrControl=application.id==="human-resources-platform"?`<section><div class="section-head"><div><span class="eyebrow">Workforce Operations</span><h2>候选到入职流程控制台</h2><p class="help">基于正式 HR 对象和受控关系识别流程断点；不执行候选人排名或自动录用。</p></div><span id="hr-pipeline-source" class="pill">正在读取</span></div><div id="hr-pipeline-summary" class="summary-grid"></div><div id="hr-pipeline-stages" class="panel" style="margin-top:12px"></div><div id="hr-pipeline-issues" class="panel" style="margin-top:12px"></div></section><script>(()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels={CANDIDATE_CONSENT_WITHDRAWN:'候选人已撤回授权',CANDIDATE_CONSENT_PENDING:'候选人授权待确认',RECRUITMENT_LINK_MISSING:'候选申请未关联招聘需求',SELECTED_WITHOUT_OFFER:'已选候选人尚无录用通知',OFFER_WITHOUT_SELECTED_CANDIDATE:'录用通知缺少人工选定证据',ACCEPTED_OFFER_WITHOUT_ONBOARDING:'已接受录用但未建立入职流程',ONBOARDING_POSITION_AUTHORIZATION_MISSING:'入职缺少有效岗位授权',ONBOARDING_RECRUITMENT_EVIDENCE_MISSING:'入职缺少招聘完成证据',ONBOARDING_ACCEPTED_OFFER_MISSING:'入职缺少已接受录用证据',COMPLETED_ONBOARDING_WITHOUT_EMPLOYEE:'入职完成但未建立员工档案',RECRUITMENT_POSITION_MISSING:'招聘需求未关联有效岗位'};fetch('/api/business/hr/workforce-pipeline',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('HR pipeline unavailable'))).then(body=>{document.getElementById('hr-pipeline-summary').innerHTML=[['活动岗位',body.summary.activePositions,'批准编制 '+body.summary.approvedHeadcount],['在途招聘',body.summary.openRecruitments,'招聘流程中的需求'],['在途入职',body.summary.activeOnboarding,'准备、审批或待完成'],['控制断点',body.summary.controlIssues,'隐私、关系或流程缺口']].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></div>').join('');document.getElementById('hr-pipeline-stages').innerHTML='<div class="section-head"><h3>人员流程</h3><span class="status-label local">只展示聚合业务状态</span></div><div class="domain-flow">'+body.stages.map((item,index)=>(index?'<i>→</i>':'')+'<span>'+esc(item.label)+'<small>'+esc(item.active)+' 在途 / '+esc(item.total)+' 总计</small></span>').join('')+'</div>';document.getElementById('hr-pipeline-issues').innerHTML='<div class="section-head"><h3>需要处理的流程断点</h3><span class="status-label '+(body.issues.length?'blocked':'pass')+'">'+esc(body.issues.length)+' 项</span></div><div class="simple-list">'+(body.issues.length?body.issues.map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(labels[item.code]||item.code)+'</strong><small>'+esc(item.objectType)+' · '+esc(item.displayKey)+' · '+esc(item.status)+'</small></div><span>打开记录 →</span></a>').join(''):'<div class="empty-state"><strong>当前人员流程关系完整</strong></div>')+'</div><p class="help">本视图不复制候选人姓名、合同文件、身份核验或其他敏感证据；所有决策仍在原始记录和版本绑定审批中完成。</p>';document.getElementById('hr-pipeline-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{document.getElementById('hr-pipeline-summary').innerHTML='';document.getElementById('hr-pipeline-issues').innerHTML='<div class="empty-state"><strong>HR 流程数据暂不可用</strong></div>';document.getElementById('hr-pipeline-source').textContent='数据源不可用';});})();</script>`:"";
  const manufacturingControl=application.id==="intelligent-manufacturing-erp"?`<section><div class="section-head"><div><span class="eyebrow">Manufacturing Fulfillment</span><h2>订单到交付控制台</h2><p class="help">验证销售订单、计划、工程、生产、质量、成本和追溯的正式业务链，不推测制造 KPI。</p></div><span id="manufacturing-flow-source" class="pill">正在读取</span></div><div id="manufacturing-flow-summary" class="summary-grid"></div><div id="manufacturing-flow-stages" class="panel" style="margin-top:12px"></div><div id="manufacturing-flow-issues" class="panel" style="margin-top:12px"></div></section><script>(()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels={ACTIVE_ORDER_WITHOUT_PLAN:'活动订单缺少产销计划',ACTIVE_PLAN_WITHOUT_WORK_ORDER:'活动计划尚未形成生产工单',WORK_ORDER_BOM_MISSING:'生产工单缺少已放行 BOM',WORK_ORDER_SOP_MISSING:'生产工单缺少已放行 SOP',WORK_ORDER_WMS_EVIDENCE_MISSING:'生产工单缺少 WMS 库存证据',WORK_ORDER_MES_EXECUTION_MISSING:'生产工单缺少 MES 执行记录',COMPLETED_WORK_ORDER_COST_MISSING:'完工工单尚未形成制造成本',COMPLETED_WORK_ORDER_TRACE_MISSING:'完工工单尚未形成追溯复盘',MES_EXECUTION_WORK_ORDER_MISSING:'MES 记录缺少来源工单',MANUFACTURING_COST_WORK_ORDER_MISSING:'制造成本缺少完工工单',TRACE_WORK_ORDER_MISSING:'追溯复盘缺少完工工单',CRITICAL_QUALITY_CASE_OPEN:'关键质量事件尚未关闭'};fetch('/api/business/manufacturing/fulfillment-report',{cache:'no-store'}).then(response=>response.ok?response.json():Promise.reject(new Error('manufacturing flow unavailable'))).then(body=>{document.getElementById('manufacturing-flow-summary').innerHTML=[['活动订单',body.summary.activeOrders,'已进入履约'],['生产中',body.summary.inProduction,'正式生产工单'],['未结质量',body.summary.openQualityCases,'质量事件'],['控制断点',body.summary.controlIssues,'缺少业务关系或证据']].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></div>').join('');document.getElementById('manufacturing-flow-stages').innerHTML='<div class="section-head"><h3>订单履约链</h3><span class="status-label local">真实对象与关系</span></div><div class="domain-flow">'+body.stages.map((item,index)=>(index?'<i>→</i>':'')+'<span>'+esc(item.label)+'<small>'+esc(item.active)+' 在途 / '+esc(item.total)+' 总计</small></span>').join('')+'</div>';document.getElementById('manufacturing-flow-issues').innerHTML='<div class="section-head"><h3>需要处理的履约断点</h3><span class="status-label '+(body.issues.length?'blocked':'pass')+'">'+esc(body.issues.length)+' 项</span></div><div class="simple-list">'+(body.issues.length?body.issues.map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(labels[item.code]||item.code)+'</strong><small>'+esc(item.objectType)+' · '+esc(item.displayKey)+' · '+esc(item.status)+'</small></div><span>打开记录 →</span></a>').join(''):'<div class="empty-state"><strong>当前订单履约关系完整</strong></div>')+'</div><p class="help">本视图不计算交付率、OEE、库存周转或会计余额，也不自动放行生产、移动库存、关闭质量事件或过账成本。</p>';document.getElementById('manufacturing-flow-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{document.getElementById('manufacturing-flow-summary').innerHTML='';document.getElementById('manufacturing-flow-issues').innerHTML='<div class="empty-state"><strong>制造履约数据暂不可用</strong></div>';document.getElementById('manufacturing-flow-source').textContent='数据源不可用';});})();</script>`:"";
  const smartParkControl=application.id==="smart-park-platform"?`<section><div class="section-head"><div><span class="eyebrow">Smart Park Operations</span><h2>园区经营服务控制台</h2><p class="help">连接入园企业、空间、租约、表计、结算、服务工单和经营复盘的正式业务链。</p></div><span id="park-flow-source" class="pill">正在读取</span></div><div id="park-flow-summary" class="summary-grid"></div><div id="park-flow-stages" class="panel" style="margin-top:12px"></div><div id="park-flow-issues" class="panel" style="margin-top:12px"></div></section><script>(()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels={ACTIVE_ENTERPRISE_WITHOUT_LEASE:'活动企业尚无有效租约',ACTIVE_ENTERPRISE_WITHOUT_SERVICE_HISTORY:'活动企业尚无服务记录',OCCUPIED_SPACE_WITHOUT_LEASE:'已占用空间缺少租约',LEASE_ENTERPRISE_MISSING:'租约缺少入园企业',LEASE_SPACE_MISSING:'租约缺少园区空间',ACTIVE_LEASE_METER_MISSING:'有效租约缺少能源表计',ACTIVE_LEASE_BILL_MISSING:'有效租约尚未形成结算单',ACTIVE_METER_LEASE_MISSING:'活动表计缺少有效租约',ISSUED_BILL_LEASE_MISSING:'已出具结算单缺少租约',ENERGY_CHARGE_METER_MISSING:'能源费用缺少表计来源',SERVICE_ORDER_ENTERPRISE_MISSING:'服务工单缺少发起企业',SERVICE_COMPLETION_EVIDENCE_MISSING:'工单验收缺少完成证据'};fetch('/api/business/smart-park/operations-report',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('park flow unavailable'))).then(body=>{document.getElementById('park-flow-summary').innerHTML=[['在园企业',body.summary.activeEnterprises,'正式企业档案'],['有效租约',body.summary.activeLeases,'签约与续租'],['在途工单',body.summary.openServiceOrders,'服务处理队列'],['控制断点',body.summary.controlIssues,'缺少关系或证据']].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></div>').join('');document.getElementById('park-flow-stages').innerHTML='<div class="section-head"><h3>园区运营链</h3><span class="status-label local">真实对象与关系</span></div><div class="domain-flow">'+body.stages.map((item,index)=>(index?'<i>→</i>':'')+'<span>'+esc(item.label)+'<small>'+esc(item.active)+' 在途 / '+esc(item.total)+' 总计</small></span>').join('')+'</div>';document.getElementById('park-flow-issues').innerHTML='<div class="section-head"><h3>需要处理的运营断点</h3><span class="status-label '+(body.issues.length?'blocked':'pass')+'">'+esc(body.issues.length)+' 项</span></div><div class="simple-list">'+(body.issues.length?body.issues.map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(labels[item.code]||item.code)+'</strong><small>'+esc(item.objectType)+' · '+esc(item.displayKey)+' · '+esc(item.status)+'</small></div><span>打开记录 →</span></a>').join(''):'<div class="empty-state"><strong>当前园区运营关系完整</strong></div>')+'</div><p class="help">本视图不推算出租率、收缴率或 SLA，不自动签约、出账、扣款、派工或关闭工单。</p>';document.getElementById('park-flow-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{document.getElementById('park-flow-issues').innerHTML='<div class="empty-state"><strong>园区运营数据暂不可用</strong></div>';document.getElementById('park-flow-source').textContent='数据源不可用';});})();</script>`:"";
  const growthControl=application.id==="ai-growth-sales-platform"?`<section><div class="section-head"><div><span class="eyebrow">Growth Revenue Operations</span><h2>增长获客与客户全周期控制台</h2><p class="help">连接产品事实、内容矩阵、渠道发布、合规线索、客户、商机、交易交接和售后服务。</p></div><span id="growth-flow-source" class="pill">正在读取</span></div><div id="growth-flow-summary" class="summary-grid"></div><div id="growth-flow-stages" class="panel" style="margin-top:12px"></div><div id="growth-flow-issues" class="panel" style="margin-top:12px"></div></section><script>(()=>{const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),labels={CAMPAIGN_PRODUCT_MISSING:'营销活动缺少有效产品',CAMPAIGN_CONTENT_MISSING:'营销活动缺少事实约束内容',CAMPAIGN_PUBLISH_PLAN_MISSING:'营销活动缺少发布计划',VIDEO_MATRIX_MASTER_MISSING:'视频矩阵缺少已审批母版',PUBLISH_PLAN_CAMPAIGN_MISSING:'发布计划缺少来源活动',PUBLISH_PLAN_ASSET_MISSING:'发布计划缺少已审批内容',PUBLISH_PLAN_ACCOUNT_MISSING:'发布计划缺少有效渠道账号',LEAD_CONTACT_CONSENT_REJECTED:'线索已拒绝联系授权',QUALIFIED_LEAD_CUSTOMER_MISSING:'合格线索尚未建立客户',CONVERTED_LEAD_OPPORTUNITY_MISSING:'已转化线索尚未建立商机',OPPORTUNITY_SOURCE_MISSING:'商机缺少客户或线索来源',WON_OPPORTUNITY_HANDOFF_MISSING:'赢单商机尚未进入交易交接',TRANSACTION_OPPORTUNITY_MISSING:'交易交接缺少赢单商机',TRANSACTION_CUSTOMER_MISSING:'交易交接缺少有效客户',TRANSACTION_PRODUCT_MISSING:'交易交接缺少有效产品',TRANSACTION_SERVICE_MISSING:'已交接交易尚未建立售后服务',SERVICE_TRANSACTION_MISSING:'售后服务缺少交易来源'};fetch('/api/business/growth-sales/funnel-report',{cache:'no-store'}).then(r=>r.ok?r.json():Promise.reject(new Error('growth flow unavailable'))).then(body=>{document.getElementById('growth-flow-summary').innerHTML=[['合格线索',body.summary.qualifiedLeads,'具有授权与业务状态'],['活动客户',body.summary.customers,'正式客户记录'],['赢单商机',body.summary.wonOpportunities,'待交易交接'],['控制断点',body.summary.controlIssues,'缺少关系、授权或证据']].map(item=>'<div class="summary-card"><span>'+item[0]+'</span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></div>').join('');document.getElementById('growth-flow-stages').innerHTML='<div class="section-head"><h3>客户全周期链</h3><span class="status-label local">真实对象与关系</span></div><div class="domain-flow">'+body.stages.map((item,index)=>(index?'<i>→</i>':'')+'<span>'+esc(item.label)+'<small>'+esc(item.active)+' 在途 / '+esc(item.total)+' 总计</small></span>').join('')+'</div>';document.getElementById('growth-flow-issues').innerHTML='<div class="section-head"><h3>需要处理的增长断点</h3><span class="status-label '+(body.issues.length?'blocked':'pass')+'">'+esc(body.issues.length)+' 项</span></div><div class="simple-list">'+(body.issues.length?body.issues.map(item=>'<a class="simple-row" href="'+esc(item.href)+'"><div><strong>'+esc(labels[item.code]||item.code)+'</strong><small>'+esc(item.objectType)+' · '+esc(item.displayKey)+' · '+esc(item.status)+'</small></div><span>打开记录 →</span></a>').join(''):'<div class="empty-state"><strong>当前客户全周期关系完整</strong></div>')+'</div><p class="help">本视图不推算归因、转化率或收入，不自动注册账号、发布内容、联系客户、下单、收款或发送售后答复。</p>';document.getElementById('growth-flow-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(body.generatedAt).toLocaleString();}).catch(()=>{document.getElementById('growth-flow-issues').innerHTML='<div class="empty-state"><strong>增长销售数据暂不可用</strong></div>';document.getElementById('growth-flow-source').textContent='数据源不可用';});})();</script>`:"";
  return `<section class="product-hero"><div><span class="eyebrow">${escapeHtml(application.nameEn)}</span><h2>${escapeHtml(application.name)}</h2><p>面向${escapeHtml(application.personas.join("、"))}的独立业务应用。业务记录是正式事实，智能助手只负责分析、分配和推动流程。</p></div><span id="business-backend" class="status-label pending">● 正在连接业务数据</span></section>
  <section class="summary-grid"><div class="summary-card"><span>业务对象</span><strong>${application.objectTypes.length}</strong><small>${escapeHtml(application.objectTypes.map(type=>type.name).join(" · "))}</small></div><div class="summary-card"><span>首条智能流程</span><strong>1</strong><small>${escapeHtml(application.firstWorkflow)}</small></div><div class="summary-card"><span>Runtime 关闭时</span><strong>可用</strong><small>记录、查询和人工处理保持工作</small></div><div class="summary-card"><span>智能驱动</span><strong>受控</strong><small>Agent 与 Runner 通过统一 Kernel 执行</small></div></section>
  ${financeControl}
  ${hrControl}
  ${manufacturingControl}
  ${smartParkControl}
  ${growthControl}
  ${canOperate?`<details class="advanced-section" open><summary>新建业务记录</summary><div class="advanced-body"><div class="form-grid"><div><label for="business-type">业务类型</label><select id="business-type">${typeOptions}</select></div><div><label for="business-ref">业务编号</label><input id="business-ref" placeholder="可留空自动生成"></div><div style="grid-column:1/-1"><label for="business-title">标题</label><input id="business-title" placeholder="输入业务事项名称"></div><div id="business-domain-fields" class="form-grid" style="grid-column:1/-1"></div></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button id="business-create" class="primary" type="button">保存业务记录</button></div><p id="business-message" class="help"></p></div></details>`:""}
  <section><div class="section-head"><div><h2>业务运行概览</h2><p class="help">直接聚合当前应用的正式业务记录、工作项和审批，不推算财务或经营数值。</p></div><span id="business-report-source" class="pill">正在读取</span></div><div id="business-report-summary" class="summary-grid"></div><div id="business-report-status" class="panel"></div></section>
  <section><div class="section-head"><div><h2>业务台账</h2><p class="help">传统业务记录与状态。智能工作始终关联到这里的正式单据。</p></div><button id="business-refresh" class="secondary" type="button">刷新</button></div><div class="panel" style="margin-bottom:12px"><div class="form-grid"><div><label for="business-filter-query">查找业务记录</label><input id="business-filter-query" maxlength="100" placeholder="编号、标题或负责人"></div><div><label for="business-filter-type">业务类型</label><select id="business-filter-type">${filterTypeOptions}</select></div><div><label for="business-filter-status">状态</label><select id="business-filter-status"><option value="">全部状态</option>${statusOptions}</select></div><div><label for="business-filter-owner">负责人</label><input id="business-filter-owner" maxlength="100" placeholder="精确负责人 ID"></div></div><div class="button-row" style="justify-content:flex-end;margin-top:10px"><button id="business-filter-reset" class="secondary" type="button">清除条件</button><button id="business-filter-apply" class="primary" type="button">查询</button></div></div><div id="business-records" class="panel"><div class="empty-state"><strong>正在读取业务记录</strong></div></div><div id="business-pagination" class="button-row" style="justify-content:space-between;margin-top:10px"></div></section>
  <section class="panel"><div class="section-head"><div><h2>智能流程</h2><p class="help">${escapeHtml(application.firstWorkflow)}</p></div><a class="quiet-link" href="/work">查看我的工作 →</a></div><p>业务人员仍在本页面处理记录；需要分析、协作或自动推进时，可把指定记录委派给智能助手。</p></section>
  <dialog id="business-detail-dialog" style="width:min(1040px,94vw);max-height:90vh"><div class="section-head"><div><span class="eyebrow" id="business-detail-key">Business Record</span><h2 id="business-detail-title">业务对象详情</h2></div><button id="business-detail-close" class="secondary" type="button">关闭</button></div><div id="business-detail-content" style="max-height:75vh;overflow:auto"></div></dialog>
  <dialog id="business-delegation-dialog" style="width:min(860px,92vw);max-height:88vh"><div class="section-head"><div><span class="eyebrow">Agent Delegation Preflight</span><h2 id="business-delegation-title">智能工作执行方案</h2></div><button id="business-delegation-close" class="secondary" type="button">关闭</button></div><div id="business-delegation-content" style="max-height:64vh;overflow:auto"></div><div class="button-row" style="justify-content:flex-end;margin-top:14px"><button id="business-delegation-cancel" class="secondary" type="button">取消</button><button id="business-delegation-confirm" class="primary" type="button">确认委派</button></div></dialog>
  <script>(()=>{const app=${appJson},canOperate=${canOperate},canApprove=${canApprove},records=document.getElementById('business-records'),pagination=document.getElementById('business-pagination'),message=document.getElementById('business-message'),delegationDialog=document.getElementById('business-delegation-dialog'),delegationContent=document.getElementById('business-delegation-content'),delegationConfirm=document.getElementById('business-delegation-confirm'),listState={offset:0,limit:20},delegationState={recordId:null,version:null},esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));const call=async(url,options={})=>{const response=await fetch(url,{headers:{'content-type':'application/json'},...options}),body=await response.json();if(!response.ok)throw new Error(body.reason||body.status||'请求失败');return body;};
  const inputHtml=field=>{const attrs=' data-business-field="'+esc(field.key)+'" '+(field.required?'required ':'')+(field.min!==undefined?'min="'+field.min+'" ':'')+(field.max!==undefined?'max="'+field.max+'" ':'');if(field.type==='select')return '<select'+attrs+'>'+field.options.map(value=>'<option value="'+esc(value)+'">'+esc(value)+'</option>').join('')+'</select>';if(field.type==='textarea')return '<textarea rows="3"'+attrs+' placeholder="'+esc(field.placeholder||'')+'"></textarea>';return '<input type="'+esc(field.type||'text')+'"'+attrs+' placeholder="'+esc(field.placeholder||'')+'">';};
  const renderFields=()=>{const type=app.objectTypes.find(item=>item.id===document.getElementById('business-type').value),box=document.getElementById('business-domain-fields');box.innerHTML=type.schema.fields.map(field=>'<div'+(field.type==='textarea'?' style="grid-column:1/-1"':'')+'><label>'+esc(field.label)+(field.required?' *':'')+'</label>'+inputHtml(field)+'</div>').join('');};
  async function openDelegation(id){const plan=await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(id)+'/delegation-preview'),professional=plan.capabilityProtocol.professionalStage;delegationState.recordId=id;delegationState.version=plan.businessObject.version;document.getElementById('business-delegation-title').textContent=plan.businessObject.title;delegationContent.innerHTML='<section class="summary-grid"><div class="summary-card"><span>预检状态</span><strong>'+esc(plan.status)+'</strong><small>对象 v'+esc(plan.businessObject.version)+'</small></div><div class="summary-card"><span>智能流程</span><strong>'+esc(plan.workflow.domainName)+'</strong><small>'+esc(plan.workflow.definitionId)+'</small></div><div class="summary-card"><span>执行 Runtime</span><strong>'+esc(plan.policy.executionRuntime)+'</strong><small>真实 Runtime 保持关闭</small></div><div class="summary-card"><span>结果模式</span><strong>'+esc(plan.capabilityProtocol.outcomeMode)+'</strong><small>协议 '+esc(plan.capabilityProtocol.contractHash.slice(0,12))+'</small></div></section><section class="panel"><h3>执行目标</h3><p>'+esc(plan.goal)+'</p></section><section class="panel"><h3>通用流程 Agent · Skill · Runner</h3><p class="help">负责受控规划、处理、验证和报告，不替代专业业务判断。</p><div class="simple-list">'+plan.stages.map(stage=>'<div class="simple-row"><div><strong>'+esc(stage.stageId)+' · '+esc(stage.title)+'</strong><small>业务 Skill '+esc(stage.businessSkillId)+' · 实现 Skill '+esc(stage.skillContractId)+' / '+esc(stage.skillType)+'</small></div><div><span class="status-label '+(stage.status==='READY'?'pass':'blocked')+'">'+esc(stage.status)+'</span><small>Agent '+esc(stage.agentId||'—')+' · Runner '+esc(stage.workerKey||'—')+' ('+esc(stage.runnerMode)+')</small></div></div>').join('')+'</div></section>'+(professional?'<section class="panel"><h3>专业业务 Agent · Runner</h3><div class="simple-row"><div><strong>'+esc(professional.agentId)+' · '+esc(professional.businessSkillId)+'</strong><small>'+esc(professional.agentRole)+' · 输出 '+esc(professional.outputType)+'</small></div><div><span class="status-label pass">'+esc(professional.status)+'</span><small>Runner '+esc(professional.runnerId)+' · '+esc(professional.runtimeType)+' · 人工审批必须</small></div></div></section>':'<section class="attention-card panel"><strong>本对象尚无专业 Runner</strong><p>本次只能形成执行证据，不会声明已产生专业业务结果。</p></section>')+(plan.blockedReasons.length?'<section class="attention-card panel"><strong>当前不能委派</strong><p>'+esc(plan.blockedReasons.join(' · '))+'</p></section>':'');delegationConfirm.disabled=plan.status!=='READY';delegationDialog.showModal();}
  async function openDetail(id){
    const body=await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(id)),row=body.record,dialog=document.getElementById('business-detail-dialog'),content=document.getElementById('business-detail-content');
    document.getElementById('business-detail-key').textContent=row.displayKey+' · v'+row.version;document.getElementById('business-detail-title').textContent=row.title;
    const fields=row.schema.fields.map(field=>'<div class="simple-row"><strong>'+esc(field.label)+'</strong><span>'+esc(row.fields?.[field.key]??'—')+'</span></div>').join('');
    const editInput=field=>{const value=row.fields?.[field.key]??'',attrs=' data-edit-field="'+esc(field.key)+'" '+(field.required?'required ':'')+(field.min!==undefined?'min="'+field.min+'" ':'')+(field.max!==undefined?'max="'+field.max+'" ':'');if(field.type==='select')return'<select'+attrs+'>'+field.options.map(option=>'<option value="'+esc(option)+'" '+(option===value?'selected':'')+'>'+esc(option)+'</option>').join('')+'</select>';if(field.type==='textarea')return'<textarea rows="3"'+attrs+'>'+esc(value)+'</textarea>';return'<input type="'+esc(field.type||'text')+'" value="'+esc(value)+'"'+attrs+'>';},editForm=canOperate&&row.editable?'<details class="advanced-section" open><summary>编辑业务记录</summary><div class="advanced-body"><div class="form-grid"><div style="grid-column:1/-1"><label>标题 *</label><input id="business-edit-title" value="'+esc(row.title)+'" required></div><div><label>负责人 *</label><input id="business-edit-owner" value="'+esc(row.ownerId)+'" required></div><div><label>对象版本</label><input value="v'+esc(row.version)+'" disabled></div>'+row.schema.fields.map(field=>'<div'+(field.type==='textarea'?' style="grid-column:1/-1"':'')+'><label>'+esc(field.label)+(field.required?' *':'')+'</label>'+editInput(field)+'</div>').join('')+'</div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button class="primary" data-save-business-record="'+esc(row.id)+'" data-record-version="'+esc(row.version)+'">保存修改</button></div><p class="help">保存使用对象版本校验；审批中、运行中和终态记录不可编辑。</p></div></details>':'';
    const work=body.workItems.length?body.workItems.map(item=>{const evidence=(item.executionEvidence??[]).map(task=>'<div class="simple-row"><div><strong>'+esc(task.stageId||task.taskKey)+' · '+esc(task.businessSkillId||task.skillType||'Skill 未记录')+'</strong><small>Skill '+esc(task.skillType||'—')+' · Agent '+esc(task.agentId||'—')+'</small></div><div><span class="status-label '+(task.taskStatus==='SUCCEEDED'?'pass':task.taskStatus==='FAILED'||task.taskStatus==='BLOCKED'?'blocked':'local')+'">'+esc(task.taskStatus)+'</span><small>Runner '+esc(task.runner?.workerKey||task.plannedWorker||'—')+' · '+esc(task.runner?.runtimeType||'—')+' · Attempt '+esc(task.attempt?.number??'—')+' '+esc(task.attempt?.status||'')+(task.runtimeResult?' · Result '+esc(task.runtimeResult.status):'')+'</small></div></div>').join(''),outcome=item.resultSummary?.professionalOutcome,checks=outcome?(outcome.checks??[]).map(check=>'<div class="simple-row"><span>'+esc(check.code)+'</span><span class="status-label '+(check.status==='PASS'?'pass':'blocked')+'">'+esc(check.status)+'</span></div>').join(''):'',result=item.resultSummary?'<div class="attention-card" style="margin-top:8px"><strong>'+(item.resultSummary.businessOutcomeProduced?'专业业务结果已生成 · '+esc(outcome?.decision||'READY'):'本次仅形成执行证据')+'</strong><p>'+(outcome?'Skill '+esc(outcome.skillId)+' · Agent '+esc(outcome.agentId)+' · Runner '+esc(outcome.runnerId)+'<br>':'')+esc(item.resultSummary.runtimeMode)+' · 成功 '+esc(item.resultSummary.summary.succeededTasks)+' / '+esc(item.resultSummary.summary.totalTasks)+' · 下一步 '+esc(item.resultSummary.nextAction)+'</p>'+(checks?'<div class="simple-list">'+checks+'</div>':'')+'</div>':'';return '<article class="panel" style="margin-bottom:10px"><div class="simple-row"><div><strong>'+esc(item.title)+'</strong><small>'+esc(item.assignmentType==='AGENT'?'智能助手 / '+item.assigneeId:'业务人员 / '+item.assigneeId)+'</small></div><div><span class="status-label '+(item.status==='BLOCKED'?'blocked':item.status==='WAITING_APPROVAL'?'pending':'local')+'">'+esc(item.status)+'</span><small>'+(item.kernelGoalId?'Goal '+esc(item.kernelGoalId):'尚未进入 Kernel')+'</small></div></div>'+result+(evidence?'<div class="simple-list" style="margin-top:8px">'+evidence+'</div>':'')+'</article>';}).join(''):'<div class="empty-state"><strong>尚无工作项</strong></div>';
    const approvals=body.approvals.length?body.approvals.map(item=>'<div class="simple-row"><div><strong>'+esc(item.fromStatus)+' → '+esc(item.requestedStatus)+'</strong><small>'+esc(item.requestedBy)+' · '+esc(new Date(item.createdAt).toLocaleString())+'</small></div><div><span class="status-label '+(item.status==='APPROVED'?'pass':item.status==='REJECTED'?'blocked':'pending')+'">'+esc(item.status)+'</span>'+(canApprove&&item.status==='PENDING'?'<div class="button-row"><button class="primary" data-approval-decision="APPROVED" data-approval-id="'+esc(item.id)+'" data-record-id="'+esc(row.id)+'">批准</button><button class="secondary" data-approval-decision="REJECTED" data-approval-id="'+esc(item.id)+'" data-record-id="'+esc(row.id)+'">驳回</button></div>':'')+'</div></div>').join(''):'<div class="empty-state"><strong>尚无审批</strong></div>';
    const relations=body.relations.length?body.relations.map(item=>'<a class="simple-row" href="'+esc(item.record.href)+'"><div><strong>'+esc(item.record.title)+'</strong><small>'+esc(item.record.displayKey)+' · '+esc(item.relationType)+'</small></div><div><span class="status-label local">'+esc(item.direction==='OUTGOING'?'下游':'上游')+'</span><small>'+esc(item.record.status)+'</small></div></a>').join(''):'<div class="empty-state"><strong>尚无上下游单据</strong></div>';
    const relationForm=canOperate&&body.relationOptions.length?'<div class="button-row" style="margin-top:12px"><select id="business-relation-option">'+body.relationOptions.map((item,index)=>'<option value="'+index+'">'+esc(item.contract.label)+'：'+esc(item.record.displayKey)+' · '+esc(item.record.title)+'</option>').join('')+'</select><button class="secondary" data-create-relation="'+esc(row.id)+'">建立关联</button></div>':'';
    const allDownstreamContracts=app.relationContracts.filter(item=>item.sourceType===row.objectType),downstreamContracts=allDownstreamContracts.filter(item=>item.sourceStatuses.includes(row.status)),downstreamForm=canOperate&&downstreamContracts.length?'<details class="advanced-section" style="margin-top:12px"><summary>创建下游业务单据</summary><div class="advanced-body"><div class="form-grid"><div><label>业务流转</label><select id="business-related-contract">'+downstreamContracts.map((item,index)=>'<option value="'+index+'">'+esc(item.label)+'</option>').join('')+'</select></div><div><label>下游业务编号 *</label><input id="business-related-key" required placeholder="用于防止重复创建"></div><div style="grid-column:1/-1"><label>下游业务标题 *</label><input id="business-related-title" required></div><div id="business-related-fields" class="form-grid" style="grid-column:1/-1"></div></div><div class="button-row" style="justify-content:flex-end;margin-top:12px"><button class="primary" data-create-related-record="'+esc(row.id)+'">创建并建立业务链</button></div><p class="help">所有必填业务事实必须由业务人员填写；创建单据、建立关系和审计记录在同一事务完成。</p></div></details>':canOperate&&allDownstreamContracts.length?'<p class="help">当前状态 '+esc(row.status)+' 尚不能创建下游单据；请先完成上游业务流程。</p>':'';
    const eventLabel=type=>type==='business.record.note.added'?'业务备注':type==='business.work.delegation-approved'?'委派方案已确认':type,events=body.timeline.length?body.timeline.map(event=>'<div class="simple-row"><div><strong>'+esc(eventLabel(event.type))+'</strong><small>'+esc(event.actorId)+' · '+esc(new Date(event.createdAt).toLocaleString())+'</small></div><div><span>v'+esc(event.objectVersion??'—')+'</span><small>'+esc(Object.values(event.payload||{}).filter(value=>typeof value!=='object').join(' · '))+'</small></div></div>').join(''):'<div class="empty-state"><strong>尚无事件</strong></div>',noteForm=canOperate?'<div class="form-grid" style="margin-top:12px"><div style="grid-column:1/-1"><label for="business-record-note">添加处理备注</label><textarea id="business-record-note" rows="3" maxlength="2000" placeholder="记录业务判断、交接信息或处理结论；请勿填写密码、Token 或密钥。"></textarea></div></div><div class="button-row" style="justify-content:flex-end;margin-top:8px"><button class="secondary" data-add-business-note="'+esc(row.id)+'" data-record-version="'+esc(row.version)+'">写入时间线</button></div><p class="help">备注绑定当前对象版本且不可修改；记录更新后需刷新再提交。</p>':'';
    content.dataset.recordId=row.id;content.dataset.relationOptions=JSON.stringify(body.relationOptions);content.dataset.downstreamContracts=JSON.stringify(downstreamContracts);
    content.innerHTML='<section class="summary-grid"><div class="summary-card"><span>当前状态</span><strong>'+esc(row.status)+'</strong><small>正式业务状态</small></div><div class="summary-card"><span>负责人</span><strong>'+esc(row.ownerId)+'</strong><small>业务责任人</small></div><div class="summary-card"><span>工作项</span><strong>'+body.workItems.length+'</strong><small>人工与 Agent</small></div><div class="summary-card"><span>上下游单据</span><strong>'+body.relations.length+'</strong><small>正式业务关系</small></div></section><section class="panel"><h3>业务字段</h3><div class="simple-list">'+fields+'</div></section><section class="panel"><h3>上下游业务链</h3><div class="simple-list">'+relations+'</div>'+relationForm+downstreamForm+'</section><section class="panel"><h3>业务审批</h3><div class="simple-list">'+approvals+'</div></section><section class="panel"><h3>工作与 Runner 证据</h3><div class="simple-list">'+work+'</div></section><section class="panel"><h3>业务时间线</h3>'+noteForm+'<div class="simple-list">'+events+'</div></section>';
    const liveExecutions=body.workItems.filter(item=>item.execution);if(liveExecutions.length)content.insertAdjacentHTML('beforeend','<section class="panel"><h3>在线执行状态</h3><p class="help">来自统一 Kernel 的安全投影；详情保持当前窗口打开时可刷新查看。</p><div class="simple-list">'+liveExecutions.map(item=>{const run=item.execution,active=run.currentStages?.[0];return'<div class="simple-row"><div><strong>'+esc(item.title)+'</strong><small>'+(active?'当前 '+esc(active.stageId)+' · Skill '+esc(active.businessSkillId||'—')+' · Agent '+esc(active.agentId||'—'):'无活动阶段')+'</small></div><div><span class="status-label '+(run.phase==='COMPLETED'?'pass':run.phase==='BLOCKED'?'blocked':'pending')+'">'+esc(run.phase)+'</span><small>'+esc(run.progress.succeeded)+' / '+esc(run.progress.total)+' 阶段 · '+esc(run.progress.percent)+'% · '+esc(run.source)+'</small></div></div>';}).join('')+'</div></section>');
    const approvedPlans=body.workItems.filter(item=>item.delegationPlan);if(approvedPlans.length)content.insertAdjacentHTML('beforeend','<section class="panel"><h3>已批准智能执行方案</h3><p class="help">来自不可变委派审计；只展示业务安全字段，不暴露凭据、租约或 Fencing。</p><div class="simple-list">'+approvedPlans.map(item=>'<div><div class="simple-row"><div><strong>'+esc(item.delegationPlan.domainId)+' · '+esc(item.delegationPlan.workflowDefinitionId)+'</strong><small>对象 v'+esc(item.delegationPlan.businessObjectVersion)+' · '+esc(item.delegationPlan.stages.length)+' 阶段 · 回写 '+esc(item.delegationPlan.expectedWritebackStatus)+'</small></div><div><span class="status-label pass">已批准</span><small>'+esc(item.delegationPlan.executionRuntime)+'</small></div></div>'+item.delegationPlan.stages.map(stage=>'<div class="simple-row"><div><strong>'+esc(stage.stageId)+' · '+esc(stage.businessSkillId)+'</strong><small>Skill '+esc(stage.skillType)+' · Agent '+esc(stage.agentId)+'</small></div><div><span class="status-label '+(stage.status==='READY'?'pass':'blocked')+'">'+esc(stage.status)+'</span><small>Runner '+esc(stage.workerKey)+' · '+esc(stage.runnerMode)+'</small></div></div>').join('')+'</div>').join('')+'</div></section>');
    if(editForm)content.querySelector('section.panel')?.insertAdjacentHTML('beforebegin',editForm);const relatedSelect=document.getElementById('business-related-contract'),renderRelatedFields=()=>{if(!relatedSelect)return;const contract=downstreamContracts[Number(relatedSelect.value)],target=app.objectTypes.find(item=>item.id===contract.targetType),box=document.getElementById('business-related-fields');box.innerHTML=target.schema.fields.map(field=>'<div'+(field.type==='textarea'?' style="grid-column:1/-1"':'')+'><label>'+esc(field.label)+(field.required?' *':'')+'</label>'+inputHtml(field).replaceAll('data-business-field','data-related-field')+'</div>').join('');};if(relatedSelect){relatedSelect.onchange=renderRelatedFields;renderRelatedFields();}dialog.showModal();
  }
  document.getElementById('business-detail-content').addEventListener('click',async event=>{const save=event.target.closest('[data-save-business-record]');if(!save)return;event.stopImmediatePropagation();try{const fields={};document.querySelectorAll('[data-edit-field]').forEach(input=>{fields[input.dataset.editField]=input.value;});await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(save.dataset.saveBusinessRecord),{method:'PATCH',body:JSON.stringify({expectedVersion:Number(save.dataset.recordVersion),title:document.getElementById('business-edit-title').value,ownerId:document.getElementById('business-edit-owner').value,fields})});await load();await loadReport();await openDetail(save.dataset.saveBusinessRecord);}catch(error){if(message)message.textContent=error.message;}});
  document.getElementById('business-detail-content').addEventListener('click',async event=>{const button=event.target.closest('[data-add-business-note]');if(!button)return;event.stopImmediatePropagation();try{await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(button.dataset.addBusinessNote)+'/notes',{method:'POST',body:JSON.stringify({expectedVersion:Number(button.dataset.recordVersion),text:document.getElementById('business-record-note').value})});await openDetail(button.dataset.addBusinessNote);}catch(error){if(message)message.textContent=error.message;}});
  document.getElementById('business-detail-content').addEventListener('click',async event=>{const button=event.target.closest('[data-create-relation]'),createRelated=event.target.closest('[data-create-related-record]');if(!button&&!createRelated)return;event.stopImmediatePropagation();try{const content=document.getElementById('business-detail-content');if(createRelated){const rowId=content.dataset.recordId,contracts=JSON.parse(content.dataset.downstreamContracts||'[]'),selected=contracts[Number(document.getElementById('business-related-contract').value)],fields={};if(!selected)return;document.querySelectorAll('#business-related-fields [data-related-field]').forEach(input=>{if(input.value!=='')fields[input.dataset.relatedField]=input.value;});await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(rowId)+'/related-records',{method:'POST',body:JSON.stringify({objectType:selected.targetType,relationType:selected.relationType,title:document.getElementById('business-related-title').value,displayKey:document.getElementById('business-related-key').value,fields})});await load();await loadReport();await openDetail(rowId);return;}const options=JSON.parse(content.dataset.relationOptions||'[]'),selected=options[Number(document.getElementById('business-relation-option').value)];if(!selected)return;const sourceId=selected.direction==='OUTGOING'?content.dataset.recordId:selected.record.id,targetRecordId=selected.direction==='OUTGOING'?selected.record.id:content.dataset.recordId;await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(sourceId)+'/relations',{method:'POST',body:JSON.stringify({targetRecordId,relationType:selected.contract.relationType})});await openDetail(content.dataset.recordId);}catch(error){if(message)message.textContent=error.message;}});
  async function load(){const params=new URLSearchParams({limit:String(listState.limit),offset:String(listState.offset)}),query=document.getElementById('business-filter-query').value.trim(),objectType=document.getElementById('business-filter-type').value,status=document.getElementById('business-filter-status').value,ownerId=document.getElementById('business-filter-owner').value.trim();if(query)params.set('q',query);if(objectType)params.set('objectType',objectType);if(status)params.set('status',status);if(ownerId)params.set('ownerId',ownerId);const body=await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records?'+params),backend=document.getElementById('business-backend');backend.textContent=body.backend==='POSTGRESQL'?'● 事务数据库':'● 本地数据';backend.className='status-label '+(body.backend==='POSTGRESQL'?'pass':'pending');records.innerHTML=body.records.length?'<table><thead><tr><th>编号</th><th>业务事项</th><th>关键数据</th><th>负责人</th><th>状态</th><th>下一步</th></tr></thead><tbody>'+body.records.map(row=>{const detail=Object.entries(row.fields||{}).slice(0,3).map(([key,value])=>{const label=row.schema.fields.find(field=>field.key===key)?.label||key;return esc(label)+'：'+esc(value);}).join(' · '),review=row.schema.agentReviewStatus,canDelegate=row.availableTransitions.includes(review),actions=row.availableTransitions.map(status=>'<button class="secondary" '+(row.status==='WAITING_APPROVAL'?'data-request-approval="'+esc(status)+'"':'data-transition="'+esc(status)+'"')+' data-id="'+esc(row.id)+'" data-version="'+row.version+'">'+(row.status==='WAITING_APPROVAL'?'提请 '+esc(status):esc(status))+'</button>').join('');return '<tr id="record-'+esc(row.id)+'"><td><button class="quiet-link" data-detail="'+esc(row.id)+'">'+esc(row.displayKey)+'</button></td><td><strong>'+esc(row.title)+'</strong><small>'+esc(app.objectTypes.find(x=>x.id===row.objectType)?.name||row.objectType)+'</small></td><td>'+detail+'</td><td>'+esc(row.ownerId)+'</td><td><span class="status-label local">'+esc(row.status)+'</span></td><td>'+(canOperate?'<div class="button-row">'+actions+'<button class="secondary" data-assign="HUMAN" data-id="'+esc(row.id)+'">分配给我</button>'+(canDelegate?'<button class="primary" data-assign="AGENT" data-id="'+esc(row.id)+'" data-version="'+esc(row.version)+'">委派智能助手</button>':'')+'</div>':'—')+'</td></tr>';}).join('')+'</tbody></table>':'<div class="empty-state"><strong>没有符合条件的业务记录</strong>调整筛选条件，或新建业务记录。</div>';const page=Math.floor(body.pagination.offset/body.pagination.limit)+1,pages=Math.max(1,Math.ceil(body.pagination.total/body.pagination.limit));pagination.innerHTML='<span class="help">共 '+esc(body.pagination.total)+' 条 · 第 '+page+' / '+pages+' 页</span><div class="button-row"><button class="secondary" data-business-page="prev" '+(body.pagination.offset===0?'disabled':'')+'>上一页</button><button class="secondary" data-business-page="next" '+(!body.pagination.hasMore?'disabled':'')+'>下一页</button></div>';}
  if(canOperate){const type=document.getElementById('business-type');type.onchange=renderFields;renderFields();document.getElementById('business-create').onclick=async()=>{try{const fields={};document.querySelectorAll('[data-business-field]').forEach(input=>{if(input.value!=='')fields[input.dataset.businessField]=input.value;});await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records',{method:'POST',body:JSON.stringify({objectType:type.value,title:document.getElementById('business-title').value,displayKey:document.getElementById('business-ref').value,fields})});message.textContent='业务记录已保存。';document.getElementById('business-title').value='';renderFields();listState.offset=0;await load();await loadReport();}catch(error){message.textContent=error.message;}};}async function loadReport(){const body=await call('/api/business/applications/'+encodeURIComponent(app.id)+'/report'),report=body.report,cards=[['业务记录',report.totalRecords,'正式业务对象'],['需关注',report.attention,'异常业务状态'],['待审批',report.pendingApprovals,'版本绑定审批'],['Agent 工作',report.work.agent,'已委派工作项']];document.getElementById('business-report-summary').innerHTML=cards.map(item=>'<div class="summary-card"><span>'+esc(item[0])+'</span><strong>'+esc(item[1])+'</strong><small>'+esc(item[2])+'</small></div>').join('');const statuses=Object.entries(report.byStatus);document.getElementById('business-report-status').innerHTML='<div class="section-head"><h3>状态分布</h3><span class="status-label '+(report.attention?'blocked':'pass')+'">'+(report.attention?'存在需关注事项':'当前无异常')+'</span></div><div class="simple-list">'+(statuses.length?statuses.map(item=>'<div class="simple-row"><strong>'+esc(item[0])+'</strong><span>'+esc(item[1])+'</span></div>').join(''):'<div class="empty-state"><strong>尚无业务数据</strong></div>')+'</div>';document.getElementById('business-report-source').textContent=(body.backend==='POSTGRESQL'?'事务数据库':'本地数据')+' · '+new Date(report.generatedAt).toLocaleString();}records.onclick=async event=>{const detail=event.target.closest('[data-detail]'),approval=event.target.closest('[data-request-approval]'),assign=event.target.closest('[data-assign]'),transition=event.target.closest('[data-transition]');try{if(detail){await openDetail(detail.dataset.detail);return;}if(approval)await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(approval.dataset.id)+'/approvals',{method:'POST',body:JSON.stringify({expectedVersion:Number(approval.dataset.version),requestedStatus:approval.dataset.requestApproval})});if(assign?.dataset.assign==='AGENT'){await openDelegation(assign.dataset.id);return;}if(assign)await call('/api/business/applications/'+encodeURIComponent(app.id)+'/work',{method:'POST',body:JSON.stringify({businessObjectId:assign.dataset.id,assignmentType:'HUMAN',assigneeId:'${escapeHtml(data.renderAuth.user?.user_id??"unknown")}'})});if(transition)await call('/api/business/applications/'+encodeURIComponent(app.id)+'/records/'+encodeURIComponent(transition.dataset.id)+'/transition',{method:'POST',body:JSON.stringify({expectedVersion:Number(transition.dataset.version),status:transition.dataset.transition})});await load();await loadReport();}catch(error){if(message)message.textContent=error.message;}};document.getElementById('business-detail-content').onclick=async event=>{const button=event.target.closest('[data-approval-decision]');if(!button)return;try{await call('/api/business/applications/'+encodeURIComponent(app.id)+'/approvals/'+encodeURIComponent(button.dataset.approvalId)+'/decision',{method:'POST',body:JSON.stringify({decision:button.dataset.approvalDecision})});await load();await loadReport();await openDetail(button.dataset.recordId);}catch(error){if(message)message.textContent=error.message;}};delegationConfirm.onclick=async()=>{delegationConfirm.disabled=true;try{await call('/api/business/applications/'+encodeURIComponent(app.id)+'/work',{method:'POST',body:JSON.stringify({businessObjectId:delegationState.recordId,assignmentType:'AGENT',assigneeId:'agent-business-operator',expectedObjectVersion:Number(delegationState.version)})});delegationDialog.close();await load();await loadReport();}catch(error){if(message)message.textContent=error.message;delegationDialog.close();}finally{delegationConfirm.disabled=false;}};document.getElementById('business-delegation-close').onclick=()=>delegationDialog.close();document.getElementById('business-delegation-cancel').onclick=()=>delegationDialog.close();pagination.onclick=event=>{const button=event.target.closest('[data-business-page]');if(!button||button.disabled)return;listState.offset=Math.max(0,listState.offset+(button.dataset.businessPage==='next'?listState.limit:-listState.limit));load().catch(error=>records.textContent=error.message);};const applyFilter=()=>{listState.offset=0;load().catch(error=>records.textContent=error.message);};document.getElementById('business-filter-apply').onclick=applyFilter;document.getElementById('business-filter-query').onkeydown=event=>{if(event.key==='Enter')applyFilter();};document.getElementById('business-filter-reset').onclick=()=>{for(const id of ['business-filter-query','business-filter-type','business-filter-status','business-filter-owner'])document.getElementById(id).value='';applyFilter();};document.getElementById('business-detail-close').onclick=()=>document.getElementById('business-detail-dialog').close();document.getElementById('business-refresh').onclick=()=>Promise.all([load(),loadReport()]).catch(error=>records.textContent=error.message);Promise.all([load(),loadReport()]).then(()=>{const requested=new URLSearchParams(location.search).get('record');if(requested)return openDetail(requested);}).catch(error=>records.textContent=error.message);})();</script>`;
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

function pageCadCenter() {
  return `<section class="hero"><div><span class="eyebrow">Engineering CAD Center · CAD-001</span><h1>工程图纸分析中心</h1><p>接收 DXF、DWG、IFC 与 PDF 工程图纸，完成安全格式检测；当前仅 ASCII DXF 已接通解析与预览，其他格式不会被冒充为可分析。</p></div><span class="status-label pass">DXF Foundation READY</span></section>
  <section><div class="section-head"><div><h2>图纸预览</h2><p class="help">选择、拖拽或粘贴文件；文件仅发送到当前 Studio 进程，单次上限 10MB，不接受任意服务器路径。</p></div><span class="pill">DWG / IFC / PDF 可接收检测 · 解析适配器未启用</span></div>
  <div class="kanban-grid cad-workbench"><div class="panel"><input id="cad-file" type="file" accept=".dxf,.dwg,.ifc,.pdf,application/dxf,application/acad,application/x-dwg,application/pdf" hidden><div id="cad-dropzone" class="cad-dropzone" role="button" tabindex="0" aria-label="添加工程图纸" aria-describedby="cad-upload-help"><div><span class="cad-drop-icon" aria-hidden="true">＋</span><strong>拖入图纸，或点击选择</strong><span id="cad-upload-help">也可复制文件后在此粘贴 · 单个文件最大 10MB</span><div class="cad-format-row"><span class="cad-format ready">DXF 可分析</span><span class="cad-format">DWG 检测</span><span class="cad-format">IFC 检测</span><span class="cad-format">PDF 检测</span></div></div></div><div id="cad-file-card" class="cad-file-card"><span id="cad-file-type" class="cad-file-icon">CAD</span><div class="cad-file-meta"><strong id="cad-file-name"></strong><span id="cad-file-detail"></span></div><button id="cad-file-remove" class="secondary cad-file-remove" type="button" aria-label="移除已选文件">移除</button></div><div class="button-row"><button id="cad-analyze" class="primary-action" type="button" disabled>分析图纸</button><button id="cad-paste" class="secondary" type="button">从剪贴板粘贴</button></div><p id="cad-message" class="help cad-message" role="status" aria-live="polite">等待添加工程图纸</p><div id="cad-stats" class="summary-grid"></div></div><div class="panel"><div id="cad-preview" style="min-height:320px;display:grid;place-items:center;overflow:auto;color:var(--accent)"><span class="help">DXF 分析完成后将在这里显示预览</span></div></div></div>
  <div class="panel" style="margin-top:12px"><div class="section-head"><h3>Unified CAD JSON</h3><span class="status-label local">只读结果</span></div><pre id="cad-json" style="max-height:420px;overflow:auto">{}</pre></div></section>
  <script>(()=>{const input=document.getElementById('cad-file'),dropzone=document.getElementById('cad-dropzone'),button=document.getElementById('cad-analyze'),pasteButton=document.getElementById('cad-paste'),removeButton=document.getElementById('cad-file-remove'),card=document.getElementById('cad-file-card'),name=document.getElementById('cad-file-name'),detail=document.getElementById('cad-file-detail'),type=document.getElementById('cad-file-type'),message=document.getElementById('cad-message'),stats=document.getElementById('cad-stats'),preview=document.getElementById('cad-preview'),output=document.getElementById('cad-json'),allowed=new Set(['dxf','dwg','ifc','pdf']),maxBytes=10*1024*1024,esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c])),extension=value=>String(value??'').split('.').pop().toLowerCase(),formatBytes=value=>value<1024?value+' B':value<1048576?(value/1024).toFixed(1)+' KB':(value/1048576).toFixed(1)+' MB';let selected=null;const setMessage=(text,state='')=>{message.textContent=text;message.className='help cad-message '+state;},resetResults=()=>{stats.innerHTML='';preview.innerHTML='<span class="help">DXF 分析完成后将在这里显示预览</span>';output.textContent='{}';},selectFile=candidate=>{const ext=extension(candidate?.name);if(!candidate||!allowed.has(ext)){setMessage('仅支持 DXF、DWG、IFC 或 PDF 文件。','error');return false;}if(candidate.size>maxBytes){setMessage('文件超过 10MB 上限，请选择较小文件。','error');return false;}selected=candidate;name.textContent=candidate.name;detail.textContent=formatBytes(candidate.size)+' · '+ext.toUpperCase()+(ext==='dxf'?' · 可分析':' · 可检测，解析适配器未启用');type.textContent=ext.toUpperCase();card.classList.add('visible');button.disabled=false;setMessage(ext==='dxf'?'文件已就绪，可以开始分析。':'文件已接收；将执行格式检测，但当前不能生成解析结果。',ext==='dxf'?'success':'warning');resetResults();return true;},clearFile=()=>{selected=null;input.value='';card.classList.remove('visible');button.disabled=true;setMessage('等待添加工程图纸');resetResults();};dropzone.onclick=()=>input.click();dropzone.onkeydown=event=>{if(event.key==='Enter'||event.key===' '){event.preventDefault();input.click();}};input.onchange=()=>selectFile(input.files[0]);['dragenter','dragover'].forEach(eventName=>dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.add('drag-active');}));['dragleave','drop'].forEach(eventName=>dropzone.addEventListener(eventName,event=>{event.preventDefault();dropzone.classList.remove('drag-active');}));dropzone.addEventListener('drop',event=>{const files=[...(event.dataTransfer?.files??[])];if(files.length>1)setMessage('一次仅处理一个文件，已选取第一个支持的工程图纸。','warning');const candidate=files.find(item=>allowed.has(extension(item.name)))??files[0];selectFile(candidate);});const acceptPaste=event=>{const files=[...(event.clipboardData?.files??[])];if(!files.length)return;event.preventDefault();const candidate=files.find(item=>allowed.has(extension(item.name)))??files[0];selectFile(candidate);};dropzone.addEventListener('paste',acceptPaste);document.addEventListener('paste',event=>{if(document.activeElement?.matches('input,textarea,[contenteditable=true]'))return;acceptPaste(event);});pasteButton.onclick=async()=>{try{if(!navigator.clipboard?.read)throw new Error('CLIPBOARD_API_UNAVAILABLE');const items=await navigator.clipboard.read();for(const item of items){const mime=item.types.find(value=>value!=='text/plain'&&value!=='text/html');if(mime){const blob=await item.getType(mime),ext=mime==='application/pdf'?'pdf':'';return selectFile(new File([blob],blob.name||('clipboard-file'+(ext?'.'+ext:'')),{type:mime}));}}setMessage('剪贴板中没有可用的工程图纸文件。','warning');}catch(error){setMessage('浏览器未授权直接读取剪贴板。请先复制文件，再在上传区域按 Cmd/Ctrl+V。','warning');dropzone.focus();}};removeButton.onclick=clearFile;button.onclick=async()=>{if(!selected){setMessage('请先添加工程图纸。','error');return;}button.disabled=true;setMessage(extension(selected.name)==='dxf'?'正在安全解析…':'正在检测文件与适配器状态…');try{const bytes=new Uint8Array(await selected.arrayBuffer());let binary='';for(let i=0;i<bytes.length;i+=32768)binary+=String.fromCharCode(...bytes.subarray(i,i+32768));const response=await fetch('/api/cad/analyze',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({filename:selected.name,contentBase64:btoa(binary)})}),body=await response.json();if(!response.ok){const friendly=body.status==='CAD_ADAPTER_UNAVAILABLE'?'格式有效，但 '+extension(selected.name).toUpperCase()+' 解析适配器尚未启用。':body.reason;throw new Error(body.status+': '+friendly);}const s=body.document.statistics;stats.innerHTML=[['实体',s.entityCount],['图层',Object.keys(s.byLayer).length],['总长度',s.totalLength.toFixed(3)],['总面积',s.totalArea.toFixed(3)]].map(x=>'<div class="summary-card"><span>'+x[0]+'</span><strong>'+esc(x[1])+'</strong></div>').join('');preview.innerHTML=body.previewSvg;output.textContent=JSON.stringify(body.document,null,2);setMessage('分析完成 · '+body.document.metadata.parser,'success');}catch(error){setMessage(error.message,'error');stats.innerHTML='';preview.innerHTML='<span class="help">当前文件无法生成预览</span>';}finally{button.disabled=!selected;}};})();</script>`;
}

function pageGraphicDesign(data) {
  const project = data.active_project_id ?? "anksen-agent-studio";
  const createHref = routeHref("/actions", project) + `&goal=${encodeURIComponent("创建平面设计任务：请分析 Brief、选择设计系统、生成视觉方案，并交付可编辑 PSD、PNG 预览和 PDF")}`;
  const stages = [
    ["01", "创意 Brief", "品牌、受众、渠道、尺寸与交付目标"],
    ["02", "设计系统", "色彩、字体、网格、层级与风格参考"],
    ["03", "视觉概念", "构图、素材、文案与可审查方向稿"],
    ["04", "Photoshop 精修", "可编辑图层、智能对象、调色与版式"],
    ["05", "质量验证", "尺寸、分辨率、色彩模式、图层和文件完整性"],
    ["06", "多格式交付", "PSD、PNG、PDF、预览和交付说明"]
  ];
  return `<section class="product-hero"><div><span class="eyebrow">Graphic Design Studio</span><h2>平面设计工作室</h2><p>从一句自然语言 Brief 开始，统一编排设计系统、视觉生成、Photoshop 可编辑生产、质量验证和多格式交付。Photoshop 是专业执行器，任务和状态仍由 Studio 统一管理。</p></div><a class="primary-link" href="${escapeHtml(createHref)}">新建设计任务</a></section>
  <section><div class="section-head"><div><h2>设计生产流</h2><p class="help">一个领域工作流，共享 Studio Planner、Kernel、Scheduler、Worker、审批与报告。</p></div><span class="status-label local">领域已注册</span></div><div class="domain-grid">${stages.map(([index,title,detail])=>`<article class="domain-card"><div class="domain-card-head"><span class="domain-icon">${index}</span><span class="status-label ${index==="04"?"blocked":"ready"}">${index==="04"?"等待节点":"已定义"}</span></div><h3>${title}</h3><p>${detail}</p></article>`).join("")}</div></section>
  <section class="grid"><div class="panel"><div class="section-head small"><h3>Photoshop UXP</h3><span class="status-label blocked">未激活</span></div><p>插件、任务 Schema、PSD/PNG/PDF 构建和产物校验已经具备；真实执行需要 Photoshop 运行、UXP 插件加载和交互会话确认。</p></div><div class="panel"><div class="section-head small"><h3>设计系统资源</h3><span class="status-label pass">74 个参考</span></div><p>可从 awesome-design-md 选择风格参考；内容按不可信只读资源加载，不覆盖项目 DESIGN.md，也不复制品牌身份。</p></div><div class="panel"><div class="section-head small"><h3>交付标准</h3><span class="status-label ready">可验证</span></div><p>默认要求可编辑 PSD、PNG 预览、印刷/数字 PDF、设计说明和 SHA256 产物清单。</p></div></section>
  <details class="advanced-section"><summary>领域边界与运行条件</summary><div class="advanced-body"><p>平面设计领域负责创意和交付合同；Photoshop UXP 只执行已批准的白名单文档操作。当前 Adapter 保持 disabled，因此系统会如实阻塞 Photoshop 阶段，不会用预览或模拟结果冒充真实 PSD 生产。</p></div></details>`;
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
    dashboard: () => pageWorkstation(data),
    cockpit: () => pageDashboard(model, data),
    work: () => pageMyWork(data),
    strategy: () => pageBusinessApplication(getEnterpriseApplication("enterprise-strategy-platform"),data),
    hr: () => pageBusinessApplication(getEnterpriseApplication("human-resources-platform"),data),
    finance: () => pageBusinessApplication(getEnterpriseApplication("finance-platform"),data),
    growthSales: () => pageBusinessApplication(getEnterpriseApplication("ai-growth-sales-platform"),data),
    manufacturing: () => pageBusinessApplication(getEnterpriseApplication("intelligent-manufacturing-erp"),data),
    smartPark: () => pageBusinessApplication(getEnterpriseApplication("smart-park-platform"),data),
    video: () => pageBusinessApplication(getEnterpriseApplication("video-factory"),data),
    graphicDesign: () => pageGraphicDesign(data),
    cad: () => pageCadCenter(),
    development: () => pageDevelopment(data),
    execution: () => pageExecution(),
    portfolio: () => pagePortfolio(data),
    outcomes: () => pageOutcomes(),
    domains: () => pageDomains(data),
    projects: () => pageProjects(data),
    runtime: () => pageRuntime(data),
    workers: () => pageWorkers(data),
    agentAdmin: () => pageAgentAdmin(),
    credentials: () => pageCredentials(data),
    governance: () => pageGovernance(data),
    planning: () => pagePlanning(data),
    autopilot: () => pageAutopilot(data),
    actions: () => pageActions(data),
    config: () => pageConfig(data),
    account: () => pageAccount(resolvedAuth),
    memory: () => pageMemory(data),
    pilotStatus: () => pagePilotStatus(data)
  };
  const body = gated
    ? ""
    : await (contentById[route.id] ?? contentById.dashboard)();
  return shell(body, route.id, model, data, resolvedAuth);
}
