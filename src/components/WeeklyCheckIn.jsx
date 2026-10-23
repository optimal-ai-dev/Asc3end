import { useMemo, useState } from "react";
import { TrendingUp } from "lucide-react";
import { computeWeeklyCheckIn } from "../lib/adaptiveCalories";
import { todayStr } from "../lib/dateUtils";

/* Weekly adaptive calorie check-in. Shows what the person's own logged weight and intake say
   their target should be, and only changes anything when they tap Apply. */
export function WeeklyCheckIn({ profile, nutrition, weightlog, targets, onUpdateProfile }) {
  const [saving, setSaving] = useState(false);
  const checkIn = useMemo(
    () => computeWeeklyCheckIn({ profile, nutrition, weightlog, today: todayStr() }),
    [profile, nutrition, weightlog]
  );

  if (targets.source === "manual") return null; // a manual override is the user's call — don't second-guess it here

  const applied = profile.adaptiveCalories?.weekOf === checkIn.weekOf && profile.adaptiveCalories?.goal === profile.goal;
  const apply = async (calories) => {
    setSaving(true);
    await onUpdateProfile({ ...profile, adaptiveCalories: { calories, goal: profile.goal, weekOf: checkIn.weekOf } });
    setSaving(false);
  };
  const reset = async () => {
    setSaving(true);
    await onUpdateProfile({ ...profile, adaptiveCalories: null });
    setSaving(false);
  };

  return (
    <div className="atlas-card" style={{ marginBottom: 16 }}>
      <div style={{ display: "flex", alignItems: "center", gap: 6, marginBottom: 4 }}>
        <TrendingUp size={15} color="var(--brass)" />
        <h2 className="disp" style={{ fontSize: 14 }}>Weekly Check-In</h2>
      </div>
      {checkIn.status === "need_data" ? (
        <div style={{ fontSize: 11.5, color: "var(--ink-dim)", lineHeight: 1.5 }}>
          Log your food and weigh in a few times a week, and your calorie target will start adjusting to how your body actually responds.
          <div className="mono" style={{ fontSize: 10, marginTop: 6 }}>
            Last 3 weeks: {checkIn.intakeDays}/{checkIn.needIntakeDays} days logged · {checkIn.weighIns}/{checkIn.needWeighIns} weigh-ins
          </div>
        </div>
      ) : (
        <div style={{ fontSize: 12, lineHeight: 1.5 }}>
          <div style={{ color: "var(--ink-dim)", fontSize: 11.5 }}>
            Over the last 3 weeks you averaged {checkIn.avgIntake} kcal/day and your weight trended{" "}
            {checkIn.weeklyWeightChangeKg === 0 ? "flat" : `${checkIn.weeklyWeightChangeKg > 0 ? "+" : ""}${checkIn.weeklyWeightChangeKg} kg/week`}.
            That puts your maintenance at about {checkIn.estimatedMaintenance} kcal.
          </div>
          {applied ? (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--good)", marginTop: 8 }}>
              Updated for this week: {profile.adaptiveCalories.calories} kcal/day. Next check-in on Monday.
            </div>
          ) : checkIn.change === 0 ? (
            <div className="mono" style={{ fontSize: 10.5, color: "var(--good)", marginTop: 8 }}>You're on track. Keep {checkIn.current} kcal/day this week.</div>
          ) : (
            <>
              <div style={{ marginTop: 8 }}>
                Suggested: <strong>{checkIn.calories} kcal/day</strong>{" "}
                <span className="mono" style={{ fontSize: 10.5, color: checkIn.change > 0 ? "var(--good)" : "var(--warn)" }}>
                  ({checkIn.change > 0 ? "+" : ""}{checkIn.change} from {checkIn.current})
                </span>
              </div>
              <button className="atlas-btn" style={{ width: "100%", marginTop: 8 }} disabled={saving} onClick={() => apply(checkIn.calories)}>
                {saving ? "Saving…" : "Apply new target"}
              </button>
            </>
          )}
          {targets.source === "adaptive" && (
            <button onClick={reset} disabled={saving} className="mono" style={{ display: "block", margin: "8px auto 0", background: "none", border: "none", cursor: "pointer", color: "var(--ink-dim)", fontSize: 10 }}>
              Go back to the standard formula ({checkIn.formulaCalories ?? ""} kcal)
            </button>
          )}
        </div>
      )}
    </div>
  );
}
