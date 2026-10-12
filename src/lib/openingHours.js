// A deliberately conservative parser for OpenStreetMap `opening_hours` values. It understands the
// common simple forms — "Mo-Fr 07:00-17:00", "Mo,We 09:00-12:00,13:00-17:00", "Sa-Su off",
// "24/7", overnight ranges and several `;`-separated rules — and answers `open` / `closed` ONLY
// when it fully understood the value. Anything it does not fully understand (public-holiday rules,
// sunrise/sunset, month ranges, week numbers, comments, "by appointment") returns `unknown`, so the
// app never says "open now" on a guess.

const DAYS = ["Mo", "Tu", "We", "Th", "Fr", "Sa", "Su"];
const DAY_INDEX = Object.fromEntries(DAYS.map((d, i) => [d, i]));

function parseDaySpec(spec) {
  const out = new Set();
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^([A-Z][a-z])(?:-([A-Z][a-z]))?$/);
    if (!m || !(m[1] in DAY_INDEX) || (m[2] && !(m[2] in DAY_INDEX))) return null;
    const a = DAY_INDEX[m[1]];
    const b = m[2] ? DAY_INDEX[m[2]] : a;
    for (let i = a; ; i = (i + 1) % 7) { out.add(i); if (i === b) break; }
  }
  return out.size ? [...out] : null;
}

function parseTimeRanges(spec) {
  const ranges = [];
  for (const part of spec.split(",")) {
    const m = part.trim().match(/^(\d{1,2}):(\d{2})-(\d{1,2}):(\d{2})$/);
    if (!m) return null;
    const start = Number(m[1]) * 60 + Number(m[2]);
    const end = Number(m[3]) * 60 + Number(m[4]);
    if (Number(m[1]) > 24 || Number(m[3]) > 24 || Number(m[2]) > 59 || Number(m[4]) > 59) return null;
    ranges.push([start, end]); // end <= start means "past midnight"
  }
  return ranges.length ? ranges : null;
}

/** @returns {{days: Array<Array<[number,number]>>}|null} per-weekday ranges (Mo=0), or null if unsupported */
export function parseOpeningHours(raw) {
  if (typeof raw !== "string") return null;
  const value = raw.trim();
  if (!value || value.length > 300) return null;
  if (value === "24/7") return { days: Array.from({ length: 7 }, () => [[0, 1440]]) };
  const days = Array.from({ length: 7 }, () => []);
  for (const rule of value.split(";").map((r) => r.trim()).filter(Boolean)) {
    if (/PH|SH|sunrise|sunset|dawn|dusk|week|Jan|Feb|Mar|Apr|May|Jun|Jul|Aug|Sep|Oct|Nov|Dec|["\[\]+<>]|\bby\b|appointment|unknown|closed\b/i.test(rule) && !/^[A-Za-z, -]+ off$/.test(rule)) return null;
    let m = rule.match(/^(.+?)\s+off$/);
    if (m) {
      const d = parseDaySpec(m[1]);
      if (!d) return null;
      d.forEach((i) => { days[i] = []; });
      continue;
    }
    if (rule === "off") return null;
    m = rule.match(/^([A-Z][a-z](?:[-,][A-Z][a-z])*(?:,[A-Z][a-z](?:-[A-Z][a-z])?)*)\s+(.+)$/);
    let dayList;
    let timeSpec;
    if (m) { dayList = parseDaySpec(m[1]); timeSpec = m[2]; }
    else if (/^\d/.test(rule)) { dayList = [0, 1, 2, 3, 4, 5, 6]; timeSpec = rule; }
    else return null;
    const ranges = timeSpec === "24/7" ? [[0, 1440]] : parseTimeRanges(timeSpec);
    if (!dayList || !ranges) return null;
    dayList.forEach((i) => { days[i] = ranges; });
  }
  return { days };
}

const WEEKDAY_FROM_INTL = { Mon: 0, Tue: 1, Wed: 2, Thu: 3, Fri: 4, Sat: 5, Sun: 6 };

function localWeekdayAndMinutes(ms, timeZone) {
  const parts = new Intl.DateTimeFormat("en-US", { timeZone, weekday: "short", hour: "2-digit", minute: "2-digit", hourCycle: "h23" }).formatToParts(new Date(ms));
  const get = (t) => parts.find((p) => p.type === t)?.value;
  return { weekday: WEEKDAY_FROM_INTL[get("weekday")], minutes: Number(get("hour")) * 60 + Number(get("minute")) };
}

/**
 * Is a venue open at `nowMs` in `timeZone`? Only meaningful when `timeZone` is the venue's own zone.
 * @returns {{ state: "open"|"closed"|"unknown", reason?: string }}
 */
export function openStatus(raw, nowMs, timeZone) {
  const parsed = parseOpeningHours(raw);
  if (!parsed) return { state: "unknown", reason: raw ? "Opening hours are in a format Asc3end can't read reliably." : "No opening hours listed." };
  let local;
  try { local = localWeekdayAndMinutes(nowMs, timeZone); } catch (e) { return { state: "unknown", reason: "Timezone unavailable." }; }
  const { weekday, minutes } = local;
  if (!Number.isInteger(weekday)) return { state: "unknown" };
  const today = parsed.days[weekday];
  for (const [start, end] of today) {
    if (end > start ? minutes >= start && minutes < end : minutes >= start) return { state: "open" };
  }
  // an overnight range that began yesterday and runs past midnight
  const yesterday = parsed.days[(weekday + 6) % 7];
  for (const [start, end] of yesterday) {
    if (end <= start && minutes < end) return { state: "open" };
  }
  return { state: "closed" };
}
