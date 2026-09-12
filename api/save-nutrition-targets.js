// Vercel serverless function. Deployed at /api/save-nutrition-targets — the one server-authorized
// write path for a manual macro override. Profile & Settings previously wrote macroOverride
// straight to the `user_data` table from the client (RLS-protected, but with zero validation on
// the values themselves) — a modified client could have written negative calories, a six-figure
// protein target, or non-numeric junk that every screen's canonical getNutritionTargets() would
// then have propagated verbatim. This endpoint validates the shape/range server-side before
// anything is written, and merges into the CURRENT stored profile (re-read here, not trusted from
// the request) so a stale or tampered client payload can't clobber unrelated profile fields.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { validateMacroOverride } from "../src/lib/validation.js";

const PROFILE_KEY = "atlas:profile";

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

  const rl = await checkRateLimit(user.id, "save-nutrition-targets", { windowSeconds: 60, maxRequests: 20 });
  if (!rl.allowed) {
    return res.status(429).json({ error: "Too many requests — please wait a moment and try again." });
  }

  // `macroOverride: null` is a legitimate request — it means "turn manual mode off, go back to
  // calculated targets" — so it's handled explicitly rather than treated as a missing/invalid body.
  const { macroOverride } = req.body || {};
  if (macroOverride !== null) {
    const validationError = validateMacroOverride(macroOverride);
    if (validationError) {
      return res.status(400).json({ error: validationError });
    }
  }

  try {
    const { data: row, error: readError } = await supabaseAdmin
      .from("user_data")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", PROFILE_KEY)
      .maybeSingle();
    if (readError) throw readError;
    if (!row) {
      return res.status(404).json({ error: "Profile not found — finish onboarding first." });
    }

    const updatedProfile = { ...row.value, macroOverride: macroOverride || null };
    const { error: writeError } = await supabaseAdmin
      .from("user_data")
      .upsert({ user_id: user.id, key: PROFILE_KEY, value: updatedProfile, updated_at: new Date().toISOString() });
    if (writeError) throw writeError;

    res.status(200).json({ profile: updatedProfile });
  } catch (e) {
    console.error("save-nutrition-targets error", e);
    res.status(500).json({ error: "Couldn't save your targets — try again." });
  }
}
