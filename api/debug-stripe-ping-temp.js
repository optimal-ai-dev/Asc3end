// TEMPORARY diagnostic endpoint — deleted after use.
import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required." });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Sign in required." });

  const key = process.env.STRIPE_SECRET_KEY || "";
  const badChars = [];
  for (let i = 0; i < key.length; i++) {
    if (key.charCodeAt(i) > 255) badChars.push({ index: i, code: key.charCodeAt(i) });
  }

  const result = {
    keyLength: key.length,
    keyPrefix: key.slice(0, 12),
    keySuffix: key.slice(-6),
    badCharCount: badChars.length,
    firstBadChar: badChars[0] || null,
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
