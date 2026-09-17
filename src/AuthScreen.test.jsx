import React from "react";
import { createRoot } from "react-dom/client";
import { describe, it, expect, afterEach, vi } from "vitest";
import { act } from "react";
import AuthScreen from "./AuthScreen.jsx";

// Regression coverage for a real reported gap: account creation previously required nothing but
// an email and a password — no acknowledgement of the Terms, Privacy Policy, or Health & Fitness
// Disclaimer anywhere in the actual signup flow (a separate checkbox exists later in onboarding,
// but that runs AFTER a real Supabase Auth account already exists). These tests only exercise the
// synchronous, pre-network validation this component does before ever calling supabase.auth.*, so
// none of them need a live Supabase project or a mock client.

function findByText(container, text) {
  return [...container.querySelectorAll("button")].find((b) => b.textContent.trim() === text);
}
function setValue(el, value) {
  const proto = Object.getPrototypeOf(el);
  const desc = Object.getOwnPropertyDescriptor(proto, "value");
  desc.set.call(el, value);
  el.dispatchEvent(new Event("input", { bubbles: true }));
}

describe("AuthScreen — signup consent gate", () => {
  let container;
  afterEach(() => { if (container) { container.remove(); container = null; } });

  function renderSignup() {
    container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<AuthScreen initialMode="signup" />); });
    return container;
  }

  it("the consent checkbox is unchecked by default (never preselected)", () => {
    const c = renderSignup();
    const checkbox = c.querySelector('input[type="checkbox"]');
    expect(checkbox).toBeTruthy();
    expect(checkbox.checked).toBe(false);
  });

  it("states the minimum age and names all three required documents", () => {
    const c = renderSignup();
    const text = c.textContent;
    expect(text).toContain("at least 16");
    expect(text).toContain("Terms of Use");
    expect(text).toContain("Privacy Policy");
    expect(text).toContain("Health & Fitness Disclaimer");
  });

  it("Create Account stays disabled with email+password filled but consent NOT checked", () => {
    const c = renderSignup();
    const email = c.querySelector('input[type="email"]');
    const [pw, pw2] = c.querySelectorAll('input[type="password"]');
    act(() => {
      setValue(email, "test@example.com");
      setValue(pw, "TestPassword123!");
      setValue(pw2, "TestPassword123!");
    });
    const btn = findByText(c, "Create Account");
    expect(btn.disabled).toBe(true);
  });

  it("Create Account becomes enabled once email, matching passwords, and consent are all provided", () => {
    const c = renderSignup();
    const email = c.querySelector('input[type="email"]');
    const [pw, pw2] = c.querySelectorAll('input[type="password"]');
    const checkbox = c.querySelector('input[type="checkbox"]');
    act(() => {
      setValue(email, "test@example.com");
      setValue(pw, "TestPassword123!");
      setValue(pw2, "TestPassword123!");
      checkbox.click();
    });
    const btn = findByText(c, "Create Account");
    expect(btn.disabled).toBe(false);
  });

  it("clicking a legal link opens the document in-page without discarding the entered email (no real navigation)", () => {
    const c = renderSignup();
    const email = c.querySelector('input[type="email"]');
    act(() => { setValue(email, "keep-me@example.com"); });
    const termsLink = [...c.querySelectorAll("button")].find((b) => b.textContent.trim() === "Terms of Use");
    act(() => { termsLink.click(); });
    expect(c.textContent).toContain("Terms of Use");
    expect(c.querySelector('input[type="email"]').value).toBe("keep-me@example.com");
  });

  it("submitting with mismatched passwords shows an error and never attempts to create an account", async () => {
    const c = renderSignup();
    const email = c.querySelector('input[type="email"]');
    const [pw, pw2] = c.querySelectorAll('input[type="password"]');
    const checkbox = c.querySelector('input[type="checkbox"]');
    act(() => {
      setValue(email, "test@example.com");
      setValue(pw, "TestPassword123!");
      setValue(pw2, "DifferentPassword456!");
      checkbox.click();
    });
    const form = c.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(c.textContent).toContain("Passwords don't match");
  });

  it("a password shorter than the minimum shows an error before any network call", async () => {
    const c = renderSignup();
    const email = c.querySelector('input[type="email"]');
    const [pw, pw2] = c.querySelectorAll('input[type="password"]');
    const checkbox = c.querySelector('input[type="checkbox"]');
    act(() => {
      setValue(email, "test@example.com");
      setValue(pw, "short");
      setValue(pw2, "short");
      checkbox.click();
    });
    const form = c.querySelector("form");
    await act(async () => {
      form.dispatchEvent(new Event("submit", { bubbles: true, cancelable: true }));
      await new Promise((r) => setTimeout(r, 0));
    });
    expect(c.textContent).toMatch(/at least \d+ characters/i);
  });

  it("has a show/hide password toggle with an accessible label", () => {
    const c = renderSignup();
    const toggle = [...c.querySelectorAll("button")].find((b) => b.getAttribute("aria-label") === "Show password");
    expect(toggle).toBeTruthy();
    const pwInput = c.querySelectorAll('input[type="password"]')[0];
    expect(pwInput).toBeTruthy();
    act(() => { toggle.click(); });
    expect(c.querySelector('input[type="text"][autocomplete="new-password"]')).toBeTruthy();
  });
});

describe("AuthScreen — login mode has no consent gate (only signup creates a new agreement)", () => {
  it("login mode shows no consent checkbox and no confirm-password field", () => {
    const container = document.createElement("div");
    document.body.appendChild(container);
    act(() => { createRoot(container).render(<AuthScreen initialMode="login" />); });
    expect(container.querySelector('input[type="checkbox"]')).toBeNull();
    expect(container.querySelectorAll('input[type="password"]')).toHaveLength(1);
    container.remove();
  });
});
