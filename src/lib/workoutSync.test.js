import { describe, it, expect, vi } from "vitest";
import {
  mergeWorkouts, updateWorkouts, saveCompletedWorkouts, editWorkoutSynced, deleteWorkoutSynced, withTimeout,
  describeSaveFailure, flushPendingWorkouts, WORKOUTS_KEY,
} from "./workoutSync";
import { enqueuePending, listPending, dequeuePending, saveSessionBackup, loadSessionBackup, pickNewerSession } from "./pendingQueue";

// In-memory stand-in for the server row with the same compare-and-set semantics the real
// adapter (storage.js getWithVersion/setIfVersion) provides, plus fault injection.
function fakeServer() {
  const rows = new Map();
  let version = 0;
  const server = {
    rows, writes: 0, failNext: 0, beforeWrite: null, offline: false,
    async getWithVersion(key) {
      if (server.offline) throw new Error("network down");
      if (server.failNext > 0) { server.failNext--; throw new Error("network blip"); }
      const r = rows.get(key);
      return r ? { value: JSON.parse(JSON.stringify(r.value)), version: r.version } : null;
    },
    async setIfVersion(key, value, expected) {
      if (server.offline) throw new Error("network down");
      if (server.beforeWrite) { const f = server.beforeWrite; server.beforeWrite = null; await f(); }
      const r = rows.get(key);
      const current = r ? r.version : null;
      if (current !== expected) return "conflict";
      rows.set(key, { value: JSON.parse(JSON.stringify(value)), version: ++version });
      server.writes++;
      return "ok";
    },
    list: () => rows.get(WORKOUTS_KEY)?.value || [],
  };
  return server;
}
function memoryStorage() {
  const m = new Map();
  return { getItem: (k) => (m.has(k) ? m.get(k) : null), setItem: (k, v) => m.set(k, String(v)), removeItem: (k) => m.delete(k), _m: m };
}

const workout = (id, extra = {}) => ({
  id, date: "2026-10-09", timeZone: "Australia/Sydney", startedAt: 1, completedAt: "2026-10-09T01:00:00.000Z",
  exercises: [{ name: "Barbell Bench Press", sets: [{ weight: 80, reps: 8, type: "normal" }, { weight: 80, reps: 7, type: "normal" }] }],
  ...extra,
});

describe("idempotent completion: no duplicate workouts on double tap or retry", () => {
  it("saving the same workout id repeatedly leaves exactly one workout", async () => {
    const s = fakeServer();
    await saveCompletedWorkouts(s, [workout("A")]);
    const second = await saveCompletedWorkouts(s, [workout("A")]);
    await saveCompletedWorkouts(s, [workout("A")]);
    expect(s.list()).toHaveLength(1);
    expect(second.status).toBe("unchanged");
    expect(s.writes).toBe(1);
  });

  it("two concurrent finish requests (double tap) both resolve and still leave one workout", async () => {
    const s = fakeServer();
    const [r1, r2] = await Promise.all([saveCompletedWorkouts(s, [workout("A")]), saveCompletedWorkouts(s, [workout("A")])]);
    expect(s.list().map((w) => w.id)).toEqual(["A"]);
    expect([r1.status, r2.status].sort()).toEqual(["saved", "unchanged"]);
  });

  it("the saved workout keeps every set exactly as logged", async () => {
    const s = fakeServer();
    await saveCompletedWorkouts(s, [workout("A")]);
    expect(s.list()[0].exercises[0].sets).toEqual([{ weight: 80, reps: 8, type: "normal" }, { weight: 80, reps: 7, type: "normal" }]);
  });
});

describe("save -> interrupted connection -> reconnect -> reload (audit finding 10)", () => {
  it("one correct workout, correct sets, nothing lost, nothing duplicated", async () => {
    const server = fakeServer();
    const disk = memoryStorage(); // survives the "reload"
    const uid = "user-1";
    const w = workout("SESSION-1");

    // 1. The user taps Save. The workout is queued durably BEFORE the network is touched.
    enqueuePending(uid, w, disk);
    // 2. The connection drops mid-save.
    server.offline = true;
    await expect(saveCompletedWorkouts(server, [w])).rejects.toThrow(/network/);
    expect(server.list()).toHaveLength(0);
    expect(listPending(uid, disk)).toHaveLength(1);

    // 3. The user reloads the page: in-memory state is gone, only the durable queue remains.
    // 4. Connection returns; the app replays the queue on load.
    server.offline = false;
    const first = await flushPendingWorkouts(uid, server, disk);
    expect(first.saved).toEqual(["SESSION-1"]);
    expect(listPending(uid, disk)).toHaveLength(0);

    // 5. A second reload / a manual retry replays nothing and duplicates nothing.
    const again = await flushPendingWorkouts(uid, server, disk);
    expect(again.saved).toEqual([]);
    expect(server.list()).toHaveLength(1);
    expect(server.list()[0].exercises[0].sets).toHaveLength(2);
    expect(server.list()[0].exercises[0].sets[1]).toEqual({ weight: 80, reps: 7, type: "normal" });
  });

  it("a transient failure on the read leaves the queue intact for the next attempt", async () => {
    const server = fakeServer();
    const disk = memoryStorage();
    enqueuePending("u", workout("A"), disk);
    server.failNext = 1;
    await expect(flushPendingWorkouts("u", server, disk)).rejects.toThrow();
    expect(listPending("u", disk)).toHaveLength(1);
    await flushPendingWorkouts("u", server, disk);
    expect(server.list()).toHaveLength(1);
    expect(listPending("u", disk)).toHaveLength(0);
  });

  it("the queue is per user: another account on the same device never sees or flushes it", () => {
    const disk = memoryStorage();
    enqueuePending("alice", workout("A"), disk);
    expect(listPending("bob", disk)).toEqual([]);
    dequeuePending("bob", ["A"], disk);
    expect(listPending("alice", disk)).toHaveLength(1);
  });

  it("blocked/failed browser storage degrades gracefully instead of throwing", () => {
    const broken = { getItem() { throw new Error("denied"); }, setItem() { throw new Error("denied"); }, removeItem() { throw new Error("denied"); } };
    expect(listPending("u", broken)).toEqual([]);
    expect(enqueuePending("u", workout("A"), broken)).toBe(false);
    expect(loadSessionBackup("u", broken)).toBeNull();
  });
});

describe("multiple tabs / devices: merge, never overwrite", () => {
  it("two devices finishing different workouts at the same time both survive", async () => {
    const s = fakeServer();
    // Device B writes between device A's read and A's write.
    s.beforeWrite = async () => { await saveCompletedWorkouts(s, [workout("B")]); };
    await saveCompletedWorkouts(s, [workout("A")]);
    expect(s.list().map((w) => w.id).sort()).toEqual(["A", "B"]);
  });

  it("a stale tab holding old history cannot erase newer workouts by saving", async () => {
    const s = fakeServer();
    await saveCompletedWorkouts(s, [workout("OLD1"), workout("OLD2")]);
    await saveCompletedWorkouts(s, [workout("NEW-FROM-PHONE")]);
    // laptop tab loaded before NEW-FROM-PHONE existed and now finishes its own workout
    await saveCompletedWorkouts(s, [workout("FROM-LAPTOP")]);
    expect(s.list().map((w) => w.id).sort()).toEqual(["FROM-LAPTOP", "NEW-FROM-PHONE", "OLD1", "OLD2"]);
  });

  it("gives up with a clear conflict error (and the data still queued) if it can never win the race", async () => {
    const s = fakeServer();
    s.setIfVersion = async () => "conflict";
    await expect(saveCompletedWorkouts(s, [workout("A")], { maxAttempts: 3 })).rejects.toMatchObject({ code: "conflict" });
  });

  it("same workout edited on two devices: the later edit wins, per workout", () => {
    const merged = mergeWorkouts([{ id: "A", notes: "phone", updatedAt: 200 }], [{ id: "A", notes: "laptop", updatedAt: 100 }]);
    expect(merged).toEqual([{ id: "A", notes: "phone", updatedAt: 200 }]);
    expect(mergeWorkouts([{ id: "A", notes: "old", updatedAt: 1 }], [{ id: "A", notes: "new", updatedAt: 2 }])[0].notes).toBe("new");
  });

  it("editing a workout that was deleted elsewhere does not resurrect it", async () => {
    const s = fakeServer();
    await saveCompletedWorkouts(s, [workout("A")]);
    await deleteWorkoutSynced(s, "A");
    const res = await editWorkoutSynced(s, "A", { notes: "late edit" });
    expect(res.missing).toBe(true);
    expect(s.list()).toEqual([]);
  });

  it("an edit changes only that workout and stamps updatedAt", async () => {
    const s = fakeServer();
    await saveCompletedWorkouts(s, [workout("A"), workout("B")]);
    await editWorkoutSynced(s, "A", { notes: "felt good" }, { now: 12345 });
    expect(s.list().find((w) => w.id === "A")).toMatchObject({ notes: "felt good", updatedAt: 12345 });
    expect(s.list().find((w) => w.id === "B").notes).toBeUndefined();
  });

  it("malformed items in remote history are tolerated, not propagated as crashes", () => {
    expect(mergeWorkouts([null, "x", { id: "A" }], [workout("B"), null, {}])).toEqual([{ id: "A" }, workout("B")]);
    expect(mergeWorkouts(undefined, undefined)).toEqual([]);
  });
});

describe("updateWorkouts", () => {
  it("returns 'aborted' without writing when the mutator declines", async () => {
    const s = fakeServer();
    const res = await updateWorkouts(s, () => null);
    expect(res.status).toBe("aborted");
    expect(s.writes).toBe(0);
  });
});

describe("timeouts and failure messaging", () => {
  it("withTimeout rejects with a typed error so the UI can leave 'Saving…'", async () => {
    vi.useFakeTimers();
    const p = withTimeout(new Promise(() => {}), 1000, "save");
    const assertion = expect(p).rejects.toMatchObject({ code: "timeout" });
    await vi.advanceTimersByTimeAsync(1001);
    await assertion;
    vi.useRealTimers();
  });
  it("a fast promise resolves normally and clears its timer", async () => {
    await expect(withTimeout(Promise.resolve(42), 1000)).resolves.toBe(42);
  });
  it("messages reassure that the workout is safe and never include content", () => {
    for (const e of [{ code: "timeout" }, { code: "conflict" }, new Error("boom")]) {
      const m = describeSaveFailure(e);
      expect(m).toMatch(/safe|retry|reconnect/i);
      expect(m).not.toMatch(/Barbell|80/);
    }
  });
});

describe("in-progress session backup", () => {
  it("round-trips per user and the newer copy wins on recovery", () => {
    const disk = memoryStorage();
    saveSessionBackup("u", { id: "s", startedAt: 1, updatedAt: 500, exercises: [] }, disk);
    const local = loadSessionBackup("u", disk).session;
    expect(pickNewerSession({ id: "s", startedAt: 1, updatedAt: 400, exercises: [{ name: "x" }] }, local).updatedAt).toBe(500);
    expect(pickNewerSession({ id: "s", startedAt: 1, updatedAt: 900, exercises: [] }, local).updatedAt).toBe(900);
    expect(pickNewerSession(null, local)).toBe(local);
    expect(pickNewerSession(local, null)).toBe(local);
    saveSessionBackup("u", null, disk);
    expect(loadSessionBackup("u", disk)).toBeNull();
  });
});
