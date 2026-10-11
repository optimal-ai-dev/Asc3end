// Reliable persistence for the workout history, independent of React.
//
// Why this exists (measured by scripts/measure-save-latency.mjs): the old finish path rewrote the
// WHOLE `atlas:workouts` array with a blind upsert, then did two more sequential writes, each
// preceded by a network auth lookup, with no timeout. That is ~1.2 s on a good connection, unbounded
// on a bad one, and last-write-wins across tabs/devices (a stale tab silently erased another
// device's workout).
//
// Policy implemented here:
//   * IDEMPOTENT: a workout's id is the session id. Saving the same id again — a double tap, a
//     retry after a timeout, a replay from the offline queue — can never create a second workout.
//   * MERGE, don't overwrite: every write re-reads the server copy and merges by id, so two
//     devices finishing different workouts both survive.
//   * OPTIMISTIC CONCURRENCY: the write is conditional on the row not having changed since it was
//     read (compare-and-set on updated_at). A conflict re-reads and re-merges, up to a few times.
//   * PER-WORKOUT last-writer-wins for edits of the same workout, decided by `updatedAt`.
//     A workout deleted on another device is NOT resurrected by a stale edit; the caller is told.
//   * Failures throw/return — they never silently drop data. Callers keep the unsaved workout in a
//     durable local queue and retry (see pendingQueue.js).

import { listPending, dequeuePending } from "./pendingQueue.js";

export const WORKOUTS_KEY = "atlas:workouts";
const MAX_ATTEMPTS = 4;

const stamp = (w) => (Number.isFinite(w?.updatedAt) ? w.updatedAt : (w?.completedAt ? Date.parse(w.completedAt) || 0 : 0));

/** Union by id. For an id present on both sides the more recently updated copy wins; remote order
 *  is preserved and genuinely new workouts are appended. */
export function mergeWorkouts(remote, incoming) {
  const out = (Array.isArray(remote) ? remote : []).filter((w) => w && typeof w === "object");
  const index = new Map(out.map((w, i) => [w.id, i]));
  for (const w of incoming || []) {
    if (!w || typeof w !== "object" || !w.id) continue;
    if (index.has(w.id)) {
      const i = index.get(w.id);
      if (stamp(w) > stamp(out[i])) out[i] = w;
    } else {
      index.set(w.id, out.length);
      out.push(w);
    }
  }
  return out;
}

const sameJson = (a, b) => JSON.stringify(a) === JSON.stringify(b);

/**
 * Read-modify-write with conflict retry.
 * @param store { getWithVersion(key) -> {value, version}|null, setIfVersion(key, value, version|null) -> "ok"|"conflict" }
 * @param mutate (remoteList) -> newList | { list, result } ; return `null` to abort without writing
 * @returns {{ status: "saved"|"unchanged"|"aborted", workouts: any[], attempts: number, result?: any }}
 */
export async function updateWorkouts(store, mutate, { key = WORKOUTS_KEY, maxAttempts = MAX_ATTEMPTS } = {}) {
  let lastList = [];
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    const current = await store.getWithVersion(key);
    const remote = Array.isArray(current?.value) ? current.value : [];
    lastList = remote;
    const mutated = mutate(remote);
    if (mutated === null) return { status: "aborted", workouts: remote, attempts: attempt };
    const list = Array.isArray(mutated) ? mutated : mutated.list;
    const result = Array.isArray(mutated) ? undefined : mutated.result;
    if (sameJson(list, remote)) return { status: "unchanged", workouts: remote, attempts: attempt, result };
    const outcome = await store.setIfVersion(key, list, current ? current.version : null);
    if (outcome === "ok") return { status: "saved", workouts: list, attempts: attempt, result };
    // "conflict": someone else wrote between our read and write — loop to re-read and re-merge
  }
  const err = new Error("workout_save_conflict");
  err.code = "conflict";
  err.workouts = lastList;
  throw err;
}

/** Idempotently adds (or refreshes) completed workouts. Safe to call any number of times. */
export function saveCompletedWorkouts(store, workouts, opts) {
  return updateWorkouts(store, (remote) => mergeWorkouts(remote, workouts), opts);
}

/** Edits one workout. If it no longer exists remotely (deleted elsewhere) nothing is written. */
export async function editWorkoutSynced(store, id, patch, { now = Date.now(), ...opts } = {}) {
  const res = await updateWorkouts(store, (remote) => {
    if (!remote.some((w) => w.id === id)) return { list: remote, result: "missing" };
    return remote.map((w) => (w.id === id ? { ...w, ...patch, updatedAt: now } : w));
  }, opts);
  return { ...res, missing: res.result === "missing" };
}

export async function deleteWorkoutSynced(store, id, opts) {
  return updateWorkouts(store, (remote) => remote.filter((w) => w.id !== id), opts);
}

/** Wraps a promise with a deadline so the UI can leave "Saving…" and offer a retry. */
export function withTimeout(promise, ms, label = "request") {
  let timer;
  const timeout = new Promise((_, reject) => {
    timer = setTimeout(() => {
      const e = new Error(`${label}_timeout`);
      e.code = "timeout";
      reject(e);
    }, ms);
  });
  return Promise.race([promise, timeout]).finally(() => clearTimeout(timer));
}

/** User-facing classification of a failed save; no workout content or credentials in the message. */
export function describeSaveFailure(err) {
  if (err?.code === "timeout") return "Saving is taking longer than expected — your workout is safe on this device. Check your connection and retry.";
  if (err?.code === "conflict") return "Your history changed on another device while saving. Your workout is still safe here — retry to merge it.";
  if (typeof navigator !== "undefined" && navigator.onLine === false) return "You're offline — your workout is safe on this device and will save when you reconnect.";
  return "Couldn't save your workout. It's safe on this device — check your connection and retry.";
}

/** Replays every queued workout through the idempotent save, removing each from the queue only
 *  after the server confirms it. Returns the ids saved; throws (leaving the queue intact) on failure. */
export async function flushPendingWorkouts(uid, store, queueStore) {
  const queued = listPending(uid, queueStore);
  if (queued.length === 0) return { saved: [], workouts: null };
  const res = await saveCompletedWorkouts(store, queued);
  dequeuePending(uid, queued.map((w) => w.id), queueStore);
  return { saved: queued.map((w) => w.id), workouts: res.workouts };
}
