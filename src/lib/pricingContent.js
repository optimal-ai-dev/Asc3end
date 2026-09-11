// Pricing copy shared between the in-app PricingPage (App.jsx) and the public Landing page —
// one place for these numbers so a price change can never update one and not the other.
import { FREE_TRIAL_LIMIT } from "./entitlements";

export const MONTHLY_PRICE = 9.99;
export const ANNUAL_PRICE = 79.99;
export const ANNUAL_SAVINGS_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

export const FEATURE_COMPARISON = [
  { label: "Workout logging", free: true, premium: true },
  { label: "Nutrition tracking", free: true, premium: true },
  { label: "Progress & strength analytics", free: true, premium: true },
  { label: "AI Coach chat & plans", free: `${FREE_TRIAL_LIMIT} free`, premium: "Unlimited" },
  { label: "Meals Near You", free: `${FREE_TRIAL_LIMIT} free`, premium: "Unlimited" },
  { label: "Food scanner (photo/barcode)", free: false, premium: true },
];

export const PRICING_FAQ = [
  { q: "Can I cancel anytime?", a: "Yes. Cancel from Profile > Manage Billing whenever you like — you keep Asc3end+ until the end of the period you already paid for, then it reverts to the Free plan automatically. No phone calls, no retention flow." },
  { q: "What happens when my free trial ends?", a: "If you start a trial, your card is charged automatically when it ends unless you cancel first. You'll keep full access the whole time you're deciding." },
  { q: "Is my payment information secure?", a: "Payments are handled entirely by Stripe — Asc3end never sees or stores your card number." },
  { q: "Can I switch between monthly and annual?", a: "Yes, any time from Profile > Manage Billing, which opens Stripe's own billing portal." },
];
