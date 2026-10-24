import { supabase } from "./supabase";
import { extractClaudeText, extractJSON } from "./claudeClient";

// Reads a photo of a nutrition information panel into the Custom food form, for products the
// food databases don't have. One small vision call through /api/claude (feature "label",
// metered: see lib/entitlements.js).

// The vision model downsizes anything past ~1568 px on the long edge, so that's the sweet spot:
// as much detail on the small print as it will actually use, without uploading more.
const MAX_DIM = 1568;

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
        resolve(canvas.toDataURL("image/jpeg", 0.92).split(",")[1]);
      };
      img.src = reader.result;
    };
    reader.readAsDataURL(file);
  });
}

// The model only transcribes what's printed, as text; every conversion and every bit of arithmetic
// (kJ to kcal, per 100 to per serving) happens in labelToForm below. Language models are good
// readers and unreliable calculators — asking for "kcal" on a kJ-only panel is what made numbers
// drift by a few calories or a gram here and there.
const PROMPT = `Transcribe the nutrition information panel in this photo. Do not calculate, convert or round anything — copy each value exactly as printed, with its unit, as a string (e.g. "760kJ", "182Cal", "0.3g", "<1g", "41.0g").
Columns: "perServing" is the per-serving column (often "Avg. quantity per serving"); "per100" is the per 100 g or per 100 mL column. Fill whichever columns are printed and use null for a column that isn't. Never fill one column by calculating from the other.
servingSize is the printed serving size (e.g. "250mL", "30g") — NOT the number of servings per package.
energy: if the panel prints both kJ and kcal/Cal, copy both into energyKj and energyKcal; otherwise fill the one printed and null the other.
carbs = total carbohydrate (not "sugars"); fat = total fat (not "saturated"); protein as printed.
Return ONLY valid JSON, no markdown fences, no preamble:
{"name":"product name if visible, else empty","brand":"brand if visible, else empty","servingSize":"string or null","perServing":{"energyKj":"","energyKcal":"","protein":"","carbs":"","fat":""} or null,"per100":{"energyKj":"","energyKcal":"","protein":"","carbs":"","fat":""} or null,"per100Unit":"g or mL"}
If the photo is not a nutrition panel, return {"error":"not_a_label"}.`;

// "41.0g" → 41, "0,3 g" → 0.3, "<1g" → 0.5 (halfway; panels print "<1" for anything under 1 g),
// "nil"/"trace" → 0. Plain numbers pass through for the older response shape.
export function parseLabelNumber(v) {
  if (v == null || v === "") return null;
  if (typeof v === "number") return Number.isFinite(v) ? v : null;
  const t = String(v).trim().toLowerCase().replace(",", ".");
  if (/^(nil|trace|tr|-|—)$/.test(t)) return 0;
  const m = t.match(/(<|less than)?\s*(\d+(?:\.\d+)?)/);
  if (!m) return null;
  return m[1] ? +m[2] / 2 : +m[2];
}

// kcal from a column: the printed kcal when there is one, else the printed kJ ÷ 4.184.
function columnValues(col) {
  if (!col || typeof col !== "object") return null;
  const kcal = parseLabelNumber(col.energyKcal ?? col.calories);
  const kj = parseLabelNumber(col.energyKj);
  const calories = kcal ?? (kj != null ? kj / 4.184 : null);
  const out = { calories, protein: parseLabelNumber(col.protein), carbs: parseLabelNumber(col.carbs), fat: parseLabelNumber(col.fat), kj };
  return ["calories", "protein", "carbs", "fat"].some((k) => out[k] != null) ? out : null;
}

const MACROS = ["calories", "protein", "carbs", "fat"];
const round = (v, d) => String(Math.round(+v * 10 ** d) / 10 ** d);

// Turns the transcription into the form's per-serving values. The printed per-serving column is
// used as-is, so the diary matches the pack exactly; a value missing from it is taken from the
// per-100 column scaled to the serving. With no serving size, it's a 100 g / 100 mL serving.
// Also returns `checks`: things the person should look at before adding.
export function labelToForm(parsed) {
  const servingRaw = parsed.servingSize ?? parsed.servingGrams;
  const serving = parseLabelNumber(servingRaw);
  const unit = /ml|millilit/i.test(String(servingRaw ?? "")) || /ml/i.test(parsed.per100Unit || "") ? "ml" : "g";
  const ps = columnValues(parsed.perServing);
  const p100 = columnValues(parsed.per100 ?? parsed.per100g);
  if (!ps && !p100) return null;

  const grams = serving && serving > 0 ? serving : 100;
  const fromPer100 = (k) => (p100?.[k] != null ? (p100[k] * grams) / 100 : null);
  const usePs = ps && (serving > 0 || !p100);
  const values = Object.fromEntries(MACROS.map((k) => [k, (usePs ? ps[k] : null) ?? fromPer100(k) ?? (usePs ? null : ps?.[k]) ?? null]));
  if (values.calories == null && values.protein == null && values.carbs == null && values.fat == null) return null;

  const checks = [];
  // The two columns should agree (panels compute per serving from per 100 and round). A gap
  // beyond rounding means one figure was misread.
  if (usePs && p100 && serving > 0) {
    const off = MACROS.filter((k) => {
      const a = ps[k], b = fromPer100(k);
      if (a == null || b == null) return false;
      const tol = k === "calories" ? Math.max(3, b * 0.05) : Math.max(0.3, b * 0.06);
      return Math.abs(a - b) > tol;
    });
    if (off.length) checks.push(`The per-serving and per-100 ${unit} columns don't line up for ${off.map((k) => (k === "calories" ? "energy" : k)).join(", ")} — compare those with the pack.`);
  }
  // Energy should roughly equal 4 kcal/g protein and carbs + 9 kcal/g fat. Fibre, alcohol and
  // sugar alcohols make real labels differ a little, so only a big gap is flagged.
  if (values.calories != null && values.protein != null && values.carbs != null && values.fat != null) {
    const est = values.protein * 4 + values.carbs * 4 + values.fat * 9;
    if (Math.abs(est - values.calories) > Math.max(20, values.calories * 0.2)) {
      checks.push("The energy doesn't match the protein, carbs and fat — one of the numbers may have been misread.");
    }
  }
  if (!serving) checks.push(`No serving size was printed, so this is set to 100 ${unit}. Change it if you have a different amount.`);

  return {
    name: parsed.name || "", brand: parsed.brand || "", servingGrams: round(grams, 1), servingUnit: unit,
    calories: values.calories == null ? "" : round(values.calories, 0),
    protein: values.protein == null ? "" : round(values.protein, 2),
    carbs: values.carbs == null ? "" : round(values.carbs, 2),
    fat: values.fat == null ? "" : round(values.fat, 2),
    basis: usePs ? "per serving" : `per 100 ${unit}${serving ? `, scaled to ${round(grams, 1)} ${unit}` : ""}`,
    energyKj: usePs ? ps.kj : p100?.kj != null ? (p100.kj * grams) / 100 : null,
    checks,
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
        max_tokens: 500,
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
