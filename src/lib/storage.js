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
