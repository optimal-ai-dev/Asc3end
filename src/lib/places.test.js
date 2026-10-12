import { describe, it, expect } from "vitest";
import { distanceMeters, formatDistance, isLatLon } from "./geo";
import { parseOpeningHours, openStatus } from "./openingHours";
import { venuesFromElements, geocode, findVenues, lookupPlaces, PlacesError, ATTRIBUTION } from "../../lib/places";

const MELB = { lat: -37.8136, lon: 144.9631 };

describe("distance is computed, not estimated", () => {
  it("matches known great-circle distances", () => {
    // Flinders Street Station to Melbourne Central is roughly 1.1 km as the crow flies
    const flinders = { lat: -37.8183, lon: 144.9671 };
    const central = { lat: -37.8102, lon: 144.9628 };
    const d = distanceMeters(flinders, central);
    expect(d).toBeGreaterThan(850);
    expect(d).toBeLessThan(1100);
    expect(distanceMeters(MELB, MELB)).toBe(0);
    expect(Math.round(distanceMeters({ lat: 0, lon: 0 }, { lat: 0, lon: 1 }))).toBe(111195);
  });
  it("is symmetric and rejects invalid points", () => {
    const a = { lat: -33.87, lon: 151.21 }, b = { lat: -37.81, lon: 144.96 };
    expect(distanceMeters(a, b)).toBeCloseTo(distanceMeters(b, a), 6);
    expect(distanceMeters(a, { lat: 200, lon: 0 })).toBeNull();
    expect(distanceMeters(null, a)).toBeNull();
    expect(isLatLon(NaN, 3)).toBe(false);
  });
  it("formats with honest precision, never false 1 m accuracy", () => {
    expect(formatDistance(347)).toBe("350 m");
    expect(formatDistance(4)).toBe("10 m");
    expect(formatDistance(1249)).toBe("1.2 km");
    expect(formatDistance(NaN)).toBe("");
  });
});

describe("opening hours: answer only when sure", () => {
  // Wed 2026-10-07 10:30 Sydney (AEDT, UTC+11) == 2026-10-06T23:30Z
  const wedMorning = Date.UTC(2026, 9, 6, 23, 30);
  const sunNight = Date.UTC(2026, 9, 11, 12, 30); // Sun 23:30 Sydney
  const SYD = "Australia/Sydney";

  it("parses common simple forms", () => {
    expect(parseOpeningHours("Mo-Fr 07:00-17:00").days[2]).toEqual([[420, 1020]]);
    expect(parseOpeningHours("Mo-Fr 07:00-17:00").days[5]).toEqual([]);
    expect(parseOpeningHours("24/7").days.every((d) => d[0][1] === 1440)).toBe(true);
    expect(parseOpeningHours("Mo,We,Fr 09:00-12:00,13:00-17:00").days[2]).toEqual([[540, 720], [780, 1020]]);
    expect(parseOpeningHours("Mo-Su 06:00-22:00; Sa off").days[5]).toEqual([]);
  });

  it("open / closed within and outside the hours, in the venue's timezone", () => {
    expect(openStatus("Mo-Fr 07:00-17:00", wedMorning, SYD).state).toBe("open");
    expect(openStatus("Mo-Fr 11:00-17:00", wedMorning, SYD).state).toBe("closed");
    expect(openStatus("Sa-Su 08:00-14:00", wedMorning, SYD).state).toBe("closed");
    expect(openStatus("24/7", sunNight, SYD).state).toBe("open");
  });

  it("handles a lunch break and overnight ranges that run past midnight", () => {
    const lunch = Date.UTC(2026, 9, 7, 1, 15); // Wed 12:15 Sydney
    expect(openStatus("Mo-Fr 09:00-12:00,13:00-17:00", lunch, SYD).state).toBe("closed");
    // Sunday 23:30 open until 02:00; Monday 01:00 should still count as Sunday's open range
    const monEarly = Date.UTC(2026, 9, 11, 14, 0); // Mon 01:00 Sydney
    expect(openStatus("Su 18:00-02:00", monEarly, SYD).state).toBe("open");
    expect(openStatus("Su 18:00-02:00", Date.UTC(2026, 9, 11, 12, 30), SYD).state).toBe("open");
  });

  it.each([
    "Mo-Fr 07:00-17:00; PH off",
    "sunrise-sunset",
    "Mo-Fr 07:00-17:00 \"call ahead\"",
    "Jan-Mar Mo-Fr 09:00-17:00",
    "Mo-Fr 07:00-17:00 open",
    "by appointment",
    "Mo[1] 09:00-12:00",
    "garbage",
    "",
    null,
    undefined,
  ])("never guesses on %j", (raw) => {
    expect(openStatus(raw, wedMorning, SYD).state).toBe("unknown");
  });

  it("an unknown timezone is 'unknown', not a crash", () => {
    expect(openStatus("24/7", wedMorning, "Not/AZone").state).toBe("unknown");
  });
});

// A trimmed real Overpass response (Melbourne CBD) plus edge cases.
const ELEMENTS = [
  { type: "node", id: 591294592, lat: -37.8166298, lon: 144.9668583, tags: { "addr:housenumber": "37", "addr:street": "Swanston Street", "addr:suburb": "Melbourne", amenity: "fast_food", cuisine: "sandwich", name: "Subway", opening_hours: "24/7", website: "https://www.subway.com.au/" } },
  { type: "node", id: 591372262, lat: -37.8175372, lon: 144.9665144, tags: { amenity: "restaurant", cuisine: "indian;vegetarian", name: "Flora", "diet:vegetarian": "yes" } },
  { type: "way", id: 5, center: { lat: -37.8140, lon: 144.9640 }, tags: { amenity: "cafe", name: "Corner Café", website: "javascript:alert(1)", opening_hours: "Mo-Fr 07:00-15:00" } },
  { type: "node", id: 9, lat: -37.8, lon: 144.9, tags: { amenity: "restaurant" } }, // no name -> dropped
  { type: "node", id: 10, lat: -37.8, lon: 144.9, tags: { amenity: "bank", name: "Not food" } }, // wrong category -> dropped
  { type: "node", id: 591294592, lat: -37.8166298, lon: 144.9668583, tags: { amenity: "fast_food", name: "Subway" } }, // duplicate id
  { type: "node", id: 11, lat: "x", lon: 144.9, tags: { amenity: "cafe", name: "Bad coords" } },
];

describe("venues come from OpenStreetMap data with computed distances and visible sources", () => {
  const venues = venuesFromElements(ELEMENTS, MELB);

  it("keeps only named food venues, dedupes, and sorts by real distance", () => {
    expect(venues.map((v) => v.name)).toEqual(["Corner Café", "Subway", "Flora"]);
    expect(venues.every((v) => Number.isInteger(v.distanceM) && v.distanceM > 0)).toBe(true);
    expect(venues[0].distanceM).toBeLessThan(venues[1].distanceM);
    expect(venues[1].distanceM).toBeLessThan(venues[2].distanceM);
  });

  it("every venue links to its OpenStreetMap record (the source)", () => {
    expect(venues.find((v) => v.name === "Subway").osmUrl).toBe("https://www.openstreetmap.org/node/591294592");
    expect(venues.find((v) => v.name === "Corner Café").osmUrl).toBe("https://www.openstreetmap.org/way/5");
  });

  it("only passes through what the source has: no price, no menu, hours/website only when present", () => {
    const flora = venues.find((v) => v.name === "Flora");
    expect(flora.hoursRaw).toBeNull();
    expect(flora.website).toBeNull();
    expect(flora.cuisine).toEqual(["indian", "vegetarian"]);
    expect(flora.diet).toEqual(["vegetarian"]);
    for (const v of venues) {
      expect(v).not.toHaveProperty("price");
      expect(v).not.toHaveProperty("menu");
      expect(v).not.toHaveProperty("openNow");
    }
    expect(venues.find((v) => v.name === "Subway")).toMatchObject({ hoursRaw: "24/7", website: "https://www.subway.com.au/", address: "37 Swanston Street, Melbourne" });
  });

  it("refuses non-http(s) website values", () => {
    expect(venues.find((v) => v.name === "Corner Café").website).toBeNull();
  });

  it("respects the limit and survives garbage input", () => {
    expect(venuesFromElements(ELEMENTS, MELB, { limit: 1 })).toHaveLength(1);
    expect(venuesFromElements(null, MELB)).toEqual([]);
    expect(venuesFromElements([null, {}, { tags: null }], MELB)).toEqual([]);
  });
});

const okJson = (body) => ({ ok: true, status: 200, json: async () => body });

describe("geocoding and the full lookup (provider calls stubbed)", () => {
  const nominatim = [{ lat: "-37.8141705", lon: "144.9655616", display_name: "Melbourne, Victoria, Australia", osm_type: "relation", osm_id: 2383266 }];

  it("returns the reference point with its source", async () => {
    const g = await geocode("Melbourne CBD", { fetchImpl: async () => okJson(nominatim) });
    expect(g).toMatchObject({ lat: -37.8141705, lon: 144.9655616, label: "Melbourne, Victoria, Australia", osmUrl: "https://www.openstreetmap.org/relation/2383266" });
  });

  it("sends an identifying User-Agent as the provider's policy requires", async () => {
    let headers;
    await geocode("Melbourne", { fetchImpl: async (_u, init) => { headers = init.headers; return okJson(nominatim); } });
    expect(headers["User-Agent"]).toMatch(/Asc3end/);
  });

  it("an unknown place is null (not a made-up location)", async () => {
    expect(await geocode("zzzzqqqq", { fetchImpl: async () => okJson([]) })).toBeNull();
  });

  it("validates the query", async () => {
    await expect(geocode("", { fetchImpl: async () => okJson([]) })).rejects.toMatchObject({ code: "bad_query", status: 400 });
    await expect(geocode("x".repeat(500), { fetchImpl: async () => okJson([]) })).rejects.toMatchObject({ code: "bad_query" });
  });

  it("maps provider failures and timeouts to clear, typed errors", async () => {
    await expect(geocode("Melbourne", { fetchImpl: async () => ({ ok: false, status: 503, json: async () => ({}) }) })).rejects.toMatchObject({ code: "geocode_unavailable" });
    await expect(geocode("Melbourne", { fetchImpl: async () => { const e = new Error("a"); e.name = "AbortError"; throw e; } })).rejects.toMatchObject({ code: "geocode_timeout", status: 504 });
  });

  it("falls back to a second Overpass mirror, then reports unavailable", async () => {
    let calls = 0;
    const venues = await findVenues(MELB, { fetchImpl: async () => { calls++; return calls === 1 ? { ok: false, status: 504, json: async () => ({}) } : okJson({ elements: ELEMENTS }); } });
    expect(calls).toBe(2);
    expect(venues.length).toBe(3);
    await expect(findVenues(MELB, { fetchImpl: async () => ({ ok: false, status: 500, json: async () => ({}) }) })).rejects.toMatchObject({ code: "venues_unavailable" });
  });

  it("lookupPlaces labels the reference point, attribution and retrieval time", async () => {
    const fetchImpl = async (url) => okJson(String(url).includes("nominatim") ? nominatim : { elements: ELEMENTS });
    const now = new Date("2026-10-11T03:00:00Z");
    const r = await lookupPlaces({ query: "Melbourne CBD", fetchImpl, now });
    expect(r.reference).toMatchObject({ method: "geocoded", label: "Melbourne, Victoria, Australia", source: { name: "OpenStreetMap Nominatim" } });
    expect(r.retrievedAt).toBe("2026-10-11T03:00:00.000Z");
    expect(r.attribution).toBe(ATTRIBUTION);
    expect(r.venues.length).toBeGreaterThan(0);
  });

  it("device coordinates skip geocoding and are labelled as such", async () => {
    let geocoded = false;
    const fetchImpl = async (url) => { if (String(url).includes("nominatim")) geocoded = true; return okJson({ elements: ELEMENTS }); };
    const r = await lookupPlaces({ lat: -37.8136, lon: 144.9631, fetchImpl });
    expect(geocoded).toBe(false);
    expect(r.reference).toMatchObject({ method: "device", label: "Your current location" });
  });

  it("an unfound place is a 404 with a helpful message", async () => {
    await expect(lookupPlaces({ query: "zzzz", fetchImpl: async () => okJson([]) })).rejects.toMatchObject({ code: "location_not_found", status: 404 });
    expect(new PlacesError("x", "y")).toBeInstanceOf(Error);
  });

  it("no venues nearby is an empty list, not an error", async () => {
    const r = await lookupPlaces({ lat: -37.8, lon: 144.9, fetchImpl: async () => okJson({ elements: [] }) });
    expect(r.venues).toEqual([]);
  });
});
