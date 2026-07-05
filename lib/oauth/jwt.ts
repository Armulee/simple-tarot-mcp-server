/**
 * JWT signing/verification (HS256 via `jose`).
 *
 * Two token types, separated by audience/type claims so one can never be
 * replayed as the other:
 *   - access tokens (typ "at+jwt", aud = the MCP resource URL), TTL 1h
 *   - consent transaction tokens (aud "askingfate:oauth-consent"), TTL 10m,
 *     used as the signed CSRF-protected state of the /oauth/authorize form.
 */
import { SignJWT, jwtVerify, type JWTPayload } from "jose";

import { ACCESS_TOKEN_TTL_SECONDS, CONSENT_TXN_TTL_SECONDS } from "./config";
import { randomToken } from "./crypto";

const CONSENT_AUDIENCE = "askingfate:oauth-consent";

const globalRef = globalThis as unknown as { __askingfateDevJwtSecret?: string };

function getJwtSecret(): Uint8Array {
  let secret = process.env.JWT_SECRET;
  if (!secret) {
    if (process.env.NODE_ENV === "production") {
      throw new Error("JWT_SECRET env var must be set in production");
    }
    // Dev-only ephemeral secret: tokens survive for the process lifetime.
    if (!globalRef.__askingfateDevJwtSecret) {
      globalRef.__askingfateDevJwtSecret = randomToken(32);
      console.warn("[oauth] JWT_SECRET not set — using an ephemeral dev secret");
    }
    secret = globalRef.__askingfateDevJwtSecret;
  }
  return new TextEncoder().encode(secret);
}

export interface AccessTokenInput {
  issuer: string;
  resource: string;
  userId: string;
  clientId: string;
  scope: string;
}

export interface AccessTokenClaims extends JWTPayload {
  sub: string;
  user_id: string;
  scope: string;
  client_id: string;
  exp: number;
}

export async function signAccessToken(input: AccessTokenInput): Promise<{ token: string; expiresAt: number }> {
  const now = Math.floor(Date.now() / 1000);
  const expiresAt = now + ACCESS_TOKEN_TTL_SECONDS;
  const token = await new SignJWT({
    user_id: input.userId,
    scope: input.scope,
    client_id: input.clientId,
  })
    .setProtectedHeader({ alg: "HS256", typ: "at+jwt" })
    .setSubject(input.userId)
    .setIssuer(input.issuer)
    .setAudience(input.resource)
    .setIssuedAt(now)
    .setExpirationTime(expiresAt)
    .setJti(randomToken(16))
    .sign(getJwtSecret());
  return { token, expiresAt };
}

export async function verifyAccessToken(
  token: string,
  expected: { issuer: string; resource: string },
): Promise<AccessTokenClaims | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer: expected.issuer,
      audience: expected.resource,
    });
    if (typeof payload.sub !== "string" || typeof payload.scope !== "string") return null;
    return payload as AccessTokenClaims;
  } catch {
    return null;
  }
}

/** Everything the consent form needs to re-validate the POSTed decision. */
export interface ConsentTxnData {
  user_id: string;
  client_id: string;
  redirect_uri: string;
  scope: string;
  state?: string;
  code_challenge: string;
  resource?: string;
  nonce_hash: string; // sha256hex of the double-submit cookie value
}

export type ConsentTxn = ConsentTxnData & JWTPayload;

export async function signConsentTxn(txn: ConsentTxnData, issuer: string): Promise<string> {
  return new SignJWT({ ...txn })
    .setProtectedHeader({ alg: "HS256" })
    .setIssuer(issuer)
    .setAudience(CONSENT_AUDIENCE)
    .setIssuedAt()
    .setExpirationTime(Math.floor(Date.now() / 1000) + CONSENT_TXN_TTL_SECONDS)
    .setJti(randomToken(16))
    .sign(getJwtSecret());
}

export async function verifyConsentTxn(token: string, issuer: string): Promise<ConsentTxn | null> {
  try {
    const { payload } = await jwtVerify(token, getJwtSecret(), {
      algorithms: ["HS256"],
      issuer,
      audience: CONSENT_AUDIENCE,
    });
    if (
      typeof payload.user_id !== "string" ||
      typeof payload.client_id !== "string" ||
      typeof payload.redirect_uri !== "string" ||
      typeof payload.scope !== "string" ||
      typeof payload.code_challenge !== "string" ||
      typeof payload.nonce_hash !== "string"
    ) {
      return null;
    }
    return payload as ConsentTxn;
  } catch {
    return null;
  }
}
