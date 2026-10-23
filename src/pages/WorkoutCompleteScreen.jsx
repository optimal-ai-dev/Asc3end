import { useRef, useState, useEffect } from "react";
import { Loader2, Share2, Download, Check, Trophy, Flame } from "lucide-react";
import { logEvent } from "../lib/analytics";
import { workoutVolume } from "../lib/workoutHelpers";

/* ------------------------------------------------------------------ */
/* Workout completion screen + shareable card                          */
/* ------------------------------------------------------------------ */
// Privacy rules for the shareable card (see ShareCard below), stated once here so both the
// component and anyone reviewing it can check behavior against the same list:
//   1. The card only ever contains data from the ONE workout just completed — never lifetime
//      totals, other sessions, or anything that reveals how long someone's been using the app.
//   2. Bodyweight, nutrition data, email, and location are never included, full stop — there is
//      no code path in ShareCard that reads any of those fields.
//   3. The athlete's name is opt-in (a checkbox, default OFF) — nothing identifying goes on the
//      card unless the person generating it explicitly turns it on for that one card.
//   4. Generating a card never sends it anywhere. It produces a local PNG the person can save or
//      hand to their own device's native share sheet — Asc3end itself never posts, uploads, or
//      transmits it, and the button that does either is only ever triggered by an explicit click.
//   5. No invented social content — no fake like/view counts, no leaderboard comparison, nothing
//      presented as if other people are watching.

function ShareCard({ workout, athleteName }) {
  const canvasRef = useRef(null);
  const [status, setStatus] = useState("idle"); // idle | rendering | ready | error
  const [nativeShareAvailable, setNativeShareAvailable] = useState(false);
  const blobRef = useRef(null);

  const volume = Math.round(workoutVolume(workout));
  const setCount = (workout.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const durationMin = workout.startedAt && workout.completedAt ? Math.max(1, Math.round((new Date(workout.completedAt) - workout.startedAt) / 60000)) : null;
  const bestPR = (workout.prs || [])[0] || null;
  const dateLabel = new Date(workout.date).toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric" });

  const svgMarkup = `
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="750" viewBox="0 0 600 750">
      <defs>
        <linearGradient id="bg" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stop-color="#0A130F" />
          <stop offset="100%" stop-color="#060B08" />
        </linearGradient>
      </defs>
      <rect width="600" height="750" fill="url(#bg)" />
      <rect x="24" y="24" width="552" height="702" rx="24" fill="none" stroke="#1E2E27" stroke-width="1.5" />
      <text x="60" y="90" font-family="Oswald, sans-serif" font-size="22" letter-spacing="3" fill="#3ECF8E">ASC3END</text>
      ${athleteName ? `<text x="60" y="128" font-family="Oswald, sans-serif" font-size="17" fill="#E7EFEA">${escapeXml(athleteName)}</text>` : ""}
      <text x="60" y="${athleteName ? 160 : 130}" font-family="'JetBrains Mono', monospace" font-size="13" fill="#7C9188">${escapeXml(dateLabel)}</text>
      <text x="60" y="230" font-family="Oswald, sans-serif" font-size="34" fill="#F4F8F6">${escapeXml(workout.planDayName || "Free Workout")}</text>
      ${bestPR ? `
        <rect x="60" y="260" width="480" height="64" rx="12" fill="#3ECF8E22" stroke="#3ECF8E" stroke-width="1.5" />
        <text x="84" y="288" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="1" fill="#3ECF8E">NEW PERSONAL RECORD</text>
        <text x="84" y="312" font-family="Oswald, sans-serif" font-size="19" fill="#F4F8F6">${escapeXml(bestPR.exName)} — ${bestPR.weight}kg × ${bestPR.reps}</text>
      ` : ""}
      ${[
        { label: "VOLUME", value: `${volume.toLocaleString()}kg` },
        { label: "SETS", value: `${setCount}` },
        { label: "DURATION", value: durationMin ? `${durationMin} min` : "—" },
      ].map((s, i) => `
        <text x="${60 + i * 176}" y="${bestPR ? 400 : 340}" font-family="'JetBrains Mono', monospace" font-size="11" letter-spacing="1" fill="#7C9188">${s.label}</text>
        <text x="${60 + i * 176}" y="${(bestPR ? 400 : 340) + 40}" font-family="Oswald, sans-serif" font-size="30" fill="#F4F8F6">${s.value}</text>
      `).join("")}
      <text x="60" y="690" font-family="'JetBrains Mono', monospace" font-size="11" fill="#4F6058">Train, eat, and progress with Asc3end.</text>
    </svg>
  `.trim();

  function escapeXml(s) {
    return String(s).replace(/[<>&'"]/g, (c) => ({ "<": "&lt;", ">": "&gt;", "&": "&amp;", "'": "&apos;", '"': "&quot;" }[c]));
  }

  const render = async () => {
    setStatus("rendering");
    try {
      // Drawing an SVG-as-image onto a canvas doesn't reliably wait for the page's own webfonts
      // (Oswald/JetBrains Mono, both loaded elsewhere via GlobalStyle) the first time they're
      // needed — without this the card can silently rasterize with the browser's default
      // sans-serif instead, which looks unfinished for something meant to be shared.
      if (document.fonts?.ready) await document.fonts.ready;
      const svgBlob = new Blob([svgMarkup], { type: "image/svg+xml;charset=utf-8" });
      const url = URL.createObjectURL(svgBlob);
      const img = new Image();
      await new Promise((resolve, reject) => {
        img.onload = resolve;
        img.onerror = reject;
        img.src = url;
      });
      const canvas = canvasRef.current;
      const scale = 2;
      canvas.width = 600 * scale;
      canvas.height = 750 * scale;
      const ctx = canvas.getContext("2d");
      ctx.scale(scale, scale);
      ctx.drawImage(img, 0, 0, 600, 750);
      URL.revokeObjectURL(url);
      const blob = await new Promise((resolve) => canvas.toBlob(resolve, "image/png"));
      blobRef.current = blob;
      setNativeShareAvailable(!!(navigator.share && navigator.canShare && blob && navigator.canShare({ files: [new File([blob], "workout.png", { type: "image/png" })] })));
      setStatus("ready");
    } catch (e) {
      setStatus("error");
    }
  };

  useEffect(() => { render(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, []);

  const download = () => {
    if (!blobRef.current) return;
    const url = URL.createObjectURL(blobRef.current);
    const a = document.createElement("a");
    a.href = url;
    a.download = `asc3end-workout-${workout.date}.png`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
    logEvent("share_card_downloaded", {});
  };

  const nativeShare = async () => {
    if (!blobRef.current) return;
    try {
      await navigator.share({
        files: [new File([blobRef.current], "asc3end-workout.png", { type: "image/png" })],
        title: "My Asc3end workout",
      });
      logEvent("share_card_shared", {});
    } catch (e) { /* user cancelled the share sheet — not an error */ }
  };

  return (
    <div>
      <div style={{ borderRadius: 12, overflow: "hidden", border: "1px solid var(--line)", marginBottom: 12, background: "#060B08" }}>
        {status === "rendering" && (
          <div style={{ aspectRatio: "600/750", display: "flex", alignItems: "center", justifyContent: "center" }}>
            <Loader2 size={22} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />
          </div>
        )}
        {status === "error" && (
          <div style={{ aspectRatio: "600/750", display: "flex", alignItems: "center", justifyContent: "center", padding: 20, textAlign: "center", fontSize: 12, color: "var(--ink-dim)" }}>
            Couldn't generate the image. You can still try again below.
          </div>
        )}
        <canvas ref={canvasRef} style={{ width: "100%", display: status === "ready" ? "block" : "none" }} />
      </div>
      <div style={{ display: "flex", gap: 8 }}>
        {nativeShareAvailable && (
          <button className="atlas-btn" style={{ flex: 1 }} onClick={nativeShare} disabled={status !== "ready"}>
            <Share2 size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Share
          </button>
        )}
        <button className={nativeShareAvailable ? "atlas-btn-ghost" : "atlas-btn"} style={{ flex: 1 }} onClick={status === "error" ? render : download} disabled={status === "rendering"}>
          <Download size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> {status === "error" ? "Retry" : "Download"}
        </button>
      </div>
    </div>
  );
}

export function WorkoutCompleteScreen({ workout, streakBefore, streakAfter, athleteDisplayName, onDone }) {
  const [showShare, setShowShare] = useState(false);
  const [includeName, setIncludeName] = useState(false);
  const xp = workout.xpBreakdown || { completion: 0, sets: 0, prBonus: 0, streakBonus: 0, total: 0 };
  const volume = Math.round(workoutVolume(workout));
  const setCount = (workout.exercises || []).reduce((n, e) => n + (e.sets || []).length, 0);
  const exerciseCount = (workout.exercises || []).length;
  const durationMin = workout.startedAt && workout.completedAt ? Math.max(1, Math.round((new Date(workout.completedAt) - workout.startedAt) / 60000)) : null;
  const streakGrew = streakAfter > streakBefore;

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 55, display: "flex", flexDirection: "column" }}>
      <div style={{ flex: 1, overflowY: "auto", padding: "40px 18px 24px" }}>
        <div style={{ textAlign: "center", marginBottom: 24 }}>
          <div style={{ width: 64, height: 64, borderRadius: "50%", background: "linear-gradient(135deg, var(--brass), #2BAE73)", display: "flex", alignItems: "center", justifyContent: "center", margin: "0 auto 14px" }}>
            <Check size={30} color="#072016" strokeWidth={3} />
          </div>
          <h1 className="disp-title" style={{ fontSize: 24 }}>Workout Complete</h1>
          <div style={{ color: "var(--ink-dim)", fontSize: 13, marginTop: 4 }}>{workout.planDayName || "Free Workout"}</div>
        </div>

        <div style={{ display: "flex", gap: 10, marginBottom: 16 }}>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{exerciseCount}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>EXERCISES</div>
          </div>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{setCount}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>SETS</div>
          </div>
          <div className="atlas-card" style={{ flex: 1, textAlign: "center", padding: 14 }}>
            <div className="disp" style={{ fontSize: 20 }}>{durationMin ? `${durationMin}m` : "—"}</div>
            <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)" }}>DURATION</div>
          </div>
        </div>

        {workout.prs && workout.prs.length > 0 && (
          <div className="atlas-card" style={{ marginBottom: 16, borderColor: "var(--brass)" }}>
            <div className="disp" style={{ fontSize: 13, color: "var(--brass)", marginBottom: 8 }}>
              <Trophy size={13} style={{ verticalAlign: -2, marginRight: 5 }} />{workout.prs.length} New PR{workout.prs.length === 1 ? "" : "s"}
            </div>
            <div style={{ display: "flex", flexDirection: "column", gap: 4 }}>
              {workout.prs.map((pr, i) => (
                <div key={i} className="mono" style={{ fontSize: 12, color: "var(--ink-dim)" }}>
                  {pr.exName} — {pr.weight}kg × {pr.reps} {pr.type === "weight" ? "(heaviest yet)" : "(most reps at this weight)"}
                </div>
              ))}
            </div>
          </div>
        )}

        {streakGrew && (
          <div className="atlas-card" style={{ marginBottom: 16, display: "flex", alignItems: "center", gap: 10, borderColor: "var(--warn)" }}>
            <Flame size={20} color="var(--warn)" style={{ flexShrink: 0 }} />
            <div style={{ fontSize: 13 }}>{streakAfter} day streak — keep it going.</div>
          </div>
        )}

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>XP Earned</h2>
          <div style={{ display: "flex", flexDirection: "column", gap: 6 }}>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Workout completion</span><span className="mono">+{xp.completion}</span></div>
            <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Sets &amp; exercises</span><span className="mono">+{xp.sets}</span></div>
            {xp.prBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Personal record bonus</span><span className="mono">+{xp.prBonus}</span></div>}
            {xp.streakBonus > 0 && <div style={{ display: "flex", justifyContent: "space-between", fontSize: 12, color: "var(--ink-dim)" }}><span>Streak bonus</span><span className="mono">+{xp.streakBonus}</span></div>}
            <div style={{ borderTop: "1px solid var(--line)", marginTop: 4, paddingTop: 8, display: "flex", justifyContent: "space-between" }}>
              <span className="disp">Total XP earned</span>
              <span className="mono" style={{ color: "var(--brass)" }}>+{xp.total}</span>
            </div>
          </div>
        </div>

        <div className="atlas-card" style={{ marginBottom: 16 }}>
          {!showShare ? (
            <button className="atlas-btn-ghost" style={{ width: "100%" }} onClick={() => setShowShare(true)}>
              <Share2 size={15} style={{ verticalAlign: -3, marginRight: 6 }} /> Create Shareable Card
            </button>
          ) : (
            <div>
              <h2 className="disp" style={{ fontSize: 14, marginBottom: 8 }}>Share This Workout</h2>
              <label style={{ display: "flex", alignItems: "center", gap: 8, marginBottom: 12, cursor: "pointer" }} className="mono">
                <input type="checkbox" checked={includeName} onChange={(e) => setIncludeName(e.target.checked)} />
                <span style={{ fontSize: 11.5, color: "var(--ink-dim)" }}>Include my name on the card</span>
              </label>
              <ShareCard workout={workout} athleteName={includeName ? athleteDisplayName : null} />
              <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginTop: 10, fontStyle: "italic" }}>
                Only this workout's stats are on the card — no bodyweight, nutrition, or account data. Nothing is posted anywhere until you choose to share or download it.
              </div>
            </div>
          )}
        </div>
      </div>

      <div style={{ padding: "12px 18px calc(env(safe-area-inset-bottom, 0px) + 12px)" }}>
        <button className="atlas-btn" style={{ width: "100%", padding: 14 }} onClick={onDone}>Done</button>
      </div>
    </div>
  );
}
