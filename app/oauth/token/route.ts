/**
 * OAuth 2.1 token endpoint.
 *
 *   grant_type=authorization_code — single-use hashed code + mandatory PKCE
 *     S256 verification, exact redirect_uri match.
 *   grant_type=refresh_token — hashed refresh tokens, rotated on every use.
 *
 * Access tokens are HS256 JWTs (1h) carrying user_id + scope; refresh tokens
 * are opaque 256-bit secrets stored only as SHA-256 hashes (30d).
 * Errors follow RFC 6749 §5.2 and never leak internals. Nothing here logs
 * codes, verifiers, or tokens.
 */
import {
  DEFAULT_SCOPE,
  REFRESH_TOKEN_TTL_SECONDS,
  issuerFromRequest,
  mcpResourceUrl,
} from "@/lib/oauth/config";
import { randomToken, safeEqual, sha256hex, verifyPkceS256 } from "@/lib/oauth/crypto";
import { corsPreflight, enforceRateLimit, oauthError, oauthJson } from "@/lib/oauth/http";
import { signAccessToken } from "@/lib/oauth/jwt";
import { getOAuthStore, type OAuthClient } from "@/lib/oauth/store";

export const maxDuration = 15;

export function OPTIONS(): Response {
  return corsPreflight();
}

export async function POST(req: Request): Promise<Response> {
  const limited = await enforceRateLimit(req, "token", 30, 60);
  if (limited) return limited;

  let params: URLSearchParams;
  const contentType = req.headers.get("content-type") ?? "";
  try {
    if (contentType.includes("application/json")) {
      const body = (await req.json()) as Record<string, unknown>;
      params = new URLSearchParams();
      for (const [key, value] of Object.entries(body)) {
        if (typeof value === "string") params.set(key, value);
      }
    } else {
      params = new URLSearchParams(await req.text());
    }
  } catch {
    return oauthError(400, "invalid_request", "Malformed request body.");
  }

  const grantType = params.get("grant_type");
  switch (grantType) {
    case "authorization_code":
      return handleAuthorizationCode(req, params);
    case "refresh_token":
      return handleRefreshToken(req, params);
    default:
      return oauthError(400, "unsupported_grant_type", "Unsupported grant_type.");
  }
}

/**
 * Resolve and authenticate the client. Public clients ("none") pass with just
 * a client_id; confidential clients must present their secret via HTTP Basic
 * or the client_secret body param. Returns a Response on failure.
 */
async function authenticateClient(req: Request, params: URLSearchParams): Promise<OAuthClient | Response> {
  let clientId = params.get("client_id");
  let clientSecret = params.get("client_secret");

  const authHeader = req.headers.get("authorization");
  if (authHeader?.toLowerCase().startsWith("basic ")) {
    try {
      const decoded = Buffer.from(authHeader.slice(6).trim(), "base64").toString("utf8");
      const sep = decoded.indexOf(":");
      if (sep !== -1) {
        clientId = decodeURIComponent(decoded.slice(0, sep));
        clientSecret = decodeURIComponent(decoded.slice(sep + 1));
      }
    } catch {
      return oauthError(401, "invalid_client", "Malformed Basic authorization header.");
    }
  }

  if (!clientId) return oauthError(400, "invalid_request", "client_id is required.");

  const client = await getOAuthStore().getClient(clientId);
  if (!client) return oauthError(401, "invalid_client", "Unknown client.");

  if (client.token_endpoint_auth_method !== "none") {
    if (
      !clientSecret ||
      !client.client_secret_hash ||
      !safeEqual(sha256hex(clientSecret), client.client_secret_hash)
    ) {
      return oauthError(401, "invalid_client", "Client authentication failed.");
    }
  }
  return client;
}

async function handleAuthorizationCode(req: Request, params: URLSearchParams): Promise<Response> {
  const code = params.get("code");
  const redirectUri = params.get("redirect_uri");
  const codeVerifier = params.get("code_verifier");

  if (!code || !redirectUri || !codeVerifier) {
    return oauthError(400, "invalid_request", "code, redirect_uri and code_verifier are required.");
  }

  try {
    const client = await authenticateClient(req, params);
    if (client instanceof Response) return client;

    // Single use: the code is atomically consumed here; a replay finds nothing.
    const record = await getOAuthStore().consumeCode(sha256hex(code));
    if (!record) return oauthError(400, "invalid_grant", "Authorization code is invalid or expired.");

    const now = Math.floor(Date.now() / 1000);
    if (
      record.client_id !== client.client_id ||
      record.redirect_uri !== redirectUri ||
      record.expires_at <= now
    ) {
      return oauthError(400, "invalid_grant", "Authorization code is invalid or expired.");
    }

    // PKCE — verified on every exchange, no fallback.
    if (!verifyPkceS256(codeVerifier, record.code_challenge)) {
      return oauthError(400, "invalid_grant", "PKCE verification failed.");
    }

    return issueTokens(req, {
      userId: record.user_id,
      clientId: client.client_id,
      scope: record.scope || DEFAULT_SCOPE,
      resource: record.resource,
    });
  } catch {
    return oauthError(503, "temporarily_unavailable", "Token service is temporarily unavailable.");
  }
}

async function handleRefreshToken(req: Request, params: URLSearchParams): Promise<Response> {
  const refreshToken = params.get("refresh_token");
  if (!refreshToken) {
    return oauthError(400, "invalid_request", "refresh_token is required.");
  }

  try {
    const client = await authenticateClient(req, params);
    if (client instanceof Response) return client;

    // Rotation: consuming deletes the old token; a replayed token finds nothing.
    const record = await getOAuthStore().consumeRefreshToken(sha256hex(refreshToken));
    if (
      !record ||
      record.client_id !== client.client_id ||
      record.expires_at <= Math.floor(Date.now() / 1000)
    ) {
      return oauthError(400, "invalid_grant", "Refresh token is invalid or expired.");
    }

    // An optional scope param may only narrow, never widen (RFC 6749 §6).
    let scope = record.scope;
    const requestedScope = params.get("scope");
    if (requestedScope) {
      const granted = new Set(record.scope.split(" ").filter(Boolean));
      const requested = requestedScope.split(" ").filter(Boolean);
      if (!requested.every((s) => granted.has(s))) {
        return oauthError(400, "invalid_scope", "Requested scope exceeds the originally granted scope.");
      }
      scope = requested.join(" ");
    }

    return issueTokens(req, {
      userId: record.user_id,
      clientId: client.client_id,
      scope,
      resource: record.resource,
    });
  } catch {
    return oauthError(503, "temporarily_unavailable", "Token service is temporarily unavailable.");
  }
}

async function issueTokens(
  req: Request,
  grant: { userId: string; clientId: string; scope: string; resource?: string },
): Promise<Response> {
  const issuer = issuerFromRequest(req);
  const resource = grant.resource ?? mcpResourceUrl(issuer);

  const { token: accessToken } = await signAccessToken({
    issuer,
    resource,
    userId: grant.userId,
    clientId: grant.clientId,
    scope: grant.scope,
  });

  const now = Math.floor(Date.now() / 1000);
  const refreshToken = randomToken(32);
  await getOAuthStore().putRefreshToken(
    sha256hex(refreshToken),
    {
      client_id: grant.clientId,
      user_id: grant.userId,
      scope: grant.scope,
      resource: grant.resource,
      created_at: now,
      expires_at: now + REFRESH_TOKEN_TTL_SECONDS,
    },
    REFRESH_TOKEN_TTL_SECONDS,
  );

  return oauthJson(200, {
    access_token: accessToken,
    token_type: "Bearer",
    expires_in: 3600,
    refresh_token: refreshToken,
    scope: grant.scope,
  });
}
