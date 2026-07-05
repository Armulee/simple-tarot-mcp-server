/**
 * Session establishment for the sign-in handoff.
 *
 * POST { access_token } — a Supabase access token handed over by
 * askingfate.com after the user signs in there (see /oauth/callback). The
 * token is verified server-side against the Supabase project; on success
 * the signed af_mcp_session cookie is set.
 *
 * Same-origin only — this endpoint is exclusively called by our own
 * /oauth/callback page, and the check prevents login CSRF. The Origin
 * header must match either the derived issuer or the request's own host
 * (the latter covers deployments where OAUTH_ISSUER differs from the
 * serving hostname).
 */
import { issuerFromRequest } from "@/lib/oauth/config";
import { enforceRateLimit, isSameOriginRequest, oauthError } from "@/lib/oauth/http";
import { buildSessionCookie } from "@/lib/oauth/session";
import { getSupabaseConfig, verifySupabaseAccessToken } from "@/lib/oauth/supabase";

export const maxDuration = 15;

export async function POST(req: Request): Promise<Response> {
  try {
    return await establishSession(req);
  } catch (err) {
    // Most likely a missing JWT_SECRET (cookie signing) — surface it instead
    // of an opaque 500 so the callback page can show what to fix.
    console.error("[oauth] /oauth/session failed:", err);
    const message = err instanceof Error ? err.message : "unexpected error";
    return oauthError(500, "server_error", `Session could not be established: ${message}`);
  }
}

async function establishSession(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(req, "session", 30, 300);
  if (limited) return limited;

  const issuer = issuerFromRequest(req);
  if (!isSameOriginRequest(req, issuer)) {
    const origin = req.headers.get("origin");
    console.warn(`[oauth] session rejected: origin ${origin ?? "(none)"} vs issuer ${issuer}`);
    return oauthError(
      403,
      "invalid_request",
      `Cross-origin session establishment is not allowed (origin ${origin ?? "missing"}, issuer ${issuer}).`,
    );
  }

  if (!getSupabaseConfig()) {
    return oauthError(
      503,
      "temporarily_unavailable",
      "SUPABASE_URL / SUPABASE_ANON_KEY are not configured on this deployment.",
    );
  }

  let body: { access_token?: unknown };
  try {
    body = await req.json();
  } catch {
    return oauthError(400, "invalid_request", "Malformed JSON body.");
  }
  const accessToken = body.access_token;
  if (typeof accessToken !== "string" || accessToken === "" || accessToken.length > 8192) {
    return oauthError(400, "invalid_request", "access_token is required.");
  }

  const user = await verifySupabaseAccessToken(accessToken);
  if (!user) {
    return oauthError(
      401,
      "invalid_token",
      "Supabase rejected the access token — check that SUPABASE_URL and SUPABASE_ANON_KEY on this deployment match the main site's project.",
    );
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": await buildSessionCookie(user, issuer),
    },
  });
}
