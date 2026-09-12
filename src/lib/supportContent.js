// General self-serve help content — separate from src/lib/legal.js (which is the actual legal
// Support/Contact documents). This is the practical "how do I..." FAQ shown in-app so most
// account/billing questions never need to reach a real inbox. Covers: login trouble, billing,
// cancellation, AI issues, food scanning, data export, and account deletion.
import { FREE_MONTHLY_LIMIT } from "./entitlements";

export const SUPPORT_FAQ = [
  { q: "I can't log in", a: "Double-check your email and password, and make sure Caps Lock isn't on. If you forgot your password, use \"Forgot password?\" on the login screen — you'll get a reset link by email. If you signed up but never got a confirmation email, check spam, or contact support with the email address you used." },
  { q: "How do I upgrade to Asc3end+?", a: "Go to Profile, or tap any \"Upgrade\" prompt, to see plans and pricing. Payment is handled by Stripe — Asc3end never sees your card details." },
  { q: "How do I cancel my subscription?", a: "Profile > Manage Billing opens Stripe's own billing portal, where you can cancel, update your card, or switch plans. You keep Asc3end+ until the end of the period you already paid for — cancelling never cuts you off early." },
  { q: "I was charged but Asc3end+ isn't showing as active", a: "This can take a few seconds right after checkout. If it's still not active after a minute, try logging out and back in. If that doesn't fix it, contact support with your account email and we'll check your subscription status directly." },
  { q: "How do I edit my profile (goal, weight, training days)?", a: "Profile > About You. Your nutrition targets recalculate automatically when you update your body stats or goal." },
  { q: "How do I export or delete my data?", a: "Profile > Your Data has both — Export downloads a JSON file of everything in your account, and Delete Account permanently removes your account and all workouts, nutrition logs, and weight history. Deletion asks you to re-enter your password first and can't be undone." },
  { q: "Why do I only get 5 free AI Coach / Meals Near You uses?", a: `The Free plan includes ${FREE_MONTHLY_LIMIT} AI Coach messages and ${FREE_MONTHLY_LIMIT} Meals Near You searches every calendar month, at no cost and with no card required — the allowance resets automatically on the 1st. Profile > Your AI Usage shows how many you've used this month. Asc3end+ removes the monthly cap entirely (subject to normal fair-use limits).` },
  { q: "The AI Coach or food scanner gave me a wrong answer", a: "AI responses can be inaccurate — see the AI Limitations page in Legal. Always sanity-check anything that affects your health, safety, or spending, and let us know via Send Feedback if something looks clearly wrong." },
  { q: "The food scanner won't scan my photo or barcode", a: "Make sure the label or barcode is well-lit and fills most of the frame, then try again — a blurry or dark photo is the most common cause of a failed scan. If it keeps failing, you can always log the food manually or with Quick Add instead. The food scanner requires Asc3end+." },
];
