import React, { useState, useMemo } from "react";
import { X, Loader2, Trophy, ChevronRight } from "lucide-react";
import { findExercise } from "./lib/exerciseLookup.js";
import { validateSetInput, formatSet, setKind, SET_KINDS, effectiveTrackingType, specFor, formatDuration } from "./lib/measurement.js";
import { workoutVolumeKg, workoutXpBreakdown, sessionPrEvents, workingSets } from "./lib/workoutMath.js";
import { formatDateOnly } from "./lib/dates.js";
import { SetFields, draftFromSet, SET_TYPE_LABELS, SET_TYPE_COLORS } from "./WorkoutLogger.jsx";

const fmtDate = (iso) => formatDateOnly(iso, { month: "short", day: "numeric" });

/** The measurement type a stored exercise entry is read as (stored type, else catalogue if the
 *  sets fit it, else the sets' own shape) — legacy records are never reinterpreted. */
function typeOf(entry, customExercises) {
  return effectiveTrackingType(entry, findExercise(entry.name, customExercises)?.trackingType);
}

export function describeWorkoutSets(workout, customExercises) {
  return (workout.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
}

/** Recent-workouts list on the Train home. Volume is shown only where tonnage means something. */
export function HistoryList({ workouts, customExercises, onOpen }) {
  const history = useMemo(() => [...workouts].sort((a, b) => (a.date < b.date ? 1 : a.date > b.date ? -1 : (b.startedAt || 0) - (a.startedAt || 0))).slice(0, 8), [workouts]);
  if (history.length === 0) return <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>No workouts logged yet.</div>;
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
      {history.map((w) => {
        const volume = workoutVolumeKg(w, customExercises);
        const sets = (w.exercises || []).reduce((n, e) => n + workingSets(e, customExercises).length, 0);
        return (
          <button
            key={w.id} onClick={() => onOpen(w)} className="atlas-card"
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--ink)", minHeight: 56 }}
          >
            <div>
              <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(w.date)}{w.planDayName ? ` · ${w.planDayName}` : ""}</div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{(w.exercises || []).length} exercise{(w.exercises || []).length === 1 ? "" : "s"} · {sets} working set{sets === 1 ? "" : "s"}</div>
            </div>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              {volume > 0 && <div className="mono" style={{ fontSize: 13, color: "var(--brass)" }}>{Math.round(volume)}kg vol</div>}
              <ChevronRight size={16} color="var(--ink-dim)" />
            </div>
          </button>
        );
      })}
    </div>
  );
}

/**
 * Full detail view for a completed workout. Every set is shown and corrected in the units its own
 * measurement type uses: a plank shows seconds and asks for seconds — never "kg ×" or reps — and
 * saving a correction recomputes the workout's personal-record list from the corrected sets.
 */
export function WorkoutDetailModal({ workout, workouts = [], customExercises = [], onClose, onEditWorkout, onDeleteWorkout }) {
  const [notes, setNotes] = useState(workout.notes || "");
  const [editingSets, setEditingSets] = useState(false);
  const [draft, setDraft] = useState(null); // [{ exIdx, sets: [{ draft, kind, extra, base }] }]
  const [errors, setErrors] = useState({}); // "exIdx:setIdx" -> { field: msg }
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);
  const unit = workout.unit || "kg";

  const totalVolume = workoutVolumeKg(workout, customExercises);
  const durationMin = workout.startedAt && workout.completedAt ? Math.round((new Date(workout.completedAt) - workout.startedAt) / 60000) : null;
  const xp = workoutXpBreakdown(workout);
  const prs = workout.prs || [];

  const beginEdit = () => {
    setDraft((workout.exercises || []).map((e) => {
      const type = typeOf(e, customExercises);
      return (e.sets || []).map((s) => ({ draft: draftFromSet(s, type), kind: setKind(s), extra: { rpe: s.rpe == null ? "" : String(s.rpe), rir: s.rir == null ? "" : String(s.rir) }, base: s }));
    }));
    setErrors({});
    setEditingSets(true);
  };

  const patchSet = (exIdx, setIdx, fn) => setDraft((d) => d.map((sets, i) => (i !== exIdx ? sets : sets.map((s, j) => (j !== setIdx ? s : fn(s))))));

  const saveSets = async () => {
    const nextErrors = {};
    const exercises = (workout.exercises || []).map((e, exIdx) => {
      const type = typeOf(e, customExercises);
      const sets = (e.sets || []).map((orig, setIdx) => {
        const d = draft[exIdx][setIdx];
        const res = validateSetInput(type, { ...d.draft, rpe: d.extra.rpe, rir: d.extra.rir });
        if (!res.ok) { nextErrors[`${exIdx}:${setIdx}`] = res.errors; return orig; }
        const { weight, reps, assistWeight, durationSeconds, distanceMeters, rpe, rir, ...unknownKept } = orig;
        const out = { ...unknownKept, ...res.set, type: d.kind };
        return out;
      });
      // an exercise saved via correction keeps (and from now on stores) the type it is read as
      return { ...e, trackingType: type, sets };
    });
    if (Object.keys(nextErrors).length) { setErrors(nextErrors); return; }
    setSaving(true);
    setSaveError(null);
    // Personal records for this session are recomputed from the corrected sets against everything
    // that came before it; XP awarded at the time is deliberately not re-litigated.
    const earlier = workouts.filter((w) => w.id !== workout.id && (w.date < workout.date || (w.date === workout.date && (w.startedAt || 0) < (workout.startedAt || 0))));
    const recomputed = sessionPrEvents(earlier, { exercises }, customExercises).map((p) => ({ exName: p.exName, type: p.type, trackingType: p.trackingType, set: p.set, weight: p.weight, reps: p.reps }));
    const ok = await onEditWorkout(workout.id, { exercises, prs: recomputed });
    if (ok) setEditingSets(false);
    else setSaveError("Couldn't save your changes — check your connection and try again. Nothing was changed.");
    setSaving(false);
  };

  const saveNotes = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onEditWorkout(workout.id, { notes });
    if (!ok) setSaveError("Couldn't save your note — check your connection and try again.");
    setSaving(false);
  };

  const handleDelete = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onDeleteWorkout(workout.id);
    setSaving(false);
    if (ok) onClose();
    else setSaveError("Couldn't delete this workout — check your connection and try again.");
  };

  const prLine = (pr) => {
    // new records carry the set + its type; records saved before that carried weight/reps only
    const text = pr.set ? formatSet(pr.set, pr.trackingType, { unit }) : `${pr.weight}${unit} × ${pr.reps}`;
    const note = pr.type === "weight" ? "(heaviest yet)" : pr.type === "reps" ? "(most reps)" : pr.type === "duration" ? "(longest hold)" : pr.type === "distance" ? "(farthest)" : pr.type === "assistance" ? "(least assistance)" : "";
    return `${pr.exName} — ${text} ${note}`.trim();
  };

  return (
    <div role="dialog" aria-modal="true" aria-label="Workout detail" style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div className="disp" style={{ fontSize: 20 }}>{fmtDate(workout.date)}{workout.planDayName ? ` · ${workout.planDayName}` : ""}</div>
            {durationMin != null && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>⏱ {durationMin} min</div>}
          </div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px", minWidth: 44, minHeight: 44 }} aria-label="Close workout detail"><X size={16} /></button>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          {totalVolume > 0 && (
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
              <span className="mono" style={{ color: "var(--ink-dim)" }}>TOTAL VOLUME</span>
              <span className="mono" style={{ color: "var(--brass)" }}>{Math.round(totalVolume)}{unit}</span>
            </div>
          )}
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span className="mono" style={{ color: "var(--ink-dim)" }}>XP EARNED</span>
            <span className="mono" style={{ color: "var(--brass)" }}>+{xp.total}</span>
          </div>
        </div>

        {prs.length > 0 && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}><Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{prs.length} PR{prs.length === 1 ? "" : "s"}</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {prs.map((pr, i) => <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>{prLine(pr)}</div>)}
            </div>
          </div>
        )}

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="disp" style={{ fontSize: 14 }}>Exercises</div>
            <button className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 12, padding: 0, minHeight: 44 }} onClick={() => (editingSets ? setEditingSets(false) : beginEdit())}>
              {editingSets ? "Cancel" : "Correct Sets"}
            </button>
          </div>
          {(workout.exercises || []).map((ex, exIdx) => {
            const type = typeOf(ex, customExercises);
            const meta = { ...ex, trackingType: type, equipment: ex.equipment || findExercise(ex.name, customExercises)?.equipment };
            return (
              <div key={`${ex.name}-${exIdx}`} style={{ marginBottom: 12 }}>
                <div className="disp" style={{ fontSize: 13, marginBottom: 4 }}>{ex.name}</div>
                {(ex.sets || []).length === 0 && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>No sets logged.</div>}
                {(ex.sets || []).map((st, stIdx) => {
                  if (editingSets && draft?.[exIdx]?.[stIdx]) {
                    const d = draft[exIdx][stIdx];
                    const errs = errors[`${exIdx}:${stIdx}`];
                    return (
                      <div key={stIdx} style={{ padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>Set {stIdx + 1}</div>
                        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
                          <SetFields ex={meta} unit={unit} draft={d.draft} setDraft={(fn) => patchSet(exIdx, stIdx, (s) => ({ ...s, draft: typeof fn === "function" ? fn(s.draft) : fn }))} errors={errs} idPrefix={`hist-${exIdx}-${stIdx}`} />
                        </div>
                        {errs && Object.values(errs).map((m, j) => <div key={j} role="alert" className="mono" style={{ fontSize: 11, color: "var(--rest)", marginTop: 4 }}>{m}</div>)}
                        <select aria-label={`Set type for ${ex.name} set ${stIdx + 1}`} className="atlas-input" style={{ width: "auto", minHeight: 40, fontSize: 12, marginTop: 6 }} value={d.kind} onChange={(e) => patchSet(exIdx, stIdx, (s) => ({ ...s, kind: e.target.value }))}>
                          {SET_KINDS.map((t) => <option key={t} value={t}>{SET_TYPE_LABELS[t]}</option>)}
                        </select>
                      </div>
                    );
                  }
                  const k = setKind(st);
                  return (
                    <div key={stIdx} className="mono" style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 4 }}>
                      <span>{formatSet(st, type, { unit })}</span>
                      {Number.isFinite(st.rpe) && <span>@{st.rpe}</span>}
                      {k !== "normal" && <span className="pill" style={{ fontSize: 9, background: SET_TYPE_COLORS[k] + "22", color: SET_TYPE_COLORS[k] }}>{SET_TYPE_LABELS[k]}</span>}
                    </div>
                  );
                })}
                {ex.note && <div style={{ fontSize: 11, color: "var(--ink-dim)", fontStyle: "italic" }}>📝 {ex.note}</div>}
              </div>
            );
          })}
          {editingSets && (
            <button className="atlas-btn" style={{ width: "100%", marginTop: 4, minHeight: 48 }} onClick={saveSets} disabled={saving}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              Save Set Changes
            </button>
          )}
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <label htmlFor="workout-notes" className="disp" style={{ fontSize: 13, marginBottom: 8, display: "block" }}>Notes</label>
          <textarea id="workout-notes" className="atlas-input" rows={3} value={notes} onChange={(e) => setNotes(e.target.value)} style={{ width: "100%", resize: "vertical", marginBottom: 8 }} placeholder="How did this session feel?" />
          <button className="atlas-btn-ghost" style={{ width: "100%", minHeight: 44 }} onClick={saveNotes} disabled={saving || notes === (workout.notes || "")}>Save Notes</button>
        </div>

        {saveError && <div role="alert" className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 12 }}>{saveError}</div>}

        <div className="atlas-card" style={{ borderColor: "var(--rest)" }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rest)", fontSize: 12, padding: 0, minHeight: 44 }}>Delete Workout</button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>This permanently deletes this workout and can't be undone. Your streak, muscle readiness and progress will recalculate without it.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 44 }} onClick={() => setConfirmDelete(false)} disabled={saving}>Cancel</button>
                <button className="atlas-btn" style={{ flex: 1, minHeight: 44, background: "var(--rest)" }} onClick={handleDelete} disabled={saving}>
                  {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> : "Permanently Delete"}
                </button>
              </div>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
