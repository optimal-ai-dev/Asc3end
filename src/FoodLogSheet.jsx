import React, { useState } from "react";
import { X, Plus, AlertTriangle } from "lucide-react";
import { checkMacroConsistency } from "./lib/macroCheck.js";

const field = { flex: "1 1 64px", minWidth: 60, display: "flex", flexDirection: "column", gap: 2 };

/**
 * Confirmation step before any uncertain value is logged. Nothing produced by an AI, a photo or a
 * product database is saved until the athlete has seen the numbers, can edit every one of them, and
 * has tapped "Add to log". Disagreements between calories and macros are surfaced, never silently fixed.
 *
 * initial: { name, calories, protein, carbs, fat, source, estimated, portionNote, rangeNote, sourceNote }
 */
export function MacroConsistencyNote({ values, onUseSuggested }) {
  const check = checkMacroConsistency(values);
  if (check.status === "consistent" || check.status === "incomplete") return null;
  const bad = check.status === "inconsistent";
  return (
    <div role={bad ? "alert" : "status"} style={{ display: "flex", gap: 8, alignItems: "flex-start", padding: "8px 10px", borderRadius: 8, border: `1px solid ${bad ? "var(--warn)" : "var(--line)"}`, background: bad ? "rgba(255,165,61,0.08)" : "var(--bg-elev2)", fontSize: 12, lineHeight: 1.5 }}>
      <AlertTriangle size={14} color={bad ? "var(--warn)" : "var(--ink-dim)"} style={{ flexShrink: 0, marginTop: 2 }} />
      <div style={{ flex: 1 }}>
        <div>{check.message}</div>
        {check.suggestedCalories != null && onUseSuggested && (
          <button type="button" className="mono" onClick={() => onUseSuggested(check.suggestedCalories)} style={{ background: "none", border: "none", color: "var(--brass)", cursor: "pointer", padding: "6px 0 0", fontSize: 12, minHeight: 36 }}>
            Use {check.suggestedCalories} kcal (from the macros)
          </button>
        )}
      </div>
    </div>
  );
}

export default function FoodLogSheet({ initial, onConfirm, onCancel, confirmLabel = "Add to log" }) {
  const [v, setV] = useState({
    name: initial.name || "", calories: initial.calories ?? "", protein: initial.protein ?? "", carbs: initial.carbs ?? "", fat: initial.fat ?? "",
  });
  const [error, setError] = useState(null);
  const set = (k) => (e) => { setV((x) => ({ ...x, [k]: e.target.value })); setError(null); };

  const confirm = () => {
    const name = v.name.trim();
    const calories = Number(v.calories);
    if (!name) { setError("Give it a name."); return; }
    if (v.calories === "" || !Number.isFinite(calories) || calories < 0) { setError("Enter the calories (a number, 0 or more)."); return; }
    const macro = (x) => { const n = Number(x); return x === "" || !Number.isFinite(n) || n < 0 ? 0 : n; };
    onConfirm({
      name, calories: Math.round(calories), protein: Math.round(macro(v.protein)), carbs: Math.round(macro(v.carbs)), fat: Math.round(macro(v.fat)),
      ...(initial.estimated ? { estimated: true } : {}), ...(initial.source ? { source: initial.source } : {}),
      ...(initial.portionNote ? { portionNote: initial.portionNote } : {}),
    });
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Review before logging" style={{ position: "fixed", inset: 0, zIndex: 60, background: "rgba(5,10,8,0.86)", display: "flex", alignItems: "flex-end", justifyContent: "center" }}>
      <div className="atlas-card" style={{ width: "100%", maxWidth: 480, maxHeight: "92vh", overflowY: "auto", borderRadius: "16px 16px 0 0", padding: "16px 16px calc(16px + env(safe-area-inset-bottom))" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
          <div className="disp" style={{ fontSize: 16 }}>Review before logging</div>
          <button type="button" aria-label="Cancel" onClick={onCancel} style={{ background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer", minWidth: 44, minHeight: 44 }}><X size={18} /></button>
        </div>

        {initial.estimated && (
          <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5, marginBottom: 10 }}>
            <b style={{ color: "var(--warn)" }}>Estimate.</b> {initial.rangeNote || "These numbers are an estimate, not a measurement."}{initial.portionNote ? ` Portion assumed: ${initial.portionNote}.` : ""} Change anything you know to be different.
          </div>
        )}
        {initial.sourceNote && <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 10, lineHeight: 1.5 }}>{initial.sourceNote}</div>}

        <label style={{ display: "block", marginBottom: 10 }}>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>NAME</span>
          <input className="atlas-input" aria-label="Food name" value={v.name} onChange={set("name")} style={{ minHeight: 48 }} />
        </label>
        <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
          {[["calories", "KCAL"], ["protein", "PROTEIN g"], ["carbs", "CARBS g"], ["fat", "FAT g"]].map(([k, label]) => (
            <label key={k} style={field}>
              <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{label}</span>
              <input className="atlas-input" type="text" inputMode="decimal" aria-label={k === "calories" ? "Calories" : `${k} grams`} value={v[k]} onChange={set(k)} style={{ minHeight: 48, textAlign: "center", fontSize: 16 }} />
            </label>
          ))}
        </div>
        <MacroConsistencyNote values={v} onUseSuggested={(kcal) => setV((x) => ({ ...x, calories: kcal }))} />
        {error && <div role="alert" className="mono" style={{ color: "var(--rest)", fontSize: 12, marginTop: 8 }}>{error}</div>}
        <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
          <button type="button" className="atlas-btn-ghost" style={{ flex: 1, minHeight: 48 }} onClick={onCancel}>Cancel</button>
          <button type="button" className="atlas-btn" style={{ flex: 2, minHeight: 48 }} onClick={confirm}><Plus size={14} style={{ verticalAlign: -2, marginRight: 6 }} />{confirmLabel}</button>
        </div>
      </div>
    </div>
  );
}
