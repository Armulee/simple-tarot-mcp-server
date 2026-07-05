import { createHash, randomBytes, timingSafeEqual } from "crypto";

/** URL-safe random secret; 32 bytes ≈ 256 bits of entropy. */
export function randomToken(bytes = 32): string {
  return randomBytes(bytes).toString("base64url");
}

/** Hex SHA-256 — used to store codes/refresh tokens hashed, never plaintext. */
export function sha256hex(input: string): string {
  return createHash("sha256").update(input).digest("hex");
}

/** base64url SHA-256 — the S256 PKCE transform (RFC 7636 §4.2). */
export function sha256base64url(input: string): string {
  return createHash("sha256").update(input).digest("base64url");
}

/** Constant-time string comparison. */
export function safeEqual(a: string, b: string): boolean {
  const bufA = Buffer.from(a);
  const bufB = Buffer.from(b);
  if (bufA.length !== bufB.length) return false;
  return timingSafeEqual(bufA, bufB);
}

const CODE_VERIFIER_PATTERN = /^[A-Za-z0-9\-._~]{43,128}$/;
const CODE_CHALLENGE_PATTERN = /^[A-Za-z0-9\-_]{43,128}$/;

export function isValidCodeChallenge(challenge: string): boolean {
  return CODE_CHALLENGE_PATTERN.test(challenge);
}

/** Verify PKCE S256: BASE64URL(SHA256(code_verifier)) === code_challenge. */
export function verifyPkceS256(codeVerifier: string, codeChallenge: string): boolean {
  if (!CODE_VERIFIER_PATTERN.test(codeVerifier)) return false;
  return safeEqual(sha256base64url(codeVerifier), codeChallenge);
}
