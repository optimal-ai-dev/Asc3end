import { useEffect, useState } from "react";
import { cleanNumberText, draftMatchesValue, toDraft } from "../lib/numberInput";

// The one input used for every numeric field in the app (age, height, bodyweight, set weight and
// reps, food amounts, macros, water). It never shows a leading zero ("014" becomes "14") and
// shows a blank box rather than "0" for an empty field. onChange receives the cleaned string
// ("" when cleared), not the DOM event.
//
// It is deliberately type="text" with a numeric keypad (inputMode), not type="number". On iOS a
// number input hands React a different string from what is on screen in several cases (the box
// can keep a "0" React can't see or clear), so the leading-zero fix in #24 still let a 0 linger
// on a phone. With a text input the box shows exactly the cleaned draft, every time.
export function NumberInput({ value, onChange, zeroAsEmpty = false, inputMode = "decimal", onFocus, ...rest }) {
  const [draft, setDraft] = useState(() => toDraft(value, zeroAsEmpty));

  // Follow changes made outside the box (a reset after logging, a prefill), but leave the text
  // alone when it already means the same number as the new value.
  useEffect(() => {
    setDraft((d) => (draftMatchesValue(d, value, zeroAsEmpty) ? d : toDraft(value, zeroAsEmpty)));
  }, [value, zeroAsEmpty]);

  // Drop the props that only make sense on type="number" so they don't end up on a text input.
  const { min: _min, max: _max, step: _step, ...inputProps } = rest;

  return (
    <input
      type="text"
      inputMode={inputMode}
      autoComplete="off"
      {...inputProps}
      value={draft}
      // Tapping a box that already holds a number (age 25, a prefilled weight) selects it, so the
      // first key typed replaces it instead of being added next to it.
      onFocus={(e) => { e.target.select?.(); onFocus?.(e); }}
      onChange={(e) => {
        const next = cleanNumberText(e.target.value, inputMode !== "numeric");
        setDraft(next);
        onChange?.(next);
      }}
    />
  );
}
