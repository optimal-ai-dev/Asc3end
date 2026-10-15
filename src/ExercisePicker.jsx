import React, { useState, useEffect, useMemo } from "react";
import { Search, Plus, ChevronRight, Check, Info, X } from "lucide-react";
import {
  MUSCLE_GROUPS, EQUIPMENT_TYPES, EQUIPMENT_COLORS, REGION_LABEL, READINESS_MUSCLE_IDS, REGIONS_BY_GROUP, REGION_TO_GROUP,
  TRACKING_TYPES, TRACKING_TYPE_LABEL, MUSCLE_DEFAULT_POSE, EXERCISES, regionForExercise, rankExerciseSearch,
  matchedOnlyViaSecondaryMuscle, getExerciseAlternatives,
} from "./exerciseData.js";
import { ExerciseThumb, ExerciseDetailCard } from "./ExerciseFigures.jsx";

const EXERCISE_PAGE_SIZE = 40;

const ghostBtn = { background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center" };
const pillStyle = (active, color = "var(--brass)", soft = "var(--brass-soft)") => ({
  cursor: "pointer", minHeight: 40, border: `1px solid ${active ? color : "var(--line)"}`,
  background: active ? soft : "transparent", color: active ? color : "var(--ink-dim)",
});

/**
 * Exercise library picker.
 *  mode "add"  — tap any number of rows (checkboxes), then one "Add N exercises" button. Details
 *                (form cues, figure) are optional: the info button on each row opens them.
 *  mode "swap" — pick ONE replacement for `swapFrom`; same-muscle alternatives are suggested first.
 */
export default function ExercisePicker({
  mode = "add", swapFrom = null, existingNames = [], customExercises = [], initialMuscleFilter = null,
  onAddMany, onSwap, onClose, onAddCustomExercise, onArchiveCustomExercise,
}) {
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState(initialMuscleFilter || "all");
  const [equipFilter, setEquipFilter] = useState("all");
  const [regionFilter, setRegionFilter] = useState("all");
  const [visible, setVisible] = useState(EXERCISE_PAGE_SIZE);
  const [selected, setSelected] = useState(() => new Map()); // name -> exercise, insertion order = add order
  const [detailEx, setDetailEx] = useState(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [custom, setCustom] = useState({ name: "", primary: READINESS_MUSCLE_IDS[0], secondary: [], equip: EQUIPMENT_TYPES[0], aliases: "", tracking: "weight_reps", notes: "", imageUrl: "" });
  const [customError, setCustomError] = useState(null);

  useEffect(() => { setVisible(EXERCISE_PAGE_SIZE); }, [search, muscleFilter, equipFilter, regionFilter]);

  const all = useMemo(() => [...EXERCISES, ...customExercises], [customExercises]);
  const taken = useMemo(() => new Set(existingNames), [existingNames]);

  const byCategory = useMemo(() => all.filter((e) =>
    !e.archived &&
    (muscleFilter === "all" || e.muscle === muscleFilter) &&
    (equipFilter === "all" || e.equipment === equipFilter) &&
    (regionFilter === "all" || regionForExercise(e) === regionFilter)
  ), [all, muscleFilter, equipFilter, regionFilter]);
  // Ranked, not just filtered, once there is search text: a direct-muscle match always outranks a
  // secondary-muscle-only one (see rankExerciseSearch).
  const filtered = useMemo(() => (search.trim() ? rankExerciseSearch(byCategory, search) : byCategory), [byCategory, search]);

  const suggestions = useMemo(() => {
    if (mode !== "swap" || !swapFrom) return [];
    const base = all.find((e) => e.name === swapFrom.name) || swapFrom;
    return getExerciseAlternatives(base, all.filter((e) => !e.archived && !taken.has(e.name)), { limit: 6 });
  }, [mode, swapFrom, all, taken]);

  const toggle = (ex) => setSelected((prev) => {
    const next = new Map(prev);
    if (next.has(ex.name)) next.delete(ex.name); else next.set(ex.name, ex);
    return next;
  });

  const createCustomExercise = () => {
    const trimmed = custom.name.trim();
    if (!trimmed) { setCustomError("Give it a name."); return; }
    const lower = trimmed.toLowerCase();
    // Check both canonical names AND aliases: a custom "RDL" would otherwise sit beside Romanian
    // Deadlift as if it were a different exercise.
    if (all.some((e) => e.name.toLowerCase() === lower || (e.aliases || []).some((a) => a.toLowerCase() === lower))) {
      setCustomError("An exercise with that name (or a close alias of one) already exists.");
      return;
    }
    const category = REGION_TO_GROUP[custom.primary] || MUSCLE_GROUPS[0];
    const ex = {
      name: trimmed, muscle: category, region: custom.primary, equipment: custom.equip, pose: MUSCLE_DEFAULT_POSE[category], isCustom: true,
      aliases: custom.aliases.split(",").map((a) => a.trim()).filter(Boolean), trackingType: custom.tracking, secondaryMuscles: custom.secondary,
      instructions: custom.notes.trim() ? [custom.notes.trim()] : [], imageUrl: custom.imageUrl.trim() || null,
    };
    onAddCustomExercise?.(ex);
    if (mode === "swap") onSwap?.(ex); else onAddMany?.([ex]);
  };

  const rowFor = (ex, { secondaryOnly = false, suggested = false } = {}) => {
    const added = taken.has(ex.name);
    const isSel = selected.has(ex.name);
    const onMain = () => { if (added) return; if (mode === "swap") onSwap?.(ex); else toggle(ex); };
    return (
      <div key={ex.name} style={{ display: "flex", alignItems: "stretch", gap: 6 }}>
        <button
          type="button"
          role={mode === "swap" ? undefined : "checkbox"}
          aria-checked={mode === "swap" ? undefined : isSel}
          aria-disabled={added || undefined}
          onClick={onMain}
          style={{
            flex: 1, display: "flex", alignItems: "center", gap: 10, textAlign: "left", minHeight: 52,
            background: isSel ? "var(--brass-soft)" : "var(--bg-elev2)", border: `1px solid ${isSel ? "var(--brass)" : "var(--line)"}`,
            borderRadius: 8, padding: "6px 10px", cursor: added ? "default" : "pointer", color: "var(--ink)", opacity: added ? 0.55 : 1,
          }}
        >
          {mode !== "swap" && (
            <span aria-hidden="true" style={{ width: 22, height: 22, borderRadius: 6, flexShrink: 0, display: "inline-flex", alignItems: "center", justifyContent: "center", border: `1.5px solid ${isSel || added ? "var(--brass)" : "var(--ink-dim)"}`, background: isSel || added ? "var(--brass)" : "transparent" }}>
              {(isSel || added) && <Check size={14} color="#072016" strokeWidth={3} />}
            </span>
          )}
          <ExerciseThumb ex={ex} size={30} />
          <span style={{ flex: 1, minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 13 }}>
              {ex.name}
              {ex.isCustom && <span className="pill" style={{ marginLeft: 6, fontSize: 8, border: "1px solid var(--steel)", color: "var(--steel)" }}>Custom</span>}
              {added && <span className="pill mono" style={{ marginLeft: 6, fontSize: 8 }}>In workout</span>}
              {suggested && !added && <span className="pill mono" style={{ marginLeft: 6, fontSize: 8, color: "var(--brass)" }}>Similar</span>}
            </span>
            <span className="mono" style={{ fontSize: 10, color: EQUIPMENT_COLORS[ex.equipment] }}>{ex.equipment}</span>
            {secondaryOnly && <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginLeft: 8, fontStyle: "italic" }}>Also trains {search.trim().toLowerCase()}</span>}
          </span>
        </button>
        <button
          type="button" onClick={() => setDetailEx(ex)} aria-label={`Details for ${ex.name}`}
          style={{ width: 44, flexShrink: 0, background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 8, cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}
        >
          <Info size={16} color="var(--ink-dim)" />
        </button>
      </div>
    );
  };

  if (detailEx) {
    return (
      <ExerciseDetailCard
        ex={detailEx}
        onAdd={(ex) => { if (mode === "swap") onSwap?.(ex); else { setSelected((p) => new Map(p).set(ex.name, ex)); setDetailEx(null); } }}
        onBack={() => setDetailEx(null)}
        onArchive={detailEx.isCustom ? async () => { await onArchiveCustomExercise?.(detailEx.name); setDetailEx(null); } : null}
      />
    );
  }

  if (creatingCustom) {
    const set = (k) => (e) => { setCustom((c) => ({ ...c, [k]: e.target.value })); setCustomError(null); };
    return (
      <div className="atlas-card">
        <button onClick={() => { setCreatingCustom(false); setCustomError(null); }} className="mono" style={{ ...ghostBtn, marginBottom: 12 }}>← Back to library</button>
        <div className="disp" style={{ fontSize: 16, marginBottom: 12 }}>New Custom Exercise</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NAME</div>
            <input autoFocus className="atlas-input" placeholder="e.g. Cable Y-Raise" aria-label="Exercise name" value={custom.name} onChange={set("name")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>PRIMARY MUSCLE</div>
            <select aria-label="Primary muscle" className="atlas-input" value={custom.primary} onChange={set("primary")}>
              {MUSCLE_GROUPS.map((group) => (
                <optgroup key={group} label={group.charAt(0).toUpperCase() + group.slice(1)}>
                  {(REGIONS_BY_GROUP[group] || []).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
                </optgroup>
              ))}
            </select>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 4 }}>Category: {REGION_TO_GROUP[custom.primary]} (set automatically from the muscle above)</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>SECONDARY MUSCLES (optional)</div>
            <select
              aria-label="Secondary muscles (optional, multiple)" className="atlas-input" multiple size={5} value={custom.secondary}
              onChange={(e) => setCustom((c) => ({ ...c, secondary: [...e.target.selectedOptions].map((o) => o.value) }))}
            >
              {READINESS_MUSCLE_IDS.filter((r) => r !== custom.primary).map((r) => <option key={r} value={r}>{REGION_LABEL[r]}</option>)}
            </select>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 4 }}>Ctrl/Cmd-click to select more than one.</div>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>EQUIPMENT</div>
            <select aria-label="Equipment" className="atlas-input" value={custom.equip} onChange={set("equip")}>
              {EQUIPMENT_TYPES.map((eq) => <option key={eq} value={eq}>{eq}</option>)}
            </select>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>HOW IS IT LOGGED?</div>
            <select aria-label="How is it logged" className="atlas-input" value={custom.tracking} onChange={set("tracking")}>
              {TRACKING_TYPES.map((t) => <option key={t} value={t}>{TRACKING_TYPE_LABEL[t]}</option>)}
            </select>
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>ALIASES / OTHER NAMES (optional, comma-separated)</div>
            <input className="atlas-input" placeholder="e.g. Y Raise, Cable Y" aria-label="Aliases" value={custom.aliases} onChange={set("aliases")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NOTES / INSTRUCTIONS (optional)</div>
            <textarea className="atlas-input" rows={2} placeholder="How you set it up and perform it" aria-label="Notes and instructions" value={custom.notes} onChange={set("notes")} />
          </div>
          <div>
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>IMAGE URL (optional — a link you own the rights to)</div>
            <input className="atlas-input" placeholder="https://..." aria-label="Image URL" value={custom.imageUrl} onChange={set("imageUrl")} />
          </div>
          {customError && <div className="mono" role="alert" style={{ color: "var(--rest)", fontSize: 12 }}>{customError}</div>}
          <button className="atlas-btn" style={{ width: "100%", marginTop: 6, minHeight: 48 }} onClick={createCustomExercise}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> {mode === "swap" ? "Create & Swap In" : "Create & Add to Workout"}
          </button>
        </div>
      </div>
    );
  }

  const selectedCount = selected.size;
  return (
    <div className="atlas-card" style={{ paddingBottom: mode === "add" ? 0 : undefined }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", marginBottom: 8 }}>
        <div className="disp" style={{ fontSize: 15 }}>{mode === "swap" ? `Replace ${swapFrom?.name || "exercise"}` : "Add exercises"}</div>
        <button type="button" onClick={onClose} aria-label="Close exercise picker" style={{ ...ghostBtn, width: 44, justifyContent: "center" }}><X size={18} /></button>
      </div>

      <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
        <Search size={14} color="var(--ink-dim)" />
        <input autoFocus className="atlas-input" placeholder="Search exercises" aria-label="Search exercises" value={search} onChange={(e) => setSearch(e.target.value)} />
      </div>

      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
        <button onClick={() => { setMuscleFilter("all"); setRegionFilter("all"); }} aria-pressed={muscleFilter === "all"} className="pill" style={pillStyle(muscleFilter === "all")}>All</button>
        {MUSCLE_GROUPS.map((m) => (
          <button key={m} onClick={() => { setMuscleFilter(m); setRegionFilter("all"); }} aria-pressed={muscleFilter === m} className="pill" style={{ ...pillStyle(muscleFilter === m), textTransform: "capitalize" }}>{m}</button>
        ))}
      </div>
      {muscleFilter !== "all" && (REGIONS_BY_GROUP[muscleFilter] || []).length > 1 && (
        <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }} role="group" aria-label={`Filter ${muscleFilter} by specific muscle`}>
          <button onClick={() => setRegionFilter("all")} className="pill" style={pillStyle(regionFilter === "all", "var(--ink)", "var(--bg-elev2)")}>Any {muscleFilter}</button>
          {REGIONS_BY_GROUP[muscleFilter].map((r) => (
            <button key={r} onClick={() => setRegionFilter(r)} aria-pressed={regionFilter === r} className="pill" style={pillStyle(regionFilter === r)}>{REGION_LABEL[r]}</button>
          ))}
        </div>
      )}
      <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
        <button onClick={() => setEquipFilter("all")} className="pill" style={pillStyle(equipFilter === "all", "var(--ink)", "var(--bg-elev2)")}>Any Equipment</button>
        {EQUIPMENT_TYPES.map((eq) => (
          <button key={eq} onClick={() => setEquipFilter(eq)} aria-pressed={equipFilter === eq} className="pill" style={{ ...pillStyle(equipFilter === eq, EQUIPMENT_COLORS[eq], "transparent") }}>{eq}</button>
        ))}
      </div>

      <button onClick={() => { setCreatingCustom(true); setCustom((c) => ({ ...c, name: search })); }} className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 10, borderColor: "var(--steel)", color: "var(--steel)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6, minHeight: 44 }}>
        <Plus size={14} /> Create Custom Exercise
      </button>

      {mode === "swap" && suggestions.length > 0 && !search.trim() && (
        <div style={{ marginBottom: 10 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 6 }}>SIMILAR EXERCISES</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 5 }}>{suggestions.map((ex) => rowFor(ex, { suggested: true }))}</div>
        </div>
      )}

      <div style={{ maxHeight: 340, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
        {filtered.length === 0 && (
          <div style={{ fontSize: 12, color: "var(--ink-dim)", padding: 8 }}>No exercises match those filters. Use "Create Custom Exercise" above to add your own.</div>
        )}
        {filtered.slice(0, visible).map((ex) => rowFor(ex, { secondaryOnly: !!(search.trim() && matchedOnlyViaSecondaryMuscle(ex, search)) }))}
        {filtered.length > visible && (
          <button onClick={() => setVisible((n) => n + EXERCISE_PAGE_SIZE)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: "8px 0", minHeight: 44, width: "100%", textAlign: "center" }}>
            Show {Math.min(EXERCISE_PAGE_SIZE, filtered.length - visible)} more ({filtered.length - visible} remaining)
          </button>
        )}
      </div>

      {mode === "add" && (
        <div style={{ position: "sticky", bottom: 0, margin: "10px -16px 0", padding: "10px 16px calc(10px + env(safe-area-inset-bottom))", background: "var(--bg-elev)", borderTop: "1px solid var(--line)", borderRadius: "0 0 var(--radius-lg, 16px) var(--radius-lg, 16px)" }}>
          <button
            className="atlas-btn" style={{ width: "100%", minHeight: 48 }} disabled={selectedCount === 0}
            onClick={() => onAddMany?.([...selected.values()])}
          >
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} />
            {selectedCount === 0 ? "Select exercises to add" : `Add ${selectedCount} exercise${selectedCount === 1 ? "" : "s"} to workout`}
          </button>
        </div>
      )}
    </div>
  );
}
