import React from "react";
import ReactDOM from "react-dom/client";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { initErrorMonitoring, captureException, captureMessage } from "./lib/errorMonitoring";
import "./index.css";

initErrorMonitoring();

// Catches what the React error boundary can't: errors thrown in event handlers or plain async
// code, and promise rejections nobody attached a .catch to. Neither of these unmounts the React
// tree the way a render error does, so without this they'd only ever show up as an uncaught
// error in a console nobody but a developer opens.
window.addEventListener("error", (event) => {
  captureException(event.error || new Error(event.message));
});
window.addEventListener("unhandledrejection", (event) => {
  captureException(event.reason instanceof Error ? event.reason : new Error(String(event.reason)));
});

const root = ReactDOM.createRoot(document.getElementById("root"));

// A plain, dependency-free fallback for the ONE class of failure ErrorBoundary structurally
// cannot catch: something going wrong while loading App.jsx itself (a missing/invalid
// VITE_SUPABASE_URL throws synchronously inside src/lib/supabase.js at module-evaluation time —
// before React has rendered anything, so there is no component tree yet for a boundary to wrap).
// Without this, that failure is a permanently blank white screen with nothing in the UI and
// nothing reported anywhere, not even to error monitoring. Uses inline styles only — GlobalStyle
// itself is safe to use (no Supabase dependency), but keeping this self-contained means it still
// renders correctly even if some future App-adjacent import starts failing too.
function renderFatalStartupError(reason) {
  captureMessage(`Fatal startup failure: ${reason}`);
  root.render(
    <div style={{ minHeight: "100vh", display: "flex", alignItems: "center", justifyContent: "center", background: "#0A120E", color: "#F1F5F3", fontFamily: "system-ui, sans-serif", padding: 24 }}>
      <div style={{ maxWidth: 360, textAlign: "center" }}>
        <div style={{ fontSize: 17, fontWeight: 600, marginBottom: 8 }}>Asc3end can't start right now</div>
        <div style={{ color: "#86A296", fontSize: 13, lineHeight: 1.5, marginBottom: 20 }}>
          This usually clears up on its own — try reloading. If it keeps happening, the app owner
          needs to check the deployment configuration.
        </div>
        <button
          onClick={() => window.location.reload()}
          style={{ background: "#3ECF8E", color: "#072016", border: "none", borderRadius: 10, padding: "10px 20px", fontWeight: 600, cursor: "pointer" }}
        >
          Reload
        </button>
      </div>
    </div>
  );
}

if (!import.meta.env.VITE_SUPABASE_URL || !import.meta.env.VITE_SUPABASE_ANON_KEY) {
  // Fail loudly and recoverably instead of letting App.jsx's import chain throw uncaught — see
  // src/lib/supabase.js, which calls createClient() unconditionally at module scope.
  renderFatalStartupError("VITE_SUPABASE_URL/VITE_SUPABASE_ANON_KEY missing at build time");
} else {
  // Dynamic import (not a static one) so a throw during App.jsx's own module evaluation — or any
  // module it imports — lands in this .catch() instead of aborting main.jsx before the error
  // listeners above ever get a chance to run.
  import("./App.jsx")
    .then(({ default: App }) => {
      root.render(
        <React.StrictMode>
          <ErrorBoundary>
            <App />
          </ErrorBoundary>
        </React.StrictMode>
      );
    })
    .catch((e) => {
      captureException(e);
      renderFatalStartupError(e?.message || String(e));
    });
}
