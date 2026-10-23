/* Light / dark appearance. "system" follows the device's prefers-color-scheme; "light" and
   "dark" pin it. The choice is a per-device preference (like a phone's own display setting), so
   it lives in localStorage rather than the synced profile. GlobalStyle reads data-theme on <html>. */
export const THEME_KEY = "asc3end-theme";
export const THEME_OPTIONS = ["system", "light", "dark"];
const THEME_COLOR = { dark: "#0A120E", light: "#F3F6F4" };

export function getThemePref() {
  try {
    const v = localStorage.getItem(THEME_KEY);
    return THEME_OPTIONS.includes(v) ? v : "system";
  } catch {
    return "system";
  }
}

export function resolveTheme(pref, prefersLight = window.matchMedia?.("(prefers-color-scheme: light)").matches) {
  if (pref === "light" || pref === "dark") return pref;
  return prefersLight ? "light" : "dark";
}

export function applyTheme(pref) {
  const root = document.documentElement;
  if (pref === "light" || pref === "dark") root.dataset.theme = pref;
  else delete root.dataset.theme;
  document.querySelector('meta[name="theme-color"]')?.setAttribute("content", THEME_COLOR[resolveTheme(pref)]);
}

export function setThemePref(pref) {
  try { localStorage.setItem(THEME_KEY, pref); } catch { /* private mode: still applies for this visit */ }
  applyTheme(pref);
}

// Keeps the browser chrome colour in step when the device flips between light and dark while
// the app is set to follow it.
export function watchSystemTheme() {
  const mq = window.matchMedia?.("(prefers-color-scheme: light)");
  mq?.addEventListener?.("change", () => { if (getThemePref() === "system") applyTheme("system"); });
}
