// Vercel serverless function. Deployed at /api/admin-metrics — aggregate product metrics for the
// app owner. Authorization happens ENTIRELY here, server-side, against ADMIN_EMAILS (a
// comma-separated allowlist set in Vercel env vars) — not by an in-app route being hard to find.
// A client-side "admin page" with no server check would let anyone who discovers the URL read
// every user's data; this endpoint refuses anyone whose verified Supabase auth email isn't on the
// allowlist, the same way every other privileged endpoint in this app checks the caller rather
// than trusting what the client claims about itself.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";

function isAdminEmail(email) {
  const allowlist = (process.env.ADMIN_EMAILS || "")
    .split(",")
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
  return !!email && allowlist.includes(email.toLowerCase());
}

async function countRows(table, extra) {
  let query = supabaseAdmin.from(table).select("*", { count: "exact", head: true });
  if (extra) query = extra(query);
  const { count, error } = await query;
  return error ? null : count;
}

export default async function handler(req, res) {
  if (req.method !== "GET") {
    return res.status(405).json({ error: "Method not allowed" });
  }

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) {
    return res.status(401).json({ error: "Sign in required." });
  }
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) {
    return res.status(401).json({ error: "Sign in required." });
  }
  if (!isAdminEmail(user.email)) {
    return res.status(403).json({ error: "Not authorized." });
  }

  const rl = await checkRateLimit(user.id, "admin-metrics", { windowSeconds: 60, maxRequests: 20 });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  const sevenDaysAgo = new Date(Date.now() - 7 * 24 * 60 * 60 * 1000).toISOString();

  const [
    totalUsers,
    activeSubs,
    trialingSubs,
    pastDueSubs,
    workoutsLast7d,
    feedbackBug,
    feedbackFeature,
    feedbackRating,
    signupsLast7d,
  ] = await Promise.all([
    countRows("user_data", (q) => q.eq("key", "atlas:profile")),
    countRows("subscriptions", (q) => q.eq("status", "active")),
    countRows("subscriptions", (q) => q.eq("status", "trialing")),
    countRows("subscriptions", (q) => q.eq("status", "past_due")),
    countRows("analytics_events", (q) => q.eq("name", "workout_completed").gte("created_at", sevenDaysAgo)),
    countRows("feedback", (q) => q.eq("type", "bug")),
    countRows("feedback", (q) => q.eq("type", "feature")),
    countRows("feedback", (q) => q.eq("type", "rating")),
    countRows("analytics_events", (q) => q.eq("name", "signup_completed").gte("created_at", sevenDaysAgo)),
  ]);

  res.status(200).json({
    generatedAt: new Date().toISOString(),
    users: { total: totalUsers, signupsLast7d },
    subscriptions: { active: activeSubs, trialing: trialingSubs, pastDue: pastDueSubs },
    engagement: { workoutsCompletedLast7d: workoutsLast7d },
    feedback: { bug: feedbackBug, feature: feedbackFeature, rating: feedbackRating },
  });
}
