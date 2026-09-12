import { supabaseAdmin } from "./supabaseAdmin.js";

// Free-plan usage for metered features (Coach, Meals Near You) resets every calendar month —
// this is a standing monthly allowance, not a one-time trial. Scoped by an explicit `month`
// column ("YYYY-MM", UTC) rather than filtering on `updated_at` ranges, so a new month starts a
// fresh row at 0 with no cron job or explicit reset step required — the previous month's row is
// simply a different primary key and is never read once the calendar turns over.
export function currentMonthKey(date = new Date()) {
  return date.toISOString().slice(0, 7); // e.g. "2026-09"
}

export async function getMonthlyUsage(userId, feature, month = currentMonthKey()) {
  const { data } = await supabaseAdmin
    .from("feature_usage_monthly")
    .select("count")
    .eq("user_id", userId)
    .eq("feature", feature)
    .eq("month", month)
    .maybeSingle();
  return data?.count || 0;
}

export async function incrementMonthlyUsage(userId, feature, previousCount, month = currentMonthKey()) {
  await supabaseAdmin.from("feature_usage_monthly").upsert({
    user_id: userId,
    feature,
    month,
    count: previousCount + 1,
    updated_at: new Date().toISOString(),
  });
}
