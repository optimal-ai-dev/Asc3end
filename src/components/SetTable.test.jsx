import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach, beforeEach } from "vitest";
import { act } from "react";
import { SetTable } from "./SetTable";

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

const render = (props) => act(() => root.render(
  <SetTable exName="Bench" sets={[]} targetSets={3} previous={[]} suggestedWeight={null} onLog={() => {}} onRemove={() => {}} isPR={() => false} {...props} />
));
const byLabel = (l) => container.querySelector(`[aria-label="${l}"]`);

describe("SetTable", () => {
  it("shows one row per planned set, pre-filled from last session", () => {
    render({ previous: [{ weight: 80, reps: 8 }, { weight: 80, reps: 7 }] });
    expect(container.querySelectorAll("tbody tr")).toHaveLength(3);
    expect(byLabel("Set 1 weight in kg for Bench").placeholder).toBe("80");
    expect(byLabel("Set 2 reps for Bench").placeholder).toBe("7");
    // Row 3 has no previous set of its own, so it borrows last session's final set.
    expect(byLabel("Set 3 reps for Bench").placeholder).toBe("7");
  });

  it("logs a set from its placeholders in one tap", () => {
    const onLog = vi.fn();
    render({ previous: [{ weight: 80, reps: 8 }], onLog });
    act(() => byLabel("Log set 1 of Bench").click());
    expect(onLog).toHaveBeenCalledWith({ weight: 80, reps: 8, type: "normal" });
  });

  it("does nothing when there's no value to log", () => {
    const onLog = vi.fn();
    render({ onLog });
    act(() => byLabel("Log set 1 of Bench").click());
    expect(onLog).not.toHaveBeenCalled();
  });

  it("cycles set type from the set number and logs it with the set", () => {
    const onLog = vi.fn();
    render({ previous: [{ weight: 40, reps: 10 }], onLog });
    act(() => byLabel("Set 1 type: Normal. Tap to change").click());
    expect(byLabel("Set 1 type: Warm-up. Tap to change").textContent).toBe("W");
    act(() => byLabel("Log set 1 of Bench").click());
    expect(onLog).toHaveBeenCalledWith({ weight: 40, reps: 10, type: "warmup" });
  });

  it("un-logs a done set from its check", () => {
    const onRemove = vi.fn();
    render({ sets: [{ weight: 80, reps: 8, type: "normal" }], onRemove });
    act(() => byLabel("Un-log set 1 of Bench").click());
    expect(onRemove).toHaveBeenCalledWith(0);
  });
});
