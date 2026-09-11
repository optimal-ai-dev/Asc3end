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

const email = `ping3-${Date.now()}@example.com`;
const password = "Ping3-Test-123!";

const { data: created } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
const { data: signedIn } = await anon.auth.signInWithPassword({ email, password });

const res = await fetch("https://asc3end.vercel.app/api/debug-stripe-ping-temp", {
  headers: { Authorization: `Bearer ${signedIn.session.access_token}` },
});
console.log(JSON.stringify(await res.json(), null, 2));

await admin.auth.admin.deleteUser(created.user.id);
