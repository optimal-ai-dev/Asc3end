// Helpers behind <NumberInput>. A controlled <input type="number"> bound to a *number* keeps a
// stray leading zero on screen: typing "14" into a field showing "0" makes the DOM read "014",
// which parses to 14, and React sees 14 == "014" and never rewrites the box. Keeping the text
// as a string draft and normalising it here is what actually gets rid of the zero.

// "014" -> "14", "0168" -> "168", "00.5" -> "0.5", "-07" -> "-7". "0" and "0.5" are left alone.
export function stripLeadingZeros(raw) {
  if (raw == null) return "";
  const s = String(raw);
  const m = /^(-?)0+(?=\d)(.*)$/.exec(s);
  return m ? m[1] + m[2] : s;
}

const isEmpty = (v) => v === "" || v == null || (typeof v === "number" && Number.isNaN(v));

// What the box should show for a value coming from state. With zeroAsEmpty, a 0 that only means
// "nothing entered yet" shows as a blank box (so the placeholder is visible) instead of "0".
export function toDraft(value, zeroAsEmpty = false) {
  if (isEmpty(value)) return "";
  if (zeroAsEmpty && Number(value) === 0) return "";
  return stripLeadingZeros(value);
}

// True when the text being typed already represents `value`, so an incoming prop must not
// overwrite it (e.g. "1." while typing 1.5, or "" while a 0-means-empty field is cleared).
export function draftMatchesValue(draft, value, zeroAsEmpty = false) {
  if (draft === "") return isEmpty(value) || (zeroAsEmpty && Number(value) === 0);
  if (isEmpty(value)) return false;
  return Number(draft) === Number(value);
}

// Parse a draft for state that stores numbers: "" stays "" so callers can tell "blank" from 0.
export const parseNumberDraft = (draft) => (draft === "" ? "" : Number(draft));

// Age, height and weight all need a real positive number before targets can be built from them.
export const hasBodyStats = (f) => [f.age, f.heightCm, f.weightKg].every((v) => typeof v === "number" && v > 0);
