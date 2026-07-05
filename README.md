# Asking Fate — MCP Server

Remote MCP server for [askingfate.com](https://askingfate.com) fortune-telling services, built with Next.js (App Router, API-only) and [`mcp-handler`](https://www.npmjs.com/package/mcp-handler).

**Endpoint:** `https://mcp.askingfate.com/mcp` (Streamable HTTP only — SSE is disabled), protected by OAuth 2.1 (see [Auth](#auth) below)

## Tools

| Tool | Description |
| --- | --- |
| `draw_tarot_spread` | Shuffles the full 78-card deck (crypto-random, no duplicates, upright/reversed) and opens an interactive MCP App UI where the user taps face-down cards arranged in a fan to complete the spread (`single`, `three_card`, or `celtic_cross`). The user's picks are sent back to the host for the model to interpret. |
| `get_thai_horoscope` | Structured Thai astrology data (ตำราทักษา) for a birth date: day planet, element, lucky/kalakini colours, lucky numbers, the eight Thaksa positions, and an approximate ascendant when a birth time is given. |
| `get_zodiac_info` | Western (tropical) sign with element/quality/ruling planet, approximate Thai sidereal sign, and the Thai/Chinese 12-year animal with year-boundary caveats. |
| `get_auspicious_dates` | Auspicious dates in a month for a purpose (`wedding`, `business`, `moving`, `car`) rated by traditional Thai day-of-week principles, with reasons and days to avoid. |

All tools are read-only (`readOnlyHint: true`), computed from static data modules — no external APIs. Tool results return structured JSON for the model to interpret; the server does not generate fortune text.

## Development

```bash
npm install
cp .env.example .env.local   # set OAUTH_DEV_USER_ID for local testing
npm run dev     # then connect an MCP client to http://localhost:3000/mcp
npm run build   # production build + strict TypeScript check
```

## Layout

- `app/[transport]/route.ts` — MCP handler, tool registration, CORS, `withMcpAuth` wrapper
- `app/oauth/` — OAuth 2.1 authorization server (`register`, `authorize`, `token`)
- `app/.well-known/` — OAuth metadata (RFC 9728 protected resource + RFC 8414 authorization server)
- `lib/oauth/` — token/store/session plumbing (see below)
- `lib/tarot/` — 78-card deck data, spread definitions, crypto-random shuffle
- `lib/astro/` — Thai Thaksa tables, horoscope/zodiac/auspicious-date logic
- `lib/mcp/tarot-app-html.ts` — self-contained card-picking MCP App (sandboxed iframe, no storage APIs)

## Auth

The MCP endpoint requires OAuth 2.1 Bearer tokens. This deployment is **both**
the authorization server and the protected resource (issuer =
`https://mcp.askingfate.com`), and it delegates login to the existing
askingfate.com account system.

### Flow (what Claude does when you add this as a custom connector)

1. `POST /mcp` without a token → `401` + `WWW-Authenticate` pointing at
   `/.well-known/oauth-protected-resource`, which points at the authorization
   server metadata (`/.well-known/oauth-authorization-server`).
2. Claude registers itself via **Dynamic Client Registration**
   (`POST /oauth/register`, RFC 7591). Public clients
   (`token_endpoint_auth_method: "none"`) and confidential clients
   (`client_secret_post` / `client_secret_basic`, secret stored hashed) are
   accepted; PKCE stays mandatory either way. Scope values are treated as
   opaque labels (Claude sends `claudeai`) — only the format is validated.
   Redirect URIs are checked against an allowlist
   (`https://claude.ai/api/mcp/auth_callback`,
   `https://claude.com/api/mcp/auth_callback`, plus
   `OAUTH_ALLOWED_REDIRECT_URIS`). The endpoints are also aliased at the
   MCP-spec default root paths (`/register`, `/authorize`, `/token`) for
   clients that skip metadata discovery.
3. The user lands on `GET /oauth/authorize`. No session yet → the endpoint
   renders its own sign-in page backed by the **same Supabase project as
   askingfate.com** (email/password and Google — same accounts). A successful
   sign-in POSTs the Supabase access token to `/oauth/session`, which verifies
   it server-side and sets a signed HttpOnly session cookie for this
   deployment; the page then reloads into a short consent page (app name,
   requested scopes, อนุญาต/ปฏิเสธ). The Google leg round-trips through
   `/oauth/callback`.
4. Consent issues a single-use authorization code (60 s TTL, stored hashed,
   bound to user + client + PKCE `code_challenge`) and redirects back to Claude.
5. `POST /oauth/token` exchanges the code — **PKCE S256 is verified on every
   exchange, no fallback** — for a 1-hour HS256 JWT access token
   (`user_id`, `scope`, `exp` in the payload) plus a 30-day refresh token
   (stored hashed, rotated on every use).
6. Tools receive the caller via `extra.authInfo` — the askingfate user id is at
   `extra.authInfo.extra.userId`.

### Storage

Three "tables", all keyed in Redis (Upstash REST / Vercel KV) with in-memory
fallback for local dev: `oauth_clients`, `oauth_codes`, `oauth_refresh_tokens`.
Codes and refresh tokens are stored **only as SHA-256 hashes**. Set
`UPSTASH_REDIS_REST_URL`/`UPSTASH_REDIS_REST_TOKEN` (or the `KV_REST_API_*`
pair) in production.

### Wiring up the askingfate.com account system

The main site authenticates with Supabase **in the browser** (the session
lives in localStorage on askingfate.com), so no cookie ever reaches the
`mcp.` subdomain. The authorize endpoint therefore runs its own sign-in
against the same Supabase project. Two deployment requirements:

1. Set `SUPABASE_URL` + `SUPABASE_ANON_KEY` (or their `NEXT_PUBLIC_`-prefixed
   twins) to the exact values the main site uses.
2. Add `https://mcp.askingfate.com/oauth/callback` to the Supabase project's
   allowed redirect URLs (Authentication → URL Configuration → Redirect URLs),
   otherwise "เข้าสู่ระบบด้วย Google" bounces to the main site instead of
   returning here.

`lib/oauth/session.ts`/`lib/oauth/supabase.ts` remain the single integration
point. If the Supabase env is missing, logged-out users are redirected to
`ASKINGFATE_LOGIN_URL` (default `https://askingfate.com/signin`) as a
fallback — but without a shared session cookie that flow cannot complete, so
treat it as a misconfiguration signal, not a feature.

### Testing locally / MCP Inspector

```bash
# .env.local: OAUTH_DEV_USER_ID=user_dev_1   (bypasses the askingfate session
# check — dev builds only, ignored in production)
npm run dev
npx @modelcontextprotocol/inspector   # connect to http://localhost:3000/mcp
```

Loopback redirect URIs (`http://localhost`, `http://127.0.0.1`) are allowed
outside production so the Inspector can complete the flow; in production they
are rejected unless `OAUTH_ALLOW_LOOPBACK_REDIRECTS=true`.

Quick smoke checks:

```bash
curl -si -X POST http://localhost:3000/mcp | grep -i www-authenticate
curl -s http://localhost:3000/.well-known/oauth-protected-resource | jq
curl -s http://localhost:3000/.well-known/oauth-authorization-server | jq
```
