import React, { useState, useMemo } from "react";
import { Trophy } from "lucide-react";
import {
  LineChart, Line, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer
} from "recharts";

/* This file is loaded lazily (see App.jsx) so recharts — the single largest dependency in the
   app (~525KB) — is only downloaded when someone actually opens the Progress tab, instead of
   being part of every page load. */

function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}

/* Approximate bodyweight-ratio strength standards (illustrative, not a certified table) */
const STRENGTH_STANDARDS = {
  bench: { exercise: "Bench Press (Barbell)", male: [0.5, 0.75, 1.0, 1.5, 1.75], female: [0.3, 0.45, 0.65, 0.95, 1.15] },
  squat: { exercise: "Squat (Barbell)", male: [0.75, 1.0, 1.5, 2.0, 2.5], female: [0.55, 0.75, 1.15, 1.6, 2.0] },
  deadlift: { exercise: "Deadlift (Barbell)", male: [1.0, 1.25, 1.75, 2.25, 2.75], female: [0.75, 1.0, 1.4, 1.85, 2.3] },
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

export default function Progress({ profile, workouts, weightlog }) {
  const exerciseNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const [selected, setSelected] = useState(exerciseNames[0] || "");
  const [metric, setMetric] = useState("weight"); // weight | 1rm | volume
  const [prExpanded, setPrExpanded] = useState(null);

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

  return (
    <div style={{ padding: "24px 18px" }}>
      <div className="disp" style={{ fontSize: 26, marginBottom: 16 }}>Progress</div>

      {transformation && (
        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div className="disp" style={{ fontSize: 14, marginBottom: 6 }}>Transformation</div>
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

      {ranks.length > 0 && (
        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Strength Ranking</div>
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
        <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Bodyweight</div>
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
        <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Personal Records</div>
        {prs.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No PRs logged yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {prs.map((p) => (
            <div key={p.name} style={{ borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              <button
                onClick={() => setPrExpanded(prExpanded === p.name ? null : p.name)}
                style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", minHeight: 44, background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--ink)", fontSize: 13 }}
              >
                <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Trophy size={12} color="var(--brass)" /> {p.name}</span>
                <span className="mono">{p.weightPR.weight}kg × {p.weightPR.reps}</span>
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
          ))}
        </div>
      </div>
    </div>
  );
}
