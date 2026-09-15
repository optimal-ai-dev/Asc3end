/* ------------------------------------------------------------------ */
/* Exercise catalogue — data & taxonomy                                */
/* ------------------------------------------------------------------ */
// Extracted from App.jsx (which had grown to hold both the ~600-exercise catalogue and every UI
// component) so the data layer can be read, validated and tested independently of the component
// tree. App.jsx re-exports everything from here, so no other file's import path changes.
//
// STABILITY CONTRACT: `name` is, and has always been, the identity of a built-in exercise — every
// workout log, PR, volume calc and readiness computation joins back to this array by exact `name`
// string equality (there is no separate row-id in the persisted data). No existing exercise's
// `name` is ever renamed or removed here; new fields are additive, and the only edits made to any
// of the original 223 objects are to `muscle`/`pose`/`region` metadata (never `name`), used to fix
// a handful of confirmed muscle-taxonomy mis-mappings documented inline below. New aliases are
// ADDED to existing entries, never used to replace or rename them.

/* ------------------------------------------------------------------ */
/* Muscle taxonomy                                                     */
/* ------------------------------------------------------------------ */

// Coarse group — the original 6-value taxonomy, kept for the top-level Train filter pills and the
// AI plan generator's prompt constraints. "conditioning" is new: the 9 pre-existing Strongman/
// cardio entries were previously jammed under "core" for lack of anywhere better to put them; this
// reclassifies their `muscle` field (metadata only, `name` unchanged) to a home that actually
// describes them, and is where every new carry/sled/cardio-machine/throw exercise lives.
export const MUSCLE_GROUPS = ["chest", "back", "shoulders", "arms", "legs", "core", "conditioning"];

// Anatomical region — the fine-grained 18-region set the muscle-readiness map already renders
// (unchanged; adding new SVG geometry is out of scope here — see the final report), plus 3 more
// regions the muscle taxonomy is required to support for filtering/search/readiness even though
// the interactive body map doesn't draw them yet.
export const MUSCLE_REGIONS = [
  { id: "chest", label: "Chest", group: "chest", view: "front" },
  { id: "frontDelts", label: "Front Delts", group: "shoulders", view: "front" },
  { id: "sideDelts", label: "Side Delts", group: "shoulders", view: "both" },
  { id: "rearDelts", label: "Rear Delts", group: "shoulders", view: "back" },
  { id: "biceps", label: "Biceps", group: "arms", view: "front" },
  { id: "triceps", label: "Triceps", group: "arms", view: "back" },
  { id: "forearms", label: "Forearms", group: "arms", view: "both" },
  { id: "abs", label: "Abs", group: "core", view: "front" },
  { id: "obliques", label: "Obliques", group: "core", view: "front" },
  { id: "traps", label: "Traps", group: "shoulders", view: "back" },
  { id: "upperBack", label: "Upper Back", group: "back", view: "back" },
  { id: "lats", label: "Lats", group: "back", view: "back" },
  { id: "lowerBack", label: "Lower Back", group: "back", view: "back" },
  { id: "glutes", label: "Glutes", group: "legs", view: "back" },
  { id: "quads", label: "Quads", group: "legs", view: "front" },
  { id: "adductors", label: "Adductors", group: "legs", view: "front" },
  { id: "hamstrings", label: "Hamstrings", group: "legs", view: "back" },
  { id: "calves", label: "Calves", group: "legs", view: "both" },
];

// Regions that exist for filtering / search / readiness / workout-generation purposes but are not
// (yet) drawn on the interactive body map. Kept as a separate list rather than added to
// MUSCLE_REGIONS so nothing about the already-shipped, already-approved anatomical SVG figure
// changes: adding real geometry for these three at the same hand-authored, shared-boundary-vertex
// quality bar the triceps fix required is a substantial dedicated effort in its own right, and
// bolting on unfinished shapes to hit a taxonomy checkbox is exactly the kind of shortcut that
// figure has already been explicitly rejected for once. See the final report.
export const UNMAPPED_READINESS_REGIONS = [
  { id: "abductors", label: "Abductors", group: "legs" },
  { id: "tibialisAnterior", label: "Tibialis Anterior", group: "legs" },
  { id: "hipFlexors", label: "Hip Flexors", group: "legs" },
];

// The full readiness/filter/search taxonomy: every region the app can compute a real readiness
// number for and let a user filter or search by, whether or not it has SVG geometry yet.
export const READINESS_MUSCLE_IDS = [...MUSCLE_REGIONS.map((r) => r.id), ...UNMAPPED_READINESS_REGIONS.map((r) => r.id)];
export const REGION_LABEL = Object.fromEntries(
  [...MUSCLE_REGIONS, ...UNMAPPED_READINESS_REGIONS].map((r) => [r.id, r.label])
);

// No entries here today: every region in READINESS_MUSCLE_IDS now has real, independently-computed
// exercise data behind it (see the region-mapping fixes below), so nothing needs to borrow another
// muscle's reading. Kept as a live mechanism (not deleted) because it's still the correct, honest
// way to handle a genuinely untracked region in the future — see MuscleRecoveryDetails in App.jsx,
// which discloses any substitution in the UI rather than hiding it.
export const READINESS_DISPLAY_SOURCE = {};

export const EQUIPMENT_TYPES = ["Barbell", "Dumbbell", "Machine", "Cable", "Bodyweight", "Kettlebell", "Strongman"];
export const MUSCLE_POSITIONS = { shoulders: [50, 22], chest: [50, 40], arms: [78, 42], back: [22, 42], core: [50, 58], legs: [50, 82], conditioning: [50, 70] };
export const EQUIPMENT_COLORS = { Barbell: "var(--brass)", Dumbbell: "var(--steel)", Machine: "var(--warn)", Cable: "var(--good)", Bodyweight: "var(--ink-dim)", Kettlebell: "#B98CE0", Strongman: "var(--rest)" };
export const MUSCLE_DEFAULT_POSE = { chest: "press_lying", back: "row", shoulders: "press_overhead", arms: "curl", legs: "squat", core: "plank", conditioning: "carry" };

/* ------------------------------------------------------------------ */
/* Logging / tracking types                                            */
/* ------------------------------------------------------------------ */
// Every set logged pre-expansion was `{ weight, reps, type }` — fine for barbell/dumbbell/machine
// work, actively wrong for a plank (there is no "weight") or a treadmill run (there is no "reps").
// `trackingType` tells the logger which fields to actually show, and tells volume/PR calculations
// which sets are even eligible for a weight×reps computation. Old records need no migration: any
// record without a trackingType-aware exercise reference simply behaves exactly as it always did
// (see setVolume()/isWeightRepsSet() below, which default to weight×reps when in doubt).
export const TRACKING_TYPES = [
  "weight_reps", "bodyweight_reps", "bodyweight_plus_weight", "assisted_bodyweight",
  "reps_only", "duration", "isometric_hold", "distance_duration", "weight_distance",
  "weighted_duration", "per_side_weight",
];

export const TRACKING_TYPE_LABEL = {
  weight_reps: "Weight × Reps",
  bodyweight_reps: "Bodyweight Reps",
  bodyweight_plus_weight: "Bodyweight + Added Weight",
  assisted_bodyweight: "Assisted (Machine/Band)",
  reps_only: "Reps Only",
  duration: "Duration",
  isometric_hold: "Isometric Hold",
  distance_duration: "Distance & Duration",
  weight_distance: "Weight & Distance",
  weighted_duration: "Weighted Duration",
  per_side_weight: "Per-Side Weight",
};

// A set is eligible for the classic weight×reps volume/PR math only for these types — everything
// else contributes to training-volume tonnage in a different unit (or none at all), and must never
// silently compute NaN/garbage the way `st.weight * st.reps` would on a set with neither field.
export const WEIGHT_REPS_TRACKING_TYPES = new Set(["weight_reps", "bodyweight_plus_weight", "per_side_weight"]);

/* ------------------------------------------------------------------ */
/* Movement-pattern ("pose") content — form cues, mistakes, safety,    */
/* secondary regions, and setup/execution instructions, shared across  */
/* every exercise using that pattern.                                  */
/* ------------------------------------------------------------------ */

export const POSE_TIPS = {
  press_lying: ["Retract shoulder blades and keep them pinned to the bench", "Lower under control to chest level, don't bounce", "Drive feet into the floor as you press"],
  press_seated_machine: ["Set seat height so handles align with mid-chest", "Avoid shrugging shoulders up as you press", "Control the return instead of letting the weight snap back"],
  push_up: ["Keep a straight line from head to heels", "Lower chest to just above the floor", "Elbows track back at roughly 45°, not flared out"],
  dip: ["Lean torso forward to bias chest, upright to bias triceps", "Lower until shoulders are level with elbows", "Avoid excessive shoulder rounding at the bottom"],
  pullup: ["Start from a dead hang each rep", "Drive elbows down and back, chest toward the bar", "Avoid excessive swinging if training for strength"],
  pulldown: ["Lead with elbows down and back, not hands", "Avoid leaning back excessively to cheat the weight", "Pull to upper chest and pause briefly"],
  row: ["Keep the torso angle fixed through the set", "Pull elbows back, squeeze shoulder blades together", "Avoid using momentum to heave the weight"],
  hinge: ["Keep the weight close to the body throughout", "Brace core hard before initiating the pull", "Drive hips forward to finish, don't lean back excessively"],
  press_overhead: ["Brace core and glutes to protect the lower back", "Bar or dumbbells travel straight up", "Fully lock out overhead, don't stop short"],
  lateral_raise: ["Lead with elbows, not hands", "Raise to roughly shoulder height, no higher", "Control the negative instead of dropping the weight"],
  rear_delt: ["Hinge forward until torso is near parallel to the floor", "Lead with elbows, squeeze shoulder blades at the top", "Keep a slight, fixed bend in the elbows"],
  shrug: ["Lift straight up, avoid rolling the shoulders", "Pause briefly at the top contraction", "Control the descent rather than dropping the weight"],
  neck: ["Move slowly and stop well short of pain", "Use light resistance until control is established", "Keep the rest of the spine neutral throughout"],
  curl: ["Keep elbows pinned to your sides", "Avoid swinging the torso to move the weight", "Control the lowering phase, don't just drop it"],
  triceps_ext: ["Keep elbows fixed and close to your sides or head", "Extend fully but avoid snapping the elbow joint", "Control the return instead of letting it fly back"],
  wrist_curl: ["Move through the wrist only, forearm stays still", "Use a full range of motion, don't rush it", "Light weight is enough — this is a small joint"],
  squat: ["Brace core before descending, keep it tight throughout", "Knees track in line with toes, don't cave inward", "Hit consistent depth every rep"],
  leg_press: ["Don't let knees cave inward under load", "Avoid locking knees out hard at the top", "Lower until knees reach roughly 90°"],
  lunge: ["Front knee tracks over the ankle, not past the toes", "Keep torso upright through the movement", "Push through the front heel to stand"],
  leg_extension: ["Avoid slamming into full lockout at the top", "Control the negative on the way down", "Align the knee joint with the machine's pivot point"],
  leg_curl: ["Avoid lifting hips up to cheat the rep", "Control the eccentric instead of letting it snap back", "Use a full range from extended to fully curled"],
  hip_thrust: ["Drive through heels, squeeze glutes hard at the top", "Chin tucked, avoid hyperextending the lower back", "Full lockout with hips extended, not partial reps"],
  calf_raise: ["Full stretch at the bottom before pressing up", "Pause briefly at peak contraction", "Avoid bouncing out of the bottom position"],
  hip_swing: ["Move through a controlled range, no jerking", "Keep the working hip stable, avoid rotating the torso", "Squeeze at the end range for a beat"],
  core_crunch: ["Round the spine to crunch, don't just hinge at the hips", "Keep hips fixed, movement comes from the torso", "Exhale forcefully on the way up"],
  leg_raise_hang: ["Curl the pelvis, don't just swing the legs", "Control the descent instead of dropping fast", "Minimize body swing throughout the set"],
  plank: ["Straight line from shoulders to heels (or hips, for side plank)", "Brace like you're about to be tapped in the stomach", "Avoid letting hips sag or pike up"],
  twist: ["Rotate from the torso, keep hips relatively still", "Control the tempo instead of flinging side to side", "Keep movements deliberate, not momentum-driven"],
  carry: ["Brace core and stand tall, avoid leaning to one side", "Keep shoulders back, don't let the weight round you forward", "Take controlled steps rather than rushing"],
  // New pose families introduced by this expansion — each gets an honest "pending" media status
  // (see mediaStatus derivation below) rather than a guessed or reused illustration, but still
  // gets real, original coaching content since the text and the picture are independent concerns.
  kickback: ["Keep the upper arm fixed and parallel to the floor throughout", "Extend through the elbow only, don't let the shoulder drive it", "Squeeze at full extension before returning under control"],
  sissy_squat: ["Keep hips extended throughout — the bend happens at the knee, not the hip", "Use a support for balance until the movement is well controlled", "Lower only as far as good knee control allows"],
  cossack_squat: ["Keep the working foot flat and heel down as long as possible", "Sit back into the working hip rather than caving the knee inward", "Keep the straight leg's toes pulled up toward the shin"],
  reverse_nordic: ["Keep hips fully extended and the body in one line from knee to head", "Lower only as far as control allows, no free-falling", "Use the quads to pull back up, not momentum"],
  erg: ["Drive with the legs first, then lean back, then pull with the arms", "Reverse the order on the way back: arms, then torso, then legs", "Keep the stroke rate controlled rather than rushed"],
  bike: ["Keep a stable, upright posture rather than rocking the torso", "Maintain a consistent cadence rather than surging", "Adjust resistance rather than just pedaling faster to raise effort"],
  run_walk: ["Land under the hips rather than reaching out in front", "Keep a relaxed upper body and consistent breathing rhythm", "Start conservatively and build pace rather than starting too fast"],
  stair_climb: ["Use the whole foot on each step, not just the toes", "Keep torso upright rather than leaning on the handrails", "Keep a sustainable step rate rather than sprinting the first minute"],
  jump_rope: ["Jump just high enough to clear the rope, not for height", "Keep elbows close to the body, turn the rope from the wrists", "Land softly on the balls of the feet"],
  burpee: ["Keep the chest-to-floor phase controlled, not a collapse", "Land the jump squat softly with knees tracking over toes", "Keep pace sustainable — form breaks down fast when rushed"],
  box_jump: ["Land softly with knees bent, absorbing the impact", "Step down off the box rather than jumping down", "Pick a height you can land on with control, not just barely clear"],
  med_ball_throw: ["Generate power from the legs and hips, not just the arms", "Follow through fully on the release", "Reset fully between reps rather than rushing the next one"],
};

const COMMON_MISTAKES = {
  press_lying: ["Bouncing the bar off the chest instead of a controlled touch", "Flaring elbows out to 90°, putting unnecessary strain on the shoulder"],
  press_seated_machine: ["Shrugging the shoulders up toward the ears during the press", "Letting the weight stack slam down between reps"],
  push_up: ["Letting the hips sag or pike instead of a straight line", "Flaring elbows out to the sides instead of ~45°"],
  dip: ["Going so deep the shoulders round forward excessively", "Using momentum/bouncing at the bottom instead of a controlled stop"],
  pullup: ["Using body swing (kipping) when training for strict strength", "Not reaching a full dead hang between reps"],
  pulldown: ["Leaning back excessively to use body English instead of the lats", "Pulling behind the neck, which strains the shoulder unnecessarily"],
  row: ["Using momentum/torso swing instead of the back muscles", "Rounding the lower back under load"],
  hinge: ["Rounding the lower back instead of hinging at the hips", "Letting the bar drift away from the shins/body"],
  press_overhead: ["Arching the lower back excessively to press past a sticking point", "Pressing the bar forward instead of straight up"],
  lateral_raise: ["Using momentum to swing the weight up instead of a controlled raise", "Raising past shoulder height, which shifts load onto the traps"],
  rear_delt: ["Using momentum instead of a controlled squeeze", "Letting the torso rise back up mid-set instead of staying hinged"],
  squat: ["Knees caving inward under load", "Losing depth consistency between reps"],
  leg_press: ["Locking the knees out hard at the top", "Letting the knees cave inward"],
  leg_extension: ["Slamming into full lockout instead of a controlled top", "Using momentum instead of a smooth extension"],
  leg_curl: ["Lifting the hips off the pad to cheat the weight up", "Letting the weight drop instead of a controlled negative"],
  curl: ["Swinging the torso to heave the weight up", "Only using the top half of the range of motion"],
  triceps_ext: ["Letting the elbows flare out and drift forward", "Using the shoulders to help instead of isolating the triceps"],
  calf_raise: ["Bouncing out of the bottom instead of a full stretch", "Cutting the range of motion short at the top"],
  core_crunch: ["Pulling on the neck instead of using the abs", "Using the hip flexors (a hip hinge) instead of spinal flexion"],
  plank: ["Letting the hips sag toward the floor", "Holding the breath instead of breathing normally"],
  shrug: ["Rolling the shoulders instead of a straight vertical shrug", "Using the arms/elbows to help heave the weight"],
  neck: ["Using resistance heavier than the small neck muscles can control", "Rushing the range of motion instead of moving deliberately"],
  wrist_curl: ["Using so much weight that the range of motion shrinks to almost nothing", "Letting the forearm lift off the support surface"],
  lunge: ["Letting the front knee travel well past the toes", "Pushing off the back foot instead of the front heel to stand"],
  hip_thrust: ["Hyperextending the lower back at the top instead of stopping at full hip extension", "Setting up with the bar rolling on the hips instead of a pad"],
  hip_swing: ["Using momentum/swinging instead of a controlled muscle contraction", "Rotating the torso to help move the weight"],
  leg_raise_hang: ["Using body swing to fling the legs up", "Only performing a partial range of motion"],
  twist: ["Using the arms to yank the weight around instead of rotating from the torso", "Moving so fast that the lower back takes over the rotation"],
  carry: ["Leaning to one side under an uneven load instead of staying tall", "Taking the first few steps too fast before finding stable footing"],
  kickback: ["Letting the upper arm drop as the set fatigues, turning it into a row", "Using a heavier weight than can be controlled through full extension"],
  sissy_squat: ["Hinging at the hips instead of keeping them extended", "Using too much added weight before bodyweight control is solid"],
  cossack_squat: ["Letting the working knee cave inward instead of tracking over the toes", "Rushing the tempo instead of controlling the descent"],
  reverse_nordic: ["Bending at the hips instead of keeping them locked out", "Dropping too fast instead of a slow, controlled lower"],
  erg: ["Pulling with the arms before the legs finish driving", "Rounding the lower back at the catch position"],
  bike: ["Death-gripping the handlebars instead of a relaxed hold", "Rocking the hips side to side instead of a stable base"],
  run_walk: ["Overstriding (landing well ahead of the hips)", "Starting at race pace instead of warming into it"],
  stair_climb: ["Leaning heavily on the rails to reduce effective effort", "Taking two steps at a time before the movement is well controlled"],
  jump_rope: ["Jumping much higher than needed, wasting energy", "Turning the rope from the shoulders instead of the wrists"],
  burpee: ["Letting the lower back sag in the plank position", "Rushing to the point form completely breaks down"],
  box_jump: ["Jumping down off the box instead of stepping down", "Choosing a height that forces an unstable, off-balance landing"],
  med_ball_throw: ["Using only the arms instead of driving power from the legs/hips", "Not resetting posture between throws"],
};

const SAFETY_NOTES = {
  hinge: "Stop the set if you feel the lower back rounding under load — that's the point to reduce weight, not push through.",
  squat: "Keep a spotter or safety pins available when working near your limit on a barbell squat.",
  press_overhead: "Avoid pressing directly overhead if you have a pre-existing shoulder impingement — check with a professional first.",
  neck: "Move slowly and stop immediately if you feel sharp pain rather than normal muscular effort.",
  pullup: "Build up gradually if returning from any shoulder or elbow issue — this is a demanding movement for those joints.",
  box_jump: "Choose a height you can consistently land on with both feet flat and knees tracking well — missed box jumps are a common source of shin injuries.",
  reverse_nordic: "Start with a small range of motion — this loads the knee extensors eccentrically in a way most lifters aren't used to.",
  sissy_squat: "Build up gradually — this places significant stress through the knees and patellar tendon.",
};

// Secondary (assisting) *regions*, at the same 18/21-region granularity as the readiness map,
// keyed by pose. This is what lets a press or dip register real secondary triceps load in the
// readiness calculation instead of only the isolation exercises counting — see
// applySecondaryLoad() in App.jsx.
export const SECONDARY_REGIONS_BY_POSE = {
  press_lying: ["triceps", "frontDelts"],
  press_seated_machine: ["triceps", "frontDelts"],
  push_up: ["triceps", "frontDelts", "abs"],
  dip: ["triceps", "frontDelts"],
  pullup: ["biceps", "rearDelts", "forearms"],
  pulldown: ["biceps", "rearDelts"],
  row: ["biceps", "rearDelts", "forearms"],
  hinge: ["glutes", "lowerBack", "forearms"],
  press_overhead: ["triceps", "sideDelts", "traps"],
  lateral_raise: ["traps"],
  rear_delt: ["traps", "upperBack"],
  shrug: ["upperBack", "forearms"],
  neck: [],
  curl: ["forearms"],
  triceps_ext: [],
  wrist_curl: [],
  squat: ["glutes", "hamstrings", "adductors", "abs"],
  leg_press: ["glutes", "hamstrings"],
  lunge: ["glutes", "hamstrings", "adductors"],
  leg_extension: [],
  leg_curl: ["glutes"],
  hip_thrust: ["hamstrings", "abs"],
  calf_raise: [],
  hip_swing: [],
  core_crunch: [],
  leg_raise_hang: ["hipFlexors", "obliques"],
  plank: ["abs", "obliques", "sideDelts"],
  twist: ["abs"],
  carry: ["forearms", "traps", "abs"],
  kickback: [],
  sissy_squat: ["abs"],
  cossack_squat: ["adductors", "abductors"],
  reverse_nordic: ["abs"],
  erg: ["lats", "quads", "hamstrings"],
  bike: ["glutes", "calves"],
  run_walk: ["calves", "glutes", "hipFlexors"],
  stair_climb: ["glutes", "calves"],
  jump_rope: ["calves"],
  burpee: ["triceps", "abs", "glutes"],
  box_jump: ["hamstrings", "calves"],
  med_ball_throw: ["abs", "obliques"],
};

// One original, concise setup/execution pair per movement pattern rather than per exercise: the
// mechanics genuinely are shared across every barbell/dumbbell/machine/cable variant of the same
// pattern (a "press_lying" exercise is always "lie back, unrack/lift, lower to the chest, press
// back up" — the equipment and angle, already stated in the exercise's own name, is what changes,
// not the underlying setup/execution). This keeps every exercise's guidance genuinely accurate
// without 500+ near-duplicate hand-written paragraphs. A small number of exercises that need
// something beyond their pattern's default (the full triceps family, plus a handful of flagship
// lifts) get an explicit per-exercise override — see EXERCISES' `instructions` field below.
export const POSE_SETUP_EXECUTION = {
  press_lying: { setup: "Lie back on the bench with feet flat on the floor and shoulder blades pulled together and pinned down.", execution: "Lower the weight under control to touch the chest, then press it back up along the same path to a full lockout.", breathingCue: "Inhale on the way down, exhale forcefully as you press up." },
  press_seated_machine: { setup: "Set the seat so the handles line up with mid-chest height and sit back fully against the pad.", execution: "Press the handles forward to a controlled lockout, then let them return without letting the stack slam.", breathingCue: "Exhale on the press, inhale on the return." },
  push_up: { setup: "Set hands slightly wider than shoulder width, body in a straight line from head to heels.", execution: "Lower the chest to just above the floor, then press back up without letting the hips sag or pike.", breathingCue: "Inhale on the way down, exhale on the way up." },
  dip: { setup: "Support the body on parallel bars with arms locked out, leaning the torso forward or staying upright depending on the target.", execution: "Lower until the shoulders are roughly level with the elbows, then press back to lockout.", breathingCue: "Inhale on the descent, exhale on the press." },
  pullup: { setup: "Hang from the bar at a full dead hang with hands set at the desired grip width.", execution: "Pull the chest toward the bar by driving the elbows down and back, then lower under control to a full hang.", breathingCue: "Exhale as you pull up, inhale on the way down." },
  pulldown: { setup: "Sit with thighs secured under the pad and grip the bar at the desired width.", execution: "Pull the bar down toward the upper chest by driving the elbows down and back, then let it return under control.", breathingCue: "Exhale on the pull, inhale on the return." },
  row: { setup: "Hinge to set a fixed torso angle and take a secure grip on the bar, handles, or cable attachment.", execution: "Pull the weight toward the torso by driving the elbows back, squeeze the shoulder blades together, then extend the arms back out under control.", breathingCue: "Exhale on the pull, inhale on the extension." },
  hinge: { setup: "Stand with feet hip-width apart, gripping the bar or weight with a flat back and braced core.", execution: "Push the hips back while keeping the weight close to the body, then drive the hips forward to return to standing.", breathingCue: "Brace and inhale before the descent, exhale as the hips drive forward to finish." },
  press_overhead: { setup: "Stand or sit with the weight racked at shoulder height, feet set for a stable base, core and glutes braced.", execution: "Press the weight straight overhead to a full lockout, then lower it back to the shoulders under control.", breathingCue: "Inhale before the press, exhale as the weight passes the sticking point." },
  lateral_raise: { setup: "Stand tall holding the weight or handle at the side with a slight bend in the elbow.", execution: "Raise the arm out to the side, leading with the elbow, until it reaches roughly shoulder height, then lower under control.", breathingCue: "Exhale on the raise, inhale on the descent." },
  rear_delt: { setup: "Hinge forward until the torso is near parallel to the floor, or sit facing into a machine pad, with a slight fixed bend in the elbows.", execution: "Raise the arms out and back, squeezing the shoulder blades together at the top, then lower under control.", breathingCue: "Exhale on the raise, inhale on the return." },
  shrug: { setup: "Stand tall holding the weight at the sides or in front, arms straight.", execution: "Lift the shoulders straight up toward the ears, pause briefly, then lower under control.", breathingCue: "Exhale on the lift, inhale on the descent." },
  neck: { setup: "Sit or stand tall with the rest of the spine neutral, using light resistance or bodyweight only.", execution: "Move the head slowly and deliberately through the intended direction, then return to the start.", breathingCue: "Breathe normally throughout — this is a slow, controlled movement." },
  curl: { setup: "Stand or sit with the weight held at arm's length, elbows pinned close to the torso.", execution: "Curl the weight up by flexing the elbow, squeeze briefly at the top, then lower under control to full extension.", breathingCue: "Exhale on the curl, inhale on the lowering." },
  triceps_ext: { setup: "Fix the upper arms close to the torso or overhead, holding the bar, rope or dumbbell at a bent-elbow starting position.", execution: "Extend through the elbow to full lockout without moving the upper arm, then return under control to the start.", breathingCue: "Exhale on the extension, inhale on the return." },
  wrist_curl: { setup: "Rest the forearm on a bench or the thigh with the wrist free to move, holding a light weight.", execution: "Move the weight through the wrist joint only, using a full range of motion, then return under control.", breathingCue: "Breathe normally — the load is light enough not to require bracing." },
  squat: { setup: "Set the bar or weight in position, feet roughly shoulder width, brace the core before descending.", execution: "Sit the hips back and down while keeping the knees tracking over the toes, reaching consistent depth, then drive back up.", breathingCue: "Inhale and brace before descending, exhale after passing the hardest part of the ascent." },
  leg_press: { setup: "Sit in the machine with feet set shoulder-width on the platform, back flat against the pad.", execution: "Lower the platform under control until the knees reach roughly 90°, then press back up without locking the knees out hard.", breathingCue: "Inhale on the way down, exhale on the press." },
  lunge: { setup: "Set up with one foot forward (or elevated for split squats/step-ups), torso upright.", execution: "Lower under control until the front knee reaches roughly 90°, keeping the knee tracking over the ankle, then push through the front heel to return.", breathingCue: "Inhale on the descent, exhale on the drive back up." },
  leg_extension: { setup: "Sit with the knee joint aligned to the machine's pivot point and shins behind the pad.", execution: "Extend the knees to a controlled lockout, then lower back down without slamming the stack.", breathingCue: "Exhale on the extension, inhale on the return." },
  leg_curl: { setup: "Position the body so the knee joint aligns with the machine's pivot and the pad sits against the lower leg or ankle.", execution: "Curl through a full range of motion to full flexion, then lower under control rather than letting it snap back.", breathingCue: "Exhale on the curl, inhale on the release." },
  hip_thrust: { setup: "Set the upper back against a bench with the bar or weight over the hips, feet flat and set for a stable drive.", execution: "Drive through the heels to full hip extension, squeezing the glutes hard at the top, then lower under control.", breathingCue: "Inhale at the bottom, exhale as the hips drive up." },
  calf_raise: { setup: "Set the balls of the feet on the platform or step with a full stretch at the bottom.", execution: "Press up onto the toes to peak contraction, pause briefly, then lower back to a full stretch under control.", breathingCue: "Exhale on the raise, inhale on the lowering." },
  hip_swing: { setup: "Set the machine pad or cable cuff against the working leg with the hip in a stable, controlled starting position.", execution: "Move the leg through the intended plane (inward for adduction, outward for abduction) under control, then return.", breathingCue: "Exhale on the working phase, inhale on the return." },
  core_crunch: { setup: "Set up with hips fixed (seated, kneeling at a cable stack, or lying down) and hands lightly supporting the head.", execution: "Round the spine to crunch the ribs toward the pelvis, exhaling forcefully, then return under control.", breathingCue: "Exhale forcefully on the crunch, inhale on the return." },
  leg_raise_hang: { setup: "Hang from a bar or support the torso on a captain's chair, legs extended or knees bent.", execution: "Curl the pelvis to raise the legs or knees, minimizing body swing, then lower under control.", breathingCue: "Exhale on the raise, inhale on the lowering." },
  plank: { setup: "Set up on forearms or hands (or on one forearm and the side of the foot for a side plank) in a straight line.", execution: "Hold the position, bracing like you're about to be tapped in the stomach, without letting the hips sag or pike.", breathingCue: "Breathe steadily throughout — don't hold the breath." },
  twist: { setup: "Set up seated, standing, or kneeling with a stable base and the weight or handle held in front of the torso.", execution: "Rotate from the torso through a controlled range, keeping the hips relatively still, then return.", breathingCue: "Exhale on the rotation, inhale on the return." },
  carry: { setup: "Grip the weight, load the sled, or set the pack securely, and stand tall before moving.", execution: "Walk or push with controlled steps, keeping the torso upright and shoulders back for the prescribed distance or time.", breathingCue: "Breathe rhythmically with the steps rather than holding the breath." },
  kickback: { setup: "Hinge forward with the upper arm fixed parallel to the floor, elbow bent to roughly 90°.", execution: "Extend the arm straight back through the elbow, squeeze at full extension, then return under control.", breathingCue: "Exhale on the extension, inhale on the return." },
  sissy_squat: { setup: "Stand holding a fixed support, heels may rise as the movement progresses.", execution: "Lean back and bend the knees, keeping hips extended, lowering only as far as control allows, then use the quads to return.", breathingCue: "Inhale on the way down, exhale driving back up." },
  cossack_squat: { setup: "Stand in a wide stance, weight optional held at the chest.", execution: "Shift the weight over one bent knee while the other leg stays straight, sitting back into the working hip, then push back to center.", breathingCue: "Inhale on the way down, exhale returning to center." },
  reverse_nordic: { setup: "Kneel with the tops of the feet anchored, body in a straight line from knee to head.", execution: "Lean back from the knees as far as control allows, keeping the hips extended, then use the quads to pull back to vertical.", breathingCue: "Inhale on the way back, exhale returning upright." },
  erg: { setup: "Strap in, grip the handle, and set the starting position with knees bent and arms extended.", execution: "Drive with the legs, then the torso, then the arms; reverse the sequence on the way back to the catch.", breathingCue: "Exhale on the drive, inhale on the recovery." },
  bike: { setup: "Set seat height so the knee has a slight bend at full pedal extension.", execution: "Pedal at a controlled, sustainable cadence for the prescribed duration or distance, adjusting resistance rather than just speed.", breathingCue: "Breathe steadily throughout, matching effort to a sustainable rhythm." },
  run_walk: { setup: "Set the desired pace and, if applicable, incline before starting.", execution: "Maintain a consistent stride and posture for the prescribed distance or duration.", breathingCue: "Settle into a steady breathing rhythm rather than holding tension." },
  stair_climb: { setup: "Step onto the machine and set a sustainable starting pace.", execution: "Climb using the whole foot on each step, keeping the torso upright rather than leaning on the rails.", breathingCue: "Breathe steadily, matching effort to a pace that can be sustained for the set." },
  jump_rope: { setup: "Hold the handles lightly with elbows close to the body.", execution: "Turn the rope from the wrists and jump just high enough to clear it, landing softly.", breathingCue: "Breathe rhythmically with the jumps rather than holding the breath." },
  burpee: { setup: "Start standing, with space cleared to drop to the floor and jump.", execution: "Drop to a plank, perform a push-up if included, jump the feet back in, then jump up explosively.", breathingCue: "Exhale on the jump, inhale on the way down to the plank." },
  box_jump: { setup: "Stand facing the box with feet shoulder-width, a comfortable distance away.", execution: "Swing the arms and jump onto the box, landing softly with knees bent, then step back down.", breathingCue: "Exhale explosively on the jump." },
  med_ball_throw: { setup: "Hold the ball securely and set a stable stance facing the wall or open space.", execution: "Generate power from the legs and hips first, then release the ball with full extension, resetting fully between reps.", breathingCue: "Exhale sharply on the release." },
};

/* ------------------------------------------------------------------ */
/* Deriving structured metadata from (muscle, equipment, pose, name)   */
/* ------------------------------------------------------------------ */
// Rather than hand-type mechanics/force/laterality/difficulty/trackingType on all ~500 entries
// (error-prone and inconsistent), these are derived by a small, auditable rule set applied once at
// module load. Any exercise can still override a derived value by setting the field explicitly in
// its own object literal (see e.g. a handful of advanced-bodyweight entries below) — explicit
// values always win over derived ones.

const COMPOUND_POSES = new Set([
  "press_lying", "press_seated_machine", "push_up", "dip", "pullup", "pulldown", "row", "hinge",
  "press_overhead", "squat", "leg_press", "lunge", "erg", "burpee", "box_jump", "reverse_nordic",
  "sissy_squat", "cossack_squat",
]);
const PUSH_POSES = new Set(["press_lying", "press_seated_machine", "push_up", "dip", "press_overhead", "squat", "leg_press", "lunge", "leg_extension", "calf_raise", "box_jump"]);
const PULL_POSES = new Set(["pullup", "pulldown", "row", "hinge", "curl", "shrug", "leg_curl", "rear_delt", "lateral_raise", "leg_raise_hang", "twist", "erg"]);
const STATIC_POSES = new Set(["plank", "wrist_curl", "neck", "hip_swing", "sissy_squat", "reverse_nordic"]);
const LOCOMOTION_POSES = new Set(["carry", "run_walk", "bike", "stair_climb", "jump_rope", "erg"]);
const DURATION_POSES = new Set(["plank", "carry", "erg", "bike", "run_walk", "stair_climb", "jump_rope"]);
const UNILATERAL_HINTS = /single[- ]arm|single[- ]leg|one[- ]arm|alternating|bulgarian|cossack|suitcase|pistol/i;
const ASSISTED_HINTS = /assisted/i;
const WEIGHTED_BODYWEIGHT_HINTS = /weighted/i;
const ADVANCED_HINTS = /nordic|pistol|muscle[- ]up|weighted (pull|dip|push)|snatch grip|zercher|sissy|reverse nordic/i;
const BEGINNER_EQUIPMENT = new Set(["Machine", "Cable"]);

function deriveMechanics(ex) {
  return COMPOUND_POSES.has(ex.pose) ? "compound" : "isolation";
}
function deriveForce(ex) {
  if (STATIC_POSES.has(ex.pose)) return "static";
  if (LOCOMOTION_POSES.has(ex.pose)) return "locomotion";
  if (PUSH_POSES.has(ex.pose)) return "push";
  if (PULL_POSES.has(ex.pose)) return "pull";
  return "push";
}
function deriveLaterality(ex) {
  if (UNILATERAL_HINTS.test(ex.name)) return ex.name.toLowerCase().includes("alternating") ? "alternating" : "unilateral";
  return "bilateral";
}
function deriveDifficulty(ex) {
  if (ADVANCED_HINTS.test(ex.name)) return "advanced";
  if (BEGINNER_EQUIPMENT.has(ex.equipment) && !COMPOUND_POSES.has(ex.pose)) return "beginner";
  if (ex.equipment === "Bodyweight" && !COMPOUND_POSES.has(ex.pose)) return "beginner";
  if (COMPOUND_POSES.has(ex.pose) && (ex.equipment === "Barbell" || ex.equipment === "Bodyweight")) return "intermediate";
  return "intermediate";
}
function deriveTrackingType(ex) {
  if (ASSISTED_HINTS.test(ex.name)) return "assisted_bodyweight";
  if (WEIGHTED_BODYWEIGHT_HINTS.test(ex.name) && ex.equipment === "Bodyweight") return "bodyweight_plus_weight";
  if (ex.pose === "plank" || ex.pose === "sissy_squat" || ex.pose === "reverse_nordic") return "isometric_hold";
  if (ex.pose === "distance_duration") return "distance_duration";
  if (DURATION_POSES.has(ex.pose) && ex.equipment === "Conditioning") return "distance_duration";
  if (ex.equipment === "Bodyweight" && ["pullup", "dip", "push_up", "leg_raise_hang", "kickback", "burpee", "jump_rope"].includes(ex.pose)) return "bodyweight_reps";
  return "weight_reps";
}

/** Fills in every derivable field an exercise object doesn't already explicitly set. */
function withDefaults(ex) {
  // The same pose can be the PRIMARY region for one muscle group (arms/press_lying -> triceps)
  // and drive a SECONDARY region for another (chest/press_lying -> triceps as an assisting
  // muscle) — the shared pose-level secondary list is written from that second, more common
  // perspective, so it must never be applied verbatim to an exercise whose own primary region is
  // the same one: a "secondary triceps" entry on an exercise that IS the triceps exercise is
  // meaningless self-reference, not real data.
  const primaryRegion = regionForExercise(ex);
  const derivedSecondary = (SECONDARY_REGIONS_BY_POSE[ex.pose] || []).filter((id) => id !== primaryRegion);
  return {
    mechanics: deriveMechanics(ex),
    force: deriveForce(ex),
    laterality: deriveLaterality(ex),
    difficulty: deriveDifficulty(ex),
    trackingType: deriveTrackingType(ex),
    aliases: [],
    secondaryMuscles: derivedSecondary,
    ...ex,
  };
}

/** kebab-case slug used as the canonical-model `id` field. NOT used as a join key anywhere in the
 *  app today — `name` remains the real identity, see the stability contract at the top of this
 *  file — this exists so the object shape matches the requested canonical model and so a future
 *  migration to id-based joins has a stable value ready to use. */
function slugify(name) {
  return name.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

/* ------------------------------------------------------------------ */
/* Region derivation (readiness map + fine-grained filters)             */
/* ------------------------------------------------------------------ */
// Built from every real (muscle, pose) combination present in the catalogue. Extended (not
// replaced) from the original 6-group/18-region mapping to cover every new pose introduced by this
// expansion. Two judgment calls carried over from the original mapping, still true: shrugs/neck
// exercises are tagged muscle:"shoulders" (not "back") so they drive Traps from that real data;
// "neck" itself has no dedicated readiness region and is grouped into Traps as the nearest real one.
export const POSE_TO_REGION = {
  chest: { press_lying: "chest", press_seated_machine: "chest", push_up: "chest", dip: "chest" },
  shoulders: {
    press_overhead: "frontDelts", press_seated_machine: "frontDelts",
    lateral_raise: "sideDelts",
    rear_delt: "rearDelts",
    shrug: "traps", neck: "traps",
  },
  back: { pullup: "lats", pulldown: "lats", row: "upperBack", hinge: "lowerBack" },
  arms: { curl: "biceps", press_lying: "triceps", triceps_ext: "triceps", dip: "triceps", wrist_curl: "forearms", kickback: "triceps", push_up: "triceps" },
  core: { core_crunch: "abs", leg_raise_hang: "abs", plank: "abs", twist: "obliques" },
  legs: {
    squat: "quads", leg_press: "quads", leg_extension: "quads", lunge: "quads", plank: "quads",
    hinge: "hamstrings", leg_curl: "hamstrings", reverse_nordic: "quads", sissy_squat: "quads",
    hip_thrust: "glutes",
    calf_raise: "calves",
    cossack_squat: "adductors",
  },
  conditioning: { carry: "forearms", erg: "lats", bike: "quads", run_walk: "quads", stair_climb: "glutes", jump_rope: "calves", burpee: "chest", box_jump: "quads", med_ball_throw: "abs" },
};

// Fallback per muscle group — used for custom exercises (no `pose`) and any future (muscle,pose)
// pair not yet in POSE_TO_REGION.
export const GROUP_DEFAULT_REGION = { chest: "chest", shoulders: "frontDelts", back: "upperBack", arms: "biceps", legs: "quads", core: "abs", conditioning: "forearms" };

/** Primary readiness region for an exercise. An explicit `ex.region` always wins (used below to
 *  fix three confirmed mis-mappings — adduction/abduction/tibialis work that used to silently
 *  resolve to glutes/quads purely because of pose reuse — without touching `pose`, `name` or
 *  `equipment`, so illustrations and workout history are completely unaffected). */
export function regionForExercise(ex) {
  if (!ex) return null;
  if (ex.region) return ex.region;
  return POSE_TO_REGION[ex.muscle]?.[ex.pose] || GROUP_DEFAULT_REGION[ex.muscle] || null;
}

/* ------------------------------------------------------------------ */
/* The catalogue                                                       */
/* ------------------------------------------------------------------ */
// RAW_EXERCISES below is the literal, hand-authored data: every one of the original 223 entries
// (name/muscle/equipment/pose values byte-for-byte unchanged from before this expansion, except
// three documented region-mapping fixes below and the Strongman->conditioning muscle
// reclassification) plus ~250 new entries covering the gaps identified in
// reports/exercise-library-gap-report.md. `region` is only set explicitly where it must differ
// from what POSE_TO_REGION would otherwise derive (see regionForExercise in App.jsx) — for most
// entries the existing pose-based derivation is correct and is left alone.
const RAW_EXERCISES = [
  // ==================== CHEST (existing 35 + 14 new = 49) ====================
  { name: "Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying", aliases: ["Bench Press", "Flat Bench", "Barbell Flat Bench"] },
  { name: "Incline Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Decline Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Reverse Grip Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Floor Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Flat Dumbbell Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying", aliases: ["Dumbbell Bench Press", "Flat Dumbbell Bench Press"] },
  { name: "Incline Dumbbell Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Decline Dumbbell Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Dumbbell Fly", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Incline Dumbbell Fly", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Decline Dumbbell Fly", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Dumbbell Pullover", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Hex Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Squeeze Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Chest Press Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Incline Chest Press Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Decline Chest Press Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Plate Loaded Chest Press", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Hammer Strength Chest Press", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Iso-Lateral Chest Press", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Pec Deck Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine", aliases: ["Pec Deck"] },
  { name: "Seated Fly Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine", aliases: ["Machine Chest Fly"] },
  { name: "Cable Chest Press", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "High-to-Low Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Low-to-High Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Mid Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine", aliases: ["Cable Crossover"] },
  { name: "Single Arm Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Standing Cable Press", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Cable Pullover", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Incline Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Decline Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Ring Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Weighted Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Chest Dips", muscle: "chest", equipment: "Bodyweight", pose: "dip" },
  // new chest
  { name: "Smith Machine Bench Press", muscle: "chest", equipment: "Machine", pose: "press_lying" },
  { name: "Smith Machine Incline Press", muscle: "chest", equipment: "Machine", pose: "press_lying" },
  { name: "Smith Machine Decline Press", muscle: "chest", equipment: "Machine", pose: "press_lying" },
  { name: "Neutral Grip Dumbbell Bench Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Single Arm Dumbbell Bench Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Guillotine Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Spoto Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Larsen Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Converging Chest Press Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Plate Loaded Incline Press", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Low Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Landmine Press (Chest-Biased)", muscle: "chest", equipment: "Barbell", pose: "press_overhead" },
  { name: "Svend Press", muscle: "chest", equipment: "Bodyweight", pose: "press_lying" },
  { name: "Resistance Band Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },

  // ==================== BACK (existing 32 + 20 new = 52) ====================
  { name: "Pull-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Chin-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Neutral Grip Pull-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Weighted Pull-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Assisted Pull-Up", muscle: "back", equipment: "Machine", pose: "pullup" },
  { name: "Lat Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Wide Grip Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Close Grip Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Reverse Grip Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Single Arm Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Straight Arm Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown", aliases: ["Straight-Arm Pulldown", "Lat Pullover"] },
  { name: "Barbell Row", muscle: "back", equipment: "Barbell", pose: "row", aliases: ["Bent Over Row"] },
  { name: "Pendlay Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Dumbbell Row", muscle: "back", equipment: "Dumbbell", pose: "row", aliases: ["Single Arm Dumbbell Row", "One Arm Row"] },
  { name: "Chest Supported Row (Dumbbell)", muscle: "back", equipment: "Dumbbell", pose: "row", aliases: ["Chest Supported Row"] },
  { name: "T-Bar Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Landmine Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Seated Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Wide Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Close Grip Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Single Arm Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Hammer Strength High Row", muscle: "back", equipment: "Machine", pose: "row", aliases: ["High Row"] },
  { name: "Hammer Strength Low Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Plate Loaded Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Chest Supported Machine Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Lever Row Machine", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Iso-Lateral Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Rack Pull", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge", aliases: ["Conventional Deadlift"] },
  { name: "Romanian Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge", aliases: ["RDL"] },
  { name: "Snatch Grip Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Good Morning", muscle: "back", equipment: "Barbell", pose: "hinge" },
  // new back
  { name: "Weighted Chin-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Assisted Chin-Up", muscle: "back", equipment: "Machine", pose: "pullup" },
  { name: "Band-Assisted Pull-Up", muscle: "back", equipment: "Bodyweight", pose: "pullup" },
  { name: "Kneeling Lat Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "V-Bar Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Seal Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Meadows Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Yates Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Chest Supported Row Machine", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Smith Machine Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Inverted Row", muscle: "back", equipment: "Bodyweight", pose: "row" },
  { name: "Kroc Row", muscle: "back", equipment: "Dumbbell", pose: "row" },
  { name: "Trap Bar Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Deficit Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Dumbbell Romanian Deadlift", muscle: "back", equipment: "Dumbbell", pose: "hinge" },
  { name: "Single Leg Romanian Deadlift", muscle: "back", equipment: "Dumbbell", pose: "hinge" },
  { name: "Back Extension", muscle: "back", equipment: "Bodyweight", pose: "hinge", aliases: ["Hyperextension"] },
  { name: "Weighted Back Extension", muscle: "back", equipment: "Dumbbell", pose: "hinge" },
  { name: "Reverse Hyper", muscle: "back", equipment: "Machine", pose: "hinge", aliases: ["Reverse Hyperextension"] },
  { name: "Pullover Machine", muscle: "back", equipment: "Machine", pose: "press_seated_machine" },

  // ==================== SHOULDERS (existing 31 + 15 new = 46) ====================
  { name: "Overhead Press (Barbell)", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead", aliases: ["OHP", "Standing Barbell Press", "Military Press"] },
  { name: "Seated Barbell Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Dumbbell Shoulder Press", muscle: "shoulders", equipment: "Dumbbell", pose: "press_overhead" },
  { name: "Arnold Press", muscle: "shoulders", equipment: "Dumbbell", pose: "press_overhead" },
  { name: "Machine Shoulder Press", muscle: "shoulders", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Smith Machine Shoulder Press", muscle: "shoulders", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Dumbbell Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise", aliases: ["Lateral Raise", "Lat Raise", "Side Raise"] },
  { name: "Cable Lateral Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise", aliases: ["Cable Lat Raise"] },
  { name: "Machine Lateral Raise", muscle: "shoulders", equipment: "Machine", pose: "lateral_raise", aliases: ["Lateral Raise Machine"] },
  { name: "Leaning Cable Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Behind-the-Back Cable Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Incline Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Partial Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Reverse Pec Deck", muscle: "shoulders", equipment: "Machine", pose: "rear_delt", aliases: ["Rear Delt Machine"] },
  { name: "Rear Delt Fly", muscle: "shoulders", equipment: "Dumbbell", pose: "rear_delt", aliases: ["Bent Over Rear Delt Fly"] },
  { name: "Cable Rear Delt Fly", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Face Pull", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Bent Over Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "rear_delt" },
  { name: "Machine Rear Delt Fly", muscle: "shoulders", equipment: "Machine", pose: "rear_delt" },
  { name: "Barbell Shrug", muscle: "shoulders", equipment: "Barbell", pose: "shrug" },
  { name: "Dumbbell Shrug", muscle: "shoulders", equipment: "Dumbbell", pose: "shrug" },
  { name: "Smith Machine Shrug", muscle: "shoulders", equipment: "Machine", pose: "shrug" },
  { name: "Cable Shrug", muscle: "shoulders", equipment: "Cable", pose: "shrug" },
  { name: "Trap Bar Shrug", muscle: "shoulders", equipment: "Barbell", pose: "shrug" },
  { name: "Upright Row", muscle: "shoulders", equipment: "Barbell", pose: "shrug" },
  { name: "Neck Flexion", muscle: "shoulders", equipment: "Bodyweight", pose: "neck" },
  { name: "Neck Extension", muscle: "shoulders", equipment: "Bodyweight", pose: "neck" },
  { name: "Neck Lateral Flexion", muscle: "shoulders", equipment: "Bodyweight", pose: "neck" },
  { name: "Neck Harness Extensions", muscle: "shoulders", equipment: "Machine", pose: "neck" },
  { name: "Plate Neck Curl", muscle: "shoulders", equipment: "Machine", pose: "neck" },
  { name: "Four-Way Neck Machine", muscle: "shoulders", equipment: "Machine", pose: "neck" },
  // new shoulders
  { name: "Landmine Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Single Arm Landmine Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Push Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Z Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Single Arm Dumbbell Shoulder Press", muscle: "shoulders", equipment: "Dumbbell", pose: "press_overhead" },
  { name: "Cable Front Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Dumbbell Front Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise", aliases: ["Front Raise"] },
  { name: "Plate Front Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Y-Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise", aliases: ["Y Raise"] },
  { name: "Cable Y-Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Standing Cable Face Pull", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Rope Face Pull to External Rotation", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Cable External Rotation", muscle: "shoulders", equipment: "Cable", pose: "rear_delt", aliases: ["Rotator Cuff External Rotation"] },
  { name: "Cable Internal Rotation", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Band Pull-Apart", muscle: "shoulders", equipment: "Bodyweight", pose: "rear_delt" },

  // ==================== ARMS — biceps, triceps, forearms (existing 44 + 35 new = 79) ====================
  { name: "Barbell Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "EZ Bar Curl", muscle: "arms", equipment: "Barbell", pose: "curl", aliases: ["EZ-Bar Curl"] },
  { name: "Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Alternating Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Hammer Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Cross Body Hammer Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Concentration Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Incline Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Spider Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Preacher Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Rope Curl", muscle: "arms", equipment: "Cable", pose: "curl", aliases: ["Rope Hammer Curl"] },
  { name: "Bayesian Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Single Arm Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "High Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Reverse Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Preacher Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Seated Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Plate Loaded Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Skull Crusher", muscle: "arms", equipment: "Barbell", pose: "press_lying", aliases: ["Barbell Skull Crusher", "Skullcrusher", "Lying Triceps Extension", "Barbell Lying Triceps Extension"] },
  { name: "Close Grip Bench Press", muscle: "arms", equipment: "Barbell", pose: "press_lying", aliases: ["Close-Grip Barbell Bench Press", "Close Grip Barbell Bench Press"] },
  { name: "Tate Press", muscle: "arms", equipment: "Dumbbell", pose: "press_lying" },
  { name: "JM Press", muscle: "arms", equipment: "Barbell", pose: "press_lying" },
  { name: "Dumbbell Overhead Extension", muscle: "arms", equipment: "Dumbbell", pose: "triceps_ext", aliases: ["Dumbbell Overhead Triceps Extension"] },
  { name: "Single Arm Overhead Extension", muscle: "arms", equipment: "Dumbbell", pose: "triceps_ext", aliases: ["Single-Arm Dumbbell Overhead Triceps Extension"] },
  { name: "Rope Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Rope Triceps Pushdown", "Rope Tricep Pushdown"] },
  { name: "Straight Bar Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Straight-Bar Triceps Pushdown", "Bar Pushdown", "Tricep Pressdown"] },
  { name: "V-Bar Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["V-Bar Triceps Pushdown"] },
  { name: "Reverse Grip Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Reverse-Grip Triceps Pushdown"] },
  { name: "Overhead Rope Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Rope Overhead Triceps Extension"] },
  { name: "Cross Body Cable Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Cross-Body Cable Triceps Extension"] },
  { name: "Single Arm Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Single-Arm Cable Pushdown"] },
  { name: "Triceps Extension Machine", muscle: "arms", equipment: "Machine", pose: "triceps_ext", aliases: ["Triceps Press Machine"] },
  { name: "Assisted Dip Machine", muscle: "arms", equipment: "Machine", pose: "dip", aliases: ["Assisted Dip"] },
  { name: "Plate Loaded Dip Machine", muscle: "arms", equipment: "Machine", pose: "dip", aliases: ["Machine Triceps Dip"] },
  { name: "Bench Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip", aliases: ["Bench Dip"] },
  { name: "Parallel Bar Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip", aliases: ["Parallel-Bar Dip"] },
  { name: "Weighted Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Wrist Curl", muscle: "arms", equipment: "Dumbbell", pose: "wrist_curl" },
  { name: "Reverse Wrist Curl", muscle: "arms", equipment: "Dumbbell", pose: "wrist_curl" },
  { name: "Behind the Back Wrist Curl", muscle: "arms", equipment: "Barbell", pose: "wrist_curl" },
  { name: "Wrist Roller", muscle: "arms", equipment: "Strongman", pose: "wrist_curl" },
  { name: "Plate Pinch", muscle: "arms", equipment: "Strongman", pose: "wrist_curl" },
  { name: "Cable Wrist Curl", muscle: "arms", equipment: "Cable", pose: "wrist_curl" },
  // new arms — triceps completeness is the priority family here
  { name: "EZ-Bar Skull Crusher", muscle: "arms", equipment: "Barbell", pose: "press_lying" },
  { name: "Dumbbell Skull Crusher", muscle: "arms", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Rolling Dumbbell Triceps Extension", muscle: "arms", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Single-Arm Cable Overhead Triceps Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Overhead Cable Triceps Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext", aliases: ["Cable Overhead Triceps Extension"] },
  { name: "Cable Triceps Kickback", muscle: "arms", equipment: "Cable", pose: "kickback" },
  { name: "Dumbbell Triceps Kickback", muscle: "arms", equipment: "Dumbbell", pose: "kickback" },
  { name: "Diamond Push-Up", muscle: "arms", equipment: "Bodyweight", pose: "push_up" },
  { name: "Close-Grip Push-Up", muscle: "arms", equipment: "Bodyweight", pose: "push_up" },
  { name: "Incline Hammer Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Zottman Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Drag Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "21s Bicep Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Waiter's Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Cable Rope Hammer Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "EZ-Bar Reverse Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Cable Reverse Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Farmer's Carry Hold (Grip)", muscle: "arms", equipment: "Dumbbell", pose: "wrist_curl" },
  { name: "Dead Hang", muscle: "arms", equipment: "Bodyweight", pose: "wrist_curl", trackingType: "isometric_hold" },

  // ==================== LEGS — quads, hamstrings, glutes, calves, adductors, abductors, tibialis, hip flexors (existing 52 + 46 new = 98) ====================
  { name: "Back Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Front Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Smith Machine Squat", muscle: "legs", equipment: "Machine", pose: "squat" },
  { name: "Hack Squat (Barbell)", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Safety Bar Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Goblet Squat", muscle: "legs", equipment: "Dumbbell", pose: "squat" },
  { name: "Zercher Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Sumo Squat", muscle: "legs", equipment: "Dumbbell", pose: "squat" },
  { name: "Leg Press", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Vertical Leg Press", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Hack Squat Machine", muscle: "legs", equipment: "Machine", pose: "leg_press", aliases: ["Hack Squat"] },
  { name: "Pendulum Squat", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Belt Squat", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "V-Squat Machine", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Linear Hack Squat", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Leg Extension", muscle: "legs", equipment: "Machine", pose: "leg_extension" },
  { name: "Bulgarian Split Squat", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Walking Lunge", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Reverse Lunge", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Step-Up", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Split Squat", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Smith Machine Split Squat", muscle: "legs", equipment: "Machine", pose: "lunge" },
  { name: "Stiff Leg Deadlift", muscle: "legs", equipment: "Barbell", pose: "hinge" },
  { name: "Seated Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl", aliases: ["Ham Curl", "Hamstring Curl"] },
  { name: "Lying Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl", aliases: ["Ham Curl Machine"] },
  { name: "Standing Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Nordic Curl", muscle: "legs", equipment: "Bodyweight", pose: "leg_curl", aliases: ["Nordic Hamstring Curl"] },
  { name: "Glute Ham Raise", muscle: "legs", equipment: "Machine", pose: "leg_curl", aliases: ["GHR", "Glute-Ham Raise"] },
  { name: "Cable Leg Curl", muscle: "legs", equipment: "Cable", pose: "leg_curl" },
  { name: "Hip Thrust", muscle: "legs", equipment: "Barbell", pose: "hip_thrust" },
  { name: "Smith Machine Hip Thrust", muscle: "legs", equipment: "Machine", pose: "hip_thrust" },
  { name: "Glute Bridge", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Cable Kickback", muscle: "legs", equipment: "Cable", pose: "hip_thrust", aliases: ["Cable Glute Kickback"] },
  { name: "Machine Kickback", muscle: "legs", equipment: "Machine", pose: "hip_thrust", aliases: ["Glute Drive"] },
  { name: "Cable Pull Through", muscle: "legs", equipment: "Cable", pose: "hinge", aliases: ["Cable Pull-Through"] },
  { name: "Frog Pumps", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Sumo Deadlift", muscle: "legs", equipment: "Barbell", pose: "hinge" },
  { name: "Standing Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Seated Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Leg Press Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Smith Machine Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Donkey Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Single Leg Calf Raise", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise" },
  { name: "Tibialis Raise Machine", muscle: "legs", equipment: "Machine", pose: "calf_raise", region: "tibialisAnterior", aliases: ["Tib Raise Machine"] },
  { name: "Tibialis Raises", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise", region: "tibialisAnterior", aliases: ["Tibialis Raise", "Tib Raise"] },
  { name: "Adductor Machine", muscle: "legs", equipment: "Machine", pose: "hip_swing", region: "adductors", aliases: ["Hip Adductor Machine", "Inner Thigh Machine"] },
  { name: "Cable Adduction", muscle: "legs", equipment: "Cable", pose: "hip_swing", region: "adductors", aliases: ["Cable Hip Adduction"] },
  { name: "Copenhagen Plank", muscle: "legs", equipment: "Bodyweight", pose: "plank", region: "adductors", trackingType: "isometric_hold" },
  { name: "Hip Abduction Machine", muscle: "legs", equipment: "Machine", pose: "hip_swing", region: "abductors" },
  { name: "Cable Hip Abduction", muscle: "legs", equipment: "Cable", pose: "hip_swing", region: "abductors" },
  { name: "Standing Band Abduction", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  { name: "Side Lying Leg Raise", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  // new legs
  { name: "Pistol Squat", muscle: "legs", equipment: "Bodyweight", pose: "squat" },
  { name: "Box Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Anderson Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Landmine Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Dumbbell Squat", muscle: "legs", equipment: "Dumbbell", pose: "squat" },
  { name: "Sissy Squat", muscle: "legs", equipment: "Bodyweight", pose: "sissy_squat" },
  { name: "Cossack Squat", muscle: "legs", equipment: "Bodyweight", pose: "cossack_squat", region: "adductors" },
  { name: "Dumbbell Cossack Squat", muscle: "legs", equipment: "Dumbbell", pose: "cossack_squat", region: "adductors" },
  { name: "Curtsy Lunge", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Lateral Lunge", muscle: "legs", equipment: "Dumbbell", pose: "lunge", region: "adductors" },
  { name: "Deficit Reverse Lunge", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Smith Machine Step-Up", muscle: "legs", equipment: "Machine", pose: "lunge" },
  { name: "Barbell Walking Lunge", muscle: "legs", equipment: "Barbell", pose: "lunge" },
  { name: "Seated Leg Extension (Single Leg)", muscle: "legs", equipment: "Machine", pose: "leg_extension" },
  { name: "Reverse Nordic Curl", muscle: "legs", equipment: "Bodyweight", pose: "reverse_nordic" },
  { name: "Single Leg Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Stability Ball Leg Curl", muscle: "legs", equipment: "Bodyweight", pose: "leg_curl" },
  { name: "Single Leg Hip Thrust", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Barbell Glute Bridge", muscle: "legs", equipment: "Barbell", pose: "hip_thrust" },
  { name: "Cable Hip Thrust", muscle: "legs", equipment: "Cable", pose: "hip_thrust" },
  { name: "Banded Hip Thrust", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Dumbbell Romanian Deadlift (Single Leg)", muscle: "legs", equipment: "Dumbbell", pose: "hinge" },
  { name: "Kettlebell Swing", muscle: "legs", equipment: "Kettlebell", pose: "hinge" },
  { name: "Single Arm Kettlebell Swing", muscle: "legs", equipment: "Kettlebell", pose: "hinge" },
  { name: "Kettlebell Deadlift", muscle: "legs", equipment: "Kettlebell", pose: "hinge" },
  { name: "Kettlebell Goblet Squat", muscle: "legs", equipment: "Kettlebell", pose: "squat" },
  { name: "Standing Calf Raise Machine (Plate Loaded)", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Bodyweight Calf Raise", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise" },
  { name: "Seated Calf Raise (Dumbbell)", muscle: "legs", equipment: "Dumbbell", pose: "calf_raise" },
  { name: "Single Leg Tibialis Raise", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise", region: "tibialisAnterior" },
  { name: "Banded Tibialis Raise", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise", region: "tibialisAnterior" },
  { name: "Cable Standing Hip Flexion", muscle: "legs", equipment: "Cable", pose: "leg_raise_hang", region: "hipFlexors", aliases: ["Cable Hip Flexion"] },
  { name: "Standing Band Hip Flexion", muscle: "legs", equipment: "Bodyweight", pose: "leg_raise_hang", region: "hipFlexors" },
  { name: "Seated Hip Flexor Machine", muscle: "legs", equipment: "Machine", pose: "leg_raise_hang", region: "hipFlexors" },
  { name: "Weighted Hip Flexion (Ankle Cuff)", muscle: "legs", equipment: "Cable", pose: "leg_raise_hang", region: "hipFlexors" },
  { name: "Standing Knee Raise", muscle: "legs", equipment: "Bodyweight", pose: "leg_raise_hang", region: "hipFlexors" },
  { name: "Cable Adduction (Standing, Single Leg)", muscle: "legs", equipment: "Cable", pose: "hip_swing", region: "adductors" },
  { name: "Sumo Squat (Kettlebell)", muscle: "legs", equipment: "Kettlebell", pose: "squat" },
  { name: "Wall Sit", muscle: "legs", equipment: "Bodyweight", pose: "squat", trackingType: "isometric_hold" },
  { name: "Barbell Hip Thrust (Bench Supported)", muscle: "legs", equipment: "Barbell", pose: "hip_thrust" },
  { name: "Machine Adduction/Abduction Combo (Adduction)", muscle: "legs", equipment: "Machine", pose: "hip_swing", region: "adductors" },
  { name: "Ankle Weight Hip Abduction", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  { name: "Fire Hydrant", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  { name: "Clamshell", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  { name: "Monster Walk", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },
  { name: "Single Leg Glute Bridge", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Hip Circle Band Squat Walk", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing", region: "abductors" },

  // ==================== CORE (existing 20 + 22 new = 42) ====================
  { name: "Cable Crunch", muscle: "core", equipment: "Cable", pose: "core_crunch" },
  { name: "Machine Crunch", muscle: "core", equipment: "Machine", pose: "core_crunch" },
  { name: "Decline Crunch", muscle: "core", equipment: "Bodyweight", pose: "core_crunch" },
  { name: "Stability Ball Crunch", muscle: "core", equipment: "Bodyweight", pose: "core_crunch" },
  { name: "Weighted Crunch", muscle: "core", equipment: "Dumbbell", pose: "core_crunch" },
  { name: "Hanging Leg Raise", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Hanging Knee Raise", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Lying Leg Raise", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Reverse Crunch", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Toes to Bar", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Cable Woodchopper", muscle: "core", equipment: "Cable", pose: "twist", aliases: ["Wood Chop", "Woodchop"] },
  { name: "Russian Twist", muscle: "core", equipment: "Bodyweight", pose: "twist" },
  { name: "Side Plank", muscle: "core", equipment: "Bodyweight", pose: "plank", trackingType: "isometric_hold" },
  { name: "Landmine Twist", muscle: "core", equipment: "Barbell", pose: "twist" },
  { name: "Bicycle Crunch", muscle: "core", equipment: "Bodyweight", pose: "twist" },
  { name: "Plank", muscle: "core", equipment: "Bodyweight", pose: "plank", trackingType: "isometric_hold" },
  { name: "Dead Bug", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Pallof Press", muscle: "core", equipment: "Cable", pose: "plank" },
  { name: "Ab Wheel Rollout", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "TRX Fallout", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  // new core
  { name: "Weighted Plank", muscle: "core", equipment: "Bodyweight", pose: "plank", trackingType: "weighted_duration" },
  { name: "High Plank Shoulder Tap", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Bird Dog", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Hollow Hold", muscle: "core", equipment: "Bodyweight", pose: "plank", trackingType: "isometric_hold" },
  { name: "V-Up", muscle: "core", equipment: "Bodyweight", pose: "core_crunch" },
  { name: "Sit-Up", muscle: "core", equipment: "Bodyweight", pose: "core_crunch" },
  { name: "Decline Sit-Up", muscle: "core", equipment: "Bodyweight", pose: "core_crunch" },
  { name: "Weighted Decline Sit-Up", muscle: "core", equipment: "Dumbbell", pose: "core_crunch" },
  { name: "Machine Rotary Torso", muscle: "core", equipment: "Machine", pose: "twist" },
  { name: "Standing Cable Woodchop (High to Low)", muscle: "core", equipment: "Cable", pose: "twist" },
  { name: "Standing Cable Woodchop (Low to High)", muscle: "core", equipment: "Cable", pose: "twist" },
  { name: "Suitcase Deadlift Hold (Core)", muscle: "core", equipment: "Dumbbell", pose: "plank" },
  { name: "Ab Rollout (Barbell)", muscle: "core", equipment: "Barbell", pose: "plank" },
  { name: "Captain's Chair Leg Raise", muscle: "core", equipment: "Machine", pose: "leg_raise_hang" },
  { name: "Flutter Kicks", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Scissor Kicks", muscle: "core", equipment: "Bodyweight", pose: "leg_raise_hang" },
  { name: "Mountain Climbers", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Cable Standing Crunch", muscle: "core", equipment: "Cable", pose: "core_crunch" },
  { name: "Stir the Pot", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Side Bend", muscle: "core", equipment: "Dumbbell", pose: "twist" },
  { name: "Cable Side Bend", muscle: "core", equipment: "Cable", pose: "twist" },
  { name: "Renegade Row", muscle: "core", equipment: "Dumbbell", pose: "plank" },

  // ==================== CONDITIONING — carries, sleds, machines, throws (existing 9, reclassified from "core"/"Strongman", + 31 new = 40) ====================
  { name: "Sled Push", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance" },
  { name: "Sled Pull", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance" },
  { name: "Battle Ropes", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "duration" },
  { name: "Farmer's Carry", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance", aliases: ["Farmer's Walk"] },
  { name: "Atlas Stone Lift", muscle: "conditioning", equipment: "Strongman", pose: "carry" },
  { name: "Yoke Carry", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance" },
  { name: "Log Press", muscle: "conditioning", equipment: "Strongman", pose: "press_overhead" },
  { name: "Tire Flips", muscle: "conditioning", equipment: "Strongman", pose: "hinge" },
  { name: "Heavy Kettlebell Carry", muscle: "conditioning", equipment: "Kettlebell", pose: "carry", trackingType: "weight_distance" },
  // new conditioning
  { name: "Suitcase Carry", muscle: "conditioning", equipment: "Dumbbell", pose: "carry", trackingType: "per_side_weight", region: "obliques" },
  { name: "Overhead Carry", muscle: "conditioning", equipment: "Dumbbell", pose: "carry", trackingType: "weight_distance" },
  { name: "Single Arm Overhead Carry", muscle: "conditioning", equipment: "Kettlebell", pose: "carry", trackingType: "per_side_weight" },
  { name: "Rowing Machine (Erg)", muscle: "conditioning", equipment: "Machine", pose: "erg", trackingType: "distance_duration", aliases: ["Rowing Machine", "Row Erg", "Concept2"] },
  { name: "Ski Erg", muscle: "conditioning", equipment: "Machine", pose: "erg", trackingType: "distance_duration" },
  { name: "Air Bike", muscle: "conditioning", equipment: "Machine", pose: "bike", trackingType: "distance_duration", aliases: ["Assault Bike", "Fan Bike"] },
  { name: "Stationary Bike", muscle: "conditioning", equipment: "Machine", pose: "bike", trackingType: "distance_duration" },
  { name: "Elliptical", muscle: "conditioning", equipment: "Machine", pose: "bike", trackingType: "distance_duration" },
  { name: "Stair Climber", muscle: "conditioning", equipment: "Machine", pose: "stair_climb", trackingType: "distance_duration" },
  { name: "Treadmill Walk", muscle: "conditioning", equipment: "Machine", pose: "run_walk", trackingType: "distance_duration" },
  { name: "Treadmill Run", muscle: "conditioning", equipment: "Machine", pose: "run_walk", trackingType: "distance_duration" },
  { name: "Incline Treadmill Walk", muscle: "conditioning", equipment: "Machine", pose: "run_walk", trackingType: "distance_duration" },
  { name: "Outdoor Run", muscle: "conditioning", equipment: "Bodyweight", pose: "run_walk", trackingType: "distance_duration" },
  { name: "Jump Rope", muscle: "conditioning", equipment: "Bodyweight", pose: "jump_rope", trackingType: "duration" },
  { name: "Burpees", muscle: "conditioning", equipment: "Bodyweight", pose: "burpee", trackingType: "bodyweight_reps" },
  { name: "Box Jump", muscle: "conditioning", equipment: "Bodyweight", pose: "box_jump", trackingType: "bodyweight_reps" },
  { name: "Broad Jump", muscle: "conditioning", equipment: "Bodyweight", pose: "box_jump", trackingType: "bodyweight_reps" },
  { name: "Medicine Ball Slam", muscle: "conditioning", equipment: "Strongman", pose: "med_ball_throw", trackingType: "reps_only" },
  { name: "Medicine Ball Chest Throw", muscle: "conditioning", equipment: "Strongman", pose: "med_ball_throw", trackingType: "reps_only" },
  { name: "Medicine Ball Rotational Throw", muscle: "conditioning", equipment: "Strongman", pose: "med_ball_throw", trackingType: "reps_only" },
  { name: "Wall Ball", muscle: "conditioning", equipment: "Strongman", pose: "squat" },
  { name: "Sled Drag (Reverse)", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance" },
  { name: "Prowler Push", muscle: "conditioning", equipment: "Strongman", pose: "carry", trackingType: "weight_distance", aliases: ["Prowler Sled"] },
  { name: "Kettlebell Farmer's Carry", muscle: "conditioning", equipment: "Kettlebell", pose: "carry", trackingType: "weight_distance" },
  { name: "Weighted Vest Step-Ups", muscle: "conditioning", equipment: "Bodyweight", pose: "lunge" },
  { name: "Trap Bar Farmer's Carry", muscle: "conditioning", equipment: "Barbell", pose: "carry", trackingType: "weight_distance" },
  { name: "Bear Crawl", muscle: "conditioning", equipment: "Bodyweight", pose: "carry", trackingType: "duration" },
  { name: "High Knees", muscle: "conditioning", equipment: "Bodyweight", pose: "run_walk", trackingType: "duration" },
  { name: "Shuttle Run", muscle: "conditioning", equipment: "Bodyweight", pose: "run_walk", trackingType: "distance_duration" },
  { name: "Kettlebell Clean and Press", muscle: "conditioning", equipment: "Kettlebell", pose: "press_overhead" },
  { name: "Kettlebell Snatch", muscle: "conditioning", equipment: "Kettlebell", pose: "press_overhead" },

  // ==================== ROUND-OUT — additional commercial-gym equipment variants ====================
  { name: "Underhand Barbell Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Wide Grip Barbell Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Single Arm Landmine Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Dumbbell Pullover (Cross-Bench)", muscle: "back", equipment: "Dumbbell", pose: "press_lying" },
  { name: "Cable Cross-Body Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Machine Front Raise", muscle: "shoulders", equipment: "Machine", pose: "lateral_raise" },
  { name: "Cable Overhead Press", muscle: "shoulders", equipment: "Cable", pose: "press_overhead" },
  { name: "Bottoms-Up Kettlebell Press", muscle: "shoulders", equipment: "Kettlebell", pose: "press_overhead" },
  { name: "Single Arm Cable Lateral Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Decline Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Single Arm Chest Press Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Incline Smith Machine Press (Close Grip)", muscle: "arms", equipment: "Machine", pose: "press_lying" },
  { name: "Machine Preacher Curl (Plate Loaded)", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Standing Barbell Reverse Curl (Wide Grip)", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Cable Concentration Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Overhead EZ-Bar Triceps Extension", muscle: "arms", equipment: "Barbell", pose: "triceps_ext" },
  { name: "Seated Overhead Dumbbell Extension (Two-Hand)", muscle: "arms", equipment: "Dumbbell", pose: "triceps_ext" },
  { name: "Smith Machine Close-Grip Bench Press", muscle: "arms", equipment: "Machine", pose: "press_lying" },
  { name: "Leg Press (Single Leg)", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Narrow Stance Leg Press", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Wide Stance Leg Press", muscle: "legs", equipment: "Machine", pose: "leg_press" },
  { name: "Smith Machine Front Squat", muscle: "legs", equipment: "Machine", pose: "squat" },
  { name: "Dumbbell Bulgarian Split Squat (Elevated)", muscle: "legs", equipment: "Dumbbell", pose: "lunge" },
  { name: "Barbell Bulgarian Split Squat", muscle: "legs", equipment: "Barbell", pose: "lunge" },
  { name: "Seated Adduction/Abduction Combo (Abduction)", muscle: "legs", equipment: "Machine", pose: "hip_swing", region: "abductors" },
  { name: "Standing Single Leg Calf Raise (Dumbbell)", muscle: "legs", equipment: "Dumbbell", pose: "calf_raise" },
  { name: "Glute Bridge Machine", muscle: "legs", equipment: "Machine", pose: "hip_thrust" },
  { name: "Cable Standing Leg Curl", muscle: "legs", equipment: "Cable", pose: "leg_curl" },
  { name: "Dumbbell Stiff Leg Deadlift", muscle: "legs", equipment: "Dumbbell", pose: "hinge" },
  { name: "Machine Back Extension", muscle: "back", equipment: "Machine", pose: "hinge" },
  { name: "45-Degree Hyperextension", muscle: "back", equipment: "Bodyweight", pose: "hinge" },
  { name: "Cable Face Pull (Rope, Low to High)", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Machine Lateral Raise (Single Arm)", muscle: "shoulders", equipment: "Machine", pose: "lateral_raise" },
  { name: "Behind the Neck Press (Barbell)", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Cable Squat (Goblet-Style)", muscle: "legs", equipment: "Cable", pose: "squat" },
  { name: "Machine Assisted Squat", muscle: "legs", equipment: "Machine", pose: "squat" },
  { name: "Trap Bar Jump Squat", muscle: "legs", equipment: "Barbell", pose: "squat" },
  { name: "Cable Front Squat", muscle: "legs", equipment: "Cable", pose: "squat" },
  { name: "Machine Chest Supported T-Bar Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Single Arm Smith Machine Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Barbell Curl (Wide Grip)", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Barbell Curl (Narrow Grip)", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Cable Rope Overhead Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Incline Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Machine Dip (Assisted, Wide Grip)", muscle: "arms", equipment: "Machine", pose: "dip" },
  { name: "Ring Dip", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Korean Dip", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Push-Up (Feet Elevated)", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Archer Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Plyo Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Cable Reverse Fly (Single Arm)", muscle: "shoulders", equipment: "Cable", pose: "rear_delt" },
  { name: "Machine Chest Fly (Single Arm)", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Barbell Front Raise", muscle: "shoulders", equipment: "Barbell", pose: "lateral_raise" },
  { name: "Standing Calf Raise (Barbell)", muscle: "legs", equipment: "Barbell", pose: "calf_raise" },
  { name: "Ab Coaster Machine", muscle: "core", equipment: "Machine", pose: "leg_raise_hang" },
  { name: "Cable Kneeling Crunch (Rope, Wide Stance)", muscle: "core", equipment: "Cable", pose: "core_crunch" },
];

// Per-exercise instruction overrides — only where the shared pose-level setup/execution genuinely
// isn't enough to describe the exercise correctly. The full triceps family gets one regardless of
// size (it's the confirmed non-negotiable gap), plus a small set of flagship/regression-tested
// lifts. Every other exercise's instructions are the pose-level POSE_SETUP_EXECUTION default,
// resolved by getExerciseInstructions() in App.jsx — not omitted, just not duplicated 447 times.
const INSTRUCTION_OVERRIDES = {
  "Skull Crusher": { setup: "Lie on a flat bench holding a barbell with a shoulder-width overhand grip, arms extended over the chest.", execution: "Bend only at the elbows to lower the bar toward the forehead or just behind it, then extend back to lockout without moving the upper arms.", formCues: ["Keep upper arms vertical and still throughout", "Lower to just above the forehead, not onto it", "Extend fully but don't snap the elbows at the top"] },
  "EZ-Bar Skull Crusher": { setup: "Lie on a flat bench holding an EZ-bar with a close, angled grip, arms extended over the chest.", execution: "Bend only at the elbows to lower the bar toward the forehead, then extend back to lockout.", formCues: ["The angled grip should feel easier on the wrists than a straight bar", "Keep upper arms vertical throughout", "Control the lowering — this is where triceps strain most often happens"] },
  "Dumbbell Skull Crusher": { setup: "Lie on a flat bench holding a dumbbell in each hand with a neutral grip, arms extended over the chest.", execution: "Bend only at the elbows to lower the dumbbells toward the sides of the head, then extend back to lockout.", formCues: ["Neutral grip reduces wrist strain versus a straight bar", "Keep the dumbbells tracking toward the temples, not the forehead", "Keep upper arms still and vertical"] },
  "Rolling Dumbbell Triceps Extension": { setup: "Lie on a flat bench holding a dumbbell in each hand, arms extended over the chest.", execution: "Lower the dumbbells past the forehead toward the bench behind the head, rolling the upper arms back, then reverse the path to extend back to the start.", formCues: ["Let the upper arms roll back rather than staying fixed — that's what distinguishes this from a skull crusher", "Use a lighter weight than a standard skull crusher to control the extra range", "Keep the movement smooth, not jerky, through the transition"] },
  "Tate Press": { setup: "Lie on a flat bench holding a dumbbell in each hand above the chest, elbows flared out to the sides.", execution: "Lower the dumbbells by bending the elbows until they nearly touch the chest, then press back up through the same path.", formCues: ["Elbows point out to the sides, unlike a skull crusher's tucked elbows", "Keep the dumbbells close together at the bottom", "Control the descent — this variation is unforgiving of momentum"] },
  "JM Press": { setup: "Lie on a flat bench holding a barbell with a close grip, arms extended over the chest.", execution: "Lower the bar toward the upper chest/chin in a hybrid path between a skull crusher and a close-grip press, then extend back up.", formCues: ["The bar path lands between the chin and upper chest, not the forehead", "Keep elbows tucked closer than a standard bench press", "This is an advanced hybrid movement — start light until the bar path feels natural"] },
  "Close Grip Bench Press": { setup: "Lie on a flat bench with a shoulder-width or slightly narrower overhand grip on the bar.", execution: "Lower the bar to the lower chest with elbows tracking close to the body, then press back to lockout.", formCues: ["Keep elbows tucked at roughly 30-45°, not flared", "Grip narrower than a standard bench press but not so narrow it strains the wrists", "Drive through a full lockout to finish the rep"] },
  "Dumbbell Overhead Extension": { setup: "Sit or stand holding one dumbbell with both hands overhead, elbows bent and pointing forward.", execution: "Lower the dumbbell behind the head under control, then extend back to full overhead lockout.", formCues: ["Keep elbows pointing forward and close to the head throughout", "Lower only as far as shoulder mobility comfortably allows", "Extend fully without flaring the elbows out"] },
  "Single Arm Overhead Extension": { setup: "Stand or sit holding one dumbbell overhead in one hand, upper arm close to the head.", execution: "Lower the dumbbell behind the head under control, then extend back to full lockout.", formCues: ["Brace the working side to avoid twisting the torso", "Keep the upper arm fixed and vertical throughout", "Use the free hand to support the elbow if balance is an issue"] },
  "Rope Pushdown": { setup: "Stand facing a high cable stack with a rope attachment, elbows tucked at the sides.", execution: "Push the rope down to full extension, spreading the ends apart at the bottom, then return under control.", formCues: ["Keep elbows pinned to the sides throughout", "Spread the rope ends apart at full extension for a peak contraction", "Don't lean forward to add body weight to the movement"] },
  "Straight Bar Pushdown": { setup: "Stand facing a high cable stack with a straight bar attachment, elbows tucked at the sides.", execution: "Push the bar down to full extension, then return under control without letting the elbows drift forward.", formCues: ["Keep elbows fixed at the sides, not drifting forward as the set fatigues", "Extend fully but avoid snapping the elbows", "Keep the torso upright rather than leaning into the movement"] },
  "V-Bar Pushdown": { setup: "Stand facing a high cable stack with a V-bar attachment, using a neutral grip, elbows tucked at the sides.", execution: "Push the bar down to full extension, then return under control.", formCues: ["The neutral grip typically allows slightly heavier loading than a straight bar", "Keep elbows tucked throughout", "Control the return instead of letting the stack snap back"] },
  "Reverse Grip Pushdown": { setup: "Stand facing a high cable stack with a straight bar, using an underhand (supinated) grip, elbows tucked.", execution: "Push the bar down to full extension, then return under control.", formCues: ["The underhand grip shifts more emphasis onto the inner/long head of the triceps", "Keep elbows fixed at the sides", "Use a lighter load than the overhand version until the grip feels stable"] },
  "Overhead Rope Extension": { setup: "Face away from a low cable stack with a rope attachment, hands overhead, elbows bent.", execution: "Extend the arms forward and up to lockout, then return under control keeping the elbows fixed.", formCues: ["Keep elbows pointing forward and stationary throughout", "Step far enough from the stack to keep tension on through the full range", "Spread the rope slightly at lockout for a peak squeeze"] },
  "Cross Body Cable Extension": { setup: "Stand side-on to a low or mid cable stack, gripping the handle with the working arm across the body.", execution: "Extend the arm down and across the body to full lockout, then return under control.", formCues: ["Keep the upper arm relatively fixed, isolating the elbow extension", "Control the return rather than letting the cable yank the arm back", "Keep the torso stable, avoid rotating to assist the movement"] },
  "Single Arm Pushdown": { setup: "Stand facing a high cable stack with a single handle, one arm at a time, elbow tucked at the side.", execution: "Push the handle down to full extension, then return under control.", formCues: ["Keep the elbow pinned at the side throughout, unlike a row", "Avoid rotating the torso to help finish the rep", "Match the range of motion on both sides across the workout"] },
  "Triceps Extension Machine": { setup: "Sit with the back against the pad and grip the handles or lever with the elbows at the machine's pivot point.", execution: "Extend the arms to a controlled lockout, then return without letting the stack slam.", formCues: ["Align the elbow with the machine's pivot before starting", "Extend fully but avoid hyperextending the elbow joint", "Control the negative rather than letting it drop"] },
  "Assisted Dip Machine": { setup: "Kneel or stand on the machine's assistance platform/pad and grip the dip handles.", execution: "Lower under control until the shoulders are roughly level with the elbows, then press back to lockout — the machine subtracts a set counterweight from your bodyweight.", formCues: ["More assistance weight = an easier rep, since it's subtracted from bodyweight", "Keep the torso upright to bias triceps over chest", "Lower to the same depth every rep for consistent tracking"] },
  "Plate Loaded Dip Machine": { setup: "Sit or stand into the machine and grip the handles at the position it fixes for you.", execution: "Lower under control to the machine's designed range, then press back to lockout.", formCues: ["The fixed path removes the balance demand of free dips — focus on full range of motion", "Keep elbows tracking back, not flaring wide", "Control the negative instead of letting the weight stack drop"] },
  "Bench Dips": { setup: "Sit on the edge of a bench, hands beside the hips, legs extended out in front.", execution: "Lower the hips toward the floor by bending the elbows, then press back up to lockout.", formCues: ["Keep the hips close to the bench throughout, not drifting forward", "Add feet elevation or weight on the lap to progress difficulty", "Stop the descent before the shoulders round forward excessively"] },
  "Parallel Bar Dips": { setup: "Support the body on parallel bars with arms locked out, torso upright or leaning forward depending on the target.", execution: "Lower until the shoulders are roughly level with the elbows, then press back to lockout.", formCues: ["Stay more upright to bias triceps, lean forward to bias chest", "Control the bottom position rather than bouncing out of it", "Keep shoulders down and back, not shrugged toward the ears"] },
  "Weighted Dips": { setup: "Attach weight via a dip belt or hold a dumbbell between the feet, then support the body on parallel bars.", execution: "Lower under control to the same depth as an unweighted dip, then press back to lockout.", formCues: ["Add weight in small increments once bodyweight dips are well controlled", "Keep the same depth and tempo as unweighted work — don't shorten the range to handle more weight", "Stop the set if shoulder position starts to break down"] },
  "Cable Triceps Kickback": { setup: "Hinge forward at the hips with a low cable handle in hand, upper arm fixed parallel to the floor, elbow bent.", execution: "Extend the arm straight back through the elbow, squeeze at full extension, then return under control.", formCues: ["Keep the upper arm still and parallel to the floor throughout", "Extend to a full, straight-arm lockout behind the body", "Don't let the shoulder drive the movement as the set fatigues"] },
  "Dumbbell Triceps Kickback": { setup: "Hinge forward with one hand on a bench for support, holding a dumbbell with the upper arm fixed parallel to the floor.", execution: "Extend the arm straight back through the elbow, squeeze at full extension, then return under control.", formCues: ["Keep the upper arm pinned at the side, not drifting down as fatigue sets in", "Use a lighter weight than other triceps work — this movement rewards strict form, not load", "Extend fully to lockout each rep"] },
  "Diamond Push-Up": { setup: "Set up in a push-up position with the hands close together under the chest, thumbs and index fingers touching.", execution: "Lower the chest toward the hands, keeping elbows tracking back, then press back up to lockout.", formCues: ["Keep elbows tracking back close to the body, not flared", "Keep the diamond shape directly under the sternum", "Regress to an incline version if the wrists or shoulders feel strained"] },
  "Close-Grip Push-Up": { setup: "Set up in a push-up position with hands roughly shoulder-width or slightly narrower.", execution: "Lower the chest toward the hands with elbows tracking close to the body, then press back up.", formCues: ["Narrower than a standard push-up, but not touching like a diamond push-up", "Keep the body in a straight line throughout", "Elbows track back at a shallow angle, not flared to 90°"] },
};

// Only these pose values have hand-authored, anatomically-verified illustration geometry today —
// see ExerciseFigure/POSES in App.jsx. Anything else is a genuinely new movement pattern this
// expansion introduces without inventing unreviewed geometry for it: exercises using one of these
// poses get an honest "Demonstration coming soon" state instead of a wrong or reused visual. This
// is the same quality bar the muscle-readiness figure was already held to — a smaller number of
// approved, accurate demonstrations beats a full set where some are quietly wrong.
const POSES_WITH_APPROVED_MEDIA = new Set([
  "press_lying", "press_seated_machine", "push_up", "dip", "pullup", "pulldown", "row", "hinge",
  "press_overhead", "lateral_raise", "rear_delt", "shrug", "neck", "curl", "triceps_ext",
  "wrist_curl", "squat", "leg_press", "lunge", "leg_extension", "leg_curl", "hip_thrust",
  "calf_raise", "hip_swing", "core_crunch", "leg_raise_hang", "plank", "twist", "carry",
]);

function deriveMediaStatus(ex) {
  return POSES_WITH_APPROVED_MEDIA.has(ex.pose) ? "approved" : "pending";
}

/** Setup/execution/form-cue/mistake/safety bundle for one exercise — override first, pose-level
 *  shared default otherwise. Used by the exercise detail view in App.jsx. */
export function getExerciseGuidance(ex) {
  const override = INSTRUCTION_OVERRIDES[ex.name];
  const base = POSE_SETUP_EXECUTION[ex.pose] || { setup: "", execution: "" };
  const setup = override?.setup || base.setup;
  const execution = override?.execution || base.execution;
  const breathingCue = override?.breathingCue || base.breathingCue || "";
  const formCues = override?.formCues || POSE_TIPS[ex.pose] || [];
  const commonMistakes = override?.commonMistakes || COMMON_MISTAKES[ex.pose] || [];
  const safetyNote = override?.safetyNote || SAFETY_NOTES[ex.pose] || null;
  const instructions = [setup, execution].filter(Boolean);
  return { instructions, setup, execution, breathingCue, formCues, commonMistakes, safetyNote };
}

/** Every built-in exercise, fully resolved: derived defaults, explicit overrides, canonical id,
 *  and media-status gate applied. This is what App.jsx imports as `EXERCISES`. */
export const EXERCISES = RAW_EXERCISES.map((raw) => {
  const ex = withDefaults(raw);
  ex.id = slugify(ex.name);
  ex.mediaStatus = ex.mediaStatus || deriveMediaStatus(ex);
  return ex;
});

/* ------------------------------------------------------------------ */
/* Search, aliases, alternatives                                       */
/* ------------------------------------------------------------------ */

function normalize(s) {
  return (s || "").toLowerCase().trim();
}

// A small set of common abbreviations/typo-family terms that don't naturally substring-match their
// canonical name, layered on top of each exercise's own `aliases` rather than replacing it — this
// is the mechanism behind "RDL" finding Romanian Deadlift, "OHP" finding Overhead Press, etc. Kept
// separate from per-exercise aliases because these are query-side synonyms (abbreviations of a
// concept), not alternate exercise names.
const QUERY_SYNONYMS = [
  [/\brdl\b/, "romanian deadlift"],
  [/\bohp\b/, "overhead press"],
  [/\bskullcrusher\b/, "skull crusher"],
  [/\bpressdown\b/, "pushdown"],
  [/\blat raise\b/, "lateral raise"],
  [/\bpec deck\b/, "pec deck"],
  [/\brear delt machine\b/, "reverse pec deck"],
  [/\bham curl\b/, "leg curl"],
  [/\bcalf machine\b/, "calf raise"],
  [/\bghr\b/, "glute ham raise"],
  [/\btib raise\b/, "tibialis raise"],
];

function expandQuery(query) {
  let q = normalize(query);
  for (const [pattern, replacement] of QUERY_SYNONYMS) {
    // Replace, not append: appending would require the ORIGINAL abbreviation text to also appear
    // verbatim in the exercise's own name/aliases/equipment/etc, which defeats the point for a
    // synonym like "pressdown" -> "pushdown" (the two words never both appear on the same real
    // exercise) — only "rdl"/"ohp"-style abbreviations that are themselves also stored as an
    // alias happened to still pass with append, which masked this for those specific cases.
    if (pattern.test(q)) q = q.replace(pattern, replacement);
  }
  return q;
}

/** Order-independent, per-word substring search across canonical name, aliases, equipment, primary
 *  region label, and movement pattern — a strict superset of the original name-only matcher (every
 *  query that used to match still matches; this adds equipment/muscle/pattern/alias/abbreviation
 *  matching on top). */
export function matchesExerciseSearch(ex, query) {
  const terms = expandQuery(query).split(/\s+/).filter(Boolean);
  if (terms.length === 0) return true;
  const haystack = [
    ex.name,
    ...(ex.aliases || []),
    ex.equipment,
    ex.muscle,
    REGION_LABEL[regionForExercise(ex)] || "",
    (ex.secondaryMuscles || []).map((id) => REGION_LABEL[id] || "").join(" "),
    (ex.pose || "").replace(/_/g, " "),
  ].join(" ").toLowerCase();
  return terms.every((term) => haystack.includes(term));
}

/** Ranked substitution candidates for one exercise, from a pool of other exercises (built-in and/
 *  or custom). Priority order, highest first: same movement pattern > same primary muscle region >
 *  compatible available equipment > similar mechanics > similar difficulty > similar fatigue
 *  profile (approximated here by trackingType, since two exercises that load the body the same way
 *  produce a comparable fatigue cost). Not every same-muscle exercise is treated as interchangeable
 *  — a leg extension and a Nordic curl both "train legs" but score very differently here. */
export function getExerciseAlternatives(ex, pool, { availableEquipment = null, limit = 5 } = {}) {
  const targetRegion = regionForExercise(ex);
  return pool
    .filter((c) => c.name !== ex.name)
    .filter((c) => !availableEquipment || availableEquipment.includes(c.equipment))
    .map((c) => {
      let score = 0;
      if (c.pose === ex.pose) score += 50;
      if (regionForExercise(c) === targetRegion) score += 25;
      if (!availableEquipment || availableEquipment.includes(c.equipment)) score += 12;
      if (c.mechanics === ex.mechanics) score += 8;
      if (c.difficulty === ex.difficulty) score += 3;
      if (c.trackingType === ex.trackingType) score += 2;
      return { exercise: c, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b) => b.score - a.score)
    .slice(0, limit)
    .map((r) => r.exercise);
}

