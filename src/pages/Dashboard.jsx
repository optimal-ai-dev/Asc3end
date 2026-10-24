import { useMemo, useState } from "react";
import { BadgeIcon } from "../components/BadgeIcon";
import {
  UserCircle, Dumbbell, MessageCircle, Bell, Flame, Sparkles, Loader2,
  ChevronRight, Check
} from "lucide-react";
import { computeStreak, computeGamification } from "../lib/workoutMath";
import { getNutritionTargets } from "../lib/nutritionMath";
import { describeSubscriptionState } from "../lib/subscription";
import { todayStr } from "../lib/dateUtils";
import { muscleReadiness, readinessByGroup, READINESS_COLORS, READINESS_LABEL } from "../lib/workoutHelpers";
import { MuscleReadinessMap } from "../components/MuscleReadinessMap";

export function Dashboard({ profile, workouts, nutrition, weightlog, customExercises, onNav, onLogWeight, onLogOut, isPremium, isDemoEntitlement, subscriptionState, onUpgrade, onManageBilling, billingError, billingLoading, session, onStartWorkout, onOpenProfile, onOpenChallenges, onViewExercises }) {
  const readiness = useMemo(() => muscleReadiness(workouts, customExercises), [workouts, customExercises]);
  const targets = useMemo(() => getNutritionTargets(profile), [profile]);
  const todayFoods = nutrition.filter((n) => n.date === todayStr());
  const totals = todayFoods.reduce(
    (a, f) => ({
      calories: a.calories + f.calories, protein: a.protein + f.protein,
      carbs: a.carbs + f.carbs, fat: a.fat + f.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const streak = useMemo(() => computeStreak(workouts), [workouts]);
  const gamification = useMemo(() => computeGamification(workouts, streak), [workouts, streak]);
  const nudge = useMemo(() => {
    if (workouts.length === 0) return null;
    const lastDate = workouts.map((w) => new Date(w.date)).sort((a, b) => b - a)[0];
    const daysSince = Math.floor((Date.now() - lastDate) / 86400000);
    if (daysSince >= 3) return `You haven't logged a session in ${daysSince} days. Ready to get back to it?`;
    if (streak === 6) return "One more session and you'll hit a 7-day streak.";
    if (streak === 29) return "One more session and you'll hit a 30-day streak.";
    return null;
  }, [workouts, streak]);
  const [weightInput, setWeightInput] = useState("");
  const [showBodyMap, setShowBodyMap] = useState(false);
  const groupReadiness = useMemo(() => readinessByGroup(readiness), [readiness]);

  const activePlan = profile.activePlan;
  const planDay = activePlan?.days?.[activePlan.currentDayIndex] || null;
  const planExerciseCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.length, 0) : 0;
  const planSetCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.reduce((n2, e) => n2 + (+e.sets || 3), 0), 0) : 0;
  const planApproxMins = planDay ? Math.round((planSetCount * 2.5 + 10) / 5) * 5 : 0;
  const planMuscles = planDay ? [...new Set(planDay.muscleGroups.map((mg) => mg.muscle))] : [];

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 12 }}>
        <div>
          <div className="mono" style={{ color: "var(--ink-dim)", fontSize: 13 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="disp-title" style={{ fontSize: 28, marginTop: 2 }}>Hey, {profile.name || "Athlete"}</h1>
        </div>
        {/* Log out lives in Settings (as in every competitor) — a one-tap sign-out button at the top
            of Home was both prime real estate and an easy mis-tap. */}
        <button onClick={onOpenProfile} aria-label="Profile and settings" title="Profile and settings"
          style={{ width: 44, height: 44, borderRadius: "50%", border: "none", background: "var(--bg-elev2)", color: "var(--brass)", fontWeight: 800, fontSize: 16, cursor: "pointer", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}>
          {profile.name ? profile.name.trim()[0].toUpperCase() : <UserCircle size={20} />}
        </button>
      </div>

      {/* Today's planned workout — the single most important thing on Home: what should I do right now.
          The program roadmap folds into it as day chips; the full roadmap lives on Coach. */}
      <div className="atlas-card" style={{ border: "none", background: "linear-gradient(160deg, rgba(62,207,142,0.16), var(--bg-elev) 70%)" }}>
        {session ? (
          <>
            <div className="mono" style={{ fontSize: 11, color: "var(--brass)", letterSpacing: 0.5, marginBottom: 4 }}>IN PROGRESS</div>
            <div className="disp" style={{ fontSize: 20, marginBottom: 4 }}>{session.planDayName || "Free workout"}</div>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 12 }}>
              {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} so far
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout()}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Resume Workout
            </button>
          </>
        ) : planDay ? (
          <>
            <div className="mono" style={{ fontSize: 11, color: "var(--brass)", letterSpacing: 0.5, marginBottom: 4 }}>
              TODAY · DAY {activePlan.currentDayIndex + 1} OF {activePlan.days.length}
            </div>
            <div className="disp" style={{ fontSize: 22, marginBottom: 8 }}>{planDay.day}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
              {planMuscles.map((m) => (
                <span key={m} className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>{m}</span>
              ))}
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)" }}>{planExerciseCount} exercise{planExerciseCount === 1 ? "" : "s"} · ~{planApproxMins} min</span>
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout(activePlan.currentDayIndex)}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Start Workout
            </button>
            {activePlan.days.length > 1 && (
              <div style={{ display: "flex", gap: 6, marginTop: 12 }} aria-label="Program days">
                {activePlan.days.map((d, i) => (
                  <div key={i} className="mono" style={{
                    flex: 1, minWidth: 0, textAlign: "center", fontSize: 12, padding: "7px 4px", borderRadius: 10,
                    overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap",
                    background: i === activePlan.currentDayIndex ? "var(--brass-soft)" : "var(--bg-elev2)",
                    color: i === activePlan.currentDayIndex ? "var(--brass)" : "var(--ink-dim)",
                  }} aria-current={i === activePlan.currentDayIndex ? "step" : undefined}>{d.day}</div>
                ))}
              </div>
            )}
          </>
        ) : (
          <>
            <h2 className="disp" style={{ fontSize: 18, marginBottom: 4 }}>No Active Plan</h2>
            <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 12 }}>
              Ask the Coach to build you a weekly program, or just start logging a free workout.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn" style={{ flex: 1 }} onClick={() => onStartWorkout()}>
                <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Free Workout
              </button>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => onNav("coach")}>
                <MessageCircle size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Ask Coach
              </button>
            </div>
          </>
        )}
      </div>

      {nudge && (
        <div className="atlas-card" style={{ borderColor: "var(--warn)", background: "rgba(255,182,72,0.1)", display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12.5 }}>{nudge}</div>
        </div>
      )}

      {/* Three at-a-glance numbers, the MyFitnessPal "Today" idea: what's left, not what's logged. */}
      <div style={{ display: "flex", gap: 10 }}>
        {[
          { key: "streak", value: <><Flame size={16} color="var(--warn)" style={{ verticalAlign: -2, marginRight: 3 }} />{streak}</>, label: "day streak", onClick: null },
          { key: "kcal", value: Math.max(0, Math.round(targets.calories - totals.calories)).toLocaleString(), label: "kcal left", onClick: () => onNav("nutrition") },
          { key: "protein", value: `${Math.max(0, Math.round(targets.protein - totals.protein))}g`, label: "protein left", onClick: () => onNav("nutrition") },
        ].map((t) => {
          const Tag = t.onClick ? "button" : "div";
          return (
            <Tag key={t.key} onClick={t.onClick || undefined} className="atlas-card"
              style={{ flex: 1, padding: "12px 12px", textAlign: "left", cursor: t.onClick ? "pointer" : "default", border: "none" }}>
              <div className="mono" style={{ fontSize: 20, fontWeight: 800, color: "var(--ink)" }}>{t.value}</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", fontWeight: 600 }}>{t.label}</div>
            </Tag>
          );
        })}
      </div>

      <div className="atlas-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 10 }}>
          <h2 className="disp" style={{ fontSize: 16 }}>Recovery</h2>
          <button onClick={() => setShowBodyMap((v) => !v)} className="mono" aria-expanded={showBodyMap}
            style={{ background: "none", border: "none", color: "var(--ink-dim)", fontSize: 12, cursor: "pointer", minHeight: 32, display: "inline-flex", alignItems: "center", gap: 2 }}>
            {showBodyMap ? "Hide body map" : "Body map"} <ChevronRight size={14} style={{ transform: showBodyMap ? "rotate(90deg)" : "none" }} />
          </button>
        </div>
        <div style={{ display: "flex", flexWrap: "wrap", gap: 6 }}>
          {Object.entries(groupReadiness).map(([group, level]) => (
            <button key={group} onClick={() => onViewExercises(group)} className="pill"
              title={`${READINESS_LABEL[level]} — tap to see ${group} exercises`}
              style={{ cursor: "pointer", border: "none", background: "var(--bg-elev2)", color: "var(--ink)", textTransform: "capitalize", minHeight: 36, padding: "4px 12px", fontSize: 13 }}>
              <span aria-hidden="true" style={{ width: 8, height: 8, borderRadius: "50%", background: READINESS_COLORS[level], display: "inline-block" }} />
              {group}
              <span className="sr-only" style={{ position: "absolute", width: 1, height: 1, overflow: "hidden", clip: "rect(0 0 0 0)" }}>: {READINESS_LABEL[level]}</span>
            </button>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 10, display: "flex", gap: 12, flexWrap: "wrap" }}>
          {["ready", "partial", "fatigued"].map((l) => (
            <span key={l}><span style={{ color: READINESS_COLORS[l] }}>●</span> {READINESS_LABEL[l]}</span>
          ))}
        </div>
        {showBodyMap && (
          <div style={{ marginTop: 12 }}>
            <MuscleReadinessMap readiness={readiness} onViewFullBody={() => onNav("progress")} onViewExercises={onViewExercises} />
          </div>
        )}
      </div>

      <button className="atlas-card" onClick={() => onNav("nutrition")} style={{ textAlign: "left", cursor: "pointer", width: "100%", color: "var(--ink)" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 10 }}>
          <h2 className="disp" style={{ fontSize: 16 }}>Today's Food</h2>
          <span className="mono" style={{ fontSize: 13, color: "var(--ink-dim)" }}>{Math.round(totals.calories).toLocaleString()} / {Math.round(targets.calories).toLocaleString()} kcal</span>
        </div>
        <div style={{ display: "flex", gap: 12 }}>
          {[["Protein", totals.protein, targets.protein, "var(--steel)"], ["Carbs", totals.carbs, targets.carbs, "var(--good)"], ["Fat", totals.fat, targets.fat, "var(--warn)"]].map(([label, val, target, color]) => (
            <div key={label} style={{ flex: 1 }}>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", fontWeight: 600, marginBottom: 5 }}>{label}</div>
              <div className="bar-track" style={{ height: 6 }}><div className="bar-fill" style={{ width: `${Math.min(100, (val / target) * 100)}%`, background: color }} /></div>
            </div>
          ))}
        </div>
      </button>

      {isPremium ? (
        <div className="atlas-card" style={{ borderColor: subscriptionState?.status === "past_due" ? "var(--warn)" : "var(--brass)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} color={subscriptionState?.status === "past_due" ? "var(--warn)" : "var(--brass)"} />
              <span className="disp" style={{ fontSize: 13 }}>{describeSubscriptionState(subscriptionState)}</span>
            </div>
            {!isDemoEntitlement && (
              <button onClick={onManageBilling} disabled={billingLoading === "portal"} className="atlas-btn-ghost" style={{ padding: "5px 10px", fontSize: 10 }}>
                {billingLoading === "portal" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : "Manage"}
              </button>
            )}
          </div>
          {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>Billing management is unavailable for demo and owner accounts.</div>}
          {subscriptionState?.status === "past_due" && <div className="mono" style={{ fontSize: 11, color: "var(--warn)", marginTop: 8 }}>Your last payment failed — update your card in Manage Billing to avoid losing access.</div>}
          {!isDemoEntitlement && billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginTop: 8 }}>{billingError}</div>}
        </div>
      ) : (
        <div className="atlas-card" style={{ border: "1px solid var(--brass)", background: "var(--brass-soft)", padding: 0 }}>
          <button
            onClick={() => onUpgrade()}
            disabled={billingLoading === "checkout"}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left", width: "100%", background: "none", border: "none", padding: 16 }}
          >
            <div>
              <div className="disp" style={{ fontSize: 13, color: "var(--brass)" }}>Upgrade to Premium</div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>AI Coach, food scanner, and Meals Near You — $9.99/mo</div>
            </div>
            {billingLoading === "checkout" ? <Loader2 size={18} color="var(--brass)" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} /> : <ChevronRight size={18} color="var(--brass)" style={{ flexShrink: 0 }} />}
          </button>
          {billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", padding: "0 16px 12px" }}>{billingError}</div>}
        </div>
      )}

      <div className="atlas-card">
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 8 }}>Log Bodyweight</h2>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="atlas-input" type="number" placeholder={`${profile.weightKg} kg`} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} aria-label="Bodyweight in kilograms" />
          <button className="atlas-btn" onClick={() => { if (weightInput) { onLogWeight(+weightInput); setWeightInput(""); } }} aria-label="Save bodyweight">
            <Check size={16} />
          </button>
        </div>
      </div>

      {/* Achievements — deliberately last and de-emphasized until there's real activity to show,
          per feedback that a full badge grid crowds Home before a new account has done anything. */}
      <div className="atlas-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div style={{ display: "flex", alignItems: "baseline", gap: 8 }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)" }}>Level {gamification.level}</div>
            <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{gamification.xpIntoLevel} / 500 XP</span>
          </div>
          <button onClick={onOpenChallenges} className="atlas-btn-ghost" style={{ padding: "4px 10px", fontSize: 10, minHeight: 30 }}>Challenges</button>
        </div>
        <div className="bar-track" style={{ marginBottom: workouts.length > 0 ? 12 : 0 }}><div className="bar-fill" style={{ width: `${(gamification.xpIntoLevel / 500) * 100}%`, background: "var(--brass)" }} /></div>
        {workouts.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gamification.badges.map((b) => (
              <div key={b.id} title={b.label} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 4, width: 60,
              }}>
                <BadgeIcon id={b.id} earned={b.earned} size={40} />
                <div className="mono" style={{ fontSize: 10, textAlign: "center", color: b.earned ? "var(--ink)" : "var(--ink-dim)", lineHeight: 1.25 }}>{b.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 8 }}>Log your first workout to start earning achievements.</div>
        )}
      </div>
    </div>
  );
}
