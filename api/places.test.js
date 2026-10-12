import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeAdmin, state } = vi.hoisted(() => {
  const state = { users: new Map(), subscriptions: new Map(), usage: 0, rateAllowed: true, lookup: null, usageThrows: false };
  const fakeAdmin = {
    auth: { getUser: async (token) => { const u = state.users.get(token); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "bad" } }; } },
    from(table) {
      if (table === "subscriptions") return { select() { return { eq(_k, id) { return { async maybeSingle() { return { data: state.subscriptions.get(id) || null, error: null }; } }; } }; } };
      throw new Error(`unexpected table ${table}`);
    },
  };
  return { fakeAdmin, state };
});
vi.mock("../lib/supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));
vi.mock("../lib/rateLimit.js", () => ({ checkRateLimit: async () => ({ allowed: state.rateAllowed }) }));
vi.mock("../lib/monthlyUsage.js", () => ({ getMonthlyUsage: async () => { if (state.usageThrows) throw new Error("x"); return state.usage; } }));
vi.mock("../lib/places.js", async () => {
  const actual = await vi.importActual("../lib/places.js");
  return { ...actual, lookupPlaces: async (args) => { state.lastArgs = args; return state.lookup(args); } };
});

import handler from "./places.js";
import { PlacesError } from "../lib/places.js";

const res = () => { const r = { statusCode: null, body: null, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = (token, body) => ({ method: "POST", headers: token ? { authorization: `Bearer ${token}` } : {}, body });
const RESULT = { reference: { label: "Melbourne", method: "geocoded" }, venues: [{ name: "X", distanceM: 120 }], retrievedAt: "2026-10-11T00:00:00.000Z", attribution: "OSM" };

beforeEach(() => {
  state.users = new Map([["tok", { id: "u1" }]]);
  state.subscriptions = new Map();
  state.usage = 0;
  state.rateAllowed = true;
  state.usageThrows = false;
  state.lookup = async () => RESULT;
  state.lastArgs = null;
});

describe("/api/places", () => {
  it("requires POST and a valid sign-in", async () => {
    const r1 = res(); await handler({ method: "GET", headers: {} }, r1); expect(r1.statusCode).toBe(405);
    const r2 = res(); await handler(req(null, { query: "x" }), r2); expect(r2.statusCode).toBe(401);
    const r3 = res(); await handler(req("bad", { query: "Melbourne" }), r3); expect(r3.statusCode).toBe(401);
  });

  it("returns the source-labelled result for a free user with uses left, without consuming one", async () => {
    const r = res();
    await handler(req("tok", { query: "Melbourne CBD" }), r);
    expect(r.statusCode).toBe(200);
    expect(r.body).toMatchObject({ reference: { label: "Melbourne" }, retrievedAt: expect.any(String), attribution: "OSM" });
    expect(state.lastArgs).toEqual({ query: "Melbourne CBD", lat: undefined, lon: undefined });
  });

  it("only accepts numeric coordinates and string queries from the body", async () => {
    await handler(req("tok", { query: { $ne: 1 }, lat: "-37.8", lon: "144.9" }), res());
    expect(state.lastArgs).toEqual({ query: undefined, lat: undefined, lon: undefined });
    await handler(req("tok", { lat: -37.8, lon: 144.9 }), res());
    expect(state.lastArgs).toMatchObject({ lat: -37.8, lon: 144.9 });
  });

  it("a free user who has used their allowance is told so (402), and nothing is looked up", async () => {
    state.usage = 5;
    state.lookup = async () => { throw new Error("must not be called"); };
    const r = res();
    await handler(req("tok", { query: "Melbourne" }), r);
    expect(r.statusCode).toBe(402);
    expect(r.body.error.code).toBe("premium_required");
  });

  it("a paying user is never blocked by the free allowance", async () => {
    state.usage = 99;
    state.subscriptions.set("u1", { status: "active", stripe_customer_id: "c" });
    const r = res();
    await handler(req("tok", { query: "Melbourne" }), r);
    expect(r.statusCode).toBe(200);
  });

  it("fails CLOSED when usage can't be verified for a free user", async () => {
    state.usageThrows = true;
    const r = res();
    await handler(req("tok", { query: "Melbourne" }), r);
    expect(r.statusCode).toBe(503);
  });

  it("rate-limits abuse", async () => {
    state.rateAllowed = false;
    const r = res();
    await handler(req("tok", { query: "Melbourne" }), r);
    expect(r.statusCode).toBe(429);
  });

  it("surfaces typed provider errors with clear messages and the right status", async () => {
    state.lookup = async () => { throw new PlacesError("location_not_found", "We couldn't find that place.", 404); };
    const r = res(); await handler(req("tok", { query: "zzzz" }), r);
    expect(r.statusCode).toBe(404);
    expect(r.body.error).toMatchObject({ code: "location_not_found" });
    state.lookup = async () => { throw new PlacesError("venues_timeout", "Venue data is unavailable right now.", 504); };
    const r2 = res(); await handler(req("tok", { query: "Melbourne" }), r2);
    expect(r2.statusCode).toBe(504);
  });

  it("unexpected failures are a generic 500 with no internals", async () => {
    state.lookup = async () => { throw new Error("secret stack detail"); };
    const r = res(); await handler(req("tok", { query: "Melbourne" }), r);
    expect(r.statusCode).toBe(500);
    expect(JSON.stringify(r.body)).not.toContain("secret");
  });
});
