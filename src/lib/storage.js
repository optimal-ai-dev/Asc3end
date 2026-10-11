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
// Resolves the signed-in user's id from the locally held session — NOT a network call. The old
// code called `auth.getUser()` before every read and write, which is a full round trip to the auth
// server each time (measured ~200 ms; the three writes in finishing a workout paid it three times
// before doing any real work — see scripts/measure-save-latency.mjs). The id still comes from the
// current session on every call (nothing is cached across calls, so switching accounts can never
// serve the previous user's rows), and the database enforces ownership with RLS regardless.
// Falls back to the network lookup only if there is no local session to read.
async function userIdFor(client) {
  if (typeof client.auth.getSession === "function") {
    const { data } = await client.auth.getSession();
    if (data?.session?.user?.id) return data.session.user.id;
  }
  const { data: { user } } = await client.auth.getUser();
  return user?.id ?? null;
}
const currentUserId = () => userIdFor(supabase);

export const storage = {
  async get(key) {
    // Always re-derives the current session's user rather than caching one — this is the actual
    // account-isolation boundary for every read: switching authenticated users (log out, log in
    // as someone else) can never keep serving the previous user's rows, because there is no
    // previous user_id sitting in memory here to reuse.
    const uid = await currentUserId();
    if (!uid) return null;
    const { data, error } = await supabase
      .from("user_data")
      .select("value")
      .eq("user_id", uid)
      .eq("key", key)
      .maybeSingle();
    if (error || !data) return null;
    return { key, value: JSON.stringify(data.value) };
  },

  async set(key, value) {
    const uid = await currentUserId();
    if (!uid) return null;
    const user = { id: uid };
    const parsed = typeof value === "string" ? JSON.parse(value) : value;
    const { error } = await supabase
      .from("user_data")
      .upsert({ user_id: user.id, key, value: parsed, updated_at: new Date().toISOString() });
    if (error) { console.error("storage.set error", error); return null; }
    return { key, value };
  },

  async delete(key) {
    const uid = await currentUserId();
    if (!uid) return null;
    await supabase.from("user_data").delete().eq("user_id", uid).eq("key", key);
    return { key, deleted: true };
  },
};

/* ------------------------------------------------------------------ */
/* Conflict-safe access for data that several tabs/devices can edit    */
/* ------------------------------------------------------------------ */
// Optimistic concurrency without a schema change: a row's `updated_at` is its version. A write is
// only applied if the row still has the version that was read; otherwise "conflict" is returned
// and the caller re-reads and re-merges (see workoutSync.js). Errors THROW so callers can keep the
// data queued and retry instead of mistaking a failure for success.
export function createSyncStore(client) {
  return {
    async getWithVersion(key) {
      const uid = await userIdFor(client);
      if (!uid) throw new Error("not_signed_in");
      const { data, error } = await client
        .from("user_data")
        .select("value, updated_at")
        .eq("user_id", uid)
        .eq("key", key)
        .maybeSingle();
      if (error) throw error;
      return data ? { value: data.value, version: data.updated_at } : null;
    },

    async setIfVersion(key, value, expectedVersion) {
      const uid = await userIdFor(client);
      if (!uid) throw new Error("not_signed_in");
      const updated_at = new Date().toISOString();
      if (expectedVersion == null) {
        const { error } = await client.from("user_data").insert({ user_id: uid, key, value, updated_at });
        if (!error) return "ok";
        if (error.code === "23505") return "conflict"; // someone created the row first
        throw error;
      }
      const { data, error } = await client
        .from("user_data")
        .update({ value, updated_at })
        .eq("user_id", uid)
        .eq("key", key)
        .eq("updated_at", expectedVersion)
        .select("updated_at");
      if (error) throw error;
      return Array.isArray(data) && data.length > 0 ? "ok" : "conflict";
    },
  };
}

export const syncStore = createSyncStore(supabase);

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
