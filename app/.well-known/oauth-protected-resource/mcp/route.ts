/**
 * RFC 9728 path-suffix variant: metadata for the resource "/mcp" is also
 * discoverable at /.well-known/oauth-protected-resource/mcp.
 */
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

import { protectedResourceMetadataResponse } from "@/lib/oauth/metadata";

export function GET(req: Request): Response {
  return protectedResourceMetadataResponse(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
