// Home meal ideas matched to whatever macros are left for the day. Fully deterministic — a fixed
// recipe library plus a scoring rule — so it's instant, works offline, and costs nothing per use,
// unlike the AI-backed "Meals Near You" search. Macros are per listed serving and rounded from
// standard nutrition-database values; portions can be scaled 0.5x-1.5x to fit what's left.

export const HOME_MEALS = [
  // Breakfast
  { id: "egg-white-omelette", name: "Egg white & spinach omelette with toast", slot: "breakfast", veg: true, calories: 320, protein: 32, carbs: 28, fat: 8, ingredients: ["6 egg whites", "1 whole egg", "Handful of spinach", "1 slice wholegrain toast"] },
  { id: "protein-oats", name: "Protein oats with berries", slot: "breakfast", veg: true, calories: 450, protein: 35, carbs: 58, fat: 9, ingredients: ["60g oats", "1 scoop whey", "100g mixed berries", "Milk or water"] },
  { id: "greek-yogurt-bowl", name: "Greek yogurt bowl with granola", slot: "breakfast", veg: true, calories: 380, protein: 30, carbs: 45, fat: 9, ingredients: ["250g low-fat Greek yogurt", "30g granola", "1 banana, sliced", "Drizzle of honey"] },
  { id: "eggs-avocado-toast", name: "Scrambled eggs on avocado toast", slot: "breakfast", veg: true, calories: 480, protein: 24, carbs: 34, fat: 27, ingredients: ["3 eggs", "Half an avocado", "2 slices sourdough"] },
  { id: "cottage-cheese-pancakes", name: "Cottage cheese pancakes", slot: "breakfast", veg: true, calories: 420, protein: 33, carbs: 44, fat: 11, ingredients: ["150g cottage cheese", "2 eggs", "40g oats", "Cinnamon"] },
  { id: "smoked-salmon-bagel", name: "Smoked salmon bagel", slot: "breakfast", veg: false, calories: 430, protein: 28, carbs: 50, fat: 12, ingredients: ["1 wholemeal bagel", "80g smoked salmon", "30g light cream cheese", "Capers and red onion"] },
  // Lunch / dinner
  { id: "chicken-rice-bowl", name: "Chicken, rice & veg bowl", slot: "main", veg: false, calories: 560, protein: 48, carbs: 62, fat: 11, ingredients: ["170g chicken breast", "1 cup cooked rice", "Mixed stir-fry veg", "Soy sauce"] },
  { id: "beef-chilli", name: "Lean beef chilli with beans", slot: "main", veg: false, calories: 540, protein: 44, carbs: 48, fat: 17, ingredients: ["150g 5% lean mince", "Half a tin kidney beans", "Chopped tomatoes", "Onion, garlic, chilli spice"] },
  { id: "salmon-potatoes", name: "Baked salmon, potatoes & greens", slot: "main", veg: false, calories: 590, protein: 38, carbs: 45, fat: 27, ingredients: ["150g salmon fillet", "200g baby potatoes", "Green beans or broccoli"] },
  { id: "turkey-wrap", name: "Turkey & salad wrap", slot: "main", veg: false, calories: 410, protein: 35, carbs: 38, fat: 12, ingredients: ["100g sliced turkey breast", "1 large tortilla", "Salad leaves, tomato", "Light mayo or mustard"] },
  { id: "tuna-pasta", name: "Tuna & tomato pasta", slot: "main", veg: false, calories: 520, protein: 40, carbs: 68, fat: 8, ingredients: ["1 tin tuna in water", "80g dry pasta", "Passata, garlic, basil"] },
  { id: "prawn-stir-fry", name: "Prawn & vegetable noodle stir-fry", slot: "main", veg: false, calories: 450, protein: 36, carbs: 52, fat: 10, ingredients: ["150g prawns", "1 nest egg noodles", "Mixed stir-fry veg", "Soy, ginger, garlic"] },
  { id: "chicken-salad", name: "Grilled chicken Caesar-style salad", slot: "main", veg: false, calories: 380, protein: 45, carbs: 12, fat: 17, ingredients: ["170g chicken breast", "Romaine lettuce", "15g parmesan", "Light Caesar dressing"] },
  { id: "steak-sweet-potato", name: "Steak with sweet potato & salad", slot: "main", veg: false, calories: 610, protein: 46, carbs: 50, fat: 24, ingredients: ["180g sirloin steak", "1 medium sweet potato", "Side salad"] },
  { id: "turkey-meatballs", name: "Turkey meatballs with spaghetti", slot: "main", veg: false, calories: 620, protein: 47, carbs: 72, fat: 14, ingredients: ["150g turkey mince", "80g dry spaghetti", "Tomato sauce"] },
  { id: "white-fish-tacos", name: "White fish tacos with slaw", slot: "main", veg: false, calories: 470, protein: 38, carbs: 46, fat: 14, ingredients: ["170g cod or basa", "3 small corn tortillas", "Cabbage slaw", "Lime, yogurt sauce"] },
  { id: "tofu-stir-fry", name: "Crispy tofu stir-fry with rice", slot: "main", veg: true, calories: 520, protein: 28, carbs: 62, fat: 17, ingredients: ["200g firm tofu", "1 cup cooked rice", "Broccoli, peppers", "Soy, garlic, chilli"] },
  { id: "lentil-dahl", name: "Red lentil dahl with yogurt", slot: "main", veg: true, calories: 480, protein: 27, carbs: 70, fat: 9, ingredients: ["80g dry red lentils", "Onion, garlic, curry spices", "Chopped tomatoes", "100g Greek yogurt"] },
  { id: "bean-quinoa-bowl", name: "Black bean & quinoa burrito bowl", slot: "main", veg: true, calories: 540, protein: 26, carbs: 78, fat: 13, ingredients: ["Half a tin black beans", "60g dry quinoa", "Salsa, corn, lettuce", "30g cheese"] },
  { id: "halloumi-couscous", name: "Halloumi & roasted veg couscous", slot: "main", veg: true, calories: 590, protein: 27, carbs: 58, fat: 27, ingredients: ["80g halloumi", "60g dry couscous", "Roasted peppers, courgette", "Lemon"] },
  { id: "egg-fried-rice", name: "High-protein egg fried rice", slot: "main", veg: true, calories: 500, protein: 30, carbs: 60, fat: 14, ingredients: ["3 eggs + 3 egg whites", "1 cup cooked rice", "Peas, spring onion", "Soy sauce"] },
  // Snacks
  { id: "protein-shake-banana", name: "Protein shake & banana", slot: "snack", veg: true, calories: 230, protein: 26, carbs: 30, fat: 2, ingredients: ["1 scoop whey", "1 banana", "Water or skim milk"] },
  { id: "cottage-cheese-fruit", name: "Cottage cheese with pineapple", slot: "snack", veg: true, calories: 190, protein: 22, carbs: 18, fat: 3, ingredients: ["200g cottage cheese", "80g pineapple"] },
  { id: "tuna-crackers", name: "Tuna on rice cakes", slot: "snack", veg: false, calories: 200, protein: 26, carbs: 18, fat: 2, ingredients: ["1 tin tuna in water", "3 rice cakes", "Light mayo, pepper"] },
  { id: "skyr-almonds", name: "Skyr with almonds", slot: "snack", veg: true, calories: 240, protein: 22, carbs: 14, fat: 11, ingredients: ["170g skyr or Greek yogurt", "15g almonds"] },
  { id: "boiled-eggs-apple", name: "Boiled eggs & an apple", slot: "snack", veg: true, calories: 240, protein: 13, carbs: 25, fat: 10, ingredients: ["2 boiled eggs", "1 apple"] },
  { id: "jerky-fruit", name: "Beef jerky & fruit", slot: "snack", veg: false, calories: 180, protein: 18, carbs: 24, fat: 2, ingredients: ["40g beef jerky", "1 orange or a handful of grapes"] },
  { id: "pb-toast", name: "Peanut butter toast", slot: "snack", veg: true, calories: 290, protein: 11, carbs: 28, fat: 15, ingredients: ["1 slice wholegrain toast", "1 tbsp peanut butter", "Half a banana"] },
];

const SCALES = [0.5, 0.75, 1, 1.25, 1.5];

// Which slot fits right now — breakfast in the morning, mains through the day, snacks late, so a
// 9pm suggestion isn't a full plate of pasta.
export function mealSlotsForHour(hour) {
  if (hour < 11) return ["breakfast", "snack"];
  if (hour < 21) return ["main", "snack"];
  return ["snack"];
}

export function scaleMeal(meal, scale) {
  return {
    ...meal,
    scale,
    calories: Math.round(meal.calories * scale),
    protein: Math.round(meal.protein * scale),
    carbs: Math.round(meal.carbs * scale),
    fat: Math.round(meal.fat * scale),
  };
}

// Lower is better. Overshooting any macro is penalized much harder than leaving room, and
// protein gets extra weight since that's the macro people most often come up short on. Calories
// should land near what's left (or near one meal's worth of it when a lot is left).
function fitPenalty(m, remaining, calorieAim) {
  const over = (v, cap) => Math.max(0, v - Math.max(cap, 0));
  const overPenalty =
    (over(m.calories, remaining.calories) / 100) * 4 +
    (over(m.protein, remaining.protein) / 10) * 1 +
    (over(m.carbs, remaining.carbs) / 10) * 2 +
    (over(m.fat, remaining.fat) / 5) * 2;
  const calMiss = Math.abs(m.calories - calorieAim) / Math.max(calorieAim, 1);
  // Share of the remaining protein this meal covers vs its share of remaining calories — a meal
  // that covers more protein than calories is exactly what a protein-short day needs.
  const proteinShare = remaining.protein > 0 ? Math.min(m.protein / remaining.protein, 1) : 0;
  const calShare = remaining.calories > 0 ? Math.min(m.calories / remaining.calories, 1) : 1;
  const proteinBonus = remaining.protein > 0 ? proteinShare - calShare : 0;
  return overPenalty + calMiss * 2 - proteinBonus * 1.5;
}

/**
 * Picks home meal ideas that fit what's left of today's targets.
 * @param {{calories:number, protein:number, carbs:number, fat:number}} remaining - target minus eaten (may be negative)
 * @param {{hour?:number, vegetarian?:boolean, count?:number, meals?:Array}} [opts]
 * @returns {{status:"done"|"ideas", ideas:Array}}
 */
export function suggestHomeMeals(remaining, { hour = new Date().getHours(), vegetarian = false, count = 3, meals = HOME_MEALS } = {}) {
  const r = {
    calories: Math.round(remaining.calories || 0),
    protein: Math.round(remaining.protein || 0),
    carbs: Math.round(remaining.carbs || 0),
    fat: Math.round(remaining.fat || 0),
  };
  // Under ~150 kcal left there's no real meal to suggest — say so instead of forcing a snack.
  if (r.calories < 150) return { status: "done", ideas: [] };

  const slots = r.calories < 350 ? ["snack"] : mealSlotsForHour(hour);
  // With a big budget left, aim each idea at roughly one meal's share rather than the whole day.
  const calorieAim = Math.min(r.calories, slots.includes("snack") && slots.length === 1 ? 300 : 700);

  const candidates = [];
  for (const meal of meals) {
    if (!slots.includes(meal.slot)) continue;
    if (vegetarian && !meal.veg) continue;
    let best = null;
    for (const s of SCALES) {
      const scaled = scaleMeal(meal, s);
      // Small preference for the standard portion so we don't suggest "2x" when 1x fits nearly as well.
      const penalty = fitPenalty(scaled, r, calorieAim) + Math.abs(s - 1) * 0.15;
      if (!best || penalty < best.penalty) best = { ...scaled, penalty };
    }
    candidates.push(best);
  }
  candidates.sort((a, b) => a.penalty - b.penalty || a.id.localeCompare(b.id));
  return { status: "ideas", ideas: candidates.slice(0, count).map(({ penalty, ...m }) => m) };
}
