import { supabase } from "./supabase";
import { extractClaudeText, extractJSON } from "./claudeClient";

// Reads a photo of a nutrition information panel into the Custom food form, for products the
// food databases don't have. One small vision call through /api/claude (feature "label",
// metered: see lib/entitlements.js).

const MAX_DIM = 1280; // a little more than the meal scanner uses — label text is small

function fileToJpegBase64(file) {
  return new Promise((resolve, reject) => {
    if (!file.type.startsWith("image/")) { reject(new Error("Please choose a photo.")); return; }
    if (file.size > 15 * 1024 * 1024) { reject(new Error("That photo is too large — try another.")); return; }
    const reader = new FileReader();
    reader.onerror = () => reject(new Error("Couldn't read that photo — try another."));
    reader.onload = () => {
      const img = new Image();
      img.onerror = () => reject(new Error("Couldn't read that photo — try another."));
      img.onload = () => {
        const scale = Math.min(1, MAX_DIM / Math.max(img.naturalWidth, img.naturalHeight));
        const canvas = document.createElement("canvas");
        canvas.width = Math.round(img.naturalWidth * scale);
        canvas.height = Math.round(img.naturalHeight * scale);
        canvas.getContext("2d").drawImage(img, 0, 0, canvas.width, canvas.height);
        resolve(canvas.toDataURL("image/jpeg", 0.85).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

const PROMPT = `Read the nutrition information panel in this photo.
Australian and New Zealand panels give energy in kJ — convert to kcal (kJ ÷ 4.184). If both kJ and kcal (Cal) are printed, use the kcal figure.
Use total carbohydrate (not sugars) and total fat (not saturated).
Return ONLY valid JSON, no markdown fences, no preamble:
{"name":"product name if visible, else empty","brand":"brand if visible, else empty","servingGrams":number or null,"perServing":{"calories":0,"protein":0,"carbs":0,"fat":0} or null,"per100g":{"calories":0,"protein":0,"carbs":0,"fat":0} or null}
If the photo is not a nutrition panel, return {"error":"not_a_label"}.`;

const clean = (o) => o && ["calories", "protein", "carbs", "fat"].every((k) => Number.isFinite(+o[k])) ? o : null;

// Turns the model's answer into the form's per-serving values. Per-serving figures are used
// when the panel has them; otherwise per-100 g figures are scaled to the serving size (or kept
// as a 100 g serving when there isn't one).
export function labelToForm(parsed) {
  const serving = Number.isFinite(+parsed.servingGrams) && +parsed.servingGrams > 0 ? +parsed.servingGrams : null;
  const perServing = clean(parsed.perServing);
  const per100 = clean(parsed.per100g);
  let values, grams;
  if (perServing && serving) { values = perServing; grams = serving; }
  else if (per100) { grams = serving || 100; values = Object.fromEntries(Object.entries(per100).map(([k, v]) => [k, (+v * grams) / 100])); }
  else if (perServing) { values = perServing; grams = 100; }
  else return null;
  const r = (v, d = 1) => String(Math.round(+v * 10 ** d) / 10 ** d);
  return {
    name: parsed.name || "", brand: parsed.brand || "", servingGrams: r(grams, 0),
    calories: r(values.calories, 0), protein: r(values.protein), carbs: r(values.carbs), fat: r(values.fat),
  };
}

export async function readNutritionLabel(file) {
  const base64 = await fileToJpegBase64(file);
  const { data: { session } } = await supabase.auth.getSession();
  let response;
  try {
    response = await fetch("/api/claude", {
      method: "POST",
      headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
      body: JSON.stringify({
        max_tokens: 300,
        feature: "label",
        messages: [{ role: "user", content: [
          { type: "image", source: { type: "base64", media_type: "image/jpeg", data: base64 } },
          { type: "text", text: PROMPT },
        ] }],
      }),
    });
  } catch (e) {
    throw new Error("Couldn't reach the label reader — check your connection.");
  }
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(data?.error?.message || "Couldn't read that label — try again, or type the values in.");
  let parsed;
  try { parsed = extractJSON(extractClaudeText(data)); } catch (e) { parsed = null; }
  if (!parsed || parsed.error) throw new Error("That doesn't look like a nutrition panel — try a closer, straight-on photo of the table.");
  const form = labelToForm(parsed);
  if (!form) throw new Error("Couldn't make out the numbers — try a sharper photo, or type them in.");
  return form;
}
