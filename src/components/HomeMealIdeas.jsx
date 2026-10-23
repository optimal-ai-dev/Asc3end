import { useMemo, useState } from "react";
import { ChefHat, Plus } from "lucide-react";
import { suggestHomeMeals } from "../lib/mealIdeas";
import { uid, todayStr } from "../lib/dateUtils";

/* Home meal ideas sized to what's left of today's macros — deterministic and free, no AI call. */
export function HomeMealIdeas({ targets, totals, onAdd, vegetarian, onToggleVegetarian }) {
  const [openId, setOpenId] = useState(null);
  const remaining = {
    calories: targets.calories - totals.calories,
    protein: targets.protein - totals.protein,
    carbs: targets.carbs - totals.carbs,
    fat: targets.fat - totals.fat,
  };
  const { status, ideas } = useMemo(
    () => suggestHomeMeals(remaining, { vegetarian }),
    [remaining.calories, remaining.protein, remaining.carbs, remaining.fat, vegetarian]
  );

  return (
    <div className="atlas-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 4 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <ChefHat size={15} color="var(--brass)" />
          <h2 className="disp" style={{ fontSize: 14 }}>Cook at Home</h2>
        </div>
        <label className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", display: "flex", alignItems: "center", gap: 4, cursor: "pointer" }}>
          <input type="checkbox" checked={!!vegetarian} onChange={(e) => onToggleVegetarian(e.target.checked)} /> Vegetarian
        </label>
      </div>
      <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 10 }}>
        {status === "done"
          ? "You've about hit today's calories. If you're still hungry, go for something light and high in protein."
          : `Left today: ${Math.round(remaining.calories)} kcal · P ${Math.max(0, Math.round(remaining.protein))}g · C ${Math.max(0, Math.round(remaining.carbs))}g · F ${Math.max(0, Math.round(remaining.fat))}g`}
      </div>
      {ideas.map((m) => (
        <div key={m.id} style={{ borderTop: "1px solid var(--line)", padding: "10px 0 0", marginTop: 4 }}>
          <button
            onClick={() => setOpenId(openId === m.id ? null : m.id)}
            aria-expanded={openId === m.id}
            style={{ background: "none", border: "none", padding: 0, cursor: "pointer", textAlign: "left", width: "100%", color: "var(--ink)" }}
          >
            <div style={{ fontSize: 13, fontWeight: 600 }}>
              {m.name}{m.scale !== 1 && <span className="mono" style={{ fontSize: 10, color: "var(--brass)", marginLeft: 6 }}>{m.scale}× portion</span>}
            </div>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 3 }}>
              {m.calories} kcal · P {m.protein}g · C {m.carbs}g · F {m.fat}g
            </div>
          </button>
          {openId === m.id && (
            <ul style={{ fontSize: 11.5, color: "var(--ink-dim)", margin: "6px 0 0", paddingLeft: 16, lineHeight: 1.5 }}>
              {m.ingredients.map((ing) => <li key={ing}>{ing}{m.scale !== 1 ? ` (×${m.scale})` : ""}</li>)}
            </ul>
          )}
          <button
            className="atlas-btn-ghost"
            style={{ marginTop: 6, padding: "5px 10px", fontSize: 10 }}
            onClick={() => onAdd({ id: uid(), date: todayStr(), name: m.scale !== 1 ? `${m.name} (${m.scale}×)` : m.name, calories: m.calories, protein: m.protein, carbs: m.carbs, fat: m.fat })}
          >
            <Plus size={11} style={{ verticalAlign: -2, marginRight: 4 }} /> Log this meal
          </button>
        </div>
      ))}
    </div>
  );
}
