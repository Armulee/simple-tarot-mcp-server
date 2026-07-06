/**
 * AskingFate — remote MCP server (Streamable HTTP only).
 *
 * Endpoint: /mcp  (deployed as https://mcp.askingfate.com/mcp)
 *
 * OAuth 2.1 protected: every request must carry a Bearer JWT issued by this
 * server's own authorization endpoints (see app/oauth/* and
 * app/.well-known/*). Requests without a valid token get 401 with a
 * WWW-Authenticate header pointing at the protected-resource metadata.
 * Tools can read the authenticated user via `extra.authInfo.extra.userId`.
 */
import { createMcpHandler, withMcpAuth } from "mcp-handler";
import {
  registerAppResource,
  registerAppTool,
  RESOURCE_MIME_TYPE,
} from "@modelcontextprotocol/ext-apps/server";
import { z } from "zod";

import { parseIsoDate, parseTime } from "@/lib/dates";
import { shuffleDeck } from "@/lib/tarot/draw";
import { SPREADS, SpreadType } from "@/lib/tarot/spreads";
import { buildThaiHoroscope, HoroscopeCategory } from "@/lib/astro/thai-horoscope";
import { buildZodiacInfo } from "@/lib/astro/zodiac";
import { buildAuspiciousDates, parseMonth, Purpose } from "@/lib/astro/auspicious";
import { TAROT_APP_HTML, TAROT_APP_URI } from "@/lib/mcp/tarot-app-html";
import { verifyMcpToken } from "@/lib/oauth/mcp-auth";
import { getStarBalance, spendStar } from "@/lib/stars/balance";

/** Detect the picker UI language from the question (Thai script → th, else en). */
function detectLocale(question?: string | null): "th" | "en" {
  return question && /[\u0E00-\u0E7F]/.test(question) ? "th" : "en";
}

/** The user id injected by withMcpAuth, read defensively from the tool `extra`. */
function userIdFromExtra(extra: unknown): string | undefined {
  const id = (extra as { authInfo?: { extra?: { userId?: unknown } } })?.authInfo
    ?.extra?.userId;
  return typeof id === "string" && id ? id : undefined;
}

/** Bilingual message shown when the user is out of stars. */
const INSUFFICIENT_STARS_MESSAGE =
  "⭐ ดาวของคุณไม่พอ (การดูดวงแต่ละครั้งใช้ 1 ดวง) — เติมดาวได้ที่ askingfate.com แล้วลองใหม่อีกครั้ง\n\n" +
  "You're out of stars — each reading costs 1 star. Top up at askingfate.com and try again.";

/**
 * Charge 1 star for a successful tool call. Every tool costs a star, so this
 * runs after input validation (invalid input never charges) and before the
 * result is returned. Returns a `blocked` result to short-circuit the tool when
 * the user is out of stars, plus the post-charge `stars` balance for display.
 * Fails OPEN: if spending is unconfigured or Supabase is unreachable the tool
 * proceeds uncharged rather than breaking.
 */
async function chargeStar(
  extra: unknown,
): Promise<{ blocked: ToolResult | null; stars: number | null }> {
  const userId = userIdFromExtra(extra);
  if (!userId) return { blocked: null, stars: null };

  const spend = await spendStar(userId, 1);
  if (spend.status === "insufficient") {
    return { blocked: errorResult(INSUFFICIENT_STARS_MESSAGE), stars: spend.balance };
  }
  if (spend.status === "ok") return { blocked: null, stars: spend.balance };
  // skipped (unconfigured / infra error) — proceed, show a best-effort balance.
  return { blocked: null, stars: await getStarBalance(userId) };
}

export const maxDuration = 60;

/**
 * Every tool deducts 1 star per successful call (see chargeStar), so none are
 * read-only or idempotent, and each touches the external star ledger. The hints
 * reflect that: readOnlyHint false → clients treat the call as state-changing
 * and shouldn't silently auto-run it; idempotentHint false → repeating a call
 * charges again; openWorldHint true → it reaches Supabase.
 */
const SPENDS_STAR = {
  readOnlyHint: false,
  idempotentHint: false,
  openWorldHint: true,
} as const;

type ToolResult = {
  content: Array<{ type: "text"; text: string }>;
  structuredContent?: Record<string, unknown>;
  isError?: boolean;
};

function errorResult(message: string): ToolResult {
  return { content: [{ type: "text", text: message }], isError: true };
}

function jsonResult(data: Record<string, unknown>, intro?: string): ToolResult {
  const text = JSON.stringify(data, null, 2);
  return {
    content: [{ type: "text", text: intro ? `${intro}\n${text}` : text }],
    structuredContent: data,
  };
}

const spreadTypeSchema = z.enum(["single", "three_card", "celtic_cross"], {
  errorMap: () => ({
    message:
      'spread_type must be one of "single" (1 card), "three_card" (3 cards: past/present/future), or "celtic_cross" (10 cards).',
  }),
});

const categorySchema = z.enum(["love", "career", "money", "health", "overall"], {
  errorMap: () => ({
    message:
      'category must be one of "love", "career", "money", "health", or "overall".',
  }),
});

const purposeSchema = z.enum(["wedding", "business", "moving", "car"], {
  errorMap: () => ({
    message:
      'purpose must be one of "wedding", "business" (opening a business), "moving" (moving house), or "car" (taking delivery of a car).',
  }),
});

const handler = createMcpHandler(
  (server) => {
    /* ------------------------------------------------------------------ */
    /* draw_tarot_spread — tarot draw with an interactive card-picking UI  */
    /* ------------------------------------------------------------------ */
    registerAppTool(
      server,
      "draw_tarot_spread",
      {
        title: "Draw Tarot Spread",
        description:
          "Shuffle a full 78-card tarot deck (no duplicates, each card upright or reversed) and open an interactive card-picking UI where the user taps face-down cards to complete the chosen spread. Use this when the user wants a tarot reading — single card, three-card past/present/future, or a 10-card Celtic Cross. The tool returns the shuffled deck; the user's actual picks arrive afterwards as a follow-up message from the UI, so wait for that message before interpreting. This tool draws cards only — it does not generate an interpretation or predict outcomes.",
        inputSchema: {
          spread_type: spreadTypeSchema.describe(
            'Spread layout: "single" = 1 card, "three_card" = 3 cards (past/present/future), "celtic_cross" = 10 cards.',
          ),
          question: z
            .string()
            .trim()
            .max(
              500,
              "question must be at most 500 characters — shorten the question and call again.",
            )
            .optional()
            .describe(
              "Optional question the user wants the reading to focus on, shown in the card-picking UI.",
            ),
        },
        annotations: { ...SPENDS_STAR },
        _meta: { ui: { resourceUri: TAROT_APP_URI } },
      },
      async ({ spread_type, question }, extra: unknown) => {
        const spread = SPREADS[spread_type as SpreadType];
        const trimmedQuestion = question?.trim() || null;
        const locale = detectLocale(trimmedQuestion);

        // Charge 1 star for the draw; stop here if the user is out of stars.
        const charge = await chargeStar(extra);
        if (charge.blocked) return charge.blocked;
        const stars = charge.stars;

        const deck = shuffleDeck();
        const fallbackDraw = spread.positions.map((pos, i) => ({
          position_index: pos.index,
          position_key: pos.key,
          position_label: pos.label,
          position_meaning: pos.meaning,
          name: deck[i].name,
          orientation: deck[i].reversed ? "reversed" : "upright",
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `🔮 The deck has been shuffled for a ${spread.name} reading and an interactive card-picking UI is being shown to the user. ` +
                "Do NOT interpret any cards yet — wait for the user's picks, which will arrive as a follow-up message from the UI listing the chosen cards and their positions. " +
                "Only if this client cannot display the interactive UI, use `fallback_draw` in structuredContent as the drawn cards and interpret those instead.",
            },
          ],
          structuredContent: {
            spread_type: spread.type,
            spread_name: spread.name,
            question: trimmedQuestion,
            locale,
            stars,
            star_cost: 1,
            positions: spread.positions,
            deck,
            fallback_draw: fallbackDraw,
          },
        };
      },
    );

    /* ------------------------------------------------------------------ */
    /* The HTML resource backing the card-picking UI                        */
    /* ------------------------------------------------------------------ */
    registerAppResource(
      server,
      "Tarot Card Picker",
      TAROT_APP_URI,
      {
        description:
          "Interactive linear-deck tarot card picker for draw_tarot_spread — slide a card up to select, with shuffle / pick-for-me controls and the user's star balance (mobile-first, self-contained HTML, EN/TH).",
        _meta: {
          ui: {
            // Fully self-contained: no network access needed inside the sandbox.
            csp: { connectDomains: [], resourceDomains: [] },
            prefersBorder: false,
          },
        },
      },
      async () => ({
        contents: [
          {
            uri: TAROT_APP_URI,
            mimeType: RESOURCE_MIME_TYPE,
            text: TAROT_APP_HTML,
          },
        ],
      }),
    );

    /* ------------------------------------------------------------------ */
    /* get_thai_horoscope                                                   */
    /* ------------------------------------------------------------------ */
    server.registerTool(
      "get_thai_horoscope",
      {
        title: "Get Thai Horoscope Data",
        description:
          "Look up structured Thai astrology data (the traditional Thaksa tables) for a birth date: the day-of-week planet, element, traditional lucky/unlucky colours, lucky numbers, the eight Thaksa positions, and — when a birth time is given — an approximate ascendant (lagna). Use this when the user asks about their Thai horoscope, birth-day fortune, lucky colours, or lucky numbers for a specific life area. Returns raw reference data computed from traditional tables for the caller to interpret; it does not generate fortune text or guarantee outcomes.",
        inputSchema: {
          birth_date: z
            .string()
            .describe('Birth date in ISO format YYYY-MM-DD, e.g. "1990-12-31".'),
          birth_time: z
            .string()
            .optional()
            .describe(
              'Optional birth time in 24-hour HH:mm, e.g. "08:30". Enables the Rahu day rule (Wednesday night), the dawn day-boundary rule, and an approximate ascendant.',
            ),
          category: categorySchema.describe(
            'Life area to focus on: "love", "career", "money", "health", or "overall".',
          ),
        },
        annotations: { ...SPENDS_STAR },
      },
      async ({ birth_date, birth_time, category }, extra: unknown) => {
        const date = parseIsoDate("birth_date", birth_date);
        if (!date.ok) return errorResult(date.error);

        const today = new Date();
        const todayNum =
          today.getUTCFullYear() * 10000 + (today.getUTCMonth() + 1) * 100 + today.getUTCDate();
        const birthNum = date.value.year * 10000 + date.value.month * 100 + date.value.day;
        if (birthNum > todayNum) {
          return errorResult(
            `Invalid birth_date: "${birth_date}" is in the future. Pass the person's actual date of birth in YYYY-MM-DD format.`,
          );
        }

        let time;
        if (birth_time !== undefined) {
          const parsed = parseTime("birth_time", birth_time);
          if (!parsed.ok) return errorResult(parsed.error);
          time = parsed.value;
        }

        const charge = await chargeStar(extra);
        if (charge.blocked) return charge.blocked;

        const data = buildThaiHoroscope(
          date.value,
          birth_date,
          category as HoroscopeCategory,
          time,
          birth_time,
        );
        return jsonResult(data as unknown as Record<string, unknown>);
      },
    );

    /* ------------------------------------------------------------------ */
    /* get_zodiac_info                                                      */
    /* ------------------------------------------------------------------ */
    server.registerTool(
      "get_zodiac_info",
      {
        title: "Get Zodiac Info",
        description:
          "Look up zodiac reference data for a birth date: the Western (tropical) sign with element, quality and traditional ruling planet; the approximate Thai sidereal sign; and the Thai/Chinese 12-year animal with its five-element cycle and year-boundary caveats. Use this when the user asks what their zodiac sign or birth-year animal is. Returns structured facts from traditional tables only — no horoscope text.",
        inputSchema: {
          birth_date: z
            .string()
            .describe('Birth date in ISO format YYYY-MM-DD, e.g. "1990-12-31".'),
        },
        annotations: { ...SPENDS_STAR },
      },
      async ({ birth_date }, extra: unknown) => {
        const date = parseIsoDate("birth_date", birth_date);
        if (!date.ok) return errorResult(date.error);
        const charge = await chargeStar(extra);
        if (charge.blocked) return charge.blocked;
        return jsonResult(buildZodiacInfo(date.value, birth_date) as unknown as Record<string, unknown>);
      },
    );

    /* ------------------------------------------------------------------ */
    /* get_auspicious_dates                                                 */
    /* ------------------------------------------------------------------ */
    server.registerTool(
      "get_auspicious_dates",
      {
        title: "Get Auspicious Dates",
        description:
          "List auspicious dates in a given month for a purpose — wedding, opening a business, moving house, or taking delivery of a car — rated by traditional Thai day-of-week principles, each with a short reason, plus the weekdays to avoid. Use this when the user is planning an event and asks for a good date. Ratings follow basic traditional day rules (not a personalised auspicious-time computation from the lunar calendar), and the result says so explicitly.",
        inputSchema: {
          month: z
            .string()
            .describe('Target month in YYYY-MM format, e.g. "2026-08" for August 2026.'),
          purpose: purposeSchema.describe(
            'Purpose of the event: "wedding", "business" (opening a business), "moving" (moving house), or "car" (taking delivery of a car).',
          ),
        },
        annotations: { ...SPENDS_STAR },
      },
      async ({ month, purpose }, extra: unknown) => {
        const parsed = parseMonth(month);
        if (!parsed.ok) return errorResult(parsed.error);
        const charge = await chargeStar(extra);
        if (charge.blocked) return charge.blocked;
        return jsonResult(
          buildAuspiciousDates(parsed.year, parsed.month, purpose as Purpose) as unknown as Record<
            string,
            unknown
          >,
        );
      },
    );
  },
  {
    serverInfo: { name: "askingfate-fortune-teller", version: "1.0.0" },
    instructions:
      "AskingFate (askingfate.com) fortune-telling tools: draw_tarot_spread opens an interactive card-picking UI (wait for the user's picks before interpreting), while get_thai_horoscope, get_zodiac_info and get_auspicious_dates return structured Thai-astrology reference data for you to interpret. Each successful tool call costs the user 1 star (deducted from their askingfate.com balance); if they're out of stars the tool returns a top-up message instead of data. Present readings as guidance based on traditional astrological principles, never as guaranteed predictions.",
  },
  {
    basePath: "", // matches app/[transport]/route.ts → endpoint is /mcp
    maxDuration: 60,
    disableSse: true, // Streamable HTTP only, no Redis needed
    verboseLogs: process.env.MCP_VERBOSE_LOGS === "true",
  },
);

/**
 * OAuth layer: verify the Bearer JWT and inject AuthInfo (user_id in
 * `extra.userId`) into every tool's context. `required: true` — no token, no
 * tools; mcp-handler answers 401 + WWW-Authenticate → resource metadata.
 */
const authHandler = withMcpAuth(handler, verifyMcpToken, {
  required: true,
  resourceMetadataPath: "/.well-known/oauth-protected-resource",
});

/**
 * CORS for browser-based MCP clients and MCP App iframes.
 * Mcp-Session-Id / Mcp-Protocol-Version are part of the Streamable HTTP transport.
 */
const CORS_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, POST, DELETE, OPTIONS",
  "Access-Control-Allow-Headers":
    "Content-Type, Authorization, Mcp-Session-Id, Mcp-Protocol-Version, Last-Event-ID",
  "Access-Control-Expose-Headers": "Mcp-Session-Id, Mcp-Protocol-Version, WWW-Authenticate",
  "Access-Control-Max-Age": "86400",
};

async function handleWithCors(request: Request): Promise<Response> {
  const response = await authHandler(request);
  const headers = new Headers(response.headers);
  for (const [key, value] of Object.entries(CORS_HEADERS)) headers.set(key, value);
  return new Response(response.body, {
    status: response.status,
    statusText: response.statusText,
    headers,
  });
}

export function OPTIONS(): Response {
  return new Response(null, { status: 204, headers: CORS_HEADERS });
}

export { handleWithCors as GET, handleWithCors as POST, handleWithCors as DELETE };
