import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, vi, afterEach } from "vitest";
import { act } from "react";
import ErrorBoundary from "./ErrorBoundary";

function Bomb() {
  throw new Error("boom");
}

describe("ErrorBoundary", () => {
  let container;

  afterEach(() => {
    if (container) { container.remove(); container = null; }
    vi.restoreAllMocks();
  });

  it("renders children normally when nothing throws", () => {
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary><div>fine</div></ErrorBoundary>); });
    expect(container.textContent).toContain("fine");
  });

  it("shows the fallback screen instead of a blank page when a child throws", () => {
    // React logs the caught error to console.error by default — expected noise, not a real failure.
    vi.spyOn(console, "error").mockImplementation(() => {});
    container = document.createElement("div");
    document.body.appendChild(container);
    const root = createRoot(container);
    act(() => { root.render(<ErrorBoundary><Bomb /></ErrorBoundary>); });
    expect(container.textContent).toContain("Something went wrong");
    expect(container.querySelector("button").textContent).toBe("Reload");
  });
});
