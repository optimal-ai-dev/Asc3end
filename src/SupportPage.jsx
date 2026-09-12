import React, { useState } from "react";
import { X, ChevronDown, ChevronUp, Mail } from "lucide-react";
import { SUPPORT_FAQ } from "./lib/supportContent";
import { SUPPORT_EMAIL } from "./lib/legal";

// In-app self-serve help — reachable from Profile > Help & Support. Most account/billing
// questions are answered here so they never need to become a real support email.
export default function SupportPage({ onClose }) {
  const [openIdx, setOpenIdx] = useState(null);

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, overflowY: "auto", padding: "24px 18px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
          <div className="disp" style={{ fontSize: 22 }}>Help & Support</div>
          <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close"><X size={16} /></button>
        </div>

        <div className="atlas-card" style={{ padding: 4, marginBottom: 16 }}>
          {SUPPORT_FAQ.map((item, i) => (
            <div key={item.q} style={{ borderTop: i === 0 ? "none" : "1px solid var(--line)" }}>
              <button
                onClick={() => setOpenIdx(openIdx === i ? null : i)}
                style={{ width: "100%", background: "none", border: "none", cursor: "pointer", textAlign: "left", padding: "14px 14px", display: "flex", justifyContent: "space-between", alignItems: "center" }}
              >
                <span style={{ fontSize: 13, fontWeight: 600 }}>{item.q}</span>
                {openIdx === i ? <ChevronUp size={14} color="var(--ink-dim)" /> : <ChevronDown size={14} color="var(--ink-dim)" />}
              </button>
              {openIdx === i && <div style={{ padding: "0 14px 16px", color: "var(--ink-dim)", fontSize: 12.5, lineHeight: 1.6 }}>{item.a}</div>}
            </div>
          ))}
        </div>

        <div className="atlas-card" style={{ padding: 18, textAlign: "center" }}>
          <Mail size={18} color="var(--brass)" style={{ marginBottom: 8 }} />
          <div className="disp" style={{ fontSize: 13, marginBottom: 6 }}>Still need help?</div>
          <div style={{ fontSize: 12.5, color: "var(--ink-dim)" }}>
            {SUPPORT_EMAIL
              ? <>Email <a href={`mailto:${SUPPORT_EMAIL}`} style={{ color: "var(--brass)" }}>{SUPPORT_EMAIL}</a> with your account email and what happened.</>
              : "Support email not yet configured by the app owner. Use the Send Feedback section below for now."}
          </div>
        </div>
      </div>
    </div>
  );
}
