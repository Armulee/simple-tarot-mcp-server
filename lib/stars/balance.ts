/**
 * Read and spend a user's AskingFate stars via Supabase.
 *
 * The main site stores per-user stars in the `stars` table with three buckets
 * (daily_stars + plan_stars + addon_stars = the spendable balance, mirrored in
 * `current_stars`). Spending mirrors the site's service-role path in
 * /api/stars/spend: read the (daily-refilled) row via the `star_get_or_create`
 * RPC, deduct daily→plan→addon, and PATCH the row back. Display reads hit the
 * table directly.
 *
 * Requires SUPABASE_URL (via getSupabaseConfig) and SUPABASE_SERVICE_ROLE_KEY
 * for RLS-bypassing access. When unconfigured or on any infra error these
 * helpers fail OPEN (return null / "skipped") so a Supabase hiccup or a missing
 * key never hard-blocks a reading — only a genuine insufficient balance does.
 * The read→deduct→write is not transactional (same as the site's manual path);
 * fine for a user issuing tool calls sequentially through Claude.
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

/** Spendable balance from a stars row: daily+plan+addon, falling back to current_stars. */
function balanceFromRow(row: StarsRow): number | null {
  const sum = toInt(row.daily_stars) + toInt(row.plan_stars) + toInt(row.addon_stars);
  if (sum > 0) return sum;
  return typeof row.current_stars === "number" ? row.current_stars : sum;
}

function serviceHeaders(serviceKey: string): Record<string, string> {
  return {
    apikey: serviceKey,
    authorization: `Bearer ${serviceKey}`,
    accept: "application/json",
  };
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
    const res = await fetch(url, { headers: serviceHeaders(serviceKey), cache: "no-store" });
    if (!res.ok) {
      console.warn(`[stars] balance read failed: ${res.status}`);
      return null;
    }
    const rows = (await res.json().catch(() => null)) as StarsRow[] | null;
    if (!Array.isArray(rows) || rows.length === 0) return 0;
    return balanceFromRow(rows[0] ?? {});
  } catch (err) {
    console.warn("[stars] balance read unreachable:", err);
    return null;
  }
}

export type SpendResult =
  /** A star was deducted; `balance` is the new spendable total. */
  | { status: "ok"; balance: number | null }
  /** The user did not have enough stars; nothing was deducted. */
  | { status: "insufficient"; balance: number | null }
  /** Spending is unconfigured or Supabase was unreachable — fail open (no charge, no block). */
  | { status: "skipped" };

/**
 * Deduct `amount` stars from a user, draining daily → plan → addon (the site's
 * order). Reads the refilled row via star_get_or_create, then PATCHes the row.
 */
export async function spendStar(userId: string, amount = 1): Promise<SpendResult> {
  const config = getSupabaseConfig();
  const serviceKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!config || !serviceKey || !userId) return { status: "skipped" };
  const headers = { ...serviceHeaders(serviceKey), "content-type": "application/json" };

  try {
    // 1. Read the current (daily-refilled) buckets, creating the row if needed.
    const getRes = await fetch(`${config.url}/rest/v1/rpc/star_get_or_create`, {
      method: "POST",
      headers,
      body: JSON.stringify({ p_anon_device_id: null, p_user_id: userId }),
      cache: "no-store",
    });
    if (!getRes.ok) {
      console.warn(`[stars] get_or_create failed: ${getRes.status}`);
      return { status: "skipped" }; // fail open
    }
    const gdata = (await getRes.json().catch(() => null)) as StarsRow[] | StarsRow | null;
    const row = Array.isArray(gdata) ? gdata[0] : gdata;
    if (!row || typeof row !== "object") return { status: "skipped" };

    let daily = toInt(row.daily_stars);
    let plan = toInt(row.plan_stars);
    let addon = toInt(row.addon_stars);
    const before = daily + plan + addon;
    if (before < amount) return { status: "insufficient", balance: before };

    // 2. Drain daily → plan → addon.
    let rem = amount;
    const fromDaily = Math.min(daily, rem); daily -= fromDaily; rem -= fromDaily;
    const fromPlan = Math.min(plan, rem); plan -= fromPlan; rem -= fromPlan;
    const fromAddon = Math.min(addon, rem); addon -= fromAddon; rem -= fromAddon;
    if (rem > 0) return { status: "insufficient", balance: before };
    const after = daily + plan + addon;

    // 3. Persist. If the write fails we report "skipped" (no charge claimed).
    const patchRes = await fetch(
      `${config.url}/rest/v1/stars?user_id=eq.${encodeURIComponent(userId)}`,
      {
        method: "PATCH",
        headers: { ...headers, prefer: "return=minimal" },
        body: JSON.stringify({
          daily_stars: daily,
          plan_stars: plan,
          addon_stars: addon,
          current_stars: after,
        }),
        cache: "no-store",
      },
    );
    if (!patchRes.ok) {
      console.warn(`[stars] spend update failed: ${patchRes.status}`);
      return { status: "skipped" }; // couldn't persist → don't claim a charge
    }
    return { status: "ok", balance: after };
  } catch (err) {
    console.warn("[stars] spend unreachable:", err);
    return { status: "skipped" }; // fail open
  }
}
