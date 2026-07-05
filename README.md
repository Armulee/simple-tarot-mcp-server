# Asking Fate — MCP Server

Remote MCP server for [askingfate.com](https://askingfate.com) fortune-telling services, built with Next.js (App Router, API-only) and [`mcp-handler`](https://www.npmjs.com/package/mcp-handler).

**Endpoint:** `https://mcp.askingfate.com/api/mcp` (Streamable HTTP only — SSE is disabled, no Redis required)

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
npm run dev     # then connect an MCP client to http://localhost:3000/api/mcp
npm run build   # production build + strict TypeScript check
```

## Layout

- `app/api/[transport]/route.ts` — MCP handler (basePath `/api`), tool registration, CORS
- `lib/tarot/` — 78-card deck data, spread definitions, crypto-random shuffle
- `lib/astro/` — Thai Thaksa tables, horoscope/zodiac/auspicious-date logic
- `lib/mcp/tarot-app-html.ts` — self-contained card-picking MCP App (sandboxed iframe, no storage APIs)

## Auth

This version exposes public tools without auth. To add OAuth later, wrap the handler with `withMcpAuth` from `mcp-handler` (see the comment in `app/api/[transport]/route.ts`).
