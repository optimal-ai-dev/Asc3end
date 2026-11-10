import { supabase } from "./supabase";

// Thin client for /api/food-search (see api/food-search.js). Throws an Error whose message is
// safe to show the person; `status` is set when the server answered (404 = barcode not found).
async function call(params, signal) {
  const { data: { session } } = await supabase.auth.getSession();
  let res;
  try {
    res = await fetch(`/api/food-search?${new URLSearchParams(params)}`, {
      headers: session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {},
      signal,
    });
  } catch (e) {
    if (e.name === "AbortError") throw e;
    throw new Error("Couldn't reach the food database — check your connection and try again.");
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const err = new Error(data.error || "Food search isn't available right now — try again in a moment.");
    err.status = res.status;
    throw err;
  }
  return data;
}

// The person's country, so products sold where they shop rank first. The browser locale's
// region is the best signal ("en-AU"); many phones report plain "en" though, so the time zone
// is the fallback for the countries the app's users are mostly in.
export function detectCountry() {
  try {
    const locales = [...(navigator.languages || []), navigator.language];
    for (const l of locales) {
      const region = l && new Intl.Locale(l).maximize().region;
      if (region && !(region === "US" && !/-US$/i.test(l))) return region.toLowerCase();
    }
    const tz = Intl.DateTimeFormat().resolvedOptions().timeZone || "";
    if (tz.startsWith("Australia/")) return "au";
    if (tz === "Pacific/Auckland") return "nz";
    if (tz === "Europe/London") return "gb";
  } catch (e) { /* no locale info — search worldwide */ }
  return "";
}

export async function searchFoods(query, signal) {
  const data = await call({ q: query, country: detectCountry() }, signal);
  return { results: data.results || [], partial: !!data.partial };
}

export async function lookupBarcode(code, signal) {
  const data = await call({ barcode: code }, signal);
  return data.food;
}
