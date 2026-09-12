import { describe, it, expect } from "vitest";
import { MIN_PASSWORD_LENGTH, isValidPassword } from "./passwordPolicy";

describe("password minimum length policy", () => {
  it("the minimum is 8, not the previous 6", () => {
    expect(MIN_PASSWORD_LENGTH).toBe(8);
  });

  it("rejects passwords shorter than the minimum", () => {
    expect(isValidPassword("short7c")).toBe(false); // 7 chars
    expect(isValidPassword("")).toBe(false);
  });

  it("accepts passwords at or above the minimum", () => {
    expect(isValidPassword("exactly8")).toBe(true); // 8 chars
    expect(isValidPassword("a much longer passphrase")).toBe(true);
  });

  it("does not impose arbitrary complexity rules — a long simple passphrase is valid", () => {
    expect(isValidPassword("allthesamelowercaseletters")).toBe(true);
  });

  it("rejects non-string input without throwing", () => {
    expect(isValidPassword(undefined)).toBe(false);
    expect(isValidPassword(null)).toBe(false);
    expect(isValidPassword(12345678)).toBe(false);
  });
});
