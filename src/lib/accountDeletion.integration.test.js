// Live integration test against the real Supabase project — a mocked test can't catch a genuine
// Postgres foreign-key violation, which is exactly the bug this exists to guard against: multiple
// tables have `user_id uuid references auth.users not null` with the default ON DELETE behavior
// (NO ACTION), so deleting the auth user fails outright if ANY row referencing them is left in
// ANY such table. api/delete-account.js's cleanup list had drifted out of sync with the schema
// more than once (feature_usage_monthly and feedback were both missing) — this test creates a
// real throwaway user, seeds a row in every FK-constrained table, runs the actual cleanup +
// delete sequence, and asserts it succeeds and leaves nothing behind. Not part of the default
// `npm test` run — needs SUPABASE_SERVICE_ROLE_KEY, run via `npm run test:integration`.

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

const hasCredentials = !!(env.VITE_SUPABASE_URL && env.SUPABASE_SERVICE_ROLE_KEY);
const d = hasCredentials ? describe : describe.skip;

d("Account deletion — real FK constraints, not mocks", () => {
  let admin, userId;

  beforeAll(async () => {
    admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `asc3end-deletion-test-${Date.now()}@example.com`;
    const { data, error } = await admin.auth.admin.createUser({ email, password: "TestPass12345!", email_confirm: true });
    if (error) throw error;
    userId = data.user.id;

    // Seed a row in every table that has an FK to auth.users, matching what a real, fairly
    // active account would actually have accumulated.
    await admin.from("user_data").upsert({ user_id: userId, key: "atlas:profile", value: { name: "Deletion Test" } });
    await admin.from("subscriptions").upsert({ user_id: userId, status: "inactive" });
    await admin.from("feature_usage_monthly").upsert({ user_id: userId, feature: "coach", month: "2026-09", count: 3 });
    await admin.from("analytics_events").insert({ user_id: userId, name: "signup_completed", props: {} });
    await admin.from("feedback").insert({ user_id: userId, type: "bug", message: "test row for deletion coverage" });
  }, 30000);

  afterAll(async () => {
    // Best-effort cleanup in case the deletion assertion itself failed mid-test.
    if (!userId) return;
    for (const table of ["user_data", "subscriptions", "feature_usage_monthly", "analytics_events", "feedback"]) {
      await admin.from(table).delete().eq("user_id", userId).catch(() => {});
    }
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }, 30000);

  it("cleaning up every FK-referencing table first lets deleteUser succeed with no foreign-key violation", async () => {
    // Exactly the sequence api/delete-account.js runs.
    for (const table of ["user_data", "subscriptions", "feature_usage", "feature_usage_monthly", "analytics_events", "feedback"]) {
      const { error } = await admin.from(table).delete().eq("user_id", userId);
      expect(error, `cleanup of ${table} should not error`).toBeNull();
    }
    const { error: deleteErr } = await admin.auth.admin.deleteUser(userId);
    expect(deleteErr, "deleteUser should succeed once every referencing row is gone").toBeNull();

    // Confirm the user is actually gone, not just "no error returned".
    const { data: lookup } = await admin.auth.admin.getUserById(userId);
    expect(lookup?.user).toBeFalsy();

    userId = null; // deleted for real — afterAll's best-effort cleanup should no-op
  });
});
