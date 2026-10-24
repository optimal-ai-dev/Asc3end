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
    brand: (Array.isArray(p.brands) ? p.brands[0] || "" : String(p.brands || "").split(",")[0]).trim() || null,
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

export function isValidBarcode(code) {
  return /^\d{6,14}$/.test(String(code || "").trim());
}

// Shoppers search by store ("costco chicken", "woolies yoghurt"), but packaged foods are
// labelled with the store's house brand. Each alias maps to the brand words on the label.
export const STORE_BRANDS = {
  costco: "kirkland signature",
  kirkland: "kirkland signature",
  woolies: "woolworths",
  woolworths: "woolworths",
  woolworth: "woolworths",
  coles: "coles",
  aldi: "aldi",
  iga: "iga",
  "trader joe's": "trader joe's",
  "trader joes": "trader joe's",
  tesco: "tesco",
  sainsburys: "sainsbury's",
  "sainsbury's": "sainsbury's",
  walmart: "great value",
  maccas: "mcdonald's",
  mcdonalds: "mcdonald's",
  "mcdonald's": "mcdonald's",
  "hungry jacks": "hungry jack's",
};

const ALIAS_KEYS = Object.keys(STORE_BRANDS).sort((a, b) => b.length - a.length);
const escapeRe = (s) => s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");

// Splits a query into the brand it names (if any) and the food words. "costco chicken" →
// { brand: "kirkland signature", food: "chicken", branded: "kirkland signature chicken" }.
export function parseQuery(raw) {
  let text = ` ${String(raw || "").toLowerCase().replace(/\s+/g, " ").trim()} `;
  let brand = null;
  for (const alias of ALIAS_KEYS) {
    const re = new RegExp(`\\s${escapeRe(alias)}\\s`);
    if (re.test(text)) { brand = STORE_BRANDS[alias]; text = text.replace(re, " "); break; }
  }
  const food = text.trim();
  return { brand, food, branded: brand ? `${brand} ${food}`.trim() : food };
}

// Australian/British food words the USDA database spells the American way. Applied to both
// the query sent to USDA and the words compared when ranking, so "yoghurt" still matches
// "Yogurt, Greek, plain".
const SYNONYMS = {
  yoghurt: "yogurt", yoghurts: "yogurt", yogurts: "yogurt", mince: "ground", prawn: "shrimp", prawns: "shrimp",
  capsicum: "pepper", rockmelon: "cantaloupe", coriander: "cilantro", aubergine: "eggplant", courgette: "zucchini",
  lollies: "candies", porridge: "oatmeal",
};

export const tokens = (s) => String(s || "").toLowerCase().normalize("NFD").replace(/[\u0300-\u036f]/g, "")
  .split(/[^a-z0-9]+/).filter((t) => t.length >= 2).map((t) => SYNONYMS[t] || t);

export const usdaQuery = (food) => String(food || "").toLowerCase().split(/\s+/).map((w) => SYNONYMS[w] || w).join(" ").trim();

// How well a result matches: the share of the query's food words found in its name, a bonus
// when the brand the person asked for is on it, and a smaller one for products sold locally.
// Prefix matches count ("chick" finds "chicken"), so half-typed queries still rank sensibly.
// Whether a typed word matches a word in a food's name: exact, a prefix ("chick" → "chicken"),
// the plural/singular ("eggs" → "egg"), or one typo away for longer words ("chiken" →
// "chicken"), two for long ones ("worchestershire").
export function wordMatches(t, h) {
  if (h === t || h.startsWith(t)) return true;
  if (t.replace(/e?s$/, "") === h.replace(/e?s$/, "")) return true;
  if (t.length > 4 && h.length >= 4 && t.startsWith(h)) return true;
  // Typos only on words of 5+ letters that start with the same letter, so "rice" never
  // matches "price" and "ham" never matches "jam".
  if (t.length < 5 || t[0] !== h[0]) return false;
  const max = t.length >= 8 ? 2 : 1;
  return editDistance(t, h, max) <= max;
}

// Damerau–Levenshtein (adjacent swaps count as one edit, so "cikhen" is close to "chicken"),
// giving up early once the distance passes `max`.
export function editDistance(a, b, max = 2) {
  if (Math.abs(a.length - b.length) > max) return max + 1;
  const d = Array.from({ length: a.length + 1 }, (_, i) => [i, ...Array(b.length).fill(0)]);
  for (let j = 1; j <= b.length; j++) d[0][j] = j;
  for (let i = 1; i <= a.length; i++) {
    let rowMin = Infinity;
    for (let j = 1; j <= b.length; j++) {
      const cost = a[i - 1] === b[j - 1] ? 0 : 1;
      d[i][j] = Math.min(d[i - 1][j] + 1, d[i][j - 1] + 1, d[i - 1][j - 1] + cost);
      if (i > 1 && j > 1 && a[i - 1] === b[j - 2] && a[i - 2] === b[j - 1]) d[i][j] = Math.min(d[i][j], d[i - 2][j - 2] + 1);
      rowMin = Math.min(rowMin, d[i][j]);
    }
    if (rowMin > max) return max + 1;
  }
  return d[a.length][b.length];
}

export function relevance(food, parsed) {
  const want = tokens(parsed.food);
  const have = tokens(`${food.name} ${food.brand || ""}`);
  const hit = (t) => have.some((h) => wordMatches(t, h));
  const wordScore = want.length ? want.filter(hit).length / want.length : 1;
  const brandScore = parsed.brand ? (tokens(food.brand || food.name).join(" ").includes(tokens(parsed.brand)[0]) ? 1 : 0) : 0;
  return wordScore * 2 + brandScore * 1.5 + (food.local ? 0.5 : 0) + (food.mine ? 3 : 0);
}

// Final ordering. Without a brand in the query, generic foods lead (they are what people mean
// by "banana"); with one, the matching branded products do. Results matching none of the food
// words are dropped, so a slow source can't pad the list with unrelated products.
export function rankResults(foods, parsed, limit = 40) {
  const key = (f) => `${f.name}|${f.brand || ""}`.toLowerCase().replace(/[^a-z0-9|]/g, "");
  const seen = new Set();
  const scored = [];
  foods.forEach((f, i) => {
    const k = key(f);
    if (seen.has(k)) return;
    seen.add(k);
    const score = relevance(f, parsed);
    if (tokens(parsed.food).length && score < 0.5 && !f.mine) return;
    const genericBoost = !parsed.brand && f.generic ? 1 : 0;
    scored.push({ f, score: score + genericBoost, i });
  });
  return scored.sort((a, b) => b.score - a.score || a.i - b.i).slice(0, limit).map((x) => x.f);
}

// The person's own saved products ("My foods"), searchable and scannable like the databases.
export function myFoodToResult(m) {
  return {
    id: `mine:${m.id}`, source: "mine", mine: true, generic: false,
    name: m.name, brand: m.brand || null, barcode: m.barcode || null,
    per100g: m.per100g,
    portions: m.servingGrams ? [{ label: `1 serving (${m.servingGrams} g)`, grams: m.servingGrams }] : [],
  };
}

// Builds a My foods entry from what's printed on a pack: values per serving plus the serving
// weight, which is how Australian and most other nutrition panels list them.
export function myFoodFromLabel({ id, name, brand, barcode, servingGrams, calories, protein, carbs, fat }) {
  const g = num(servingGrams) && num(servingGrams) > 0 ? num(servingGrams) : 100;
  const per = (v) => round1(((num(v) || 0) * 100) / g);
  return {
    id, name: String(name).trim(), brand: (brand || "").trim() || null, barcode: barcode || null,
    servingGrams: g,
    per100g: { calories: per(calories), protein: per(protein), carbs: per(carbs), fat: per(fat) },
  };
}

export function searchMyFoods(myFoods, query) {
  const parsed = parseQuery(query);
  const want = tokens(`${parsed.brand || ""} ${parsed.food}`);
  return (myFoods || []).map(myFoodToResult).filter((f) => {
    const have = tokens(`${f.name} ${f.brand || ""}`);
    return want.length && want.every((t) => have.some((h) => wordMatches(t, h)));
  });
}

// Spelling correction before a query leaves the device. USDA's search has no typo tolerance,
// so "chiken brest" would find nothing there; each word that isn't a known food word but is
// one or two edits from exactly one is swapped for it. Brand names and anything unfamiliar
// are left alone rather than "corrected" into something else.
export const FOOD_WORDS = `apple apricot avocado bacon bagel banana barley basil bean beans beef beer beetroot berries
biscuit blackberries blueberries bok bologna bran bread breakfast breast brisket broccoli brown brownie brussels
burger burrito butter buttermilk cabbage cake calamari candy cantaloupe capsicum caramel carrot cashew cashews
casserole cauliflower celery cereal cheddar cheese cheesecake cherry cherries chestnut chicken chickpea chickpeas
chilli chips chive chocolate chop chowder cinnamon coconut cod coffee coleslaw cookie cookies corn cottage couscous
crab cracker crackers cranberry cream croissant crumpet cucumber cupcake curry custard danish date dates dinner
donut doughnut dressing drumstick duck dumpling dumplings edamame egg eggplant eggs fajita feta fettuccine fig
fillet fish flatbread flour fries frittata fruit garlic ginger gnocchi granola grape grapefruit grapes gravy greek
grilled ground guacamole ham hamburger hash hazelnut hazelnuts honey hummus icecream jam jelly juice jerky kale
kebab kidney kiwi lamb lasagne lasagna lemon lentil lentils lettuce lime lobster macadamia macaroni mango
margarine marinara mayonnaise meatball meatballs melon milk minced mince mint mozzarella muesli muffin mushroom
mushrooms mussels mustard noodle noodles nugget nuggets nutella nuts oat oatmeal oats olive olives omelette onion
orange oyster pancake pancakes papaya parmesan pasta pastry pavlova peach peanut peanuts pear peas pecan pepper
pepperoni pesto pickle pie pineapple pistachio pita pizza plum popcorn pork porridge potato potatoes prawn prawns
pretzel protein pudding pumpkin quiche quinoa raisin raisins ramen raspberries raspberry ravioli rice ricotta
risotto roast roasted rockmelon roll rotisserie rump salad salami salmon salsa sandwich sardines sauce sausage
sausages scallop scone scrambled seeds sesame shake shrimp sirloin skim smoothie snapper soup sourdough soy soya
spaghetti spinach spread sprouts squash steak stew stir strawberries strawberry sugar sultanas sushi sweet
sweetcorn taco tahini tea tempeh teriyaki thigh toast tofu tomato tomatoes tortilla trout tuna turkey vanilla
veal vegemite vegetable vegetables vinegar waffle walnut walnuts water watermelon weetbix wholemeal wrap yoghurt
yogurt zucchini`.split(/\s+/);
const FOOD_WORD_SET = new Set(FOOD_WORDS);

export function correctSpelling(query) {
  let changed = false;
  const out = String(query || "").split(/(\s+)/).map((w) => {
    const t = w.toLowerCase();
    if (!/^[a-z]{4,}$/.test(t) || FOOD_WORD_SET.has(t) || STORE_BRANDS[t]) return w;
    const max = t.length >= 8 ? 2 : 1;
    const close = FOOD_WORDS.filter((f) => editDistance(t, f, max) <= max);
    if (close.length === 0) return w;
    const best = close.map((f) => [f, editDistance(t, f, max)]).sort((a, b) => a[1] - b[1]);
    if (best.length > 1 && best[0][1] === best[1][1]) return w; // ambiguous — leave it
    changed = true;
    return best[0][0];
  }).join("");
  return { text: out, changed };
}

// Pulls an amount out of the query, so "200g chicken breast" or "2 eggs" searches for the food
// and opens it with that amount filled in.
export function parseAmount(query) {
  const q = String(query || "").trim();
  const unitRe = "(kg|g|grams?|gm|ml|l|oz|ounces?|cups?|tbsp|tsp|serves?|servings?|slices?|pieces?|x)?";
  const lead = q.match(new RegExp(`^(\\d+(?:[.,]\\d+)?|½|¼|¾)\\s*${unitRe}\\s+(?:of\\s+)?(.+)$`, "i"));
  const trail = q.match(new RegExp(`^(.+?)\\s+(\\d+(?:[.,]\\d+)?)\\s*${unitRe}$`, "i"));
  const m = lead ? { n: lead[1], unit: lead[2], food: lead[3] } : trail ? { n: trail[2], unit: trail[3], food: trail[1] } : null;
  if (!m || !m.food.trim() || /^\d/.test(m.food)) return { food: q, amount: null };
  const n = { "½": 0.5, "¼": 0.25, "¾": 0.75 }[m.n] ?? +m.n.replace(",", ".");
  if (!(n > 0) || n > 5000) return { food: q, amount: null };
  const u = (m.unit || "").toLowerCase();
  const amount = /^(kg)$/.test(u) ? { grams: n * 1000 }
    : /^(g|grams?|gm|ml)$/.test(u) ? { grams: n }
    : u === "l" ? { grams: n * 1000 }
    : /^(oz|ounces?)$/.test(u) ? { ounces: n }
    : /^cups?$/.test(u) ? { servings: n, hint: "cup" }
    : /^(tbsp)$/.test(u) ? { servings: n, hint: "tbsp" }
    : /^(tsp)$/.test(u) ? { servings: n, hint: "tsp" }
    : /^slices?$/.test(u) ? { servings: n, hint: "slice" }
    : { servings: n };
  return { food: m.food.trim(), amount };
}

// The starting amount for a food when the query named one. Grams and ounces map directly; a
// count picks the matching household measure where there is one ("2 cups" → "1 cup" × 2),
// otherwise the food's first serving.
export function amountFromQuery(food, amount) {
  if (!amount) return defaultAmount(food);
  if (amount.grams) return { quantity: Math.round(amount.grams * 10) / 10, unit: GRAM_UNIT };
  if (amount.ounces) return { quantity: amount.ounces, unit: OUNCE_UNIT };
  const portions = food.portions || [];
  const hinted = amount.hint && portions.find((p) => p.label.toLowerCase().includes(amount.hint));
  const unit = hinted || portions[0];
  return unit ? { quantity: amount.servings, unit } : { quantity: amount.servings * 100, unit: GRAM_UNIT };
}

// The person's diary history as search results, so anything they've logged before comes up
// first and instantly. Entries logged from the database keep their per-100 g values and
// portion; older or hand-typed ones are offered as the same single serving.
export function historyToResults(entries) {
  const out = [];
  const seen = new Set();
  // Newest first, so a food re-portioned last week opens at last week's amount.
  for (const e of [...(entries || [])].sort((x, y) => (y.date > x.date ? 1 : y.date < x.date ? -1 : 0))) {
    const k = e.name.toLowerCase();
    if (seen.has(k)) continue;
    seen.add(k);
    const portioned = e.per100g && e.grams > 0;
    out.push({
      id: `hist:${k}`, source: "history", history: true, generic: false, name: e.name, brand: null,
      per100g: portioned ? e.per100g : { calories: e.calories, protein: e.protein, carbs: e.carbs, fat: e.fat },
      portions: portioned
        ? (e.amount && !/ (g|oz)$/.test(e.amount) && !/×/.test(e.amount) ? [{ label: e.amount, grams: e.grams }] : [])
        : [{ label: "1 serving", grams: 100 }],
      lastGrams: portioned ? e.grams : null,
    });
  }
  return out;
}

export function searchHistory(entries, query) {
  const want = tokens(parseQuery(query).food);
  if (!want.length) return [];
  return historyToResults(entries).filter((f) => {
    const have = tokens(f.name);
    return want.every((t) => have.some((h) => wordMatches(t, h)));
  }).slice(0, 5);
}

// Foods logged most often over the last 60 days, most frequent first — the "Frequent" list.
export function frequentFoods(entries, today = new Date(), limit = 8) {
  const cutoff = new Date(today);
  cutoff.setDate(cutoff.getDate() - 60);
  const iso = cutoff.toISOString().slice(0, 10);
  const counts = new Map();
  for (const e of entries || []) {
    if (e.date < iso) continue;
    const k = e.name.toLowerCase();
    const c = counts.get(k) || { n: 0, last: e };
    c.n += 1;
    if (e.date >= c.last.date) c.last = e;
    counts.set(k, c);
  }
  return [...counts.values()].filter((c) => c.n >= 2).sort((a, b) => b.n - a.n || (b.last.date > a.last.date ? 1 : -1)).slice(0, limit).map((c) => c.last);
}


// ISO country (from the browser locale) → Open Food Facts country tag, for the countries
// where people most often use the app. Anything else just searches worldwide.
export const OFF_COUNTRY = {
  au: "en:australia", nz: "en:new-zealand", us: "en:united-states", ca: "en:canada",
  gb: "en:united-kingdom", uk: "en:united-kingdom", ie: "en:ireland", fr: "en:france",
  de: "en:germany", es: "en:spain", it: "en:italy", nl: "en:netherlands", in: "en:india",
  sg: "en:singapore", za: "en:south-africa", ph: "en:philippines", my: "en:malaysia",
};
