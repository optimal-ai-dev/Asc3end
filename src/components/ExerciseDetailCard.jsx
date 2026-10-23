import { useState } from "react";
import { Camera, Plus } from "lucide-react";
import { getExerciseGuidance, EQUIPMENT_COLORS } from "../exerciseData";
import { POSES_WITH_FINISH, SECONDARY_MUSCLES, ExerciseFigure } from "./ExerciseFigure";

// Two short, real mistakes per pattern — deliberately the *inverse* of the existing POSE_TIPS
// (the cues say what to do; this is what commonly goes wrong when someone doesn't), not
// duplicated content.
const COMMON_MISTAKES = {
  press_lying: ["Bouncing the bar off the chest instead of a controlled touch", "Flaring elbows out to 90°, putting unnecessary strain on the shoulder"],
  press_seated_machine: ["Shrugging the shoulders up toward the ears during the press", "Letting the weight stack slam down between reps"],
  push_up: ["Letting the hips sag or pike instead of a straight line", "Flaring elbows out to the sides instead of ~45°"],
  dip: ["Going so deep the shoulders round forward excessively", "Using momentum/bouncing at the bottom instead of a controlled stop"],
  pullup: ["Using body swing (kipping) when training for strict strength", "Not reaching a full dead hang between reps"],
  pulldown: ["Leaning back excessively to use body English instead of the lats", "Pulling behind the neck, which strains the shoulder unnecessarily"],
  row: ["Using momentum/torso swing instead of the back muscles", "Rounding the lower back under load"],
  hinge: ["Rounding the lower back instead of hinging at the hips", "Letting the bar drift away from the shins/body"],
  press_overhead: ["Arching the lower back excessively to press past a sticking point", "Pressing the bar forward instead of straight up"],
  lateral_raise: ["Using momentum to swing the weight up instead of a controlled raise", "Raising past shoulder height, which shifts load onto the traps"],
  rear_delt: ["Using momentum instead of a controlled squeeze", "Letting the torso rise back up mid-set instead of staying hinged"],
  squat: ["Knees caving inward under load", "Losing depth consistency between reps"],
  leg_press: ["Locking the knees out hard at the top", "Letting the knees cave inward"],
  leg_extension: ["Slamming into full lockout instead of a controlled top", "Using momentum instead of a smooth extension"],
  leg_curl: ["Lifting the hips off the pad to cheat the weight up", "Letting the weight drop instead of a controlled negative"],
  curl: ["Swinging the torso to heave the weight up", "Only using the top half of the range of motion"],
  triceps_ext: ["Letting the elbows flare out and drift forward", "Using the shoulders to help instead of isolating the triceps"],
  calf_raise: ["Bouncing out of the bottom instead of a full stretch", "Cutting the range of motion short at the top"],
  core_crunch: ["Pulling on the neck instead of using the abs", "Using the hip flexors (a hip hinge) instead of spinal flexion"],
  plank: ["Letting the hips sag toward the floor", "Holding the breath instead of breathing normally"],
};

// A safety note only where there's a genuine, exercise-specific injury-relevant consideration —
// not appended to every pattern as boilerplate.
const SAFETY_NOTES = {
  hinge: "Stop the set if you feel the lower back rounding under load — that's the point to reduce weight, not push through.",
  squat: "Keep a spotter or safety pins available when working near your limit on a barbell squat.",
  press_overhead: "Avoid pressing directly overhead if you have a pre-existing shoulder impingement — check with a professional first.",
  neck: "Move slowly and stop immediately if you feel sharp pain rather than normal muscular effort.",
  pullup: "Build up gradually if returning from any shoulder or elbow issue — this is a demanding movement for those joints.",
};

/* Redesigned exercise-detail presentation: a larger illustration (with a Start/Finish toggle
   where one exists), primary + secondary muscles, equipment, form cues, common mistakes, a
   safety note where one applies, and Add to Workout — stacked on mobile, two-column on wider
   screens via .exercise-detail-layout in GlobalStyle. */
export function ExerciseDetailCard({ ex, onAdd, onBack, onArchive }) {
  const [figureState, setFigureState] = useState("start");
  const hasFinish = POSES_WITH_FINISH.has(ex.pose);
  const secondary = SECONDARY_MUSCLES[ex.pose] || [];
  const guidance = getExerciseGuidance(ex);
  const mistakes = guidance.commonMistakes;
  const safety = guidance.safetyNote;
  const tips = guidance.formCues;
  const mediaApproved = ex.mediaStatus === "approved";

  return (
    <div className="atlas-card">
      <button onClick={onBack} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", marginBottom: 12 }}>
        ← Back to library
      </button>

      <div className="exercise-detail-layout">
        <div className="exercise-detail-figure" style={{ textAlign: "center" }}>
          <div style={{ background: "var(--bg-elev2)", borderRadius: 12, padding: 12, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 160 }}>
            {mediaApproved ? (
              <ExerciseFigure pose={ex.pose} muscle={ex.muscle} equipment={ex.equipment} size={160} state={figureState} showLegend />
            ) : (
              <div role="img" aria-label="Demonstration coming soon" style={{ color: "var(--ink-dim)", fontSize: 12.5, padding: "24px 12px", textAlign: "center", lineHeight: 1.6 }}>
                <Camera size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div>Demonstration coming soon</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>We'd rather show nothing than an inaccurate movement demo.</div>
              </div>
            )}
          </div>
          {mediaApproved && hasFinish && (
            <div role="group" aria-label="View start or finish position" style={{ display: "flex", marginTop: 10, background: "var(--bg-elev2)", borderRadius: 10, padding: 3 }}>
              {["start", "finish"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFigureState(s)}
                  aria-pressed={figureState === s}
                  className="disp"
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer",
                    fontSize: 11, letterSpacing: "0.03em", minHeight: 44,
                    background: figureState === s ? "var(--brass)" : "transparent",
                    color: figureState === s ? "#072016" : "var(--ink-dim)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="exercise-detail-info">
          <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>{ex.name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="pill" style={{ background: "var(--bg-elev2)", color: EQUIPMENT_COLORS[ex.equipment], border: `1px solid ${EQUIPMENT_COLORS[ex.equipment]}` }}>
              {ex.equipment}
            </span>
            <span className="pill" style={{ background: "var(--brass-soft)", color: "var(--brass)", textTransform: "capitalize" }}>
              Primary: {ex.muscle}
            </span>
            {secondary.map((m) => (
              <span key={m} className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>
                Secondary: {m}
              </span>
            ))}
          </div>

          {guidance.setup && (
            <div style={{ marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Setup</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{guidance.setup}</div>
            </div>
          )}
          {guidance.execution && (
            <div style={{ marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Execution</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{guidance.execution}</div>
              {guidance.breathingCue && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 6, fontStyle: "italic" }}>{guidance.breathingCue}</div>}
            </div>
          )}

          <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Key Form Cues</div>
          <ul style={{ margin: 0, marginBottom: 14, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>

          {mistakes.length > 0 && (
            <>
              <div className="disp" style={{ fontSize: 12, color: "var(--rest)", marginBottom: 6 }}>Common Mistakes</div>
              <ul style={{ margin: 0, marginBottom: 14, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--ink-dim)" }}>
                {mistakes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </>
          )}

          {safety && (
            <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--warn)", background: "rgba(255,165,61,0.08)", padding: 12 }}>
              <div className="disp" style={{ fontSize: 11, color: "var(--warn)", marginBottom: 4 }}>Safety Note</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{safety}</div>
            </div>
          )}

          <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onAdd(ex)}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to Workout
          </button>
          {onArchive && (
            <button
              className="atlas-btn-ghost" style={{ width: "100%", marginTop: 8, borderColor: "var(--line)", color: "var(--ink-dim)" }}
              onClick={onArchive}
            >
              Archive this custom exercise
            </button>
          )}
        </div>
      </div>
    </div>
  );
}
