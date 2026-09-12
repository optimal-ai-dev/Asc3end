// Live HTTP checks against the real production deployment — these verify things that can only be
// verified against an actually-deployed site (status codes, redirect behavior, response headers,
// whether Vercel's rewrite config accidentally intercepts a static file), not something a unit
// test against local source can prove. Not part of the default `npm test` run (network-dependent,
// hits the real internet) — run explicitly via `npm run test:integration`, same as
// security.integration.test.js.
//
// This deliberately does NOT try to spin up a real browser (no Playwright/Puppeteer in this
// project) — DOM-level checks like "no horizontal overflow" or "no console errors during session
// init" were verified live via manual browser testing instead of adding a new E2E framework for a
// handful of checks, consistent with using the project's existing testing tools rather than
// introducing a new one.

import { describe, it, expect } from "vitest";

const BASE = process.env.PRODUCTION_URL || "https://asc3end.vercel.app";

describe("Production deployment health — https://asc3end.vercel.app", () => {
  it("root path returns 200 with the app's HTML shell", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/html/);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).toContain("Asc3end");
  });

  it("HEAD / behaves sensibly (200, no body)", async () => {
    const res = await fetch(`${BASE}/`, { method: "HEAD" });
    expect(res.status).toBe(200);
  });

  it("the response was actually served over valid HTTPS (fetch throws on an invalid cert)", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.url.startsWith("https://")).toBe(true);
  });

  it("root HTML carries the expected public metadata without needing JS to run", async () => {
    const html = await (await fetch(`${BASE}/`)).text();
    // Exactly one of each — a duplicate/conflicting tag is worse than a missing one (undefined
    // behavior across crawlers), which is exactly the class of bug this guards against.
    expect((html.match(/<title>/g) || []).length).toBe(1);
    expect((html.match(/<meta name="robots"/g) || []).length).toBe(1);
    expect((html.match(/<link rel="canonical"/g) || []).length).toBe(1);
    expect(html).toMatch(/<meta name="description" content="[^"]+"/);
    expect(html).toMatch(/<link rel="canonical" href="https:\/\/asc3end\.vercel\.app\/"/);
    expect(html).toMatch(/<meta property="og:title"/);
    expect(html).toMatch(/<meta property="og:description"/);
    expect(html).toMatch(/<meta property="og:url"/);
    expect(html).toMatch(/<meta property="og:image"/);
    expect(html).toMatch(/<meta name="twitter:card"/);
    expect(html).toMatch(/<meta name="theme-color"/);
    expect(html).toMatch(/<link rel="icon"/);
    expect(html).toMatch(/<link rel="apple-touch-icon"/);
    expect(html).toMatch(/<html lang="en"/);
    // The public landing page must be indexable — a stray noindex here would deindex the whole site.
    expect(html).toMatch(/<meta name="robots" content="index, ?follow"/i);
  });

  it("robots.txt is served as plain text, allows the public site, blocks /app/*, and references the sitemap", async () => {
    const res = await fetch(`${BASE}/robots.txt`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/text\/plain/);
    const body = await res.text();
    expect(body).toMatch(/Allow:\s*\//);
    expect(body).toMatch(/Disallow:\s*\/app\//);
    expect(body).toMatch(/Sitemap:\s*https:\/\/asc3end\.vercel\.app\/sitemap\.xml/);
  });

  it("sitemap.xml is served as XML and lists only the public canonical page (no private/app routes)", async () => {
    const res = await fetch(`${BASE}/sitemap.xml`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/xml/);
    const body = await res.text();
    expect(body).toContain("<urlset");
    expect(body).toContain("https://asc3end.vercel.app/");
    expect(body).not.toContain("/app/"); // never leak authenticated routes into the sitemap
  });

  it("manifest.webmanifest returns the correct MIME type and a valid standalone PWA manifest", async () => {
    const res = await fetch(`${BASE}/manifest.webmanifest`);
    expect(res.status).toBe(200);
    expect(res.headers.get("content-type")).toMatch(/manifest\+json|application\/json/);
    const manifest = await res.json();
    expect(manifest.display).toBe("standalone");
    expect(manifest.name).toBeTruthy();
    expect(Array.isArray(manifest.icons)).toBe(true);
    expect(manifest.icons.length).toBeGreaterThan(0);
  });

  it("icons return 200 with an image content-type", async () => {
    for (const path of ["/icon-192.png", "/icon-512.png", "/apple-touch-icon.png"]) {
      const res = await fetch(`${BASE}${path}`);
      expect(res.status, `${path} should be 200`).toBe(200);
      expect(res.headers.get("content-type")).toMatch(/^image\//);
    }
  });

  it("a valid deep-linked app route (direct navigation / refresh) is NOT a Vercel 404 — the SPA rewrite serves the real app shell", async () => {
    const res = await fetch(`${BASE}/app/train`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
    expect(html).not.toMatch(/404: NOT_FOUND/i); // Vercel's own platform 404 page text
  });

  it("an unrecognized top-level path still resolves to the SPA shell rather than erroring (client-side 404 UX takes over from there)", async () => {
    const res = await fetch(`${BASE}/this-path-does-not-exist-${Date.now()}`);
    expect(res.status).toBe(200);
    const html = await res.text();
    expect(html).toContain('<div id="root">');
  });

  it("a protected API route refuses an unauthenticated request rather than silently succeeding", async () => {
    const res = await fetch(`${BASE}/api/usage`);
    expect(res.status).toBe(401);
  });

  it("the Stripe webhook endpoint rejects a request with no valid signature (still enforced in production)", async () => {
    const res = await fetch(`${BASE}/api/stripe-webhook`, { method: "POST", body: "{}" });
    expect(res.status).toBe(400);
  });

  it("baseline security headers are present", async () => {
    const res = await fetch(`${BASE}/`);
    expect(res.headers.get("x-content-type-options")).toBe("nosniff");
    expect(res.headers.get("x-frame-options")).toBe("DENY");
  });
});
