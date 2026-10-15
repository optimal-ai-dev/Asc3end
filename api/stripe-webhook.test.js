import { describe, it, expect, vi, beforeEach } from "vitest";

// Fakes the two things this handler touches outside itself: Stripe's SDK (signature
// verification + subscription retrieval) and supabaseAdmin (the dedupe table + subscriptions
// table). Everything else — raw body reading, event-type routing, plan detection — is the real
// code under test.
const { fakeStripe } = vi.hoisted(() => ({
  fakeStripe: {
    webhooks: { constructEvent: vi.fn() },
    subscriptions: { retrieve: vi.fn() },
  },
}));
vi.mock("../lib/stripe.js", () => ({ stripe: fakeStripe }));

const { fakeAdmin, state } = vi.hoisted(() => {
  const state = { processedEvents: new Set(), subscriptionsByUser: new Map(), upsertCalls: 0 };
  const fakeAdmin = {
    from(table) {
      if (table === "processed_webhook_events") {
        return {
          async insert({ event_id }) {
            if (state.processedEvents.has(event_id)) {
              return { error: { code: "23505", message: "duplicate key value violates unique constraint" } };
            }
            state.processedEvents.add(event_id);
            return { error: null };
          },
          delete() { return { async eq(_k, id) { state.processedEvents.delete(id); return { error: null }; } }; },
        };
      }
      if (table === "subscriptions") {
        return {
          async upsert(row) {
            if (state.failUpserts) return { error: { code: "XX000", message: "db down" } };
            state.upsertCalls++;
            state.subscriptionsByUser.set(row.user_id, row);
            return { error: null };
          },
        };
      }
      throw new Error(`unexpected table: ${table}`);
    },
  };
  return { fakeAdmin, state };
});
vi.mock("../lib/supabaseAdmin.js", () => ({ supabaseAdmin: fakeAdmin }));

const handler = (await import("./stripe-webhook.js")).default;

function fakeReq(rawBody = "{}") {
  return {
    method: "POST",
    headers: { "stripe-signature": "t=123,v1=fakesig" },
    on(event, cb) {
      if (event === "data") cb(Buffer.from(rawBody));
      if (event === "end") cb();
    },
  };
}
function fakeRes() {
  const res = { statusCode: null, body: null };
  res.status = (code) => { res.statusCode = code; return res; };
  res.json = (data) => { res.body = data; return res; };
  res.send = (data) => { res.body = data; return res; };
  res.end = () => res;
  return res;
}

function makeSubscriptionEvent({ id, type = "customer.subscription.updated", userId = "user-1", status = "active", cancelAtPeriodEnd = false, priceId = "price_monthly" }) {
  return {
    id,
    type,
    data: {
      object: {
        id: "sub_123",
        customer: "cus_123",
        status,
        cancel_at_period_end: cancelAtPeriodEnd,
        current_period_end: 1830000000,
        metadata: { supabase_user_id: userId },
        items: { data: [{ price: { id: priceId }, current_period_end: 1830000000 }] },
      },
    },
  };
}

describe("Stripe webhook handler", () => {
  beforeEach(() => {
    state.processedEvents.clear();
    state.subscriptionsByUser.clear();
    state.upsertCalls = 0;
    state.failUpserts = false;
    fakeStripe.webhooks.constructEvent.mockReset();
    fakeStripe.subscriptions.retrieve.mockReset();
    process.env.STRIPE_MONTHLY_PRICE_ID = "price_monthly";
    process.env.STRIPE_ANNUAL_PRICE_ID = "price_annual";
  });

  it("rejects a request with an invalid/unverifiable signature before touching the database", async () => {
    fakeStripe.webhooks.constructEvent.mockImplementation(() => { throw new Error("signature mismatch"); });
    const res = fakeRes();
    await handler(fakeReq(), res);
    expect(res.statusCode).toBe(400);
    expect(state.upsertCalls).toBe(0);
  });

  it("processes customer.subscription.updated and upserts the correct row, detecting the plan from the price id", async () => {
    const event = makeSubscriptionEvent({ id: "evt_1", status: "active", priceId: "price_annual" });
    fakeStripe.webhooks.constructEvent.mockReturnValue(event);
    const res = fakeRes();
    await handler(fakeReq(), res);
    expect(res.statusCode).toBe(200);
    const row = state.subscriptionsByUser.get("user-1");
    expect(row).toMatchObject({ status: "active", plan: "annual", stripe_customer_id: "cus_123", cancel_at_period_end: false });
  });

  it("ignores a subscription event with no supabase_user_id in metadata (not one of ours)", async () => {
    const event = makeSubscriptionEvent({ id: "evt_2", userId: undefined });
    delete event.data.object.metadata.supabase_user_id;
    fakeStripe.webhooks.constructEvent.mockReturnValue(event);
    const res = fakeRes();
    await handler(fakeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(state.upsertCalls).toBe(0);
  });

  it("checkout.session.completed retrieves the full subscription and upserts it", async () => {
    const event = {
      id: "evt_3",
      type: "checkout.session.completed",
      data: { object: { mode: "subscription", subscription: "sub_123" } },
    };
    fakeStripe.webhooks.constructEvent.mockReturnValue(event);
    fakeStripe.subscriptions.retrieve.mockResolvedValue(makeSubscriptionEvent({ id: "evt_3", priceId: "price_monthly" }).data.object);
    const res = fakeRes();
    await handler(fakeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(state.subscriptionsByUser.get("user-1")).toMatchObject({ plan: "monthly" });
  });

  // The core idempotency requirement: Stripe redelivers events (retries on a slow response,
  // network blips), and the same event id arriving twice must not double-process it.
  describe("idempotency", () => {
    it("processes a redelivered event exactly once — the second delivery is a no-op", async () => {
      const event = makeSubscriptionEvent({ id: "evt_dup", status: "active" });
      fakeStripe.webhooks.constructEvent.mockReturnValue(event);

      const res1 = fakeRes();
      await handler(fakeReq(), res1);
      expect(res1.statusCode).toBe(200);
      expect(res1.body).toEqual({ received: true });
      expect(state.upsertCalls).toBe(1);

      const res2 = fakeRes();
      await handler(fakeReq(), res2);
      expect(res2.statusCode).toBe(200);
      expect(res2.body).toEqual({ received: true, duplicate: true });
      expect(state.upsertCalls).toBe(1); // NOT 2 — the duplicate never reached upsertFromSubscription
    });

    it("two different event ids for the same subscription are both processed normally (not falsely deduped)", async () => {
      fakeStripe.webhooks.constructEvent.mockReturnValueOnce(makeSubscriptionEvent({ id: "evt_a", status: "active" }));
      await handler(fakeReq(), fakeRes());
      fakeStripe.webhooks.constructEvent.mockReturnValueOnce(makeSubscriptionEvent({ id: "evt_b", status: "past_due" }));
      const res2 = fakeRes();
      await handler(fakeReq(), res2);
      expect(res2.body).toEqual({ received: true });
      expect(state.upsertCalls).toBe(2);
      expect(state.subscriptionsByUser.get("user-1").status).toBe("past_due");
    });
  });

  it("cancel_at_period_end is persisted so the frontend can distinguish 'cancelled but still paid' from fully ended", async () => {
    const event = makeSubscriptionEvent({ id: "evt_cancel", status: "active", cancelAtPeriodEnd: true });
    fakeStripe.webhooks.constructEvent.mockReturnValue(event);
    await handler(fakeReq(), fakeRes());
    expect(state.subscriptionsByUser.get("user-1")).toMatchObject({ status: "active", cancel_at_period_end: true });
  });

  describe("delayed / out-of-order delivery", () => {
    it("a stale 'updated: active' event delivered after the subscription ended does not re-grant access — Stripe's current state wins", async () => {
      const stale = makeSubscriptionEvent({ id: "evt_stale", status: "active" });
      fakeStripe.webhooks.constructEvent.mockReturnValue(stale);
      fakeStripe.subscriptions.retrieve.mockResolvedValue({ ...stale.data.object, status: "canceled" });
      await handler(fakeReq(), fakeRes());
      expect(state.subscriptionsByUser.get("user-1").status).toBe("canceled");
      expect(fakeStripe.subscriptions.retrieve).toHaveBeenCalledWith("sub_123");
    });

    it("events for one subscription in any order converge on the same final row", async () => {
      const current = makeSubscriptionEvent({ id: "x", status: "past_due" }).data.object;
      fakeStripe.subscriptions.retrieve.mockResolvedValue(current);
      for (const [id, status] of [["e3", "past_due"], ["e1", "active"], ["e2", "trialing"]]) {
        fakeStripe.webhooks.constructEvent.mockReturnValueOnce(makeSubscriptionEvent({ id, status }));
        await handler(fakeReq(), fakeRes());
      }
      expect(state.subscriptionsByUser.get("user-1").status).toBe("past_due");
    });

    it("if Stripe says the subscription no longer exists, the event payload is used", async () => {
      const ev = makeSubscriptionEvent({ id: "evt_gone", type: "customer.subscription.deleted", status: "canceled" });
      fakeStripe.webhooks.constructEvent.mockReturnValue(ev);
      fakeStripe.subscriptions.retrieve.mockRejectedValue(Object.assign(new Error("No such subscription"), { code: "resource_missing" }));
      const res = fakeRes();
      await handler(fakeReq(), res);
      expect(res.statusCode).toBe(200);
      expect(state.subscriptionsByUser.get("user-1").status).toBe("canceled");
    });
  });

  describe("failure and retry", () => {
    it("a failed database write answers 5xx and the retry is processed (not swallowed as a duplicate)", async () => {
      const ev = makeSubscriptionEvent({ id: "evt_retry", status: "active" });
      fakeStripe.webhooks.constructEvent.mockReturnValue(ev);
      state.failUpserts = true;
      const res1 = fakeRes();
      await handler(fakeReq(), res1);
      expect(res1.statusCode).toBe(500);
      expect(state.subscriptionsByUser.has("user-1")).toBe(false);
      state.failUpserts = false;
      const res2 = fakeRes();
      await handler(fakeReq(), res2);
      expect(res2.statusCode).toBe(200);
      expect(res2.body).toEqual({ received: true });
      expect(state.subscriptionsByUser.get("user-1").status).toBe("active");
    });

    it("a Stripe API outage while reconciling answers 5xx so Stripe redelivers", async () => {
      fakeStripe.webhooks.constructEvent.mockReturnValue(makeSubscriptionEvent({ id: "evt_outage" }));
      fakeStripe.subscriptions.retrieve.mockRejectedValue(Object.assign(new Error("timeout"), { code: "api_connection_error" }));
      const res = fakeRes();
      await handler(fakeReq(), res);
      expect(res.statusCode).toBe(500);
    });
  });

  it("refund and dispute events are acknowledged without changing access (access follows the subscription)", async () => {
    for (const type of ["charge.refunded", "charge.dispute.created"]) {
      fakeStripe.webhooks.constructEvent.mockReturnValueOnce({ id: "evt_" + type, type, data: { object: { id: "ch_1" } } });
      const res = fakeRes();
      await handler(fakeReq(), res);
      expect(res.statusCode).toBe(200);
    }
    expect(state.upsertCalls).toBe(0);
  });

  it("an unrecognized event type is acknowledged (200) without touching subscriptions", async () => {
    fakeStripe.webhooks.constructEvent.mockReturnValue({ id: "evt_other", type: "customer.created", data: { object: {} } });
    const res = fakeRes();
    await handler(fakeReq(), res);
    expect(res.statusCode).toBe(200);
    expect(state.upsertCalls).toBe(0);
  });
});
