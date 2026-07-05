/**
 * Storage layer for OAuth state. Three "tables":
 *
 *   oauth_clients         — dynamically registered clients (RFC 7591)
 *   oauth_codes           — authorization codes, keyed by SHA-256 hash, TTL 60s
 *   oauth_refresh_tokens  — refresh tokens, keyed by SHA-256 hash, TTL 30d
 *
 * Codes and refresh tokens are stored ONLY as SHA-256 hashes — never plaintext.
 *
 * Backends:
 *   - Upstash Redis via REST (set UPSTASH_REDIS_REST_URL/_TOKEN or the Vercel
 *     KV_REST_API_URL/_TOKEN pair) — use this in production.
 *   - In-memory fallback for local dev. State is per-process and lost on
 *     restart, which breaks the flow on serverless multi-instance deploys.
 */

export interface OAuthClient {
  client_id: string;
  client_name?: string;
  redirect_uris: string[];
  token_endpoint_auth_method: "none";
  grant_types: string[];
  response_types: string[];
  scope?: string;
  created_at: number; // epoch seconds
}

export interface AuthCodeRecord {
  client_id: string;
  user_id: string;
  redirect_uri: string;
  code_challenge: string;
  scope: string;
  resource?: string;
  expires_at: number; // epoch seconds
}

export interface RefreshTokenRecord {
  client_id: string;
  user_id: string;
  scope: string;
  resource?: string;
  created_at: number; // epoch seconds
  expires_at: number; // epoch seconds
}

export interface OAuthStore {
  putClient(client: OAuthClient): Promise<void>;
  getClient(clientId: string): Promise<OAuthClient | null>;
  putCode(codeHash: string, record: AuthCodeRecord, ttlSeconds: number): Promise<void>;
  /** Atomically fetch AND delete — authorization codes are single-use. */
  consumeCode(codeHash: string): Promise<AuthCodeRecord | null>;
  putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void>;
  /** Atomically fetch AND delete — refresh tokens rotate on every use. */
  consumeRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null>;
  /** Fixed-window counter for rate limiting. Returns the count within the window. */
  incrCounter(key: string, windowSeconds: number): Promise<number>;
}

const CLIENT_PREFIX = "oauth_clients:";
const CODE_PREFIX = "oauth_codes:";
const REFRESH_PREFIX = "oauth_refresh_tokens:";

/* ------------------------------------------------------------------ */
/* In-memory backend (dev only)                                        */
/* ------------------------------------------------------------------ */

interface MemoryEntry {
  value: string;
  expiresAtMs: number | null;
}

class MemoryStore implements OAuthStore {
  private data = new Map<string, MemoryEntry>();

  private get(key: string): string | null {
    const entry = this.data.get(key);
    if (!entry) return null;
    if (entry.expiresAtMs !== null && entry.expiresAtMs <= Date.now()) {
      this.data.delete(key);
      return null;
    }
    return entry.value;
  }

  private set(key: string, value: string, ttlSeconds: number | null): void {
    // Opportunistic sweep so the map cannot grow unbounded in a long dev session.
    if (this.data.size > 10_000) {
      const now = Date.now();
      for (const [k, v] of this.data) {
        if (v.expiresAtMs !== null && v.expiresAtMs <= now) this.data.delete(k);
      }
    }
    this.data.set(key, {
      value,
      expiresAtMs: ttlSeconds === null ? null : Date.now() + ttlSeconds * 1000,
    });
  }

  private take(key: string): string | null {
    const value = this.get(key);
    if (value !== null) this.data.delete(key);
    return value;
  }

  async putClient(client: OAuthClient): Promise<void> {
    this.set(CLIENT_PREFIX + client.client_id, JSON.stringify(client), null);
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const raw = this.get(CLIENT_PREFIX + clientId);
    return raw ? (JSON.parse(raw) as OAuthClient) : null;
  }

  async putCode(codeHash: string, record: AuthCodeRecord, ttlSeconds: number): Promise<void> {
    this.set(CODE_PREFIX + codeHash, JSON.stringify(record), ttlSeconds);
  }

  async consumeCode(codeHash: string): Promise<AuthCodeRecord | null> {
    const raw = this.take(CODE_PREFIX + codeHash);
    return raw ? (JSON.parse(raw) as AuthCodeRecord) : null;
  }

  async putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void> {
    this.set(REFRESH_PREFIX + tokenHash, JSON.stringify(record), ttlSeconds);
  }

  async consumeRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const raw = this.take(REFRESH_PREFIX + tokenHash);
    return raw ? (JSON.parse(raw) as RefreshTokenRecord) : null;
  }

  async incrCounter(key: string, windowSeconds: number): Promise<number> {
    const current = this.get(key);
    if (current === null) {
      this.set(key, "1", windowSeconds);
      return 1;
    }
    const next = parseInt(current, 10) + 1;
    const entry = this.data.get(key);
    if (entry) entry.value = String(next); // keep the original window expiry
    return next;
  }
}

/* ------------------------------------------------------------------ */
/* Upstash Redis backend (REST API, no extra dependency)                */
/* ------------------------------------------------------------------ */

type RedisReply = { result?: unknown; error?: string };

class UpstashStore implements OAuthStore {
  constructor(
    private readonly baseUrl: string,
    private readonly token: string,
  ) {}

  private async command(cmd: (string | number)[]): Promise<unknown> {
    const res = await fetch(this.baseUrl, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmd),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OAuth store request failed (${res.status})`);
    const data = (await res.json()) as RedisReply;
    if (data.error) throw new Error(`OAuth store error: ${data.error}`);
    return data.result;
  }

  private async pipeline(cmds: (string | number)[][]): Promise<RedisReply[]> {
    const res = await fetch(`${this.baseUrl}/pipeline`, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${this.token}`,
        "Content-Type": "application/json",
      },
      body: JSON.stringify(cmds),
      cache: "no-store",
    });
    if (!res.ok) throw new Error(`OAuth store request failed (${res.status})`);
    return (await res.json()) as RedisReply[];
  }

  async putClient(client: OAuthClient): Promise<void> {
    await this.command(["SET", CLIENT_PREFIX + client.client_id, JSON.stringify(client)]);
  }

  async getClient(clientId: string): Promise<OAuthClient | null> {
    const raw = await this.command(["GET", CLIENT_PREFIX + clientId]);
    return typeof raw === "string" ? (JSON.parse(raw) as OAuthClient) : null;
  }

  async putCode(codeHash: string, record: AuthCodeRecord, ttlSeconds: number): Promise<void> {
    await this.command(["SET", CODE_PREFIX + codeHash, JSON.stringify(record), "EX", ttlSeconds]);
  }

  async consumeCode(codeHash: string): Promise<AuthCodeRecord | null> {
    const raw = await this.command(["GETDEL", CODE_PREFIX + codeHash]);
    return typeof raw === "string" ? (JSON.parse(raw) as AuthCodeRecord) : null;
  }

  async putRefreshToken(tokenHash: string, record: RefreshTokenRecord, ttlSeconds: number): Promise<void> {
    await this.command(["SET", REFRESH_PREFIX + tokenHash, JSON.stringify(record), "EX", ttlSeconds]);
  }

  async consumeRefreshToken(tokenHash: string): Promise<RefreshTokenRecord | null> {
    const raw = await this.command(["GETDEL", REFRESH_PREFIX + tokenHash]);
    return typeof raw === "string" ? (JSON.parse(raw) as RefreshTokenRecord) : null;
  }

  async incrCounter(key: string, windowSeconds: number): Promise<number> {
    const replies = await this.pipeline([
      ["INCR", key],
      ["EXPIRE", key, windowSeconds, "NX"],
    ]);
    const count = replies[0]?.result;
    if (typeof count !== "number") throw new Error("OAuth store error: bad INCR reply");
    return count;
  }
}

/* ------------------------------------------------------------------ */
/* Backend selection                                                    */
/* ------------------------------------------------------------------ */

const globalRef = globalThis as unknown as {
  __askingfateOAuthStore?: OAuthStore;
  __askingfateOAuthStoreWarned?: boolean;
};

export function getOAuthStore(): OAuthStore {
  if (globalRef.__askingfateOAuthStore) return globalRef.__askingfateOAuthStore;

  const url = process.env.UPSTASH_REDIS_REST_URL ?? process.env.KV_REST_API_URL;
  const token = process.env.UPSTASH_REDIS_REST_TOKEN ?? process.env.KV_REST_API_TOKEN;

  if (url && token) {
    globalRef.__askingfateOAuthStore = new UpstashStore(url.replace(/\/$/, ""), token);
  } else {
    if (process.env.NODE_ENV === "production" && !globalRef.__askingfateOAuthStoreWarned) {
      globalRef.__askingfateOAuthStoreWarned = true;
      console.warn(
        "[oauth] No Redis configured (UPSTASH_REDIS_REST_URL/KV_REST_API_URL) — " +
          "falling back to in-memory OAuth storage. This does NOT work reliably " +
          "on serverless/multi-instance deployments.",
      );
    }
    globalRef.__askingfateOAuthStore = new MemoryStore();
  }
  return globalRef.__askingfateOAuthStore;
}
