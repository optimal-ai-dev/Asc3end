import React, { useState, useEffect, useRef, useMemo, useId, lazy, Suspense } from "react";
import {
  Dumbbell, UtensilsCrossed, LayoutDashboard, MessageCircle, TrendingUp,
  Plus, Trash2, Send, Sparkles, Flame, Target, ChevronRight, Check,
  X, Scale, Loader2, Trophy, Search, MapPin, Navigation, Camera, RefreshCw, Bell,
  UserCircle, Pencil, Copy, ArrowUp, ArrowDown, AlertTriangle, Star, ChevronDown, ChevronUp
} from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import AuthScreen from "./AuthScreen";
import { supabase } from "./lib/supabase";
import { logEvent } from "./lib/analytics";
import { loadKey, saveKey } from "./lib/storage";
import { suggestNextTarget, evaluatePR, computeGamification } from "./lib/workoutMath";
import { computeTargets } from "./lib/nutritionMath";
import { LEGAL_COPY, LEGAL_DOCUMENT_VERSION } from "./lib/legal";
import { isStaleSession, isValidSession } from "./lib/session";
import { isValidCustomExercise, isValidWorkout, isValidFoodEntry, isValidWeightEntry, isValidFavorite, sanitizeList } from "./lib/validation";

// Lazy-loaded: recharts (~525KB, the single largest dependency in the app) then only ships to
// people who actually open the Progress tab, instead of loading on every page for everyone.
const Progress = lazy(() => import("./Progress"));

/* ------------------------------------------------------------------ */
/* Constants & helpers                                                 */
/* ------------------------------------------------------------------ */

// Must match FREE_TRIAL_LIMIT in api/claude.js — this copy is only for display (e.g. "3 free
// conversations left"); the actual limit is enforced server-side, not by this constant.
const FREE_TRIAL_LIMIT = 5;

const KEYS = {
  profile: "atlas:profile",
  workouts: "atlas:workouts",
  nutrition: "atlas:nutrition",
  weightlog: "atlas:weightlog",
  session: "atlas:session",
  customExercises: "atlas:customExercises",
  favorites: "atlas:favorites",
};

/* Each exercise references a movement-pattern "pose" — this drives both the form-cue text (POSE_TIPS)
   and the human figure illustration (POSES/PoseFigure) so every variation gets a real visual demo. */
const EXERCISES = [
  // CHEST
  { name: "Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Incline Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Decline Barbell Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Reverse Grip Bench Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Floor Press", muscle: "chest", equipment: "Barbell", pose: "press_lying" },
  { name: "Flat Dumbbell Press", muscle: "chest", equipment: "Dumbbell", pose: "press_lying" },
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
  { name: "Pec Deck Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Seated Fly Machine", muscle: "chest", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Cable Chest Press", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "High-to-Low Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Low-to-High Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Mid Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Single Arm Cable Fly", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Standing Cable Press", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Cable Pullover", muscle: "chest", equipment: "Cable", pose: "press_seated_machine" },
  { name: "Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Incline Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Decline Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Ring Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Weighted Push-Up", muscle: "chest", equipment: "Bodyweight", pose: "push_up" },
  { name: "Chest Dips", muscle: "chest", equipment: "Bodyweight", pose: "dip" },

  // BACK
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
  { name: "Straight Arm Pulldown", muscle: "back", equipment: "Cable", pose: "pulldown" },
  { name: "Barbell Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Pendlay Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Dumbbell Row", muscle: "back", equipment: "Dumbbell", pose: "row" },
  { name: "Chest Supported Row (Dumbbell)", muscle: "back", equipment: "Dumbbell", pose: "row" },
  { name: "T-Bar Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Landmine Row", muscle: "back", equipment: "Barbell", pose: "row" },
  { name: "Seated Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Wide Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Close Grip Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Single Arm Cable Row", muscle: "back", equipment: "Cable", pose: "row" },
  { name: "Hammer Strength High Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Hammer Strength Low Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Plate Loaded Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Chest Supported Machine Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Lever Row Machine", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Iso-Lateral Row", muscle: "back", equipment: "Machine", pose: "row" },
  { name: "Rack Pull", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Romanian Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Snatch Grip Deadlift", muscle: "back", equipment: "Barbell", pose: "hinge" },
  { name: "Good Morning", muscle: "back", equipment: "Barbell", pose: "hinge" },

  // SHOULDERS
  { name: "Overhead Press (Barbell)", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Seated Barbell Press", muscle: "shoulders", equipment: "Barbell", pose: "press_overhead" },
  { name: "Dumbbell Shoulder Press", muscle: "shoulders", equipment: "Dumbbell", pose: "press_overhead" },
  { name: "Arnold Press", muscle: "shoulders", equipment: "Dumbbell", pose: "press_overhead" },
  { name: "Machine Shoulder Press", muscle: "shoulders", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Smith Machine Shoulder Press", muscle: "shoulders", equipment: "Machine", pose: "press_seated_machine" },
  { name: "Dumbbell Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Cable Lateral Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Machine Lateral Raise", muscle: "shoulders", equipment: "Machine", pose: "lateral_raise" },
  { name: "Leaning Cable Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Behind-the-Back Cable Raise", muscle: "shoulders", equipment: "Cable", pose: "lateral_raise" },
  { name: "Incline Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Partial Lateral Raise", muscle: "shoulders", equipment: "Dumbbell", pose: "lateral_raise" },
  { name: "Reverse Pec Deck", muscle: "shoulders", equipment: "Machine", pose: "rear_delt" },
  { name: "Rear Delt Fly", muscle: "shoulders", equipment: "Dumbbell", pose: "rear_delt" },
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

  // ARMS — biceps, triceps, forearms
  { name: "Barbell Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "EZ Bar Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Alternating Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Hammer Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Cross Body Hammer Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Concentration Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Incline Dumbbell Curl", muscle: "arms", equipment: "Dumbbell", pose: "curl" },
  { name: "Spider Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Preacher Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Rope Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Bayesian Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Single Arm Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "High Cable Curl", muscle: "arms", equipment: "Cable", pose: "curl" },
  { name: "Reverse Curl", muscle: "arms", equipment: "Barbell", pose: "curl" },
  { name: "Preacher Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Seated Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Plate Loaded Curl Machine", muscle: "arms", equipment: "Machine", pose: "curl" },
  { name: "Skull Crusher", muscle: "arms", equipment: "Barbell", pose: "press_lying" },
  { name: "Close Grip Bench Press", muscle: "arms", equipment: "Barbell", pose: "press_lying" },
  { name: "Tate Press", muscle: "arms", equipment: "Dumbbell", pose: "press_lying" },
  { name: "JM Press", muscle: "arms", equipment: "Barbell", pose: "press_lying" },
  { name: "Dumbbell Overhead Extension", muscle: "arms", equipment: "Dumbbell", pose: "triceps_ext" },
  { name: "Single Arm Overhead Extension", muscle: "arms", equipment: "Dumbbell", pose: "triceps_ext" },
  { name: "Rope Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Straight Bar Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "V-Bar Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Reverse Grip Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Overhead Rope Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Cross Body Cable Extension", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Single Arm Pushdown", muscle: "arms", equipment: "Cable", pose: "triceps_ext" },
  { name: "Triceps Extension Machine", muscle: "arms", equipment: "Machine", pose: "triceps_ext" },
  { name: "Assisted Dip Machine", muscle: "arms", equipment: "Machine", pose: "dip" },
  { name: "Plate Loaded Dip Machine", muscle: "arms", equipment: "Machine", pose: "dip" },
  { name: "Bench Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Parallel Bar Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Weighted Dips", muscle: "arms", equipment: "Bodyweight", pose: "dip" },
  { name: "Wrist Curl", muscle: "arms", equipment: "Dumbbell", pose: "wrist_curl" },
  { name: "Reverse Wrist Curl", muscle: "arms", equipment: "Dumbbell", pose: "wrist_curl" },
  { name: "Behind the Back Wrist Curl", muscle: "arms", equipment: "Barbell", pose: "wrist_curl" },
  { name: "Wrist Roller", muscle: "arms", equipment: "Strongman", pose: "wrist_curl" },
  { name: "Plate Pinch", muscle: "arms", equipment: "Strongman", pose: "wrist_curl" },
  { name: "Cable Wrist Curl", muscle: "arms", equipment: "Cable", pose: "wrist_curl" },

  // LEGS — quads, hamstrings, glutes, calves, adductors, abductors
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
  { name: "Hack Squat Machine", muscle: "legs", equipment: "Machine", pose: "leg_press" },
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
  { name: "Seated Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Lying Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Standing Leg Curl", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Nordic Curl", muscle: "legs", equipment: "Bodyweight", pose: "leg_curl" },
  { name: "Glute Ham Raise", muscle: "legs", equipment: "Machine", pose: "leg_curl" },
  { name: "Cable Leg Curl", muscle: "legs", equipment: "Cable", pose: "leg_curl" },
  { name: "Hip Thrust", muscle: "legs", equipment: "Barbell", pose: "hip_thrust" },
  { name: "Smith Machine Hip Thrust", muscle: "legs", equipment: "Machine", pose: "hip_thrust" },
  { name: "Glute Bridge", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Cable Kickback", muscle: "legs", equipment: "Cable", pose: "hip_thrust" },
  { name: "Machine Kickback", muscle: "legs", equipment: "Machine", pose: "hip_thrust" },
  { name: "Cable Pull Through", muscle: "legs", equipment: "Cable", pose: "hinge" },
  { name: "Frog Pumps", muscle: "legs", equipment: "Bodyweight", pose: "hip_thrust" },
  { name: "Sumo Deadlift", muscle: "legs", equipment: "Barbell", pose: "hinge" },
  { name: "Standing Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Seated Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Leg Press Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Smith Machine Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Donkey Calf Raise", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Single Leg Calf Raise", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise" },
  { name: "Tibialis Raise Machine", muscle: "legs", equipment: "Machine", pose: "calf_raise" },
  { name: "Tibialis Raises", muscle: "legs", equipment: "Bodyweight", pose: "calf_raise" },
  { name: "Adductor Machine", muscle: "legs", equipment: "Machine", pose: "hip_swing" },
  { name: "Cable Adduction", muscle: "legs", equipment: "Cable", pose: "hip_swing" },
  { name: "Copenhagen Plank", muscle: "legs", equipment: "Bodyweight", pose: "plank" },
  { name: "Hip Abduction Machine", muscle: "legs", equipment: "Machine", pose: "hip_swing" },
  { name: "Cable Hip Abduction", muscle: "legs", equipment: "Cable", pose: "hip_swing" },
  { name: "Standing Band Abduction", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing" },
  { name: "Side Lying Leg Raise", muscle: "legs", equipment: "Bodyweight", pose: "hip_swing" },

  // CORE
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
  { name: "Cable Woodchopper", muscle: "core", equipment: "Cable", pose: "twist" },
  { name: "Russian Twist", muscle: "core", equipment: "Bodyweight", pose: "twist" },
  { name: "Side Plank", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Landmine Twist", muscle: "core", equipment: "Barbell", pose: "twist" },
  { name: "Bicycle Crunch", muscle: "core", equipment: "Bodyweight", pose: "twist" },
  { name: "Plank", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Dead Bug", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "Pallof Press", muscle: "core", equipment: "Cable", pose: "plank" },
  { name: "Ab Wheel Rollout", muscle: "core", equipment: "Bodyweight", pose: "plank" },
  { name: "TRX Fallout", muscle: "core", equipment: "Bodyweight", pose: "plank" },

  // STRONGMAN / CONDITIONING
  { name: "Sled Push", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Sled Pull", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Battle Ropes", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Farmer's Carry", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Atlas Stone Lift", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Yoke Carry", muscle: "core", equipment: "Strongman", pose: "carry" },
  { name: "Log Press", muscle: "core", equipment: "Strongman", pose: "press_overhead" },
  { name: "Tire Flips", muscle: "core", equipment: "Strongman", pose: "hinge" },
  { name: "Heavy Kettlebell Carry", muscle: "core", equipment: "Strongman", pose: "carry" },
];

/* Form cues + illustration keyed by movement pattern, shared across every exercise using that pattern */
const POSE_TIPS = {
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
};

const MUSCLE_GROUPS = ["chest", "back", "shoulders", "arms", "legs", "core"];
const EQUIPMENT_TYPES = ["Barbell", "Dumbbell", "Machine", "Cable", "Bodyweight", "Strongman"];
const MUSCLE_POSITIONS = { shoulders: [50, 22], chest: [50, 40], arms: [78, 42], back: [22, 42], core: [50, 58], legs: [50, 82] };
const EQUIPMENT_COLORS = { Barbell: "var(--brass)", Dumbbell: "var(--steel)", Machine: "var(--warn)", Cable: "var(--good)", Bodyweight: "var(--ink-dim)", Strongman: "var(--rest)" };

/* Custom exercises don't have a hand-picked movement pattern, so give each muscle group a
   reasonable default pose — this keeps the illustration and form cues meaningful instead of
   falling back to an empty/misleading generic figure. */
const MUSCLE_DEFAULT_POSE = { chest: "press_lying", back: "row", shoulders: "press_overhead", arms: "curl", legs: "squat", core: "plank" };

const SET_TYPES = ["normal", "warmup", "drop", "failure"];
const SET_TYPE_LABELS = { normal: "Normal", warmup: "Warm-up", drop: "Drop Set", failure: "Failure" };
const SET_TYPE_COLORS = { normal: "#4F9DFF", warmup: "#3ECF8E", drop: "#FFA53D", failure: "#FF6B81" };

const GOAL_LABELS = {
  muscle_growth: "Build Muscle",
  strength: "Get Stronger",
  fat_loss: "Lose Fat",
  general: "General Fitness",
};

const QUOTES = [
  "One more rep than yesterday.",
  "Discipline shows up when motivation clocks out.",
  "The weight doesn't care how you feel about it.",
  "Small plates add up to big totals.",
  "Consistency is the only supplement that always works.",
  "You don't have to be great today. You have to show up.",
  "Progress is a habit before it's a number.",
  "Every set logged is a decision to keep going.",
  "The best program is the one you actually finish.",
  "Recovery is training too.",
];

const QUICK_FOODS = [
  { name: "Chicken Breast (150g)", calories: 248, protein: 46, carbs: 0, fat: 5 },
  { name: "White Rice (1 cup)", calories: 205, protein: 4, carbs: 45, fat: 0 },
  { name: "Whole Eggs (2)", calories: 156, protein: 12, carbs: 1, fat: 11 },
  { name: "Greek Yogurt (200g)", calories: 146, protein: 20, carbs: 8, fat: 4 },
  { name: "Banana", calories: 105, protein: 1, carbs: 27, fat: 0 },
  { name: "Protein Shake", calories: 130, protein: 25, carbs: 4, fat: 2 },
  { name: "Oats (80g)", calories: 300, protein: 10, carbs: 54, fat: 5 },
  { name: "Avocado (half)", calories: 120, protein: 1, carbs: 6, fat: 11 },
];

function dayOfYear(d) {
  const start = new Date(d.getFullYear(), 0, 0);
  const diff = d - start;
  return Math.floor(diff / 86400000);
}
function todayStr() {
  return new Date().toISOString().slice(0, 10);
}
function yesterdayStr() {
  const d = new Date();
  d.setDate(d.getDate() - 1);
  return d.toISOString().slice(0, 10);
}
function fmtDate(iso) {
  return new Date(iso).toLocaleDateString(undefined, { month: "short", day: "numeric" });
}
function uid() {
  return Math.random().toString(36).slice(2, 10);
}


/* Per-meal macro targets used to steer the nearby-meals search toward the person's goal */
function mealMacroGuidance(goal, timing) {
  const base = {
    fat_loss: { calories: [350, 500], protein: [35, 50], carbs: [15, 30], fat: [8, 15], rationale: "high protein and lower calorie/fat/carb to support a fat loss goal" },
    muscle_growth: { calories: [600, 900], protein: [40, 60], carbs: [60, 90], fat: [15, 25], rationale: "higher calorie, carb, and fat to support a muscle gain goal" },
    strength: { calories: [550, 750], protein: [40, 55], carbs: [50, 70], fat: [15, 20], rationale: "solid protein and carbs to fuel strength training" },
    general: { calories: [450, 600], protein: [30, 45], carbs: [40, 60], fat: [12, 20], rationale: "balanced macros for general fitness" },
  };
  const g = base[goal] || base.general;
  if (timing === "pre") {
    return { ...g, carbs: [g.carbs[0], Math.round(g.carbs[1] * 1.1)], fat: [Math.max(5, g.fat[0] - 5), Math.round(g.fat[1] * 0.7)], note: "easy to digest before training" };
  }
  return { ...g, protein: [Math.round(g.protein[0] * 1.05), Math.round(g.protein[1] * 1.1)], note: "supports post-training recovery" };
}

/* Picks the "Best Value" nearby-meal option deterministically rather than trusting the model's own
   self-assessment — scores macro fit against the person's target range, distance, and price, so the
   badge means the same thing every time instead of being whatever the AI happened to call out. */
function scoreBestMeal(places, guidance) {
  if (!places.length) return -1;
  const macroFit = (p) => {
    const ranges = [[p.calories, guidance.calories], [p.protein, guidance.protein], [p.carbs, guidance.carbs], [p.fat, guidance.fat]];
    const scores = ranges.map(([val, [lo, hi]]) => {
      if (val == null) return 0.5;
      if (val >= lo && val <= hi) return 1;
      const span = hi - lo || 1;
      const dist = val < lo ? lo - val : val - hi;
      return Math.max(0, 1 - dist / span);
    });
    return scores.reduce((a, b) => a + b, 0) / scores.length;
  };
  const normInverted = (values) => {
    const nums = values.map((v) => (v == null ? null : v));
    const present = nums.filter((v) => v != null);
    if (present.length === 0) return nums.map(() => 0.5);
    const min = Math.min(...present), max = Math.max(...present);
    return nums.map((v) => (v == null ? 0.5 : max === min ? 1 : 1 - (v - min) / (max - min)));
  };
  const distScores = normInverted(places.map((p) => p.distanceKm));
  const priceScores = normInverted(places.map((p) => p.price));
  let bestIdx = 0, bestScore = -Infinity;
  places.forEach((p, i) => {
    const score = macroFit(p) * 0.5 + distScores[i] * 0.25 + priceScores[i] * 0.25;
    if (score > bestScore) { bestScore = score; bestIdx = i; }
  });
  return bestIdx;
}

/* Matches an AI-generated exercise name against the real exercise library, exact first then fuzzy,
   so exercises the coach suggests can link to real form cues and pose demonstrations. */
function lookupExercise(name) {
  if (!name) return null;
  const lower = name.toLowerCase().trim();
  const exact = EXERCISES.find((e) => e.name.toLowerCase() === lower);
  if (exact) return exact;
  const fuzzy = EXERCISES.find((e) => e.name.toLowerCase().includes(lower) || lower.includes(e.name.toLowerCase()));
  return fuzzy || null;
}

function muscleRecovery(workouts, customExercises = []) {
  const now = Date.now();
  const status = {};
  MUSCLE_GROUPS.forEach((m) => (status[m] = { hours: Infinity, lastDate: null, recentSets: 0, recentSessions: 0 }));
  const allEx = [...EXERCISES, ...customExercises];
  workouts.forEach((w) => {
    const t = new Date(w.date).getTime();
    const hrs = (now - t) / 3600000;
    const hitThisWorkout = new Set();
    w.exercises.forEach((e) => {
      const ex = allEx.find((x) => x.name === e.name);
      if (!ex) return;
      if (hrs < status[ex.muscle].hours) { status[ex.muscle].hours = hrs; status[ex.muscle].lastDate = w.date; }
      // "Recent" = last 7 days, used to show actual training load rather than just a single last-session snapshot.
      if (hrs <= 168) { status[ex.muscle].recentSets += e.sets.length; hitThisWorkout.add(ex.muscle); }
    });
    hitThisWorkout.forEach((m) => status[m].recentSessions++);
  });
  Object.keys(status).forEach((m) => {
    const h = status[m].hours;
    status[m].level = h < 24 ? "rest" : h < 48 ? "partial" : "ready";
    // Rough estimate only — real recovery time varies by muscle, volume, intensity, sleep, and individual factors.
    status[m].hoursUntilReady = Number.isFinite(h) ? Math.max(0, Math.round(48 - h)) : 0;
  });
  return status;
}

/* Evidence-based technique guidance (Androulakis Korakakis et al., 2023, J Funct Morphol Kinesiol —
   narrative review on RT technique for hypertrophy) fed to the coach so its advice is grounded rather than generic. */
const TRAINING_PRINCIPLES = `Ground your training advice in current resistance-training research:
- Repetition tempo: a total rep duration of roughly 2-8 seconds is sufficient to maximize hypertrophy — there's no strong evidence that a specific eccentric/concentric split matters more than another within that range. Avoid recommending "super slow" reps (very slow tempos show no added benefit and may hurt performance), but the eccentric (lowering) phase should be controlled rather than dropped under gravity.
- Range of motion: prioritize a range of motion that takes the target muscle through a full stretch — training at long muscle lengths tends to match or outperform training at short muscle lengths for hypertrophy. Full ROM is a safe default; partial ROM performed only at the stretched end of a movement is a reasonable alternative, not partials at the shortened end.
- Technique strictness: minimizing momentum and involvement of non-target muscles is a sound default for isolation work, since fatigue from assisting muscles that aren't near failure isn't clearly worth the tradeoff. Some controlled momentum on compound lifts is not inherently harmful.
- Always contextualize with the athlete's actual experience level and current profile rather than giving generic advice.`;

/* Jeff Nippard's publicly stated training and nutrition philosophy (paraphrased from his published
   program materials, YouTube series, and interviews — he is also a co-author on the hypertrophy
   review referenced above, so these two sources are already well aligned). */
const NIPPARD_PRINCIPLES = `Follow Jeff Nippard's evidence-based coaching philosophy:
- Rep ranges are flexible: meaningful hypertrophy occurs anywhere from roughly 5-30 reps per set, since effort and proximity to failure matter more than the exact number. Still bias compound lifts toward 6-12 reps as a practical default, with isolation/finishing movements able to run higher (12-20+).
- For strength-focused goals, most work should be heavy (1-5 reps) with some moderate-load (5-10 rep) support work, following the principle of specificity — to get better at lifting heavy, you need to lift heavy.
- Use most working sets with 1-3 reps in reserve ("early sets"), reserving true failure or near-failure for a final set per exercise — this balances growth stimulus against recovery cost rather than treating every set as maximal.
- Progressive overload is the central driver of long-term growth: increase weight, reps, or sets over time rather than repeating the same stimulus indefinitely.
- Favor a mix of compound and isolation exercises, structured into Push/Pull/Legs or Upper/Lower splits depending on training days available (4-6 days/week is typical), balancing enough volume to drive growth without exceeding recovery capacity.
- Nutrition should be structured but flexible — hit calorie and protein targets consistently, but don't be dogmatic about specific foods; sustainable adherence beats a "perfect" rigid diet.
- Frame advice realistically for natural (non-enhanced) lifters: no shortcuts, consistent effort and patience over months/years.`;

/* Four distinct, real coaching philosophies (paraphrased from each coach's publicly documented
   teaching — programs, interviews, and published methodology, never quoted or reproduced verbatim).
   The athlete picks one as their coach's lens; all four still operate inside the safety guardrails
   in TRAINING_PRINCIPLES above. */
const COACHING_STYLES = {
  balanced: {
    label: "Balanced Evidence-Based",
    blurb: "Flexible and research-grounded — a mix of rep ranges, moderate volume, sustainable long-term progress.",
    prompt: NIPPARD_PRINCIPLES,
  },
  intensity: {
    label: "High Intensity, Low Volume",
    blurb: "Fewer, harder sets taken close to failure, with more recovery time between sessions.",
    prompt: `Lean toward a high-intensity, low-volume training style:
- Recovery is treated as the main limiting factor — prescribe fewer total sets per muscle (roughly 1-3 hard working sets per exercise) rather than high volume, reasoning that a smaller number of truly maximal-effort sets can be enough stimulus if recovery is respected.
- Each working set should be taken to or very near true muscular failure — this is a system built on effort, not volume.
- Favor strict form and controlled, full range of motion over speed or momentum.
- Prescribe somewhat lower per-muscle training frequency than typical (allowing more days of recovery between sessions for the same muscle) compared to higher-volume approaches.
- Note honestly when relevant: modern research suggests very low volume/frequency is not optimal for everyone, and this style suits people who are time-constrained, prone to overtraining, or want a more sustainable minimum-effective-dose approach — not a universal "best" method.`,
  },
  volume: {
    label: "Volume-Focused Periodisation",
    blurb: "Structured training blocks that progressively build volume across weeks, then deload.",
    prompt: `Lean toward a volume-and-periodization training style:
- Think in terms of volume landmarks per muscle group per week — start a training block near a maintainable volume and progressively add sets across weeks as recovery allows, rather than jumping straight to a high number.
- Recommend a structured block: several weeks of increasing volume followed by a lighter deload week to manage accumulated fatigue.
- Individualize based on recovery signals (soreness, performance trend, motivation) rather than a fixed universal number.
- Generally favor moderate-to-higher per-muscle weekly volume (multiple sets across multiple sessions) over very low-volume approaches, while still respecting the athlete's actual recovery capacity and experience level.`,
  },
  aesthetic: {
    label: "Simple Progressive Training",
    blurb: "Simple splits, a small number of working sets pushed hard, repeated consistently for physique goals.",
    prompt: `Lean toward a simple, intensity-focused hypertrophy training style:
- Keep programming simple: a small number of working sets per exercise (around 2), typically in the 5-9 rep range, pushed close to true failure.
- Favor sticking with the same core exercises across a training block so the athlete can master the movement and track clear strength progress on it, rather than constantly rotating exercises.
- Use straightforward Push/Pull/Legs or Upper/Lower splits.
- Frame the tone around consistency and daily discipline over complexity — simple training done intensely and repeatedly.`,
  },
};

const COACH_OUTPUT_RULES = `Formatting rules for every response, no exceptions:
- Never write dense paragraphs. Use short bullet points ("• ") for anything with more than one part.
- If the user asks for a workout, a routine, or "what should I do today/this week", do NOT respond in prose at all. Respond with ONLY valid JSON (no markdown fences, no text before or after) matching exactly this schema:
{"type":"workout","title":"Upper Body — Hypertrophy Focus","muscleGroups":[{"muscle":"Chest","exercises":[{"name":"Barbell Bench Press","sets":4,"reps":"6-10"}]},{"muscle":"Back","exercises":[{"name":"Lat Pulldown","sets":3,"reps":"10-12"}]}]}
  Use "muscle" values from exactly this set: chest, back, shoulders, arms, legs, core. Use exercise names that match this list as closely as possible: ${EXERCISES.map((e) => e.name).join(", ")}
- For anything else (questions, explanations, nutrition advice, form feedback), answer in tight bullet points, max ~6 bullets, no bullet longer than one short sentence. Only fall back to a couple of plain sentences for a genuinely simple yes/no or one-line answer.`;

/* Extracts the first complete, balanced JSON object from a text response — far more reliable than a
   greedy regex, since AI responses (especially web-search-grounded ones) often include a preamble,
   citations, or trailing notes around the actual JSON rather than returning it in pure isolation. */
function extractJSON(text) {
  const clean = text.replace(/```json|```/g, "").trim();
  const start = clean.indexOf("{");
  if (start === -1) throw new Error("No JSON found in response");
  let depth = 0;
  for (let i = start; i < clean.length; i++) {
    if (clean[i] === "{") depth++;
    else if (clean[i] === "}") {
      depth--;
      if (depth === 0) return JSON.parse(clean.slice(start, i + 1));
    }
  }
  throw new Error("Incomplete JSON in response");
}

/* Shared response parser: detects the exceeded_limit shape and pulls out the text content,
   used by both callClaude and the food scanner's direct image-upload fetch. */
function extractClaudeText(data) {
  if (data?.type === "exceeded_limit") {
    const resetsAt = data.resetsAt || data.resolved?.limit?.resets_at;
    const resetText = resetsAt
      ? new Date(typeof resetsAt === "number" ? resetsAt * 1000 : resetsAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })
      : "shortly";
    throw new Error(`Usage limit reached for now — this resets around ${resetText}. Try again after that, or check your Claude plan.`);
  }
  const text = (data.content || []).filter((b) => b.type === "text").map((b) => b.text).join("\n");
  if (!text) throw new Error("No response came back — try again.");
  return text;
}

async function callClaude(messages, maxTokens = 1000, tools = null, system = null, feature = "estimate") {
  const body = { model: "claude-sonnet-4-6", max_tokens: maxTokens, messages, feature };
  if (tools) body.tools = tools;
  if (system) body.system = system;
  const controller = new AbortController();
  // Matches the server's maxDuration (api/claude.js) minus a safety margin — web-search calls
  // (Meals Near You) can legitimately take 10-20+ seconds, so this needs real headroom.
  const timeout = setTimeout(() => controller.abort(), 55000);
  let response;
  try {
    const { data: { session } } = await supabase.auth.getSession();
    response = await fetch("/api/claude", {
      method: "POST",
      headers: {
        "Content-Type": "application/json",
        ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
      },
      body: JSON.stringify(body),
      signal: controller.signal,
    });
  } catch (e) {
    clearTimeout(timeout);
    if (e.name === "AbortError") throw new Error("The coach took too long to respond — try again.");
    throw new Error("Couldn't reach the coach — check your connection and try again.");
  }
  clearTimeout(timeout);
  let data;
  try {
    data = await response.json();
  } catch (e) {
    throw new Error(`The coach hit an unexpected error (${response.status}) — try again.`);
  }
  if (response.status === 402 && data?.error?.code === "premium_required") {
    const err = new Error(data.error.message || "This feature requires Asc3end Premium.");
    err.code = "premium_required";
    throw err;
  }
  if (!response.ok && data?.type !== "exceeded_limit") {
    throw new Error(data?.error?.message || `The coach hit an error (${response.status}) — try again.`);
  }
  return extractClaudeText(data);
}

/* ------------------------------------------------------------------ */
/* Onboarding                                                          */
/* ------------------------------------------------------------------ */

function Onboarding({ onComplete }) {
  const [step, setStep] = useState(0);
  const [agreedToLegal, setAgreedToLegal] = useState(false);
  const [legalOpen, setLegalOpen] = useState(null);
  const [form, setForm] = useState({
    name: "", age: 25, gender: "male", heightCm: 175, weightKg: 75,
    goal: "muscle_growth", experience: "intermediate", trainingDays: 4,
  });
  const set = (k, v) => setForm((f) => ({ ...f, [k]: v }));
  // Strips stray leading zeros (e.g. "018") that can otherwise persist in a controlled
  // number input when a field is cleared and retyped — "18" should never render as "018".
  const setNumber = (k, raw) => set(k, raw === "" ? 0 : +raw.replace(/^0+(?=\d)/, ""));

  const steps = [
    {
      title: "Who's training?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 12 }}>
          <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>NAME</label>
          <input className="atlas-input" value={form.name} onChange={(e) => set("name", e.target.value)} placeholder="Your name" autoFocus />
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>AGE</label>
              <input type="number" className="atlas-input" value={form.age} onChange={(e) => setNumber("age", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>GENDER</label>
              <select className="atlas-input" value={form.gender} onChange={(e) => set("gender", e.target.value)}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
              </select>
            </div>
          </div>
          <div style={{ display: "flex", gap: 10 }}>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>HEIGHT (CM)</label>
              <input type="number" className="atlas-input" value={form.heightCm} onChange={(e) => setNumber("heightCm", e.target.value)} />
            </div>
            <div style={{ flex: 1 }}>
              <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>WEIGHT (KG)</label>
              <input type="number" className="atlas-input" value={form.weightKg} onChange={(e) => setNumber("weightKg", e.target.value)} />
            </div>
          </div>
        </div>
      ),
    },
    {
      title: "What's the goal?",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          {Object.entries(GOAL_LABELS).map(([k, label]) => (
            <button
              key={k}
              onClick={() => set("goal", k)}
              className="atlas-card"
              style={{
                textAlign: "left", cursor: "pointer",
                borderColor: form.goal === k ? "var(--brass)" : "var(--line)",
                background: form.goal === k ? "var(--brass-soft)" : "var(--bg-elev)",
              }}
            >
              <span className="disp" style={{ fontSize: 16 }}>{label}</span>
            </button>
          ))}
        </div>
      ),
    },
    {
      title: "Training profile",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 14 }}>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>EXPERIENCE</label>
            <select className="atlas-input" value={form.experience} onChange={(e) => set("experience", e.target.value)}>
              <option value="beginner">Beginner (0-1yr)</option>
              <option value="intermediate">Intermediate (1-5yr)</option>
              <option value="advanced">Advanced (5yr+)</option>
            </select>
          </div>
          <div>
            <label className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>TRAINING DAYS / WEEK: {form.trainingDays}</label>
            <input type="range" min="2" max="6" value={form.trainingDays} onChange={(e) => set("trainingDays", +e.target.value)} style={{ width: "100%" }} />
          </div>
        </div>
      ),
    },
    {
      title: "Before we start",
      body: (
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.6, marginBottom: 4 }}>
            Asc3end gives general fitness and nutrition information, not medical advice — quick summary below, full documents linked from Profile once you're in.
          </div>
          <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
            {["terms", "privacy", "disclaimer"].map((k) => (
              <button key={k} onClick={() => setLegalOpen(legalOpen === k ? null : k)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)" }}>{LEGAL_COPY[k].title}</button>
            ))}
          </div>
          {legalOpen && (
            <div style={{ padding: 10, background: "var(--bg-elev2)", borderRadius: 8 }}>
              <div className="disp" style={{ fontSize: 12, marginBottom: 6 }}>{LEGAL_COPY[legalOpen].title}</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>{LEGAL_COPY[legalOpen].body}</div>
            </div>
          )}
          <label style={{ display: "flex", alignItems: "flex-start", gap: 10, cursor: "pointer", marginTop: 8 }}>
            <input type="checkbox" checked={agreedToLegal} onChange={(e) => setAgreedToLegal(e.target.checked)} style={{ marginTop: 3 }} />
            <span style={{ fontSize: 13, lineHeight: 1.5 }}>I agree to the Terms of Use and Privacy Policy, and understand Asc3end is not medical advice.</span>
          </label>
        </div>
      ),
    },
  ];

  const isLast = step === steps.length - 1;
  const nameMissing = step === 0 && !form.name.trim();
  const legalNotAgreed = isLast && !agreedToLegal;

  return (
    <div className="atlas-root" style={{ padding: "40px 20px", paddingBottom: 40 }}>
      <div style={{ marginBottom: 28 }}>
        <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>ASC3END</div>
        <div className="disp" style={{ fontSize: 30, marginTop: 4 }}>{steps[step].title}</div>
        <div style={{ display: "flex", gap: 4, marginTop: 14 }}>
          {steps.map((_, i) => (
            <div key={i} style={{ height: 3, flex: 1, borderRadius: 2, background: i <= step ? "var(--brass)" : "var(--line)" }} />
          ))}
        </div>
      </div>
      {steps[step].body}
      <div style={{ display: "flex", gap: 10, marginTop: 28 }}>
        {step > 0 && (
          <button className="atlas-btn-ghost" onClick={() => setStep(step - 1)}>Back</button>
        )}
        <button
          className="atlas-btn"
          style={{ flex: 1 }}
          disabled={nameMissing || legalNotAgreed}
          onClick={() => {
            if (isLast) onComplete({ ...form, legalAcceptedVersion: LEGAL_DOCUMENT_VERSION, legalAcceptedAt: new Date().toISOString() });
            else setStep(step + 1);
          }}
        >
          {isLast ? "Build My Plan" : "Continue"}
        </button>
      </div>
      {nameMissing && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Enter your name to continue.</div>}
      {legalNotAgreed && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Accept the Terms and Privacy Policy to continue.</div>}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/* Signature element: a glowing progress ring that fills toward the next 7-day streak milestone */
function StreakRing({ streak, size = 92 }) {
  const gid = useId();
  const gradId = `ring-${gid}`;
  const r = 38;
  const c = 2 * Math.PI * r;
  const progress = streak === 0 ? 0 : (streak % 7 === 0 ? 1 : (streak % 7) / 7);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 96 96" width={size} height={size}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brass)" />
            <stop offset="100%" stopColor="var(--steel)" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--bg-elev2)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Flame size={16} color="var(--brass)" />
        <div className="disp" style={{ fontSize: 22, lineHeight: 1 }}>{streak}</div>
      </div>
    </div>
  );
}

function RecoveryMap({ status, selected, onTapMuscle }) {
  const colors = { ready: "var(--good)", partial: "var(--warn)", rest: "var(--rest)" };
  return (
    <svg viewBox="0 0 100 100" style={{ width: "100%", maxWidth: 200, display: "block", margin: "0 auto" }}>
      <ellipse cx="50" cy="10" rx="7" ry="7" fill="var(--bg-elev2)" stroke="var(--line)" />
      <rect x="42" y="18" width="16" height="66" rx="8" fill="var(--bg-elev2)" stroke="var(--line)" />
      {MUSCLE_GROUPS.map((m) => {
        const [x, y] = MUSCLE_POSITIONS[m];
        const lvl = status[m]?.level || "ready";
        return (
          <g key={m} onClick={() => onTapMuscle?.(m)} style={{ cursor: onTapMuscle ? "pointer" : "default" }}>
            <circle cx={x} cy={y} r={selected === m ? 9 : 7} fill={colors[lvl]} opacity="0.9" stroke={selected === m ? "var(--ink)" : "none"} strokeWidth="1" />
            <text x={x} y={y + 15} textAnchor="middle" fontSize="5" fill={selected === m ? "var(--ink)" : "var(--ink-dim)"} fontFamily="Oswald">
              {m.toUpperCase()}
            </text>
          </g>
        );
      })}
    </svg>
  );
}

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
/* PoseFigure — a human line-figure demonstrating each movement pattern */
/* ------------------------------------------------------------------ */

const STANDING = { head: [50, 13], neck: [50, 22], shoulderL: [38, 28], shoulderR: [62, 28], hip: [50, 62], kneeL: [42, 86], ankleL: [39, 110], kneeR: [58, 86], ankleR: [61, 110] };

const POSES = {
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

/* Computes where the highlighted-muscle glow sits on the skeleton, given the pose's own joint coordinates */
function highlightPoints(cfg, muscle) {
  const mid = (a, b, t = 0.5) => [a[0] + (b[0] - a[0]) * t, a[1] + (b[1] - a[1]) * t];
  switch (muscle) {
    case "chest": return [mid(cfg.neck, cfg.hip, 0.28)];
    case "back": return [mid(cfg.neck, cfg.hip, 0.4)];
    case "shoulders": return [mid(cfg.shoulderL, cfg.elbowL, 0.2), mid(cfg.shoulderR, cfg.elbowR, 0.2)];
    case "arms": return [mid(cfg.shoulderL, cfg.elbowL, 0.55), mid(cfg.shoulderR, cfg.elbowR, 0.55)];
    case "legs": return [mid(cfg.hip, cfg.kneeL, 0.5), mid(cfg.hip, cfg.kneeR, 0.5)];
    case "core": return [mid(cfg.neck, cfg.hip, 0.78)];
    default: return [mid(cfg.neck, cfg.hip, 0.5)];
  }
}

function PoseFigure({ pose, muscle, size = 90 }) {
  const cfg = POSES[pose] || POSES.squat;
  const { head, neck, shoulderL, shoulderR, elbowL, elbowR, handL, handR, hip, kneeL, kneeR, ankleL, ankleR, props = [] } = cfg;
  const gid = useId();
  const glowId = `mgl-${gid}`;
  const skinId = `skn-${gid}`;
  const limb = (a, b, color, w) => <line x1={a[0]} y1={a[1]} x2={b[0]} y2={b[1]} stroke={color} strokeWidth={w} strokeLinecap="round" />;
  const highlights = muscle ? highlightPoints(cfg, muscle) : [];
  return (
    <svg viewBox="0 0 100 120" width={size} height={size * 1.2} style={{ flexShrink: 0 }}>
      <defs>
        <linearGradient id={skinId} x1="0%" y1="0%" x2="100%" y2="100%">
          <stop offset="0%" stopColor="var(--skin)" />
          <stop offset="100%" stopColor="#A89A82" />
        </linearGradient>
        <radialGradient id={glowId} cx="50%" cy="50%" r="50%">
          <stop offset="0%" stopColor="var(--muscle-hl)" stopOpacity="0.95" />
          <stop offset="65%" stopColor="var(--muscle-hl)" stopOpacity="0.55" />
          <stop offset="100%" stopColor="var(--muscle-hl)" stopOpacity="0" />
        </radialGradient>
      </defs>

      {props.map((p, i) => {
        if (p.type === "rect") return <rect key={i} x={p.x} y={p.y} width={p.w} height={p.h} rx={2} fill="var(--bg-elev2)" stroke="var(--brass)" strokeWidth="1.5" opacity="0.85" />;
        if (p.type === "line") return <line key={i} x1={p.x1} y1={p.y1} x2={p.x2} y2={p.y2} stroke="var(--brass)" strokeWidth={p.width || 3} strokeLinecap="round" />;
        return null;
      })}

      {/* back-side limbs drawn first, in shadow tone, so the front limbs layer over them */}
      {limb(hip, kneeR, "var(--skin-dim)", 8)}
      {limb(kneeR, ankleR, "var(--skin-dim)", 6)}
      {limb(shoulderR, elbowR, "var(--skin-dim)", 6.5)}
      {limb(elbowR, handR, "var(--skin-dim)", 5)}

      {/* torso as a soft filled capsule instead of a bare line */}
      <line x1={neck[0]} y1={neck[1]} x2={hip[0]} y2={hip[1]} stroke={`url(#${skinId})`} strokeWidth="13" strokeLinecap="round" />
      <line x1={shoulderL[0]} y1={shoulderL[1]} x2={shoulderR[0]} y2={shoulderR[1]} stroke={`url(#${skinId})`} strokeWidth="9" strokeLinecap="round" />

      {/* front-side limbs, lighter tone, on top */}
      {limb(hip, kneeL, "var(--skin)", 8)}
      {limb(kneeL, ankleL, "var(--skin)", 6)}
      {limb(shoulderL, elbowL, "var(--skin)", 6.5)}
      {limb(elbowL, handL, "var(--skin)", 5)}

      {/* muscle-targeted glow, rendered above the body so it reads clearly */}
      {highlights.map((pt, i) => (
        <ellipse key={i} cx={pt[0]} cy={pt[1]} rx="13" ry="10" fill={`url(#${glowId})`} />
      ))}

      {/* head with a simple two-tone shading pass */}
      <circle cx={head[0]} cy={head[1]} r="7.5" fill={`url(#${skinId})`} stroke="var(--brass)" strokeWidth="1.5" />
      <ellipse cx={head[0] - 2} cy={head[1] - 2.5} rx="2.6" ry="2" fill="var(--skin)" opacity="0.7" />
    </svg>
  );
}

/* Sound + toast for personal record moments */
function playPRSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [523.25, 659.25, 783.99].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.09;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.22, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.32);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.35);
    });
  } catch (e) { /* audio unavailable, fail silently */ }
}

/* A shorter double-beep for when the rest timer hits zero — distinct from the PR chime */
function playRestDoneSound() {
  try {
    const ctx = new (window.AudioContext || window.webkitAudioContext)();
    [440, 440].forEach((freq, i) => {
      const osc = ctx.createOscillator();
      const gain = ctx.createGain();
      osc.type = "sine";
      osc.frequency.value = freq;
      const t = ctx.currentTime + i * 0.22;
      gain.gain.setValueAtTime(0.0001, t);
      gain.gain.exponentialRampToValueAtTime(0.18, t + 0.02);
      gain.gain.exponentialRampToValueAtTime(0.0001, t + 0.18);
      osc.connect(gain).connect(ctx.destination);
      osc.start(t);
      osc.stop(t + 0.2);
    });
  } catch (e) { /* audio unavailable, fail silently */ }
}

function Dashboard({ profile, workouts, nutrition, weightlog, customExercises, onNav, onLogWeight, onLogOut, isPremium, isDemoEntitlement, onUpgrade, onManageBilling, billingError, billingLoading, session, onStartWorkout, onOpenProfile }) {
  const quote = QUOTES[dayOfYear(new Date()) % QUOTES.length];
  const status = useMemo(() => muscleRecovery(workouts, customExercises), [workouts, customExercises]);
  const [selectedMuscle, setSelectedMuscle] = useState(null);
  const targets = useMemo(() => computeTargets(profile), [profile]);
  const todayFoods = nutrition.filter((n) => n.date === todayStr());
  const totals = todayFoods.reduce(
    (a, f) => ({
      calories: a.calories + f.calories, protein: a.protein + f.protein,
      carbs: a.carbs + f.carbs, fat: a.fat + f.fat,
    }),
    { calories: 0, protein: 0, carbs: 0, fat: 0 }
  );
  const streak = useMemo(() => {
    const dates = new Set(workouts.map((w) => w.date));
    let s = 0;
    let d = new Date();
    while (true) {
      const key = d.toISOString().slice(0, 10);
      if (dates.has(key)) { s++; d.setDate(d.getDate() - 1); }
      else if (s === 0 && key === todayStr()) { d.setDate(d.getDate() - 1); continue; }
      else break;
    }
    return s;
  }, [workouts]);
  const gamification = useMemo(() => computeGamification(workouts, streak), [workouts, streak]);
  const nudge = useMemo(() => {
    if (workouts.length === 0) return null;
    const lastDate = workouts.map((w) => new Date(w.date)).sort((a, b) => b - a)[0];
    const daysSince = Math.floor((Date.now() - lastDate) / 86400000);
    if (daysSince >= 3) return `You haven't logged a session in ${daysSince} days. Ready to get back to it?`;
    if (streak === 6) return "One more session and you'll hit a 7-day streak.";
    if (streak === 29) return "One more session and you'll hit a 30-day streak.";
    return null;
  }, [workouts, streak]);
  const [weightInput, setWeightInput] = useState("");

  const activePlan = profile.activePlan;
  const planDay = activePlan?.days?.[activePlan.currentDayIndex] || null;
  const planExerciseCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.length, 0) : 0;
  const planSetCount = planDay ? planDay.muscleGroups.reduce((n, mg) => n + mg.exercises.reduce((n2, e) => n2 + (+e.sets || 3), 0), 0) : 0;
  const planApproxMins = planDay ? Math.round((planSetCount * 2.5 + 10) / 5) * 5 : 0;
  const planMuscles = planDay ? [...new Set(planDay.muscleGroups.map((mg) => mg.muscle))] : [];

  const macroRow = (label, val, target, color) => (
    <div style={{ marginBottom: 10 }}>
      <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, marginBottom: 4 }}>
        <span className="mono" style={{ color: "var(--ink-dim)" }}>{label}</span>
        <span className="mono">{Math.round(val)} / {Math.round(target)}</span>
      </div>
      <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (val / target) * 100)}%`, background: color }} /></div>
    </div>
  );

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", gap: 16 }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 12 }}>
        <div>
          <div className="mono" style={{ color: "var(--brass)", fontSize: 12, letterSpacing: 2 }}>
            {new Date().toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" })}
          </div>
          <div className="disp" style={{ fontSize: 26 }}>Welcome back, {profile.name || "Athlete"}</div>
          <div style={{ color: "var(--ink-dim)", fontSize: 14, marginTop: 4, fontStyle: "italic" }}>"{quote}"</div>
        </div>
        <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
          <button onClick={onOpenProfile} className="atlas-btn-ghost" style={{ padding: "6px 9px" }} aria-label="Profile and settings" title="Profile and settings">
            <UserCircle size={16} />
          </button>
          <button onClick={onLogOut} className="atlas-btn-ghost" style={{ padding: "6px 10px", fontSize: 10 }}>
            Log Out
          </button>
        </div>
      </div>

      {/* Today's planned workout — the single most important thing on Home: what should I do right now. */}
      <div className="atlas-card" style={{ borderColor: "var(--brass)" }}>
        {session ? (
          <>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)", marginBottom: 4 }}>Workout In Progress</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 10 }}>
              {session.planDayName || "Free workout"} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} logged so far
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout()}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Resume Workout
            </button>
          </>
        ) : planDay ? (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", letterSpacing: 1, marginBottom: 4 }}>TODAY'S WORKOUT</div>
            <div className="disp" style={{ fontSize: 18, marginBottom: 6 }}>{planDay.day}</div>
            <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 10 }}>
              {planMuscles.map((m) => (
                <span key={m} className="pill" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>{m}</span>
              ))}
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--steel)" }}>{planExerciseCount} exercises</span>
              <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--steel)" }}>~{planApproxMins} min</span>
            </div>
            <button className="atlas-btn" style={{ width: "100%" }} onClick={() => onStartWorkout(activePlan.currentDayIndex)}>
              <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Start Workout
            </button>
          </>
        ) : (
          <>
            <div className="disp" style={{ fontSize: 15, marginBottom: 4 }}>No Active Plan</div>
            <div style={{ fontSize: 12.5, color: "var(--ink-dim)", marginBottom: 10 }}>
              Ask the Coach to build you a weekly program, or just start logging a free workout.
            </div>
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn" style={{ flex: 1 }} onClick={() => onStartWorkout()}>
                <Dumbbell size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Free Workout
              </button>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => onNav("coach")}>
                <MessageCircle size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Ask Coach
              </button>
            </div>
          </>
        )}
      </div>

      {nudge && (
        <div className="atlas-card" style={{ borderColor: "var(--warn)", background: "rgba(255,182,72,0.1)", display: "flex", alignItems: "center", gap: 8 }}>
          <Bell size={15} color="var(--warn)" style={{ flexShrink: 0 }} />
          <div style={{ fontSize: 12.5 }}>{nudge}</div>
        </div>
      )}

      <div style={{ display: "flex", gap: 10 }}>
        <div className="atlas-card" style={{ flex: 1, textAlign: "center" }}>
          <Target size={18} color="var(--steel)" />
          <div className="disp" style={{ fontSize: 20 }}>{GOAL_LABELS[profile.goal]}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>PROGRESSION TARGET</div>
        </div>
        <div className="atlas-card" style={{ flex: 1, display: "flex", flexDirection: "column", alignItems: "center", gap: 4, justifyContent: "center" }}>
          <StreakRing streak={streak} size={72} />
          <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{streak === 0 ? "START A STREAK" : `DAY ${streak} STREAK`}</div>
        </div>
      </div>

      <div className="atlas-card">
        <div className="disp" style={{ fontSize: 15, marginBottom: 6 }}>Muscle Recovery</div>
        <RecoveryMap status={status} selected={selectedMuscle} onTapMuscle={(m) => setSelectedMuscle(selectedMuscle === m ? null : m)} />
        <div style={{ display: "flex", justifyContent: "center", gap: 14, marginTop: 8 }}>
          <span className="pill" style={{ background: "rgba(116,165,120,0.15)", color: "var(--good)" }}>● Ready</span>
          <span className="pill" style={{ background: "rgba(255,182,72,0.15)", color: "var(--warn)" }}>● Partial</span>
          <span className="pill" style={{ background: "rgba(184,91,94,0.15)", color: "var(--rest)" }}>● Resting</span>
        </div>
        {selectedMuscle && (
          <div style={{ marginTop: 10, padding: 10, background: "var(--bg-elev2)", borderRadius: 8 }}>
            <div className="disp" style={{ fontSize: 12, textTransform: "capitalize", marginBottom: 4 }}>{selectedMuscle}</div>
            {!Number.isFinite(status[selectedMuscle].hours) ? (
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>Not trained yet.</div>
            ) : (
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", lineHeight: 1.7 }}>
                Last trained: {fmtDate(status[selectedMuscle].lastDate)} ({Math.round(status[selectedMuscle].hours)}h ago)<br />
                {status[selectedMuscle].recentSets} set{status[selectedMuscle].recentSets === 1 ? "" : "s"} across {status[selectedMuscle].recentSessions} session{status[selectedMuscle].recentSessions === 1 ? "" : "s"} in the last 7 days<br />
                {status[selectedMuscle].level === "ready" ? "Ready to train." : `Est. fully ready in ~${status[selectedMuscle].hoursUntilReady}h`}
              </div>
            )}
          </div>
        )}
        <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8, fontStyle: "italic" }}>Estimate based on time since last trained — not a medical measurement. Tap a muscle for detail.</div>
      </div>

      <div className="atlas-card">
        <div className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Today's Fuel</div>
        {macroRow("CALORIES", totals.calories, targets.calories, "var(--brass)")}
        {macroRow("PROTEIN g", totals.protein, targets.protein, "var(--steel)")}
        {macroRow("CARBS g", totals.carbs, targets.carbs, "var(--good)")}
        {macroRow("FAT g", totals.fat, targets.fat, "var(--warn)")}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => onNav("nutrition")}>
          <UtensilsCrossed size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Log Food
        </button>
      </div>

      {isPremium ? (
        <div className="atlas-card" style={{ borderColor: "var(--brass)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 8 }}>
              <Sparkles size={16} color="var(--brass)" />
              <span className="disp" style={{ fontSize: 13 }}>{isDemoEntitlement ? "Asc3end+ Demo Access" : "Premium Active"}</span>
            </div>
            {!isDemoEntitlement && (
              <button onClick={onManageBilling} disabled={billingLoading === "portal"} className="atlas-btn-ghost" style={{ padding: "5px 10px", fontSize: 10 }}>
                {billingLoading === "portal" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : "Manage"}
              </button>
            )}
          </div>
          {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>Billing management is unavailable for demo accounts.</div>}
          {!isDemoEntitlement && billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginTop: 8 }}>{billingError}</div>}
        </div>
      ) : (
        <div className="atlas-card" style={{ border: "1px solid var(--brass)", background: "var(--brass-soft)", padding: 0 }}>
          <button
            onClick={onUpgrade}
            disabled={billingLoading === "checkout"}
            style={{ display: "flex", justifyContent: "space-between", alignItems: "center", cursor: "pointer", textAlign: "left", width: "100%", background: "none", border: "none", padding: 16 }}
          >
            <div>
              <div className="disp" style={{ fontSize: 13, color: "var(--brass)" }}>Upgrade to Premium</div>
              <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>AI Coach, food scanner, and Meals Near You — $9.99/mo</div>
            </div>
            {billingLoading === "checkout" ? <Loader2 size={18} color="var(--brass)" style={{ animation: "spin 1s linear infinite", flexShrink: 0 }} /> : <ChevronRight size={18} color="var(--brass)" style={{ flexShrink: 0 }} />}
          </button>
          {billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", padding: "0 16px 12px" }}>{billingError}</div>}
        </div>
      )}

      <div className="atlas-card">
        <div className="disp" style={{ fontSize: 15, marginBottom: 8 }}>Log Bodyweight</div>
        <div style={{ display: "flex", gap: 8 }}>
          <input className="atlas-input" type="number" placeholder={`${profile.weightKg} kg`} value={weightInput} onChange={(e) => setWeightInput(e.target.value)} aria-label="Bodyweight in kilograms" />
          <button className="atlas-btn" onClick={() => { if (weightInput) { onLogWeight(+weightInput); setWeightInput(""); } }} aria-label="Save bodyweight">
            <Check size={16} />
          </button>
        </div>
      </div>

      {/* Achievements — deliberately last and de-emphasized until there's real activity to show,
          per feedback that a full badge grid crowds Home before a new account has done anything. */}
      <div className="atlas-card">
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 6 }}>
          <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)" }}>Level {gamification.level}</div>
          <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{gamification.xpIntoLevel} / 500 XP</span>
        </div>
        <div className="bar-track" style={{ marginBottom: workouts.length > 0 ? 12 : 0 }}><div className="bar-fill" style={{ width: `${(gamification.xpIntoLevel / 500) * 100}%`, background: "var(--brass)" }} /></div>
        {workouts.length > 0 ? (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap" }}>
            {gamification.badges.map((b) => (
              <div key={b.id} title={b.label} style={{
                display: "flex", flexDirection: "column", alignItems: "center", gap: 3, width: 56,
                opacity: b.earned ? 1 : 0.3,
              }}>
                <div style={{ fontSize: 20, filter: b.earned ? "none" : "grayscale(1)" }}>{b.icon}</div>
                <div className="mono" style={{ fontSize: 8, textAlign: "center", color: b.earned ? "var(--ink)" : "var(--ink-dim)", lineHeight: 1.2 }}>{b.label}</div>
              </div>
            ))}
          </div>
        ) : (
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 8 }}>Log your first workout to start earning achievements.</div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Profile / Settings                                                   */
/* ------------------------------------------------------------------ */

function Profile({ profile, authUser, workouts, nutrition, weightlog, customExercises, isPremium, isDemoEntitlement, onUpdateProfile, onManageBilling, onUpgrade, billingLoading, billingError, onLogOut, onDeleteAccount, deleteAccountLoading, deleteAccountError, onClose }) {
  const [edit, setEdit] = useState({
    name: profile.name || "", age: profile.age, gender: profile.gender,
    heightCm: profile.heightCm, weightKg: profile.weightKg,
    goal: profile.goal, experience: profile.experience, trainingDays: profile.trainingDays,
  });
  const [savedFlash, setSavedFlash] = useState(false);
  const [showComparison, setShowComparison] = useState(false);
  const setNumber = (k, raw) => setEdit((f) => ({ ...f, [k]: raw === "" ? 0 : +raw.replace(/^0+(?=\d)/, "") }));

  const [overrideOn, setOverrideOn] = useState(!!profile.macroOverride);
  const currentTargets = profile.targets || computeTargets(profile);
  const [overrideForm, setOverrideForm] = useState(profile.macroOverride || currentTargets);

  const [pw, setPw] = useState({ next: "", confirm: "" });
  const [pwStatus, setPwStatus] = useState(null); // null | "saving" | "success" | { error }

  const [showDelete, setShowDelete] = useState(false);
  const [deleteConfirmText, setDeleteConfirmText] = useState("");
  const [reauthPassword, setReauthPassword] = useState("");
  const [reauthError, setReauthError] = useState(null);
  const [reauthing, setReauthing] = useState(false);

  const [legalOpen, setLegalOpen] = useState(null);

  const saveIdentity = async () => {
    const name = edit.name.trim();
    if (!name) return;
    const next = { ...profile, ...edit, name };
    if (!profile.macroOverride) next.targets = computeTargets(next);
    await onUpdateProfile(next);
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
  };

  const saveOverride = async () => {
    if (overrideOn) {
      const clean = {
        calories: +overrideForm.calories || 0, protein: +overrideForm.protein || 0,
        carbs: +overrideForm.carbs || 0, fat: +overrideForm.fat || 0,
      };
      await onUpdateProfile({ macroOverride: clean, targets: clean });
    } else {
      await onUpdateProfile({ macroOverride: null, targets: computeTargets(profile) });
    }
    setSavedFlash(true);
    setTimeout(() => setSavedFlash(false), 2200);
  };

  const changePassword = async () => {
    if (pw.next.length < 6) { setPwStatus({ error: "Password must be at least 6 characters." }); return; }
    if (pw.next !== pw.confirm) { setPwStatus({ error: "Passwords don't match." }); return; }
    setPwStatus("saving");
    const { error } = await supabase.auth.updateUser({ password: pw.next });
    if (error) setPwStatus({ error: error.message || "Couldn't update password." });
    else { setPwStatus("success"); setPw({ next: "", confirm: "" }); }
  };

  // Requires re-entering the current password immediately before an irreversible account
  // deletion ("recent authentication"), rather than trusting however-old the existing session
  // happens to be — the type-DELETE text alone only guards against a misclick, not against
  // someone else acting on an already-open, unattended session.
  const confirmDelete = async () => {
    setReauthError(null);
    setReauthing(true);
    const { error } = await supabase.auth.signInWithPassword({ email: authUser?.email, password: reauthPassword });
    setReauthing(false);
    if (error) { setReauthError("Incorrect password."); return; }
    onDeleteAccount();
  };

  const exportData = () => {
    const payload = { exportedAt: new Date().toISOString(), profile, workouts, nutrition, weightlog, customExercises };
    const blob = new Blob([JSON.stringify(payload, null, 2)], { type: "application/json" });
    const url = URL.createObjectURL(blob);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asc3end-export-${todayStr()}.json`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  };

  const row = (label, control) => (
    <div style={{ marginBottom: 12 }}>
      <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", marginBottom: 4 }}>{label}</label>
      {control}
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 40, overflowY: "auto", padding: "24px 18px 60px" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 18 }}>
        <div className="disp" style={{ fontSize: 24 }}>Profile & Settings</div>
        <button onClick={onClose} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label="Close settings"><X size={16} /></button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 15, marginBottom: 12 }}>About You</div>
        {row("NAME", <input className="atlas-input" value={edit.name} onChange={(e) => setEdit((f) => ({ ...f, name: e.target.value }))} />)}
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>{row("AGE", <input type="number" className="atlas-input" value={edit.age} onChange={(e) => setNumber("age", e.target.value)} />)}</div>
          <div style={{ flex: 1 }}>
            {row("GENDER", (
              <select className="atlas-input" value={edit.gender} onChange={(e) => setEdit((f) => ({ ...f, gender: e.target.value }))}>
                <option value="male">Male</option>
                <option value="female">Female</option>
                <option value="other">Other</option>
                <option value="prefer_not_say">Prefer not to say</option>
              </select>
            ))}
          </div>
        </div>
        <div style={{ display: "flex", gap: 10 }}>
          <div style={{ flex: 1 }}>{row("HEIGHT (CM)", <input type="number" className="atlas-input" value={edit.heightCm} onChange={(e) => setNumber("heightCm", e.target.value)} />)}</div>
          <div style={{ flex: 1 }}>{row("WEIGHT (KG)", <input type="number" className="atlas-input" value={edit.weightKg} onChange={(e) => setNumber("weightKg", e.target.value)} />)}</div>
        </div>

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "10px 0 10px" }}>Training Preferences</div>
        {row("GOAL", (
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
            {Object.entries(GOAL_LABELS).map(([k, label]) => (
              <button key={k} onClick={() => setEdit((f) => ({ ...f, goal: k }))} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: edit.goal === k ? "var(--brass-soft)" : "transparent", color: edit.goal === k ? "var(--brass)" : "var(--ink-dim)" }}>{label}</button>
            ))}
          </div>
        ))}
        {row("EXPERIENCE", (
          <select className="atlas-input" value={edit.experience} onChange={(e) => setEdit((f) => ({ ...f, experience: e.target.value }))}>
            <option value="beginner">Beginner (0-1yr)</option>
            <option value="intermediate">Intermediate (1-5yr)</option>
            <option value="advanced">Advanced (5yr+)</option>
          </select>
        ))}
        {row(`TRAINING DAYS / WEEK: ${edit.trainingDays}`, (
          <input type="range" min="2" max="6" value={edit.trainingDays} onChange={(e) => setEdit((f) => ({ ...f, trainingDays: +e.target.value }))} style={{ width: "100%" }} />
        ))}
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 10 }}>
          Coaching style is set from the Coach tab — it's tied to how the AI talks about your plan, not your saved profile.
        </div>
        <button className="atlas-btn" style={{ width: "100%" }} onClick={saveIdentity} disabled={!edit.name.trim()}>Save Changes</button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
          <div className="disp" style={{ fontSize: 15 }}>Nutrition Targets</div>
          <label style={{ display: "flex", alignItems: "center", gap: 6, cursor: "pointer" }} className="mono">
            <input type="checkbox" checked={overrideOn} onChange={(e) => { setOverrideOn(e.target.checked); if (e.target.checked) setOverrideForm(profile.macroOverride || currentTargets); }} />
            <span style={{ fontSize: 11, color: "var(--ink-dim)" }}>Set manually</span>
          </label>
        </div>
        {!overrideOn ? (
          <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
            Calculated from your stats: {currentTargets.calories} kcal · {currentTargets.protein}g protein · {currentTargets.carbs}g carbs · {currentTargets.fat}g fat
          </div>
        ) : (
          <div style={{ display: "flex", gap: 8, flexWrap: "wrap", marginBottom: 10 }}>
            {["calories", "protein", "carbs", "fat"].map((k) => (
              <div key={k} style={{ flex: "1 1 45%" }}>
                {row(k.toUpperCase(), <input type="number" className="atlas-input" value={overrideForm[k]} onChange={(e) => setOverrideForm((f) => ({ ...f, [k]: e.target.value === "" ? "" : +e.target.value }))} />)}
              </div>
            ))}
          </div>
        )}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={saveOverride}>Save Targets</button>
      </div>

      {savedFlash && <div className="mono" style={{ fontSize: 12, color: "var(--brass)", textAlign: "center", marginBottom: 16 }}>Saved.</div>}

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 15, marginBottom: 10 }}>Account</div>
        {row("EMAIL", <div className="mono" style={{ fontSize: 13 }}>{authUser?.email || "—"}</div>)}

        {row("SUBSCRIPTION", isPremium ? (
          <div>
            <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
              <span className="mono" style={{ fontSize: 12, color: "var(--brass)" }}><Sparkles size={12} style={{ verticalAlign: -2, marginRight: 4 }} />{isDemoEntitlement ? "Asc3end+ Demo Access" : "Premium Active"}</span>
              {!isDemoEntitlement && (
                <button onClick={onManageBilling} disabled={billingLoading === "portal"} className="atlas-btn-ghost" style={{ padding: "5px 10px", fontSize: 10 }}>
                  {billingLoading === "portal" ? <Loader2 size={12} style={{ animation: "spin 1s linear infinite" }} /> : "Manage Billing"}
                </button>
              )}
            </div>
            {isDemoEntitlement && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 6 }}>Billing management is unavailable for demo accounts.</div>}
          </div>
        ) : (
          <>
            <button onClick={onUpgrade} disabled={billingLoading === "checkout"} className="atlas-btn" style={{ width: "100%" }}>
              {billingLoading === "checkout" ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
              Upgrade to Premium — $9.99/mo
            </button>
            <button onClick={() => setShowComparison((v) => !v)} className="mono" style={{ display: "block", width: "100%", textAlign: "center", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "8px 0 0" }}>
              {showComparison ? "Hide" : "See"} Free vs Premium {showComparison ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />}
            </button>
            {showComparison && <FeatureComparisonTable />}
          </>
        ))}
        {billingError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 4 }}>{billingError}</div>}

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "14px 0 8px" }}>Change Password</div>
        <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
          <input className="atlas-input" type="password" placeholder="New password" value={pw.next} onChange={(e) => setPw((f) => ({ ...f, next: e.target.value }))} />
          <input className="atlas-input" type="password" placeholder="Confirm new password" value={pw.confirm} onChange={(e) => setPw((f) => ({ ...f, confirm: e.target.value }))} />
          {pwStatus?.error && <div className="mono" style={{ fontSize: 11, color: "var(--rest)" }}>{pwStatus.error}</div>}
          {pwStatus === "success" && <div className="mono" style={{ fontSize: 11, color: "var(--brass)" }}>Password updated.</div>}
          <button className="atlas-btn-ghost" onClick={changePassword} disabled={pwStatus === "saving" || !pw.next}>
            {pwStatus === "saving" ? <Loader2 size={13} style={{ animation: "spin 1s linear infinite", verticalAlign: -2, marginRight: 6 }} /> : null}
            Update Password
          </button>
        </div>

        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", margin: "14px 0 8px" }}>Your Data</div>
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 8 }} onClick={exportData}>
          <Copy size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> Export My Data (JSON)
        </button>
        <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={onLogOut}>Log Out</button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>Legal</div>
        <div style={{ display: "flex", gap: 6, flexWrap: "wrap" }}>
          {Object.entries(LEGAL_COPY).map(([k, v]) => (
            <button key={k} onClick={() => setLegalOpen(k)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: "transparent", color: "var(--ink-dim)" }}>{v.title}</button>
          ))}
        </div>
        {legalOpen && (
          <div style={{ marginTop: 10, padding: 10, background: "var(--bg-elev2)", borderRadius: 8 }}>
            <div className="disp" style={{ fontSize: 12, marginBottom: 6 }}>{LEGAL_COPY[legalOpen].title}</div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>{LEGAL_COPY[legalOpen].body}</div>
          </div>
        )}
      </div>

      <div className="atlas-card" style={{ borderColor: "var(--rest)" }}>
        <div className="disp" style={{ fontSize: 13, color: "var(--rest)", marginBottom: 8 }}>Danger Zone</div>
        {!showDelete ? (
          <button onClick={() => setShowDelete(true)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--rest)", fontSize: 12, padding: 0 }}>
            Delete Account
          </button>
        ) : (
          <div>
            <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 10 }}>
              This permanently deletes your account and all workouts, nutrition logs, and weight history. This can't be undone. Type DELETE and enter your password to confirm.
            </div>
            <input className="atlas-input" value={deleteConfirmText} onChange={(e) => setDeleteConfirmText(e.target.value)} placeholder="DELETE" style={{ marginBottom: 10 }} />
            <input className="atlas-input" type="password" autoComplete="current-password" value={reauthPassword} onChange={(e) => { setReauthPassword(e.target.value); setReauthError(null); }} placeholder="Current password" style={{ marginBottom: 10 }} aria-label="Current password, to confirm it's really you" />
            {reauthError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{reauthError}</div>}
            {deleteAccountError && <div className="mono" style={{ fontSize: 11, color: "var(--rest)", marginBottom: 8 }}>{deleteAccountError}</div>}
            <div style={{ display: "flex", gap: 8 }}>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setShowDelete(false); setDeleteConfirmText(""); setReauthPassword(""); setReauthError(null); }} disabled={deleteAccountLoading || reauthing}>Cancel</button>
              <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} disabled={deleteConfirmText !== "DELETE" || !reauthPassword || deleteAccountLoading || reauthing} onClick={confirmDelete}>
                {deleteAccountLoading || reauthing ? <Loader2 size={14} style={{ animation: "spin 1s linear infinite" }} /> : "Permanently Delete"}
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Train                                                                */
/* ------------------------------------------------------------------ */

function Train({ profile, workouts, session, setSession, onFinish, onDiscard, onStartWorkout, finishingWorkout, finishError, customExercises, onAddCustomExercise }) {
  const [picker, setPicker] = useState(false);
  const [search, setSearch] = useState("");
  const [muscleFilter, setMuscleFilter] = useState("all");
  const [equipFilter, setEquipFilter] = useState("all");
  const [detailEx, setDetailEx] = useState(null);
  const [openCues, setOpenCues] = useState({});
  const [weightIn, setWeightIn] = useState({});
  const [repsIn, setRepsIn] = useState({});
  const [prToast, setPrToast] = useState(null);
  const [now, setNow] = useState(Date.now());
  const [restDuration, setRestDuration] = useState(90);
  const [linkingEx, setLinkingEx] = useState(null);
  const [creatingCustom, setCreatingCustom] = useState(false);
  const [customName, setCustomName] = useState("");
  const [customMuscle, setCustomMuscle] = useState(MUSCLE_GROUPS[0]);
  const [customEquip, setCustomEquip] = useState(EQUIPMENT_TYPES[0]);
  const [customError, setCustomError] = useState(null);
  const [typeIn, setTypeIn] = useState({});
  const [reviewing, setReviewing] = useState(false);
  const [confirmDiscard, setConfirmDiscard] = useState(false);
  const [sessionPRs, setSessionPRs] = useState([]);
  const restAlertedRef = useRef(false);

  // A brand-new session (or returning to none) should never inherit the previous session's
  // review/discard-confirmation UI state.
  useEffect(() => {
    setReviewing(false);
    setConfirmDiscard(false);
    setSessionPRs([]);
  }, [session?.id]);

  useEffect(() => {
    if (!prToast) return;
    const t = setTimeout(() => setPrToast(null), 3800);
    return () => clearTimeout(t);
  }, [prToast]);

  // Ticks once a second while a session is active, driving both the elapsed-time readout and the rest countdown.
  useEffect(() => {
    if (!session) return;
    const t = setInterval(() => setNow(Date.now()), 1000);
    return () => clearInterval(t);
  }, [session]);

  useEffect(() => {
    if (!session?.restEndAt) { restAlertedRef.current = false; return; }
    if (now >= session.restEndAt && !restAlertedRef.current) {
      restAlertedRef.current = true;
      playRestDoneSound();
    }
  }, [now, session?.restEndAt]);

  const fmtClock = (secs) => {
    const s = Math.max(0, Math.round(secs));
    const m = Math.floor(s / 60);
    const r = s % 60;
    return `${m}:${r.toString().padStart(2, "0")}`;
  };

  const history = [...workouts].sort((a, b) => new Date(b.date) - new Date(a.date)).slice(0, 8);

  if (!session) {
    return (
      <div style={{ padding: "24px 18px" }}>
        <div className="disp" style={{ fontSize: 26, marginBottom: 4 }}>Train</div>
        <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 18 }}>Log today's session and let the coach handle progression.</div>
        <button className="atlas-btn" style={{ width: "100%", padding: 16, fontSize: 15 }} onClick={() => onStartWorkout()}>
          <Plus size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Start Workout
        </button>

        <div style={{ marginTop: 26 }}>
          <div className="disp" style={{ fontSize: 15, marginBottom: 10, color: "var(--ink-dim)" }}>History</div>
          {history.length === 0 && <div style={{ color: "var(--ink-dim)", fontSize: 13 }}>No workouts logged yet.</div>}
          <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
            {history.map((w) => {
              const volume = w.exercises.reduce((s, e) => s + e.sets.reduce((s2, st) => s2 + st.weight * st.reps, 0), 0);
              return (
                <div key={w.id} className="atlas-card" style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                  <div>
                    <div style={{ fontSize: 14, fontWeight: 600 }}>{fmtDate(w.date)}</div>
                    <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{w.exercises.length} exercises</div>
                  </div>
                  <div className="mono" style={{ fontSize: 13, color: "var(--brass)" }}>{Math.round(volume)}kg vol</div>
                </div>
              );
            })}
          </div>
        </div>
      </div>
    );
  }

  const allExercises = [...EXERCISES, ...customExercises];

  const filtered = allExercises.filter((e) =>
    e.name.toLowerCase().includes(search.toLowerCase()) &&
    (muscleFilter === "all" || e.muscle === muscleFilter) &&
    (equipFilter === "all" || e.equipment === equipFilter)
  );

  const addExercise = (ex) => {
    setSession((s) => ({ ...s, exercises: [...s.exercises, { name: ex.name, sets: [], supersetWith: null }] }));
    setPicker(false);
    setSearch("");
    setDetailEx(null);
  };

  const createCustomExercise = () => {
    const trimmed = customName.trim();
    if (!trimmed) { setCustomError("Give it a name."); return; }
    if (allExercises.some((e) => e.name.toLowerCase() === trimmed.toLowerCase())) {
      setCustomError("An exercise with that name already exists.");
      return;
    }
    const ex = { name: trimmed, muscle: customMuscle, equipment: customEquip, pose: MUSCLE_DEFAULT_POSE[customMuscle], isCustom: true };
    onAddCustomExercise(ex);
    addExercise(ex);
    setCreatingCustom(false);
    setCustomName("");
    setCustomMuscle(MUSCLE_GROUPS[0]);
    setCustomEquip(EQUIPMENT_TYPES[0]);
    setCustomError(null);
  };

  const addSet = (exName) => {
    const w = +weightIn[exName]; const r = +repsIn[exName];
    if (!w || !r) return;
    const isFirstSetEver = workouts.length === 0 && session.exercises.every((e) => e.sets.length === 0);
    const setType = typeIn[exName] || "normal";
    const historySets = [
      ...workouts.flatMap((wk) => wk.exercises.filter((e) => e.name === exName).flatMap((e) => e.sets)),
      ...(session.exercises.find((e) => e.name === exName)?.sets || []),
    ];
    const pr = setType === "normal" ? evaluatePR(historySets, w, r) : { isPR: false };
    const linked = session.exercises.find((e) => e.name === exName)?.supersetWith;
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => e.name === exName ? { ...e, sets: [...e.sets, { weight: w, reps: r, type: setType }] } : e),
      // skip the auto rest timer when logging inside a superset — rest happens after both movements, not between them
      restEndAt: linked ? s.restEndAt : Date.now() + restDuration * 1000,
    }));
    restAlertedRef.current = false;
    setWeightIn((v) => ({ ...v, [exName]: "" }));
    setRepsIn((v) => ({ ...v, [exName]: "" }));
    if (pr.isPR) {
      setPrToast({ exName, weight: w, reps: r, type: pr.type });
      playPRSound();
      setSessionPRs((prev) => [...prev, { exName, weight: w, reps: r, type: pr.type }]);
    }
    if (isFirstSetEver) logEvent("first_set_logged", { exercise: exName });
  };

  const toggleSuperset = (exNameA, exNameB) => {
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => {
        if (e.name === exNameA) return { ...e, supersetWith: e.supersetWith === exNameB ? null : exNameB };
        if (e.name === exNameB) return { ...e, supersetWith: e.supersetWith === exNameA ? null : exNameA };
        if (e.supersetWith === exNameA || e.supersetWith === exNameB) return { ...e, supersetWith: null };
        return e;
      }),
    }));
    setLinkingEx(null);
  };

  const removeSet = (exName, idx) => {
    setSession((s) => ({
      ...s,
      exercises: s.exercises.map((e) => e.name === exName ? { ...e, sets: e.sets.filter((_, i) => i !== idx) } : e),
    }));
  };

  const isPR = (exName, weight) => {
    const prevMax = Math.max(0, ...workouts.flatMap((w) => w.exercises.filter((e) => e.name === exName).flatMap((e) => e.sets.map((s) => s.weight))));
    return weight > prevMax;
  };

  const totalSets = session.exercises.reduce((s, e) => s + e.sets.length, 0);
  const totalVolume = session.exercises.reduce((s, e) => s + e.sets.reduce((s2, st) => s2 + st.weight * st.reps, 0), 0);
  const musclesTrained = [...new Set(session.exercises.map((ex) => allExercises.find((e) => e.name === ex.name)?.muscle).filter(Boolean))];
  const skippedExercises = session.exercises.filter((ex) => ex.sets.length === 0);
  const targetSetsTotal = session.exercises.reduce((s, ex) => s + (ex.targetSets || 0), 0);
  const mostSetsIncomplete = targetSetsTotal > 0 && totalSets < targetSetsTotal * 0.5;
  // Mirrors the base-workout + volume components of computeGamification's XP formula (the streak
  // bonus isn't attributable to a single workout, so it's left out of this per-workout figure).
  const xpEarned = session.exercises.length > 0 ? 50 + Math.round(totalVolume / 20) : 0;

  return (
    <div style={{ padding: "24px 18px" }}>
      {prToast && (
        <div className="atlas-card" style={{
          position: "sticky", top: 0, zIndex: 20, marginBottom: 14, borderColor: "var(--brass)",
          background: "linear-gradient(135deg, rgba(62,207,142,0.18), var(--bg-elev))",
          display: "flex", alignItems: "center", gap: 10, boxShadow: "0 4px 18px rgba(62,207,142,0.25)",
        }}>
          <Trophy size={22} color="var(--brass)" style={{ flexShrink: 0 }} />
          <div>
            <div className="disp" style={{ fontSize: 14, color: "var(--brass)" }}>New Personal Record!</div>
            <div className="mono" style={{ fontSize: 12 }}>
              {prToast.exName} — {prToast.weight}kg × {prToast.reps} {prToast.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
            </div>
          </div>
        </div>
      )}
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div>
          <div className="disp" style={{ fontSize: 24 }}>{session.planDayName || "Today's Session"}</div>
          <div className="mono" style={{ fontSize: 13, color: "var(--steel)" }}>⏱ {fmtClock((now - session.startedAt) / 1000)} elapsed</div>
        </div>
        <button className="atlas-btn-ghost" onClick={() => setConfirmDiscard(true)} style={{ padding: "6px 10px" }}>Cancel</button>
      </div>

      {confirmDiscard && !reviewing && (
        <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
          <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
          <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>
            {session.exercises.length === 0 ? "Nothing's been logged yet." : `You've logged ${session.exercises.reduce((s, e) => s + e.sets.length, 0)} set(s). This can't be undone.`}
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
            <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
          </div>
        </div>
      )}

      {session.restEndAt && now < session.restEndAt && (
        <div className="atlas-card" style={{ marginBottom: 14, borderColor: "var(--steel)", background: "rgba(47,217,184,0.08)" }}>
          <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 8 }}>
            <div className="disp" style={{ fontSize: 14, color: "var(--steel)" }}>Resting</div>
            <div className="mono" style={{ fontSize: 20 }}>{fmtClock((session.restEndAt - now) / 1000)}</div>
          </div>
          <div className="bar-track" style={{ marginBottom: 10 }}>
            <div className="bar-fill" style={{ width: `${Math.max(0, Math.min(100, ((session.restEndAt - now) / (restDuration * 1000)) * 100))}%`, background: "var(--steel)" }} />
          </div>
          <div style={{ display: "flex", gap: 6 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: Math.max(now, s.restEndAt - 15000) }))}>-15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: s.restEndAt + 15000 }))}>+15s</button>
            <button className="atlas-btn-ghost" style={{ flex: 1, padding: "6px 0", fontSize: 11 }} onClick={() => setSession((s) => ({ ...s, restEndAt: null }))}>Skip</button>
          </div>
        </div>
      )}

      {session.exercises.map((ex) => {
        const suggestion = suggestNextTarget(workouts, ex.name, profile.goal);
        const meta = allExercises.find((e) => e.name === ex.name);
        const tips = meta ? (POSE_TIPS[meta.pose] || []) : [];
        const currentType = typeIn[ex.name] || "normal";
        return (
          <div key={ex.name} className="atlas-card" style={{ marginBottom: 12, borderColor: ex.supersetWith ? "var(--warn)" : "var(--line)" }}>
            <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
              {meta && <PoseFigure pose={meta.pose} muscle={meta.muscle} size={40} />}
              <div style={{ flex: 1 }}>
                <div className="disp" style={{ fontSize: 16 }}>{ex.name}</div>
                <div style={{ display: "flex", gap: 10, flexWrap: "wrap" }}>
                  {meta && (
                    <button onClick={() => setOpenCues((v) => ({ ...v, [ex.name]: !v[ex.name] }))}
                      style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--steel)", fontSize: 11 }} className="mono">
                      {openCues[ex.name] ? "Hide form cues" : "Show form cues"}
                    </button>
                  )}
                  <button onClick={() => setLinkingEx(linkingEx === ex.name ? null : ex.name)}
                    style={{ background: "none", border: "none", cursor: "pointer", padding: 0, color: "var(--warn)", fontSize: 11 }} className="mono">
                    {ex.supersetWith ? `⚡ Linked with ${ex.supersetWith}` : "⚡ Link as superset"}
                  </button>
                </div>
              </div>
            </div>
            {linkingEx === ex.name && (
              <div style={{ marginTop: 8, padding: 8, background: "var(--bg-elev2)", borderRadius: 8 }}>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 6 }}>PAIR WITH:</div>
                {session.exercises.filter((e) => e.name !== ex.name).length === 0 && <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>Add another exercise first.</div>}
                {session.exercises.filter((e) => e.name !== ex.name).map((e) => (
                  <button key={e.name} onClick={() => toggleSuperset(ex.name, e.name)} className="pill" style={{ marginRight: 6, marginBottom: 6, cursor: "pointer", border: "1px solid var(--warn)", background: ex.supersetWith === e.name ? "var(--warn)" : "transparent", color: ex.supersetWith === e.name ? "#2E1500" : "var(--warn)" }}>
                    {e.name}
                  </button>
                ))}
              </div>
            )}
            {meta && openCues[ex.name] && (
              <ul style={{ margin: "8px 0 4px", paddingLeft: 18, fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.6 }}>
                {tips.map((t, i) => <li key={i}>{t}</li>)}
              </ul>
            )}
            <div style={{ display: "flex", gap: 6, alignItems: "flex-start", marginTop: 8, marginBottom: 10 }}>
              <TrendingUp size={13} color="var(--brass)" style={{ marginTop: 2, flexShrink: 0 }} />
              <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                {suggestion.text}
                {ex.targetSets && ex.targetReps && (
                  <span style={{ color: "var(--warn)" }}> · Plan target: {ex.targetSets} × {ex.targetReps}{ex.sets.length > 0 ? ` (${ex.sets.length}/${ex.targetSets} done)` : ""}</span>
                )}
              </div>
            </div>

            {ex.sets.map((s, i) => (
              <div key={i} style={{ display: "flex", alignItems: "center", gap: 8, padding: "6px 0", borderTop: "1px solid var(--line)" }}>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", width: 20 }}>{i + 1}</span>
                <span className="mono" style={{ flex: 1 }}>{s.weight}kg × {s.reps}</span>
                {s.type && s.type !== "normal" && <span className="pill" style={{ fontSize: 9, background: SET_TYPE_COLORS[s.type] + "22", color: SET_TYPE_COLORS[s.type] }}>{SET_TYPE_LABELS[s.type]}</span>}
                {isPR(ex.name, s.weight) && <Trophy size={14} color="var(--brass)" />}
                <button onClick={() => removeSet(ex.name, i)} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label={`Remove set ${i + 1} for ${ex.name}`}>
                  <X size={14} color="var(--ink-dim)" />
                </button>
              </div>
            ))}

            <div style={{ display: "flex", gap: 5, marginTop: 10, marginBottom: 6, flexWrap: "wrap" }}>
              {SET_TYPES.map((t) => (
                <button key={t} onClick={() => setTypeIn((v) => ({ ...v, [ex.name]: t }))} className="pill" style={{
                  cursor: "pointer", fontSize: 10,
                  border: `1px solid ${currentType === t ? SET_TYPE_COLORS[t] : "var(--line)"}`,
                  background: currentType === t ? SET_TYPE_COLORS[t] + "22" : "transparent",
                  color: currentType === t ? SET_TYPE_COLORS[t] : "var(--ink-dim)",
                }}>{SET_TYPE_LABELS[t]}</button>
              ))}
            </div>
            <div style={{ display: "flex", gap: 6 }}>
              <input className="atlas-input" placeholder="kg" type="number" value={weightIn[ex.name] || ""} onChange={(e) => setWeightIn((v) => ({ ...v, [ex.name]: e.target.value }))} aria-label={`Weight in kg for ${ex.name}`} />
              <input className="atlas-input" placeholder="reps" type="number" value={repsIn[ex.name] || ""} onChange={(e) => setRepsIn((v) => ({ ...v, [ex.name]: e.target.value }))} aria-label={`Reps for ${ex.name}`} />
              <button className="atlas-btn" style={{ padding: "8px 14px" }} onClick={() => addSet(ex.name)} aria-label={`Add set for ${ex.name}`}><Plus size={16} /></button>
            </div>
          </div>
        );
      })}

      {!picker ? (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 4 }} onClick={() => setPicker(true)}>
          <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add Exercise
        </button>
      ) : detailEx ? (
        <div className="atlas-card">
          <button onClick={() => setDetailEx(null)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0, marginBottom: 12 }}>
            ← Back to library
          </button>
          <div style={{ display: "flex", alignItems: "center", gap: 12, marginBottom: 12 }}>
            <PoseFigure pose={detailEx.pose} muscle={detailEx.muscle} size={80} />
            <div>
              <div className="disp" style={{ fontSize: 18 }}>{detailEx.name}</div>
              <span className="pill" style={{ background: "rgba(255,255,255,0.06)", color: EQUIPMENT_COLORS[detailEx.equipment], border: `1px solid ${EQUIPMENT_COLORS[detailEx.equipment]}` }}>
                {detailEx.equipment}
              </span>
              <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginLeft: 8, textTransform: "capitalize" }}>{detailEx.muscle}</span>
            </div>
          </div>
          <div className="disp" style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 6 }}>Key Focus Points</div>
          <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
            {(POSE_TIPS[detailEx.pose] || []).map((t, i) => <li key={i}>{t}</li>)}
          </ul>
          <button className="atlas-btn" style={{ width: "100%", marginTop: 16 }} onClick={() => addExercise(detailEx)}>
            <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to Workout
          </button>
        </div>
      ) : creatingCustom ? (
        <div className="atlas-card">
          <button onClick={() => { setCreatingCustom(false); setCustomError(null); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0, marginBottom: 12 }}>
            ← Back to library
          </button>
          <div className="disp" style={{ fontSize: 16, marginBottom: 12 }}>New Custom Exercise</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NAME</div>
              <input autoFocus className="atlas-input" placeholder="e.g. Cable Y-Raise" value={customName} onChange={(e) => { setCustomName(e.target.value); setCustomError(null); }} />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>MUSCLE GROUP</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {MUSCLE_GROUPS.map((m) => (
                  <button key={m} onClick={() => setCustomMuscle(m)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", textTransform: "capitalize", background: customMuscle === m ? "var(--brass-soft)" : "transparent", color: customMuscle === m ? "var(--brass)" : "var(--ink-dim)" }}>{m}</button>
                ))}
              </div>
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>EQUIPMENT</div>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap" }}>
                {EQUIPMENT_TYPES.map((eq) => (
                  <button key={eq} onClick={() => setCustomEquip(eq)} className="pill" style={{ cursor: "pointer", border: `1px solid ${customEquip === eq ? EQUIPMENT_COLORS[eq] : "var(--line)"}`, background: "transparent", color: customEquip === eq ? EQUIPMENT_COLORS[eq] : "var(--ink-dim)" }}>{eq}</button>
                ))}
              </div>
            </div>
            {customError && <div className="mono" style={{ color: "var(--rest)", fontSize: 12 }}>{customError}</div>}
            <button className="atlas-btn" style={{ width: "100%", marginTop: 6 }} onClick={createCustomExercise}>
              <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Create & Add to Workout
            </button>
          </div>
        </div>
      ) : (
        <div className="atlas-card">
          <div style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 10 }}>
            <Search size={14} color="var(--ink-dim)" />
            <input autoFocus className="atlas-input" placeholder="Search exercises" value={search} onChange={(e) => setSearch(e.target.value)} />
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 6 }}>
            <button onClick={() => setMuscleFilter("all")} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: muscleFilter === "all" ? "var(--brass-soft)" : "transparent", color: muscleFilter === "all" ? "var(--brass)" : "var(--ink-dim)" }}>All</button>
            {MUSCLE_GROUPS.map((m) => (
              <button key={m} onClick={() => setMuscleFilter(m)} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", textTransform: "capitalize", background: muscleFilter === m ? "var(--brass-soft)" : "transparent", color: muscleFilter === m ? "var(--brass)" : "var(--ink-dim)" }}>{m}</button>
            ))}
          </div>
          <div style={{ display: "flex", gap: 5, flexWrap: "wrap", marginBottom: 10 }}>
            <button onClick={() => setEquipFilter("all")} className="pill" style={{ cursor: "pointer", border: "1px solid var(--line)", background: equipFilter === "all" ? "var(--bg-elev2)" : "transparent", color: equipFilter === "all" ? "var(--ink)" : "var(--ink-dim)" }}>Any Equipment</button>
            {EQUIPMENT_TYPES.map((eq) => (
              <button key={eq} onClick={() => setEquipFilter(eq)} className="pill" style={{ cursor: "pointer", border: `1px solid ${equipFilter === eq ? EQUIPMENT_COLORS[eq] : "var(--line)"}`, background: "transparent", color: equipFilter === eq ? EQUIPMENT_COLORS[eq] : "var(--ink-dim)" }}>{eq}</button>
            ))}
          </div>
          <button
            onClick={() => { setCreatingCustom(true); setCustomName(search); }}
            className="atlas-btn-ghost"
            style={{ width: "100%", marginBottom: 10, borderColor: "var(--steel)", color: "var(--steel)", display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }}
          >
            <Plus size={14} /> Create Custom Exercise
          </button>
          <div style={{ maxHeight: 320, overflowY: "auto", display: "flex", flexDirection: "column", gap: 5 }}>
            {filtered.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)", padding: 8 }}>No exercises match those filters.</div>}
            {filtered.map((ex) => (
              <button key={ex.name} onClick={() => setDetailEx(ex)} style={{ display: "flex", alignItems: "center", gap: 10, textAlign: "left", background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 8, padding: "8px 10px", cursor: "pointer", color: "var(--ink)" }}>
                <PoseFigure pose={ex.pose} muscle={ex.muscle} size={30} />
                <div style={{ flex: 1 }}>
                  <div style={{ fontSize: 13 }}>
                    {ex.name}
                    {ex.isCustom && <span className="pill" style={{ marginLeft: 6, fontSize: 8, border: "1px solid var(--steel)", color: "var(--steel)" }}>Custom</span>}
                  </div>
                  <span className="mono" style={{ fontSize: 10, color: EQUIPMENT_COLORS[ex.equipment] }}>{ex.equipment}</span>
                </div>
                <ChevronRight size={15} color="var(--ink-dim)" />
              </button>
            ))}
          </div>
        </div>
      )}

      {session.exercises.length > 0 && (
        <button className="atlas-btn" style={{ width: "100%", marginTop: 18, padding: 14 }} onClick={() => setReviewing(true)}>
          Finish Workout
        </button>
      )}

      {reviewing && (
        <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, overflowY: "auto", padding: "24px 18px" }}>
          <div className="disp" style={{ fontSize: 22, marginBottom: 4 }}>Workout Summary</div>
          <div className="mono" style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 10 }}>
            ⏱ {fmtClock((now - session.startedAt) / 1000)} · {session.exercises.length} exercise{session.exercises.length === 1 ? "" : "s"} · {totalSets} set{totalSets === 1 ? "" : "s"} · {Math.round(totalVolume)}kg volume
          </div>

          <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 16 }}>
            <span className="pill mono" style={{ background: "var(--brass-soft)", color: "var(--brass)" }}>+{xpEarned} XP</span>
            {musclesTrained.map((m) => (
              <span key={m} className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--ink-dim)", textTransform: "capitalize" }}>{m}</span>
            ))}
          </div>

          {sessionPRs.length > 0 && (
            <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
              <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}><Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{sessionPRs.length} New PR{sessionPRs.length === 1 ? "" : "s"}</div>
              <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
                {sessionPRs.map((pr, i) => (
                  <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                    {pr.exName} — {pr.weight}kg × {pr.reps} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
                  </div>
                ))}
              </div>
            </div>
          )}

          {mostSetsIncomplete && (
            <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--warn)", background: "rgba(255,165,61,0.08)" }}>
              <div style={{ display: "flex", gap: 8, alignItems: "flex-start" }}>
                <AlertTriangle size={15} color="var(--warn)" style={{ flexShrink: 0, marginTop: 1 }} />
                <div style={{ fontSize: 12, color: "var(--ink-dim)", lineHeight: 1.5 }}>
                  You logged {totalSets} of {targetSetsTotal} planned sets for {session.planDayName || "this workout"}. Saving now will record it as done — you can always start another session to finish the rest.
                </div>
              </div>
            </div>
          )}

          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginBottom: 16 }}>
            {session.exercises.length === 0 && <div style={{ fontSize: 13, color: "var(--ink-dim)" }}>No exercises logged.</div>}
            {session.exercises.map((ex) => (
              <div key={ex.name} className="atlas-card">
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 6 }}>
                  <div className="disp" style={{ fontSize: 14 }}>{ex.name}</div>
                  {ex.sets.length === 0 && <span className="pill mono" style={{ background: "rgba(255,107,129,0.12)", color: "var(--rest)" }}>Skipped</span>}
                </div>
                {ex.sets.length === 0 ? (
                  <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No sets logged — added to this workout but never completed.</div>
                ) : (
                  <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
                    {ex.sets.map((s, i) => (
                      <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                        {s.weight}kg × {s.reps}{s.type && s.type !== "normal" ? ` (${SET_TYPE_LABELS[s.type]})` : ""}
                      </div>
                    ))}
                  </div>
                )}
              </div>
            ))}
          </div>

          <div style={{ marginBottom: 20 }}>
            <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", marginBottom: 4 }}>NOTES (OPTIONAL)</label>
            <textarea
              className="atlas-input"
              style={{ resize: "vertical", minHeight: 60, fontFamily: "inherit" }}
              placeholder="How did it feel? Anything to remember for next time…"
              value={session.notes || ""}
              onChange={(e) => setSession((s) => ({ ...s, notes: e.target.value }))}
            />
          </div>

          {finishError && <div className="mono" style={{ color: "var(--rest)", fontSize: 12, marginBottom: 12 }}>{finishError}</div>}

          {confirmDiscard ? (
            <div className="atlas-card" style={{ marginBottom: 12, borderColor: "var(--rest)", background: "rgba(255,107,129,0.08)" }}>
              <div className="disp" style={{ fontSize: 14, color: "var(--rest)", marginBottom: 6 }}>Discard this workout?</div>
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 12 }}>This can't be undone.</div>
              <div style={{ display: "flex", gap: 8 }}>
                <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => setConfirmDiscard(false)}>Keep Going</button>
                <button className="atlas-btn" style={{ flex: 1, background: "var(--rest)" }} onClick={onDiscard}>Discard Workout</button>
              </div>
            </div>
          ) : (
            <div style={{ display: "flex", flexDirection: "column", gap: 8 }}>
              <button className="atlas-btn" style={{ width: "100%", padding: 14, display: "flex", alignItems: "center", justifyContent: "center", gap: 6 }} disabled={finishingWorkout} onClick={() => onFinish(session)}>
                {finishingWorkout && <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} />}
                {finishingWorkout ? "Saving…" : "Save Workout"}
              </button>
              <button className="atlas-btn-ghost" style={{ width: "100%" }} disabled={finishingWorkout} onClick={() => setReviewing(false)}>Continue Editing</button>
              <button onClick={() => setConfirmDiscard(true)} disabled={finishingWorkout} className="mono" style={{ background: "none", border: "none", cursor: finishingWorkout ? "default" : "pointer", color: "var(--ink-dim)", fontSize: 12, padding: 6, textAlign: "center" }}>
                Discard Workout
              </button>
            </div>
          )}
        </div>
      )}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Coach                                                                */
/* ------------------------------------------------------------------ */

/* Lightweight tap-for-tips popup used inside the Coach — shows the same pose demo + form cues as the Train library */
function CoachExercisePopup({ ex, onClose }) {
  if (!ex) return null;
  return (
    <div style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.9)", zIndex: 50, display: "flex", alignItems: "center", justifyContent: "center", padding: 20 }} onClick={onClose}>
      <div className="atlas-card" style={{ maxWidth: 340, width: "100%" }} onClick={(e) => e.stopPropagation()}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start" }}>
          <div style={{ display: "flex", alignItems: "center", gap: 12 }}>
            <PoseFigure pose={ex.pose} muscle={ex.muscle} size={56} />
            <div>
              <div className="disp" style={{ fontSize: 16 }}>{ex.name}</div>
              <span className="pill" style={{ background: "rgba(255,255,255,0.06)", color: EQUIPMENT_COLORS[ex.equipment], border: `1px solid ${EQUIPMENT_COLORS[ex.equipment]}` }}>{ex.equipment}</span>
            </div>
          </div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="Close"><X size={18} color="var(--ink-dim)" /></button>
        </div>
        <div className="disp" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 14, marginBottom: 6 }}>Key Focus Points</div>
        <ul style={{ margin: 0, paddingLeft: 18, fontSize: 13, lineHeight: 1.7 }}>
          {(POSE_TIPS[ex.pose] || []).map((t, i) => <li key={i}>{t}</li>)}
        </ul>
      </div>
    </div>
  );
}

/* Renders a workout's muscle-group breakdown with tappable exercises, shared between the Weekly Plan
   card and any workout the coach generates inline in chat. */
function MuscleGroupBlock({ muscleGroups, onTapExercise }) {
  return (
    <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
      {muscleGroups.map((mg, i) => (
        <div key={i}>
          <div className="disp" style={{ fontSize: 12, color: "var(--brass)", textTransform: "capitalize", marginBottom: 4 }}>{mg.muscle}</div>
          <div style={{ display: "flex", flexDirection: "column", gap: 3 }}>
            {mg.exercises.map((ex, j) => {
              const matched = lookupExercise(ex.name);
              return (
                <button key={j} onClick={() => matched && onTapExercise(matched)}
                  style={{ display: "flex", justifyContent: "space-between", alignItems: "center", background: "none", border: "none", padding: "2px 0", cursor: matched ? "pointer" : "default", textAlign: "left", width: "100%" }}>
                  <span style={{ fontSize: 12.5, color: matched ? "var(--steel)" : "var(--ink)" }}>• {ex.name}</span>
                  <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", flexShrink: 0, marginLeft: 8 }}>{ex.sets}×{ex.reps}</span>
                </button>
              );
            })}
          </div>
        </div>
      ))}
    </div>
  );
}

/* Shared upsell shown in place of a gated feature — Coach entirely, or an inline slot inside
   Nutrition for the scanner / Meals Near You. Subscription status is only ever set by the
   Stripe webhook, so this button just starts Checkout; it never grants access itself. */
const FEATURE_COMPARISON = [
  { label: "Workout logging", free: true, premium: true },
  { label: "Nutrition tracking", free: true, premium: true },
  { label: "Progress & strength analytics", free: true, premium: true },
  { label: "AI Coach chat & plans", free: `${FREE_TRIAL_LIMIT} free`, premium: "Unlimited" },
  { label: "Meals Near You", free: `${FREE_TRIAL_LIMIT} free`, premium: "Unlimited" },
  { label: "Food scanner (photo/barcode)", free: false, premium: true },
];

function FeatureComparisonTable() {
  const cell = (v) => v === true ? <Check size={13} color="var(--good)" /> : v === false ? <X size={13} color="var(--ink-dim)" /> : <span className="mono" style={{ fontSize: 10 }}>{v}</span>;
  return (
    <div style={{ marginTop: 4 }}>
      <div style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, marginBottom: 6 }}>
        <span />
        <span className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", textAlign: "center" }}>FREE</span>
        <span className="mono" style={{ fontSize: 9, color: "var(--brass)", textAlign: "center" }}>PREMIUM</span>
      </div>
      {FEATURE_COMPARISON.map((r) => (
        <div key={r.label} style={{ display: "grid", gridTemplateColumns: "1fr 60px 70px", gap: 4, alignItems: "center", padding: "5px 0", borderTop: "1px solid var(--line)" }}>
          <span style={{ fontSize: 11.5, textAlign: "left" }}>{r.label}</span>
          <span style={{ textAlign: "center" }}>{cell(r.free)}</span>
          <span style={{ textAlign: "center" }}>{cell(r.premium)}</span>
        </div>
      ))}
    </div>
  );
}

function Paywall({ feature, onUpgrade }) {
  const [showComparison, setShowComparison] = useState(false);
  useEffect(() => { logEvent("paywall_viewed", { feature }); }, [feature]);
  const COPY = {
    coach: { title: "AI Coach is Premium", blurb: "Personalized training plans, a chat coach that knows your history, and real-time form feedback." },
    scanner: { title: "Food Scanner is Premium", blurb: "Snap a photo or scan a barcode to log food in seconds instead of typing it in by hand." },
    meals: { title: "Meals Near You is Premium", blurb: "Real nearby restaurant suggestions tuned to your macros and training goal." },
  };
  const c = COPY[feature] || { title: "This feature is Premium", blurb: "" };
  return (
    <div className="atlas-card" style={{ textAlign: "center", padding: 28 }}>
      <Sparkles size={26} color="var(--brass)" style={{ marginBottom: 10 }} />
      <div className="disp" style={{ fontSize: 17, marginBottom: 6 }}>{c.title}</div>
      <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 18, lineHeight: 1.5 }}>{c.blurb}</div>
      <button className="atlas-btn" style={{ width: "100%" }} onClick={onUpgrade}>Upgrade — $9.99/mo</button>
      <button onClick={() => setShowComparison((v) => !v)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0, marginTop: 12 }}>
        {showComparison ? "Hide" : "See"} full Free vs Premium comparison {showComparison ? <ChevronUp size={12} style={{ verticalAlign: -2 }} /> : <ChevronDown size={12} style={{ verticalAlign: -2 }} />}
      </button>
      {showComparison && <FeatureComparisonTable />}
    </div>
  );
}

function Coach({ profile, workouts, onUpdateProfile, isPremium, onUpgrade, usage, onUsageChange }) {
  const coachRemaining = Math.max(0, FREE_TRIAL_LIMIT - (usage?.coach || 0));
  // Bug: this used to read `profile.plan`, a field nothing ever wrote — the real field is
  // `profile.activePlan` (set by activatePlan below), so a fresh mount of Coach always started
  // with no plan showing here even when Home was actively running one. Reconstruct the same
  // `{ days }` shape generatePlan produces so the Weekly Plan card reflects reality on load.
  const [plan, setPlan] = useState(profile.activePlan ? { days: profile.activePlan.days } : null);
  const [genLoading, setGenLoading] = useState(false);
  const [messages, setMessages] = useState([
    { role: "assistant", content: `Hey ${profile.name || "there"}, I'm your coach. Ask me anything about training, recovery, or your plan.` },
  ]);
  const [input, setInput] = useState("");
  const [sending, setSending] = useState(false);
  const [lastFailedInput, setLastFailedInput] = useState(null);
  const scrollRef = useRef(null);

  useEffect(() => { scrollRef.current?.scrollTo(0, scrollRef.current.scrollHeight); }, [messages]);

  const [planError, setPlanError] = useState(null);
  const [exDetail, setExDetail] = useState(null);
  const [planActivated, setPlanActivated] = useState(!!profile.activePlan);
  const [editingPlan, setEditingPlan] = useState(false);
  const [editDays, setEditDays] = useState(null);
  const [addingToDay, setAddingToDay] = useState(null);
  const [exSearch, setExSearch] = useState("");
  const GEN_PHASES = ["Analysing your goal…", "Selecting your split…", "Balancing weekly volume…", "Choosing exercises…", "Finalising your plan…"];
  const [genPhase, setGenPhase] = useState(0);

  useEffect(() => {
    if (!genLoading) { setGenPhase(0); return; }
    const t = setInterval(() => setGenPhase((p) => Math.min(p + 1, GEN_PHASES.length - 1)), 3000);
    return () => clearInterval(t);
  }, [genLoading]);

  const generatePlan = async () => {
    if (genLoading) return; // prevent duplicate simultaneous requests
    setGenLoading(true);
    setPlanError(null);
    setPlanActivated(false);
    try {
      const prompt = `Build a ${profile.trainingDays}-day weekly workout split for this athlete:
Goal: ${GOAL_LABELS[profile.goal]}
Experience: ${profile.experience}
Age: ${profile.age}, Weight: ${profile.weightKg}kg, Height: ${profile.heightCm}cm
Return ONLY valid JSON (no markdown fences, no preamble) matching exactly this schema:
{"days":[{"day":"Day 1: Push","muscleGroups":[{"muscle":"chest","exercises":[{"name":"Barbell Bench Press","sets":4,"reps":"6-10"}]}]}]}
Use "muscle" values only from: chest, back, shoulders, arms, legs, core. Use ${profile.trainingDays} day entries. Use exercise names matching this list as closely as possible: ${EXERCISES.map((e) => e.name).join(", ")}`;
      const stylePrompt = (COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).prompt;
      const text = await callClaude([{ role: "user", content: prompt }], 2000, null, `You are a strength coach building a training split.\n\n${TRAINING_PRINCIPLES}\n\n${stylePrompt}`, "coach");
      const parsed = extractJSON(text);
      setPlan(parsed);
      logEvent("plan_generated", { trainingDays: profile.trainingDays, coachingStyle: profile.coachingStyle || "balanced" });
    } catch (e) {
      setPlan(null);
      setPlanError(e.message || "Couldn't build a plan just now — try again.");
    }
    onUsageChange?.();
    setGenLoading(false);
  };

  const activatePlan = () => {
    if (!plan?.days?.length) return;
    onUpdateProfile({ activePlan: { days: plan.days, currentDayIndex: 0, activatedAt: new Date().toISOString() } });
    setPlanActivated(true);
    logEvent("plan_activated", { days: plan.days.length });
  };

  // Deactivating clears the schedule Home reads from (activePlan) but keeps `plan` visible here
  // so the athlete can see what they had and re-activate it without regenerating from scratch.
  const deactivatePlan = () => {
    onUpdateProfile({ activePlan: null });
    setPlanActivated(false);
  };

  const startEditPlan = () => {
    setEditDays(plan.days.map((d) => ({ day: d.day, muscleGroups: d.muscleGroups.map((mg) => ({ muscle: mg.muscle, exercises: mg.exercises.map((e) => ({ ...e })) })) })));
    setEditingPlan(true);
  };

  const cancelEditPlan = () => {
    setEditingPlan(false);
    setEditDays(null);
    setAddingToDay(null);
    setExSearch("");
  };

  // Empty muscle groups / days (every exercise removed) are dropped on save rather than left as
  // dead weight the athlete would have to notice and clean up themselves.
  const saveEditPlan = () => {
    const cleanedDays = editDays
      .map((d) => ({ ...d, muscleGroups: d.muscleGroups.filter((mg) => mg.exercises.length > 0) }))
      .filter((d) => d.muscleGroups.length > 0);
    setPlan({ days: cleanedDays });
    if (planActivated && profile.activePlan) {
      const nextIndex = Math.min(profile.activePlan.currentDayIndex, Math.max(0, cleanedDays.length - 1));
      onUpdateProfile({ activePlan: { ...profile.activePlan, days: cleanedDays, currentDayIndex: nextIndex } });
    }
    logEvent("plan_edited", { days: cleanedDays.length });
    setEditingPlan(false);
    setEditDays(null);
    setAddingToDay(null);
    setExSearch("");
  };

  const updateDayName = (dayIdx, name) => {
    setEditDays((days) => days.map((d, i) => (i === dayIdx ? { ...d, day: name } : d)));
  };

  const updateExerciseField = (dayIdx, mgIdx, exIdx, field, value) => {
    setEditDays((days) => days.map((d, i) => i !== dayIdx ? d : {
      ...d,
      muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : {
        ...mg,
        exercises: mg.exercises.map((e, k) => k !== exIdx ? e : { ...e, [field]: value }),
      }),
    }));
  };

  const removeExercise = (dayIdx, mgIdx, exIdx) => {
    setEditDays((days) => days.map((d, i) => i !== dayIdx ? d : {
      ...d,
      muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : { ...mg, exercises: mg.exercises.filter((_, k) => k !== exIdx) }),
    }));
  };

  const addExerciseToDay = (dayIdx, ex) => {
    setEditDays((days) => days.map((d, i) => {
      if (i !== dayIdx) return d;
      const mgIdx = d.muscleGroups.findIndex((mg) => mg.muscle === ex.muscle);
      if (mgIdx === -1) {
        return { ...d, muscleGroups: [...d.muscleGroups, { muscle: ex.muscle, exercises: [{ name: ex.name, sets: 3, reps: "8-12" }] }] };
      }
      return {
        ...d,
        muscleGroups: d.muscleGroups.map((mg, j) => j !== mgIdx ? mg : { ...mg, exercises: [...mg.exercises, { name: ex.name, sets: 3, reps: "8-12" }] }),
      };
    }));
    setAddingToDay(null);
    setExSearch("");
  };

  const removeDay = (dayIdx) => {
    setEditDays((days) => days.filter((_, i) => i !== dayIdx));
  };

  const addDay = () => {
    setEditDays((days) => [...days, { day: `Day ${days.length + 1}`, muscleGroups: [] }]);
  };

  const sendMessage = async (overrideText) => {
    // overrideText is only ever meant to be a string (a retry's saved input) — guard against a
    // stray non-string argument (e.g. a click event handed straight to onClick) instead of letting
    // it silently fall through to `.trim()` and crash.
    const safeOverride = typeof overrideText === "string" ? overrideText : undefined;
    const text = safeOverride ?? input;
    if (!text.trim()) return;
    setLastFailedInput(null);
    // On retry, drop the trailing error bubble first — otherwise it both looks stale once the
    // retry succeeds, and gets sent back to Claude as if it were real conversation history.
    const base = safeOverride && messages[messages.length - 1]?.isError ? messages.slice(0, -1) : messages;
    const userMsg = { role: "user", content: text };
    const newMessages = safeOverride ? base : [...base, userMsg];
    setMessages(newMessages);
    setInput("");
    setSending(true);
    logEvent("coach_message_sent", { isRetry: !!safeOverride });
    try {
      const recent = workouts.slice(-3).map((w) => `${w.date}: ${w.exercises.map((e) => e.name).join(", ")}`).join(" | ");
      const stylePrompt = (COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).prompt;
      const system = `You are Asc3end, an encouraging but direct fitness and nutrition coach. Athlete profile: goal=${GOAL_LABELS[profile.goal]}, experience=${profile.experience}, weight=${profile.weightKg}kg. Recent workouts: ${recent || "none logged"}.\n\n${TRAINING_PRINCIPLES}\n\n${stylePrompt}\n\n${COACH_OUTPUT_RULES}`;
      // Strip the synthetic greeting (index 0) — it was never a real API turn, and including it
      // alongside a fake priming pair broke the API's requirement that roles strictly alternate
      // starting with "user", which is why the coach silently failed on every message before.
      // Also strip any extra UI-only fields (like `workout`) so future turns send clean {role, content} pairs.
      const apiMessages = newMessages.slice(1).map((m) => ({ role: m.role, content: m.content }));
      const reply = await callClaude(apiMessages, 900, null, system, "coach");
      let parsedWorkout = null;
      if (reply.includes('"type"') && reply.includes('"workout"')) {
        try {
          const parsed = extractJSON(reply);
          if (parsed.type === "workout" && Array.isArray(parsed.muscleGroups)) parsedWorkout = parsed;
        } catch (e) { /* not valid JSON, fall through to plain text */ }
      }
      setMessages((m) => [...m, { role: "assistant", content: reply, workout: parsedWorkout }]);
    } catch (e) {
      setLastFailedInput(text);
      setMessages((m) => [...m, { role: "assistant", content: `⚠️ ${e.message || "Something went wrong reaching the coach. Try again in a moment."}`, isError: true }]);
    }
    onUsageChange?.();
    setSending(false);
  };

  const startNewConversation = () => {
    setMessages([{ role: "assistant", content: `Hey ${profile.name || "there"}, I'm your coach. Ask me anything about training, recovery, or your plan.` }]);
    setLastFailedInput(null);
    setInput("");
  };

  if (!isPremium && coachRemaining <= 0) {
    return (
      <div style={{ padding: "24px 18px" }}>
        <div className="disp" style={{ fontSize: 26, marginBottom: 16 }}>Coach</div>
        <Paywall feature="coach" onUpgrade={onUpgrade} />
      </div>
    );
  }

  return (
    <div style={{ padding: "24px 18px", display: "flex", flexDirection: "column", height: "calc(100vh - 88px)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: 4 }}>
        <div className="disp" style={{ fontSize: 26 }}>Coach</div>
        <div style={{ display: "flex", alignItems: "center", gap: 10 }}>
          {!isPremium && (
            <span className="mono" style={{ fontSize: 11, color: "var(--brass)" }}>{coachRemaining} free {coachRemaining === 1 ? "message" : "messages"} left</span>
          )}
          {messages.length > 1 && (
            <button onClick={startNewConversation} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0 }} title="Start a new conversation">
              New Chat
            </button>
          )}
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 8 }}>COACHING STYLE</div>
      <div style={{ display: "flex", gap: 6, flexWrap: "wrap", marginBottom: 14 }}>
        {Object.entries(COACHING_STYLES).map(([key, s]) => {
          const active = (profile.coachingStyle || "balanced") === key;
          return (
            <button key={key} onClick={() => onUpdateProfile({ coachingStyle: key })} title={s.blurb}
              className="pill" style={{ cursor: "pointer", border: `1px solid ${active ? "var(--brass)" : "var(--line)"}`, background: active ? "var(--brass-soft)" : "transparent", color: active ? "var(--brass)" : "var(--ink-dim)" }}>
              {s.label}
            </button>
          );
        })}
      </div>
      <div style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 14, fontStyle: "italic" }}>
        {(COACHING_STYLES[profile.coachingStyle] || COACHING_STYLES.balanced).blurb}
      </div>

      <div className="atlas-card" style={{ marginBottom: 14 }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
          <div className="disp" style={{ fontSize: 15 }}>Weekly Plan</div>
          {!editingPlan && (
            <div style={{ display: "flex", gap: 6 }}>
              {plan && (
                <button className="atlas-btn-ghost" style={{ padding: "6px 12px", fontSize: 11 }} onClick={startEditPlan} disabled={genLoading}>
                  <Pencil size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Edit
                </button>
              )}
              <button className="atlas-btn-ghost" style={{ padding: "6px 12px", fontSize: 11 }} onClick={generatePlan} disabled={genLoading}>
                {genLoading ? <Loader2 size={13} className="mono" style={{ animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4 }} />}
                {genLoading ? "Building..." : plan ? "Regenerate" : "Generate"}
              </button>
            </div>
          )}
        </div>
        {genLoading && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>{GEN_PHASES[genPhase]}</div>}

        {editingPlan && editDays && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 14 }}>
            {editDays.map((d, dayIdx) => (
              <div key={dayIdx} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input className="atlas-input" style={{ flex: 1, fontSize: 13 }} value={d.day} onChange={(e) => updateDayName(dayIdx, e.target.value)} aria-label={`Day ${dayIdx + 1} name`} />
                  <button onClick={() => removeDay(dayIdx)} className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label={`Remove ${d.day}`}>
                    <Trash2 size={13} color="var(--rest)" />
                  </button>
                </div>
                {d.muscleGroups.map((mg, mgIdx) => (
                  <div key={mgIdx} style={{ marginBottom: 8 }}>
                    <div className="mono" style={{ fontSize: 10, color: "var(--brass)", textTransform: "capitalize", marginBottom: 4 }}>{mg.muscle}</div>
                    {mg.exercises.map((ex, exIdx) => (
                      <div key={exIdx} style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 4 }}>
                        <span style={{ flex: 1, fontSize: 12.5 }}>{ex.name}</span>
                        <input className="atlas-input" type="number" style={{ width: 50, fontSize: 12, padding: "6px 8px" }} value={ex.sets} onChange={(e) => updateExerciseField(dayIdx, mgIdx, exIdx, "sets", +e.target.value || 0)} aria-label={`Sets for ${ex.name}`} />
                        <input className="atlas-input" style={{ width: 60, fontSize: 12, padding: "6px 8px" }} value={ex.reps} onChange={(e) => updateExerciseField(dayIdx, mgIdx, exIdx, "reps", e.target.value)} aria-label={`Reps for ${ex.name}`} />
                        <button onClick={() => removeExercise(dayIdx, mgIdx, exIdx)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Remove ${ex.name} from ${d.day}`}>
                          <X size={13} color="var(--ink-dim)" />
                        </button>
                      </div>
                    ))}
                  </div>
                ))}
                {addingToDay === dayIdx ? (
                  <div style={{ marginTop: 6 }}>
                    <input autoFocus className="atlas-input" style={{ fontSize: 12, marginBottom: 6 }} placeholder="Search exercises…" value={exSearch} onChange={(e) => setExSearch(e.target.value)} aria-label="Search exercises to add" />
                    <div style={{ maxHeight: 140, overflowY: "auto", display: "flex", flexDirection: "column", gap: 3 }}>
                      {EXERCISES.filter((e) => e.name.toLowerCase().includes(exSearch.toLowerCase())).slice(0, 20).map((e) => (
                        <button key={e.name} onClick={() => addExerciseToDay(dayIdx, e)} style={{ display: "flex", justifyContent: "space-between", textAlign: "left", background: "var(--bg-elev2)", border: "1px solid var(--line)", borderRadius: 6, padding: "6px 8px", cursor: "pointer", color: "var(--ink)", fontSize: 12 }}>
                          {e.name} <span className="mono" style={{ color: "var(--ink-dim)", textTransform: "capitalize" }}>{e.muscle}</span>
                        </button>
                      ))}
                    </div>
                    <button onClick={() => { setAddingToDay(null); setExSearch(""); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: "6px 0 0" }}>Cancel</button>
                  </div>
                ) : (
                  <button onClick={() => { setAddingToDay(dayIdx); setExSearch(""); }} className="atlas-btn-ghost" style={{ width: "100%", fontSize: 11, padding: "6px 0", marginTop: 4 }}>
                    <Plus size={12} style={{ verticalAlign: -2, marginRight: 4 }} />Add Exercise
                  </button>
                )}
              </div>
            ))}
            <button onClick={addDay} className="atlas-btn-ghost" style={{ width: "100%" }}>
              <Plus size={13} style={{ verticalAlign: -2, marginRight: 4 }} />Add Day
            </button>
            <div style={{ display: "flex", gap: 8 }}>
              <button onClick={cancelEditPlan} className="atlas-btn-ghost" style={{ flex: 1 }}>Cancel</button>
              <button onClick={saveEditPlan} className="atlas-btn" style={{ flex: 1 }} disabled={editDays.every((d) => d.muscleGroups.every((mg) => mg.exercises.length === 0))}>Save Changes</button>
            </div>
          </div>
        )}

        {!editingPlan && plan && !genLoading && (
          <div style={{ marginTop: 10, display: "flex", flexDirection: "column", gap: 12 }}>
            {plan.days.map((d, i) => (
              <div key={i} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                <div style={{ fontSize: 13, fontWeight: 700, color: "var(--steel)", marginBottom: 6 }}>{d.day}</div>
                <MuscleGroupBlock muscleGroups={d.muscleGroups} onTapExercise={setExDetail} />
              </div>
            ))}
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", fontStyle: "italic" }}>Tap any exercise for form cues.</div>
            {planActivated ? (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", gap: 8 }}>
                <div className="pill mono" style={{ background: "var(--brass-soft)", color: "var(--brass)" }}>✓ Active plan — see it on Home</div>
                <button onClick={deactivatePlan} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0 }}>Deactivate</button>
              </div>
            ) : (
              <button className="atlas-btn" style={{ width: "100%", marginTop: 4 }} onClick={activatePlan}>Activate Plan</button>
            )}
          </div>
        )}
        {planError && !genLoading && (
          <div style={{ marginTop: 8 }}>
            <div style={{ fontSize: 12, color: "var(--rest)" }}>⚠️ {planError}</div>
            <button onClick={generatePlan} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: 0, marginTop: 4 }}>Retry</button>
          </div>
        )}
        {!plan && !planError && !genLoading && <div style={{ fontSize: 12, color: "var(--ink-dim)", marginTop: 8 }}>Generate a personalised split based on your goal and schedule.</div>}
      </div>

      <div ref={scrollRef} style={{ flex: 1, overflowY: "auto", display: "flex", flexDirection: "column", gap: 10, paddingRight: 2 }}>
        {messages.map((m, i) => (
          <div key={i} className={m.role === "user" ? "chat-bubble-user" : "chat-bubble-ai"} style={{ fontSize: 13.5, lineHeight: 1.5 }}>
            {m.workout ? (
              <div style={{ minWidth: 220 }}>
                <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>{m.workout.title}</div>
                <MuscleGroupBlock muscleGroups={m.workout.muscleGroups} onTapExercise={setExDetail} />
                <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 8, fontStyle: "italic" }}>Tap any exercise for form cues.</div>
              </div>
            ) : (
              <div style={{ whiteSpace: "pre-wrap" }}>{m.content}</div>
            )}
          </div>
        ))}
        {sending && <div className="chat-bubble-ai" style={{ fontSize: 13 }}>Thinking…</div>}
        {lastFailedInput && !sending && (
          <div style={{ display: "flex", gap: 10, alignSelf: "flex-start", paddingLeft: 2 }}>
            <button onClick={() => sendMessage(lastFailedInput)} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--brass)", fontSize: 11, padding: 0 }}>Retry</button>
            <button onClick={() => { setInput(lastFailedInput); setLastFailedInput(null); }} className="mono" style={{ background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11, padding: 0 }}>Edit &amp; Resend</button>
          </div>
        )}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 10 }}>
        <input className="atlas-input" placeholder="Ask your coach…" value={input} onChange={(e) => setInput(e.target.value)}
          onKeyDown={(e) => e.key === "Enter" && sendMessage()} />
        <button className="atlas-btn" style={{ padding: "10px 14px" }} onClick={() => sendMessage()} disabled={sending} aria-label="Send message"><Send size={16} /></button>
      </div>

      {exDetail && <CoachExercisePopup ex={exDetail} onClose={() => setExDetail(null)} />}
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Nutrition                                                            */
/* ------------------------------------------------------------------ */

/* ------------------------------------------------------------------ */
/* Food Scanner — camera photo recognition + barcode lookup            */
/* ------------------------------------------------------------------ */

function FoodScanner({ onAdd, onClose }) {
  const [mode, setMode] = useState("photo");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState(null);
  const [grams, setGrams] = useState(100);
  const [manualBarcode, setManualBarcode] = useState("");
  const [cameraDenied, setCameraDenied] = useState(false);
  const barcodeSupported = typeof window !== "undefined" && "BarcodeDetector" in window;
  const videoRef = useRef(null);
  const streamRef = useRef(null);
  const scanLoopRef = useRef(null);
  const fileInputRef = useRef(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);

  // Basic modal focus trap: focus something inside on open, cycle Tab/Shift+Tab within the
  // dialog instead of letting it escape into the page behind it, close on Escape, and return
  // focus to whatever opened the scanner once it closes.
  useEffect(() => {
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => !el.disabled && el.offsetParent !== null);
    focusable()[0]?.focus();

    const handleKeyDown = (e) => {
      if (e.key === "Escape") { onClose(); return; }
      if (e.key !== "Tab") return;
      const els = focusable();
      if (els.length === 0) return;
      const first = els[0], last = els[els.length - 1];
      if (e.shiftKey && document.activeElement === first) { e.preventDefault(); last.focus(); }
      else if (!e.shiftKey && document.activeElement === last) { e.preventDefault(); first.focus(); }
    };
    document.addEventListener("keydown", handleKeyDown);
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      triggerRef.current?.focus?.();
    };
  }, []);

  const stopCamera = () => {
    if (scanLoopRef.current) { clearInterval(scanLoopRef.current); scanLoopRef.current = null; }
    if (streamRef.current) { streamRef.current.getTracks().forEach((t) => t.stop()); streamRef.current = null; }
  };

  const lookupBarcode = async (code) => {
    setLoading(true);
    setError(null);
    stopCamera();
    try {
      const res = await fetch(`https://world.openfoodfacts.org/api/v2/product/${code}.json`);
      const data = await res.json();
      if (data.status !== 1 || !data.product) throw new Error("not found");
      const n = data.product.nutriments || {};
      setResult({
        name: data.product.product_name || `Barcode ${code}`,
        per100g: {
          calories: Math.round(n["energy-kcal_100g"] || 0),
          protein: Math.round(n["proteins_100g"] || 0),
          carbs: Math.round(n["carbohydrates_100g"] || 0),
          fat: Math.round(n["fat_100g"] || 0),
        },
        source: "barcode",
      });
      setGrams(100);
    } catch (e) {
      setError("Couldn't find that barcode. Try the photo mode instead, or check the number.");
    }
    setLoading(false);
  };

  useEffect(() => {
    if (result || cameraDenied) { stopCamera(); return; }
    let cancelled = false;
    (async () => {
      try {
        const s = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { s.getTracks().forEach((t) => t.stop()); return; }
        streamRef.current = s;
        if (videoRef.current) { videoRef.current.srcObject = s; await videoRef.current.play().catch(() => {}); }
        if (mode === "barcode" && barcodeSupported) {
          const detector = new window.BarcodeDetector({ formats: ["ean_13", "ean_8", "upc_a", "upc_e"] });
          scanLoopRef.current = setInterval(async () => {
            if (!videoRef.current) return;
            try {
              const codes = await detector.detect(videoRef.current);
              if (codes.length > 0) { clearInterval(scanLoopRef.current); lookupBarcode(codes[0].rawValue); }
            } catch (e) { /* keep trying */ }
          }, 400);
        }
      } catch (e) {
        // Covers both an explicit permission denial and no-camera-available devices — either way
        // the live camera path is dead, so stop retrying it and surface the fallback options instead.
        setCameraDenied(true);
        setError(mode === "photo" ? "Camera access denied or unavailable. Upload a photo instead, or log it manually." : "Camera access denied or unavailable. Enter the barcode number instead.");
      }
    })();
    return () => { cancelled = true; stopCamera(); };
  }, [mode, result, cameraDenied]);

  const analyzeImage = async (base64) => {
    setLoading(true);
    setError(null);
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const response = await fetch("/api/claude", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}),
        },
        body: JSON.stringify({
          model: "claude-sonnet-4-6",
          max_tokens: 400,
          feature: "scanner",
          messages: [{
            role: "user",
            content: [
              { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
              { type: "text", text: `Identify the food in this photo and estimate its nutrition. Return ONLY valid JSON, no markdown fences, no preamble: {"name":"","estimatedGrams":0,"caloriesPer100g":0,"proteinPer100g":0,"carbsPer100g":0,"fatPer100g":0}` },
            ],
          }],
        }),
      });
      const data = await response.json();
      if (response.status === 402 && data?.error?.code === "premium_required") {
        throw new Error(data.error.message || "This feature requires Asc3end Premium.");
      }
      const text = extractClaudeText(data);
      const parsed = extractJSON(text);
      setResult({
        name: parsed.name || "Unknown food",
        per100g: { calories: parsed.caloriesPer100g || 0, protein: parsed.proteinPer100g || 0, carbs: parsed.carbsPer100g || 0, fat: parsed.fatPer100g || 0 },
        source: "photo",
      });
      setGrams(parsed.estimatedGrams || 150);
    } catch (e) {
      setError(
        e.message && (e.message.startsWith("Usage limit") || e.message.includes("Premium"))
          ? e.message
          : "Couldn't identify that photo — try better lighting, or log it manually."
      );
    }
    setLoading(false);
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const canvas = document.createElement("canvas");
    canvas.width = video.videoWidth;
    canvas.height = video.videoHeight;
    canvas.getContext("2d").drawImage(video, 0, 0);
    const base64 = canvas.toDataURL("image/jpeg", 0.85).split(",")[1];
    stopCamera();
    await analyzeImage(base64);
  };

  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => analyzeImage(reader.result.split(",")[1]);
    reader.onerror = () => setError("Couldn't read that image — try a different file.");
    reader.readAsDataURL(file);
  };

  const totals = result ? {
    calories: Math.round((result.per100g.calories * grams) / 100),
    protein: Math.round((result.per100g.protein * grams) / 100),
    carbs: Math.round((result.per100g.carbs * grams) / 100),
    fat: Math.round((result.per100g.fat * grams) / 100),
  } : null;

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Scan food" style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.95)", zIndex: 50, display: "flex", flexDirection: "column", padding: 18, maxWidth: 480, margin: "0 auto" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
        <div className="disp" style={{ fontSize: 18 }}>Scan Food</div>
        <button onClick={() => { stopCamera(); onClose(); }} style={{ background: "none", border: "none", cursor: "pointer" }} aria-label="Close scanner"><X size={20} color="var(--ink)" /></button>
      </div>

      {!result && (
        <>
          <div style={{ display: "flex", gap: 6, marginBottom: 10 }}>
            <button onClick={() => setMode("photo")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mode === "photo" ? "var(--brass-soft)" : "transparent", color: mode === "photo" ? "var(--brass)" : "var(--ink-dim)" }}>Photo</button>
            <button onClick={() => setMode("barcode")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mode === "barcode" ? "var(--brass-soft)" : "transparent", color: mode === "barcode" ? "var(--brass)" : "var(--ink-dim)" }}>Barcode</button>
          </div>

          <div style={{ position: "relative", background: "#000", borderRadius: 10, overflow: "hidden", flex: 1, minHeight: 260, display: "flex", alignItems: "center", justifyContent: "center" }}>
            {cameraDenied ? (
              <div style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 8, padding: 20, textAlign: "center" }}>
                <AlertTriangle size={26} color="var(--warn)" />
                <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>No camera access.</div>
                <button className="atlas-btn-ghost" style={{ fontSize: 11, padding: "6px 12px" }} onClick={() => { setCameraDenied(false); setError(null); }}>
                  Allow Camera
                </button>
              </div>
            ) : (
              <>
                <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
                {mode === "barcode" && <div style={{ position: "absolute", left: "10%", right: "10%", top: "40%", height: 60, border: "2px solid var(--brass)", borderRadius: 6 }} />}
              </>
            )}
          </div>

          {error && <div style={{ fontSize: 12, color: "var(--rest)", marginTop: 10 }}>{error}</div>}

          <input ref={fileInputRef} type="file" accept="image/*" onChange={handleFileUpload} hidden aria-hidden="true" tabIndex={-1} />

          {mode === "photo" && (
            <div style={{ display: "flex", gap: 8, marginTop: 14 }}>
              <button className="atlas-btn" style={{ flex: 1 }} onClick={capturePhoto} disabled={loading || cameraDenied}>
                {loading ? "Analyzing…" : <><Camera size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Capture</>}
              </button>
              <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => fileInputRef.current?.click()} disabled={loading}>
                Upload Photo
              </button>
            </div>
          )}
          {mode === "photo" && (
            <button onClick={onClose} className="mono" style={{ display: "block", margin: "10px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11 }}>
              Log it manually instead
            </button>
          )}
          {mode === "barcode" && (!barcodeSupported || cameraDenied) && (
            <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
              <input className="atlas-input" placeholder="Enter barcode number" value={manualBarcode} onChange={(e) => setManualBarcode(e.target.value)} aria-label="Barcode number" />
              <button className="atlas-btn" onClick={() => manualBarcode && lookupBarcode(manualBarcode)} disabled={loading}>{loading ? "…" : "Find"}</button>
            </div>
          )}
          {mode === "barcode" && barcodeSupported && !cameraDenied && (
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 10, textAlign: "center" }}>Point the camera at a barcode…</div>
          )}
        </>
      )}

      {result && totals && (
        <div className="atlas-card">
          <div className="disp" style={{ fontSize: 16 }}>{result.name}</div>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 12 }}>
            {result.source === "barcode" ? "From barcode lookup" : "From photo scan"} · {result.per100g.calories} kcal / 100g
          </div>
          <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>PORTION SIZE — ADJUST IF NEEDED (GRAMS)</label>
          <input type="number" className="atlas-input" value={grams} onChange={(e) => setGrams(e.target.value === "" ? 0 : +e.target.value.replace(/^0+(?=\d)/, ""))} style={{ marginTop: 4, marginBottom: 12 }} />
          <div style={{ display: "flex", gap: 10, marginBottom: 14 }}>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.calories}</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>KCAL</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.protein}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>PROTEIN</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.carbs}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>CARBS</div></div>
            <div style={{ flex: 1, textAlign: "center" }}><div className="disp" style={{ fontSize: 18 }}>{totals.fat}g</div><div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>FAT</div></div>
          </div>
          <div style={{ display: "flex", gap: 8 }}>
            <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setResult(null); setError(null); }}>
              <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Scan Again
            </button>
            <button className="atlas-btn" style={{ flex: 1 }} onClick={() => { onAdd({ id: uid(), date: todayStr(), name: `${result.name} (${grams}g)`, ...totals }); onClose(); }}>
              <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Add to Log
            </button>
          </div>
        </div>
      )}
    </div>
  );
}

function Nutrition({ profile, nutrition, onAdd, onAddMany, onDelete, onEdit, favorites, onToggleFavorite, isPremium, onUpgrade, usage, onUsageChange }) {
  const mealsRemaining = Math.max(0, FREE_TRIAL_LIMIT - (usage?.meals || 0));
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [estimating, setEstimating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  const backgroundRef = useRef(null);
  // React 18 doesn't recognize `inert` as a boolean HTML attribute (that's new in React 19), so
  // passing it as a JSX prop silently renders nothing — set the DOM property directly instead,
  // which every modern browser reflects to the real attribute regardless of React's version.
  useEffect(() => {
    if (backgroundRef.current) backgroundRef.current.inert = scannerOpen;
  }, [scannerOpen]);
  const [locationInput, setLocationInput] = useState("");
  const [mealTiming, setMealTiming] = useState("post");
  const [findingMeals, setFindingMeals] = useState(false);
  const [mealResults, setMealResults] = useState(null);
  const [mealError, setMealError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  const targets = computeTargets(profile);
  const today = nutrition.filter((n) => n.date === todayStr());
  const yesterday = nutrition.filter((n) => n.date === yesterdayStr());
  const totals = today.reduce((a, f) => ({
    calories: a.calories + f.calories, protein: a.protein + f.protein,
    carbs: a.carbs + f.carbs, fat: a.fat + f.fat,
  }), { calories: 0, protein: 0, carbs: 0, fat: 0 });

  // Most recently logged distinct foods (excluding today's, since those are already listed below
  // and re-adding them from "Recent" would just be a confusing duplicate of what's on-screen).
  const recentFoods = [...nutrition]
    .filter((n) => n.date !== todayStr())
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .reduce((acc, f) => (acc.some((x) => x.name === f.name) ? acc : [...acc, f]), [])
    .slice(0, 8);

  const submit = () => {
    if (!form.name || !form.calories) return;
    onAdd({
      id: uid(), date: todayStr(), name: form.name,
      calories: +form.calories || 0, protein: +form.protein || 0,
      carbs: +form.carbs || 0, fat: +form.fat || 0,
    });
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  };

  const copyYesterday = () => {
    onAddMany(yesterday.map((f) => ({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })));
  };

  const duplicateFood = (f) => {
    onAdd({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  };

  const startEdit = (f) => {
    setEditingId(f.id);
    setEditForm({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat });
  };

  const saveEdit = () => {
    if (!editForm.name || editForm.calories === "") return;
    onEdit(editingId, {
      name: editForm.name, calories: +editForm.calories || 0,
      protein: +editForm.protein || 0, carbs: +editForm.carbs || 0, fat: +editForm.fat || 0,
    });
    setEditingId(null);
    setEditForm(null);
  };

  const estimate = async () => {
    if (!form.name) return;
    setEstimating(true);
    try {
      const prompt = `Estimate calories and macros for this food/meal description: "${form.name}". Return ONLY valid JSON, no markdown fences: {"calories":number,"protein":number,"carbs":number,"fat":number}`;
      const text = await callClaude([{ role: "user", content: prompt }], 200);
      const parsed = extractJSON(text);
      setForm((f) => ({ ...f, calories: parsed.calories, protein: parsed.protein, carbs: parsed.carbs, fat: parsed.fat }));
    } catch (e) { /* silent fail, user can enter manually */ }
    setEstimating(false);
  };

  const findNearbyMeals = async (locationText) => {
    setFindingMeals(true);
    setMealError(null);
    setMealResults(null);
    try {
      const g = mealMacroGuidance(profile.goal, mealTiming);
      const timingNote = mealTiming === "pre" ? "a pre-workout meal, eaten 1-3 hours before training" : "a post-workout meal to support recovery";
      const now = new Date();
      const dayName = now.toLocaleDateString(undefined, { weekday: "long" });
      const timeLabel = now.toLocaleTimeString(undefined, { hour: "numeric", minute: "2-digit" });
      const hour = now.getHours();
      const dayPart = hour < 11 ? "morning (breakfast)" : hour < 15 ? "midday (lunch)" : hour < 21 ? "evening (dinner)" : "late night (light/snack)";
      const system = `You are a nutrition search assistant. Perform exactly ONE web search, then immediately respond — do not search again or refine your query. You must respond with ONLY a single valid JSON object — no preamble, no markdown fences, no explanation of your search, no citations. Just the JSON object and nothing else, even though you have access to web search to inform your answer.`;
      const prompt = `Find 4 real food places near "${locationText}" that are OPEN RIGHT NOW and still serving food — mix it up across fast food, casual/local restaurants, and cafes where possible. Do not include any place that would be closed at this time, and do not suggest a menu item that isn't actually served at this hour.

It is currently ${dayName}, ${timeLabel} (${dayPart}) at that location. The item you pick for each place MUST match what's actually served at this time of day — e.g. do not suggest a breakfast-only item if it's the afternoon or evening, and don't suggest a heavy dinner item if it's the middle of the day, unless that place genuinely serves it all day.

This is for ${timingNote}. Person's goal: ${GOAL_LABELS[profile.goal]} (${g.rationale}). For each place, name ONE specific menu item that roughly fits: ${g.calories[0]}-${g.calories[1]} kcal, ${g.protein[0]}-${g.protein[1]}g protein, ${g.carbs[0]}-${g.carbs[1]}g carbs, ${g.fat[0]}-${g.fat[1]}g fat (your best real estimate, doesn't need to hit the range exactly).
Also give your best real-world price estimate for that item in local currency, and the local currency symbol (e.g. "$", "£", "€").
Estimate each place's approximate straight-line distance in km from "${locationText}".
Write one short sentence (max 2) per place stating the macros and why it fits their goal, in your own words — never quote menus or reviews.
Respond with ONLY this JSON, nothing else:
{"places":[{"name":"","cuisine":"","distanceKm":0.0,"item":"","price":0.0,"currency":"$","calories":0,"protein":0,"carbs":0,"fat":0,"note":""}]}`;
      const text = await callClaude(
        [{ role: "user", content: prompt }],
        1800,
        // max_uses caps this at one search round instead of Claude iterating with several —
        // multi-round searches were pushing real requests past 30+ seconds.
        [{ type: "web_search_20250305", name: "web_search", max_uses: 1 }],
        system,
        "meals"
      );
      const parsed = extractJSON(text);
      if (!Array.isArray(parsed.places) || parsed.places.length === 0) throw new Error("No places came back — try a more specific location.");
      const places = parsed.places.sort((a, b) => (a.distanceKm ?? 999) - (b.distanceKm ?? 999));
      const bestIdx = scoreBestMeal(places, g);
      setMealResults(places.map((p, i) => ({ ...p, isBestValue: i === bestIdx })));
    } catch (e) {
      setMealError(e.message && e.message !== "No JSON found in response" && e.message !== "Incomplete JSON in response"
        ? e.message
        : "Couldn't find nearby places just now — try a more specific location (suburb or city), or try again.");
    }
    onUsageChange?.();
    setFindingMeals(false);
  };

  const useDeviceLocation = () => {
    setMealError(null);
    if (!navigator.geolocation) {
      setMealError("Location isn't available on this device — type a suburb or city instead.");
      return;
    }
    setFindingMeals(true);
    navigator.geolocation.getCurrentPosition(
      (pos) => findNearbyMeals(`latitude ${pos.coords.latitude}, longitude ${pos.coords.longitude}`),
      () => { setFindingMeals(false); setMealError("Location permission denied — type a suburb or city instead."); }
    );
  };

  return (
    <div style={{ padding: "24px 18px" }}>
      <div className="disp" style={{ fontSize: 26, marginBottom: 4 }}>Nutrition</div>
      <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 12 }}>Daily target: {targets.calories} kcal · {targets.protein}g protein</div>

      <button className="atlas-btn" style={{ width: "100%", marginBottom: 16, padding: 13 }} onClick={() => setScannerOpen(true)}>
        <Camera size={16} style={{ verticalAlign: -3, marginRight: 7 }} /> Scan Food
      </button>
      {scannerOpen && (isPremium ? (
        <FoodScanner onAdd={onAdd} onClose={() => setScannerOpen(false)} />
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Paywall feature="scanner" onUpgrade={onUpgrade} />
          <button onClick={() => setScannerOpen(false)} className="mono" style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11 }}>Maybe later</button>
        </div>
      ))}

      {/* Hidden from assistive tech and keyboard focus while the scanner dialog is open, so
          screen readers and Tab navigation can't reach content buried behind it. */}
      <div ref={backgroundRef} aria-hidden={scannerOpen || undefined}>
      <div className="atlas-card" style={{ marginBottom: 16 }}>
        {["calories", "protein", "carbs", "fat"].map((k) => (
          <div key={k} style={{ marginBottom: 8 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 11 }}>
              <span className="mono" style={{ color: "var(--ink-dim)" }}>{k.toUpperCase()}</span>
              <span className="mono">{Math.round(totals[k])} / {targets[k]}</span>
            </div>
            <div className="bar-track"><div className="bar-fill" style={{ width: `${Math.min(100, (totals[k] / targets[k]) * 100)}%`, background: "var(--brass)" }} /></div>
          </div>
        ))}
      </div>

      {!isPremium && mealsRemaining <= 0 ? (
        <div style={{ marginBottom: 16 }}><Paywall feature="meals" onUpgrade={onUpgrade} /></div>
      ) : (
      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
          <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
            <MapPin size={15} color="var(--brass)" />
            <div className="disp" style={{ fontSize: 14 }}>Meals Near You</div>
          </div>
          {!isPremium && (
            <span className="mono" style={{ fontSize: 10, color: "var(--brass)" }}>{mealsRemaining} free left</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => setMealTiming("pre")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "pre" ? "var(--brass-soft)" : "transparent", color: mealTiming === "pre" ? "var(--brass)" : "var(--ink-dim)" }}>Pre-Workout</button>
          <button onClick={() => setMealTiming("post")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "post" ? "var(--brass-soft)" : "transparent", color: mealTiming === "post" ? "var(--brass)" : "var(--ink-dim)" }}>Post-Workout</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input className="atlas-input" placeholder="Suburb or city" value={locationInput} onChange={(e) => setLocationInput(e.target.value)} />
          <button className="atlas-btn-ghost" style={{ padding: "8px 10px" }} onClick={useDeviceLocation} disabled={findingMeals} title="Use my location" aria-label="Use my current location">
            <Navigation size={14} color="var(--brass)" />
          </button>
        </div>
        <button className="atlas-btn" style={{ width: "100%" }} onClick={() => locationInput && findNearbyMeals(locationInput)} disabled={findingMeals || !locationInput}>
          {findingMeals ? <Loader2 size={14} style={{ verticalAlign: -2, marginRight: 6, animation: "spin 1s linear infinite" }} /> : <Search size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
          {findingMeals ? "Searching…" : "Find Meals"}
        </button>
        {findingMeals && <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 6, textAlign: "center" }}>Searching the web for real nearby options — can take up to 15-20 seconds.</div>}
        {mealError && <div style={{ fontSize: 11, color: "var(--rest)", marginTop: 8 }}>{mealError}</div>}
        {mealResults && (
          <div style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 10 }}>
            <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-dim)", lineHeight: 1.5, background: "var(--bg-elev2)", borderRadius: 8, padding: "6px 8px" }}>
              AI-estimated from web search, not a live/verified feed — prices, hours and menu items can be out of date. Double-check before you go.
            </div>
            {mealResults.map((p, i) => (
              <div key={i} style={{ borderTop: p.isBestValue ? "1px solid var(--good)" : "1px solid var(--line)", paddingTop: 10, background: p.isBestValue ? "rgba(126,217,87,0.06)" : "transparent", borderRadius: p.isBestValue ? 8 : 0, padding: p.isBestValue ? "10px 8px 8px" : "10px 0 0" }}>
                {p.isBestValue && (
                  <span className="pill mono" style={{ background: "var(--good)", color: "#0F2E0A", marginBottom: 5, display: "inline-block" }}>★ BEST VALUE</span>
                )}
                <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline" }}>
                  <div style={{ fontSize: 13, fontWeight: 600 }}>{p.name}</div>
                  <div style={{ display: "flex", gap: 6, flexShrink: 0 }}>
                    {p.price != null && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--good)" }}>~{p.currency || "$"}{Number(p.price).toFixed(2)}</span>}
                    {p.distanceKm != null && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--brass)" }}>{p.distanceKm < 1 ? `${Math.round(p.distanceKm * 1000)}m` : `${p.distanceKm.toFixed(1)}km`}</span>}
                  </div>
                </div>
                <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 1 }}>{p.cuisine}</div>
                <div style={{ fontSize: 13, color: "var(--steel)", marginTop: 5 }}>{p.item}</div>
                <div style={{ display: "flex", gap: 8, marginTop: 4, flexWrap: "wrap" }}>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{p.calories} kcal</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>P {p.protein}g</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>C {p.carbs}g</span>
                  <span className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>F {p.fat}g</span>
                </div>
                <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 4, lineHeight: 1.4 }}>{p.note}</div>
                <button
                  className="atlas-btn-ghost"
                  style={{ marginTop: 6, padding: "5px 10px", fontSize: 10 }}
                  onClick={() => onAdd({ id: uid(), date: todayStr(), name: `${p.item} (${p.name})`, calories: p.calories || 0, protein: p.protein || 0, carbs: p.carbs || 0, fat: p.fat || 0 })}
                >
                  <Plus size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Log this meal
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}

      <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Quick Add</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {QUICK_FOODS.map((f) => (
          <button key={f.name} onClick={() => onAdd({ id: uid(), date: todayStr(), ...f })}
            className="pill" style={{ background: "var(--bg-elev2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>
            + {f.name}
          </button>
        ))}
      </div>

      {favorites.length > 0 && (
        <>
          <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Favorites</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {favorites.map((f) => (
              <button key={f.name} onClick={() => onAdd({ id: uid(), date: todayStr(), ...f })}
                className="pill" style={{ background: "var(--brass-soft)", border: "1px solid var(--brass)", cursor: "pointer", color: "var(--brass)" }}>
                <Star size={10} style={{ verticalAlign: -1 }} /> {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {recentFoods.length > 0 && (
        <>
          <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Recent</div>
          <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
            {recentFoods.map((f) => (
              <button key={f.id} onClick={() => onAdd({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })}
                className="pill" style={{ background: "var(--bg-elev2)", border: "1px solid var(--line)", cursor: "pointer", color: "var(--ink)" }}>
                + {f.name}
              </button>
            ))}
          </div>
        </>
      )}

      {yesterday.length > 0 && (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 16 }} onClick={copyYesterday}>
          <Copy size={13} style={{ verticalAlign: -2, marginRight: 6 }} /> Copy Yesterday's Log ({yesterday.length} item{yesterday.length === 1 ? "" : "s"})
        </button>
      )}

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Log Custom Food</div>
        <div style={{ display: "flex", gap: 6, marginBottom: 6 }}>
          <input className="atlas-input" placeholder="e.g. chicken rice bowl" value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))} aria-label="Food description" />
          <button className="atlas-btn-ghost" style={{ padding: "8px 10px" }} onClick={estimate} disabled={estimating} aria-label="Estimate macros with AI" title="Estimate macros with AI">
            <Sparkles size={14} color="var(--brass)" />
          </button>
        </div>
        {estimating && <div style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 6 }}>Estimating macros…</div>}
        <div style={{ display: "flex", gap: 6 }}>
          <input className="atlas-input" type="number" placeholder="kcal" value={form.calories} onChange={(e) => setForm((f) => ({ ...f, calories: e.target.value }))} aria-label="Calories" />
          <input className="atlas-input" type="number" placeholder="protein" value={form.protein} onChange={(e) => setForm((f) => ({ ...f, protein: e.target.value }))} aria-label="Protein grams" />
          <input className="atlas-input" type="number" placeholder="carbs" value={form.carbs} onChange={(e) => setForm((f) => ({ ...f, carbs: e.target.value }))} aria-label="Carbs grams" />
          <input className="atlas-input" type="number" placeholder="fat" value={form.fat} onChange={(e) => setForm((f) => ({ ...f, fat: e.target.value }))} aria-label="Fat grams" />
        </div>
        <button className="atlas-btn" style={{ width: "100%", marginTop: 8 }} onClick={submit}>Add to Log</button>
      </div>

      <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Today</div>
      <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
        {today.length === 0 && <div style={{ fontSize: 12, color: "var(--ink-dim)" }}>Nothing logged yet today.</div>}
        {today.map((f) => {
          const isFav = favorites.some((fv) => fv.name === f.name);
          return (
          <div key={f.id} className="atlas-card" style={{ padding: 10 }}>
            {editingId === f.id ? (
              <div>
                <input className="atlas-input" style={{ marginBottom: 6 }} value={editForm.name} onChange={(e) => setEditForm((v) => ({ ...v, name: e.target.value }))} aria-label="Edit food name" />
                <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                  <input className="atlas-input" type="number" placeholder="kcal" value={editForm.calories} onChange={(e) => setEditForm((v) => ({ ...v, calories: e.target.value }))} aria-label="Edit calories" />
                  <input className="atlas-input" type="number" placeholder="protein" value={editForm.protein} onChange={(e) => setEditForm((v) => ({ ...v, protein: e.target.value }))} aria-label="Edit protein" />
                  <input className="atlas-input" type="number" placeholder="carbs" value={editForm.carbs} onChange={(e) => setEditForm((v) => ({ ...v, carbs: e.target.value }))} aria-label="Edit carbs" />
                  <input className="atlas-input" type="number" placeholder="fat" value={editForm.fat} onChange={(e) => setEditForm((v) => ({ ...v, fat: e.target.value }))} aria-label="Edit fat" />
                </div>
                <div style={{ display: "flex", gap: 8 }}>
                  <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
                  <button className="atlas-btn" style={{ flex: 1 }} onClick={saveEdit}>Save</button>
                </div>
              </div>
            ) : (
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                <div>
                  <div style={{ fontSize: 13 }}>{f.name}</div>
                  <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)" }}>{f.calories}kcal · P{f.protein} C{f.carbs} F{f.fat}</div>
                </div>
                <div style={{ display: "flex", gap: 4, flexShrink: 0 }}>
                  <button onClick={() => onToggleFavorite(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={isFav ? `Remove ${f.name} from favorites` : `Add ${f.name} to favorites`}>
                    <Star size={14} color={isFav ? "var(--brass)" : "var(--ink-dim)"} fill={isFav ? "var(--brass)" : "none"} />
                  </button>
                  <button onClick={() => duplicateFood(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Duplicate ${f.name}`}>
                    <Copy size={14} color="var(--ink-dim)" />
                  </button>
                  <button onClick={() => startEdit(f)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Edit ${f.name}`}>
                    <Pencil size={14} color="var(--ink-dim)" />
                  </button>
                  <button onClick={() => onDelete(f.id)} style={{ background: "none", border: "none", cursor: "pointer", padding: 4 }} aria-label={`Delete ${f.name}`}>
                    <Trash2 size={14} color="var(--ink-dim)" />
                  </button>
                </div>
              </div>
            )}
          </div>
          );
        })}
      </div>
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* Password reset                                                       */
/* ------------------------------------------------------------------ */

// Shown instead of the normal app when Supabase fires PASSWORD_RECOVERY (the user followed a
// reset-password email link). The temporary recovery session is only ever used to call
// updateUser({ password }) — never to read/show the rest of their account.
function ResetPasswordScreen({ onDone }) {
  const [password, setPassword] = useState("");
  const [confirm, setConfirm] = useState("");
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [done, setDone] = useState(false);

  const submit = async (e) => {
    e.preventDefault();
    setError(null);
    if (password.length < 6) { setError("Password must be at least 6 characters."); return; }
    if (password !== confirm) { setError("Passwords don't match."); return; }
    setLoading(true);
    const { error: err } = await supabase.auth.updateUser({ password });
    setLoading(false);
    if (err) { setError(err.message); return; }
    setDone(true);
  };

  return (
    <div className="atlas-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
      <div className="atlas-card" style={{ width: "100%", maxWidth: 360 }}>
        <div className="disp" style={{ fontSize: 20, marginBottom: 4 }}>Set a new password</div>
        {done ? (
          <>
            <div className="mono" style={{ color: "var(--good)", fontSize: 12, background: "rgba(126,217,87,0.1)", border: "1px solid var(--good)", borderRadius: 8, padding: "10px 12px", marginTop: 12, lineHeight: 1.6 }}>
              Password updated. Continue into your account below.
            </div>
            <button onClick={onDone} className="atlas-btn" style={{ width: "100%", marginTop: 14 }}>Continue</button>
          </>
        ) : (
          <form onSubmit={submit} style={{ display: "flex", flexDirection: "column", gap: 10, marginTop: 14 }}>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>NEW PASSWORD</div>
              <input className="atlas-input" type="password" autoComplete="new-password" value={password} onChange={(e) => setPassword(e.target.value)} minLength={6} required autoFocus />
            </div>
            <div>
              <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginBottom: 4 }}>CONFIRM NEW PASSWORD</div>
              <input className="atlas-input" type="password" autoComplete="new-password" value={confirm} onChange={(e) => setConfirm(e.target.value)} minLength={6} required />
            </div>
            {error && (
              <div className="mono" style={{ color: "var(--rest)", fontSize: 12, background: "rgba(255,92,122,0.1)", border: "1px solid var(--rest)", borderRadius: 8, padding: "8px 10px" }}>{error}</div>
            )}
            <button type="submit" className="atlas-btn" disabled={loading || !password || !confirm} style={{ marginTop: 6, display: "flex", alignItems: "center", justifyContent: "center", gap: 8 }}>
              {loading ? <Loader2 size={16} style={{ animation: "spin 1s linear infinite" }} /> : "Update Password"}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}

/* ------------------------------------------------------------------ */
/* App root                                                             */
/* ------------------------------------------------------------------ */

export default function App() {
  // undefined = auth state not checked yet, null = logged out, object = logged in.
  // Named authUser (not "session") to avoid colliding with the in-progress workout `session` state below.
  const [authUser, setAuthUser] = useState(undefined);
  const [loaded, setLoaded] = useState(false);
  const [profile, setProfile] = useState(null);
  const [workouts, setWorkouts] = useState([]);
  const [nutrition, setNutrition] = useState([]);
  const [weightlog, setWeightlog] = useState([]);
  const [customExercises, setCustomExercises] = useState([]);
  const [favorites, setFavorites] = useState([]);
  const [tab, setTab] = useState("dashboard");
  const [session, setSession] = useState(null);
  const [finishingWorkout, setFinishingWorkout] = useState(false);
  const [finishError, setFinishError] = useState(null);
  // A ref, not just the `finishingWorkout` state, guards finishWorkout against a genuine
  // double-click: two click events dispatched in the same tick both close over the same
  // pre-update `finishingWorkout` value (React only commits the state update — and thus the
  // button's `disabled` attribute — between event handler invocations, not necessarily before a
  // second synchronous click is processed). A ref updates immediately and outside any render
  // cycle, so the second call's read of it is guaranteed to see the first call's write.
  const finishingRef = useRef(false);
  // undefined = not checked yet, null = no row (never subscribed), object = { status, current_period_end }.
  // Never set directly from checkout success — only the Stripe webhook (server-side) is trusted
  // to write this, so a user can't just flip themselves to "active" from the browser.
  const [subscription, setSubscription] = useState(undefined);
  // Free-trial counters for Coach / Meals Near You ({ coach, meals }, each 0-5). Read-only from
  // here — the real count lives server-side in api/claude.js, this is just for display/local gating.
  const [usage, setUsage] = useState({ coach: 0, meals: 0 });
  // Surfaces a real error instead of silently doing nothing when checkout/billing-portal
  // creation fails (e.g. network hiccup, or — as with a hand-seeded account — no Stripe
  // customer on file yet).
  const [billingError, setBillingError] = useState(null);
  const [billingLoading, setBillingLoading] = useState(null); // null | "checkout" | "portal"
  const [showProfile, setShowProfile] = useState(false);
  const [deleteAccountLoading, setDeleteAccountLoading] = useState(false);
  const [deleteAccountError, setDeleteAccountError] = useState(null);
  // True while the user has followed a password-reset email link — Supabase signs them into a
  // temporary recovery session and fires the "PASSWORD_RECOVERY" auth event rather than a normal
  // sign-in. Must gate the whole app behind a "set your new password" screen instead of dropping
  // them straight into their account on that temporary session.
  const [passwordRecovery, setPasswordRecovery] = useState(false);

  useEffect(() => {
    supabase.auth.getSession().then(({ data: { session } }) => setAuthUser(session?.user ?? null));
    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === "PASSWORD_RECOVERY") setPasswordRecovery(true);
      setAuthUser(session?.user ?? null);
      if (!session) setLoaded(false);
    });
    return () => listener.subscription.unsubscribe();
  }, []);

  useEffect(() => {
    if (!authUser) return;
    (async () => {
      const [p, w, n, wl, sess, ce, fav] = await Promise.all([
        loadKey(KEYS.profile), loadKey(KEYS.workouts), loadKey(KEYS.nutrition), loadKey(KEYS.weightlog), loadKey(KEYS.session), loadKey(KEYS.customExercises), loadKey(KEYS.favorites),
      ]);
      // Each array-shaped key is validated item-by-item before being trusted — a corrupted or
      // partially-written row (or a schema left over from an old app version) degrades to
      // "drop the bad items" instead of handing a malformed item into code downstream that
      // assumes every item has certain fields and crashing the whole app. (Verified live: an
      // exercise object missing `.name` crashed Train's search via `e.name.toLowerCase()`.)
      const workouts = sanitizeList(w, isValidWorkout);
      const nutrition = sanitizeList(n, isValidFoodEntry);
      const weightlog = sanitizeList(wl, isValidWeightEntry);
      const customExercises = sanitizeList(ce, isValidCustomExercise);
      const favorites = sanitizeList(fav, isValidFavorite);
      if (p && typeof p === "object") setProfile(p);
      setWorkouts(workouts);
      setNutrition(nutrition);
      setWeightlog(weightlog);
      // Defense in depth against the stale-session bug: if a session was already saved into
      // history (its id shows up in `workouts`), it's a leftover from a completed workout that
      // never got cleared, not a real in-progress one — discard it and finish clearing the row.
      // isValidSession also rejects malformed/truncated session data (missing fields, wrong
      // types) so a corrupted row can't crash Train when it reads session.exercises/.startedAt.
      const validSess = isValidSession(sess) ? sess : null;
      const stale = validSess && isStaleSession(validSess, workouts);
      if (validSess && !stale) { setSession(validSess); setTab("train"); }
      else if (validSess && stale) { saveKey(KEYS.session, null); }
      else if (sess) { saveKey(KEYS.session, null); } // sess existed but failed validation — clear the corrupt row
      setCustomExercises(customExercises);
      setFavorites(favorites);
      setLoaded(true);
    })();
  }, [authUser]);

  const refreshSubscription = async () => {
    if (!authUser) return null;
    const { data } = await supabase.from("subscriptions").select("status, current_period_end, stripe_customer_id").eq("user_id", authUser.id).maybeSingle();
    setSubscription(data || null);
    return data || null;
  };

  const refreshUsage = async () => {
    const { data: { session: authSession } } = await supabase.auth.getSession();
    if (!authSession) return;
    try {
      const res = await fetch("/api/usage", { headers: { Authorization: `Bearer ${authSession.access_token}` } });
      if (res.ok) setUsage(await res.json());
    } catch (e) { /* leave last-known usage in place */ }
  };

  useEffect(() => {
    if (!authUser) { setSubscription(undefined); setUsage({ coach: 0, meals: 0 }); return; }
    refreshSubscription();
    refreshUsage();
  }, [authUser]);

  // After returning from Stripe Checkout, the webhook that actually activates the subscription
  // may take a moment to land — poll briefly instead of showing stale "not premium" state.
  useEffect(() => {
    const params = new URLSearchParams(window.location.search);
    if (params.get("checkout") !== "success" || !authUser) return;
    window.history.replaceState(null, "", window.location.pathname);
    let attempts = 0;
    let fired = false;
    const interval = setInterval(async () => {
      attempts++;
      const data = await refreshSubscription();
      if (!fired && data && (data.status === "active" || data.status === "trialing")) {
        fired = true;
        logEvent("subscription_started", { status: data.status });
        clearInterval(interval);
      }
      if (attempts >= 6) clearInterval(interval); // ~12s of polling, then give up quietly
    }, 2000);
    return () => clearInterval(interval);
  }, [authUser]);

  const isPremium = subscription && (subscription.status === "active" || subscription.status === "trialing");
  // Premium with no Stripe customer on file can only happen from a manually-granted (demo/comp)
  // entitlement — a real subscription always gets a stripe_customer_id from the checkout webhook.
  // Distinguishing this avoids the confusing "Premium Active" + "No subscription found for this
  // account" combo that shows up the moment such an account taps Manage Billing.
  const isDemoEntitlement = !!(isPremium && !subscription.stripe_customer_id);

  const startCheckout = async () => {
    setBillingError(null);
    setBillingLoading("checkout");
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-checkout-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      setBillingError(data.error || "Couldn't start checkout — try again.");
    } catch (e) {
      setBillingError("Couldn't reach the server — check your connection and try again.");
    }
    setBillingLoading(null);
  };

  const openBillingPortal = async () => {
    setBillingError(null);
    setBillingLoading("portal");
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/create-portal-session", {
        method: "POST",
        headers: { "Content-Type": "application/json", Authorization: `Bearer ${authSession.access_token}` },
      });
      const data = await res.json();
      if (data.url) { window.location.href = data.url; return; }
      setBillingError(data.error || "Couldn't open billing management — try again.");
    } catch (e) {
      setBillingError("Couldn't reach the server — check your connection and try again.");
    }
    setBillingLoading(null);
  };

  const logOut = async () => {
    await supabase.auth.signOut();
    setProfile(null);
    setWorkouts([]);
    setNutrition([]);
    setWeightlog([]);
    setCustomExercises([]);
    setFavorites([]);
    setSession(null);
    setSubscription(undefined);
    setTab("dashboard");
  };

  // Auto-save the in-progress session on every change so a page reload mid-workout never loses logged sets.
  useEffect(() => {
    if (!loaded) return;
    if (session) saveKey(KEYS.session, session);
    else saveKey(KEYS.session, null);
  }, [session, loaded]);

  const completeOnboarding = async (form) => {
    const targets = computeTargets(form);
    const newProfile = { ...form, targets };
    setProfile(newProfile);
    await saveKey(KEYS.profile, newProfile);
    const wl = [{ date: todayStr(), weight: form.weightKg }];
    setWeightlog(wl);
    await saveKey(KEYS.weightlog, wl);
    logEvent("onboarding_completed", { goal: form.goal, experience: form.experience, trainingDays: form.trainingDays });
  };

  // Idempotent by construction: once `session` is cleared, a second call (e.g. a double-click
  // on Finish before the first click's state update commits) is a no-op instead of a duplicate
  // history entry. If the save itself fails, the active session is left untouched — nothing is
  // lost, and the caller gets a retryable error instead of a silently-dropped workout.
  const finishWorkout = async (s) => {
    if (finishingRef.current || !session) return null;
    finishingRef.current = true;
    setFinishingWorkout(true);
    setFinishError(null);
    const completed = { ...s, completedAt: new Date().toISOString() };
    const next = [...workouts, completed];
    const savedWorkout = await saveKey(KEYS.workouts, next);
    if (!savedWorkout) {
      setFinishError("Couldn't save your workout — check your connection and try again. Nothing was lost.");
      finishingRef.current = false;
      setFinishingWorkout(false);
      return null;
    }
    setWorkouts(next);
    if (profile?.activePlan && s.plannedDayIndex != null && s.plannedDayIndex === profile.activePlan.currentDayIndex) {
      const nextIndex = (profile.activePlan.currentDayIndex + 1) % profile.activePlan.days.length;
      const updatedProfile = { ...profile, activePlan: { ...profile.activePlan, currentDayIndex: nextIndex } };
      if (await saveKey(KEYS.profile, updatedProfile)) setProfile(updatedProfile);
    }
    setSession(null);
    await saveKey(KEYS.session, null);
    finishingRef.current = false;
    setFinishingWorkout(false);
    setTab("dashboard");
    logEvent("workout_completed", {
      exerciseCount: completed.exercises.length,
      setCount: completed.exercises.reduce((n, e) => n + e.sets.length, 0),
      planned: completed.plannedDayIndex != null,
    });
    return completed;
  };

  const discardWorkout = async () => {
    setSession(null);
    await saveKey(KEYS.session, null);
    setTab("dashboard");
  };

  // Centralizes both "start today's scheduled workout" (Home/Train, when an active plan exists)
  // and "start an empty workout" (freeform) so both paths share one idempotency guard — starting
  // never clobbers an already-active session.
  const startWorkout = (plannedDayIndex) => {
    if (session) { setTab("train"); return; }
    const plan = profile?.activePlan;
    const day = plannedDayIndex != null && plan?.days ? plan.days[plannedDayIndex] : null;
    const exercises = day
      ? day.muscleGroups.flatMap((mg) => mg.exercises.map((e) => ({
          name: e.name, sets: [], supersetWith: null, targetSets: e.sets, targetReps: e.reps,
        })))
      : [];
    setSession({
      id: uid(), date: todayStr(), startedAt: Date.now(), restEndAt: null, exercises,
      planDayName: day?.day || null, plannedDayIndex: plannedDayIndex ?? null,
    });
    setTab("train");
    logEvent("workout_started", { planned: plannedDayIndex != null });
  };

  const addFood = async (f) => {
    const next = [...nutrition, f];
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
    logEvent("food_logged", { count: 1 });
  };
  // Adds several entries as one state update — copyYesterday calling addFood in a loop would have
  // each call close over the same stale `nutrition`, so every add but the last would be lost.
  const addFoods = async (items) => {
    const next = [...nutrition, ...items];
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
    logEvent("food_logged", { count: items.length });
  };
  const deleteFood = async (id) => {
    const next = nutrition.filter((f) => f.id !== id);
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
  };
  const editFood = async (id, patch) => {
    const next = nutrition.map((f) => (f.id === id ? { ...f, ...patch } : f));
    setNutrition(next);
    await saveKey(KEYS.nutrition, next);
  };
  const toggleFavorite = async (food) => {
    const exists = favorites.some((f) => f.name === food.name);
    const next = exists ? favorites.filter((f) => f.name !== food.name) : [...favorites, { name: food.name, calories: food.calories, protein: food.protein, carbs: food.carbs, fat: food.fat }];
    setFavorites(next);
    await saveKey(KEYS.favorites, next);
  };
  const logWeight = async (weight) => {
    const next = [...weightlog, { date: todayStr(), weight }];
    setWeightlog(next);
    await saveKey(KEYS.weightlog, next);
  };

  const addCustomExercise = async (ex) => {
    const next = [...customExercises, ex];
    setCustomExercises(next);
    await saveKey(KEYS.customExercises, next);
    return ex;
  };

  const updateProfile = async (patch) => {
    const next = { ...profile, ...patch };
    setProfile(next);
    await saveKey(KEYS.profile, next);
  };

  const deleteAccount = async () => {
    setDeleteAccountLoading(true);
    setDeleteAccountError(null);
    try {
      const { data: { session: authSession } } = await supabase.auth.getSession();
      const res = await fetch("/api/delete-account", {
        method: "POST",
        headers: { Authorization: `Bearer ${authSession.access_token}` },
      });
      const data = await res.json();
      if (!res.ok) {
        setDeleteAccountError(data.error || "Couldn't delete your account — try again.");
        setDeleteAccountLoading(false);
        return;
      }
      await supabase.auth.signOut();
      setShowProfile(false);
      setProfile(null);
      setWorkouts([]);
      setNutrition([]);
      setWeightlog([]);
      setCustomExercises([]);
      setFavorites([]);
      setSession(null);
      setSubscription(undefined);
      setTab("dashboard");
    } catch (e) {
      setDeleteAccountError("Couldn't reach the server — check your connection and try again.");
    }
    setDeleteAccountLoading(false);
  };

  if (passwordRecovery) {
    return (
      <>
        <GlobalStyle />
        <ResetPasswordScreen onDone={() => setPasswordRecovery(false)} />
      </>
    );
  }

  if (authUser === undefined || (authUser && !loaded)) {
    return (
      <div className="atlas-root" style={{ display: "flex", alignItems: "center", justifyContent: "center", height: 300 }}>
        <GlobalStyle />
        <Loader2 size={20} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />
      </div>
    );
  }

  if (!authUser) {
    return (
      <>
        <GlobalStyle />
        <AuthScreen />
      </>
    );
  }

  if (!profile) {
    return (
      <>
        <GlobalStyle />
        <Onboarding onComplete={completeOnboarding} />
      </>
    );
  }

  const navItems = [
    { id: "dashboard", label: "Home", icon: LayoutDashboard },
    { id: "train", label: "Train", icon: Dumbbell },
    { id: "coach", label: "Coach", icon: MessageCircle },
    { id: "nutrition", label: "Food", icon: UtensilsCrossed },
    { id: "progress", label: "Progress", icon: TrendingUp },
  ];

  return (
    <div className="atlas-root">
      <GlobalStyle />
      {showProfile ? (
        <Profile
          profile={profile} authUser={authUser} workouts={workouts} nutrition={nutrition} weightlog={weightlog} customExercises={customExercises}
          isPremium={isPremium} isDemoEntitlement={isDemoEntitlement} onUpdateProfile={updateProfile} onManageBilling={openBillingPortal} onUpgrade={startCheckout}
          billingLoading={billingLoading} billingError={billingError} onLogOut={logOut}
          onDeleteAccount={deleteAccount} deleteAccountLoading={deleteAccountLoading} deleteAccountError={deleteAccountError}
          onClose={() => setShowProfile(false)}
        />
      ) : (
        <>
          {tab === "dashboard" && <Dashboard profile={profile} workouts={workouts} nutrition={nutrition} weightlog={weightlog} customExercises={customExercises} onNav={setTab} onLogWeight={logWeight} onLogOut={logOut} isPremium={isPremium} isDemoEntitlement={isDemoEntitlement} onUpgrade={startCheckout} onManageBilling={openBillingPortal} billingError={billingError} billingLoading={billingLoading} session={session} onStartWorkout={startWorkout} onOpenProfile={() => setShowProfile(true)} />}
          {tab === "train" && <Train profile={profile} workouts={workouts} session={session} setSession={setSession} onFinish={finishWorkout} onDiscard={discardWorkout} onStartWorkout={startWorkout} finishingWorkout={finishingWorkout} finishError={finishError} customExercises={customExercises} onAddCustomExercise={addCustomExercise} />}
          {tab === "coach" && <Coach profile={profile} workouts={workouts} onUpdateProfile={updateProfile} isPremium={isPremium} onUpgrade={startCheckout} usage={usage} onUsageChange={refreshUsage} />}
          {tab === "nutrition" && <Nutrition profile={profile} nutrition={nutrition} onAdd={addFood} onAddMany={addFoods} onDelete={deleteFood} onEdit={editFood} favorites={favorites} onToggleFavorite={toggleFavorite} isPremium={isPremium} onUpgrade={startCheckout} usage={usage} onUsageChange={refreshUsage} />}
          {tab === "progress" && (
            <Suspense fallback={<div style={{ padding: "24px 18px", display: "flex", justifyContent: "center" }}><Loader2 size={20} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} /></div>}>
              <Progress profile={profile} workouts={workouts} weightlog={weightlog} />
            </Suspense>
          )}

          <nav className="atlas-nav">
            {navItems.map((n) => (
              <button key={n.id} className={`atlas-nav-item ${tab === n.id ? "active" : ""}`} onClick={() => setTab(n.id)}>
                <n.icon size={19} />
                {n.label}
              </button>
            ))}
          </nav>
        </>
      )}
    </div>
  );
}
