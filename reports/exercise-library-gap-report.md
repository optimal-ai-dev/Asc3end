# Exercise Library Gap Report (pre-expansion baseline)

Generated from the pre-edit state of `src/App.jsx` (branch `exercise-library-expansion`, forked from `launch-visual-upgrade` @ `1d41f13`). Raw data: [`exercise-library-before.json`](./exercise-library-before.json).

## 1. Current state

- **223** built-in exercises, all defined as plain object literals inside `export const EXERCISES` in `src/App.jsx` (lines 55-292). No separate file, no database table.
- Per-exercise fields: **`name`, `muscle`, `equipment`, `pose`** only. No `id`, no aliases, no secondary muscles, no difficulty, no instructions, no tracking type.
- **`name` is the sole stable identifier.** Workout logs, PR calculations, volume math, and muscle-readiness all join back to `EXERCISES`/`customExercises` by exact `name` string equality (see architecture inventory below). Renaming any existing `name` would silently corrupt the meaning of historical workout data — never done in this expansion.
- Muscle taxonomy today has **two layers that don't fully agree**:
  - `muscle` field: 6 coarse groups (`chest, back, shoulders, arms, legs, core`) — this is what's stored per exercise and what the Train picker's muscle filter uses.
  - `MUSCLE_REGIONS` (from the earlier muscle-readiness-map feature): 18 anatomical regions, **derived at read-time** from `(muscle, pose)` via `POSE_TO_REGION`, never stored on the exercise itself.
  - Consequence: the *filter* the user sees ("arms") is coarser than the *readiness region* actually computed ("Triceps" vs "Biceps" vs "Forearms") — there is no way today to filter or search for "Triceps" specifically; it's buried inside "arms."
- `equipment`: 6 UI-convention values (`Barbell, Dumbbell, Machine, Cable, Bodyweight, Strongman`), enforced only by the picker UI, not by any validator — free text under the hood.
- Search (`matchesSearch`) matches **name only**, no alias/equipment/muscle text matching, no abbreviation handling (e.g. "RDL", "OHP" find nothing today).
- No exercise-substitution/alternatives feature exists anywhere in the codebase.
- Workout-plan generation is AI-prompt-based, not a local algorithm, and embeds every exercise name into the prompt string sent to Claude — this cost scales linearly with catalogue size.
- Custom exercises already exist (`{name, muscle, equipment, pose, isCustom:true}`, stored in the generic `user_data` KV table, RLS-scoped per user) but only support the same 4 minimal fields as a built-in exercise — no aliases, secondary muscles, instructions, tracking type, or image.
- **No Supabase migrations or SQL schema files exist in the repo at all.** The only schema definition is a commented-out `CREATE TABLE user_data (...)` snippet in `src/lib/storage.js`, meant to be run once by hand. There is no dedicated exercises/custom-exercises table — everything (including custom exercises) lives in that one generic per-user JSON blob table. This significantly de-risks the expansion: there is no relational schema to migrate.
- **Hard architectural assumption: every logged set is `{weight, reps, type}`.** `addSet()` requires both a truthy weight *and* reps or the set silently fails to log — there is no bodyweight-only, duration, distance, or assisted logging path today, even for exercises already tagged `equipment: "Bodyweight"` (Push-Up, Pull-Up, Plank, all currently forced through the weight+reps form).
- The exercise-demonstration illustration system (`ExerciseFigure`, `POSES`/`POSES_FINISH`/`SECONDARY_MUSCLES`, keyed by `pose`) silently falls back to the **Squat** illustration for any `pose` value it doesn't recognize — an inaccurate-demonstration bug that predates this expansion and would only get worse as new movement patterns are added without a quality gate.

## 2. Confirmed high-priority gap: Triceps

Per the standing anatomy audit, Triceps coverage was flagged as inadequate. Baseline counts (from `exercise-library-before.json`):

- Direct/triceps-adjacent named exercises in the pre-expansion catalogue: **~15** (Skull Crusher, Close Grip Bench Press, Tate Press, JM Press, Dumbbell/Single-Arm Overhead Extension, Rope/Straight-Bar/V-Bar/Reverse-Grip/Single-Arm Pushdown, Overhead Rope Extension, Cross-Body Cable Extension, Triceps Extension Machine, Assisted/Plate-Loaded Dip Machine, Bench/Parallel Bar/Weighted Dips).
- Missing versus the required list: EZ-Bar Skull Crusher, Dumbbell Skull Crusher, Rolling Dumbbell Triceps Extension, Single-Arm Cable Overhead Extension, a distinct straight-bar/general Cable Overhead Extension, Cable Triceps Kickback, Dumbbell Triceps Kickback, Diamond Push-Up, Close-Grip Push-Up. (Full mapping of every requested name to an existing/alias/new entry is in the final report.)
- No `region`-level filter or search exists to isolate "Triceps" from "Arms" today — this is the taxonomy gap underlying the "missing/inadequate" finding as much as the raw exercise count.

## 3. Muscle taxonomy fix needed

Required 21-muscle list vs. current 18-region `MUSCLE_REGIONS`: **missing Abductors, Tibialis Anterior, Hip Flexors.** Additionally, three existing exercise groups are currently **mis-mapped** to the wrong readiness region due to `pose` reuse, discovered during this audit:

- `Adductor Machine`, `Cable Adduction` (pose: `hip_swing`) → currently resolve to **`glutes`**, not adductors.
- `Hip Abduction Machine`, `Cable Hip Abduction`, `Standing Band Abduction`, `Side Lying Leg Raise` (pose: `hip_swing`) → also currently resolve to **`glutes`**.
- `Copenhagen Plank` (pose: `plank`, muscle: `legs`) → `plank` has no entry under the `legs` group in `POSE_TO_REGION`, so it silently falls through to `GROUP_DEFAULT_REGION.legs` = **`quads`**.

This means Adductors today has *zero* real exercise data behind it (hence the disclosed quads-fallback added in the previous session) purely because of this mapping bug, not because the underlying exercises don't exist — they do, they're just filed under the wrong region. Fixing the `region` mapping (not the `pose`, `name`, or `equipment` — no risk to workout history) gives Adductors real independent data and, combined with adding a few new exercises, gives Abductors, Tibialis Anterior, and Hip Flexors real independent data too, with no disclosed-fallback needed for any of them.

## 4. Competitor gap evidence

See [`competitor-exercise-audit.md`](./competitor-exercise-audit.md) for full detail. Headline findings used to prioritize additions: StrengthLog's public exercise directory and wger's open API independently confirm Nordic curl, Copenhagen plank, glute-ham raise, tibialis raise, and multiple dip/pushdown/skull-crusher variants are mainstream, competitor-validated movements. Seal row and Meadows row could not be confirmed present at any audited competitor and are treated as lower-priority/niche. No competitor publishes brand-specific commercial machine names publicly — Asc3end should use generic equipment-class names ("iso-lateral row machine," "pendulum squat machine") rather than brand names, consistent with industry practice.

## 5. Files with exercise-related logic (blast radius for this expansion)

| File | Role |
|---|---|
| `src/App.jsx` | `EXERCISES` array, all taxonomy constants, search, Train picker, custom-exercise creation, AI plan generator, `ExerciseFigure` illustration system, `muscleReadiness`/`regionForExercise` |
| `src/Progress.jsx` | PR/volume/chart calculations, all re-derive `[...EXERCISES, ...customExercises]` |
| `src/lib/workoutMath.js` | PR/volume helpers — operate on workout-log name strings only, catalogue-agnostic |
| `src/lib/validation.js` | `isValidCustomExercise` — minimal shape check |
| `src/lib/storage.js` | Generic `user_data` KV persistence — the only "schema" in the repo |
| `src/muscleReadiness.test.jsx`, `src/exerciseIllustrations.test.js`, `src/exerciseSearch.test.js` | Existing test coverage that asserts on current shape/counts; must keep passing |
