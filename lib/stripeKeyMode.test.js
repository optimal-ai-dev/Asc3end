import { describe, it, expect } from "vitest";
import { stripeKeyMode, checkStripeModes } from "./stripeKeyMode";

describe("stripeKeyMode", () => {
  it("reads the mode from each Stripe key prefix", () => {
    expect(stripeKeyMode("sk_live_abc")).toBe("live");
    expect(stripeKeyMode("sk_test_abc")).toBe("test");
    expect(stripeKeyMode("pk_live_abc")).toBe("live");
    expect(stripeKeyMode("pk_test_abc")).toBe("test");
    expect(stripeKeyMode("rk_live_abc")).toBe("live");
  });

  it("returns null when unset and unknown for anything else", () => {
    expect(stripeKeyMode(undefined)).toBe(null);
    expect(stripeKeyMode("")).toBe(null);
    expect(stripeKeyMode("whsec_abc")).toBe("unknown");
  });
});

describe("checkStripeModes", () => {
  it("is quiet for matching live keys in production", () => {
    const env = { STRIPE_SECRET_KEY: "sk_live_a", VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_b" };
    expect(checkStripeModes(env, { isProduction: true }).warnings).toEqual([]);
  });

  it("is quiet for test keys outside production", () => {
    const env = { STRIPE_SECRET_KEY: "sk_test_a", VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_b" };
    expect(checkStripeModes(env, { isProduction: false }).warnings).toEqual([]);
  });

  it("warns when production still uses test keys", () => {
    const env = { STRIPE_SECRET_KEY: "sk_test_a", VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_b" };
    const { warnings } = checkStripeModes(env, { isProduction: true });
    expect(warnings).toHaveLength(1);
    expect(warnings[0]).toMatch(/TEST-mode/);
  });

  it("warns when the secret and publishable keys come from different modes", () => {
    const env = { STRIPE_SECRET_KEY: "sk_live_a", VITE_STRIPE_PUBLISHABLE_KEY: "pk_test_b" };
    const { warnings } = checkStripeModes(env, { isProduction: false });
    expect(warnings.some((w) => /same mode/.test(w))).toBe(true);
  });

  it("never includes a key value in a warning", () => {
    const env = { STRIPE_SECRET_KEY: "sk_test_SECRETVALUE", VITE_STRIPE_PUBLISHABLE_KEY: "pk_live_PUBVALUE" };
    const { warnings } = checkStripeModes(env, { isProduction: true });
    expect(warnings.join(" ")).not.toMatch(/SECRETVALUE|PUBVALUE/);
  });
});
