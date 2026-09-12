import { describe, it, expect } from "vitest";
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
});
