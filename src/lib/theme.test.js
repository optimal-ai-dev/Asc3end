import { describe, it, expect, beforeEach } from "vitest";
import { getThemePref, setThemePref, resolveTheme, THEME_KEY } from "./theme";

beforeEach(() => {
  localStorage.clear();
  delete document.documentElement.dataset.theme;
  document.head.innerHTML = '<meta name="theme-color" content="#0A120E" />';
});

describe("theme", () => {
  it("defaults to following the system", () => {
    expect(getThemePref()).toBe("system");
    localStorage.setItem(THEME_KEY, "purple");
    expect(getThemePref()).toBe("system");
  });

  it("resolves system to the device preference and pins light or dark", () => {
    expect(resolveTheme("system", true)).toBe("light");
    expect(resolveTheme("system", false)).toBe("dark");
    expect(resolveTheme("dark", true)).toBe("dark");
    expect(resolveTheme("light", false)).toBe("light");
  });

  it("saves the choice, sets data-theme and the browser chrome colour", () => {
    setThemePref("light");
    expect(getThemePref()).toBe("light");
    expect(document.documentElement.dataset.theme).toBe("light");
    expect(document.querySelector('meta[name="theme-color"]').getAttribute("content")).toBe("#F3F6F4");
    setThemePref("system");
    expect(document.documentElement.dataset.theme).toBeUndefined();
  });
});
