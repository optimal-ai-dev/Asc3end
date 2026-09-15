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

// Public legal/support pages — genuinely stable, crawlable, bookmarkable URLs, independent of
// auth state and independent of the /app/* authenticated-shell routes above. Previously these
// pages only existed as in-memory React state (set by clicking a Landing-page footer link), so a
// direct navigation or refresh to e.g. /privacy fell through to whatever the top-level render
// logic did by default (the marketing landing page, or the authenticated app shell if signed in)
// with the URL's own path completely ignored. PUBLIC_PATH_TO_LEGAL_DOC is the fix: a real,
// bidirectional mapping between a stable path and a LEGAL_COPY key (see src/lib/legal.js).
export const PUBLIC_PATH_TO_LEGAL_DOC = {
  "/privacy": "privacy",
  "/terms": "terms",
  "/health-disclaimer": "disclaimer",
  "/ai-limitations": "aiLimitations",
  "/subscription-terms": "subscriptionTerms",
  "/refund-policy": "refundPolicy",
  "/support": "support",
  "/contact": "contact",
};
export const LEGAL_DOC_TO_PUBLIC_PATH = Object.fromEntries(
  Object.entries(PUBLIC_PATH_TO_LEGAL_DOC).map(([path, docKey]) => [docKey, path])
);

/** @returns {string|null} the LEGAL_COPY key for a public legal path, or null if the path isn't one. */
export function parsePublicLegalPath(pathname) {
  return PUBLIC_PATH_TO_LEGAL_DOC[pathname] || null;
}

/** @returns {string} the stable public URL for a given LEGAL_COPY key, "/" if the key is unknown. */
export function buildPublicLegalPath(docKey) {
  return LEGAL_DOC_TO_PUBLIC_PATH[docKey] || "/";
}
