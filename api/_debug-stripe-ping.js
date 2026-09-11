// TEMPORARY diagnostic endpoint — deleted after use. Tests both the Stripe SDK and a raw fetch
// bypassing the SDK entirely, to isolate whether the connection failure is SDK-specific or a
// genuine network path problem from this Vercel deployment to api.stripe.com.
import { stripe } from "../lib/stripe.js";
import { supabaseAdmin } from "../lib/supabaseAdmin.js";

export default async function handler(req, res) {
  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required." });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Sign in required." });

  const result = {};

  try {
    const start = Date.now();
    const balance = await stripe.balance.retrieve();
    result.sdkCall = { ok: true, ms: Date.now() - start, hasData: !!balance };
  } catch (e) {
    result.sdkCall = { ok: false, message: e.message, type: e.type };
  }

  try {
    const start = Date.now();
    const r = await fetch("https://api.stripe.com/v1/balance", {
      headers: { Authorization: `Bearer ${process.env.STRIPE_SECRET_KEY}` },
    });
    const body = await r.json();
    result.rawFetch = { ok: r.ok, status: r.status, ms: Date.now() - start, hasData: !!body };
  } catch (e) {
    result.rawFetch = { ok: false, message: e.message, cause: e.cause?.message };
  }

  res.status(200).json(result);
}
