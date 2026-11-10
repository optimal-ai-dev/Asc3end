import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeStripe } = vi.hoisted(() => ({
  fakeStripe: { subscriptions: { cancel: vi.fn() } },
}));
vi.mock("../lib/stripe.js", () => ({ stripe: fakeStripe }));

const { fakeAdmin, state } = vi.hoisted(() => {
  const state = { subscriptionsByUser: new Map(), users: new Map(), deletedFrom: [], deletedUsers: [] };
  const fakeAdmin = {
    auth: {
      getUser: async (token) => {
        const user = state.users.get(token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid token" } };
      },
      admin: {
        deleteUser: async (id) => { state.deletedUsers.push(id); return { error: null }; },
      },
    },
    from(table) {
      return {
        select() {
          return {
            eq(_k, userId) {
              return { async maybeSingle() { return { data: table === "subscriptions" ? state.subscriptionsByUser.get(userId) || null : null, error: null }; } };
            },
          };
        },
        delete() {
          return { async eq() { state.deletedFrom.push(table); return { error: null }; } };
        },
      };
    },
  };
  return { fakeAdmin, state };
});
vi.mock("../lib/supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));
vi.mock("../lib/rateLimit.js", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 3 })) }));

const handler = (await import("./delete-account.js")).default;

function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}
const req = { method: "POST", headers: { authorization: "Bearer valid-token" } };
const USER = "user-1";

describe("api/delete-account", () => {
  beforeEach(() => {
    state.subscriptionsByUser.clear();
    state.users.clear();
    state.deletedFrom = [];
    state.deletedUsers = [];
    state.users.set("valid-token", { id: USER, email: "a@example.com" });
    fakeStripe.subscriptions.cancel.mockReset().mockResolvedValue({ id: "sub_123", status: "canceled" });
  });

  it("cancels an active Stripe subscription before deleting the account", async () => {
    state.subscriptionsByUser.set(USER, { stripe_subscription_id: "sub_123", status: "active" });
    const res = fakeRes();
    await handler(req, res);
    expect(fakeStripe.subscriptions.cancel).toHaveBeenCalledWith("sub_123");
    expect(res.statusCode).toBe(200);
    expect(state.deletedUsers).toEqual([USER]);
  });

  it("cancels a trialing subscription too", async () => {
    state.subscriptionsByUser.set(USER, { stripe_subscription_id: "sub_trial", status: "trialing" });
    await handler(req, fakeRes());
    expect(fakeStripe.subscriptions.cancel).toHaveBeenCalledWith("sub_trial");
  });

  it("skips Stripe for a free user or an already-cancelled subscription", async () => {
    await handler(req, fakeRes());
    state.subscriptionsByUser.set(USER, { stripe_subscription_id: "sub_old", status: "canceled" });
    await handler(req, fakeRes());
    expect(fakeStripe.subscriptions.cancel).not.toHaveBeenCalled();
    expect(state.deletedUsers).toEqual([USER, USER]);
  });

  it("still deletes when Stripe says the subscription no longer exists", async () => {
    state.subscriptionsByUser.set(USER, { stripe_subscription_id: "sub_gone", status: "active" });
    fakeStripe.subscriptions.cancel.mockRejectedValue(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
    const res = fakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(200);
    expect(state.deletedUsers).toEqual([USER]);
  });

  it("keeps the account when Stripe cancellation fails, so the user isn't billed with no account", async () => {
    state.subscriptionsByUser.set(USER, { stripe_subscription_id: "sub_123", status: "active" });
    fakeStripe.subscriptions.cancel.mockRejectedValue(Object.assign(new Error("Stripe down"), { code: "api_error" }));
    const res = fakeRes();
    await handler(req, res);
    expect(res.statusCode).toBe(502);
    expect(state.deletedFrom).toEqual([]);
    expect(state.deletedUsers).toEqual([]);
  });
});
