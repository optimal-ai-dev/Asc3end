import { useState, useRef, useEffect } from "react";
import { X, Search, ScanBarcode, ChevronLeft, Loader2, Plus, Star, History, Camera, Pencil } from "lucide-react";
import { uid, todayStr } from "../lib/dateUtils";
import { MEALS, MEAL_LABEL } from "../lib/nutritionHelpers";
import { unitOptions, defaultAmount, gramsFor, nutrientsFor, toDiaryEntry, isValidBarcode } from "../lib/foodData";
import { searchFoods, lookupBarcode } from "../lib/foodSearchClient";

/* ------------------------------------------------------------------ */
/* Add Food sheet — search, barcode and custom entry for one meal       */
/* ------------------------------------------------------------------ */

const BARCODE_FORMATS = ["ean_13", "ean_8", "upc_a", "upc_e"];

// Chrome/Android ship BarcodeDetector natively; Safari (every iPhone) doesn't, so there the
// ZXing-based ponyfill is loaded on demand — it only downloads when someone opens the scanner.
async function createBarcodeDetector() {
  if (typeof window !== "undefined" && "BarcodeDetector" in window) {
    try {
      const supported = await window.BarcodeDetector.getSupportedFormats?.();
      if (!supported || BARCODE_FORMATS.some((f) => supported.includes(f))) return new window.BarcodeDetector({ formats: BARCODE_FORMATS });
    } catch (e) { /* fall through to the ponyfill */ }
  }
  const { BarcodeDetector } = await import("barcode-detector/ponyfill");
  return new BarcodeDetector({ formats: BARCODE_FORMATS });
}

const fmt = (n) => (Math.round(n * 10) / 10).toLocaleString();
const SOURCE_LABEL = { usda: "USDA", off: "Open Food Facts" };

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
function FoodDetail({ food, meal, onMealChange, onBack, onAdd }) {
  const units = unitOptions(food);
  const initial = defaultAmount(food);
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
      <div className="disp" style={{ fontSize: 18, marginTop: 6 }}>{food.name}</div>
      <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 2 }}>
        {[food.brand, SOURCE_LABEL[food.source], `${fmt(food.per100g.calories)} kcal / 100 g`].filter(Boolean).join(" · ")}
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

function BarcodePanel({ onFound }) {
  const [error, setError] = useState(null);
  const [loading, setLoading] = useState(false);
  const [manual, setManual] = useState("");
  const [cameraOff, setCameraOff] = useState(false);
  const videoRef = useRef(null);

  const lookup = async (code) => {
    if (!isValidBarcode(code)) { setError("Barcodes are 6 to 14 digits — check the number."); return; }
    setLoading(true);
    setError(null);
    try {
      onFound(await lookupBarcode(code));
    } catch (e) {
      setError(e.message);
      setLoading(false);
    }
  };

  useEffect(() => {
    if (cameraOff) return;
    let stream, timer, cancelled = false;
    (async () => {
      try {
        stream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: "environment" } });
        if (cancelled) { stream.getTracks().forEach((t) => t.stop()); return; }
        videoRef.current.srcObject = stream;
        await videoRef.current.play().catch(() => {});
        const detector = await createBarcodeDetector();
        if (cancelled) return;
        let busy = false;
        timer = setInterval(async () => {
          if (busy || !videoRef.current || videoRef.current.readyState < 2) return;
          busy = true;
          try {
            const codes = await detector.detect(videoRef.current);
            if (codes.length > 0 && !cancelled) {
              clearInterval(timer);
              stream.getTracks().forEach((t) => t.stop());
              lookup(codes[0].rawValue);
            }
          } catch (e) { /* keep trying */ }
          busy = false;
        }, 350);
      } catch (e) {
        if (!cancelled) { setCameraOff(true); setError("Camera unavailable — type the barcode number instead."); }
      }
    })();
    return () => { cancelled = true; clearInterval(timer); stream?.getTracks().forEach((t) => t.stop()); };
  }, [cameraOff]);

  return (
    <div>
      {!cameraOff && (
        <div style={{ position: "relative", background: "#000", borderRadius: 12, overflow: "hidden", height: 240 }}>
          <video ref={videoRef} playsInline muted style={{ width: "100%", height: "100%", objectFit: "cover" }} />
          <div style={{ position: "absolute", left: "12%", right: "12%", top: "38%", height: 64, border: "2px solid var(--brass)", borderRadius: 8 }} />
          {loading && (
            <div style={{ position: "absolute", inset: 0, display: "flex", alignItems: "center", justifyContent: "center", background: "rgba(0,0,0,0.5)" }}>
              <Loader2 size={26} color="#fff" style={{ animation: "spin 1s linear infinite" }} />
            </div>
          )}
        </div>
      )}
      {!cameraOff && <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8, textAlign: "center" }}>Point the camera at the barcode on the pack</div>}
      <div style={{ display: "flex", gap: 6, marginTop: 14 }}>
        <input className="atlas-input" inputMode="numeric" placeholder="Or type the barcode number" value={manual}
          onChange={(e) => setManual(e.target.value.replace(/\D/g, ""))} onKeyDown={(e) => e.key === "Enter" && lookup(manual)} aria-label="Barcode number" />
        <button className="atlas-btn" onClick={() => lookup(manual)} disabled={loading || !manual}>{loading ? "…" : "Find"}</button>
      </div>
      {error && <div style={{ fontSize: 12, color: "var(--rest)", marginTop: 10 }}>{error}</div>}
    </div>
  );
}

function CustomPanel({ meal, onMealChange, onAdd }) {
  const [form, setForm] = useState({ name: "", calories: "", protein: "", carbs: "", fat: "" });
  const set = (k) => (e) => setForm((f) => ({ ...f, [k]: e.target.value }));
  const valid = form.name.trim() && form.calories !== "";
  return (
    <div>
      <input className="atlas-input" placeholder="Food name, e.g. Mum's lasagne" value={form.name} onChange={set("name")} aria-label="Food name" style={{ marginBottom: 8 }} />
      <div style={{ display: "flex", gap: 6, marginBottom: 14 }}>
        {[["calories", "kcal"], ["protein", "protein g"], ["carbs", "carbs g"], ["fat", "fat g"]].map(([k, ph]) => (
          <input key={k} className="atlas-input" type="number" inputMode="decimal" placeholder={ph} value={form[k]} onChange={set(k)} aria-label={ph} />
        ))}
      </div>
      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginBottom: 6 }}>ADD TO</div>
      <MealPicker meal={meal} onChange={onMealChange} />
      <button className="atlas-btn" style={{ width: "100%", marginTop: 14, padding: 13 }} disabled={!valid}
        onClick={() => onAdd({ id: uid(), date: todayStr(), meal, name: form.name.trim(), calories: +form.calories || 0, protein: +form.protein || 0, carbs: +form.carbs || 0, fat: +form.fat || 0 })}>
        <Plus size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Add to {MEAL_LABEL[meal]}
      </button>
    </div>
  );
}

export function AddFoodSheet({ initialMeal, onAdd, onClose, recentFoods = [], favorites = [], onOpenPhotoScan }) {
  const [meal, setMeal] = useState(initialMeal);
  const [tab, setTab] = useState("search");
  const [query, setQuery] = useState("");
  const [results, setResults] = useState(null);
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
  useEffect(() => {
    const q = query.trim();
    abortRef.current?.abort();
    if (q.length < 2) { setResults(null); setLoading(false); setError(null); return; }
    const ctrl = new AbortController();
    abortRef.current = ctrl;
    setLoading(true);
    const t = setTimeout(async () => {
      try {
        const r = await searchFoods(q, ctrl.signal);
        if (!ctrl.signal.aborted) { setResults(r); setError(null); }
      } catch (e) {
        if (e.name !== "AbortError") { setError(e.message); setResults(null); }
      }
      if (!ctrl.signal.aborted) setLoading(false);
    }, 350);
    return () => { clearTimeout(t); ctrl.abort(); };
  }, [query]);

  const add = (entry) => { onAdd(entry); onClose(); };
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
              <button key={id} role="tab" aria-selected={tab === id} onClick={() => { setTab(id); setError(null); }} className="pill"
                style={{ flex: 1, justifyContent: "center", cursor: "pointer", border: "1px solid var(--line)", minHeight: 40, gap: 5, background: tab === id ? "var(--brass-soft)" : "transparent", color: tab === id ? "var(--brass)" : "var(--ink-dim)" }}>
                <Icon size={14} /> {label}
              </button>
            ))}
          </div>
        )}
      </div>

      <div style={{ flex: 1, overflowY: "auto", padding: "3px 18px calc(18px + env(safe-area-inset-bottom))" }}>
        {selected ? (
          <FoodDetail food={selected} meal={meal} onMealChange={setMeal} onBack={() => setSelected(null)} onAdd={add} />
        ) : tab === "search" ? (
          <>
            <div style={{ position: "relative", marginBottom: 12 }}>
              <Search size={16} color="var(--ink-dim)" style={{ position: "absolute", left: 12, top: "50%", transform: "translateY(-50%)" }} />
              <input className="atlas-input" autoFocus placeholder="Search foods, brands, restaurants…" value={query}
                onChange={(e) => setQuery(e.target.value)} style={{ paddingLeft: 36, fontSize: 16 }} aria-label="Search foods" enterKeyHint="search" />
            </div>
            {loading && <div className="mono" style={{ fontSize: 12, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 6, marginBottom: 10 }}><Loader2 size={13} style={{ animation: "spin 1s linear infinite" }} /> Searching…</div>}
            {error && <div style={{ fontSize: 12, color: "var(--rest)", marginBottom: 10 }}>{error}</div>}
            {results && !loading && results.length === 0 && (
              <div style={{ fontSize: 13, color: "var(--ink-dim)", marginBottom: 12 }}>
                No matches for “{query.trim()}”. Try a simpler name, scan the barcode, or add it as a custom food.
              </div>
            )}
            {results && results.map((f) => {
              const d = defaultAmount(f);
              const kcal = nutrientsFor(f.per100g, gramsFor(d.quantity, d.unit)).calories;
              return (
                <button key={f.id} onClick={() => setSelected(f)} style={rowStyle}>
                  <span style={{ minWidth: 0 }}>
                    <span style={{ display: "block", fontSize: 14, overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>{f.name}</span>
                    <span className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", display: "block", overflow: "hidden", textOverflow: "ellipsis", whiteSpace: "nowrap" }}>
                      {[f.brand, d.unit.label === "g" ? "100 g" : d.unit.label, `${kcal} kcal`].filter(Boolean).join(" · ")}
                    </span>
                  </span>
                  <Plus size={18} color="var(--brass)" style={{ flexShrink: 0 }} aria-hidden="true" />
                </button>
              );
            })}
            {!results && !loading && (
              <>
                {savedList("FAVORITES", Star, favorites)}
                {savedList("RECENT", History, recentFoods)}
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
          <BarcodePanel onFound={setSelected} />
        ) : (
          <CustomPanel meal={meal} onMealChange={setMeal} onAdd={add} />
        )}
      </div>
    </div>
  );
}

const rowStyle = {
  display: "flex", width: "100%", alignItems: "center", justifyContent: "space-between", gap: 10, textAlign: "left",
  background: "none", border: "none", borderTop: "1px solid var(--line)", padding: "10px 2px", cursor: "pointer", color: "var(--ink)", fontFamily: "inherit", minHeight: 52,
};
