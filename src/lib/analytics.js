import { supabase } from "./supabase";

// Fire-and-forget product analytics — writes directly to Supabase (RLS restricts each row to the
// inserting user, insert-only, no read policy since nothing in-app displays these back). Never
// awaited by callers and never throws, so a failed or slow write can't break or stall a real
// user action. Requires an active session (the analytics_events insert policy checks
// auth.uid() = user_id), so pre-email-confirmation signups won't have an event recorded — that's
// an accepted gap for a client-only, RLS-enforced design rather than a dedicated server endpoint.
export function logEvent(name, props = {}) {
  (async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      if (!session) return;
      await supabase.from("analytics_events").insert({ user_id: session.user.id, name, props });
    } catch (e) { /* analytics must never break the app */ }
  })();
}
