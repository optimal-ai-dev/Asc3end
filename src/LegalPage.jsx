import React from "react";
import { X, AlertTriangle } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import { LEGAL_COPY, LEGAL_DOCUMENT_VERSION } from "./lib/legal";

// Full-page legal document viewer — reachable both from the public Landing footer (signed-out
// visitors can read these before creating an account) and from Profile (signed-in users). Renders
// standalone with its own GlobalStyle since it's used pre-auth, where App.jsx hasn't mounted yet.
export default function LegalPage({ docKey, onClose }) {
  const doc = LEGAL_COPY[docKey];
  return (
    <div className="atlas-root">
      <GlobalStyle />
      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, overflowY: "auto", padding: "24px 18px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, maxWidth: 640, margin: "0 auto 18px" }}>
          <div className="disp" style={{ fontSize: 22 }}>{doc?.title || "Not found"}</div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close"><X size={16} /></button>
        </div>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          <div className="atlas-card" style={{ display: "flex", gap: 10, alignItems: "flex-start", padding: 14, marginBottom: 16, border: "1px solid var(--brass)" }}>
            <AlertTriangle size={16} color="var(--brass)" style={{ flexShrink: 0, marginTop: 1 }} />
            <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>
              This is a good-faith draft, not reviewed or approved by a lawyer. It's provided so the
              document exists and is versioned honestly while the app owner arranges a proper legal
              review — it is not a substitute for one.
            </div>
          </div>
          {doc ? (
            <div className="atlas-card" style={{ padding: 20 }}>
              <div style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.7 }}>{doc.body}</div>
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                Document version {LEGAL_DOCUMENT_VERSION}
              </div>
            </div>
          ) : (
            <div className="atlas-card" style={{ padding: 20, fontSize: 13, color: "var(--ink-dim)" }}>That document doesn't exist.</div>
          )}
        </div>
      </div>
    </div>
  );
}
