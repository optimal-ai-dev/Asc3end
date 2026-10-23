import { describe, it, expect } from "vitest";
import { buildAnthropicRequest, trimHistory, ALLOWED_MODEL, HISTORY_WINDOW, HISTORY_STEP } from "./anthropicRequest.js";

const chat = (n) => Array.from({ length: n }, (_, i) => ({ role: i % 2 === 0 ? "user" : "assistant", content: `m${i}` }));
const base = { max_tokens: 900, messages: [{ role: "user", content: "hi" }] };

describe("buildAnthropicRequest — validation", () => {
  it("always uses the server's model, and still accepts the model older clients send", () => {
    expect(buildAnthropicRequest(base, "coach").request.model).toBe(ALLOWED_MODEL);
    expect(buildAnthropicRequest({ ...base, model: ALLOWED_MODEL }, "coach").request.model).toBe(ALLOWED_MODEL);
    expect(buildAnthropicRequest({ ...base, model: "claude-opus-5-5" }, "coach").error).toBe("Invalid model.");
  });

  it("rejects bad max_tokens and message lists", () => {
    expect(buildAnthropicRequest({ ...base, max_tokens: 99999 }).error).toBe("Invalid max_tokens.");
    expect(buildAnthropicRequest({ ...base, messages: [] }).error).toBe("Invalid messages.");
    expect(buildAnthropicRequest({ ...base, messages: chat(61) }).error).toBe("Invalid messages.");
  });

  it("drops fields the caller adds instead of forwarding them to Anthropic", () => {
    const { request } = buildAnthropicRequest({ ...base, temperature: 1, metadata: { x: 1 }, thinking: { type: "enabled" } }, "estimate");
    expect(Object.keys(request).sort()).toEqual(["max_tokens", "messages", "model"]);
  });

  it("accepts a string system prompt or a short list of text blocks", () => {
    expect(buildAnthropicRequest({ ...base, system: "be brief" }).request.system).toBe("be brief");
    const blocks = [{ type: "text", text: "stable", cache_control: { type: "ephemeral" } }, { type: "text", text: "athlete" }];
    expect(buildAnthropicRequest({ ...base, system: blocks }).request.system).toEqual(blocks);
  });

  it("rejects malformed system blocks and non-default cache settings", () => {
    expect(buildAnthropicRequest({ ...base, system: [] }).error).toBe("Invalid system prompt.");
    expect(buildAnthropicRequest({ ...base, system: [{ type: "image", text: "x" }] }).error).toBe("Invalid system prompt.");
    expect(buildAnthropicRequest({ ...base, system: [{ type: "text", text: "x", cache_control: { type: "ephemeral", ttl: "1h" } }] }).error).toBe("Invalid system prompt.");
    expect(buildAnthropicRequest({ ...base, system: Array(4).fill({ type: "text", text: "x" }) }).error).toBe("Invalid system prompt.");
  });

  it("only allows the single capped web search tool", () => {
    const tool = { type: "web_search_20250305", name: "web_search", max_uses: 1 };
    expect(buildAnthropicRequest({ ...base, tools: [tool] }, "meals").request.tools).toEqual([tool]);
    expect(buildAnthropicRequest({ ...base, tools: [{ ...tool, max_uses: 5 }] }, "meals").error).toBe("Invalid tools.");
  });
});

describe("buildAnthropicRequest — cost controls", () => {
  it("caches multi-turn coach conversations", () => {
    expect(buildAnthropicRequest({ ...base, messages: chat(3) }, "coach").request.cache_control).toEqual({ type: "ephemeral" });
  });

  it("doesn't pay for a cache write on one-shot requests or other features", () => {
    expect(buildAnthropicRequest(base, "coach").request.cache_control).toBeUndefined();
    expect(buildAnthropicRequest({ ...base, messages: chat(3) }, "estimate").request.cache_control).toBeUndefined();
  });

  it("trims long coach chats but not other features", () => {
    expect(buildAnthropicRequest({ ...base, messages: chat(40) }, "coach").request.messages.length).toBeLessThan(HISTORY_WINDOW + HISTORY_STEP);
    expect(buildAnthropicRequest({ ...base, messages: chat(40) }, "estimate").request.messages.length).toBe(40);
  });
});

describe("trimHistory", () => {
  it("leaves short chats alone", () => {
    const m = chat(HISTORY_WINDOW);
    expect(trimHistory(m)).toBe(m);
  });

  it("always keeps at least the most recent window, ending on the latest message", () => {
    for (let n = 1; n <= 60; n++) {
      const kept = trimHistory(chat(n));
      expect(kept.length).toBeGreaterThanOrEqual(Math.min(n, HISTORY_WINDOW));
      expect(kept.length).toBeLessThan(HISTORY_WINDOW + HISTORY_STEP);
      expect(kept[kept.length - 1].content).toBe(`m${n - 1}`);
    }
  });

  it("starts with a user message", () => {
    for (let n = 1; n <= 60; n += 2) expect(trimHistory(chat(n))[0].role).toBe("user");
    // An odd history (e.g. after a dropped error bubble) still starts on a user turn.
    const uneven = [{ role: "assistant", content: "a" }, ...chat(30)];
    expect(trimHistory(uneven)[0].role).toBe("user");
  });

  it("keeps the same first message for several turns in a row, so the cached prefix stays valid", () => {
    const firstKept = (n) => trimHistory(chat(n))[0].content;
    // n = 21, 23, 25, 27 are four consecutive user turns: all share one starting point.
    expect(new Set([21, 23, 25, 27].map(firstKept)).size).toBe(1);
  });
});
