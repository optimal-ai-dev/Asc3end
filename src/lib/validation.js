// Item-level validators for data loaded from storage. Checking that a stored value is an array
// is not enough — a malformed/truncated write, or a row left over from an old app version, can
// be an array of the wrong shape (e.g. `customExercises: [1, 2, 3]` instead of exercise objects),
// which crashes any code that assumes each item has the expected fields (found live: Train's
// exercise search does `e.name.toLowerCase()`, which throws on an item with no `.name`).
// Every filter below degrades a bad item out of the list instead of letting it reach a component.

const isNonEmptyString = (v) => typeof v === "string" && v.length > 0;
const isFiniteNumber = (v) => typeof v === "number" && Number.isFinite(v);

export function isValidCustomExercise(e) {
  return !!e && typeof e === "object" && isNonEmptyString(e.name) && isNonEmptyString(e.muscle) && isNonEmptyString(e.equipment);
}

export function isValidWorkout(w) {
  return !!w && typeof w === "object" && isNonEmptyString(w.id) && isNonEmptyString(w.date) && Array.isArray(w.exercises);
}

export function isValidFoodEntry(f) {
  return !!f && typeof f === "object" && isNonEmptyString(f.id) && isNonEmptyString(f.date) && isNonEmptyString(f.name) && isFiniteNumber(f.calories);
}

export function isValidWeightEntry(w) {
  return !!w && typeof w === "object" && isNonEmptyString(w.date) && isFiniteNumber(w.weight);
}

export function isValidFavorite(f) {
  return !!f && typeof f === "object" && isNonEmptyString(f.name) && isFiniteNumber(f.calories);
}

export function isValidChatMessage(m) {
  return !!m && typeof m === "object" && (m.role === "user" || m.role === "assistant") && typeof m.content === "string";
}

// Sane bounds for a manually-entered daily nutrition target — wide enough to cover legitimate
// extremes (a very large bodybuilder bulking, a small person cutting aggressively under medical
// supervision) without accepting obvious garbage (negative numbers, a stray extra zero). Used by
// both the client (instant feedback) and api/save-nutrition-targets.js (the actual enforcement —
// a client-side check alone would let a modified client write anything).
const MACRO_BOUNDS = {
  calories: [800, 6000],
  protein: [0, 600],
  carbs: [0, 900],
  fat: [0, 300],
};

/** @returns {string|null} an error message, or null if valid */
export function validateMacroOverride(macros) {
  if (!macros || typeof macros !== "object") return "Targets must be an object.";
  for (const key of ["calories", "protein", "carbs", "fat"]) {
    const [min, max] = MACRO_BOUNDS[key];
    const v = macros[key];
    if (!Number.isFinite(v)) return `${key} must be a number.`;
    if (!Number.isInteger(v)) return `${key} must be a whole number.`;
    if (v < min || v > max) return `${key} must be between ${min} and ${max}.`;
  }
  return null;
}

// Applies a validator to every item of a value that should be an array, dropping anything that
// doesn't pass and coercing a non-array (or missing) value to an empty array. Never throws.
export function sanitizeList(value, validator) {
  if (!Array.isArray(value)) return [];
  return value.filter((item) => {
    try {
      return validator(item);
    } catch (e) {
      return false;
    }
  });
}
