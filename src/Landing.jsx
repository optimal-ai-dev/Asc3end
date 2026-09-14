import React, { useState, useRef, useId } from "react";
import { Dumbbell, MessageCircle, UtensilsCrossed, TrendingUp, Camera, Check, ChevronDown, ChevronUp, ChevronLeft, ChevronRight, Sparkles, Flame, Trophy, Send } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import { MONTHLY_PRICE, ANNUAL_PRICE, ANNUAL_SAVINGS_PCT, FEATURE_COMPARISON, FEATURE_COMPARISON_FOOTNOTE, PRICING_FAQ } from "./lib/pricingContent";
import { FREE_MONTHLY_LIMIT } from "./lib/entitlements";

// Deliberately NOT imported from App.jsx: that file (and everything it pulls in — Supabase
// client init, the full exercise library, Stripe-adjacent billing code) would otherwise get
// bundled into the public, unauthenticated Landing page's initial load. A visitor deciding
// whether to sign up shouldn't have to download the entire authenticated app first — Landing.jsx
// stays a small, independently-loadable bundle, even at the cost of a little duplicated (trivial,
// static, decorative-only) mockup data below rather than real shared logic.

/* Six illustrative previews for the "See Asc3end in action" carousel — built from the app's own
   design tokens/components (atlas-card, .pill, .bar-track, the disp/mono type scale), not
   screenshots. Numbers are realistic but explicitly fictional demonstration data, never pulled
   from a real account. */
const PREVIEW_MUSCLE_DOTS = { shoulders: [50, 20], chest: [50, 38], arms: [80, 40], back: [20, 40], core: [50, 56], legs: [50, 82] };
const PREVIEW_RECOVERY = { chest: "ready", back: "partial", shoulders: "rest", arms: "ready", legs: "partial", core: "ready" };
const RECOVERY_DOT_COLOR = { ready: "var(--good)", partial: "var(--warn)", rest: "var(--rest)" };

function PreviewPhoneFrame({ children, label }) {
  return (
    <div
      style={{
        background: "var(--bg-elev)", border: "1px solid var(--line)", borderRadius: 22,
        padding: 16, height: 340, display: "flex", flexDirection: "column",
        boxShadow: "var(--shadow-elevated)",
      }}
      aria-label={label}
    >
      {children}
    </div>
  );
}

function PreviewHome() {
  return (
    <PreviewPhoneFrame label="Home dashboard preview">
      <div className="mono" style={{ fontSize: 9, color: "var(--brass)", letterSpacing: 1, marginBottom: 2 }}>SATURDAY</div>
      <div className="disp" style={{ fontSize: 16, marginBottom: 10 }}>Welcome back, Alex</div>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 1fr", gap: 8, marginBottom: 10 }}>
        <div style={{ background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: 10 }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--ink-dim)" }}>STREAK</div>
          <div className="disp" style={{ fontSize: 15, display: "flex", alignItems: "center", gap: 4 }}><Flame size={12} color="var(--warn)" />12 days</div>
        </div>
        <div style={{ background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: 10 }}>
          <div className="mono" style={{ fontSize: 8, color: "var(--ink-dim)" }}>NEXT LIFT</div>
          <div className="disp" style={{ fontSize: 15 }}>82.5kg × 6</div>
        </div>
      </div>
      <div style={{ background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: 10, marginBottom: 8 }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 10, marginBottom: 4 }}>
          <span className="mono" style={{ color: "var(--ink-dim)" }}>CALORIES</span>
          <span className="mono">1,840 / 2,880</span>
        </div>
        <div className="bar-track"><div className="bar-fill" style={{ width: "64%", background: "var(--brass)" }} /></div>
      </div>
      <div style={{ flex: 1, background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: 10 }}>
        <div className="mono" style={{ fontSize: 8, color: "var(--ink-dim)", marginBottom: 4 }}>TODAY'S WORKOUT</div>
        <div className="disp" style={{ fontSize: 12 }}>Day 2: Pull</div>
      </div>
    </PreviewPhoneFrame>
  );
}

function PreviewWorkout() {
  return (
    <PreviewPhoneFrame label="Today's workout preview">
      <div className="disp" style={{ fontSize: 14, marginBottom: 2 }}>Day 2: Pull</div>
      <div className="mono" style={{ fontSize: 9, color: "var(--steel)", marginBottom: 10 }}>⏱ 18:42 elapsed</div>
      {[
        { name: "Deadlift (Barbell)", sets: "3 × 72.5kg × 6", done: true },
        { name: "Lat Pulldown", sets: "3 × 37.5kg × 11", done: true },
        { name: "Barbell Row", sets: "set 2 of 3", done: false },
      ].map((ex) => (
        <div key={ex.name} style={{ display: "flex", alignItems: "center", gap: 8, padding: "8px 0", borderTop: "1px solid var(--line)" }}>
          <div style={{ width: 16, height: 16, borderRadius: 4, border: `1.5px solid ${ex.done ? "var(--brass)" : "var(--line)"}`, background: ex.done ? "var(--brass)" : "transparent", flexShrink: 0, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {ex.done && <Check size={11} color="#072016" />}
          </div>
          <div style={{ flex: 1, minWidth: 0 }}>
            <div style={{ fontSize: 11.5, whiteSpace: "nowrap", overflow: "hidden", textOverflow: "ellipsis" }}>{ex.name}</div>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-dim)" }}>{ex.sets}</div>
          </div>
        </div>
      ))}
      <div style={{ marginTop: "auto", background: "var(--brass-soft)", border: "1px solid var(--brass)", borderRadius: "var(--radius-sm)", padding: 8, textAlign: "center" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--brass)" }}>Rest 1:24</span>
      </div>
    </PreviewPhoneFrame>
  );
}

function PreviewProgression() {
  return (
    <PreviewPhoneFrame label="AI progression recommendation preview">
      <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Bench Press — Next Target</div>
      <div style={{ background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: 12, marginBottom: 8 }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginBottom: 2 }}>LAST SESSION</div>
        <div className="disp" style={{ fontSize: 16 }}>80kg × 8</div>
        <div className="mono" style={{ fontSize: 9.5, color: "var(--good)", marginTop: 2 }}>✓ Rep target hit</div>
      </div>
      <div style={{ textAlign: "center", color: "var(--ink-dim)", fontSize: 11, marginBottom: 8 }}>↓ Asc3end analysis</div>
      <div style={{ background: "var(--brass-soft)", border: "1px solid var(--brass)", borderRadius: "var(--radius-sm)", padding: 12 }}>
        <div className="mono" style={{ fontSize: 9, color: "var(--brass)", marginBottom: 2 }}>NEXT SESSION</div>
        <div className="disp" style={{ fontSize: 18, color: "var(--brass)" }}>82.5kg × 6-8</div>
      </div>
      <div style={{ marginTop: "auto", fontSize: 10.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
        Every rep hit at the top of your range — time to add weight.
      </div>
    </PreviewPhoneFrame>
  );
}

function PreviewRecovery() {
  return (
    <PreviewPhoneFrame label="Muscle recovery map preview">
      <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Muscle Recovery</div>
      <svg viewBox="0 0 100 100" style={{ width: "100%", maxWidth: 150, margin: "0 auto", flex: 1 }}>
        <ellipse cx="50" cy="10" rx="7" ry="7" fill="var(--bg-elev2)" stroke="var(--ink-dim)" strokeWidth="1" />
        <rect x="42" y="18" width="16" height="66" rx="8" fill="var(--bg-elev2)" stroke="var(--ink-dim)" strokeWidth="1" />
        {Object.entries(PREVIEW_MUSCLE_DOTS).map(([m, [x, y]]) => (
          <circle key={m} cx={x} cy={y} r="7" fill={RECOVERY_DOT_COLOR[PREVIEW_RECOVERY[m]]} opacity="0.9" />
        ))}
      </svg>
      <div style={{ display: "flex", gap: 10, justifyContent: "center", fontSize: 9 }} className="mono">
        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--good)", display: "inline-block" }} />Ready</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--warn)", display: "inline-block" }} />Partial</span>
        <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 7, height: 7, borderRadius: 4, background: "var(--rest)", display: "inline-block" }} />Resting</span>
      </div>
    </PreviewPhoneFrame>
  );
}

function PreviewNutrition() {
  return (
    <PreviewPhoneFrame label="Nutrition tracking and food scanner preview">
      <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Today's Fuel</div>
      {[
        { label: "CALORIES", val: 1840, target: 2880, color: "var(--brass)" },
        { label: "PROTEIN", val: 128, target: 180, color: "var(--steel)" },
        { label: "CARBS", val: 190, target: 320, color: "var(--good)" },
        { label: "FAT", val: 48, target: 75, color: "var(--warn)" },
      ].map((m) => (
        <div key={m.label} style={{ marginBottom: 8 }}>
          <div style={{ display: "flex", justifyContent: "space-between", fontSize: 9.5 }}>
            <span className="mono" style={{ color: "var(--ink-dim)" }}>{m.label}</span>
            <span className="mono">{m.val} / {m.target}</span>
          </div>
          <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (m.val / m.target) * 100)}%`, background: m.color }} /></div>
        </div>
      ))}
      <div style={{ marginTop: "auto", background: "var(--brass)", borderRadius: "var(--radius-sm)", padding: 9, textAlign: "center", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}>
        <Camera size={13} color="#072016" />
        <span className="disp" style={{ fontSize: 11, color: "#072016" }}>Scan Food</span>
      </div>
    </PreviewPhoneFrame>
  );
}

function PreviewCoach() {
  return (
    <PreviewPhoneFrame label="Strength progress and AI Coach preview">
      <div className="disp" style={{ fontSize: 13, marginBottom: 8 }}>Squat — 3 Months</div>
      <svg viewBox="0 0 100 30" style={{ width: "100%", height: 40, marginBottom: 10 }} preserveAspectRatio="none">
        <polyline points="0,26 20,22 40,20 60,14 80,10 100,4" fill="none" stroke="var(--brass)" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round" />
      </svg>
      <div className="chat-bubble-ai" style={{ fontSize: 10.5, lineHeight: 1.4, padding: "8px 10px", maxWidth: "100%" }}>
        Your squat is up 12.5kg over 3 months and every session hit target reps — that's real, steady progress, not just noise.
      </div>
      <div style={{ marginTop: "auto", display: "flex", gap: 6, alignItems: "center", background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: "8px 10px" }}>
        <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", flex: 1 }}>Ask your coach…</span>
        <Send size={13} color="var(--brass)" />
      </div>
    </PreviewPhoneFrame>
  );
}

const PREVIEW_SLIDES = [
  { id: "home", title: "Home dashboard", caption: "Everything that matters, in one place.", render: PreviewHome },
  { id: "workout", title: "Today's workout", caption: "Track your workout without slowing it down.", render: PreviewWorkout },
  { id: "progression", title: "AI progression recommendation", caption: "Know exactly what weight to use next.", render: PreviewProgression },
  { id: "recovery", title: "Muscle recovery map", caption: "See which muscles are ready to train.", render: PreviewRecovery },
  { id: "nutrition", title: "Nutrition tracking", caption: "Log food in seconds.", render: PreviewNutrition },
  { id: "coach", title: "Strength progress and AI Coach", caption: "Understand whether you are actually progressing.", render: PreviewCoach },
];

/* Swipeable, keyboard-accessible preview carousel. No autoplay (and therefore nothing that needs
   pausing off-screen — there's no running animation to begin with, only user-triggered
   transitions). Reduced motion is handled by the existing global
   `@media (prefers-reduced-motion: reduce)` rule in GlobalStyle, which already zeroes out every
   transition/animation app-wide, this one included, so no separate handling was needed here.
   Slides are lightweight styled markup (no images), so there's no real asset weight to lazy-load —
   noted honestly rather than adding a defer mechanism that would guard against a cost that isn't
   actually being paid. */
function PreviewCarousel() {
  const [index, setIndex] = useState(0);
  const touchStartX = useRef(null);
  const headingId = useId();
  const count = PREVIEW_SLIDES.length;
  const go = (i) => setIndex(((i % count) + count) % count);

  const onKeyDown = (e) => {
    if (e.key === "ArrowRight") { go(index + 1); e.preventDefault(); }
    if (e.key === "ArrowLeft") { go(index - 1); e.preventDefault(); }
  };
  const onTouchStart = (e) => { touchStartX.current = e.touches[0].clientX; };
  const onTouchEnd = (e) => {
    if (touchStartX.current == null) return;
    const dx = e.changedTouches[0].clientX - touchStartX.current;
    if (Math.abs(dx) > 40) go(index + (dx < 0 ? 1 : -1));
    touchStartX.current = null;
  };

  const Slide = PREVIEW_SLIDES[index].render;

  return (
    <div role="region" aria-roledescription="carousel" aria-label="See Asc3end in action" tabIndex={0} onKeyDown={onKeyDown} style={{ outline: "none" }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 10 }}>
        <button
          onClick={() => go(index - 1)}
          aria-label="Previous preview"
          className="atlas-btn-ghost"
          style={{ padding: 0, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <ChevronLeft size={18} />
        </button>

        <div
          onTouchStart={onTouchStart}
          onTouchEnd={onTouchEnd}
          style={{ flex: 1, maxWidth: 300 }}
          aria-live="polite"
        >
          <Slide />
        </div>

        <button
          onClick={() => go(index + 1)}
          aria-label="Next preview"
          className="atlas-btn-ghost"
          style={{ padding: 0, width: 44, height: 44, borderRadius: "50%", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
        >
          <ChevronRight size={18} />
        </button>
      </div>

      <div id={headingId} className="disp" style={{ fontSize: 14, textAlign: "center", marginTop: 16 }}>{PREVIEW_SLIDES[index].title}</div>
      <div style={{ textAlign: "center", color: "var(--ink-dim)", fontSize: 12.5, marginTop: 4, padding: "0 20px" }}>{PREVIEW_SLIDES[index].caption}</div>

      <div role="tablist" aria-label="Choose a preview" style={{ display: "flex", gap: 8, justifyContent: "center", marginTop: 16 }}>
        {PREVIEW_SLIDES.map((s, i) => (
          <button
            key={s.id}
            role="tab"
            aria-selected={i === index}
            aria-label={`Show ${s.title} preview`}
            onClick={() => go(i)}
            style={{
              width: 44, height: 44, background: "none", border: "none", cursor: "pointer",
              display: "flex", alignItems: "center", justifyContent: "center",
            }}
          >
            <span style={{ width: i === index ? 18 : 7, height: 7, borderRadius: 4, background: i === index ? "var(--brass)" : "var(--line)", display: "block", transition: "width 0.15s ease" }} />
          </button>
        ))}
      </div>
    </div>
  );
}

// The public marketing page shown to anyone who isn't signed in yet — App.jsx renders this
// instead of AuthScreen until the visitor picks "Log In" or "Start Free", at which point
// AuthScreen takes over (it's a separate screen, not merged into this one, so the sign-up form
// itself stays exactly as already built/tested in Phase 2).

const PROBLEMS = [
  { title: "Scattered tools", body: "A notes app for workouts, a different app for macros, and no coach in either one — nothing talks to the others." },
  { title: "Generic programs", body: "Template plans that don't adapt to your actual history, recovery, or what you told it you're training for." },
  { title: "Logging is a chore", body: "If tracking a meal takes two minutes, you stop tracking meals. Most food trackers weren't built for that." },
];

const HOW_IT_WORKS = [
  { step: "1", title: "Tell it your goal", body: "Muscle, strength, fat loss, or general fitness — plus your experience and training days." },
  { step: "2", title: "Train with a plan that adapts", body: "The AI Coach builds and adjusts your program from what you actually log, not a fixed template." },
  { step: "3", title: "Track food in seconds", body: "Manual entry, quick-add favorites, or snap a photo — macros estimated automatically." },
  { step: "4", title: "See it add up", body: "Streaks, PRs, muscle recovery status, and progress charts, all from the same log." },
];

const FEATURES = [
  { icon: Dumbbell, title: "Workout Logging", body: "Sets, reps, and weight with PR detection and next-target suggestions built in." },
  { icon: MessageCircle, title: "AI Coach", body: "A chat coach that knows your training history and goal, not a generic chatbot." },
  { icon: UtensilsCrossed, title: "Nutrition Tracking", body: "Manual entry, quick-add favorites, and AI macro estimates from a description." },
  { icon: Camera, title: "Food Scanner", body: "Photograph a meal or scan a barcode instead of typing it in by hand." },
  { icon: TrendingUp, title: "Progress & Recovery", body: "Strength charts, streaks, and a per-muscle-group recovery estimate." },
];

function Section({ children, style }) {
  return <section style={{ padding: "56px 20px", maxWidth: 640, margin: "0 auto", ...style }}>{children}</section>;
}

export default function Landing({ onStartFree, onLogIn, onOpenLegal }) {
  const [openFaq, setOpenFaq] = useState(null);

  return (
    <div className="atlas-root landing-wide">
      <GlobalStyle />

      {/* Header */}
      <header style={{ position: "sticky", top: 0, zIndex: 10, background: "var(--bg)", borderBottom: "1px solid var(--line)", padding: "14px 20px", display: "flex", alignItems: "center", justifyContent: "space-between" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
          <div style={{ width: 30, height: 30, borderRadius: 8, background: "linear-gradient(135deg, var(--brass), #2BAE73)", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Dumbbell size={16} color="#072016" />
          </div>
          <span className="disp" style={{ fontSize: 16 }}>Asc3end</span>
        </div>
        <button onClick={onLogIn} className="atlas-btn-ghost" style={{ padding: "7px 14px", fontSize: 12 }}>Log In</button>
      </header>

      {/* Hero */}
      <Section style={{ textAlign: "center", paddingTop: 64, paddingBottom: 40 }}>
        <div className="disp" style={{ fontSize: 34, lineHeight: 1.15, marginBottom: 14 }}>
          Train, eat, and progress — with an AI coach that actually knows your history.
        </div>
        <div style={{ color: "var(--ink-dim)", fontSize: 15, lineHeight: 1.6, marginBottom: 28 }}>
          Asc3end replaces the notes app, the spreadsheet, and the generic meal tracker with one
          place that adapts to what you log.
        </div>
        <div style={{ display: "flex", gap: 10, justifyContent: "center", flexWrap: "wrap" }}>
          <button onClick={onStartFree} className="atlas-btn" style={{ padding: "12px 24px", fontSize: 14 }}>Start Free</button>
          <button onClick={onLogIn} className="atlas-btn-ghost" style={{ padding: "12px 24px", fontSize: 14 }}>Log In</button>
        </div>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 14 }}>
          Free to start — no card required. Asc3end+ unlocks unlimited AI features from AUD ${MONTHLY_PRICE}/mo.
        </div>
      </Section>

      {/* Demo / preview carousel */}
      <Section style={{ paddingTop: 0 }}>
        <div className="disp" style={{ fontSize: 18, textAlign: "center", marginBottom: 20 }}>See Asc3end in action</div>
        <PreviewCarousel />
      </Section>

      {/* Adaptive progression demo */}
      <Section>
        <div className="atlas-card" style={{ padding: 22 }}>
          <div className="disp" style={{ fontSize: 15, marginBottom: 4 }}>Your coach adjusts every session</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.5, marginBottom: 16 }}>
            Hit your rep target and Asc3end recommends the next step up. Miss it and it holds or backs
            off — no spreadsheet math, no guessing.
          </div>
          <div style={{ display: "flex", alignItems: "center", gap: 10, flexWrap: "wrap" }}>
            <div style={{ flex: "1 1 140px", background: "var(--bg-elev2)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginBottom: 2 }}>LAST SESSION</div>
              <div className="disp" style={{ fontSize: 16 }}>80kg × 8</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--good)", marginTop: 2 }}>✓ target hit</div>
            </div>
            <div style={{ color: "var(--ink-dim)", fontSize: 16, flexShrink: 0 }} aria-hidden="true">→</div>
            <div style={{ flex: "1 1 140px", background: "var(--brass-soft)", border: "1px solid var(--brass)", borderRadius: "var(--radius-sm)", padding: "12px 14px" }}>
              <div className="mono" style={{ fontSize: 9, color: "var(--brass)", marginBottom: 2 }}>NEXT SESSION</div>
              <div className="disp" style={{ fontSize: 16, color: "var(--brass)" }}>82.5kg × 6-8</div>
            </div>
          </div>
        </div>
      </Section>

      {/* Problem */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 28 }}>Sound familiar?</div>
        <div style={{ display: "grid", gap: 14 }}>
          {PROBLEMS.map((p) => (
            <div key={p.title} className="atlas-card" style={{ padding: 18 }}>
              <div className="disp" style={{ fontSize: 14, marginBottom: 6 }}>{p.title}</div>
              <div style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.5 }}>{p.body}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* How it works */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 28 }}>How it works</div>
        <div style={{ display: "grid", gap: 18 }}>
          {HOW_IT_WORKS.map((s) => (
            <div key={s.step} style={{ display: "flex", gap: 14 }}>
              <div className="disp" style={{ fontSize: 20, color: "var(--brass)", width: 28, flexShrink: 0 }}>{s.step}</div>
              <div>
                <div className="disp" style={{ fontSize: 14, marginBottom: 4 }}>{s.title}</div>
                <div style={{ color: "var(--ink-dim)", fontSize: 13, lineHeight: 1.5 }}>{s.body}</div>
              </div>
            </div>
          ))}
        </div>
      </Section>

      {/* Features */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 28 }}>Everything in one place</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          {FEATURES.map((f) => (
            <div key={f.title} className="atlas-card" style={{ padding: 18 }}>
              <f.icon size={20} color="var(--brass)" style={{ marginBottom: 10 }} />
              <div className="disp" style={{ fontSize: 14, marginBottom: 6 }}>{f.title}</div>
              <div style={{ color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.5 }}>{f.body}</div>
            </div>
          ))}
        </div>
      </Section>

      {/* Differentiation */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 28 }}>Not just another tracker</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(240px, 1fr))", gap: 14 }}>
          <div className="atlas-card" style={{ padding: 20 }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 12 }}>ORDINARY TRACKER</div>
            {[
              "You log a number. It gets stored.",
              "You decide what weight to lift next.",
              "Meals are a static database lookup.",
              "Progress is a chart you interpret yourself.",
            ].map((line) => (
              <div key={line} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 8 }}>
                <span aria-hidden="true">–</span><span>{line}</span>
              </div>
            ))}
          </div>
          <div className="atlas-card" style={{ padding: 20, border: "1px solid var(--brass)", background: "var(--brass-soft)" }}>
            <div className="mono" style={{ fontSize: 10, color: "var(--brass)", marginBottom: 12 }}>ASC3END</div>
            {[
              "You log a number. Asc3end tells you what it means.",
              "Your coach recommends the next weight from your actual history.",
              "Meals Near You is ranked by your goals, not just distance.",
              "Progress comes with a plain-language read on whether it's real.",
            ].map((line) => (
              <div key={line} style={{ display: "flex", gap: 8, fontSize: 12.5, color: "var(--ink)", lineHeight: 1.6, marginBottom: 8 }}>
                <Check size={14} color="var(--brass)" style={{ flexShrink: 0, marginTop: 1 }} /><span>{line}</span>
              </div>
            ))}
          </div>
        </div>
      </Section>

      {/* Pricing preview */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 6 }}>Simple pricing</div>
        <div style={{ color: "var(--ink-dim)", fontSize: 13, textAlign: "center", marginBottom: 28 }}>Start free. Upgrade when the limits actually get in your way.</div>
        <div style={{ display: "grid", gridTemplateColumns: "repeat(auto-fit, minmax(220px, 1fr))", gap: 14, marginBottom: 20 }}>
          <div className="atlas-card" style={{ padding: 22 }}>
            <div className="disp" style={{ fontSize: 15, marginBottom: 4 }}>Free</div>
            <div className="disp" style={{ fontSize: 28, marginBottom: 12 }}>$0</div>
            <div style={{ color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.7 }}>
              Unlimited workout logging<br />Unlimited nutrition tracking<br />Progress & strength analytics<br />{FREE_MONTHLY_LIMIT} AI Coach chats & meal searches per month
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 10 }}>No card required. Never expires.</div>
          </div>
          <div className="atlas-card" style={{ padding: 22, border: "1px solid var(--brass)", background: "var(--brass-soft)" }}>
            <div className="disp" style={{ fontSize: 15, marginBottom: 4 }}>Asc3end+</div>
            <div className="disp" style={{ fontSize: 28, marginBottom: 4 }}>AUD ${MONTHLY_PRICE}<span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>/mo</span></div>
            <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 12 }}>or AUD ${ANNUAL_PRICE}/yr — save {ANNUAL_SAVINGS_PCT}%</div>
            <div style={{ color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.7 }}>
              Everything in Free<br />Unlimited* AI Coach<br />Unlimited* Meals Near You<br />Food scanner (photo/barcode)
            </div>
          </div>
        </div>
        <div className="atlas-card" style={{ padding: 18 }}>
          <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, marginBottom: 6 }}>
            <span />
            <span className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", textAlign: "center" }}>FREE</span>
            <span className="mono" style={{ fontSize: 9, color: "var(--brass)", textAlign: "center" }}>ASC3END+</span>
          </div>
          {FEATURE_COMPARISON.map((r) => (
            <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, alignItems: "center", padding: "6px 0", borderTop: "1px solid var(--line)" }}>
              <span style={{ fontSize: 12, textAlign: "left" }}>{r.label}</span>
              <span style={{ textAlign: "center" }}>
                {r.free === true ? <Check size={13} color="var(--good)" /> : r.free === false ? <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>—</span> : <span className="mono" style={{ fontSize: 10 }}>{r.free}</span>}
              </span>
              <span style={{ textAlign: "center" }}>
                {r.premium === true ? <Check size={13} color="var(--good)" /> : <span className="mono" style={{ fontSize: 10 }}>{r.premium}</span>}
              </span>
            </div>
          ))}
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8 }}>{FEATURE_COMPARISON_FOOTNOTE}</div>
        </div>
      </Section>

      {/* FAQ */}
      <Section>
        <div className="disp" style={{ fontSize: 22, textAlign: "center", marginBottom: 20 }}>Questions</div>
        <div className="atlas-card" style={{ padding: 4 }}>
          {PRICING_FAQ.map((item, i) => (
            <div key={item.q} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <button
                onClick={() => setOpenFaq(openFaq === i ? null : i)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "14px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.q}</span>
                {openFaq === i ? <ChevronUp size={14} color="var(--ink-dim)" /> : <ChevronDown size={14} color="var(--ink-dim)" />}
              </button>
              {openFaq === i && <div style={{ padding: "0 14px 16px", color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.6 }}>{item.a}</div>}
            </div>
          ))}
        </div>
      </Section>

      {/* Final CTA */}
      <Section style={{ textAlign: "center" }}>
        <div className="atlas-card" style={{ padding: 32 }}>
          <Sparkles size={24} color="var(--brass)" style={{ marginBottom: 10 }} />
          <div className="disp" style={{ fontSize: 19, marginBottom: 8 }}>Ready to start climbing?</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20 }}>Free to start. No card required.</div>
          <button onClick={onStartFree} className="atlas-btn" style={{ padding: "12px 28px", fontSize: 14 }}>Start Free</button>
        </div>
      </Section>

      {/* Footer */}
      <footer style={{ padding: "32px 20px 48px", textAlign: "center", borderTop: "1px solid var(--line)" }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 10 }}>Asc3end</div>
        <div style={{ display: "flex", gap: 14, justifyContent: "center", flexWrap: "wrap", fontSize: 11.5 }}>
          {[
            ["privacy", "Privacy"], ["terms", "Terms"], ["disclaimer", "Health Disclaimer"],
            ["aiLimitations", "AI Limitations"], ["subscriptionTerms", "Subscription Terms"],
            ["refundPolicy", "Refund Policy"], ["support", "Support"], ["contact", "Contact"],
          ].map(([key, label]) => (
            <button key={key} onClick={() => onOpenLegal(key)} style={{ background: "none", border: "none", padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11.5 }}>{label}</button>
          ))}
        </div>
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 14 }}>© {new Date().getFullYear()} Asc3end. All rights reserved.</div>
      </footer>
    </div>
  );
}
