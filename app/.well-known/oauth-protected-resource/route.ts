import { metadataCorsOptionsRequestHandler } from "mcp-handler";

import { protectedResourceMetadataResponse } from "@/lib/oauth/metadata";

export function GET(req: Request): Response {
  return protectedResourceMetadataResponse(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
