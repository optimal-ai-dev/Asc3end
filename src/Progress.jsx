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

/* Body transformation: earliest vs latest weight + earliest vs best per lift */
function transformationSummary(weightlog, workouts) {
  if (weightlog.length < 2) return null;
  const sorted = [...weightlog].sort((a, b) => new Date(a.date) - new Date(b.date));
  const first = sorted[0], last = sorted[sorted.length - 1];
  const weightChange = +(last.weight - first.weight).toFixed(1);
  const weeks = Math.max(1, Math.round((new Date(last.date) - new Date(first.date)) / (7 * 86400000)));
  const lifts = ["bench", "squat", "deadlift"].map((k) => {
    const name = STRENGTH_STANDARDS[k].exercise;
    const history = workouts.filter((w) => w.exercises.some((e) => e.name === name)).sort((a, b) => new Date(a.date) - new Date(b.date));
    if (history.length < 2) return null;
    const earliest = Math.max(...history[0].exercises.find((e) => e.name === name).sets.map((s) => s.weight));
    const latest = Math.max(...history[history.length - 1].exercises.find((e) => e.name === name).sets.map((s) => s.weight));
    return { name: name.split(" (")[0], change: +(latest - earliest).toFixed(1) };
  }).filter(Boolean);
  return { weightChange, weeks, lifts };
}

export default function Progress({ profile, workouts, weightlog }) {
  const exerciseNames = [...new Set(workouts.flatMap((w) => w.exercises.map((e) => e.name)))];
  const [selected, setSelected] = useState(exerciseNames[0] || "");

  const weightData = weightlog.map((w) => ({ date: fmtDate(w.date), weight: w.weight })).slice(-20);
  const strengthData = workouts
    .filter((w) => w.exercises.some((e) => e.name === selected))
    .sort((a, b) => new Date(a.date) - new Date(b.date))
    .map((w) => {
      const ex = w.exercises.find((e) => e.name === selected);
      return { date: fmtDate(w.date), top: Math.max(...ex.sets.map((s) => s.weight)) };
    });

  const prs = exerciseNames.map((name) => {
    const all = workouts.flatMap((w) => w.exercises.filter((e) => e.name === name).map((e) => ({ date: w.date, sets: e.sets })));
    let best = { weight: 0, reps: 0, date: null };
    all.forEach((a) => a.sets.forEach((s) => { if (s.weight > best.weight) best = { weight: s.weight, reps: s.reps, date: a.date }; }));
    return { name, ...best };
  }).filter((p) => p.weight > 0);

  const prByName = Object.fromEntries(prs.map((p) => [p.name, p.weight]));
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
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 2 }}>Stronger than ~{r.percentile}% of lifters at your bodyweight</div>
              </div>
            ))}
          </div>
          <div style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic" }}>Rough estimate based on bodyweight ratios, not a certified standard.</div>
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
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="disp" style={{ fontSize: 14 }}>Strength</div>
          <select className="atlas-input" style={{ width: "auto", fontSize: 12 }} value={selected} onChange={(e) => setSelected(e.target.value)}>
            {exerciseNames.map((n) => <option key={n} value={n}>{n}</option>)}
          </select>
        </div>
        {strengthData.length > 1 ? (
          <ResponsiveContainer width="100%" height={160}>
            <LineChart data={strengthData}>
              <CartesianGrid strokeDasharray="3 3" stroke="var(--line)" />
              <XAxis dataKey="date" stroke="var(--ink-dim)" fontSize={10} />
              <YAxis stroke="var(--ink-dim)" fontSize={10} domain={["auto", "auto"]} />
              <Tooltip contentStyle={{ background: "var(--bg-elev)", border: "1px solid var(--line)", fontSize: 12 }} />
              <Line type="monotone" dataKey="top" stroke="var(--steel)" strokeWidth={2} dot={{ r: 3 }} />
            </LineChart>
          </ResponsiveContainer>
        ) : <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Log this exercise a couple more times to see a trend.</div>}
      </div>

      <div className="atlas-card">
        <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Personal Records</div>
        {prs.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No PRs logged yet.</div>}
        <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
          {prs.map((p) => (
            <div key={p.name} style={{ display: "flex", justifyContent: "space-between", fontSize: 13, borderTop: "1px solid var(--line)", paddingTop: 6 }}>
              <span style={{ display: "flex", alignItems: "center", gap: 5 }}><Trophy size={12} color="var(--brass)" /> {p.name}</span>
              <span className="mono">{p.weight}kg × {p.reps}</span>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}
