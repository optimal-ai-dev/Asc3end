import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal fake for the one table shape lib/monthlyUsage.js actually touches:
// feature_usage_monthly(user_id, feature, month, count). Rows are keyed by "user:feature:month" so
// a new calendar month is provably a distinct row with no residual count from the previous one —
// this is the actual mechanism the "resets every calendar month, not a one-time trial" requirement
// depends on, so the test exercises it directly rather than trusting the implementation by reading.
const { fakeSupabaseAdmin, rows, upserts, errorState } = vi.hoisted(() => {
  const rows = new Map();
  const upserts = [];
  // Lets tests simulate the table being missing/unreachable — the exact live-production failure
  // this file's error-path tests exist to guard against (see the "fails closed" tests below).
  const errorState = { select: null, upsert: null };
  const fakeSupabaseAdmin = {
    from(table) {
      if (table !== "feature_usage_monthly") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            eq(_k1, userId) {
              return {
                eq(_k2, feature) {
                  return {
                    eq(_k3, month) {
                      return {
                        async maybeSingle() {
                          if (errorState.select) return { data: null, error: errorState.select };
                          const row = rows.get(`${userId}:${feature}:${month}`);
                          return { data: row ? { count: row.count } : null, error: null };
                        },
                      };
                    },
                  };
                },
              };
            },
          };
        },
        async upsert(row) {
          if (errorState.upsert) return { error: errorState.upsert };
          upserts.push(row);
          rows.set(`${row.user_id}:${row.feature}:${row.month}`, row);
          return { error: null };
        },
      };
    },
  };
  return { fakeSupabaseAdmin, rows, upserts, errorState };
});

vi.mock("./supabaseAdmin.js", () => ({ supabaseAdmin: fakeSupabaseAdmin }));

const { currentMonthKey, getMonthlyUsage, incrementMonthlyUsage } = await import("./monthlyUsage.js");

describe("currentMonthKey", () => {
  it("formats a date as YYYY-MM (UTC)", () => {
    expect(currentMonthKey(new Date("2026-09-12T10:00:00Z"))).toBe("2026-09");
    expect(currentMonthKey(new Date("2026-01-01T00:00:00Z"))).toBe("2026-01");
  });
});

describe("getMonthlyUsage / incrementMonthlyUsage — the free-plan monthly allowance, not a trial", () => {
  beforeEach(() => { rows.clear(); upserts.length = 0; errorState.select = null; errorState.upsert = null; });

  it("a user with no usage row yet reads as 0", async () => {
    expect(await getMonthlyUsage("user-1", "coach", "2026-09")).toBe(0);
  });

  it("incrementing writes count+1 for that exact user/feature/month", async () => {
    await incrementMonthlyUsage("user-1", "coach", 0, "2026-09");
    expect(await getMonthlyUsage("user-1", "coach", "2026-09")).toBe(1);
    await incrementMonthlyUsage("user-1", "coach", 1, "2026-09");
    expect(await getMonthlyUsage("user-1", "coach", "2026-09")).toBe(2);
  });

  it("regression: usage resets automatically in a new calendar month — no cron, no explicit reset call", async () => {
    // Exhaust the allowance in September...
    for (let i = 0; i < 5; i++) {
      const before = await getMonthlyUsage("user-1", "coach", "2026-09");
      await incrementMonthlyUsage("user-1", "coach", before, "2026-09");
    }
    expect(await getMonthlyUsage("user-1", "coach", "2026-09")).toBe(5);

    // ...October is a distinct key with no memory of September's count.
    expect(await getMonthlyUsage("user-1", "coach", "2026-10")).toBe(0);
  });

  it("coach and meals are tracked independently for the same user/month", async () => {
    await incrementMonthlyUsage("user-1", "coach", 0, "2026-09");
    expect(await getMonthlyUsage("user-1", "meals", "2026-09")).toBe(0);
  });

  it("different users never share a usage count", async () => {
    await incrementMonthlyUsage("user-1", "coach", 0, "2026-09");
    expect(await getMonthlyUsage("user-2", "coach", "2026-09")).toBe(0);
  });

  // Regression for a real production incident: feature_usage_monthly didn't exist yet in the live
  // database, and the original implementation swallowed the resulting Postgres error, returning 0
  // — which made every Free user's usage read as "0 used" forever, i.e. unlimited free access.
  // These lock in the fix: a DB error must be visible to the caller, not silently treated as "no
  // usage yet".
  it("fails closed: a DB error on read throws instead of silently reading as 0 usage", async () => {
    errorState.select = { code: "PGRST205", message: "Could not find the table 'public.feature_usage_monthly'" };
    await expect(getMonthlyUsage("user-1", "coach", "2026-09")).rejects.toThrow();
  });

  it("fails closed: a DB error on increment throws instead of silently no-op'ing", async () => {
    errorState.upsert = { code: "PGRST205", message: "Could not find the table 'public.feature_usage_monthly'" };
    await expect(incrementMonthlyUsage("user-1", "coach", 0, "2026-09")).rejects.toThrow();
  });
});
