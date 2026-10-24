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
    .map((e) => e.trim().toLowerCase())
    .filter(Boolean);
}

export function isAdminUser(user) {
  if (!user?.email) return false;
  // An unconfirmed address hasn't proven ownership of the inbox, so it can't claim admin rights
  // even if it matches the allowlist.
  if (!user.email_confirmed_at) return false;
  return adminEmailAllowlist().includes(user.email.toLowerCase());
}
