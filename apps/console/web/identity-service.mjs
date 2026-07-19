import { request as httpRequest } from "node:http";
import { readFile } from "node:fs/promises";

const DEFAULT_CONFIG_PATH = "/opt/anksen/identity/studio-mcp.json";
const PUBLIC_IDENTITY_PATHS = [
  "/auth/realms/anksen",
  "/auth/resources/",
  "/auth/robots.txt",
];
const PRIVATE_IDENTITY_PATHS = [
  "/auth/admin",
  "/auth/realms/master",
  "/auth/health",
  "/auth/metrics",
];

const requiredHttpsUrl = (name, value, expectedPath = null) => {
  if (!value) throw new Error(`${name} is required.`);
  const url = new URL(value);
  if (url.protocol !== "https:") throw new Error(`${name} must use HTTPS.`);
  if (expectedPath && url.pathname !== expectedPath) throw new Error(`${name} must use ${expectedPath}.`);
  return url.href.replace(/\/$/, "");
};

export function normalizeIdentityRuntimeConfig(value = {}) {
  if (value.authMode !== "oauth") throw new Error("Identity runtime authMode must be oauth.");
  const publicUrl = requiredHttpsUrl("publicUrl", value.publicUrl, "/mcp");
  const issuer = requiredHttpsUrl("issuer", value.issuer, "/auth/realms/anksen");
  const jwksUri = requiredHttpsUrl("jwksUri", value.jwksUri, "/auth/realms/anksen/protocol/openid-connect/certs");
  const metadataUri = requiredHttpsUrl("metadataUri", value.metadataUri, "/auth/realms/anksen/.well-known/openid-configuration");
  const origins = new Set([publicUrl, issuer, jwksUri, metadataUri].map((entry) => new URL(entry).origin));
  if (origins.size !== 1) throw new Error("Identity runtime URLs must share one public origin.");
  const metadataProbeUri = String(value.metadataProbeUri ?? metadataUri);
  const probeUrl = new URL(metadataProbeUri);
  const loopback = ["127.0.0.1", "localhost", "::1"].includes(probeUrl.hostname);
  if (probeUrl.protocol !== "https:" && !(probeUrl.protocol === "http:" && loopback)) throw new Error("metadataProbeUri must use HTTPS or explicit loopback HTTP.");
  const jwksFetchUri = String(value.jwksFetchUri ?? jwksUri);
  const jwksFetchUrl = new URL(jwksFetchUri);
  const jwksFetchLocal = ["127.0.0.1", "localhost", "::1"].includes(jwksFetchUrl.hostname);
  if (jwksFetchUrl.protocol !== "https:" && !(jwksFetchUrl.protocol === "http:" && jwksFetchLocal)) throw new Error("jwksFetchUri must use HTTPS or explicit loopback HTTP.");
  return {
    authMode: "oauth",
    publicUrl,
    issuer,
    jwksUri,
    jwksFetchUri,
    metadataUri,
    metadataProbeUri,
    upstreamOrigin: String(value.upstreamOrigin ?? "http://127.0.0.1:4320").replace(/\/$/, ""),
    rateLimit: Number(value.rateLimit ?? 60),
  };
}

export async function loadIdentityRuntimeConfig({
  path = process.env.STUDIO_MCP_CONFIG_PATH ?? DEFAULT_CONFIG_PATH,
  env = process.env,
} = {}) {
  let fileConfig = {};
  try {
    fileConfig = JSON.parse(await readFile(path, "utf8"));
  } catch (error) {
    if (error?.code !== "ENOENT") throw error;
  }
  const authMode = env.STUDIO_MCP_AUTH_MODE ?? fileConfig.authMode;
  if (!authMode) return null;
  return normalizeIdentityRuntimeConfig({
    ...fileConfig,
    authMode,
    publicUrl: env.STUDIO_MCP_PUBLIC_URL ?? fileConfig.publicUrl,
    issuer: env.STUDIO_OAUTH_ISSUER ?? fileConfig.issuer,
    jwksUri: env.STUDIO_OAUTH_JWKS_URI ?? fileConfig.jwksUri,
    jwksFetchUri: env.STUDIO_OAUTH_JWKS_FETCH_URI ?? fileConfig.jwksFetchUri,
    metadataUri: env.STUDIO_OAUTH_METADATA_URI ?? fileConfig.metadataUri,
    metadataProbeUri: env.STUDIO_OAUTH_METADATA_PROBE_URI ?? fileConfig.metadataProbeUri,
    upstreamOrigin: env.STUDIO_IDENTITY_UPSTREAM ?? fileConfig.upstreamOrigin,
    rateLimit: env.STUDIO_MCP_RATE_LIMIT ?? fileConfig.rateLimit,
  });
}

export function isPublicIdentityPath(pathname) {
  if (PRIVATE_IDENTITY_PATHS.some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`))) return false;
  return PUBLIC_IDENTITY_PATHS.some((prefix) => prefix.endsWith("/") ? pathname.startsWith(prefix) : pathname === prefix || pathname.startsWith(`${prefix}/`));
}

export function proxyIdentityRequest(request, response, { upstreamOrigin, publicOrigin }) {
  const incomingUrl = new URL(request.url ?? "/", publicOrigin);
  if (!isPublicIdentityPath(incomingUrl.pathname)) return false;
  const upstream = new URL(`${incomingUrl.pathname}${incomingUrl.search}`, upstreamOrigin);
  const headers = { ...request.headers };
  delete headers.host;
  delete headers.connection;
  delete headers["proxy-connection"];
  headers["x-forwarded-host"] = new URL(publicOrigin).host;
  headers["x-forwarded-proto"] = "https";
  headers["x-forwarded-port"] = "443";
  headers.host = upstream.host;
  const proxy = httpRequest(upstream, { method: request.method, headers }, (upstreamResponse) => {
    const responseHeaders = { ...upstreamResponse.headers };
    delete responseHeaders.connection;
    delete responseHeaders["transfer-encoding"];
    response.writeHead(upstreamResponse.statusCode ?? 502, responseHeaders);
    upstreamResponse.pipe(response);
  });
  proxy.on("error", () => {
    if (!response.headersSent) response.writeHead(502, { "content-type": "application/json", "cache-control": "no-store" });
    response.end(JSON.stringify({ error: "IDENTITY_SERVICE_UNAVAILABLE" }));
  });
  request.pipe(proxy);
  return true;
}
