// Timezone policy (single source of truth — nothing else in the app may derive a calendar date
// with `toISOString().slice(0, 10)`, which is the UTC date and is wrong for anyone not at UTC+0).
//
// 1. A *training date* / *log date* is a plain "YYYY-MM-DD" string: the calendar date on the
//    user's own wall clock, in the IANA timezone of the device when the event happened.
// 2. A workout's training date is the local date of when it STARTED (a session that runs past
//    midnight still belongs to the day it began). It stores its own `timeZone`, `startedAt`
//    (epoch ms) and `completedAt` (ISO instant) so the date can always be re-derived or audited.
// 3. Date-only strings are never run through `new Date("YYYY-MM-DD")` for display or arithmetic
//    (that parses as UTC midnight and renders as the previous day west of UTC). All date-string
//    arithmetic here uses UTC *component* math, which has no DST edge cases by construction.
// 4. Legacy records (saved before this policy) keep their stored `date` untouched. They are never
//    silently shifted; scripts/migrate-workout-dates.mjs can report/correct provable cases.

export function getTimeZone() {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || "UTC";
  } catch (e) {
    return "UTC";
  }
}

const partsCache = new Map();
function formatterFor(timeZone) {
  let f = partsCache.get(timeZone);
  if (!f) {
    f = new Intl.DateTimeFormat("en-US", {
      timeZone, hourCycle: "h23", year: "numeric", month: "2-digit", day: "2-digit",
      hour: "2-digit", minute: "2-digit", second: "2-digit",
    });
    partsCache.set(timeZone, f);
  }
  return f;
}

function toMs(instant) {
  if (instant instanceof Date) return instant.getTime();
  if (typeof instant === "number") return instant;
  return new Date(instant).getTime();
}

/** Wall-clock components of an instant in `timeZone`. */
export function zonedParts(instant, timeZone = getTimeZone()) {
  const ms = toMs(instant);
  if (!Number.isFinite(ms)) return null;
  const parts = {};
  for (const p of formatterFor(timeZone).formatToParts(new Date(ms))) {
    if (p.type !== "literal") parts[p.type] = Number(p.value);
  }
  return { year: parts.year, month: parts.month, day: parts.day, hour: parts.hour % 24, minute: parts.minute, second: parts.second };
}

const pad = (n, w = 2) => String(n).padStart(w, "0");

/** The local calendar date ("YYYY-MM-DD") of an instant in a timezone. */
export function localDateString(instant = Date.now(), timeZone = getTimeZone()) {
  const p = zonedParts(instant, timeZone);
  return p ? `${pad(p.year, 4)}-${pad(p.month)}-${pad(p.day)}` : null;
}

export function isDateString(s) {
  return typeof s === "string" && /^\d{4}-\d{2}-\d{2}$/.test(s) && !Number.isNaN(Date.UTC(...dateParts(s)));
}

function dateParts(s) {
  const [y, m, d] = s.split("-").map(Number);
  return [y, m - 1, d];
}

/** Pure calendar arithmetic on date strings (no timezone, no DST). */
export function addDays(dateStr, n) {
  const [y, m, d] = dateParts(dateStr);
  const dt = new Date(Date.UTC(y, m, d + n));
  return `${pad(dt.getUTCFullYear(), 4)}-${pad(dt.getUTCMonth() + 1)}-${pad(dt.getUTCDate())}`;
}

export function daysBetween(fromStr, toStr) {
  return Math.round((Date.UTC(...dateParts(toStr)) - Date.UTC(...dateParts(fromStr))) / 86400000);
}

export function dayOfWeek(dateStr) {
  return new Date(Date.UTC(...dateParts(dateStr))).getUTCDay(); // 0 = Sunday
}

/** Sunday-start week, matching the app's weekly missions. */
export function startOfWeek(dateStr) {
  return addDays(dateStr, -dayOfWeek(dateStr));
}

export function monthKey(dateStr) {
  return dateStr.slice(0, 7);
}

/** Formats a date-only string for display WITHOUT any timezone shift. */
export function formatDateOnly(dateStr, options = { month: "short", day: "numeric" }, locale) {
  if (!isDateString(dateStr)) return "";
  return new Date(Date.UTC(...dateParts(dateStr))).toLocaleDateString(locale, { ...options, timeZone: "UTC" });
}

export function today(now = Date.now(), timeZone = getTimeZone()) {
  return localDateString(now, timeZone);
}

export function yesterday(now = Date.now(), timeZone = getTimeZone()) {
  return addDays(today(now, timeZone), -1);
}

/** Calendar-day difference between a stored date string and "today" in the viewer's timezone. */
export function daysAgo(dateStr, now = Date.now(), timeZone = getTimeZone()) {
  return daysBetween(dateStr, today(now, timeZone));
}

/** The best available instant for a workout, plus how precise it is. Never fabricates a time
 *  of day for a legacy date-only record: it reports `precision: "date"` and uses local noon of
 *  that date so "hours since" is off by at most half a day rather than by a UTC-offset. */
export function workoutInstant(workout, timeZone = getTimeZone()) {
  const completed = workout?.completedAt ? new Date(workout.completedAt).getTime() : NaN;
  if (Number.isFinite(completed)) return { ms: completed, precision: "instant" };
  if (Number.isFinite(workout?.startedAt)) return { ms: workout.startedAt, precision: "instant" };
  if (isDateString(workout?.date)) {
    const [y, m, d] = dateParts(workout.date);
    return { ms: zonedWallClockToMs(y, m + 1, d, 12, 0, 0, timeZone), precision: "date" };
  }
  return { ms: NaN, precision: "none" };
}

/** Converts a wall-clock time in `timeZone` to an epoch instant (handles DST offsets). */
export function zonedWallClockToMs(year, month, day, hour, minute, second, timeZone = getTimeZone()) {
  const asUtc = Date.UTC(year, month - 1, day, hour, minute, second);
  let guess = asUtc;
  for (let i = 0; i < 3; i++) {
    const p = zonedParts(guess, timeZone);
    const shown = Date.UTC(p.year, p.month - 1, p.day, p.hour, p.minute, p.second);
    const diff = asUtc - shown;
    if (diff === 0) break;
    guess += diff;
  }
  return guess;
}

/** Stamp for a newly started workout/log entry under the policy above. */
export function newTimestamp(now = Date.now(), timeZone = getTimeZone()) {
  return { date: localDateString(now, timeZone), timeZone, startedAt: toMs(now) };
}

/** Legacy audit helper: does a stored date equal the UTC date of its own instant (i.e. was it
 *  produced by the old `toISOString().slice(0,10)` code) while the local date differs? Used only
 *  by the dry-run migration report — never applied automatically. */
export function legacyUtcDateMismatch(workout, timeZone) {
  if (!workout || workout.timeZone || !Number.isFinite(workout.startedAt) || !isDateString(workout.date)) return null;
  const utc = new Date(workout.startedAt).toISOString().slice(0, 10);
  if (workout.date !== utc) return null;
  const local = localDateString(workout.startedAt, timeZone);
  return local !== utc ? { stored: workout.date, local } : null;
}
