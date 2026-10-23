import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
// Lazy-loaded: react-markdown (and its remark/micromark dependencies) only ships to people who
// actually open the Coach tab, instead of adding to the bundle everyone downloads on first load.
const ReactMarkdown = lazy(() => import("react-markdown"));
import {
  Dumbbell, UtensilsCrossed, LayoutDashboard, MessageCircle, TrendingUp, Plus, Trash2, Send,
  Sparkles, Flame, Target, ChevronRight, Check, X, Loader2, Trophy, Search, MapPin, Navigation,
  Camera, RefreshCw, Bell, UserCircle, Pencil, Copy, AlertTriangle, Star, ChevronDown, ChevronUp,
  Share2, Download
} from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import AuthScreen from "./AuthScreen";
import Landing from "./Landing";
import LegalPage from "./LegalPage";
import SupportPage from "./SupportPage";
import { supabase } from "./lib/supabase";
import { logEvent } from "./lib/analytics";
import { loadKey, saveKey } from "./lib/storage";
import { suggestNextTarget, evaluatePR, computeGamification, computeStreak, computeWorkoutXp, workoutXpBreakdown, CHALLENGE_TEMPLATES, computeChallengeProgress, computeWeeklyMissions } from "./lib/workoutMath";
import { getNutritionTargets, classifyDayAdherence } from "./lib/nutritionMath";
import { LEGAL_COPY, LEGAL_DOCUMENT_VERSION, SUPPORT_EMAIL } from "./lib/legal";
import { MIN_PASSWORD_LENGTH, isValidPassword } from "./lib/passwordPolicy";
import { computeSubscriptionState, isEntitled, describeSubscriptionState } from "./lib/subscription";
import { FEATURES, FREE_MONTHLY_LIMIT, remainingMonthlyUses } from "./lib/entitlements";
import { MONTHLY_PRICE, ANNUAL_PRICE, ANNUAL_SAVINGS_PCT, PRICING_FAQ } from "./lib/pricingContent";
import { isStaleSession, isValidSession } from "./lib/session";
import { isValidCustomExercise, isValidWorkout, isValidFoodEntry, isValidWeightEntry, isValidFavorite, isValidChatMessage, isValidChallenge, sanitizeList } from "./lib/validation";
import { parseAppPath, buildAppPath } from "./lib/routing";
import { FEEDBACK_TYPES, MAX_MESSAGE_LENGTH, submitFeedback } from "./lib/feedback";
import {
  MUSCLE_GROUPS, MUSCLE_REGIONS, UNMAPPED_READINESS_REGIONS, REGION_LABEL, EQUIPMENT_TYPES,
  EQUIPMENT_COLORS, MUSCLE_DEFAULT_POSE, TRACKING_TYPES, TRACKING_TYPE_LABEL,
  WEIGHT_REPS_TRACKING_TYPES, POSE_TIPS, regionForExercise, EXERCISES, matchesExerciseSearch
} from "./exerciseData";
import { KEYS } from "./lib/storageKeys";
import { dayOfYear, todayStr, yesterdayStr, fmtDate, uid } from "./lib/dateUtils";
import { extractJSON, extractClaudeText, callClaude } from "./lib/claudeClient";
import {
  PLAN_PROMPT_VOCABULARY, TRAINING_PRINCIPLES, COACHING_STYLES, COACH_SAFETY_RULES,
  COACH_OUTPUT_RULES
} from "./lib/coachPrompts";
import {
  SET_TYPES, SET_TYPE_LABELS, SET_TYPE_COLORS, GOAL_LABELS, formatSet, matchesSearch,
  lookupExercise, READINESS_COLORS, READINESS_LABEL, muscleReadiness, workoutVolume
} from "./lib/workoutHelpers";
import {
  QUICK_FOODS, mealMacroGuidance, scoreBestMeal, weeklyAdherence, ADHERENCE_COLOR, ADHERENCE_LABEL
} from "./lib/nutritionHelpers";
import { playPRSound, playRestDoneSound } from "./lib/sounds";
import { StreakRing } from "./components/StreakRing";
import { MuscleReadinessMap } from "./components/MuscleReadinessMap";
import { ExerciseThumb } from "./components/ExerciseFigure";
import { ExerciseDetailCard } from "./components/ExerciseDetailCard";
import { ProgramRoadmap } from "./components/ProgramRoadmap";
import { FeatureComparisonTable, Paywall } from "./components/Paywall";
// Re-exported so existing `import { ... } from "./App.jsx"` call sites keep working.
export {
  FrontBodyFigure, BackBodyFigure, MuscleReadinessLegend, MuscleReadinessTextList,
  MuscleRecoveryDetails, MuscleReadinessMap
} from "./components/MuscleReadinessMap";
export { POSES, POSES_FINISH, SECONDARY_MUSCLES } from "./components/ExerciseFigure";
// Re-exported so existing `import { ... } from "./App.jsx"` call sites keep working.
export {
  formatSet, matchesSearch, muscleRecovery, READINESS_COLORS, READINESS_LABEL, muscleReadiness,
  workoutVolume
} from "./lib/workoutHelpers";
export { COACH_SAFETY_RULES } from "./lib/coachPrompts";
export { weeklyAdherence, ADHERENCE_COLOR, ADHERENCE_LABEL } from "./lib/nutritionHelpers";

// Lazy-loaded: recharts (~525KB, the single largest dependency in the app) then only ships to
// people who actually open the Progress tab, instead of loading on every page for everyone.
const Progress = lazy(() => import("./Progress"));

// EXERCISES, POSE_TIPS, MUSCLE_GROUPS, EQUIPMENT_TYPES, MUSCLE_POSITIONS, EQUIPMENT_COLORS and
// MUSCLE_DEFAULT_POSE now live in ./exerciseData.js (imported above) — extracted so the ~450-entry
// catalogue can be read, validated and tested independently of this component file. Re-exported
// below so every existing `import { EXERCISES, ... } from "./App"` elsewhere in the codebase keeps
// working unchanged.
export { EXERCISES, MUSCLE_GROUPS, MUSCLE_REGIONS, regionForExercise, POSE_TIPS };

// Every readiness region (the 18 drawn on the body map plus the 3 filter/search-only ones),
// grouped by coarse muscle group — used to scope the Train picker's region filter to whichever
// coarse group is currently selected (e.g. picking "Arms" reveals Biceps/Triceps/Forearms as
// sub-filters) instead of showing all 21 regions in one flat, overwhelming row.
const ALL_READINESS_REGIONS = [...MUSCLE_REGIONS, ...UNMAPPED_READINESS_REGIONS];
const REGIONS_BY_GROUP = MUSCLE_GROUPS.reduce((acc, g) => {
  acc[g] = ALL_READINESS_REGIONS.filter((r) => r.group === g).map((r) => r.id);
  return acc;
}, {});

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

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);
  const [form, setForm] = useState({
    name: "", age: 25, gender: "male", heightCm: 175, weightKg: 75,
    goal: "muscle_growth", experience: "intermediate", trainingDays: 4,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Strips stray leading zeros (e.g. "018") that can otherwise persist in a controlled
  // number input when a field is cleared and retyped — "18" should never render as "018".
  const setNumber = (k, raw) => set(k, raw === "" ? 0 : +raw.replace(/^0+(?=\d)/, ""));

  const steps = [
    {
      title: "Who's training?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>NAME</label>
          <input className="atlas-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoFocus />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>AGE</label>
              <input type="number" className="atlas-input" value={form.age} onChange={(e) => setNumber("age", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>GENDER</label>
              <select className="atlas-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>HEIGHT (CM)</label>
              <input type="number" className="atlas-input" value={form.heightCm} onChange={(e) => setNumber("heightCm", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>WEIGHT (KG)</label>
              <input type="number" className="atlas-input" value={form.weightKg} onChange={(e) => setNumber("weightKg", e.target.value)} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "What's the goal?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(GOAL_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => set("goal", k)}
              className="atlas-card"
              style={{
                textAlign: "left", cursor: "pointer",
                borderColor: form.goal === k ? "var(--brass)" : "var(--line)",
                background: form.goal === k ? "var(--brass-soft)" : "var(--bg-elev)",
                color: form.goal === k ? "var(--brass)" : "var(--ink)",
              }}
            >
              <span className="disp" style={{ fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Training profile",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>EXPERIENCE</label>
            <select className="atlas-input" value={form.experience} onChange={(e) => set("experience", e.target.value)}>
              <option value="beginner">Beginner (0-1yr)</option>
              <option value="intermediate">Intermediate (1-5yr)</option>
              <option value="advanced">Advanced (5yr+)</option>
            </select>
          </div>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>TRAINING DAYS / WEEK: {form.trainingDays}</label>
            <input type="range" min="2" max="6" value={form.trainingDays} onChange={(e) => set("trainingDays", +e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>
      ),
    },
    {
      title: "Before we start",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 4 }}>
            Asc3end gives general fitness and nutrition information, not medical advice — quick summary below, full documents linked from Profile once you're in.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["terms", "privacy", "disclaimer"].map((k) => (
              <button key={k} onClick={() => setLegalOpen(legalOpen === k ? null : k)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)" }}>{LEGAL_COPY[k].title}</button>
            ))}
          </div>
          {legalOpen && <LegalPage docKey={legalOpen} onClose={() => setLegalOpen(null)} />}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
            <input type="checkbox" checked={agreedToLegal} onChange={(e) => setAgreedToLegal(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>I agree to the Terms of Use and Privacy Policy, and understand Asc3end is not medical advice.</span>
          </label>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const nameMissing = step === 0 && !form.name.trim();
  const legalNotAgreed = isLast && !agreedToLegal;

  return (
    <div className="atlas-root" style={{ padding: "40px 20px", paddingBottom: 40 }}>
      <div style={{ marginBottom: 28 }}>
        <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>ASC3END</div>
        <div className="disp" style={{ fontSize: 30, marginTop: 4 }}>{steps[step].title}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? "var(--brass)" : "var(--line)" }} />
          ))}
        </div>
      </div>
      {steps[step].body}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        {step > 0 && (
          <button className="atlas-btn-ghost" onClick={() => setStep(step - 1)}>Back</button>
        )}
        <button
          className="atlas-btn"
          style={{ flex: 1 }}
          disabled={nameMissing || legalNotAgreed}
          onClick={() => {
            if (isLast) onComplete({ ...form, legalAcceptedVersion: LEGAL_DOCUMENT_VERSION, legalAcceptedAt: new Date().toISOString() });
            else setStep(step + 1);
          }}
        >
          {isLast ? "Build My Plan" : "Continue"}
        </button>
      </div>
      {nameMissing && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Enter your name to continue.</div>}
      {legalNotAgreed && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Accept the Terms and Privacy Policy to continue.</div>}
    </div>
  );
}

function Dashboard({ profile, workouts, nutrition, weightlog, customExercises, onNav, onLogWeight, onLogOut, isPremium, isDemoEntitlement, subscriptionState, onUpgrade, onManageBilling, billingError, billingLoading, session, onStartWorkout, onOpenProfile, onOpenChallenges, onViewExercises }) {
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
          <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <h1 className="disp" style={{ fontSize: 26 }}>Welcome back, {profile.name || "Athlete"}</h1>
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
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--steel)" }}>{planExerciseCount} exercise{planExerciseCount === 1 ? "" : "s"}</span>
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--steel)" }}>~{planApproxMins} min</span>
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
          <Target size={18} color="var(--steel)" />
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
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 56,
                opacity: b.earned ? 1 : 0.3,
              }}>
                <div style={{ fontSize: 20, filter: b.earned ? "none" : "grayscale(1)" }}>{b.icon}</div>
                <div className="mono" style={{ fontSize: 8, textAlign: "center", color: b.earned ? "var(--ink)" : "var(--ink-dim)", lineHeight: 1.2 }}>{b.label}</div>
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

/* ------------------------------------------------------------------ */
/* Profile / Settings                                                   */
/* ------------------------------------------------------------------ */

function Profile({ profile, authUser, workouts, nutrition, weightlog, customExercises, isPremium, isDemoEntitlement, subscriptionState, onUpdateProfile, onManageBilling, onUpgrade, billingLoading, billingError, onLogOut, onDeleteAccount, deleteAccountLoading, deleteAccountError, onClose, usage, onOpenSupport }) {
  const [edit, setEdit] = useState({
    name: profile.name || "", age: profile.age, gender: profile.gender,
    heightCm: profile.heightCm, weightKg: profile.weightKg,
    goal: profile.goal, experience: profile.experience, trainingDays: profile.trainingDays,
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const setNumber = (k, raw) => setEdit((f) => ({ ...f, [k]: raw === "" ? 0 : +raw.replace(/^0+(?=\d)/, "") }));

  const [overrideOn, setOverrideOn] = useState(!!profile.macroOverride);
  const currentTargets = getNutritionTargets(profile);
  const [overrideForm, setOverrideForm] = useState(profile.macroOverride || currentTargets);
  const [targetsStatus, setTargetsStatus] = useState(null); // null | "saving" | { error }

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwStatus, setPwStatus] = useState(null); // null | "saving" | "success" | { error }

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState(null);
  const [reauthing, setReauthing] = useState(false);

  const [legalOpen, setLegalOpen] = useState(null);

  const [feedbackType, setFeedbackType] = useState("bug");
  const [feedbackMessage, setFeedbackMessage] = useState("");
  const [feedbackRating, setFeedbackRating] = useState(0);
  const [feedbackStatus, setFeedbackStatus] = useState(null); // null | "sending" | "sent" | { error }

  const sendFeedback = async () => {
    setFeedbackStatus("sending");
    const result = await submitFeedback({ type: feedbackType, message: feedbackMessage, rating: feedbackType === "rating" ? feedbackRating : undefined, page: "profile" });
    if (result.ok) {
      logEvent("feedback_submitted", { type: feedbackType });
      setFeedbackStatus("sent");
      setFeedbackMessage("");
      setFeedbackRating(0);
    } else {
      setFeedbackStatus({ error: result.error });
    }
  };

  const saveIdentity = async () => {
    const name = edit.name.trim();
    if (!name) return;
    // No `targets` snapshot to recompute here anymore — getNutritionTargets() derives fresh from
    // these same profile fields everywhere it's called, so there's nothing to keep in sync.
    const next = { ...profile, ...edit, name };
    await onUpdateProfile(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
  };

  // Routes through /api/save-nutrition-targets — the one server-authorized write path for a
  // manual override — instead of writing straight to storage, so an out-of-range or malformed
  // value (a modified client, a typo that slipped past the number input) is rejected server-side
  // and never reaches local state or storage at all, rather than being "cleaned" into a 0.
  const saveOverride = async () => {
    setTargetsStatus("saving");
    const macroOverride = overrideOn
      ? { calories: +overrideForm.calories || 0, protein: +overrideForm.protein || 0, carbs: +overrideForm.carbs || 0, fat: +overrideForm.fat || 0 }
      : null;
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/save-nutrition-targets", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession?.access_token}` },
        body: JSON.stringify({ macroOverride }),
      });
      const data = await res.json();
      if (!res.ok) {
        setTargetsStatus({ error: data.error || "Couldn't save your targets — try again." });
        return;
      }
      await onUpdateProfile({ macroOverride });
      setTargetsStatus(null);
      setSavedFlash(true);
      setTimeout(() => setSavedFlash(false), 2200);
    } catch (e) {
      setTargetsStatus({ error: "Couldn't reach the server — check your connection and try again." });
    }
  };

  const changePassword = async () => {
    if (!isValidPassword(pw.next)) { setPwStatus({ error: `Password must be at least ${MIN_PASSWORD_LENGTH} characters.` }); return; }
    if (pw.next !== pw.confirm) { setPwStatus({ error: "Passwords don't match." }); return; }
    setPwStatus("saving");
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) setPwStatus({ error: error.message || "Couldn't update password." });
    else { setPwStatus("success"); setPw({ next: "", confirm: "" }); }
  };

  // Requires re-entering the current password immediately before an irreversible account
  // deletion ("recent authentication"), rather than trusting however-old the existing session
  // happens to be — the type-DELETE text alone only guards against a misclick, not against
  // someone else acting on an already-open, unattended session.
  const confirmDelete = async () => {
    setReauthError(null);
    setReauthing(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authUser?.email, password: reauthPassword });
    setReauthing(false);
    if (error) { setReauthError("Incorrect password."); return; }
    onDeleteAccount();
  };

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), profile, workouts, nutrition, weightlog, customExercises };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asc3end-export-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const row = (label, control) => (
    <div style={{ marginBottom: 12 }}>
      <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", marginBottom: 4 }}>{label}</label>
      {control}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 40, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 className="disp" style={{ fontSize: 24 }}>Profile & Settings</h1>
        <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close settings"><X size={16} /></button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 12 }}>About You</h2>
        {row("NAME", <input className="atlas-input" value={edit.name} onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))} />)}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>{row("AGE", <input type="number" className="atlas-input" value={edit.age} onChange={(e) => setNumber("age", e.target.value)} />)}</div>
          <div style={{ flex: 1 }}>
            {row("GENDER", (
              <select className="atlas-input" value={edit.gender} onChange={(e) => setEdit((f) => ({ ...f, gender: e.target.value }))}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_say">Prefer not to say</option>
              </select>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>{row("HEIGHT (CM)", <input type="number" className="atlas-input" value={edit.heightCm} onChange={(e) => setNumber("heightCm", e.target.value)} />)}</div>
          <div style={{ flex: 1 }}>{row("WEIGHT (KG)", <input type="number" className="atlas-input" value={edit.weightKg} onChange={(e) => setNumber("weightKg", e.target.value)} />)}</div>
        </div>

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "10px 0 10px" }}>Training Preferences</div>
        {row("GOAL", (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.entries(GOAL_LABELS).map(([k, label]) => (
              <button key={k} onClick={() => setEdit((f) => ({ ...f, goal: k }))} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: edit.goal === k ? "var(--brass-soft)" : "transparent", color: edit.goal === k ? "var(--brass)" : "var(--ink-dim)" }}>{label}</button>
            ))}
          </div>
        ))}
        {row("EXPERIENCE", (
          <select className="atlas-input" value={edit.experience} onChange={(e) => setEdit((f) => ({ ...f, experience: e.target.value }))}>
            <option value="beginner">Beginner (0-1yr)</option>
            <option value="intermediate">Intermediate (1-5yr)</option>
            <option value="advanced">Advanced (5yr+)</option>
          </select>
        ))}
        {row(`TRAINING DAYS / WEEK: ${edit.trainingDays}`, (
          <input type="range" min="2" max="6" value={edit.trainingDays} onChange={(e) => setEdit((f) => ({ ...f, trainingDays: +e.target.value }))} style={{ width: "100%" }} />
        ))}
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 10 }}>
          Coaching style is set from the Coach tab — it's tied to how the AI talks about your plan, not your saved profile.
        </div>
        <button className="atlas-btn" style={{ width: "100%" }} onClick={saveIdentity} disabled={!edit.name.trim()}>Save Changes</button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <h2 className="disp" style={{ fontSize: 15 }}>Nutrition Targets</h2>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} className="mono">
            <input type="checkbox" checked={overrideOn} onChange={(e) => { setOverrideOn(e.target.checked); if (e.target.checked) setOverrideForm(profile.macroOverride || currentTargets); }} />
            <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>Set manually</span>
          </label>
        </div>
        {!overrideOn ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
            Calculated from your stats: {currentTargets.calories} kcal · {currentTargets.protein}g protein · {currentTargets.carbs}g carbs · {currentTargets.fat}g fat
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {["calories", "protein", "carbs", "fat"].map((k) => (
              <div key={k} style={{ flex: "1 1 45%" }}>
                {row(k.toUpperCase(), <input type="number" className="atlas-input" value={overrideForm[k]} onChange={(e) => setOverrideForm((f) => ({ ...f, [k]: e.target.value === "" ? "" : +e.target.value }))} />)}
              </div>
            ))}
          </div>
        )}
        {targetsStatus?.error && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{targetsStatus.error}</div>}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={saveOverride} disabled={targetsStatus === "saving"}>
          {targetsStatus === "saving" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
          Save Targets
        </button>
      </div>

      {savedFlash && <div className="mono" style={{ fontSize: 12, color: "var(--brass)", textAlign: "center", marginBottom: 16 }}>Saved.</div>}

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Account</h2>
        {row("EMAIL", <div className="mono" style={{ fontSize: 13 }}>{authUser?.email || "—"}</div>)}

        {row("SUBSCRIPTION", isPremium ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 12, color: subscriptionState?.status === "past_due" ? "var(--warn)" : "var(--brass)" }}><Sparkles size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{describeSubscriptionState(subscriptionState)}</span>
              {!isDemoEntitlement && (
                <button onClick={onManageBilling} disabled={billingLoading === "portal"} className="atlas-btn-ghost" style={{ padding: "5px 10px", fontSize: 10 }}>
                  {billingLoading === "portal" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : "Manage Billing"}
                </button>
              )}
            </div>
            {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 6 }}>Billing management is unavailable for demo accounts.</div>}
            {subscriptionState?.status === "past_due" && <div className="mono" style={{ fontSize: 11, color: "var(--warn)", marginTop: 6 }}>Your last payment failed — update your card via Manage Billing to avoid losing access.</div>}
          </div>
        ) : (
          <>
            <button onClick={() => onUpgrade()} disabled={billingLoading === "checkout"} className="atlas-btn" style={{ width: "100%" }}>
              {billingLoading === "checkout" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              Upgrade to Premium — $9.99/mo
            </button>
            <button onClick={() => setShowComparison((v) => !v)} className="mono" style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "8px 0 0" }}>
              {showComparison ? "Hide" : "See"} Free vs Premium {showComparison ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />}
            </button>
            {showComparison && <FeatureComparisonTable />}
          </>
        ))}
        {billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 4 }}>{billingError}</div>}

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "14px 0 8px" }}>Change Password</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="atlas-input" type="password" placeholder="New password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={pw.next} onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))} />
          <input className="atlas-input" type="password" placeholder="Confirm new password" autoComplete="new-password" minLength={MIN_PASSWORD_LENGTH} value={pw.confirm} onChange={(e) => setPw((f) => ({ ...f, confirm: e.target.value }))} />
          {pwStatus?.error && <div className="mono" style={{ fontSize: 11, color: "var(--rest)" }}>{pwStatus.error}</div>}
          {pwStatus === "success" && <div className="mono" style={{ fontSize: 11, color: "var(--brass)" }}>Password updated.</div>}
          <button className="atlas-btn-ghost" onClick={changePassword} disabled={pwStatus === "saving" || !pw.next}>
            {pwStatus === "saving" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
            Update Password
          </button>
        </div>

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "14px 0 8px" }}>Your Data</div>
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={exportData}>
          <Copy size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> Export My Data (JSON)
        </button>
        <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={onLogOut}>Log Out</button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Your AI Usage</h2>
        {isPremium ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--brass)" }}>Unlimited — Asc3end+ (fair-use limits apply)</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["AI Coach", FEATURES.COACH], ["Meals Near You", FEATURES.MEALS]].map(([label, key]) => {
              const remaining = remainingMonthlyUses(key, usage || {});
              return (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{label}</span>
                    <span className="mono" style={{ color: remaining === 0 ? "var(--rest)" : "var(--ink-dim)" }}>{FREE_MONTHLY_LIMIT - remaining}/{FREE_MONTHLY_LIMIT} used this month</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elev2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((FREE_MONTHLY_LIMIT - remaining) / FREE_MONTHLY_LIMIT) * 100}%`, background: remaining === 0 ? "var(--rest)" : "var(--brass)" }} />
                  </div>
                </div>
              );
            })}
            <div style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>Resets on the 1st of each month. Food scanner requires Asc3end+.</div>
          </div>
        )}
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Send Feedback</h2>
        {feedbackStatus === "sent" ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--brass)" }}>Thanks — your feedback was sent.</div>
        ) : (
          <>
            <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
              {FEEDBACK_TYPES.map((t) => (
                <button
                  key={t}
                  onClick={() => { setFeedbackType(t); setFeedbackStatus(null); }}
                  className={feedbackType === t ? "atlas-btn" : "atlas-btn-ghost"}
                  style={{ flex: 1, padding: "7px 0", fontSize: 11, textTransform: "capitalize" }}
                >
                  {t === "bug" ? "Bug Report" : t === "feature" ? "Feature Idea" : "Rating"}
                </button>
              ))}
            </div>

            {feedbackType === "rating" && (
              <div style={{ display: "flex", gap: 4, marginBottom: 10, justifyContent: "center" }}>
                {[1, 2, 3, 4, 5].map((n) => (
                  <button key={n} onClick={() => setFeedbackRating(n)} style={{ background: "none", border: "none", cursor: "pointer", padding: 2 }} aria-label={`${n} star${n > 1 ? "s" : ""}`}>
                    <Star size={22} color={n <= feedbackRating ? "var(--brass)" : "var(--ink-dim)"} fill={n <= feedbackRating ? "var(--brass)" : "none"} />
                  </button>
                ))}
              </div>
            )}

            <textarea
              className="atlas-input"
              rows={3}
              placeholder={feedbackType === "bug" ? "What happened, and what did you expect instead?" : feedbackType === "feature" ? "What would help you?" : "Anything you want to add? (optional)"}
              value={feedbackMessage}
              onChange={(e) => setFeedbackMessage(e.target.value.slice(0, MAX_MESSAGE_LENGTH))}
              style={{ width: "100%", resize: "vertical", marginBottom: 8 }}
            />
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", textAlign: "right", marginBottom: 8 }}>{feedbackMessage.length}/{MAX_MESSAGE_LENGTH}</div>

            {feedbackStatus?.error && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{feedbackStatus.error}</div>}

            <button
              className="atlas-btn"
              style={{ width: "100%" }}
              disabled={feedbackStatus === "sending" || (feedbackType === "rating" && feedbackRating === 0 && !feedbackMessage.trim())}
              onClick={sendFeedback}
            >
              {feedbackStatus === "sending" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              Send
            </button>
          </>
        )}
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <button onClick={onOpenSupport} className="atlas-btn-ghost" style={{ width: "100%" }}>Help & Support</button>
        {SUPPORT_EMAIL && (
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", textAlign: "center", marginTop: 8 }}>
            Or email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--brass)" }}>{SUPPORT_EMAIL}</a> directly
          </div>
        )}
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>Legal</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(LEGAL_COPY).map(([k, v]) => (
            <button key={k} onClick={() => setLegalOpen(k)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)" }}>{v.title}</button>
          ))}
        </div>
        {legalOpen && <LegalPage docKey={legalOpen} onClose={() => setLegalOpen(null)} />}
      </div>

      <div className="atlas-card" style={{ borderColor: "var(--rest)" }}>
        <div className="disp" style={{ fontSize: 13, color: "var(--rest)", marginBottom: 8 }}>Danger Zone</div>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rest)", fontSize: 12, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center" }}>
            Delete Account
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 10 }}>
              This permanently deletes your account and all workouts, nutrition logs, and weight history. This can't be undone. Type DELETE and enter your password to confirm.
            </div>
            <input className="atlas-input" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" style={{ marginBottom: 10 }} />
            <input className="atlas-input" type="password" autoComplete="current-password" value={reauthPassword} onChange={(e) => { setReauthPassword(e.target.value); setReauthError(null); }} placeholder="Current password" style={{ marginBottom: 10 }} aria-label="Current password, to confirm it's really you" />
            {reauthError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{reauthError}</div>}
            {deleteAccountError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{deleteAccountError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setShowDelete(false); setDeleteConfirmText(""); setReauthPassword(""); setReauthError(null); }} disabled={deleteAccountLoading || reauthing}>Cancel</button>
              <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} disabled={deleteConfirmText !== "DELETE" || !reauthPassword || deleteAccountLoading || reauthing} onClick={confirmDelete}>
                {deleteAccountLoading || reauthing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Permanently Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

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
            {durationMin != null && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>⏱ {durationMin} min</div>}
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
                  {pr.exName} — {pr.weight}kg × {pr.reps} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
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
                      <input type="number" className="atlas-input" style={{ width: 64, padding: "5px 7px" }} value={st.weight} aria-label={`${ex.name} set ${stIdx + 1} weight in kg`} onChange={(e) => updateSet(exIdx, stIdx, "weight", e.target.value)} />
                      <span>kg ×</span>
                      <input type="number" className="atlas-input" style={{ width: 54, padding: "5px 7px" }} value={st.reps} aria-label={`${ex.name} set ${stIdx + 1} reps`} onChange={(e) => updateSet(exIdx, stIdx, "reps", e.target.value)} />
                    </>
                  ) : (
                    <span>{st.weight}kg × {st.reps}{st.type && st.type !== "normal" ? ` (${st.type})` : ""}</span>
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

function Train({ profile, workouts, session, setSession, onFinish, onDiscard, onStartWorkout, finishingWorkout, finishError, customExercises, onAddCustomExercise, onArchiveCustomExercise, onEditWorkout, onDeleteWorkout, initialMuscleFilter }) {
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
        <h1 className="disp" style={{ fontSize: 26, marginBottom: 4 }}>Train</h1>
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
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", width: "100%", textAlign: "left", cursor: "pointer", border: "1px solid var(--line)", background: "var(--bg-elev)", color: "var(--ink)" }}
                >
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(w.date)}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{w.exercises.length} exercise{w.exercises.length === 1 ? "" : "s"}</div>
                  </div>
                  <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
                    <div className="mono" style={{ fontSize: 13, color: "var(--brass)" }}>{Math.round(volume)}kg vol</div>
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

  const addSet = (exName) => {
    const trackingType = (allExercises.find((e) => e.name === exName)?.trackingType) || "weight_reps";
    const w = +weightIn[exName]; const r = +repsIn[exName];
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
    const setType = typeIn[exName] || "normal";
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
              {prToast.exName} — {prToast.weight}kg × {prToast.reps} {prToast.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <h1 className="disp" style={{ fontSize: 24 }}>{session.planDayName || "Today's Session"}</h1>
          <div className="mono" style={{ fontSize: 13, color: "var(--steel)" }}>⏱ {fmtClock((now - session.startedAt) / 1000)} elapsed</div>
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
        <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--steel)", background: "rgba(47,217,184,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--steel)" }}>Resting</div>
            <div className="mono" style={{ fontSize: 20 }}>{fmtClock((session.restEndAt - now) / 1000)}</div>
          </div>
          <div className="bar-track" style={{ marginBottom: 10 }}>
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, ((session.restEndAt - now) / (restDuration * 1000)) * 100))}%`, background: "var(--steel)" }} />
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
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {meta && (
                    <button onClick={() => setOpenCues((v) => ({ ...v, [ex.name]: !v[ex.name] }))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", color: "var(--steel)", fontSize: 11 }} className="mono">
                      {openCues[ex.name] ? "Hide form cues" : "Show form cues"}
                    </button>
                  )}
                  <button onClick={() => setLinkingEx(linkingEx === ex.name ? null : ex.name)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", color: "var(--warn)", fontSize: 11 }} className="mono">
                    {ex.supersetWith ? `⚡ Linked with ${ex.supersetWith}` : "⚡ Link as superset"}
                  </button>
                </div>
              </div>
            </div>
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
                {ex.targetSets && ex.targetReps && (
                  <span style={{ color: "var(--warn)" }}> · Plan target: {ex.targetSets} × {ex.targetReps}{ex.sets.length > 0 ? ` (${ex.sets.length}/${ex.targetSets} done)` : ""}</span>
                )}
              </div>
            </div>

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
              const setNum = (setter) => (e) => setter((v) => ({ ...v, [ex.name]: e.target.value }));
              if (tt === "bodyweight_reps") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="reps" type="number" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <input className="atlas-input" placeholder="+kg (optional)" type="number" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Added weight in kg for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "assisted_bodyweight") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="reps" type="number" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <input className="atlas-input" placeholder="assist kg" type="number" value={assistIn[ex.name] || ""} onChange={setNum(setAssistIn)} aria-label={`Assistance weight in kg for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "reps_only") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="reps" type="number" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "duration" || tt === "isometric_hold") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="seconds" type="number" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "distance_duration") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="meters" type="number" value={distanceIn[ex.name] || ""} onChange={setNum(setDistanceIn)} aria-label={`Distance in meters for ${ex.name}`} />
                  <input className="atlas-input" placeholder="seconds" type="number" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              if (tt === "weight_distance" || tt === "weighted_duration") return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="kg" type="number" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Weight in kg for ${ex.name}`} />
                  {tt === "weight_distance" && <input className="atlas-input" placeholder="meters" type="number" value={distanceIn[ex.name] || ""} onChange={setNum(setDistanceIn)} aria-label={`Distance in meters for ${ex.name}`} />}
                  <input className="atlas-input" placeholder="seconds" type="number" value={durationIn[ex.name] || ""} onChange={setNum(setDurationIn)} aria-label={`Duration in seconds for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
              return (
                <div style={{ display: "flex", gap: 6 }}>
                  <input className="atlas-input" placeholder="kg" type="number" value={weightIn[ex.name] || ""} onChange={setNum(setWeightIn)} aria-label={`Weight in kg for ${ex.name}`} />
                  <input className="atlas-input" placeholder="reps" type="number" value={repsIn[ex.name] || ""} onChange={setNum(setRepsIn)} aria-label={`Reps for ${ex.name}`} />
                  <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
                </div>
              );
            })()}
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
            style={{ width: "100%", marginBottom: 10, borderColor: "var(--steel)", color: "var(--steel)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
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
                    {ex.isCustom && <span className="pill" style={{ marginLeft: 6, fontSize: 8, border: "1px solid var(--steel)", color: "var(--steel)" }}>Custom</span>}
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
            ⏱ {fmtClock((now - session.startedAt) / 1000)} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"} · {Math.round(totalVolume)}kg volume
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
                    {pr.exName} — {pr.weight}kg × {pr.reps} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
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
                        {s.weight}kg × {s.reps}{s.type && s.type !== "normal" ? ` (${SET_TYPE_LABELS[s.type]})` : ""}
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

/* ------------------------------------------------------------------ */
/* Coach                                                                */
/* ------------------------------------------------------------------ */

/* Lightweight tap-for-tips popup used inside the Coach — shows the same pose demo + form cues as the Train library */
function CoachExercisePopup({ ex, onClose }) {
  if (!ex) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.9)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="atlas-card" style={{ maxWidth: 340, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <ExerciseThumb ex={ex} size={56} />
            <div>
              <div className="disp" style={{ fontSize: 16 }}>{ex.name}</div>
              <span className="pill" style={{ background: "rgba(255,255,255,0.06)", color: EQUIPMENT_COLORS[ex.equipment], border: `1px solid ${EQUIPMENT_COLORS[ex.equipment]}` }}>{ex.equipment}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="Close"><X size={18} color="var(--ink-dim)" /></button>
        </div>
        <div className="disp" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 14, marginBottom: 6 }}>Key Focus Points</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {(POSE_TIPS[ex.pose] || []).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* Renders a workout's muscle-group breakdown with tappable exercises, shared between the Weekly Plan
   card and any workout the coach generates inline in chat. */
function MuscleGroupBlock({ muscleGroups, onTapExercise }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {muscleGroups.map((mg, i) => (
        <div key={i}>
          <div className="disp" style={{ fontSize: 12, color: "var(--brass)", textTransform: "capitalize", marginBottom: 4 }}>{mg.muscle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {mg.exercises.map((ex, j) => {
              const matched = lookupExercise(ex.name);
              return (
                <button key={j} onClick={() => matched && onTapExercise(matched)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "2px 0", minHeight: 44, cursor: matched ? "pointer" : "default", textAlign: "left", width: "100%" }}>
                  <span style={{ fontSize: 12.5, color: matched ? "var(--steel)" : "var(--ink)" }}>• {ex.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", flexShrink: 0, marginLeft: 8 }}>{ex.sets}×{ex.reps}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

function PricingPage({ subscriptionState, isPremium, onConfirmUpgrade, billingLoading, billingError, onClose, initialFeature }) {
  const [plan, setPlan] = useState("monthly");
  const [trial, setTrial] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);
  useEffect(() => { logEvent("paywall_viewed", { feature: initialFeature || "pricing_page" }); }, [initialFeature]);

  const price = plan === "annual" ? ANNUAL_PRICE : MONTHLY_PRICE;
  const period = plan === "annual" ? "yr" : "mo";

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 45, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <h1 className="disp" style={{ fontSize: 24 }}>Asc3end+</h1>
        <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close pricing"><X size={16} /></button>
      </div>

      {isPremium ? (
        <div className="atlas-card" style={{ textAlign: "center", padding: 28, marginBottom: 16 }}>
          <Check size={26} color="var(--good)" style={{ marginBottom: 10 }} />
          <div className="disp" style={{ fontSize: 17, marginBottom: 6 }}>You're already on Asc3end+</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>{describeSubscriptionState(subscriptionState)}</div>
        </div>
      ) : (
        <>
          <div className="atlas-card" style={{ textAlign: "center", padding: "24px 20px", marginBottom: 16 }}>
            <Sparkles size={26} color="var(--brass)" style={{ marginBottom: 10 }} />
            <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>Unlock unlimited Coach, food scanner & Meals Near You</div>
            <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 18 }}>Everything you're already tracking, without the free-tier limits.</div>

            <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
              <button
                onClick={() => setPlan("monthly")}
                className={plan === "monthly" ? "atlas-btn" : "atlas-btn-ghost"}
                style={{ flex: 1 }}
              >
                Monthly
              </button>
              <button
                onClick={() => setPlan("annual")}
                className={plan === "annual" ? "atlas-btn" : "atlas-btn-ghost"}
                style={{ flex: 1, position: "relative" }}
              >
                Annual
                <span className="mono" style={{ position: "absolute", top: -9, right: -6, background: "var(--good)", color: "var(--bg)", fontSize: 8.5, padding: "2px 5px", borderRadius: 3 }}>
                  SAVE {ANNUAL_SAVINGS_PCT}%
                </span>
              </button>
            </div>

            <div style={{ marginBottom: 4 }}>
              <span className="disp" style={{ fontSize: 32 }}>AUD ${price.toFixed(2)}</span>
              <span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>/{period}</span>
            </div>
            {plan === "annual" && (
              <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 14 }}>
                equivalent to AUD ${(ANNUAL_PRICE / 12).toFixed(2)}/mo — vs AUD ${(MONTHLY_PRICE * 12).toFixed(2)}/yr paid monthly
              </div>
            )}
            {plan !== "annual" && <div style={{ marginBottom: 14 }} />}

            <label style={{ display: "flex", alignItems: "center", gap: 8, justifyContent: "center", marginBottom: 16, cursor: "pointer" }}>
              <input type="checkbox" checked={trial} onChange={(e) => setTrial(e.target.checked)} />
              <span style={{ fontSize: 12.5 }}>Start with a 7-day free trial</span>
            </label>

            {billingError && <div style={{ color: "var(--rest)", fontSize: 12, marginBottom: 12 }}>{billingError}</div>}

            <button
              className="atlas-btn"
              style={{ width: "100%" }}
              disabled={billingLoading === "checkout"}
              onClick={() => onConfirmUpgrade(plan, trial)}
            >
              {billingLoading === "checkout" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              {trial ? "Start Free Trial — Upgrade to Asc3end+" : `Upgrade to Asc3end+ — AUD $${price.toFixed(2)}/${period}`}
            </button>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 10, lineHeight: 1.5 }}>
              {trial
                ? "You won't be charged for 7 days. Your card is charged automatically after the trial unless you cancel first. Cancel anytime."
                : "Billed immediately, then recurring until you cancel. Cancel anytime — no lock-in."}
            </div>
            <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 10 }}>
              <button onClick={() => setLegalOpen("subscriptionTerms")} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 10.5, textDecoration: "underline", padding: 0 }}>Subscription Terms</button>
              <button onClick={() => setLegalOpen("refundPolicy")} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 10.5, textDecoration: "underline", padding: 0 }}>Refund Policy</button>
            </div>
          </div>

          {legalOpen && <LegalPage docKey={legalOpen} onClose={() => setLegalOpen(null)} />}

          <div className="atlas-card" style={{ marginBottom: 16 }}>
            <h2 className="disp" style={{ fontSize: 15, marginBottom: 4 }}>Free vs Asc3end+</h2>
            <FeatureComparisonTable />
          </div>
        </>
      )}

      <div className="atlas-card">
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Questions</h2>
        {PRICING_FAQ.map((item) => (
          <div key={item.q} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
            <div style={{ fontSize: 12.5, fontWeight: 600, marginBottom: 4 }}>{item.q}</div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>{item.a}</div>
          </div>
        ))}
      </div>
    </div>
  );
}

// Coach responses previously rendered as raw text — a literal "**60kg**" instead of bold —
// because Claude's replies are markdown-formatted prose but were dumped straight into a
// whiteSpace:pre-wrap <div>. react-markdown (no rehype-raw plugin enabled) renders markdown AST
// directly into React elements and never interprets the input as raw HTML, so this can't become
// an HTML/script-injection vector even though the content is AI-generated, not hand-authored.
// The custom `a` renderer below is the one extra guard that matters: without it, a markdown link
// opens in the same tab (no rel="noopener noreferrer", letting the destination page reach back via
// window.opener) and a non-http(s)/mailto href — a javascript: URI in a sufficiently adversarial
// model output — would still execute if rendered as a real link.
const SAFE_LINK_PATTERN = /^(https?:|mailto:)/i;
const markdownComponents = {
  p: ({ children }) => <p style={{ margin: "0 0 8px", lineHeight: 1.5 }}>{children}</p>,
  ul: ({ children }) => <ul style={{ margin: "0 0 8px", paddingLeft: 20 }}>{children}</ul>,
  ol: ({ children }) => <ol style={{ margin: "0 0 8px", paddingLeft: 20 }}>{children}</ol>,
  li: ({ children }) => <li style={{ marginBottom: 2 }}>{children}</li>,
  a: ({ href, children }) => {
    if (typeof href !== "string" || !SAFE_LINK_PATTERN.test(href)) return <span>{children}</span>;
    return <a href={href} target="_blank" rel="noopener noreferrer" style={{ color: "var(--brass)", textDecoration: "underline" }}>{children}</a>;
  },
};

function CoachMessageContent({ content }) {
  return (
    <Suspense fallback={<div style={{ whiteSpace: "pre-wrap" }}>{content}</div>}>
      <ReactMarkdown components={markdownComponents}>{content}</ReactMarkdown>
    </Suspense>
  );
}

function ShareCard({ workout, athleteName }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | rendering | ready | error
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const blobRef = useRef(null);

  const volume = Math.round(workoutVolume(workout));
  const setCount = (workout.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const durationMin = workout.startedAt && workout.completedAt ? Math.max(1, Math.round((new Date(workout.completedAt) - workout.startedAt) / 60000)) : null;
  const bestPR = (workout.prs || [])[0] || null;
  const dateLabel = new Date(workout.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0A130F" />
          <stop offset="100%" stop-color="#060B08" />
        </linearGradient>
      </defs>
      <rect width="600" height="750" fill="url(#bg)" />
      <rect x="24" y="24" width="552" height="702" rx="24" fill="none" stroke="#1E2E27" stroke-width="1.5" />
      <text x="60" y="90" font-family="Oswald, sans-serif" font-size="22" letter-spacing="3" fill="#3ECF8E">ASC3END</text>
      ${athleteName ? `<text x="60" y="128" font-family="Oswald, sans-serif" font-size="17" fill="#E7EFEA">${escapeXml(athleteName)}</text>` : ""}
      <text x="60" y="${athleteName ? 160 : 130}" font-family="'JetBrains Mono', monospace" font-size="13" fill="#7C9188">${escapeXml(dateLabel)}</text>
      <text x="60" y="230" font-family="Oswald, sans-serif" font-size="34" fill="#F4F8F6">${escapeXml(workout.planDayName || "Free Workout")}</text>
      ${bestPR ? `
        <rect x="60" y="260" width="480" height="64" rx="12" fill="#3ECF8E22" stroke="#3ECF8E" stroke-width="1.5" />
        <text x="84" y="288" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="1" fill="#3ECF8E">NEW PERSONAL RECORD</text>
        <text x="84" y="312" font-family="Oswald, sans-serif" font-size="19" fill="#F4F8F6">${escapeXml(bestPR.exName)} — ${bestPR.weight}kg × ${bestPR.reps}</text>
      ` : ""}
      ${[
        { label: "VOLUME", value: `${volume.toLocaleString()}kg` },
        { label: "SETS", value: `${setCount}` },
        { label: "DURATION", value: durationMin ? `${durationMin} min` : "—" },
      ].map((s, i) => `
        <text x="${60 + i * 176}" y="${bestPR ? 400 : 340}" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="1" fill="#7C9188">${s.label}</text>
        <text x="${60 + i * 176}" y="${(bestPR ? 400 : 340) + 40}" font-family="Oswald, sans-serif" font-size="30" fill="#F4F8F6">${s.value}</text>
      `).join("")}
      <text x="60" y="690" font-family="'JetBrains Mono', monospace" font-size="11" fill="#4F6058">Train, eat, and progress with Asc3end.</text>
    </svg>
  `.trim();

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  }

  const render = async () => {
    setStatus("rendering");
    try {
      // Drawing an SVG-as-image onto a canvas doesn't reliably wait for the page's own webfonts
      // (Oswald/JetBrains Mono, both loaded elsewhere via GlobalStyle) the first time they're
      // needed — without this the card can silently rasterize with the browser's default
      // sans-serif instead, which looks unfinished for something meant to be shared.
      if (document.fonts?.ready) await document.fonts.ready;
      const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = canvasRef.current;
      const scale = 2;
      canvas.width = 600 * scale;
      canvas.height = 750 * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 600, 750);
      URL.revokeObjectURL(url);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      blobRef.current = blob;
      setNativeShareAvailable(!!(navigator.share && navigator.canShare && blob && navigator.canShare({ files: [new File([blob], "workout.png", { type: "image/png" })] })));
      setStatus("ready");
    } catch (e) {
      setStatus("error");
    }
  };

  useEffect(() => { render(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const download = () => {
    if (!blobRef.current) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asc3end-workout-${workout.date}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logEvent("share_card_downloaded", {});
  };

  const nativeShare = async () => {
    if (!blobRef.current) return;
    try {
      await navigator.share({
        files: [new File([blobRef.current], "asc3end-workout.png", { type: "image/png" })],
        title: "My Asc3end workout",
      });
      logEvent("share_card_shared", {});
    } catch (e) { /* user cancelled the share sheet — not an error */ }
  };

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 12, background: "#060B08" }}>
        {status === "rendering" && (
          <div style={{ aspectRatio: "600/750", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={22} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {status === "error" && (
          <div style={{ aspectRatio: "600/750", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontSize: 12, color: "var(--ink-dim)" }}>
            Couldn't generate the image. You can still try again below.
          </div>
        )}
        <canvas ref={canvasRef} style={{ width: "100%", display: status === "ready" ? "block" : "none" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {nativeShareAvailable && (
          <button className="atlas-btn" style={{ flex: 1 }} onClick={nativeShare} disabled={status !== "ready"}>
            <Share2 size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Share
          </button>
        )}
        <button className={nativeShareAvailable ? "atlas-btn-ghost" : "atlas-btn"} style={{ flex: 1 }} onClick={status === "error" ? render : download} disabled={status === "rendering"}>
          <Download size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> {status === "error" ? "Retry" : "Download"}
        </button>
      </div>
    </div>
  );
}

function WorkoutCompleteScreen({ workout, streakBefore, streakAfter, athleteDisplayName, onDone }) {
  const [showShare, setShowShare] = useState(false);
  const [includeName, setIncludeName] = useState(false);
  const xp = workout.xpBreakdown || { completion: 0, sets: 0, prBonus: 0, streakBonus: 0, total: 0 };
  const volume = Math.round(workoutVolume(workout));
  const setCount = (workout.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const exerciseCount = (workout.exercises || []).length;
  const durationMin = workout.startedAt && workout.completedAt ? Math.max(1, Math.round((new Date(workout.completedAt) - workout.startedAt) / 60000)) : null;
  const streakGrew = streakAfter > streakBefore;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 18px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, var(--brass), #2BAE73)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Check size={30} color="#072016" strokeWidth={3} />
          </div>
          <h1 className="disp" style={{ fontSize: 24 }}>Workout Complete</h1>
          <div style={{ color: "var(--ink-dim)", fontSize: 13, marginTop: 4 }}>{workout.planDayName || "Free Workout"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{exerciseCount}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>EXERCISES</div>
          </div>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{setCount}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>SETS</div>
          </div>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{durationMin ? `${durationMin}m` : "—"}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>DURATION</div>
          </div>
        </div>

        {workout.prs && workout.prs.length > 0 && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>
              <Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{workout.prs.length} New PR{workout.prs.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {workout.prs.map((pr, i) => (
                <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                  {pr.exName} — {pr.weight}kg × {pr.reps} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
                </div>
              ))}
            </div>
          </div>
        )}

        {streakGrew && (
          <div className="atlas-card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderColor: "var(--warn)" }}>
            <Flame size={20} color="var(--warn)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>{streakAfter} day streak — keep it going.</div>
          </div>
        )}

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>XP Earned</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Workout completion</span><span className="mono">+{xp.completion}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Sets &amp; exercises</span><span className="mono">+{xp.sets}</span></div>
            {xp.prBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Personal record bonus</span><span className="mono">+{xp.prBonus}</span></div>}
            {xp.streakBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Streak bonus</span><span className="mono">+{xp.streakBonus}</span></div>}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span className="disp">Total XP earned</span>
              <span className="mono" style={{ color: "var(--brass)" }}>+{xp.total}</span>
            </div>
          </div>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          {!showShare ? (
            <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={() => setShowShare(true)}>
              <Share2 size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Create Shareable Card
            </button>
          ) : (
            <div>
              <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Share This Workout</h2>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }} className="mono">
                <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} />
                <span style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>Include my name on the card</span>
              </label>
              <ShareCard workout={workout} athleteName={includeName ? athleteDisplayName : null} />
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic" }}>
                Only this workout's stats are on the card — no bodyweight, nutrition, or account data. Nothing is posted anywhere until you choose to share or download it.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 18px calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <button className="atlas-btn" style={{ width: "100%", padding: 14 }} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}

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
          <div className="bar-track" style={{ marginTop: 4, height: 5 }}><div className="bar-fill" style={{ width: `${(mission.current / mission.target) * 100}%`, background: "var(--steel)" }} /></div>
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
        <div className="bar-track"><div className="bar-fill" style={{ width: `${pct}%`, background: progress.completed ? "var(--brass)" : "var(--steel)" }} /></div>
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

function ChallengesScreen({ workouts, nutrition, profile, streak, challenges, onStartChallenge, onRemoveChallenge, onClose }) {
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
                  <div className="bar-track" style={{ width: "100%", height: 4 }}><div className="bar-fill" style={{ width: `${(b.current / b.target) * 100}%`, background: "var(--steel)" }} /></div>
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

function Coach({ profile, workouts, onUpdateProfile, isPremium, onUpgrade, usage, onUsageChange }) {
  const coachRemaining = remainingMonthlyUses(FEATURES.COACH, usage || {});
  // Bug: this used to read `profile.plan`, a field nothing ever wrote — the real field is
  // `profile.activePlan` (set by activatePlan below), so a fresh mount of Coach always started
  // with no plan showing here even when Home was actively running one. Reconstruct the same
  // `{ days }` shape generatePlan produces so the Weekly Plan card reflects reality on load.
  const [plan, setPlan] = useState(profile.activePlan ? { days: profile.activePlan.days } : null);
  const [genLoading, setGenLoading] = useState(false);
  const greeting = () => ([{ role: "assistant", content: `Hey ${profile.name || "there"}, I'm your coach. Ask me anything about training, recovery, or your plan.` }]);
  const [messages, setMessages] = useState(greeting);
  const [messagesLoaded, setMessagesLoaded] = useState(false);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastFailedInput, setLastFailedInput] = useState(null);
  const scrollRef = useRef(null);
  // Guards sendMessage against a genuine double-fire the same way finishWorkout does — the Enter
  // key and the Send button can both dispatch in the same tick, and React doesn't guarantee
  // `sending`'s updated value (and thus the button's disabled attribute) is visible to a second,
  // synchronous handler invocation before the first commits. A ref updates immediately.
  const sendingRef = useRef(false);

  // Restores a persisted conversation on mount instead of always starting over from the greeting
  // — previously, switching tabs (Coach unmounts) or refreshing the page silently discarded the
  // whole conversation with no warning. Skips restoring if nothing was saved, or if every saved
  // message fails validation (a corrupted/old-shape row), rather than leaving Coach stuck loading.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const saved = await loadKey(KEYS.coachMessages);
      const valid = Array.isArray(saved) ? saved.filter(isValidChatMessage) : [];
      if (!cancelled && valid.length > 0) setMessages(valid);
      if (!cancelled) setMessagesLoaded(true);
    })();
    return () => { cancelled = true; };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  // Saves after every change, but only once the initial load above has resolved — otherwise the
  // still-loading default greeting would overwrite real saved history in the instant before it's
  // fetched.
  useEffect(() => {
    if (!messagesLoaded) return;
    saveKey(KEYS.coachMessages, messages);
  }, [messages, messagesLoaded]);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  // Elapsed-seconds counter for the "Thinking…" indicator — the underlying request can
  // legitimately take 10-20+ seconds (web-search-backed Meals Near You shares this same proxy,
  // and Coach itself can be slow under load), so a bare "Thinking…" with no sense of progress
  // reads as hung well before the real 55s timeout in callClaude ever fires.
  const [thinkingSeconds, setThinkingSeconds] = useState(0);
  useEffect(() => {
    if (!sending) { setThinkingSeconds(0); return; }
    const started = Date.now();
    const t = setInterval(() => setThinkingSeconds(Math.floor((Date.now() - started) / 1000)), 1000);
    return () => clearInterval(t);
  }, [sending]);

  const [planError, setPlanError] = useState(null);
  const [exDetail, setExDetail] = useState(null);
  const [planActivated, setPlanActivated] = useState(!!profile.activePlan);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editDays, setEditDays] = useState(null);
  const [addingToDay, setAddingToDay] = useState(null);
  const [exSearch, setExSearch] = useState("");
  const GEN_PHASES = ["Analysing your goal…", "Selecting your split…", "Balancing weekly volume…", "Choosing exercises…", "Finalising your plan…"];
  const [genPhase, setGenPhase] = useState(0);

  useEffect(() => {
    if (!genLoading) { setGenPhase(0); return; }
    const t = setInterval(() => setGenPhase((p) => Math.min(p + 1, GEN_PHASES.length - 1)), 3000);
    return () => clearInterval(t);
  }, [genLoading]);

  const generatePlan = async () => {
    if (genLoading) return; // prevent duplicate simultaneous requests
    setGenLoading(true);
    setPlanError(null);
    setPlanActivated(false);
    try {
      const prompt = `Build a ${profile.trainingDays}-day weekly workout split for this athlete:
Goal: ${GOAL_LABELS[profile.goal]}
Experience: ${profile.experience}
Age: ${profile.age}, Weight: ${profile.weightKg}kg, Height: ${profile.heightCm}cm
Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this schema:
{"days":[{"day":"Day 1: Push","muscleGroups":[{"muscle":"chest","exercises":[{"name":"Barbell Bench Press","sets":4,"reps":"6-10"}]}]}]}
Use "muscle" values only from: chest, back, shoulders, arms, legs, core. Use ${profile.trainingDays} day entries. Use exercise names matching this style, drawing from real gym equipment and movement patterns (barbell/dumbbell/cable/machine/bodyweight): ${PLAN_PROMPT_VOCABULARY}`;
      const stylePrompt = (COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).prompt;
      const text = await callClaude([{ role: "user", content: prompt }], 2000, null, `You are a strength coach building a training split.\n\n${TRAINING_PRINCIPLES}\n\n${stylePrompt}\n\n${COACH_SAFETY_RULES}`, "coach");
      const parsed = extractJSON(text);
      setPlan(parsed);
      logEvent("plan_generated", { trainingDays: profile.trainingDays, coachingStyle: profile.coachingStyle || "balanced" });
    } catch (e) {
      setPlan(null);
      setPlanError(e.message || "Couldn't build a plan just now — try again.");
    }
    onUsageChange?.();
    setGenLoading(false);
  };

  const activatePlan = () => {
    if (!plan?.days?.length) return;
    onUpdateProfile({ activePlan: { days: plan.days, currentDayIndex: 0, activatedAt: new Date().toISOString() } });
    setPlanActivated(true);
    logEvent("plan_activated", { days: plan.days.length });
  };

  // Deactivating clears the schedule Home reads from (activePlan) but keeps `plan` visible here
  // so the athlete can see what they had and re-activate it without regenerating from scratch.
  const deactivatePlan = () => {
    onUpdateProfile({ activePlan: null });
    setPlanActivated(false);
  };

  const startEditPlan = () => {
    setEditDays(plan.days.map((d) => ({ day: d.day, muscleGroups: d.muscleGroups.map((mg) => ({ muscle: mg.muscle, exercises: mg.exercises.map((e) => ({ ...e })) })) })));
    setEditingPlan(true);
  };

  const cancelEditPlan = () => {
    setEditingPlan(false);
    setEditDays(null);
    setAddingToDay(null);
    setExSearch("");
  };

  // Empty muscle groups / days (every exercise removed) are dropped on save rather than left as
  // dead weight the athlete would have to notice and clean up themselves.
  const saveEditPlan = () => {
    const cleanedDays = editDays
      .map((d) => ({ ...d, muscleGroups: d.muscleGroups.filter((mg) => mg.exercises.length > 0) }))
      .filter((d) => d.muscleGroups.length > 0);
    setPlan({ days: cleanedDays });
    if (planActivated && profile.activePlan) {
      const nextIndex = Math.min(profile.activePlan.currentDayIndex, Math.max(0, cleanedDays.length - 1));
      onUpdateProfile({ activePlan: { ...profile.activePlan, days: cleanedDays, currentDayIndex: nextIndex } });
    }
    logEvent("plan_edited", { days: cleanedDays.length });
    setEditingPlan(false);
    setEditDays(null);
    setAddingToDay(null);
    setExSearch("");
  };

  const updateDayName = (dayIdx, name) => {
    setEditDays((days) => days.map((d, i) => (i === dayIdx ? { ...d, day: name } : d)));
  };

  const updateExerciseField = (dayIdx, mgIdx, exIdx, field, value) => {
    setEditDays((days) => days.map((d, i) => i !== dayIdx ? d : {
      ...d,
      muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : {
        ...mg,
        exercises: mg.exercises.map((e, k) => k !== exIdx ? e : { ...e, [field]: value }),
      }),
    }));
  };

  const removeExercise = (dayIdx, mgIdx, exIdx) => {
    setEditDays((days) => days.map((d, i) => i !== dayIdx ? d : {
      ...d,
      muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : { ...mg, exercises: mg.exercises.filter((_, k) => k !== exIdx) }),
    }));
  };

  const addExerciseToDay = (dayIdx, ex) => {
    setEditDays((days) => days.map((d, i) => {
      if (i !== dayIdx) return d;
      const mgIdx = d.muscleGroups.findIndex((mg) => mg.muscle === ex.muscle);
      if (mgIdx === -1) {
        return { ...d, muscleGroups: [...d.muscleGroups, { muscle: ex.muscle, exercises: [{ name: ex.name, sets: 3, reps: "8-12" }] }] };
      }
      return {
        ...d,
        muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : { ...mg, exercises: [...mg.exercises, { name: ex.name, sets: 3, reps: "8-12" }] }),
      };
    }));
    setAddingToDay(null);
    setExSearch("");
  };

  const removeDay = (dayIdx) => {
    setEditDays((days) => days.filter((_, i) => i !== dayIdx));
  };

  const addDay = () => {
    setEditDays((days) => [...days, { day: `Day ${days.length + 1}`, muscleGroups: [] }]);
  };

  const sendMessage = async (overrideText) => {
    // overrideText is only ever meant to be a string (a retry's saved input) — guard against a
    // stray non-string argument (e.g. a click event handed straight to onClick) instead of letting
    // it silently fall through to `.trim()` and crash.
    if (sendingRef.current) return; // a genuine double-fire (Enter + Send in the same tick) — see sendingRef above
    const safeOverride = typeof overrideText === "string" ? overrideText : undefined;
    const text = safeOverride ?? input;
    if (!text.trim()) return;
    sendingRef.current = true;
    setLastFailedInput(null);
    // On retry, drop the trailing error bubble first — otherwise it both looks stale once the
    // retry succeeds, and gets sent back to Claude as if it were real conversation history.
    const base = safeOverride && messages[messages.length - 1]?.isError ? messages.slice(0, -1) : messages;
    const userMsg = { role: "user", content: text };
    const newMessages = safeOverride ? base : [...base, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    logEvent("coach_message_sent", { isRetry: !!safeOverride });
    try {
      const recent = workouts.slice(-3).map((w) => `${w.date}: ${w.exercises.map((e) => e.name).join(", ")}`).join(" | ");
      const stylePrompt = (COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).prompt;
      // Same getNutritionTargets() every other screen uses — so if the Coach ever references "your
      // target," it's the identical number Home/Food/Settings show, not a separately-derived one.
      const targets = getNutritionTargets(profile);
      // profile.name was previously missing from this prompt entirely — Claude had no actual
      // name to address the athlete by (only the client-side synthetic greeting bubble did, and
      // that's stripped before sending), so it would invent a literal "[Name]" placeholder.
      const system = `You are Asc3end, an encouraging but direct fitness and nutrition coach. Athlete profile: name=${profile.name || "there"}, goal=${GOAL_LABELS[profile.goal]}, experience=${profile.experience}, weight=${profile.weightKg}kg. Daily nutrition target (${targets.source}): ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat. Recent workouts: ${recent || "none logged"}.\n\n${TRAINING_PRINCIPLES}\n\n${stylePrompt}\n\n${COACH_SAFETY_RULES}\n\n${COACH_OUTPUT_RULES}`;
      // Strip the synthetic greeting (index 0) — it was never a real API turn, and including it
      // alongside a fake priming pair broke the API's requirement that roles strictly alternate
      // starting with "user", which is why the coach silently failed on every message before.
      // Also strip any extra UI-only fields (like `workout`) so future turns send clean {role, content} pairs.
      const apiMessages = newMessages.slice(1).map((m) => ({ role: m.role, content: m.content }));
      const reply = await callClaude(apiMessages, 900, null, system, "coach");
      let parsedWorkout = null;
      if (reply.includes('"type"') && reply.includes('"workout"')) {
        try {
          const parsed = extractJSON(reply);
          if (parsed.type === "workout" && Array.isArray(parsed.muscleGroups)) parsedWorkout = parsed;
        } catch (e) { /* not valid JSON, fall through to plain text */ }
      }
      setMessages((m) => [...m, { role: "assistant", content: reply, workout: parsedWorkout }]);
    } catch (e) {
      setLastFailedInput(text);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "Something went wrong reaching the coach. Try again in a moment."}`, isError: true }]);
    }
    onUsageChange?.();
    sendingRef.current = false;
    setSending(false);
  };

  const startNewConversation = () => {
    setMessages(greeting());
    setLastFailedInput(null);
    setInput("");
  };

  if (!isPremium && coachRemaining <= 0) {
    return (
      <div style={{ padding: "24px 18px" }}>
        <h1 className="disp" style={{ fontSize: 26, marginBottom: 16 }}>Coach</h1>
        <Paywall feature="coach" onUpgrade={onUpgrade} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", height: "calc(100vh - 88px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h1 className="disp" style={{ fontSize: 26 }}>Coach</h1>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isPremium && (
            <span className="mono" style={{ fontSize: 11, color: "var(--brass)" }}>{coachRemaining} free {coachRemaining === 1 ? "message" : "messages"} left this month</span>
          )}
          {messages.length > 1 && (
            <button onClick={startNewConversation} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center" }} title="Start a new conversation">
              New Chat
            </button>
          )}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 8 }}>COACHING STYLE</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(COACHING_STYLES).map(([key, s]) => {
          const active = (profile.coachingStyle || "balanced") === key;
          return (
            <button key={key} onClick={() => onUpdateProfile({ coachingStyle: key })} title={s.blurb}
              className="pill" style={{ cursor: "pointer", minHeight: 44, border: `1px solid ${active ? "var(--brass)" : "var(--line)"}`, background: active ? "var(--brass-soft)" : "transparent", color: active ? "var(--brass)" : "var(--ink-dim)" }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 14, fontStyle: "italic" }}>
        {(COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).blurb}
      </div>

      <div className="atlas-card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <h2 className="disp" style={{ fontSize: 15 }}>Weekly Plan</h2>
          {!editingPlan && (
            <div style={{ display: "flex", gap: 6 }}>
              {plan && (
                <button className="atlas-btn-ghost" style={{ padding: "6px 12px", fontSize: 11 }} onClick={startEditPlan} disabled={genLoading}>
                  <Pencil size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Edit
                </button>
              )}
              <button className="atlas-btn-ghost" style={{ padding: "6px 12px", fontSize: 11 }} onClick={generatePlan} disabled={genLoading}>
                {genLoading ? <Loader2 size={13} className="mono" style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4 }} />}
                {genLoading ? "Building..." : plan ? "Regenerate" : "Generate"}
              </button>
            </div>
          )}
        </div>
        {genLoading && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>{GEN_PHASES[genPhase]}</div>}

        {!editingPlan && !genLoading && planActivated && profile.activePlan && (
          <div style={{ marginTop: 10 }}>
            <ProgramRoadmap days={profile.activePlan.days} currentDayIndex={profile.activePlan.currentDayIndex} />
          </div>
        )}

        {editingPlan && editDays && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
            {editDays.map((d, dayIdx) => (
              <div key={dayIdx} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input className="atlas-input" style={{ flex: 1, fontSize: 13 }} value={d.day} onChange={(e) => updateDayName(dayIdx, e.target.value)} aria-label={`Day ${dayIdx + 1} name`} />
                  <button onClick={() => removeDay(dayIdx)} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label={`Remove ${d.day}`}>
                    <Trash2 size={13} color="var(--rest)" />
                  </button>
                </div>
                {d.muscleGroups.map((mg, mgIdx) => (
                  <div key={mgIdx} style={{ marginBottom: 8 }}>
                    <div className="mono" style={{ fontSize: 10, color: "var(--brass)", textTransform: "capitalize", marginBottom: 4 }}>{mg.muscle}</div>
                    {mg.exercises.map((ex, exIdx) => (
                      <div key={exIdx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 12.5 }}>{ex.name}</span>
                        <input className="atlas-input" type="number" style={{ width: 50, fontSize: 12, padding: "6px 8px" }} value={ex.sets} onChange={(e) => updateExerciseField(dayIdx, mgIdx, exIdx, "sets", +e.target.value || 0)} aria-label={`Sets for ${ex.name}`} />
                        <input className="atlas-input" style={{ width: 60, fontSize: 12, padding: "6px 8px" }} value={ex.reps} onChange={(e) => updateExerciseField(dayIdx, mgIdx, exIdx, "reps", e.target.value)} aria-label={`Reps for ${ex.name}`} />
                        <button onClick={() => removeExercise(dayIdx, mgIdx, exIdx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Remove ${ex.name} from ${d.day}`}>
                          <X size={13} color="var(--ink-dim)" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                {addingToDay === dayIdx ? (
                  <div style={{ marginTop: 6 }}>
                    <input autoFocus className="atlas-input" style={{ fontSize: 12, marginBottom: 6 }} placeholder="Search exercises…" value={exSearch} onChange={(e) => setExSearch(e.target.value)} aria-label="Search exercises to add" />
                    <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                      {EXERCISES.filter((e) => matchesSearch(e.name, exSearch)).slice(0, 20).map((e) => (
                        <button key={e.name} onClick={() => addExerciseToDay(dayIdx, e)} style={{ display: "flex", justifyContent: "space-between", textAlign: "left", background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "var(--ink)", fontSize: 12 }}>
                          {e.name} <span className="mono" style={{ color: "var(--ink-dim)", textTransform: "capitalize" }}>{e.muscle}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setAddingToDay(null); setExSearch(""); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "6px 0 0" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setAddingToDay(dayIdx); setExSearch(""); }} className="atlas-btn-ghost" style={{ width: "100%", fontSize: 11, padding: "6px 0", marginTop: 4 }}>
                    <Plus size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Add Exercise
                  </button>
                )}
              </div>
            ))}
            <button onClick={addDay} className="atlas-btn-ghost" style={{ width: "100%" }}>
              <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Add Day
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelEditPlan} className="atlas-btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={saveEditPlan} className="atlas-btn" style={{ flex: 1 }} disabled={editDays.every((d) => d.muscleGroups.every((mg) => mg.exercises.length === 0))}>Save Changes</button>
            </div>
          </div>
        )}

        {!editingPlan && plan && !genLoading && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            {plan.days.map((d, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--steel)", marginBottom: 6 }}>{d.day}</div>
                <MuscleGroupBlock muscleGroups={d.muscleGroups} onTapExercise={setExDetail} />
              </div>
            ))}
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", fontStyle: "italic" }}>Tap any exercise for form cues.</div>
            {planActivated ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div className="pill mono" style={{ background: "var(--brass-soft)", color: "var(--brass)" }}>✓ Active plan — see it on Home</div>
                <button onClick={deactivatePlan} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center" }}>Deactivate</button>
              </div>
            ) : (
              <button className="atlas-btn" style={{ width: "100%", marginTop: 4 }} onClick={activatePlan}>Activate Plan</button>
            )}
          </div>
        )}
        {planError && !genLoading && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "var(--rest)" }}>⚠️ {planError}</div>
            <button onClick={generatePlan} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", marginTop: 4 }}>Retry</button>
          </div>
        )}
        {!plan && !planError && !genLoading && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>Generate a personalised split based on your goal and schedule.</div>}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            {m.workout ? (
              <div style={{ minWidth: 220 }}>
                <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>{m.workout.title}</div>
                <MuscleGroupBlock muscleGroups={m.workout.muscleGroups} onTapExercise={setExDetail} />
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8, fontStyle: "italic" }}>Tap any exercise for form cues.</div>
              </div>
            ) : (
              <CoachMessageContent content={m.content} />
            )}
          </div>
        ))}
        {sending && (
          <div className="chat-bubble-ai" style={{ fontSize: 13, display: "flex", alignItems: "center", gap: 6 }} role="status" aria-live="polite">
            <Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} />
            <span>Thinking{thinkingSeconds > 0 ? ` (${thinkingSeconds}s)` : "…"}</span>
          </div>
        )}
        {lastFailedInput && !sending && (
          <div style={{ display: "flex", gap: 10, alignSelf: "flex-start", paddingLeft: 2 }}>
            <button onClick={() => sendMessage(lastFailedInput)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: 0 }}>Retry</button>
            <button onClick={() => { setInput(lastFailedInput); setLastFailedInput(null); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0 }}>Edit &amp; Resend</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input className="atlas-input" placeholder="Ask your coach…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
        <button className="atlas-btn" style={{ padding: "10px 14px" }} onClick={() => sendMessage()} disabled={sending} aria-label="Send message"><Send size={16} /></button>
      </div>

      {exDetail && <CoachExercisePopup ex={exDetail} onClose={() => setExDetail(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrition                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Food Scanner — camera photo recognition + barcode lookup            */
/* ------------------------------------------------------------------ */

function FoodScanner({ onAdd, onClose }) {
  const [mode, setMode] = useState("photo");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [grams, setGrams] = useState(100);
  const [manualBarcode, setManualBarcode] = useState("");
  const [cameraDenied, setCameraDenied] = useState(false);
  const barcodeSupported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  // Basic modal focus trap: focus something inside on open, cycle Tab/Shift+Tab within the
  // dialog instead of letting it escape into the page behind it, close on Escape, and return
  // focus to whatever opened the scanner once it closes.
  useEffect(() => {
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    focusable()[0]?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus?.();
    };
  }, []);

  const stopCamera = () => {
    if (scanLoopRef.current) { clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  const lookupBarcode = async (code) => {
    setLoading(true);
    setError(null);
    stopCamera();
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const data = await res.json();
      if (data.status !== 1 || !data.product) throw new Error("not found");
      const n = data.product.nutriments || {};
      setResult({
        name: data.product.product_name || `Barcode ${code}`,
        per100g: {
          calories: Math.round(n["energy-kcal_100g"] || 0),
          protein: Math.round(n["proteins_100g"] || 0),
          carbs: Math.round(n["carbohydrates_100g"] || 0),
          fat: Math.round(n["fat_100g"] || 0),
        },
        source: "barcode",
      });
      setGrams(100);
    } catch (e) {
      setError("Couldn't find that barcode. Try the photo mode instead, or check the number.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (result || cameraDenied) { stopCamera(); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        if (mode === "barcode" && barcodeSupported) {
          const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          scanLoopRef.current = setInterval(async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) { clearInterval(scanLoopRef.current); lookupBarcode(codes[0].rawValue); }
            } catch (e) { /* keep trying */ }
          }, 400);
        }
      } catch (e) {
        // Covers both an explicit permission denial and no-camera-available devices — either way
        // the live camera path is dead, so stop retrying it and surface the fallback options instead.
        setCameraDenied(true);
        setError(mode === "photo" ? "Camera access denied or unavailable. Upload a photo instead, or log it manually." : "Camera access denied or unavailable. Enter the barcode number instead.");
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [mode, result, cameraDenied]);

  const analyzeImage = async (base64) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          feature: "scanner",
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: `Identify the food in this photo and estimate its nutrition. Return ONLY valid JSON, no markdown fences, no preamble: {"name":"","estimatedGrams":0,"caloriesPer100g":0,"proteinPer100g":0,"carbsPer100g":0,"fatPer100g":0}` },
            ],
          }],
        }),
      });
      const data = await response.json();
      if (response.status === 402 && data?.error?.code === "premium_required") {
        throw new Error(data.error.message || "This feature requires Asc3end Premium.");
      }
      const text = extractClaudeText(data);
      const parsed = extractJSON(text);
      setResult({
        name: parsed.name || "Unknown food",
        per100g: { calories: parsed.caloriesPer100g || 0, protein: parsed.proteinPer100g || 0, carbs: parsed.carbsPer100g || 0, fat: parsed.fatPer100g || 0 },
        source: "photo",
      });
      setGrams(parsed.estimatedGrams || 150);
    } catch (e) {
      setError(
        e.message && (e.message.startsWith("Usage limit") || e.message.includes("Premium"))
          ? e.message
          : "Couldn't identify that photo — try better lighting, or log it manually."
      );
    }
    setLoading(false);
  };

  // Downscales any drawImage-able source (a live <video> frame or a loaded <img>) to a capped
  // resolution before encoding — a full-resolution phone photo can be several MB, which is both
  // slower to upload and larger than it needs to be for the model to read the label/plate. This
  // is the actual file-upload size/type validation for the scanner: constrain what leaves the
  // browser rather than trust an arbitrary file's size.
  const MAX_IMAGE_DIM = 1024;
  const downscaleToBase64 = (source, naturalWidth, naturalHeight) => {
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const base64 = downscaleToBase64(video, video.videoWidth, video.videoHeight);
    stopCamera();
    await analyzeImage(base64);
  };

  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — generous for a phone photo, rejects anything absurd before it's even read
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError("That image is too large — try a smaller photo."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => analyzeImage(downscaleToBase64(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => setError("Couldn't read that image — try a different file.");
      img.src = reader.result;
    };
    reader.onerror = () => setError("Couldn't read that image — try a different file.");
    reader.readAsDataURL(file);
  };

  const totals = result ? {
    calories: Math.round((result.per100g.calories * grams) / 100),
    protein: Math.round((result.per100g.protein * grams) / 100),
    carbs: Math.round((result.per100g.carbs * grams) / 100),
    fat: Math.round((result.per100g.fat * grams) / 100),
  } : null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Scan food" style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.95)", zIndex: 50, display: "flex", flexDirection: "column", padding: "calc(18px + env(safe-area-inset-top)) 18px 18px", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="disp" style={{ fontSize: 18 }}>Scan Food</div>
        <button onClick={() => { stopCamera(); onClose(); }} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="Close scanner"><X size={20} color="var(--ink)" /></button>
      </div>

      {!result && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={() => setMode("photo")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mode === "photo" ? "var(--brass-soft)" : "transparent", color: mode === "photo" ? "var(--brass)" : "var(--ink-dim)" }}>Photo</button>
            <button onClick={() => setMode("barcode")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mode === "barcode" ? "var(--brass-soft)" : "transparent", color: mode === "barcode" ? "var(--brass)" : "var(--ink-dim)" }}>Barcode</button>
          </div>

          <div style={{ position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", flex: 1, minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {cameraDenied ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 20, textAlign: "center" }}>
                <AlertTriangle size={26} color="var(--warn)" />
                <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No camera access.</div>
                <button className="atlas-btn-ghost" style={{ fontSize: 11, padding: "6px 12px" }} onClick={() => { setCameraDenied(false); setError(null); }}>
                  Allow Camera
                </button>
              </div>
            ) : (
              <>
                <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {mode === "barcode" && <div style={{ position: "absolute", left: "10%", right: "10%", top: "40%", height: 60, border: "2px solid var(--brass)", borderRadius: 6 }} />}
              </>
            )}
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--rest)", marginTop: 10 }}>{error}</div>}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} hidden aria-hidden="true" tabIndex={-1} />

          {mode === "photo" && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="atlas-btn" style={{ flex: 1 }} onClick={capturePhoto} disabled={loading || cameraDenied}>
                {loading ? "Analyzing…" : <><Camera size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Capture</>}
              </button>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => fileInputRef.current?.click()} disabled={loading}>
                Upload Photo
              </button>
            </div>
          )}
          {mode === "photo" && (
            <button onClick={onClose} className="mono" style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11 }}>
              Log it manually instead
            </button>
          )}
          {mode === "barcode" && (!barcodeSupported || cameraDenied) && (
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <input className="atlas-input" placeholder="Enter barcode number" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} aria-label="Barcode number" />
              <button className="atlas-btn" onClick={() => manualBarcode && lookupBarcode(manualBarcode)} disabled={loading}>{loading ? "…" : "Find"}</button>
            </div>
          )}
          {mode === "barcode" && barcodeSupported && !cameraDenied && (
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 10, textAlign: "center" }}>Point the camera at a barcode…</div>
          )}
        </>
      )}

      {result && totals && (
        <div className="atlas-card">
          <div className="disp" style={{ fontSize: 16 }}>{result.name}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 12 }}>
            {result.source === "barcode" ? "From barcode lookup" : "From photo scan"} · {result.per100g.calories} kcal / 100g
          </div>
          <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>PORTION SIZE — ADJUST IF NEEDED (GRAMS)</label>
          <input type="number" className="atlas-input" value={grams} onChange={(e) => setGrams(e.target.value === "" ? 0 : +e.target.value.replace(/^0+(?=\d)/, ""))} style={{ marginTop: 4, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.calories}</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>KCAL</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.protein}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>PROTEIN</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.carbs}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>CARBS</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.fat}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>FAT</div></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setResult(null); setError(null); }}>
              <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Scan Again
            </button>
            <button className="atlas-btn" style={{ flex: 1 }} onClick={() => { onAdd({ id: uid(), date: todayStr(), name: `${result.name} (${grams}g)`, ...totals }); onClose(); }}>
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Add to Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

/* Circular progress indicator for one macro — value can exceed target (over-eating a macro is
   valid, not an error state), so the ring fill itself clamps at a full circle while the printed
   number keeps showing the real, possibly-over-target value. */
function MacroRing({ label, value, target, unit, color, size = 74 }) {
  const pct = target > 0 ? Math.min(1, value / target) : 0;
  const r = (size - 10) / 2;
  const c = 2 * Math.PI * r;
  const over = target > 0 && value > target;
  return (
    <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 5 }}>
      <svg width={size} height={size} viewBox={`0 0 ${size} ${size}`}>
        <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="var(--bg-elev2)" strokeWidth="7" />
        <circle
          cx={size / 2} cy={size / 2} r={r} fill="none" stroke={color} strokeWidth="7" strokeLinecap="round"
          strokeDasharray={`${c * pct} ${c}`}
          transform={`rotate(-90 ${size / 2} ${size / 2})`}
          style={{ transition: "stroke-dasharray 0.3s ease" }}
        />
        <text x="50%" y="47%" textAnchor="middle" fontSize="14" fontWeight="600" fill="var(--ink)" fontFamily="'JetBrains Mono', monospace">{Math.round(value)}</text>
        <text x="50%" y="64%" textAnchor="middle" fontSize="8.5" fill="var(--ink-dim)" fontFamily="'JetBrains Mono', monospace">/{Math.round(target)}{unit}</text>
      </svg>
      <div className="mono" style={{ fontSize: 9, color: over ? "var(--warn)" : "var(--ink-dim)", letterSpacing: 0.5 }}>{label}</div>
    </div>
  );
}

/* One adherence level per day for the last 7 days (today included). A day with nothing logged is
   its own "none" level, distinct from "off" — silence isn't the same claim as a bad day.
   classifyDayAdherence itself now lives in lib/nutritionMath.js (imported above) so workoutMath.js
   can also use it for the nutrition challenge template without creating a circular import back
   into this file — re-exported here unchanged so nothing else in the app needs to change. */
export { classifyDayAdherence };

function WeeklyAdherence({ nutrition, targets }) {
  const days = useMemo(() => weeklyAdherence(nutrition, targets), [nutrition, targets]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        {days.map((d) => (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }} title={`${d.date}: ${ADHERENCE_LABEL[d.level]}`}>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{d.weekday}</div>
            <div style={{ width: "100%", maxWidth: 32, aspectRatio: "1", borderRadius: 7, background: ADHERENCE_COLOR[d.level], border: d.level === "none" ? "1px solid var(--line)" : "none" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 9.5 }} className="mono">
        {["good", "partial", "off"].map((lvl) => (
          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--ink-dim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ADHERENCE_COLOR[lvl], display: "inline-block" }} />{ADHERENCE_LABEL[lvl]}
          </span>
        ))}
      </div>
    </div>
  );
}

function Nutrition({ profile, nutrition, onAdd, onAddMany, onDelete, onEdit, favorites, onToggleFavorite, isPremium, onUpgrade, usage, onUsageChange }) {
  const mealsRemaining = remainingMonthlyUses(FEATURES.MEALS, usage || {});
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [estimating, setEstimating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const backgroundRef = useRef(null);
  // React 18 doesn't recognize `inert` as a boolean HTML attribute (that's new in React 19), so
  // passing it as a JSX prop silently renders nothing — set the DOM property directly instead,
  // which every modern browser reflects to the real attribute regardless of React's version.
  useEffect(() => {
    if (backgroundRef.current) backgroundRef.current.inert = scannerOpen;
  }, [scannerOpen]);
  const [locationInput, setLocationInput] = useState("");
  const [mealTiming, setMealTiming] = useState("post");
  const [findingMeals, setFindingMeals] = useState(false);
  const [mealResults, setMealResults] = useState(null);
  const [mealError, setMealError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const targets = getNutritionTargets(profile);
  const today = nutrition.filter((n) => n.date === todayStr());
  const yesterday = nutrition.filter((n) => n.date === yesterdayStr());
  const totals = today.reduce((a, f) => ({
    calories: a.calories + f.calories, protein: a.protein + f.protein,
    carbs: a.carbs + f.carbs, fat: a.fat + f.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Most recently logged distinct foods (excluding today's, since those are already listed below
  // and re-adding them from "Recent" would just be a confusing duplicate of what's on-screen).
  const recentFoods = [...nutrition]
    .filter((n) => n.date !== todayStr())
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .reduce((acc, f) => (acc.some((x) => x.name === f.name) ? acc : [...acc, f]), [])
    .slice(0, 8);

  const submit = () => {
    if (!form.name || !form.calories) return;
    onAdd({
      id: uid(), date: todayStr(), name: form.name,
      calories: +form.calories || 0, protein: +form.protein || 0,
      carbs: +form.carbs || 0, fat: +form.fat || 0,
    });
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  };

  const copyYesterday = () => {
    onAddMany(yesterday.map((f) => ({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })));
  };

  const duplicateFood = (f) => {
    onAdd({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  };

  const startEdit = (f) => {
    setEditingId(f.id);
    setEditForm({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  };

  const saveEdit = () => {
    if (!editForm.name || editForm.calories === "") return;
    onEdit(editingId, {
      name: editForm.name, calories: +editForm.calories || 0,
      protein: +editForm.protein || 0, carbs: +editForm.carbs || 0, fat: +editForm.fat || 0,
    });
    setEditingId(null);
    setEditForm(null);
  };

  const estimate = async () => {
    if (!form.name) return;
    setEstimating(true);
    try {
      const prompt = `Estimate calories and macros for this food/meal description: "${form.name}". Return ONLY valid JSON, no markdown fences: {"calories":number,"protein":number,"carbs":number,"fat":number}`;
      const text = await callClaude([{ role: "user", content: prompt }], 200);
      const parsed = extractJSON(text);
      setForm((f) => ({ ...f, calories: parsed.calories, protein: parsed.protein, carbs: parsed.carbs, fat: parsed.fat }));
    } catch (e) { /* silent fail, user can enter manually */ }
    setEstimating(false);
  };

  const findNearbyMeals = async (locationText) => {
    setFindingMeals(true);
    setMealError(null);
    setMealResults(null);
    try {
      const g = mealMacroGuidance(profile.goal, mealTiming);
      const timingNote = mealTiming === "pre" ? "a pre-workout meal, eaten 1-3 hours before training" : "a post-workout meal to support recovery";
      const now = new Date();
      const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
      const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const hour = now.getHours();
      const dayPart = hour < 11 ? "morning (breakfast)" : hour < 15 ? "midday (lunch)" : hour < 21 ? "evening (dinner)" : "late night (light/snack)";
      const system = `You are a nutrition search assistant. Perform exactly ONE web search, then immediately respond — do not search again or refine your query. You must respond with ONLY a single valid JSON object — no preamble, no markdown fences, no explanation of your search, no citations. Just the JSON object and nothing else, even though you have access to web search to inform your answer.`;
      const prompt = `Find 4 real food places near "${locationText}" that are OPEN RIGHT NOW and still serving food. Asc3end is a fitness app — someone using this feature is specifically trying to hit a training-goal macro target, not just find the nearest thing that's open, so the result list must not default to fast food out of convenience. Hard rule: at most 1 of the 4 places may be a fast-food chain (McDonald's, KFC, Subway, etc.) — the other 3+ must be genuinely different options: a casual/local restaurant, a cafe, a poke/salad/grain-bowl place, a grocery store or deli with prepared food, or similar. If fewer than 4 non-fast-food places are realistically open right now near that location, it is fine to include more than 1 fast-food option, but only as a last resort — actively search for and prefer the healthier, non-fast-food options first. Do not include any place that would be closed at this time, and do not suggest a menu item that isn't actually served at this hour.

It is currently ${dayName}, ${timeLabel} (${dayPart}) at that location. The item you pick for each place MUST match what's actually served at this time of day — e.g. do not suggest a breakfast-only item if it's the afternoon or evening, and don't suggest a heavy dinner item if it's the middle of the day, unless that place genuinely serves it all day.

This is for ${timingNote}. Person's goal: ${GOAL_LABELS[profile.goal]} (${g.rationale}). For each place, name ONE specific menu item that roughly fits: ${g.calories[0]}-${g.calories[1]} kcal, ${g.protein[0]}-${g.protein[1]}g protein, ${g.carbs[0]}-${g.carbs[1]}g carbs, ${g.fat[0]}-${g.fat[1]}g fat (your best real estimate, doesn't need to hit the range exactly).
Also give your best real-world price estimate for that item in local currency, and the local currency symbol (e.g. "$", "£", "€").
Estimate each place's approximate straight-line distance in km from "${locationText}".
Write one short sentence (max 2) per place stating the macros and why it fits their goal, in your own words — never quote menus or reviews.
Respond with ONLY this JSON, nothing else:
{"places":[{"name":"","cuisine":"","distanceKm":0.0,"item":"","price":0.0,"currency":"$","calories":0,"protein":0,"carbs":0,"fat":0,"note":""}]}`;
      const text = await callClaude(
        [{ role: "user", content: prompt }],
        1800,
        // max_uses caps this at one search round instead of Claude iterating with several —
        // multi-round searches were pushing real requests past 30+ seconds.
        [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
        system,
        "meals"
      );
      const parsed = extractJSON(text);
      if (!Array.isArray(parsed.places) || parsed.places.length === 0) throw new Error("No places came back — try a more specific location.");
      const places = parsed.places.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
      const bestIdx = scoreBestMeal(places, g);
      setMealResults(places.map((p, i) => ({ ...p, isBestValue: i === bestIdx })));
    } catch (e) {
      setMealError(e.message && e.message !== "No JSON found in response" && e.message !== "Incomplete JSON in response"
        ? e.message
        : "Couldn't find nearby places just now — try a more specific location (suburb or city), or try again.");
    }
    onUsageChange?.();
    setFindingMeals(false);
  };

  const useDeviceLocation = () => {
    setMealError(null);
    if (!navigator.geolocation) {
      setMealError("Location isn't available on this device — type a suburb or city instead.");
      return;
    }
    setFindingMeals(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => findNearbyMeals(`latitude ${pos.coords.latitude}, longitude ${pos.coords.longitude}`),
      () => { setFindingMeals(false); setMealError("Location permission denied — type a suburb or city instead."); }
    );
  };

  return (
    <div style={{ padding: "24px 18px" }}>
      <h1 className="disp" style={{ fontSize: 26, marginBottom: 4 }}>Nutrition</h1>
      <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 12 }}>Daily target: {targets.calories} kcal · {targets.protein}g protein</div>

      <button className="atlas-btn" style={{ width: "100%", marginBottom: 16, padding: 13 }} onClick={() => setScannerOpen(true)}>
        <Camera size={16} style={{ verticalAlign: -3, marginRight: 7 }} /> Scan Food
      </button>
      {scannerOpen && (isPremium ? (
        <FoodScanner onAdd={onAdd} onClose={() => setScannerOpen(false)} />
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Paywall feature="scanner" onUpgrade={onUpgrade} />
          <button onClick={() => setScannerOpen(false)} className="mono" style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11 }}>Maybe later</button>
        </div>
      ))}

      {/* Hidden from assistive tech and keyboard focus while the scanner dialog is open, so
          screen readers and Tab navigation can't reach content buried behind it. */}
      <div ref={backgroundRef} aria-hidden={scannerOpen || undefined}>
      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-around", flexWrap: "wrap", gap: 10 }}>
          <MacroRing label="CALORIES" value={totals.calories} target={targets.calories} unit="" color="var(--brass)" />
          <MacroRing label="PROTEIN" value={totals.protein} target={targets.protein} unit="g" color="var(--steel)" />
          <MacroRing label="CARBS" value={totals.carbs} target={targets.carbs} unit="g" color="var(--good)" />
          <MacroRing label="FAT" value={totals.fat} target={targets.fat} unit="g" color="var(--warn)" />
        </div>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 14, marginBottom: 2 }}>7-Day Adherence</h2>
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 10 }}>How close you've landed to your targets each day.</div>
        <WeeklyAdherence nutrition={nutrition} targets={targets} />
      </div>

      {!isPremium && mealsRemaining <= 0 ? (
        <div style={{ marginBottom: 16 }}><Paywall feature="meals" onUpgrade={onUpgrade} /></div>
      ) : (
      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={15} color="var(--brass)" />
            <div className="disp" style={{ fontSize: 14 }}>Meals Near You</div>
          </div>
          {!isPremium && (
            <span className="mono" style={{ fontSize: 10, color: "var(--brass)" }}>{mealsRemaining} free left this month</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => setMealTiming("pre")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "pre" ? "var(--brass-soft)" : "transparent", color: mealTiming === "pre" ? "var(--brass)" : "var(--ink-dim)" }}>Pre-Workout</button>
          <button onClick={() => setMealTiming("post")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "post" ? "var(--brass-soft)" : "transparent", color: mealTiming === "post" ? "var(--brass)" : "var(--ink-dim)" }}>Post-Workout</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input className="atlas-input" placeholder="Suburb or city" value={locationInput} onChange={(e) => setLocationInput(e.target.value)} />
        </div>
        {/* Previously an icon-only button with no visible text — real feedback was that people
            didn't notice it was there at all. A clearly labeled button is unmistakable, and
            visually distinct from the "search by typed location" flow below it. */}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 8, fontSize: 12 }} onClick={useDeviceLocation} disabled={findingMeals}>
          <Navigation size={13} color="var(--brass)" style={{ verticalAlign: -2, marginRight: 6 }} />
          {findingMeals ? "Finding your location…" : "Use My Current Location"}
        </button>
        <button className="atlas-btn" style={{ width: "100%" }} onClick={() => locationInput && findNearbyMeals(locationInput)} disabled={findingMeals || !locationInput}>
          {findingMeals ? <Loader2 size={14} style={{ verticalAlign: -2, marginRight: 6, animation: "spin 1s linear infinite" }} /> : <Search size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
          {findingMeals ? "Searching…" : "Find Meals"}
        </button>
        {findingMeals && <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 6, textAlign: "center" }}>Searching the web for real nearby options — can take up to 15-20 seconds.</div>}
        {mealError && <div style={{ fontSize: 11, color: "var(--rest)", marginTop: 8 }}>{mealError}</div>}
        {mealResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-dim)", lineHeight: 1.5, background: "var(--bg-elev2)", borderRadius: 8, padding: "6px 8px" }}>
              AI-estimated from web search, not a live/verified feed — prices, hours and menu items can be out of date. Double-check before you go.
            </div>
            {mealResults.map((p, i) => (
              <div key={i} style={{ borderTop: p.isBestValue ? "1px solid var(--good)" : "1px solid var(--line)", paddingTop: 10, background: p.isBestValue ? "rgba(126,217,87,0.06)" : "transparent", borderRadius: p.isBestValue ? 8 : 0, padding: p.isBestValue ? "10px 8px 8px" : "10px 0 0" }}>
                {p.isBestValue && (
                  <span className="pill mono" style={{ background: "var(--good)", color: "#0F2E0A", marginBottom: 5, display: "inline-block" }}>★ BEST VALUE</span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {p.price != null && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--good)" }}>~{p.currency || "$"}{Number(p.price).toFixed(2)}</span>}
                    {p.distanceKm != null && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--brass)" }}>{p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</span>}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 1 }}>{p.cuisine}</div>
                <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 5 }}>{p.item}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{p.calories} kcal</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>P {p.protein}g</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>C {p.carbs}g</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>F {p.fat}g</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4, lineHeight: 1.4 }}>{p.note}</div>
                <button
                  className="atlas-btn-ghost"
                  style={{ marginTop: 6, padding: "5px 10px", fontSize: 10 }}
                  onClick={() => onAdd({ id: uid(), date: todayStr(), name: `${p.item} (${p.name})`, calories: p.calories || 0, protein: p.protein || 0, carbs: p.carbs || 0, fat: p.fat || 0 })}
                >
                  <Plus size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Log this meal
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Quick Add</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {QUICK_FOODS.map((f) => (
          <button key={f.name} onClick={() => onAdd({ id: uid(), date: todayStr(), ...f })}
            className="pill" style={{ background: "var(--bg-elev2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>
            + {f.name}
          </button>
        ))}
      </div>

      {favorites.length > 0 && (
        <>
          <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Favorites</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {favorites.map((f) => (
              <button key={f.name} onClick={() => onAdd({ id: uid(), date: todayStr(), ...f })}
                className="pill" style={{ background: "var(--brass-soft)", border: "1px solid var(--brass)", cursor: "pointer", color: "var(--brass)" }}>
                <Star size={10} style={{ verticalAlign: -1 }} /> {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {recentFoods.length > 0 && (
        <>
          <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Recent</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {recentFoods.map((f) => (
              <button key={f.id} onClick={() => onAdd({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })}
                className="pill" style={{ background: "var(--bg-elev2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>
                + {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {yesterday.length > 0 && (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 16 }} onClick={copyYesterday}>
          <Copy size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> Copy Yesterday's Log ({yesterday.length} item{yesterday.length === 1 ? "" : "s"})
        </button>
      )}

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Log Custom Food</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input className="atlas-input" placeholder="e.g. chicken rice bowl" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-label="Food description" />
          <button className="atlas-btn-ghost" style={{ padding: "8px 10px" }} onClick={estimate} disabled={estimating} aria-label="Estimate macros with AI" title="Estimate macros with AI">
            <Sparkles size={14} color="var(--brass)" />
          </button>
        </div>
        {estimating && <div style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 6 }}>Estimating macros…</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <input className="atlas-input" type="number" placeholder="kcal" value={form.calories} onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))} aria-label="Calories" />
          <input className="atlas-input" type="number" placeholder="protein" value={form.protein} onChange={(e) => setForm((f) => ({ ...f, protein: e.target.value }))} aria-label="Protein grams" />
          <input className="atlas-input" type="number" placeholder="carbs" value={form.carbs} onChange={(e) => setForm((f) => ({ ...f, carbs: e.target.value }))} aria-label="Carbs grams" />
          <input className="atlas-input" type="number" placeholder="fat" value={form.fat} onChange={(e) => setForm((f) => ({ ...f, fat: e.target.value }))} aria-label="Fat grams" />
        </div>
        <button className="atlas-btn" style={{ width: "100%", marginTop: 8 }} onClick={submit}>Add to Log</button>
      </div>

      <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Today</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {today.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Nothing logged yet today.</div>}
        {today.map((f) => {
          const isFav = favorites.some((fv) => fv.name === f.name);
          return (
          <div key={f.id} className="atlas-card" style={{ padding: 10 }}>
            {editingId === f.id ? (
              <div>
                <input className="atlas-input" style={{ marginBottom: 6 }} value={editForm.name} onChange={(e) => setEditForm((v) => ({ ...v, name: e.target.value }))} aria-label="Edit food name" />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input className="atlas-input" type="number" placeholder="kcal" value={editForm.calories} onChange={(e) => setEditForm((v) => ({ ...v, calories: e.target.value }))} aria-label="Edit calories" />
                  <input className="atlas-input" type="number" placeholder="protein" value={editForm.protein} onChange={(e) => setEditForm((v) => ({ ...v, protein: e.target.value }))} aria-label="Edit protein" />
                  <input className="atlas-input" type="number" placeholder="carbs" value={editForm.carbs} onChange={(e) => setEditForm((v) => ({ ...v, carbs: e.target.value }))} aria-label="Edit carbs" />
                  <input className="atlas-input" type="number" placeholder="fat" value={editForm.fat} onChange={(e) => setEditForm((v) => ({ ...v, fat: e.target.value }))} aria-label="Edit fat" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
                  <button className="atlas-btn" style={{ flex: 1 }} onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13 }}>{f.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{f.calories}kcal · P{f.protein} C{f.carbs} F{f.fat}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => onToggleFavorite(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={isFav ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`}>
                    <Star size={14} color={isFav ? "var(--brass)" : "var(--ink-dim)"} fill={isFav ? "var(--brass)" : "none"} />
                  </button>
                  <button onClick={() => duplicateFood(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Duplicate ${f.name}`}>
                    <Copy size={14} color="var(--ink-dim)" />
                  </button>
                  <button onClick={() => startEdit(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Edit ${f.name}`}>
                    <Pencil size={14} color="var(--ink-dim)" />
                  </button>
                  <button onClick={() => onDelete(f.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Delete ${f.name}`}>
                    <Trash2 size={14} color="var(--ink-dim)" />
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Loading shell                                                        */
/* ------------------------------------------------------------------ */

// Shown while the initial session check ("session") or the first load of profile/workouts/
// nutrition/etc. ("data") is in flight — replaces a bare unbranded spinner. Distinguishes the two
// stages since they fail differently in practice (a hung session check usually means Supabase
// Auth itself is unreachable; a hung data load means the user_data query is). After a while with
// no result either way, offers a Retry (full reload) rather than leaving someone staring at a
// spinner forever with no way out — loadKey() already catches its own errors and resolves to
// null rather than rejecting, so the realistic failure mode here isn't a thrown exception, it's a
// network call that never resolves at all (a dropped connection, an unreachable host).
function LoadingShell({ stage }) {
  const [showRetry, setShowRetry] = useState(false);
  useEffect(() => {
    const t = setTimeout(() => setShowRetry(true), 10000);
    return () => clearTimeout(t);
  }, []);
  return (
    <div className="atlas-root" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <GlobalStyle />
      <div style={{ width: 52, height: 52, borderRadius: 14, background: "linear-gradient(135deg, var(--brass), #2BAE73)", display: "flex", alignItems: "center", justifyContent: "center", marginBottom: 16, boxShadow: "0 6px 18px -6px rgba(62,207,142,0.5)" }}>
        <Dumbbell size={26} color="#072016" />
      </div>
      <div className="disp" style={{ fontSize: 18, marginBottom: 14 }}>Asc3end</div>
      <div role="status" aria-live="polite" style={{ display: "flex", alignItems: "center", gap: 8, color: "var(--ink-dim)", fontSize: 13 }}>
        <Loader2 size={16} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />
        <span>{stage === "session" ? "Checking your session…" : "Loading your data…"}</span>
      </div>
      {showRetry && (
        <div style={{ marginTop: 22, textAlign: "center" }}>
          <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 10 }}>This is taking longer than expected.</div>
          <button className="atlas-btn-ghost" onClick={() => window.location.reload()}>Retry</button>
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Not found — a /app/* URL that doesn't match any known route            */
/* ------------------------------------------------------------------ */

// A client-side SPA can't return a real HTTP 404 for a bad deep link — Vercel's rewrite has
// already served index.html by the time this ever runs (see vercel.json). This is the honest
// equivalent: a real "this page doesn't exist" screen instead of silently landing on Dashboard
// with a broken URL still in the address bar, plus a dynamic noindex so a search engine that
// somehow crawled a stale/bad link doesn't index this as real content.
function NotFoundScreen({ onGoHome }) {
  // index.html already ships a static <meta name="robots" content="index, follow">, so this
  // updates that existing tag in place rather than appending a second one — two conflicting
  // robots meta tags on the same page is undefined/unreliable behavior across crawlers, whereas
  // mutating the one that's there is unambiguous and cleanly reverts on unmount.
  useEffect(() => {
    const meta = document.querySelector('meta[name="robots"]');
    const original = meta?.content;
    if (meta) meta.content = "noindex";
    return () => { if (meta && original !== undefined) meta.content = original; };
  }, []);
  return (
    <div className="atlas-root" style={{ display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <GlobalStyle />
      <div className="atlas-card" style={{ width: "100%", maxWidth: 360, textAlign: "center", padding: 28 }}>
        <div className="disp" style={{ fontSize: 40, color: "var(--brass)", marginBottom: 8 }}>404</div>
        <div className="disp" style={{ fontSize: 17, marginBottom: 6 }}>Page not found</div>
        <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
          That link doesn't match anywhere in Asc3end — it may be out of date.
        </div>
        <button className="atlas-btn" style={{ width: "100%" }} onClick={onGoHome}>Go to Home</button>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Password reset                                                       */
/* ------------------------------------------------------------------ */

// Shown instead of the normal app when Supabase fires PASSWORD_RECOVERY (the user followed a
// reset-password email link). The temporary recovery session is only ever used to call
// updateUser({ password }) — never to read/show the rest of their account.
function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (!isValidPassword(password)) { setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  return (
    <div className="atlas-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div className="atlas-card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="disp" style={{ fontSize: 20, marginBottom: 4 }}>Set a new password</div>
        {done ? (
          <>
            <div className="mono" style={{ color: "var(--good)", fontSize: 12, background: "rgba(126,217,87,0.1)", border: "1px solid var(--good)", borderRadius: 8, padding: "10px 12px", marginTop: 12, lineHeight: 1.6 }}>
              Password updated. Continue into your account below.
            </div>
            <button onClick={onDone} className="atlas-btn" style={{ width: "100%", marginTop: 14 }}>Continue</button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NEW PASSWORD</div>
              <input className="atlas-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={MIN_PASSWORD_LENGTH} required autoFocus />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>CONFIRM NEW PASSWORD</div>
              <input className="atlas-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={MIN_PASSWORD_LENGTH} required />
            </div>
            {error && (
              <div className="mono" style={{ color: "var(--rest)", fontSize: 12, background: "rgba(255,92,122,0.1)", border: "1px solid var(--rest)", borderRadius: 8, padding: "8px 10px" }}>{error}</div>
            )}
            <button type="submit" className="atlas-btn" disabled={loading || !password || !confirm} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Checkout result                                                      */
/* ------------------------------------------------------------------ */

// Shown right after returning from Stripe Checkout — a dedicated success/cancellation
// acknowledgement instead of silently landing back on Home with a stray query param (the
// cancelled case was previously completely unhandled).
function CheckoutResultScreen({ result, subscriptionState, onContinue, onRetry }) {
  const activated = subscriptionState.type === "paid" || subscriptionState.type === "demo";
  return (
    <div className="atlas-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div className="atlas-card" style={{ width: "100%", maxWidth: 360, textAlign: "center", padding: 28 }}>
        {result === "success" ? (
          <>
            {activated ? (
              <>
                <Check size={28} color="var(--brass)" style={{ marginBottom: 10 }} />
                <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>You're in — Asc3end+ is active</div>
                <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>Unlimited Coach, the food scanner, and Meals Near You are unlocked.</div>
              </>
            ) : (
              <>
                <Loader2 size={24} color="var(--brass)" style={{ animation: "spin 1s linear infinite", marginBottom: 10 }} />
                <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>Activating your subscription…</div>
                <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>Payment succeeded — this can take a few seconds. If it's still not showing as active once you continue, check Profile &gt; Subscription or contact support.</div>
              </>
            )}
            <button className="atlas-btn" style={{ width: "100%" }} onClick={onContinue}>Continue to Asc3end</button>
          </>
        ) : (
          <>
            <X size={28} color="var(--ink-dim)" style={{ marginBottom: 10 }} />
            <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>Checkout cancelled</div>
            <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>No charge was made. You can try again whenever you're ready.</div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={onContinue}>Not now</button>
              <button className="atlas-btn" style={{ flex: 1 }} onClick={onRetry}>Try Again</button>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function AdminDashboard() {
  const [state, setState] = useState({ status: "loading" }); // loading | ok | error

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setState({ status: "error", message: "Sign in required." }); return; }
        const res = await fetch("/api/admin-metrics", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        if (!res.ok) { setState({ status: "error", message: data.error || "Request failed." }); return; }
        setState({ status: "ok", data });
      } catch (e) {
        setState({ status: "error", message: "Couldn't reach the server." });
      }
    })();
  }, []);

  const stat = (label, value) => (
    <div key={label} style={{ padding: "14px 12px", background: "var(--bg-elev2)", borderRadius: 10 }}>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginBottom: 6 }}>{label}</div>
      <div className="disp" style={{ fontSize: 20 }}>{value ?? "—"}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 60, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 className="disp" style={{ fontSize: 22, marginBottom: 18 }}>Admin Metrics</h1>
        {state.status === "loading" && <Loader2 size={20} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />}
        {state.status === "error" && <div className="atlas-card" style={{ padding: 18, color: "var(--rest)", fontSize: 13 }}>{state.message}</div>}
        {state.status === "ok" && (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 14 }}>Generated {new Date(state.data.generatedAt).toLocaleString()}</div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Users</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {stat("TOTAL USERS", state.data.users.total)}
                {stat("SIGNUPS (7d)", state.data.users.signupsLast7d)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Subscriptions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {stat("ACTIVE", state.data.subscriptions.active)}
                {stat("TRIALING", state.data.subscriptions.trialing)}
                {stat("PAST DUE", state.data.subscriptions.pastDue)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Engagement</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {stat("WORKOUTS COMPLETED (7d)", state.data.engagement.workoutsCompletedLast7d)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Feedback</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {stat("BUGS", state.data.feedback.bug)}
                {stat("FEATURES", state.data.feedback.feature)}
                {stat("RATINGS", state.data.feedback.rating)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App root                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  // undefined = auth state not checked yet, null = logged out, object = logged in.
  // Named authUser (not "session") to avoid colliding with the in-progress workout `session` state below.
  const [authUser, setAuthUser] = useState(undefined);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [nutrition, setNutrition] = useState([]);
  const [weightlog, setWeightlog] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [challenges, setChallenges] = useState([]);
  const [tab, setTab] = useState(() => {
    if (typeof window === "undefined") return "dashboard";
    return parseAppPath(window.location.pathname)?.tab || "dashboard";
  });
  const [session, setSession] = useState(null);
  const [finishingWorkout, setFinishingWorkout] = useState(false);
  const [completedWorkout, setCompletedWorkout] = useState(null);
  const [finishError, setFinishError] = useState(null);
  // A ref, not just the `finishingWorkout` state, guards finishWorkout against a genuine
  // double-click: two click events dispatched in the same tick both close over the same
  // pre-update `finishingWorkout` value (React only commits the state update — and thus the
  // button's `disabled` attribute — between event handler invocations, not necessarily before a
  // second synchronous click is processed). A ref updates immediately and outside any render
  // cycle, so the second call's read of it is guaranteed to see the first call's write.
  const finishingRef = useRef(false);
  // undefined = not checked yet, null = no row (never subscribed), object = { status, current_period_end }.
  // Never set directly from checkout success — only the Stripe webhook (server-side) is trusted
  // to write this, so a user can't just flip themselves to "active" from the browser.
  const [subscription, setSubscription] = useState(undefined);
  // Free-trial counters for Coach / Meals Near You ({ coach, meals }, each 0-5). Read-only from
  // here — the real count lives server-side in api/claude.js, this is just for display/local gating.
  const [usage, setUsage] = useState({ coach: 0, meals: 0 });
  // Surfaces a real error instead of silently doing nothing when checkout/billing-portal
  // creation fails (e.g. network hiccup, or — as with a hand-seeded account — no Stripe
  // customer on file yet).
  const [billingError, setBillingError] = useState(null);
  const [billingLoading, setBillingLoading] = useState(null); // null | "checkout" | "portal"
  const [showProfile, setShowProfile] = useState(() => {
    if (typeof window === "undefined") return false;
    return !!parseAppPath(window.location.pathname)?.settings;
  });
  // A /app/* URL that doesn't match any known route (a stale bookmark, a typo, a link to a
  // removed feature) previously fell through silently to the Dashboard — same content, but the
  // broken URL stayed in the address bar with no signal anything was wrong. `tab`/`showProfile`
  // above already default to a valid screen for exactly this reason (so a bad path can't leave
  // the app on a blank/crashed state), but that means detecting "this path was actually invalid"
  // has to happen separately, once, from the initial URL — not from `tab`, which is by then
  // already a valid fallback value.
  const [invalidPath, setInvalidPath] = useState(() => {
    if (typeof window === "undefined") return false;
    const path = window.location.pathname;
    return path.startsWith("/app/") && !parseAppPath(path);
  });
  const [showPricing, setShowPricing] = useState(false);
  const [showSupport, setShowSupport] = useState(false);
  const [showChallenges, setShowChallenges] = useState(false);
  // Seeds Train's exercise-picker muscle filter when the athlete taps "View Exercises" from a
  // muscle-readiness detail panel — a convenience, not a forced navigation: it never auto-starts
  // a workout on the athlete's behalf, it just has the filter ready once they do.
  const [trainMuscleFilter, setTrainMuscleFilter] = useState(null);
  const onViewExercises = (group) => { setTrainMuscleFilter(group); setTab("train"); };
  const [authView, setAuthView] = useState("landing"); // "landing" | "login" | "signup"
  const [publicLegalDoc, setPublicLegalDoc] = useState(null);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(null);
  // True while the user has followed a password-reset email link — Supabase signs them into a
  // temporary recovery session and fires the "PASSWORD_RECOVERY" auth event rather than a normal
  // sign-in. Must gate the whole app behind a "set your new password" screen instead of dropping
  // them straight into their account on that temporary session.
  const [passwordRecovery, setPasswordRecovery] = useState(false);
  const [checkoutResult, setCheckoutResult] = useState(null); // "success" | "cancelled" | null

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthUser(session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setAuthUser(session?.user ?? null);
      if (!session) setLoaded(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const [p, w, n, wl, sess, ce, fav, chal] = await Promise.all([
        loadKey(KEYS.profile), loadKey(KEYS.workouts), loadKey(KEYS.nutrition), loadKey(KEYS.weightlog), loadKey(KEYS.session), loadKey(KEYS.customExercises), loadKey(KEYS.favorites), loadKey(KEYS.challenges),
      ]);
      // Each array-shaped key is validated item-by-item before being trusted — a corrupted or
      // partially-written row (or a schema left over from an old app version) degrades to
      // "drop the bad items" instead of handing a malformed item into code downstream that
      // assumes every item has certain fields and crashing the whole app. (Verified live: an
      // exercise object missing `.name` crashed Train's search via `e.name.toLowerCase()`.)
      const workouts = sanitizeList(w, isValidWorkout);
      const nutrition = sanitizeList(n, isValidFoodEntry);
      const weightlog = sanitizeList(wl, isValidWeightEntry);
      const customExercises = sanitizeList(ce, isValidCustomExercise);
      const favorites = sanitizeList(fav, isValidFavorite);
      const challenges = sanitizeList(chal, isValidChallenge);
      if (p && typeof p === "object") setProfile(p);
      setWorkouts(workouts);
      setNutrition(nutrition);
      setWeightlog(weightlog);
      // Defense in depth against the stale-session bug: if a session was already saved into
      // history (its id shows up in `workouts`), it's a leftover from a completed workout that
      // never got cleared, not a real in-progress one — discard it and finish clearing the row.
      // isValidSession also rejects malformed/truncated session data (missing fields, wrong
      // types) so a corrupted row can't crash Train when it reads session.exercises/.startedAt.
      const validSess = isValidSession(sess) ? sess : null;
      const stale = validSess && isStaleSession(validSess, workouts);
      if (validSess && !stale) { setSession(validSess); setTab("train"); }
      else if (validSess && stale) { saveKey(KEYS.session, null); }
      else if (sess) { saveKey(KEYS.session, null); } // sess existed but failed validation — clear the corrupt row
      setCustomExercises(customExercises);
      setFavorites(favorites);
      setChallenges(challenges);
      setLoaded(true);
    })();
  }, [authUser]);

  const refreshSubscription = async () => {
    if (!authUser) return null;
    // cancel_at_period_end/plan are a newer migration (see README.md) — selecting a column that
    // doesn't exist yet fails the WHOLE query (data comes back null), which would otherwise read
    // as "free" for an actual paying/demo user until that SQL is run. Fall back to the original
    // column set on error so existing entitlements keep displaying correctly either way.
    let { data, error } = await supabase
      .from("subscriptions")
      .select("status, current_period_end, stripe_customer_id, cancel_at_period_end, plan")
      .eq("user_id", authUser.id)
      .maybeSingle();
    if (error) {
      ({ data } = await supabase
        .from("subscriptions")
        .select("status, current_period_end, stripe_customer_id")
        .eq("user_id", authUser.id)
        .maybeSingle());
    }
    setSubscription(data || null);
    return data || null;
  };

  const refreshUsage = async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return;
    try {
      const res = await fetch("/api/usage", { headers: { Authorization: `Bearer ${authSession.access_token}` } });
      if (res.ok) setUsage(await res.json());
    } catch (e) { /* leave last-known usage in place */ }
  };

  useEffect(() => {
    if (!authUser) { setSubscription(undefined); setUsage({ coach: 0, meals: 0 }); return; }
    refreshSubscription();
    refreshUsage();
  }, [authUser]);

  // Reads the ?checkout=success|cancelled Stripe redirect param exactly once, turns it into a
  // dedicated result screen (checkoutResult), and strips it from the URL either way — a cancelled
  // checkout was previously left completely unhandled (silently landed on Home with a stray query
  // param and no acknowledgement).
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    const checkout = params.get("checkout");
    if (checkout === "success" || checkout === "cancelled") {
      setCheckoutResult(checkout);
      window.history.replaceState(null, "", window.location.pathname);
      if (checkout === "cancelled") logEvent("checkout_failed", { reason: "cancelled" });
    }
  }, []);

  // Keeps the URL in sync with tab/showProfile/session so refreshing Train, Coach, Food, Progress,
  // or Settings returns to that screen instead of always landing on Home, and so the browser's own
  // back/forward buttons work. Only pushes a new history entry when the logical route actually
  // changes (comparing against the current pathname) — logging a set mutates `session` on every
  // rep without changing which route that maps to, so this doesn't spam the back button with dozens
  // of near-identical entries for one workout.
  useEffect(() => {
    // The invalidPath guard keeps the address bar showing the actual broken URL for as long as
    // NotFoundScreen is up, rather than this effect silently correcting it to /app/home in the
    // background while the visible screen still says "page not found" — the whole point of a
    // real not-found experience is that the URL and the message agree.
    if (!authUser || !profile || invalidPath) return;
    const path = buildAppPath({ tab, showProfile, hasActiveSession: !!session });
    if (window.location.pathname !== path) {
      window.history.pushState({ tab, showProfile }, "", path);
    }
  }, [tab, showProfile, session, authUser, profile]);

  // A definitively logged-out user (not just "still checking") sitting on a /app/* URL — from a
  // stale tab, a bookmark, or a shared link to a screen that requires an account — gets a clean
  // URL instead of a protected-looking path behind the public Landing page it actually renders.
  useEffect(() => {
    if (authUser === null && typeof window !== "undefined" && parseAppPath(window.location.pathname)) {
      window.history.replaceState(null, "", "/");
    }
  }, [authUser]);

  // Browser back/forward: read whatever path the browser just navigated to and mirror it into
  // state. Never calls pushState itself, so this can't create a push loop with the effect above —
  // by the time it runs, window.location.pathname already IS the target path, so that effect's
  // `!== path` check is already false and it does nothing further.
  useEffect(() => {
    function onPopState() {
      const parsed = parseAppPath(window.location.pathname);
      if (!parsed) return;
      setShowProfile(!!parsed.settings);
      if (parsed.tab) setTab(parsed.tab);
    }
    window.addEventListener("popstate", onPopState);
    return () => window.removeEventListener("popstate", onPopState);
  }, []);

  // After returning from a successful Checkout, the webhook that actually activates the
  // subscription may take a moment to land — poll briefly instead of showing stale "not premium"
  // state on the result screen.
  useEffect(() => {
    if (checkoutResult !== "success" || !authUser) return;
    let attempts = 0;
    let fired = false;
    const interval = setInterval(async () => {
      attempts++;
      const data = await refreshSubscription();
      if (!fired && data && (data.status === "active" || data.status === "trialing")) {
        fired = true;
        logEvent("subscription_activated", { status: data.status });
        clearInterval(interval);
      }
      if (attempts >= 6) clearInterval(interval); // ~12s of polling, then give up quietly
    }, 2000);
    return () => clearInterval(interval);
  }, [checkoutResult, authUser]);

  // The one authoritative entitlement computation — everything that used to check
  // `subscription.status === "active" || "trialing"` ad hoc now derives from this single object,
  // so free/demo/paid can't quietly drift apart or contradict each other across components.
  const subscriptionState = useMemo(() => computeSubscriptionState(subscription), [subscription]);
  const isPremium = isEntitled(subscriptionState);
  const isDemoEntitlement = subscriptionState.type === "demo";

  const startCheckout = async (planArg = "monthly", trial = false) => {
    // Defensive normalization, not just a default — several call sites do `onClick={onUpgrade}`,
    // which makes React pass the click SyntheticEvent as `planArg`. JSON.stringify-ing that event
    // (or its DOM target, via the click-handler bug this once shipped with) throws "Converting
    // circular structure to JSON" before the request is even sent, which the catch below then
    // mislabels as a network error. Coercing to a known plan string here means a future call site
    // making the same mistake fails safe (starts a monthly checkout) instead of failing silently.
    const plan = planArg === "annual" ? "annual" : "monthly";
    setBillingError(null);
    setBillingLoading("checkout");
    logEvent("checkout_started", { plan, trial });
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      if (!authSession) {
        setBillingError("Your session has expired — please sign out and back in, then try again.");
        setBillingLoading(null);
        return;
      }
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
        body: JSON.stringify({ plan, trial }),
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      logEvent("checkout_failed", { reason: "server_error" });
      setBillingError(data.error || "Couldn't start checkout — try again.");
    } catch (e) {
      logEvent("checkout_failed", { reason: "network_error" });
      setBillingError("Couldn't reach the server — check your connection and try again.");
    }
    setBillingLoading(null);
  };

  const openBillingPortal = async () => {
    setBillingError(null);
    setBillingLoading("portal");
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      setBillingError(data.error || "Couldn't open billing management — try again.");
    } catch (e) {
      setBillingError("Couldn't reach the server — check your connection and try again.");
    }
    setBillingLoading(null);
  };

  const logOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setWorkouts([]);
    setNutrition([]);
    setWeightlog([]);
    setCustomExercises([]);
    setFavorites([]);
    setSession(null);
    setSubscription(undefined);
    setTab("dashboard");
  };

  // Auto-save the in-progress session on every change so a page reload mid-workout never loses logged sets.
  useEffect(() => {
    if (!loaded) return;
    if (session) saveKey(KEYS.session, session);
    else saveKey(KEYS.session, null);
  }, [session, loaded]);

  const completeOnboarding = async (form) => {
    // No `targets` snapshot stored here — getNutritionTargets(profile) derives it fresh from
    // these same fields everywhere it's needed, so there's nothing to compute or cache at
    // onboarding time (and nothing that can later drift out of sync with the live profile).
    const newProfile = { ...form };
    setProfile(newProfile);
    await saveKey(KEYS.profile, newProfile);
    const wl = [{ date: todayStr(), weight: form.weightKg }];
    setWeightlog(wl);
    await saveKey(KEYS.weightlog, wl);
    logEvent("onboarding_completed", { goal: form.goal, experience: form.experience, trainingDays: form.trainingDays });
  };

  // Idempotent by construction: once `session` is cleared, a second call (e.g. a double-click
  // on Finish before the first click's state update commits) is a no-op instead of a duplicate
  // history entry. If the save itself fails, the active session is left untouched — nothing is
  // lost, and the caller gets a retryable error instead of a silently-dropped workout.
  const finishWorkout = async (s, sessionPRs = []) => {
    if (finishingRef.current || !session) return null;
    finishingRef.current = true;
    setFinishingWorkout(true);
    setFinishError(null);
    // Computed once, here, and stored on the workout itself — this exact object is what both the
    // finish-summary screen and any later workout-history detail view read, so they can never show
    // two different numbers for the same workout the way the old "recompute an aggregate formula
    // from scratch each time" design did (a real, reported bug: summary said +55 XP, the account
    // total actually went up by 65, because the total secretly included a streak bonus the summary
    // omitted).
    const streakBefore = computeStreak(workouts);
    const streakAfter = computeStreak([...workouts, s]);
    const xpBreakdown = computeWorkoutXp(s, { prCount: sessionPRs.length, streakDelta: streakAfter - streakBefore });
    const completed = { ...s, completedAt: new Date().toISOString(), xpBreakdown, prs: sessionPRs };
    const next = [...workouts, completed];
    const savedWorkout = await saveKey(KEYS.workouts, next);
    if (!savedWorkout) {
      setFinishError("Couldn't save your workout — check your connection and try again. Nothing was lost.");
      finishingRef.current = false;
      setFinishingWorkout(false);
      return null;
    }
    setWorkouts(next);
    if (profile?.activePlan && s.plannedDayIndex != null && s.plannedDayIndex === profile.activePlan.currentDayIndex) {
      const nextIndex = (profile.activePlan.currentDayIndex + 1) % profile.activePlan.days.length;
      const updatedProfile = { ...profile, activePlan: { ...profile.activePlan, currentDayIndex: nextIndex } };
      if (await saveKey(KEYS.profile, updatedProfile)) setProfile(updatedProfile);
    }
    setSession(null);
    await saveKey(KEYS.session, null);
    finishingRef.current = false;
    setFinishingWorkout(false);
    setTab("dashboard");
    setCompletedWorkout({ ...completed, streakBefore, streakAfter });
    logEvent("workout_completed", {
      exerciseCount: completed.exercises.length,
      setCount: completed.exercises.reduce((n, e) => n + e.sets.length, 0),
      planned: completed.plannedDayIndex != null,
    });
    return completed;
  };

  const discardWorkout = async () => {
    setSession(null);
    await saveKey(KEYS.session, null);
    setTab("dashboard");
  };

  // Editing/deleting a past (already-finished) workout — used by the workout-history detail view.
  // Both follow the same save-then-setState order as every other mutation in this file (addFood,
  // editFood, finishWorkout): the write is confirmed to have actually landed before local state
  // changes, so a failed save leaves the UI showing the last known-good data instead of a value
  // that silently never made it to storage. Progress, streaks, muscle recovery, and PR detection
  // are all derived from `workouts` via useMemo/pure functions elsewhere (muscleRecovery,
  // Progress.jsx's charts, evaluatePR) — they recompute automatically from whatever `workouts`
  // becomes, with no separate cache to keep in sync.
  const editWorkout = async (id, patch) => {
    const next = workouts.map((w) => (w.id === id ? { ...w, ...patch } : w));
    const ok = await saveKey(KEYS.workouts, next);
    if (ok) setWorkouts(next);
    return ok;
  };

  const deleteWorkout = async (id) => {
    const next = workouts.filter((w) => w.id !== id);
    const ok = await saveKey(KEYS.workouts, next);
    if (ok) setWorkouts(next);
    return ok;
  };

  // Centralizes both "start today's scheduled workout" (Home/Train, when an active plan exists)
  // and "start an empty workout" (freeform) so both paths share one idempotency guard — starting
  // never clobbers an already-active session.
  const startWorkout = (plannedDayIndex) => {
    if (session) { setTab("train"); return; }
    const plan = profile?.activePlan;
    const day = plannedDayIndex != null && plan?.days ? plan.days[plannedDayIndex] : null;
    const exercises = day
      ? day.muscleGroups.flatMap((mg) => mg.exercises.map((e) => ({
          name: e.name, sets: [], supersetWith: null, targetSets: e.sets, targetReps: e.reps,
        })))
      : [];
    setSession({
      id: uid(), date: todayStr(), startedAt: Date.now(), restEndAt: null, exercises,
      planDayName: day?.day || null, plannedDayIndex: plannedDayIndex ?? null,
    });
    setTab("train");
    logEvent("workout_started", { planned: plannedDayIndex != null });
  };

  const addFood = async (f) => {
    const next = [...nutrition, f];
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
    logEvent("food_logged", { count: 1 });
  };
  // Adds several entries as one state update — copyYesterday calling addFood in a loop would have
  // each call close over the same stale `nutrition`, so every add but the last would be lost.
  const addFoods = async (items) => {
    const next = [...nutrition, ...items];
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
    logEvent("food_logged", { count: items.length });
  };
  const deleteFood = async (id) => {
    const next = nutrition.filter((f) => f.id !== id);
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
  };
  const editFood = async (id, patch) => {
    const next = nutrition.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
  };
  const toggleFavorite = async (food) => {
    const exists = favorites.some((f) => f.name === food.name);
    const next = exists ? favorites.filter((f) => f.name !== food.name) : [...favorites, { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat }];
    setFavorites(next);
    await saveKey(KEYS.favorites, next);
  };

  // A template can only have one unfinished instance active at a time — enforced in the
  // Challenges UI by hiding "Start" once one exists, not here, so this stays a plain append.
  const startChallenge = async (templateId) => {
    const next = [...challenges, { id: uid(), templateId, startDate: todayStr() }];
    const ok = await saveKey(KEYS.challenges, next);
    if (ok) setChallenges(next);
    return ok;
  };

  const removeChallenge = async (id) => {
    const next = challenges.filter((c) => c.id !== id);
    const ok = await saveKey(KEYS.challenges, next);
    if (ok) setChallenges(next);
    return ok;
  };
  const logWeight = async (weight) => {
    const next = [...weightlog, { date: todayStr(), weight }];
    setWeightlog(next);
    await saveKey(KEYS.weightlog, next);
  };

  const addCustomExercise = async (ex) => {
    const next = [...customExercises, ex];
    setCustomExercises(next);
    await saveKey(KEYS.customExercises, next);
    return ex;
  };

  // Archives (never hard-deletes) a custom exercise — a past workout can still reference it by
  // name, so removing the record outright would break history exactly the way this expansion was
  // required not to. Archiving just hides it from the picker going forward; toggle again to
  // restore, matching "editable and archivable" rather than a one-way delete.
  const archiveCustomExercise = async (name, archived = true) => {
    const next = customExercises.map((ex) => (ex.name === name ? { ...ex, archived } : ex));
    setCustomExercises(next);
    await saveKey(KEYS.customExercises, next);
  };

  const updateProfile = async (patch) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    await saveKey(KEYS.profile, next);
  };

  const deleteAccount = async () => {
    setDeleteAccountLoading(true);
    setDeleteAccountError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteAccountError(data.error || "Couldn't delete your account — try again.");
        setDeleteAccountLoading(false);
        return;
      }
      await supabase.auth.signOut();
      setShowProfile(false);
      setProfile(null);
      setWorkouts([]);
      setNutrition([]);
      setWeightlog([]);
      setCustomExercises([]);
      setFavorites([]);
      setSession(null);
      setSubscription(undefined);
      setTab("dashboard");
    } catch (e) {
      setDeleteAccountError("Couldn't reach the server — check your connection and try again.");
    }
    setDeleteAccountLoading(false);
  };

  if (passwordRecovery) {
    return (
      <>
        <GlobalStyle />
        <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
      </>
    );
  }

  if (authUser === undefined || (authUser && !loaded)) {
    return <LoadingShell stage={authUser === undefined ? "session" : "data"} />;
  }

  if (!authUser) {
    if (publicLegalDoc) {
      return <LegalPage docKey={publicLegalDoc} onClose={() => setPublicLegalDoc(null)} />;
    }
    if (authView === "landing") {
      return (
        <Landing
          onStartFree={() => setAuthView("signup")}
          onLogIn={() => setAuthView("login")}
          onOpenLegal={setPublicLegalDoc}
        />
      );
    }
    return (
      <>
        <GlobalStyle />
        <AuthScreen initialMode={authView} onBack={() => setAuthView("landing")} />
      </>
    );
  }

  if (typeof window !== "undefined" && window.location.search.includes("admin=1")) {
    return (
      <>
        <GlobalStyle />
        <AdminDashboard />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <GlobalStyle />
        <Onboarding onComplete={completeOnboarding} />
      </>
    );
  }

  if (invalidPath) {
    return (
      <>
        <GlobalStyle />
        <NotFoundScreen
          onGoHome={() => {
            setInvalidPath(false);
            setTab("dashboard");
            setShowProfile(false);
            window.history.replaceState(null, "", "/app/home");
          }}
        />
      </>
    );
  }

  if (checkoutResult) {
    return (
      <>
        <GlobalStyle />
        <CheckoutResultScreen
          result={checkoutResult}
          subscriptionState={subscriptionState}
          onContinue={() => setCheckoutResult(null)}
          onRetry={() => { setCheckoutResult(null); startCheckout(); }}
        />
      </>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "train", label: "Train", icon: Dumbbell },
    { id: "coach", label: "Coach", icon: MessageCircle },
    { id: "nutrition", label: "Food", icon: UtensilsCrossed },
    { id: "progress", label: "Progress", icon: TrendingUp },
  ];

  return (
    <div className="atlas-root">
      <GlobalStyle />
      {completedWorkout ? (
        <WorkoutCompleteScreen
          workout={completedWorkout}
          streakBefore={completedWorkout.streakBefore}
          streakAfter={completedWorkout.streakAfter}
          athleteDisplayName={profile?.name || ""}
          onDone={() => setCompletedWorkout(null)}
        />
      ) : showChallenges ? (
        <ChallengesScreen
          workouts={workouts} nutrition={nutrition} profile={profile} streak={computeStreak(workouts)}
          challenges={challenges} onStartChallenge={startChallenge} onRemoveChallenge={removeChallenge}
          onClose={() => setShowChallenges(false)}
        />
      ) : showSupport ? (
        <SupportPage onClose={() => setShowSupport(false)} />
      ) : showPricing ? (
        <PricingPage
          subscriptionState={subscriptionState} isPremium={isPremium}
          onConfirmUpgrade={(plan, trial) => { setShowPricing(false); startCheckout(plan, trial); }}
          billingLoading={billingLoading} billingError={billingError}
          onClose={() => setShowPricing(false)}
        />
      ) : showProfile ? (
        <Profile
          profile={profile} authUser={authUser} workouts={workouts} nutrition={nutrition} weightlog={weightlog} customExercises={customExercises}
          isPremium={isPremium} isDemoEntitlement={isDemoEntitlement} subscriptionState={subscriptionState} onUpdateProfile={updateProfile} onManageBilling={openBillingPortal} onUpgrade={() => setShowPricing(true)}
          billingLoading={billingLoading} billingError={billingError} onLogOut={logOut}
          onDeleteAccount={deleteAccount} deleteAccountLoading={deleteAccountLoading} deleteAccountError={deleteAccountError}
          onClose={() => setShowProfile(false)} usage={usage} onOpenSupport={() => setShowSupport(true)}
        />
      ) : (
        <>
          {tab === "dashboard" && <Dashboard profile={profile} workouts={workouts} nutrition={nutrition} weightlog={weightlog} customExercises={customExercises} onNav={setTab} onLogWeight={logWeight} onLogOut={logOut} isPremium={isPremium} isDemoEntitlement={isDemoEntitlement} subscriptionState={subscriptionState} onUpgrade={() => setShowPricing(true)} onManageBilling={openBillingPortal} billingError={billingError} billingLoading={billingLoading} session={session} onStartWorkout={startWorkout} onOpenProfile={() => setShowProfile(true)} onOpenChallenges={() => setShowChallenges(true)} onViewExercises={onViewExercises} />}
          {tab === "train" && <Train profile={profile} workouts={workouts} session={session} setSession={setSession} onFinish={finishWorkout} onDiscard={discardWorkout} onStartWorkout={startWorkout} finishingWorkout={finishingWorkout} finishError={finishError} customExercises={customExercises} onAddCustomExercise={addCustomExercise} onArchiveCustomExercise={archiveCustomExercise} onEditWorkout={editWorkout} onDeleteWorkout={deleteWorkout} initialMuscleFilter={trainMuscleFilter} />}
          {tab === "coach" && <Coach profile={profile} workouts={workouts} onUpdateProfile={updateProfile} isPremium={isPremium} onUpgrade={() => setShowPricing(true)} usage={usage} onUsageChange={refreshUsage} />}
          {tab === "nutrition" && <Nutrition profile={profile} nutrition={nutrition} onAdd={addFood} onAddMany={addFoods} onDelete={deleteFood} onEdit={editFood} favorites={favorites} onToggleFavorite={toggleFavorite} isPremium={isPremium} onUpgrade={() => setShowPricing(true)} usage={usage} onUsageChange={refreshUsage} />}
          {tab === "progress" && (
            <Suspense fallback={<div style={{ padding: "24px 18px", display: "flex", justifyContent: "center" }}><Loader2 size={20} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} /></div>}>
              <Progress profile={profile} workouts={workouts} weightlog={weightlog} customExercises={customExercises} nutrition={nutrition} />
            </Suspense>
          )}

          <nav className="atlas-nav">
            {navItems.map((n) => (
              <button key={n.id} className={`atlas-nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
                <n.icon size={19} />
                {n.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
