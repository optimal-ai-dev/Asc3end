import { describe, it, expect, vi, beforeEach } from "vitest";

// A minimal in-memory stand-in for the `user_data` table, faithful to the exact call chains
// storage.js actually makes (select().eq("user_id",...).eq("key",...).maybeSingle(),
// upsert(row), delete().eq("user_id",...).eq("key",...)) — not a general Supabase mock.
const { fakeSupabase, setCurrentUser, getRow, forceNextUpsertError } = vi.hoisted(() => {
  const rows = new Map(); // "user_id:key" -> { value }
  let currentUser = { id: "user-1" };
  let nextUpsertError = null;

  const fakeSupabase = {
    auth: {
      getUser: async () => ({ data: { user: currentUser } }),
    },
    from(table) {
      if (table !== "user_data") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            eq(_k1, v1) {
              return {
                eq(_k2, v2) {
                  return {
                    async maybeSingle() {
                      const row = rows.get(`${v1}:${v2}`);
                      return { data: row ? { value: row.value } : null, error: null };
                    },
                  };
                },
              };
            },
          };
        },
        async upsert(row) {
          if (nextUpsertError) {
            const err = nextUpsertError;
            nextUpsertError = null;
            return { error: err };
          }
          rows.set(`${row.user_id}:${row.key}`, { value: row.value });
          return { error: null };
        },
        delete() {
          return {
            eq(_k1, v1) {
              return {
                eq(_k2, v2) {
                  rows.delete(`${v1}:${v2}`);
                  return Promise.resolve({ error: null });
                },
              };
            },
          };
        },
      };
    },
  };

  return {
    fakeSupabase,
    setCurrentUser: (u) => { currentUser = u; },
    getRow: (userId, key) => rows.get(`${userId}:${key}`),
    forceNextUpsertError: (err) => { nextUpsertError = err; },
  };
});

vi.mock("./supabase", () => ({ supabase: fakeSupabase }));

const { loadKey, saveKey, storage } = await import("./storage");

beforeEach(() => {
  setCurrentUser({ id: "user-1" });
});

describe("saveKey / loadKey round-trip", () => {
  it("saves and loads a plain value", async () => {
    const ok = await saveKey("atlas:profile", { name: "Jamie", age: 27 });
    expect(ok).toBe(true);
    const loaded = await loadKey("atlas:profile");
    expect(loaded).toEqual({ name: "Jamie", age: 27 });
  });

  it("saves and loads an array", async () => {
    await saveKey("atlas:workouts", [{ id: "w1" }, { id: "w2" }]);
    expect(await loadKey("atlas:workouts")).toEqual([{ id: "w1" }, { id: "w2" }]);
  });
});

describe("the stale-session root cause: saveKey(key, null) must delete, not upsert null", () => {
  it("deletes the row instead of storing a JS null (which the real jsonb NOT NULL column would reject)", async () => {
    await saveKey("atlas:session", { id: "abc", exercises: [] });
    expect(getRow("user-1", "atlas:session")).toBeDefined();

    const ok = await saveKey("atlas:session", null);
    expect(ok).toBe(true);
    expect(getRow("user-1", "atlas:session")).toBeUndefined();
    expect(await loadKey("atlas:session")).toBeNull();
  });

  it("also treats undefined as a clear", async () => {
    await saveKey("atlas:session", { id: "abc", exercises: [] });
    await saveKey("atlas:session", undefined);
    expect(getRow("user-1", "atlas:session")).toBeUndefined();
  });
});

describe("malformed stored data cannot crash the app", () => {
  it("loadKey returns null instead of throwing when the underlying read throws (network blip, malformed response)", async () => {
    const original = fakeSupabase.from;
    fakeSupabase.from = (table) => {
      if (table === "user_data") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => { throw new Error("simulated corrupt response"); } }) }) }),
        };
      }
      return original(table);
    };
    await expect(loadKey("atlas:profile")).resolves.toBeNull();
    fakeSupabase.from = original;
  });

  it("loadKey returns null instead of throwing when the stored value is undefined (JSON.stringify(undefined) is not a JSON string, so JSON.parse would otherwise throw)", async () => {
    const original = fakeSupabase.from;
    fakeSupabase.from = (table) => {
      if (table === "user_data") {
        return {
          select: () => ({ eq: () => ({ eq: () => ({ maybeSingle: async () => ({ data: { value: undefined }, error: null }) }) }) }),
        };
      }
      return original(table);
    };
    await expect(loadKey("atlas:profile")).resolves.toBeNull();
    fakeSupabase.from = original;
  });

  it("loadKey returns null (not throw) for a key that was never saved", async () => {
    await expect(loadKey("atlas:never-saved")).resolves.toBeNull();
  });
});

describe("save failure is surfaced, not silently swallowed as success", () => {
  it("saveKey returns false when the underlying upsert fails", async () => {
    forceNextUpsertError({ message: "simulated network failure" });
    const ok = await saveKey("atlas:profile", { name: "Jamie" });
    expect(ok).toBe(false);
  });
});

describe("account isolation: switching authenticated users never exposes the previous user's data", () => {
  it("scopes every read/write to the currently authenticated user, not a cached one", async () => {
    setCurrentUser({ id: "user-1" });
    await saveKey("atlas:profile", { name: "User One" });

    setCurrentUser({ id: "user-2" });
    // user-2 has never saved a profile — must see nothing, never user-1's data.
    expect(await loadKey("atlas:profile")).toBeNull();

    await saveKey("atlas:profile", { name: "User Two" });
    expect(await loadKey("atlas:profile")).toEqual({ name: "User Two" });

    // Switching back to user-1 must still see user-1's own data, untouched by user-2's write.
    setCurrentUser({ id: "user-1" });
    expect(await loadKey("atlas:profile")).toEqual({ name: "User One" });
  });

  it("returns null instead of throwing when there is no authenticated user", async () => {
    setCurrentUser(null);
    expect(await loadKey("atlas:profile")).toBeNull();
    expect(await saveKey("atlas:profile", { name: "x" })).toBe(false);
  });
});

describe("storage object is still exported for callers that need the raw shape", () => {
  it("storage.get returns null for a missing key", async () => {
    setCurrentUser({ id: "user-3" });
    expect(await storage.get("atlas:nope")).toBeNull();
  });
});
