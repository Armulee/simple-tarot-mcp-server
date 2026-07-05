/**
 * OAuth metadata documents. This deployment is both the authorization server
 * and the protected resource, so both documents share one issuer.
 */
import { generateProtectedResourceMetadata } from "mcp-handler";

import { SUPPORTED_SCOPES, issuerFromRequest, mcpResourceUrl } from "./config";

const METADATA_HEADERS: Readonly<Record<string, string>> = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Methods": "GET, OPTIONS",
  "Access-Control-Allow-Headers": "*",
  "Access-Control-Max-Age": "86400",
  "Cache-Control": "max-age=3600",
  "Content-Type": "application/json",
};

/** RFC 9728 Protected Resource Metadata for the /mcp endpoint. */
export function protectedResourceMetadataResponse(req: Request): Response {
  const issuer = issuerFromRequest(req);
  const metadata = generateProtectedResourceMetadata({
    authServerUrls: [issuer],
    resourceUrl: mcpResourceUrl(issuer),
    additionalMetadata: {
      scopes_supported: [...SUPPORTED_SCOPES],
      bearer_methods_supported: ["header"],
      resource_name: "Asking Fate MCP Server",
      resource_documentation: "https://askingfate.com",
    },
  });
  return new Response(JSON.stringify(metadata), { headers: METADATA_HEADERS });
}

/** RFC 8414 Authorization Server Metadata. */
export function authorizationServerMetadataResponse(req: Request): Response {
  const issuer = issuerFromRequest(req);
  const metadata = {
    issuer,
    authorization_endpoint: `${issuer}/oauth/authorize`,
    token_endpoint: `${issuer}/oauth/token`,
    registration_endpoint: `${issuer}/oauth/register`,
    response_types_supported: ["code"],
    response_modes_supported: ["query"],
    grant_types_supported: ["authorization_code", "refresh_token"],
    // Public clients only: PKCE is mandatory, no client secrets are issued.
    token_endpoint_auth_methods_supported: ["none"],
    code_challenge_methods_supported: ["S256"],
    scopes_supported: [...SUPPORTED_SCOPES],
    service_documentation: "https://askingfate.com",
  };
  return new Response(JSON.stringify(metadata), { headers: METADATA_HEADERS });
}
