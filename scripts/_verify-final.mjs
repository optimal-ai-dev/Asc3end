// Temporary diagnostic script — deleted after use.
import { createClient } from "@supabase/supabase-js";
import { readFileSync } from "fs";

const envText = readFileSync(new URL("../.env.local", import.meta.url), "utf-8");
const env = {};
for (const line of envText.split("\n")) {
  const t = line.trim();
  if (!t || t.startsWith("#")) continue;
  const eq = t.indexOf("=");
  if (eq === -1) continue;
  env[t.slice(0, eq).trim()] = t.slice(eq + 1).trim();
}

const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const anon = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `verify-final-${Date.now()}@example.com`;
const password = "Verify-Final-Test-123!";

const { data: created, error: createErr } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
if (createErr) { console.error("createUser failed:", createErr); process.exit(1); }

const { data: signedIn, error: signInErr } = await anon.auth.signInWithPassword({ email, password });
if (signInErr) { console.error("signIn failed:", signInErr); process.exit(1); }

const res = await fetch("https://asc3end.vercel.app/api/create-checkout-session", {
  method: "POST",
  headers: { "Content-Type": "application/json", Authorization: `Bearer ${signedIn.session.access_token}` },
});
console.log("Response status:", res.status);
const text = await res.text();
console.log("Response body:", text);

await admin.auth.admin.deleteUser(created.user.id);
console.log("Test user deleted.");
