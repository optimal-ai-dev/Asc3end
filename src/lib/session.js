// Pure helpers for detecting a stale in-progress workout session — extracted for unit testing
// the exact bug class that let a completed workout reopen as active after a refresh.

// True when the restored "active session" is actually a leftover from a workout that was already
// saved into history (its id shows up in `workouts`). This is defense in depth: the real fix is
// that finishing a workout now deletes the atlas:session row instead of failing to clear it
// (see src/lib/storage.js), but this guard means even a session that somehow survives — a
// pre-fix leftover row, a future regression, a sync race — still can't be shown as "in progress"
// once it's provably already been completed.
export function isStaleSession(session, workouts) {
  if (!session || !session.id) return false;
  return (workouts || []).some((w) => w.id === session.id);
}

// Defensive validation for a session object loaded from storage — malformed/truncated data
// (a hand-edited row, a partial write cut off mid-save, a schema from an old app version)
// should degrade to "no active session" rather than crash the app when the UI reads
// session.exercises / session.startedAt etc.
export function isValidSession(session) {
  if (!session || typeof session !== "object") return false;
  if (!session.id || typeof session.id !== "string") return false;
  if (!Array.isArray(session.exercises)) return false;
  if (typeof session.startedAt !== "number" || !Number.isFinite(session.startedAt)) return false;
  return true;
}
