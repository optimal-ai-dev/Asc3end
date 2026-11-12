// Photo meal scanning: the prompt that reads every food on the plate, the parser that turns the
// model's answer into editable items, and the maths that keeps macros in step with whatever the
// person changes (name, number of pieces, grams). Framework-free so it can be unit tested.

import { nutrientsFor } from "./foodData";

const round1 = (n) => Math.round(n * 10) / 10;
const num = (v) => (Number.isFinite(+v) && +v >= 0 ? +v : 0);
const posOrNull = (v) => (Number.isFinite(+v) && +v > 0 ? +v : null);
const MAX_ITEMS = 12;
const MAX_GRAMS = 3000;
const clampGrams = (g) => Math.min(MAX_GRAMS, Math.max(0, Math.round(g)));

let nextId = 0;
const itemId = () => `scan-${Date.now().toString(36)}-${(nextId++).toString(36)}`;

const ITEM_SHAPE = `{"name":"","countable":false,"pieces":null,"pieceLabel":"","gramsPerPiece":null,"estimatedGrams":0,"caloriesPer100g":0,"proteinPer100g":0,"carbsPer100g":0,"fatPer100g":0,"confidence":"high|medium|low","question":""}`;

export const SCAN_PROMPT = `You are a nutrition assistant looking at a photo of a meal. Identify EVERY separate food and drink you can see, not just the main one: each protein, each side (rice, potatoes, chips, bread, salad, vegetables), sauces, dressings, visible cooking oil or butter, toppings and drinks. List each one as its own item. Do not merge different foods into one item.

For each item:
- name: a short, specific name (e.g. "Grilled pork chop", "White rice", "Garlic butter sauce").
- countable: true if it comes in pieces someone could count (chops, thighs, eggs, slices, nuggets, meatballs, potatoes), otherwise false.
- pieces and gramsPerPiece: for countable items, how many pieces you can see and a typical weight of one piece. Otherwise null.
- pieceLabel: what one piece is called, singular (e.g. "chop", "slice", "egg"). Empty if not countable.
- estimatedGrams: your best estimate of the total grams of that item on the plate (pieces x gramsPerPiece for countable items).
- per-100 g calories, protein, carbs and fat for the item as it appears cooked.
- confidence: how sure you are about what the item is.
- question: ONE short, friendly question to ask the person that would most improve accuracy for this item, e.g. "How many pork chops did you have?", "Roughly how many grams of rice was this?", "Was this cooked in oil or butter?". If you are unsure what the item is, ask what it is (e.g. "Is this chicken thigh or pork chop?").

If there is no food in the photo, return an empty items list.
Return ONLY valid JSON, no markdown fences, no preamble: {"items":[${ITEM_SHAPE}]}`;

const CONFIDENCE = ["high", "medium", "low"];

function normalizePer100g(raw) {
  return {
    calories: Math.round(num(raw.caloriesPer100g ?? raw.per100g?.calories)),
    protein: round1(num(raw.proteinPer100g ?? raw.per100g?.protein)),
    carbs: round1(num(raw.carbsPer100g ?? raw.per100g?.carbs)),
    fat: round1(num(raw.fatPer100g ?? raw.per100g?.fat)),
  };
}

// One item from the model's JSON, made safe to edit: numbers are clamped, countable items carry
// a piece count and a per-piece weight, and grams always agree with pieces x per-piece weight.
export function normalizeScanItem(raw, previous = null) {
  if (!raw || typeof raw !== "object") return null;
  const name = String(raw.name || "").trim().slice(0, 80);
  if (!name) return null;
  const pieces = posOrNull(raw.pieces);
  let gramsPerPiece = posOrNull(raw.gramsPerPiece);
  const estimated = posOrNull(raw.estimatedGrams ?? raw.grams);
  const countable = !!raw.countable && pieces !== null;
  if (countable && gramsPerPiece === null && estimated !== null) gramsPerPiece = round1(estimated / pieces);
  const usePieces = countable && gramsPerPiece !== null;
  const grams = clampGrams(usePieces ? pieces * gramsPerPiece : (estimated ?? 100));
  return {
    id: previous?.id || itemId(),
    name,
    per100g: normalizePer100g(raw),
    grams,
    pieces: usePieces ? pieces : null,
    gramsPerPiece: usePieces ? gramsPerPiece : null,
    pieceLabel: usePieces ? String(raw.pieceLabel || "piece").trim().slice(0, 24) || "piece" : "",
    confidence: CONFIDENCE.includes(raw.confidence) ? raw.confidence : "medium",
    question: String(raw.question || "").trim().slice(0, 160),
  };
}

// The whole scan answer as a list of items. Accepts {items:[…]} or the old single-food shape
// ({name, estimatedGrams, caloriesPer100g, …}) so a model that ignores the list still works.
export function parseScanResult(parsed) {
  if (!parsed || typeof parsed !== "object") return [];
  const list = Array.isArray(parsed.items) ? parsed.items : parsed.name ? [parsed] : [];
  return list.map((raw) => normalizeScanItem(raw)).filter(Boolean).slice(0, MAX_ITEMS);
}

export function itemNutrients(item) {
  return nutrientsFor(item.per100g, item.grams);
}

export function mealTotals(items) {
  const t = items.reduce((a, it) => {
    const n = itemNutrients(it);
    return { calories: a.calories + n.calories, protein: a.protein + n.protein, carbs: a.carbs + n.carbs, fat: a.fat + n.fat };
  }, { calories: 0, protein: 0, carbs: 0, fat: 0 });
  return { calories: Math.round(t.calories), protein: round1(t.protein), carbs: round1(t.carbs), fat: round1(t.fat) };
}

// Edits the person makes on an item. Changing the count keeps the per-piece weight; changing
// the per-piece weight keeps the count; typing total grams directly drops the piece breakdown
// only if it no longer adds up.
export function setPieces(item, pieces) {
  const p = Math.max(0, Math.round(+pieces || 0));
  return { ...item, pieces: p, grams: clampGrams(p * (item.gramsPerPiece || 0)) };
}

export function setGramsPerPiece(item, gramsPerPiece) {
  const g = Math.max(0, +gramsPerPiece || 0);
  return { ...item, gramsPerPiece: g, grams: clampGrams((item.pieces || 0) * g) };
}

export function setTotalGrams(item, grams) {
  const g = clampGrams(+grams || 0);
  if (item.pieces) return { ...item, grams: g, gramsPerPiece: round1(g / item.pieces) };
  return { ...item, grams: g };
}

// Asked when the person renames an item ("chicken thighs" -> "pork chops") or adds one the photo
// missed: the per-100 g values for that food, so the macros follow the new name.
export function buildItemEstimatePrompt(name) {
  return `Give typical nutrition per 100 g for this food as normally eaten (cooked if it is usually cooked): "${String(name).slice(0, 80)}". Also give a typical weight in grams of one piece if it usually comes in pieces, otherwise null. Return ONLY valid JSON, no markdown fences: {"caloriesPer100g":0,"proteinPer100g":0,"carbsPer100g":0,"fatPer100g":0,"gramsPerPiece":null}`;
}

export function parseItemEstimate(parsed) {
  if (!parsed || typeof parsed !== "object") return null;
  const per100g = normalizePer100g(parsed);
  if (!per100g.calories && !per100g.protein && !per100g.carbs && !per100g.fat) return null;
  return { per100g, gramsPerPiece: posOrNull(parsed.gramsPerPiece) };
}

export function renameItem(item, name, estimate) {
  const next = { ...item, name: String(name).trim().slice(0, 80) || item.name, confidence: "high", question: "" };
  if (estimate?.per100g) next.per100g = estimate.per100g;
  return next;
}

// After the person answers the questions or writes notes ("it was fried in butter", "I only ate
// half the rice", "there was also a can of Coke"), the current list and their notes go back to
// the model, which returns the corrected list. What the person typed in always wins.
export function buildRefinePrompt(items, notes) {
  const current = items.map((it) => ({
    name: it.name,
    grams: it.grams,
    ...(it.pieces ? { pieces: it.pieces, pieceLabel: it.pieceLabel, gramsPerPiece: it.gramsPerPiece } : {}),
    caloriesPer100g: it.per100g.calories, proteinPer100g: it.per100g.protein, carbsPer100g: it.per100g.carbs, fatPer100g: it.per100g.fat,
  }));
  return `You are a nutrition assistant helping someone log a meal they photographed. This is the current list of foods, already checked and corrected by the person (names, piece counts and grams they set are correct unless their notes say otherwise):
${JSON.stringify(current)}

The person added these notes: "${String(notes).slice(0, 600)}"

Update the list using the notes: add any foods they mention that are missing, remove foods they say they didn't eat, adjust amounts and cooking method (e.g. extra oil or butter changes the per-100 g values), and rename items they correct. Keep everything else as it is.
For each item, if anything is still uncertain, set "question" to one short question that would improve accuracy, otherwise "".
Return ONLY valid JSON, no markdown fences, no preamble: {"items":[${ITEM_SHAPE}]}`;
}

// Keeps each item's id when the refined list still has a food with the same name, so the
// cards the person is looking at don't jump around.
export function mergeRefined(previous, refined) {
  const parsed = Array.isArray(refined?.items) ? refined.items : [];
  const used = new Set();
  return parsed.map((raw) => {
    const key = String(raw?.name || "").trim().toLowerCase();
    const match = previous.find((p) => !used.has(p.id) && p.name.toLowerCase() === key);
    if (match) used.add(match.id);
    return normalizeScanItem(raw, match);
  }).filter(Boolean).slice(0, MAX_ITEMS);
}

export function blankItem(name, grams = 100) {
  return { id: itemId(), name, per100g: { calories: 0, protein: 0, carbs: 0, fat: 0 }, grams: clampGrams(grams), pieces: null, gramsPerPiece: null, pieceLabel: "", confidence: "high", question: "" };
}

// Diary entries for the whole meal. Each keeps per100g and grams, so editing the grams later in
// the diary rescales its macros like any food from the database.
export function toDiaryEntries(items, { id, date }) {
  return items.filter((it) => it.grams > 0).map((it) => ({
    id: id(),
    date,
    name: it.pieces ? `${it.name} (${it.pieces} ${it.pieceLabel}${it.pieces === 1 ? "" : "s"}, ${it.grams}g)` : `${it.name} (${it.grams}g)`,
    ...itemNutrients(it),
    grams: it.grams,
    amount: `${it.grams} g`,
    per100g: it.per100g,
  }));
}
