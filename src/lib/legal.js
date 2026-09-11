// Central source of truth for the legal-document version recorded against a user's acceptance
// (profile.legalAcceptedVersion / profile.legalAcceptedAt, set at the end of onboarding).
// Bump this string whenever the underlying legal text changes meaningfully — a user who accepted
// an older version can then be prompted to re-accept before continuing.
//
// IMPORTANT: this copy is a placeholder draft, not reviewed or approved by a lawyer. It exists so
// the acceptance checkbox and versioning mechanism are real and testable before launch, and to
// give users an honest, good-faith summary in the meantime. Do not treat it as sufficient legal
// protection for a paid commercial launch — see LAUNCH_READINESS.md's "requires legal review"
// section.
export const LEGAL_DOCUMENT_VERSION = "2026-09-12-draft-1";

export const LEGAL_COPY = {
  privacy: {
    title: "Privacy Policy",
    body: "Your workouts, nutrition logs, bodyweight history and profile are stored in your own account and are never shared with other users. AI features (Coach, food scanner, Meals Near You) send the minimum context needed to Anthropic's Claude API to generate a response. Payment is handled entirely by Stripe — Asc3end never sees or stores your card details. Lightweight product-usage analytics are recorded against your account (see the Analytics section of the Privacy Policy for what's included). You can export or delete all of your data at any time from Profile & Settings.",
  },
  terms: {
    title: "Terms of Use",
    body: "Asc3end is provided as-is to help you plan and track training and nutrition. Premium features are billed monthly or annually through Stripe and can be cancelled anytime from Manage Billing; access continues until the end of the paid period. You're responsible for the accuracy of the information you log. We may update these terms as the product evolves — material changes will ask for re-acceptance.",
  },
  disclaimer: {
    title: "Health & Fitness Disclaimer",
    body: "Asc3end provides general fitness and nutrition information — it is not medical advice, not a medical device, and does not diagnose, treat, cure or prevent any medical condition. Muscle recovery estimates are illustrative, not a medical measurement. Nutrition values (from AI estimates, barcode lookups, or manual entry) can be inaccurate. AI Coach guidance may be incorrect or unsuited to your specific situation. Consult a doctor, physiotherapist, or registered dietitian before starting a new training or nutrition program, especially if you have an existing health condition, injury, or are pregnant. Stop exercising and seek professional advice immediately if you experience chest pain, dizziness, shortness of breath, or other concerning symptoms.",
  },
  aiLimitations: {
    title: "AI Limitations",
    body: "Asc3end's AI Coach, food scanner, and Meals Near You are powered by a third-party large language model (Anthropic's Claude) and web search. Responses are generated, not looked up from a verified database — exercise recommendations, calorie/macro estimates, restaurant suggestions, prices, and hours can be wrong, outdated, or nonsensical. Always sanity-check anything that affects your health, safety, or spending before relying on it.",
  },
  subscriptionTerms: {
    title: "Subscription Terms",
    body: "Asc3end+ is billed in advance on a recurring monthly or annual basis via Stripe. Your subscription renews automatically until you cancel. Cancelling stops future renewals but does not refund the current period — you keep Asc3end+ access until the end of the period you already paid for. Prices are shown before checkout and may change with notice for future billing periods.",
  },
  refundPolicy: {
    title: "Refund & Cancellation Policy",
    body: "You can cancel Asc3end+ at any time from Manage Billing — access continues until the end of your current paid period, and you will not be charged again after cancelling. Refunds for the current period are considered on a case-by-case basis; contact support with your account email and the reason for the request.",
  },
  support: {
    title: "Support",
    body: "Something broken or confusing? Use the in-app Support area, or email support and describe what you were doing when it happened — screenshots help.",
  },
  contact: {
    title: "Contact",
    body: "For account, billing, privacy, or general questions, use the in-app Support area or the support email listed there.",
  },
};
