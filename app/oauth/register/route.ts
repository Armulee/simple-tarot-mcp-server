/**
 * Dynamic Client Registration (RFC 7591) — Claude registers itself here
 * before starting the authorization flow.
 *
 * Public clients (token_endpoint_auth_method "none") and confidential
 * clients (client_secret_post / client_secret_basic) are both accepted;
 * PKCE remains mandatory for every flow either way. Unknown metadata
 * fields and unknown scope values (Claude sends "claudeai") are accepted,
 * not rejected — strictness here breaks real clients.
 */
import { DEFAULT_SCOPE, isRegistrableRedirectUri, isValidScopeString } from "@/lib/oauth/config";
import { randomToken, sha256hex } from "@/lib/oauth/crypto";
import { corsPreflight, enforceRateLimit, oauthError, oauthJson } from "@/lib/oauth/http";
import { getOAuthStore, type OAuthClient, type TokenEndpointAuthMethod } from "@/lib/oauth/store";

export const maxDuration = 15;

const ALLOWED_GRANT_TYPES = ["authorization_code", "refresh_token"];
const AUTH_METHODS: TokenEndpointAuthMethod[] = ["none", "client_secret_post", "client_secret_basic"];
const MAX_REDIRECT_URIS = 10;
const MAX_CLIENT_NAME_LENGTH = 200;

interface RegistrationRequest {
  redirect_uris?: unknown;
  client_name?: unknown;
  token_endpoint_auth_method?: unknown;
  grant_types?: unknown;
  response_types?: unknown;
  scope?: unknown;
}

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(req, "register", 10, 60);
  if (limited) return limited;

  let body: RegistrationRequest;
  try {
    body = (await req.json()) as RegistrationRequest;
  } catch {
    return oauthError(400, "invalid_client_metadata", "Request body must be a JSON object.");
  }
  if (!body || typeof body !== "object") {
    return oauthError(400, "invalid_client_metadata", "Request body must be a JSON object.");
  }

  // redirect_uris — required, every entry must pass the allowlist policy.
  const redirectUris = body.redirect_uris;
  if (!Array.isArray(redirectUris) || redirectUris.length === 0) {
    return oauthError(400, "invalid_redirect_uri", "redirect_uris must be a non-empty array.");
  }
  if (redirectUris.length > MAX_REDIRECT_URIS) {
    return oauthError(400, "invalid_redirect_uri", `At most ${MAX_REDIRECT_URIS} redirect_uris are allowed.`);
  }
  for (const uri of redirectUris) {
    if (typeof uri !== "string" || !isRegistrableRedirectUri(uri)) {
      return oauthError(
        400,
        "invalid_redirect_uri",
        "One or more redirect_uris are not on this server's allowlist.",
      );
    }
  }

  const authMethod = (body.token_endpoint_auth_method ?? "none") as TokenEndpointAuthMethod;
  if (!AUTH_METHODS.includes(authMethod)) {
    return oauthError(
      400,
      "invalid_client_metadata",
      `token_endpoint_auth_method must be one of: ${AUTH_METHODS.join(", ")}.`,
    );
  }

  const grantTypes = body.grant_types ?? ["authorization_code", "refresh_token"];
  if (
    !Array.isArray(grantTypes) ||
    grantTypes.length === 0 ||
    !grantTypes.every((g) => typeof g === "string" && ALLOWED_GRANT_TYPES.includes(g)) ||
    !grantTypes.includes("authorization_code")
  ) {
    return oauthError(
      400,
      "invalid_client_metadata",
      'grant_types may only contain "authorization_code" and "refresh_token".',
    );
  }

  const responseTypes = body.response_types ?? ["code"];
  if (!Array.isArray(responseTypes) || responseTypes.some((r) => r !== "code")) {
    return oauthError(400, "invalid_client_metadata", 'response_types must be ["code"].');
  }

  // Scope values are treated as opaque labels — validate the format only.
  let scope: string | undefined;
  if (body.scope !== undefined && body.scope !== "") {
    if (typeof body.scope !== "string" || !isValidScopeString(body.scope)) {
      return oauthError(400, "invalid_client_metadata", "scope is malformed.");
    }
    scope = body.scope;
  }

  let clientName: string | undefined;
  if (body.client_name !== undefined) {
    if (typeof body.client_name !== "string") {
      return oauthError(400, "invalid_client_metadata", "client_name must be a string.");
    }
    // eslint-disable-next-line no-control-regex
    clientName = body.client_name.replace(/[\x00-\x1f\x7f]/g, "").trim().slice(0, MAX_CLIENT_NAME_LENGTH);
  }

  // Confidential clients get a secret (returned once, stored only as a hash).
  const clientSecret = authMethod === "none" ? undefined : randomToken(32);

  const client: OAuthClient = {
    client_id: `af_${randomToken(24)}`,
    client_name: clientName || undefined,
    redirect_uris: redirectUris as string[],
    token_endpoint_auth_method: authMethod,
    client_secret_hash: clientSecret ? sha256hex(clientSecret) : undefined,
    grant_types: grantTypes as string[],
    response_types: ["code"],
    scope: scope ?? DEFAULT_SCOPE,
    created_at: Math.floor(Date.now() / 1000),
  };

  try {
    await getOAuthStore().putClient(client);
  } catch {
    return oauthError(503, "temporarily_unavailable", "Registration is temporarily unavailable.");
  }

  return oauthJson(201, {
    client_id: client.client_id,
    client_id_issued_at: client.created_at,
    ...(clientSecret ? { client_secret: clientSecret, client_secret_expires_at: 0 } : {}),
    client_name: client.client_name,
    redirect_uris: client.redirect_uris,
    token_endpoint_auth_method: client.token_endpoint_auth_method,
    grant_types: client.grant_types,
    response_types: client.response_types,
    scope: client.scope,
  });
}
