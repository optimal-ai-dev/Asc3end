import { describe, it, expect } from "vitest";
import { readinessByGroup } from "./workoutHelpers";

describe("readinessByGroup", () => {
  it("takes the most fatigued region with data in each group", () => {
    const groups = readinessByGroup({ quads: { level: "ready" }, hamstrings: { level: "fatigued" }, chest: { level: "partial" } });
    expect(groups.legs).toBe("fatigued");
    expect(groups.chest).toBe("partial");
  });
  it("marks a group with no data as unknown", () => {
    expect(readinessByGroup({}).back).toBe("unknown");
  });
});
