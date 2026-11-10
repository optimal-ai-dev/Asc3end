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
      if (url.includes("search.openfoodfacts.org")) return ok({ hits: [{ code: "1", product_name: "Oat Milk", brands: ["Oatly"], nutriments: { "energy-kcal_100g": 46 } }] });
      const { dataType } = JSON.parse(init.body);
      if (dataType.includes("Branded")) return ok({ foods: [{ fdcId: 9, description: "OAT MILK BEVERAGE", dataType: "Branded", brandOwner: "Silk", foodNutrients: [{ nutrientId: 1008, value: 50 }] }] });
      return ok({ foods: [{ fdcId: 7, description: "OAT MILK", dataType: "SR Legacy", foodNutrients: [{ nutrientId: 1008, value: 48 }] }] });
    });
    const res = await call({ q: "oat milk" });
    expect(res.statusCode).toBe(200);
    expect(res.body.results.map((f) => f.id)).toEqual(["fdc:7", "fdc:9", "off:1"]);
    expect(res.body.partial).toBe(false);
  });

  it("searches the shopper's country and the store's house brand", async () => {
    const urls = [];
    fetch.mockImplementation((url, init) => {
      urls.push(decodeURIComponent(url) + (init?.body || ""));
      if (url.includes("search.openfoodfacts.org")) {
        return ok({ hits: url.includes("australia")
          ? [{ code: "93", product_name: "Rotisserie Chicken", brands: "Kirkland Signature", nutriments: { "energy-kcal_100g": 180, proteins_100g: 25 } }]
          : [{ code: "5", product_name: "Chicken Nuggets", brands: "Other", nutriments: { "energy-kcal_100g": 250 } }] });
      }
      return ok({ foods: [] });
    });
    const res = await call({ q: "costco chicken", country: "au" });
    expect(urls.some((u) => u.includes('kirkland signature chicken countries_tags:"en:australia"'))).toBe(true);
    expect(urls.some((u) => u.includes('"query":"chicken"'))).toBe(true);
    expect(res.body.results[0]).toMatchObject({ id: "off:93", local: true });
  });

  it("reports an error, not an empty list, when every source is down", async () => {
    fetch.mockImplementation(() => Promise.reject(new Error("down")));
    const res = await call({ q: "anything at all" });
    expect(res.statusCode).toBe(502);
    expect(res.body.error).toMatch(/aren't responding/);
  });

  it("still answers when one source is down", async () => {
    fetch.mockImplementation((url) => (url.includes("search.openfoodfacts") ? Promise.reject(new Error("timeout")) : ok({ foods: [{ fdcId: 5, description: "EGG", dataType: "Foundation", foodNutrients: [{ nutrientId: 1008, value: 143 }] }] })));
    const res = await call({ q: "egg" });
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
  it("falls back to Search-a-licious when the product endpoint is throttled", async () => {
    fetch.mockImplementation((url) => {
      if (url.includes("/api/v2/product/")) return Promise.resolve({ ok: false, status: 429 });
      if (url.includes("search.openfoodfacts.org")) return ok({ hits: [{ code: "9300633000001", product_name: "Orange Juice", brands: "Nudie", nutriments: { "energy-kcal_100g": 45 } }] });
      return ok({ foods: [] });
    });
    const res = await call({ barcode: "9300633000001" });
    expect(res.statusCode).toBe(200);
    expect(res.body.food.name).toBe("Orange Juice");
  });

  it("says busy (503), not 'not found', when the databases fail", async () => {
    fetch.mockImplementation(() => Promise.resolve({ ok: false, status: 429 }));
    const res = await call({ barcode: "9300633000018" });
    expect(res.statusCode).toBe(503);
    expect(res.body.error).toMatch(/busy/);
  });

  it("retries Open Food Facts with typo tolerance when a search finds almost nothing", async () => {
    const urls = [];
    fetch.mockImplementation((url) => {
      urls.push(decodeURIComponent(url));
      if (url.includes("search.openfoodfacts.org")) {
        return ok({ hits: decodeURIComponent(url).includes("~1") ? [{ code: "77", product_name: "Shapes Barbecue", brands: "Arnott's", nutriments: { "energy-kcal_100g": 480 } }] : [] });
      }
      return ok({ foods: [] });
    });
    const res = await call({ q: "arnotts shapez barbecue" });
    expect(urls.some((u) => u.includes("shapez~1"))).toBe(true);
    expect(res.body.results.map((f) => f.id)).toContain("off:77");
  });
});
