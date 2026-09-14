import { describe, it, expect, vi, beforeEach, afterEach } from "vitest";
import { LEGAL_DOCUMENT_VERSION, LEGAL_EFFECTIVE_DATE, LEGAL_COPY } from "./legal";

const REQUIRED_DOCS = ["privacy", "terms", "disclaimer", "aiLimitations", "subscriptionTerms", "refundPolicy", "support", "contact"];

const PRIVACY_REQUIRED_TOPICS = [
  "data we collect", "why we collect it", "account and profile data",
  "workout, nutrition, and bodyweight data", "ai processing and anthropic",
  "payment processing", "analytics and error monitoring", "cookies and local storage",
  "data retention", "export and deletion", "security", "children and minimum age",
  "international data processing", "your privacy rights", "contact",
];

const TERMS_REQUIRED_TOPICS = [
  "accounts", "acceptable use", "subscriptions", "cancellation", "intellectual property",
  "ai limitations", "health disclaimer", "termination", "warranty", "contact",
];

describe("legal document version + copy", () => {
  it("exports a non-empty version string and effective date to record against acceptance", () => {
    expect(typeof LEGAL_DOCUMENT_VERSION).toBe("string");
    expect(LEGAL_DOCUMENT_VERSION.length).toBeGreaterThan(0);
    expect(typeof LEGAL_EFFECTIVE_DATE).toBe("string");
    expect(LEGAL_EFFECTIVE_DATE.length).toBeGreaterThan(0);
  });

  it("has all 8 required documents, each with a title and non-empty structured sections", () => {
    for (const key of REQUIRED_DOCS) {
      const doc = LEGAL_COPY[key];
      expect(doc, `missing document: ${key}`).toBeDefined();
      expect(typeof doc.title).toBe("string");
      expect(Array.isArray(doc.sections)).toBe(true);
      expect(doc.sections.length).toBeGreaterThan(0);
      for (const section of doc.sections) {
        expect(typeof section.heading).toBe("string");
        expect(section.heading.length).toBeGreaterThan(0);
        expect(typeof section.body).toBe("string");
        expect(section.body.length).toBeGreaterThan(10);
      }
    }
  });

  it("never shows customer-visible text claiming the documents are drafts, unreviewed, or lawyer-approved", () => {
    // The draft/unreviewed status is tracked internally (see the code comment above
    // LEGAL_DOCUMENT_VERSION and LAUNCH_READINESS.md) but must never appear in what a user reads.
    const forbidden = /draft|unreviewed|not reviewed|lawyer[- ]approved|lawyer approved/i;
    for (const doc of Object.values(LEGAL_COPY)) {
      expect(doc.title).not.toMatch(forbidden);
      for (const section of doc.sections) {
        expect(section.heading).not.toMatch(forbidden);
        expect(section.body).not.toMatch(forbidden);
      }
    }
  });

  it("the Privacy Policy covers every required topic", () => {
    const headings = LEGAL_COPY.privacy.sections.map((s) => s.heading.toLowerCase());
    for (const topic of PRIVACY_REQUIRED_TOPICS) {
      expect(headings.some((h) => h.includes(topic)), `Privacy Policy missing topic: ${topic}`).toBe(true);
    }
  });

  it("the Terms of Use cover every required topic", () => {
    const headings = LEGAL_COPY.terms.sections.map((s) => s.heading.toLowerCase());
    for (const topic of TERMS_REQUIRED_TOPICS) {
      expect(headings.some((h) => h.includes(topic)), `Terms of Use missing topic: ${topic}`).toBe(true);
    }
  });

  it("Subscription Terms billing amounts are labeled AUD, not a bare '$'", () => {
    const billing = LEGAL_COPY.subscriptionTerms.sections.find((s) => s.heading === "Billing");
    expect(billing.body).toMatch(/AUD \$9\.99/);
    expect(billing.body).toMatch(/AUD \$79\.99/);
  });
});

// Regression coverage for a real gap: VITE_LEGAL_BUSINESS_NAME/ABN/ADDRESS were set in Vercel but
// never actually read anywhere in legal.js (worse, they were originally defined WITHOUT the
// VITE_ prefix, which makes them invisible to this 100%-client-side app's browser bundle no
// matter what value they hold — only VITE_-prefixed vars are ever exposed to client code). These
// tests exercise the actual env-var-to-rendered-text path with vi.stubEnv + a fresh module import,
// so a future edit that silently breaks this wiring again fails a test instead of just quietly
// doing nothing on the real site.
describe("business identification — reads from VITE_-prefixed env vars, not the old unread names", () => {
  const ORIGINAL_ENV = { ...import.meta.env };

  beforeEach(() => { vi.resetModules(); });
  afterEach(() => {
    for (const key of Object.keys(import.meta.env)) delete import.meta.env[key];
    Object.assign(import.meta.env, ORIGINAL_ENV);
  });

  it("names the real business on Privacy and Terms when the env vars are set", async () => {
    vi.stubEnv("VITE_LEGAL_BUSINESS_NAME", "Tarique De Mel");
    vi.stubEnv("VITE_LEGAL_BUSINESS_ABN", "87274187737");
    vi.stubEnv("VITE_LEGAL_BUSINESS_ADDRESS", "40 Bareena Avenue, Rowville VIC 3178");
    const { LEGAL_COPY: freshCopy } = await import("./legal.js?t=" + Date.now());
    const privacySection = freshCopy.privacy.sections.find((s) => s.heading === "Who provides this service");
    const termsSection = freshCopy.terms.sections.find((s) => s.heading === "Who provides this service");
    expect(privacySection.body).toContain("Tarique De Mel");
    expect(privacySection.body).toContain("87274187737");
    expect(privacySection.body).toContain("40 Bareena Avenue, Rowville VIC 3178");
    expect(termsSection.body).toContain("Tarique De Mel");
  });

  it("honestly discloses the gap instead of showing a blank/broken section when unset", async () => {
    vi.stubEnv("VITE_LEGAL_BUSINESS_NAME", "");
    vi.stubEnv("VITE_LEGAL_BUSINESS_ABN", "");
    vi.stubEnv("VITE_LEGAL_BUSINESS_ADDRESS", "");
    const { LEGAL_COPY: freshCopy } = await import("./legal.js?t=" + Date.now());
    const section = freshCopy.privacy.sections.find((s) => s.heading === "Who provides this service");
    expect(section.body).toMatch(/not yet been configured/i);
    expect(section.body).not.toContain("undefined");
    expect(section.body).not.toContain("null");
  });
});
