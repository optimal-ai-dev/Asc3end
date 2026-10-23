import { useState, useEffect } from "react";
import { X, Check, Sparkles, Loader2 } from "lucide-react";
import LegalPage from "../LegalPage";
import { logEvent } from "../lib/analytics";
import { describeSubscriptionState } from "../lib/subscription";
import { ANNUAL_PRICE, MONTHLY_PRICE, ANNUAL_SAVINGS_PCT, PRICING_FAQ } from "../lib/pricingContent";
import { FeatureComparisonTable } from "../components/Paywall";

export function PricingPage({ subscriptionState, isPremium, onConfirmUpgrade, billingLoading, billingError, onClose, initialFeature }) {
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
