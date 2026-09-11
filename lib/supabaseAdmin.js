import { createClient } from "@supabase/supabase-js";

// Server-only — uses the service_role secret, which bypasses Row Level Security entirely.
// Never import this from anything under src/ (that would ship the secret to the browser).
// Used by API routes to (a) verify a user's access token and (b) write subscription status
// from the Stripe webhook, which runs outside any user's login session.
export const supabaseAdmin = createClient(
  process.env.VITE_SUPABASE_URL,
  process.env.SUPABASE_SERVICE_ROLE_KEY,
  { auth: { autoRefreshToken: false, persistSession: false } }
);
