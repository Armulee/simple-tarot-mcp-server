/**
 * OAuth 2.1 authorization endpoint.
 *
 * GET  — validates the request, requires an askingfate.com login. Without one
 *        it renders a sign-in page backed by the SAME Supabase project as the
 *        main site (email/password + Google — the main site keeps its session
 *        in localStorage, so it cannot be shared across subdomains). With one
 *        it renders a short consent page.
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
import { getSupabaseConfig, type SupabaseConfig } from "@/lib/oauth/supabase";
import { getOAuthStore, type OAuthClient } from "@/lib/oauth/store";

export const maxDuration = 15;

const CONSENT_COOKIE = "af_oauth_consent";

const SCOPE_DESCRIPTIONS: Record<string, string> = {
  mcp: "ใช้เครื่องมือดูดวงของ Asking Fate ในนามของคุณ (ไพ่ทาโรต์, ดวงไทย, ราศี, ฤกษ์มงคล)",
  claudeai: "ให้ Claude ใช้เครื่องมือดูดวงของ Asking Fate ในนามของคุณ",
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
      return errorPage(503, "ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง (storage unavailable)");
    }
  }
  if (!client) {
    return errorPage(400, "ไม่รู้จัก client นี้ (unknown client_id) — กรุณาเชื่อมต่อใหม่จากแอปของคุณ");
  }

  let redirectUri: string;
  if (redirectUriParam) {
    if (!client.redirect_uris.includes(redirectUriParam)) {
      return errorPage(400, "redirect_uri ไม่ตรงกับที่ลงทะเบียนไว้ (redirect_uri mismatch)");
    }
    redirectUri = redirectUriParam;
  } else if (client.redirect_uris.length === 1) {
    redirectUri = client.redirect_uris[0];
  } else {
    return errorPage(400, "ต้องระบุ redirect_uri (redirect_uri is required)");
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

  // Require an askingfate.com login; render our own sign-in page if absent.
  const user = await getAskingfateUser(req, issuer);
  if (!user) {
    const supabase = getSupabaseConfig();
    if (!supabase) {
      // No Supabase env — fall back to an external login page that must
      // redirect back here (see ASKINGFATE_LOGIN_URL).
      return redirectResponse(buildLoginRedirect(publicRequestUrl(req)));
    }
    return signInResponse(req, supabase, issuer, client.client_name || "MCP client");
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
    return errorPage(400, "คำขอไม่ถูกต้อง (malformed form submission)");
  }
  const decision = form.get("decision");
  const txnToken = form.get("txn");
  if (typeof decision !== "string" || typeof txnToken !== "string") {
    return errorPage(400, "คำขอไม่ถูกต้อง (missing form fields)");
  }

  const issuer = issuerFromRequest(req);
  const txn = await verifyConsentTxn(txnToken, issuer);
  if (!txn) {
    return errorPage(400, "หน้ายืนยันหมดอายุแล้ว กรุณาเริ่มเชื่อมต่อใหม่อีกครั้ง (consent expired)");
  }

  // Double-submit cookie must match the hash bound into the txn token.
  const cookies = parseCookies(req.headers.get("cookie"));
  const nonce = cookies[CONSENT_COOKIE];
  if (!nonce || sha256hex(nonce) !== txn.nonce_hash) {
    return errorPage(400, "การยืนยันไม่ถูกต้อง (CSRF check failed) — กรุณาเริ่มใหม่อีกครั้ง");
  }

  // The askingfate session must still belong to the user who saw the page.
  const user = await getAskingfateUser(req, issuer);
  if (!user || user.id !== txn.user_id) {
    return errorPage(403, "เซสชันเปลี่ยนไประหว่างการยืนยัน กรุณาเริ่มเชื่อมต่อใหม่อีกครั้ง");
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
    return errorPage(503, "ระบบไม่พร้อมใช้งานชั่วคราว กรุณาลองใหม่อีกครั้ง (storage unavailable)");
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
 * Sign-in page shown when there is no session yet. It logs the user in
 * against the main site's Supabase project client-side, then POSTs the
 * access token to /oauth/session (which sets our HttpOnly session cookie)
 * and reloads this authorize URL — which then renders the consent page.
 * A short-lived cookie remembers this URL across the Google round-trip.
 */
function signInResponse(req: Request, supabase: SupabaseConfig, issuer: string, clientName: string): Response {
  const authorizeUrl = publicRequestUrl(req);
  const nonce = randomToken(16);
  const response = htmlResponse(200, signInPage({ supabase, authorizeUrl, clientName, nonce }), {
    scriptNonce: nonce,
    connectSrc: [new URL(supabase.url).origin],
  });
  const secure = issuer.startsWith("https:") ? "; Secure" : "";
  const headers = new Headers(response.headers);
  headers.append(
    "Set-Cookie",
    `${RETURN_COOKIE}=${encodeURIComponent(authorizeUrl)}; Path=/oauth; Max-Age=600; HttpOnly; SameSite=Lax${secure}`,
  );
  return new Response(response.body, { status: response.status, headers });
}

function signInPage({
  supabase,
  authorizeUrl,
  clientName,
  nonce,
}: {
  supabase: SupabaseConfig;
  authorizeUrl: string;
  clientName: string;
  nonce: string;
}): string {
  // JSON-embedded config for the inline script; <-escape to stay <script>-safe.
  const cfg = JSON.stringify({
    supabaseUrl: supabase.url,
    anonKey: supabase.anonKey,
    callbackPath: "/oauth/callback",
  }).replace(/</g, "\\u003c");
  const signupHref = `https://askingfate.com/signup?callbackUrl=${encodeURIComponent(authorizeUrl)}`;
  return pageShell(
    `
    <h1>เข้าสู่ระบบ Asking Fate</h1>
    <p>เข้าสู่ระบบด้วยบัญชี askingfate.com ของคุณ เพื่อเชื่อมต่อกับ <strong>${escapeHtml(clientName)}</strong></p>
    <p id="err" class="error" hidden></p>
    <button type="button" id="google" class="google">เข้าสู่ระบบด้วย Google</button>
    <div class="divider"><span>หรือ</span></div>
    <form id="pw-form" method="post" action="#">
      <label for="email">อีเมล</label>
      <input id="email" name="email" type="email" autocomplete="email" required />
      <label for="password">รหัสผ่าน</label>
      <input id="password" name="password" type="password" autocomplete="current-password" required />
      <div class="buttons">
        <button type="submit" class="allow">เข้าสู่ระบบ</button>
      </div>
    </form>
    <p class="links">
      <a href="${escapeHtml(signupHref)}">สมัครสมาชิก</a> ·
      <a href="https://askingfate.com/forgot-password">ลืมรหัสผ่าน?</a>
    </p>
    <script nonce="${nonce}">
      const CFG = ${cfg};
      const errBox = document.getElementById("err");
      function showError(message) { errBox.textContent = message; errBox.hidden = false; }
      function busy(on) { for (const b of document.querySelectorAll("button")) b.disabled = on; }
      async function establishSession(accessToken) {
        const res = await fetch("/oauth/session", {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ access_token: accessToken }),
        });
        if (!res.ok) throw new Error("session rejected");
        location.reload();
      }
      document.getElementById("google").addEventListener("click", () => {
        busy(true);
        location.href = CFG.supabaseUrl + "/auth/v1/authorize?provider=google&redirect_to=" +
          encodeURIComponent(location.origin + CFG.callbackPath);
      });
      document.getElementById("pw-form").addEventListener("submit", async (e) => {
        e.preventDefault();
        errBox.hidden = true;
        busy(true);
        try {
          const res = await fetch(CFG.supabaseUrl + "/auth/v1/token?grant_type=password", {
            method: "POST",
            headers: { apikey: CFG.anonKey, "content-type": "application/json" },
            body: JSON.stringify({
              email: document.getElementById("email").value,
              password: document.getElementById("password").value,
            }),
          });
          const data = await res.json().catch(() => ({}));
          if (!res.ok || !data.access_token) {
            const msg = data.error_description || data.msg || "";
            showError(/invalid login credentials/i.test(msg)
              ? "อีเมลหรือรหัสผ่านไม่ถูกต้อง"
              : msg || "เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
            busy(false);
            return;
          }
          await establishSession(data.access_token);
        } catch {
          showError("เข้าสู่ระบบไม่สำเร็จ กรุณาลองใหม่อีกครั้ง");
          busy(false);
        }
      });
    </script>
  `,
  );
}

function errorPage(status: number, message: string): Response {
  return htmlResponse(
    status,
    pageShell(`
      <h1>เกิดข้อผิดพลาด</h1>
      <p>${escapeHtml(message)}</p>
    `),
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
  return pageShell(`
    <h1>อนุญาตการเชื่อมต่อ</h1>
    <p><strong>${escapeHtml(clientName)}</strong> ขอเข้าถึงบัญชี Asking Fate ของคุณ</p>
    <p class="account">บัญชี: ${escapeHtml(userLabel)}</p>
    <ul>${scopeItems}</ul>
    <form method="post" action="/oauth/authorize">
      <input type="hidden" name="txn" value="${escapeHtml(txn)}" />
      <div class="buttons">
        <button type="submit" name="decision" value="allow" class="allow">อนุญาต</button>
        <button type="submit" name="decision" value="deny" class="deny">ปฏิเสธ</button>
      </div>
    </form>
  `);
}

function pageShell(body: string): string {
  return `<!doctype html>
<html lang="th">
<head>
<meta charset="utf-8" />
<meta name="viewport" content="width=device-width, initial-scale=1" />
<title>Asking Fate — อนุญาตการเชื่อมต่อ</title>
<style>
  :root { color-scheme: dark; }
  body {
    margin: 0; min-height: 100vh; display: flex; align-items: center; justify-content: center;
    background: radial-gradient(ellipse at top, #241b3a 0%, #120d20 65%);
    color: #efe9ff; font-family: system-ui, -apple-system, "Segoe UI", sans-serif;
  }
  main {
    max-width: 420px; margin: 24px; padding: 32px 28px; border-radius: 16px;
    background: rgba(30, 22, 54, 0.85); border: 1px solid rgba(155, 130, 220, 0.35);
    box-shadow: 0 8px 40px rgba(0, 0, 0, 0.5);
  }
  h1 { font-size: 1.3rem; margin: 0 0 12px; }
  p { line-height: 1.55; margin: 8px 0; }
  .account { color: #b9a8e8; font-size: 0.9rem; }
  ul { padding-left: 20px; line-height: 1.6; }
  .buttons { display: flex; gap: 12px; margin-top: 24px; }
  button {
    flex: 1; padding: 12px 0; border-radius: 10px; border: none;
    font-size: 1rem; font-weight: 600; cursor: pointer;
  }
  .allow { background: #7c5cd6; color: #fff; }
  .deny { background: transparent; color: #cfc3ef; border: 1px solid rgba(155, 130, 220, 0.5); }
  button:disabled { opacity: 0.6; cursor: wait; }
  label { display: block; margin: 14px 0 6px; font-size: 0.85rem; color: #b9a8e8; }
  input {
    width: 100%; box-sizing: border-box; padding: 12px 14px; border-radius: 10px;
    border: 1px solid rgba(155, 130, 220, 0.35); background: rgba(18, 13, 32, 0.6);
    color: #efe9ff; font-size: 1rem;
  }
  input:focus { outline: none; border-color: #7c5cd6; }
  .google {
    width: 100%; padding: 12px 0; border-radius: 10px; font-size: 1rem; font-weight: 600;
    background: transparent; color: #efe9ff; border: 1px solid rgba(155, 130, 220, 0.5);
  }
  .divider {
    display: flex; align-items: center; gap: 12px; margin: 18px 0 4px;
    color: #8d7cb8; font-size: 0.85rem;
  }
  .divider::before, .divider::after { content: ""; flex: 1; height: 1px; background: rgba(155, 130, 220, 0.3); }
  .error {
    background: rgba(220, 80, 100, 0.12); border: 1px solid rgba(220, 80, 100, 0.45);
    color: #ffb9c4; border-radius: 10px; padding: 10px 14px; font-size: 0.9rem;
  }
  .links { text-align: center; font-size: 0.9rem; margin-top: 18px; }
  a { color: #b9a8e8; }
</style>
</head>
<body><main>${body}</main></body>
</html>`;
}
