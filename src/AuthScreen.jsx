import React, { useState } from "react";
import { Loader2, Dumbbell, Eye, EyeOff } from "lucide-react";
import { supabase } from "./lib/supabase";
import { logEvent } from "./lib/analytics";
import { MIN_PASSWORD_LENGTH, isValidPassword } from "./lib/passwordPolicy";
import { LEGAL_DOCUMENT_VERSION } from "./lib/legal";
import LegalPage from "./LegalPage";
import GlobalStyle from "./GlobalStyle";

/*
 * Real authentication — Supabase handles password hashing, session tokens, and email
 * verification for you. This is what "abide to safety protocols" actually means in practice:
 * never write your own password storage. Supabase's free tier covers up to 50,000 monthly
 * active users, which is far more than you'll need for a while.
 *
 * No onAuthed callback here on purpose — App.jsx listens for supabase.auth.onAuthStateChange()
 * and swaps this screen out automatically once a session exists.
 */
export default function AuthScreen({ initialMode = "login", onBack }) {
  const [mode, setMode] = useState(initialMode); // "login" | "signup" | "forgot" | "forgot-sent"
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [showPassword, setShowPassword] = useState(false);
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);
  const [resendingEmail, setResendingEmail] = useState(false);
  const [lastSignupEmail, setLastSignupEmail] = useState(null);
  // Required consent gate for account creation — previously this screen created a real Supabase
  // Auth account from nothing but email+password, with zero acknowledgement of the Terms, Privacy
  // Policy, or Health & Fitness Disclaimer anywhere in the flow (a separate checkbox exists later
  // in onboarding, but that runs AFTER the account already exists, so someone who abandons the
  // flow between the two ends up with a real account that never agreed to anything). Not
  // preselected — the Create Account button stays disabled until this is checked.
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null); // shown as an in-page overlay, never a real
  // navigation, so opening Terms/Privacy/the Health Disclaimer from here never discards whatever
  // email/password the visitor already typed into this form.

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        if (!isValidPassword(password)) {
          setError(`Password must be at least ${MIN_PASSWORD_LENGTH} characters.`);
          setLoading(false);
          return;
        }
        if (password !== confirmPassword) {
          setError("Passwords don't match.");
          setLoading(false);
          return;
        }
        if (!agreedToTerms) {
          setError("You need to agree to the Terms, Privacy Policy, and Health & Fitness Disclaimer to continue.");
          setLoading(false);
          return;
        }
        const { data, error: err } = await supabase.auth.signUp({
          email, password,
          // Recorded at the exact moment the account is actually created, not retrofitted later —
          // this is the real, timestamped proof of what was agreed to and when.
          options: { data: { legalAcceptedVersion: LEGAL_DOCUMENT_VERSION, legalAcceptedAt: new Date().toISOString() } },
        });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then log in.");
          setLastSignupEmail(email);
          setMode("login");
        } else {
          logEvent("signup_completed", {});
        }
      } else if (mode === "forgot") {
        // Supabase intentionally returns success here regardless of whether the email is
        // registered — never treat this response as revealing account existence one way or
        // the other, and never show a different message for "not found" vs "sent".
        const { error: err } = await supabase.auth.resetPasswordForEmail(email, { redirectTo: window.location.origin });
        if (err) throw err;
        setMode("forgot-sent");
      } else {
        const { error: err } = await supabase.auth.signInWithPassword({ email, password });
        if (err) throw err;
      }
    } catch (e) {
      // Supabase's own message for an existing account ("User already registered") is accurate
      // but blunt — this rephrases the one case worth being friendlier about without inventing or
      // hiding any information the raw error didn't already reveal.
      setError(/already registered/i.test(e.message)
        ? "An account already exists for that email — try logging in instead, or use Forgot Password if you don't remember your password."
        : e.message);
    }
    setLoading(false);
  };

  const resendConfirmation = async () => {
    if (!lastSignupEmail || resendingEmail) return;
    setResendingEmail(true);
    setError(null);
    try {
      const { error: err } = await supabase.auth.resend({ type: "signup", email: lastSignupEmail });
      if (err) throw err;
      setNotice("Confirmation email resent — check your inbox (and spam folder).");
    } catch (e) {
      setError(e.message);
    }
    setResendingEmail(false);
  };

  return (
    <div className="atlas-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <GlobalStyle />
      <div className="atlas-card" style={{ width: "100%", maxWidth: 360 }}>
        {onBack && (
          <button type="button" onClick={onBack} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0, marginBottom: 14 }}>
            ← Back
          </button>
        )}
        <div style={{ display: "flex", flexDirection: "column", alignItems: "center", marginBottom: 24 }}>
          <div
            style={{
              width: 52, height: 52, borderRadius: 14,
              background: "linear-gradient(135deg, var(--brass), #2BAE73)",
              display: "flex", alignItems: "center", justifyContent: "center",
              marginBottom: 12, boxShadow: "0 6px 18px -6px rgba(62,207,142,0.5)",
            }}
          >
            <Dumbbell size={26} color="#072016" />
          </div>
          <div className="disp" style={{ fontSize: 24 }}>Asc3end</div>
          <div className="mono" style={{ color: "var(--ink-dim)", fontSize: 12, marginTop: 2 }}>
            {mode === "login" && "Log in to keep training"}
            {mode === "signup" && "Create your account"}
            {mode === "forgot" && "Reset your password"}
            {mode === "forgot-sent" && "Check your inbox"}
          </div>
        </div>

        {(mode === "login" || mode === "signup") && (
          <div style={{ display: "flex", gap: 8, marginBottom: 20, background: "var(--bg-elev2)", borderRadius: 10, padding: 4 }}>
            <button
              type="button"
              onClick={() => { setMode("login"); setError(null); setNotice(null); }}
              className="disp"
              style={{
                flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 11, letterSpacing: "0.03em",
                background: mode === "login" ? "var(--brass)" : "transparent",
                color: mode === "login" ? "#072016" : "var(--ink-dim)",
              }}
            >
              Log In
            </button>
            <button
              type="button"
              onClick={() => { setMode("signup"); setError(null); setNotice(null); }}
              className="disp"
              style={{
                flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer",
                fontSize: 11, letterSpacing: "0.03em",
                background: mode === "signup" ? "var(--brass)" : "transparent",
                color: mode === "signup" ? "#072016" : "var(--ink-dim)",
              }}
            >
              Sign Up
            </button>
          </div>
        )}

        {mode === "forgot-sent" ? (
          <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
            <div className="mono" style={{ color: "var(--good)", fontSize: 12, background: "rgba(126,217,87,0.1)", border: "1px solid var(--good)", borderRadius: 8, padding: "10px 12px", lineHeight: 1.6 }}>
              If an account exists for that email, we've sent a link to reset your password. It'll bring you back here to set a new one.
            </div>
            <button type="button" onClick={() => { setMode("login"); setError(null); setNotice(null); }} className="atlas-btn-ghost">Back to Log In</button>
          </div>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>EMAIL</div>
              <input
                className="atlas-input"
                placeholder="you@example.com"
                type="email"
                autoComplete="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                required
              />
            </div>
            {mode !== "forgot" && (
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>PASSWORD</div>
                <div style={{ position: "relative" }}>
                  <input
                    className="atlas-input"
                    placeholder="••••••••"
                    type={showPassword ? "text" : "password"}
                    autoComplete={mode === "signup" ? "new-password" : "current-password"}
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    minLength={MIN_PASSWORD_LENGTH}
                    style={{ paddingRight: 38 }}
                    required
                  />
                  <button
                    type="button" onClick={() => setShowPassword((v) => !v)}
                    aria-label={showPassword ? "Hide password" : "Show password"}
                    style={{ position: "absolute", right: 8, top: "50%", transform: "translateY(-50%)", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", padding: 4, display: "flex" }}
                  >
                    {showPassword ? <EyeOff size={15} /> : <Eye size={15} />}
                  </button>
                </div>
                {mode === "signup" && (
                  <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 4 }}>
                    At least {MIN_PASSWORD_LENGTH} characters.
                  </div>
                )}
              </div>
            )}

            {mode === "signup" && (
              <div>
                <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>CONFIRM PASSWORD</div>
                <input
                  className="atlas-input"
                  placeholder="••••••••"
                  type={showPassword ? "text" : "password"}
                  autoComplete="new-password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  required
                />
              </div>
            )}

            {mode === "signup" && (
              <div>
                <label style={{ display: "flex", alignItems: "flex-start", gap: 8, cursor: "pointer" }}>
                  <input
                    type="checkbox" checked={agreedToTerms}
                    onChange={(e) => setAgreedToTerms(e.target.checked)}
                    style={{ marginTop: 3, width: 16, height: 16, flexShrink: 0 }}
                    aria-describedby="signup-consent-text"
                  />
                  <span id="signup-consent-text" style={{ fontSize: 12, lineHeight: 1.5, color: "var(--ink-dim)" }}>
                    I confirm that I am at least 16 and agree to the{" "}
                    <button type="button" onClick={() => setLegalOpen("terms")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brass)", textDecoration: "underline", font: "inherit" }}>Terms of Use</button>,{" "}
                    <button type="button" onClick={() => setLegalOpen("privacy")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brass)", textDecoration: "underline", font: "inherit" }}>Privacy Policy</button> and{" "}
                    <button type="button" onClick={() => setLegalOpen("disclaimer")} style={{ background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--brass)", textDecoration: "underline", font: "inherit" }}>Health &amp; Fitness Disclaimer</button>.
                  </span>
                </label>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 4, marginLeft: 24 }}>
                  This confirms your agreement — it doesn't itself guarantee legal compliance in every jurisdiction.
                </div>
              </div>
            )}

            {mode === "login" && (
              <button type="button" onClick={() => { setMode("forgot"); setError(null); setNotice(null); }} className="mono" style={{ alignSelf: "flex-end", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0 }}>
                Forgot password?
              </button>
            )}

            {error && (
              <div className="mono" style={{ color: "var(--rest)", fontSize: 12, background: "rgba(255,92,122,0.1)", border: "1px solid var(--rest)", borderRadius: 8, padding: "8px 10px" }}>
                {error}
              </div>
            )}
            {notice && (
              <div className="mono" style={{ color: "var(--good)", fontSize: 12, background: "rgba(126,217,87,0.1)", border: "1px solid var(--good)", borderRadius: 8, padding: "8px 10px" }}>
                {notice}
                {lastSignupEmail && (
                  <button
                    type="button" onClick={resendConfirmation} disabled={resendingEmail}
                    style={{ display: "block", marginTop: 6, background: "none", border: "none", padding: 0, cursor: "pointer", color: "var(--good)", textDecoration: "underline", font: "inherit" }}
                  >
                    {resendingEmail ? "Resending…" : "Resend confirmation email"}
                  </button>
                )}
              </div>
            )}

            <button
              type="submit" className="atlas-btn"
              disabled={loading || !email || (mode !== "forgot" && !password) || (mode === "signup" && (!confirmPassword || !agreedToTerms))}
              style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}
            >
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Log In"}
            </button>
            {mode === "forgot" && (
              <button type="button" onClick={() => { setMode("login"); setError(null); setNotice(null); }} className="atlas-btn-ghost">Back to Log In</button>
            )}
          </form>
        )}
      </div>
      {legalOpen && <LegalPage docKey={legalOpen} onClose={() => setLegalOpen(null)} />}
    </div>
  );
}
