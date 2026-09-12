import { supabase } from "./supabase";

// Beta feedback — bug reports, feature requests, and a simple star rating. Written directly from
// the client the same way analytics_events is: RLS restricts each row to the inserting user,
// insert-only, no select/update/delete policy for regular users, so submitted feedback can only
// ever be read by an operator using the service-role key (Supabase SQL editor or a future admin
// tool) — never by other signed-in users, and not even read back by the person who wrote it.

export const FEEDBACK_TYPES = ["bug", "feature", "rating"];
export const MAX_MESSAGE_LENGTH = 1000;

/** @param {{type: "bug"|"feature"|"rating", message: string, rating?: number, page?: string}} input */
export function validateFeedback({ type, message, rating }) {
  if (!FEEDBACK_TYPES.includes(type)) return "Please choose a feedback type.";
  const trimmed = (message || "").trim();
  if (type !== "rating" && trimmed.length === 0) return "Please describe the issue or idea.";
  if (trimmed.length > MAX_MESSAGE_LENGTH) return `Please keep it under ${MAX_MESSAGE_LENGTH} characters.`;
  if (type === "rating" && rating !== undefined) {
    if (!Number.isInteger(rating) || rating < 1 || rating > 5) return "Rating must be 1-5.";
  }
  return null;
}

/** @returns {Promise<{ok: boolean, error?: string}>} */
export async function submitFeedback({ type, message, rating, page }) {
  const trimmedMessage = (message || "").trim().slice(0, MAX_MESSAGE_LENGTH);
  const validationError = validateFeedback({ type, message: trimmedMessage, rating });
  if (validationError) return { ok: false, error: validationError };

  const { data: { session } } = await supabase.auth.getSession();
  if (!session) return { ok: false, error: "Sign in required." };

  const { error } = await supabase.from("feedback").insert({
    user_id: session.user.id,
    type,
    message: trimmedMessage,
    rating: type === "rating" && Number.isInteger(rating) ? rating : null,
    page: typeof page === "string" ? page.slice(0, 100) : null,
  });
  if (error) return { ok: false, error: "Couldn't submit feedback — try again." };
  return { ok: true };
}
