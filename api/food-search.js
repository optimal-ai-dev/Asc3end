// Vercel serverless function. Deployed at /api/food-search — the food database behind the Add
// Food sheet. It queries two free, openly licensed sources and returns one normalized list:
//   - USDA FoodData Central (public domain) for generic foods with household measures and US
//     branded products. Needs a free key from https://fdc.nal.usda.gov/api-key-signup — set
//     USDA_FDC_API_KEY in Vercel. Without it this falls back to DEMO_KEY, which works but is
//     limited to a few dozen requests an hour per IP, so set the real key before launch.
//   - Open Food Facts (ODbL, no key) for packaged foods worldwide, searched by name or barcode.
//     Name search goes through Search-a-licious (search.openfoodfacts.org), OFF's Elasticsearch
//     service. The older /cgi/search.pl is capped at 10 searches a minute per IP — shared by
//     every user on a Vercel region — which is why searches used to come back empty.
// No proprietary database (MyFitnessPal, Cronometer) is scraped or copied.
//
// Proxied rather than called from the browser so the USDA key stays server-side, results can be
// cached here, and Open Food Facts gets the identifying User-Agent it asks API clients to send.
// Sign-in is required like every other /api route, so the key can't be burned by anonymous traffic.

import { supabaseAdmin } from "../lib/supabaseAdmin.js";
import { checkRateLimit } from "../lib/rateLimit.js";
import { normalizeFdcFood, normalizeOffProduct, isValidBarcode, parseQuery, rankResults, usdaQuery, OFF_COUNTRY } from "../src/lib/foodData.js";

const FDC_URL = "https://api.nal.usda.gov/fdc/v1/foods/search";
const OFF_HOST = "https://world.openfoodfacts.org";
const OFF_SEARCH = "https://search.openfoodfacts.org/search";
const OFF_FIELDS = "code,product_name,product_name_en,generic_name,brands,nutriments,serving_size,serving_quantity,serving_quantity_unit,product_quantity";
const USER_AGENT = "Asc3end/0.1 (https://asc3end.vercel.app)";
const TIMEOUT_MS = 7000;

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
  if (!res.ok) {
    const host = new URL(url).host;
    if (res.status === 429 && host.includes("nal.usda.gov") && !process.env.USDA_FDC_API_KEY) {
      throw new Error("USDA DEMO_KEY rate limit hit — set USDA_FDC_API_KEY in Vercel");
    }
    throw new Error(`${host} ${res.status}`);
  }
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

// Lucene special characters are escaped so a query like "m&m's (peanut)" can't break the syntax.
const lucene = (text) => text.replace(/([+\-!(){}[\]^"~*?:\\/&|])/g, "\\$1");

function offSearch(text, countryTag) {
  const q = countryTag ? `${lucene(text)} countries_tags:"${countryTag}"` : lucene(text);
  const url = `${OFF_SEARCH}?q=${encodeURIComponent(q)}&langs=en&page_size=24&fields=${OFF_FIELDS}`;
  return getJson(url, { headers: { "User-Agent": USER_AGENT } }).then((d) => d.hits || []);
}

async function searchFoods(q, country) {
  const parsed = parseQuery(q);
  const countryTag = OFF_COUNTRY[country] || null;
  const jobs = {
    // Generic foods never carry a brand, so the brand words are left out of that query.
    generic: parsed.food ? fdcSearch(usdaQuery(parsed.food), ["Survey (FNDDS)", "Foundation", "SR Legacy"], 20) : Promise.resolve([]),
    branded: fdcSearch(usdaQuery(parsed.branded), ["Branded"], 20),
    offWorld: offSearch(parsed.branded),
    ...(countryTag ? { offLocal: offSearch(parsed.branded, countryTag) } : {}),
  };
  const names = Object.keys(jobs);
  const settled = await Promise.allSettled(Object.values(jobs));
  const out = Object.fromEntries(names.map((n, i) => [n, settled[i]]));
  for (const n of names) if (out[n].status === "rejected") console.error("food-search upstream failed", n, out[n].reason?.message);

  const val = (n) => (out[n]?.status === "fulfilled" ? out[n].value : []);
  const localCodes = new Set(val("offLocal").map((p) => p.code));
  const foods = [
    ...[...val("generic"), ...val("branded")].map(normalizeFdcFood),
    ...[...val("offLocal"), ...val("offWorld")].map((p) => {
      const f = normalizeOffProduct(p);
      return f && localCodes.has(p.code) ? { ...f, local: true } : f;
    }),
  ].filter(Boolean);

  const failed = names.filter((n) => out[n].status === "rejected");
  return {
    results: rankResults(foods, parsed),
    partial: failed.length > 0,
    allFailed: failed.length === names.length,
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
  const country = String(req.query.country || "").toLowerCase().slice(0, 2);
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
  const key = `q:${country}:${q.toLowerCase()}`;
  let body = cacheGet(key);
  if (!body) {
    body = await searchFoods(q, country);
    if (body.allFailed) {
      return res.status(502).json({ error: "The food databases aren't responding right now — try again in a minute, or scan the barcode." });
    }
    // A search where an upstream timed out isn't cached, so the next try can get the full list.
    if (!body.partial && body.results.length) cacheSet(key, body);
  }
  res.setHeader("Cache-Control", "private, max-age=3600");
  return res.status(200).json(body);
}
