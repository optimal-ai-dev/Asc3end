import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeSupabase, inserts } = vi.hoisted(() => {
  const inserts = [];
  const fakeSupabase = {
    auth: {
      getSession: async () => ({ data: { session: { user: { id: "user-1" } } } }),
    },
    from(table) {
      if (table !== "analytics_events") throw new Error(`unexpected table: ${table}`);
      return {
        async insert(row) {
          inserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { fakeSupabase, inserts };
});

vi.mock("./supabase", () => ({ supabase: fakeSupabase }));

const { logEvent, EVENT_NAMES } = await import("./analytics");

const flush = () => new Promise((r) => setTimeout(r, 0));

describe("logEvent", () => {
  beforeEach(() => { inserts.length = 0; });

  it("writes a cataloged event with its props", async () => {
    logEvent("food_logged", { count: 2 });
    await flush();
    expect(inserts).toEqual([{ user_id: "user-1", name: "food_logged", props: { count: 2 } }]);
  });

  it("silently drops an event name that isn't in the catalog", async () => {
    logEvent("totally_made_up_event", { anything: 1 });
    await flush();
    expect(inserts).toHaveLength(0);
  });

  it("strips sensitive-looking keys from props before writing", async () => {
    logEvent("coach_message_sent", { isRetry: false, email: "athlete@example.com", authToken: "secret" });
    await flush();
    expect(inserts).toHaveLength(1);
    expect(inserts[0].props).toEqual({ isRetry: false });
  });

  it("strips a string value that looks like an email even under a clean key name", async () => {
    logEvent("paywall_viewed", { feature: "someone@example.com" });
    await flush();
    expect(inserts[0].props).toEqual({});
  });

  it("strips nested objects — props must be flat primitives only", async () => {
    logEvent("plan_generated", { trainingDays: 4, nested: { a: 1 } });
    await flush();
    expect(inserts[0].props).toEqual({ trainingDays: 4 });
  });

  it("every currently-used event name is in the catalog", () => {
    for (const n of ["signup_completed", "onboarding_completed", "plan_generated", "plan_activated", "plan_edited", "workout_started", "first_set_logged", "workout_completed", "coach_message_sent", "food_logged", "paywall_viewed", "checkout_started", "checkout_failed", "subscription_activated"]) {
      expect(EVENT_NAMES.has(n)).toBe(true);
    }
  });
});
