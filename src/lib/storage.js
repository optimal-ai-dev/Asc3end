import { supabase } from "./supabase";

/*
 * Drop-in replacement for the artifact's window.storage API, backed by a real Postgres table
 * in Supabase instead of Claude's sandbox. Same method names/shape as before, so most of your
 * existing loadKey/saveKey calls in App.jsx barely need to change — swap window.storage.get/set
 * for storage.get/set imported from here.
 *
 * Run this SQL once in the Supabase SQL editor to create the backing table:
 *
 *   create table user_data (
 *     user_id uuid references auth.users not null,
 *     key text not null,
 *     value jsonb not null,
 *     updated_at timestamptz default now(),
 *     primary key (user_id, key)
 *   );
 *   alter table user_data enable row level security;
 *   create policy "Users manage their own data" on user_data
 *     for all using (auth.uid() = user_id);
 *
 * That last policy is what enforces "only you can read/write your own rows" at the database
 * level — this is the real security boundary, not anything in the frontend code.
 */
export const storage = {
  async get(key) {
    // Always re-derives the current session's user rather than caching one — this is the actual
    // account-isolation boundary for every read: switching authenticated users (log out, log in
    // as someone else) can never keep serving the previous user's rows, because there is no
    // previous user_id sitting in memory here to reuse.
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const { data, error } = await supabase
      .from("user_data")
      .select("value")
      .eq("user_id", user.id)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { key, value: JSON.stringify(data.value) };
  },

  async set(key, value) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, key, value: parsed, updated_at: new Date().toISOString() });
    if (error) { console.error("storage.set error", error); return null; }
    return { key, value };
  },

  async delete(key) {
    const { data: { user } } = await supabase.auth.getUser();
    if (!user) return null;
    await supabase.from("user_data").delete().eq("user_id", user.id).eq("key", key);
    return { key, deleted: true };
  },
};

/* ------------------------------------------------------------------ */
/* Typed key helpers — JSON (de)serialization + the null->delete fix    */
/* ------------------------------------------------------------------ */

// Reads a stored JSON value back out, or null if it's missing, corrupted, or the read itself
// failed. This is the "malformed stored data cannot crash the app" guarantee: a hand-edited or
// truncated row in user_data (or a network hiccup) degrades to "as if never saved", not a thrown
// exception that takes the rest of the app down with it.
export async function loadKey(key) {
  try {
    const r = await storage.get(key);
    if (!r) return null;
    const parsed = JSON.parse(r.value);
    return parsed;
  } catch (e) {
    return null;
  }
}

// Returns true/false so callers that need to know whether a save actually landed (e.g. finishing
// a workout) can react to failure — most callers still just fire-and-forget this and that's fine.
export async function saveKey(key, value) {
  try {
    // user_data.value is `jsonb not null` — storage.set upserting a JS null (e.g. "clear the
    // active session") always fails the column's NOT NULL constraint and silently no-ops via
    // storage.set's own catch, leaving the stale row in place. Delete the row instead whenever
    // the caller means "clear this key".
    if (value === null || value === undefined) {
      const result = await storage.delete(key);
      return result !== null;
    }
    const result = await storage.set(key, JSON.stringify(value));
    return result !== null;
  } catch (e) {
    console.error("storage error", e);
    return false;
  }
}
