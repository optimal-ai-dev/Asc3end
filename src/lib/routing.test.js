import { describe, it, expect } from "vitest";
import { parseAppPath, buildAppPath, TAB_TO_PATH, PATH_TO_TAB } from "./routing";

describe("parseAppPath", () => {
  it("parses every known tab route", () => {
    expect(parseAppPath("/app/home")).toEqual({ tab: "dashboard", settings: false });
    expect(parseAppPath("/app/train")).toEqual({ tab: "train", settings: false });
    expect(parseAppPath("/app/coach")).toEqual({ tab: "coach", settings: false });
    expect(parseAppPath("/app/food")).toEqual({ tab: "nutrition", settings: false });
    expect(parseAppPath("/app/progress")).toEqual({ tab: "progress", settings: false });
  });

  it("parses the settings route", () => {
    expect(parseAppPath("/app/settings")).toEqual({ tab: null, settings: true });
  });

  it("parses the active-workout sub-route as the train tab", () => {
    expect(parseAppPath("/app/train/session")).toEqual({ tab: "train", settings: false });
  });

  it("returns null for an old/unknown/bookmarked link — never crashes, never produces a blank page", () => {
    expect(parseAppPath("/some-old-bookmarked-link")).toBeNull();
    expect(parseAppPath("/")).toBeNull();
    expect(parseAppPath("/app/nonexistent")).toBeNull();
    expect(parseAppPath("/app/")).toBeNull();
    expect(parseAppPath("")).toBeNull();
  });
});

describe("buildAppPath", () => {
  it("builds the settings path when showProfile is true, regardless of tab", () => {
    expect(buildAppPath({ tab: "train", showProfile: true, hasActiveSession: false })).toBe("/app/settings");
  });

  it("builds each tab's plain path when there's no active session", () => {
    for (const [tab, segment] of Object.entries(TAB_TO_PATH)) {
      expect(buildAppPath({ tab, showProfile: false, hasActiveSession: false })).toBe(`/app/${segment}`);
    }
  });

  it("appends /session only for the train tab with an active session", () => {
    expect(buildAppPath({ tab: "train", showProfile: false, hasActiveSession: true })).toBe("/app/train/session");
    expect(buildAppPath({ tab: "coach", showProfile: false, hasActiveSession: true })).toBe("/app/coach");
  });

  it("round-trips through parseAppPath for every tab", () => {
    for (const tab of Object.keys(TAB_TO_PATH)) {
      const path = buildAppPath({ tab, showProfile: false, hasActiveSession: false });
      expect(parseAppPath(path).tab).toBe(tab);
    }
  });
});

describe("TAB_TO_PATH / PATH_TO_TAB", () => {
  it("are exact inverses of each other", () => {
    for (const [tab, segment] of Object.entries(TAB_TO_PATH)) {
      expect(PATH_TO_TAB[segment]).toBe(tab);
    }
  });
});
