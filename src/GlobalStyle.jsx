import React from "react";

/* Shared design system styles — used by App.jsx and AuthScreen.jsx so the login screen
   matches the rest of the app instead of looking like a separate, unstyled page. */
export default function GlobalStyle() {
  return (
    <style>{`
      @import url('https://fonts.googleapis.com/css2?family=Oswald:wght@400;500;600;700&family=Manrope:wght@400;500;600;700;800&family=JetBrains+Mono:wght@400;600&display=swap');

      :root {
        --bg: #0A120E;
        --bg-elev: #121C17;
        --bg-elev2: #1B2822;
        --line: #253830;
        --ink: #F1F5F3;
        --ink-dim: #86A296;
        --brass: #3ECF8E;
        --brass-soft: rgba(62,207,142,0.16);
        --skin: #D4C4A8;
        --skin-dim: #8B8070;
        --muscle-hl: var(--brass);
        --steel: #4F9DFF;
        --good: #3ECF8E;
        --warn: #FFA53D;
        --rest: #FF6B81;

        /* Muscle Readiness Map palette — its own dedicated tokens (not a reuse of --good/--warn/
           --rest) because this feature's colors were specified as exact hex values distinct from
           the app's general-purpose status colors, even though "ready" happens to land on the
           same green as --brass. Every readiness component reads these, never a literal hex. */
        --readiness-ready: #3ECF8E;
        --readiness-partial: #F3B33D;
        --readiness-fatigued: #FF6B6B;
        --readiness-unknown: #33423B;
        --readiness-outline: #71D6A5;

        /* Formalized design tokens (Launch visual upgrade, Phase 1) — the palette above was
           already correct and well-used; these are the values that WERE being repeated inline
           and inconsistently (8px here, 10px there, 12px somewhere else for what was meant to be
           the same "card corner" concept) rather than genuinely new colors. Existing call sites
           are left alone — retrofitting every inline style in a 4000-line file for a token that
           produces the identical rendered pixel value is exactly the "uncontrolled redesign" this
           work is scoped to avoid. New components (recovery map, carousel, charts) use these. */
        --radius-sm: 8px;
        --radius-md: 12px;
        --radius-lg: 20px;
        --shadow-card: 0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 28px -18px rgba(0,0,0,0.55);
        --shadow-elevated: 0 1px 0 rgba(255,255,255,0.04) inset, 0 20px 40px -20px rgba(0,0,0,0.7);
      }
      html, body, #root { height: 100%; }
      body { background: var(--bg); }
      .atlas-root {
        background:
          radial-gradient(560px 320px at 15% -8%, rgba(62,207,142,0.10), transparent 60%),
          radial-gradient(500px 300px at 100% 0%, rgba(79,157,255,0.06), transparent 55%),
          var(--bg);
        color: var(--ink);
        font-family: 'Manrope', sans-serif;
        min-height: 100%;
        width: 100%;
        max-width: 480px;
        margin: 0 auto;
        position: relative;
        /* index.html sets viewport-fit=cover so content can extend under the iPhone home
           indicator / rounded corners — env(safe-area-inset-*) falls back to 0 on devices
           without a safe area, so this is always safe to add. */
        padding-bottom: calc(88px + env(safe-area-inset-bottom));
      }
      .atlas-root * { box-sizing: border-box; }
      /* Real bug found live: <button className="atlas-card"> (onboarding goal picker, workout
         history rows) rendered with the browser's own default black button text instead of the
         theme's light ink colour — unlike <div>, form controls (button/input/select/textarea)
         don't inherit color from ancestors by default in the UA stylesheet, so black-on-dark made
         the text unreadable. Fixed the two known instances directly; this is the defense-in-depth
         net so the same class of bug can't silently reappear on a future button that forgets to
         set its own color. Wrapped in :where() so this contributes ZERO specificity — without
         that, "button { color }" (specificity 0,0,1,1) would outrank .atlas-btn/.pill/etc. (single
         class, 0,0,1,0) and override their intentional colors, e.g. turning the dark text on the
         bright-green primary button white and illegible. :where() keeps this strictly a fallback. */
      :where(.atlas-root) button, :where(.atlas-root) input, :where(.atlas-root) select, :where(.atlas-root) textarea { color: inherit; }
      /* margin/font-weight reset so this class looks identical whether it's applied to a <div> or
         a semantic <h1>-<h6> — several were converted to real headings for screen-reader
         navigation, and browsers give heading elements a default margin + bold weight that would
         otherwise shift the layout these were designed around. */
      .disp { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.02em; margin: 0; font-weight: 400; }
      .mono { font-family: 'JetBrains Mono', monospace; }
      .atlas-card {
        background: var(--bg-elev);
        border: 1px solid var(--line);
        border-radius: 20px;
        padding: 16px;
        box-shadow: 0 1px 0 rgba(255,255,255,0.03) inset, 0 12px 28px -18px rgba(0,0,0,0.55);
      }
      .atlas-btn {
        background: linear-gradient(135deg, var(--brass), #2BAE73);
        color: #072016;
        font-family: 'Oswald', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-weight: 600;
        border: none;
        border-radius: 12px;
        padding: 12px 18px;
        min-height: 44px;
        min-width: 44px;
        cursor: pointer;
        box-shadow: 0 6px 18px -6px rgba(62,207,142,0.5);
        transition: transform 0.12s ease, box-shadow 0.12s ease, opacity 0.15s ease;
      }
      .atlas-btn:hover { transform: translateY(-1px); box-shadow: 0 9px 22px -6px rgba(62,207,142,0.65); }
      .atlas-btn:active { transform: translateY(0); }
      .atlas-btn:disabled { opacity: 0.5; cursor: not-allowed; transform: none; box-shadow: none; }
      .atlas-btn-ghost {
        background: transparent;
        color: var(--ink);
        border: 1px solid var(--line);
        font-family: 'Oswald', sans-serif;
        text-transform: uppercase;
        letter-spacing: 0.03em;
        font-weight: 500;
        border-radius: 10px;
        padding: 10px 16px;
        min-height: 44px;
        min-width: 44px;
        cursor: pointer;
        transition: border-color 0.15s ease, color 0.15s ease;
      }
      .atlas-btn-ghost:hover { border-color: var(--brass); color: var(--brass); }
      .atlas-btn-ghost:disabled { opacity: 0.5; cursor: not-allowed; }
      .atlas-input {
        background: var(--bg-elev2);
        border: 1px solid var(--line);
        color: var(--ink);
        border-radius: 9px;
        padding: 10px 12px;
        font-family: 'Manrope', sans-serif;
        font-size: 14px;
        width: 100%;
      }
      .atlas-input:focus { outline: none; border-color: var(--brass); }
      .atlas-root button:focus-visible,
      .atlas-root a:focus-visible,
      .atlas-root input:focus-visible,
      .atlas-root select:focus-visible,
      .atlas-root [tabindex]:focus-visible {
        outline: 2px solid var(--brass);
        outline-offset: 2px;
      }
      .atlas-nav {
        position: fixed;
        bottom: 0; left: 50%; transform: translateX(-50%);
        width: 100%; max-width: 480px;
        background: var(--bg-elev);
        border-top: 1px solid var(--line);
        display: flex;
        justify-content: space-around;
        padding: 10px 4px calc(14px + env(safe-area-inset-bottom));
        z-index: 30;
      }
      .atlas-nav-item {
        display: flex; flex-direction: column; align-items: center; justify-content: center; gap: 3px;
        color: var(--ink-dim);
        background: none; border: none; cursor: pointer;
        font-family: 'Oswald', sans-serif; font-size: 10px; letter-spacing: 0.03em;
        text-transform: uppercase;
        /* min-width/min-height: 44px is the WCAG-recommended minimum touch target — the icon+
           label alone (no padding) only shrink-wrapped to ~35-54px in each dimension, found via
           a live scan at 375px width. This expands the tappable area around the same visual
           content rather than changing how the nav looks. */
        min-width: 44px; min-height: 44px; padding: 4px 6px;
      }
      .atlas-nav-item.active { color: var(--brass); }
      .pill {
        display: inline-flex; align-items: center; gap: 4px;
        padding: 3px 9px; border-radius: 999px; font-size: 11px;
        font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.02em;
      }
      /* Interactive pill buttons (filters, selectors, quick-add chips) need a 44px touch target;
         the many read-only pill BADGES (status dots, equipment tags) must stay visually compact,
         so this targets only the <button class="pill"> case, not <span class="pill">. */
      button.pill { min-height: 44px; min-width: 44px; }
      .bar-track { background: var(--bg-elev2); border-radius: 6px; height: 8px; overflow: hidden; }
      .bar-fill { height: 100%; border-radius: 6px; }
      /* overflow-wrap: anywhere guards against an AI-generated message containing a long
         unbroken token (a URL, an ID) that would otherwise overflow the bubble and force
         horizontal scroll on the whole page — user messages get the same treatment since a
         pasted URL is just as likely there. */
      .chat-bubble-user {
        background: var(--brass-soft); border: 1px solid var(--brass);
        border-radius: 12px 12px 2px 12px; padding: 10px 13px; align-self: flex-end; max-width: 85%;
        overflow-wrap: anywhere;
      }
      .chat-bubble-ai {
        background: var(--bg-elev2); border: 1px solid var(--line);
        border-radius: 12px 12px 12px 2px; padding: 10px 13px; align-self: flex-start; max-width: 85%;
        overflow-wrap: anywhere;
      }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }

      /* Reusable loading-skeleton pattern (Launch visual upgrade) — previously every loading
         state was either a spinner or, in a few spots, nothing at all. A shimmering placeholder
         that roughly matches the shape of the real content is calmer for a data-heavy screen
         (Progress, the monthly report) than a spinner blocking the whole card. Static (no
         shimmer motion) under reduced-motion, per the animation keyframe below being covered by
         the existing reduced-motion media query at the bottom of this file. */
      @keyframes skeleton-shimmer { 0% { background-position: -200px 0; } 100% { background-position: 200px 0; } }
      .skeleton {
        background: linear-gradient(90deg, var(--bg-elev2) 25%, var(--line) 37%, var(--bg-elev2) 63%);
        background-size: 400px 100%;
        animation: skeleton-shimmer 1.6s ease-in-out infinite;
        border-radius: var(--radius-sm);
      }

      /* Reusable empty-state pattern — a consistent look for "nothing here yet" across Progress
         charts, challenges, and the monthly report, instead of each screen inventing its own. */
      .empty-state { text-align: center; padding: 32px 20px; color: var(--ink-dim); }
      .empty-state-icon { margin-bottom: 10px; opacity: 0.6; }
      .empty-state-title { font-family: 'Oswald', sans-serif; text-transform: uppercase; letter-spacing: 0.02em; font-size: 14px; color: var(--ink); margin-bottom: 6px; }
      .empty-state-body { font-size: 12.5px; line-height: 1.6; max-width: 320px; margin: 0 auto; }

      @media (prefers-reduced-motion: reduce) { * { transition: none !important; animation: none !important; } }

      /* Responsive: this app is designed as a single mobile-width column (bottom tab bar and
         all), so instead of stretching content edge-to-edge on larger screens — which reads badly
         with a bottom nav — widen the column in steps for tablet/desktop and let the radial
         background fill the rest. These must stay last in the stylesheet so they win the cascade
         over the base .atlas-root/.atlas-nav rules above at equal specificity. */
      @media (min-width: 640px) {
        .atlas-root { max-width: 600px; }
        .atlas-nav { max-width: 600px; }
      }
      @media (min-width: 1024px) {
        .atlas-root { max-width: 720px; border-left: 1px solid var(--line); border-right: 1px solid var(--line); }
        .atlas-nav { max-width: 720px; }
      }

      /* The public marketing Landing page is not the bottom-nav app shell (no .atlas-nav, no
         phone-frame reason to box it in) — it reads better wide on desktop, the way a normal
         marketing page does, rather than staying capped at the same 720px "app in a frame" width
         as the authenticated screens. .landing-wide overrides just the width/border rules above;
         everything else about .atlas-root (background, color, font) still applies. */
      @media (min-width: 1024px) {
        .atlas-root.landing-wide { max-width: 1040px; border-left: none; border-right: none; }
      }

      /* Exercise-detail card: stacked (illustration above details) on mobile, since that's the
         only width available; a real two-column layout once there's room, matching the explicit
         "left: demonstration, right: details and cues" spec for the redesigned detail screen. */
      .exercise-detail-layout { display: flex; flex-direction: column; gap: 16px; }
      @media (min-width: 640px) {
        .exercise-detail-layout { flex-direction: row; align-items: flex-start; }
        .exercise-detail-figure { flex: 0 0 220px; }
        .exercise-detail-info { flex: 1 1 auto; min-width: 0; }
      }
    `}</style>
  );
}
