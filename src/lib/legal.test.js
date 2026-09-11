import { describe, it, expect } from "vitest";
import { LEGAL_DOCUMENT_VERSION, LEGAL_COPY } from "./legal";

describe("legal document version + copy", () => {
  it("exports a non-empty version string to record against acceptance", () => {
    expect(typeof LEGAL_DOCUMENT_VERSION).toBe("string");
    expect(LEGAL_DOCUMENT_VERSION.length).toBeGreaterThan(0);
  });

  it("has the documents required for the onboarding acceptance checkbox", () => {
    expect(LEGAL_COPY.terms).toBeDefined();
    expect(LEGAL_COPY.privacy).toBeDefined();
    expect(LEGAL_COPY.disclaimer).toBeDefined();
    for (const doc of Object.values(LEGAL_COPY)) {
      expect(typeof doc.title).toBe("string");
      expect(typeof doc.body).toBe("string");
      expect(doc.body.length).toBeGreaterThan(20);
    }
  });
});
