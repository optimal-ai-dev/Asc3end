import React, { useState } from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { NumberInput } from "./NumberInput";
import { Onboarding } from "../pages/Onboarding";

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
});

// Mimics the browser: the DOM value becomes whatever the user has typed, then "input" fires.
const typeInto = (input, text) => act(() => {
  const setter = Object.getOwnPropertyDescriptor(HTMLInputElement.prototype, "value").set;
  setter.call(input, text);
  input.dispatchEvent(new Event("input", { bubbles: true }));
});

// A parent that stores a *number*, the setup that used to leave "014" on screen.
function NumericParent({ initial, onValue, zeroAsEmpty }) {
  const [n, setN] = useState(initial);
  return <NumberInput aria-label="num" zeroAsEmpty={zeroAsEmpty} value={n} onChange={(v) => { const next = v === "" ? 0 : +v; setN(next); onValue?.(next); }} />;
}

describe("NumberInput", () => {
  it("removes a leading zero typed after the field showed 0", () => {
    const onValue = vi.fn();
    act(() => root.render(<NumericParent initial={0} onValue={onValue} />));
    const input = container.querySelector("input");
    typeInto(input, "014");
    expect(input.value).toBe("14");
    expect(onValue).toHaveBeenLastCalledWith(14);
  });

  it("shows blank, not 0, for an empty field with zeroAsEmpty", () => {
    act(() => root.render(<NumericParent initial={0} zeroAsEmpty />));
    const input = container.querySelector("input");
    expect(input.value).toBe("");
    typeInto(input, "5");
    typeInto(input, "");
    expect(input.value).toBe("");
  });

  it("keeps a half-typed decimal and follows outside resets", () => {
    let setOutside;
    function Parent() {
      const [s, setS] = useState("");
      setOutside = setS;
      return <NumberInput aria-label="num" value={s} onChange={setS} />;
    }
    act(() => root.render(<Parent />));
    const input = container.querySelector("input");
    typeInto(input, "00.5");
    expect(input.value).toBe("0.5");
    act(() => setOutside(""));
    expect(input.value).toBe("");
  });
});

describe("NumberInput on a phone", () => {
  it("is a text box with a number keypad, so the screen always shows exactly the cleaned value", () => {
    act(() => root.render(<NumericParent initial={25} />));
    const input = container.querySelector("input");
    expect(input.type).toBe("text");
    expect(input.getAttribute("inputmode")).toBe("decimal");
  });

  it("clearing a prefilled age then typing a new one never leaves a 0 in front", () => {
    const onValue = vi.fn();
    function AgeParent() {
      const [age, setAge] = useState(25);
      return <NumberInput aria-label="age" inputMode="numeric" value={age} onChange={(v) => { const n = v === "" ? "" : +v; setAge(n); onValue(n); }} />;
    }
    act(() => root.render(<AgeParent />));
    const input = container.querySelector("input");
    typeInto(input, "2");
    typeInto(input, "");
    expect(input.value).toBe("");
    typeInto(input, "0");
    typeInto(input, "03");
    typeInto(input, "032");
    expect(input.value).toBe("32");
    expect(onValue).toHaveBeenLastCalledWith(32);
  });

  it("drops letters, reads a comma as a decimal point and keeps whole-number boxes whole", () => {
    act(() => root.render(<NumberInput aria-label="kg" value="" onChange={() => {}} />));
    const kg = container.querySelector("input");
    typeInto(kg, "62,5kg");
    expect(kg.value).toBe("62.5");
    act(() => root.render(<NumberInput aria-label="reps" inputMode="numeric" value="" onChange={() => {}} />));
    const reps = container.querySelector("input");
    typeInto(reps, "08.");
    expect(reps.value).toBe("8");
  });

  it("selects the number already in the box when tapped, so typing replaces it", () => {
    act(() => root.render(<NumericParent initial={75} />));
    const input = container.querySelector("input");
    act(() => input.focus());
    expect(input.selectionStart).toBe(0);
    expect(input.selectionEnd).toBe(2);
  });
});

describe("Onboarding body stats", () => {
  const inputs = () => container.querySelectorAll("input[inputmode]");
  const continueBtn = () => [...container.querySelectorAll("button")].find((b) => b.textContent === "Continue");

  it("never shows a leading zero when age, height and weight are retyped", () => {
    act(() => root.render(<Onboarding onComplete={() => {}} />));
    typeInto(container.querySelector('input[placeholder="Your name"]'), "Tarique");
    const [age, height, weight] = inputs();
    for (const [el, text] of [[age, "17"], [height, "168"], [weight, "58"]]) {
      typeInto(el, "");
      expect(el.value).toBe("");
      typeInto(el, "0" + text); // what the browser reports if a 0 was left in the box
      expect(el.value).toBe(text);
    }
    expect(continueBtn().disabled).toBe(false);
  });

  it("blocks Continue for anyone under the minimum age of 16", () => {
    act(() => root.render(<Onboarding onComplete={() => {}} />));
    typeInto(container.querySelector('input[placeholder="Your name"]'), "Tarique");
    typeInto(inputs()[0], "14");
    expect(continueBtn().disabled).toBe(true);
    expect(container.textContent).toContain("you need to be at least 16");
    typeInto(inputs()[0], "16");
    expect(continueBtn().disabled).toBe(false);
  });

  it("blocks Continue while a stat is blank instead of saving 0", () => {
    act(() => root.render(<Onboarding onComplete={() => {}} />));
    typeInto(container.querySelector('input[placeholder="Your name"]'), "Tarique");
    typeInto(inputs()[0], "");
    expect(continueBtn().disabled).toBe(true);
    expect(container.textContent).toContain("Enter your age, height and weight to continue.");
  });
});
