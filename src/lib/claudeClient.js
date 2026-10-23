import { supabase } from "./supabase";
import { logEvent } from "./analytics";
import { captureMessage } from "./errorMonitoring";

/* Extracts the first complete, balanced JSON object from a text response — far more reliable than a
   greedy regex, since AI responses (especially web-search-grounded ones) often include a preamble,
   citations, or trailing notes around the actual JSON rather than returning it in pure isolation. */
export function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("No JSON found in response");
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }
  throw new Error("Incomplete JSON in response");
}

/* Shared response parser: detects the exceeded_limit shape and pulls out the text content,
   used by both callClaude and the food scanner's direct image-upload fetch. */
export function extractClaudeText(data) {
  if (data?.type === "exceeded_limit") {
    const resetsAt = data.resetsAt || data.resolved?.limit?.resets_at;
    const resetText = resetsAt
      ? new Date(typeof resetsAt === "number" ? resetsAt * 1000 : resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "shortly";
    throw new Error(`Usage limit reached for now — this resets around ${resetText}. Try again after that, or check your Claude plan.`);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("No response came back — try again.");
  return text;
}

// Every /api/claude call (Coach chat, plan generation, food estimate, meals search) funnels
// through here, which makes it the one place to record latency/failure for ALL AI request
// traffic instead of instrumenting each of those call sites separately. ok:false covers both
// network-level failures (timeout, offline) and non-2xx server responses; a graceful
// "exceeded_limit" response is intentionally logged as ok:true since it's an expected product
// state, not a system failure.
export async function callClaude(messages, maxTokens = 1000, tools = null, system = null, feature = "estimate") {
  const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, messages, feature };
  if (tools) body.tools = tools;
  if (system) body.system = system;
  const controller = new AbortController();
  const startedAt = performance.now();
  const record = (ok, statusCode) => logEvent("ai_request_completed", { feature, durationMs: Math.round(performance.now() - startedAt), ok, statusCode: statusCode || 0 });
  // Matches the server's maxDuration (api/claude.js) minus a safety margin — web-search calls
  // (Meals Near You) can legitimately take 10-20+ seconds, so this needs real headroom.
  const timeout = setTimeout(() => controller.abort(), 55000);
  let response;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    response = await fetch("/api/claude", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    const aborted = e.name === "AbortError";
    record(false, aborted ? 408 : 0);
    captureMessage(`AI request failed: ${feature} — ${aborted ? "timeout" : "network error"}`);
    if (aborted) throw new Error("The coach took too long to respond — try again.");
    throw new Error("Couldn't reach the coach — check your connection and try again.");
  }
  clearTimeout(timeout);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    record(false, response.status);
    captureMessage(`AI request failed: ${feature} — unparseable response (${response.status})`);
    throw new Error(`The coach hit an unexpected error (${response.status}) — try again.`);
  }
  if (response.status === 402 && data?.error?.code === "premium_required") {
    record(true, response.status); // gated, not a failure
    const err = new Error(data.error.message || "This feature requires Asc3end Premium.");
    err.code = "premium_required";
    throw err;
  }
  if (!response.ok && data?.type !== "exceeded_limit") {
    record(false, response.status);
    captureMessage(`AI request failed: ${feature} — server error (${response.status})`);
    throw new Error(data?.error?.message || `The coach hit an error (${response.status}) — try again.`);
  }
  record(true, response.status);
  return extractClaudeText(data);
}
