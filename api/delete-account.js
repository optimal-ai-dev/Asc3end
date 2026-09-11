// Vercel serverless function. Deployed at /api/delete-account — the only way an account can
// actually be removed, since deleting an auth user requires the service_role key, which never
// exists client-side. Cleans up the user's own rows first (no FK cascade is configured on these
// tables), then deletes the auth user itself.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  if (req.method !== "POST") {
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

  try {
    await supabaseAdmin.from("user_data").delete().eq("user_id", user.id);
    await supabaseAdmin.from("subscriptions").delete().eq("user_id", user.id);
    await supabaseAdmin.from("feature_usage").delete().eq("user_id", user.id);
    const { error } = await supabaseAdmin.auth.admin.deleteUser(user.id);
    if (error) throw error;
    res.status(200).json({ ok: true });
  } catch (e) {
    console.error("delete-account error", e);
    res.status(500).json({ error: "Could not delete your account — try again, or contact support if this keeps happening." });
  }
}
