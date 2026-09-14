import { describe, it, expect } from "vitest";
import { EXERCISES, POSES, POSES_FINISH, POSE_TIPS, SECONDARY_MUSCLES } from "./App.jsx";

// The illustration system's core promise is "never show a broken image" — every exercise in the
// library references a `pose` key, and ExerciseFigure falls back to POSES.squat at runtime if a
// key is ever missing, so a typo wouldn't crash the app. But that fallback would also silently
// mask a real content bug (an exercise quietly showing the wrong illustration) unless something
// actually checks the mapping is complete — that's what this file is for.
describe("exercise illustration data integrity", () => {
  it("every exercise's pose key has a real entry in POSES — none silently fall back to the generic default", () => {
    const missing = EXERCISES.filter((e) => !POSES[e.pose]).map((e) => `${e.name} -> ${e.pose}`);
    expect(missing, `these exercises reference a pose with no POSES entry: ${missing.join(", ")}`).toEqual([]);
  });

  it("every exercise's pose key has form-cue content (POSE_TIPS) — the detail screen shouldn't show an empty cues list", () => {
    const missing = EXERCISES.filter((e) => !POSE_TIPS[e.pose] || POSE_TIPS[e.pose].length === 0).map((e) => `${e.name} -> ${e.pose}`);
    expect(missing, `these exercises have no form cues: ${missing.join(", ")}`).toEqual([]);
  });

  it("every POSES_FINISH override key corresponds to a real pose (no orphaned finish-state data)", () => {
    const orphaned = Object.keys(POSES_FINISH).filter((pose) => !POSES[pose]);
    expect(orphaned).toEqual([]);
  });

  it("every pose used by at least one exercise has each joint referenced by ExerciseFigure defined (no undefined-coordinate crash risk)", () => {
    const requiredJoints = ["head", "neck", "shoulderL", "shoulderR", "elbowL", "elbowR", "handL", "handR", "hip", "kneeL", "kneeR", "ankleL", "ankleR"];
    const posesInUse = new Set(EXERCISES.map((e) => e.pose));
    for (const pose of posesInUse) {
      const cfg = POSES[pose];
      for (const joint of requiredJoints) {
        expect(cfg[joint], `POSES.${pose}.${joint} is missing`).toBeDefined();
      }
    }
  });

  it("every POSES_FINISH override only touches joints that actually exist on the base pose (no typo'd joint name)", () => {
    const requiredJoints = new Set(["head", "neck", "shoulderL", "shoulderR", "elbowL", "elbowR", "handL", "handR", "hip", "kneeL", "kneeR", "ankleL", "ankleR"]);
    for (const [pose, overrides] of Object.entries(POSES_FINISH)) {
      for (const key of Object.keys(overrides)) {
        expect(requiredJoints.has(key), `POSES_FINISH.${pose} has an unrecognized joint key "${key}"`).toBe(true);
      }
    }
  });

  it("SECONDARY_MUSCLES only lists real muscle-group names", () => {
    const validGroups = new Set(["chest", "back", "shoulders", "arms", "legs", "core"]);
    for (const [pose, groups] of Object.entries(SECONDARY_MUSCLES)) {
      for (const g of groups) {
        expect(validGroups.has(g), `SECONDARY_MUSCLES.${pose} lists an unrecognized group "${g}"`).toBe(true);
      }
    }
  });

  it("a secondary muscle group is never the same as what would be an unusual/duplicate self-reference within one pose's list", () => {
    for (const [pose, groups] of Object.entries(SECONDARY_MUSCLES)) {
      expect(new Set(groups).size, `SECONDARY_MUSCLES.${pose} has a duplicate entry`).toBe(groups.length);
    }
  });
});
