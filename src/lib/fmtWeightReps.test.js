import { describe, it, expect } from "vitest";
import { fmtWeightReps, formatSet } from "./workoutHelpers";

describe("fmtWeightReps", () => {
  it("shows load × reps, or BW for an unloaded bodyweight set", () => {
    expect(fmtWeightReps(82.5, 6)).toBe("82.5kg × 6");
    expect(fmtWeightReps(0, 10)).toBe("BW × 10");
  });
  it("is what formatSet uses for weight × reps sets", () => {
    expect(formatSet({ weight: 0, reps: 10 })).toBe("BW × 10");
  });
});
