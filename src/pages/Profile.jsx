import { useState } from "react";
import { X, Loader2, Sparkles, ChevronUp, ChevronDown, Copy, Star } from "lucide-react";
import LegalPage from "../LegalPage";
import { supabase } from "../lib/supabase";
import { logEvent } from "../lib/analytics";
import { getNutritionTargets } from "../lib/nutritionMath";
import { SUPPORT_EMAIL, LEGAL_COPY } from "../lib/legal";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";
import { describeSubscriptionState } from "../lib/subscription";
import { FEATURES, remainingMonthlyUses, freeMonthlyLimit, PLUS_MONTHLY_LIMITS } from "../lib/entitlements";
import { submitFeedback, FEEDBACK_TYPES, MAX_MESSAGE_LENGTH } from "../lib/feedback";
import { todayStr } from "../lib/dateUtils";
import { GOAL_LABELS } from "../lib/workoutHelpers";
import { FeatureComparisonTable } from "../components/Paywall";
import { getThemePref, setThemePref, THEME_OPTIONS } from "../lib/theme";

/* ------------------------------------------------------------------ */
/* Profile / Settings                                                   */
/* ------------------------------------------------------------------ */

export function Profile({ profile, authUser, workouts, nutrition, weightlog, customExercises, isPremium, isDemoEntitlement, subscriptionState, onUpdateProfile, onManageBilling, onUpgrade, billingLoading, billingError, onLogOut, onDeleteAccount, deleteAccountLoading, deleteAccountError, onClose, usage, onOpenSupport }) {
  const [edit, setEdit] = useState({
    name: profile.name || "", age: profile.age, gender: profile.gender,
    heightCm: profile.heightCm, weightKg: profile.weightKg,
    goal: profile.goal, experience: profile.experience, trainingDays: profile.trainingDays,
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const [theme, setTheme] = useState(getThemePref);
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
        <h1 className="disp-title" style={{ fontSize: 24 }}>Profile & Settings</h1>
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
        <h2 className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Appearance</h2>
        <div style={{ display: "flex", gap: 6 }} role="radiogroup" aria-label="Appearance">
          {THEME_OPTIONS.map((t) => (
            <button
              key={t}
              role="radio"
              aria-checked={theme === t}
              onClick={() => { setTheme(t); setThemePref(t); }}
              className="pill"
              style={{ flex: 1, justifyContent: "center", cursor: "pointer", textTransform: "capitalize", border: `1px solid ${theme === t ? "var(--brass)" : "var(--line)"}`, background: theme === t ? "var(--brass-soft)" : "transparent", color: theme === t ? "var(--brass)" : "var(--ink-dim)" }}
            >
              {t}
            </button>
          ))}
        </div>
      </div>

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
            {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 6 }}>Billing management is unavailable for demo and owner accounts.</div>}
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
          <div className="mono" style={{ fontSize: 12, color: "var(--brass)" }}>Asc3end+ — up to {PLUS_MONTHLY_LIMITS.coach} coach messages and {PLUS_MONTHLY_LIMITS.meals} meal searches a month</div>
        ) : (
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            {[["AI Coach", FEATURES.COACH], ["Meals Near You", FEATURES.MEALS]].map(([label, key]) => {
              const remaining = remainingMonthlyUses(key, usage || {});
              const limit = freeMonthlyLimit(key);
              return (
                <div key={key}>
                  <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12.5, marginBottom: 4 }}>
                    <span>{label}</span>
                    <span className="mono" style={{ color: remaining === 0 ? "var(--rest)" : "var(--ink-dim)" }}>{limit - remaining}/{limit} used this month</span>
                  </div>
                  <div style={{ height: 4, borderRadius: 2, background: "var(--bg-elev2)", overflow: "hidden" }}>
                    <div style={{ height: "100%", width: `${((limit - remaining) / limit) * 100}%`, background: remaining === 0 ? "var(--rest)" : "var(--brass)" }} />
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
