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
      .chat-bubble-user {
        background: var(--brass-soft); border: 1px solid var(--brass);
        border-radius: 12px 12px 2px 12px; padding: 10px 13px; align-self: flex-end; max-width: 85%;
      }
      .chat-bubble-ai {
        background: var(--bg-elev2); border: 1px solid var(--line);
        border-radius: 12px 12px 12px 2px; padding: 10px 13px; align-self: flex-start; max-width: 85%;
      }
      ::-webkit-scrollbar { width: 6px; height: 6px; }
      ::-webkit-scrollbar-thumb { background: var(--line); border-radius: 3px; }
      @keyframes spin { from { transform: rotate(0deg); } to { transform: rotate(360deg); } }
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
    `}</style>
  );
}
