import { useState } from "react";
import { Plus, Minus, RefreshCw, Sparkles, Trash2, Loader2 } from "lucide-react";
import { NumberInput } from "./NumberInput";
import {
  itemNutrients, mealTotals, setPieces, setGramsPerPiece, setTotalGrams,
  buildItemEstimatePrompt, parseItemEstimate, renameItem, buildRefinePrompt, mergeRefined, blankItem, pluralize as plural,
} from "../lib/mealScan";
import { extractJSON } from "../lib/claudeClient";
import { FREE_MONTHLY_LIMITS } from "../lib/entitlements";

const label = { fontSize: 10.5, color: "var(--ink-dim)", display: "block", marginBottom: 4 };

// The result of a photo scan: every food the AI found on the plate as its own card. The person
// can rename an item (the macros follow the new food), set how many pieces and roughly how many
// grams, remove or add items, and answer the AI's questions. `ask(prompt, maxTokens)` sends a
// text-only request and resolves to the reply text.
// `freeScansLeft` is set for Free-plan users only (null on Asc3end+): how many photo scans they
// have left this month after this one. `onUpgrade(items)` logs this meal and opens the plans.
export function MealScanReview({ initialItems, ask, onAddAll, onRescan, freeScansLeft = null, onUpgrade }) {
  const [items, setItems] = useState(initialItems);
  const [names, setNames] = useState(() => Object.fromEntries(initialItems.map((it) => [it.id, it.name])));
  const [busy, setBusy] = useState({});
  const [notes, setNotes] = useState("");
  const [refining, setRefining] = useState(false);
  const [newName, setNewName] = useState("");
  const [error, setError] = useState(null);

  const update = (id, fn) => setItems((list) => list.map((it) => (it.id === id ? fn(it) : it)));
  const totals = mealTotals(items);

  const lookUp = async (name) => parseItemEstimate(extractJSON(await ask(buildItemEstimatePrompt(name), 200)));

  const commitName = async (item) => {
    const name = (names[item.id] || "").trim();
    if (!name || name === item.name) { setNames((n) => ({ ...n, [item.id]: item.name })); return; }
    setBusy((b) => ({ ...b, [item.id]: true }));
    setError(null);
    try {
      const estimate = await lookUp(name);
      update(item.id, (it) => renameItem(it, name, estimate));
      if (!estimate) setError(`Couldn't find macros for "${name}", so the old values are kept. You can adjust them after logging.`);
    } catch (e) {
      update(item.id, (it) => renameItem(it, name, null));
      setError(`Renamed to "${name}", but couldn't update its macros. Check your connection and rename it again.`);
    }
    setBusy((b) => ({ ...b, [item.id]: false }));
  };

  const addItem = async () => {
    const name = newName.trim();
    if (!name) return;
    const item = blankItem(name);
    setItems((list) => [...list, item]);
    setNames((n) => ({ ...n, [item.id]: name }));
    setNewName("");
    setBusy((b) => ({ ...b, [item.id]: true }));
    try {
      const estimate = await lookUp(name);
      if (estimate) {
        update(item.id, (it) => {
          const next = renameItem(it, name, estimate);
          return estimate.gramsPerPiece
            ? { ...next, pieces: 1, gramsPerPiece: estimate.gramsPerPiece, pieceLabel: "piece", grams: Math.round(estimate.gramsPerPiece) }
            : next;
        });
      } else setError(`Couldn't find macros for "${name}".`);
    } catch (e) {
      setError(`Couldn't look up "${name}" — check your connection.`);
    }
    setBusy((b) => ({ ...b, [item.id]: false }));
  };

  const remove = (id) => setItems((list) => list.filter((it) => it.id !== id));

  const refine = async () => {
    if (!notes.trim()) return;
    setRefining(true);
    setError(null);
    try {
      const next = mergeRefined(items, extractJSON(await ask(buildRefinePrompt(items, notes), 1500)));
      if (next.length === 0) throw new Error("empty");
      setItems(next);
      setNames(Object.fromEntries(next.map((it) => [it.id, it.name])));
      setNotes("");
    } catch (e) {
      setError("Couldn't update the meal from your notes — try again, or edit the items directly.");
    }
    setRefining(false);
  };

  const anyBusy = refining || Object.values(busy).some(Boolean);

  return (
    <div style={{ flex: 1, overflowY: "auto", WebkitOverflowScrolling: "touch" }}>
      <div className="atlas-card" style={{ marginBottom: 10 }}>
        <div className="disp" style={{ fontSize: 16 }}>
          {items.length === 0 ? "No foods on this plate" : `Found ${items.length} ${plural("food", items.length)} on your plate`}
        </div>
        <div style={{ fontSize: 12, color: "var(--ink-dim)", margin: "4px 0 10px" }}>
          Check each one below. Fix anything the AI got wrong and give a rough weight for each food, so your macros are as accurate as possible.
        </div>
        <div style={{ display: "flex", gap: 10 }} data-testid="meal-totals">
          {[["calories", "KCAL", ""], ["protein", "PROTEIN", "g"], ["carbs", "CARBS", "g"], ["fat", "FAT", "g"]].map(([k, l, u]) => (
            <div key={k} style={{ flex: 1, textAlign: "center" }}>
              <div className="disp" style={{ fontSize: 18 }}>{totals[k]}{u}</div>
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>{l}</div>
            </div>
          ))}
        </div>
      </div>

      {items.map((item) => {
        const n = itemNutrients(item);
        return (
          <div key={item.id} className="atlas-card" style={{ marginBottom: 10 }} data-testid="scan-item">
            <div style={{ display: "flex", gap: 6, alignItems: "center", marginBottom: 8 }}>
              <input
                className="atlas-input" value={names[item.id] ?? item.name} aria-label="Food name"
                onChange={(e) => setNames((v) => ({ ...v, [item.id]: e.target.value }))}
                onBlur={() => commitName(item)}
                onKeyDown={(e) => { if (e.key === "Enter") e.currentTarget.blur(); }}
                style={{ flex: 1, fontWeight: 600 }}
              />
              <button onClick={() => remove(item.id)} aria-label={`Remove ${item.name}`} style={{ background: "none", border: "none", cursor: "pointer", padding: 6 }}>
                <Trash2 size={16} color="var(--ink-dim)" />
              </button>
            </div>
            {item.confidence === "low" && !item.question && (
              <div style={{ fontSize: 11.5, color: "var(--warn)", marginBottom: 8 }}>Not sure about this one. If it's wrong, type the right food above.</div>
            )}
            {item.question && (
              <div style={{ display: "flex", gap: 6, alignItems: "flex-start", fontSize: 12.5, background: "var(--brass-soft)", borderRadius: 8, padding: "8px 10px", marginBottom: 10 }}>
                <Sparkles size={14} color="var(--brass)" style={{ flexShrink: 0, marginTop: 2 }} />
                <span>{item.question}</span>
              </div>
            )}

            {item.pieces !== null && (
              <div style={{ display: "flex", gap: 10, marginBottom: 8 }}>
                <div style={{ flex: 1 }}>
                  <span className="mono" style={label}>HOW MANY {plural(item.pieceLabel, 2).toUpperCase()}?</span>
                  <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
                    <button className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label={`Fewer ${plural(item.pieceLabel, 2)}`} onClick={() => update(item.id, (it) => setPieces(it, Math.max(0, it.pieces - 1)))}><Minus size={14} /></button>
                    <span className="disp" style={{ fontSize: 18, minWidth: 24, textAlign: "center" }} data-testid="piece-count">{item.pieces}</span>
                    <button className="atlas-btn-ghost" style={{ padding: "6px 10px" }} aria-label={`More ${plural(item.pieceLabel, 2)}`} onClick={() => update(item.id, (it) => setPieces(it, it.pieces + 1))}><Plus size={14} /></button>
                  </div>
                </div>
                <div style={{ flex: 1 }}>
                  <span className="mono" style={label}>ROUGH GRAMS EACH</span>
                  <NumberInput className="atlas-input" value={item.gramsPerPiece} zeroAsEmpty aria-label={`Grams per ${item.pieceLabel}`} onChange={(v) => update(item.id, (it) => setGramsPerPiece(it, v === "" ? 0 : +v))} />
                </div>
              </div>
            )}
            <span className="mono" style={label}>{item.pieces !== null ? "TOTAL GRAMS" : "ROUGHLY HOW MANY GRAMS?"}</span>
            <NumberInput className="atlas-input" value={item.grams} zeroAsEmpty aria-label={`Grams of ${item.name}`} onChange={(v) => update(item.id, (it) => setTotalGrams(it, v === "" ? 0 : +v))} style={{ marginBottom: 8 }} />
            <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)" }}>
              {busy[item.id]
                ? <><Loader2 size={12} style={{ verticalAlign: -2, marginRight: 4, animation: "spin 1s linear infinite" }} /> Updating macros…</>
                : `${n.calories} kcal · ${n.protein}g P · ${n.carbs}g C · ${n.fat}g F`}
            </div>
          </div>
        );
      })}

      <div className="atlas-card" style={{ marginBottom: 10 }}>
        <span className="mono" style={label}>MISSED SOMETHING?</span>
        <div style={{ display: "flex", gap: 6, marginBottom: 12 }}>
          <input className="atlas-input" placeholder="e.g. Can of Coke" value={newName} aria-label="Add a food the scan missed" onChange={(e) => setNewName(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter") addItem(); }} />
          <button className="atlas-btn-ghost" onClick={addItem} disabled={!newName.trim()} aria-label="Add food"><Plus size={14} /></button>
        </div>
        <span className="mono" style={label}>ANYTHING ELSE THE AI SHOULD KNOW?</span>
        <textarea
          className="atlas-input" rows={2} value={notes} aria-label="Notes for the AI"
          placeholder="e.g. Cooked in butter, I only ate half the rice"
          onChange={(e) => setNotes(e.target.value)} style={{ resize: "vertical", marginBottom: 8, fontFamily: "inherit" }}
        />
        <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={refine} disabled={!notes.trim() || refining}>
          {refining ? <><Loader2 size={14} style={{ verticalAlign: -2, marginRight: 5, animation: "spin 1s linear infinite" }} /> Updating…</> : <><Sparkles size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Update my meal</>}
        </button>
      </div>

      {error && <div style={{ fontSize: 12, color: "var(--rest)", marginBottom: 10 }} role="alert">{error}</div>}

      {freeScansLeft !== null && (
        <div className="atlas-card" data-testid="free-scans-left" style={{ display: "flex", alignItems: "center", gap: 10, marginBottom: 10, padding: "10px 12px" }}>
          <div style={{ flex: 1, fontSize: 12.5 }}>
            <div style={{ fontWeight: 600 }}>{freeScansLeft} of {FREE_MONTHLY_LIMITS.scanner} free scans left this month</div>
            <div style={{ fontSize: 11, color: "var(--ink-dim)" }}>Asc3end+ lets you scan every meal.</div>
          </div>
          {onUpgrade && (
            <button className="atlas-btn" style={{ padding: "8px 12px", fontSize: 12 }} onClick={() => onUpgrade(items)} disabled={anyBusy} title="Logs this meal, then shows Asc3end+">
              <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 4 }} /> Upgrade
            </button>
          )}
        </div>
      )}

      <div style={{ display: "flex", gap: 8, paddingBottom: 4 }}>
        <button className="atlas-btn-ghost" style={{ flex: 1 }} onClick={onRescan}>
          <RefreshCw size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Scan again
        </button>
        <button className="atlas-btn" style={{ flex: 1 }} onClick={() => onAddAll(items)} disabled={anyBusy || !items.some((it) => it.grams > 0)}>
          <Plus size={14} style={{ verticalAlign: -2, marginRight: 5 }} /> Add meal to log
        </button>
      </div>
    </div>
  );
}
