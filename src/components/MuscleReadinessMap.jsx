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
/* Figure geometry                                                     */
/* ------------------------------------------------------------------ */
// Drawn the way gym apps draw a muscle chart: a neutral body silhouette underneath, with each
// muscle laid on top as its own anatomical shape (fan-shaped pecs, capped delts, a six-pack, a
// teardrop quad) and thin seams between muscles, made by stroking every muscle in the card colour.
// Every shape is authored for the figure's left side (x < 100) and mirrored. viewBox 20 0 160 400,
// centerline x=100, roughly eight heads tall.
const CX = 100;

const ABS_ROWS = [[128, 144], [147, 163], [166, 182]];
const absSegments = [
  ...ABS_ROWS.flatMap(([top, bottom]) => bilateral([[89.5, top], [98.5, top], [98.5, bottom], [90.5, bottom]])),
  ...bilateral([[90.5, 185], [98.5, 185], [98.5, 210], [95, 206]]),
];

const SIDE_DELT = [[46, 76], [39, 82], [35.5, 96], [37, 110], [43, 108], [42, 90]];
const FOREARM = [[38, 156], [33, 170], [30, 190], [31, 205], [37, 206], [44, 190], [51, 166], [50, 155]];

const REGION_SHAPES = {
  // Front
  chest: bilateral([[98.5, 80], [98.5, 122], [86, 128], [70, 124], [60, 112], [60, 90], [70, 80], [86, 77]]),
  frontDelts: bilateral([[62, 74], [50, 73], [44, 80], [44, 96], [48, 108], [55, 114], [60, 104], [60, 86]]),
  sideDelts: bilateral(SIDE_DELT),
  biceps: bilateral([[42, 116], [37, 128], [38, 144], [42, 152], [49, 150], [53, 136], [54, 118], [48, 112]]),
  forearms: bilateral(FOREARM),
  abs: absSegments,
  obliques: bilateral([[87, 130], [72, 126], [64, 136], [66, 160], [70, 184], [80, 200], [87, 198], [87, 160]]),
  quads: bilateral([[66, 212], [62, 236], [64, 262], [70, 290], [76, 300], [86, 298], [90, 280], [90, 250], [84, 226], [76, 214]]),
  adductors: bilateral([[86, 222], [98, 226], [97, 248], [92, 272], [89, 250], [86, 234]]),
  calves: bilateral([[72, 312], [67, 330], [70, 356], [76, 376], [82, 376], [86, 350], [90, 326], [88, 312]]),
  // Back
  traps: blob([[100, 62], [90, 66], [74, 74], [64, 78], [78, 84], [90, 100], [96, 124], [100, 132], [104, 124], [110, 100], [122, 84], [136, 78], [126, 74], [110, 66]]),
  rearDelts: bilateral([[64, 77], [50, 73], [44, 80], [44, 96], [48, 108], [55, 112], [60, 100], [64, 88]]),
  upperBack: bilateral([[66, 86], [60, 96], [62, 116], [72, 126], [88, 124], [94, 112], [88, 96], [78, 86]]),
  triceps: bilateral([[44, 112], [37, 124], [36, 140], [40, 152], [48, 152], [53, 140], [55, 120], [50, 112]]),
  lats: bilateral([[60, 118], [62, 138], [66, 160], [72, 180], [84, 192], [94, 178], [94, 150], [88, 130], [72, 128]]),
  lowerBack: blob([[94, 158], [96, 178], [89, 192], [95, 201], [105, 201], [111, 192], [104, 178], [106, 158], [100, 154]]),
  glutes: bilateral([[66, 200], [63, 214], [66, 232], [78, 240], [94, 238], [98.5, 224], [98.5, 206], [86, 198]]),
  hamstrings: bilateral([[64, 242], [64, 262], [70, 290], [78, 302], [86, 300], [92, 282], [96, 256], [95, 244], [80, 246]]),
};
// Calves read from the back too; on the rear figure they get the two-headed gastrocnemius shape.
const BACK_SHAPES = {
  calves: bilateral([[70, 310], [66, 328], [70, 350], [78, 366], [86, 358], [92, 334], [92, 312], [82, 306]]),
};

const SILHOUETTE = [
  // torso
  ...bilateral([[100, 64], [84, 66], [62, 72], [56, 86], [58, 110], [62, 130], [66, 150], [68, 172], [66, 192], [62, 208], [72, 220], [100, 226]]),
  // arm and hand
  ...bilateral([[50, 74], [40, 80], [35, 100], [35, 130], [34, 150], [30, 170], [28, 190], [29, 207], [39, 207], [44, 192], [50, 168], [54, 152], [57, 128], [58, 100], [60, 84]]),
  ...bilateral([[29, 207], [39, 207], [41, 226], [35, 236], [28, 228]]),
  // leg and foot
  ...bilateral([[63, 204], [60, 230], [62, 262], [67, 300], [66, 330], [70, 360], [75, 386], [87, 386], [90, 356], [93, 326], [93, 300], [97, 260], [99.5, 224], [84, 214]]),
  ...bilateral([[75, 384], [87, 384], [90, 397], [71, 397]]),
  // neck
  blob([[91, 46], [109, 46], [111, 68], [89, 68]]),
];

/* Non-interactive body: the silhouette every muscle sits on, plus the head. Drawn in a fixed
   neutral tone (never a readiness color) so knees, elbows, hands and feet read as body, not as
   untrained muscle. */
function BodyCaps() {
  return (
    <g fill="var(--bg-elev2)">
      {SILHOUETTE.map((d, i) => <path key={i} d={d} />)}
      <ellipse cx={CX} cy={30} rx={17} ry={22} />
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
    stroke: isSel ? "var(--brass)" : "var(--bg-elev)",
    strokeWidth: isSel ? 2 : 1.6,
    strokeLinejoin: "round",
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
      viewBox="20 0 160 400" style={{ width: "100%", maxWidth, display: "block", margin: "0 auto" }}
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
          shape={(view === "back" && BACK_SHAPES[id]) || REGION_SHAPES[id]}
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
