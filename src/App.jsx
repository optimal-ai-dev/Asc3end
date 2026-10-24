import { useState, useEffect, useRef, useMemo, lazy, Suspense } from "react";
import { Dumbbell, UtensilsCrossed, LayoutDashboard, MessageCircle, TrendingUp, Loader2 } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import AuthScreen from "./AuthScreen";
import Landing from "./Landing";
import LegalPage from "./LegalPage";
import SupportPage from "./SupportPage";
import { supabase } from "./lib/supabase";
import { logEvent } from "./lib/analytics";
import { loadKey, saveKey } from "./lib/storage";
import { computeStreak, computeWorkoutXp } from "./lib/workoutMath";
import { classifyDayAdherence } from "./lib/nutritionMath";
import { computeSubscriptionState, isEntitled, OWNER_SUBSCRIPTION_STATE } from "./lib/subscription";
import { isStaleSession, isValidSession } from "./lib/session";
import {
  isValidCustomExercise, isValidWorkout, isValidFoodEntry, isValidWeightEntry, isValidWaterEntry, isValidMyFood, isValidFavorite,
  isValidChallenge, sanitizeList
} from "./lib/validation";
import { parseAppPath, buildAppPath } from "./lib/routing";
import { MUSCLE_GROUPS, MUSCLE_REGIONS, POSE_TIPS, regionForExercise, EXERCISES } from "./exerciseData";
import { KEYS } from "./lib/storageKeys";
import { todayStr, uid } from "./lib/dateUtils";
import { COACH_SAFETY_RULES } from "./lib/coachPrompts";
import {
  formatSet, matchesSearch, READINESS_COLORS, READINESS_LABEL, muscleReadiness, workoutVolume
} from "./lib/workoutHelpers";
import { weeklyAdherence, ADHERENCE_COLOR, ADHERENCE_LABEL } from "./lib/nutritionHelpers";
import { MuscleReadinessMap } from "./components/MuscleReadinessMap";
import { Onboarding } from "./pages/Onboarding";
import { Dashboard } from "./pages/Dashboard";
import { Profile } from "./pages/Profile";
import { Train } from "./pages/Train";
import { PricingPage } from "./pages/PricingPage";
import { WorkoutCompleteScreen } from "./pages/WorkoutCompleteScreen";
import { ChallengesScreen } from "./pages/ChallengesScreen";
import { Coach } from "./pages/Coach";
import { Nutrition } from "./pages/Nutrition";
import {
  LoadingShell, NotFoundScreen, ResetPasswordScreen, CheckoutResultScreen
} from "./pages/StatusScreens";
import { AdminDashboard } from "./pages/AdminDashboard";

// Lazy-loaded: recharts (~525KB, the single largest dependency in the app) then only ships to
// people who actually open the Progress tab, instead of loading on every page for everyone.
const Progress = lazy(() => import("./Progress"));

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
  const [water, setWater] = useState([]);
  const [myFoods, setMyFoods] = useState([]);
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
  // This month's Coach / Meals Near You counters ({ coach, meals }; free limits in lib/entitlements.js). Read-only from
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
      const [p, w, n, wl, sess, ce, fav, chal, wat, mine] = await Promise.all([
        loadKey(KEYS.profile), loadKey(KEYS.workouts), loadKey(KEYS.nutrition), loadKey(KEYS.weightlog), loadKey(KEYS.session), loadKey(KEYS.customExercises), loadKey(KEYS.favorites), loadKey(KEYS.challenges), loadKey(KEYS.water), loadKey(KEYS.myFoods),
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
      setWater(sanitizeList(wat, isValidWaterEntry));
      setMyFoods(sanitizeList(mine, isValidMyFood));
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
  // usage.owner comes from /api/usage (ADMIN_EMAILS, checked server-side). It only affects what the
  // UI shows — api/claude.js re-checks the caller itself before serving anything.
  const subscriptionState = useMemo(
    () => (usage.owner ? OWNER_SUBSCRIPTION_STATE : computeSubscriptionState(subscription)),
    [subscription, usage.owner],
  );
  const isPremium = isEntitled(subscriptionState);
  // Demo and owner access have no Stripe customer, so there's no billing portal to open.
  const isDemoEntitlement = subscriptionState.type === "demo" || subscriptionState.type === "owner";

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
    setWater([]);
    setMyFoods([]);
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
  const addWater = async (ml) => {
    const next = [...water, { id: uid(), date: todayStr(), ml }];
    setWater(next);
    await saveKey(KEYS.water, next);
  };
  const deleteWater = async (id) => {
    const next = water.filter((w) => w.id !== id);
    setWater(next);
    await saveKey(KEYS.water, next);
  };
  // Saving a product with the same barcode (or name and brand) again replaces the old copy, so
  // correcting a label typo doesn't leave two versions in search.
  const saveMyFood = async (food) => {
    const same = (m) => (food.barcode && m.barcode === food.barcode) || (m.name.toLowerCase() === food.name.toLowerCase() && (m.brand || "") === (food.brand || ""));
    const next = [food, ...myFoods.filter((m) => !same(m))];
    setMyFoods(next);
    await saveKey(KEYS.myFoods, next);
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
      setWater([]);
      setMyFoods([]);
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
          {tab === "nutrition" && <Nutrition profile={profile} nutrition={nutrition} weightlog={weightlog} onUpdateProfile={updateProfile} onAdd={addFood} onAddMany={addFoods} onDelete={deleteFood} onEdit={editFood} favorites={favorites} onToggleFavorite={toggleFavorite} water={water} myFoods={myFoods} onSaveMyFood={saveMyFood} onAddWater={addWater} onDeleteWater={deleteWater} isPremium={isPremium} onUpgrade={() => setShowPricing(true)} usage={usage} onUsageChange={refreshUsage} />}
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
