/**
 * Bridge to the existing askingfate.com account system.
 *
 * The main site authenticates with Supabase in the browser, so its session
 * lives in localStorage on askingfate.com and is invisible to this server.
 * The authorize endpoint therefore runs its own sign-in (see
 * app/oauth/authorize — same Supabase project, same accounts) and keeps the
 * result in a signed HttpOnly cookie scoped to this deployment.
 *
 * getAskingfateUser() resolves the user in this order:
 *   1. OAUTH_DEV_USER_ID shortcut (non-production only)
 *   2. the af_mcp_session cookie (signed JWT, set by POST /oauth/session)
 *   3. a legacy cookie-forwarding session endpoint, ONLY if
 *      ASKINGFATE_SESSION_ENDPOINT is explicitly configured
 */
import { SESSION_TTL_SECONDS } from "./config";
import { parseCookies } from "./http";
import { signSessionToken, verifySessionToken } from "./jwt";

export const SESSION_COOKIE = "af_mcp_session";

/** Where to send the user back after the Supabase OAuth (Google) round-trip. */
export const RETURN_COOKIE = "af_oauth_return";

export interface AskingfateUser {
  id: string;
  email?: string;
  name?: string;
}

interface SessionUserShape {
  id?: unknown;
  sub?: unknown;
  userId?: unknown;
  email?: unknown;
  name?: unknown;
}

/** Resolve the logged-in askingfate user for this request, or null. */
export async function getAskingfateUser(req: Request, issuer: string): Promise<AskingfateUser | null> {
  // Local-testing shortcut (never active in production builds).
  if (process.env.NODE_ENV !== "production" && process.env.OAUTH_DEV_USER_ID) {
    return {
      id: process.env.OAUTH_DEV_USER_ID,
      email: process.env.OAUTH_DEV_USER_EMAIL ?? "dev@askingfate.local",
      name: "Dev User",
    };
  }

  const cookies = parseCookies(req.headers.get("cookie"));

  // Our own session cookie, established by the authorize sign-in page.
  const sessionToken = cookies[SESSION_COOKIE];
  if (sessionToken) {
    const claims = await verifySessionToken(sessionToken, issuer);
    if (claims) return { id: claims.sub, email: claims.email, name: claims.name };
  }

  // Legacy bridge: forward the Cookie header to a main-site session endpoint.
  // Off by default — the current main site has no such endpoint.
  const endpoint = process.env.ASKINGFATE_SESSION_ENDPOINT;
  if (!endpoint || !req.headers.get("cookie")) return null;
  try {
    const res = await fetch(endpoint, {
      headers: { cookie: req.headers.get("cookie")!, accept: "application/json" },
      cache: "no-store",
      redirect: "manual",
    });
    if (!res.ok) return null;
    const data = (await res.json().catch(() => null)) as
      | { user?: SessionUserShape }
      | SessionUserShape
      | null;
    if (!data || typeof data !== "object") return null;
    const user: SessionUserShape = "user" in data && data.user ? data.user : (data as SessionUserShape);
    const id = user.id ?? user.sub ?? user.userId ?? user.email;
    if (id === undefined || id === null || id === "") return null;
    return {
      id: String(id),
      email: typeof user.email === "string" ? user.email : undefined,
      name: typeof user.name === "string" ? user.name : undefined,
    };
  } catch {
    return null;
  }
}

/** Set-Cookie value establishing the signed session (Path=/ so the /authorize alias sees it too). */
export async function buildSessionCookie(user: AskingfateUser, issuer: string): Promise<string> {
  const token = await signSessionToken({ sub: user.id, email: user.email, name: user.name }, issuer);
  const secure = issuer.startsWith("https:") ? "; Secure" : "";
  return `${SESSION_COOKIE}=${token}; Path=/; Max-Age=${SESSION_TTL_SECONDS}; HttpOnly; SameSite=Lax${secure}`;
}

/**
 * URL of an external login page honouring a callback param — used only as a
 * fallback when Supabase env is missing. The main site's page is /signin
 * (there is no /login route there).
 */
export function buildLoginRedirect(returnTo: string): string {
  const loginUrl = process.env.ASKINGFATE_LOGIN_URL ?? "https://askingfate.com/signin";
  const param = process.env.ASKINGFATE_LOGIN_CALLBACK_PARAM ?? "callbackUrl";
  const url = new URL(loginUrl);
  url.searchParams.set(param, returnTo);
  return url.toString();
}
