/**
 * Shared HTTP helpers for the OAuth endpoints: RFC 6749 error responses,
 * CORS (browser-based clients like MCP Inspector call these endpoints
 * cross-origin), rate limiting, and HTML rendering for the consent page.
 */
import { getOAuthStore } from "./store";

export const OAUTH_CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
  "Access-Control-Allow-Headers": "Content-Type, Authorization, Mcp-Protocol-Version",
  "Access-Control-Max-Age": "86400",
};

const NO_STORE_HEADERS: Readonly<Record<string, string>> = {
  "Cache-Control": "no-store",
  Pragma: "no-cache",
};

export function corsPreflight(): Response {
  return new Response(null, { status: 204, headers: OAUTH_CORS_HEADERS });
}

/** JSON success response for token/registration endpoints (never cached). */
export function oauthJson(status: number, body: Record<string, unknown>): Response {
  return new Response(JSON.stringify(body), {
    status,
    headers: {
      ...OAUTH_CORS_HEADERS,
      ...NO_STORE_HEADERS,
      "Content-Type": "application/json",
    },
  });
}

/**
 * RFC 6749 §5.2 error response: `{ error, error_description }` only —
 * internal details must never leak here.
 */
export function oauthError(status: number, error: string, description: string): Response {
  return oauthJson(status, { error, error_description: description });
}

/**
 * Fixed-window rate limit keyed by client IP. Returns a 429 response when the
 * limit is exceeded, or null to continue.
 */
export async function enforceRateLimit(
  req: Request,
  bucket: string,
  limit: number,
  windowSeconds: number,
): Promise<Response | null> {
  const forwarded = req.headers.get("x-forwarded-for");
  const ip = forwarded?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || "unknown";
  const window = Math.floor(Date.now() / 1000 / windowSeconds);
  const key = `oauth_ratelimit:${bucket}:${ip}:${window}`;
  try {
    const count = await getOAuthStore().incrCounter(key, windowSeconds);
    if (count > limit) {
      return oauthError(429, "temporarily_unavailable", "Too many requests — try again shortly.");
    }
  } catch {
    // A broken rate-limit backend must not take the whole endpoint down.
  }
  return null;
}

export function htmlResponse(status: number, html: string): Response {
  return new Response(html, {
    status,
    headers: {
      ...NO_STORE_HEADERS,
      "Content-Type": "text/html; charset=utf-8",
      "X-Frame-Options": "DENY",
      "Content-Security-Policy":
        "default-src 'none'; style-src 'unsafe-inline'; frame-ancestors 'none'; form-action 'self'",
      "Referrer-Policy": "no-referrer",
    },
  });
}

export function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;");
}

/** 302 redirect that must never be cached (OAuth redirects carry secrets). */
export function redirectResponse(location: string): Response {
  return new Response(null, {
    status: 302,
    headers: { ...NO_STORE_HEADERS, Location: location },
  });
}

/** Append OAuth params (code/state or error/state) to a redirect URI. */
export function buildRedirect(redirectUri: string, params: Record<string, string | undefined>): string {
  const url = new URL(redirectUri);
  for (const [key, value] of Object.entries(params)) {
    if (value !== undefined) url.searchParams.set(key, value);
  }
  return url.toString();
}
