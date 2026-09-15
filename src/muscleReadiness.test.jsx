import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach } from "vitest";
import { act } from "react";
import {
  muscleReadiness, regionForExercise, MUSCLE_REGIONS, READINESS_COLORS, READINESS_LABEL,
  FrontBodyFigure, BackBodyFigure, EXERCISES,
} from "./App.jsx";

function uid() { return Math.random().toString(36).slice(2); }
function isoDaysAgo(n) {
  const d = new Date();
  d.setDate(d.getDate() - n);
  return d.toISOString().slice(0, 10);
}
function workout(daysAgo, exerciseName, sets = [{ weight: 50, reps: 8, type: "working" }]) {
  return { id: uid(), date: isoDaysAgo(daysAgo), exercises: [{ name: exerciseName, sets }] };
}

describe("MUSCLE_REGIONS — the 17 required regions exist, one entry each", () => {
  it("has exactly 17 regions with the requested ids", () => {
    const expected = [
      "chest", "frontDelts", "sideDelts", "rearDelts", "biceps", "triceps", "forearms",
      "abs", "obliques", "traps", "upperBack", "lats", "lowerBack", "glutes", "quads", "hamstrings", "calves",
    ];
    expect(MUSCLE_REGIONS.map((r) => r.id).sort()).toEqual([...expected].sort());
    expect(MUSCLE_REGIONS).toHaveLength(17);
  });

  it("every region declares a view of front, back, or both", () => {
    MUSCLE_REGIONS.forEach((r) => expect(["front", "back", "both"]).toContain(r.view));
  });
});

describe("READINESS_COLORS / READINESS_LABEL — the 4 required states, shared tokens only", () => {
  it("defines exactly ready, partial, fatigued, unknown", () => {
    expect(Object.keys(READINESS_COLORS).sort()).toEqual(["fatigued", "partial", "ready", "unknown"]);
    expect(Object.keys(READINESS_LABEL).sort()).toEqual(["fatigued", "partial", "ready", "unknown"]);
  });

  it("every color is a CSS variable reference, never a literal hex", () => {
    Object.values(READINESS_COLORS).forEach((v) => expect(v).toMatch(/^var\(--readiness-/));
  });

  it("unknown is labeled as insufficient data, not a fabricated status", () => {
    expect(READINESS_LABEL.unknown).toBe("Insufficient data");
  });
});

describe("regionForExercise — muscle-to-SVG-region mapping", () => {
  it("maps every real (muscle, pose) pair in EXERCISES to a real region id", () => {
    const regionIds = new Set(MUSCLE_REGIONS.map((r) => r.id));
    const unmapped = EXERCISES.filter((ex) => !regionIds.has(regionForExercise(ex)));
    expect(unmapped, `exercises with no region: ${unmapped.map((e) => e.name).join(", ")}`).toEqual([]);
  });

  it("a curl maps to biceps, a lateral raise to side delts, a leg curl to hamstrings", () => {
    expect(regionForExercise({ muscle: "arms", pose: "curl" })).toBe("biceps");
    expect(regionForExercise({ muscle: "shoulders", pose: "lateral_raise" })).toBe("sideDelts");
    expect(regionForExercise({ muscle: "legs", pose: "leg_curl" })).toBe("hamstrings");
  });

  it("falls back to a representative region for a custom exercise with no pose", () => {
    expect(regionForExercise({ muscle: "arms", pose: undefined })).toBe("biceps");
    expect(regionForExercise({ muscle: "core", pose: undefined })).toBe("abs");
  });

  it("returns null for a missing exercise instead of throwing", () => {
    expect(regionForExercise(null)).toBeNull();
    expect(regionForExercise(undefined)).toBeNull();
  });
});

describe("muscleReadiness — no-history and per-region state", () => {
  it("reports every region as 'unknown' with no fabricated percentage for a brand-new account", () => {
    const readiness = muscleReadiness([], []);
    MUSCLE_REGIONS.forEach((r) => {
      expect(readiness[r.id].level).toBe("unknown");
      expect(readiness[r.id].recoveryPercent).toBeNull();
    });
  });

  it("a set logged today makes that region 'fatigued', not 'ready'", () => {
    const readiness = muscleReadiness([workout(0, "Barbell Bench Press")], []);
    expect(readiness.chest.level).toBe("fatigued");
  });

  it("a set logged 3 days ago makes that region 'ready'", () => {
    const readiness = muscleReadiness([workout(3, "Barbell Bench Press")], []);
    expect(readiness.chest.level).toBe("ready");
  });

  it("regions are independent — training chest doesn't change quads", () => {
    const readiness = muscleReadiness([workout(0, "Barbell Bench Press")], []);
    expect(readiness.chest.level).toBe("fatigued");
    expect(readiness.quads.level).toBe("unknown");
  });

  it("counts sets logged in the last 7 days as recent workload", () => {
    const readiness = muscleReadiness([workout(1, "Barbell Curl", [{ weight: 20, reps: 10, type: "working" }, { weight: 20, reps: 10, type: "working" }])], []);
    expect(readiness.biceps.recentSets).toBe(2);
  });

  it("recomputes correctly after a workout is deleted from the array", () => {
    const workouts = [workout(0, "Barbell Bench Press")];
    expect(muscleReadiness(workouts, []).chest.level).toBe("fatigued");
    expect(muscleReadiness([], []).chest.level).toBe("unknown");
  });

  it("recomputes correctly after a workout is edited to a different exercise", () => {
    const original = [workout(0, "Barbell Bench Press")];
    const edited = [workout(0, "Back Squat")];
    expect(muscleReadiness(original, []).chest.level).toBe("fatigued");
    expect(muscleReadiness(edited, []).chest.level).toBe("unknown");
    expect(muscleReadiness(edited, []).quads.level).toBe("fatigued");
  });

  it("multiple workouts logged on the same day both contribute their sets", () => {
    const workouts = [workout(0, "Barbell Curl"), workout(0, "Barbell Curl")];
    expect(muscleReadiness(workouts, []).biceps.recentSets).toBe(2);
  });

  it("a custom exercise with no pose still counts toward its group's default region", () => {
    const customExercises = [{ name: "My Custom Move", muscle: "back", equipment: "Cable" }];
    const readiness = muscleReadiness([workout(0, "My Custom Move")], customExercises);
    expect(readiness.upperBack.level).toBe("fatigued");
  });

  it("an exercise with no matching entry in EXERCISES or customExercises is safely ignored", () => {
    expect(() => muscleReadiness([workout(0, "Not A Real Exercise")], [])).not.toThrow();
  });
});

describe("FrontBodyFigure / BackBodyFigure — rendering and interaction", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  it("renders one selectable region per front-view muscle, each as an accessible button", () => {
    const readiness = muscleReadiness([], []);
    const frontCount = MUSCLE_REGIONS.filter((r) => r.view === "front" || r.view === "both").length;
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<FrontBodyFigure readiness={readiness} selected={null} onSelect={() => {}} />); });
    const buttons = container.querySelectorAll('[role="button"]');
    expect(buttons).toHaveLength(frontCount);
    buttons.forEach((b) => {
      expect(b.getAttribute("tabindex")).toBe("0");
      expect(b.getAttribute("aria-label")).toMatch(/: (Ready|Partially recovered|Fatigued|Insufficient data)$/);
    });
  });

  it("clicking a region calls onSelect with that region's id", () => {
    const readiness = muscleReadiness([], []);
    let selectedId = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<FrontBodyFigure readiness={readiness} selected={null} onSelect={(id) => { selectedId = id; }} />); });
    const chestButton = [...container.querySelectorAll('[role="button"]')].find((b) => b.getAttribute("aria-label").startsWith("Chest:"));
    act(() => { chestButton.dispatchEvent(new MouseEvent("click", { bubbles: true })); });
    expect(selectedId).toBe("chest");
  });

  it("pressing Enter on a focused region calls onSelect (keyboard operable)", () => {
    const readiness = muscleReadiness([], []);
    let selectedId = null;
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<FrontBodyFigure readiness={readiness} selected={null} onSelect={(id) => { selectedId = id; }} />); });
    const chestButton = [...container.querySelectorAll('[role="button"]')].find((b) => b.getAttribute("aria-label").startsWith("Chest:"));
    act(() => { chestButton.dispatchEvent(new KeyboardEvent("keydown", { key: "Enter", bubbles: true, cancelable: true })); });
    expect(selectedId).toBe("chest");
  });

  it("aria-pressed reflects the selected region", () => {
    const readiness = muscleReadiness([], []);
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<FrontBodyFigure readiness={readiness} selected="chest" onSelect={() => {}} />); });
    const chestButton = [...container.querySelectorAll('[role="button"]')].find((b) => b.getAttribute("aria-label").startsWith("Chest:"));
    const otherButton = [...container.querySelectorAll('[role="button"]')].find((b) => !b.getAttribute("aria-label").startsWith("Chest:"));
    expect(chestButton.getAttribute("aria-pressed")).toBe("true");
    expect(otherButton.getAttribute("aria-pressed")).toBe("false");
  });

  it("BackBodyFigure renders a different, non-overlapping set of regions than FrontBodyFigure", () => {
    const readiness = muscleReadiness([], []);
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<BackBodyFigure readiness={readiness} selected={null} onSelect={() => {}} />); });
    const labels = [...container.querySelectorAll('[role="button"]')].map((b) => b.getAttribute("aria-label").split(":")[0]);
    expect(labels).toContain("Lats");
    expect(labels).toContain("Glutes");
    expect(labels).not.toContain("Chest");
  });
});
