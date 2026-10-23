import { describe, it, expect } from "vitest";
import { buildCoachSystem, toCoachApiMessages, COACHING_STYLES, COACH_SAFETY_RULES, COACH_OUTPUT_RULES } from "./lib/coachPrompts";

describe("buildCoachSystem — prompt caching layout", () => {
  it("puts the shared instructions in a cached first block and the athlete in a second block", () => {
    const [shared, athlete] = buildCoachSystem("balanced", "Athlete profile: name=Sam");
    expect(shared.cache_control).toEqual({ type: "ephemeral" });
    expect(shared.text).toContain(COACH_SAFETY_RULES);
    expect(shared.text).toContain(COACH_OUTPUT_RULES);
    expect(shared.text).toContain(COACHING_STYLES.balanced.prompt);
    expect(athlete).toEqual({ type: "text", text: "Athlete profile: name=Sam" });
  });

  it("keeps the cached block identical across athletes, so one athlete's details never break another's cache", () => {
    expect(buildCoachSystem("volume", "Athlete A")[0]).toEqual(buildCoachSystem("volume", "Athlete B")[0]);
    expect(buildCoachSystem("volume", "x")[0].text).not.toContain("Athlete");
  });

  it("is long enough for Anthropic to cache (1,024-token minimum, about 4 characters per token)", () => {
    for (const style of Object.keys(COACHING_STYLES)) {
      expect(buildCoachSystem(style, "x")[0].text.length).toBeGreaterThan(1024 * 4);
    }
  });

  it("falls back to the balanced style for an unknown style", () => {
    expect(buildCoachSystem("nope", "x")[0]).toEqual(buildCoachSystem("balanced", "x")[0]);
  });
});

describe("toCoachApiMessages", () => {
  it("drops the greeting, error bubbles and UI-only fields", () => {
    const chat = [
      { role: "assistant", content: "Hey! I'm your coach." },
      { role: "user", content: "plan?" },
      { role: "assistant", content: "⚠️ Couldn't reach the coach", isError: true },
      { role: "user", content: "plan please" },
      { role: "assistant", content: "{...}", workout: { title: "x" } },
    ];
    expect(toCoachApiMessages(chat)).toEqual([
      { role: "user", content: "plan?" },
      { role: "user", content: "plan please" },
      { role: "assistant", content: "{...}" },
    ]);
  });
});
