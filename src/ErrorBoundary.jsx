import React from "react";
import { AlertTriangle } from "lucide-react";
import GlobalStyle from "./GlobalStyle";
import { captureException } from "./lib/errorMonitoring";

// Catches render-time errors anywhere below it in the tree — without this, a thrown error in any
// component unmounts the whole React tree and leaves a blank white screen with nothing but a
// console error most users will never see. Does NOT catch errors in event handlers, async code,
// or outside React's render (those go through the window.onerror/unhandledrejection listeners
// wired up in main.jsx instead — see src/lib/errorMonitoring.js).
export default class ErrorBoundary extends React.Component {
  constructor(props) {
    super(props);
    this.state = { error: null };
  }

  static getDerivedStateFromError(error) {
    return { error };
  }

  componentDidCatch(error, info) {
    captureException(error, { componentStack: info?.componentStack });
  }

  render() {
    if (this.state.error) {
      return (
        <div className="atlas-root">
          <GlobalStyle />
          <div style={{ display: "flex", alignItems: "center", justifyContent: "center", minHeight: "100vh", padding: 24 }}>
            <div className="atlas-card" style={{ width: "100%", maxWidth: 360, textAlign: "center", padding: 28 }}>
              <AlertTriangle size={26} color="var(--brass)" style={{ marginBottom: 10 }} />
              <div className="disp" style={{ fontSize: 17, marginBottom: 6 }}>Something went wrong</div>
              <div style={{ color: "var(--ink-dim)", fontSize: 13, marginBottom: 20, lineHeight: 1.5 }}>
                Asc3end hit an unexpected error. Your logged data is safe — try reloading.
              </div>
              <button className="atlas-btn" style={{ width: "100%" }} onClick={() => window.location.reload()}>Reload</button>
            </div>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}
