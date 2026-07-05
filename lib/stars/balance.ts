/**
 * Read a user's AskingFate star balance from Supabase.
 *
 * The main site stores per-user stars in the `stars` table with three buckets
 * (daily_stars + plan_stars + addon_stars = the spendable balance, mirrored in
 * `current_stars`). The site refills daily stars via the `star_get_or_create`
 * RPC; here we read the row directly with the service-role key, so the number
 * shown is the last stored balance (a fresh daily refill may not be reflected
 * until the user next visits the site). Display-only — this never spends stars.
 *
 * Requires SUPABASE_URL (+ ANON via getSupabaseConfig) and, for row access that
 * bypasses RLS, SUPABASE_SERVICE_ROLE_KEY. Returns null when unconfigured or on
 * any error, so the caller can simply hide the star badge.
 */
import { getSupabaseConfig } from "@/lib/oauth/supabase";

interface StarsRow {
  daily_stars?: unknown;
  plan_stars?: unknown;
  addon_stars?: unknown;
  current_stars?: unknown;
}

function toInt(value: unknown): number {
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : 0;
}

export async function getStarBalance(userId: string): Promise<number | null> {
  const config = getSupabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceKey || !userId) return null;

  try {
    const url =
      `${config.url}/rest/v1/stars` +
      `?user_id=eq.${encodeURIComponent(userId)}` +
      `&select=daily_stars,plan_stars,addon_stars,current_stars&limit=1`;
    const res = await fetch(url, {
      headers: {
        apikey: serviceKey,
        authorization: `Bearer ${serviceKey}`,
        accept: "application/json",
      },
      cache: "no-store",
    });
    if (!res.ok) {
      console.warn(`[stars] balance read failed: ${res.status}`);
      return null;
    }
    const rows = (await res.json().catch(() => null)) as StarsRow[] | null;
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    const row = rows[0] ?? {};
    const sum = toInt(row.daily_stars) + toInt(row.plan_stars) + toInt(row.addon_stars);
    if (sum > 0) return sum;
    return typeof row.current_stars === "number" ? row.current_stars : sum;
  } catch (err) {
    console.warn("[stars] balance read unreachable:", err);
    return null;
  }
}
