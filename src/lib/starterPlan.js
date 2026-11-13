/* Starter plan built at the end of onboarding ("Build My Plan").
   Deterministic and offline on purpose: onboarding shouldn't spend the athlete's monthly Coach
   allowance, wait on an AI call, or fail on a flaky connection before they've even seen Home.
   The result uses the exact `activePlan` shape the Coach's AI plans use
   ({ days: [{ day, muscleGroups: [{ muscle, exercises: [{ name, sets, reps }] }] }] }), so Home,
   the Coach's plan editor and the program roadmap all treat it like any other plan, and the
   athlete can ask the Coach to rebuild it later. Every exercise name exists in EXERCISES so it
   links to real form cues. */

// Each slot is [muscle, exerciseName, role] — "main" lifts get heavier rep ranges for strength.
const DAY_TEMPLATES = {
  fullA: ["Full Body A", [
    ["legs", "Back Squat", "main"], ["chest", "Barbell Bench Press", "main"], ["back", "Seated Cable Row", "accessory"],
    ["shoulders", "Dumbbell Lateral Raise", "accessory"], ["core", "Plank", "core"],
  ]],
  fullB: ["Full Body B", [
    ["back", "Romanian Deadlift", "main"], ["shoulders", "Dumbbell Shoulder Press", "main"], ["back", "Lat Pulldown", "accessory"],
    ["legs", "Walking Lunge", "accessory"], ["arms", "Dumbbell Curl", "accessory"],
  ]],
  fullC: ["Full Body C", [
    ["legs", "Leg Press", "main"], ["chest", "Incline Dumbbell Press", "main"], ["back", "Dumbbell Row", "accessory"],
    ["arms", "Rope Pushdown", "accessory"], ["core", "Cable Crunch", "core"],
  ]],
  upperA: ["Upper A", [
    ["chest", "Barbell Bench Press", "main"], ["back", "Barbell Row", "main"], ["shoulders", "Dumbbell Shoulder Press", "accessory"],
    ["back", "Lat Pulldown", "accessory"], ["arms", "Dumbbell Curl", "accessory"], ["arms", "Rope Pushdown", "accessory"],
  ]],
  lowerA: ["Lower A", [
    ["legs", "Back Squat", "main"], ["back", "Romanian Deadlift", "main"], ["legs", "Leg Extension", "accessory"],
    ["legs", "Lying Leg Curl", "accessory"], ["legs", "Standing Calf Raise", "accessory"], ["core", "Plank", "core"],
  ]],
  upperB: ["Upper B", [
    ["shoulders", "Overhead Press (Barbell)", "main"], ["back", "Pull-Up", "main"], ["chest", "Incline Dumbbell Press", "accessory"],
    ["back", "Seated Cable Row", "accessory"], ["shoulders", "Dumbbell Lateral Raise", "accessory"], ["arms", "Hammer Curl", "accessory"],
  ]],
  lowerB: ["Lower B", [
    ["back", "Deadlift", "main"], ["legs", "Leg Press", "main"], ["legs", "Bulgarian Split Squat", "accessory"],
    ["legs", "Seated Leg Curl", "accessory"], ["legs", "Standing Calf Raise", "accessory"], ["core", "Hanging Leg Raise", "core"],
  ]],
  push: ["Push", [
    ["chest", "Barbell Bench Press", "main"], ["shoulders", "Dumbbell Shoulder Press", "main"], ["chest", "Incline Dumbbell Press", "accessory"],
    ["shoulders", "Dumbbell Lateral Raise", "accessory"], ["arms", "Rope Pushdown", "accessory"],
  ]],
  pull: ["Pull", [
    ["back", "Barbell Row", "main"], ["back", "Lat Pulldown", "main"], ["back", "Seated Cable Row", "accessory"],
    ["shoulders", "Face Pull", "accessory"], ["arms", "Dumbbell Curl", "accessory"],
  ]],
  legs: ["Legs", [
    ["legs", "Back Squat", "main"], ["back", "Romanian Deadlift", "main"], ["legs", "Leg Press", "accessory"],
    ["legs", "Lying Leg Curl", "accessory"], ["legs", "Standing Calf Raise", "accessory"], ["core", "Cable Crunch", "core"],
  ]],
};

const SPLITS = {
  2: ["fullA", "fullB"],
  3: ["fullA", "fullB", "fullC"],
  4: ["upperA", "lowerA", "upperB", "lowerB"],
  5: ["push", "pull", "legs", "upperB", "lowerB"],
  6: ["push", "pull", "legs", "push", "pull", "legs"],
};

const REPS_BY_GOAL = {
  strength: { main: "4-6", accessory: "8-10" },
  muscle_growth: { main: "6-10", accessory: "10-12" },
  fat_loss: { main: "8-12", accessory: "12-15" },
  general: { main: "8-10", accessory: "10-12" },
};

export function buildStarterPlan({ trainingDays, goal, experience } = {}) {
  const days = Math.min(6, Math.max(2, Math.round(+trainingDays) || 3));
  const reps = REPS_BY_GOAL[goal] || REPS_BY_GOAL.general;
  // Beginners start with less volume on the main lifts; everyone gets 3 sets of accessories.
  const mainSets = experience === "beginner" ? 3 : 4;

  return {
    days: SPLITS[days].map((key, i) => {
      const [label, slots] = DAY_TEMPLATES[key];
      const muscleGroups = [];
      for (const [muscle, name, role] of slots) {
        const exercise = {
          name,
          sets: role === "main" ? mainSets : 3,
          reps: role === "core" ? (name === "Plank" ? "30-45s" : "10-15") : reps[role],
        };
        const group = muscleGroups.find((mg) => mg.muscle === muscle);
        if (group) group.exercises.push(exercise);
        else muscleGroups.push({ muscle, exercises: [exercise] });
      }
      return { day: `Day ${i + 1}: ${label}`, muscleGroups };
    }),
  };
}
