# Exercise Demonstration Media Audit

Generated 2026-09-15. Source of truth: `src/exerciseData.js` (`mediaStatus` field, 4-value enum: approved / pending / unavailable / rejected — see `MEDIA_STATUS_VALUES`).

## Totals

| Status | Count | % of catalogue |
|---|---|---|
| approved | 420 | 94.4% |
| pending | 25 | 5.6% |
| unavailable | 0 | 0.0% |
| rejected | 0 | 0.0% |
| **Total exercises** | **445** | |

**Missing media**: 0 — every exercise resolves to one of the 4 statuses above; there is no fifth "undefined" state that could silently render nothing or crash. `pending` IS the "missing" bucket — it means no approved asset exists yet, and the UI shows an honest "Demonstration coming soon" placeholder rather than a wrong or reused figure (see ExerciseThumb/ExerciseDetailCard in src/App.jsx).

## What "approved" means today

An `approved` exercise reuses one of 29 hand-authored movement-pattern ("pose") illustrations — a real jointed figure (head/torso/arms/legs) with equipment-aware props (barbell, dumbbell, kettlebell, and — added in this pass — cable/pulley/rope). These are shared across every exercise using that movement pattern, not unique per exercise: e.g. every `press_lying`-pose exercise (all bench press variants) renders the same base figure, distinguished by its equipment prop. This is a deliberate scope decision, not an oversight — see Phase 6 guidance: "Prefer a smaller number of approved professional demonstrations over hundreds of poor ones." Building genuinely unique geometry for all 446 exercises was explicitly out of scope.

### Fixed this pass: Cable equipment had no visual at all

Before this correction, `equipmentShapes()` (src/App.jsx) had prop-drawing branches for Barbell, Dumbbell, and Kettlebell, but Cable fell through to the pose's bare generic props — meaning every cable exercise (pushdowns, cable rows, cable flys, lat pulldowns, face pulls — 79 exercises) rendered with no pulley, no cable line, no rope/attachment visual at all, exactly the complaint raised about Rope Pushdown specifically. Added a real Cable branch: a line from a fixed pulley point at the top of the frame down to a split point, then two diverging lines out to each hand (the rope's two ends separating), with rounded caps at the grip points. This is anchored to the pose's own existing hand coordinates, so it applies correctly to every Cable-equipment exercise using an affected pose, not just Rope Pushdown.

**Known remaining limitation, disclosed not silently accepted**: the `triceps_ext` pose's finish-position data (hands moving toward the elbows) was authored against overhead-extension movements and reads backward for the pushdown family (which should show hands descending, not rising) — shared-pose reuse across two genuinely different movement directions. Not fixed in this pass; flagged as a real, scoped follow-up rather than rushed.

## Pending exercises in the most heavily-trained regions (highest-priority for professional production)

Ranked by how many other exercises share the same primary region (a rough proxy for how often a viewer will actually land on this exercise):

| Exercise | Region | Exercises sharing this region |
|---|---|---|
| Sissy Squat | Quads | 58 |
| Reverse Nordic Curl | Quads | 58 |
| Air Bike | Quads | 58 |
| Stationary Bike | Quads | 58 |
| Elliptical | Quads | 58 |
| Treadmill Walk | Quads | 58 |
| Treadmill Run | Quads | 58 |
| Incline Treadmill Walk | Quads | 58 |
| Outdoor Run | Quads | 58 |
| Box Jump | Quads | 58 |
| Broad Jump | Quads | 58 |
| High Knees | Quads | 58 |
| Shuttle Run | Quads | 58 |
| Burpees | Chest | 56 |
| Medicine Ball Slam | Abs | 38 |
| Medicine Ball Chest Throw | Abs | 38 |
| Medicine Ball Rotational Throw | Abs | 38 |
| Cable Triceps Kickback | Triceps | 35 |
| Dumbbell Triceps Kickback | Triceps | 35 |
| Rowing Machine (Erg) | Lats | 18 |

## Full pending list (all movement patterns with no approved geometry)

- **run_walk** (6): Treadmill Walk, Treadmill Run, Incline Treadmill Walk, Outdoor Run, High Knees, Shuttle Run
- **bike** (3): Air Bike, Stationary Bike, Elliptical
- **med_ball_throw** (3): Medicine Ball Slam, Medicine Ball Chest Throw, Medicine Ball Rotational Throw
- **kickback** (2): Cable Triceps Kickback, Dumbbell Triceps Kickback
- **cossack_squat** (2): Cossack Squat, Dumbbell Cossack Squat
- **erg** (2): Rowing Machine (Erg), Ski Erg
- **box_jump** (2): Box Jump, Broad Jump
- **sissy_squat** (1): Sissy Squat
- **reverse_nordic** (1): Reverse Nordic Curl
- **stair_climb** (1): Stair Climber
- **jump_rope** (1): Jump Rope
- **burpee** (1): Burpees

## Rejected / unavailable

None currently. These two states exist as real, valid values (enforced by the catalogue validator) for a future asset-review pass to use — a `rejected` asset must carry a `rejectionReason` (validator-enforced) so it's clear *why* it was pulled, not just that it was.
