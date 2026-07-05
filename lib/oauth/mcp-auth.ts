/**
 * Bearer-token verifier plugged into mcp-handler's `withMcpAuth`.
 *
 * Returns AuthInfo (with the askingfate user id in `extra.userId`) for a valid
 * JWT, or undefined — which makes withMcpAuth answer 401 with a
 * WWW-Authenticate header pointing at our protected-resource metadata.
 *
 * Inside tools the caller is available as `extra.authInfo`:
 *   async (args, extra) => { const userId = extra.authInfo?.extra?.userId; … }
 */
import type { AuthInfo } from "@modelcontextprotocol/sdk/server/auth/types.js";

import { issuerFromRequest, mcpResourceUrl } from "./config";
import { verifyAccessToken } from "./jwt";

export async function verifyMcpToken(req: Request, bearerToken?: string): Promise<AuthInfo | undefined> {
  if (!bearerToken) return undefined;

  const issuer = issuerFromRequest(req);
  const resource = mcpResourceUrl(issuer);
  const claims = await verifyAccessToken(bearerToken, { issuer, resource });
  if (!claims) return undefined;

  return {
    token: bearerToken,
    clientId: typeof claims.client_id === "string" ? claims.client_id : "",
    scopes: claims.scope.split(" ").filter(Boolean),
    expiresAt: claims.exp,
    resource: new URL(resource),
    extra: {
      userId: claims.sub,
    },
  };
}
