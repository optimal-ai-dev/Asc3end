// Durable, per-user local queue for completed workouts that have not been confirmed saved, and a
// local backup of the in-progress session. Both survive reloads, crashes and lost connections;
// both are keyed by user id so one account never sees another's data on a shared device.
//
// Storage is passed in (default: window.localStorage) so this is unit-testable, and every access
// is wrapped: private windows / blocked storage degrade to "no local backup", never an exception.

const PENDING = (uid) => `asc3end:pending-workouts:${uid}`;
const SESSION = (uid) => `asc3end:session-backup:${uid}`;

function defaultStore() {
  try { return typeof window !== "undefined" ? window.localStorage : null; } catch (e) { return null; }
}

function read(store, key) {
  try {
    const raw = store?.getItem(key);
    return raw ? JSON.parse(raw) : null;
  } catch (e) { return null; }
}
function write(store, key, value) {
  try {
    if (value === null || value === undefined) store?.removeItem(key);
    else store?.setItem(key, JSON.stringify(value));
    return true;
  } catch (e) { return false; }
}

export function listPending(uid, store = defaultStore()) {
  const v = read(store, PENDING(uid));
  return Array.isArray(v) ? v.filter((w) => w && w.id) : [];
}

/** Queue (or replace, by id) a completed workout awaiting confirmed save. */
export function enqueuePending(uid, workout, store = defaultStore()) {
  const rest = listPending(uid, store).filter((w) => w.id !== workout.id);
  return write(store, PENDING(uid), [...rest, workout]);
}

export function dequeuePending(uid, ids, store = defaultStore()) {
  const drop = new Set(Array.isArray(ids) ? ids : [ids]);
  const next = listPending(uid, store).filter((w) => !drop.has(w.id));
  return write(store, PENDING(uid), next.length ? next : null);
}

export function saveSessionBackup(uid, session, store = defaultStore()) {
  return write(store, SESSION(uid), session ? { session, savedAt: Date.now() } : null);
}

export function loadSessionBackup(uid, store = defaultStore()) {
  const v = read(store, SESSION(uid));
  return v && v.session ? v : null;
}

/** Which copy of the in-progress session wins: the one touched most recently. */
export function pickNewerSession(remote, local) {
  if (!remote) return local || null;
  if (!local) return remote;
  const r = Number.isFinite(remote.updatedAt) ? remote.updatedAt : remote.startedAt || 0;
  const l = Number.isFinite(local.updatedAt) ? local.updatedAt : local.startedAt || 0;
  return l > r ? local : remote;
}
