import { consoleWebRoutes } from "./routes.mjs";
import { buildConsoleDashboardModel, loadConsoleLocalData } from "./data.mjs";
import { getConsoleMessages } from "./i18n/index.mjs";
import { evaluateConsoleRouteAccess, visibleConsoleRouteIds } from "../../../packages/access-center/lib/access-center-utils.mjs";

const messages = getConsoleMessages();

function escapeHtml(value) {
  return String(value ?? "")
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}

function nav(activeId, auth = {}) {
  const visibleRoutes = new Set(visibleConsoleRouteIds(auth));
  return `<nav class="top-nav">${consoleWebRoutes.filter((route) => route.showInNav !== false && visibleRoutes.has(route.id)).map((route) => {
    const active = route.id === activeId ? "active" : "";
    return `<a class="${active}" href="${route.navPath}"><span class="nav-label">${escapeHtml(route.label)}</span></a>`;
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

function normalizeToken(value) {
  return String(value ?? "unknown").toLowerCase().replace(/[^a-z0-9]+/g, "-");
}

function riskBadge(value) {
  return `<span class="risk-badge ${normalizeToken(value)}">风险 ${escapeHtml(value)}</span>`;
}

function statusLabel(value) {
  return `<span class="status-label ${normalizeToken(value)}">${escapeHtml(value)}</span>`;
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

function formOption(value, label, selected = false) {
  return `<option value="${escapeHtml(value)}"${selected ? " selected" : ""}>${escapeHtml(label)}</option>`;
}

function projectDisplayLabel(item) {
  if (item.project_id === "jinhu-smart-park") return "jinhu-smart-park（已连接）";
  if (item.project_id === "phoenix-erp") return "phoenix-erp（GitHub 远程待接入）";
  if (item.project_id === "group-portal") return "group-portal（计划中）";
  return `${item.label}（${item.status}）`;
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
    formOption("gemini", "Gemini"),
    formOption("openhands", "OpenHands"),
    formOption("aider", "Aider"),
    formOption("local-agent", "Local Agent")
  ].join("");
}

function topStatusBar(model, data, auth = {}) {
  const activeUser = auth.authenticated
    ? (auth.user?.display_name || auth.user?.username || "已登录")
    : "需登录";
  const activePlan = auth.authenticated
    ? (auth.plan?.display_name || auth.plan?.plan_id || "未分配套餐")
    : "本地登录";
  const chips = [
    { value: model.platform_status, tone: "primary" },
    { value: activeUser, tone: auth.authenticated ? "default" : "warning" },
    { value: activePlan, tone: "default" },
    { value: "Pilot", tone: "default" },
    { value: model.active_project, tone: "default" },
    { value: `Worker ${model.modules.workers}`, tone: "default" },
    { value: "LOW/MEDIUM", tone: "default" },
    { value: data.autopilot.latest_summary?.validation ?? "unknown", tone: "success" }
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
        <span>${escapeHtml(primaryRole)} / ${escapeHtml(auth.plan?.display_name || auth.plan?.plan_id || "未分配套餐")}</span>
      </div>
      <div class="auth-actions">
        <span class="pill">直执 ${escapeHtml(auth.direct_execute_max_risk || "LOW")}</span>
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

function accessLoginPage(data) {
  return `<section class="auth-shell">
    <div class="auth-panel">
      <div class="auth-panel-art" aria-hidden="true"><img src="/assets/login-panel-image.png" alt=""></div>
      <div class="auth-panel-overlay" aria-hidden="true"></div>
    </div>
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
        <p id="auth-status" class="help auth-status-copy">仅限已授权账号。</p>
      </form>
    </div>
  </section>`;
}

function actionWorkbench(data, title = "统一 AI 开发工作台") {
  const projectOptions = data.actionServer.projects.map((item) => formOption(item.project_id, projectDisplayLabel(item)));
  const projectCards = data.actionServer.projects.map((item) => `<button type="button" class="project-row${item.project_id === "jinhu-smart-park" ? " active" : ""}" data-project-select="${escapeHtml(item.project_id)}">
    <strong>${escapeHtml(item.label)}</strong>
    <span>${escapeHtml(item.project_id === "phoenix-erp" ? "WAITING_FOR_GITHUB_REPO" : item.status)}</span>
  </button>`);
  const flowSteps = ["已理解目标", "选择项目", "Agent/Runtime", "生成计划", "Governance", "执行/审批", "结果报告"];
  const quickActions = [
    ["context-summary", "读取上下文"],
    ["smart-park-continue", "继续 Smart Park"],
    ["smart-park-blockers", "阻断项"],
    ["smart-park-go-live-plan", "上线 Proposal"],
    ["proposal-review", "待审批 Proposal"],
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
        ${quickActions.map(([id, label]) => `<button type="button" class="quick-chip" data-quick-action="${escapeHtml(id)}" data-goal="${escapeHtml(label === "阻断项" ? "检查 Smart Park 上线阻断项" : label === "上线 Proposal" ? "生成 Smart Park 上线计划 Proposal" : label === "Codex / Claude" ? "检查 Codex / Claude 接入状态" : label)}">${escapeHtml(label)}</button>`).join("")}
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
        <textarea id="action-goal" class="goal-box command-input" placeholder="输入目标，例如：继续推进 Smart Park 巡检闭环">继续推进 Pilot</textarea>
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

function smartParkEntryPanel() {
  return `<section class="smart-entry">
    <div class="section-head">
      <div>
        <h2>Smart Park 上线入口</h2>
        <p>继续推进前先检查上线阻断项和待审批 Proposal；不会绕过生产审批，也不会写入业务项目。</p>
      </div>
      <span class="pill warn-pill">生产审批不可绕过</span>
    </div>
    <div class="entry-grid">
      <button type="button" data-quick-action="smart-park-continue" data-goal="继续 Smart Park">继续 Smart Park</button>
      <button type="button" class="secondary" data-quick-action="smart-park-blockers" data-goal="检查 Smart Park 上线阻断项">检查上线阻断项</button>
      <button type="button" class="secondary" data-quick-action="smart-park-go-live-plan" data-goal="生成 Smart Park 上线计划 Proposal">生成上线计划 Proposal</button>
      <button type="button" class="secondary" data-quick-action="proposal-review" data-goal="查看待审批 Proposal">查看待审批 Proposal</button>
      <button type="button" class="secondary" data-quick-action="worker-health" data-goal="查看 Worker 状态">查看 Worker 状态</button>
    </div>
  </section>`;
}

function recommendationPanel(data) {
  const recommendation = data.autopilot.latest_summary?.next_recommendation ?? "运行 Autopilot dry-run 以刷新下一步建议。";
  return `<section>
    <div class="section-head"><h2>推荐动作区</h2><span class="pill">Planning / Governance</span></div>
    <div class="kanban-grid">
      <div class="panel"><h3>下一步建议</h3><p>${escapeHtml(recommendation)}</p></div>
      <div class="panel"><h3>可直接执行任务</h3>${list(["LOW / MEDIUM 本地 allowlist 命令", "Runtime health", "Worker health", "Smart Park 阻断项检查", "Smart Park 上线计划 Proposal 生成"])}</div>
      <div class="panel"><h3>仍需审批任务</h3>${list(["HIGH remote worker: proposal_only", "CRITICAL production operation: human_approval_required", "真实凭证后端接入"])}</div>
      <div class="panel"><h3>最近失败项</h3>${list(["无活动失败项", "SSH/production 相关动作保持 HOLD 或 proposal_only"])}</div>
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

function proposalPanel(data) {
  const proposals = data.project_router.proposals ?? [];
  const audits = new Map((data.project_router.queue_injection_audits ?? []).map((item) => [item.data?.task_id ?? item.path, item]));
  const rows = proposals.slice(0, 8).map((item) => {
    const proposal = item.data ?? {};
    const audit = audits.get(proposal.task_id);
    const approvalStatus = proposal.approval_status ?? "unknown";
    const queueAuditStatus = audit?.data?.status ?? "missing";
    const nextAction = approvalStatus !== "APPROVED"
      ? "待审批"
      : (queueAuditStatus === "PASS" ? "已注入" : "待注入");
    return {
      id: proposal.task_id ?? item.path,
      risk: riskBadge(proposal.risk ?? "MEDIUM"),
      approval: statusLabel(approvalStatus),
      status: statusLabel(nextAction),
      queueAudit: statusLabel(queueAuditStatus),
      actions: `<div class="button-row compact-row">
        <button type="button" class="secondary" data-proposal-action="proposal-review" data-proposal-task="${escapeHtml(proposal.task_id ?? "")}">查看</button>
        <button type="button" class="secondary" data-proposal-action="proposal-approve-dry-run" data-proposal-task="${escapeHtml(proposal.task_id ?? "")}">审批 dry-run</button>
      </div>`
    };
  });
  return `<section>
    <div class="section-head"><h2>Proposal 审批区</h2><span class="pill warn-pill">风险标识 / 真实写入禁用</span></div>
    ${rows.length > 0 ? table(rows, [
      { key: "id", label: "proposal list" },
      { key: "risk", label: "risk", html: true },
      { key: "approval", label: "approval_required", html: true },
      { key: "status", label: "next", html: true },
      { key: "queueAudit", label: "queue audit", html: true },
      { key: "actions", label: "action", html: true }
    ]) : `<div class="panel"><p class="help">当前没有可审 Proposal。先执行项目派发计划，再进入 Proposal Review。</p></div>`}
  </section>`;
}

function releasePromotionPanel(data) {
  const release = data.release_consistency ?? {};
  const stages = Array.isArray(release.promotion_stages) ? release.promotion_stages : [];
  const rows = stages.map((stage) => ({
    stage: stage.stage_id,
    status: statusLabel(stage.status ?? "unknown"),
    key: stage.consistency_key || stage.source_consistency_key || "pending",
    next: stage.stage_id === "server_preview"
      ? `<button type="button" class="secondary" data-quick-action="release-server-preview" data-goal="确认服务器预览一致性">确认服务器预览</button>`
      : (stage.stage_id === "reviewed_publish"
          ? `<button type="button" class="secondary" data-quick-action="release-reviewed-publish" data-goal="确认 reviewed publish 一致性">确认发布</button>`
          : `<span class="help">已记录</span>`),
    reason: stage.gate_reason || "none"
  }));
  return `<section>
    <div class="section-head"><h2>Release Promotion</h2><span class="pill">local / server / reviewed</span></div>
    <div class="grid">
      ${metric("一致性状态", release.status ?? "未生成")}
      ${metric("Consistency Key", release.promotion_consistency_key ?? "未生成")}
      ${metric("下一闸门", release.promotion_next_stage ?? "completed")}
      ${metric("Warnings", Array.isArray(release.warnings) ? release.warnings.length : 0)}
    </div>
    ${rows.length > 0 ? table(rows, [
      { key: "stage", label: "stage" },
      { key: "status", label: "status", html: true },
      { key: "key", label: "consistency key" },
      { key: "next", label: "action", html: true },
      { key: "reason", label: "gate_reason" }
    ]) : `<div class="panel"><p class="help">尚未生成 release consistency 工件。先执行 <code>studio release consistency --dry-run</code>。</p></div>`}
  </section>`;
}

function projectWorkbench(data) {
  const rows = [
    { project: "jinhu-smart-park", status: "CONNECTED", policy: "Pilot Production / guarded", next: "blocker check" },
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
  const authLoginForm = document.getElementById("auth-login-form");
  const authUsername = document.getElementById("auth-username");
  const authPassword = document.getElementById("auth-password");
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
  const draftStatus = document.getElementById("config-draft-status");
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
    const projectText = escapeClient(body.project_id || "jinhu-smart-park");
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

  function payload(actionOverride) {
    const effectiveActionId = actionOverride || actionForMode();
    return {
      goal: goal ? goal.value : "继续推进 Pilot",
      project_id: project ? project.value : "jinhu-smart-park",
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
      if (project) project.value = "jinhu-smart-park";
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
      if (project) project.value = "jinhu-smart-park";
      if (action) action.value = button.getAttribute("data-proposal-action");
      if (proposalTask) proposalTask.value = button.getAttribute("data-proposal-task") || "";
      if (goal) goal.value = button.textContent + " Smart Park proposal";
      const proposalAction = button.getAttribute("data-proposal-action");
      setStatus("生成中");
      try {
        await startAction(proposalAction);
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
    });
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
      window.setTimeout(() => window.location.reload(), 180);
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
  const mainContent = gated ? accessLoginPage(data) : (forbidden ? routeForbiddenPage(route, auth) : content);
  const headerClass = gated ? "login-header" : "";
  const headerMeta = gated
    ? ""
    : `${authHeaderBar(auth)}
    ${topStatusBar(model, data, auth)}
    ${nav(activeId, auth)}`;
  const pageTitle = gated ? `登录 - ${messages.app.title}` : `${route.label} - ${messages.app.title}`;
  return `<!doctype html>
<html lang="${messages.locale}">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1">
  <title>${escapeHtml(pageTitle)}</title>
  <style>
    :root { color-scheme: dark; --bg: #0f1825; --nav: #122032; --panel: #142131; --panel-2: #1a2a3f; --text: #f3f7fc; --muted: #99abc1; --line: #30445e; --blue: #a8d6ff; --green: #4ade80; --yellow: #fbbf24; --red: #fb7185; --shadow: rgba(7, 18, 34, 0.18); }
    * { box-sizing: border-box; }
    body { margin: 0; font-family: Inter, ui-sans-serif, system-ui, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background: radial-gradient(circle at top, rgba(170, 212, 255, 0.18), transparent 30%), var(--bg); color: var(--text); }
    body.login-gated { background:
      radial-gradient(circle at 10% 8%, rgba(232, 242, 255, 0.32), transparent 24%),
      radial-gradient(circle at 84% 8%, rgba(191, 227, 255, 0.28), transparent 20%),
      radial-gradient(circle at 50% 86%, rgba(156, 201, 250, 0.2), transparent 34%),
      linear-gradient(180deg, #2a4461 0%, #1b2e44 38%, #121c2a 100%); }
    header { padding: 10px 16px 8px; border-bottom: 1px solid var(--line); background: rgba(6, 8, 12, 0.92); backdrop-filter: blur(16px); position: sticky; top: 0; z-index: 3; box-shadow: 0 10px 28px var(--shadow); }
    header.login-header { padding: 16px 18px 14px; background: linear-gradient(180deg, rgba(28, 45, 66, 0.72), rgba(28, 45, 66, 0.28)); border-bottom-color: rgba(204, 229, 255, 0.16); box-shadow: none; position: relative; backdrop-filter: blur(14px); }
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
    .top-nav { display: flex; align-items: center; gap: 8px; overflow-x: auto; margin-top: 10px; padding-bottom: 2px; scrollbar-width: thin; }
    .top-nav a { display: inline-flex; align-items: center; color: var(--muted); text-decoration: none; padding: 8px 12px; border-radius: 999px; font-size: 13px; white-space: nowrap; border: 1px solid transparent; background: #0b1118; }
    .top-nav a:hover { color: var(--text); background: #10151d; border-color: #1f2b38; }
    .top-nav a.active { background: #121924; color: #dbeafe; border-color: #243041; font-weight: 700; }
    main { padding: 12px 14px 24px; max-width: 1480px; width: 100%; margin: 0 auto; }
    section { margin-bottom: 14px; }
    h2 { font-size: 18px; margin: 0 0 10px; }
    h3 { font-size: 14px; margin: 0 0 8px; }
    p { color: var(--muted); line-height: 1.55; margin: 0; }
    .grid { display: grid; grid-template-columns: repeat(auto-fit, minmax(190px, 1fr)); gap: 12px; }
    .metric, .panel, .workbench, .smart-entry, .output-card { background: var(--panel); border: 1px solid var(--line); border-radius: 10px; padding: 12px; box-shadow: 0 8px 22px var(--shadow); }
    .access-entitlement-panel { margin-bottom: 8px; padding: 10px 12px; }
    .entitlement-alerts { display: grid; gap: 8px; margin-top: 10px; }
    .entitlement-alert { border: 1px solid var(--line); border-radius: 10px; padding: 10px; background: #0c1219; }
    .entitlement-alert.warning { border-color: rgba(251, 191, 36, 0.24); background: rgba(33, 23, 8, 0.35); }
    .entitlement-alert.notice { border-color: rgba(133, 183, 255, 0.22); background: rgba(17, 25, 39, 0.52); }
    .entitlement-alert.info { border-color: rgba(148, 163, 184, 0.18); background: rgba(12, 18, 25, 0.9); }
    .entitlement-alert-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin-bottom: 6px; }
    .entitlement-alert-head strong { font-size: 13px; }
    .workspace-shell { display: grid; grid-template-columns: 160px minmax(0, 1fr) 220px; gap: 10px; align-items: start; }
    .auth-shell { display: grid; grid-template-columns: minmax(460px, 1fr) minmax(300px, 360px); gap: 18px; align-items: stretch; justify-content: center; max-width: 1220px; margin: 0 auto; }
    .auth-panel, .auth-side { position: relative; overflow: hidden; border-radius: 20px; border: 1px solid rgba(157, 196, 240, 0.2); box-shadow: 0 18px 38px rgba(7, 18, 34, 0.16); }
    .auth-panel { min-height: 560px; background: linear-gradient(155deg, rgba(74, 94, 120, 0.56), rgba(40, 57, 79, 0.62)); isolation: isolate; }
    .auth-panel::before { content: ""; position: absolute; inset: 0; background:
      radial-gradient(circle at 74% 26%, rgba(201, 230, 255, 0.42), transparent 28%),
      radial-gradient(circle at 30% 76%, rgba(160, 204, 250, 0.22), transparent 26%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.18), rgba(20, 31, 45, 0.03));
      pointer-events: none; z-index: 1; }
    .auth-panel::after { content: ""; position: absolute; inset: 0; background:
      linear-gradient(90deg, rgba(18, 28, 40, 0.14) 0%, rgba(18, 28, 40, 0.04) 28%, rgba(18, 28, 40, 0.02) 58%, rgba(18, 28, 40, 0.1) 100%),
      linear-gradient(180deg, rgba(255, 255, 255, 0.05) 0%, rgba(18, 28, 40, 0.02) 36%, rgba(18, 28, 40, 0.08) 100%);
      pointer-events: none; z-index: 1; }
    .auth-side { width: 100%; max-width: 332px; justify-self: end; padding: 24px 22px 20px; background:
      radial-gradient(circle at top, rgba(212, 234, 255, 0.24), transparent 34%),
      linear-gradient(180deg, rgba(56, 75, 101, 0.76), rgba(33, 47, 68, 0.82)); }
    .auth-panel-art { position: absolute; inset: 0; z-index: 0; pointer-events: none; display: flex; align-items: center; justify-content: center; padding: 48px; }
    .auth-panel-art img { width: min(78%, 760px); max-width: 760px; height: auto; object-fit: contain; opacity: 0.96; transform: translateY(-2px); filter: saturate(1.06) brightness(1.72) contrast(1.02) drop-shadow(0 0 52px rgba(182, 225, 255, 0.34)); }
    .auth-panel-overlay { position: absolute; inset: 0; z-index: 2; background:
      linear-gradient(180deg, rgba(255, 255, 255, 0.12) 0%, rgba(18, 28, 40, 0.01) 24%, rgba(18, 28, 40, 0.03) 72%, rgba(18, 28, 40, 0.1) 100%),
      radial-gradient(circle at 76% 22%, rgba(193, 230, 255, 0.18), transparent 20%); }
    .auth-chip { display: inline-flex; align-items: center; min-height: 28px; padding: 0 11px; border-radius: 999px; background: rgba(8, 12, 18, 0.88); border: 1px solid #2a3950; color: #d7e2ef; font-size: 12px; font-weight: 700; }
    .auth-chip.subtle { background: rgba(255, 255, 255, 0.02); color: #7f90a3; border-color: rgba(255, 255, 255, 0.05); }
    .auth-card-head, .auth-form { max-width: 272px; }
    .auth-kicker { display: inline-block; margin-bottom: 8px; color: #a6b7cb; font-size: 11px; font-weight: 800; letter-spacing: 0.18em; text-transform: uppercase; }
    .auth-card-head h3 { font-size: 24px; line-height: 1.04; margin: 0; letter-spacing: 0; }
    .auth-form { display: grid; gap: 10px; margin-top: 12px; }
    .auth-form input { min-height: 46px; border-radius: 12px; background: rgba(19, 30, 44, 0.68); border-color: #57708d; padding: 11px 12px; font-size: 14px; box-shadow: inset 0 1px 0 rgba(255,255,255,0.1); }
    .auth-form input::placeholder { color: #8198b3; }
    .auth-submit-button { width: 100%; min-height: 46px; border-radius: 12px; background: linear-gradient(180deg, #4786c3, #346b9f); border-color: #5d98cd; box-shadow: 0 10px 24px rgba(96, 151, 214, 0.24); }
    .auth-submit-button:hover { background: linear-gradient(180deg, #5391ce, #3b74ac); }
    .auth-form .button-row { margin-top: 4px; }
    .auth-status-copy { margin-top: 2px; font-size: 11px; color: #8fa3ba; }
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
    @media (max-width: 760px) { .brand-row { align-items: flex-start; } .logo-frame { width: 96px; height: 46px; } .top-nav { margin-top: 8px; } main { padding: 12px; } .timeline, .action-feedback-grid, .flow-rail, .conversation-result, .chat-message, .chat-message.user, .attachment-bubble, .attachment-list { grid-template-columns: 1fr; } .chat-message.user .message-avatar, .chat-message.user .message-body { grid-column: auto; grid-row: auto; } .workspace-hero { display: block; } .workspace-meta { margin-top: 8px; } .auth-strip, .auth-actions, .auth-help-row { align-items: flex-start; flex-direction: column; } .auth-card-head h3 { font-size: 26px; } .auth-panel { min-height: 240px; } .auth-panel-art { padding: 24px; } .auth-panel-art img { width: 88%; opacity: 0.62; transform: translateY(0); filter: saturate(1.12) brightness(1.22) contrast(1.05) drop-shadow(0 0 40px rgba(124, 192, 255, 0.22)); } .auth-panel::after { background: linear-gradient(180deg, rgba(10, 16, 24, 0.34) 0%, rgba(10, 16, 24, 0.06) 30%, rgba(10, 16, 24, 0.04) 74%, rgba(10, 16, 24, 0.28) 100%), linear-gradient(90deg, rgba(10, 16, 24, 0.56) 0%, rgba(10, 16, 24, 0.18) 30%, rgba(10, 16, 24, 0.06) 72%, rgba(10, 16, 24, 0.28) 100%); } }
    @media (max-width: 900px) { .form-grid, .workspace-controls, .workspace-shell, .auth-shell { grid-template-columns: 1fr; } .advanced-config, .project-rail { position: static; } .auth-side { order: -1; max-width: 360px; justify-self: stretch; } .auth-card-head, .auth-form { max-width: none; } }
  </style>
</head>
<body class="${gated ? "login-gated" : ""}">
  <header class="${headerClass}">
    <div class="brand-row">
      <div class="brand-lockup">
        <span class="logo-frame"><img class="brand-logo" src="/assets/anksen-logo.svg" alt="ANKSEN Logo"></span>
        <div class="brand-copy">
          <h1>${escapeHtml(messages.app.title)}</h1>
          <div class="subhead">${escapeHtml(messages.app.subtitle)}</div>
        </div>
      </div>
    </div>
    ${headerMeta}
  </header>
  <main>${mainContent}</main>
  ${interactiveScript()}
</body>
</html>`;
}

function pageDashboard(_model, data) {
  const release = data.release_consistency ?? {};
  const releaseStages = Array.isArray(release.promotion_stages) ? release.promotion_stages : [];
  const reviewedPublish = releaseStages.find((stage) => stage.stage_id === "reviewed_publish");
  return `${actionWorkbench(data, "统一 AI 开发工作台")}
  <section><h2>控制面快照</h2><div class="grid">
    ${metric("挂接项目", data.project_router.binding_count)}
    ${metric("派发计划", data.project_router.dispatch_plan_count ?? 0)}
    ${metric("Worker 控制面", release.status ?? "未生成")}
    ${metric("下一闸门", release.promotion_next_stage ?? "未生成")}
    ${metric("Reviewed Publish", reviewedPublish?.status ?? "未生成")}
    ${metric("Access Enforcement", data.access.enforcement?.policy_id ?? "未生成")}
    ${metric("最新 Autopilot", data.autopilot.latest_summary?.id ?? "not_found")}
  </div></section>`;
}

function pageProjects(data) {
  const project = data.jinhuProjectState ?? {};
  const workspaceProjects = data.project_router.workspace?.projects ?? [];
  const dispatchPlans = data.project_router.dispatch_plans ?? [];
  const proposalMap = new Map((data.project_router.proposals ?? []).map((item) => [item.data?.task_id ?? item.path, item]));
  const auditMap = new Map((data.project_router.queue_injection_audits ?? []).map((item) => [item.data?.task_id ?? item.path, item]));
  const rows = workspaceProjects.map((item) => ({
    project: item.project_id,
    status: item.connection_status,
    route: item.execution_route,
    branch: item.repo_branch,
    clean: item.repo_clean,
    write_policy: item.write_policy
  }));
  return `${projectWorkbench(data)}
  <section><h2>${messages.pages.projects.title}</h2><div class="grid">
    ${metric(messages.pages.projects.connectedProject, "jinhu-smart-park")}
    ${metric(messages.pages.projects.phoenixErp, messages.pages.projects.phoenixStatus)}
    ${metric(messages.pages.projects.writes, data.safety.managed_project_writes)}
    ${metric("挂接绑定", data.project_router.binding_count)}
    ${metric("Proposal", data.project_router.proposal_count ?? 0)}
    ${metric("Queue Audit", data.project_router.queue_injection_audit_count ?? 0)}
  </div></section>
  <section><h2>Attached Project Workspace</h2>${rows.length > 0 ? table(rows, [
    { key: "project", label: "项目" },
    { key: "status", label: "连接" },
    { key: "route", label: "路由" },
    { key: "branch", label: "分支" },
    { key: "clean", label: "仓库" },
    { key: "write_policy", label: "写入策略" }
  ]) : `<div class="panel"><p class="help">尚未生成绑定快照。先执行 <code>studio project bind --apply</code> 与 <code>studio project workspace --apply</code>。</p></div>`}</section>
  <section><h2>Project Dispatch Plans</h2>${dispatchPlans.length > 0 ? table(dispatchPlans.slice(0, 8).map((item) => ({
    project: item.project_id,
    task_id: item.data?.task_id ?? "unknown",
    stage: item.data?.pipeline_stage ?? "unknown",
    proposal: statusLabel(proposalMap.get(item.data?.task_id)?.data?.approval_status ?? "missing"),
    audit: statusLabel(auditMap.get(item.data?.task_id)?.data?.status ?? "missing"),
    runtime: item.data?.worker_route?.runtime_id ?? item.data?.task_candidate?.runtime ?? "unknown",
    worker: item.data?.worker_route?.worker_id ?? "none",
    next: item.data?.recommended_next_stage ?? "unknown"
  })), [
    { key: "project", label: "项目" },
    { key: "task_id", label: "任务" },
    { key: "stage", label: "阶段" },
    { key: "proposal", label: "Proposal", html: true },
    { key: "audit", label: "Queue Audit", html: true },
    { key: "runtime", label: "Runtime" },
    { key: "worker", label: "Worker" },
    { key: "next", label: "下一步" }
  ]) : `<div class="panel"><p class="help">尚未生成派发计划。先执行 <code>studio project dispatch-plan --project jinhu-smart-park --text "..." --apply</code>。</p></div>`}</section>
  <section><h2>${messages.pages.projects.runtimeMemory}</h2>${detailsJson("查看原始运行记忆 JSON", project)}</section>`;
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
  const actions = data.actionServer.actions ?? [];
  return `<section><h2>${messages.pages.actions.title}</h2><div class="grid">${metric(messages.pages.actions.actions, actions.length)}${metric(messages.pages.actions.defaultMode, "pilot_production")}${metric(messages.pages.actions.writes, messages.common.falseValue)}${metric("Action Log", data.actionServer.action_log_dir)}</div></section>
  ${actionWorkbench(data, "操作中心")}
  ${smartParkEntryPanel()}
  ${proposalPanel(data)}
  ${releasePromotionPanel(data)}
  <section>${table(actions.map((action) => ({
    id: action.id,
    intent: action.label,
    risk: riskBadge(action.risk),
    mode: executionModeForRisk(action.risk),
    gate: governanceGateForRisk(action.risk)
  })), [{ key: "id", label: messages.pages.actions.action }, { key: "intent", label: messages.pages.actions.intent }, { key: "risk", label: messages.common.risk, html: true }, { key: "mode", label: messages.common.mode }, { key: "gate", label: messages.common.gate }])}</section>`;
}

function pageConfig(data) {
  const enforcement = data.access.enforcement ?? {};
  const release = data.release_consistency ?? {};
  const releaseStages = Array.isArray(release.promotion_stages) ? release.promotion_stages : [];
  const inviteSummary = data.access.invite_summary ?? { invite_count: 0, pending_invite_count: 0, approved_invite_count: 0, materialized_invite_count: 0, invites: [] };
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
    project_id: "jinhu-smart-park",
    connected: true,
    phoenix_erp: "WAITING_FOR_GITHUB_REPO",
    group_portal: "PLANNED",
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
    ${metric(messages.pages.config.projects, "draft")}
    ${metric(messages.pages.config.runtime, "dry-run")}
    ${metric(messages.pages.config.credentials, "reference_only")}
    ${metric(messages.pages.config.governance, data.governance.policy_id)}
  </div><p class="help">${messages.pages.config.draftOnly}</p></section>
  <section><div class="grid">
    ${metric("Access Enforcement", enforcement.policy_id ?? "未生成")}
    ${metric("可见路由", enforcement.summary?.visible_route_count ?? "未生成")}
    ${metric("可执行动作", enforcement.summary?.allowed_action_count ?? "未生成")}
    ${metric("Release Consistency", release.status ?? "未生成")}
  </div></section>
  <section>
    <div class="section-head"><h2>Release Promotion Stages</h2><span class="pill">local / server / reviewed</span></div>
    ${releaseStages.length > 0 ? table(releaseStages.map((stage) => ({
      stage: stage.stage_id,
      status: statusLabel(stage.status ?? "unknown"),
      key: stage.consistency_key || stage.source_consistency_key || "pending",
      recorded: stage.recorded_at || "pending",
      reason: stage.gate_reason || "none"
    })), [
      { key: "stage", label: "stage" },
      { key: "status", label: "status", html: true },
      { key: "key", label: "consistency key" },
      { key: "recorded", label: "recorded_at" },
      { key: "reason", label: "gate_reason" }
    ]) : `<div class="panel"><p class="help">尚未生成 release consistency 工件。先执行 <code>studio release consistency --dry-run</code>。</p></div>`}
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
    ${metric("控制面文件", 4)}
  </div></section>
  <section><h2>${messages.common.dataSources}</h2>${list([...data.data_sources.files, ...data.data_sources.directories, data.data_sources.autopilot_latest])}</section>
  <section><h2>Control Plane Snapshots</h2><div class="grid">
    ${metric("Workspace", data.project_router.workspace?.workspace_id ?? "未生成")}
    ${metric("Worker", data.workers.control_plane?.control_plane_id ?? "未生成")}
    ${metric("Access", data.access.enforcement?.policy_id ?? "未生成")}
    ${metric("Release", data.release_consistency?.status ?? "未生成")}
  </div></section>`;
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

export async function renderConsolePage(pathname = "/", auth = null) {
  const data = await loadConsoleLocalData();
  const resolvedAuth = normalizeRenderAuth(auth, data);
  data.renderAuth = resolvedAuth;
  const model = await buildConsoleDashboardModel();
  const gated = data.access?.summary?.allow_anonymous_console_read !== true && !resolvedAuth.authenticated;
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
  const body = gated
    ? ""
    : await (contentById[route.id] ?? contentById.dashboard)();
  return shell(body, route.id, model, data, resolvedAuth);
}
