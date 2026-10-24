import { supabase } from "./supabase";

// Thin client for /api/food-search (see api/food-search.js). Throws an Error whose message is
// safe to show the person.
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
  if (!res.ok) throw new Error(data.error || "Food search isn't available right now — try again in a moment.");
  return data;
}

export async function searchFoods(query, signal) {
  const data = await call({ q: query }, signal);
  return data.results || [];
}

export async function lookupBarcode(code, signal) {
  const data = await call({ barcode: code }, signal);
  return data.food;
}
