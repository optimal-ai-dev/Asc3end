import React, { useState, useEffect, useRef, useMemo } from "react";
import { Plus, X, Check, Trophy, TrendingUp, Loader2, AlertTriangle, MoreHorizontal, ChevronDown, ChevronUp, RefreshCw } from "lucide-react";
import { findExercise } from "./lib/exerciseLookup.js";
import {
  validateSetInput, isSetComplete, formatSet, specFor, weightBasisLabel, setKind, SET_KINDS, MEASUREMENT_SPEC,
} from "./lib/measurement.js";
import { computeProgression, qualifyingSessions, suggestedSetValues, describeTarget } from "./lib/progression.js";
import { computeStreak, computeWorkoutXp, sessionPrEvents, evaluateSetPR } from "./lib/workoutMath.js";
import { describeSaveFailure } from "./lib/workoutSync.js";
import {
  addExercises, removeExercise, restoreExercise, moveExercise, swapExercise, setExerciseNote, setExerciseRest, toggleSuperset,
  supersetRole, logSet, updateSet, removeSet, restoreSet, restSecondsFor, setProgress, sessionTotals, hasLoggedSets,
  adjustRest, clearRest, REST_OPTIONS,
} from "./lib/workoutSession.js";
import { formatDateOnly } from "./lib/dates.js";
import { playPRSound, playRestDoneSound } from "./lib/sounds.js";
import { logEvent } from "./lib/analytics";
import { ExerciseThumb } from "./ExerciseFigures.jsx";
import ExercisePicker from "./ExercisePicker.jsx";
import { POSE_TIPS, getExerciseGuidance } from "./exerciseData.js";

export const SET_TYPE_LABELS = { normal: "Working", warmup: "Warm-up", drop: "Drop set", failure: "To failure", deload: "Deload" };
export const SET_TYPE_COLORS = { normal: "#4F9DFF", warmup: "#3ECF8E", drop: "#FFA53D", failure: "#FF6B81", deload: "#B98CE0" };

const fmtClock = (secs) => {
  const s = Math.max(0, Math.round(secs));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, "0")}`;
};

const iconBtn = { background: "none", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink-dim)" };
const menuBtn = { display: "block", width: "100%", textAlign: "left", background: "none", border: "none", cursor: "pointer", color: "var(--ink)", fontSize: 13, padding: "0 12px", minHeight: 44 };

/* ----------------------------- field helpers ------------------------------ */

export function fieldLabel(field, ex, unit) {
  const t = ex.trackingType;
  switch (field) {
    case "weight":
      if (t === "bodyweight_reps" || t === "bodyweight_plus_weight") return `+${unit} (optional)`;
      return weightBasisLabel(ex).replace("kg", unit);
    case "assistWeight": return `assist ${unit} (optional)`;
    case "reps": return "reps";
    case "durationSeconds": return "seconds";
    case "distanceMeters": return "meters";
    default: return field;
  }
}
const inputModeFor = (field) => (field === "reps" || field === "durationSeconds" ? "numeric" : "decimal");
const toStr = (v) => (v === null || v === undefined ? "" : String(v));

/** Editable string draft for a set of this type from a stored/suggested set. */
export function draftFromSet(set, type) {
  const spec = specFor(type);
  const out = {};
  for (const f of spec.fields) out[f] = set && Number.isFinite(set[f]) && !(f === "weight" && set[f] === 0 && spec.optional?.includes("weight")) ? toStr(set[f]) : "";
  return out;
}

/** Inputs for the exercise's measurement type, with optional-field and basis labels. */
export function SetFields({ ex, unit, draft, setDraft, errors, idPrefix, onEnter }) {
  const spec = specFor(ex.trackingType);
  return (
    <>
      {spec.fields.map((f) => {
        const err = errors?.[f];
        return (
          <label key={f} style={{ flex: "1 1 72px", minWidth: 64, display: "flex", flexDirection: "column", gap: 2 }}>
            <span className="mono" style={{ fontSize: 9.5, color: err ? "var(--rest)" : "var(--ink-dim)", lineHeight: 1.2 }}>{fieldLabel(f, ex, unit).toUpperCase()}</span>
            <input
              id={`${idPrefix}-${f}`}
              className="atlas-input"
              style={{ minHeight: 48, fontSize: 17, textAlign: "center", borderColor: err ? "var(--rest)" : undefined }}
              type="text" inputMode={inputModeFor(f)} enterKeyHint="done" autoComplete="off"
              placeholder={f === "weight" || f === "assistWeight" ? "0" : ""}
              aria-label={`${ex.name} ${fieldLabel(f, ex, unit)}`}
              aria-invalid={err ? true : undefined}
              value={draft[f] ?? ""}
              onChange={(e) => setDraft((d) => ({ ...d, [f]: e.target.value }))}
              onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); onEnter?.(); } }}
            />
          </label>
        );
      })}
    </>
  );
}

/* ------------------------------ exercise card ----------------------------- */

function ExerciseCard({
  ex, index, count, session, workouts, profile, customExercises, now, prSetIds, upNext, onChange, onLogSet, onRequestSwap, onRemove, linkChoices,
}) {
  const unit = session.unit || profile.unit || "kg";
  const type = ex.trackingType || "weight_reps";
  const spec = MEASUREMENT_SPEC[type] || MEASUREMENT_SPEC.weight_reps;
  const meta = useMemo(() => findExercise(ex.name, customExercises), [ex.name, customExercises]);
  const [menuOpen, setMenuOpen] = useState(false);
  const [panel, setPanel] = useState(null); // null | "note" | "rest" | "link" | "cues"
  const [showWhy, setShowWhy] = useState(false);
  const [more, setMore] = useState(false);
  const [kind, setKind_] = useState("normal");
  const [extra, setExtra] = useState({ rpe: "", rir: "" });
  const [errors, setErrors] = useState({});
  const [editing, setEditing] = useState(null); // { setId, draft, kind, extra }
  const [editErrors, setEditErrors] = useState({});

  // Single source of truth for the target and the recommendation: computed from the plan target
  // when there is one, else the athlete's goal, never from two competing places.
  const progression = useMemo(() => computeProgression({
    workouts, exerciseName: ex.name, trackingType: type, goal: profile.goal, planTarget: ex.targetReps,
    equipment: ex.equipment || meta?.equipment, unit,
  }), [workouts, ex.name, ex.targetReps, ex.equipment, type, profile.goal, unit, meta]);

  const lastSession = useMemo(() => qualifyingSessions(workouts, ex.name, type)[0] || null, [workouts, ex.name, type]);
  const prevSets = lastSession?.eligible || [];

  const initialDraft = () => {
    const lastLogged = [...ex.sets].reverse().find((s) => isSetComplete(s, type) && setKind(s) !== "warmup");
    return draftFromSet(lastLogged || suggestedSetValues(progression, type), type);
  };
  const [draft, setDraft] = useState(initialDraft);
  const done = ex.sets.length;
  // After logging (or removing) a set the next row starts from the set you just did — the usual
  // gym flow — instead of blank boxes. Still fully editable.
  useEffect(() => { setDraft(initialDraft()); setErrors({}); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [done, ex.name, type]);

  const prog = setProgress(ex);
  const role = supersetRole(session, ex.id);
  const partner = ex.supersetWith ? session.exercises.find((e) => e.id === ex.supersetWith) : null;
  const targetText = describeTarget(progression.target);
  const restSeconds = restSecondsFor(session, ex);

  const submit = () => {
    const res = validateSetInput(type, { ...draft, rpe: extra.rpe, rir: extra.rir });
    if (!res.ok) {
      setErrors(res.errors);
      const first = Object.keys(res.errors)[0];
      document.getElementById(`set-${ex.id}-${first}`)?.focus?.();
      return;
    }
    setErrors({});
    onLogSet(ex, { ...res.set, type: kind });
    setKind_("normal");
    setExtra({ rpe: "", rir: "" });
    setMore(false);
  };

  const startEdit = (s) => {
    setEditing({ setId: s.id, draft: draftFromSet(s, type), kind: setKind(s), extra: { rpe: toStr(s.rpe), rir: toStr(s.rir) } });
    setEditErrors({});
  };
  const saveEdit = () => {
    const res = validateSetInput(type, { ...editing.draft, rpe: editing.extra.rpe, rir: editing.extra.rir });
    if (!res.ok) { setEditErrors(res.errors); return; }
    // rpe/rir explicitly undefined when cleared, so a stale value is removed on save
    const patch = { ...res.set, rpe: res.set.rpe, rir: res.set.rir, type: editing.kind };
    onChange((s) => updateSet(s, ex.id, editing.setId, patch));
    setEditing(null);
  };
  const deleteEditing = () => {
    const id = editing.setId;
    onChange((s) => removeSet(s, ex.id, id).session, { undo: { kind: "set", exId: ex.id, setId: id } });
    setEditing(null);
  };

  const fmt = (s) => formatSet(s, type, { unit });
  const plannedRows = prog.planned > done + 1 ? prog.planned - done - 1 : 0;
  const allPlannedDone = prog.planned > 0 && done >= prog.planned;

  return (
    <div
      id={`ex-${ex.id}`}
      className="atlas-card"
      style={{ marginBottom: 12, borderColor: upNext ? "var(--brass)" : ex.supersetWith ? "var(--warn)" : "var(--line)", boxShadow: upNext ? "0 0 0 1px var(--brass)" : undefined }}
    >
      {upNext && <div className="pill mono" style={{ background: "var(--brass)", color: "#072016", marginBottom: 8, display: "inline-block" }}>UP NEXT — SUPERSET</div>}
      <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
        {meta && <ExerciseThumb ex={meta} size={36} />}
        <div style={{ flex: 1, minWidth: 0 }}>
          <div className="disp" style={{ fontSize: 16, lineHeight: 1.2 }}>{ex.name}</div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", display: "flex", gap: 8, flexWrap: "wrap" }}>
            <span>{prog.planned > 0 ? `${done}/${prog.planned} sets` : `${done} set${done === 1 ? "" : "s"}`}</span>
            {targetText && <span style={{ color: "var(--warn)" }}>Target {targetText}{progression.target.source === "plan" ? " (plan)" : ""}</span>}
            {ex.swappedFrom && <span>swapped from {ex.swappedFrom}</span>}
          </div>
        </div>
        <div style={{ position: "relative" }}>
          <button type="button" style={iconBtn} aria-label={`More actions for ${ex.name}`} aria-expanded={menuOpen} onClick={() => setMenuOpen((v) => !v)}><MoreHorizontal size={20} /></button>
          {menuOpen && (
            <div role="menu" style={{ position: "absolute", right: 0, top: 44, zIndex: 30, minWidth: 190, background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.45)", padding: "4px 0" }}>
              <button role="menuitem" style={menuBtn} onClick={() => { setMenuOpen(false); onRequestSwap(ex); }}>Swap exercise</button>
              <button role="menuitem" style={{ ...menuBtn, opacity: index === 0 ? 0.4 : 1 }} disabled={index === 0} onClick={() => { setMenuOpen(false); onChange((s) => moveExercise(s, ex.id, -1)); }}>Move up</button>
              <button role="menuitem" style={{ ...menuBtn, opacity: index === count - 1 ? 0.4 : 1 }} disabled={index === count - 1} onClick={() => { setMenuOpen(false); onChange((s) => moveExercise(s, ex.id, 1)); }}>Move down</button>
              <button role="menuitem" style={menuBtn} onClick={() => { setMenuOpen(false); setPanel(panel === "note" ? null : "note"); }}>{ex.note ? "Edit note" : "Add note"}</button>
              <button role="menuitem" style={menuBtn} onClick={() => { setMenuOpen(false); setPanel(panel === "rest" ? null : "rest"); }}>Rest time ({restSeconds}s)</button>
              <button role="menuitem" style={menuBtn} onClick={() => { setMenuOpen(false); setPanel(panel === "link" ? null : "link"); }}>{ex.supersetWith ? "Change superset" : "Link as superset"}</button>
              <button role="menuitem" style={menuBtn} onClick={() => { setMenuOpen(false); setPanel(panel === "cues" ? null : "cues"); }}>Form cues</button>
              <button role="menuitem" style={{ ...menuBtn, color: "var(--rest)" }} onClick={() => { setMenuOpen(false); onRemove(ex); }}>Remove from workout</button>
            </div>
          )}
        </div>
      </div>

      {ex.supersetWith && partner && (
        <div className="mono" style={{ fontSize: 10.5, color: "var(--warn)", marginTop: 6 }}>
          ⚡ Superset with {partner.name} — {role === "lead" ? "no rest after this one; go straight to the partner" : "rest starts after this one"}
        </div>
      )}
      {ex.note && panel !== "note" && (
        <button type="button" onClick={() => setPanel("note")} style={{ ...ghostText, display: "block", marginTop: 6 }}>📝 {ex.note}</button>
      )}

      {/* Recommendation — one concise line, with the source and a "Why?" for the detail. */}
      <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 8 }}>
        <TrendingUp size={13} color="var(--brass)" style={{ marginTop: 3, flexShrink: 0 }} />
        <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.45 }}>
          <span>{progression.text}</span>
          {progression.source && (
            <button type="button" onClick={() => setShowWhy((v) => !v)} style={{ ...ghostText, display: "inline", marginLeft: 6, minHeight: 32 }}>{showWhy ? "Hide" : "Why?"}</button>
          )}
          {showWhy && progression.source && (
            <div className="mono" style={{ fontSize: 10.5, marginTop: 4, lineHeight: 1.6 }}>
              Based on your session on {formatDateOnly(progression.source.date, { month: "short", day: "numeric", year: "numeric" })}. Warm-up, drop and deload sets never set the baseline. Target {targetText} comes from {progression.target.source === "plan" ? "your plan" : progression.target.source === "goal" ? "your goal" : "a sensible default"}.
            </div>
          )}
        </div>
      </div>
      {lastSession && (
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 4 }}>
          Last ({formatDateOnly(lastSession.workout.date)}): {prevSets.map(fmt).join(" · ")}
        </div>
      )}

      {panel === "cues" && (() => {
        const g = meta ? getExerciseGuidance(meta) : null;
        const cues = g?.formCues?.length ? g.formCues : (meta ? POSE_TIPS[meta.pose] || [] : []);
        return (
          <div style={{ marginTop: 8, padding: 10, background: "var(--bg-elev2)", borderRadius: 8, fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>
            {g?.setup && <div style={{ marginBottom: 6 }}><b style={{ color: "var(--ink)" }}>Setup:</b> {g.setup}</div>}
            {g?.execution && <div style={{ marginBottom: 6 }}><b style={{ color: "var(--ink)" }}>Do:</b> {g.execution}</div>}
            <ul style={{ margin: 0, paddingLeft: 18 }}>{cues.map((c, i) => <li key={i}>{c}</li>)}</ul>
          </div>
        );
      })()}

      {panel === "note" && (
        <div style={{ marginTop: 8 }}>
          <textarea className="atlas-input" rows={2} maxLength={500} aria-label={`Note for ${ex.name}`} placeholder="Seat height, grip, how it felt…" defaultValue={ex.note || ""}
            onBlur={(e) => onChange((s) => setExerciseNote(s, ex.id, e.target.value.trim()))} style={{ width: "100%", resize: "vertical" }} />
        </div>
      )}
      {panel === "rest" && (
        <div style={{ marginTop: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 6 }}>REST AFTER EACH SET</div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {REST_OPTIONS.map((s) => (
              <button key={s} type="button" aria-pressed={restSeconds === s} onClick={() => onChange((st) => setExerciseRest(st, ex.id, s))} className="pill" style={{ cursor: "pointer", minHeight: 40, minWidth: 48, border: `1px solid ${restSeconds === s ? "var(--brass)" : "var(--line)"}`, background: restSeconds === s ? "var(--brass-soft)" : "transparent", color: restSeconds === s ? "var(--brass)" : "var(--ink-dim)" }}>{s >= 60 ? `${s / 60 % 1 === 0 ? s / 60 : (s / 60).toFixed(1)}m` : `${s}s`}</button>
            ))}
          </div>
        </div>
      )}
      {panel === "link" && (
        <div style={{ marginTop: 8, padding: 8, background: "var(--bg-elev2)", borderRadius: 8 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 6 }}>PAIR WITH:</div>
          {linkChoices.length === 0 && <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>Add another exercise first.</div>}
          {linkChoices.map((e) => (
            <button key={e.id} type="button" onClick={() => { onChange((s) => toggleSuperset(s, ex.id, e.id)); setPanel(null); }} className="pill" style={{ marginRight: 6, marginBottom: 6, cursor: "pointer", minHeight: 40, border: "1px solid var(--warn)", background: ex.supersetWith === e.id ? "var(--warn)" : "transparent", color: ex.supersetWith === e.id ? "#2E1500" : "var(--warn)" }}>{e.name}</button>
          ))}
        </div>
      )}

      {/* ---- sets: completed, then the active row, then remaining planned rows ---- */}
      <div style={{ marginTop: 10 }}>
        {ex.sets.map((s, i) => {
          const isEditing = editing?.setId === s.id;
          const k = setKind(s);
          const prev = prevSets[i];
          if (isEditing) {
            return (
              <div key={s.id || i} style={{ padding: "8px 0", borderTop: "1px solid var(--line)" }}>
                <div className="mono" style={{ fontSize: 11, color: "var(--brass)", marginBottom: 6 }}>Editing set {i + 1}</div>
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                  <SetFields ex={ex} unit={unit} draft={editing.draft} setDraft={(fn) => setEditing((e) => ({ ...e, draft: typeof fn === "function" ? fn(e.draft) : fn }))} errors={editErrors} idPrefix={`edit-${ex.id}-${i}`} onEnter={saveEdit} />
                </div>
                {Object.values(editErrors).map((m, j) => <div key={j} role="alert" className="mono" style={{ fontSize: 11, color: "var(--rest)", marginTop: 4 }}>{m}</div>)}
                <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginTop: 8, alignItems: "center" }}>
                  <select aria-label={`Set type for set ${i + 1}`} className="atlas-input" style={{ width: "auto", minHeight: 44, fontSize: 12 }} value={editing.kind} onChange={(e) => setEditing((x) => ({ ...x, kind: e.target.value }))}>
                    {SET_KINDS.map((t) => <option key={t} value={t}>{SET_TYPE_LABELS[t]}</option>)}
                  </select>
                  <input className="atlas-input" style={{ width: 64, minHeight: 44, fontSize: 12 }} inputMode="decimal" placeholder="RPE" aria-label={`RPE for set ${i + 1}`} value={editing.extra.rpe} onChange={(e) => setEditing((x) => ({ ...x, extra: { ...x.extra, rpe: e.target.value } }))} />
                  <input className="atlas-input" style={{ width: 64, minHeight: 44, fontSize: 12 }} inputMode="numeric" placeholder="RIR" aria-label={`RIR for set ${i + 1}`} value={editing.extra.rir} onChange={(e) => setEditing((x) => ({ ...x, extra: { ...x.extra, rir: e.target.value } }))} />
                </div>
                <div style={{ display: "flex", gap: 8, marginTop: 8 }}>
                  <button type="button" className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44 }} onClick={() => setEditing(null)}>Cancel</button>
                  <button type="button" className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44, color: "var(--rest)", borderColor: "var(--rest)" }} onClick={deleteEditing}>Delete set</button>
                  <button type="button" className="atlas-btn" style={{ flex: 1, minHeight: 44 }} onClick={saveEdit}>Save</button>
                </div>
              </div>
            );
          }
          return (
            <button
              key={s.id || i} type="button" onClick={() => startEdit(s)}
              aria-label={`Set ${i + 1}: ${fmt(s)}${k !== "normal" ? `, ${SET_TYPE_LABELS[k]}` : ""}. Tap to correct.`}
              style={{ display: "flex", alignItems: "center", gap: 8, width: "100%", textAlign: "left", background: "none", border: "none", borderTop: "1px solid var(--line)", padding: "0 0", minHeight: 48, cursor: "pointer", color: "var(--ink)" }}
            >
              <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 11, background: "var(--brass)", display: "inline-flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}><Check size={13} color="#072016" strokeWidth={3} /></span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", width: 16 }}>{i + 1}</span>
              <span className="mono" style={{ flex: 1, fontSize: 14 }}>{fmt(s)}{Number.isFinite(s.rpe) ? <span style={{ color: "var(--ink-dim)", fontSize: 11 }}>{`  @${s.rpe}`}</span> : null}{Number.isFinite(s.rir) ? <span style={{ color: "var(--ink-dim)", fontSize: 11 }}>{`  ${s.rir}RIR`}</span> : null}</span>
              {prev && <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>prev {fmt(prev)}</span>}
              {k !== "normal" && <span className="pill" style={{ fontSize: 9, background: SET_TYPE_COLORS[k] + "22", color: SET_TYPE_COLORS[k] }}>{SET_TYPE_LABELS[k]}</span>}
              {prSetIds.has(s.id) && <Trophy size={14} color="var(--brass)" aria-label="Personal record" />}
            </button>
          );
        })}

        {/* active input row */}
        <div style={{ borderTop: "1px solid var(--line)", paddingTop: 8 }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>
            {allPlannedDone ? "All planned sets done — add an extra set" : `Set ${done + 1}${prog.planned > 0 ? ` of ${prog.planned}` : ""}`}
            {prevSets[done] && <span style={{ marginLeft: 8 }}>prev {fmt(prevSets[done])}</span>}
          </div>
          <div style={{ display: "flex", gap: 6, alignItems: "flex-end", flexWrap: "wrap" }}>
            <SetFields ex={ex} unit={unit} draft={draft} setDraft={setDraft} errors={errors} idPrefix={`set-${ex.id}`} onEnter={submit} />
            <button type="button" className="atlas-btn" style={{ minHeight: 48, minWidth: 56, padding: "0 14px", flexShrink: 0 }} onClick={submit} aria-label={`Log set ${done + 1} for ${ex.name}`}>
              <Check size={20} strokeWidth={3} />
            </button>
          </div>
          {Object.values(errors).map((m, j) => <div key={j} role="alert" className="mono" style={{ fontSize: 11, color: "var(--rest)", marginTop: 4 }}>{m}</div>)}
          <div style={{ display: "flex", gap: 6, marginTop: 8, alignItems: "center", flexWrap: "wrap" }}>
            <button type="button" aria-pressed={kind === "warmup"} onClick={() => setKind_(kind === "warmup" ? "normal" : "warmup")} className="pill" style={{ cursor: "pointer", minHeight: 36, border: `1px solid ${kind === "warmup" ? SET_TYPE_COLORS.warmup : "var(--line)"}`, background: kind === "warmup" ? SET_TYPE_COLORS.warmup + "22" : "transparent", color: kind === "warmup" ? SET_TYPE_COLORS.warmup : "var(--ink-dim)" }}>Warm-up</button>
            <button type="button" aria-expanded={more} onClick={() => setMore((v) => !v)} className="pill" style={{ cursor: "pointer", minHeight: 36, border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)", display: "inline-flex", alignItems: "center", gap: 4 }}>
              Set type · RPE · RIR {more ? <ChevronUp size={12} /> : <ChevronDown size={12} />}
            </button>
            {kind !== "normal" && kind !== "warmup" && <span className="pill" style={{ background: SET_TYPE_COLORS[kind] + "22", color: SET_TYPE_COLORS[kind] }}>{SET_TYPE_LABELS[kind]}</span>}
          </div>
          {more && (
            <div style={{ display: "flex", gap: 6, marginTop: 8, flexWrap: "wrap", alignItems: "center" }}>
              <select aria-label="Set type" className="atlas-input" style={{ width: "auto", minHeight: 44, fontSize: 12 }} value={kind} onChange={(e) => setKind_(e.target.value)}>
                {SET_KINDS.map((t) => <option key={t} value={t}>{SET_TYPE_LABELS[t]}</option>)}
              </select>
              <input className="atlas-input" style={{ width: 72, minHeight: 44, fontSize: 13 }} inputMode="decimal" placeholder="RPE 1-10" aria-label="RPE (optional)" value={extra.rpe} onChange={(e) => setExtra((x) => ({ ...x, rpe: e.target.value }))} />
              <input className="atlas-input" style={{ width: 72, minHeight: 44, fontSize: 13 }} inputMode="numeric" placeholder="RIR" aria-label="Reps in reserve (optional)" value={extra.rir} onChange={(e) => setExtra((x) => ({ ...x, rir: e.target.value }))} />
            </div>
          )}
        </div>

        {plannedRows > 0 && Array.from({ length: plannedRows }).map((_, k) => (
          <div key={k} className="mono" style={{ display: "flex", alignItems: "center", gap: 8, minHeight: 36, borderTop: "1px dashed var(--line)", fontSize: 11, color: "var(--ink-dim)", opacity: 0.7 }}>
            <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 11, border: "1.5px dashed var(--ink-dim)", flexShrink: 0 }} />
            <span>Set {done + 2 + k} · planned{targetText ? ` ${targetText}` : ""}</span>
          </div>
        ))}
      </div>
    </div>
  );
}

const ghostText = { background: "none", border: "none", cursor: "pointer", color: "var(--steel)", fontSize: 11, padding: 0, textAlign: "left", fontFamily: "inherit" };

/* ------------------------------- status pill ------------------------------ */

function SaveStatus({ status, onRetry }) {
  if (!status) return null;
  const { state, at } = status;
  if (state === "error") {
    return (
      <button type="button" onClick={onRetry} className="pill mono" style={{ cursor: "pointer", minHeight: 32, background: "rgba(255,107,129,0.12)", color: "var(--rest)", border: "1px solid var(--rest)" }} aria-live="polite">
        Not saved — tap to retry
      </button>
    );
  }
  return (
    <span className="pill mono" role="status" aria-live="polite" style={{ background: "var(--bg-elev2)", color: state === "saving" ? "var(--warn)" : "var(--brass)" }}>
      {state === "saving" ? "Saving…" : `Saved${at ? ` ${new Date(at).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}` : ""}`}
    </span>
  );
}

/* --------------------------------- review ---------------------------------- */

function WorkoutReview({ session, workouts, customExercises, profile, now, prs, finishing, finishError, onBack, onFinish, onDiscard, setSession }) {
  const unit = session.unit || profile.unit || "kg";
  const totals = sessionTotals(session, customExercises);
  const streakDelta = computeStreak([...workouts, session]) - computeStreak(workouts);
  const xp = computeWorkoutXp(session, { prCount: prs.length, streakDelta });
  const targetSets = session.exercises.reduce((s, e) => s + (e.targetSets || 0), 0);
  const logged = session.exercises.reduce((s, e) => s + e.sets.length, 0);
  const mostIncomplete = targetSets > 0 && logged < targetSets * 0.5;
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const metaOf = (name) => findExercise(name, customExercises);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px calc(24px + env(safe-area-inset-bottom))" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <h1 className="disp" style={{ fontSize: 22, marginBottom: 4 }}>Workout Summary</h1>
        <div className="mono" style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>
          ⏱ {fmtClock((now - session.startedAt) / 1000)} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} · {totals.sets} working set{totals.sets === 1 ? "" : "s"}{totals.volume > 0 ? ` · ${Math.round(totals.volume)}${unit} volume` : ""}
        </div>

        <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
          <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>XP Earned</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Workout completion</span><span className="mono">+{xp.completion}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Working sets &amp; exercises</span><span className="mono">+{xp.sets}</span></div>
            {xp.prBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Personal record bonus</span><span className="mono">+{xp.prBonus}</span></div>}
            {xp.streakBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Streak bonus</span><span className="mono">+{xp.streakBonus}</span></div>}
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
            <span className="disp">Total XP earned</span><span className="mono" style={{ color: "var(--brass)" }}>+{xp.total}</span>
          </div>
        </div>

        {prs.length > 0 && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}><Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{prs.length} New PR{prs.length === 1 ? "" : "s"}</div>
            {prs.map((p, i) => <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>{p.exName} — {formatSet(p.set, p.trackingType, { unit })}</div>)}
          </div>
        )}

        {mostIncomplete && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--warn)", background: "rgba(255,165,61,0.08)" }}>
            <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
              <AlertTriangle size={15} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
              <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>You logged {logged} of {targetSets} planned sets for {session.planDayName || "this workout"}. Saving now records it as done — you can start another session to finish the rest.</div>
            </div>
          </div>
        )}

        <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
          {session.exercises.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>No exercises logged.</div>}
          {session.exercises.map((ex) => {
            const type = ex.trackingType || metaOf(ex.name)?.trackingType;
            return (
              <div key={ex.id} className="atlas-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div className="disp" style={{ fontSize: 14 }}>{ex.name}</div>
                  {ex.sets.length === 0 && <span className="pill mono" style={{ background: "rgba(255,107,129,0.12)", color: "var(--rest)" }}>Skipped</span>}
                </div>
                {ex.sets.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No sets logged — added to this workout but never completed.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {ex.sets.map((s, i) => (
                      <div key={s.id || i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                        {formatSet(s, type, { unit })}{setKind(s) !== "normal" ? ` (${SET_TYPE_LABELS[setKind(s)]})` : ""}
                      </div>
                    ))}
                  </div>
                )}
                {ex.note && <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 6, fontStyle: "italic" }}>📝 {ex.note}</div>}
              </div>
            );
          })}
        </div>

        <div style={{ marginBottom: 20 }}>
          <label htmlFor="session-notes" className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", marginBottom: 4 }}>NOTES (OPTIONAL)</label>
          <textarea id="session-notes" className="atlas-input" style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }} placeholder="How did it feel? Anything to remember for next time…" value={session.notes || ""} onChange={(e) => setSession((s) => ({ ...s, notes: e.target.value, updatedAt: Date.now() }))} />
        </div>

        {finishError && (
          <div role="alert" className="atlas-card" style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
            <div className="mono" style={{ color: "var(--rest)", fontSize: 12, lineHeight: 1.5 }}>{finishError}</div>
          </div>
        )}

        {confirmDiscard ? (
          <div className="atlas-card" style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>This can't be undone.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
              <button className="atlas-btn" style={{ flex: 1, minHeight: 48, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
            </div>
          </div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            <button className="atlas-btn" style={{ width: "100%", minHeight: 52, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={finishing} onClick={() => onFinish(session, prs)}>
              {finishing && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
              {finishing ? "Saving…" : finishError ? "Retry saving" : "Save Workout"}
            </button>
            <button className="atlas-btn-ghost" style={{ width: "100%", minHeight: 48 }} disabled={finishing} onClick={onBack}>Continue Editing</button>
            <button onClick={() => setConfirmDiscard(true)} disabled={finishing} className="mono" style={{ background: "none", border: "none", cursor: finishing ? "default" : "pointer", color: "var(--ink-dim)", fontSize: 12, padding: 6, minHeight: 44, textAlign: "center" }}>Discard Workout</button>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------ active workout ----------------------------- */

export default function ActiveWorkout({
  profile, workouts, customExercises, session, setSession, onFinish, onDiscard, finishingWorkout, finishError,
  saveStatus, onRetrySave, onAddCustomExercise, onArchiveCustomExercise, initialMuscleFilter,
}) {
  const [picker, setPicker] = useState(null); // null | { mode: "add" } | { mode: "swap", exId }
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [now, setNow] = useState(Date.now());
  const [prToast, setPrToast] = useState(null);
  const [undo, setUndo] = useState(null); // { label, restore }
  const [nextUpId, setNextUpId] = useState(null);
  const [removeConfirm, setRemoveConfirm] = useState(null);
  const restAlertedRef = useRef(false);
  const restTotalRef = useRef(0);
  const lastRestEndRef = useRef(null);
  const unit = session.unit || profile.unit || "kg";

  useEffect(() => { setReviewing(false); setConfirmDiscard(false); setNextUpId(null); }, [session.id]);
  useEffect(() => { const t = setInterval(() => setNow(Date.now()), 1000); return () => clearInterval(t); }, []);
  useEffect(() => { if (!prToast) return; const t = setTimeout(() => setPrToast(null), 3800); return () => clearTimeout(t); }, [prToast]);
  useEffect(() => { if (!undo) return; const t = setTimeout(() => setUndo(null), 7000); return () => clearTimeout(t); }, [undo]);

  // Rest timer bookkeeping: total length is captured when a rest starts so the bar is accurate.
  useEffect(() => {
    if (session.restEndAt && session.restEndAt !== lastRestEndRef.current && (lastRestEndRef.current == null || session.restEndAt > lastRestEndRef.current + 1000 || session.restEndAt - Date.now() > restTotalRef.current)) {
      restTotalRef.current = Math.max(1000, session.restEndAt - Date.now());
      restAlertedRef.current = false;
    }
    lastRestEndRef.current = session.restEndAt || null;
  }, [session.restEndAt]);
  useEffect(() => {
    if (!session.restEndAt) { restAlertedRef.current = false; return; }
    if (now >= session.restEndAt && !restAlertedRef.current) { restAlertedRef.current = true; playRestDoneSound(); }
  }, [now, session.restEndAt]);

  // The workout is durably stored locally on every change (see App), so closing the tab cannot lose
  // it; the only time leaving is risky is while the latest change is not yet confirmed saved.
  useEffect(() => {
    if (!hasLoggedSets(session) || !saveStatus || saveStatus.state === "saved") return undefined;
    const handler = (e) => { e.preventDefault(); e.returnValue = ""; };
    window.addEventListener("beforeunload", handler);
    return () => window.removeEventListener("beforeunload", handler);
  }, [session, saveStatus]);

  // `onChange(fn, opts)` applies a pure session update. With `opts.undo` it also offers an undo of
  // a destructive set/exercise action, captured from the pre-change session.
  const change = (fn, opts) => {
    if (opts?.undo?.kind === "set") {
      const { exId, setId } = opts.undo;
      const ex = session.exercises.find((e) => e.id === exId);
      const idx = ex ? ex.sets.findIndex((s) => s.id === setId) : -1;
      const removed = idx >= 0 ? ex.sets[idx] : null;
      if (removed) setUndo({ label: "Set deleted", restore: () => setSession((s) => restoreSet(s, exId, removed, idx)) });
    }
    setSession((s) => fn(s));
  };

  const prEvents = useMemo(() => sessionPrEvents(workouts, session, customExercises), [workouts, session, customExercises]);
  const prSetIds = useMemo(() => new Set(prEvents.map((e) => e.setId)), [prEvents]);

  const handleLogSet = (ex, set) => {
    const history = [
      ...workouts.flatMap((w) => (w.exercises || []).filter((e) => e.name === ex.name).flatMap((e) => e.sets || [])),
      ...ex.sets,
    ];
    const verdict = evaluateSetPR(history, set, ex.trackingType);
    const firstEver = workouts.length === 0 && session.exercises.every((e) => e.sets.length === 0);
    const role = supersetRole(session, ex.id);
    const partnerId = ex.supersetWith;
    setSession((s) => logSet(s, ex.id, set).session);
    setNextUpId(role === "lead" ? partnerId : null);
    if (role === "lead" && partnerId) setTimeout(() => document.getElementById(`ex-${partnerId}`)?.scrollIntoView?.({ block: "center", behavior: "smooth" }), 60);
    if (verdict.isPR) {
      setPrToast({ exName: ex.name, set, trackingType: ex.trackingType, type: verdict.type });
      playPRSound();
    }
    if (firstEver) logEvent("first_set_logged", { exercise: ex.name });
  };

  const requestRemove = (ex) => {
    if (ex.sets.length > 0) { setRemoveConfirm(ex); return; }
    doRemove(ex);
  };
  const doRemove = (ex) => {
    const { removed, index } = removeExercise(session, ex.id);
    setSession((s) => removeExercise(s, ex.id).session);
    if (removed) setUndo({ label: `${ex.name} removed`, restore: () => setSession((s) => restoreExercise(s, removed, index)) });
    setRemoveConfirm(null);
  };

  const swapTarget = picker?.mode === "swap" ? session.exercises.find((e) => e.id === picker.exId) : null;
  const doSwap = (newEx) => {
    const preview = swapExercise(session, picker.exId, newEx, { customExercises });
    if (preview.duplicate) { setPicker(null); return; }
    setSession((s) => swapExercise(s, picker.exId, newEx, { customExercises }).session);
    if (preview.dropped.length > 0) setUndo({ label: `${preview.dropped.length} logged set${preview.dropped.length === 1 ? "" : "s"} didn't fit ${newEx.name} and were removed`, restore: null });
    setPicker(null);
  };

  const rest = session.restEndAt && now < session.restEndAt ? session.restEndAt - now : 0;
  const totals = sessionTotals(session, customExercises);

  if (reviewing) {
    return (
      <WorkoutReview
        session={session} workouts={workouts} customExercises={customExercises} profile={profile} now={now} prs={prEvents}
        finishing={finishingWorkout} finishError={finishError} onBack={() => setReviewing(false)} onFinish={onFinish} onDiscard={onDiscard} setSession={setSession}
      />
    );
  }

  return (
    <div style={{ padding: "20px 14px 120px" }}>
      {prToast && (
        <div className="atlas-card" role="status" style={{ position: "sticky", top: 0, zIndex: 20, marginBottom: 12, borderColor: "var(--brass)", background: "linear-gradient(135deg, rgba(62,207,142,0.18), var(--bg-elev))", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 18px rgba(62,207,142,0.25)" }}>
          <Trophy size={22} color="var(--brass)" style={{ flexShrink: 0 }} />
          <div>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)" }}>New Personal Record!</div>
            <div className="mono" style={{ fontSize: 12 }}>{prToast.exName} — {formatSet(prToast.set, prToast.trackingType, { unit })}</div>
          </div>
        </div>
      )}

      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8, marginBottom: 8 }}>
        <div style={{ minWidth: 0 }}>
          <h1 className="disp" style={{ fontSize: 22, lineHeight: 1.15 }}>{session.planDayName || "Today's Session"}</h1>
          <div className="mono" style={{ fontSize: 12, color: "var(--steel)", display: "flex", gap: 8, alignItems: "center", flexWrap: "wrap" }}>
            <span>⏱ {fmtClock((now - session.startedAt) / 1000)}</span>
            <span style={{ color: "var(--ink-dim)" }}>{totals.sets} set{totals.sets === 1 ? "" : "s"}</span>
            <SaveStatus status={saveStatus} onRetry={onRetrySave} />
          </div>
        </div>
        <button className="atlas-btn-ghost" onClick={() => setConfirmDiscard(true)} style={{ minHeight: 44, padding: "6px 12px" }}>Cancel</button>
      </div>

      {confirmDiscard && (
        <div className="atlas-card" style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
          <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
            {session.exercises.length === 0 ? "Nothing's been logged yet." : `You've logged ${session.exercises.reduce((s, e) => s + e.sets.length, 0)} set(s). This can't be undone.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
            <button className="atlas-btn" style={{ flex: 1, minHeight: 48, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
          </div>
        </div>
      )}

      {rest > 0 && (
        <div className="atlas-card" style={{ position: "sticky", top: 0, zIndex: 15, marginBottom: 12, borderColor: "var(--steel)", background: "rgba(14,34,30,0.96)" }} role="timer" aria-label="Rest timer">
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--steel)" }}>Resting</div>
            <div className="mono" style={{ fontSize: 22 }}>{fmtClock(rest / 1000)}</div>
          </div>
          <div className="bar-track" style={{ marginBottom: 10 }}>
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, (rest / Math.max(restTotalRef.current, 1000)) * 100))}%`, background: "var(--steel)" }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44, fontSize: 12 }} onClick={() => setSession((s) => adjustRest(s, -15))}>-15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44, fontSize: 12 }} onClick={() => setSession((s) => adjustRest(s, 15))}>+15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44, fontSize: 12 }} onClick={() => setSession((s) => clearRest(s))}>Skip</button>
          </div>
        </div>
      )}

      {session.exercises.length === 0 && !picker && (
        <div style={{ textAlign: "center", padding: "28px 12px", color: "var(--ink-dim)", fontSize: 13 }}>
          <div className="disp" style={{ fontSize: 15, color: "var(--ink)", marginBottom: 6 }}>Add your first exercise</div>
          Pick as many as you like at once, then log each set.
        </div>
      )}

      {session.exercises.map((ex, i) => (
        <ExerciseCard
          key={ex.id} ex={ex} index={i} count={session.exercises.length} session={session} workouts={workouts} profile={profile}
          customExercises={customExercises} now={now} prSetIds={prSetIds} upNext={nextUpId === ex.id}
          onChange={change} onLogSet={handleLogSet} onRequestSwap={(e) => setPicker({ mode: "swap", exId: e.id })} onRemove={requestRemove}
          linkChoices={session.exercises.filter((e) => e.id !== ex.id)}
        />
      ))}

      {removeConfirm && (
        <div className="atlas-card" role="alertdialog" aria-label={`Remove ${removeConfirm.name}?`} style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
          <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Remove {removeConfirm.name}?</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>Its {removeConfirm.sets.length} logged set{removeConfirm.sets.length === 1 ? "" : "s"} will be removed too (you can undo right after).</div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 48 }} onClick={() => setRemoveConfirm(null)}>Keep it</button>
            <button className="atlas-btn" style={{ flex: 1, minHeight: 48, background: "var(--rest)" }} onClick={() => doRemove(removeConfirm)}>Remove</button>
          </div>
        </div>
      )}

      {!picker ? (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4, minHeight: 48 }} onClick={() => setPicker({ mode: "add" })}>
          <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add Exercises
        </button>
      ) : (
        <ExercisePicker
          mode={picker.mode} swapFrom={swapTarget} existingNames={session.exercises.map((e) => e.name)}
          customExercises={customExercises} initialMuscleFilter={initialMuscleFilter}
          onClose={() => setPicker(null)}
          onAddMany={(list) => { setSession((s) => addExercises(s, list, { customExercises }).session); setPicker(null); }}
          onSwap={doSwap}
          onAddCustomExercise={onAddCustomExercise} onArchiveCustomExercise={onArchiveCustomExercise}
        />
      )}

      {session.exercises.length > 0 && (
        <button className="atlas-btn" style={{ width: "100%", marginTop: 18, minHeight: 52 }} onClick={() => setReviewing(true)}>Finish Workout</button>
      )}

      {undo && (
        <div role="status" style={{ position: "fixed", left: 12, right: 12, bottom: "calc(84px + env(safe-area-inset-bottom))", zIndex: 40, maxWidth: 456, margin: "0 auto", background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 12, padding: "10px 14px", display: "flex", alignItems: "center", gap: 10, boxShadow: "0 8px 24px rgba(0,0,0,0.5)" }}>
          <span style={{ flex: 1, fontSize: 12.5 }}>{undo.label}</span>
          {undo.restore && <button type="button" className="mono" style={{ background: "none", border: "none", color: "var(--brass)", cursor: "pointer", fontSize: 13, minHeight: 44, padding: "0 8px" }} onClick={() => { undo.restore(); setUndo(null); }}>Undo</button>}
          <button type="button" aria-label="Dismiss" style={iconBtn} onClick={() => setUndo(null)}><X size={16} /></button>
        </div>
      )}
    </div>
  );
}
