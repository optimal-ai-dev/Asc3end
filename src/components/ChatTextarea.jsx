import { useEffect, useRef } from "react";

// Touch keyboards have no Shift key, so on a phone Return adds a line and the Send button sends.
// With a real keyboard (fine pointer) Enter sends and Shift+Enter adds a line, like most chat apps.
const enterSends = () => window.matchMedia?.("(pointer: fine)").matches ?? true;

/* A message box that wraps onto new lines and grows with its text up to maxHeight, then scrolls.
   Same look as .atlas-input. */
export function ChatTextarea({ value, onChange, onSend, placeholder, maxHeight = 140, ...rest }) {
  const ref = useRef(null);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;
    el.style.height = "auto";
    el.style.height = `${Math.min(el.scrollHeight, maxHeight)}px`;
    el.style.overflowY = el.scrollHeight > maxHeight ? "auto" : "hidden";
  }, [value, maxHeight]);

  const onKeyDown = (e) => {
    if (e.key !== "Enter" || e.shiftKey || e.nativeEvent?.isComposing) return;
    if (!enterSends()) return;
    e.preventDefault();
    onSend();
  };

  return (
    <textarea
      ref={ref}
      className="atlas-input"
      rows={1}
      placeholder={placeholder}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      onKeyDown={onKeyDown}
      style={{ flex: 1, resize: "none", lineHeight: 1.4, maxHeight, fontFamily: "inherit", display: "block" }}
      {...rest}
    />
  );
}
