import React, { useState, useMemo } from "react";
import { MapPin, Navigation, Search, Loader2, ExternalLink, Sparkles, AlertTriangle } from "lucide-react";
import { supabase } from "./lib/supabase";
import { formatDistance } from "./lib/geo.js";
import { openStatus } from "./lib/openingHours.js";
import { midpoint, checkMacroConsistency } from "./lib/macroCheck.js";
import { getTimeZone } from "./lib/dates.js";
import FoodLogSheet from "./FoodLogSheet.jsx";

const CATEGORY_FILTERS = [["all", "All"], ["restaurant", "Restaurants"], ["cafe", "Cafés"], ["fast_food", "Fast food"]];
const clampRange = (r, max) => (Array.isArray(r) && r.length === 2 && r.every((n) => Number.isFinite(Number(n))) ? [Math.max(0, Math.min(max, Number(r[0]))), Math.max(0, Math.min(max, Number(r[1])))].sort((a, b) => a - b) : null);

/** Validates and cleans the model's "order ideas" JSON. Unknown venues and malformed ranges are dropped. */
const rangeText = (r) => (r[0] === r[1] ? String(r[0]) : `${r[0]}–${r[1]}`);

export function sanitizeIdeas(parsed, venueIds) {
  const out = {};
  for (const idea of Array.isArray(parsed?.ideas) ? parsed.ideas : []) {
    if (!idea || !venueIds.has(idea.venueId) || typeof idea.item !== "string" || !idea.item.trim()) continue;
    const calories = clampRange(idea.calories, 3000), protein = clampRange(idea.protein, 200), carbs = clampRange(idea.carbs, 400), fat = clampRange(idea.fat, 200);
    if (!calories || !protein || !carbs || !fat) continue;
    const mid = { calories: midpoint(calories), protein: midpoint(protein), carbs: midpoint(carbs), fat: midpoint(fat) };
    out[idea.venueId] = {
      item: idea.item.trim().slice(0, 100), portionAssumption: String(idea.portionAssumption || "one typical serve").slice(0, 100),
      calories, protein, carbs, fat, mid, confidence: idea.confidence === "medium" ? "medium" : "low",
      reason: String(idea.reason || "").slice(0, 200), consistency: checkMacroConsistency(mid),
    };
  }
  return out;
}

/**
 * Meals Near You, rebuilt on real data. Venues, addresses and opening hours come from OpenStreetMap
 * (via /api/places) with a link to each record and the time it was retrieved; distances are computed
 * from a stated reference point; nothing is shown that the source does not contain (no prices, no
 * menus, no "open now" unless the hours were fully understood AND the timezone is the user's own).
 * The AI only suggests a TYPICAL order for each venue's cuisine, clearly labelled as an estimate with
 * ranges and a portion assumption, and nothing is logged until the athlete has reviewed and edited it.
 */
export default function MealsNearYou({ goalRationale, mealGuidance, onAdd, onUsageChange, onPaywall, callClaude, extractJSON, todayStr, uid, remainingLabel }) {
  const [timing, setTiming] = useState("post");
  const [location, setLocation] = useState("");
  const [status, setStatus] = useState("idle"); // idle | locating | searching | done | error
  const [error, setError] = useState(null);
  const [result, setResult] = useState(null);
  const [category, setCategory] = useState("all");
  const [ideas, setIdeas] = useState({});
  const [ideasState, setIdeasState] = useState("idle"); // idle | loading | error
  const [ideasError, setIdeasError] = useState(null);
  const [sheet, setSheet] = useState(null);
  const tz = useMemo(() => getTimeZone(), []);

  const search = async (body) => {
    setStatus("searching"); setError(null); setResult(null); setIdeas({}); setIdeasState("idle");
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const res = await fetch("/api/places", {
        method: "POST",
        headers: { "Content-Type": "application/json", ...(session?.access_token ? { Authorization: `Bearer ${session.access_token}` } : {}) },
        body: JSON.stringify(body),
      });
      const data = await res.json().catch(() => ({}));
      if (res.status === 402 && data?.error?.code === "premium_required") { onPaywall?.(); setStatus("idle"); return; }
      if (!res.ok) { setError({ message: data?.error?.message || "Couldn't search for places just now — try again.", retry: true }); setStatus("error"); return; }
      setResult(data);
      setStatus("done");
    } catch (e) {
      setError({ message: "Couldn't reach the server — check your connection and try again.", retry: true });
      setStatus("error");
    }
  };

  const useDevice = () => {
    setError(null);
    if (!navigator.geolocation) { setError({ message: "Location isn't available on this device — type a suburb or city instead." }); setStatus("error"); return; }
    setStatus("locating");
    navigator.geolocation.getCurrentPosition(
      (pos) => search({ lat: pos.coords.latitude, lon: pos.coords.longitude }),
      () => { setError({ message: "Location permission wasn't granted — type a suburb or city instead." }); setStatus("error"); },
      { timeout: 12000 }
    );
  };

  const venues = result?.venues || [];
  const shown = category === "all" ? venues : venues.filter((v) => v.category === category);

  const getIdeas = async () => {
    const list = venues.slice(0, 8);
    if (list.length === 0) return;
    setIdeasState("loading"); setIdeasError(null);
    try {
      const g = mealGuidance;
      const prompt = `This is for ${timing === "pre" ? "a pre-workout meal eaten 1-3 hours before training" : "a post-workout meal to support recovery"}. Athlete goal: ${goalRationale}. Target for one meal: about ${g.calories[0]}-${g.calories[1]} kcal, ${g.protein[0]}-${g.protein[1]} g protein, ${g.carbs[0]}-${g.carbs[1]} g carbs, ${g.fat[0]}-${g.fat[1]} g fat.

For each venue below suggest ONE typical order that would roughly fit. Base it ONLY on the venue's category and cuisine: you do NOT know its menu, prices or opening hours and must not claim or imply that you do. Give calories, protein, carbs and fat as [low, high] ranges, a portionAssumption (for example "about 400 g, one serve"), a confidence of "low" or "medium", and one short sentence on why it fits. The ranges must be consistent with each other (calories ≈ 4 x protein + 4 x carbs + 9 x fat).
Respond with ONLY this JSON: {"ideas":[{"venueId":"","item":"","portionAssumption":"","calories":[0,0],"protein":[0,0],"carbs":[0,0],"fat":[0,0],"confidence":"low","reason":""}]}

Venues: ${JSON.stringify(list.map((v) => ({ venueId: v.id, name: v.name, category: v.categoryLabel, cuisine: v.cuisine })))}`;
      const text = await callClaude([{ role: "user", content: prompt }], 1800, null, "You are a nutrition assistant. Respond with ONLY a single valid JSON object and nothing else.", "meals", { withHistory: false });
      const cleaned = sanitizeIdeas(extractJSON(text), new Set(list.map((v) => v.id)));
      if (Object.keys(cleaned).length === 0) throw new Error("No usable suggestions came back — try again.");
      setIdeas(cleaned);
      setIdeasState("idle");
    } catch (e) {
      if (e?.code === "premium_required") { onPaywall?.(); setIdeasState("idle"); }
      else { setIdeasError(e?.message && !/JSON/.test(e.message) ? e.message : "Couldn't get meal ideas just now — try again."); setIdeasState("error"); }
    }
    onUsageChange?.();
  };

  const hoursLine = (v) => {
    if (!v.hoursRaw) return <span style={{ color: "var(--ink-dim)" }}>Opening hours not listed</span>;
    if (result.reference.method === "device") {
      const s = openStatus(v.hoursRaw, Date.now(), tz);
      if (s.state === "open") return <span style={{ color: "var(--good)" }}>Open now (per listed hours)</span>;
      if (s.state === "closed") return <span style={{ color: "var(--warn)" }}>Closed now (per listed hours)</span>;
    }
    return <span style={{ color: "var(--ink-dim)" }}>Listed hours: {v.hoursRaw} — check before you go</span>;
  };

  return (
    <div className="atlas-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", justifyContent: "space-between", gap: 6, marginBottom: 8 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 6 }}>
          <MapPin size={15} color="var(--brass)" />
          <div className="disp" style={{ fontSize: 14 }}>Meals Near You</div>
        </div>
        {remainingLabel && <span className="mono" style={{ fontSize: 10, color: "var(--brass)" }}>{remainingLabel}</span>}
      </div>

      <div style={{ display: "flex", gap: 6, marginBottom: 8 }}>
        {[["pre", "Pre-Workout"], ["post", "Post-Workout"]].map(([k, label]) => (
          <button key={k} onClick={() => setTiming(k)} aria-pressed={timing === k} className="pill" style={{ flex: 1, textAlign: "center", cursor: "pointer", minHeight: 44, border: "1px solid var(--line)", background: timing === k ? "var(--brass-soft)" : "transparent", color: timing === k ? "var(--brass)" : "var(--ink-dim)" }}>{label}</button>
        ))}
      </div>
      <input className="atlas-input" placeholder="Suburb or city" aria-label="Suburb or city" value={location} onChange={(e) => setLocation(e.target.value)} onKeyDown={(e) => { if (e.key === "Enter" && location.trim()) search({ query: location.trim() }); }} style={{ minHeight: 48, marginBottom: 8 }} />
      <button className="atlas-btn-ghost" style={{ width: "100%", marginBottom: 8, fontSize: 12, minHeight: 44 }} onClick={useDevice} disabled={status === "locating" || status === "searching"}>
        <Navigation size={13} color="var(--brass)" style={{ verticalAlign: -2, marginRight: 6 }} />
        {status === "locating" ? "Finding your location…" : "Use My Current Location"}
      </button>
      <button className="atlas-btn" style={{ width: "100%", minHeight: 48 }} onClick={() => location.trim() && search({ query: location.trim() })} disabled={status === "searching" || status === "locating" || !location.trim()}>
        {status === "searching" ? <Loader2 size={14} style={{ verticalAlign: -2, marginRight: 6, animation: "spin 1s linear infinite" }} /> : <Search size={14} style={{ verticalAlign: -2, marginRight: 6 }} />}
        {status === "searching" ? "Searching…" : "Find Places"}
      </button>

      {status === "error" && error && (
        <div role="alert" style={{ marginTop: 10, fontSize: 12, color: "var(--rest)", lineHeight: 1.5 }}>
          {error.message}
          {error.retry && <button className="mono" onClick={() => (location.trim() ? search({ query: location.trim() }) : useDevice())} style={{ background: "none", border: "none", color: "var(--brass)", cursor: "pointer", marginLeft: 8, minHeight: 36 }}>Retry</button>}
        </div>
      )}

      {status === "done" && result && (
        <div style={{ marginTop: 12 }}>
          <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", lineHeight: 1.6, background: "var(--bg-elev2)", borderRadius: 8, padding: "8px 10px" }}>
            Distances are straight-line from <b style={{ color: "var(--ink)" }}>{result.reference.label}</b>
            {result.reference.source?.url ? <> (<a href={result.reference.source.url} target="_blank" rel="noopener noreferrer" style={{ color: "var(--steel)" }}>{result.reference.source.name}</a>)</> : null}.
            {" "}{result.attribution} Retrieved {new Date(result.retrievedAt).toLocaleTimeString([], { hour: "numeric", minute: "2-digit" })}.
            {" "}Prices and menus aren't available from this source, so none are shown.
          </div>

          {venues.length === 0 ? (
            <div className="empty-state" style={{ padding: "18px 8px" }}>
              <div className="empty-state-title">No cafés or restaurants found</div>
              <div className="empty-state-body">Nothing mapped within about 1.2 km of {result.reference.label}. Try a larger suburb or city name.</div>
            </div>
          ) : (
            <>
              <div style={{ display: "flex", gap: 5, flexWrap: "wrap", margin: "10px 0" }}>
                {CATEGORY_FILTERS.map(([k, label]) => (
                  <button key={k} onClick={() => setCategory(k)} aria-pressed={category === k} className="pill" style={{ cursor: "pointer", minHeight: 36, border: `1px solid ${category === k ? "var(--brass)" : "var(--line)"}`, background: category === k ? "var(--brass-soft)" : "transparent", color: category === k ? "var(--brass)" : "var(--ink-dim)" }}>{label}</button>
                ))}
              </div>

              {Object.keys(ideas).length === 0 && (
                <div style={{ marginBottom: 10 }}>
                  <button className="atlas-btn-ghost" style={{ width: "100%", minHeight: 44, fontSize: 12 }} onClick={getIdeas} disabled={ideasState === "loading"}>
                    {ideasState === "loading" ? <Loader2 size={13} style={{ verticalAlign: -2, marginRight: 6, animation: "spin 1s linear infinite" }} /> : <Sparkles size={13} style={{ verticalAlign: -2, marginRight: 6 }} />}
                    {ideasState === "loading" ? "Thinking…" : "Suggest typical orders for these places (uses 1 meal search)"}
                  </button>
                  {ideasError && <div role="alert" style={{ fontSize: 11.5, color: "var(--rest)", marginTop: 6 }}>{ideasError}</div>}
                </div>
              )}

              <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
                {shown.slice(0, 12).map((v) => {
                  const idea = ideas[v.id];
                  return (
                    <div key={v.id} style={{ borderTop: "1px solid var(--line)", paddingTop: 10 }}>
                      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "baseline", gap: 8 }}>
                        <div style={{ fontSize: 13.5, fontWeight: 600 }}>{v.name}</div>
                        {v.distanceM != null && <span className="pill mono" style={{ background: "var(--bg-elev2)", color: "var(--brass)", flexShrink: 0 }} title="Straight-line distance from the reference point">≈{formatDistance(v.distanceM)}</span>}
                      </div>
                      <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 2 }}>{[v.categoryLabel, ...v.cuisine].join(" · ")}{v.diet?.length ? ` · ${v.diet.join(", ")}` : ""}</div>
                      {v.address && <div style={{ fontSize: 11.5, color: "var(--ink-dim)", marginTop: 2 }}>{v.address}</div>}
                      <div style={{ fontSize: 11.5, marginTop: 3 }}>{hoursLine(v)}</div>
                      <div style={{ display: "flex", gap: 12, marginTop: 4, flexWrap: "wrap" }}>
                        <a href={v.osmUrl} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 10.5, color: "var(--steel)", display: "inline-flex", alignItems: "center", gap: 3, minHeight: 32 }}>Source: OpenStreetMap <ExternalLink size={10} /></a>
                        {v.website && <a href={v.website} target="_blank" rel="noopener noreferrer" className="mono" style={{ fontSize: 10.5, color: "var(--steel)", display: "inline-flex", alignItems: "center", gap: 3, minHeight: 32 }}>Website <ExternalLink size={10} /></a>}
                      </div>

                      {idea && (
                        <div style={{ marginTop: 6, padding: "8px 10px", borderRadius: 8, background: "var(--bg-elev2)" }}>
                          <div className="mono" style={{ fontSize: 9.5, color: "var(--warn)", marginBottom: 3 }}>ESTIMATE — TYPICAL FOR {(v.cuisine[0] || v.categoryLabel).toUpperCase()}, NOT THIS VENUE'S MENU</div>
                          <div style={{ fontSize: 13, color: "var(--steel)" }}>{idea.item}</div>
                          <div className="mono" style={{ fontSize: 10.5, color: "var(--ink-dim)", marginTop: 3, lineHeight: 1.6 }}>
                            {rangeText(idea.calories)} kcal · P {rangeText(idea.protein)}g · C {rangeText(idea.carbs)}g · F {rangeText(idea.fat)}g
                          </div>
                          <div style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 3, lineHeight: 1.45 }}>Assumes {idea.portionAssumption}. {idea.reason}</div>
                          {idea.consistency.status === "inconsistent" && (
                            <div style={{ display: "flex", gap: 6, marginTop: 4, fontSize: 11, color: "var(--warn)", lineHeight: 1.4 }}><AlertTriangle size={12} style={{ flexShrink: 0, marginTop: 1 }} />The macros add up to about {idea.consistency.computedKcal} kcal, not {idea.mid.calories} — review before logging.</div>
                          )}
                          <button className="atlas-btn-ghost" style={{ marginTop: 6, minHeight: 44, padding: "0 12px", fontSize: 11 }} onClick={() => setSheet({ v, idea })}>Review &amp; log…</button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </>
          )}
        </div>
      )}

      {sheet && (
        <FoodLogSheet
          initial={{
            name: `${sheet.idea.item} (${sheet.v.name})`, calories: sheet.idea.mid.calories, protein: sheet.idea.mid.protein, carbs: sheet.idea.mid.carbs, fat: sheet.idea.mid.fat,
            estimated: true, source: "ai_estimate", portionNote: sheet.idea.portionAssumption,
            rangeNote: `Typical for ${sheet.v.cuisine[0] || sheet.v.categoryLabel.toLowerCase()} food, shown as the middle of a range (${sheet.idea.calories[0]}–${sheet.idea.calories[1]} kcal). It is not this venue's actual menu.`,
          }}
          onCancel={() => setSheet(null)}
          onConfirm={(entry) => { onAdd({ id: uid(), date: todayStr(), ...entry }); setSheet(null); }}
        />
      )}
    </div>
  );
}
