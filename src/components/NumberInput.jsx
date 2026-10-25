import { useEffect, useState } from "react";
import { draftMatchesValue, stripLeadingZeros, toDraft } from "../lib/numberInput";

// Drop-in replacement for <input type="number"> used for every numeric field in the app. It
// never shows a leading zero ("014" becomes "14") and shows a blank box rather than "0" for an
// empty field. onChange receives the cleaned string ("" when cleared), not the DOM event.
export function NumberInput({ value, onChange, zeroAsEmpty = false, ...rest }) {
  const [draft, setDraft] = useState(() => toDraft(value, zeroAsEmpty));

  // Follow changes made outside the box (a reset after logging, a prefill), but leave the text
  // alone when it already means the same number as the new value.
  useEffect(() => {
    setDraft((d) => (draftMatchesValue(d, value, zeroAsEmpty) ? d : toDraft(value, zeroAsEmpty)));
  }, [value, zeroAsEmpty]);

  return (
    <input
      type="number"
      {...rest}
      value={draft}
      onChange={(e) => {
        const next = stripLeadingZeros(e.target.value);
        setDraft(next);
        onChange?.(next);
      }}
    />
  );
}
