/**
 * RFC 8414 path-suffix variant: some MCP clients look for the authorization
 * server metadata at /.well-known/oauth-authorization-server/<resource path>
 * before falling back to the root document. Same content either way.
 */
import { metadataCorsOptionsRequestHandler } from "mcp-handler";

import { authorizationServerMetadataResponse } from "@/lib/oauth/metadata";

export function GET(req: Request): Response {
  return authorizationServerMetadataResponse(req);
}

export const OPTIONS = metadataCorsOptionsRequestHandler();
