/**
 * OAuth 2.1 authorization endpoint.
 *
 * GET  — validates the request, requires an askingfate.com login. Without one
 *        it redirects to the main site's /signin page, which hands the
 *        Supabase access token back to /oauth/callback (the main site keeps
 *        its session in localStorage, so it cannot be shared across
 *        subdomains — the token handoff bridges that). With a login it
 *        renders a short consent page.
 * POST — handles the consent decision (CSRF-protected via a signed transaction
 *        token + double-submit cookie) and redirects back to the client with a
 *        single-use authorization code (60s TTL, stored hashed) or an error.
 *
 * PKCE S256 is mandatory: requests without a valid code_challenge are rejected.
 */
import {
  AUTH_CODE_TTL_SECONDS,
  DEFAULT_SCOPE,
  isValidScopeString,
  issuerFromRequest,
  mcpResourceUrl,
  publicRequestUrl,
} from "@/lib/oauth/config";
import { isValidCodeChallenge, randomToken, sha256hex } from "@/lib/oauth/crypto";
import { buildRedirect, escapeHtml, htmlResponse, parseCookies, redirectResponse } from "@/lib/oauth/http";
import { signConsentTxn, verifyConsentTxn } from "@/lib/oauth/jwt";
import { buildLoginRedirect, getAskingfateUser, RETURN_COOKIE } from "@/lib/oauth/session";
import { getSupabaseConfig } from "@/lib/oauth/supabase";
import { getOAuthStore, type OAuthClient } from "@/lib/oauth/store";
import { pageShell } from "@/lib/oauth/ui";

export const maxDuration = 15;

const CONSENT_COOKIE = "af_oauth_consent";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  mcp: "Access AskingFate's fortune-telling tools — tarot, Thai horoscope, zodiac, and auspicious dates",
  claudeai: "Draw cards and read your fortune on your behalf through Claude",
};

/* ------------------------------------------------------------------ */
/* GET — validate, check session, render consent                       */
/* ------------------------------------------------------------------ */

export async function GET(req: Request): Promise<Response> {
  const params = new URL(req.url).searchParams;
  const clientId = params.get("client_id") ?? "";
  const redirectUriParam = params.get("redirect_uri");
  const state = params.get("state") ?? undefined;

  // client_id + redirect_uri must be valid BEFORE any redirect is issued
  // (RFC 6749 §4.1.2.1: never redirect to an unverified URI).
  let client: OAuthClient | null = null;
  if (clientId) {
    try {
      client = await getOAuthStore().getClient(clientId);
    } catch {
      return errorPage(503, "Service temporarily unavailable — please try again shortly (storage unavailable).");
    }
  }
  if (!client) {
    return errorPage(400, "Unknown client_id — please reconnect from your app.");
  }

  let redirectUri: string;
  if (redirectUriParam) {
    if (!client.redirect_uris.includes(redirectUriParam)) {
      return errorPage(400, "redirect_uri does not match the registered value.");
    }
    redirectUri = redirectUriParam;
  } else if (client.redirect_uris.length === 1) {
    redirectUri = client.redirect_uris[0];
  } else {
    return errorPage(400, "redirect_uri is required.");
  }

  // From here on, errors are reported by redirecting back to the client.
  const fail = (error: string, description: string): Response =>
    redirectResponse(buildRedirect(redirectUri, { error, error_description: description, state }));

  if (params.get("response_type") !== "code") {
    return fail("unsupported_response_type", "Only response_type=code is supported.");
  }

  const codeChallenge = params.get("code_challenge");
  const codeChallengeMethod = params.get("code_challenge_method");
  if (!codeChallenge || !isValidCodeChallenge(codeChallenge)) {
    return fail("invalid_request", "PKCE is required: provide a valid code_challenge.");
  }
  if (codeChallengeMethod !== "S256") {
    return fail("invalid_request", "code_challenge_method must be S256.");
  }

  // Scopes are opaque labels (Claude sends "claudeai") — format check only.
  const scope = params.get("scope")?.trim() || client.scope || DEFAULT_SCOPE;
  if (!isValidScopeString(scope)) {
    return fail("invalid_scope", "Malformed scope parameter.");
  }

  // RFC 8707 resource indicator: if present it must be our MCP endpoint.
  const issuer = issuerFromRequest(req);
  const expectedResource = mcpResourceUrl(issuer);
  const resourceParam = params.get("resource") ?? undefined;
  if (resourceParam && resourceParam.replace(/\/$/, "") !== expectedResource) {
    return fail("invalid_target", "Unknown resource indicator.");
  }

  // Require an askingfate.com login. Sign-in happens on the main site
  // itself: askingfate.com/signin (and /signup, and the Google
  // /auth/callback leg) recognises a callbackUrl pointing at this
  // deployment and returns to /oauth/callback with the Supabase access
  // token in the URL fragment; users already logged in on askingfate.com
  // pass straight through without typing anything.
  const user = await getAskingfateUser(req, issuer);
  if (!user) {
    if (!getSupabaseConfig()) {
      // Without Supabase env the token handoff could never be verified —
      // fail loudly here instead of looping through the main site.
      return errorPage(
        503,
        "Sign-in is not configured (SUPABASE_URL / SUPABASE_ANON_KEY must be set on this deployment).",
      );
    }
    return mainSiteSignInRedirect(req, issuer);
  }

  // Render consent, bound to this user + request via a signed txn token and a
  // double-submit nonce cookie.
  const nonce = randomToken(16);
  const txn = await signConsentTxn(
    {
      user_id: user.id,
      client_id: client.client_id,
      redirect_uri: redirectUri,
      scope,
      state,
      code_challenge: codeChallenge,
      resource: resourceParam,
      nonce_hash: sha256hex(nonce),
    },
    issuer,
  );

  const secure = issuer.startsWith("https:") ? "; Secure" : "";
  const response = htmlResponse(
    200,
    consentPage({
      clientName: client.client_name || "MCP client",
      userLabel: user.email || user.name || user.id,
      scope,
      txn,
    }),
  );
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${CONSENT_COOKIE}=${nonce}; Path=/oauth; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
  );
  return new Response(response.body, { status: response.status, headers });
}

/* ------------------------------------------------------------------ */
/* POST — consent decision                                             */
/* ------------------------------------------------------------------ */

export async function POST(req: Request): Promise<Response> {
  let form: FormData;
  try {
    form = await req.formData();
  } catch {
    return errorPage(400, "Malformed form submission.");
  }
  const decision = form.get("decision");
  const txnToken = form.get("txn");
  if (typeof decision !== "string" || typeof txnToken !== "string") {
    return errorPage(400, "Malformed form submission (missing form fields).");
  }

  const issuer = issuerFromRequest(req);
  const txn = await verifyConsentTxn(txnToken, issuer);
  if (!txn) {
    return errorPage(400, "This consent page has expired — please start the connection again.");
  }

  // Double-submit cookie must match the hash bound into the txn token.
  const cookies = parseCookies(req.headers.get("cookie"));
  const nonce = cookies[CONSENT_COOKIE];
  if (!nonce || sha256hex(nonce) !== txn.nonce_hash) {
    return errorPage(400, "Verification failed (CSRF check) — please start again.");
  }

  // The askingfate session must still belong to the user who saw the page.
  const user = await getAskingfateUser(req, issuer);
  if (!user || user.id !== txn.user_id) {
    return errorPage(403, "Your session changed during confirmation — please start the connection again.");
  }

  const clearCookie = `${CONSENT_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; SameSite=Lax${
    issuer.startsWith("https:") ? "; Secure" : ""
  }`;

  if (decision !== "allow") {
    const denied = buildRedirect(txn.redirect_uri, {
      error: "access_denied",
      error_description: "The user denied the request.",
      state: txn.state,
    });
    return withSetCookie(redirectResponse(denied), clearCookie);
  }

  const code = randomToken(32);
  try {
    await getOAuthStore().putCode(
      sha256hex(code),
      {
        client_id: txn.client_id,
        user_id: txn.user_id,
        redirect_uri: txn.redirect_uri,
        code_challenge: txn.code_challenge,
        scope: txn.scope,
        resource: txn.resource,
        expires_at: Math.floor(Date.now() / 1000) + AUTH_CODE_TTL_SECONDS,
      },
      AUTH_CODE_TTL_SECONDS,
    );
  } catch {
    return errorPage(503, "Service temporarily unavailable — please try again shortly (storage unavailable).");
  }

  const success = buildRedirect(txn.redirect_uri, { code, state: txn.state });
  return withSetCookie(redirectResponse(success), clearCookie);
}

/* ------------------------------------------------------------------ */
/* Helpers                                                             */
/* ------------------------------------------------------------------ */

function withSetCookie(response: Response, cookie: string): Response {
  const headers = new Headers(response.headers);
  headers.append("Set-Cookie", cookie);
  return new Response(response.body, { status: response.status, headers });
}

/**
 * Default sign-in: redirect to the main site's own /signin page with a
 * callbackUrl pointing at /oauth/callback here. After login the main site
 * hands the Supabase access token back in the URL fragment; /oauth/callback
 * turns it into our session cookie and resumes the authorize URL remembered
 * in the return cookie set below.
 */
function mainSiteSignInRedirect(req: Request, issuer: string): Response {
  const authorizeUrl = publicRequestUrl(req);
  const response = redirectResponse(buildLoginRedirect(`${issuer}/oauth/callback`));
  const secure = issuer.startsWith("https:") ? "; Secure" : "";
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${RETURN_COOKIE}=${encodeURIComponent(authorizeUrl)}; Path=/oauth; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
  );
  return new Response(null, { status: 302, headers });
}

function errorPage(status: number, message: string): Response {
  return htmlResponse(
    status,
    pageShell(
      `
      <div class="brand"><img src="/assets/logo.png" alt="AskingFate" /></div>
      <h1>Something went wrong</h1>
      <p class="sub">${escapeHtml(message)}</p>
    `,
      "AskingFate — Error",
    ),
  );
}

function consentPage({
  clientName,
  userLabel,
  scope,
  txn,
}: {
  clientName: string;
  userLabel: string;
  scope: string;
  txn: string;
}): string {
  const scopeItems = scope
    .split(" ")
    .filter(Boolean)
    .map((s) => `<li>${escapeHtml(SCOPE_DESCRIPTIONS[s] ?? s)}</li>`)
    .join("");
  // Claude gets its real logo (rounded via the shared .brand img style);
  // any other connector falls back to a monogram badge.
  const connectorBadge = /claude/i.test(clientName)
    ? `<img src="/assets/claude-logo.png" alt="${escapeHtml(clientName)}" />`
    : `<div class="mono">${escapeHtml((clientName.trim().charAt(0) || "?").toUpperCase())}</div>`;
  return pageShell(
    `
    <div class="brand">
      ${connectorBadge}
      <div class="dots"><i></i><i></i><i></i></div>
      <img src="/assets/logo.png" alt="AskingFate" />
    </div>
    <h1>Authorize connection</h1>
    <p class="sub"><strong>${escapeHtml(clientName)}</strong> wants to connect to your <strong>AskingFate</strong> account</p>
    <div class="account">${escapeHtml(userLabel)}</div>
    <ul class="perms">${scopeItems}</ul>
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="txn" value="${escapeHtml(txn)}" />
      <div class="buttons">
        <button type="submit" name="decision" value="allow" class="allow">Allow</button>
        <button type="submit" name="decision" value="deny" class="deny">Deny</button>
      </div>
    </form>
    <p class="fineprint">After you allow, you will be returned to ${escapeHtml(clientName)} automatically</p>
  `,
    "AskingFate — Authorize connection",
  );
}
