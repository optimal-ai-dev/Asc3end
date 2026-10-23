import { useId } from "react";
import { Camera } from "lucide-react";
import { MUSCLE_GROUPS, MUSCLE_POSITIONS } from "../exerciseData";

/* Reusable body silhouette that highlights a single muscle group — used in the exercise library */
function MuscleIcon({ muscle, size = 46 }) {
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
  lateral_raise: { ...STANDING, elbowL: [20, 30], elbowR: [80, 30], handL: [8, 28], handR: [92, 28] },
  rear_delt: { head: [20, 28], neck: [28, 32], shoulderL: [34, 36], shoulderR: [34, 40], elbowL: [18, 30], elbowR: [24, 50], handL: [8, 26], handR: [20, 60], hip: [64, 54], kneeL: [70, 76], ankleL: [74, 100], kneeR: [72, 78], ankleR: [76, 102] },
  shrug: { ...STANDING, shoulderL: [37, 25], shoulderR: [63, 25], elbowL: [36, 46], elbowR: [64, 46], handL: [34, 58], handR: [66, 58] },
  neck: { ...STANDING, head: [53, 13], elbowL: [40, 20], elbowR: [60, 20], handL: [46, 16], handR: [54, 16] },
  curl: { ...STANDING, elbowL: [36, 44], elbowR: [64, 44], handL: [40, 30], handR: [60, 30] },
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
  lateral_raise: { elbowL: [36, 45], elbowR: [64, 45], handL: [34, 60], handR: [66, 60] },
  pullup: { head: [50, 10], neck: [50, 16], shoulderL: [40, 20], shoulderR: [60, 20], elbowL: [32, 14], elbowR: [68, 14], hip: [50, 45], kneeL: [43, 69], ankleL: [40, 92], kneeR: [57, 69], ankleR: [60, 92] },
  pulldown: { elbowL: [25, 55], elbowR: [75, 55], handL: [35, 70], handR: [65, 70] },
  row: { elbowL: [30, 45], elbowR: [32, 48], handL: [26, 50], handR: [28, 54] },
  squat: { hip: [50, 88], kneeL: [36, 92], kneeR: [64, 92] },
  hinge: { head: [50, 15], neck: [50, 22], shoulderL: [42, 26], shoulderR: [58, 26], elbowL: [40, 42], elbowR: [42, 46], handL: [38, 58], handR: [40, 62], hip: [50, 62], kneeL: [42, 86], ankleL: [40, 110], kneeR: [58, 86], ankleR: [60, 110] },
  leg_press: { kneeL: [48, 60], ankleL: [58, 45], kneeR: [50, 64], ankleR: [60, 48] },
  leg_extension: { ankleL: [50, 85], ankleR: [50, 95] },
  leg_curl: { ankleL: [95, 58], ankleR: [97, 60] },
  curl: { elbowL: [38, 50], elbowR: [62, 50], handL: [36, 68], handR: [64, 68] },
  triceps_ext: { handL: [44, 38], handR: [56, 38] },
  calf_raise: { head: [50, 9], neck: [50, 18], hip: [50, 58], kneeL: [42, 82], ankleL: [39, 106], kneeR: [58, 82], ankleR: [61, 106] },
  core_crunch: { head: [20, 50], neck: [26, 52], shoulderL: [32, 53], shoulderR: [32, 56] },
};

// Which movement-pattern poses have a hand-authored finish state — used to decide whether the
// Start/Finish toggle appears at all (rather than showing a toggle that does nothing).
export const POSES_WITH_FINISH = new Set(Object.keys(POSES_FINISH));

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
function equipmentShapes(cfg, equipment) {
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
export function ExerciseFigure({ pose, muscle, equipment, size = 90, state = "start", showLegend = false }) {
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
  const shapes = equipmentShapes(cfg, equipment);
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
          if (p.type === "rect" || p.el === "rect") return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={2} fill="var(--bg-elev2)" stroke="var(--brass)" strokeWidth="1.5" opacity="0.85" />;
          if (p.type === "line" || p.el === "line") return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke={p.stroke || "var(--brass)"} strokeWidth={p.width || 3} strokeLinecap="round" />;
          if (p.el === "circle") return <circle key={i} cx={p.cx} cy={p.cy} r={p.r} fill={p.fill} stroke={p.stroke} strokeWidth="1.5" />;
          if (p.el === "path") return <path key={i} d={p.d} fill="none" stroke={p.stroke} strokeWidth={p.width || 1.5} />;
          return null;
        })}

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
        <circle cx={handL[0]} cy={handL[1]} r="3" fill="var(--bg-elev2)" stroke="var(--line)" strokeWidth="0.5" />
        <circle cx={handR[0]} cy={handR[1]} r="3" fill="var(--bg-elev2)" stroke="var(--line)" strokeWidth="0.5" />
        <ellipse cx={ankleL[0]} cy={ankleL[1] + 2} rx="5" ry="2.5" fill="var(--bg-elev2)" stroke="var(--line)" strokeWidth="0.5" />
        <ellipse cx={ankleR[0]} cy={ankleR[1] + 2} rx="5" ry="2.5" fill="var(--bg-elev2)" stroke="var(--line)" strokeWidth="0.5" />

        {/* head: an oval with a subtle jaw taper instead of a plain circle, plus a small brow shading pass for depth */}
        <path d={`M ${head[0] - 6.5} ${head[1] - 5} a 6.5 5.5 0 1 1 13 0 a 6.5 7 0 0 1 -13 0 Z`} fill="var(--bg-elev2)" stroke="var(--brass)" strokeWidth="1" strokeOpacity="0.5" />
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
  return <ExerciseFigure pose={ex.pose} muscle={ex.muscle} equipment={ex.equipment} size={size} />;
}
