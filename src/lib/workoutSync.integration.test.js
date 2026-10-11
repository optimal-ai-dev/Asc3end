// Live-database proof of the workout-saving guarantees (audit finding 10), using a throwaway user
// and the REAL compare-and-set adapter (storage.js createSyncStore) against the real Postgres
// table. Two independently signed-in clients stand in for "two devices". Run with
// `npm run test:integration` (needs SUPABASE_SERVICE_ROLE_KEY; creates and deletes its own user).

import { describe, it, expect, beforeAll, afterAll } from "vitest";
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { fileURLToPath } from "url";
import { createSyncStore } from "./storage";
import { saveCompletedWorkouts, editWorkoutSynced, deleteWorkoutSynced, flushPendingWorkouts, WORKOUTS_KEY } from "./workoutSync";
import { enqueuePending, listPending } from "./pendingQueue";

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const envPath = path.resolve(__dirname, "../../.env.local");
const env = fs.existsSync(envPath)
  ? Object.fromEntries(fs.readFileSync(envPath, "utf8").split("\n").filter((l) => l.includes("=") && !l.startsWith("#")).map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; }))
  : process.env;
const hasCredentials = !!(env.VITE_SUPABASE_URL && env.VITE_SUPABASE_ANON_KEY && env.SUPABASE_SERVICE_ROLE_KEY);
const d = hasCredentials ? describe : describe.skip;

const memoryStorage = () => { const m = new Map(); return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k) }; };
const workout = (id) => ({ id, date: "2026-10-09", timeZone: "Australia/Sydney", startedAt: 1, completedAt: "2026-10-09T01:00:00.000Z", exercises: [{ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 30, type: "normal" }] }] });

d("workout saving against the live database", () => {
  let admin, userId, deviceA, deviceB, storeA, storeB;

  beforeAll(async () => {
    admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
    const email = `asc3end-sync-test-${Date.now()}@example.com`;
    const password = "TestPass12345!";
    const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
    if (error) throw error;
    userId = data.user.id;
    const signIn = async () => {
      const c = createClient(env.VITE_SUPABASE_URL, env.VITE_SUPABASE_ANON_KEY, { auth: { persistSession: false, autoRefreshToken: false } });
      const { error: e } = await c.auth.signInWithPassword({ email, password });
      if (e) throw e;
      return c;
    };
    deviceA = await signIn();
    deviceB = await signIn();
    storeA = createSyncStore(deviceA);
    storeB = createSyncStore(deviceB);
  }, 30000);

  afterAll(async () => {
    if (!userId) return;
    await admin.from("user_data").delete().eq("user_id", userId);
    await admin.auth.admin.deleteUser(userId).catch(() => {});
  }, 30000);

  const stored = async () => {
    const { data } = await admin.from("user_data").select("value").eq("user_id", userId).eq("key", WORKOUTS_KEY).maybeSingle();
    return data?.value || [];
  };

  it("first save creates the row; saving the same workout again (double tap / retry) leaves exactly one", async () => {
    await saveCompletedWorkouts(storeA, [workout("S1")]);
    await saveCompletedWorkouts(storeA, [workout("S1")]);
    await Promise.all([saveCompletedWorkouts(storeA, [workout("S1")]), saveCompletedWorkouts(storeB, [workout("S1")])]);
    const rows = await stored();
    expect(rows.filter((w) => w.id === "S1")).toHaveLength(1);
    expect(rows[0].exercises[0].sets).toEqual([{ durationSeconds: 30, type: "normal" }]);
  });

  it("two devices saving different workouts at the same instant both survive (real compare-and-set)", async () => {
    await Promise.all([saveCompletedWorkouts(storeA, [workout("FROM-A")]), saveCompletedWorkouts(storeB, [workout("FROM-B")])]);
    const ids = (await stored()).map((w) => w.id);
    expect(ids).toEqual(expect.arrayContaining(["S1", "FROM-A", "FROM-B"]));
    expect(new Set(ids).size).toBe(ids.length);
  });

  it("a conditional write against a stale version is rejected as a conflict, not applied", async () => {
    const snapshot = await storeA.getWithVersion(WORKOUTS_KEY);
    await saveCompletedWorkouts(storeB, [workout("LATER")]);
    expect(await storeA.setIfVersion(WORKOUTS_KEY, [], snapshot.version)).toBe("conflict");
    expect((await stored()).map((w) => w.id)).toContain("LATER");
  });

  it("interrupted connection -> reconnect -> reload: one correct workout, nothing lost", async () => {
    const disk = memoryStorage();
    const w = workout("INTERRUPTED");
    enqueuePending(userId, w, disk);
    const offline = { getWithVersion: async () => { throw new Error("network down"); }, setIfVersion: async () => { throw new Error("network down"); } };
    await expect(flushPendingWorkouts(userId, offline, disk)).rejects.toThrow();
    expect(listPending(userId, disk)).toHaveLength(1); // still safe locally
    // "reload" + reconnect: replay against the real database, twice
    await flushPendingWorkouts(userId, storeA, disk);
    await flushPendingWorkouts(userId, storeB, disk);
    const rows = (await stored()).filter((x) => x.id === "INTERRUPTED");
    expect(rows).toHaveLength(1);
    expect(rows[0].exercises[0].sets[0].durationSeconds).toBe(30);
    expect(listPending(userId, disk)).toHaveLength(0);
  });

  it("editing 30s -> 45s persists as a duration record, and a delete elsewhere is not resurrected by a stale edit", async () => {
    const res = await editWorkoutSynced(storeA, "S1", { exercises: [{ name: "Plank", trackingType: "isometric_hold", sets: [{ durationSeconds: 45, type: "normal" }] }] });
    expect(res.missing).toBe(false);
    expect((await stored()).find((w) => w.id === "S1").exercises[0].sets[0]).toEqual({ durationSeconds: 45, type: "normal" });
    await deleteWorkoutSynced(storeB, "S1");
    const stale = await editWorkoutSynced(storeA, "S1", { notes: "late" });
    expect(stale.missing).toBe(true);
    expect((await stored()).some((w) => w.id === "S1")).toBe(false);
  });
});
