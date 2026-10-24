import { useState } from "react";
import { Droplet, Undo2, Plus } from "lucide-react";
import { todayStr } from "../lib/dateUtils";
import { WATER_QUICK_ADDS, waterGoalMl, waterForDate, formatMl } from "../lib/water";

export function WaterTracker({ profile, water = [], onAdd, onDelete, onUpdateProfile }) {
  const [custom, setCustom] = useState("");
  const [editingGoal, setEditingGoal] = useState(false);
  const [goalInput, setGoalInput] = useState("");
  const today = todayStr();
  const goal = waterGoalMl(profile);
  const total = waterForDate(water, today);
  const todays = water.filter((w) => w.date === today);
  const last = todays[todays.length - 1];
  const pct = Math.min(100, (total / goal) * 100);
  // One drop per 250 ml glass, MyFitnessPal-style, capped so a big goal doesn't wrap into rows.
  const glasses = Math.min(16, Math.round(goal / 250));
  const filled = Math.floor(total / 250);

  const addCustom = () => {
    const ml = Math.round(+custom);
    if (!ml || ml <= 0 || ml > 5000) return;
    onAdd(ml);
    setCustom("");
  };

  const saveGoal = () => {
    const ml = Math.round(+goalInput);
    if (ml >= 500 && ml <= 8000) onUpdateProfile?.({ ...profile, waterGoalMl: ml });
    setEditingGoal(false);
  };

  return (
    <div className="atlas-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
        <h2 className="disp" style={{ fontSize: 16, display: "flex", alignItems: "center", gap: 6 }}>
          <Droplet size={16} color="var(--steel)" fill="var(--steel)" /> Water
        </h2>
        {editingGoal ? (
          <span style={{ display: "flex", gap: 4, alignItems: "center" }}>
            <input className="atlas-input" type="number" inputMode="numeric" value={goalInput} onChange={(e) => setGoalInput(e.target.value)}
              style={{ width: 84, padding: "4px 8px" }} aria-label="Daily water goal in millilitres" autoFocus />
            <button className="atlas-btn-ghost" style={{ padding: "4px 10px", fontSize: 12 }} onClick={saveGoal}>Save</button>
          </span>
        ) : (
          <button onClick={() => { setGoalInput(String(goal)); setEditingGoal(true); }} className="mono"
            style={{ background: "none", border: "none", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", padding: 0 }} aria-label="Change daily water goal">
            Goal {formatMl(goal)} ✎
          </button>
        )}
      </div>

      <div className="mono" style={{ fontSize: 28, fontWeight: 800, lineHeight: 1.1 }}>
        {formatMl(total)}<span style={{ fontSize: 13, color: "var(--ink-dim)", fontWeight: 600 }}> / {formatMl(goal)}</span>
      </div>
      <div className="bar-track" style={{ marginTop: 8 }}><div className="bar-fill" style={{ width: `${pct}%`, background: "var(--steel)" }} /></div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 3, marginTop: 8 }} aria-hidden="true">
        {Array.from({ length: glasses }, (_, i) => (
          <Droplet key={i} size={15} color="var(--steel)" fill={i < filled ? "var(--steel)" : "none"} style={{ opacity: i < filled ? 1 : 0.45 }} />
        ))}
      </div>

      <div style={{ display: "flex", gap: 6, marginTop: 12 }}>
        {WATER_QUICK_ADDS.map((q) => (
          <button key={q.ml} onClick={() => onAdd(q.ml)} className="atlas-btn-ghost"
            style={{ flex: 1, padding: "8px 4px", display: "flex", flexDirection: "column", alignItems: "center", gap: 1 }} aria-label={`Add ${q.ml} ml of water`}>
            <span className="mono" style={{ fontSize: 14, fontWeight: 800, color: "var(--steel)" }}>+{q.ml} ml</span>
            <span style={{ fontSize: 10.5, color: "var(--ink-dim)" }}>{q.label}</span>
          </button>
        ))}
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        <input className="atlas-input" type="number" inputMode="numeric" placeholder="Other amount (ml)" value={custom}
          onChange={(e) => setCustom(e.target.value)} onKeyDown={(e) => e.key === "Enter" && addCustom()} aria-label="Custom water amount in millilitres" />
        <button className="atlas-btn-ghost" style={{ padding: "8px 12px" }} onClick={addCustom} disabled={!custom} aria-label="Add custom water amount">
          <Plus size={14} />
        </button>
        <button className="atlas-btn-ghost" style={{ padding: "8px 12px" }} onClick={() => last && onDelete(last.id)} disabled={!last}
          aria-label={last ? `Undo last water entry (${last.ml} ml)` : "Undo last water entry"} title="Undo last">
          <Undo2 size={14} />
        </button>
      </div>
    </div>
  );
}
