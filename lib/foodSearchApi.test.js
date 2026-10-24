import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";

const { fakeAdmin } = vi.hoisted(() => ({
  fakeAdmin: {
    auth: { getUser: async (token) => (token === "good" ? { data: { user: { id: "u1" } }, error: null } : { data: { user: null }, error: { message: "bad" } }) },
  },
}));
vi.mock("./supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));
vi.mock("./rateLimit.js", () => ({ checkRateLimit: async () => ({ allowed: true }) }));

import handler from "../api/food-search.js";

function call(query, token = "good") {
  const res = { statusCode: 0, body: null, headers: {} };
  res.status = (c) => { res.statusCode = c; return res; };
  res.json = (b) => { res.body = b; return res; };
  res.setHeader = (k, v) => { res.headers[k] = v; };
  return handler({ method: "GET", headers: token ? { authorization: `Bearer ${token}` } : {}, query }, res).then(() => res);
}

const ok = (body) => Promise.resolve({ ok: true, json: async () => body });

describe("/api/food-search", () => {
  beforeEach(() => { vi.stubGlobal("fetch", vi.fn()); });
  afterEach(() => { vi.unstubAllGlobals(); });

  it("requires sign-in", async () => {
    expect((await call({ q: "rice" }, null)).statusCode).toBe(401);
    expect((await call({ q: "rice" }, "nope")).statusCode).toBe(401);
  });

  it("rejects too-short queries and bad barcodes", async () => {
    expect((await call({ q: "r" })).statusCode).toBe(400);
    expect((await call({ barcode: "abc" })).statusCode).toBe(400);
  });

  it("merges USDA and Open Food Facts results, generic first", async () => {
    fetch.mockImplementation((url, init) => {
      if (url.includes("openfoodfacts")) return ok({ products: [{ code: "1", product_name: "Oat Milk", brands: "Oatly", nutriments: { "energy-kcal_100g": 46 } }] });
      const { dataType } = JSON.parse(init.body);
      if (dataType.includes("Branded")) return ok({ foods: [{ fdcId: 9, description: "OAT BEVERAGE", dataType: "Branded", brandOwner: "Silk", foodNutrients: [{ nutrientId: 1008, value: 50 }] }] });
      return ok({ foods: [{ fdcId: 7, description: "OATS, RAW", dataType: "SR Legacy", foodNutrients: [{ nutrientId: 1008, value: 389 }] }] });
    });
    const res = await call({ q: "oat milk test" });
    expect(res.statusCode).toBe(200);
    expect(res.body.results.map((f) => f.id)).toEqual(["fdc:7", "fdc:9", "off:1"]);
    expect(res.body.partial).toBe(false);
  });

  it("still answers when one source is down", async () => {
    fetch.mockImplementation((url) => (url.includes("openfoodfacts") ? Promise.reject(new Error("timeout")) : ok({ foods: [{ fdcId: 5, description: "EGG", dataType: "Foundation", foodNutrients: [{ nutrientId: 1008, value: 143 }] }] })));
    const res = await call({ q: "egg partial" });
    expect(res.statusCode).toBe(200);
    expect(res.body.partial).toBe(true);
    expect(res.body.results[0].name).toBe("Egg");
  });

  it("looks up a barcode on Open Food Facts, then USDA branded", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/api/v2/product/")) return ok({ status: 0 });
      return ok({ foods: [{ fdcId: 11, description: "PEANUT BUTTER", dataType: "Branded", gtinUpc: "051500255162", foodNutrients: [{ nutrientId: 1008, value: 588 }] }] });
    });
    const res = await call({ barcode: "0051500255162" });
    expect(res.statusCode).toBe(200);
    expect(res.body.food.id).toBe("fdc:11");

    fetch.mockImplementation(() => ok({ status: 0, foods: [] }));
    expect((await call({ barcode: "99999999" })).statusCode).toBe(404);
  });
});
