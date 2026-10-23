import { Flag, Dumbbell, Medal, Flame, Rocket, Weight, Trophy, CalendarCheck, Layers, Salad, Target, Award } from "lucide-react";

// Achievement and challenge artwork as Lucide line icons in a rounded tile, replacing the system
// emoji these used to render (which looked different on every phone and clashed with the line
// icons used everywhere else). Keyed by the badge/challenge template id; the emoji `icon` strings
// stay in the data for anything that still wants plain text (share copy, analytics).
const ICONS = {
  first: Flag, ten: Dumbbell, twentyfive: Medal, streak7: Flame, streak30: Rocket,
  vol10k: Weight, vol100k: Trophy,
  consistency30: CalendarCheck, sets1000: Layers, nutrition21: Salad, prHunt: Target,
};

export function BadgeIcon({ id, earned = true, size = 40 }) {
  const Icon = ICONS[id] || Award;
  return (
    <span aria-hidden="true" style={{
      width: size, height: size, borderRadius: Math.round(size * 0.3), flexShrink: 0,
      display: "inline-flex", alignItems: "center", justifyContent: "center",
      background: earned ? "var(--brass-soft)" : "var(--bg-elev2)",
      color: earned ? "var(--brass)" : "var(--ink-dim)",
      opacity: earned ? 1 : 0.55,
    }}>
      <Icon size={Math.round(size * 0.5)} strokeWidth={2} />
    </span>
  );
}
