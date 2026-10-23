import { useState } from "react";
import { MUSCLE_REGIONS, READINESS_DISPLAY_SOURCE } from "../exerciseData";
import { fmtRelativeDate } from "../lib/dateUtils";
import { READINESS_COLORS, READINESS_LABEL } from "../lib/workoutHelpers";

/* Turns one polygon (a plain [x,y] point list) into a smooth closed path by rounding every
   vertex with a quadratic curve. Used for every muscle region below so edges read as organic
   muscle curves rather than sharp polygon corners — the rounding itself was never the problem
   with the first version of this figure; the shapes it rounded were disconnected. */
function roundedBlob(points, curvature = 0.28) {
  const n = points.length;
  let d = "";
  for (let i = 0; i < n; i++) {
    const [x, y] = points[i];
    const [px, py] = points[(i - 1 + n) % n];
    const [nx, ny] = points[(i + 1) % n];
    const cx1 = x + (px - x) * curvature, cy1 = y + (py - y) * curvature;
    const cx2 = x + (nx - x) * curvature, cy2 = y + (ny - y) * curvature;
    d += i === 0 ? `M ${cx1.toFixed(1)} ${cy1.toFixed(1)} ` : "";
    d += `Q ${x.toFixed(1)} ${y.toFixed(1)} ${cx2.toFixed(1)} ${cy2.toFixed(1)} `;
  }
  return d + "Z";
}

/* Mirrors a path's absolute X coordinates around the figure's centerline (x=100) — every region
   below is authored as a left-side polygon; the matching right-side path is generated from it
   here, which is what guarantees the figure is exactly symmetric rather than hand-duplicated and
   liable to drift.
   roundedBlob() below emits every coordinate as "X Y" (space-separated, each an M or Q command
   argument) rather than "X,Y" — the entire path is one flat, strictly-alternating X,Y,X,Y,...
   sequence of numbers with no other numeric tokens mixed in, so the correct thing to mirror is
   every EVEN-indexed number (0-based) in the whole string, not "numbers before a comma". An
   earlier version of this function matched on a comma that never actually appears in the output,
   which silently mirrored nothing — every "right side" path was rendering exactly on top of its
   left-side twin, which is why the figure looked one-sided/incomplete. */
function mirrorX(d, axis = 100) {
  let i = 0;
  return d.replace(/-?\d+\.\d+/g, (numStr) => {
    const isX = i % 2 === 0;
    i++;
    return isX ? (2 * axis - parseFloat(numStr)).toFixed(1) : numStr;
  });
}

const blob = (points) => roundedBlob(points);
const bilateral = (leftPoints) => { const d = blob(leftPoints); return [d, mirrorX(d)]; };

/* ------------------------------------------------------------------ */
/* Figure geometry, take two.                                          */
/* ------------------------------------------------------------------ */
// The first version drew each muscle as an independent floating capsule near an unrelated
// skeleton shape, at a tiny render size — the result was a lopsided, disconnected mannequin, not
// a body. This version is built the way a real anatomical illustration actually is: adjacent
// regions share EXACT boundary coordinates (the elbow point closing biceps is the same point
// that opens forearms; the knee point closing quads is the same point that opens calves; the
// deltoid's inner edge is the torso's own shoulder edge), so there is no gap between them by
// construction, not by luck. viewBox 0 0 200 620, centerline x=100 — proportioned from actual
// measured shoulder/waist/hip/limb ratios, not guessed once and left alone.
const CX = 100;

// Torso stations: y, and the half-width of the torso silhouette at that height.
const TORSO = {
  shoulderY: 108, shoulderHW: 74,
  chestY: 148, chestHW: 58,
  obliqueTopY: 192, obliqueTopHW: 50,
  waistY: 246, waistHW: 40,
  hipY: 282, hipHW: 48,
};
const absHW = 17; // half-width of the abs strip, independent of the torso's own outer edge

// Arm stations (left side; mirrored for right). Each entry shares its coordinates with the
// station before/after it, so biceps/triceps and forearms always meet with zero gap.
const ARM = {
  shoulder: { y: 114, hw: 19 },
  bicepMid: { y: 168, hw: 20 },
  elbow: { y: 224, hw: 13 },
  forearmMid: { y: 264, hw: 12 },
  wrist: { y: 326, hw: 8 },
};
const armX = { shoulder: 30, bicepMid: 23, elbow: 19, forearmMid: 18, wrist: 22 };

// Leg stations: explicit outer (lateral) and inner (medial) edge X per height, chosen with a
// generous, constant gap between the two legs' inner edges so they never visually merge into one
// mass the way the first version's legs did.
const LEG = [
  { y: 282, outer: 42, inner: 90 }, // hip / thigh top
  { y: 368, outer: 36, inner: 84 }, // thigh mid
  { y: 458, outer: 48, inner: 80 }, // knee
  { y: 512, outer: 46, inner: 78 }, // calf bulge
  { y: 580, outer: 56, inner: 72 }, // ankle
];
const ADDUCTOR_INSET = 16; // width of the inner-thigh strip carved out of the leg's medial edge

function legEdge(i, side) { return LEG[i][side]; }

const REGION_SHAPES = {
  chest: bilateral([
    [24, TORSO.shoulderY], [42, TORSO.chestY], [CX - absHW, TORSO.chestY], [CX - absHW, TORSO.shoulderY + 6], [58, TORSO.shoulderY],
  ]),
  frontDelts: bilateral([
    [24, TORSO.shoulderY], [58, TORSO.shoulderY], [50, TORSO.shoulderY - 6], [armX.shoulder + ARM.shoulder.hw + 2, ARM.shoulder.y - 4], [armX.shoulder - ARM.shoulder.hw + 4, ARM.shoulder.y + 6], [14, TORSO.shoulderY + 12],
  ]),
  sideDelts: bilateral([
    [armX.shoulder - ARM.shoulder.hw, ARM.shoulder.y - 2], [16, TORSO.shoulderY + 4], [10, TORSO.shoulderY + 22], [armX.shoulder - ARM.shoulder.hw - 4, ARM.shoulder.y + 20],
  ]),
  rearDelts: bilateral([
    [24, TORSO.shoulderY], [58, TORSO.shoulderY], [50, TORSO.shoulderY - 6], [armX.shoulder + ARM.shoulder.hw + 2, ARM.shoulder.y - 4], [armX.shoulder - ARM.shoulder.hw + 4, ARM.shoulder.y + 6], [14, TORSO.shoulderY + 12],
  ]),
  biceps: bilateral([
    [armX.shoulder - ARM.shoulder.hw, ARM.shoulder.y], [armX.bicepMid - ARM.bicepMid.hw, ARM.bicepMid.y], [armX.elbow - ARM.elbow.hw, ARM.elbow.y],
    [armX.elbow + ARM.elbow.hw, ARM.elbow.y], [armX.bicepMid + ARM.bicepMid.hw, ARM.bicepMid.y], [armX.shoulder + ARM.shoulder.hw, ARM.shoulder.y],
  ]),
  // Triceps was previously an exact copy of biceps' hexagon capsule — same points, just a
  // different fill color — which is why it read as "missing" on the rear figure: nothing about
  // its shape said "triceps" rather than "generic upper arm." This is a genuinely different
  // silhouette: it starts as a near-point directly beneath rearDelts' own lower-tip vertices
  // (15,120) and (14,120) — a shared boundary, not a guess — flares into the classic horseshoe
  // belly (pushed further outward on the lateral edge than biceps' own bulge, and pulled in
  // narrower on the medial edge), then tapers back down to the exact elbow vertices forearms and
  // biceps already share (6,224) and (32,224), so it still meets the forearm with zero gap while
  // ending, anatomically, right at — not past — the elbow.
  triceps: bilateral([
    [15, TORSO.shoulderY + 12], [-3, ARM.bicepMid.y + 14], [armX.elbow - ARM.elbow.hw, ARM.elbow.y],
    [armX.elbow + ARM.elbow.hw, ARM.elbow.y], [33, ARM.bicepMid.y + 6], [14, TORSO.shoulderY + 12],
  ]),
  forearms: bilateral([
    [armX.elbow - ARM.elbow.hw, ARM.elbow.y], [armX.forearmMid - ARM.forearmMid.hw, ARM.forearmMid.y], [armX.wrist - ARM.wrist.hw, ARM.wrist.y],
    [armX.wrist + ARM.wrist.hw, ARM.wrist.y], [armX.forearmMid + ARM.forearmMid.hw, ARM.forearmMid.y], [armX.elbow + ARM.elbow.hw, ARM.elbow.y],
  ]),
  abs: blob([
    [CX - absHW, TORSO.chestY + 8], [CX + absHW, TORSO.chestY + 8], [CX + absHW - 3, TORSO.waistY], [CX - absHW + 3, TORSO.waistY],
  ]),
  obliques: bilateral([
    [42, TORSO.chestY], [CX - absHW, TORSO.chestY + 8], [CX - absHW + 3, TORSO.waistY], [58, TORSO.waistY], [50, TORSO.obliqueTopY],
  ]),
  traps: blob([
    [CX - 26, TORSO.shoulderY - 4], [CX + 26, TORSO.shoulderY - 4], [CX + 14, TORSO.shoulderY + 44], [CX, TORSO.shoulderY + 58], [CX - 14, TORSO.shoulderY + 44],
  ]),
  upperBack: bilateral([
    [24, TORSO.shoulderY], [58, TORSO.shoulderY], [CX - absHW, TORSO.shoulderY + 40], [CX - absHW, TORSO.obliqueTopY], [40, TORSO.obliqueTopY + 4], [30, TORSO.chestY],
  ]),
  lats: bilateral([
    [30, TORSO.chestY], [40, TORSO.obliqueTopY + 4], [CX - absHW, TORSO.obliqueTopY], [CX - absHW + 3, TORSO.waistY], [58, TORSO.waistY], [48, TORSO.obliqueTopY + 10],
  ]),
  lowerBack: blob([
    [CX - 20, TORSO.waistY], [CX + 20, TORSO.waistY], [CX + 16, TORSO.hipY], [CX - 16, TORSO.hipY],
  ]),
  glutes: bilateral([
    [legEdge(0, "outer") - 4, LEG[0].y], [legEdge(0, "inner"), LEG[0].y], [legEdge(0, "inner") - 4, LEG[0].y + 38], [legEdge(0, "outer") + 2, LEG[0].y + 42],
  ]),
  quads: bilateral([
    [legEdge(0, "outer"), LEG[0].y], [legEdge(0, "inner") - ADDUCTOR_INSET, LEG[0].y],
    [legEdge(1, "inner") - ADDUCTOR_INSET, LEG[1].y], [legEdge(2, "inner") - ADDUCTOR_INSET, LEG[2].y],
    [legEdge(2, "outer"), LEG[2].y], [legEdge(1, "outer"), LEG[1].y],
  ]),
  adductors: bilateral([
    [legEdge(0, "inner") - ADDUCTOR_INSET, LEG[0].y], [legEdge(0, "inner"), LEG[0].y],
    [legEdge(1, "inner"), LEG[1].y], [legEdge(2, "inner"), LEG[2].y],
    [legEdge(2, "inner") - ADDUCTOR_INSET, LEG[2].y], [legEdge(1, "inner") - ADDUCTOR_INSET, LEG[1].y],
  ]),
  hamstrings: bilateral([
    [legEdge(0, "outer") + 2, LEG[0].y + 42], [legEdge(0, "inner") - 4, LEG[0].y + 38],
    [legEdge(1, "inner"), LEG[1].y], [legEdge(2, "inner"), LEG[2].y],
    [legEdge(2, "outer"), LEG[2].y], [legEdge(1, "outer"), LEG[1].y],
  ]),
  calves: bilateral([
    [legEdge(2, "outer"), LEG[2].y], [legEdge(2, "inner"), LEG[2].y],
    [legEdge(3, "inner"), LEG[3].y], [legEdge(4, "inner"), LEG[4].y],
    [legEdge(4, "outer"), LEG[4].y], [legEdge(3, "outer"), LEG[3].y],
  ]),
};

/* Non-interactive body parts — head, neck, hands, feet. Drawn in a fixed neutral tone (never a
   readiness color, since they aren't muscles you train) so the figure reads as a complete person
   even though only the muscle regions above are selectable. */
function BodyCaps() {
  const handL = blob([[armX.wrist - ARM.wrist.hw, ARM.wrist.y], [armX.wrist + ARM.wrist.hw, ARM.wrist.y], [armX.wrist + 6, ARM.wrist.y + 34], [armX.wrist - 6, ARM.wrist.y + 34]]);
  const footL = blob([[legEdge(4, "outer") + 2, LEG[4].y], [legEdge(4, "inner") - 2, LEG[4].y], [legEdge(4, "inner") + 6, LEG[4].y + 20], [legEdge(4, "outer") - 8, LEG[4].y + 20]]);
  return (
    <g fill="var(--bg-elev2)" stroke="var(--readiness-outline)" strokeOpacity="0.5" strokeWidth="1.5">
      <ellipse cx={CX} cy={54} rx={28} ry={34} />
      <path d={blob([[CX - 12, 82], [CX + 12, 82], [CX + 16, 104], [CX - 16, 104]])} />
      <path d={handL} /><path d={mirrorX(handL)} />
      <path d={footL} /><path d={mirrorX(footL)} />
    </g>
  );
}

// Every bilateral region shares one recovery number across its left and right paths — Asc3end's
// data has never tracked sides independently, so there is nothing truer to report per side. Most
// bilateral regions (chest, biceps, quads, ...) are still presented as one fused button with one
// label, matching how a person actually thinks of "my chest" as a single thing. Triceps is the
// exception: it's the region this map most needs to prove is tappable on *either* arm, so it gets
// its own per-side labels ("Left Triceps: Ready" / "Right Triceps: Ready") while still resolving
// to the exact same id, state and single detail panel as every other region.
const PER_SIDE_LABELS = { triceps: ["Left Triceps", "Right Triceps"] };

/* One selectable muscle region — a real ARIA button (role="button", tabIndex, aria-pressed), not
   a decorative shape, so it's reachable and operable with just a keyboard. Text state always
   accompanies color (aria-label + the visible detail panel below), per "don't rely on color
   alone." Selection is shown with the app's own green accent plus a soft glow (filter, defined
   once on the parent <svg>) — never a bright white ring. */
function MuscleRegion({ id, label, state, shape, selected, onSelect }) {
  const isSel = selected === id;
  const paths = Array.isArray(shape) ? shape : [shape];
  const sideLabels = PER_SIDE_LABELS[id];

  const pathStyle = {
    fill: READINESS_COLORS[state],
    fillOpacity: isSel ? 1 : 0.88,
    stroke: isSel ? "var(--brass)" : "var(--readiness-outline)",
    strokeWidth: isSel ? 2 : 1,
    strokeOpacity: isSel ? 1 : 0.5,
    transition: "fill-opacity 0.15s ease",
  };

  // Two independently-focusable, independently-labeled buttons (one per side) that both resolve
  // to the same region id — tapping/tabbing to either one selects "triceps" as a whole, so there
  // is still exactly one detail panel, one state, one selection outcome; only the accessible name
  // and the hit target differ per side.
  if (sideLabels && paths.length === 2) {
    return (
      <>
        {paths.map((d, i) => (
          <g
            key={i}
            onClick={() => onSelect?.(id)}
            onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(id); } }}
            role={onSelect ? "button" : undefined}
            tabIndex={onSelect ? 0 : undefined}
            aria-pressed={onSelect ? isSel : undefined}
            aria-label={`${sideLabels[i]}: ${READINESS_LABEL[state]}`}
            style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}
            filter={isSel ? "url(#readinessSelectedGlow)" : undefined}
          >
            <path d={d} style={pathStyle} />
          </g>
        ))}
      </>
    );
  }

  return (
    <g
      onClick={() => onSelect?.(id)}
      onKeyDown={(e) => { if (onSelect && (e.key === "Enter" || e.key === " ")) { e.preventDefault(); onSelect(id); } }}
      role={onSelect ? "button" : undefined}
      tabIndex={onSelect ? 0 : undefined}
      aria-pressed={onSelect ? isSel : undefined}
      aria-label={`${label}: ${READINESS_LABEL[state]}`}
      style={{ cursor: onSelect ? "pointer" : "default", outline: "none" }}
      filter={isSel ? "url(#readinessSelectedGlow)" : undefined}
    >
      {paths.map((d, i) => (
        <path key={i} d={d} style={pathStyle} />
      ))}
    </g>
  );
}

const FRONT_REGION_IDS = MUSCLE_REGIONS.filter((r) => r.view === "front" || r.view === "both").map((r) => r.id);
const BACK_REGION_IDS = MUSCLE_REGIONS.filter((r) => r.view === "back" || r.view === "both").map((r) => r.id);
const REGION_BY_ID = Object.fromEntries(MUSCLE_REGIONS.map((r) => [r.id, r]));

function BodyFigure({ view, readiness, selected, onSelect, maxWidth }) {
  const ids = view === "front" ? FRONT_REGION_IDS : BACK_REGION_IDS;
  return (
    <svg
      viewBox="0 0 200 620" style={{ width: "100%", maxWidth, display: "block", margin: "0 auto" }}
      role="group" aria-label={`${view === "front" ? "Front" : "Back"} muscle readiness map`}
    >
      <defs>
        <filter id="readinessSelectedGlow" x="-60%" y="-60%" width="220%" height="220%">
          <feDropShadow dx="0" dy="0" stdDeviation="3" floodColor="#3ECF8E" floodOpacity="0.75" />
        </filter>
      </defs>
      <BodyCaps />
      {ids.map((id) => (
        <MuscleRegion
          key={id} id={id} label={REGION_BY_ID[id].label}
          state={readiness[READINESS_DISPLAY_SOURCE[id] || id]?.level || "unknown"}
          shape={REGION_SHAPES[id]}
          selected={selected} onSelect={onSelect}
        />
      ))}
    </svg>
  );
}

export function FrontBodyFigure({ readiness, selected, onSelect, maxWidth = 240 }) {
  return <BodyFigure view="front" readiness={readiness} selected={selected} onSelect={onSelect} maxWidth={maxWidth} />;
}
export function BackBodyFigure({ readiness, selected, onSelect, maxWidth = 240 }) {
  return <BodyFigure view="back" readiness={readiness} selected={selected} onSelect={onSelect} maxWidth={maxWidth} />;
}

export function MuscleReadinessLegend() {
  return (
    <div style={{ display: "flex", flexWrap: "wrap", gap: 12, justifyContent: "center" }}>
      {["ready", "partial", "fatigued", "unknown"].map((lvl) => (
        <span key={lvl} className="mono" style={{ display: "flex", alignItems: "center", gap: 5, fontSize: 10.5, color: "var(--ink-dim)" }}>
          <span style={{ width: 9, height: 9, borderRadius: 5, background: READINESS_COLORS[lvl], display: "inline-block", flexShrink: 0 }} />
          {READINESS_LABEL[lvl]}
        </span>
      ))}
    </div>
  );
}

/* Plain-text equivalent of the figures, for anyone who can't see or tap the SVG — every region
   on the given view, grouped by current state, using the exact same readiness object. */
export function MuscleReadinessTextList({ readiness, view }) {
  const ids = view === "front" ? FRONT_REGION_IDS : view === "back" ? BACK_REGION_IDS : MUSCLE_REGIONS.map((r) => r.id);
  const byLevel = { ready: [], partial: [], fatigued: [], unknown: [] };
  ids.forEach((id) => byLevel[readiness[READINESS_DISPLAY_SOURCE[id] || id]?.level || "unknown"].push(REGION_BY_ID[id].label));
  return (
    <ul style={{ margin: 0, padding: 0, listStyle: "none" }}>
      {["ready", "partial", "fatigued", "unknown"].map((lvl) => byLevel[lvl].length > 0 && (
        <li key={lvl} style={{ fontSize: 11.5, color: "var(--ink-dim)", marginBottom: 3 }}>
          <span style={{ color: "var(--ink)" }}>{READINESS_LABEL[lvl]}:</span> {byLevel[lvl].join(", ")}
        </li>
      ))}
    </ul>
  );
}

/* Rationale/action copy is generated from the same computed numbers shown above it, never a
   canned string per muscle — so it can never say something the numbers on screen contradict. */
function readinessRationale(label, s) {
  if (s.level === "unknown") {
    return { why: `No logged sets for ${label.toLowerCase()} yet, so there isn't enough history to estimate recovery.`, action: `Log a workout that trains ${label.toLowerCase()} to start tracking it.` };
  }
  const when = fmtRelativeDate(s.lastDate)?.toLowerCase() || "recently";
  if (s.level === "fatigued") {
    return { why: `Trained ${when} — recently enough that it's still fatigued, based on ${s.recentSets} set${s.recentSets === 1 ? "" : "s"} logged in the last 7 days.`, action: "Consider resting this muscle today and training something else." };
  }
  if (s.level === "partial") {
    return { why: `Trained ${when} and still recovering, based on ${s.recentSets} set${s.recentSets === 1 ? "" : "s"} logged in the last 7 days.`, action: "You can train another muscle group today, or reduce volume if you still want to hit this one." };
  }
  return { why: `Last trained ${when} — enough time has passed that it's no longer estimated to be fatigued.`, action: "Good to train today." };
}

/* The rich per-muscle panel: name, status, percentage, last-trained date, recent workload,
   estimated recovery time, plain-language rationale, suggested action, and a way to jump to
   exercises for it. Every value here is read straight off the same readiness[] entry the figure
   used to choose that region's color — nothing here can disagree with what's on screen. */
export function MuscleRecoveryDetails({ regionId, readiness, onViewExercises }) {
  const region = REGION_BY_ID[regionId];
  const sourceId = READINESS_DISPLAY_SOURCE[regionId];
  const s = readiness[sourceId || regionId];
  if (!region || !s) return null;
  const { why, action } = readinessRationale(region.label, s);
  return (
    <div style={{ padding: 14, background: "var(--bg-elev2)", borderRadius: "var(--radius-md)" }}>
      <div style={{ display: "flex", justifyContent: "space-between", alignItems: "flex-start", gap: 8, marginBottom: 8 }}>
        <div>
          <div className="disp" style={{ fontSize: 15 }}>{region.label}</div>
          <div className="mono" style={{ fontSize: 11.5, color: READINESS_COLORS[s.level] }}>
            {READINESS_LABEL[s.level]}{s.recoveryPercent != null && ` — ${s.recoveryPercent}%`}
          </div>
        </div>
        <span style={{ width: 12, height: 12, borderRadius: 6, background: READINESS_COLORS[s.level], flexShrink: 0, marginTop: 4 }} aria-hidden="true" />
      </div>

      {s.level === "unknown" ? (
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.7 }}>Not trained yet.</div>
      ) : (
        <div className="mono" style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.9 }}>
          Last trained: {fmtRelativeDate(s.lastDate)}<br />
          Recent workload: {s.recentSets} working set{s.recentSets === 1 ? "" : "s"}<br />
          {s.level === "ready" ? "Ready to train now." : `Estimated ready: ~${s.hoursUntilReady}h`}
        </div>
      )}

      <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 10, fontStyle: "italic", color: "var(--ink-dim)" }}>&ldquo;{why}&rdquo;</div>
      <div style={{ fontSize: 12.5, lineHeight: 1.6, marginTop: 6 }}>{action}</div>

      {sourceId && (
        <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginTop: 8, fontStyle: "italic" }}>
          No exercise in Asc3end specifically targets {region.label.toLowerCase()} — this shows your {REGION_BY_ID[sourceId].label.toLowerCase()} reading, the closest muscle group Asc3end actually tracks.
        </div>
      )}

      {onViewExercises && (
        <button onClick={() => onViewExercises(region.group)} className="atlas-btn-ghost" style={{ width: "100%", marginTop: 10, fontSize: 11.5, padding: "8px 10px" }}>
          View {region.label} Exercises
        </button>
      )}

      <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic" }}>
        Training estimate based on time since last trained — not a medical measurement.
      </div>
    </div>
  );
}

/* Compact composition for Home: a single front figure, a plain-language summary, and a link to
   the full front-and-back map on Progress. Shares every SVG region/path with the full version
   below — nothing here is a second, differently-drawn figure. */
export function MuscleReadinessMap({ readiness, onViewFullBody, onViewExercises }) {
  const [selected, setSelected] = useState(null);
  const levelOf = (id) => readiness[READINESS_DISPLAY_SOURCE[id] || id]?.level;
  const readyCount = FRONT_REGION_IDS.filter((id) => levelOf(id) === "ready").length;
  const knownCount = FRONT_REGION_IDS.filter((id) => levelOf(id) !== "unknown").length;
  return (
    <div>
      <FrontBodyFigure readiness={readiness} selected={selected} onSelect={(id) => setSelected(selected === id ? null : id)} maxWidth={170} />
      <div style={{ textAlign: "center", marginTop: 8 }}>
        <MuscleReadinessLegend />
        <div className="mono" style={{ fontSize: 11, color: "var(--ink-dim)", marginTop: 8 }}>
          {knownCount === 0 ? "Log a workout to start tracking readiness." : `${readyCount} of ${FRONT_REGION_IDS.length} muscle groups ready`}
        </div>
      </div>
      {selected && (
        <div style={{ marginTop: 10 }}>
          <MuscleRecoveryDetails regionId={selected} readiness={readiness} onViewExercises={onViewExercises} />
        </div>
      )}
      {onViewFullBody && (
        <button onClick={onViewFullBody} className="atlas-btn-ghost" style={{ width: "100%", marginTop: 10 }}>View Full Body</button>
      )}
    </div>
  );
}
