/**
 * Asking Fate — remote MCP server (Streamable HTTP only).
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

export const maxDuration = 60;

/** All tools are read-only lookups/draws with no side effects and no external calls. */
const READ_ONLY = { readOnlyHint: true, openWorldHint: false } as const;

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
      'purpose must be one of "wedding" (งานมงคลสมรส), "business" (เปิดกิจการ), "moving" (ขึ้นบ้านใหม่), or "car" (ออกรถ).',
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
        annotations: { ...READ_ONLY, idempotentHint: false },
        _meta: { ui: { resourceUri: TAROT_APP_URI } },
      },
      async ({ spread_type, question }) => {
        const spread = SPREADS[spread_type as SpreadType];
        const deck = shuffleDeck();
        const trimmedQuestion = question?.trim() || null;

        const fallbackDraw = spread.positions.map((pos, i) => ({
          position_index: pos.index,
          position_key: pos.key,
          position_th: pos.label_th,
          position_en: pos.label_en,
          position_meaning: pos.meaning,
          name_en: deck[i].name_en,
          name_th: deck[i].name_th,
          orientation: deck[i].reversed ? "reversed" : "upright",
        }));

        return {
          content: [
            {
              type: "text",
              text:
                `🔮 The deck has been shuffled for a ${spread.name_en} reading and an interactive card-picking UI is being shown to the user. ` +
                "Do NOT interpret any cards yet — wait for the user's picks, which will arrive as a follow-up message from the UI listing the chosen cards and their positions. " +
                "Only if this client cannot display the interactive UI, use `fallback_draw` in structuredContent as the drawn cards and interpret those instead.",
            },
          ],
          structuredContent: {
            spread_type: spread.type,
            spread_name_th: spread.name_th,
            spread_name_en: spread.name_en,
            question: trimmedQuestion,
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
          "Interactive fan-layout tarot card picker for draw_tarot_spread (mobile-first, self-contained HTML).",
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
          "Look up structured Thai astrology data (ตำราทักษา) for a birth date: the day-of-week planet, element, traditional lucky/unlucky colours, lucky numbers, the eight Thaksa positions, and — when a birth time is given — an approximate ascendant (ลัคนา). Use this when the user asks about their Thai horoscope, ดวงวันเกิด, สีมงคล, or เลขมงคล for a specific life area. Returns raw reference data computed from traditional tables for the caller to interpret; it does not generate fortune text or guarantee outcomes.",
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
        annotations: { ...READ_ONLY, idempotentHint: true },
      },
      async ({ birth_date, birth_time, category }) => {
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
          "Look up zodiac reference data for a birth date: the Western (tropical) sign with element, quality and traditional ruling planet; the approximate Thai sidereal sign (ราศีแบบไทย); and the Thai/Chinese 12-year animal (นักษัตร) with its five-element cycle and year-boundary caveats. Use this when the user asks what their zodiac sign, ราศี, or ปีนักษัตร is. Returns structured facts from traditional tables only — no horoscope text.",
        inputSchema: {
          birth_date: z
            .string()
            .describe('Birth date in ISO format YYYY-MM-DD, e.g. "1990-12-31".'),
        },
        annotations: { ...READ_ONLY, idempotentHint: true },
      },
      async ({ birth_date }) => {
        const date = parseIsoDate("birth_date", birth_date);
        if (!date.ok) return errorResult(date.error);
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
          "List auspicious dates (วันดี) in a given month for a purpose — wedding, opening a business, moving house, or taking delivery of a car — rated by traditional Thai day-of-week principles, each with a short reason, plus the weekdays to avoid. Use this when the user is planning an event and asks for a good date. Ratings follow basic traditional day rules (not a personalised ฤกษ์ from the lunar calendar), and the result says so explicitly.",
        inputSchema: {
          month: z
            .string()
            .describe('Target month in YYYY-MM format, e.g. "2026-08" for August 2026.'),
          purpose: purposeSchema.describe(
            'Purpose of the event: "wedding" (งานมงคลสมรส), "business" (เปิดกิจการ), "moving" (ขึ้นบ้านใหม่), or "car" (ออกรถ).',
          ),
        },
        annotations: { ...READ_ONLY, idempotentHint: true },
      },
      async ({ month, purpose }) => {
        const parsed = parseMonth(month);
        if (!parsed.ok) return errorResult(parsed.error);
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
      "Asking Fate (askingfate.com) fortune-telling tools: draw_tarot_spread opens an interactive card-picking UI (wait for the user's picks before interpreting), while get_thai_horoscope, get_zodiac_info and get_auspicious_dates return structured Thai-astrology reference data for you to interpret. All tools are read-only and computed from traditional tables — present readings as guidance based on หลักโหราศาสตร์, never as guaranteed predictions.",
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
