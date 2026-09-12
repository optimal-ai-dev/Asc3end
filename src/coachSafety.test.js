import { describe, it, expect } from "vitest";
import { COACH_SAFETY_RULES } from "./App.jsx";

// Regression coverage for a real gap found during a launch-readiness audit: a comment claimed
// "all four [coaching styles] still operate inside the safety guardrails in TRAINING_PRINCIPLES
// above", but no such guardrails actually existed anywhere in the Coach's system prompt — no
// medical disclaimer, no injury/diagnosis boundary, no instruction against steroid/extreme-diet
// content, no escalation language. These assertions lock in that the specific safety phrases
// can't be silently removed by a future edit without a test failing.
describe("COACH_SAFETY_RULES — AI Coach safety boundaries", () => {
  it("clarifies it is not a medical professional", () => {
    expect(COACH_SAFETY_RULES).toMatch(/not a doctor/i);
  });

  it("instructs against diagnosing injuries or medical conditions", () => {
    expect(COACH_SAFETY_RULES).toMatch(/never diagnose/i);
  });

  it("instructs against recommending steroids or other drugs", () => {
    expect(COACH_SAFETY_RULES).toMatch(/steroid/i);
    expect(COACH_SAFETY_RULES).toMatch(/never recommend.*drug/i);
  });

  it("instructs against extreme/dangerous dieting and covers eating-disorder indicators", () => {
    expect(COACH_SAFETY_RULES).toMatch(/extreme.*diet/i);
    expect(COACH_SAFETY_RULES).toMatch(/eating disorder/i);
  });

  it("includes emergency/crisis escalation language", () => {
    expect(COACH_SAFETY_RULES).toMatch(/emergency/i);
  });

  it("explicitly applies even when a question is framed hypothetically", () => {
    expect(COACH_SAFETY_RULES).toMatch(/hypothetically/i);
  });
});
