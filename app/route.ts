import { NextResponse } from "next/server";

/** Service descriptor for anyone visiting the root of mcp.askingfate.com. */
export async function GET() {
  return NextResponse.json({
    name: "Asking Fate MCP Server",
    description:
      "Remote MCP server for askingfate.com fortune-telling services: tarot spreads with an interactive card-picking UI, Thai horoscope data, zodiac info, and auspicious dates.",
    mcp_endpoint: "/api/mcp",
    transport: "streamable-http",
    tools: [
      "draw_tarot_spread",
      "get_thai_horoscope",
      "get_zodiac_info",
      "get_auspicious_dates",
    ],
  });
}
