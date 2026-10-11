// Illustration fidelity: decides whether the hand-authored figure for a movement pattern (a "pose")
// truthfully depicts a SPECIFIC exercise. A pose was historically approved for every exercise that
// shared it, which is how a Pec Deck, a cable fly and a dumbbell pullover all showed the lying
// bench-press figure, and a Dead Bug showed a plank. Now a figure is approved only when the
// exercise matches that pose's allow rule (and does not match its exclusions); everything else
// gets the neutral "demonstration coming soon" placeholder alongside accurate written
// instructions (see exerciseGuidance.js). Rules are intentionally conservative: when in doubt, the
// exercise is NOT shown a figure.
//
// Each rule describes what the figure actually draws, so a reviewer can check the rule against the
// artwork rather than trusting a flag. Import-free so it can be shared with scripts and tests.

const re = (s) => new RegExp(s, "i");

// pose -> { depicts, allow, deny?, equipment? }
export const FIGURE_RULES = {
  press_lying: {
    depicts: "Lying on a FLAT bench pressing a barbell or two dumbbells from the chest to lockout (side view).",
    allow: re("^(barbell bench press|flat dumbbell press|neutral grip dumbbell bench press|close grip bench press|reverse grip bench press|smith machine bench press|smith machine close-grip bench press)$"),
    equipment: ["Barbell", "Dumbbell", "Smith Machine"],
  },
  press_seated_machine: {
    depicts: "Seated at a chest-press machine, pushing two handles forward from the chest.",
    allow: re("(chest press machine|plate loaded chest press|hammer strength chest press|iso-lateral chest press|converging chest press machine)$"),
    deny: re("single arm|fly|pec deck|pullover|shoulder"),
    equipment: ["Machine"],
  },
  push_up: {
    depicts: "A floor push-up on the hands and toes in a straight line.",
    allow: re("^(push-up|diamond push-up|close-grip push-up|weighted push-up|resistance band push-up)$"),
    equipment: ["Bodyweight"],
  },
  dip: {
    depicts: "Supported dip between parallel bars.",
    allow: re("^(parallel bar dips|chest dips|weighted dips)$"),
    equipment: ["Bodyweight"],
  },
  press_overhead: {
    depicts: "Standing, pressing a barbell or two dumbbells from the shoulders to overhead lockout.",
    allow: re("^(overhead press \\(barbell\\)|dumbbell shoulder press)$"),
    equipment: ["Barbell", "Dumbbell"],
  },
  pullup: {
    depicts: "Hanging from a fixed bar and pulling the chin toward it. Added load or assistance is not drawn, but the movement is identical.",
    allow: re("^(pull-up|chin-up|neutral grip pull-up|weighted pull-up|weighted chin-up|assisted pull-up|assisted chin-up|band-assisted pull-up)$"),
    equipment: ["Bodyweight"],
  },
  pulldown: {
    depicts: "Seated at a lat pulldown station pulling a wide bar to the upper chest.",
    allow: re("^(lat pulldown|wide grip pulldown|close grip pulldown|reverse grip pulldown|v-bar pulldown)$"),
    equipment: ["Cable"],
  },
  row: {
    depicts: "Standing hinged forward pulling a barbell to the torso.",
    allow: re("^(barbell row|underhand barbell row|wide grip barbell row)$"),
    equipment: ["Barbell"],
  },
  hinge: {
    depicts: "Barbell or dumbbell hip hinge from the knees/shins to standing (deadlift / Romanian deadlift pattern).",
    allow: re("^(deadlift|romanian deadlift|stiff leg deadlift|dumbbell romanian deadlift|dumbbell stiff leg deadlift)$"),
    equipment: ["Barbell", "Dumbbell"],
  },
  lateral_raise: {
    depicts: "Standing, raising two dumbbells out to the sides to shoulder height.",
    allow: re("^dumbbell lateral raise$"),
    equipment: ["Dumbbell"],
  },
  rear_delt: {
    depicts: "Hinged forward raising two dumbbells out to the sides (bent-over reverse fly).",
    allow: re("^(rear delt fly|bent over lateral raise)$"),
    equipment: ["Dumbbell"],
  },
  shrug: {
    depicts: "Standing, lifting the shoulders straight up with a weight in each hand or a bar.",
    allow: re("^(barbell shrug|dumbbell shrug)$"),
    equipment: ["Barbell", "Dumbbell"],
  },
  curl: {
    depicts: "Standing, curling a barbell or two dumbbells with the elbows at the sides.",
    allow: re("^(barbell curl|ez bar curl|dumbbell curl|hammer curl|reverse curl|ez-bar reverse curl|barbell curl \((wide|narrow) grip\)|standing barbell reverse curl \(wide grip\))$"),
    equipment: ["Barbell", "Dumbbell"],
  },
  // A dedicated pushdown figure (cable tower, high pulley, rope with two ends, elbows pinned).
  pushdown: {
    depicts: "Standing at a high cable pulley, elbows pinned to the sides, pushing a rope/bar down to full elbow extension (front view).",
    allow: re("^(rope pushdown|straight bar pushdown|v-bar pushdown|reverse grip pushdown)$"),
    equipment: ["Cable"],
  },
  lunge: {
    depicts: "A split-stance squat with the REAR foot raised behind the body (rear-foot-elevated / Bulgarian split squat), dumbbells at the sides.",
    allow: re("^(bulgarian split squat|dumbbell bulgarian split squat \(elevated\))$"),
    equipment: ["Dumbbell"],
  },
  squat: {
    depicts: "Standing barbell back squat: bar across the upper back, hips sitting back and down.",
    allow: re("^(back squat|front squat)$"),
    equipment: ["Barbell"],
  },
  leg_press: {
    depicts: "Seated 45-degree leg press, feet on the platform.",
    allow: re("^(leg press|narrow stance leg press|wide stance leg press)$"),
    equipment: ["Machine"],
  },
  leg_extension: {
    depicts: "Seated leg extension machine, extending both knees.",
    allow: re("^leg extension$"),
    equipment: ["Machine"],
  },
  leg_curl: {
    depicts: "Lying leg curl machine, curling the heels toward the glutes.",
    allow: re("^lying leg curl$"),
    equipment: ["Machine"],
  },
  hip_thrust: {
    depicts: "Upper back on a bench, driving a barbell up with the hips (hip thrust).",
    allow: re("^(hip thrust|barbell hip thrust \\(bench supported\\))$"),
    equipment: ["Barbell"],
  },
  calf_raise: {
    depicts: "Standing calf raise rising onto the toes.",
    allow: re("^(standing calf raise|bodyweight calf raise|standing calf raise machine \(plate loaded\))$"),
    deny: re("tibialis"),
  },
  plank: {
    depicts: "Forearm plank hold, straight line from head to heels.",
    allow: re("^(plank|weighted plank)$"),
  },
};

/** Normalised result: whether a figure may be shown for this exercise, and why not if it can't. */
export function figureFidelity(ex) {
  const rule = FIGURE_RULES[ex?.pose];
  if (!rule) return { approved: false, reason: "no figure has been drawn for this movement pattern" };
  const name = String(ex.name || "");
  if (rule.deny && rule.deny.test(name)) return { approved: false, reason: `the ${ex.pose} figure does not depict this movement` };
  if (!rule.allow.test(name)) return { approved: false, reason: `the ${ex.pose} figure depicts "${rule.depicts}", which this variation differs from` };
  if (rule.equipment && !rule.equipment.includes(ex.equipment)) return { approved: false, reason: `the figure draws different equipment (${rule.equipment.join("/")}) than ${ex.equipment}` };
  return { approved: true, reason: null };
}
