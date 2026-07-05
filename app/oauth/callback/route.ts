/**
 * Sign-in return leg: askingfate.com/signin (or /signup, or its Google
 * /auth/callback leg) redirects here after the user logs in there, with the
 * Supabase access token in the URL FRAGMENT.
 *
 * Fragments never reach the server, so this must be a browser page: its
 * inline script reads #access_token, POSTs it to /oauth/session to set our
 * HttpOnly session cookie, then returns to the authorize URL remembered in
 * the af_oauth_return cookie (validated to be our own authorize endpoint).
 * It renders as a plain "Signing you in…" flash — the only time a user
 * sees more is when session establishment fails, and then the page shows
 * the exact server error to make misconfiguration diagnosable.
 */
import { issuerFromRequest } from "@/lib/oauth/config";
import { randomToken } from "@/lib/oauth/crypto";
import { htmlResponse, parseCookies } from "@/lib/oauth/http";
import { RETURN_COOKIE } from "@/lib/oauth/session";
import { pageShell } from "@/lib/oauth/ui";

export const maxDuration = 15;

export async function GET(req: Request): Promise<Response> {
  const issuer = issuerFromRequest(req);

  // The return target comes from our own cookie, never from the URL — and it
  // must point back at this deployment's authorize endpoint (no open redirect).
  let returnUrl: string | null = null;
  const raw = parseCookies(req.headers.get("cookie"))[RETURN_COOKIE];
  if (raw) {
    try {
      const candidate = new URL(decodeURIComponent(raw));
      if (
        candidate.origin === issuer &&
        (candidate.pathname === "/oauth/authorize" || candidate.pathname === "/authorize")
      ) {
        returnUrl = candidate.toString();
      }
    } catch {
      // malformed cookie — treat as absent
    }
  }

  const nonce = randomToken(16);
  const cfg = JSON.stringify({ returnUrl }).replace(/</g, "\\u003c");
  const html = pageShell(
    `
    <div class="brand"><img src="/assets/logo.png" alt="AskingFate" /></div>
    <div class="spinner" id="spin"></div>
    <h1 id="headline">Signing you in…</h1>
    <p class="sub" id="status">Just a moment…</p>
    <script nonce="${nonce}">
      const CFG = ${cfg};
      const status = document.getElementById("status");
      function fail(message) {
        document.getElementById("spin").style.display = "none";
        document.getElementById("headline").textContent = "Sign-in failed";
        status.textContent = message + " — please start the connection again from your app.";
      }
      (async () => {
        const hash = new URLSearchParams(location.hash.replace(/^#/, ""));
        const query = new URLSearchParams(location.search);
        const error =
          hash.get("error_description") || query.get("error_description") ||
          hash.get("error") || query.get("error");
        const token = hash.get("access_token");
        if (!token) return fail(error || "No sign-in data received");
        try {
          const res = await fetch("/oauth/session", {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ access_token: token }),
          });
          if (!res.ok) {
            const data = await res.json().catch(() => null);
            const detail = (data && (data.error_description || data.error)) || ("HTTP " + res.status);
            return fail("Verification failed: " + detail);
          }
          if (CFG.returnUrl) location.replace(CFG.returnUrl);
          else fail("Signed in, but the page to return to was not found");
        } catch (e) {
          fail("Verification failed: " + (e && e.message ? e.message : "network error"));
        }
      })();
    </script>
  `,
    "AskingFate — Signing in",
  );

  const response = htmlResponse(200, html, { scriptNonce: nonce, connectSrc: [] });
  const secure = issuer.startsWith("https:") ? "; Secure" : "";
  const headers = new Headers(response.headers);
  // Single-use: drop the return cookie now that it is embedded in the page.
  headers.append("Set-Cookie", `${RETURN_COOKIE}=; Path=/oauth; Max-Age=0; HttpOnly; SameSite=Lax${secure}`);
  return new Response(response.body, { status: response.status, headers });
}
