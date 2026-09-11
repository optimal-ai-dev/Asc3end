// A small Sentry-shaped abstraction so the rest of the app never imports @sentry/react directly
// — it calls initErrorMonitoring()/captureException()/captureMessage() from here, and this file
// decides what actually happens with that. With no VITE_SENTRY_DSN configured (the default for
// local dev and until the app owner sets one up), every call degrades to a console log and the
// app keeps working exactly as before — no remote reporting, no crash, no dependency on Sentry
// being reachable. @sentry/react itself is only ever dynamically imported (never in the main
// bundle) and only when a DSN is actually present, so people running without it pay no cost.

const dsn = import.meta.env.VITE_SENTRY_DSN;
let sentryModule = null; // set once initErrorMonitoring() has lazy-loaded it

export async function initErrorMonitoring() {
  if (!dsn) return;
  try {
    const Sentry = await import("@sentry/react");
    Sentry.init({
      dsn,
      environment: import.meta.env.MODE,
      tracesSampleRate: 0, // errors only — no performance/tracing spend without deciding that separately
      // Never send request bodies/headers or breadcrumb-captured console.log arguments — workout,
      // nutrition, and profile data can appear in state that ends up in a breadcrumb otherwise.
      sendDefaultPii: false,
      beforeBreadcrumb: (breadcrumb) => (breadcrumb.category === "console" ? null : breadcrumb),
    });
    sentryModule = Sentry;
  } catch (e) {
    // A failed Sentry init (bad DSN, network-blocked, package missing) must never break the app.
    console.warn("error monitoring init failed", e);
  }
}

/** @param {Error} error @param {Record<string, unknown>} [context] */
export function captureException(error, context) {
  if (sentryModule) {
    sentryModule.captureException(error, context ? { extra: context } : undefined);
  } else {
    console.error("[captured]", error, context || "");
  }
}

/** @param {string} message */
export function captureMessage(message) {
  if (sentryModule) {
    sentryModule.captureMessage(message);
  } else {
    console.warn("[captured]", message);
  }
}
