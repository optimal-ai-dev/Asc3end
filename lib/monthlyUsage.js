import { supabaseAdmin } from "./supabaseAdmin.js";

// Free-plan usage for metered features (Coach, Meals Near You) resets every calendar month —
// this is a standing monthly allowance, not a one-time trial. Scoped by an explicit `month`
// column ("YYYY-MM", UTC) rather than filtering on `updated_at` ranges, so a new month starts a
// fresh row at 0 with no cron job or explicit reset step required — the previous month's row is
// simply a different primary key and is never read once the calendar turns over.
export function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7); // e.g. "2026-09"
}

// Both functions throw on a DB error instead of silently defaulting to 0/no-op. This is a
// quota-enforcement path — silently treating "the query failed" the same as "usage is 0" fails
// OPEN (unlimited free access) instead of failing closed, which is exactly backwards for a
// security/cost-control check. The caller (api/claude.js) is responsible for denying access when
// this throws, rather than this function quietly deciding everyone gets unlimited use.
export async function getMonthlyUsage(userId, feature, month = currentMonthKey()) {
  const { data, error } = await supabaseAdmin
    .from("feature_usage_monthly")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("month", month)
    .maybeSingle();
  if (error) {
    console.error("getMonthlyUsage failed", { feature, code: error.code, message: error.message });
    throw new Error("usage_lookup_failed");
  }
  return data?.count || 0;
}

export async function incrementMonthlyUsage(userId, feature, previousCount, month = currentMonthKey()) {
  const { error } = await supabaseAdmin.from("feature_usage_monthly").upsert({
    user_id: userId,
    feature,
    month,
    count: previousCount + 1,
    updated_at: new Date().toISOString(),
  });
  if (error) {
    console.error("incrementMonthlyUsage failed", { feature, code: error.code, message: error.message });
    throw new Error("usage_increment_failed");
  }
}
