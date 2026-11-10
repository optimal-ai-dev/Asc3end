import { useState } from "react";
import { LegalConsent } from "../components/LegalConsent";
import { SUPPORT_EMAIL } from "../lib/legal";

// Shown instead of the app when the signed-in user's profile.legalAcceptedVersion doesn't match
// LEGAL_DOCUMENT_VERSION (accepted an older version, or signed up before versions were recorded).
// The Terms promise that material changes are re-accepted before the app can be used, so this is
// that promise kept. Signing out is the way to decline.
export function LegalUpdateScreen({ onAccept, onLogOut }) {
  const [agreedToTerms, setAgreedToTerms] = useState(false);
  const [agreedToHealth, setAgreedToHealth] = useState(false);
  const [saving, setSaving] = useState(false);
  const ready = agreedToTerms && agreedToHealth;
  return (
    <div className="atlas-root" style={{ padding: "40px 20px", maxWidth: 560, margin: "0 auto" }}>
      <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>ASC3END</div>
      <h1 className="disp-title" style={{ fontSize: 28, marginTop: 4, marginBottom: 12 }}>We've updated our terms</h1>
      <p style={{ fontSize: 13.5, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 16 }}>
        We've updated the Terms of Use, Privacy Policy and Subscription Terms to explain more clearly how your data is handled, where it's stored and what your rights are. Please read them and accept to keep using Asc3end. Your logged data hasn't changed.
      </p>
      <LegalConsent agreedToTerms={agreedToTerms} onAgreedToTerms={setAgreedToTerms} agreedToHealth={agreedToHealth} onAgreedToHealth={setAgreedToHealth} />
      <button
        className="atlas-btn"
        style={{ width: "100%", marginTop: 24 }}
        disabled={!ready || saving}
        onClick={async () => { setSaving(true); await onAccept(); setSaving(false); }}
      >
        Accept and continue
      </button>
      <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={onLogOut}>Not now, sign out</button>
      <p className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 14, lineHeight: 1.5 }}>
        If you don't want to accept, sign out and {SUPPORT_EMAIL ? `email ${SUPPORT_EMAIL}` : "contact support"} to cancel your subscription or delete your account.
      </p>
    </div>
  );
}
