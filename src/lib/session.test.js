import { describe, it, expect } from "vitest";
import { isStaleSession, isValidSession } from "./session";

describe("isStaleSession — the completed-workout-reopens-after-refresh bug", () => {
  it("flags a session as stale once its id shows up in saved workout history", () => {
    const session = { id: "abc123", exercises: [] };
    const workouts = [{ id: "abc123", exercises: [] }, { id: "other", exercises: [] }];
    expect(isStaleSession(session, workouts)).toBe(true);
  });

  it("does not flag a genuinely in-progress session that hasn't been saved yet", () => {
    const session = { id: "abc123", exercises: [] };
    const workouts = [{ id: "other", exercises: [] }];
    expect(isStaleSession(session, workouts)).toBe(false);
  });

  it("handles a missing/null session and missing/malformed workouts array without throwing", () => {
    expect(isStaleSession(null, [])).toBe(false);
    expect(isStaleSession({ id: "x" }, null)).toBe(false);
    expect(isStaleSession({ id: "x" }, undefined)).toBe(false);
  });
});

describe("isValidSession — malformed stored data cannot crash the app", () => {
  it("accepts a well-formed session", () => {
    expect(isValidSession({ id: "abc", exercises: [], startedAt: Date.now() })).toBe(true);
  });

  it("rejects null, non-objects, and objects missing required fields", () => {
    expect(isValidSession(null)).toBe(false);
    expect(isValidSession(undefined)).toBe(false);
    expect(isValidSession("not an object")).toBe(false);
    expect(isValidSession(42)).toBe(false);
    expect(isValidSession({})).toBe(false);
    expect(isValidSession({ id: "abc" })).toBe(false); // missing exercises/startedAt
    expect(isValidSession({ id: "abc", exercises: "not an array", startedAt: 1 })).toBe(false);
    expect(isValidSession({ id: "abc", exercises: [], startedAt: "not a number" })).toBe(false);
    expect(isValidSession({ id: 123, exercises: [], startedAt: 1 })).toBe(false); // id must be a string
  });
});
