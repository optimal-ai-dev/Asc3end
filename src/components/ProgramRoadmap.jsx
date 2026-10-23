import { useState } from "react";
import { Check } from "lucide-react";

/* Visual week-at-a-glance for an active training plan — a horizontal path of day nodes, used on
   both Home (read-only glance) and Coach (above the existing editable list). `days`/
   `currentDayIndex` are read directly from the same activePlan shape everywhere else in the app;
   this component adds no new data model of its own. Day state is purely positional relative to
   currentDayIndex (before it = already done this cycle, at it = next up, after = upcoming) — the
   plan is a repeating N-day rotation, not a calendar week, so "done" here means "done this lap
   around the split," which is exactly what currentDayIndex already tracks for Home's "Today's
   Workout" card. */
export function ProgramRoadmap({ days, currentDayIndex = 0 }) {
  const [openIdx, setOpenIdx] = useState(null);
  if (!days?.length) return null;
  const openDay = openIdx != null ? days[openIdx] : null;
  return (
    <div>
      <div style={{ display: "flex", overflowX: "auto", paddingBottom: 6, WebkitOverflowScrolling: "touch" }}>
        {days.map((d, i) => {
          const state = i < currentDayIndex ? "done" : i === currentDayIndex ? "current" : "upcoming";
          const muscleCount = new Set(d.muscleGroups.map((mg) => mg.muscle)).size;
          const shortLabel = d.day.replace(/^Day\s*\d+:?\s*/i, "") || d.day;
          return (
            <div key={i} style={{ display: "flex", alignItems: "flex-start", flexShrink: 0 }}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                aria-label={`${d.day}${state === "done" ? ", completed" : state === "current" ? ", up next" : ""}`}
                aria-expanded={openIdx === i}
                style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5, width: 72, minHeight: 44, background: "none", border: "none", cursor: "pointer", padding: "4px 2px" }}
              >
                <div style={{
                  width: 38, height: 38, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0,
                  background: state === "done" ? "var(--brass)" : state === "current" ? "var(--brass-soft)" : "var(--bg-elev2)",
                  border: state === "current" ? "2px solid var(--brass)" : openIdx === i ? "1px solid var(--ink-dim)" : "1px solid var(--line)",
                }}>
                  {state === "done" ? <Check size={15} color="#072016" strokeWidth={3} /> : <span className="disp" style={{ fontSize: 13, color: state === "current" ? "var(--brass)" : "var(--ink-dim)" }}>{i + 1}</span>}
                </div>
                <div className="mono" style={{ fontSize: 9, textAlign: "center", color: state === "current" ? "var(--brass)" : "var(--ink-dim)", lineHeight: 1.25, maxWidth: 70, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{shortLabel}</div>
                <div className="mono" style={{ fontSize: 8, color: "var(--ink-dim)" }}>{muscleCount === 0 ? "Rest" : `${muscleCount} area${muscleCount === 1 ? "" : "s"}`}</div>
              </button>
              {i < days.length - 1 && <div style={{ width: 18, height: 2, marginTop: 19, background: i < currentDayIndex ? "var(--brass)" : "var(--line)", flexShrink: 0 }} />}
            </div>
          );
        })}
      </div>
      {openDay && (
        <div style={{ marginTop: 8, padding: 12, background: "var(--bg-elev2)", borderRadius: 10 }}>
          <div className="disp" style={{ fontSize: 12, marginBottom: 8 }}>{openDay.day}</div>
          {openDay.muscleGroups.length === 0 ? (
            <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Rest day — no exercises planned.</div>
          ) : (
            openDay.muscleGroups.map((mg, i) => (
              <div key={i} style={{ marginBottom: i < openDay.muscleGroups.length - 1 ? 8 : 0 }}>
                <div className="mono" style={{ fontSize: 9.5, color: "var(--brass)", textTransform: "capitalize", marginBottom: 3 }}>{mg.muscle}</div>
                {mg.exercises.map((ex, j) => (
                  <div key={j} style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)", padding: "2px 0" }}>
                    <span>{ex.name}</span>
                    <span className="mono">{ex.sets}×{ex.reps}</span>
                  </div>
                ))}
              </div>
            ))
          )}
        </div>
      )}
    </div>
  );
}
