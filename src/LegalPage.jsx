import React from "react";
import { X, Mail } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import { LEGAL_COPY, LEGAL_DOCUMENT_VERSION, LEGAL_EFFECTIVE_DATE, SUPPORT_EMAIL } from "./lib/legal";

// Full-page legal document viewer — reachable both from the public Landing footer (signed-out
// visitors can read these before creating an account) and from Profile (signed-in users). Renders
// standalone with its own GlobalStyle since it's used pre-auth, where App.jsx hasn't mounted yet.
//
// Real semantic headings (h1 for the document title, h2 per section) rather than styled <div>s —
// legal pages are long-form reading content, where heading order actually matters for screen
// readers navigating by heading, unlike most of the app's UI-control-driven screens.
export default function LegalPage({ docKey, onClose }) {
  const doc = LEGAL_COPY[docKey];
  const showMailLink = SUPPORT_EMAIL && (docKey === "support" || docKey === "contact");
  return (
    <div className="atlas-root">
      <GlobalStyle />
      <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, overflowY: "auto", padding: "24px 18px 60px" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18, maxWidth: 640, margin: "0 auto 18px" }}>
          <h1 className="disp" style={{ fontSize: 22, margin: 0 }}>{doc?.title || "Not found"}</h1>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close"><X size={16} /></button>
        </div>
        <div style={{ maxWidth: 640, margin: "0 auto" }}>
          {doc ? (
            <div className="atlas-card" style={{ padding: 20 }}>
              {doc.sections.map((section) => (
                <div key={section.heading} style={{ marginBottom: 18 }}>
                  <h2 className="disp" style={{ fontSize: 14, marginBottom: 6 }}>{section.heading}</h2>
                  <p style={{ fontSize: 13.5, color: "var(--ink)", lineHeight: 1.7, margin: 0 }}>{section.body}</p>
                </div>
              ))}
              {showMailLink && (
                <a
                  href={`mailto:${SUPPORT_EMAIL}`}
                  style={{ display: "inline-flex", alignItems: "center", gap: 6, color: "var(--brass)", fontSize: 13, textDecoration: "underline", marginTop: 4 }}
                >
                  <Mail size={14} /> {SUPPORT_EMAIL}
                </a>
              )}
              <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 18, paddingTop: 12, borderTop: "1px solid var(--line)" }}>
                Version {LEGAL_DOCUMENT_VERSION} — effective {LEGAL_EFFECTIVE_DATE}
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
