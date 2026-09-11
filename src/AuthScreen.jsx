import React, { useState } from "react";
import { Loader2, Dumbbell } from "lucide-react";
import { supabase } from "./lib/supabase";
import { logEvent } from "./lib/analytics";
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
  const [error, setError] = useState(null);
  const [notice, setNotice] = useState(null);
  const [loading, setLoading] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setLoading(true);
    setError(null);
    setNotice(null);
    try {
      if (mode === "signup") {
        const { data, error: err } = await supabase.auth.signUp({ email, password });
        if (err) throw err;
        if (!data.session) {
          setNotice("Check your inbox to confirm your email, then log in.");
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
      setError(e.message);
    }
    setLoading(false);
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
                <input
                  className="atlas-input"
                  placeholder="••••••••"
                  type="password"
                  autoComplete={mode === "signup" ? "new-password" : "current-password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  minLength={6}
                  required
                />
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
              </div>
            )}

            <button type="submit" className="atlas-btn" disabled={loading || !email || (mode !== "forgot" && !password)} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : mode === "signup" ? "Create Account" : mode === "forgot" ? "Send Reset Link" : "Log In"}
            </button>
            {mode === "forgot" && (
              <button type="button" onClick={() => { setMode("login"); setError(null); setNotice(null); }} className="atlas-btn-ghost">Back to Log In</button>
            )}
          </form>
        )}
      </div>
    </div>
  );
}
