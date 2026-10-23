import { useState, useEffect } from "react";
import { Dumbbell, Loader2, Check, X } from "lucide-react";
import GlobalStyle from "../GlobalStyle";
import { supabase } from "../lib/supabase";
import { isValidPassword, MIN_PASSWORD_LENGTH } from "../lib/passwordPolicy";

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
export function LoadingShell({ stage }) {
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
export function NotFoundScreen({ onGoHome }) {
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
export function ResetPasswordScreen({ onDone }) {
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
export function CheckoutResultScreen({ result, subscriptionState, onContinue, onRetry }) {
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
                <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>More Coach messages, the food scanner, and Meals Near You are unlocked.</div>
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
