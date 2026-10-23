import { useState, useEffect } from "react";
import { Loader2 } from "lucide-react";
import { supabase } from "../lib/supabase";

export function AdminDashboard() {
  const [state, setState] = useState({ status: "loading" }); // loading | ok | error

  useEffect(() => {
    (async () => {
      try {
        const { data: { session } } = await supabase.auth.getSession();
        if (!session) { setState({ status: "error", message: "Sign in required." }); return; }
        const res = await fetch("/api/admin-metrics", { headers: { Authorization: `Bearer ${session.access_token}` } });
        const data = await res.json();
        if (!res.ok) { setState({ status: "error", message: data.error || "Request failed." }); return; }
        setState({ status: "ok", data });
      } catch (e) {
        setState({ status: "error", message: "Couldn't reach the server." });
      }
    })();
  }, []);

  const stat = (label, value) => (
    <div key={label} style={{ padding: "14px 12px", background: "var(--bg-elev2)", borderRadius: 10 }}>
      <div className="mono" style={{ fontSize: 9, color: "var(--ink-dim)", marginBottom: 6 }}>{label}</div>
      <div className="disp" style={{ fontSize: 20 }}>{value ?? "—"}</div>
    </div>
  );

  return (
    <div style={{ position: "fixed", inset: 0, background: "var(--bg)", zIndex: 60, overflowY: "auto", padding: "calc(24px + env(safe-area-inset-top)) 18px 60px" }}>
      <div style={{ maxWidth: 640, margin: "0 auto" }}>
        <h1 className="disp" style={{ fontSize: 22, marginBottom: 18 }}>Admin Metrics</h1>
        {state.status === "loading" && <Loader2 size={20} color="var(--brass)" style={{ animation: "spin 1s linear infinite" }} />}
        {state.status === "error" && <div className="atlas-card" style={{ padding: 18, color: "var(--rest)", fontSize: 13 }}>{state.message}</div>}
        {state.status === "ok" && (
          <>
            <div className="mono" style={{ fontSize: 10, color: "var(--ink-dim)", marginBottom: 14 }}>Generated {new Date(state.data.generatedAt).toLocaleString()}</div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Users</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {stat("TOTAL USERS", state.data.users.total)}
                {stat("SIGNUPS (7d)", state.data.users.signupsLast7d)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Subscriptions</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {stat("ACTIVE", state.data.subscriptions.active)}
                {stat("TRIALING", state.data.subscriptions.trialing)}
                {stat("PAST DUE", state.data.subscriptions.pastDue)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16, marginBottom: 14 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Engagement</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(2, 1fr)", gap: 10 }}>
                {stat("WORKOUTS COMPLETED (7d)", state.data.engagement.workoutsCompletedLast7d)}
              </div>
            </div>
            <div className="atlas-card" style={{ padding: 16 }}>
              <div className="disp" style={{ fontSize: 13, marginBottom: 10 }}>Feedback</div>
              <div style={{ display: "grid", gridTemplateColumns: "repeat(3, 1fr)", gap: 10 }}>
                {stat("BUGS", state.data.feedback.bug)}
                {stat("FEATURES", state.data.feedback.feature)}
                {stat("RATINGS", state.data.feedback.rating)}
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
