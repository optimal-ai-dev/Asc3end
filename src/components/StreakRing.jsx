import { useId } from "react";
import { Flame } from "lucide-react";

/* ------------------------------------------------------------------ */
/* Dashboard                                                           */
/* ------------------------------------------------------------------ */

/* Signature element: a glowing progress ring that fills toward the next 7-day streak milestone */
export function StreakRing({ streak, size = 92 }) {
  const gid = useId();
  const gradId = `ring-${gid}`;
  const r = 38;
  const c = 2 * Math.PI * r;
  const progress = streak === 0 ? 0 : (streak % 7 === 0 ? 1 : (streak % 7) / 7);
  return (
    <div style={{ position: "relative", width: size, height: size, flexShrink: 0 }}>
      <svg viewBox="0 0 96 96" width={size} height={size}>
        <defs>
          <linearGradient id={gradId} x1="0%" y1="0%" x2="100%" y2="100%">
            <stop offset="0%" stopColor="var(--brass)" />
            <stop offset="100%" stopColor="var(--steel)" />
          </linearGradient>
        </defs>
        <circle cx="48" cy="48" r={r} fill="none" stroke="var(--bg-elev2)" strokeWidth="8" />
        <circle
          cx="48" cy="48" r={r} fill="none" stroke={`url(#${gradId})`} strokeWidth="8" strokeLinecap="round"
          strokeDasharray={c} strokeDashoffset={c * (1 - progress)}
          transform="rotate(-90 48 48)"
          style={{ transition: "stroke-dashoffset 0.6s ease" }}
        />
      </svg>
      <div style={{ position: "absolute", inset: 0, display: "flex", flexDirection: "column", alignItems: "center", justifyContent: "center" }}>
        <Flame size={16} color="var(--brass)" />
        <div className="disp" style={{ fontSize: 22, lineHeight: 1 }}>{streak}</div>
      </div>
    </div>
  );
}
