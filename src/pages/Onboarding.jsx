import { useState } from "react";
import { LEGAL_DOCUMENT_VERSION, MIN_AGE, meetsMinimumAge } from "../lib/legal";
import { LegalConsent } from "../components/LegalConsent";
import { GOAL_LABELS } from "../lib/workoutHelpers";
import { parseNumberDraft, hasBodyStats } from "../lib/numberInput";
import { NumberInput } from "../components/NumberInput";

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

export function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [agreedToHealth, setAgreedToHealth] = useState(false);
  const [form, setForm] = useState({
    name: "", age: 25, gender: "male", heightCm: 175, weightKg: 75,
    goal: "muscle_growth", experience: "intermediate", trainingDays: 4,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // NumberInput already strips leading zeros; a cleared field is stored as "" (not 0) so it
  // stays blank and blocks Continue instead of saving an age/height/weight of 0.
  const setNumber = (k, raw) => set(k, parseNumberDraft(raw));

  const steps = [
    {
      title: "Who's training?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>NAME</label>
          <input className="atlas-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoFocus />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>AGE</label>
              <NumberInput className="atlas-input" value={form.age} onChange={(v) => setNumber("age", v)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>GENDER</label>
              <select className="atlas-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>HEIGHT (CM)</label>
              <NumberInput className="atlas-input" value={form.heightCm} onChange={(v) => setNumber("heightCm", v)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>WEIGHT (KG)</label>
              <NumberInput className="atlas-input" value={form.weightKg} onChange={(v) => setNumber("weightKg", v)} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "What's the goal?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(GOAL_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => set("goal", k)}
              className="atlas-card"
              style={{
                textAlign: "left", cursor: "pointer",
                borderColor: form.goal === k ? "var(--brass)" : "var(--line)",
                background: form.goal === k ? "var(--brass-soft)" : "var(--bg-elev)",
                color: form.goal === k ? "var(--brass)" : "var(--ink)",
              }}
            >
              <span className="disp" style={{ fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Training profile",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>EXPERIENCE</label>
            <select className="atlas-input" value={form.experience} onChange={(e) => set("experience", e.target.value)}>
              <option value="beginner">Beginner (0-1yr)</option>
              <option value="intermediate">Intermediate (1-5yr)</option>
              <option value="advanced">Advanced (5yr+)</option>
            </select>
          </div>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>TRAINING DAYS / WEEK: {form.trainingDays}</label>
            <input type="range" min="2" max="6" value={form.trainingDays} onChange={(e) => set("trainingDays", +e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>
      ),
    },
    {
      title: "Before we start",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 4 }}>
            Asc3end gives general fitness and nutrition information, not medical advice — read the documents below, and you can find them again in Profile any time.
          </div>
          <LegalConsent agreedToTerms={agreedToLegal} onAgreedToTerms={setAgreedToLegal} agreedToHealth={agreedToHealth} onAgreedToHealth={setAgreedToHealth} />
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const nameMissing = step === 0 && !form.name.trim();
  const statsMissing = step === 0 && !nameMissing && !hasBodyStats(form);
  const underAge = step === 0 && !nameMissing && !statsMissing && !meetsMinimumAge(form.age);
  const legalNotAgreed = isLast && !(agreedToLegal && agreedToHealth);

  return (
    <div className="atlas-root" style={{ padding: "40px 20px", paddingBottom: 40 }}>
      <div style={{ marginBottom: 28 }}>
        <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>ASC3END</div>
        <div className="disp-title" style={{ fontSize: 30, marginTop: 4 }}>{steps[step].title}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? "var(--brass)" : "var(--line)" }} />
          ))}
        </div>
      </div>
      {steps[step].body}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        {step > 0 && (
          <button className="atlas-btn-ghost" onClick={() => setStep(step - 1)}>Back</button>
        )}
        <button
          className="atlas-btn"
          style={{ flex: 1 }}
          disabled={nameMissing || statsMissing || underAge || legalNotAgreed}
          onClick={() => {
            if (isLast) onComplete({ ...form, legalAcceptedVersion: LEGAL_DOCUMENT_VERSION, legalAcceptedAt: new Date().toISOString(), healthConsentAt: new Date().toISOString() });
            else setStep(step + 1);
          }}
        >
          {isLast ? "Build My Plan" : "Continue"}
        </button>
      </div>
      {nameMissing && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Enter your name to continue.</div>}
      {statsMissing && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Enter your age, height and weight to continue.</div>}
      {underAge && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Sorry, you need to be at least {MIN_AGE} to use Asc3end.</div>}
      {legalNotAgreed && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Tick both boxes to continue.</div>}
    </div>
  );
}
