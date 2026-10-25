import { useState } from "react";
import LegalPage from "../LegalPage";
import { LEGAL_COPY } from "../lib/legal";

// The two acceptance checkboxes shared by the last onboarding step and the re-accept screen shown
// when LEGAL_DOCUMENT_VERSION changes. Health-information consent is its own checkbox rather than
// folded into "I agree to the Terms": Australian privacy law treats weight, body measurements and
// food/training logs as sensitive information, which needs consent that isn't bundled with
// everything else.
export function LegalConsent({ agreedToTerms, onAgreedToTerms, agreedToHealth, onAgreedToHealth }) {
  const [legalOpen, setLegalOpen] = useState(null);
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
        {["terms", "privacy", "disclaimer", "subscriptionTerms"].map((k) => (
          <button key={k} onClick={() => setLegalOpen(k)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)" }}>{LEGAL_COPY[k].title}</button>
        ))}
      </div>
      {legalOpen && <LegalPage docKey={legalOpen} onClose={() => setLegalOpen(null)} />}
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
        <input type="checkbox" checked={agreedToTerms} onChange={(e) => onAgreedToTerms(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>I agree to the Terms of Use and Privacy Policy, and understand Asc3end is not medical advice.</span>
      </label>
      <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer" }}>
        <input type="checkbox" checked={agreedToHealth} onChange={(e) => onAgreedToHealth(e.target.checked)} style={{ marginTop: 3 }} />
        <span style={{ fontSize: 13, lineHeight: 1.5 }}>I consent to Asc3end collecting and using my health and fitness information (like my weight, workouts and food logs) to provide the app, as described in the Privacy Policy.</span>
      </label>
    </div>
  );
}
