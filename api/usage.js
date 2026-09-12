// Vercel serverless function. Deployed at /api/usage — returns how many of this calendar month's
// free Coach/Meals Near You uses this signed-in user has left. This is a standing monthly
// allowance on the Free plan, not a trial — it resets automatically every month (see
// lib/monthlyUsage.js). Read-only from the frontend's perspective; the actual counting/
// enforcement happens server-side in api/claude.js.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { currentMonthKey } from "../lib/monthlyUsage.js";

const METERED_FEATURES = ["coach", "meals"];

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

  const { data: rows } = await supabaseAdmin
    .from("feature_usage_monthly")
    .select("feature, count")
    .eq("user_id", user.id)
    .eq("month", currentMonthKey())
    .in("feature", METERED_FEATURES);

  const usage = { coach: 0, meals: 0 };
  for (const row of rows || []) usage[row.feature] = row.count;

  res.status(200).json(usage);
}
