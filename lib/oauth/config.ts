/**
 * OAuth 2.1 configuration for the Asking Fate MCP server.
 *
 * This server acts as BOTH the OAuth authorization server and the protected
 * resource (the MCP endpoint at /mcp). The issuer is the public origin of
 * this deployment, e.g. https://mcp.askingfate.com.
 */
import { getPublicOrigin, getPublicUrl } from "mcp-handler";

/** Scopes this server understands. Keep in sync with metadata endpoints. */
export const SUPPORTED_SCOPES = ["mcp"] as const;
export const DEFAULT_SCOPE = "mcp";

export const ACCESS_TOKEN_TTL_SECONDS = 60 * 60; // 1 hour
export const AUTH_CODE_TTL_SECONDS = 60; // single-use, short-lived
export const REFRESH_TOKEN_TTL_SECONDS = 30 * 24 * 60 * 60; // 30 days
export const CONSENT_TXN_TTL_SECONDS = 10 * 60; // consent page validity

/**
 * Redirect URIs that clients may register, matched EXACTLY (RFC 8252 §7.3
 * loopback URIs are handled separately below). Extend via the
 * OAUTH_ALLOWED_REDIRECT_URIS env var (comma-separated) without a code change.
 */
const DEFAULT_REDIRECT_ALLOWLIST = [
  "https://claude.ai/api/mcp/auth_callback",
  "https://claude.com/api/mcp/auth_callback",
];

export function redirectUriAllowlist(): string[] {
  const extra = (process.env.OAUTH_ALLOWED_REDIRECT_URIS ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean);
  return [...new Set([...DEFAULT_REDIRECT_ALLOWLIST, ...extra])];
}

/**
 * Whether http://localhost / http://127.0.0.1 redirect URIs may be registered
 * (needed for MCP Inspector). Defaults to dev-only; override with
 * OAUTH_ALLOW_LOOPBACK_REDIRECTS=true|false.
 */
export function loopbackRedirectsAllowed(): boolean {
  const flag = process.env.OAUTH_ALLOW_LOOPBACK_REDIRECTS;
  if (flag === "true") return true;
  if (flag === "false") return false;
  return process.env.NODE_ENV !== "production";
}

function isLoopbackRedirectUri(uri: string): boolean {
  try {
    const u = new URL(uri);
    if (u.protocol !== "http:") return false;
    const host = u.hostname.replace(/^\[|\]$/g, "");
    return host === "localhost" || host === "127.0.0.1" || host === "::1";
  } catch {
    return false;
  }
}

/** Registration-time policy check for a single redirect URI. */
export function isRegistrableRedirectUri(uri: string): boolean {
  let parsed: URL;
  try {
    parsed = new URL(uri);
  } catch {
    return false;
  }
  if (parsed.hash) return false; // fragments are forbidden in redirect URIs
  if (redirectUriAllowlist().includes(uri)) return true;
  return loopbackRedirectsAllowed() && isLoopbackRedirectUri(uri);
}

/** Issuer identifier: OAUTH_ISSUER env override, else derived from the request. */
export function issuerFromRequest(req: Request): string {
  const explicit = process.env.OAUTH_ISSUER;
  if (explicit) return explicit.replace(/\/$/, "");
  return getPublicOrigin(req);
}

/** Canonical protected-resource identifier (the MCP endpoint). */
export function mcpResourceUrl(issuer: string): string {
  return `${issuer}/mcp`;
}

/** Public URL of the current request (proxy-header aware), incl. query string. */
export function publicRequestUrl(req: Request): string {
  return getPublicUrl(req).toString();
}

export function scopeIsSupported(scope: string): boolean {
  return scope
    .split(" ")
    .filter(Boolean)
    .every((s) => (SUPPORTED_SCOPES as readonly string[]).includes(s));
}
