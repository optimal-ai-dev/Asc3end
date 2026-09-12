import { describe, it, expect, vi } from "vitest";
import { validateSecretFormat, validateStripeKeyFormat, assertValidOrLog } from "./validateSecretFormat";

// Regression coverage for a real production incident: 24 StripeConnectionError "Invalid
// character in header content" failures, some referencing Unicode 8226 (•) — a Stripe secret
// key pasted with a trailing newline or a smart-punctuation artifact from a formatted document.
describe("validateSecretFormat", () => {
  it("accepts a clean value", () => {
    expect(validateSecretFormat("sk_test_abcdefghijklmnop")).toEqual({ ok: true });
  });

  it("rejects a missing value", () => {
    expect(validateSecretFormat(undefined).ok).toBe(false);
    expect(validateSecretFormat("").ok).toBe(false);
  });

  it("rejects leading or trailing whitespace", () => {
    expect(validateSecretFormat(" sk_test_abc").ok).toBe(false);
    expect(validateSecretFormat("sk_test_abc ").ok).toBe(false);
    expect(validateSecretFormat("sk_test_abc\t").ok).toBe(false);
  });

  it("rejects an embedded newline or carriage return — the exact class of bug behind the real incident", () => {
    expect(validateSecretFormat("sk_test_abc\ndef").ok).toBe(false);
    expect(validateSecretFormat("sk_test_abc\r\ndef").ok).toBe(false);
  });

  it("rejects a bullet character (Unicode 8226 — the exact character referenced in the incident logs)", () => {
    const withBullet = "sk_test_abc" + String.fromCharCode(8226) + "def";
    expect(validateSecretFormat(withBullet).ok).toBe(false);
  });

  it("rejects smart/curly quotes and em/en-dashes commonly introduced by pasting from a document", () => {
    expect(validateSecretFormat("sk_test_‘abc’").ok).toBe(false);
    expect(validateSecretFormat("sk_test_“abc”").ok).toBe(false);
    expect(validateSecretFormat("sk_test_abc—def").ok).toBe(false);
  });

  it("rejects a value wrapped in literal quote characters", () => {
    expect(validateSecretFormat('"sk_test_abc"').ok).toBe(false);
  });

  it("rejects other non-printable control characters", () => {
    expect(validateSecretFormat("sk_test_abc\x01def").ok).toBe(false);
  });
});

describe("validateStripeKeyFormat", () => {
  it("accepts a value matching the expected prefix pattern", () => {
    expect(validateStripeKeyFormat("price_1AbCdEfGhIjK", /^price_[A-Za-z0-9]+$/, "price id")).toEqual({ ok: true });
  });

  it("rejects a value that's clean but doesn't match the expected shape", () => {
    const result = validateStripeKeyFormat("prod_notaprice", /^price_[A-Za-z0-9]+$/, "price id");
    expect(result.ok).toBe(false);
  });

  it("still catches formatting problems before checking the shape", () => {
    const result = validateStripeKeyFormat("price_abc\n", /^price_[A-Za-z0-9]+$/, "price id");
    expect(result.ok).toBe(false);
  });
});

describe("assertValidOrLog", () => {
  it("logs the variable name and problem, never the value, and returns the ok flag", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = assertValidOrLog("STRIPE_SECRET_KEY", { ok: false, problem: "contains a newline" });
    expect(ok).toBe(false);
    expect(spy).toHaveBeenCalledTimes(1);
    const loggedMessage = spy.mock.calls[0].join(" ");
    expect(loggedMessage).toContain("STRIPE_SECRET_KEY");
    expect(loggedMessage).toContain("contains a newline");
    spy.mockRestore();
  });

  it("does not log anything when the value is valid", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    const ok = assertValidOrLog("STRIPE_SECRET_KEY", { ok: true });
    expect(ok).toBe(true);
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
  });
});
