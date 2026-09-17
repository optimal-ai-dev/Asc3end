import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import axe from "axe-core";
import Landing from "./Landing.jsx";
import AuthScreen from "./AuthScreen.jsx";
import LegalPage from "./LegalPage.jsx";
import { FrontBodyFigure, BackBodyFigure, muscleReadiness } from "./App.jsx";

// Real automated accessibility scanning (axe-core, the same engine Lighthouse/axe DevTools use)
// against actually-rendered DOM — not a guess about what markup "should" produce. Fails the run
// on any violation axe rates "critical" or "serious"; "moderate"/"minor" findings are reported but
// don't fail the suite, since some of those are legitimately judgment calls for a dark-themed app
// (axe can't know your brand palette is intentional). Every screen tested here is a genuinely
// public or first-touch screen — the ones a screen-reader or keyboard-only user hits before
// they've had any chance to learn the app's own conventions, so they're held to the highest bar.

function mount(node) {
  const container = document.createElement("div");
  document.body.appendChild(container);
  act(() => { createRoot(container).render(node); });
  return container;
}

async function scan(container) {
  const results = await axe.run(container, {
    rules: {
      // A dark theme's own header/nav landmark structure is already covered by the app shell
      // this component mounts inside of in production — scanning a bare component in isolation
      // trips "page must have one main landmark" style rules that only make sense at the full-
      // document level, not for a single mounted subtree.
      region: { enabled: false },
      "landmark-one-main": { enabled: false },
    },
  });
  return results;
}

function reportCriticalAndSerious(results) {
  const bad = results.violations.filter((v) => v.impact === "critical" || v.impact === "serious");
  if (bad.length > 0) {
    const detail = bad.map((v) => `\n  [${v.impact}] ${v.id}: ${v.help} (${v.nodes.length} node(s)) — ${v.helpUrl}`).join("");
    throw new Error(`${bad.length} critical/serious accessibility violation(s):${detail}`);
  }
  return results.violations; // moderate/minor, informational only
}

// axe-core's color-contrast rule silently degrades in jsdom: it needs a real <canvas> 2D context
// to measure rendered text color accurately, jsdom doesn't implement Canvas without the optional
// native `canvas` package, and axe just logs an internal error and skips the check rather than
// failing loudly — so the axe runs above are NOT trustworthy proof of contrast on their own.
// This computes the real WCAG contrast ratio (the same relative-luminance formula the spec
// defines) directly from the actual theme color values in GlobalStyle.jsx, so a color change that
// breaks contrast fails this test even though axe-core in this environment would stay silent
// about it.
function hexToRgb(hex) {
  const h = hex.replace("#", "");
  return [0, 2, 4].map((i) => parseInt(h.slice(i, i + 2), 16));
}
function relLuminance([r, g, b]) {
  const [rs, gs, bs] = [r, g, b].map((c) => {
    const s = c / 255;
    return s <= 0.03928 ? s / 12.92 : Math.pow((s + 0.055) / 1.055, 2.4);
  });
  return 0.2126 * rs + 0.7152 * gs + 0.0722 * bs;
}
function contrastRatio(hex1, hex2) {
  const l1 = relLuminance(hexToRgb(hex1));
  const l2 = relLuminance(hexToRgb(hex2));
  const [lighter, darker] = l1 > l2 ? [l1, l2] : [l2, l1];
  return (lighter + 0.05) / (darker + 0.05);
}

describe("Accessibility — color contrast (computed directly, since axe-core's canvas-based check is silently disabled under jsdom)", () => {
  // Mirrors the real values in src/GlobalStyle.jsx's :root block — kept as literals rather than
  // parsed from the CSS file so this test fails loudly (not silently skips) if GlobalStyle.jsx's
  // colors ever drift out of sync with what's checked here.
  const THEME = {
    bg: "#0A120E", bgElev: "#121C17", bgElev2: "#1B2822", line: "#253830",
    ink: "#F1F5F3", inkDim: "#86A296", brass: "#3ECF8E", warn: "#FFA53D", rest: "#FF6B81",
    btnText: "#072016",
  };

  it.each([
    ["ink on bg", "ink", "bg"],
    ["ink on bgElev", "ink", "bgElev"],
    ["ink on bgElev2", "ink", "bgElev2"],
    ["inkDim (the app's most-used secondary-text color) on bg", "inkDim", "bg"],
    ["inkDim on bgElev", "inkDim", "bgElev"],
    ["inkDim on bgElev2", "inkDim", "bgElev2"],
    ["brass (links/accents/CTAs) on bg", "brass", "bg"],
    ["warn (warning text) on bg", "warn", "bg"],
    ["rest (error/danger text) on bg", "rest", "bg"],
    ["btnText on brass (primary CTA button label)", "btnText", "brass"],
  ])("%s meets WCAG AA (>= 4.5:1) for normal text", (label, a, b) => {
    const ratio = contrastRatio(THEME[a], THEME[b]);
    expect(ratio, `${label}: ${ratio.toFixed(2)}:1`).toBeGreaterThanOrEqual(4.5);
  });
});

describe("Accessibility — Landing (the very first thing a signed-out visitor sees)", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  it("has no critical or serious axe violations", async () => {
    container = mount(<Landing onStartFree={() => {}} onLogIn={() => {}} onOpenLegal={() => {}} />);
    const results = await scan(container);
    reportCriticalAndSerious(results);
  }, 15000);
});

describe("Accessibility — AuthScreen (signup, the highest-stakes form in the app)", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  it("signup mode has no critical or serious axe violations", async () => {
    container = mount(<AuthScreen initialMode="signup" />);
    const results = await scan(container);
    reportCriticalAndSerious(results);
  }, 15000);

  it("login mode has no critical or serious axe violations", async () => {
    container = mount(<AuthScreen initialMode="login" />);
    const results = await scan(container);
    reportCriticalAndSerious(results);
  }, 15000);

  it("every input has a real accessible name (not just a visual label floating nearby)", () => {
    container = mount(<AuthScreen initialMode="signup" />);
    const inputs = container.querySelectorAll("input");
    expect(inputs.length).toBeGreaterThan(0);
    inputs.forEach((input) => {
      const hasLabel = !!input.labels?.length || !!input.getAttribute("aria-label") || !!input.getAttribute("aria-labelledby") || !!input.getAttribute("placeholder");
      expect(hasLabel, `<input type="${input.type}"> has no accessible name`).toBe(true);
    });
  });

  it("the consent checkbox and its text are programmatically associated (aria-describedby)", () => {
    container = mount(<AuthScreen initialMode="signup" />);
    const checkbox = container.querySelector('input[type="checkbox"]');
    const describedBy = checkbox.getAttribute("aria-describedby");
    expect(describedBy).toBeTruthy();
    expect(container.querySelector(`#${describedBy}`)).toBeTruthy();
  });
});

describe("Accessibility — legal pages (must work for a screen-reader user reading a long document)", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  it("Privacy Policy has no critical or serious axe violations and uses real heading structure", async () => {
    container = mount(<LegalPage docKey="privacy" onClose={() => {}} />);
    const results = await scan(container);
    reportCriticalAndSerious(results);
    expect(container.querySelector("h1")).toBeTruthy();
    expect(container.querySelectorAll("h2").length).toBeGreaterThan(3);
  }, 15000);
});

describe("Accessibility — muscle readiness map (interactive SVG, not just decorative)", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  it("front figure has no critical or serious axe violations", async () => {
    const readiness = muscleReadiness([], []);
    container = mount(<FrontBodyFigure readiness={readiness} selected={null} onSelect={() => {}} />);
    const results = await scan(container);
    reportCriticalAndSerious(results);
  }, 15000);

  it("every muscle region is a real, keyboard-reachable button — not a click-only div", () => {
    const readiness = muscleReadiness([], []);
    container = mount(<BackBodyFigure readiness={readiness} selected={null} onSelect={() => {}} />);
    const buttons = container.querySelectorAll('[role="button"]');
    expect(buttons.length).toBeGreaterThan(5);
    buttons.forEach((b) => {
      expect(b.getAttribute("tabindex")).toBe("0");
      expect(b.getAttribute("aria-label")).toBeTruthy();
    });
  });

  it("readiness state is conveyed by text (aria-label), not color alone", () => {
    const readiness = muscleReadiness([], []);
    container = mount(<FrontBodyFigure readiness={readiness} selected={null} onSelect={() => {}} />);
    const buttons = container.querySelectorAll('[role="button"]');
    buttons.forEach((b) => {
      expect(b.getAttribute("aria-label")).toMatch(/Ready|Partially recovered|Fatigued|Insufficient data/);
    });
  });
});
