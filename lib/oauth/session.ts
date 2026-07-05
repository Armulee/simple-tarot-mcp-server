/**
 * Bridge to the existing askingfate.com account system.
 *
 * The MCP server runs on a subdomain (mcp.askingfate.com), so the main site's
 * session cookie is visible here as long as it is issued with
 * `Domain=.askingfate.com`. We verify the session server-side by forwarding
 * the incoming Cookie header to the main site's session endpoint.
 *
 * Defaults assume a NextAuth/Auth.js-style main site; adjust via env:
 *   ASKINGFATE_SESSION_ENDPOINT   (default https://askingfate.com/api/auth/session)
 *   ASKINGFATE_LOGIN_URL          (default https://askingfate.com/login)
 *   ASKINGFATE_LOGIN_CALLBACK_PARAM (default callbackUrl)
 *
 * If the main site uses something else entirely (Supabase, custom JWT, …),
 * replace getAskingfateUser() below — it is the single integration point.
 */

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
export async function getAskingfateUser(req: Request): Promise<AskingfateUser | null> {
  // Local-testing shortcut (never active in production builds).
  if (process.env.NODE_ENV !== "production" && process.env.OAUTH_DEV_USER_ID) {
    return {
      id: process.env.OAUTH_DEV_USER_ID,
      email: process.env.OAUTH_DEV_USER_EMAIL ?? "dev@askingfate.local",
      name: "Dev User",
    };
  }

  const cookie = req.headers.get("cookie");
  if (!cookie) return null;

  const endpoint =
    process.env.ASKINGFATE_SESSION_ENDPOINT ?? "https://askingfate.com/api/auth/session";
  try {
    const res = await fetch(endpoint, {
      headers: { cookie, accept: "application/json" },
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

/** URL of the main site's login page, bouncing back to `returnTo` afterwards. */
export function buildLoginRedirect(returnTo: string): string {
  const loginUrl = process.env.ASKINGFATE_LOGIN_URL ?? "https://askingfate.com/login";
  const param = process.env.ASKINGFATE_LOGIN_CALLBACK_PARAM ?? "callbackUrl";
  const url = new URL(loginUrl);
  url.searchParams.set(param, returnTo);
  return url.toString();
}
