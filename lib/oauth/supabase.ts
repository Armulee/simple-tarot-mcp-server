/**
 * Supabase bridge to the askingfate.com account system.
 *
 * The main site authenticates users with Supabase in the browser
 * (localStorage session, no cross-subdomain cookie), so this server cannot
 * see that session. Instead, the /oauth/authorize sign-in page logs the user
 * in against the SAME Supabase project (same accounts, email/password and
 * Google) and this module verifies the resulting access token server-side.
 *
 * Env (use the same values as the main site):
 *   SUPABASE_URL       or NEXT_PUBLIC_SUPABASE_URL
 *   SUPABASE_ANON_KEY  or NEXT_PUBLIC_SUPABASE_ANON_KEY
 */
import type { AskingfateUser } from "./session";

export interface SupabaseConfig {
  url: string; // project origin, no trailing slash
  anonKey: string;
}

export function getSupabaseConfig(): SupabaseConfig | null {
  const url = process.env.SUPABASE_URL ?? process.env.NEXT_PUBLIC_SUPABASE_URL;
  const anonKey = process.env.SUPABASE_ANON_KEY ?? process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY;
  if (!url || !anonKey) return null;
  return { url: url.replace(/\/$/, ""), anonKey };
}

interface SupabaseUserResponse {
  id?: unknown;
  email?: unknown;
  user_metadata?: { name?: unknown; full_name?: unknown };
}

/** Verify a Supabase access token by asking GoTrue who it belongs to. */
export async function verifySupabaseAccessToken(accessToken: string): Promise<AskingfateUser | null> {
  const config = getSupabaseConfig();
  if (!config) return null;
  try {
    const res = await fetch(`${config.url}/auth/v1/user`, {
      headers: {
        apikey: config.anonKey,
        authorization: `Bearer ${accessToken}`,
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[oauth] supabase token verification failed: ${res.status} from ${config.url}/auth/v1/user`);
      return null;
    }
    const data = (await res.json().catch(() => null)) as SupabaseUserResponse | null;
    if (!data || typeof data.id !== "string" || data.id === "") return null;
    const metaName = data.user_metadata?.name ?? data.user_metadata?.full_name;
    return {
      id: data.id,
      email: typeof data.email === "string" ? data.email : undefined,
      name: typeof metaName === "string" ? metaName : undefined,
    };
  } catch (err) {
    console.warn(`[oauth] supabase token verification unreachable (${config.url}):`, err);
    return null;
  }
}
