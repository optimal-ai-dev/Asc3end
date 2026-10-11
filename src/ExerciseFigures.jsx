import React, { useState, useId } from "react";
import { Camera, Plus } from "lucide-react";
import {
  MUSCLE_GROUPS, MUSCLE_POSITIONS, EQUIPMENT_COLORS, REGION_LABEL, regionForExercise, getExerciseGuidance,
} from "./exerciseData.js";
import { FIGURE_RULES } from "./exerciseMedia.js";

// Exercise illustrations and the exercise detail card, extracted from App.jsx. Which exercises may
// show a figure at all is decided per exercise by figureFidelity() in exerciseMedia.js.

/* Reusable body silhouette that highlights a single muscle group — used in the exercise library */
export function MuscleIcon({ muscle, size = 46 }) {
  return (
    <svg viewBox="0 0 100 100" width={size} height={size} style={{ flexShrink: 0 }}>
      <ellipse cx="50" cy="10" rx="7" ry="7" fill="var(--bg-elev2)" stroke="var(--line)" />
      <rect x="42" y="18" width="16" height="66" rx="8" fill="var(--bg-elev2)" stroke="var(--line)" />
      {MUSCLE_GROUPS.map((m) => {
        const [x, y] = MUSCLE_POSITIONS[m];
        const active = m === muscle;
        return <circle key={m} cx={x} cy={y} r={active ? 9 : 5} fill={active ? "var(--brass)" : "var(--bg-elev2)"} stroke={active ? "none" : "var(--line)"} opacity={active ? 1 : 0.6} />;
      })}
    </svg>
  );
}

/* ------------------------------------------------------------------ */
/* ExerciseFigure — a stylized 2.5D athlete illustration per movement pattern */
/* ------------------------------------------------------------------ */
// Replaces the earlier "stick figure" renderer (circle head + bare lines) with a genuinely
// different rendering approach: a tapered polygon torso (not a uniform-width line-capsule),
// a non-circular head with a jaw taper, two-segment tapered limbs with hand/foot shapes at the
// contact points, a dark-neutral body base, and per-body-region muscle coloring (primary/
// secondary/non-target, three distinct colors, never relying on a single glow dot) plus a thin
// green rim-light outline. Honest framing: this is hand-authored SVG vector geometry, not
// commercial illustrator artwork or AI-generated imagery — a genuinely different, more
// anatomically-proportioned style than the old stick figure, not photorealistic anatomy.
//
// POSES below is unchanged from the original system (each exercise already carries a `pose` key
// — this was already the "structured metadata" a scalable illustration system needs, just never
// rendered well). It now doubles as the START reference state. POSES_FINISH hand-authors a
// genuinely distinct FINISH (contracted/loaded) state for the movement patterns behind this
// app's highest-traffic exercises — the toggle is hidden for any pose without one, rather than
// faking a finish state that wasn't actually designed.

const STANDING = { head: [50, 13], neck: [50, 22], shoulderL: [38, 28], shoulderR: [62, 28], hip: [50, 62], kneeL: [42, 86], ankleL: [39, 110], kneeR: [58, 86], ankleR: [61, 110] };

export const POSES = {
  press_lying: { head: [16, 50], neck: [24, 52], shoulderL: [30, 52], shoulderR: [30, 58], elbowL: [28, 35], elbowR: [30, 40], handL: [30, 18], handR: [34, 20], hip: [58, 55], kneeL: [74, 58], ankleL: [84, 72], kneeR: [76, 62], ankleR: [86, 76], props: [{ type: "rect", x: 8, y: 58, w: 64, h: 8 }, { type: "line", x1: 20, y1: 16, x2: 44, y2: 16, width: 4 }] },
  press_seated_machine: { head: [50, 26], neck: [50, 34], shoulderL: [42, 38], shoulderR: [58, 38], elbowL: [36, 44], elbowR: [64, 44], handL: [30, 50], handR: [70, 50], hip: [50, 74], kneeL: [38, 90], ankleL: [34, 110], kneeR: [62, 90], ankleR: [66, 110], props: [{ type: "rect", x: 30, y: 75, w: 40, h: 10 }] },
  push_up: { head: [14, 48], neck: [22, 50], shoulderL: [28, 50], shoulderR: [28, 54], elbowL: [26, 66], elbowR: [30, 68], handL: [24, 80], handR: [28, 82], hip: [58, 52], kneeL: [78, 50], ankleL: [92, 46], kneeR: [78, 54], ankleR: [92, 50] },
  dip: { head: [50, 20], neck: [50, 28], shoulderL: [40, 32], shoulderR: [60, 32], elbowL: [30, 45], elbowR: [70, 45], handL: [35, 60], handR: [65, 60], hip: [50, 60], kneeL: [45, 85], ankleL: [42, 105], kneeR: [55, 85], ankleR: [58, 105], props: [{ type: "line", x1: 30, y1: 55, x2: 30, y2: 75, width: 3 }, { type: "line", x1: 70, y1: 55, x2: 70, y2: 75, width: 3 }] },
  pullup: { head: [50, 20], neck: [50, 28], shoulderL: [40, 30], shoulderR: [60, 30], elbowL: [36, 18], elbowR: [64, 18], handL: [38, 8], handR: [62, 8], hip: [50, 58], kneeL: [45, 82], ankleL: [42, 105], kneeR: [55, 82], ankleR: [58, 105], props: [{ type: "rect", x: 30, y: 4, w: 40, h: 4 }] },
  pulldown: { head: [50, 25], neck: [50, 33], shoulderL: [40, 37], shoulderR: [60, 37], elbowL: [28, 40], elbowR: [72, 40], handL: [20, 18], handR: [80, 18], hip: [50, 80], kneeL: [38, 92], ankleL: [34, 108], kneeR: [62, 92], ankleR: [66, 108], props: [{ type: "rect", x: 35, y: 85, w: 20, h: 8 }, { type: "line", x1: 15, y1: 16, x2: 85, y2: 16, width: 4 }] },
  row: { head: [20, 30], neck: [28, 34], shoulderL: [34, 38], shoulderR: [34, 42], elbowL: [38, 52], elbowR: [40, 56], handL: [42, 64], handR: [44, 68], hip: [65, 55], kneeL: [72, 78], ankleL: [76, 102], kneeR: [74, 80], ankleR: [78, 104], props: [{ type: "line", x1: 38, y1: 66, x2: 48, y2: 66, width: 4 }] },
  hinge: { head: [20, 28], neck: [28, 32], shoulderL: [34, 36], shoulderR: [34, 40], elbowL: [36, 52], elbowR: [38, 56], handL: [38, 68], handR: [40, 70], hip: [64, 54], kneeL: [70, 76], ankleL: [74, 100], kneeR: [72, 78], ankleR: [76, 102], props: [{ type: "line", x1: 32, y1: 69, x2: 44, y2: 69, width: 4 }] },
  press_overhead: { ...STANDING, elbowL: [34, 20], elbowR: [66, 20], handL: [30, 6], handR: [70, 6], props: [{ type: "line", x1: 28, y1: 4, x2: 72, y2: 4, width: 4 }] },
  lateral_raise: { ...STANDING, elbowL: [36, 45], elbowR: [64, 45], handL: [34, 60], handR: [66, 60] },
  rear_delt: { head: [20, 28], neck: [28, 32], shoulderL: [34, 36], shoulderR: [34, 40], elbowL: [18, 30], elbowR: [24, 50], handL: [8, 26], handR: [20, 60], hip: [64, 54], kneeL: [70, 76], ankleL: [74, 100], kneeR: [72, 78], ankleR: [76, 102] },
  shrug: { ...STANDING, shoulderL: [37, 25], shoulderR: [63, 25], elbowL: [36, 46], elbowR: [64, 46], handL: [34, 58], handR: [66, 58] },
  neck: { ...STANDING, head: [53, 13], elbowL: [40, 20], elbowR: [60, 20], handL: [46, 16], handR: [54, 16] },
  curl: { ...STANDING, elbowL: [38, 50], elbowR: [62, 50], handL: [36, 68], handR: [64, 68] },
  pushdown: { ...STANDING, elbowL: [38, 46], elbowR: [62, 46], handL: [46, 33], handR: [54, 33], scene: "pushdown" },
  triceps_ext: { ...STANDING, elbowL: [38, 42], elbowR: [62, 42], handL: [40, 58], handR: [60, 58], props: [{ type: "line", x1: 50, y1: 0, x2: 50, y2: 16, width: 3 }] },
  wrist_curl: { ...STANDING, hip: [50, 60], elbowL: [40, 48], elbowR: [60, 48], handL: [46, 56], handR: [54, 56] },
  squat: { ...STANDING, hip: [50, 66], kneeL: [38, 90], ankleL: [37, 112], kneeR: [62, 90], ankleR: [63, 112], elbowL: [30, 32], elbowR: [70, 32], handL: [26, 28], handR: [74, 28], props: [{ type: "line", x1: 24, y1: 27, x2: 76, y2: 27, width: 4 }] },
  leg_press: { head: [30, 40], neck: [34, 46], shoulderL: [30, 50], shoulderR: [34, 54], elbowL: [26, 56], elbowR: [28, 58], handL: [24, 64], handR: [26, 66], hip: [38, 66], kneeL: [58, 66], ankleL: [78, 50], kneeR: [60, 70], ankleR: [80, 54], props: [{ type: "rect", x: 15, y: 60, w: 24, h: 30 }, { type: "rect", x: 82, y: 35, w: 8, h: 30 }] },
  lunge: { ...STANDING, hip: [50, 60], kneeL: [35, 85], ankleL: [30, 110], kneeR: [63, 78], ankleR: [70, 60], elbowL: [36, 50], elbowR: [64, 50], handL: [34, 68], handR: [66, 68] },
  leg_extension: { head: [50, 20], neck: [50, 28], shoulderL: [42, 32], shoulderR: [58, 32], elbowL: [38, 48], elbowR: [62, 48], handL: [34, 58], handR: [66, 58], hip: [50, 58], kneeL: [50, 70], ankleL: [75, 66], kneeR: [50, 74], ankleR: [50, 95], props: [{ type: "rect", x: 30, y: 50, w: 40, h: 10 }] },
  leg_curl: { head: [20, 50], neck: [28, 52], shoulderL: [34, 52], shoulderR: [34, 56], elbowL: [26, 60], elbowR: [28, 62], handL: [20, 66], handR: [22, 68], hip: [60, 55], kneeL: [75, 58], ankleL: [80, 38], kneeR: [77, 60], ankleR: [82, 40], props: [{ type: "rect", x: 15, y: 55, w: 55, h: 8 }] },
  hip_thrust: { head: [15, 50], neck: [22, 52], shoulderL: [26, 52], shoulderR: [26, 56], elbowL: [24, 58], elbowR: [26, 60], handL: [20, 64], handR: [22, 66], hip: [48, 50], kneeL: [65, 68], ankleL: [65, 92], kneeR: [67, 70], ankleR: [69, 94], props: [{ type: "rect", x: 8, y: 55, w: 25, h: 8 }] },
  calf_raise: { ...STANDING, elbowL: [36, 45], elbowR: [64, 45], handL: [34, 60], handR: [66, 60] },
  hip_swing: { ...STANDING, kneeR: [75, 70], ankleR: [85, 66], handL: [15, 40], handR: [85, 40], elbowL: [22, 38], elbowR: [78, 38] },
  core_crunch: { head: [30, 45], neck: [35, 48], shoulderL: [40, 50], shoulderR: [40, 54], elbowL: [36, 50], elbowR: [38, 52], handL: [42, 52], handR: [44, 54], hip: [55, 58], kneeL: [65, 50], ankleL: [60, 35], kneeR: [67, 53], ankleR: [62, 38] },
  leg_raise_hang: { head: [50, 20], neck: [50, 28], shoulderL: [40, 30], shoulderR: [60, 30], elbowL: [38, 16], elbowR: [62, 16], handL: [38, 8], handR: [62, 8], hip: [50, 55], kneeL: [52, 68], ankleL: [58, 50], kneeR: [54, 70], ankleR: [60, 52], props: [{ type: "rect", x: 30, y: 4, w: 40, h: 4 }] },
  plank: { head: [14, 50], neck: [22, 50], shoulderL: [28, 50], shoulderR: [28, 54], elbowL: [24, 60], elbowR: [28, 62], handL: [26, 64], handR: [30, 66], hip: [58, 50], kneeL: [80, 50], ankleL: [94, 46], kneeR: [80, 52], ankleR: [94, 50] },
  twist: { head: [50, 25], neck: [50, 33], shoulderL: [40, 38], shoulderR: [60, 38], elbowL: [65, 45], elbowR: [68, 50], handL: [78, 48], handR: [80, 52], hip: [50, 60], kneeL: [38, 75], ankleL: [30, 62], kneeR: [62, 75], ankleR: [70, 62] },
  carry: { ...STANDING, elbowL: [34, 50], elbowR: [66, 50], handL: [32, 70], handR: [68, 70] },
};

// Hand-authored FINISH (contracted/loaded) state for the movement patterns behind this app's
// highest-traffic exercises — POSES above is the START (extended/stretched) reference. Convention
// used throughout: START = limb extended away from the torso (lockout for a press, dead-hang for
// a pull, standing tall for a squat/hinge); FINISH = limb drawn in toward the torso (bar lowered
// to the chest for a press, bar pulled to the body for a pull, hips dropped for a squat) — this
// matches the explicit Barbell Bench Press example given for this feature (start = bar at the top
// near lockout, finish = bar lowered to the chest). Poses with no entry here are genuinely
// isometric holds (plank) or simply weren't hand-tuned in this pass — the UI hides the
// start/finish toggle for those rather than faking a second state that wasn't actually designed.
export const POSES_FINISH = {
  press_lying: { elbowL: [20, 48], elbowR: [22, 52], handL: [24, 54], handR: [27, 58] },
  press_seated_machine: { handL: [20, 40], handR: [80, 40], elbowL: [30, 38], elbowR: [70, 38] },
  press_overhead: { handL: [34, 42], handR: [66, 42], elbowL: [30, 40], elbowR: [70, 40] },
  lateral_raise: { elbowL: [20, 30], elbowR: [80, 30], handL: [8, 28], handR: [92, 28] },
  pullup: { head: [50, 10], neck: [50, 16], shoulderL: [40, 20], shoulderR: [60, 20], elbowL: [32, 14], elbowR: [68, 14], hip: [50, 45], kneeL: [43, 69], ankleL: [40, 92], kneeR: [57, 69], ankleR: [60, 92] },
  pulldown: { elbowL: [25, 55], elbowR: [75, 55], handL: [35, 70], handR: [65, 70] },
  row: { elbowL: [30, 45], elbowR: [32, 48], handL: [26, 50], handR: [28, 54] },
  squat: { hip: [50, 88], kneeL: [36, 92], kneeR: [64, 92] },
  hinge: { head: [50, 15], neck: [50, 22], shoulderL: [42, 26], shoulderR: [58, 26], elbowL: [40, 42], elbowR: [42, 46], handL: [38, 58], handR: [40, 62], hip: [50, 62], kneeL: [42, 86], ankleL: [40, 110], kneeR: [58, 86], ankleR: [60, 110] },
  leg_press: { kneeL: [48, 60], ankleL: [58, 45], kneeR: [50, 64], ankleR: [60, 48] },
  leg_extension: { ankleL: [50, 85], ankleR: [50, 95] },
  leg_curl: { ankleL: [95, 58], ankleR: [97, 60] },
  curl: { elbowL: [36, 44], elbowR: [64, 44], handL: [40, 30], handR: [60, 30] },
  triceps_ext: { handL: [44, 38], handR: [56, 38] },
  pushdown: { handL: [42, 64], handR: [58, 64] },
  calf_raise: { head: [50, 9], neck: [50, 18], hip: [50, 58], kneeL: [42, 82], ankleL: [39, 106], kneeR: [58, 82], ankleR: [61, 106] },
  core_crunch: { head: [20, 50], neck: [26, 52], shoulderL: [32, 53], shoulderR: [32, 56] },
};

// Which movement-pattern poses have a hand-authored finish state — used to decide whether the
// Start/Finish toggle appears at all (rather than showing a toggle that does nothing).
const POSES_WITH_FINISH = new Set(Object.keys(POSES_FINISH));

// Secondary (assisting) muscle groups per movement pattern — used for the 3-tier muscle
// highlighting (primary / secondary / non-target). A compound movement genuinely trains more than
// one muscle group; showing only the single `muscle` field on the exercise as if it were the sole
// worked muscle would misrepresent the movement.
export const SECONDARY_MUSCLES = {
  press_lying: ["shoulders", "arms"], press_seated_machine: ["shoulders", "arms"], push_up: ["shoulders", "arms", "core"],
  dip: ["arms", "shoulders"], pullup: ["arms", "shoulders"], pulldown: ["arms", "shoulders"], row: ["arms", "shoulders"],
  hinge: ["back", "legs"], press_overhead: ["arms", "core"], lateral_raise: [], rear_delt: ["back"], shrug: ["back"],
  neck: [], curl: [], triceps_ext: [], wrist_curl: [], squat: ["core", "back"], leg_press: [], lunge: ["legs", "core"],
  leg_extension: [], leg_curl: [], hip_thrust: ["legs", "core"], calf_raise: [], hip_swing: ["core"], core_crunch: [],
  leg_raise_hang: ["arms"], plank: ["shoulders", "legs"], twist: ["back"], carry: ["back", "shoulders", "legs"],
};

// Three-tier muscle-region coloring instead of a single glow dot: bright green for the primary
// muscle, muted teal-green for secondary/assisting muscles, dark neutral for everything else —
// applied directly to the body region itself (torso, shoulder joints, arm limbs, leg limbs) so a
// viewer can see exactly what's working, not just a vague highlighted point.
const MUSCLE_TIER_COLOR = { primary: "var(--brass)", secondary: "#3D6E5C", none: "#333E39" };
function tierFor(group, primary, secondary) {
  if (group === primary) return MUSCLE_TIER_COLOR.primary;
  if (secondary.includes(group)) return MUSCLE_TIER_COLOR.secondary;
  return MUSCLE_TIER_COLOR.none;
}

// Equipment-aware props: the same movement pattern (e.g. press_lying) is used by both barbell and
// dumbbell variants, which look meaningfully different — a straight bar with plates spans both
// hands, while dumbbells are two independent short bars, one per hand. Falls back to the pose's
// own generic props (bench/rack/machine pad — already defined per-pose) for equipment types that
// don't need a hand-held-object override.
// A dedicated, readable pushdown scene: the cable machine's top housing and pulley, the cable
// running down to the attachment, the attachment itself (rope with two knotted ends, straight bar,
// or V-bar — chosen from the exercise name), and the elbows marked as pinned beside the torso.
function pushdownScene(cfg, variant) {
  const { handL, handR, elbowL, elbowR, shoulderL, shoulderR } = cfg;
  const name = String(variant || "").toLowerCase();
  const midX = (handL[0] + handR[0]) / 2;
  const handY = Math.min(handL[1], handR[1]);
  const jy = handY - 11; // where the cable meets the attachment
  const base = [
    { el: "rect", x: 36, y: -4, w: 28, h: 10, rx: 2, fill: "var(--bg-elev2)", stroke: "var(--ink-dim)" },
    { el: "circle", cx: midX, cy: 6, r: 3.2, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
    { el: "line", x1: midX, y1: 9, x2: midX, y2: jy, stroke: "var(--ink-dim)", width: 1.8 },
  ];
  const elbowPins = [
    { el: "line", x1: shoulderL[0], y1: shoulderL[1], x2: elbowL[0], y2: elbowL[1], stroke: "var(--brass)", width: 0.8, dash: "1.5 1.5" },
    { el: "line", x1: shoulderR[0], y1: shoulderR[1], x2: elbowR[0], y2: elbowR[1], stroke: "var(--brass)", width: 0.8, dash: "1.5 1.5" },
    { el: "circle", cx: elbowL[0], cy: elbowL[1], r: 2, fill: "var(--bg)", stroke: "var(--brass)" },
    { el: "circle", cx: elbowR[0], cy: elbowR[1], r: 2, fill: "var(--bg)", stroke: "var(--brass)" },
  ];
  let attachment;
  if (name.includes("rope")) {
    const strand = (h) => {
      const dx = h[0] - midX, dy = h[1] - jy;
      const len = Math.hypot(dx, dy) || 1;
      const tx = h[0] + (dx / len) * 6, ty = h[1] + (dy / len) * 6;
      return [
        { el: "line", x1: midX, y1: jy, x2: tx, y2: ty, stroke: "var(--ink-dim)", width: 2.2 },
        { el: "circle", cx: tx, cy: ty, r: 1.9, fill: "var(--ink-dim)", stroke: "var(--ink-dim)" },
      ];
    };
    attachment = [{ el: "circle", cx: midX, cy: jy, r: 1.6, fill: "var(--ink-dim)", stroke: "var(--ink-dim)" }, ...strand(handL), ...strand(handR)];
  } else if (name.includes("v-bar")) {
    attachment = [
      { el: "line", x1: midX, y1: jy, x2: handL[0] - 2, y2: handL[1], stroke: "var(--ink-dim)", width: 2.6 },
      { el: "line", x1: midX, y1: jy, x2: handR[0] + 2, y2: handR[1], stroke: "var(--ink-dim)", width: 2.6 },
    ];
  } else {
    attachment = [
      { el: "line", x1: midX, y1: jy, x2: midX, y2: handY, stroke: "var(--ink-dim)", width: 1.4 },
      { el: "line", x1: handL[0] - 5, y1: handY, x2: handR[0] + 5, y2: handY, stroke: "var(--ink-dim)", width: 2.8 },
    ];
  }
  return [...base, ...attachment, ...elbowPins];
}

function equipmentShapes(cfg, equipment, variant) {
  if (cfg.scene === "pushdown") return pushdownScene(cfg, variant);
  const { handL, handR, props = [] } = cfg;
  if (equipment === "Barbell" && handL && handR) {
    const dx = handR[0] - handL[0], dy = handR[1] - handL[1];
    const len = Math.hypot(dx, dy) || 1;
    const ux = dx / len, uy = dy / len;
    const ext = 7; // bar extends past the outer hand before the plate
    const x1 = handL[0] - ux * ext, y1 = handL[1] - uy * ext;
    const x2 = handR[0] + ux * ext, y2 = handR[1] + uy * ext;
    return [
      ...props,
      { el: "line", x1, y1, x2, y2, stroke: "var(--ink-dim)", width: 2.5 },
      { el: "circle", cx: x1, cy: y1, r: 5, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
      { el: "circle", cx: x2, cy: y2, r: 5, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
    ];
  }
  if (equipment === "Dumbbell" && handL && handR) {
    const dumbbell = (h) => [
      { el: "line", x1: h[0] - 4, y1: h[1], x2: h[0] + 4, y2: h[1], stroke: "var(--ink-dim)", width: 2 },
      { el: "circle", cx: h[0] - 4, cy: h[1], r: 3, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
      { el: "circle", cx: h[0] + 4, cy: h[1], r: 3, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
    ];
    return [...props, ...dumbbell(handL), ...dumbbell(handR)];
  }
  if (equipment === "Kettlebell" && handL) {
    return [
      ...props,
      { el: "circle", cx: handL[0], cy: handL[1] + 4, r: 6, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
      { el: "path", d: `M ${handL[0] - 3} ${handL[1] - 1} a 3 3 0 0 1 6 0`, stroke: "var(--brass)", width: 1.5 },
    ];
  }
  // Previously Cable fell through to `return props` — the pose's own generic props only, with no
  // visual distinguishing "held a cable handle" from "held nothing at all." A cable exercise is
  // defined by a fixed pulley the resistance runs through, which a plain figure can never show —
  // this draws a single cable line from a fixed pulley point at the top of the frame down to a
  // split point, then two diverging lines out to each hand (the rope's two ends "separating
  // naturally"), with a small rounded cap at each hand for the rope's grip ends. Anchored to the
  // pose's own hand coordinates, so it tracks correctly across every triceps_ext/row/pulldown-
  // family exercise that uses Cable equipment, not just one.
  if (equipment === "Cable" && handL && handR) {
    const midX = (handL[0] + handR[0]) / 2;
    const splitY = Math.min(handL[1], handR[1]) - 12;
    const pulleyX = midX, pulleyY = 2;
    return [
      ...props,
      { el: "line", x1: pulleyX, y1: pulleyY, x2: midX, y2: Math.max(pulleyY + 4, splitY), stroke: "var(--ink-dim)", width: 2 },
      { el: "circle", cx: pulleyX, cy: pulleyY, r: 3, fill: "var(--bg-elev2)", stroke: "var(--ink-dim)" },
      { el: "line", x1: midX, y1: splitY, x2: handL[0], y2: handL[1], stroke: "var(--ink-dim)", width: 1.5 },
      { el: "line", x1: midX, y1: splitY, x2: handR[0], y2: handR[1], stroke: "var(--ink-dim)", width: 1.5 },
      { el: "circle", cx: handL[0], cy: handL[1], r: 3, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
      { el: "circle", cx: handR[0], cy: handR[1], r: 3, fill: "var(--bg-elev2)", stroke: "var(--brass)" },
    ];
  }
  return props;
}

/**
 * @param {string} pose movement-pattern key (matches EXERCISES[].pose)
 * @param {string} muscle primary muscle group (matches EXERCISES[].muscle)
 * @param {string} [equipment] equipment type, for bar/dumbbell/kettlebell rendering
 * @param {number} [size] rendered width in px (height follows the 100:120 aspect ratio)
 * @param {"start"|"finish"} [state] which end of the range of motion to show
 * @param {boolean} [showLegend] renders a small primary/secondary color key beneath the figure
 */
export function ExerciseFigure({ pose, muscle, equipment, variant, size = 90, state = "start", showLegend = false }) {
  const base = POSES[pose] || POSES.squat;
  const finishOverrides = state === "finish" ? POSES_FINISH[pose] : null;
  const cfg = finishOverrides ? { ...base, ...finishOverrides } : base;
  const { head, neck, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hip, kneeL, kneeR, ankleL, ankleR } = cfg;
  const gid = useId();
  const rimId = `rim-${gid}`;
  const secondary = SECONDARY_MUSCLES[pose] || [];
  const TORSO_GROUPS = ["chest", "back", "core"];
  const torsoGroup = TORSO_GROUPS.includes(muscle) ? muscle : (secondary.find((g) => TORSO_GROUPS.includes(g)) || null);
  const torsoColor = torsoGroup ? tierFor(torsoGroup, muscle, secondary) : MUSCLE_TIER_COLOR.none;
  const armColor = tierFor("arms", muscle, secondary);
  const shoulderColor = tierFor("shoulders", muscle, secondary);
  const legColor = tierFor("legs", muscle, secondary);
  // A thin dark outline around each limb stroke stops it from visually merging into the
  // similarly-toned torso/other limbs when they're the same or adjacent muscle-tier color —
  // without it, e.g. a secondary-tier forearm sitting right next to a primary-tier torso read as
  // one undifferentiated green blob rather than two distinct body parts.
  const limb = (a, b, color, w) => (
    <g>
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke="var(--bg)" strokeWidth={w + 1.2} strokeLinecap="round" opacity="0.5" />
      <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />
    </g>
  );
  const shapes = equipmentShapes(cfg, equipment, variant);
  // Movement path: for poses with a drawn scene, the START and FINISH hand positions are joined by a
  // dashed arrow so the direction of the working phase is visible in a single frame.
  const pathFrom = base.scene ? (POSES[pose] && { l: base.handL, r: base.handR }) : null;
  const pathTo = base.scene && POSES_FINISH[pose] ? { l: POSES_FINISH[pose].handL || base.handL, r: POSES_FINISH[pose].handR || base.handR } : null;
  const ariaLabel = `${pose.replace(/_/g, " ")} illustration, ${state} position${muscle ? `, primary muscle ${muscle}` : ""}`;

  // Torso as an actual tapered polygon (shoulders wider than waist) instead of a uniform-width
  // line-capsule — this alone is most of what makes a figure read as "a person" rather than "a
  // stick with a thick line down the middle".
  // Derived purely from the neck→hip axis (reliable in every pose orientation — standing,
  // lying, bent-over) rather than from shoulderL/shoulderR's own coordinates: in a side-view pose
  // (lying, bent-over-row, hinge), shoulderL and shoulderR sit at nearly the same X position —
  // they represent near/far depth, not left/right anatomical width — so a shoulder-width-based
  // calculation collapses to a degenerate sliver for most of this app's poses, which is exactly
  // what happened on the first pass. A fixed half-width offset perpendicular to the torso's own
  // axis works correctly regardless of which way the figure is oriented.
  const torsoDx = hip[0] - neck[0], torsoDy = hip[1] - neck[1];
  const torsoLen = Math.hypot(torsoDx, torsoDy) || 1;
  const perpX = -torsoDy / torsoLen, perpY = torsoDx / torsoLen;
  const shoulderHalfWidth = 11, waistHalfWidth = 7;
  const sL = [neck[0] + perpX * shoulderHalfWidth, neck[1] + perpY * shoulderHalfWidth];
  const sR = [neck[0] - perpX * shoulderHalfWidth, neck[1] - perpY * shoulderHalfWidth];
  const wR = [hip[0] - perpX * waistHalfWidth, hip[1] - perpY * waistHalfWidth];
  const wL = [hip[0] + perpX * waistHalfWidth, hip[1] + perpY * waistHalfWidth];
  const torsoPath = `M ${sL[0]} ${sL[1]} L ${sR[0]} ${sR[1]} L ${wR[0]} ${wR[1]} L ${wL[0]} ${wL[1]} Z`;

  // Auto-fit: the joint coordinates for a given pose only span part of the 100x120 viewBox (a
  // lying-down pose is much wider than tall; a standing pose is the opposite), which without
  // correction made some poses render small and off-center relative to others at the same `size`.
  // Computing a bounding box from every joint actually used and scaling/centering it to fill most
  // of the frame keeps every pose reading at a consistent, legible size regardless of its own
  // coordinate spread.
  const joints = [head, neck, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hip, kneeL, kneeR, ankleL, ankleR];
  const xs = joints.map((j) => j[0]), ys = joints.map((j) => j[1]);
  const padding = 14;
  const minX = Math.min(...xs) - padding, maxX = Math.max(...xs) + padding;
  const minY = Math.min(...ys) - padding, maxY = Math.max(...ys) + padding;
  const spanX = maxX - minX || 1, spanY = maxY - minY || 1;
  const fitScale = Math.min(100 / spanX, 120 / spanY);
  const fitTranslateX = (100 - spanX * fitScale) / 2 - minX * fitScale;
  const fitTranslateY = (120 - spanY * fitScale) / 2 - minY * fitScale;

  return (
    <div>
      <svg viewBox="0 0 100 120" width={size} height={size * 1.2} style={{ flexShrink: 0, display: "block" }} role="img" aria-label={ariaLabel}>
        <defs>
          <filter id={rimId} x="-20%" y="-20%" width="140%" height="140%">
            <feMorphology operator="dilate" radius="0.6" />
            <feColorMatrix type="matrix" values="0 0 0 0 0.24  0 0 0 0 0.81  0 0 0 0 0.56  0 0 0 0.5 0" />
          </filter>
        </defs>

        <g transform={`translate(${fitTranslateX} ${fitTranslateY}) scale(${fitScale})`}>
        {shapes.map((p, i) => {
          if (p.type === "rect" || p.el === "rect") return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={p.rx ?? 2} fill={p.fill || "var(--bg-elev2)"} stroke={p.stroke || "var(--brass)"} strokeWidth="1.5" opacity="0.85" />;
          if (p.type === "line" || p.el === "line") return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke || "var(--brass)"} strokeWidth={p.width || 3} strokeLinecap="round" strokeDasharray={p.dash} />;
          if (p.el === "circle") return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} stroke={p.stroke} strokeWidth="1.5" />;
          if (p.el === "path") return <path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width || 1.5} />;
          return null;
        })}

        {pathFrom && pathTo && (
          <g aria-hidden="true">
            {[[pathFrom.l, pathTo.l], [pathFrom.r, pathTo.r]].map(([a, b], i) => (
              <g key={i}>
                <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1] - 3} stroke="var(--brass)" strokeWidth="1" strokeDasharray="2 2" opacity="0.8" />
                <path d={`M ${b[0] - 2.2} ${b[1] - 5.5} L ${b[0]} ${b[1] - 2} L ${b[0] + 2.2} ${b[1] - 5.5}`} fill="none" stroke="var(--brass)" strokeWidth="1" opacity="0.9" />
              </g>
            ))}
          </g>
        )}

        {/* rim-lit silhouette pass, offset slightly behind the real body so only the edge peeks through as a thin green outline */}
        <g filter={`url(#${rimId})`} opacity="0.6">
          <path d={torsoPath} fill="none" />
          <circle cx={head[0]} cy={head[1]} r="8" fill="none" />
        </g>

        {/* back-side limbs (shadow layer, drawn first so the front limbs read as closer) */}
        {limb(hip, kneeR, legColor, 8)}
        {limb(kneeR, ankleR, legColor, 6)}
        {limb(shoulderR, elbowR, armColor, 6.5)}
        {limb(elbowR, handR, armColor, 5)}

        {/* tapered torso polygon */}
        <path d={torsoPath} fill={torsoColor} stroke="var(--line)" strokeWidth="0.75" />
        {/* shoulder caps, colored by the shoulders muscle-group tier independently of the torso */}
        <circle cx={shoulderL[0]} cy={shoulderL[1]} r="4.5" fill={shoulderColor} stroke="var(--bg)" strokeWidth="0.75" />
        <circle cx={shoulderR[0]} cy={shoulderR[1]} r="4.5" fill={shoulderColor} stroke="var(--bg)" strokeWidth="0.75" />

        {/* front-side limbs, on top */}
        {limb(hip, kneeL, legColor, 8)}
        {limb(kneeL, ankleL, legColor, 6)}
        {limb(shoulderL, elbowL, armColor, 6.5)}
        {limb(elbowL, handL, armColor, 5)}

        {/* hands and feet as small rounded shapes, so contact with equipment (bar, bench, floor) reads clearly instead of a line just stopping */}
        <circle cx={handL[0]} cy={handL[1]} r="3" fill="#2A332E" stroke="var(--line)" strokeWidth="0.5" />
        <circle cx={handR[0]} cy={handR[1]} r="3" fill="#2A332E" stroke="var(--line)" strokeWidth="0.5" />
        <ellipse cx={ankleL[0]} cy={ankleL[1] + 2} rx="5" ry="2.5" fill="#2A332E" stroke="var(--line)" strokeWidth="0.5" />
        <ellipse cx={ankleR[0]} cy={ankleR[1] + 2} rx="5" ry="2.5" fill="#2A332E" stroke="var(--line)" strokeWidth="0.5" />

        {/* head: an oval with a subtle jaw taper instead of a plain circle, plus a small brow shading pass for depth */}
        <path d={`M ${head[0] - 6.5} ${head[1] - 5} a 6.5 5.5 0 1 1 13 0 a 6.5 7 0 0 1 -13 0 Z`} fill="#2A332E" stroke="var(--brass)" strokeWidth="1" strokeOpacity="0.5" />
        <ellipse cx={head[0] - 1.8} cy={head[1] - 2.2} rx="2.4" ry="1.8" fill="#3A4640" opacity="0.6" />
        </g>
      </svg>
      {showLegend && (
        <div style={{ display: "flex", gap: 10, justifyContent: "center", marginTop: 6, fontSize: 9 }} className="mono">
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: MUSCLE_TIER_COLOR.primary, display: "inline-block" }} />Primary</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: MUSCLE_TIER_COLOR.secondary, display: "inline-block" }} />Secondary</span>
          <span style={{ display: "flex", alignItems: "center", gap: 3, color: "var(--ink-dim)" }}><span style={{ width: 8, height: 8, borderRadius: 2, background: MUSCLE_TIER_COLOR.none, display: "inline-block" }} />Other</span>
        </div>
      )}
    </div>
  );
}

/* Small inline exercise thumbnail (exercise picker rows, active-workout cards) — same media-status
   gate as the full detail view, just a more compact placeholder, so a pending-media exercise never
   silently shows an inaccurate demonstration anywhere in the app, not only on its detail page. */
export function ExerciseThumb({ ex, size = 40 }) {
  if (!ex) return null;
  if (ex.mediaStatus !== "approved") {
    return (
      <div
        role="img" aria-label="Demonstration coming soon"
        style={{ width: size, height: size, borderRadius: 8, background: "var(--bg-elev2)", display: "flex", alignItems: "center", justifyContent: "center", flexShrink: 0 }}
      >
        <Camera size={Math.max(12, size * 0.35)} color="var(--ink-dim)" style={{ opacity: 0.5 }} />
      </div>
    );
  }
  return <ExerciseFigure pose={ex.pose} muscle={ex.muscle} equipment={ex.equipment} variant={ex.name} size={size} />;
}

/* Redesigned exercise-detail presentation: a larger illustration (with a Start/Finish toggle
   where one exists), primary + secondary muscles, equipment, form cues, common mistakes, a
   safety note where one applies, and Add to Workout — stacked on mobile, two-column on wider
   screens via .exercise-detail-layout in GlobalStyle. */
export function ExerciseDetailCard({ ex, onAdd, onBack, onArchive }) {
  const [figureState, setFigureState] = useState("start");
  const hasFinish = POSES_WITH_FINISH.has(ex.pose);
  // Browsing category (e.g. "Arms") and primary muscle (e.g. "Triceps") are two different things —
  // conflating them was a real, reported bug: Rope Pushdown showed "Primary: arms" instead of
  // "Primary: triceps" because this used to read ex.muscle (the coarse category) directly instead
  // of resolving the actual computed region. secondaryRegions uses the same region-level data the
  // readiness map/search/filters already use, not the older 6-group SECONDARY_MUSCLES map.
  const primaryRegionId = regionForExercise(ex);
  const primaryRegionLabel = REGION_LABEL[primaryRegionId] || ex.muscle;
  const secondaryRegions = (ex.secondaryMuscles || []).map((id) => REGION_LABEL[id]).filter(Boolean);
  const guidance = getExerciseGuidance(ex);
  const mistakes = guidance.commonMistakes;
  const safety = guidance.safetyNote;
  const tips = guidance.formCues;
  const mediaApproved = ex.mediaStatus === "approved";

  return (
    <div className="atlas-card">
      <button onClick={onBack} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "0 4px", minHeight: 44, display: "inline-flex", alignItems: "center", marginBottom: 12 }}>
        ← Back to library
      </button>

      <div className="exercise-detail-layout">
        <div className="exercise-detail-figure" style={{ textAlign: "center" }}>
          <div style={{ background: "var(--bg-elev2)", borderRadius: 12, padding: 12, display: "flex", justifyContent: "center", alignItems: "center", minHeight: 160 }}>
            {mediaApproved ? (
              <ExerciseFigure pose={ex.pose} muscle={ex.muscle} equipment={ex.equipment} variant={ex.name} size={160} state={figureState} showLegend />
            ) : (
              <div role="img" aria-label="Demonstration coming soon" style={{ color: "var(--ink-dim)", fontSize: 12.5, padding: "24px 12px", textAlign: "center", lineHeight: 1.6 }}>
                <Camera size={28} style={{ opacity: 0.4, marginBottom: 8 }} />
                <div>Demonstration coming soon</div>
                <div style={{ fontSize: 11, marginTop: 4, opacity: 0.8 }}>We don't have an accurate figure for this variation yet, so we don't show a different movement. The steps below are written for this exercise.</div>
              </div>
            )}
          </div>
          {mediaApproved && FIGURE_RULES[ex.pose] && (
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 8, lineHeight: 1.5, textAlign: "left" }}>
              Shows: {FIGURE_RULES[ex.pose].depicts}
            </div>
          )}
          {mediaApproved && hasFinish && (
            <div role="group" aria-label="View start or finish position" style={{ display: "flex", marginTop: 10, background: "var(--bg-elev2)", borderRadius: 10, padding: 3 }}>
              {["start", "finish"].map((s) => (
                <button
                  key={s}
                  onClick={() => setFigureState(s)}
                  aria-pressed={figureState === s}
                  className="disp"
                  style={{
                    flex: 1, padding: "8px 0", borderRadius: 7, border: "none", cursor: "pointer",
                    fontSize: 11, letterSpacing: "0.03em", minHeight: 44,
                    background: figureState === s ? "var(--brass)" : "transparent",
                    color: figureState === s ? "#072016" : "var(--ink-dim)",
                  }}
                >
                  {s}
                </button>
              ))}
            </div>
          )}
        </div>

        <div className="exercise-detail-info">
          <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>{ex.name}</div>
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 12 }}>
            <span className="pill" style={{ background: "rgba(255,255,255,0.06)", color: EQUIPMENT_COLORS[ex.equipment], border: `1px solid ${EQUIPMENT_COLORS[ex.equipment]}` }}>
              {ex.equipment}
            </span>
            <span className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>
              Category: {ex.muscle}
            </span>
            <span className="pill" style={{ background: "var(--brass-soft)", color: "var(--brass)" }}>
              Primary: {primaryRegionLabel}
            </span>
            {secondaryRegions.map((label) => (
              <span key={label} className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)" }}>
                Also trains: {label}
              </span>
            ))}
          </div>

          {guidance.setup && (
            <div style={{ marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Setup</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{guidance.setup}</div>
            </div>
          )}
          {guidance.execution && (
            <div style={{ marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Execution</div>
              <div style={{ fontSize: 13, lineHeight: 1.6 }}>{guidance.execution}</div>
              {guidance.breathingCue && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 6, fontStyle: "italic" }}>{guidance.breathingCue}</div>}
            </div>
          )}

          <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Key Form Cues</div>
          <ul style={{ margin: 0, marginBottom: 14, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {tips.map((t, i) => <li key={i}>{t}</li>)}
          </ul>

          {mistakes.length > 0 && (
            <>
              <div className="disp" style={{ fontSize: 12, color: "var(--rest)", marginBottom: 6 }}>Common Mistakes</div>
              <ul style={{ margin: 0, marginBottom: 14, paddingLeft: 18, fontSize: 13, lineHeight: 1.7, color: "var(--ink-dim)" }}>
                {mistakes.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            </>
          )}

          {safety && (
            <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--warn)", background: "rgba(255,165,61,0.08)", padding: 12 }}>
              <div className="disp" style={{ fontSize: 11, color: "var(--warn)", marginBottom: 4 }}>Safety Note</div>
              <div style={{ fontSize: 12.5, lineHeight: 1.5 }}>{safety}</div>
            </div>
          )}

          <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onAdd(ex)}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to Workout
          </button>
          {onArchive && (
            <button
              className="atlas-btn-ghost" style={{ width: "100%", marginTop: 8, borderColor: "var(--line)", color: "var(--ink-dim)" }}
              onClick={onArchive}
            >
              Archive this custom exercise
            </button>
          )}
        </div>
      </div>
    </div>
  );
}

