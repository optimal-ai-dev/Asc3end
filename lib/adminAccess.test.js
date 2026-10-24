import { describe, it, expect, afterEach } from "vitest";
import { isAdminUser, adminEmailAllowlist } from "./adminAccess.js";

const ORIGINAL = process.env.ADMIN_EMAILS;
afterEach(() => {
  if (ORIGINAL === undefined) delete process.env.ADMIN_EMAILS;
  else process.env.ADMIN_EMAILS = ORIGINAL;
});

const confirmed = (email) => ({ email, email_confirmed_at: "2026-01-01T00:00:00Z" });

describe("isAdminUser", () => {
  it("is false for everyone when ADMIN_EMAILS is unset or empty", () => {
    delete process.env.ADMIN_EMAILS;
    expect(isAdminUser(confirmed("owner@example.com"))).toBe(false);
    process.env.ADMIN_EMAILS = " , ";
    expect(adminEmailAllowlist()).toEqual([]);
    expect(isAdminUser(confirmed("owner@example.com"))).toBe(false);
  });

  it("matches allowlisted emails case-insensitively, ignoring spaces", () => {
    process.env.ADMIN_EMAILS = "Owner@Example.com, second@example.com";
    expect(isAdminUser(confirmed("owner@example.com"))).toBe(true);
    expect(isAdminUser(confirmed("SECOND@example.com"))).toBe(true);
    expect(isAdminUser(confirmed("someone@example.com"))).toBe(false);
  });

  it("rejects an allowlisted email that hasn't been confirmed", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminUser({ email: "owner@example.com", email_confirmed_at: null })).toBe(false);
  });

  it("rejects missing users and emails", () => {
    process.env.ADMIN_EMAILS = "owner@example.com";
    expect(isAdminUser(null)).toBe(false);
    expect(isAdminUser({ email_confirmed_at: "2026-01-01T00:00:00Z" })).toBe(false);
  });
});
