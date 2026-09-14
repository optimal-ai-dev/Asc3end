import React, { useState, useMemo } from "react";
import { Trophy, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import { muscleRecovery, MuscleMap15, MuscleMap15TextAlternative, MUSCLE_MAP_15, EXERCISES, MUSCLE_GROUPS, classifyDayAdherence, ADHERENCE_COLOR, ADHERENCE_LABEL, workoutVolume } from "./App.jsx";
import { getNutritionTargets } from "./lib/nutritionMath";

/* muscleRecovery/MuscleMap15 are imported from App.jsx rather than reimplemented here so the
   full recovery map on this page can never drift out of sync with the compact one on Home —
   both read the exact same 6-group calculation. This doesn't add to Progress's own lazy-loaded
   bundle weight: App.jsx is already fully loaded and evaluated by the time a user can navigate
   to this tab, since Progress only ever renders from inside the already-running App tree. */

/* This file is loaded lazily (see App.jsx) so recharts — the single largest dependency in the
   app (~525KB) — is only downloaded when someone actually opens the Progress tab, instead of
   being part of every page load. */

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Approximate bodyweight-ratio strength standards (illustrative, not a certified table) */
// exercise names below must exactly match an entry in App.jsx's EXERCISES list — they previously
// didn't ("Bench Press (Barbell)", "Squat (Barbell)", "Deadlift (Barbell)" don't exist there, only
// "Barbell Bench Press", "Back Squat", and "Deadlift" do), so Strength Ranking and the
// Transformation card's lift trend silently never matched any logged workout for three of the
// four lifts. Only Overhead Press happened to already match.
const STRENGTH_STANDARDS = {
  bench: { exercise: "Barbell Bench Press", male: [0.5, 0.75, 1.0, 1.5, 1.75], female: [0.3, 0.45, 0.65, 0.95, 1.15] },
  squat: { exercise: "Back Squat", male: [0.75, 1.0, 1.5, 2.0, 2.5], female: [0.55, 0.75, 1.15, 1.6, 2.0] },
  deadlift: { exercise: "Deadlift", male: [1.0, 1.25, 1.75, 2.25, 2.75], female: [0.75, 1.0, 1.4, 1.85, 2.3] },
  ohp: { exercise: "Overhead Press (Barbell)", male: [0.35, 0.5, 0.7, 1.0, 1.2], female: [0.2, 0.3, 0.45, 0.65, 0.8] },
};
const STANDARD_TIERS = ["Beginner", "Novice", "Intermediate", "Advanced", "Elite"];
const TIER_PERCENTILES = [15, 35, 55, 78, 93];

function strengthRank(bestWeight, bodyweightKg, gender, lift) {
  const table = STRENGTH_STANDARDS[lift];
  if (!table || !bestWeight || !bodyweightKg) return null;
  const ratios = table[gender === "female" ? "female" : "male"];
  const userRatio = bestWeight / bodyweightKg;
  let tierIdx = -1;
  for (let i = 0; i < ratios.length; i++) if (userRatio >= ratios[i]) tierIdx = i;
  let percentile;
  if (tierIdx === -1) percentile = Math.round((userRatio / ratios[0]) * TIER_PERCENTILES[0]);
  else if (tierIdx === ratios.length - 1) percentile = TIER_PERCENTILES[tierIdx];
  else {
    const span = ratios[tierIdx + 1] - ratios[tierIdx];
    const progress = span > 0 ? (userRatio - ratios[tierIdx]) / span : 0;
    percentile = Math.round(TIER_PERCENTILES[tierIdx] + progress * (TIER_PERCENTILES[tierIdx + 1] - TIER_PERCENTILES[tierIdx]));
  }
  return {
    tier: tierIdx === -1 ? "Untrained" : STANDARD_TIERS[tierIdx],
    percentile: Math.min(99, Math.max(1, percentile)),
    exercise: table.exercise,
  };
}

/* Epley formula — a standard, widely-used estimate of 1-rep max from a lower-rep set.
   Like any such formula it gets less accurate above ~12 reps; treat it as a trend indicator, not a literal max. */
function estimate1RM(weight, reps) {
  return weight * (1 + reps / 30);
}

/* Distinct PR types per exercise, computed independently so a rep PR set at a lighter weight
   doesn't get masked by a heavier weight PR from a different session (or vice versa). */
function exercisePRs(workouts, name) {
  const sessions = workouts
    .filter((w) => w.exercises.some((e) => e.name === name))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  let weightPR = null, repPR = null, oneRMPR = null, volumePR = null;
  sessions.forEach((w) => {
    const ex = w.exercises.find((e) => e.name === name);
    const sessionVolume = ex.sets.reduce((s, st) => s + st.weight * st.reps, 0);
    if (sessionVolume > 0 && (!volumePR || sessionVolume > volumePR.volume)) volumePR = { volume: sessionVolume, date: w.date };
    ex.sets.forEach((s) => {
      if (!weightPR || s.weight > weightPR.weight) weightPR = { weight: s.weight, reps: s.reps, date: w.date };
      if (!repPR || s.reps > repPR.reps) repPR = { weight: s.weight, reps: s.reps, date: w.date };
      const oneRM = estimate1RM(s.weight, s.reps);
      if (!oneRMPR || oneRM > oneRMPR.oneRM) oneRMPR = { oneRM, weight: s.weight, reps: s.reps, date: w.date };
    });
  });
  return { weightPR, repPR, oneRMPR, volumePR };
}

/* Body transformation: earliest vs latest weight + earliest vs best per lift.
   Returns a typed result so the UI can tell "not enough data yet" apart from "a real trend
   over too short a span to call it weekly" apart from "here's your real multi-week trend" —
   collapsing all three into one generic "Over 1 week..." sentence is what previously produced
   a nonsensical "increased by 0kg" message from two same-day entries. */
function transformationSummary(weightlog, workouts) {
  if (weightlog.length === 0) return null; // nothing to say yet — the Bodyweight card below already prompts to log a first entry
  if (weightlog.length === 1) return { kind: "baseline" };
  const sorted = [...weightlog].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const days = Math.round((new Date(last.date) - new Date(first.date)) / 86400000);
  const weightChange = +(last.weight - first.weight).toFixed(1);
  if (days < 3) return { kind: "tooSoon", days, weightChange };
  const weeks = Math.max(1, Math.round(days / 7));
  // Only sessions with at least one set carrying a real weight count — an exercise added to a
  // session but never actually logged (sets: []) must not feed Math.max(...[]), which would
  // silently produce -Infinity.
  const validWeights = (e) => e.sets.map((s) => s.weight).filter((w) => Number.isFinite(w) && w > 0);
  const lifts = ["bench", "squat", "deadlift"].map((k) => {
    const name = STRENGTH_STANDARDS[k].exercise;
    const history = workouts
      .filter((w) => w.exercises.some((e) => e.name === name && validWeights(e).length > 0))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    if (history.length < 2) return null;
    const earliest = Math.max(...validWeights(history[0].exercises.find((e) => e.name === name)));
    const latest = Math.max(...validWeights(history[history.length - 1].exercises.find((e) => e.name === name)));
    return { name: name.split(" (")[0], change: +(latest - earliest).toFixed(1) };
  }).filter(Boolean);
  return { kind: "trend", weightChange, weeks, lifts };
}

const MUSCLE_LABEL = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", legs: "Legs", core: "Core" };

/* Total weight-moved volume per muscle group over the last 7 days — the same "muscle" field
   already used by muscleRecovery(), just summed by kg*reps instead of counted by session. */
function weeklyMuscleVolume(workouts, customExercises) {
  const allEx = [...EXERCISES, ...customExercises];
  const cutoff = Date.now() - 7 * 86400000;
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0]));
  workouts.forEach((w) => {
    if (new Date(w.date).getTime() < cutoff) return;
    w.exercises.forEach((e) => {
      const ex = allEx.find((x) => x.name === e.name);
      if (!ex) return;
      const volume = e.sets.reduce((s, st) => s + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0);
      totals[ex.muscle] = (totals[ex.muscle] || 0) + volume;
    });
  });
  return MUSCLE_GROUPS.map((m) => ({ muscle: m, label: MUSCLE_LABEL[m], volume: Math.round(totals[m]) }));
}

/* Training-day grid for the last `weeks` weeks, oldest first, padded to full weeks (Sun-Sat) so
   it renders as a clean 7-column grid like a calendar-contribution graph. `count` is sets logged
   that day — used only to pick a shade, never displayed as a precise number. */
function consistencyGrid(workouts, weeks = 12) {
  const setsByDate = new Map();
  workouts.forEach((w) => {
    const d = w.date;
    const sets = w.exercises.reduce((n, e) => n + e.sets.length, 0);
    setsByDate.set(d, (setsByDate.get(d) || 0) + sets);
  });
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const end = new Date(today);
  end.setDate(end.getDate() + (6 - end.getDay())); // pad forward to the end of this week (Saturday)
  const start = new Date(end);
  start.setDate(start.getDate() - (weeks * 7 - 1));
  const days = [];
  for (let d = new Date(start); d <= end; d.setDate(d.getDate() + 1)) {
    const iso = new Date(d).toISOString().slice(0, 10);
    days.push({ date: iso, count: setsByDate.get(iso) || 0, future: new Date(d) > today });
  }
  return days;
}

/* Ordinary least squares on {x,y} points — used only for a short, clearly-labeled illustrative
   extrapolation of the user's own recent trend, never presented as a guarantee. */
function linearRegression(points) {
  const n = points.length;
  const sumX = points.reduce((s, p) => s + p.x, 0);
  const sumY = points.reduce((s, p) => s + p.y, 0);
  const sumXY = points.reduce((s, p) => s + p.x * p.y, 0);
  const sumXX = points.reduce((s, p) => s + p.x * p.x, 0);
  const denom = n * sumXX - sumX * sumX;
  if (denom === 0) return { slope: 0, intercept: sumY / n };
  const slope = (n * sumXY - sumX * sumY) / denom;
  const intercept = (sumY - slope * sumX) / n;
  return { slope, intercept };
}

/* Every PR event across every exercise, flattened into one chronological feed instead of the
   per-exercise breakdown above it — "what did I set a new record on, and when". */
function prTimeline(workouts) {
  const exerciseNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const events = [];
  exerciseNames.forEach((name) => {
    const { weightPR, oneRMPR } = exercisePRs(workouts, name);
    if (weightPR) events.push({ name, date: weightPR.date, kind: "weight", detail: `${weightPR.weight}kg × ${weightPR.reps}` });
    if (oneRMPR) events.push({ name, date: oneRMPR.date, kind: "1rm", detail: `est. ${Math.round(oneRMPR.oneRM)}kg 1RM` });
  });
  return events.sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 12);
}

/* Small inline trend line for one exercise's top-set weight over its last few sessions — a
   sparkline, not a full chart: no axes/labels, just shape. */
function sparklinePoints(workouts, name, width = 64, height = 20) {
  const hasLoggedSets = (e) => e.sets.some((s) => Number.isFinite(s.weight) && s.weight > 0);
  const sessions = workouts
    .filter((w) => w.exercises.some((e) => e.name === name && hasLoggedSets(e)))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .slice(-10);
  const values = sessions.map((w) => Math.max(...w.exercises.find((e) => e.name === name).sets.filter((s) => Number.isFinite(s.weight)).map((s) => s.weight)));
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
}

/* ------------------------------------------------------------------ */
/* Monthly Report                                                      */
/* ------------------------------------------------------------------ */

function monthRange(monthKey) {
  const [year, month] = monthKey.split("-").map(Number);
  const start = new Date(year, month - 1, 1);
  const end = new Date(year, month, 0); // day 0 of next month = last day of this month
  const toIso = (d) => d.toISOString().slice(0, 10);
  return {
    startIso: toIso(start), endIso: toIso(end),
    daysInMonth: end.getDate(),
    label: start.toLocaleDateString(undefined, { month: "long", year: "numeric" }),
    isCurrentMonth: monthKey === new Date().toISOString().slice(0, 7),
  };
}

function shiftMonthKey(monthKey, delta) {
  const [year, month] = monthKey.split("-").map(Number);
  const d = new Date(year, month - 1 + delta, 1);
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, "0")}`;
}

/* Same shape as weeklyMuscleVolume, generalized to an arbitrary [startIso, endIso] window
   instead of a hardcoded trailing 7 days — the report needs a full calendar month, not a
   rolling window. */
function muscleVolumeInRange(workouts, customExercises, startIso, endIso) {
  const allEx = [...EXERCISES, ...customExercises];
  const totals = Object.fromEntries(MUSCLE_GROUPS.map((m) => [m, 0]));
  workouts.forEach((w) => {
    if (w.date < startIso || w.date > endIso) return;
    w.exercises.forEach((e) => {
      const ex = allEx.find((x) => x.name === e.name);
      if (!ex) return;
      const volume = e.sets.reduce((s, st) => s + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0);
      totals[ex.muscle] = (totals[ex.muscle] || 0) + volume;
    });
  });
  return MUSCLE_GROUPS.map((m) => ({ muscle: m, label: MUSCLE_LABEL[m], volume: Math.round(totals[m]) }));
}

/* Every time a genuinely new all-time best was set (weight or est. 1RM), for every exercise,
   across the athlete's whole history — not just the current record like exercisePRs()/prTimeline()
   above (those intentionally only surface "your current best", which isn't the same question as
   "what records did I break in this specific month" if a record has since been broken again). */
function historicalPrEvents(workouts) {
  const exerciseNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const events = [];
  const hasLoggedSets = (e) => e.sets.some((s) => Number.isFinite(s.weight) && s.weight > 0 && Number.isFinite(s.reps) && s.reps > 0);
  exerciseNames.forEach((name) => {
    const sessions = workouts
      .filter((w) => w.exercises.some((e) => e.name === name && hasLoggedSets(e)))
      .sort((a, b) => new Date(a.date) - new Date(b.date));
    let maxWeight = 0, max1RM = 0;
    sessions.forEach((w) => {
      const validSets = w.exercises.find((e) => e.name === name).sets.filter((s) => Number.isFinite(s.weight) && s.weight > 0 && Number.isFinite(s.reps) && s.reps > 0);
      const bestSet = validSets.reduce((a, b) => (b.weight > a.weight ? b : a));
      const best1RM = Math.max(...validSets.map((s) => estimate1RM(s.weight, s.reps)));
      if (bestSet.weight > maxWeight) {
        maxWeight = bestSet.weight;
        events.push({ name, date: w.date, kind: "weight", detail: `${bestSet.weight}kg × ${bestSet.reps}` });
      }
      if (best1RM > max1RM) {
        max1RM = best1RM;
        events.push({ name, date: w.date, kind: "1rm", detail: `est. ${Math.round(best1RM)}kg 1RM` });
      }
    });
  });
  return events.sort((a, b) => new Date(a.date) - new Date(b.date));
}

/* Count of days in [startIso, endIso] at each adherence level — same per-day rule as Home's
   weeklyAdherence(), just totaled over a month instead of shown as 7 individual chips. */
function monthlyAdherenceSummary(nutrition, targets, startIso, endIso, daysInMonth) {
  const counts = { good: 0, partial: 0, off: 0, none: 0 };
  for (let i = 0; i < daysInMonth; i++) {
    const d = new Date(startIso);
    d.setDate(d.getDate() + i);
    if (d > new Date()) break; // don't count future days of the current month as "nothing logged"
    const iso = d.toISOString().slice(0, 10);
    const dayFoods = nutrition.filter((n) => n.date === iso);
    counts[classifyDayAdherence(dayFoods, targets)]++;
  }
  return counts;
}

function MonthlyReport({ workouts, nutrition, weightlog, customExercises, profile, onClose }) {
  const [monthKey, setMonthKey] = useState(() => new Date().toISOString().slice(0, 7));
  const range = useMemo(() => monthRange(monthKey), [monthKey]);
  const prevRange = useMemo(() => monthRange(shiftMonthKey(monthKey, -1)), [monthKey]);

  const monthWorkouts = useMemo(() => workouts.filter((w) => w.date >= range.startIso && w.date <= range.endIso), [workouts, range]);
  const prevMonthWorkouts = useMemo(() => workouts.filter((w) => w.date >= prevRange.startIso && w.date <= prevRange.endIso), [workouts, prevRange]);

  const totalSets = monthWorkouts.reduce((n, w) => n + w.exercises.reduce((n2, e) => n2 + e.sets.length, 0), 0);
  const totalVolume = Math.round(monthWorkouts.reduce((s, w) => s + workoutVolume(w), 0));
  const daysTrained = new Set(monthWorkouts.map((w) => w.date)).size;
  const prevVolume = Math.round(prevMonthWorkouts.reduce((s, w) => s + workoutVolume(w), 0));
  const volumeChangePct = prevVolume > 0 ? Math.round(((totalVolume - prevVolume) / prevVolume) * 100) : null;

  const volumeByMuscle = useMemo(() => muscleVolumeInRange(workouts, customExercises, range.startIso, range.endIso), [workouts, customExercises, range]);

  const monthPrs = useMemo(
    () => historicalPrEvents(workouts).filter((ev) => ev.date >= range.startIso && ev.date <= range.endIso),
    [workouts, range]
  );

  const targets = getNutritionTargets(profile);
  const adherence = useMemo(
    () => monthlyAdherenceSummary(nutrition, targets, range.startIso, range.endIso, range.daysInMonth),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [nutrition, profile, range]
  );
  const loggedDays = adherence.good + adherence.partial + adherence.off;

  const monthWeighIns = weightlog.filter((w) => w.date >= range.startIso && w.date <= range.endIso).sort((a, b) => new Date(a.date) - new Date(b.date));
  const weightChange = monthWeighIns.length >= 2 ? +(monthWeighIns[monthWeighIns.length - 1].weight - monthWeighIns[0].weight).toFixed(1) : null;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="disp" style={{ fontSize: 20 }}>Monthly Report</div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: 8, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Close monthly report">
            <X size={18} />
          </button>
        </div>

        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 20 }}>
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, -1))} className="atlas-btn-ghost" style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0 }} aria-label="Previous month">
            <ChevronLeft size={18} />
          </button>
          <div className="disp" style={{ fontSize: 18 }}>{range.label}</div>
          <button onClick={() => setMonthKey(shiftMonthKey(monthKey, 1))} disabled={range.isCurrentMonth} className="atlas-btn-ghost" style={{ width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", padding: 0, opacity: range.isCurrentMonth ? 0.35 : 1 }} aria-label="Next month">
            <ChevronRight size={18} />
          </button>
        </div>

        {monthWorkouts.length === 0 ? (
          <div className="empty-state">
            <FileText size={28} color="var(--ink-dim)" className="empty-state-icon" />
            <div className="empty-state-title">No workouts logged</div>
            <div className="empty-state-body">Nothing was logged in {range.label} — train a few sessions and check back.</div>
          </div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
              <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
                <div className="disp" style={{ fontSize: 20 }}>{monthWorkouts.length}</div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>WORKOUTS</div>
              </div>
              <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
                <div className="disp" style={{ fontSize: 20 }}>{totalSets}</div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>SETS</div>
              </div>
              <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
                <div className="disp" style={{ fontSize: 20 }}>{daysTrained}/{range.daysInMonth}</div>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>DAYS TRAINED</div>
              </div>
            </div>

            <div className="atlas-card" style={{ marginBottom: 16 }}>
              <h2 className="disp" style={{ fontSize: 14, marginBottom: 4 }}>Training Volume</h2>
              <div style={{ fontSize: 22 }} className="disp">{totalVolume.toLocaleString()}kg</div>
              {volumeChangePct != null && (
                <div className="mono" style={{ fontSize: 11, color: volumeChangePct >= 0 ? "var(--good)" : "var(--warn)", marginBottom: 10 }}>
                  {volumeChangePct >= 0 ? "▲" : "▼"} {Math.abs(volumeChangePct)}% vs {prevRange.label}
                </div>
              )}
              <div style={{ marginTop: 10 }}>
                {volumeByMuscle.filter((m) => m.volume > 0).map((m) => (
                  <div key={m.muscle} style={{ marginBottom: 6 }}>
                    <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
                      <span className="mono" style={{ color: "var(--ink-dim)" }}>{m.label.toUpperCase()}</span>
                      <span className="mono">{m.volume.toLocaleString()}kg</span>
                    </div>
                    <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (m.volume / Math.max(...volumeByMuscle.map((x) => x.volume), 1)) * 100)}%`, background: "var(--brass)" }} /></div>
                  </div>
                ))}
              </div>
            </div>

            {monthPrs.length > 0 && (
              <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
                <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>
                  <Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{monthPrs.length} Record{monthPrs.length === 1 ? "" : "s"} Broken
                </div>
                <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                  {monthPrs.map((ev, i) => (
                    <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                      {fmtDate(ev.date)} — {ev.name}: {ev.detail}
                    </div>
                  ))}
                </div>
              </div>
            )}

            {loggedDays > 0 && (
              <div className="atlas-card" style={{ marginBottom: 16 }}>
                <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Nutrition Adherence</h2>
                <div className="bar-track" style={{ display: "flex", overflow: "hidden" }}>
                  {["good", "partial", "off"].map((lvl) => adherence[lvl] > 0 && (
                    <div key={lvl} style={{ width: `${(adherence[lvl] / loggedDays) * 100}%`, background: ADHERENCE_COLOR[lvl], height: "100%" }} title={`${adherence[lvl]} day(s) ${ADHERENCE_LABEL[lvl].toLowerCase()}`} />
                  ))}
                </div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>
                  Logged {loggedDays} of {range.daysInMonth} days — on target {adherence.good} day{adherence.good === 1 ? "" : "s"}.
                </div>
              </div>
            )}

            {weightChange != null && (
              <div className="atlas-card" style={{ marginBottom: 16 }}>
                <h2 className="disp" style={{ fontSize: 14, marginBottom: 4 }}>Bodyweight</h2>
                <div style={{ fontSize: 13 }}>
                  {weightChange === 0 ? "Held steady" : `${weightChange > 0 ? "Up" : "Down"} `}
                  {weightChange !== 0 && <span className="mono" style={{ color: "var(--brass)" }}>{Math.abs(weightChange)}kg</span>}
                  {" "}this month.
                </div>
              </div>
            )}
          </>
        )}
      </div>
    </div>
  );
}

export default function Progress({ profile, workouts, weightlog, customExercises = [], nutrition = [] }) {
  const exerciseNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const [selected, setSelected] = useState(exerciseNames[0] || "");
  const [metric, setMetric] = useState("weight"); // weight | 1rm | volume
  const [prExpanded, setPrExpanded] = useState(null);
  const [prView, setPrView] = useState("byExercise"); // byExercise | timeline
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [mapView, setMapView] = useState("front");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const recoveryStatus = useMemo(() => muscleRecovery(workouts, customExercises), [workouts, customExercises]);

  // Dedupe same-day entries (keep the latest) before charting — otherwise logging twice in one
  // day plots two points with an identical x-axis label, which reads as a rendering bug.
  const weightByDate = new Map();
  [...weightlog].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((w) => weightByDate.set(w.date, w.weight));
  const weightData = [...weightByDate.entries()].map(([date, weight]) => ({ date: fmtDate(date), weight })).slice(-20);

  // A session's exercise entry can carry an empty sets array (added to the workout but never
  // logged) — excluded here so it can't feed Math.max(...[]) and chart a -Infinity point.
  const hasLoggedSets = (e) => e.sets.some((s) => Number.isFinite(s.weight) && s.weight > 0 && Number.isFinite(s.reps) && s.reps > 0);
  const sessionsForSelected = workouts
    .filter((w) => w.exercises.some((e) => e.name === selected && hasLoggedSets(e)))
    .sort((a, b) => new Date(a.date) - new Date(b.date));
  const strengthData = sessionsForSelected.map((w) => {
    const ex = w.exercises.find((e) => e.name === selected && hasLoggedSets(e));
    const validSets = ex.sets.filter((s) => Number.isFinite(s.weight) && s.weight > 0 && Number.isFinite(s.reps) && s.reps > 0);
    const top = Math.max(...validSets.map((s) => s.weight));
    const best1RM = Math.max(...validSets.map((s) => estimate1RM(s.weight, s.reps)));
    const volume = validSets.reduce((s, st) => s + st.weight * st.reps, 0);
    return { date: fmtDate(w.date), weight: Math.round(top), "1rm": Math.round(best1RM), volume: Math.round(volume) };
  });
  const METRIC_META = {
    weight: { key: "weight", label: "Top Weight", unit: "kg", color: "var(--steel)" },
    "1rm": { key: "1rm", label: "Est. 1RM", unit: "kg", color: "var(--brass)" },
    volume: { key: "volume", label: "Session Volume", unit: "kg", color: "var(--warn)" },
  };

  const selectedStats = selected ? exercisePRs(workouts, selected) : null;

  const prs = exerciseNames.map((name) => ({ name, ...exercisePRs(workouts, name) })).filter((p) => p.weightPR);

  const prByName = Object.fromEntries(prs.map((p) => [p.name, p.weightPR.weight]));
  const ranks = Object.entries(STRENGTH_STANDARDS)
    .map(([key, s]) => ({ key, ...strengthRank(prByName[s.exercise], profile.weightKg, profile.gender, key) }))
    .filter((r) => r.percentile != null);

  const transformation = useMemo(() => transformationSummary(weightlog, workouts), [weightlog, workouts]);
  const muscleVolume = useMemo(() => weeklyMuscleVolume(workouts, customExercises), [workouts, customExercises]);
  const grid = useMemo(() => consistencyGrid(workouts, 12), [workouts]);
  const timeline = useMemo(() => prTimeline(workouts), [workouts]);

  // Goal trajectory: pick the metric that actually matches the athlete's stated goal, and only
  // project a trend when there's enough real data to make extrapolation more than a guess.
  const trajectory = useMemo(() => {
    if (profile.goal === "strength") {
      for (const key of ["bench", "squat", "deadlift"]) {
        const name = STRENGTH_STANDARDS[key].exercise;
        const hasLoggedSets = (e) => e.sets.some((s) => Number.isFinite(s.weight) && s.weight > 0 && Number.isFinite(s.reps) && s.reps > 0);
        const sessions = workouts
          .filter((w) => w.exercises.some((e) => e.name === name && hasLoggedSets(e)))
          .sort((a, b) => new Date(a.date) - new Date(b.date));
        if (sessions.length < 3) continue;
        const t0 = new Date(sessions[0].date).getTime();
        const points = sessions.map((w) => {
          const ex = w.exercises.find((e) => e.name === name);
          const best1RM = Math.max(...ex.sets.filter((s) => Number.isFinite(s.weight) && s.weight > 0).map((s) => estimate1RM(s.weight, s.reps)));
          return { x: (new Date(w.date).getTime() - t0) / 86400000, y: best1RM, date: w.date };
        });
        const { slope } = linearRegression(points);
        return {
          kind: "lift", label: name.split(" (")[0], unit: "kg est. 1RM",
          data: points.map((p) => ({ date: fmtDate(p.date), value: Math.round(p.y) })),
          weeklyRate: +(slope * 7).toFixed(1),
        };
      }
      return null;
    }
    if (profile.goal === "muscle_growth" || profile.goal === "fat_loss") {
      const sorted = [...weightlog].sort((a, b) => new Date(a.date) - new Date(b.date));
      if (sorted.length < 3) return null;
      const t0 = new Date(sorted[0].date).getTime();
      const points = sorted.map((w) => ({ x: (new Date(w.date).getTime() - t0) / 86400000, y: w.weight, date: w.date }));
      const { slope } = linearRegression(points);
      return {
        kind: "weight", label: "Bodyweight", unit: "kg",
        data: points.map((p) => ({ date: fmtDate(p.date), value: p.y })),
        weeklyRate: +(slope * 7).toFixed(2),
      };
    }
    // general fitness: trajectory is about showing up, not a number on a lift or scale.
    const byWeek = new Map();
    workouts.forEach((w) => {
      const d = new Date(w.date);
      const weekStart = new Date(d);
      weekStart.setDate(d.getDate() - d.getDay());
      const key = weekStart.toISOString().slice(0, 10);
      byWeek.set(key, (byWeek.get(key) || 0) + 1);
    });
    const weeks = [...byWeek.entries()].sort(([a], [b]) => new Date(a) - new Date(b)).slice(-8);
    if (weeks.length < 3) return null;
    return {
      kind: "sessions", label: "Sessions per week", unit: "sessions",
      data: weeks.map(([date, count]) => ({ date: fmtDate(date), value: count })),
      weeklyRate: null,
    };
  }, [profile.goal, workouts, weightlog]);

  return (
    <div style={{ padding: "24px 18px" }}>
      {showMonthlyReport && (
        <MonthlyReport
          workouts={workouts} nutrition={nutrition} weightlog={weightlog} customExercises={customExercises} profile={profile}
          onClose={() => setShowMonthlyReport(false)}
        />
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 16 }}>
        <h1 className="disp" style={{ fontSize: 26 }}>Progress</h1>
        <button onClick={() => setShowMonthlyReport(true)} className="atlas-btn-ghost" style={{ padding: "8px 14px", fontSize: 11, display: "flex", alignItems: "center", gap: 6 }}>
          <FileText size={13} /> Monthly Report
        </button>
      </div>

      {transformation && (
        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 6 }}>Transformation</h2>
          {transformation.kind === "baseline" && (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-dim)" }}>Baseline recorded. Add another weigh-in to see your trend.</div>
          )}
          {transformation.kind === "tooSoon" && (
            <div style={{ fontSize: 13, lineHeight: 1.6, color: "var(--ink-dim)" }}>
              {transformation.days === 0 ? "Logged twice today" : `Only ${transformation.days} day${transformation.days === 1 ? "" : "s"} apart`} — check back in a few days for a real trend instead of a same-week snapshot.
            </div>
          )}
          {transformation.kind === "trend" && (
            <div style={{ fontSize: 13, lineHeight: 1.6 }}>
              Over {transformation.weeks} week{transformation.weeks === 1 ? "" : "s"}, your bodyweight has {transformation.weightChange >= 0 ? "increased" : "decreased"} by <span className="mono" style={{ color: "var(--brass)" }}>{Math.abs(transformation.weightChange)}kg</span>
              {transformation.lifts.length > 0 && (
                <>
                  {" "}while{" "}
                  {transformation.lifts.map((l, i) => (
                    <span key={l.name}>
                      {i > 0 && ", "}
                      your {l.name} has {l.change >= 0 ? "gone up" : "dropped"} <span className="mono" style={{ color: "var(--steel)" }}>{Math.abs(l.change)}kg</span>
                    </span>
                  ))}
                  .
                </>
              )}
            </div>
          )}
        </div>
      )}

      {trajectory && (
        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 4 }}>Goal Trajectory</h2>
          <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 10 }}>
            {trajectory.kind === "lift" && (
              trajectory.weeklyRate === 0
                ? `Your ${trajectory.label} est. 1RM has been flat recently.`
                : `Your ${trajectory.label} est. 1RM is trending ${trajectory.weeklyRate > 0 ? "up" : "down"} about ${Math.abs(trajectory.weeklyRate)}kg/week.`
            )}
            {trajectory.kind === "weight" && (
              trajectory.weeklyRate === 0
                ? "Your bodyweight has been holding steady recently."
                : `Your bodyweight is trending ${trajectory.weeklyRate > 0 ? "up" : "down"} about ${Math.abs(trajectory.weeklyRate)}kg/week.`
            )}
            {trajectory.kind === "sessions" && "Your training frequency over recent weeks."}
          </div>
          <ResponsiveContainer width="100%" height={140}>
            <LineChart data={trajectory.data}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={10} />
              <YAxis stroke="var(--ink-dim)" fontSize={10} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} formatter={(v) => [`${v} ${trajectory.unit}`, trajectory.label]} />
              <Line type="monotone" dataKey="value" stroke="var(--brass)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 6, fontStyle: "italic" }}>
            A straight-line extrapolation of your own recent data — not a promise or a medical projection, and it will bend as your training does.
          </div>
        </div>
      )}

      {ranks.length > 0 && (
        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Strength Ranking</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {ranks.map((r) => (
              <div key={r.key}>
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 3 }}>
                  <span>{r.exercise.split(" (")[0]}</span>
                  <span className="mono" style={{ color: "var(--brass)" }}>{r.tier}</span>
                </div>
                <div className="bar-track"><div className="bar-fill" style={{ width: `${r.percentile}%`, background: "var(--steel)" }} /></div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic" }}>
            Tier is Asc3end's own illustrative bodyweight-ratio scale (Beginner → Elite) — not a certified strength standard or a claim about the population of real lifters.
          </div>
        </div>
      )}

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <h2 className="disp" style={{ fontSize: 14 }}>Muscle Recovery Map</h2>
          <div style={{ display: "flex", gap: 4 }}>
            {["front", "back"].map((v) => (
              <button
                key={v}
                onClick={() => { setMapView(v); setSelectedRegion(null); }}
                className="pill"
                style={{ cursor: "pointer", textTransform: "capitalize", border: `1px solid ${mapView === v ? "var(--brass)" : "var(--line)"}`, background: mapView === v ? "var(--brass-soft)" : "transparent", color: mapView === v ? "var(--brass)" : "var(--ink-dim)" }}
              >
                {v}
              </button>
            ))}
          </div>
        </div>

        <MuscleMap15 status={recoveryStatus} view={mapView} selected={selectedRegion} onSelect={(k) => setSelectedRegion(selectedRegion === k ? null : k)} maxWidth={240} />

        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8 }}>
          <span className="pill" style={{ background: "rgba(116,165,120,0.15)", color: "var(--good)" }}>● Ready</span>
          <span className="pill" style={{ background: "rgba(255,182,72,0.15)", color: "var(--warn)" }}>● Partial</span>
          <span className="pill" style={{ background: "rgba(184,91,94,0.15)", color: "var(--rest)" }}>● Resting</span>
        </div>

        {selectedRegion && (() => {
          const region = MUSCLE_MAP_15.find((m) => m.key === selectedRegion);
          const g = recoveryStatus[region.group];
          return (
            <div style={{ marginTop: 10, padding: 10, background: "var(--bg-elev2)", borderRadius: 8 }}>
              <div className="disp" style={{ fontSize: 12, marginBottom: 4 }}>{region.label}</div>
              {!Number.isFinite(g.hours) ? (
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>Not trained yet.</div>
              ) : (
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", lineHeight: 1.7 }}>
                  Last trained: {fmtDate(g.lastDate)} ({Math.round(g.hours)}h ago)<br />
                  {g.recentSets} set{g.recentSets === 1 ? "" : "s"} across {g.recentSessions} session{g.recentSessions === 1 ? "" : "s"} in the last 7 days<br />
                  {g.level === "ready" ? "Ready to train." : `Est. fully ready in ~${g.hoursUntilReady}h`}
                </div>
              )}
            </div>
          );
        })()}

        <details style={{ marginTop: 10 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--ink-dim)" }}>Show as text list</summary>
          <div style={{ marginTop: 8 }}>
            <MuscleMap15TextAlternative status={recoveryStatus} view={mapView} />
          </div>
        </details>

        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8, fontStyle: "italic" }}>Estimate based on time since last trained — not a medical measurement. Tap a muscle for detail.</div>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 14, marginBottom: 2 }}>Weekly Muscle Volume</h2>
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 8 }}>Total weight moved per muscle group, last 7 days.</div>
        {muscleVolume.some((m) => m.volume > 0) ? (
          <ResponsiveContainer width="100%" height={160}>
            <BarChart data={muscleVolume}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="label" stroke="var(--ink-dim)" fontSize={10} />
              <YAxis stroke="var(--ink-dim)" fontSize={10} />
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} formatter={(v) => [`${v}kg`, "Volume"]} />
              <Bar dataKey="volume" fill="var(--brass)" radius={[4, 4, 0, 0]} />
            </BarChart>
          </ResponsiveContainer>
        ) : <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Log a workout this week to see your volume by muscle group.</div>}
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 14, marginBottom: 2 }}>Consistency</h2>
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 10 }}>Last 12 weeks — darker means more sets logged that day.</div>
        <div style={{ display: "grid", gridTemplateRows: "repeat(7, 1fr)", gridAutoFlow: "column", gap: 3, overflowX: "auto", paddingBottom: 4 }}>
          {grid.map((d) => {
            const shade = d.future ? "transparent" : d.count === 0 ? "var(--bg-elev2)" : d.count < 3 ? "var(--brass-soft)" : d.count < 6 ? "#2f8f66" : "var(--brass)";
            return (
              <div
                key={d.date}
                title={d.future ? "" : `${d.date}: ${d.count} set${d.count === 1 ? "" : "s"}`}
                style={{ width: 11, height: 11, borderRadius: 2, background: shade, border: d.future ? "none" : "1px solid var(--line)" }}
              />
            );
          })}
        </div>
        <div style={{ display: "flex", alignItems: "center", gap: 4, marginTop: 8, fontSize: 9.5, color: "var(--ink-dim)" }} className="mono">
          <span>Less</span>
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--bg-elev2)", border: "1px solid var(--line)", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--brass-soft)", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "#2f8f66", display: "inline-block" }} />
          <span style={{ width: 10, height: 10, borderRadius: 2, background: "var(--brass)", display: "inline-block" }} />
          <span>More</span>
        </div>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Bodyweight</h2>
        {weightData.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={weightData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={10} />
              <YAxis stroke="var(--ink-dim)" fontSize={10} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} />
              <Line type="monotone" dataKey="weight" stroke="var(--brass)" strokeWidth={2} dot={false} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Log your weight a few times to see a trend.</div>}
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <div className="disp" style={{ fontSize: 14 }}>Strength</div>
          <select className="atlas-input" style={{ width: "auto", fontSize: 12 }} value={selected} onChange={(e) => setSelected(e.target.value)} aria-label="Select exercise">
            {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>

        {selectedStats?.weightPR && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <div style={{ flex: "1 1 30%", background: "var(--bg-elev2)", borderRadius: 8, padding: "8px 10px" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>HEAVIEST</div>
              <div className="mono" style={{ fontSize: 14 }}>{selectedStats.weightPR.weight}kg</div>
            </div>
            <div style={{ flex: "1 1 30%", background: "var(--bg-elev2)", borderRadius: 8, padding: "8px 10px" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>BEST SET (REPS)</div>
              <div className="mono" style={{ fontSize: 14 }}>{selectedStats.repPR.weight}kg × {selectedStats.repPR.reps}</div>
            </div>
            <div style={{ flex: "1 1 30%", background: "var(--bg-elev2)", borderRadius: 8, padding: "8px 10px" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>EST. 1RM</div>
              <div className="mono" style={{ fontSize: 14 }}>{Math.round(selectedStats.oneRMPR.oneRM)}kg</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {Object.values(METRIC_META).map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)} className="pill" style={{ cursor: "pointer", border: `1px solid ${metric === m.key ? m.color : "var(--line)"}`, background: metric === m.key ? m.color + "22" : "transparent", color: metric === m.key ? m.color : "var(--ink-dim)" }}>
              {m.label}
            </button>
          ))}
        </div>

        {strengthData.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={strengthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={10} />
              <YAxis stroke="var(--ink-dim)" fontSize={10} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} formatter={(v) => [`${v}${METRIC_META[metric].unit}`, METRIC_META[metric].label]} />
              <Line type="monotone" dataKey={METRIC_META[metric].key} stroke={METRIC_META[metric].color} strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Log this exercise a couple more times to see a trend.</div>}
        {metric === "1rm" && strengthData.length > 1 && (
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 6, fontStyle: "italic" }}>Estimated from your sets (Epley formula) — most accurate under ~12 reps.</div>
        )}
      </div>

      <div className="atlas-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8, gap: 8, flexWrap: "wrap" }}>
          <h2 className="disp" style={{ fontSize: 14 }}>Personal Records</h2>
          <div style={{ display: "flex", gap: 4 }}>
            {[["byExercise", "By Exercise"], ["timeline", "Timeline"]].map(([k, label]) => (
              <button
                key={k}
                onClick={() => setPrView(k)}
                className="pill"
                style={{ cursor: "pointer", border: `1px solid ${prView === k ? "var(--brass)" : "var(--line)"}`, background: prView === k ? "var(--brass-soft)" : "transparent", color: prView === k ? "var(--brass)" : "var(--ink-dim)" }}
              >
                {label}
              </button>
            ))}
          </div>
        </div>
        {prs.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No PRs logged yet.</div>}

        {prView === "byExercise" && (
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            {prs.map((p) => {
              const spark = sparklinePoints(workouts, p.name);
              return (
                <div key={p.name} style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
                  <button
                    onClick={() => setPrExpanded(prExpanded === p.name ? null : p.name)}
                    style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minHeight: 44, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink)", fontSize: 13, gap: 8 }}
                  >
                    <span style={{ display: "flex", alignItems: "center", gap: 5, minWidth: 0, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}><Trophy size={12} color="var(--brass)" style={{ flexShrink: 0 }} /> {p.name}</span>
                    <span style={{ display: "flex", alignItems: "center", gap: 8, flexShrink: 0 }}>
                      {spark && (
                        <svg width="64" height="20" viewBox="0 0 64 20" aria-hidden="true">
                          <polyline points={spark} fill="none" stroke="var(--steel)" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" />
                        </svg>
                      )}
                      <span className="mono">{p.weightPR.weight}kg × {p.weightPR.reps}</span>
                    </span>
                  </button>
                  {prExpanded === p.name && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--steel)" }}>Weight PR: {p.weightPR.weight}kg × {p.weightPR.reps} · {fmtDate(p.weightPR.date)}</span>
                      <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--good)" }}>Rep PR: {p.repPR.weight}kg × {p.repPR.reps} · {fmtDate(p.repPR.date)}</span>
                      <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--brass)" }}>Est. 1RM PR: {Math.round(p.oneRMPR.oneRM)}kg · {fmtDate(p.oneRMPR.date)}</span>
                      {p.volumePR && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--warn)" }}>Volume PR: {Math.round(p.volumePR.volume)}kg · {fmtDate(p.volumePR.date)}</span>}
                    </div>
                  )}
                </div>
              );
            })}
          </div>
        )}

        {prView === "timeline" && (
          timeline.length === 0 ? <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No PRs logged yet.</div> : (
            <div style={{ display: "flex", flexDirection: "column", gap: 0 }}>
              {timeline.map((ev, i) => (
                <div key={`${ev.name}-${ev.kind}-${ev.date}-${i}`} style={{ display: "flex", gap: 10, padding: "8px 0", borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
                  <div style={{ width: 60, flexShrink: 0 }} className="mono">
                    <span style={{ fontSize: 10, color: "var(--ink-dim)" }}>{fmtDate(ev.date)}</span>
                  </div>
                  <Trophy size={13} color={ev.kind === "1rm" ? "var(--brass)" : "var(--steel)"} style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5 }}>
                    <span>{ev.name}</span> — <span className="mono" style={{ color: ev.kind === "1rm" ? "var(--brass)" : "var(--steel)" }}>{ev.kind === "1rm" ? "New est. 1RM" : "New weight PR"}: {ev.detail}</span>
                  </div>
                </div>
              ))}
            </div>
          )
        )}
      </div>
    </div>
  );
}
