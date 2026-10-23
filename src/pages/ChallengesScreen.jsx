import { useMemo } from "react";
import { Check, X } from "lucide-react";
import {
  computeGamification, computeWeeklyMissions, computeChallengeProgress, CHALLENGE_TEMPLATES
} from "../lib/workoutMath";
import { getNutritionTargets } from "../lib/nutritionMath";

/* ------------------------------------------------------------------ */
/* Challenges — milestones + weekly missions + opt-in personal challenges */
/* ------------------------------------------------------------------ */
// Deliberately no leaderboards, rankings, or any comparison against other users anywhere in this
// screen — every number here is computed only from this one athlete's own data, per the explicit
// "no public/social features before launch" restriction.

function MissionRow({ mission }) {
  return (
    <div style={{ display: "flex", alignItems: "center", gap: 10, padding: "8px 0" }}>
      <div style={{
        width: 22, height: 22, borderRadius: "50%", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center",
        background: mission.completed ? "var(--brass)" : "var(--bg-elev2)", border: mission.completed ? "none" : "1px solid var(--line)",
      }}>
        {mission.completed && <Check size={13} color="#072016" strokeWidth={3} />}
      </div>
      <div style={{ flex: 1, minWidth: 0 }}>
        <div style={{ fontSize: 12.5, color: mission.completed ? "var(--ink)" : "var(--ink-dim)" }}>{mission.label}</div>
        {!mission.completed && mission.target > 1 && (
          <div className="bar-track" style={{ marginTop: 4, height: 5 }}><div className="bar-fill" style={{ width: `${(mission.current / mission.target) * 100}%`, background: "var(--brass)" }} /></div>
        )}
      </div>
      {mission.target > 1 && <span className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", flexShrink: 0 }}>{mission.current}/{mission.target}</span>}
    </div>
  );
}

function ChallengeCard({ progress, onRemove, onStart, active }) {
  const { template } = progress || {};
  if (active) {
    const pct = Math.min(100, (progress.current / progress.target) * 100);
    return (
      <div className="atlas-card" style={{ marginBottom: 10, borderColor: progress.completed ? "var(--brass)" : "var(--line)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 8, minWidth: 0 }}>
            <span style={{ fontSize: 18, flexShrink: 0 }}>{template.icon}</span>
            <div style={{ minWidth: 0 }}>
              <div className="disp" style={{ fontSize: 13 }}>{template.label}</div>
              <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-dim)" }}>
                {progress.completed ? "Completed" : progress.expired ? "Window closed" : `Day ${progress.daysElapsed} of ${progress.durationDays}`}
              </div>
            </div>
          </div>
          <button onClick={onRemove} className="atlas-btn-ghost" style={{ padding: "4px 10px", fontSize: 10, minHeight: 30, flexShrink: 0 }}>
            {progress.finished ? "Dismiss" : "Quit"}
          </button>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: "var(--brass)" }} /></div>
        <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 6 }}>{progress.current} / {progress.target} {template.unit}</div>
      </div>
    );
  }
  return (
    <div className="atlas-card" style={{ marginBottom: 10, display: "flex", justifyContent: "space-between", alignItems: "center", gap: 10 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 10, minWidth: 0 }}>
        <span style={{ fontSize: 18, flexShrink: 0 }}>{template.icon}</span>
        <div style={{ minWidth: 0 }}>
          <div className="disp" style={{ fontSize: 13 }}>{template.label}</div>
          <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>{template.description}</div>
        </div>
      </div>
      <button onClick={onStart} className="atlas-btn-ghost" style={{ padding: "6px 12px", fontSize: 11, flexShrink: 0 }}>Start</button>
    </div>
  );
}

export function ChallengesScreen({ workouts, nutrition, profile, streak, challenges, onStartChallenge, onRemoveChallenge, onClose }) {
  const gamification = useMemo(() => computeGamification(workouts, streak), [workouts, streak]);
  const missions = useMemo(() => computeWeeklyMissions(workouts, nutrition), [workouts, nutrition]);
  const nutritionTargets = useMemo(() => getNutritionTargets(profile), [profile]);
  const withProgress = useMemo(
    () => challenges.map((c) => ({ instance: c, progress: computeChallengeProgress(c, workouts, nutrition, nutritionTargets) })).filter((x) => x.progress),
    [challenges, workouts, nutrition, nutritionTargets]
  );
  const activeTemplateIds = new Set(withProgress.filter(({ progress }) => !progress.finished).map(({ instance }) => instance.templateId));
  const availableTemplates = CHALLENGE_TEMPLATES.filter((t) => !activeTemplateIds.has(t.id));

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, overflowY: "auto" }}>
      <div style={{ maxWidth: 640, margin: "0 auto", padding: "24px 18px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="disp" style={{ fontSize: 20 }}>Challenges</div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: 8, minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Close challenges">
            <X size={18} />
          </button>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 4 }}>This Week's Missions</h2>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 6 }}>Resets every Sunday.</div>
          <div style={{ display: "flex", flexDirection: "column" }}>
            {missions.map((m) => <MissionRow key={m.id} mission={m} />)}
          </div>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Milestones</h2>
          <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
            {gamification.badges.map((b) => (
              <div key={b.id} title={b.label} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 68 }}>
                <div style={{ fontSize: 22, filter: b.earned ? "none" : "grayscale(1)", opacity: b.earned ? 1 : 0.4 }}>{b.icon}</div>
                <div className="mono" style={{ fontSize: 8, textAlign: "center", color: b.earned ? "var(--ink)" : "var(--ink-dim)", lineHeight: 1.2 }}>{b.label}</div>
                {!b.earned && (
                  <div className="bar-track" style={{ width: "100%", height: 4 }}><div className="bar-fill" style={{ width: `${(b.current / b.target) * 100}%`, background: "var(--brass)" }} /></div>
                )}
              </div>
            ))}
          </div>
        </div>

        {withProgress.length > 0 && (
          <div style={{ marginBottom: 6 }}>
            <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Your Challenges</h2>
            {withProgress.map(({ instance, progress }) => (
              <ChallengeCard key={instance.id} progress={progress} active onRemove={() => onRemoveChallenge(instance.id)} />
            ))}
          </div>
        )}

        {availableTemplates.length > 0 && (
          <div>
            <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Start a Challenge</h2>
            {availableTemplates.map((t) => (
              <ChallengeCard key={t.id} progress={{ template: t }} onStart={() => onStartChallenge(t.id)} />
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
