// Source-backed venue lookup for "Meals Near You". Server-side only.
//   * Place name -> coordinates: OpenStreetMap Nominatim (the reference point distances are measured from).
//   * Venues: OpenStreetMap via the Overpass API (real names, categories, addresses, opening-hours tags).
//   * Distance: computed (great-circle) from the reference point — never estimated by a model.
// Nothing here invents a price, a menu or an "open now" claim: values OSM doesn't have stay null.
// Data © OpenStreetMap contributors, ODbL: https://www.openstreetmap.org/copyright

import { distanceMeters, isLatLon } from "../src/lib/geo.js";

const USER_AGENT = "Asc3end/1.0 (+https://asc3end.vercel.app; support@asc3end.app)";
const NOMINATIM = "https://nominatim.openstreetmap.org/search";
const OVERPASS = ["https://overpass-api.de/api/interpreter", "https://overpass.kumi.systems/api/interpreter"];
export const ATTRIBUTION = "Venue data © OpenStreetMap contributors (ODbL). Place search by OpenStreetMap Nominatim.";

export class PlacesError extends Error {
  constructor(code, message, status = 502) { super(message); this.code = code; this.status = status; }
}

async function timedFetch(fetchImpl, url, init = {}, ms = 15000) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), ms);
  try {
    return await fetchImpl(url, { ...init, signal: controller.signal, headers: { "User-Agent": USER_AGENT, Accept: "application/json", ...(init.headers || {}) } });
  } finally {
    clearTimeout(timer);
  }
}

/** "Melbourne CBD" -> { lat, lon, label, osmUrl }. Null if the place can't be found. */
export async function geocode(query, { fetchImpl = fetch } = {}) {
  const q = String(query || "").trim();
  if (q.length < 2 || q.length > 120) throw new PlacesError("bad_query", "Enter a suburb, city or address.", 400);
  let res;
  try {
    res = await timedFetch(fetchImpl, `${NOMINATIM}?${new URLSearchParams({ q, format: "jsonv2", limit: "1", addressdetails: "0" })}`);
  } catch (e) {
    throw new PlacesError(e?.name === "AbortError" ? "geocode_timeout" : "geocode_unavailable", "Location search is unavailable right now — try again shortly.", 504);
  }
  if (!res.ok) throw new PlacesError("geocode_unavailable", "Location search is unavailable right now — try again shortly.", 502);
  const rows = await res.json().catch(() => []);
  const hit = Array.isArray(rows) ? rows[0] : null;
  const lat = Number(hit?.lat), lon = Number(hit?.lon);
  if (!hit || !isLatLon(lat, lon)) return null;
  return {
    lat, lon, label: String(hit.display_name || q).slice(0, 160),
    osmUrl: hit.osm_type && hit.osm_id ? `https://www.openstreetmap.org/${hit.osm_type}/${hit.osm_id}` : null,
  };
}

const CATEGORY_LABEL = { restaurant: "Restaurant", cafe: "Café", fast_food: "Fast food", food_court: "Food court" };

const safeUrl = (u) => {
  if (!u) return null;
  try { const x = new URL(String(u).startsWith("http") ? u : `https://${u}`); return /^https?:$/.test(x.protocol) ? x.toString() : null; } catch (e) { return null; }
};

function addressOf(tags) {
  const street = [tags["addr:housenumber"], tags["addr:street"]].filter(Boolean).join(" ");
  return [street, tags["addr:suburb"] || tags["addr:city"]].filter(Boolean).join(", ") || null;
}

/** Overpass elements -> venues, with distance computed from `ref`. Pure (exported for tests). */
export function venuesFromElements(elements, ref, { limit = 25 } = {}) {
  const seen = new Set();
  const venues = [];
  for (const el of Array.isArray(elements) ? elements : []) {
    const tags = el?.tags || {};
    const name = String(tags.name || "").trim();
    const lat = Number(el?.lat ?? el?.center?.lat), lon = Number(el?.lon ?? el?.center?.lon);
    if (!name || !isLatLon(lat, lon) || !CATEGORY_LABEL[tags.amenity]) continue;
    const id = `${el.type}/${el.id}`;
    if (seen.has(id)) continue;
    seen.add(id);
    const d = distanceMeters(ref, { lat, lon });
    venues.push({
      id, osmUrl: `https://www.openstreetmap.org/${id}`,
      name: name.slice(0, 100), category: tags.amenity, categoryLabel: CATEGORY_LABEL[tags.amenity],
      cuisine: tags.cuisine ? String(tags.cuisine).split(";").map((c) => c.trim().replace(/_/g, " ")).filter(Boolean).slice(0, 3) : [],
      distanceM: d === null ? null : Math.round(d),
      lat, lon, address: addressOf(tags),
      hoursRaw: tags.opening_hours ? String(tags.opening_hours).slice(0, 300) : null,
      website: safeUrl(tags.website || tags["contact:website"]),
      phone: tags.phone ? String(tags.phone).slice(0, 40) : null,
      diet: ["vegetarian", "vegan", "gluten_free", "halal"].filter((k) => tags[`diet:${k}`] === "yes"),
    });
  }
  return venues.sort((a, b) => (a.distanceM ?? Infinity) - (b.distanceM ?? Infinity)).slice(0, limit);
}

export async function findVenues(ref, { radius = 1200, limit = 25, fetchImpl = fetch } = {}) {
  if (!isLatLon(ref?.lat, ref?.lon)) throw new PlacesError("bad_location", "That location isn't valid.", 400);
  const r = Math.min(3000, Math.max(200, Math.round(radius)));
  const filter = `["amenity"~"^(restaurant|cafe|fast_food|food_court)$"]["name"]`;
  const ql = `[out:json][timeout:20];(node${filter}(around:${r},${ref.lat},${ref.lon});way${filter}(around:${r},${ref.lat},${ref.lon}););out center 120;`;
  let lastErr = null;
  for (const endpoint of OVERPASS) {
    try {
      const res = await timedFetch(fetchImpl, endpoint, { method: "POST", headers: { "Content-Type": "application/x-www-form-urlencoded" }, body: `data=${encodeURIComponent(ql)}` }, 20000);
      if (!res.ok) { lastErr = new PlacesError("venues_unavailable", "Venue data is unavailable right now — try again shortly.", 502); continue; }
      const json = await res.json();
      return venuesFromElements(json?.elements, ref, { limit });
    } catch (e) {
      lastErr = new PlacesError(e?.name === "AbortError" ? "venues_timeout" : "venues_unavailable", "Venue data is unavailable right now — try again shortly.", e?.name === "AbortError" ? 504 : 502);
    }
  }
  throw lastErr || new PlacesError("venues_unavailable", "Venue data is unavailable right now — try again shortly.", 502);
}

/** Query text or device coordinates -> the full, source-labelled result. */
export async function lookupPlaces({ query, lat, lon, radius, fetchImpl = fetch, now = new Date() } = {}) {
  let reference;
  if (isLatLon(lat, lon)) {
    reference = { lat, lon, label: "Your current location", method: "device", source: { name: "Your device", url: null } };
  } else {
    const g = await geocode(query, { fetchImpl });
    if (!g) throw new PlacesError("location_not_found", "We couldn't find that place. Try a suburb or city name.", 404);
    reference = { lat: g.lat, lon: g.lon, label: g.label, method: "geocoded", source: { name: "OpenStreetMap Nominatim", url: g.osmUrl } };
  }
  const venues = await findVenues(reference, { radius, fetchImpl });
  return { reference, venues, retrievedAt: now.toISOString(), attribution: ATTRIBUTION };
}
