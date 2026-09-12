import { describe, it, expect, vi, beforeEach } from "vitest";

const { fakeStripe } = vi.hoisted(() => ({
  fakeStripe: {
    customers: { create: vi.fn() },
    checkout: { sessions: { create: vi.fn() } },
  },
}));
vi.mock("../lib/stripe.js", () => ({ stripe: fakeStripe }));

const { fakeAdmin, state } = vi.hoisted(() => {
  const state = { subscriptionsByUser: new Map(), users: new Map() };
  const fakeAdmin = {
    auth: {
      getUser: async (token) => {
        const user = state.users.get(token);
        return user ? { data: { user }, error: null } : { data: { user: null }, error: { message: "invalid token" } };
      },
    },
    from(table) {
      if (table !== "subscriptions") throw new Error(`unexpected table: ${table}`);
      return {
        select() {
          return {
            eq(_k, userId) {
              return { async maybeSingle() { return { data: state.subscriptionsByUser.get(userId) || null, error: null }; } };
            },
          };
        },
        async upsert(row) {
          state.subscriptionsByUser.set(row.user_id, { ...state.subscriptionsByUser.get(row.user_id), ...row });
          return { error: null };
        },
      };
    },
  };
  return { fakeAdmin, state };
});
vi.mock("../lib/supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));

vi.mock("../lib/rateLimit.js", () => ({ checkRateLimit: vi.fn(async () => ({ allowed: true, count: 1, limit: 5 })) }));
const { checkRateLimit } = await import("../lib/rateLimit.js");

const handler = (await import("./create-checkout-session.js")).default;

function fakeReq({ token, body }) {
  return {
    method: "POST",
    headers: token ? { authorization: `Bearer ${token}` } : {},
    body,
  };
}
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  return res;
}

const FREE_USER = "user-free";
const DEMO_USER = "user-demo";

describe("api/create-checkout-session", () => {
  beforeEach(() => {
    state.subscriptionsByUser.clear();
    state.users.clear();
    state.users.set("valid-token", { id: FREE_USER, email: "free@example.com" });
    state.users.set("demo-token", { id: DEMO_USER, email: "demo@example.com" });
    state.subscriptionsByUser.set(DEMO_USER, { user_id: DEMO_USER, status: "active", stripe_customer_id: null }); // demo grant, no Stripe customer
    fakeStripe.customers.create.mockReset().mockResolvedValue({ id: "cus_new123" });
    fakeStripe.checkout.sessions.create.mockReset().mockResolvedValue({ url: "https://checkout.stripe.com/session_abc" });
    checkRateLimit.mockClear();
    process.env.STRIPE_MONTHLY_PRICE_ID = "price_monthly123";
    process.env.STRIPE_ANNUAL_PRICE_ID = "price_annual123";
  });

  it("rejects a non-POST request", async () => {
    const res = fakeRes();
    await handler({ method: "GET", headers: {} }, res);
    expect(res.statusCode).toBe(405);
  });

  it("rejects an unauthenticated request (no Authorization header) with 401", async () => {
    const res = fakeRes();
    await handler(fakeReq({ body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid/unrecognized bearer token with 401", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "garbage-token", body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(401);
  });

  it("rejects an invalid plan value instead of silently defaulting to monthly", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "yearly-typo" } }), res);
    expect(res.statusCode).toBe(400);
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("rejects a missing plan value", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: {} }), res);
    expect(res.statusCode).toBe(400);
  });

  it("a free account can start monthly checkout using the server-configured price id", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(200);
    expect(res.body.url).toBe("https://checkout.stripe.com/session_abc");
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_monthly123", quantity: 1 }],
    }));
  });

  it("a free account can start annual checkout using the server-configured price id", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "annual" } }), res);
    expect(res.statusCode).toBe(200);
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_annual123", quantity: 1 }],
    }));
  });

  it("the client cannot submit an arbitrary Stripe price id — only 'plan' is read from the body", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly", priceId: "price_attacker_controlled" } }), res);
    expect(res.statusCode).toBe(200);
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      line_items: [{ price: "price_monthly123", quantity: 1 }],
    }));
  });

  it("a demo/complimentary premium account cannot start a paid checkout", async () => {
    const res = fakeRes();
    await handler(fakeReq({ token: "demo-token", body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(400);
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("creates a new Stripe customer and stores it when the user has none yet", async () => {
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), fakeRes());
    expect(fakeStripe.customers.create).toHaveBeenCalledWith(expect.objectContaining({ email: "free@example.com", metadata: { supabase_user_id: FREE_USER } }));
    expect(state.subscriptionsByUser.get(FREE_USER).stripe_customer_id).toBe("cus_new123");
  });

  it("reuses an existing Stripe customer instead of creating a duplicate", async () => {
    state.subscriptionsByUser.set(FREE_USER, { user_id: FREE_USER, stripe_customer_id: "cus_existing", status: "inactive" });
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), fakeRes());
    expect(fakeStripe.customers.create).not.toHaveBeenCalled();
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({ customer: "cus_existing" }));
  });

  it("only applies a trial period when the client explicitly requests one", async () => {
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly", trial: true } }), fakeRes());
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      subscription_data: expect.objectContaining({ trial_period_days: 7 }),
    }));
  });

  it("success and cancel URLs point back to the app with the correct query param", async () => {
    process.env.APP_URL = "https://asc3end.vercel.app";
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), fakeRes());
    expect(fakeStripe.checkout.sessions.create).toHaveBeenCalledWith(expect.objectContaining({
      success_url: "https://asc3end.vercel.app/?checkout=success",
      cancel_url: "https://asc3end.vercel.app/?checkout=cancelled",
    }));
  });

  it("is rate-limited per user", async () => {
    checkRateLimit.mockResolvedValueOnce({ allowed: false, count: 6, limit: 5 });
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(429);
    expect(fakeStripe.checkout.sessions.create).not.toHaveBeenCalled();
  });

  it("returns a clean 500 without leaking internal error details when Stripe itself fails", async () => {
    fakeStripe.checkout.sessions.create.mockRejectedValueOnce(new Error("some internal Stripe SDK detail"));
    const res = fakeRes();
    await handler(fakeReq({ token: "valid-token", body: { plan: "monthly" } }), res);
    expect(res.statusCode).toBe(500);
    expect(JSON.stringify(res.body)).not.toContain("internal Stripe SDK detail");
  });
});
