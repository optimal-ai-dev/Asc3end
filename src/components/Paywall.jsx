import { useState, useEffect } from "react";
import { Check, X, Sparkles, ChevronUp, ChevronDown } from "lucide-react";
import { logEvent } from "../lib/analytics";
import { FEATURE_COMPARISON, FEATURE_COMPARISON_FOOTNOTE, MONTHLY_PRICE } from "../lib/pricingContent";

/* Shared upsell shown in place of a gated feature — Coach entirely, or an inline slot inside
   Nutrition for the scanner / Meals Near You. Subscription status is only ever set by the
   Stripe webhook, so this button just starts Checkout; it never grants access itself. */
export function FeatureComparisonTable() {
  const cell = (v) => v === true ? <Check size={13} color="var(--good)" /> : v === false ? <X size={13} color="var(--ink-dim)" /> : <span className="mono" style={{ fontSize: 10 }}>{v}</span>;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, marginBottom: 6 }}>
        <span />
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", textAlign: "center" }}>FREE</span>
        <span className="mono" style={{ fontSize: 9, color: "var(--brass)", textAlign: "center" }}>PREMIUM</span>
      </div>
      {FEATURE_COMPARISON.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, alignItems: "center", padding: "5px 0", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 11.5, textAlign: "left" }}>{r.label}</span>
          <span style={{ textAlign: "center" }}>{cell(r.free)}</span>
          <span style={{ textAlign: "center" }}>{cell(r.premium)}</span>
        </div>
      ))}
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8 }}>{FEATURE_COMPARISON_FOOTNOTE}</div>
    </div>
  );
}

export function Paywall({ feature, onUpgrade }) {
  const [showComparison, setShowComparison] = useState(false);
  useEffect(() => { logEvent("paywall_viewed", { feature }); }, [feature]);
  const COPY = {
    coach: { title: "AI Coach is Premium", blurb: "Personalized training plans, a chat coach that knows your history, and real-time form feedback." },
    scanner: { title: "Food Scanner is Premium", blurb: "Snap a photo or scan a barcode to log food in seconds instead of typing it in by hand." },
    meals: { title: "Meals Near You is Premium", blurb: "Real nearby restaurant suggestions tuned to your macros and training goal." },
  };
  const c = COPY[feature] || { title: "This feature is Premium", blurb: "" };
  return (
    <div className="atlas-card" style={{ textAlign: "center", padding: 28 }}>
      <Sparkles size={26} color="var(--brass)" style={{ marginBottom: 10 }} />
      <div className="disp" style={{ fontSize: 17, marginBottom: 6 }}>{c.title}</div>
      <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{c.blurb}</div>
      <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onUpgrade()}>See Plans — from AUD ${MONTHLY_PRICE.toFixed(2)}/mo</button>
      <button onClick={() => setShowComparison((v) => !v)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", marginTop: 12 }}>
        {showComparison ? "Hide" : "See"} full Free vs Premium comparison {showComparison ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />}
      </button>
      {showComparison && <FeatureComparisonTable />}
    </div>
  );
}
