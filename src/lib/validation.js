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
