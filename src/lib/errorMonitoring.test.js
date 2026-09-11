import { describe, it, expect, vi } from "vitest";
import { initErrorMonitoring, captureException, captureMessage } from "./errorMonitoring";

// No VITE_SENTRY_DSN is set in the test env, so every call here exercises the "no DSN configured"
// fallback path — the one thing this module must always guarantee regardless of Sentry: it never
// throws and never blocks the caller.
describe("errorMonitoring without a configured DSN", () => {
  it("initErrorMonitoring resolves without throwing", async () => {
    await expect(initErrorMonitoring()).resolves.toBeUndefined();
  });

  it("captureException logs instead of throwing", () => {
    const spy = vi.spyOn(console, "error").mockImplementation(() => {});
    expect(() => captureException(new Error("boom"), { where: "test" })).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });

  it("captureMessage logs instead of throwing", () => {
    const spy = vi.spyOn(console, "warn").mockImplementation(() => {});
    expect(() => captureMessage("heads up")).not.toThrow();
    expect(spy).toHaveBeenCalled();
    spy.mockRestore();
  });
});
