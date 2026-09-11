// Server-side rate limiting shared by every /api route that needs it. Vercel serverless
// functions are stateless per-invocation (no reliable shared in-memory counter across
// invocations/instances), so the counter has to live somewhere persistent and shared —
// Postgres, via the `rate_limits` table and `increment_rate_limit` RPC function (see README.md
// for the SQL). The RPC does the increment atomically in the database (INSERT ... ON CONFLICT
// DO UPDATE), which a plain supabase-js upsert can't express — upsert overwrites, it doesn't add.

import { supabaseAdmin } from "./supabaseAdmin.js";

// Rounds "now" down to the start of the current fixed window (e.g. every 60s), so all requests
// within the same window share one counter row.
function currentWindowStart(windowSeconds) {
  const ms = windowSeconds * 1000;
  return new Date(Math.floor(Date.now() / ms) * ms).toISOString();
}

// Returns { allowed, count, limit }. Fails OPEN (allowed: true) if the rate-limit check itself
// errors — a Postgres hiccup here should degrade to "no rate limiting this request" rather than
// take down the underlying feature entirely; the failure is logged so it's visible in Vercel logs.
export async function checkRateLimit(userId, endpoint, { windowSeconds, maxRequests }) {
  if (!userId) return { allowed: false, count: 0, limit: maxRequests }; // no anonymous calls, ever
  const windowStart = currentWindowStart(windowSeconds);
  const { data, error } = await supabaseAdmin.rpc("increment_rate_limit", {
    p_user_id: userId,
    p_endpoint: endpoint,
    p_window_start: windowStart,
  });
  if (error) {
    console.error("rate limit check failed (failing open)", endpoint, error.message);
    return { allowed: true, count: 0, limit: maxRequests };
  }
  return { allowed: data <= maxRequests, count: data, limit: maxRequests };
}
