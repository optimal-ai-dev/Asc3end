import { useState, useRef, useEffect } from "react";
import { X, Search, ScanBarcode, ChevronLeft, Loader2, Plus, Star, History, Camera, Pencil, Repeat, ScanText, Check } from "lucide-react";
import { uid, todayStr } from "../lib/dateUtils";
import { MEALS, MEAL_LABEL } from "../lib/nutritionHelpers";
import {
  unitOptions, defaultAmount, gramsFor, nutrientsFor, toDiaryEntry, isValidBarcode, myFoodToResult, myFoodFromLabel, searchMyFoods,
  parseAmount, correctSpelling, amountFromQuery, searchHistory, frequentFoods, GRAM_UNIT,
} from "../lib/foodData";
import { readNutritionLabel } from "../lib/labelReader";
import { searchFoods, lookupBarcode } from "../lib/foodSearchClient";

/* ------------------------------------------------------------------ */
/* Add Food sheet — search, barcode and custom entry for one meal       */
/* ------------------------------------------------------------------ */

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

// Chrome on Android ships BarcodeDetector natively; Safari (every iPhone) and desktop Chrome
// don't, so there the ZXing-based ponyfill is loaded on demand. Its .wasm engine is bundled
// with the app instead of fetched from the jsDelivr CDN at scan time, so scanning doesn't
// depend on a third-party host being reachable (or allowed by a network filter).
let detectorPromise = null;
function getBarcodeDetector() {
  detectorPromise ??= (async () => {
    if (typeof window !== "undefined" && "BarcodeDetector" in window) {
      try {
        const supported = await window.BarcodeDetector.getSupportedFormats();
        const formats = BARCODE_FORMATS.filter((f) => supported.includes(f));
        if (formats.length) return new window.BarcodeDetector({ formats });
      } catch (e) { /* fall through to the ponyfill */ }
    }
    const [{ BarcodeDetector, prepareZXingModule }, { default: wasmUrl }] = await Promise.all([
      import("barcode-detector/ponyfill"),
      import("zxing-wasm/reader/zxing_reader.wasm?url"),
    ]);
    prepareZXingModule({
      overrides: { locateFile: (path, prefix) => (path.endsWith(".wasm") ? wasmUrl : prefix + path) },
      fireImmediately: true,
    });
    return new BarcodeDetector({ formats: BARCODE_FORMATS });
  })();
  detectorPromise.catch(() => { detectorPromise = null; });
  return detectorPromise;
}

// EAN/UPC check digit. The decoders already verify it, but checking again means a misread
// can never be looked up as some other product.
export function hasValidCheckDigit(code) {
  if (!/^\d{8}$|^\d{12,13}$/.test(code)) return false;
  const digits = code.split("").map(Number);
  const check = digits.pop();
  const sum = digits.reverse().reduce((acc, d, i) => acc + d * (i % 2 === 0 ? 3 : 1), 0);
  return (10 - (sum % 10)) % 10 === check;
}

// Brand first and unmistakable — on a supermarket search the brand is what tells "Nudie Orange
// Juice" from five other orange juices, so it gets its own bold line above the product name.
function BrandLine({ brand, packSize, size = 11 }) {
  if (!brand && !packSize) return null;
  return (
    <span style={{ display: "flex", alignItems: "center", gap: 6, minWidth: 0 }}>
      {brand && (
        <span style={{ fontSize: size, fontWeight: 800, letterSpacing: "0.06em", textTransform: "uppercase", color: "var(--brass)",
          overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{brand}</span>
      )}
      {packSize && (
        <span className="mono" style={{ fontSize: size - 1, fontWeight: 700, color: "var(--ink)", border: "1px solid var(--line)",
          borderRadius: 6, padding: "0 5px", whiteSpace: "nowrap", flexShrink: 0 }}>{packSize}</span>
      )}
    </span>
  );
}

const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString();
const SOURCE_LABEL = { usda: "USDA", off: "Open Food Facts", mine: "My foods" };

function MacroRow({ totals }) {
  return (
    <div style={{ display: "flex", gap: 8, margin: "12px 0 14px" }}>
      {[["kcal", totals.calories, ""], ["Protein", totals.protein, "g"], ["Carbs", totals.carbs, "g"], ["Fat", totals.fat, "g"]].map(([label, v, unit]) => (
        <div key={label} style={{ flex: 1, textAlign: "center", background: "var(--bg-elev2)", borderRadius: 10, padding: "8px 2px" }}>
          <div className="mono" style={{ fontSize: 17, fontWeight: 800 }}>{fmt(v)}{unit}</div>
          <div style={{ fontSize: 10.5, color: "var(--ink-dim)" }}>{label}</div>
        </div>
      ))}
    </div>
  );
}

function MealPicker({ meal, onChange }) {
  return (
    <div style={{ display: "flex", gap: 6 }} role="group" aria-label="Meal">
      {MEALS.map((m) => (
        <button key={m} onClick={() => onChange(m)} className="pill" aria-pressed={meal === m}
          style={{ flex: 1, justifyContent: "center", cursor: "pointer", border: "none", minHeight: 36, padding: "4px 4px", fontSize: 12, background: meal === m ? "var(--brass-soft)" : "var(--bg-elev2)", color: meal === m ? "var(--brass)" : "var(--ink-dim)" }}>
          {MEAL_LABEL[m]}
        </button>
      ))}
    </div>
  );
}

// Amount picker for one food: a quantity plus a unit (its servings/household measures, grams or
// ounces). Switching unit keeps the same weight where it can, so "150 g" becomes "1.5 × 100 g".
function startingAmount(food, queryAmount) {
  if (queryAmount) return amountFromQuery(food, queryAmount);
  if (food.lastGrams && !food.portions.length) return { quantity: food.lastGrams, unit: GRAM_UNIT };
  return defaultAmount(food);
}

// `queryAmount` is an amount typed with the search ("200g chicken"); a food from the person's
// history otherwise opens at the weight they logged last time.
function FoodDetail({ food, meal, onMealChange, onBack, onAdd, queryAmount }) {
  const units = unitOptions(food);
  const initial = startingAmount(food, queryAmount);
  const [quantity, setQuantity] = useState(String(initial.quantity));
  const [unitIdx, setUnitIdx] = useState(units.findIndex((u) => u.label === initial.unit.label));
  const unit = units[unitIdx];
  const grams = gramsFor(quantity, unit);
  const totals = nutrientsFor(food.per100g, grams);
  const valid = grams > 0;

  const changeUnit = (i) => {
    const next = units[i];
    if (grams > 0) {
      const q = grams / next.grams;
      setQuantity(String(next.label === "g" ? Math.round(q) : Math.round(q * 100) / 100));
    }
    setUnitIdx(i);
  };

  const quick = unit.label === "g" ? [50, 100, 150, 200] : unit.label === "oz" ? [1, 2, 4, 8] : [0.5, 1, 1.5, 2];

  return (
    <div>
      <button onClick={onBack} className="mono" style={{ background: "none", border: "none", color: "var(--ink-dim)", cursor: "pointer", padding: "4px 0", fontSize: 12, display: "flex", alignItems: "center", gap: 2 }}>
        <ChevronLeft size={14} /> Back
      </button>
      <div style={{ marginTop: 8 }}><BrandLine brand={food.brand} packSize={food.packSize} size={13} /></div>
      <div className="disp" style={{ fontSize: 18, marginTop: 2 }}>{food.name}</div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>
        {[SOURCE_LABEL[food.source], food.barcode && `Barcode ${food.barcode}`, `${fmt(food.per100g.calories)} kcal / 100 g`].filter(Boolean).join(" · ")}
      </div>

      <div style={{ display: "flex", gap: 8, marginTop: 16 }}>
        <div style={{ flex: "0 0 92px" }}>
          <label className="mono" htmlFor="food-qty" style={{ fontSize: 10.5, color: "var(--ink-dim)" }}>AMOUNT</label>
          <input id="food-qty" className="atlas-input" type="number" inputMode="decimal" min="0" step="any" value={quantity}
            onChange={(e) => setQuantity(e.target.value)} style={{ marginTop: 4, fontSize: 16 }} />
        </div>
        <div style={{ flex: 1, minWidth: 0 }}>
          <label className="mono" htmlFor="food-unit" style={{ fontSize: 10.5, color: "var(--ink-dim)" }}>SERVING SIZE</label>
          <select id="food-unit" className="atlas-input" value={unitIdx} onChange={(e) => changeUnit(+e.target.value)} style={{ marginTop: 4, fontSize: 15 }}>
            {units.map((u, i) => (
              <option key={u.label} value={i}>{u.label === "g" ? "grams (g)" : u.label === "oz" ? "ounces (oz)" : `${u.label} — ${fmt(u.grams)} g`}</option>
            ))}
          </select>
        </div>
      </div>
      <div style={{ display: "flex", gap: 6, marginTop: 8 }}>
        {quick.map((q) => (
          <button key={q} className="pill" onClick={() => setQuantity(String(q))}
            style={{ flex: 1, justifyContent: "center", cursor: "pointer", border: "1px solid var(--line)", minHeight: 34, background: +quantity === q ? "var(--brass-soft)" : "transparent", color: +quantity === q ? "var(--brass)" : "var(--ink-dim)", fontSize: 12 }}>
            {q}{unit.label === "g" || unit.label === "oz" ? ` ${unit.label}` : "×"}
          </button>
        ))}
      </div>
      {unit.label !== "g" && valid && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>= {fmt(grams)} g</div>}

      <MacroRow totals={totals} />
      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 6 }}>ADD TO</div>
      <MealPicker meal={meal} onChange={onMealChange} />
      <button className="atlas-btn" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={!valid}
        onClick={() => onAdd(toDiaryEntry(food, +quantity, unit, { id: uid(), date: todayStr(), meal, source: food.source }))}>
        <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to {MEAL_LABEL[meal]}
      </button>
    </div>
  );
}

// Fields the label reader filled are outlined so it's obvious what to compare with the pack.
const filledStyle = { borderColor: "var(--brass)", boxShadow: "0 0 0 1px var(--brass)" };

const SCAN_RED = "#FF3B30";
const SCAN_GREEN = "#34C759";

// Live barcode scanner. The frame is red while it's looking and turns green (with a buzz on
// phones that support it) the moment a valid code is read, then the product is looked up.
function BarcodePanel({ onFound, onNotFound, myFoods }) {
  const [status, setStatus] = useState("starting"); // starting | scanning | found | looking | error | nocamera
  const [code, setCode] = useState(null);
  const [error, setError] = useState(null);
  const [manual, setManual] = useState("");
  const [attempt, setAttempt] = useState(0);
  const videoRef = useRef(null);
  const onFoundRef = useRef(onFound);
  const onNotFoundRef = useRef(onNotFound);
  onFoundRef.current = onFound;
  onNotFoundRef.current = onNotFound;

  const lookup = async (raw) => {
    const c = String(raw).trim();
    if (!isValidBarcode(c)) { setError("Barcodes are 6 to 14 digits — check the number."); return; }
    setCode(c);
    setError(null);
    const mine = myFoods.find((m) => m.barcode === c);
    if (mine) { onFoundRef.current(myFoodToResult(mine)); return; }
    setStatus("looking");
    try {
      onFoundRef.current(await lookupBarcode(c));
    } catch (e) {
      if (e.status === 404) { onNotFoundRef.current(c); return; }
      videoRef.current?.srcObject?.getTracks?.().forEach((t) => t.stop());
      setError(e.message);
      setStatus("error");
    }
  };

  useEffect(() => {
    let stream, timer, cancelled = false;
    setStatus("starting");
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({
          video: { facingMode: { ideal: "environment" }, width: { ideal: 1920 }, height: { ideal: 1080 } },
          audio: false,
        });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        // Continuous autofocus where the camera supports it — a barcode held close is unreadable
        // if the lens stays focused at arm's length.
        const track = stream.getVideoTracks()[0];
        if (track?.getCapabilities?.().focusMode?.includes("continuous")) {
          track.applyConstraints({ advanced: [{ focusMode: "continuous" }] }).catch(() => {});
        }
        const video = videoRef.current;
        video.srcObject = stream;
        await video.play().catch(() => {});
        const detector = await getBarcodeDetector();
        if (cancelled) return;
        setStatus("scanning");
        let busy = false;
        timer = setInterval(async () => {
          if (busy || cancelled || video.readyState < 2) return;
          busy = true;
          try {
            const codes = await detector.detect(video);
            // UPC-E's check digit is computed on the expanded UPC-A form, so it's left to the decoder.
            const hit = codes.find((c) => (c.format === "upc_e" ? /^\d{8}$/.test(c.rawValue) : hasValidCheckDigit(c.rawValue)))?.rawValue;
            if (hit && !cancelled) {
              clearInterval(timer);
              navigator.vibrate?.(60);
              setCode(hit);
              setStatus("found");
              // Freeze on the frame that scanned rather than going black; the camera itself is
              // released when the panel closes or the lookup fails.
              video.pause();
              // A brief beat on green so the person sees the scan landed before the screen changes.
              setTimeout(() => !cancelled && lookup(hit), 450);
            }
          } catch (e) { /* frame not decodable yet — keep trying */ }
          busy = false;
        }, 200);
      } catch (e) {
        if (cancelled) return;
        setStatus("nocamera");
        setError(e?.name === "NotAllowedError"
          ? "Camera permission is off for this site. Allow it in your browser settings, or type the number below."
          : "Couldn't start the camera. Type the barcode number below instead.");
      }
    })();
    return () => { cancelled = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [attempt]);

  const green = status === "found" || status === "looking";
  const frameColor = green ? SCAN_GREEN : SCAN_RED;
  const caption = {
    starting: "Starting camera…",
    scanning: "Line the barcode up inside the box",
    found: `Scanned ${code}`,
    looking: `Scanned ${code} — finding the product…`,
    error: "Scan stopped",
  }[status];

  return (
    <div>
      {status !== "nocamera" && (
        <div style={{ position: "relative", background: "#000", borderRadius: 14, overflow: "hidden", aspectRatio: "4 / 3.4", width: "100%" }}>
          <video ref={videoRef} playsInline muted autoPlay style={{ width: "100%", height: "100%", objectFit: "cover", display: "block" }} />
          {/* Dim everything outside the scan window so the box is unmistakable. */}
          <div data-testid="scan-frame" data-state={green ? "found" : "scanning"} style={{
            position: "absolute", left: "7%", right: "7%", top: "24%", bottom: "24%", borderRadius: 14,
            border: `4px solid ${frameColor}`, boxShadow: `0 0 0 9999px rgba(0,0,0,0.45), 0 0 18px ${frameColor}`,
            transition: "border-color 120ms, box-shadow 120ms", display: "flex", alignItems: "center", justifyContent: "center",
          }}>
            {status === "scanning" && <div style={{ position: "absolute", left: 10, right: 10, top: "50%", height: 2, background: SCAN_RED, opacity: 0.8, animation: "scanline 1.6s ease-in-out infinite" }} />}
            {green && (
              <div style={{ width: 54, height: 54, borderRadius: "50%", background: SCAN_GREEN, display: "flex", alignItems: "center", justifyContent: "center" }}>
                {status === "looking" ? <Loader2 size={28} color="#fff" style={{ animation: "spin 1s linear infinite" }} /> : <Check size={32} color="#fff" strokeWidth={3} />}
              </div>
            )}
          </div>
          <div style={{ position: "absolute", left: 0, right: 0, bottom: 10, textAlign: "center" }}>
            <span className="mono" style={{ fontSize: 12.5, color: "#fff", background: green ? SCAN_GREEN : "rgba(0,0,0,0.6)", padding: "5px 10px", borderRadius: 999 }}>{caption}</span>
          </div>
        </div>
      )}
      {status === "error" && (
        <button className="atlas-btn-ghost" style={{ width: "100%", marginTop: 10 }} onClick={() => { setError(null); setAttempt((n) => n + 1); }}>
          <ScanBarcode size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Scan again
        </button>
      )}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <input className="atlas-input" inputMode="numeric" placeholder="Or type the barcode number" value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && lookup(manual)} aria-label="Barcode number" />
        <button className="atlas-btn" onClick={() => lookup(manual)} disabled={status === "looking" || !manual}>{status === "looking" ? "…" : "Find"}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--rest)", marginTop: 10 }}>{error}</div>}
      <style>{"@keyframes scanline { 0%,100% { transform: translateY(-38px); } 50% { transform: translateY(38px); } }"}</style>
    </div>
  );
}

// Custom entry, laid out like a nutrition panel: values per serving plus the serving weight.
// Saved to My foods by default, so it shows up in search (and, with a barcode, in the scanner)
// next time. This is also where an unrecognised barcode lands, with the code filled in.
function LabelPanel({ meal, onMealChange, onAdd, onSaveMyFood, barcode, initialName = "" }) {
  const [form, setForm] = useState({ name: initialName, brand: "", servingGrams: "", servingUnit: "g", calories: "", protein: "", carbs: "", fat: "" });
  const [review, setReview] = useState(null); // what the label reader saw, shown for checking
  const [save, setSave] = useState(true);
  const [reading, setReading] = useState(false);
  const [readError, setReadError] = useState(null);
  const [readDone, setReadDone] = useState(false);
  const photoRef = useRef(null);

  const onPhoto = async (e) => {
    const file = e.target.files?.[0];
    e.target.value = "";
    if (!file) return;
    setReading(true);
    setReadError(null);
    try {
      const { basis, energyKj, checks, ...read } = await readNutritionLabel(file);
      // Keep whatever the person already typed for the name/brand if the label didn't show one.
      setForm((f) => ({ ...read, name: read.name || f.name, brand: read.brand || f.brand }));
      setReview({ basis, energyKj, checks });
      setReadDone(true);
    } catch (err) {
      setReadError(err.message);
    }
    setReading(false);
  };
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.calories !== "";

  const submit = () => {
    const mine = myFoodFromLabel({ id: uid(), barcode, ...form });
    if (save && onSaveMyFood) onSaveMyFood(mine);
    const food = myFoodToResult(mine);
    onAdd(toDiaryEntry(food, 1, food.portions[0], { id: uid(), date: todayStr(), meal, source: "custom" }));
  };

  return (
    <div>
      {barcode && (
        <div style={{ fontSize: 13, color: "var(--ink-dim)", lineHeight: 1.45, marginBottom: 12, background: "var(--bg-elev2)", borderRadius: 10, padding: "10px 12px" }}>
          Barcode <span className="mono" style={{ color: "var(--ink)" }}>{barcode}</span> isn't in the food databases yet. Copy the nutrition panel from the pack once and it'll scan straight away next time.
        </div>
      )}
      <input ref={photoRef} type="file" accept="image/*" capture="environment" onChange={onPhoto} hidden aria-hidden="true" tabIndex={-1} />
      <button className="atlas-btn" style={{ width: "100%", padding: 13, marginBottom: 6 }} onClick={() => photoRef.current?.click()} disabled={reading}>
        {reading
          ? <><Loader2 size={15} style={{ verticalAlign: -3, marginRight: 6, animation: "spin 1s linear infinite" }} /> Reading the label…</>
          : <><ScanText size={16} style={{ verticalAlign: -3, marginRight: 6 }} /> Snap the nutrition label</>}
      </button>
      {readDone && review && !readError ? (
        <div data-testid="label-review" style={{ fontSize: 12.5, lineHeight: 1.45, marginBottom: 12, borderRadius: 10, padding: "10px 12px",
          border: `1px solid ${review.checks.length ? "var(--warn)" : "var(--good)"}`, background: "var(--bg-elev2)" }}>
          <div style={{ fontWeight: 700, color: review.checks.length ? "var(--warn)" : "var(--good)" }}>
            {review.checks.length ? "Read the label — please check before adding" : "Read the label"}
          </div>
          <div style={{ color: "var(--ink-dim)", marginTop: 2 }}>
            Copied {review.basis} ({form.servingGrams} {form.servingUnit})
            {review.energyKj != null && <> · {Math.round(review.energyKj)} kJ = {form.calories} kcal</>}.
            {" "}Tap any number to fix it.
          </div>
          {review.checks.map((c) => <div key={c} style={{ color: "var(--warn)", marginTop: 6 }}>⚠ {c}</div>)}
        </div>
      ) : (
        <div style={{ fontSize: 11.5, color: readError ? "var(--rest)" : "var(--ink-dim)", textAlign: "center", marginBottom: 12 }}>
          {readError || "Fills everything in from a photo of the nutrition panel, or type it below."}
        </div>
      )}
      <input className="atlas-input" placeholder={barcode ? "Product name" : "Food name, e.g. Mum's lasagne"} value={form.name} onChange={set("name")} aria-label="Food name" style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        <input className="atlas-input" placeholder="Brand (optional)" value={form.brand} onChange={set("brand")} aria-label="Brand" />
        <div style={{ flex: "0 0 132px", display: "flex", gap: 4 }}>
          <input className="atlas-input" type="number" inputMode="decimal" placeholder="Serving" value={form.servingGrams} onChange={set("servingGrams")} aria-label="Serving size in grams" style={readDone ? filledStyle : undefined} />
          <select className="atlas-input" value={form.servingUnit} onChange={set("servingUnit")} aria-label="Serving unit" style={{ flex: "0 0 52px", padding: "0 4px" }}>
            <option value="g">g</option><option value="ml">ml</option>
          </select>
        </div>
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 6 }}>PER SERVING{form.servingGrams ? ` (${form.servingGrams} ${form.servingUnit.toUpperCase()})` : ` (100 ${form.servingUnit.toUpperCase()} IF BLANK)`}</div>
      <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
        {[["calories", "kcal", "kcal", "kcal"], ["protein", "P (g)", "protein g", "Protein"], ["carbs", "C (g)", "carbs g", "Carbs"], ["fat", "F (g)", "fat g", "Fat"]].map(([k, ph, label, title]) => (
          <div key={k} style={{ flex: 1, minWidth: 0 }}>
            <input className="atlas-input" type="number" inputMode="decimal" placeholder={ph} value={form[k]} onChange={set(k)} aria-label={label} style={readDone ? filledStyle : undefined} />
            {readDone && <div className="mono" style={{ fontSize: 9.5, color: "var(--ink-dim)", textAlign: "center", marginTop: 3 }}>{title}</div>}
          </div>
        ))}
      </div>
      {onSaveMyFood && (
        <label style={{ display: "flex", alignItems: "center", gap: 8, fontSize: 13, color: "var(--ink-dim)", marginBottom: 14, cursor: "pointer" }}>
          <input type="checkbox" checked={save} onChange={(e) => setSave(e.target.checked)} style={{ width: 18, height: 18, accentColor: "var(--brass)" }} />
          Save to My foods so I can find it again
        </label>
      )}
      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 6 }}>ADD TO</div>
      <MealPicker meal={meal} onChange={onMealChange} />
      <button className="atlas-btn" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={!valid} onClick={submit}>
        <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to {MEAL_LABEL[meal]}
      </button>
    </div>
  );
}

export function AddFoodSheet({ initialMeal, onAdd, onClose, recentFoods = [], favorites = [], myFoods = [], diary = [], onSaveMyFood, onOpenPhotoScan }) {
  const [meal, setMeal] = useState(initialMeal);
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
  const [partial, setPartial] = useState(false);
  const [unknownBarcode, setUnknownBarcode] = useState(null);
  const [customName, setCustomName] = useState("");
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState(null);
  const [selected, setSelected] = useState(null);
  const dialogRef = useRef(null);
  const triggerRef = useRef(typeof document !== "undefined" ? document.activeElement : null);
  const abortRef = useRef(null);

  // Same focus trap as the food scanner: keep Tab inside the sheet, Escape closes, and focus goes
  // back to the button that opened it.
  useEffect(() => {
    const focusable = () => Array.from(
      dialogRef.current?.querySelectorAll('button, input, select, textarea, [tabindex]:not([tabindex="-1"])') || []
    ).filter((el) => !el.disabled && el.offsetParent !== null);
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
    const prevOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.removeEventListener("keydown", handleKeyDown);
      document.body.style.overflow = prevOverflow;
      triggerRef.current?.focus?.();
    };
  }, []);

  // Debounced search: waits for a pause in typing, and cancels the previous request so a slow
  // response for "chick" can't overwrite the results for "chicken breast".
  // What's actually searched: an amount typed with the food ("200g chicken") is split off, and
  // misspelt food words are corrected ("chiken brest" → "chicken breast").
  const { food: foodText, amount: queryAmount } = parseAmount(query.trim());
  const corrected = correctSpelling(foodText);
  const searchText = corrected.text;

  useEffect(() => {
    const q = searchText;
    abortRef.current?.abort();
    if (q.length < 2) { setResults(null); setLoading(false); setError(null); setPartial(false); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchFoods(q, ctrl.signal);
        if (!ctrl.signal.aborted) { setResults(r.results); setPartial(r.partial); setError(null); }
      } catch (e) {
        if (e.name !== "AbortError") { setError(e.message); setResults(null); }
      }
      if (!ctrl.signal.aborted) setLoading(false);
    }, 500);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [searchText]);

  const add = (entry) => { onAdd(entry); onClose(); };
  // The person's own foods are matched on the device, so they appear instantly (and still work
  // when the databases are down): what they've logged before first, then My foods.
  const typed = searchText.length >= 2;
  const past = typed ? searchHistory(diary, searchText) : [];
  const mine = typed ? searchMyFoods(myFoods, searchText).filter((m) => !past.some((p) => p.name.toLowerCase() === m.name.toLowerCase())) : [];
  const own = [...past, ...mine];
  const fullName = (x) => (x.brand ? `${x.name} (${x.brand})` : x.name).toLowerCase();
  const sameAsOwn = (r) => own.some((o) => (o.barcode && o.barcode === r.barcode) || fullName(o) === fullName(r));
  const shown = results || own.length ? [...own, ...(results || []).filter((r) => !sameAsOwn(r))] : null;
  const frequent = frequentFoods(diary);
  const recentOnly = recentFoods.filter((r) => !frequent.some((f) => f.name === r.name));
  const goCustom = () => { setCustomName(searchText); setUnknownBarcode(null); setTab("custom"); };
  const addSaved = (f) => add({ id: uid(), date: todayStr(), meal, name: f.name, calories: f.calories, protein: f.protein, carbs: f.carbs, fat: f.fat, ...(f.grams ? { grams: f.grams, amount: f.amount, per100g: f.per100g } : {}) });

  const tabs = [["search", "Search", Search], ["barcode", "Barcode", ScanBarcode], ["custom", "Custom", Pencil]];

  const savedList = (title, Icon, items) => items.length > 0 && (
    <div style={{ marginBottom: 14 }}>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 4, display: "flex", alignItems: "center", gap: 4 }}><Icon size={11} /> {title}</div>
      {items.map((f, i) => (
        <button key={`${f.name}-${i}`} onClick={() => addSaved(f)} style={rowStyle}>
          <span style={{ minWidth: 0 }}>
            <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
            <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>{f.amount ? `${f.amount} · ` : ""}{f.calories} kcal · P {f.protein} · C {f.carbs} · F {f.fat}</span>
          </span>
          <Plus size={18} color="var(--brass)" style={{ flexShrink: 0 }} aria-label={`Add ${f.name}`} />
        </button>
      ))}
    </div>
  );

  return (
    <div ref={dialogRef} role="dialog" aria-modal="true" aria-label={`Add food to ${MEAL_LABEL[meal]}`}
      style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 50, display: "flex", flexDirection: "column", maxWidth: 480, margin: "0 auto" }}>
      <div style={{ padding: "calc(14px + env(safe-area-inset-top)) 18px 0" }}>
        <div style={{ display: "flex", justifyContent: "space-between", alignItems: "center", marginBottom: 12 }}>
          <div className="disp" style={{ fontSize: 18 }}>Add to {MEAL_LABEL[meal]}</div>
          <button onClick={onClose} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }} aria-label="Close"><X size={20} color="var(--ink)" /></button>
        </div>
        {!selected && (
          <div style={{ display: "flex", gap: 6, marginBottom: 12 }} role="tablist">
            {tabs.map(([id, label, Icon]) => (
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError(null); setUnknownBarcode(null); setCustomName(""); }} className="pill"
                style={{ flex: 1, justifyContent: "center", cursor: "pointer", border: "1px solid var(--line)", minHeight: 40, gap: 5, background: tab === id ? "var(--brass-soft)" : "transparent", color: tab === id ? "var(--brass)" : "var(--ink-dim)" }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "3px 18px calc(18px + env(safe-area-inset-bottom))" }}>
        {selected ? (
          <FoodDetail food={selected} meal={meal} onMealChange={setMeal} onBack={() => setSelected(null)} onAdd={add} queryAmount={tab === "search" ? queryAmount : null} />
        ) : tab === "search" ? (
          <>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={16} color="var(--ink-dim)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="atlas-input" autoFocus placeholder="Search foods, brands, restaurants…" value={query}
                onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 36, fontSize: 16 }} aria-label="Search foods" enterKeyHint="search" />
            </div>
            {corrected.changed && (
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 8 }}>
                Showing results for <b style={{ color: "var(--ink)" }}>{searchText}</b>
              </div>
            )}
            {queryAmount && typed && (
              <div style={{ fontSize: 12, color: "var(--ink-dim)", marginBottom: 8 }}>
                Tap a food to add it with {queryAmount.grams ? `${queryAmount.grams} g` : queryAmount.ounces ? `${queryAmount.ounces} oz` : `${queryAmount.servings} × ${queryAmount.hint || "serving"}`} filled in.
              </div>
            )}
            {loading && <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Searching…</div>}
            {error && <div style={{ fontSize: 12, color: "var(--rest)", marginBottom: 10 }}>{error}</div>}
            {partial && !loading && (
              <div style={{ fontSize: 12, color: "var(--warn)", marginBottom: 10 }}>Some food databases didn't respond, so this list may be incomplete. Try again in a moment.</div>
            )}
            {shown && !loading && shown.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 12 }}>
                No matches for “{searchText}”. Try fewer words (“kirkland chicken” rather than the full pack name), or add it below.
              </div>
            )}
            {shown && shown.map((f) => {
              const d = startingAmount(f);
              const kcal = nutrientsFor(f.per100g, gramsFor(d.quantity, d.unit)).calories;
              return (
                <button key={f.id} onClick={() => setSelected(f)} style={rowStyle}>
                  <span style={{ minWidth: 0 }}>
                    <BrandLine brand={f.brand} packSize={f.packSize} />
                    <span style={{ display: "block", fontSize: 14, fontWeight: f.brand ? 600 : 400, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[f.history ? "Logged before" : f.mine ? "My foods" : null, d.unit.label === "g" ? `${d.quantity} g` : d.unit.label, `${kcal} kcal`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Plus size={18} color="var(--brass)" style={{ flexShrink: 0 }} aria-hidden="true" />
                </button>
              );
            })}
            {/* The way out when a product isn't there — always one tap away, under every search. */}
            {typed && (
              <div style={{ borderTop: "1px solid var(--line)", paddingTop: 12, marginTop: shown && shown.length ? 4 : 0 }}>
                <div style={{ fontSize: 13, fontWeight: 700, marginBottom: 8 }}>Can't find it?</div>
                <div style={{ display: "flex", gap: 6 }}>
                  <button className="atlas-btn-ghost" style={{ flex: 1, padding: "10px 4px", fontSize: 12 }} onClick={() => { setUnknownBarcode(null); setTab("barcode"); }}>
                    <ScanBarcode size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Scan barcode
                  </button>
                  <button className="atlas-btn-ghost" style={{ flex: 1, padding: "10px 4px", fontSize: 12 }} onClick={goCustom}>
                    <ScanText size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Snap the label
                  </button>
                  <button className="atlas-btn-ghost" style={{ flex: 1, padding: "10px 4px", fontSize: 12 }} onClick={goCustom}>
                    <Pencil size={14} style={{ verticalAlign: -2, marginRight: 4 }} /> Type it in
                  </button>
                </div>
              </div>
            )}
            {!shown && !loading && (
              <>
                {savedList("FREQUENT", Repeat, frequent)}
                {savedList("FAVORITES", Star, favorites)}
                {savedList("RECENT", History, recentOnly)}
                {onOpenPhotoScan && (
                  <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 12 }} onClick={onOpenPhotoScan}>
                    <Camera size={14} style={{ verticalAlign: -2, marginRight: 6 }} /> Snap a photo of your meal instead
                  </button>
                )}
              </>
            )}
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", lineHeight: 1.5, marginTop: 8 }}>
              Food data from USDA FoodData Central and Open Food Facts (ODbL). Packaged-food entries are crowd-sourced, so check the label if something looks off.
            </div>
          </>
        ) : tab === "barcode" ? (
          <BarcodePanel onFound={setSelected} myFoods={myFoods} onNotFound={(code) => { setUnknownBarcode(code); setTab("custom"); }} />
        ) : (
          <LabelPanel key={unknownBarcode || `custom:${customName}`} meal={meal} onMealChange={setMeal} onAdd={add} onSaveMyFood={onSaveMyFood} barcode={unknownBarcode} initialName={unknownBarcode ? "" : customName} />
        )}
      </div>
    </div>
  );
}

const rowStyle = {
  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left",
  background: "none", border: "none", borderTop: "1px solid var(--line)", padding: "10px 2px", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit", minHeight: 52,
};
