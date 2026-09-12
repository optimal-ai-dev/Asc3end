import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal fake for the one table shape lib/monthlyUsage.js actually touches:
// feature_usage_monthly(user_id, feature, month, count). Rows are keyed by "user:feature:month" so
// a new calendar month is provably a distinct row with no residual count from the previous one —
// this is the actual mechanism the "resets every calendar month, not a one-time trial" requirement
// depends on, so the test exercises it directly rather than trusting the implementation by reading.
const { fakeSupabaseAdmin, rows, upserts } = vi.hoisted(() => {
  const rows = new Map();
  const upserts = [];
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
          upserts.push(row);
          rows.set(`${row.user_id}:${row.feature}:${row.month}`, row);
          return { error: null };
        },
      };
    },
  };
  return { fakeSupabaseAdmin, rows, upserts };
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
  beforeEach(() => { rows.clear(); upserts.length = 0; });

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
});
