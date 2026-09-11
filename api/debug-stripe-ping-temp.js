// TEMPORARY diagnostic endpoint — deleted after use.
import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required." });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Sign in required." });

  const key = process.env.STRIPE_SECRET_KEY || "";
  const badCharIndex = [...key].findIndex((c) => c.charCodeAt(0) > 255);

  const result = {
    keyLength: key.length,
    keyPrefix: key.slice(0, 12),
    keySuffix: key.slice(-6),
    badCharIndex,
    badCharCode: badCharIndex >= 0 ? key.charCodeAt(badCharIndex) : null,
  };

  try {
    const start = Date.now();
    const balance = await stripe.balance.retrieve();
    result.sdkCall = { ok: true, ms: Date.now() - start, hasData: !!balance };
  } catch (e) {
    result.sdkCall = { ok: false, message: e.message, type: e.type };
  }

  res.status(200).json(result);
}
