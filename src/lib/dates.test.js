import { describe, it, expect } from "vitest";
import {
  localDateString, addDays, daysBetween, startOfWeek, formatDateOnly, today, yesterday, daysAgo,
  workoutInstant, zonedWallClockToMs, newTimestamp, legacyUtcDateMismatch, isDateString, zonedParts,
} from "./dates";

const SYD = "Australia/Sydney";
const LA = "America/Los_Angeles";

describe("localDateString — the audit's 9 vs 8 October bug", () => {
  it("Sydney, 01:30 on 9 Oct 2026 (UTC+11) is the 9th locally even though the UTC date is the 8th", () => {
    const instant = Date.UTC(2026, 9, 8, 14, 30, 0); // 2026-10-08T14:30Z
    expect(new Date(instant).toISOString().slice(0, 10)).toBe("2026-10-08"); // the old, wrong derivation
    expect(localDateString(instant, SYD)).toBe("2026-10-09");
  });

  it("Los Angeles is the opposite direction: 20:00 PDT on 8 Oct is the 8th locally, the 9th in UTC", () => {
    const instant = Date.UTC(2026, 9, 9, 3, 0, 0);
    expect(localDateString(instant, LA)).toBe("2026-10-08");
  });
});

describe("midnight boundaries (Australia/Sydney, AEST UTC+10 before DST)", () => {
  it("23:59:59 and 00:00:00 land on different local dates", () => {
    // 2026-10-03 23:59:59 AEST = 13:59:59Z ; 2026-10-04 00:00:00 AEST = 14:00:00Z
    expect(localDateString(Date.UTC(2026, 9, 3, 13, 59, 59), SYD)).toBe("2026-10-03");
    expect(localDateString(Date.UTC(2026, 9, 3, 14, 0, 0), SYD)).toBe("2026-10-04");
  });
});

describe("daylight-saving transitions", () => {
  it("spring-forward (Sydney, 4 Oct 2026, 02:00 AEST -> 03:00 AEDT): the day is 23h long but dates stay consistent", () => {
    const before = Date.UTC(2026, 9, 3, 15, 59, 0); // 01:59 AEST on the 4th
    const after = Date.UTC(2026, 9, 3, 16, 1, 0);   // 03:01 AEDT on the 4th
    expect(localDateString(before, SYD)).toBe("2026-10-04");
    expect(localDateString(after, SYD)).toBe("2026-10-04");
    expect(zonedParts(after, SYD).hour).toBe(3);
  });

  it("fall-back (Sydney, 5 Apr 2026, 03:00 AEDT -> 02:00 AEST): the repeated hour stays on the same date", () => {
    const first = Date.UTC(2026, 3, 4, 15, 30, 0);  // 02:30 AEDT
    const second = Date.UTC(2026, 3, 4, 16, 30, 0); // 02:30 AEST (the repeated hour)
    expect(localDateString(first, SYD)).toBe("2026-04-05");
    expect(localDateString(second, SYD)).toBe("2026-04-05");
  });

  it("US fall-back (LA, 1 Nov 2026): 01:30 occurs twice, both are 1 Nov", () => {
    expect(localDateString(Date.UTC(2026, 10, 1, 8, 30, 0), LA)).toBe("2026-11-01");
    expect(localDateString(Date.UTC(2026, 10, 1, 9, 30, 0), LA)).toBe("2026-11-01");
  });

  it("date-string arithmetic is DST-proof: adding days across a transition never skips or repeats a date", () => {
    expect(addDays("2026-10-03", 1)).toBe("2026-10-04");
    expect(addDays("2026-10-04", 1)).toBe("2026-10-05");
    expect(addDays("2026-04-04", 1)).toBe("2026-04-05");
    expect(daysBetween("2026-10-01", "2026-10-08")).toBe(7);
    expect(addDays("2026-03-01", -1)).toBe("2026-02-28");
    expect(addDays("2028-02-28", 1)).toBe("2028-02-29");
  });

  it("zonedWallClockToMs round-trips through DST", () => {
    const ms = zonedWallClockToMs(2026, 10, 4, 12, 0, 0, SYD);
    expect(localDateString(ms, SYD)).toBe("2026-10-04");
    expect(zonedParts(ms, SYD).hour).toBe(12);
  });
});

describe("today / yesterday / daysAgo use the viewer's timezone", () => {
  const now = Date.UTC(2026, 9, 8, 14, 30, 0); // 9 Oct 01:30 in Sydney, 8 Oct 07:30 in LA
  it("differ by timezone for the same instant", () => {
    expect(today(now, SYD)).toBe("2026-10-09");
    expect(today(now, LA)).toBe("2026-10-08");
    expect(yesterday(now, SYD)).toBe("2026-10-08");
  });
  it("a workout saved 'now' in Sydney is dated today, not yesterday", () => {
    expect(newTimestamp(now, SYD).date).toBe(today(now, SYD));
    expect(daysAgo(newTimestamp(now, SYD).date, now, SYD)).toBe(0);
  });
});

describe("display of date-only strings never shifts the day", () => {
  it("formats 2026-10-09 as 9 Oct regardless of the process timezone", () => {
    expect(formatDateOnly("2026-10-09", { month: "short", day: "numeric" }, "en-AU")).toMatch(/9/);
    expect(formatDateOnly("2026-10-09", { month: "short", day: "numeric" }, "en-AU")).not.toMatch(/\b8\b/);
  });
  it("returns an empty string for garbage rather than 'Invalid Date'", () => {
    expect(formatDateOnly("nope")).toBe("");
    expect(formatDateOnly(undefined)).toBe("");
  });
});

describe("startOfWeek", () => {
  it("is the preceding Sunday", () => {
    expect(startOfWeek("2026-10-09")).toBe("2026-10-04"); // Friday -> Sunday
    expect(startOfWeek("2026-10-04")).toBe("2026-10-04");
  });
});

describe("workoutInstant — legacy date-only records are never given a fabricated time of day", () => {
  it("prefers completedAt, then startedAt", () => {
    expect(workoutInstant({ date: "2026-10-09", completedAt: "2026-10-08T14:30:00.000Z" }, SYD)).toEqual({ ms: Date.UTC(2026, 9, 8, 14, 30), precision: "instant" });
    expect(workoutInstant({ date: "2026-10-09", startedAt: 1000 }, SYD).precision).toBe("instant");
  });
  it("falls back to local noon of the stored date and says so", () => {
    const r = workoutInstant({ date: "2026-10-09" }, SYD);
    expect(r.precision).toBe("date");
    expect(localDateString(r.ms, SYD)).toBe("2026-10-09");
    expect(zonedParts(r.ms, SYD).hour).toBe(12);
  });
  it("reports no instant for a record with neither", () => {
    expect(workoutInstant({}, SYD).precision).toBe("none");
  });
});

describe("legacyUtcDateMismatch — the dry-run audit for old UTC-sliced dates", () => {
  it("flags a legacy workout whose date equals the UTC slice but differs from the local date", () => {
    const startedAt = Date.UTC(2026, 9, 8, 14, 30, 0);
    expect(legacyUtcDateMismatch({ date: "2026-10-08", startedAt }, SYD)).toEqual({ stored: "2026-10-08", local: "2026-10-09" });
  });
  it("does not touch records that already carry a timeZone, or whose date was not UTC-derived", () => {
    const startedAt = Date.UTC(2026, 9, 8, 14, 30, 0);
    expect(legacyUtcDateMismatch({ date: "2026-10-09", startedAt, timeZone: SYD }, SYD)).toBeNull();
    expect(legacyUtcDateMismatch({ date: "2026-10-07", startedAt }, SYD)).toBeNull();
    expect(legacyUtcDateMismatch({ date: "2026-10-08" }, SYD)).toBeNull();
  });
});

describe("isDateString", () => {
  it("accepts real dates and rejects malformed ones", () => {
    expect(isDateString("2026-10-09")).toBe(true);
    expect(isDateString("2026-1-9")).toBe(false);
    expect(isDateString("2026-10-09T00:00:00Z")).toBe(false);
    expect(isDateString(null)).toBe(false);
  });
});
