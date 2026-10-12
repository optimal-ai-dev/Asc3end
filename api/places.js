// Vercel serverless function. Deployed at /api/places — source-backed venue search for "Meals Near
// You" (OpenStreetMap Nominatim + Overpass; see lib/places.js). Requires a signed-in user and the
// same Free/Premium access rules as the other Meals feature; the lookup itself costs no AI usage,
// so it never consumes a monthly use (the AI "order ideas" step that follows does).

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { getMonthlyUsage } from "../lib/monthlyUsage.js";
import { getSubscriptionState } from "../lib/subscriptionServer.js";
import { isEntitled } from "../src/lib/subscription.js";
import { canAccessFeature, FEATURES } from "../src/lib/entitlements.js";
import { lookupPlaces, PlacesError } from "../lib/places.js";

export const config = { maxDuration: 45 };

export default async function handler(req, res) {
  if (req.method !== "POST") return res.status(405).json({ error: { message: "Method not allowed" } });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: { message: "Sign in required." } });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: { message: "Sign in required." } });

  const rl = await checkRateLimit(user.id, "places", { windowSeconds: 60, maxRequests: 12 });
  if (!rl.allowed) return res.status(429).json({ error: { message: "Too many searches — please wait a moment and try again.", code: "rate_limited" } });

  const subscriptionState = await getSubscriptionState(user.id);
  let usage = 0;
  if (!isEntitled(subscriptionState)) {
    try { usage = await getMonthlyUsage(user.id, FEATURES.MEALS); }
    catch (e) { return res.status(503).json({ error: { message: "Couldn't verify your usage right now — please try again in a moment." } }); }
  }
  if (!canAccessFeature(subscriptionState, FEATURES.MEALS, { [FEATURES.MEALS]: usage })) {
    return res.status(402).json({ error: { message: "You've used all your free meal searches this month — upgrade to Asc3end+ for unlimited.", code: "premium_required" } });
  }

  const body = req.body && typeof req.body === "object" ? req.body : {};
  const query = typeof body.query === "string" ? body.query : undefined;
  const lat = typeof body.lat === "number" ? body.lat : undefined;
  const lon = typeof body.lon === "number" ? body.lon : undefined;

  try {
    const result = await lookupPlaces({ query, lat, lon });
    return res.status(200).json(result);
  } catch (e) {
    if (e instanceof PlacesError) return res.status(e.status).json({ error: { message: e.message, code: e.code } });
    console.error("places lookup failed", { userId: user.id });
    return res.status(500).json({ error: { message: "Couldn't search for places just now — please try again.", code: "places_failed" } });
  }
}
