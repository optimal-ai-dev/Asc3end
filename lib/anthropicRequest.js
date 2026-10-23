// Builds the request api/claude.js forwards to Anthropic from what the client sent. Framework-free
// so it can be unit tested without Supabase or a live API key.
//
// This endpoint is reachable directly by anyone with a valid bearer token (not only through the
// app's own frontend — a modified client or a stolen token can call it with an arbitrary body),
// so the request forwarded to Anthropic can't just be trusted as-is. Only ever forward a small,
// validated shape, rebuilt field by field: a fixed model chosen here (never by the caller), a
// capped max_tokens, a bounded system prompt, and (if present) exactly the one tool the app
// actually uses. Anything else the caller adds is dropped rather than passed through.

export const ALLOWED_MODEL = "claude-sonnet-4-6";
export const MAX_TOKENS_CEILING = 4096;
export const MAX_MESSAGES = 60; // generous for a long Coach conversation, bounds worst-case cost/latency
const MAX_SYSTEM_BLOCKS = 3;

// Coach history window. Each request resends the whole conversation, so input cost grows with
// every turn. The athlete's profile, targets and recent workouts are re-sent in the system prompt
// on every call, so older chat turns add little. Rather than a strict sliding window (which would
// shift the start of the history on every turn and defeat prompt caching), the window is cut in
// steps: it keeps between HISTORY_WINDOW and HISTORY_WINDOW + HISTORY_STEP - 1 messages, and the
// first kept message only moves every HISTORY_STEP messages, so the cached history prefix stays
// valid for several turns at a time.
export const HISTORY_WINDOW = 12;
export const HISTORY_STEP = 8;

const EPHEMERAL = { type: "ephemeral" };

export function trimHistory(messages, window = HISTORY_WINDOW, step = HISTORY_STEP) {
  if (messages.length <= window) return messages;
  let start = Math.floor((messages.length - window) / step) * step;
  // The API requires the first message to be from the user.
  while (start < messages.length - 1 && messages[start]?.role !== "user") start++;
  return messages.slice(start);
}

function isEphemeralMarker(value) {
  return value && typeof value === "object" && value.type === "ephemeral" && Object.keys(value).length === 1;
}

// `system` is either a plain string (older clients, single-shot features) or a short list of text
// blocks, where the client marks the stable leading block(s) with cache_control so they're served
// from Anthropic's prompt cache (90% cheaper) instead of being billed in full on every message.
function normalizeSystem(system) {
  if (system === undefined) return { value: undefined };
  if (typeof system === "string") return { value: system };
  if (!Array.isArray(system) || system.length === 0 || system.length > MAX_SYSTEM_BLOCKS) return { error: "Invalid system prompt." };
  const blocks = [];
  for (const block of system) {
    if (block?.type !== "text" || typeof block.text !== "string" || !block.text) return { error: "Invalid system prompt." };
    if (block.cache_control !== undefined && !isEphemeralMarker(block.cache_control)) return { error: "Invalid system prompt." };
    blocks.push(block.cache_control ? { type: "text", text: block.text, cache_control: EPHEMERAL } : { type: "text", text: block.text });
  }
  return { value: blocks };
}

export function buildAnthropicRequest(body, feature) {
  if (!body || typeof body !== "object") return { error: "Invalid request." };
  // Older clients (including installed PWAs that haven't updated yet) still send a model name.
  // Accept the one they used to send, but the server always decides which model runs.
  if (body.model !== undefined && body.model !== ALLOWED_MODEL) return { error: "Invalid model." };
  if (!Number.isInteger(body.max_tokens) || body.max_tokens <= 0 || body.max_tokens > MAX_TOKENS_CEILING) return { error: "Invalid max_tokens." };
  if (!Array.isArray(body.messages) || body.messages.length === 0 || body.messages.length > MAX_MESSAGES) return { error: "Invalid messages." };
  const system = normalizeSystem(body.system);
  if (system.error) return { error: system.error };
  let tools;
  if (body.tools !== undefined) {
    if (!Array.isArray(body.tools) || body.tools.length !== 1) return { error: "Invalid tools." };
    const t = body.tools[0];
    if (t?.type !== "web_search_20250305" || t?.name !== "web_search" || t?.max_uses !== 1) return { error: "Invalid tools." };
    tools = [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }];
  }

  const messages = feature === "coach" ? trimHistory(body.messages) : body.messages;
  const request = { model: ALLOWED_MODEL, max_tokens: body.max_tokens, messages };
  if (system.value !== undefined) request.system = system.value;
  if (tools) request.tools = tools;
  // Multi-turn coach chats also cache the conversation so far: Anthropic's automatic caching puts
  // a breakpoint on the last message, so the next turn reads everything up to it from the cache.
  // Skipped for one-shot requests (a first message, plan generation), where a cache write would
  // be a 25% surcharge on tokens nobody reads back.
  if (feature === "coach" && messages.length > 1) request.cache_control = EPHEMERAL;
  return { request };
}
