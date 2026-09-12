import React, { useState } from "react";
import { Dumbbell, MessageCircle, UtensilsCrossed, TrendingUp, Camera, Check, ChevronDown, ChevronUp, Sparkles } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import { MONTHLY_PRICE, ANNUAL_PRICE, ANNUAL_SAVINGS_PCT, FEATURE_COMPARISON, FEATURE_COMPARISON_FOOTNOTE, PRICING_FAQ } from "./lib/pricingContent";
import { FREE_MONTHLY_LIMIT } from "./lib/entitlements";

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

      {/* Demo / preview */}
      <Section style={{ paddingTop: 0 }}>
        <div className="atlas-card" style={{ padding: 24, textAlign: "center" }}>
          <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10, marginBottom: 4 }}>
            {[
              { label: "TODAY'S FUEL", value: "1,840 / 2,880 kcal" },
              { label: "STREAK", value: "12 days" },
              { label: "NEXT TARGET", value: "Bench 82.5kg × 5" },
            ].map((s) => (
              <div key={s.label} style={{ padding: "14px 8px", background: "var(--bg-elev2)", borderRadius: 10 }}>
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginBottom: 6 }}>{s.label}</div>
                <div className="disp" style={{ fontSize: 13 }}>{s.value}</div>
              </div>
            ))}
          </div>
          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 12 }}>
            A real snapshot of the Home dashboard — your streak, macros, and next lift target in one place.
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
