import React, { useState, useMemo, useEffect } from "react";
import { Trophy, ChevronLeft, ChevronRight, X, FileText } from "lucide-react";
import {
  LineChart, Line, BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";
import {
  muscleReadiness, FrontBodyFigure, BackBodyFigure, MuscleReadinessLegend, MuscleRecoveryDetails, MuscleReadinessTextList,
  EXERCISES, MUSCLE_GROUPS, classifyDayAdherence, ADHERENCE_COLOR, ADHERENCE_LABEL, workoutVolume,
} from "./App.jsx";
import { getNutritionTargets } from "./lib/nutritionMath";
import { READINESS_EXPLAINER } from "./lib/readiness";
import { formatDateOnly, today as localToday, addDays } from "./lib/dates";
import { workingSets } from "./lib/workoutMath";
import {
  exerciseNamesWithData, exerciseRecords, strengthSeries, sparklineValues, prTimeline as buildPrTimeline,
  historicalPrEvents, bestWeightFor, liftChange, muscleVolumeInRange as muscleVolumeInRangeData,
  weeklyMuscleVolume as weeklyMuscleVolumeData, consistencyGrid as consistencyGridData,
  monthRange, shiftMonthKey, sessionsPerWeek,
} from "./lib/progressData";

/* muscleReadiness/the body figures are imported from App.jsx rather than reimplemented here so
   the full map on this page can never drift out of sync with the compact one on Home — both read
   the exact same per-region calculation and the exact same SVG region paths. This doesn't add to
   Progress's own lazy-loaded bundle weight: App.jsx is already fully loaded and evaluated by the
   time a user can navigate to this tab, since Progress only ever renders from inside the
   already-running App tree. */

// Desktop shows front and back figures side by side; narrow/mobile shows one at a time via a
// segmented control, since two full-height figures side by side would be unusably small on a
// 320-390px phone. 768px matches the app's existing tablet breakpoint convention.
function useIsDesktop() {
  const [isDesktop, setIsDesktop] = useState(() => typeof window !== "undefined" && window.innerWidth >= 768);
  useEffect(() => {
    const mq = window.matchMedia("(min-width: 768px)");
    const onChange = () => setIsDesktop(mq.matches);
    onChange();
    mq.addEventListener("change", onChange);
    return () => mq.removeEventListener("change", onChange);
  }, []);
  return isDesktop;
}

/* This file is loaded lazily (see App.jsx) so recharts — the single largest dependency in the
   app (~525KB) — is only downloaded when someone actually opens the Progress tab, instead of
   being part of every page load. */

function fmtDate(iso) {
  return formatDateOnly(iso, { month: "short", day: "numeric" });
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

/* Body transformation: earliest vs latest weight + earliest vs best per lift.
   Returns a typed result so the UI can tell "not enough data yet" apart from "a real trend
   over too short a span to call it weekly" apart from "here's your real multi-week trend" —
   collapsing all three into one generic "Over 1 week..." sentence is what previously produced
   a nonsensical "increased by 0kg" message from two same-day entries. */
function transformationSummary(weightlog, workouts, customExercises) {
  if (weightlog.length === 0) return null; // nothing to say yet — the Bodyweight card below already prompts to log a first entry
  if (weightlog.length === 1) return { kind: "baseline" };
  const sorted = [...weightlog].sort((a, b) => (a.date < b.date ? -1 : a.date > b.date ? 1 : 0));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const days = Math.round((Date.parse(last.date) - Date.parse(first.date)) / 86400000);
  const weightChange = +(last.weight - first.weight).toFixed(1);
  if (days < 3) return { kind: "tooSoon", days, weightChange };
  const weeks = Math.max(1, Math.round(days / 7));
  // liftChange only looks at real working sets with a real weight, so an exercise added to a
  // session but never logged (or a warm-up) can't produce a bogus change.
  const lifts = ["bench", "squat", "deadlift"].map((k) => {
    const name = STRENGTH_STANDARDS[k].exercise;
    const change = liftChange(workouts, name, customExercises);
    return change == null ? null : { name: name.split(" (")[0], change };
  }).filter(Boolean);
  return { kind: "trend", weightChange, weeks, lifts };
}

const MUSCLE_LABEL = { chest: "Chest", back: "Back", shoulders: "Shoulders", arms: "Arms", legs: "Legs", core: "Core" };

/* Per-muscle volume / consistency / PR maths live in ./lib/progressData (pure + unit-tested) so a
   duration-only exercise can never produce kg, reps or an estimated 1RM here. */
function withLabels(rows) {
  return rows.filter((r) => MUSCLE_LABEL[r.muscle]).map((r) => ({ ...r, label: MUSCLE_LABEL[r.muscle] }));
}
const weeklyMuscleVolume = (workouts, customExercises) => withLabels(weeklyMuscleVolumeData(workouts, customExercises));
const muscleVolumeInRange = (workouts, customExercises, startIso, endIso) => withLabels(muscleVolumeInRangeData(workouts, customExercises, startIso, endIso));
const consistencyGrid = (workouts, weeks) => consistencyGridData(workouts, weeks);

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

/* Small inline trend line for one exercise's primary metric over its last few sessions — a
   sparkline, not a full chart: no axes/labels, just shape. */
function sparklinePoints(workouts, name, customExercises, width = 64, height = 20) {
  const values = sparklineValues(workouts, name, customExercises);
  if (values.length < 2) return null;
  const min = Math.min(...values), max = Math.max(...values);
  const range = max - min || 1;
  return values.map((v, i) => `${(i / (values.length - 1)) * width},${height - ((v - min) / range) * height}`).join(" ");
}

/* ------------------------------------------------------------------ */
/* Monthly Report                                                      */
/* ------------------------------------------------------------------ */

/* Count of days in [startIso, endIso] at each adherence level — same per-day rule as Home's
   weeklyAdherence(), just totaled over a month instead of shown as 7 individual chips. */
function monthlyAdherenceSummary(nutrition, targets, startIso, endIso, daysInMonth) {
  const counts = { good: 0, partial: 0, off: 0, none: 0 };
  const todayIso = localToday();
  for (let i = 0; i < daysInMonth; i++) {
    const iso = addDays(startIso, i);
    if (iso > todayIso) break; // don't count future days of the current month as "nothing logged"
    const dayFoods = nutrition.filter((n) => n.date === iso);
    counts[classifyDayAdherence(dayFoods, targets)]++;
  }
  return counts;
}

function MonthlyReport({ workouts, nutrition, weightlog, customExercises, profile, onClose }) {
  const [monthKey, setMonthKey] = useState(() => localToday().slice(0, 7));
  const range = useMemo(() => monthRange(monthKey), [monthKey]);
  const prevRange = useMemo(() => monthRange(shiftMonthKey(monthKey, -1)), [monthKey]);

  const monthWorkouts = useMemo(() => workouts.filter((w) => w.date >= range.startIso && w.date <= range.endIso), [workouts, range]);
  const prevMonthWorkouts = useMemo(() => workouts.filter((w) => w.date >= prevRange.startIso && w.date <= prevRange.endIso), [workouts, prevRange]);

  const totalSets = monthWorkouts.reduce((n, w) => n + w.exercises.reduce((n2, e) => n2 + workingSets(e).length, 0), 0);
  const totalVolume = Math.round(monthWorkouts.reduce((s, w) => s + workoutVolume(w), 0));
  const daysTrained = new Set(monthWorkouts.map((w) => w.date)).size;
  const prevVolume = Math.round(prevMonthWorkouts.reduce((s, w) => s + workoutVolume(w), 0));
  const volumeChangePct = prevVolume > 0 ? Math.round(((totalVolume - prevVolume) / prevVolume) * 100) : null;

  const volumeByMuscle = useMemo(() => muscleVolumeInRange(workouts, customExercises, range.startIso, range.endIso), [workouts, customExercises, range]);

  const monthPrs = useMemo(
    () => historicalPrEvents(workouts, customExercises).filter((ev) => ev.date >= range.startIso && ev.date <= range.endIso),
    [workouts, customExercises, range]
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
  const exerciseNames = useMemo(() => exerciseNamesWithData(workouts, customExercises), [workouts, customExercises]);
  const [selectedRaw, setSelected] = useState("");
  // Keeps the dropdown on a real exercise even if the one chosen has since lost all its data
  // (e.g. its only set was deleted), instead of rendering an empty/NaN chart.
  const selected = exerciseNames.includes(selectedRaw) ? selectedRaw : (exerciseNames[0] || "");
  const [metricRaw, setMetric] = useState("weight");
  const [prExpanded, setPrExpanded] = useState(null);
  const [prView, setPrView] = useState("byExercise"); // byExercise | timeline
  const [showMonthlyReport, setShowMonthlyReport] = useState(false);
  const [mapView, setMapView] = useState("front");
  const [selectedRegion, setSelectedRegion] = useState(null);
  const readiness = useMemo(() => muscleReadiness(workouts, customExercises), [workouts, customExercises]);
  const readinessUpdatedAt = useMemo(() => new Date().toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" }), [readiness]);
  const isDesktop = useIsDesktop();

  // Dedupe same-day entries (keep the latest) before charting — otherwise logging twice in one
  // day plots two points with an identical x-axis label, which reads as a rendering bug.
  const weightByDate = new Map();
  [...weightlog].sort((a, b) => new Date(a.date) - new Date(b.date)).forEach((w) => weightByDate.set(w.date, w.weight));
  const weightData = [...weightByDate.entries()].map(([date, weight]) => ({ date: fmtDate(date), weight })).slice(-20);

  // Everything below is read through the shared measurement model (./lib/progressData): a
  // duration-only exercise gets duration records and a duration chart — never kg, reps or 1RM.
  const series = useMemo(() => strengthSeries(workouts, selected, customExercises), [workouts, selected, customExercises]);
  const METRIC_META = Object.fromEntries(series.metrics.map((m) => [m.key, m]));
  const metric = METRIC_META[metricRaw] ? metricRaw : (series.metrics[0]?.key || "weight");
  const strengthData = series.points.map((pt) => ({ ...pt, date: fmtDate(pt.date) }));
  const selectedStats = useMemo(() => (selected ? exerciseRecords(workouts, selected, customExercises) : null), [workouts, selected, customExercises]);
  const prs = useMemo(
    () => exerciseNames.map((name) => ({ name, ...exerciseRecords(workouts, name, customExercises) })).filter((r) => r.hasData),
    [exerciseNames, workouts, customExercises]
  );

  const ranks = Object.entries(STRENGTH_STANDARDS)
    .map(([key, s]) => ({ key, ...strengthRank(bestWeightFor(workouts, s.exercise, customExercises), profile.weightKg, profile.gender, key) }))
    .filter((r) => r.percentile != null);

  const transformation = useMemo(() => transformationSummary(weightlog, workouts, customExercises), [weightlog, workouts, customExercises]);
  const muscleVolume = useMemo(() => weeklyMuscleVolume(workouts, customExercises), [workouts, customExercises]);
  const grid = useMemo(() => consistencyGrid(workouts, 12), [workouts]);
  const timeline = useMemo(() => buildPrTimeline(workouts, customExercises), [workouts, customExercises]);

  // Goal trajectory: pick the metric that actually matches the athlete's stated goal, and only
  // project a trend when there's enough real data to make extrapolation more than a guess.
  const trajectory = useMemo(() => {
    if (profile.goal === "strength") {
      for (const key of ["bench", "squat", "deadlift"]) {
        const name = STRENGTH_STANDARDS[key].exercise;
        const pts = strengthSeries(workouts, name, customExercises).points.filter((pt) => Number.isFinite(pt["1rm"]));
        if (pts.length < 3) continue;
        const t0 = Date.parse(pts[0].date);
        const points = pts.map((pt) => ({ x: (Date.parse(pt.date) - t0) / 86400000, y: pt["1rm"], date: pt.date }));
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
    const weeks = sessionsPerWeek(workouts, 8);
    if (weeks.length < 3) return null;
    return {
      kind: "sessions", label: "Sessions per week", unit: "sessions",
      data: weeks.map(([date, count]) => ({ date: fmtDate(date), value: count })),
      weeklyRate: null,
    };
  }, [profile.goal, workouts, weightlog, customExercises]);

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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 4, gap: 8, flexWrap: "wrap" }}>
          <h2 className="disp" style={{ fontSize: 14 }}>Muscle Readiness Map</h2>
          {!isDesktop && (
            <div style={{ display: "flex", gap: 4 }} role="tablist" aria-label="Front or back view">
              {["front", "back"].map((v) => (
                <button
                  key={v}
                  onClick={() => { setMapView(v); setSelectedRegion(null); }}
                  role="tab"
                  aria-selected={mapView === v}
                  className="pill"
                  style={{ cursor: "pointer", textTransform: "capitalize", minHeight: 40, minWidth: 56, border: `1px solid ${mapView === v ? "var(--brass)" : "var(--line)"}`, background: mapView === v ? "var(--brass-soft)" : "transparent", color: mapView === v ? "var(--brass)" : "var(--ink-dim)" }}
                >
                  {v}
                </button>
              ))}
            </div>
          )}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 10 }}>Last updated {readinessUpdatedAt}</div>

        {isDesktop ? (
          // Figures on the left (fixed width, ~380px tall each), detail panel filling the rest of
          // the card's width to the right — this is what actually uses the available card width;
          // stretching the figures themselves to fill it would just distort their proportions.
          <div style={{ display: "flex", gap: 24, alignItems: "flex-start", flexWrap: "wrap" }}>
            <div style={{ display: "flex", gap: 16, flexShrink: 0 }}>
              <div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", textAlign: "center", marginBottom: 4 }}>FRONT</div>
                <FrontBodyFigure readiness={readiness} selected={selectedRegion} onSelect={(k) => setSelectedRegion(selectedRegion === k ? null : k)} maxWidth={125} />
              </div>
              <div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", textAlign: "center", marginBottom: 4 }}>BACK</div>
                <BackBodyFigure readiness={readiness} selected={selectedRegion} onSelect={(k) => setSelectedRegion(selectedRegion === k ? null : k)} maxWidth={125} />
              </div>
            </div>
            <div style={{ flex: "1 1 240px", minWidth: 240 }}>
              <MuscleReadinessLegend />
              <div style={{ marginTop: 12 }}>
                {selectedRegion ? (
                  <MuscleRecoveryDetails regionId={selectedRegion} readiness={readiness} />
                ) : (
                  <div className="empty-state" style={{ padding: "20px 12px" }}>
                    <div className="empty-state-body">Select a muscle on either figure to see its readiness detail.</div>
                  </div>
                )}
              </div>
            </div>
          </div>
        ) : (
          <>
            {mapView === "front" ? (
              <FrontBodyFigure readiness={readiness} selected={selectedRegion} onSelect={(k) => setSelectedRegion(selectedRegion === k ? null : k)} maxWidth={300} />
            ) : (
              <BackBodyFigure readiness={readiness} selected={selectedRegion} onSelect={(k) => setSelectedRegion(selectedRegion === k ? null : k)} maxWidth={300} />
            )}
            <div style={{ marginTop: 10 }}>
              <MuscleReadinessLegend />
            </div>
            {selectedRegion && (
              <div style={{ marginTop: 10 }}>
                <MuscleRecoveryDetails regionId={selectedRegion} readiness={readiness} />
              </div>
            )}
          </>
        )}

        <details style={{ marginTop: 12 }}>
          <summary style={{ cursor: "pointer", fontSize: 11, color: "var(--ink-dim)", minHeight: 28, display: "inline-flex", alignItems: "center" }}>Show as text list</summary>
          <div style={{ marginTop: 8 }}>
            <MuscleReadinessTextList readiness={readiness} view={isDesktop ? "both" : mapView} />
          </div>
        </details>

        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic", lineHeight: 1.6 }}>
          {READINESS_EXPLAINER} Tap or select a muscle for detail.
        </div>
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

        {selectedStats?.hasData && (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            {selectedStats.records.slice(0, 3).map((r) => (
              <div key={r.key} style={{ flex: "1 1 30%", background: "var(--bg-elev2)", borderRadius: 8, padding: "8px 10px" }}>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{r.label.toUpperCase()}</div>
                <div className="mono" style={{ fontSize: 14 }}>{r.text}</div>
              </div>
            ))}
          </div>
        )}

        <div style={{ display: "flex", gap: 5, marginBottom: 10 }}>
          {series.metrics.length > 1 && Object.values(METRIC_META).map((m) => (
            <button key={m.key} onClick={() => setMetric(m.key)} aria-pressed={metric === m.key} className="pill" style={{ cursor: "pointer", border: `1px solid ${metric === m.key ? m.color : "var(--line)"}`, background: metric === m.key ? m.color + "22" : "transparent", color: metric === m.key ? m.color : "var(--ink-dim)" }}>
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
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} formatter={(v) => [`${v}${METRIC_META[metric]?.unit === "reps" || METRIC_META[metric]?.unit === "s" || METRIC_META[metric]?.unit === "m" ? " " : ""}${METRIC_META[metric]?.unit || ""}`, METRIC_META[metric]?.label || ""]} />
              <Line type="monotone" dataKey={METRIC_META[metric]?.key} stroke={METRIC_META[metric]?.color} strokeWidth={2} dot={{ r: 3 }} />
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
              const spark = sparklinePoints(workouts, p.name, customExercises);
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
                      <span className="mono">{p.headline}</span>
                    </span>
                  </button>
                  {prExpanded === p.name && (
                    <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8 }}>
                      {p.records.map((r, ri) => (
                        <span key={r.key} className="pill mono" style={{ background: "var(--bg-elev2)", color: ["var(--steel)", "var(--good)", "var(--brass)", "var(--warn)"][ri % 4] }}>{r.label}: {r.text} · {fmtDate(r.date)}</span>
                      ))}
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
                  <Trophy size={13} color="var(--steel)" style={{ flexShrink: 0, marginTop: 1 }} />
                  <div style={{ fontSize: 12.5 }}>
                    <span>{ev.name}</span> — <span className="mono" style={{ color: "var(--steel)" }}>{ev.label}: {ev.detail}</span>
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
