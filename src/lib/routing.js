// Pure URL<->tab mapping for the authenticated app shell's routing (App.jsx uses these to sync
// the `tab`/`showProfile` state with the browser URL) — extracted so the mapping itself is
// unit-testable without needing to mount the whole App component.
export const TAB_TO_PATH = { dashboard: "home", train: "train", coach: "coach", nutrition: "food", progress: "progress" };
export const PATH_TO_TAB = { home: "dashboard", train: "train", coach: "coach", food: "nutrition", progress: "progress" };

/** @returns {{tab: string|null, settings: boolean} | null} */
export function parseAppPath(pathname) {
  const match = pathname.match(/^\/app\/([a-z]+)(?:\/([a-z]+))?$/);
  if (!match) return null;
  const [, segment] = match;
  if (segment === "settings") return { tab: null, settings: true };
  const tab = PATH_TO_TAB[segment];
  return tab ? { tab, settings: false } : null;
}

/** Builds the canonical URL path for a given tab/settings/session combination. */
export function buildAppPath({ tab, showProfile, hasActiveSession }) {
  if (showProfile) return "/app/settings";
  const segment = TAB_TO_PATH[tab] || "home";
  return `/app/${segment}${tab === "train" && hasActiveSession ? "/session" : ""}`;
}
