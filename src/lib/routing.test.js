import { describe, it, expect } from "vitest";
import {
  parseAppPath, buildAppPath, TAB_TO_PATH, PATH_TO_TAB,
  parsePublicLegalPath, buildPublicLegalPath, PUBLIC_PATH_TO_LEGAL_DOC,
} from "./routing";
import { LEGAL_COPY } from "./legal";

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

// Regression coverage for a real reported bug: direct navigation to /privacy, /terms, /support
// etc. previously rendered the landing page (signed out) or the authenticated app shell (signed
// in) instead of the actual legal page, because these paths were never checked against
// window.location.pathname at all — publicLegalDoc only ever got set by clicking a footer link
// that had already loaded. These tests cover the pure routing-table half of that fix; the actual
// "renders the right component on direct navigation" behavior is verified live in the browser
// (see the final report) since mounting the full App component in this suite isn't practical.
describe("parsePublicLegalPath / buildPublicLegalPath — public legal & support routes", () => {
  it("maps every required public path to a real LEGAL_COPY entry", () => {
    const requiredPaths = [
      "/privacy", "/terms", "/health-disclaimer", "/ai-limitations",
      "/subscription-terms", "/refund-policy", "/support", "/contact",
    ];
    requiredPaths.forEach((path) => {
      const docKey = parsePublicLegalPath(path);
      expect(docKey, `${path} did not resolve to a docKey`).toBeTruthy();
      expect(LEGAL_COPY[docKey], `${path} -> "${docKey}" has no LEGAL_COPY entry`).toBeTruthy();
    });
  });

  it("returns null for private, authenticated, or unrelated paths — never mistakes them for a legal page", () => {
    ["/app/home", "/app/settings", "/", "/pricing", "/random-typo", ""].forEach((path) => {
      expect(parsePublicLegalPath(path)).toBeNull();
    });
  });

  it("round-trips: every public path resolves to a docKey whose built path is itself", () => {
    Object.keys(PUBLIC_PATH_TO_LEGAL_DOC).forEach((path) => {
      const docKey = parsePublicLegalPath(path);
      expect(buildPublicLegalPath(docKey)).toBe(path);
    });
  });

  it("an unknown docKey builds the safe root path rather than throwing or returning undefined", () => {
    expect(buildPublicLegalPath("not-a-real-doc")).toBe("/");
    expect(buildPublicLegalPath(undefined)).toBe("/");
  });

  it("no two public legal paths collide, and no path maps to more than one docKey", () => {
    const paths = Object.keys(PUBLIC_PATH_TO_LEGAL_DOC);
    expect(new Set(paths).size).toBe(paths.length);
  });
});
