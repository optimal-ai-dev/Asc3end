// Server-only: whether a verified Supabase auth user is one of the app's owners/admins, per
// ADMIN_EMAILS (a comma-separated allowlist set in Vercel env vars). Shared by /api/admin-metrics
// (owner metrics) and /api/claude + /api/usage (owners always get Asc3end+, with no monthly caps,
// without a Stripe subscription). Always pass the user object returned by
// supabaseAdmin.auth.getUser(token) — never an email the client sent — so the check rests on
// Supabase's verified identity, not on anything the caller claims about itself.
//
// Unset/empty ADMIN_EMAILS means nobody is an admin.

export function adminEmailAllowlist() {
  return (process.env.ADMIN_EMAILS || "")
    .split(",")
    // Tolerate values pasted into Vercel with quotes around them ("a@x.com" or 'a@x.com').
    .map((e) => e.trim().replace(/^["']+|["']+$/g, "").trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user) {
  // No separate email_confirmed_at check: Supabase won't issue a session to an unconfirmed email
  // when confirmations are on, and fills it in automatically when they're off, so it adds no
  // protection and could lock a real owner out on accounts where the field isn't populated.
  if (!user?.email) return false;
  return adminEmailAllowlist().includes(user.email.toLowerCase());
}
