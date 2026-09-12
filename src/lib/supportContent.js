// General self-serve help content — separate from src/lib/legal.js (which is the actual legal
// Support/Contact documents). This is the practical "how do I..." FAQ shown in-app so most
// account/billing questions never need to reach a real inbox.
export const SUPPORT_FAQ = [
  { q: "How do I upgrade to Asc3end+?", a: "Go to Profile, or tap any \"Upgrade\" prompt, to see plans and pricing. Payment is handled by Stripe — Asc3end never sees your card details." },
  { q: "How do I cancel my subscription?", a: "Profile > Manage Billing opens Stripe's own billing portal, where you can cancel, update your card, or switch plans. You keep Asc3end+ until the end of the period you already paid for." },
  { q: "I was charged but Asc3end+ isn't showing as active", a: "This can take a few seconds right after checkout. If it's still not active after a minute, try logging out and back in. If that doesn't fix it, contact support with your account email and we'll check your subscription status directly." },
  { q: "How do I edit my profile (goal, weight, training days)?", a: "Profile > About You. Your nutrition targets recalculate automatically when you update your body stats or goal." },
  { q: "How do I export or delete my data?", a: "Profile > Your Data has both — Export downloads a JSON file of everything in your account, and Delete Account permanently removes your account and all workouts, nutrition logs, and weight history." },
  { q: "Why do I only get 5 free AI Coach / Meals Near You uses?", a: "Free accounts get 5 uses of each to try them out — Profile > Your AI Usage shows how many you've used. Asc3end+ removes the limit entirely." },
  { q: "The AI Coach or food scanner gave me a wrong answer", a: "AI responses can be inaccurate — see the AI Limitations page in Legal. Always sanity-check anything that affects your health, safety, or spending." },
];
