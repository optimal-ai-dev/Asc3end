import { useState, useRef, useEffect, useMemo } from "react";
import {
  X, AlertTriangle, Camera, RefreshCw, Plus, MapPin, Navigation, Loader2, Search, Star, Copy,
  Sparkles, Pencil, Trash2
} from "lucide-react";
import { supabase } from "../lib/supabase";
import { getNutritionTargets } from "../lib/nutritionMath";
import { remainingMonthlyUses, FEATURES } from "../lib/entitlements";
import { uid, todayStr, yesterdayStr } from "../lib/dateUtils";
import { extractClaudeText, extractJSON, callClaude } from "../lib/claudeClient";
import { GOAL_LABELS } from "../lib/workoutHelpers";
import {
  weeklyAdherence, ADHERENCE_LABEL, ADHERENCE_COLOR, mealMacroGuidance, scoreBestMeal, QUICK_FOODS,
  MEALS, MEAL_LABEL, defaultMealForHour, groupByMeal
} from "../lib/nutritionHelpers";
import { Paywall } from "../components/Paywall";
import { HomeMealIdeas } from "../components/HomeMealIdeas";
import { WeeklyCheckIn } from "../components/WeeklyCheckIn";
import { AddFoodSheet } from "../components/AddFoodSheet";
import { WaterTracker } from "../components/WaterTracker";
import { nutrientsFor } from "../lib/foodData";
import { NumberInput } from "../components/NumberInput";

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
      if (response.status === 429 && data?.error?.code === "monthly_limit_reached") {
        const err = new Error(data.error.message);
        err.code = "monthly_limit_reached";
        throw err;
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
        e.message && (e.code === "monthly_limit_reached" || e.message.startsWith("Usage limit") || e.message.includes("Premium"))
          ? e.message
          : "Couldn't identify that photo — try better lighting, or log it manually."
      );
    }
    setLoading(false);
  };

  // Downscales any drawImage-able source (a live <video> frame or a loaded <img>) to a capped
  // resolution before encoding — a full-resolution phone photo can be several MB, which is both
  // slower to upload and larger than it needs to be for the model to read the label/plate. This
  // is the actual file-upload size/type validation for the scanner: constrain what leaves the
  // browser rather than trust an arbitrary file's size.
  const MAX_IMAGE_DIM = 1024;
  const downscaleToBase64 = (source, naturalWidth, naturalHeight) => {
    const scale = Math.min(1, MAX_IMAGE_DIM / Math.max(naturalWidth, naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.round(naturalWidth * scale);
    canvas.height = Math.round(naturalHeight * scale);
    canvas.getContext("2d").drawImage(source, 0, 0, canvas.width, canvas.height);
    return canvas.toDataURL("image/jpeg", 0.8).split(",")[1];
  };

  const capturePhoto = async () => {
    if (!videoRef.current) return;
    const video = videoRef.current;
    const base64 = downscaleToBase64(video, video.videoWidth, video.videoHeight);
    stopCamera();
    await analyzeImage(base64);
  };

  const MAX_UPLOAD_BYTES = 15 * 1024 * 1024; // 15MB — generous for a phone photo, rejects anything absurd before it's even read
  const handleFileUpload = (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    if (!file.type.startsWith("image/")) { setError("Please choose an image file."); return; }
    if (file.size > MAX_UPLOAD_BYTES) { setError("That image is too large — try a smaller photo."); return; }
    const reader = new FileReader();
    reader.onload = () => {
      const img = new Image();
      img.onload = () => analyzeImage(downscaleToBase64(img, img.naturalWidth, img.naturalHeight));
      img.onerror = () => setError("Couldn't read that image — try a different file.");
      img.src = reader.result;
    };
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
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label="Scan food" style={{ position: "fixed", inset: 0, background: "rgba(10,11,13,0.95)", zIndex: 50, display: "flex", flexDirection: "column", padding: "calc(18px + env(safe-area-inset-top)) 18px 18px", maxWidth: 480, margin: "0 auto" }}>
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
            {result.source === "barcode" ? "From Open Food Facts (ODbL)" : "From photo scan"} · {result.per100g.calories} kcal / 100g
          </div>
          <label className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>PORTION SIZE — ADJUST IF NEEDED (GRAMS)</label>
          <NumberInput className="atlas-input" value={grams} zeroAsEmpty onChange={(v) => setGrams(v === "" ? 0 : +v)} style={{ marginTop: 4, marginBottom: 12 }} />
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

function WeeklyAdherence({ nutrition, targets }) {
  const days = useMemo(() => weeklyAdherence(nutrition, targets), [nutrition, targets]);
  return (
    <div>
      <div style={{ display: "flex", gap: 6, justifyContent: "space-between" }}>
        {days.map((d) => (
          <div key={d.date} style={{ display: "flex", flexDirection: "column", alignItems: "center", gap: 4, flex: 1 }} title={`${d.date}: ${ADHERENCE_LABEL[d.level]}`}>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{d.weekday}</div>
            <div style={{ width: "100%", maxWidth: 32, aspectRatio: "1", borderRadius: 7, background: ADHERENCE_COLOR[d.level], border: d.level === "none" ? "1px solid var(--line)" : "none" }} />
          </div>
        ))}
      </div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 10, marginTop: 10, fontSize: 9.5 }} className="mono">
        {["good", "partial", "off"].map((lvl) => (
          <span key={lvl} style={{ display: "flex", alignItems: "center", gap: 4, color: "var(--ink-dim)" }}>
            <span style={{ width: 8, height: 8, borderRadius: 2, background: ADHERENCE_COLOR[lvl], display: "inline-block" }} />{ADHERENCE_LABEL[lvl]}
          </span>
        ))}
      </div>
    </div>
  );
}

export function Nutrition({ profile, nutrition, weightlog = [], onUpdateProfile, onAdd, onAddMany, onDelete, onEdit, favorites, onToggleFavorite, water, myFoods, onSaveMyFood, onAddWater, onDeleteWater, isPremium, onUpgrade, usage, onUsageChange }) {
  const mealsRemaining = remainingMonthlyUses(FEATURES.MEALS, usage || {});
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const [estimating, setEstimating] = useState(false);
  const [scannerOpen, setScannerOpen] = useState(false);
  // The meal the Add Food sheet is open for, or null when it's closed.
  const [addSheetMeal, setAddSheetMeal] = useState(null);
  const backgroundRef = useRef(null);
  // React 18 doesn't recognize `inert` as a boolean HTML attribute (that's new in React 19), so
  // passing it as a JSX prop silently renders nothing — set the DOM property directly instead,
  // which every modern browser reflects to the real attribute regardless of React's version.
  useEffect(() => {
    if (backgroundRef.current) backgroundRef.current.inert = scannerOpen || !!addSheetMeal;
  }, [scannerOpen, addSheetMeal]);
  const [locationInput, setLocationInput] = useState("");
  const [mealTiming, setMealTiming] = useState("post");
  const [findingMeals, setFindingMeals] = useState(false);
  const [mealResults, setMealResults] = useState(null);
  const [mealError, setMealError] = useState(null);
  const [editingId, setEditingId] = useState(null);
  const [editForm, setEditForm] = useState(null);
  // Which diary section new entries go into — defaults from the time of day, changed by tapping a
  // section's "+ Add food" or the picker above the add tools.
  const [activeMeal, setActiveMeal] = useState(() => defaultMealForHour(new Date().getHours()));
  const addSectionRef = useRef(null);
  const addFood = (f) => onAdd({ ...f, meal: f.meal || activeMeal });
  const targets = getNutritionTargets(profile);
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
  // The Add Food sheet's history list does include today, the way MyFitnessPal's does — logging
  // the same coffee at breakfast and again in the afternoon is the common case there.
  const historyFoods = [...nutrition]
    .sort((a, b) => (b.date > a.date ? 1 : -1))
    .reduce((acc, f) => (acc.some((x) => x.name === f.name) ? acc : [...acc, f]), [])
    .slice(0, 15);
  const portionFields = (f) => (f.grams && f.per100g ? { grams: f.grams, amount: f.amount, per100g: f.per100g } : {});

  const submit = () => {
    if (!form.name || !form.calories) return;
    addFood({
      id: uid(), date: todayStr(), name: form.name,
      calories: +form.calories || 0, protein: +form.protein || 0,
      carbs: +form.carbs || 0, fat: +form.fat || 0,
    });
    setForm({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  };

  const copyYesterday = () => {
    onAddMany(yesterday.map((f) => ({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, meal: f.meal || activeMeal, ...portionFields(f) })));
  };

  const duplicateFood = (f) => {
    addFood({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, meal: f.meal, ...portionFields(f) });
  };

  const startEdit = (f) => {
    setEditingId(f.id);
    setEditForm({ name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, meal: f.meal || "", grams: f.grams ?? "", per100g: f.per100g || null });
  };

  // Entries added from the food database remember their per-100 g values, so changing the grams
  // rescales every macro instead of making the person redo the maths.
  const setEditGrams = (value) => setEditForm((v) => {
    const g = +value;
    if (!v.per100g || !(g > 0)) return { ...v, grams: value };
    return { ...v, grams: value, ...nutrientsFor(v.per100g, g) };
  });

  const entryGrams = (id) => nutrition.find((n) => n.id === id)?.grams;
  const saveEdit = () => {
    if (!editForm.name || editForm.calories === "") return;
    onEdit(editingId, {
      name: editForm.name, calories: +editForm.calories || 0,
      protein: +editForm.protein || 0, carbs: +editForm.carbs || 0, fat: +editForm.fat || 0,
      ...(editForm.meal ? { meal: editForm.meal } : {}),
      ...(editForm.per100g && +editForm.grams > 0 && +editForm.grams !== entryGrams(editingId) ? { grams: +editForm.grams, amount: `${+editForm.grams} g` } : {}),
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
      const prompt = `Find 4 real food places near "${locationText}" that are OPEN RIGHT NOW and still serving food. Asc3end is a fitness app — someone using this feature is specifically trying to hit a training-goal macro target, not just find the nearest thing that's open, so the result list must not default to fast food out of convenience. Hard rule: at most 1 of the 4 places may be a fast-food chain (McDonald's, KFC, Subway, etc.) — the other 3+ must be genuinely different options: a casual/local restaurant, a cafe, a poke/salad/grain-bowl place, a grocery store or deli with prepared food, or similar. If fewer than 4 non-fast-food places are realistically open right now near that location, it is fine to include more than 1 fast-food option, but only as a last resort — actively search for and prefer the healthier, non-fast-food options first. Do not include any place that would be closed at this time, and do not suggest a menu item that isn't actually served at this hour.

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
      <h1 className="disp-title" style={{ fontSize: 26, marginBottom: 4 }}>Nutrition</h1>
      <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 12 }}>Daily target: {targets.calories} kcal · {targets.protein}g protein</div>

      <div style={{ display: "flex", gap: 8, marginBottom: 16 }}>
        <button className="atlas-btn" style={{ flex: 3, padding: 13 }} onClick={() => setAddSheetMeal(activeMeal)}>
          <Plus size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Add Food
        </button>
        <button className="atlas-btn-ghost" style={{ flex: 2, padding: 13 }} onClick={() => setScannerOpen(true)}>
          <Camera size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Photo Scan
        </button>
      </div>
      {addSheetMeal && (
        <AddFoodSheet
          initialMeal={addSheetMeal} onAdd={addFood} onClose={() => setAddSheetMeal(null)}
          favorites={favorites} recentFoods={historyFoods} myFoods={myFoods} diary={nutrition} onSaveMyFood={onSaveMyFood}
          onOpenPhotoScan={() => { setAddSheetMeal(null); setScannerOpen(true); }}
        />
      )}
      {scannerOpen && (isPremium ? (
        <FoodScanner onAdd={addFood} onClose={() => setScannerOpen(false)} />
      ) : (
        <div style={{ marginBottom: 16 }}>
          <Paywall feature="scanner" onUpgrade={onUpgrade} />
          <button onClick={() => setScannerOpen(false)} className="mono" style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 11 }}>Maybe later</button>
        </div>
      ))}

      {/* Hidden from assistive tech and keyboard focus while the scanner dialog is open, so
          screen readers and Tab navigation can't reach content buried behind it. */}
      <div ref={backgroundRef} aria-hidden={scannerOpen || !!addSheetMeal || undefined}>
      {/* Calories remaining leads, the way MyFitnessPal and Cronometer do it: the number people
          actually act on is what's left today, not what's been eaten. */}
      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", letterSpacing: 0.5 }}>
          {totals.calories > targets.calories ? "CALORIES OVER" : "CALORIES REMAINING"}
        </div>
        <div className="mono" style={{ fontSize: 44, fontWeight: 800, letterSpacing: "-0.02em", lineHeight: 1.1, color: totals.calories > targets.calories ? "var(--warn)" : "var(--ink)" }}>
          {Math.abs(Math.round(targets.calories - totals.calories)).toLocaleString()}
        </div>
        <div className="bar-track" style={{ marginTop: 8 }}><div className="bar-fill" style={{ width: `${Math.min(100, (totals.calories / targets.calories) * 100)}%`, background: totals.calories > targets.calories ? "var(--warn)" : "var(--brass)" }} /></div>
        <div style={{ display: "flex", justifyContent: "space-between", marginTop: 10, textAlign: "center" }} className="mono">
          {[["Goal", targets.calories], ["−"], ["Food", totals.calories], ["="], [totals.calories > targets.calories ? "Over" : "Left", Math.abs(targets.calories - totals.calories)]].map(([label, val], i) => (
            val === undefined
              ? <div key={i} style={{ color: "var(--ink-dim)", alignSelf: "center" }}>{label}</div>
              : <div key={i}><div style={{ fontSize: 16, fontWeight: 800, color: i === 4 ? (totals.calories > targets.calories ? "var(--warn)" : "var(--brass)") : "var(--ink)" }}>{Math.round(val).toLocaleString()}</div><div style={{ fontSize: 11, color: "var(--ink-dim)" }}>{label}</div></div>
          ))}
        </div>
        <div style={{ display: "flex", gap: 14, marginTop: 16 }}>
          {[["Protein", totals.protein, targets.protein, "var(--steel)"], ["Carbs", totals.carbs, targets.carbs, "var(--good)"], ["Fat", totals.fat, targets.fat, "var(--warn)"]].map(([label, val, target, color]) => (
            <div key={label} style={{ flex: 1, minWidth: 0 }}>
              <div style={{ fontSize: 12, color: val > target ? "var(--warn)" : "var(--ink-dim)", fontWeight: 600 }}>{label}</div>
              <div className="mono" style={{ fontSize: 15, fontWeight: 800 }}>{Math.round(val)}<span style={{ fontSize: 11, color: "var(--ink-dim)", fontWeight: 600 }}> / {Math.round(target)}g</span></div>
              <div className="bar-track" style={{ height: 6, marginTop: 5 }}><div className="bar-fill" style={{ width: `${Math.min(100, target > 0 ? (val / target) * 100 : 0)}%`, background: color }} /></div>
            </div>
          ))}
        </div>
      </div>

      <WaterTracker profile={profile} water={water} onAdd={onAddWater} onDelete={onDeleteWater} onUpdateProfile={onUpdateProfile} />

      {/* Today's diary, grouped by meal. Sections with nothing in them still show (with their
          "+ Add food"), except "Earlier entries", which only exists for pre-meal-tracking logs. */}
      {(() => {
        const groups = groupByMeal(today);
        return [...MEALS, "other"].filter((m) => m !== "other" || groups.other.length > 0).map((meal) => {
          const items = groups[meal];
          const kcal = items.reduce((n, f) => n + f.calories, 0);
          return (
            <div key={meal} className="atlas-card" style={{ marginBottom: 10, paddingBottom: meal === "other" ? 6 : 10 }}>
              <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", marginBottom: items.length ? 8 : 0 }}>
                <h2 className="disp" style={{ fontSize: 16 }}>{MEAL_LABEL[meal]}</h2>
                <span className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>{Math.round(kcal)} kcal</span>
              </div>
            {items.map((f) => {
              const isFav = favorites.some((fv) => fv.name === f.name);
              return (
              <div key={f.id} style={{ padding: "10px 0", borderTop: "1px solid var(--line)" }}>
                {editingId === f.id ? (
                  <div>
                    <input className="atlas-input" style={{ marginBottom: 6 }} value={editForm.name} onChange={(e) => setEditForm((v) => ({ ...v, name: e.target.value }))} aria-label="Edit food name" />
                    <select className="atlas-input" style={{ marginBottom: 6 }} value={editForm.meal} onChange={(e) => setEditForm((v) => ({ ...v, meal: e.target.value }))} aria-label="Edit meal">
                      {!editForm.meal && <option value="">{MEAL_LABEL.other}</option>}
                      {MEALS.map((m) => <option key={m} value={m}>{MEAL_LABEL[m]}</option>)}
                    </select>
                    {editForm.per100g && (
                      <label className="mono" style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 11, color: "var(--ink-dim)", marginBottom: 6 }}>
                        AMOUNT (G)
                        <NumberInput className="atlas-input" inputMode="decimal" value={editForm.grams} onChange={(v) => setEditGrams(v)} aria-label="Edit amount in grams" style={{ flex: 1 }} />
                      </label>
                    )}
                    <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
                      <NumberInput className="atlas-input" placeholder="kcal" value={editForm.calories} onChange={(v) => setEditForm((f) => ({ ...f, calories: v }))} aria-label="Edit calories" />
                      <NumberInput className="atlas-input" placeholder="protein" value={editForm.protein} onChange={(v) => setEditForm((f) => ({ ...f, protein: v }))} aria-label="Edit protein" />
                      <NumberInput className="atlas-input" placeholder="carbs" value={editForm.carbs} onChange={(v) => setEditForm((f) => ({ ...f, carbs: v }))} aria-label="Edit carbs" />
                      <NumberInput className="atlas-input" placeholder="fat" value={editForm.fat} onChange={(v) => setEditForm((f) => ({ ...f, fat: v }))} aria-label="Edit fat" />
                    </div>
                    <div style={{ display: "flex", gap: 8 }}>
                      <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={() => { setEditingId(null); setEditForm(null); }}>Cancel</button>
                      <button className="atlas-btn" style={{ flex: 1 }} onClick={saveEdit}>Save</button>
                    </div>
                  </div>
                ) : (
                  <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center" }}>
                    <div>
                      <div style={{ fontSize: 14 }}>{f.name}</div>
                      <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{f.amount ? `${f.amount} · ` : ""}{f.calories} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</div>
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
              {meal !== "other" && (
                <button onClick={() => { setActiveMeal(meal); setAddSheetMeal(meal); }} aria-label={`Add food to ${MEAL_LABEL[meal]}`}
                  style={{ display: "flex", alignItems: "center", justifyContent: "center", gap: 6, width: "100%", marginTop: items.length ? 8 : 10, minHeight: 42, borderRadius: 10, border: "1px dashed var(--brass)", background: "var(--brass-soft)", color: "var(--brass)", fontWeight: 800, fontSize: 13.5, cursor: "pointer" }}>
                  <Plus size={16} /> Add food
                </button>
              )}
            </div>
          );
        });
      })()}

      <h2 ref={addSectionRef} className="disp" style={{ fontSize: 16, margin: "18px 0 8px", scrollMarginTop: 16 }}>Quick add to</h2>
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {MEALS.map((m) => (
          <button key={m} onClick={() => setActiveMeal(m)} className="pill" aria-pressed={activeMeal === m}
            style={{ flex: 1, justifyContent: "center", cursor: "pointer", border: "none", minHeight: 40, padding: "4px 6px", fontSize: 13, background: activeMeal === m ? "var(--brass-soft)" : "var(--bg-elev2)", color: activeMeal === m ? "var(--brass)" : "var(--ink-dim)" }}>
            {MEAL_LABEL[m]}
          </button>
        ))}
      </div>

      <div className="disp" style={{ fontSize: 14, color: "var(--ink-dim)", marginBottom: 8 }}>Quick Add</div>
      <div style={{ display: "flex", flexWrap: "wrap", gap: 6, marginBottom: 16 }}>
        {QUICK_FOODS.map((f) => (
          <button key={f.name} onClick={() => addFood({ id: uid(), date: todayStr(), ...f })}
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
              <button key={f.name} onClick={() => addFood({ id: uid(), date: todayStr(), ...f })}
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
              <button key={f.id} onClick={() => addFood({ id: uid(), date: todayStr(), name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat })}
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
          <NumberInput className="atlas-input" placeholder="kcal" value={form.calories} onChange={(v) => setForm((f) => ({ ...f, calories: v }))} aria-label="Calories" />
          <NumberInput className="atlas-input" placeholder="protein" value={form.protein} onChange={(v) => setForm((f) => ({ ...f, protein: v }))} aria-label="Protein grams" />
          <NumberInput className="atlas-input" placeholder="carbs" value={form.carbs} onChange={(v) => setForm((f) => ({ ...f, carbs: v }))} aria-label="Carbs grams" />
          <NumberInput className="atlas-input" placeholder="fat" value={form.fat} onChange={(v) => setForm((f) => ({ ...f, fat: v }))} aria-label="Fat grams" />
        </div>
        <button className="atlas-btn" style={{ width: "100%", marginTop: 8 }} onClick={submit}>Add to Log</button>
      </div>

      <div className="atlas-card" style={{ marginBottom: 16 }}>
        <h2 className="disp" style={{ fontSize: 14, marginBottom: 2 }}>7-Day Adherence</h2>
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 10 }}>How close you've landed to your targets each day.</div>
        <WeeklyAdherence nutrition={nutrition} targets={targets} />
      </div>

      <HomeMealIdeas
        targets={targets} totals={totals} onAdd={addFood}
        vegetarian={!!profile.vegetarian}
        onToggleVegetarian={(v) => onUpdateProfile?.({ ...profile, vegetarian: v })}
      />

      {onUpdateProfile && (
        <WeeklyCheckIn profile={profile} nutrition={nutrition} weightlog={weightlog} targets={targets} onUpdateProfile={onUpdateProfile} />
      )}

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
            <span className="mono" style={{ fontSize: 10, color: "var(--brass)" }}>{mealsRemaining} free left this month</span>
          )}
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <button onClick={() => setMealTiming("pre")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "pre" ? "var(--brass-soft)" : "transparent", color: mealTiming === "pre" ? "var(--brass)" : "var(--ink-dim)" }}>Pre-Workout</button>
          <button onClick={() => setMealTiming("post")} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", border: "1px solid var(--line)", background: mealTiming === "post" ? "var(--brass-soft)" : "transparent", color: mealTiming === "post" ? "var(--brass)" : "var(--ink-dim)" }}>Post-Workout</button>
        </div>
        <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
          <input className="atlas-input" placeholder="Suburb or city" value={locationInput} onChange={(e) => setLocationInput(e.target.value)} />
        </div>
        {/* Previously an icon-only button with no visible text — real feedback was that people
            didn't notice it was there at all. A clearly labeled button is unmistakable, and
            visually distinct from the "search by typed location" flow below it. */}
        <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 8, fontSize: 12 }} onClick={useDeviceLocation} disabled={findingMeals}>
          <Navigation size={13} color="var(--brass)" style={{ verticalAlign: -2, marginRight: 6 }} />
          {findingMeals ? "Finding your location…" : "Use My Current Location"}
        </button>
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
                <div style={{ fontSize: 13, color: "var(--ink)", fontWeight: 600, marginTop: 5 }}>{p.item}</div>
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
                  onClick={() => addFood({ id: uid(), date: todayStr(), name: `${p.item} (${p.name})`, calories: p.calories || 0, protein: p.protein || 0, carbs: p.carbs || 0, fat: p.fat || 0 })}
                >
                  <Plus size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Log this meal
                </button>
              </div>
            ))}
          </div>
        )}
      </div>
      )}
      </div>
    </div>
  );
}
