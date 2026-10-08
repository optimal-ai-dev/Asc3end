// Vercel cron target (see vercel.json "crons"). Runs one trivial query daily so the Supabase
// free-tier project never hits its ~7-day inactivity auto-pause.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  // Vercel sends "Authorization: Bearer $CRON_SECRET" automatically when CRON_SECRET is set.
  const secret = process.env.CRON_SECRET;
  if (secret && req.headers.authorization !== `Bearer ${secret}`) {
    return res.status(401).json({ error: "Unauthorized" });
  }

  const { error } = await supabaseAdmin.from("user_data").select("user_id", { head: true, count: "exact" }).limit(1);
  if (error) {
    console.error("keepalive query failed", { code: error.code, message: error.message });
    return res.status(500).json({ ok: false });
  }
  return res.status(200).json({ ok: true });
}
