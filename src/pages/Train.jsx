import { useState, useEffect, useRef } from "react";
import { X, Trophy, Loader2, Plus, ChevronRight, TrendingUp, Search, AlertTriangle, MoreHorizontal, Timer, Zap } from "lucide-react";
import { logEvent } from "../lib/analytics";
import {
  workoutXpBreakdown, evaluatePR, computeStreak, computeWorkoutXp, suggestNextTarget, previousSets
} from "../lib/workoutMath";
import {
  MUSCLE_REGIONS, UNMAPPED_READINESS_REGIONS, MUSCLE_GROUPS, EQUIPMENT_TYPES, EXERCISES,
  matchesExerciseSearch, regionForExercise, MUSCLE_DEFAULT_POSE, WEIGHT_REPS_TRACKING_TYPES,
  POSE_TIPS, EQUIPMENT_COLORS, TRACKING_TYPES, TRACKING_TYPE_LABEL, REGION_LABEL
} from "../exerciseData";
import { fmtDate } from "../lib/dateUtils";
import { formatSet, fmtWeightReps, SET_TYPE_COLORS, SET_TYPE_LABELS, SET_TYPES } from "../lib/workoutHelpers";
import { playRestDoneSound, playPRSound } from "../lib/sounds";
import { ExerciseThumb } from "../components/ExerciseFigure";
import { ExerciseDetailCard } from "../components/ExerciseDetailCard";
import { SetTable } from "../components/SetTable";
import { NumberInput } from "../components/NumberInput";

// Every readiness region (the 18 drawn on the body map plus the 3 filter/search-only ones),
// grouped by coarse muscle group — used to scope the Train picker's region filter to whichever
// coarse group is currently selected (e.g. picking "Arms" reveals Biceps/Triceps/Forearms as
// sub-filters) instead of showing all 21 regions in one flat, overwhelming row.
const ALL_READINESS_REGIONS = [...MUSCLE_REGIONS, ...UNMAPPED_READINESS_REGIONS];
const REGIONS_BY_GROUP = MUSCLE_GROUPS.reduce((acc, g) => {
  acc[g] = ALL_READINESS_REGIONS.filter((r) => r.group === g).map((r) => r.id);
  return acc;
}, {});

/* ------------------------------------------------------------------ */
/* Train                                                                */
/* ------------------------------------------------------------------ */

// Full detail view for one completed workout, reachable by tapping any history entry. Shows
// everything logged for that session and lets you correct a mis-entered set or add/edit a note
// after the fact — previously, once a workout was saved, there was no way to see or change
// anything about it again short of deleting and redoing it. Deleting requires an explicit
// confirmation step; editing/deleting both go through the same onEdit/onDelete callbacks
// finishWorkout itself uses (App.jsx's editWorkout/deleteWorkout), so Progress, streaks, muscle
// recovery, and PR suggestions all recompute automatically from the updated `workouts` array —
// there's no separate cache of any of those that could go stale.
function WorkoutDetailModal({ workout, onClose, onEditWorkout, onDeleteWorkout }) {
  const [notes, setNotes] = useState(workout.notes || "");
  const [editingSets, setEditingSets] = useState(false);
  const [setsDraft, setSetsDraft] = useState(() => workout.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) })));
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState(null);

  const totalVolume = workout.exercises.reduce((s, e) => s + e.sets.reduce((s2, st) => s2 + (st.weight || 0) * (st.reps || 0), 0), 0);
  const durationMin = workout.startedAt && workout.completedAt
    ? Math.round((new Date(workout.completedAt) - new Date(workout.startedAt)) / 60000)
    : null;
  const xp = workoutXpBreakdown(workout);
  const prs = workout.prs || [];

  const saveNotes = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onEditWorkout(workout.id, { notes });
    if (!ok) setSaveError("Couldn't save your note — check your connection and try again.");
    setSaving(false);
  };

  const saveSets = async () => {
    setSaving(true);
    setSaveError(null);
    // Volume/PRs/XP for this workout were computed and stored at the time it was finished —
    // correcting a set here deliberately does NOT retroactively recompute that workout's own
    // xpBreakdown (no re-litigating XP already awarded), but Progress/streak/muscle-recovery/PR-
    // suggestion calculations elsewhere all read `workouts` fresh, so they immediately reflect
    // the corrected numbers.
    const ok = await onEditWorkout(workout.id, { exercises: setsDraft });
    if (ok) setEditingSets(false);
    else setSaveError("Couldn't save your changes — check your connection and try again.");
    setSaving(false);
  };

  const updateSet = (exIdx, setIdx, field, value) => {
    setSetsDraft((draft) => draft.map((ex, i) => i !== exIdx ? ex : {
      ...ex,
      sets: ex.sets.map((s, j) => j !== setIdx ? s : { ...s, [field]: value === "" ? "" : +value }),
    }));
  };

  const handleDelete = async () => {
    setSaving(true);
    setSaveError(null);
    const ok = await onDeleteWorkout(workout.id);
    setSaving(false);
    if (ok) onClose();
    else setSaveError("Couldn't delete this workout — check your connection and try again.");
  };

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ maxWidth: 480, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div>
            <div className="disp" style={{ fontSize: 20 }}>{fmtDate(workout.date)}</div>
            {durationMin != null && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}><Timer size={12} style={{ verticalAlign: -1, marginRight: 3 }} aria-hidden="true" />{durationMin} min</div>}
          </div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close workout detail"><X size={16} /></button>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13, marginBottom: 6 }}>
            <span className="mono" style={{ color: "var(--ink-dim)" }}>TOTAL VOLUME</span>
            <span className="mono" style={{ color: "var(--brass)" }}>{Math.round(totalVolume)}kg</span>
          </div>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 13 }}>
            <span className="mono" style={{ color: "var(--ink-dim)" }}>XP EARNED</span>
            <span className="mono" style={{ color: "var(--brass)" }}>+{xp.total}</span>
          </div>
        </div>

        {prs.length > 0 && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>
              <Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{prs.length} PR{prs.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {prs.map((pr, i) => (
                <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                  {pr.exName} — {fmtWeightReps(pr.weight, pr.reps)} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
                </div>
              ))}
            </div>
          </div>
        )}

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
            <div className="disp" style={{ fontSize: 14 }}>Exercises</div>
            <button
              className="mono"
              style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: 0 }}
              onClick={() => { setEditingSets((v) => !v); setSetsDraft(workout.exercises.map((e) => ({ ...e, sets: e.sets.map((s) => ({ ...s })) }))); }}
            >
              {editingSets ? "Cancel" : "Correct Sets"}
            </button>
          </div>
          {(editingSets ? setsDraft : workout.exercises).map((ex, exIdx) => (
            <div key={ex.name} style={{ marginBottom: 12 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 4 }}>{ex.name}</div>
              {ex.sets.length === 0 && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>No sets logged.</div>}
              {ex.sets.map((st, stIdx) => (
                <div key={stIdx} style={{ display: "flex", gap: 8, alignItems: "center", fontSize: 12, color: "var(--ink-dim)", marginBottom: 4 }}>
                  {editingSets ? (
                    <>
                      <NumberInput className="atlas-input" style={{ width: 64, padding: "5px 7px" }} value={st.weight} aria-label={`${ex.name} set ${stIdx + 1} weight in kg`} onChange={(v) => updateSet(exIdx, stIdx, "weight", v)} />
                      <span>kg ×</span>
                      <NumberInput className="atlas-input" style={{ width: 54, padding: "5px 7px" }} value={st.reps} aria-label={`${ex.name} set ${stIdx + 1} reps`} onChange={(v) => updateSet(exIdx, stIdx, "reps", v)} />
                    </>
                  ) : (
                    <span>{fmtWeightReps(st.weight, st.reps)}{st.type && st.type !== "normal" ? ` (${st.type})` : ""}</span>
                  )}
                </div>
              ))}
            </div>
          ))}
          {editingSets && (
            <button className="atlas-btn" style={{ width: "100%", marginTop: 4 }} onClick={saveSets} disabled={saving}>
              {saving ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              Save Set Changes
            </button>
          )}
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <div className="disp" style={{ fontSize: 13, marginBottom: 8 }}>Notes</div>
          <textarea
            className="atlas-input"
            rows={3}
            value={notes}
            onChange={(e) => setNotes(e.target.value)}
            style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
            placeholder="How did this session feel?"
          />
          <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={saveNotes} disabled={saving || notes === (workout.notes || "")}>
            Save Notes
          </button>
        </div>

        {saveError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 12 }}>{saveError}</div>}

        <div className="atlas-card" style={{ borderColor: "var(--rest)" }}>
          {!confirmDelete ? (
            <button onClick={() => setConfirmDelete(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rest)", fontSize: 12, padding: 0 }}>
              Delete Workout
            </button>
          ) : (
            <div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
                This permanently deletes this workout and can't be undone. Your streak, muscle recovery, and progress stats will recalculate without it.
              </div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDelete(false)} disabled={saving}>Cancel</button>
                <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} onClick={handleDelete} disabled={saving}>
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

export function Train({ profile, workouts, session, setSession, onFinish, onDiscard, onStartWorkout, finishingWorkout, finishError, customExercises, onAddCustomExercise, onArchiveCustomExercise, onEditWorkout, onDeleteWorkout, initialMuscleFilter }) {
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState(initialMuscleFilter || "all");
  const [equipFilter, setEquipFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  // Progressive rendering for the exercise picker (223 entries, each an SVG PoseFigure — cheap
  // individually, not free 223-at-once on a low-powered phone): render a capped batch and reveal
  // more on demand instead of mounting every filtered match at once. Search/filtering itself
  // still runs over the full list either way; only what's actually rendered is capped.
  const EXERCISE_PAGE_SIZE = 40;
  const [visibleExerciseCount, setVisibleExerciseCount] = useState(EXERCISE_PAGE_SIZE);
  useEffect(() => { setVisibleExerciseCount(EXERCISE_PAGE_SIZE); }, [search, muscleFilter, equipFilter, regionFilter]);
  const [detailEx, setDetailEx] = useState(null);
  const [openCues, setOpenCues] = useState({});
  const [openMenu, setOpenMenu] = useState(null);
  const [weightIn, setWeightIn] = useState({});
  const [repsIn, setRepsIn] = useState({});
  const [durationIn, setDurationIn] = useState({});
  const [distanceIn, setDistanceIn] = useState({});
  const [assistIn, setAssistIn] = useState({});
  const [prToast, setPrToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [restDuration, setRestDuration] = useState(90);
  const [linkingEx, setLinkingEx] = useState(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState(MUSCLE_GROUPS[0]);
  const [customEquip, setCustomEquip] = useState(EQUIPMENT_TYPES[0]);
  const [customAliases, setCustomAliases] = useState("");
  const [customTrackingType, setCustomTrackingType] = useState("weight_reps");
  const [customNotes, setCustomNotes] = useState("");
  const [customImageUrl, setCustomImageUrl] = useState("");
  const [customError, setCustomError] = useState(null);
  const [typeIn, setTypeIn] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sessionPRs, setSessionPRs] = useState([]);
  const [detailWorkout, setDetailWorkout] = useState(null);
  const restAlertedRef = useRef(false);

  // A brand-new session (or returning to none) should never inherit the previous session's
  // review/discard-confirmation UI state.
  useEffect(() => {
    setReviewing(false);
    setConfirmDiscard(false);
    setSessionPRs([]);
  }, [session?.id]);

  useEffect(() => {
    if (!prToast) return;
    const t = setTimeout(() => setPrToast(null), 3800);
    return () => clearTimeout(t);
  }, [prToast]);

  // Ticks once a second while a session is active, driving both the elapsed-time readout and the rest countdown.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    if (!session?.restEndAt) { restAlertedRef.current = false; return; }
    if (now >= session.restEndAt && !restAlertedRef.current) {
      restAlertedRef.current = true;
      playRestDoneSound();
    }
  }, [now, session?.restEndAt]);

  const fmtClock = (secs) => {
    const s = Math.max(0, Math.round(secs));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const history = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  if (!session) {
    return (
      <div style={{ padding: "24px 18px" }}>
        <h1 className="disp-title" style={{ fontSize: 26, marginBottom: 4 }}>Train</h1>
        <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 18 }}>Log today's session and let the coach handle progression.</div>
        <button className="atlas-btn" style={{ width: "100%", padding: 16, fontSize: 15 }} onClick={() => onStartWorkout()}>
          <Plus size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Start Workout
        </button>

        <div style={{ marginTop: 26 }}>
          <h2 className="disp" style={{ fontSize: 15, marginBottom: 10, color: "var(--ink-dim)" }}>History</h2>
          {history.length === 0 && <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>No workouts logged yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((w) => {
              const volume = w.exercises.reduce((s, e) => s + e.sets.reduce((s2, st) => s2 + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0), 0);
              return (
                <button
                  key={w.id}
                  onClick={() => setDetailWorkout(w)}
                  className="atlas-card"
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", cursor: "pointer", padding: "12px 16px", color: "var(--ink)" }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(w.date)}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 13, color: "var(--ink-dim)" }}>{Math.round(volume)}kg vol</div>
                    <ChevronRight size={16} color="var(--ink-dim)" />
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {detailWorkout && (
          <WorkoutDetailModal
            workout={detailWorkout}
            onClose={() => setDetailWorkout(null)}
            onEditWorkout={async (id, patch) => {
              const ok = await onEditWorkout(id, patch);
              if (ok) setDetailWorkout((w) => (w && w.id === id ? { ...w, ...patch } : w));
              return ok;
            }}
            onDeleteWorkout={onDeleteWorkout}
          />
        )}
      </div>
    );
  }

  const allExercises = [...EXERCISES, ...customExercises];

  // Archived custom exercises stay in `allExercises` (so historical workouts, PRs and volume still
  // resolve their name correctly) but are hidden from the picker itself — that's what "archived"
  // means here: not selectable for new workouts, without breaking anything already logged.
  const filtered = allExercises.filter((e) =>
    !e.archived &&
    matchesExerciseSearch(e, search) &&
    (muscleFilter === "all" || e.muscle === muscleFilter) &&
    (equipFilter === "all" || e.equipment === equipFilter) &&
    (regionFilter === "all" || regionForExercise(e) === regionFilter)
  );

  const addExercise = (ex) => {
    setSession((s) => ({ ...s, exercises: [...s.exercises, { name: ex.name, sets: [], supersetWith: null }] }));
    setPicker(false);
    setSearch("");
    setDetailEx(null);
  };

  const createCustomExercise = () => {
    const trimmed = customName.trim();
    if (!trimmed) { setCustomError("Give it a name."); return; }
    const lower = trimmed.toLowerCase();
    // Check both canonical names AND aliases — a custom exercise named "RDL" would otherwise sit
    // right next to Romanian Deadlift in search as if it were a second, different exercise, which
    // is exactly the ambiguity aliases exist to prevent.
    const collision = allExercises.some((e) => e.name.toLowerCase() === lower || (e.aliases || []).some((a) => a.toLowerCase() === lower));
    if (collision) {
      setCustomError("An exercise with that name (or a close alias of one) already exists.");
      return;
    }
    const aliases = customAliases.split(",").map((a) => a.trim()).filter(Boolean);
    const ex = {
      name: trimmed, muscle: customMuscle, equipment: customEquip, pose: MUSCLE_DEFAULT_POSE[customMuscle], isCustom: true,
      aliases, trackingType: customTrackingType, secondaryMuscles: [],
      instructions: customNotes.trim() ? [customNotes.trim()] : [],
      imageUrl: customImageUrl.trim() || null,
    };
    onAddCustomExercise(ex);
    addExercise(ex);
    setCreatingCustom(false);
    setCustomName("");
    setCustomMuscle(MUSCLE_GROUPS[0]);
    setCustomEquip(EQUIPMENT_TYPES[0]);
    setCustomAliases("");
    setCustomTrackingType("weight_reps");
    setCustomNotes("");
    setCustomImageUrl("");
    setCustomError(null);
  };

  // `vals` comes from the set table (weight × reps exercises), which owns its own per-row inputs;
  // every other tracking type still reads the single input row below via weightIn/repsIn/etc.
  const addSet = (exName, vals) => {
    const trackingType = (allExercises.find((e) => e.name === exName)?.trackingType) || "weight_reps";
    const w = vals ? vals.weight : +weightIn[exName]; const r = vals ? vals.reps : +repsIn[exName];
    const dur = +durationIn[exName]; const dist = +distanceIn[exName]; const assist = +assistIn[exName];

    // Each tracking type has its own "what's required to log a set" rule — a plank has no weight
    // to require, a treadmill run has no reps. This replaces the old blanket "weight AND reps or
    // nothing logs" check, which silently blocked logging any exercise that wasn't weight+reps
    // shaped (every bodyweight/duration/distance exercise in the catalogue, old and new).
    let set;
    if (trackingType === "bodyweight_reps") {
      if (!r) return;
      set = { reps: r, weight: w || 0 };
    } else if (trackingType === "assisted_bodyweight") {
      if (!r) return;
      set = { reps: r, assistWeight: assist || 0 };
    } else if (trackingType === "reps_only") {
      if (!r) return;
      set = { reps: r };
    } else if (trackingType === "duration" || trackingType === "isometric_hold") {
      if (!dur) return;
      set = { durationSeconds: dur };
    } else if (trackingType === "distance_duration") {
      if (!dur && !dist) return;
      set = { durationSeconds: dur || null, distanceMeters: dist || null };
    } else if (trackingType === "weight_distance") {
      if (!w || (!dur && !dist)) return;
      set = { weight: w, durationSeconds: dur || null, distanceMeters: dist || null };
    } else if (trackingType === "weighted_duration") {
      if (!w || !dur) return;
      set = { weight: w, durationSeconds: dur };
    } else {
      // weight_reps, bodyweight_plus_weight, per_side_weight — the original, still-most-common shape
      if (!w || !r) return;
      set = { weight: w, reps: r };
    }

    const isFirstSetEver = workouts.length === 0 && session.exercises.every((e) => e.sets.length === 0);
    const setType = vals?.type || typeIn[exName] || "normal";
    set.type = setType;
    const historySets = [
      ...workouts.flatMap((wk) => wk.exercises.filter((e) => e.name === exName).flatMap((e) => e.sets)),
      ...(session.exercises.find((e) => e.name === exName)?.sets || []),
    ];
    const pr = setType === "normal" && WEIGHT_REPS_TRACKING_TYPES.has(trackingType) ? evaluatePR(historySets, w, r) : { isPR: false };
    const linked = session.exercises.find((e) => e.name === exName)?.supersetWith;
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => e.name === exName ? { ...e, sets: [...e.sets, set] } : e),
      // skip the auto rest timer when logging inside a superset — rest happens after both movements, not between them
      restEndAt: linked ? s.restEndAt : Date.now() + restDuration * 1000,
    }));
    restAlertedRef.current = false;
    setWeightIn((v) => ({ ...v, [exName]: "" }));
    setRepsIn((v) => ({ ...v, [exName]: "" }));
    setDurationIn((v) => ({ ...v, [exName]: "" }));
    setDistanceIn((v) => ({ ...v, [exName]: "" }));
    setAssistIn((v) => ({ ...v, [exName]: "" }));
    if (pr.isPR) {
      setPrToast({ exName, weight: w, reps: r, type: pr.type });
      playPRSound();
      setSessionPRs((prev) => [...prev, { exName, weight: w, reps: r, type: pr.type }]);
    }
    if (isFirstSetEver) logEvent("first_set_logged", { exercise: exName });
  };

  const toggleSuperset = (exNameA, exNameB) => {
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => {
        if (e.name === exNameA) return { ...e, supersetWith: e.supersetWith === exNameB ? null : exNameB };
        if (e.name === exNameB) return { ...e, supersetWith: e.supersetWith === exNameA ? null : exNameA };
        if (e.supersetWith === exNameA || e.supersetWith === exNameB) return { ...e, supersetWith: null };
        return e;
      }),
    }));
    setLinkingEx(null);
  };

  const removeSet = (exName, idx) => {
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => e.name === exName ? { ...e, sets: e.sets.filter((_, i) => i !== idx) } : e),
    }));
  };

  const isPR = (exName, weight) => {
    const prevMax = Math.max(0, ...workouts.flatMap((w) => w.exercises.filter((e) => e.name === exName).flatMap((e) => e.sets.map((s) => s.weight))));
    return weight > prevMax;
  };

  const totalSets = session.exercises.reduce((s, e) => s + e.sets.length, 0);
  const totalVolume = session.exercises.reduce((s, e) => s + e.sets.reduce((s2, st) => s2 + (Number.isFinite(st.weight) && Number.isFinite(st.reps) ? st.weight * st.reps : 0), 0), 0);
  const musclesTrained = [...new Set(session.exercises.map((ex) => allExercises.find((e) => e.name === ex.name)?.muscle).filter(Boolean))];
  const skippedExercises = session.exercises.filter((ex) => ex.sets.length === 0);
  const targetSetsTotal = session.exercises.reduce((s, ex) => s + (ex.targetSets || 0), 0);
  const mostSetsIncomplete = targetSetsTotal > 0 && totalSets < targetSetsTotal * 0.5;
  // The exact same computeWorkoutXp call finishWorkout uses to build the stored xpBreakdown —
  // this preview MUST match what actually gets saved and added to the running total once Finish
  // is tapped, or the summary lies about what's about to happen (the original bug this fixes).
  const streakDelta = computeStreak([...workouts, session]) - computeStreak(workouts);
  const xpBreakdownPreview = computeWorkoutXp(session, { prCount: sessionPRs.length, streakDelta });

  return (
    <div style={{ padding: "24px 18px" }}>
      {prToast && (
        <div className="atlas-card" style={{
          position: "sticky", top: 0, zIndex: 20, marginBottom: 14, borderColor: "var(--brass)",
          background: "linear-gradient(135deg, rgba(62,207,142,0.18), var(--bg-elev))",
          display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 18px rgba(62,207,142,0.25)",
        }}>
          <Trophy size={22} color="var(--brass)" style={{ flexShrink: 0 }} />
          <div>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)" }}>New Personal Record!</div>
            <div className="mono" style={{ fontSize: 12 }}>
              {prToast.exName} — {fmtWeightReps(prToast.weight, prToast.reps)} {prToast.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 className="disp-title" style={{ fontSize: 24 }}>{session.planDayName || "Today's Session"}</h1>
          <div className="mono" style={{ fontSize: 13, color: "var(--ink-dim)" }}><Timer size={13} style={{ verticalAlign: -1, marginRight: 3 }} aria-hidden="true" />{fmtClock((now - session.startedAt) / 1000)} elapsed</div>
        </div>
        <button className="atlas-btn-ghost" onClick={() => setConfirmDiscard(true)} style={{ padding: "6px 10px" }}>Cancel</button>
      </div>

      {confirmDiscard && !reviewing && (
        <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
          <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
            {session.exercises.length === 0 ? "Nothing's been logged yet." : `You've logged ${session.exercises.reduce((s, e) => s + e.sets.length, 0)} set(s). This can't be undone.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
            <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
          </div>
        </div>
      )}

      {session.restEndAt && now < session.restEndAt && (
        <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--brass)", background: "var(--brass-soft)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)" }}>Resting</div>
            <div className="mono" style={{ fontSize: 20 }}>{fmtClock((session.restEndAt - now) / 1000)}</div>
          </div>
          <div className="bar-track" style={{ marginBottom: 10 }}>
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, ((session.restEndAt - now) / (restDuration * 1000)) * 100))}%`, background: "var(--brass)" }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: Math.max(now, s.restEndAt - 15000) }))}>-15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: s.restEndAt + 15000 }))}>+15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: null }))}>Skip</button>
          </div>
        </div>
      )}

      {session.exercises.map((ex) => {
        const suggestion = suggestNextTarget(workouts, ex.name, profile.goal);
        const meta = allExercises.find((e) => e.name === ex.name);
        const tips = meta ? (POSE_TIPS[meta.pose] || []) : [];
        const currentType = typeIn[ex.name] || "normal";
        return (
          <div key={ex.name} className="atlas-card" style={{ marginBottom: 12, borderColor: ex.supersetWith ? "var(--warn)" : "var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {meta && <ExerciseThumb ex={meta} size={40} />}
              <div style={{ flex: 1 }}>
                <div className="disp" style={{ fontSize: 16 }}>{ex.name}</div>
                {ex.targetSets && ex.targetReps && (
                  <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                    Target {ex.targetSets} × {ex.targetReps}{ex.sets.length > 0 ? ` · ${ex.sets.length}/${ex.targetSets} done` : ""}
                  </div>
                )}
                {ex.supersetWith && <div className="mono" style={{ fontSize: 12, color: "var(--warn)" }}><Zap size={12} style={{ verticalAlign: -1, marginRight: 3 }} aria-hidden="true" />Superset with {ex.supersetWith}</div>}
              </div>
              <button onClick={() => setOpenMenu(openMenu === ex.name ? null : ex.name)} aria-label={`More options for ${ex.name}`} aria-expanded={openMenu === ex.name}
                style={{ background: "none", border: "none", cursor: "pointer", minWidth: 44, minHeight: 44, display: "inline-flex", alignItems: "center", justifyContent: "center", color: "var(--ink-dim)" }}>
                <MoreHorizontal size={20} />
              </button>
            </div>
            {openMenu === ex.name && (
              <div style={{ display: "flex", gap: 6, marginTop: 6 }}>
                {meta && (
                  <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 38, padding: "6px 0", fontSize: 12 }}
                    onClick={() => { setOpenCues((v) => ({ ...v, [ex.name]: !v[ex.name] })); setOpenMenu(null); }}>
                    {openCues[ex.name] ? "Hide form cues" : "Form cues"}
                  </button>
                )}
                <button className="atlas-btn-ghost" style={{ flex: 1, minHeight: 38, padding: "6px 0", fontSize: 12 }}
                  onClick={() => { setLinkingEx(linkingEx === ex.name ? null : ex.name); setOpenMenu(null); }}>
                  {ex.supersetWith ? "Change superset" : "Link as superset"}
                </button>
              </div>
            )}
            {linkingEx === ex.name && (
              <div style={{ marginTop: 8, padding: 8, background: "var(--bg-elev2)", borderRadius: 8 }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 6 }}>PAIR WITH:</div>
                {session.exercises.filter((e) => e.name !== ex.name).length === 0 && <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>Add another exercise first.</div>}
                {session.exercises.filter((e) => e.name !== ex.name).map((e) => (
                  <button key={e.name} onClick={() => toggleSuperset(ex.name, e.name)} className="pill" style={{ marginRight: 6, marginBottom: 6, cursor: "pointer", border: "1px solid var(--warn)", background: ex.supersetWith === e.name ? "var(--warn)" : "transparent", color: ex.supersetWith === e.name ? "#2E1500" : "var(--warn)" }}>
                    {e.name}
                  </button>
                ))}
              </div>
            )}
            {meta && openCues[ex.name] && (
              <ul style={{ margin: "8px 0 4px", paddingLeft: 18, fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>
                {tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 8, marginBottom: 10 }}>
              <TrendingUp size={13} color="var(--brass)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                {suggestion.text}
              </div>
            </div>

            {WEIGHT_REPS_TRACKING_TYPES.has(meta?.trackingType || "weight_reps") ? (
              <SetTable
                exName={ex.name} sets={ex.sets} targetSets={ex.targetSets} previous={previousSets(workouts, ex.name)}
                suggestedWeight={suggestion.weight} onLog={(vals) => addSet(ex.name, vals)} onRemove={(i) => removeSet(ex.name, i)}
                isPR={(w) => isPR(ex.name, w)}
              />
            ) : (<>
            {ex.sets.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", width: 20 }}>{i + 1}</span>
                <span className="mono" style={{ flex: 1 }}>{formatSet(s, meta?.trackingType)}</span>
                {s.type && s.type !== "normal" && <span className="pill" style={{ fontSize: 9, background: SET_TYPE_COLORS[s.type] + "22", color: SET_TYPE_COLORS[s.type] }}>{SET_TYPE_LABELS[s.type]}</span>}
                {WEIGHT_REPS_TRACKING_TYPES.has(meta?.trackingType || "weight_reps") && isPR(ex.name, s.weight) && <Trophy size={14} color="var(--brass)" />}
                <button onClick={() => removeSet(ex.name, i)} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label={`Remove set ${i + 1} for ${ex.name}`}>
                  <X size={14} color="var(--ink-dim)" />
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 5, marginTop: 10, marginBottom: 6, flexWrap: "wrap" }}>
              {SET_TYPES.map((t) => (
                <button key={t} onClick={() => setTypeIn((v) => ({ ...v, [ex.name]: t }))} className="pill" style={{
                  cursor: "pointer", fontSize: 10,
                  border: `1px solid ${currentType === t ? SET_TYPE_COLORS[t] : "var(--line)"}`,
                  background: currentType === t ? SET_TYPE_COLORS[t] + "22" : "transparent",
                  color: currentType === t ? SET_TYPE_COLORS[t] : "var(--ink-dim)",
                }}>{SET_TYPE_LABELS[t]}</button>
              ))}
            </div>
            {/* Each tracking type shows only the inputs that actually mean something for it — a
                plank never asks for weight, a treadmill run never asks for reps. */}
            {(() => {
              const tt = meta?.trackingType || "weight_reps";
              const setNum = (setter) => (value) => setter((v) => ({ ...v, [ex.name]: value }));
              if (tt === "bodyweight_reps") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="reps" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <NumberInput className="atlas-input" placeholder="+kg (optional)" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Added weight in kg for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "assisted_bodyweight") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="reps" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <NumberInput className="atlas-input" placeholder="assist kg" value={assistIn[ex.name] || ""} onChange={setNum(setAssistIn)} aria-label={`Assistance weight in kg for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "reps_only") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="reps" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "duration" || tt === "isometric_hold") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="seconds" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "distance_duration") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="meters" value={distanceIn[ex.name] || ""} onChange={setNum(setDistanceIn)} aria-label={`Distance in meters for ${ex.name}`} />
                  <NumberInput className="atlas-input" placeholder="seconds" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "weight_distance" || tt === "weighted_duration") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="kg" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Weight in kg for ${ex.name}`} />
                  {tt === "weight_distance" && <NumberInput className="atlas-input" placeholder="meters" value={distanceIn[ex.name] || ""} onChange={setNum(setDistanceIn)} aria-label={`Distance in meters for ${ex.name}`} />}
                  <NumberInput className="atlas-input" placeholder="seconds" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  <NumberInput className="atlas-input" placeholder="kg" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Weight in kg for ${ex.name}`} />
                  <NumberInput className="atlas-input" placeholder="reps" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
            })()}
            </>)}
          </div>
        );
      })}

      {!picker ? (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setPicker(true)}>
          <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add Exercise
        </button>
      ) : detailEx ? (
        <ExerciseDetailCard
          ex={detailEx} onAdd={addExercise} onBack={() => setDetailEx(null)}
          onArchive={detailEx.isCustom ? async () => { await onArchiveCustomExercise(detailEx.name); setDetailEx(null); } : null}
        />
      ) : creatingCustom ? (
        <div className="atlas-card">
          <button onClick={() => { setCreatingCustom(false); setCustomError(null); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", marginBottom: 12 }}>
            ← Back to library
          </button>
          <div className="disp" style={{ fontSize: 16, marginBottom: 12 }}>New Custom Exercise</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NAME</div>
              <input autoFocus className="atlas-input" placeholder="e.g. Cable Y-Raise" value={customName} onChange={(e) => { setCustomName(e.target.value); setCustomError(null); }} />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>MUSCLE GROUP</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {MUSCLE_GROUPS.map((m) => (
                  <button key={m} onClick={() => setCustomMuscle(m)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", textTransform: "capitalize", background: customMuscle === m ? "var(--brass-soft)" : "transparent", color: customMuscle === m ? "var(--brass)" : "var(--ink-dim)" }}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>EQUIPMENT</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {EQUIPMENT_TYPES.map((eq) => (
                  <button key={eq} onClick={() => setCustomEquip(eq)} className="pill" style={{ cursor: "pointer", border: `1px solid ${customEquip === eq ? EQUIPMENT_COLORS[eq] : "var(--line)"}`, background: "transparent", color: customEquip === eq ? EQUIPMENT_COLORS[eq] : "var(--ink-dim)" }}>{eq}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>HOW IS IT LOGGED?</div>
              <select className="atlas-input" value={customTrackingType} onChange={(e) => setCustomTrackingType(e.target.value)}>
                {TRACKING_TYPES.map((t) => <option key={t} value={t}>{TRACKING_TYPE_LABEL[t]}</option>)}
              </select>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>ALIASES / OTHER NAMES (optional, comma-separated)</div>
              <input className="atlas-input" placeholder="e.g. Y Raise, Cable Y" value={customAliases} onChange={(e) => setCustomAliases(e.target.value)} />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NOTES / INSTRUCTIONS (optional)</div>
              <textarea className="atlas-input" rows={2} placeholder="How you set it up and perform it" value={customNotes} onChange={(e) => setCustomNotes(e.target.value)} />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>IMAGE URL (optional — a link you own the rights to)</div>
              <input className="atlas-input" placeholder="https://..." value={customImageUrl} onChange={(e) => setCustomImageUrl(e.target.value)} />
            </div>
            {customError && <div className="mono" style={{ color: "var(--rest)", fontSize: 12 }}>{customError}</div>}
            <button className="atlas-btn" style={{ width: "100%", marginTop: 6 }} onClick={createCustomExercise}>
              <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Create & Add to Workout
            </button>
          </div>
        </div>
      ) : (
        <div className="atlas-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Search size={14} color="var(--ink-dim)" />
            <input autoFocus className="atlas-input" placeholder="Search exercises" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            <button onClick={() => { setMuscleFilter("all"); setRegionFilter("all"); }} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: muscleFilter === "all" ? "var(--brass-soft)" : "transparent", color: muscleFilter === "all" ? "var(--brass)" : "var(--ink-dim)" }}>All</button>
            {MUSCLE_GROUPS.map((m) => (
              <button key={m} onClick={() => { setMuscleFilter(m); setRegionFilter("all"); }} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", textTransform: "capitalize", background: muscleFilter === m ? "var(--brass-soft)" : "transparent", color: muscleFilter === m ? "var(--brass)" : "var(--ink-dim)" }}>{m}</button>
            ))}
          </div>
          {muscleFilter !== "all" && (REGIONS_BY_GROUP[muscleFilter] || []).length > 1 && (
            <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }} role="group" aria-label={`Filter ${muscleFilter} by specific muscle`}>
              <button onClick={() => setRegionFilter("all")} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: regionFilter === "all" ? "var(--bg-elev2)" : "transparent", color: regionFilter === "all" ? "var(--ink)" : "var(--ink-dim)" }}>Any {muscleFilter}</button>
              {REGIONS_BY_GROUP[muscleFilter].map((r) => (
                <button key={r} onClick={() => setRegionFilter(r)} className="pill" style={{ cursor: "pointer", border: `1px solid ${regionFilter === r ? "var(--brass)" : "var(--line)"}`, background: regionFilter === r ? "var(--brass-soft)" : "transparent", color: regionFilter === r ? "var(--brass)" : "var(--ink-dim)" }}>{REGION_LABEL[r]}</button>
              ))}
            </div>
          )}
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => setEquipFilter("all")} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: equipFilter === "all" ? "var(--bg-elev2)" : "transparent", color: equipFilter === "all" ? "var(--ink)" : "var(--ink-dim)" }}>Any Equipment</button>
            {EQUIPMENT_TYPES.map((eq) => (
              <button key={eq} onClick={() => setEquipFilter(eq)} className="pill" style={{ cursor: "pointer", border: `1px solid ${equipFilter === eq ? EQUIPMENT_COLORS[eq] : "var(--line)"}`, background: "transparent", color: equipFilter === eq ? EQUIPMENT_COLORS[eq] : "var(--ink-dim)" }}>{eq}</button>
            ))}
          </div>
          <button
            onClick={() => { setCreatingCustom(true); setCustomName(search); }}
            className="atlas-btn-ghost"
            style={{ width: "100%", marginBottom: 10, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Plus size={14} /> Create Custom Exercise
          </button>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {filtered.length === 0 && (
              <div style={{ fontSize: 12, color: "var(--ink-dim)", padding: 8 }}>
                No exercises match those filters. Use "Create Custom Exercise" above to add your own.
              </div>
            )}
            {filtered.slice(0, visibleExerciseCount).map((ex) => (
              <button key={ex.name} onClick={() => setDetailEx(ex)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "var(--ink)" }}>
                <ExerciseThumb ex={ex} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>
                    {ex.name}
                    {ex.isCustom && <span className="pill" style={{ marginLeft: 6, fontSize: 8, border: "1px solid var(--line)", color: "var(--ink-dim)" }}>Custom</span>}
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: EQUIPMENT_COLORS[ex.equipment] }}>{ex.equipment}</span>
                </div>
                <ChevronRight size={15} color="var(--ink-dim)" />
              </button>
            ))}
            {filtered.length > visibleExerciseCount && (
              <button
                onClick={() => setVisibleExerciseCount((n) => n + EXERCISE_PAGE_SIZE)}
                className="mono"
                style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: "8px 0", minHeight: 44, width: "100%", textAlign: "center" }}
              >
                Show {Math.min(EXERCISE_PAGE_SIZE, filtered.length - visibleExerciseCount)} more ({filtered.length - visibleExerciseCount} remaining)
              </button>
            )}
          </div>
        </div>
      )}

      {session.exercises.length > 0 && (
        <button className="atlas-btn" style={{ width: "100%", marginTop: 18, padding: 14 }} onClick={() => setReviewing(true)}>
          Finish Workout
        </button>
      )}

      {reviewing && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px" }}>
          <h1 className="disp" style={{ fontSize: 22, marginBottom: 4 }}>Workout Summary</h1>
          <div className="mono" style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>
            <Timer size={12} style={{ verticalAlign: -1, marginRight: 3 }} aria-hidden="true" />{fmtClock((now - session.startedAt) / 1000)} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"} · {Math.round(totalVolume)}kg volume
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 12 }}>
            {musclesTrained.map((m) => (
              <span key={m} className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>{m}</span>
            ))}
          </div>

          {/* Itemized to the exact number that gets saved and added to the account's running
              total — see the comment on finishWorkout for why this used to silently disagree
              with that total (a real, reported bug: "+55 XP" shown here, +65 actually applied). */}
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>XP Earned</div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4, marginBottom: 8 }}>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Workout completion</span><span className="mono">+{xpBreakdownPreview.completion}</span></div>
              <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Sets &amp; exercises</span><span className="mono">+{xpBreakdownPreview.sets}</span></div>
              {xpBreakdownPreview.prBonus > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Personal record bonus</span><span className="mono">+{xpBreakdownPreview.prBonus}</span></div>
              )}
              {xpBreakdownPreview.streakBonus > 0 && (
                <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Streak bonus</span><span className="mono">+{xpBreakdownPreview.streakBonus}</span></div>
              )}
            </div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 14, borderTop: "1px solid var(--line)", paddingTop: 8 }}>
              <span className="disp">Total XP earned</span>
              <span className="mono" style={{ color: "var(--brass)" }}>+{xpBreakdownPreview.total}</span>
            </div>
          </div>

          {sessionPRs.length > 0 && (
            <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
              <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}><Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{sessionPRs.length} New PR{sessionPRs.length === 1 ? "" : "s"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sessionPRs.map((pr, i) => (
                  <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                    {pr.exName} — {fmtWeightReps(pr.weight, pr.reps)} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mostSetsIncomplete && (
            <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--warn)", background: "rgba(255,165,61,0.08)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>
                  You logged {totalSets} of {targetSetsTotal} planned sets for {session.planDayName || "this workout"}. Saving now will record it as done — you can always start another session to finish the rest.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {session.exercises.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>No exercises logged.</div>}
            {session.exercises.map((ex) => (
              <div key={ex.name} className="atlas-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div className="disp" style={{ fontSize: 14 }}>{ex.name}</div>
                  {ex.sets.length === 0 && <span className="pill mono" style={{ background: "rgba(255,107,129,0.12)", color: "var(--rest)" }}>Skipped</span>}
                </div>
                {ex.sets.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No sets logged — added to this workout but never completed.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {ex.sets.map((s, i) => (
                      <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                        {fmtWeightReps(s.weight, s.reps)}{s.type && s.type !== "normal" ? ` (${SET_TYPE_LABELS[s.type]})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", marginBottom: 4 }}>NOTES (OPTIONAL)</label>
            <textarea
              className="atlas-input"
              style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
              placeholder="How did it feel? Anything to remember for next time…"
              value={session.notes || ""}
              onChange={(e) => setSession((s) => ({ ...s, notes: e.target.value }))}
            />
          </div>

          {finishError && <div className="mono" style={{ color: "var(--rest)", fontSize: 12, marginBottom: 12 }}>{finishError}</div>}

          {confirmDiscard ? (
            <div className="atlas-card" style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
              <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>This can't be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
                <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="atlas-btn" style={{ width: "100%", padding: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={finishingWorkout} onClick={() => onFinish(session, sessionPRs)}>
                {finishingWorkout && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                {finishingWorkout ? "Saving…" : "Save Workout"}
              </button>
              <button className="atlas-btn-ghost" style={{ width: "100%" }} disabled={finishingWorkout} onClick={() => setReviewing(false)}>Continue Editing</button>
              <button onClick={() => setConfirmDiscard(true)} disabled={finishingWorkout} className="mono" style={{ background: "none", border: "none", cursor: finishingWorkout ? "default" : "pointer", color: "var(--ink-dim)", fontSize: 12, padding: 6, textAlign: "center" }}>
                Discard Workout
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
