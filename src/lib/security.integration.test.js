// Integration tests against the LIVE Supabase project's Row Level Security policies — this is
// the actual security boundary the app relies on, and it cannot be meaningfully unit-tested with
// a mock (a mock would only prove the mock is well-behaved, not that the real policies are).
// Not part of the default `npm test` run (see package.json's "test" vs "test:integration") since
// it creates and deletes real throwaway users against the live project and needs
// SUPABASE_SERVICE_ROLE_KEY — run explicitly with `npm run test:integration`.
//
// Every "attack" here is attempted with a genuinely authenticated (non-admin) client — the same
// access a real signed-in user's browser has, nothing more — proving the protection is enforced
// by Postgres RLS itself, not just by the app's own UI/query patterns.

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env.local");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(
      fs.readFileSync(envPath, "utf8")
        .split("\n")
        .filter((l) => l.includes("=") && !l.startsWith("#"))
        .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
    )
  : process.env;

const hasCredentials = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const d = hasCredentials ? describe : describe.skip;

d("Row Level Security — cross-user authorization", () => {
  let admin, anon;
  let userA, userB; // { id, email, password, client (authenticated as that user) }

  beforeAll(async () => {
    admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });

    const makeUser = async (label) => {
      const email = `asc3end-rls-test-${label}-${Date.now()}@example.com`;
      const password = "TestPass12345!";
      const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
      if (error) throw error;
      const client = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY);
      const { error: signInErr } = await client.auth.signInWithPassword({ email, password });
      if (signInErr) throw signInErr;
      return { id: data.user.id, email, password, client };
    };

    userA = await makeUser("a");
    userB = await makeUser("b");

    // Seed real data for userA the same way the app does, via userA's own authenticated client.
    await userA.client.from("user_data").upsert({ user_id: userA.id, key: "atlas:profile", value: { name: "User A", secret: "A's private data" } });
  }, 30000);

  afterAll(async () => {
    for (const u of [userA, userB]) {
      if (!u) continue;
      await admin.from("user_data").delete().eq("user_id", u.id);
      await admin.from("subscriptions").delete().eq("user_id", u.id);
      await admin.from("feature_usage").delete().eq("user_id", u.id);
      await admin.from("analytics_events").delete().eq("user_id", u.id);
      await admin.auth.admin.deleteUser(u.id).catch(() => {});
    }
  }, 30000);

  it("userB cannot read userA's user_data row by querying it directly", async () => {
    const { data, error } = await userB.client.from("user_data").select("value").eq("user_id", userA.id).eq("key", "atlas:profile").maybeSingle();
    expect(error).toBeNull(); // RLS filters silently, it doesn't error
    expect(data).toBeNull();
  });

  it("userB cannot list userA's rows even with an unfiltered select (RLS scopes the whole query)", async () => {
    const { data, error } = await userB.client.from("user_data").select("*");
    expect(error).toBeNull();
    expect((data || []).every((row) => row.user_id !== userA.id)).toBe(true);
  });

  it("userB cannot overwrite userA's profile via upsert", async () => {
    const { error } = await userB.client.from("user_data").upsert({ user_id: userA.id, key: "atlas:profile", value: { name: "Hacked by B" } });
    // Either the RLS policy rejects the write outright, or it silently affects zero rows —
    // either way userA's data must be provably unchanged afterward.
    const { data: stillA } = await admin.from("user_data").select("value").eq("user_id", userA.id).eq("key", "atlas:profile").maybeSingle();
    expect(stillA.value.name).toBe("User A");
    void error; // not asserted directly — the real assertion is the data integrity check above
  });

  it("userB cannot delete userA's data", async () => {
    await userB.client.from("user_data").delete().eq("user_id", userA.id).eq("key", "atlas:profile");
    const { data: stillThere } = await admin.from("user_data").select("value").eq("user_id", userA.id).eq("key", "atlas:profile").maybeSingle();
    expect(stillThere).not.toBeNull();
  });

  it("userB cannot read userA's subscription row", async () => {
    await admin.from("subscriptions").upsert({ user_id: userA.id, status: "active", stripe_customer_id: "cus_fake" });
    const { data } = await userB.client.from("subscriptions").select("*").eq("user_id", userA.id).maybeSingle();
    expect(data).toBeNull();
  });

  it("CRITICAL: a user cannot self-grant premium by writing their own subscriptions row", async () => {
    // subscriptions only has a SELECT policy for regular users (the webhook, using the service
    // role key, is the only writer) — RLS denies INSERT/UPDATE/DELETE by default when no policy
    // grants them, so this must fail regardless of what status value is attempted.
    const { error } = await userB.client.from("subscriptions").upsert({ user_id: userB.id, status: "active", stripe_customer_id: "cus_selfgranted" });
    expect(error).not.toBeNull();
    const { data: actual } = await admin.from("subscriptions").select("status").eq("user_id", userB.id).maybeSingle();
    expect(actual?.status).not.toBe("active");
  });

  it("a user cannot reset their own free-trial usage counter by writing feature_usage directly", async () => {
    await admin.from("feature_usage").upsert({ user_id: userB.id, feature: "coach", count: 5 });
    const { error } = await userB.client.from("feature_usage").upsert({ user_id: userB.id, feature: "coach", count: 0 });
    expect(error).not.toBeNull();
    const { data: actual } = await admin.from("feature_usage").select("count").eq("user_id", userB.id).eq("feature", "coach").maybeSingle();
    expect(actual.count).toBe(5);
  });

  it("a user cannot insert an analytics event under another user's id", async () => {
    const { error } = await userB.client.from("analytics_events").insert({ user_id: userA.id, name: "fake_event", props: {} });
    expect(error).not.toBeNull();
  });

  it("a user CAN read/write their own data (the policies aren't accidentally blocking legitimate use)", async () => {
    const { error: writeErr } = await userB.client.from("user_data").upsert({ user_id: userB.id, key: "atlas:profile", value: { name: "User B" } });
    expect(writeErr).toBeNull();
    const { data } = await userB.client.from("user_data").select("value").eq("user_id", userB.id).eq("key", "atlas:profile").maybeSingle();
    expect(data.value.name).toBe("User B");
  });
});
