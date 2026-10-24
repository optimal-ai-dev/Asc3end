// Food database normalization, shared by api/food-search.js (server) and the Add Food sheet
// (client). Two open sources feed it, both free:
//   - USDA FoodData Central (public domain): generic foods with household measures
//     ("1 cup, chopped", "1 medium") plus US branded products.
//   - Open Food Facts (ODbL): crowd-sourced packaged foods from ~150 countries, keyed by barcode.
// Everything is normalized to the same shape — nutrients per 100 g plus a list of portions
// (each a label and its weight in grams) — so the amount picker never has to know the source.

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (typeof v === "number" && Number.isFinite(v) ? v : Number.isFinite(+v) && v !== "" && v != null ? +v : null);

// FDC nutrient ids. Foundation foods often carry energy only as an Atwater-factor value
// (2047/2048) instead of the classic 1008, so all three are checked in that order.
const FDC = { energy: [1008, 2047, 2048], protein: 1003, fat: 1004, carbs: 1005, fiber: 1079, sugar: 2000, sodium: 1093 };

function fdcNutrient(food, id) {
  const ids = Array.isArray(id) ? id : [id];
  for (const want of ids) {
    const hit = (food.foodNutrients || []).find((n) => (n.nutrientId ?? n.nutrient?.id) === want);
    const v = num(hit?.value ?? hit?.amount);
    if (v != null) {
      // Energy is occasionally reported in kJ under the same id on branded rows.
      if (ids === FDC.energy && /kj/i.test(hit.unitName || "")) return v / 4.184;
      return v;
    }
  }
  return null;
}

const titleCase = (s) => s.toLowerCase().replace(/(^|[\s,(/-])([a-z])/g, (m, p, c) => p + c.toUpperCase());

export function normalizeFdcFood(food) {
  if (!food || !food.fdcId || !food.description) return null;
  const protein = fdcNutrient(food, FDC.protein) ?? 0;
  const carbs = fdcNutrient(food, FDC.carbs) ?? 0;
  const fat = fdcNutrient(food, FDC.fat) ?? 0;
  let calories = fdcNutrient(food, FDC.energy);
  if (calories == null) calories = protein * 4 + carbs * 4 + fat * 9;
  const branded = food.dataType === "Branded";

  const portions = [];
  for (const m of food.foodMeasures || []) {
    const g = num(m.gramWeight);
    const label = (m.disseminationText || "").trim();
    if (!g || g <= 0 || !label || /quantity not specified/i.test(label)) continue;
    portions.push({ label, grams: round1(g) });
  }
  if (branded && num(food.servingSize) && /^(g|grm|ml|mlt)$/i.test(food.servingSizeUnit || "")) {
    const g = num(food.servingSize);
    const household = (food.householdServingFullText || "").trim();
    portions.unshift({ label: household ? `1 serving (${household})` : "1 serving", grams: round1(g) });
  }

  return {
    id: `fdc:${food.fdcId}`,
    source: "usda",
    name: branded ? food.description.trim() : titleCase(food.description.trim()),
    brand: branded ? (food.brandName || food.brandOwner || "").trim() || null : null,
    generic: !branded,
    per100g: {
      calories: round1(calories), protein: round1(protein), carbs: round1(carbs), fat: round1(fat),
      fiber: fdcNutrient(food, FDC.fiber), sugar: fdcNutrient(food, FDC.sugar),
      // FDC reports sodium in mg per 100 g already.
      sodium: fdcNutrient(food, FDC.sodium),
    },
    portions: dedupePortions(portions),
  };
}

export function normalizeOffProduct(p) {
  if (!p) return null;
  const name = (p.product_name || p.product_name_en || p.generic_name || "").trim();
  const n = p.nutriments || {};
  let calories = num(n["energy-kcal_100g"]);
  if (calories == null && num(n["energy_100g"]) != null) calories = num(n["energy_100g"]) / 4.184; // energy_100g is kJ
  const protein = num(n.proteins_100g), carbs = num(n.carbohydrates_100g), fat = num(n.fat_100g);
  if (!name || (calories == null && protein == null && carbs == null && fat == null)) return null;

  const portions = [];
  const sq = num(p.serving_quantity);
  if (sq && sq > 0 && (!p.serving_quantity_unit || /^(g|ml)$/i.test(p.serving_quantity_unit))) {
    portions.push({ label: p.serving_size ? `1 serving (${String(p.serving_size).trim()})` : `1 serving (${sq} g)`, grams: round1(sq) });
  }
  const pq = num(p.product_quantity);
  if (pq && pq > 0 && pq !== sq && pq <= 5000) portions.push({ label: `Whole pack (${round1(pq)} g)`, grams: round1(pq) });

  const sodiumG = num(n.sodium_100g);
  return {
    id: `off:${p.code || p._id || name}`,
    source: "off",
    name,
    brand: (p.brands || "").split(",")[0].trim() || null,
    generic: false,
    barcode: p.code || null,
    per100g: {
      calories: round1(calories ?? (protein || 0) * 4 + (carbs || 0) * 4 + (fat || 0) * 9),
      protein: round1(protein || 0), carbs: round1(carbs || 0), fat: round1(fat || 0),
      fiber: num(n.fiber_100g), sugar: num(n.sugars_100g),
      sodium: sodiumG != null ? round1(sodiumG * 1000) : null,
    },
    portions,
  };
}

function dedupePortions(portions) {
  const seen = new Set();
  return portions.filter((p) => {
    const k = p.label.toLowerCase();
    if (seen.has(k)) return false;
    seen.add(k);
    return true;
  });
}

// Every food gets grams and ounces, then whatever household/serving measures the source had.
// The default is the first real serving when there is one (what MyFitnessPal and Cronometer
// preselect), otherwise 100 g.
export const GRAM_UNIT = { label: "g", grams: 1 };
export const OUNCE_UNIT = { label: "oz", grams: 28.35 };

export function unitOptions(food) {
  return [...(food.portions || []), GRAM_UNIT, OUNCE_UNIT];
}

export function defaultAmount(food) {
  const first = (food.portions || [])[0];
  return first ? { quantity: 1, unit: first } : { quantity: 100, unit: GRAM_UNIT };
}

export function gramsFor(quantity, unit) {
  const q = num(quantity);
  if (q == null || q < 0 || !unit) return 0;
  return round1(q * unit.grams);
}

export function nutrientsFor(per100g, grams) {
  const f = (v) => (v == null ? 0 : (v * grams) / 100);
  return {
    calories: Math.round(f(per100g.calories)),
    protein: round1(f(per100g.protein)),
    carbs: round1(f(per100g.carbs)),
    fat: round1(f(per100g.fat)),
  };
}

// "1 cup, chopped" × 2 reads better as "2 × 1 cup, chopped" than "2 1 cup, chopped".
export function amountLabel(quantity, unit) {
  if (unit.label === "g" || unit.label === "oz") return `${quantity} ${unit.label}`;
  return +quantity === 1 ? unit.label : `${quantity} × ${unit.label}`;
}

// Builds the diary entry. per100g/grams are stored alongside the totals so the entry can be
// re-portioned later without searching for the food again.
export function toDiaryEntry(food, quantity, unit, extra) {
  const grams = gramsFor(quantity, unit);
  const totals = nutrientsFor(food.per100g, grams);
  return {
    ...extra,
    name: food.brand ? `${food.name} (${food.brand})` : food.name,
    ...totals,
    grams,
    amount: amountLabel(quantity, unit),
    per100g: { calories: food.per100g.calories, protein: food.per100g.protein, carbs: food.per100g.carbs, fat: food.per100g.fat },
    foodId: food.id,
  };
}

// Generic foods first (they are what people mean by "banana" or "chicken breast"), then
// branded ones, keeping each source's own relevance order within a tier, and dropping
// near-duplicate names that both sources returned.
export function mergeResults(usda, off, limit = 40) {
  const key = (f) => `${f.name}|${f.brand || ""}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
  const seen = new Set();
  const out = [];
  const generic = usda.filter((f) => f.generic);
  const branded = interleave(usda.filter((f) => !f.generic), off);
  for (const f of [...generic, ...branded]) {
    const k = key(f);
    if (seen.has(k)) continue;
    seen.add(k);
    out.push(f);
    if (out.length >= limit) break;
  }
  return out;
}

function interleave(a, b) {
  const out = [];
  for (let i = 0; i < Math.max(a.length, b.length); i++) {
    if (a[i]) out.push(a[i]);
    if (b[i]) out.push(b[i]);
  }
  return out;
}

export function isValidBarcode(code) {
  return /^\d{6,14}$/.test(String(code || "").trim());
}
