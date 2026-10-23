import { useState } from "react";
import { Check, Plus, Trophy } from "lucide-react";
import { SET_TYPES, SET_TYPE_COLORS, SET_TYPE_LABELS } from "../lib/workoutHelpers";

// Short set-number labels in the Hevy/Strong convention: normal sets are numbered, the others
// get a coloured letter so a warm-up never reads as "set 1".
const TYPE_BADGE = { warmup: "W", drop: "D", failure: "F" };

const fmtPrev = (s) => (s && Number.isFinite(s.weight) && Number.isFinite(s.reps) ? `${s.weight} × ${s.reps}` : "—");

/* ------------------------------------------------------------------ */
/* SetTable — the live-workout logger for weight × reps exercises      */
/* ------------------------------------------------------------------ */

// One row per planned set (Set · Previous · kg · Reps · ✓), the pattern lifters already know from
// Strong and Hevy. Pending rows come pre-filled (as placeholders) from the same set last session,
// so a set that matches last time is one tap on ✓; typing only happens when something changed.
// Tapping a pending row's set number cycles its type; tapping a logged row's ✓ un-logs it.
export function SetTable({ exName, sets, targetSets, previous, suggestedWeight, onLog, onRemove, isPR }) {
  const [drafts, setDrafts] = useState({}); // rowIndex -> { kg, reps, type }
  const [extraRows, setExtraRows] = useState(0);

  const rowCount = Math.max(targetSets || 0, previous.length, sets.length, 1) + extraRows;
  // Rows past what was done last time borrow from this session's latest set, then last session's
  // final set, so an extra set is still one tap.
  const lastLogged = sets[sets.length - 1];
  const lastPrevious = previous[previous.length - 1];

  const placeholderFor = (n) => {
    const prev = previous[n];
    return {
      kg: prev?.weight ?? lastLogged?.weight ?? lastPrevious?.weight ?? suggestedWeight ?? "",
      reps: prev?.reps ?? lastLogged?.reps ?? lastPrevious?.reps ?? "",
    };
  };

  const setDraft = (n, patch) => setDrafts((d) => ({ ...d, [n]: { ...d[n], ...patch } }));

  const logRow = (n) => {
    const draft = drafts[n] || {};
    const ph = placeholderFor(n);
    const weight = +(draft.kg !== undefined && draft.kg !== "" ? draft.kg : ph.kg);
    const reps = +(draft.reps !== undefined && draft.reps !== "" ? draft.reps : ph.reps);
    if (!weight || !reps) return;
    onLog({ weight, reps, type: draft.type || "normal" });
    // The logged set is appended to `sets`, so every pending row after this one moves up a slot —
    // shift their drafts with them instead of leaving typed values on the wrong row.
    setDrafts((d) => {
      const next = {};
      Object.entries(d).forEach(([k, v]) => {
        const i = +k;
        if (i < n) next[i] = v;
        else if (i > n) next[i - 1] = v;
      });
      return next;
    });
    if (sets.length + 1 >= rowCount && extraRows > 0) setExtraRows((x) => Math.max(0, x - 1));
  };

  const cycleType = (n) => {
    const cur = drafts[n]?.type || "normal";
    setDraft(n, { type: SET_TYPES[(SET_TYPES.indexOf(cur) + 1) % SET_TYPES.length] });
  };

  // Normal sets are numbered among themselves (1, 2, 3 after a W), across logged and pending rows.
  let normalCount = 0;
  const label = (type) => (type && type !== "normal" ? TYPE_BADGE[type] : String(++normalCount));

  const cell = { textAlign: "center", padding: "4px 3px" };
  const valueBox = { width: "100%", textAlign: "center", padding: "8px 4px", fontWeight: 700, fontSize: 15 };

  return (
    <div>
      <table style={{ width: "100%", borderCollapse: "separate", borderSpacing: "0 4px", tableLayout: "fixed" }}>
        <colgroup><col style={{ width: 40 }} /><col /><col style={{ width: 72 }} /><col style={{ width: 60 }} /><col style={{ width: 48 }} /></colgroup>
        <thead>
          <tr className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
            <th style={cell} scope="col">Set</th>
            <th style={cell} scope="col">Previous</th>
            <th style={cell} scope="col">kg</th>
            <th style={cell} scope="col">Reps</th>
            <th style={cell} scope="col"><span style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>Done</span></th>
          </tr>
        </thead>
        <tbody>
          {sets.map((s, i) => {
            const type = s.type || "normal";
            const lbl = label(type);
            return (
              <tr key={`done-${i}`} style={{ background: "var(--brass-soft)" }}>
                <td style={{ ...cell, borderRadius: "8px 0 0 8px", fontWeight: 800, color: type === "normal" ? "var(--ink)" : SET_TYPE_COLORS[type] }} title={SET_TYPE_LABELS[type]}>{lbl}</td>
                <td className="mono" style={{ ...cell, fontSize: 13, color: "var(--ink-dim)" }}>{fmtPrev(previous[i])}</td>
                <td className="mono" style={{ ...cell, ...valueBox }}>{s.weight}</td>
                <td className="mono" style={{ ...cell, ...valueBox }}>
                  {s.reps}
                  {type === "normal" && isPR(s.weight) && <Trophy size={12} color="var(--brass)" style={{ marginLeft: 3, verticalAlign: 0 }} aria-label="Personal record" />}
                </td>
                <td style={{ ...cell, borderRadius: "0 8px 8px 0" }}>
                  <button onClick={() => onRemove(i)} aria-label={`Un-log set ${i + 1} of ${exName}`}
                    style={{ width: 36, height: 36, minHeight: 36, borderRadius: 9, border: "none", background: "var(--brass)", color: "#072016", cursor: "pointer", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={18} strokeWidth={3} />
                  </button>
                </td>
              </tr>
            );
          })}
          {Array.from({ length: Math.max(0, rowCount - sets.length) }, (_, k) => {
            const n = sets.length + k;
            const draft = drafts[n] || {};
            const type = draft.type || "normal";
            const ph = placeholderFor(n);
            const lbl = label(type);
            const ready = !!(+(draft.kg || ph.kg) && +(draft.reps || ph.reps));
            return (
              <tr key={`todo-${n}`}>
                <td style={cell}>
                  <button onClick={() => cycleType(n)} aria-label={`Set ${n + 1} type: ${SET_TYPE_LABELS[type]}. Tap to change`}
                    style={{ width: 32, minHeight: 36, background: "var(--bg-elev2)", border: "none", borderRadius: 8, cursor: "pointer", fontWeight: 800, color: type === "normal" ? "var(--ink)" : SET_TYPE_COLORS[type] }}>
                    {lbl}
                  </button>
                </td>
                <td className="mono" style={{ ...cell, fontSize: 13, color: "var(--ink-dim)" }}>{fmtPrev(previous[n])}</td>
                <td style={cell}>
                  <input className="atlas-input mono" type="number" inputMode="decimal" style={valueBox}
                    placeholder={String(ph.kg)} value={draft.kg ?? ""} onChange={(e) => setDraft(n, { kg: e.target.value })}
                    aria-label={`Set ${n + 1} weight in kg for ${exName}`} />
                </td>
                <td style={cell}>
                  <input className="atlas-input mono" type="number" inputMode="numeric" style={valueBox}
                    placeholder={String(ph.reps)} value={draft.reps ?? ""} onChange={(e) => setDraft(n, { reps: e.target.value })}
                    aria-label={`Set ${n + 1} reps for ${exName}`} />
                </td>
                <td style={cell}>
                  <button onClick={() => logRow(n)} disabled={!ready} aria-label={`Log set ${n + 1} of ${exName}`}
                    style={{ width: 36, height: 36, minHeight: 36, borderRadius: 9, border: "1px solid var(--line)", background: "var(--bg-elev2)", color: ready ? "var(--ink)" : "var(--line)", cursor: ready ? "pointer" : "default", display: "inline-flex", alignItems: "center", justifyContent: "center" }}>
                    <Check size={18} strokeWidth={3} />
                  </button>
                </td>
              </tr>
            );
          })}
        </tbody>
      </table>
      <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 6, minHeight: 40, padding: "8px 0", border: "none", background: "var(--bg-elev2)" }} onClick={() => setExtraRows((x) => x + 1)}>
        <Plus size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Add set
      </button>
    </div>
  );
}
