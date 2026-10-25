import { describe, it, expect } from "vitest";
import { stripLeadingZeros, toDraft, draftMatchesValue, parseNumberDraft, hasBodyStats } from "./numberInput";

describe("stripLeadingZeros", () => {
  it("drops zeros in front of a whole number", () => {
    expect(stripLeadingZeros("014")).toBe("14");
    expect(stripLeadingZeros("0168")).toBe("168");
    expect(stripLeadingZeros("058")).toBe("58");
    expect(stripLeadingZeros("000")).toBe("0");
  });
  it("keeps a lone zero, decimals and negatives sensible", () => {
    expect(stripLeadingZeros("0")).toBe("0");
    expect(stripLeadingZeros("0.5")).toBe("0.5");
    expect(stripLeadingZeros("00.5")).toBe("0.5");
    expect(stripLeadingZeros("-07")).toBe("-7");
    expect(stripLeadingZeros("")).toBe("");
    expect(stripLeadingZeros(null)).toBe("");
  });
});

describe("toDraft", () => {
  it("shows blank for empty values and, when asked, for a placeholder 0", () => {
    expect(toDraft("")).toBe("");
    expect(toDraft(null)).toBe("");
    expect(toDraft(undefined)).toBe("");
    expect(toDraft(0)).toBe("0");
    expect(toDraft(0, true)).toBe("");
    expect(toDraft(75)).toBe("75");
    expect(toDraft("075")).toBe("75");
  });
});

describe("draftMatchesValue", () => {
  it("treats a half-typed decimal as the same number", () => {
    expect(draftMatchesValue("1.", 1)).toBe(true);
    expect(draftMatchesValue("14", 14)).toBe(true);
    expect(draftMatchesValue("14", 15)).toBe(false);
  });
  it("lets a cleared box stay blank", () => {
    expect(draftMatchesValue("", "")).toBe(true);
    expect(draftMatchesValue("", 0)).toBe(false);
    expect(draftMatchesValue("", 0, true)).toBe(true);
    expect(draftMatchesValue("0", "")).toBe(false);
  });
});

describe("parseNumberDraft / hasBodyStats", () => {
  it("keeps blank distinct from 0", () => {
    expect(parseNumberDraft("")).toBe("");
    expect(parseNumberDraft("14")).toBe(14);
  });
  it("needs positive age, height and weight", () => {
    expect(hasBodyStats({ age: 14, heightCm: 168, weightKg: 58 })).toBe(true);
    expect(hasBodyStats({ age: "", heightCm: 168, weightKg: 58 })).toBe(false);
    expect(hasBodyStats({ age: 14, heightCm: 0, weightKg: 58 })).toBe(false);
  });
});
