import { readFile, writeFile } from "node:fs/promises";

const DEFAULT_ENV_PATH = "/opt/anksen/identity/.env";
const DEFAULT_MARKER_PATH = "/opt/anksen/identity/.owner-password-initialized.json";
const LOOPBACK_HOSTS = new Set(["127.0.0.1", "localhost", "::1"]);

function bootstrapError(code, message, status = 400) {
  const error = new Error(message);
  error.code = code;
  error.status = status;
  return error;
}

export function parseIdentityEnvironment(text) {
  const result = {};
  for (const rawLine of String(text ?? "").split(/\r?\n/)) {
    const line = rawLine.trim();
    if (!line || line.startsWith("#")) continue;
    const separator = line.indexOf("=");
    if (separator < 1) throw bootstrapError("IDENTITY_CONFIG_INVALID", "Identity environment contains an invalid entry.", 500);
    const key = line.slice(0, separator).trim();
    if (!/^[A-Z][A-Z0-9_]*$/.test(key)) throw bootstrapError("IDENTITY_CONFIG_INVALID", "Identity environment contains an invalid key.", 500);
    result[key] = line.slice(separator + 1);
  }
  return result;
}

export function validateOwnerPassword(value) {
  const password = String(value ?? "");
  if (password.length < 16 || password.length > 128) throw bootstrapError("PASSWORD_POLICY", "密码长度必须为 16–128 个字符。");
  if (!/[a-z]/.test(password) || !/[A-Z]/.test(password) || !/[0-9]/.test(password) || !/[^A-Za-z0-9]/.test(password)) {
    throw bootstrapError("PASSWORD_POLICY", "密码必须同时包含大写字母、小写字母、数字和特殊字符。");
  }
  return password;
}

function requireLoopbackOrigin(value) {
  const origin = new URL(value);
  if (origin.protocol !== "http:" || !LOOPBACK_HOSTS.has(origin.hostname)) {
    throw bootstrapError("IDENTITY_UPSTREAM_BLOCKED", "Identity administration is restricted to the loopback Keycloak endpoint.", 500);
  }
  return origin.href.replace(/\/$/, "");
}

async function safeJson(response) {
  const text = await response.text();
  try { return text ? JSON.parse(text) : {}; } catch { return {}; }
}

export class IdentityOwnerBootstrap {
  constructor({
    upstreamOrigin,
    envPath = process.env.STUDIO_IDENTITY_ENV_PATH ?? DEFAULT_ENV_PATH,
    markerPath = process.env.STUDIO_IDENTITY_OWNER_MARKER_PATH ?? DEFAULT_MARKER_PATH,
    fetchImpl = globalThis.fetch,
  } = {}) {
    this.upstreamOrigin = requireLoopbackOrigin(upstreamOrigin);
    this.envPath = envPath;
    this.markerPath = markerPath;
    this.fetch = fetchImpl;
    this.inFlight = false;
  }

  async status() {
    try {
      const marker = JSON.parse(await readFile(this.markerPath, "utf8"));
      return { status: "INITIALIZED", initialized: true, username: marker.username, initializedAt: marker.initializedAt };
    } catch (error) {
      if (error?.code !== "ENOENT") throw bootstrapError("IDENTITY_MARKER_INVALID", "Identity initialization marker is invalid.", 500);
      const env = parseIdentityEnvironment(await readFile(this.envPath, "utf8"));
      return { status: "PENDING", initialized: false, username: env.STUDIO_IDENTITY_BOOTSTRAP_USERNAME ?? "studio-admin" };
    }
  }

  async initialize({ password, actor } = {}) {
    if (this.inFlight) throw bootstrapError("IDENTITY_INITIALIZATION_BUSY", "Identity initialization is already running.", 409);
    const current = await this.status();
    if (current.initialized) throw bootstrapError("IDENTITY_ALREADY_INITIALIZED", "Studio 身份密码已经完成初始化。", 409);
    const acceptedPassword = validateOwnerPassword(password);
    this.inFlight = true;
    try {
      const env = parseIdentityEnvironment(await readFile(this.envPath, "utf8"));
      const adminUsername = env.KEYCLOAK_ADMIN_USERNAME;
      const adminPassword = env.KEYCLOAK_ADMIN_PASSWORD;
      const username = env.STUDIO_IDENTITY_BOOTSTRAP_USERNAME ?? "studio-admin";
      if (!adminUsername || !adminPassword) throw bootstrapError("IDENTITY_ADMIN_UNAVAILABLE", "Keycloak bootstrap administrator is unavailable.", 503);

      const tokenResponse = await this.fetch(`${this.upstreamOrigin}/auth/realms/master/protocol/openid-connect/token`, {
        method: "POST",
        headers: { "content-type": "application/x-www-form-urlencoded" },
        body: new URLSearchParams({ grant_type: "password", client_id: "admin-cli", username: adminUsername, password: adminPassword }),
      });
      const tokenBody = await safeJson(tokenResponse);
      if (!tokenResponse.ok || !tokenBody.access_token) throw bootstrapError("IDENTITY_ADMIN_AUTH_FAILED", "Keycloak administrator authentication failed.", 503);

      const usersResponse = await this.fetch(`${this.upstreamOrigin}/auth/admin/realms/anksen/users?username=${encodeURIComponent(username)}&exact=true`, {
        headers: { authorization: `Bearer ${tokenBody.access_token}` },
      });
      const users = await safeJson(usersResponse);
      if (!usersResponse.ok || !Array.isArray(users)) throw bootstrapError("IDENTITY_USER_LOOKUP_FAILED", "Studio identity lookup failed.", 503);
      const matches = users.filter((user) => user.username === username);
      if (matches.length !== 1) throw bootstrapError("IDENTITY_USER_NOT_UNIQUE", "Expected exactly one Studio identity owner.", 409);

      const resetResponse = await this.fetch(`${this.upstreamOrigin}/auth/admin/realms/anksen/users/${encodeURIComponent(matches[0].id)}/reset-password`, {
        method: "PUT",
        headers: { authorization: `Bearer ${tokenBody.access_token}`, "content-type": "application/json" },
        body: JSON.stringify({ type: "password", value: acceptedPassword, temporary: false }),
      });
      if (!resetResponse.ok) throw bootstrapError("IDENTITY_PASSWORD_RESET_FAILED", "Studio identity password reset failed.", 503);

      const marker = {
        schemaVersion: 1,
        username,
        initializedAt: new Date().toISOString(),
        initializedBy: String(actor?.user_id ?? actor?.username ?? "studio-owner"),
      };
      await writeFile(this.markerPath, `${JSON.stringify(marker, null, 2)}\n`, { encoding: "utf8", mode: 0o600, flag: "wx" });
      return { status: "INITIALIZED", initialized: true, username, initializedAt: marker.initializedAt };
    } finally {
      this.inFlight = false;
    }
  }
}

export function renderIdentityOwnerBootstrapPage({ username = "studio-admin", initialized = false } = {}) {
  const safeUsername = String(username).replace(/[&<>"']/g, (character) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[character]);
  return `<!doctype html>
<html lang="zh-CN"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1">
<title>Studio 身份初始化</title><style>
body{margin:0;background:#f4f7f5;color:#18332b;font:16px/1.55 ui-sans-serif,system-ui,-apple-system,"PingFang SC",sans-serif}.wrap{max-width:620px;margin:8vh auto;padding:24px}.card{background:#fff;border:1px solid #d9e5df;border-radius:22px;padding:34px;box-shadow:0 20px 60px rgba(24,51,43,.09)}h1{margin:0 0 8px;font-size:28px}.muted{color:#63756e}.badge{display:inline-block;padding:5px 11px;border-radius:999px;background:#e5f5ec;color:#17623f;font-weight:700;font-size:13px}label{display:block;margin:24px 0 8px;font-weight:700}input{box-sizing:border-box;width:100%;padding:13px 14px;border:1px solid #b7c9c0;border-radius:12px;font-size:16px}button{width:100%;margin-top:18px;border:0;border-radius:12px;padding:14px;background:#17623f;color:#fff;font-size:16px;font-weight:800;cursor:pointer}button:disabled{opacity:.55;cursor:not-allowed}.status{margin-top:18px;padding:13px;border-radius:12px;background:#f2f6f4;white-space:pre-wrap}.ok{background:#e5f5ec;color:#17623f}.error{background:#fdeceb;color:#9d2c26}a{color:#17623f}</style></head>
<body><main class="wrap"><section class="card"><span class="badge">仅限平台所有者 · 一次性</span><h1>初始化 MCP 登录身份</h1><p class="muted">为 <strong>${safeUsername}</strong> 设置最终密码。密码不会写入 Git、日志、任务或对话。</p>
${initialized ? '<div class="status ok">身份密码已经初始化。现在可以在 ChatGPT 中连接 Studio MCP。</div><p><a href="/">返回 Studio</a></p>' : '<label for="password">新密码</label><input id="password" type="password" autocomplete="new-password" minlength="16" maxlength="128" placeholder="至少 16 位，含大小写、数字和特殊字符"><label for="confirm">确认新密码</label><input id="confirm" type="password" autocomplete="new-password" minlength="16" maxlength="128" placeholder="再次输入"><button id="initialize" type="button">确认初始化身份密码</button><div id="status" class="status">等待平台所有者确认。</div>'}
</section></main>${initialized ? "" : `<script>
const button=document.getElementById('initialize'),status=document.getElementById('status');
button.addEventListener('click',async()=>{const password=document.getElementById('password').value,confirm=document.getElementById('confirm').value;if(password!==confirm){status.className='status error';status.textContent='两次输入的密码不一致。';return;}button.disabled=true;status.className='status';status.textContent='正在通过本机身份服务安全初始化…';try{const response=await fetch('/api/identity/owner-bootstrap',{method:'POST',headers:{'content-type':'application/json'},body:JSON.stringify({password})});const body=await response.json();if(!response.ok)throw new Error(body.reason||body.error?.message||'初始化失败');status.className='status ok';status.textContent='身份密码已初始化。现在可以连接 ChatGPT MCP。';document.getElementById('password').value='';document.getElementById('confirm').value='';}catch(error){status.className='status error';status.textContent=error.message;}finally{button.disabled=false;}});
</script>`}</body></html>`;
}
