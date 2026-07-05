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
3. The user lands on `GET /oauth/authorize`. No askingfate session → redirect
   to the main site's login page (`ASKINGFATE_LOGIN_URL`) with a callback back
   to the authorize URL. With a session → a short consent page (app name,
   requested scopes, อนุญาต/ปฏิเสธ).
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

`lib/oauth/session.ts` is the single integration point. The default
implementation forwards the request's cookies to
`ASKINGFATE_SESSION_ENDPOINT` (NextAuth-style `/api/auth/session`) and sends
logged-out users to `ASKINGFATE_LOGIN_URL`. Two things must hold on the main
site:

1. The session cookie is issued with `Domain=.askingfate.com` so the
   `mcp.` subdomain receives it.
2. The login page honours a `callbackUrl` query param (name configurable via
   `ASKINGFATE_LOGIN_CALLBACK_PARAM`) and redirects back after login.

If the main site uses a different auth system (Supabase, custom JWT, …),
replace `getAskingfateUser()` in that one file.

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
