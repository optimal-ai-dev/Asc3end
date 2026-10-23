import { useMemo, useState } from "react";
import { BadgeIcon } from "../components/BadgeIcon";
import {
  UserCircle, Dumbbell, MessageCircle, Bell, Target, UtensilsCrossed, Sparkles, Loader2,
  ChevronRight, Check
} from "lucide-react";
import { computeStreak, computeGamification } from "../lib/workoutMath";
import { getNutritionTargets } from "../lib/nutritionMath";
import { describeSubscriptionState } from "../lib/subscription";
import { dayOfYear, todayStr } from "../lib/dateUtils";
import { muscleReadiness, GOAL_LABELS } from "../lib/workoutHelpers";
import { StreakRing } from "../components/StreakRing";
import { MuscleReadinessMap } from "../components/MuscleReadinessMap";
import { ProgramRoadmap } from "../components/ProgramRoadmap";

const QUOTES = [
  "One more rep than yesterday.",
  "Discipline shows up when motivation clocks out.",
  "The weight doesn't care how you feel about it.",
  "Small plates add up to big totals.",
  "Consistency is the only supplement that always works.",
  "You don't have to be great today. You have to show up.",
  "Progress is a habit before it's a number.",
  "Every set logged is a decision to keep going.",
  "The best program is the one you actually finish.",
  "Recovery is training too.",
];

export function Dashboard({ profile, workouts, nutrition, weightlog, customExercises, onNav, onLogWeight, onLogOut, isPremium, isDemoEntitlement, subscriptionState, onUpgrade, onManageBilling, billingError, billingLoading, session, onStartWorkout, onOpenProfile, onOpenChallenges, onViewExercises }) {
  const quote = QUOTES[dayOfYear(new Date()) % QUOTES.length];
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

  const activePlan = profile.activePlan;
  const planDay = activePlan?.days?.[activePlan.currentDayIndex] || null;
  const planExerciseCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.length, 0) : 0;
  const planSetCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.reduce((n2, e) => n2 + (+e.sets || 3), 0), 0) : 0;
  const planApproxMins = planDay ? Math.round((planSetCount * 2.5 + 10) / 5) * 5 : 0;
  const planMuscles = planDay ? [...new Set(planDay.muscleGroups.map((mg) => mg.muscle))] : [];

  const macroRow = (label, val, target, color) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span className="mono" style={{ color: "var(--ink-dim)" }}>{label}</span>
        <span className="mono">{Math.round(val)} / {Math.round(target)}</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (val / target) * 100)}%`, background: color }} /></div>
    </div>
  );

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="mono" style={{ color: "var(--ink-dim)", fontSize: 13 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="disp-title" style={{ fontSize: 26 }}>Welcome back, {profile.name || "Athlete"}</h1>
          <div style={{ color: "var(--ink-dim)", fontSize: 14, marginTop: 4, fontStyle: "italic" }}>"{quote}"</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onOpenProfile} className="atlas-btn-ghost" style={{ padding: "6px 9px", minWidth: 44, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }} aria-label="Profile and settings" title="Profile and settings">
            <UserCircle size={16} />
          </button>
          <button onClick={onLogOut} className="atlas-btn-ghost" style={{ padding: "6px 10px", fontSize: 10, minHeight: 44, display: "flex", alignItems: "center", justifyContent: "center" }}>
            Log Out
          </button>
        </div>
      </div>

      {/* Today's planned workout — the single most important thing on Home: what should I do right now. */}
      <div className="atlas-card" style={{ borderColor: "var(--brass)" }}>
        {session ? (
          <>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)", marginBottom: 4 }}>Workout In Progress</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 10 }}>
              {session.planDayName || "Free workout"} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} logged so far
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout()}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Resume Workout
            </button>
          </>
        ) : planDay ? (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: 1, marginBottom: 4 }}>TODAY'S WORKOUT</div>
            <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>{planDay.day}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {planMuscles.map((m) => (
                <span key={m} className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>{m}</span>
              ))}
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)" }}>{planExerciseCount} exercise{planExerciseCount === 1 ? "" : "s"}</span>
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)" }}>~{planApproxMins} min</span>
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout(activePlan.currentDayIndex)}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Start Workout
            </button>
          </>
        ) : (
          <>
            <h2 className="disp" style={{ fontSize: 15, marginBottom: 4 }}>No Active Plan</h2>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 10 }}>
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

      {activePlan && (
        <div className="atlas-card">
          <h2 className="disp" style={{ fontSize: 15, marginBottom: 8 }}>Program Roadmap</h2>
          <ProgramRoadmap days={activePlan.days} currentDayIndex={activePlan.currentDayIndex} />
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <div className="atlas-card" style={{ flex: 1, textAlign: "center" }}>
          <Target size={18} color="var(--brass)" />
          <div className="disp" style={{ fontSize: 20 }}>{GOAL_LABELS[profile.goal]}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>PROGRESSION TARGET</div>
        </div>
        <div className="atlas-card" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "center" }}>
          <StreakRing streak={streak} size={72} />
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{streak === 0 ? "START A STREAK" : `DAY ${streak} STREAK`}</div>
        </div>
      </div>

      <div className="atlas-card">
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 8 }}>Muscle Readiness</h2>
        <MuscleReadinessMap readiness={readiness} onViewFullBody={() => onNav("progress")} onViewExercises={onViewExercises} />
      </div>

      <div className="atlas-card">
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Today's Fuel</h2>
        {macroRow("CALORIES", totals.calories, targets.calories, "var(--brass)")}
        {macroRow("PROTEIN g", totals.protein, targets.protein, "var(--steel)")}
        {macroRow("CARBS g", totals.carbs, targets.carbs, "var(--good)")}
        {macroRow("FAT g", totals.fat, targets.fat, "var(--warn)")}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4, minHeight: 44 }} onClick={() => onNav("nutrition")}>
          <UtensilsCrossed size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Log Food
        </button>
      </div>

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
          {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>Billing management is unavailable for demo accounts.</div>}
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
