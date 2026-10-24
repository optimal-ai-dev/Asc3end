// Vercel serverless function. Deployed at /api/food-search — the food database behind the Add
// Food sheet. It queries two free, openly licensed sources and returns one normalized list:
//   - USDA FoodData Central (public domain) for generic foods with household measures and US
//     branded products. Needs a free key from https://fdc.nal.usda.gov/api-key-signup — set
//     USDA_FDC_API_KEY in Vercel. Without it this falls back to DEMO_KEY, which works but is
//     limited to a few dozen requests an hour per IP, so set the real key before launch.
//   - Open Food Facts (ODbL, no key) for packaged foods worldwide, searched by name or barcode.
// No proprietary database (MyFitnessPal, Cronometer) is scraped or copied.
//
// Proxied rather than called from the browser so the USDA key stays server-side, results can be
// cached here, and Open Food Facts gets the identifying User-Agent it asks API clients to send.
// Sign-in is required like every other /api route, so the key can't be burned by anonymous traffic.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { normalizeFdcFood, normalizeOffProduct, mergeResults, isValidBarcode } from "../src/lib/foodData.js";

const FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_HOST = "https://world.openfoodfacts.org";
const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity";
const USER_AGENT = "Asc3end/0.1 (https://asc3end.vercel.app)";
const TIMEOUT_MS = 6000;

// Per-instance cache. Not shared across Vercel instances, but a warm instance serves most of a
// burst of identical searches ("chicken", "rice") without calling either upstream again.
const CACHE_TTL_MS = 6 * 60 * 60 * 1000;
const CACHE_MAX = 500;
const cache = new Map();
function cacheGet(key) {
  const hit = cache.get(key);
  if (!hit) return null;
  if (Date.now() - hit.at > CACHE_TTL_MS) { cache.delete(key); return null; }
  return hit.value;
}
function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) cache.delete(cache.keys().next().value);
  cache.set(key, { at: Date.now(), value });
}

async function getJson(url, init = {}) {
  const res = await fetch(url, { ...init, signal: AbortSignal.timeout(TIMEOUT_MS) });
  if (!res.ok) throw new Error(`${new URL(url).host} ${res.status}`);
  return res.json();
}

function fdcSearch(query, dataType, pageSize) {
  const key = process.env.USDA_FDC_API_KEY || "DEMO_KEY";
  return getJson(`${FDC_URL}?api_key=${encodeURIComponent(key)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ query, dataType, pageSize }),
  }).then((d) => d.foods || []);
}

async function searchFoods(q) {
  const offUrl = `${OFF_HOST}/cgi/search.pl?search_terms=${encodeURIComponent(q)}&search_simple=1&action=process&json=1&page_size=20&fields=${OFF_FIELDS}`;
  const [generic, branded, off] = await Promise.allSettled([
    fdcSearch(q, ["Survey (FNDDS)", "Foundation", "SR Legacy"], 20),
    fdcSearch(q, ["Branded"], 15),
    getJson(offUrl, { headers: { "User-Agent": USER_AGENT } }).then((d) => d.products || []),
  ]);
  const usda = [...(generic.value || []), ...(branded.value || [])].map(normalizeFdcFood).filter(Boolean);
  const offFoods = (off.value || []).map(normalizeOffProduct).filter(Boolean);
  for (const r of [generic, branded, off]) if (r.status === "rejected") console.error("food-search upstream failed", r.reason?.message);
  return {
    results: mergeResults(usda, offFoods),
    partial: [generic, branded, off].some((r) => r.status === "rejected"),
  };
}

async function lookupBarcode(code) {
  try {
    const d = await getJson(`${OFF_HOST}/api/v2/product/${code}.json?fields=${OFF_FIELDS}`, { headers: { "User-Agent": USER_AGENT } });
    const food = d.status === 1 ? normalizeOffProduct({ code, ...d.product }) : null;
    if (food) return food;
  } catch (e) {
    console.error("barcode OFF lookup failed", e.message);
  }
  // Fall back to USDA's branded database, which covers many US products Open Food Facts lacks.
  // GTINs are compared without leading zeros since UPC-A and EAN-13 pad the same code differently.
  try {
    const strip = (s) => String(s || "").replace(/^0+/, "");
    const foods = await fdcSearch(code, ["Branded"], 5);
    const match = foods.find((f) => strip(f.gtinUpc) === strip(code));
    return match ? normalizeFdcFood(match) : null;
  } catch (e) {
    console.error("barcode FDC lookup failed", e.message);
    return null;
  }
}

export default async function handler(req, res) {
  if (req.method !== "GET") return res.status(405).json({ error: "Method not allowed" });

  const token = (req.headers.authorization || "").replace(/^Bearer\s+/i, "");
  if (!token) return res.status(401).json({ error: "Sign in required." });
  const { data: { user }, error: authError } = await supabaseAdmin.auth.getUser(token);
  if (authError || !user) return res.status(401).json({ error: "Sign in required." });

  const rl = await checkRateLimit(user.id, "food-search", { windowSeconds: 60, maxRequests: 60 });
  if (!rl.allowed) return res.status(429).json({ error: "Too many searches — wait a moment and try again." });

  const q = String(req.query.q || "").trim().slice(0, 80);
  const barcode = String(req.query.barcode || "").trim();

  if (barcode) {
    if (!isValidBarcode(barcode)) return res.status(400).json({ error: "That doesn't look like a barcode number." });
    const key = `b:${barcode}`;
    let food = cacheGet(key);
    if (food === null) {
      food = await lookupBarcode(barcode);
      if (food) cacheSet(key, food);
    }
    if (!food) return res.status(404).json({ error: "We couldn't find that barcode. Try searching by name instead." });
    res.setHeader("Cache-Control", "private, max-age=86400");
    return res.status(200).json({ food });
  }

  if (q.length < 2) return res.status(400).json({ error: "Type at least 2 letters to search." });
  const key = `q:${q.toLowerCase()}`;
  let body = cacheGet(key);
  if (!body) {
    body = await searchFoods(q);
    // A search where an upstream timed out isn't cached, so the next try can get the full list.
    if (!body.partial && body.results.length) cacheSet(key, body);
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).json(body);
}
