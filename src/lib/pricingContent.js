// Pricing copy shared between the in-app PricingPage (App.jsx) and the public Landing page —
// one place for these numbers so a price change can never update one and not the other.
//
// Commercial model — keep this consistent everywhere:
//   - Free: no card required, does not expire. 5 Coach messages and 2 Meals Near You searches
//     PER CALENDAR MONTH (a standing monthly allowance, not a trial — see lib/entitlements.js).
//     No food scanner.
//   - Asc3end+ monthly: $9.99/month. Asc3end+ annual: $79.99/year.
//   - Asc3end+ raises Coach and Meals Near You to a fair-use monthly cap (PLUS_MONTHLY_LIMITS in
//     lib/entitlements.js) and unlocks the food scanner. The caps are shown as numbers rather
//     than "unlimited", since a hard cap described as unlimited would be misleading.
import { FREE_MONTHLY_LIMITS, PLUS_MONTHLY_LIMITS } from "./entitlements";

export const MONTHLY_PRICE = 9.99;
export const ANNUAL_PRICE = 79.99;
export const ANNUAL_SAVINGS_PCT = Math.round((1 - ANNUAL_PRICE / (MONTHLY_PRICE * 12)) * 100);

export const FEATURE_COMPARISON = [
  { label: "Workout logging", free: true, premium: true },
  { label: "Nutrition tracking", free: true, premium: true },
  { label: "Progress & strength analytics", free: true, premium: true },
  { label: "AI Coach chat & plans", free: `${FREE_MONTHLY_LIMITS.coach}/month`, premium: `${PLUS_MONTHLY_LIMITS.coach}/month*` },
  { label: "Meals Near You", free: `${FREE_MONTHLY_LIMITS.meals}/month`, premium: `${PLUS_MONTHLY_LIMITS.meals}/month*` },
  { label: "Food scanner (photo/barcode)", free: false, premium: true },
];

export const FEATURE_COMPARISON_FOOTNOTE = `*Fair-use limits, well above normal use (about ${Math.round(PLUS_MONTHLY_LIMITS.coach / 30)} coach messages a day). The food scanner allows ${PLUS_MONTHLY_LIMITS.scanner} scans a month.`;

export const PRICING_FAQ = [
  { q: "Do I need a card to use Asc3end?", a: "No. The Free plan does not require a card and does not expire. You are only charged if you choose to upgrade to Asc3end+." },
  { q: "Can I cancel anytime?", a: "Yes. Cancel from Profile > Manage Billing whenever you like — you keep Asc3end+ until the end of the period you already paid for, then it reverts to the Free plan automatically. No phone calls, no retention flow." },
  { q: "Is my payment information secure?", a: "Payments are handled entirely by Stripe — Asc3end never sees or stores your card number." },
  { q: "Can I switch between monthly and annual?", a: "Yes, any time from Profile > Manage Billing, which opens Stripe's own billing portal." },
];
