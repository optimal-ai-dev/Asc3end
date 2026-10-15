import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeStripe } = vi.hoisted(() => ({ fakeStripe: { subscriptions: { cancel: vi.fn() } } }));
vi.mock("../lib/stripe.js", () => ({ stripe: fakeStripe }));

const { fakeAdmin, state } = vi.hoisted(() => {
  const state = { users: new Map(), subs: new Map(), deletedTables: [], deletedUser: null };
  const fakeAdmin = {
    auth: {
      getUser: async (t) => { const u = state.users.get(t); return u ? { data: { user: u }, error: null } : { data: { user: null }, error: { message: "bad" } }; },
      admin: { deleteUser: async (id) => { state.deletedUser = id; return { error: null }; } },
    },
    from(table) {
      return {
        select() { return { eq(_k, id) { return { async maybeSingle() { return { data: table === "subscriptions" ? state.subs.get(id) || null : null, error: null }; } }; } }; },
        delete() { return { async eq() { state.deletedTables.push(table); return { error: null }; } }; },
      };
    },
  };
  return { fakeAdmin, state };
});
vi.mock("../lib/supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));
vi.mock("../lib/rateLimit.js", () => ({ checkRateLimit: async () => ({ allowed: true }) }));

const handler = (await import("./delete-account.js")).default;
const res = () => { const r = { statusCode: null, body: null, status(c) { r.statusCode = c; return r; }, json(b) { r.body = b; return r; } }; return r; };
const req = { method: "POST", headers: { authorization: "Bearer tok" } };

beforeEach(() => {
  state.users = new Map([["tok", { id: "u1" }]]);
  state.subs = new Map();
  state.deletedTables = [];
  state.deletedUser = null;
  fakeStripe.subscriptions.cancel.mockReset().mockResolvedValue({});
});

describe("api/delete-account and billing", () => {
  it("cancels a live Stripe subscription BEFORE removing the account, so billing stops", async () => {
    state.subs.set("u1", { stripe_subscription_id: "sub_1", status: "active" });
    const r = res();
    await handler(req, r);
    expect(fakeStripe.subscriptions.cancel).toHaveBeenCalledWith("sub_1");
    expect(r.statusCode).toBe(200);
    expect(state.deletedUser).toBe("u1");
  });

  it("deletes nothing if the subscription could not be cancelled (never leave a paying ghost account)", async () => {
    state.subs.set("u1", { stripe_subscription_id: "sub_1", status: "past_due" });
    fakeStripe.subscriptions.cancel.mockRejectedValue(Object.assign(new Error("down"), { code: "api_connection_error" }));
    const r = res();
    await handler(req, r);
    expect(r.statusCode).toBe(502);
    expect(r.body.error).toMatch(/NOT been deleted/);
    expect(state.deletedUser).toBeNull();
    expect(state.deletedTables).toEqual([]);
  });

  it("does not touch Stripe for free users or already-ended subscriptions, and tolerates one Stripe no longer has", async () => {
    let r = res(); await handler(req, r);
    expect(r.statusCode).toBe(200);
    state.subs.set("u1", { stripe_subscription_id: "sub_old", status: "canceled" });
    r = res(); await handler(req, r);
    expect(fakeStripe.subscriptions.cancel).not.toHaveBeenCalled();
    state.subs.set("u1", { stripe_subscription_id: "sub_gone", status: "active" });
    fakeStripe.subscriptions.cancel.mockRejectedValue(Object.assign(new Error("missing"), { code: "resource_missing" }));
    r = res(); await handler(req, r);
    expect(r.statusCode).toBe(200);
  });

  it("requires a valid sign-in", async () => {
    const r = res();
    await handler({ method: "POST", headers: {} }, r);
    expect(r.statusCode).toBe(401);
  });
});
