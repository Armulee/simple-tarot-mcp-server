/**
 * Session establishment for the authorize sign-in page.
 *
 * POST { access_token } — a Supabase access token obtained client-side on
 * the /oauth/authorize sign-in page (password grant or the Google
 * round-trip). The token is verified server-side against the Supabase
 * project; on success the signed af_mcp_session cookie is set.
 *
 * Same-origin only (Origin header must match the issuer) — this endpoint is
 * exclusively called by our own pages, and the check prevents login CSRF.
 */
import { issuerFromRequest } from "@/lib/oauth/config";
import { enforceRateLimit, oauthError } from "@/lib/oauth/http";
import { buildSessionCookie } from "@/lib/oauth/session";
import { getSupabaseConfig, verifySupabaseAccessToken } from "@/lib/oauth/supabase";

export const maxDuration = 15;

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(req, "session", 30, 300);
  if (limited) return limited;

  const issuer = issuerFromRequest(req);
  const origin = req.headers.get("origin");
  if (!origin || origin.replace(/\/$/, "") !== issuer) {
    return oauthError(403, "invalid_request", "Cross-origin session establishment is not allowed.");
  }

  if (!getSupabaseConfig()) {
    return oauthError(503, "temporarily_unavailable", "Sign-in is not configured on this server.");
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
    return oauthError(401, "invalid_token", "The access token could not be verified.");
  }

  return new Response(null, {
    status: 204,
    headers: {
      "Cache-Control": "no-store",
      "Set-Cookie": await buildSessionCookie(user, issuer),
    },
  });
}
