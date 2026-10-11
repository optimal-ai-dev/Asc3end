// Measures the real latency of the workout-save path against a Supabase project, using a
// throwaway account that is deleted afterwards. Run: node scripts/measure-save-latency.mjs
// Needs VITE_SUPABASE_URL, VITE_SUPABASE_ANON_KEY and SUPABASE_SERVICE_ROLE_KEY in .env.local.
//
// It times the exact call sequence the app used before the save-reliability work (finishWorkout
// did three sequential storage calls, each preceded by a network `auth.getUser()`), against the
// alternatives, so any change to the save architecture is justified by numbers, not guesses.

import { createClient } from "@supabase/supabase-js";
import fs from "fs";

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n")
    .filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const url = env.VITE_SUPABASE_URL;
const admin = createClient(url, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const client = createClient(url, env.VITE_SUPABASE_ANON_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

const email = `asc3end.latency.${Date.now()}@example.com`;
const password = `Lat-${Math.random().toString(36).slice(2)}-Aa1!`;
const N = Number(process.env.RUNS || 12);

const pct = (arr, p) => { const s = [...arr].sort((a, b) => a - b); return s[Math.min(s.length - 1, Math.floor((p / 100) * s.length))]; };
const summarize = (label, arr) => console.log(`${label.padEnd(58)} p50 ${String(Math.round(pct(arr, 50))).padStart(5)} ms   p95 ${String(Math.round(pct(arr, 95))).padStart(5)} ms   max ${String(Math.round(Math.max(...arr))).padStart(5)} ms`);
async function time(fn) { const t = performance.now(); await fn(); return performance.now() - t; }

function fakeWorkouts(n) {
  return Array.from({ length: n }, (_, i) => ({
    id: `w${i}`, date: `2026-09-${String((i % 28) + 1).padStart(2, "0")}`, startedAt: Date.now() - i * 86400000,
    exercises: Array.from({ length: 6 }, (_, j) => ({ name: `Exercise ${j}`, sets: Array.from({ length: 4 }, () => ({ weight: 80, reps: 8, type: "normal" })) })),
  }));
}

let userId;
try {
  const { data: created, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  userId = created.user.id;
  const { error: signErr } = await client.auth.signInWithPassword({ email, password });
  if (signErr) throw signErr;

  const getUserMs = [], getSessionMs = [];
  for (let i = 0; i < N; i++) {
    getUserMs.push(await time(() => client.auth.getUser()));
    getSessionMs.push(await time(() => client.auth.getSession()));
  }

  const upsert = (key, value) => client.from("user_data").upsert({ user_id: userId, key, value, updated_at: new Date().toISOString() });
  const sizes = [1, 50, 200];
  const writeMs = Object.fromEntries(sizes.map((n) => [n, []]));
  for (const n of sizes) {
    const value = fakeWorkouts(n);
    for (let i = 0; i < N; i++) writeMs[n].push(await time(() => upsert("atlas:workouts", value)));
  }

  // The pre-fix finishWorkout sequence: getUser+upsert(workouts), getUser+upsert(profile), getUser+delete(session)
  const oldSequence = [];
  const workouts50 = fakeWorkouts(50);
  for (let i = 0; i < N; i++) {
    oldSequence.push(await time(async () => {
      await client.auth.getUser(); await upsert("atlas:workouts", workouts50);
      await client.auth.getUser(); await upsert("atlas:profile", { name: "x", activePlan: { currentDayIndex: 1 } });
      await client.auth.getUser(); await client.from("user_data").delete().eq("user_id", userId).eq("key", "atlas:session");
    }));
  }
  // Core write only, session id from the local session (no network lookup)
  const coreOnly = [];
  for (let i = 0; i < N; i++) {
    coreOnly.push(await time(async () => { await client.auth.getSession(); await upsert("atlas:workouts", workouts50); }));
  }
  // Read + conditional update (the optimistic-concurrency path used by the new save)
  const cas = [];
  for (let i = 0; i < N; i++) {
    cas.push(await time(async () => {
      const { data } = await client.from("user_data").select("value, updated_at").eq("user_id", userId).eq("key", "atlas:workouts").maybeSingle();
      await client.from("user_data").update({ value: workouts50, updated_at: new Date().toISOString() }).eq("user_id", userId).eq("key", "atlas:workouts").eq("updated_at", data.updated_at).select("updated_at");
    }));
  }

  console.log(`\nSupabase host: ${new URL(url).host}   runs per measurement: ${N}\n`);
  summarize("auth.getUser()  [network round trip]", getUserMs);
  summarize("auth.getSession()  [local]", getSessionMs);
  for (const n of sizes) summarize(`upsert atlas:workouts (${n} workouts, ${Math.round(JSON.stringify(fakeWorkouts(n)).length / 1024)} KB)`, writeMs[n]);
  summarize("OLD finish sequence (3 x getUser + 3 writes, 50 workouts)", oldSequence);
  summarize("Core workouts write only (getSession + 1 upsert)", coreOnly);
  summarize("Read + conditional update (optimistic concurrency)", cas);
} finally {
  if (userId) {
    for (const t of ["user_data", "subscriptions", "feature_usage", "feature_usage_monthly", "analytics_events", "feedback"]) {
      await admin.from(t).delete().eq("user_id", userId).then(() => {}, () => {});
    }
    await admin.auth.admin.deleteUser(userId);
    console.log("\n(throwaway account deleted)");
  }
}
