import { supabase } from "./supabase";

// Fire-and-forget product analytics — writes directly to Supabase (RLS restricts each row to the
// inserting user, insert-only, no read policy since nothing in-app displays these back). Never
// awaited by callers and never throws, so a failed or slow write can't break or stall a real
// user action. Requires an active session (the analytics_events insert policy checks
// auth.uid() = user_id), so pre-email-confirmation signups won't have an event recorded — that's
// an accepted gap for a client-only, RLS-enforced design rather than a dedicated server endpoint.

// The full catalog of events this app emits, with the shape of props each one carries (JSDoc,
// since this project is plain JS) — kept in one place so "what do we track" is answerable by
// reading this file instead of grepping every logEvent() call site. EVENT_NAMES also doubles as
// a runtime allow-list: logEvent() on an unlisted name is a no-op in production (dev-only warning)
// rather than silently writing an uncataloged event nobody documented.
//
// @typedef {
//   "signup_completed" | "onboarding_completed" |
//   "plan_generated" | "plan_activated" | "plan_edited" |
//   "workout_started" | "first_set_logged" | "workout_completed" |
//   "coach_message_sent" | "food_logged" |
//   "paywall_viewed" | "checkout_started" | "checkout_failed" | "subscription_activated"
// } EventName
export const EVENT_NAMES = new Set([
  "signup_completed",       // {} — account created (email confirmation may still be pending)
  "onboarding_completed",   // { goal, experience, trainingDays }
  "plan_generated",         // { trainingDays, coachingStyle }
  "plan_activated",         // { days }
  "plan_edited",            // { days }
  "workout_started",        // { planned }
  "first_set_logged",       // { exercise } — the athlete's very first logged set, ever
  "workout_completed",      // { exerciseCount, setCount, planned }
  "coach_message_sent",     // { isRetry }
  "food_logged",            // { count }
  "paywall_viewed",         // { feature }
  "checkout_started",       // { plan, trial }
  "checkout_failed",        // { reason }
  "subscription_activated", // { status }
]);

// Defense in depth: even if a future call site accidentally passes something sensitive (an
// email, a name, a raw token), strip it before it ever leaves the browser — analytics props
// should only ever be small counts, booleans, or short category strings, never anything that
// identifies or describes the person beyond their user_id (which RLS already scopes access to).
const SENSITIVE_KEY_PATTERN = /email|password|token|secret|key|phone|address|ssn|card|name$/i;
const EMAIL_PATTERN = /[^\s@]+@[^\s@]+\.[^\s@]+/;

function sanitizeProps(props) {
  const clean = {};
  for (const [k, v] of Object.entries(props || {})) {
    if (SENSITIVE_KEY_PATTERN.test(k)) continue;
    if (typeof v === "string" && (EMAIL_PATTERN.test(v) || v.length > 200)) continue;
    if (v !== null && typeof v === "object") continue; // only flat primitives — no nested PII surfaces
    clean[k] = v;
  }
  return clean;
}

/** @param {EventName} name */
export function logEvent(name, props = {}) {
  if (!EVENT_NAMES.has(name)) {
    if (import.meta.env.DEV) console.warn(`logEvent: "${name}" is not in the EVENT_NAMES catalog — add it to src/lib/analytics.js`);
    return;
  }
  const safeProps = sanitizeProps(props);
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from("analytics_events").insert({ user_id: session.user.id, name, props: safeProps });
    } catch (e) { /* analytics must never break the app */ }
  })();
}
