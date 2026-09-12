import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeSupabase, inserts, setSession } = vi.hoisted(() => {
  const inserts = [];
  let session = { user: { id: "user-1" } };
  const fakeSupabase = {
    auth: {
      getSession: async () => ({ data: { session } }),
    },
    from(table) {
      if (table !== "feedback") throw new Error(`unexpected table: ${table}`);
      return {
        async insert(row) {
          inserts.push(row);
          return { error: null };
        },
      };
    },
  };
  return { fakeSupabase, inserts, setSession: (s) => { session = s; } };
});

vi.mock("./supabase", () => ({ supabase: fakeSupabase }));

const { validateFeedback, submitFeedback, FEEDBACK_TYPES, MAX_MESSAGE_LENGTH } = await import("./feedback");

describe("validateFeedback", () => {
  it("rejects an unknown type", () => {
    expect(validateFeedback({ type: "nonsense", message: "hi" })).toBeTruthy();
  });

  it("requires a message for bug/feature", () => {
    expect(validateFeedback({ type: "bug", message: "" })).toBeTruthy();
    expect(validateFeedback({ type: "feature", message: "   " })).toBeTruthy();
  });

  it("allows an empty message for a rating-only submission", () => {
    expect(validateFeedback({ type: "rating", message: "", rating: 4 })).toBeNull();
  });

  it("rejects a message over the length cap", () => {
    expect(validateFeedback({ type: "bug", message: "x".repeat(MAX_MESSAGE_LENGTH + 1) })).toBeTruthy();
  });

  it("rejects an out-of-range or non-integer rating", () => {
    expect(validateFeedback({ type: "rating", message: "", rating: 0 })).toBeTruthy();
    expect(validateFeedback({ type: "rating", message: "", rating: 6 })).toBeTruthy();
    expect(validateFeedback({ type: "rating", message: "", rating: 3.5 })).toBeTruthy();
  });

  it("accepts a valid bug report", () => {
    expect(validateFeedback({ type: "bug", message: "Coach crashed on send" })).toBeNull();
  });
});

describe("submitFeedback", () => {
  beforeEach(() => { inserts.length = 0; setSession({ user: { id: "user-1" } }); });

  it("inserts a validated bug report scoped to the signed-in user", async () => {
    const result = await submitFeedback({ type: "bug", message: "  Scanner froze  ", page: "nutrition" });
    expect(result.ok).toBe(true);
    expect(inserts).toEqual([{ user_id: "user-1", type: "bug", message: "Scanner froze", rating: null, page: "nutrition" }]);
  });

  it("refuses to submit and never inserts when validation fails", async () => {
    const result = await submitFeedback({ type: "bug", message: "" });
    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("refuses to submit without a session", async () => {
    setSession(null);
    const result = await submitFeedback({ type: "feature", message: "Dark mode toggle" });
    expect(result.ok).toBe(false);
    expect(inserts).toHaveLength(0);
  });

  it("caps message length before sending, defense in depth", async () => {
    await submitFeedback({ type: "bug", message: "x".repeat(MAX_MESSAGE_LENGTH + 500) });
    expect(inserts[0].message.length).toBe(MAX_MESSAGE_LENGTH);
  });

  it("every FEEDBACK_TYPES entry validates as a legitimate type", () => {
    for (const t of FEEDBACK_TYPES) {
      expect(validateFeedback({ type: t, message: "ok", rating: t === "rating" ? 3 : undefined })).toBeNull();
    }
  });
});
