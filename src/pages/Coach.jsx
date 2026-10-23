import { lazy, Suspense, useState, useRef, useEffect } from "react";
import { X, Pencil, Loader2, Sparkles, Trash2, Plus, Send, AlertTriangle } from "lucide-react";
import { logEvent } from "../lib/analytics";
import { loadKey, saveKey } from "../lib/storage";
import { getNutritionTargets } from "../lib/nutritionMath";
import { remainingMonthlyUses, FEATURES } from "../lib/entitlements";
import { isValidChatMessage } from "../lib/validation";
import { EQUIPMENT_COLORS, POSE_TIPS, EXERCISES } from "../exerciseData";
import { KEYS } from "../lib/storageKeys";
import { callClaude, extractJSON } from "../lib/claudeClient";
import {
  PLAN_PROMPT_VOCABULARY, COACHING_STYLES, TRAINING_PRINCIPLES, COACH_SAFETY_RULES,
  buildCoachSystem, toCoachApiMessages
} from "../lib/coachPrompts";
import { lookupExercise, GOAL_LABELS, matchesSearch } from "../lib/workoutHelpers";
import { ExerciseThumb } from "../components/ExerciseFigure";
import { ProgramRoadmap } from "../components/ProgramRoadmap";
import { Paywall } from "../components/Paywall";

// Lazy-loaded: react-markdown (and its remark/micromark dependencies) only ships to people who
// actually open the Coach tab, instead of adding to the bundle everyone downloads on first load.
const ReactMarkdown = lazy(() => import("react-markdown"));

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
                  <span style={{ fontSize: 12.5, color: "var(--ink)", fontWeight: matched ? 600 : 400 }}>{ex.name}</span>
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

export function Coach({ profile, workouts, onUpdateProfile, isPremium, onUpgrade, usage, onUsageChange }) {
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
      // Same getNutritionTargets() every other screen uses — so if the Coach ever references "your
      // target," it's the identical number Home/Food/Settings show, not a separately-derived one.
      const targets = getNutritionTargets(profile);
      // profile.name was previously missing from this prompt entirely — Claude had no actual
      // name to address the athlete by (only the client-side synthetic greeting bubble did, and
      // that's stripped before sending), so it would invent a literal "[Name]" placeholder.
      // The athlete-specific part goes after the shared, cached instructions — see buildCoachSystem.
      const system = buildCoachSystem(profile.coachingStyle, `Athlete profile: name=${profile.name || "there"}, goal=${GOAL_LABELS[profile.goal]}, experience=${profile.experience}, weight=${profile.weightKg}kg. Daily nutrition target (${targets.source}): ${targets.calories} kcal, ${targets.protein}g protein, ${targets.carbs}g carbs, ${targets.fat}g fat. Recent workouts: ${recent || "none logged"}.`);
      // Strip the synthetic greeting (index 0) — it was never a real API turn, and including it
      // alongside a fake priming pair broke the API's requirement that roles strictly alternate
      // starting with "user", which is why the coach silently failed on every message before.
      // The server keeps only the most recent part of a long chat (lib/anthropicRequest.js).
      const apiMessages = toCoachApiMessages(newMessages);
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
        <h1 className="disp-title" style={{ fontSize: 26, marginBottom: 16 }}>Coach</h1>
        <Paywall feature="coach" onUpgrade={onUpgrade} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", height: "calc(100vh - 88px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <h1 className="disp-title" style={{ fontSize: 26 }}>Coach</h1>
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
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--ink)", marginBottom: 6 }}>{d.day}</div>
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
            <div style={{ fontSize: 12, color: "var(--rest)" }}><AlertTriangle size={12} style={{ verticalAlign: -1, marginRight: 4 }} aria-hidden="true" />{planError}</div>
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
