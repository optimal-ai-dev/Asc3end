import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { ChatTextarea } from "./ChatTextarea";

globalThis.IS_REACT_ACT_ENVIRONMENT = true;

let container, root;
beforeEach(() => {
  container = document.createElement("div");
  document.body.appendChild(container);
  root = createRoot(container);
});
afterEach(() => {
  act(() => root.unmount());
  container.remove();
  delete window.matchMedia;
});

const pointer = (fine) => { window.matchMedia = () => ({ matches: fine }); };
const press = (el, opts) => {
  const e = new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true, ...opts });
  act(() => el.dispatchEvent(e));
  return e;
};

describe("ChatTextarea", () => {
  it("is a multi-line textarea", () => {
    act(() => root.render(<ChatTextarea value={"line one\nline two"} onChange={() => {}} onSend={() => {}} />));
    const ta = container.querySelector("textarea");
    expect(ta).not.toBeNull();
    expect(ta.value).toBe("line one\nline two");
  });

  it("sends on Enter with a keyboard, and Shift+Enter adds a line instead", () => {
    pointer(true);
    const onSend = vi.fn();
    act(() => root.render(<ChatTextarea value="hi" onChange={() => {}} onSend={onSend} />));
    const ta = container.querySelector("textarea");
    expect(press(ta).defaultPrevented).toBe(true);
    expect(onSend).toHaveBeenCalledTimes(1);
    expect(press(ta, { shiftKey: true }).defaultPrevented).toBe(false);
    expect(onSend).toHaveBeenCalledTimes(1);
  });

  it("lets Return add a line on a touch screen", () => {
    pointer(false);
    const onSend = vi.fn();
    act(() => root.render(<ChatTextarea value="hi" onChange={() => {}} onSend={onSend} />));
    expect(press(container.querySelector("textarea")).defaultPrevented).toBe(false);
    expect(onSend).not.toHaveBeenCalled();
  });
});
