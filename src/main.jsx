import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App.jsx";
import ErrorBoundary from "./ErrorBoundary.jsx";
import { initErrorMonitoring, captureException } from "./lib/errorMonitoring";
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

ReactDOM.createRoot(document.getElementById("root")).render(
  <React.StrictMode>
    <ErrorBoundary>
      <App />
    </ErrorBoundary>
  </React.StrictMode>
);
