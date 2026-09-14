// Central source of truth for the legal-document version recorded against a user's acceptance
// (profile.legalAcceptedVersion / profile.legalAcceptedAt, set at the end of onboarding).
// Bump LEGAL_DOCUMENT_VERSION whenever the underlying legal text changes meaningfully — a user
// who accepted an older version can then be prompted to re-accept before continuing.
//
// INTERNAL NOTE — not shown to users: this copy was authored to be complete and genuinely useful,
// but it has NOT been reviewed by a lawyer. Professional legal review is still required before
// this app accepts public payments from real customers. Do not remove this comment until that
// review has actually happened, and do not present these documents to users or investors as
// lawyer-approved — they are the app owner's own good-faith drafts. Tracked as a launch blocker
// in LAUNCH_READINESS.md under "Requires legal review."
export const LEGAL_DOCUMENT_VERSION = "2026-09-14-v4";
export const LEGAL_EFFECTIVE_DATE = "2026-09-12";

// Client-safe (VITE_-prefixed) since this is meant to be publicly displayed, not a secret. Left
// unset until the app owner configures a real, monitored inbox — shown honestly as "not yet
// configured" rather than a fabricated address or a bracketed [INSERT EMAIL] placeholder, either
// of which would be worse than admitting the gap. Every legal document below (and Support,
// billing help, and Profile & Settings elsewhere in the app) references this exact same value —
// one place, so the contact address can never drift between pages.
export const SUPPORT_EMAIL = import.meta.env.VITE_SUPPORT_EMAIL || null;
const contactLine = SUPPORT_EMAIL
  ? `email ${SUPPORT_EMAIL}`
  : "use the in-app Support area (Profile > Help & Support)";

// Same VITE_-prefixed pattern as SUPPORT_EMAIL above, and for the same reason: a business name,
// ABN, and registered address are not secrets — they're meant to be publicly displayed on legal
// pages — but this is a 100% client-side app with no server rendering, so a non-VITE_-prefixed
// env var is invisible to the browser bundle no matter what value it holds. (These were
// previously defined WITHOUT the VITE_ prefix and never actually read anywhere in this file —
// the env vars existed in Vercel but had no code path to reach the page a user actually sees.)
export const LEGAL_BUSINESS_NAME = import.meta.env.VITE_LEGAL_BUSINESS_NAME || null;
export const LEGAL_BUSINESS_ABN = import.meta.env.VITE_LEGAL_BUSINESS_ABN || null;
export const LEGAL_BUSINESS_ADDRESS = import.meta.env.VITE_LEGAL_BUSINESS_ADDRESS || null;
const providerLine = LEGAL_BUSINESS_NAME
  ? `Asc3end is provided by ${LEGAL_BUSINESS_NAME}${LEGAL_BUSINESS_ABN ? ` (ABN ${LEGAL_BUSINESS_ABN})` : ""}${LEGAL_BUSINESS_ADDRESS ? `, of ${LEGAL_BUSINESS_ADDRESS}` : ""}.`
  : "Business registration details have not yet been configured by the app owner.";

export const LEGAL_COPY = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      { heading: "Data we collect", body: "Account data (your email address and authentication credentials, handled by Supabase); profile data (name, age, gender, height, weight, training goal and experience level); the workouts, nutrition entries, and bodyweight logs you record; any photos you submit to the food scanner (processed to extract nutrition data, not stored permanently by Asc3end after processing); messages you send to the AI Coach; subscription and billing status (not your card number — see \"Payment processing\" below); and basic product-usage analytics (see \"Analytics and error monitoring\")." },
      { heading: "Why we collect it", body: "To provide the core functionality you sign up for: tracking your training and nutrition, generating personalized coaching and meal suggestions, computing your nutrition targets and progress, and billing Asc3end+ subscriptions. We do not sell your data, and we do not share your workout, nutrition, or profile data with other users or with advertisers." },
      { heading: "Account and profile data", body: "Stored in your own account and never shared with other users. You can view and edit this data at any time in Profile & Settings." },
      { heading: "Workout, nutrition, and bodyweight data", body: "Stored against your account and used to power your dashboard, progress charts, muscle-recovery estimates, and Coach conversations. Only you can see this data through the app; Asc3end staff do not routinely review individual users' logs." },
      { heading: "AI processing and Anthropic", body: "The AI Coach, food scanner, and Meals Near You features send the minimum context needed (your message, recent workout summaries, and/or a food photo) to Anthropic's Claude API to generate a response. Anthropic processes this data to return the AI response; see Anthropic's own privacy policy for how they handle data sent to their API. We do not send your email, password, or payment information to Anthropic." },
      { heading: "Payment processing (Stripe)", body: "Asc3end+ subscriptions are billed through Stripe. Your card details are entered directly into Stripe's own checkout page and are never seen, transmitted to, or stored by Asc3end's servers. We store only your Stripe customer ID, subscription status, plan, and renewal date, so the app can show your correct billing state." },
      { heading: "Analytics and error monitoring", body: "We record lightweight, privacy-conscious product-usage events (e.g. \"workout completed\", \"coach message sent\") against your account to understand how the app is used — see src/lib/analytics.js for the full event catalog. These events are validated to exclude anything that looks like an email address, a name, or other personal content before being stored. If error monitoring is configured (Sentry), crash reports may include a stack trace and the general shape of what failed, but not your workout content, card details, or password." },
      { heading: "Cookies and local storage", body: "Asc3end does not use third-party advertising cookies. Your browser's local storage is used to keep you signed in between visits and to cache your current in-progress workout so a page reload doesn't lose it. Clearing your browser's site data will sign you out." },
      { heading: "Data retention", body: "Your data is retained for as long as your account exists. If you delete your account (Profile > Your Data > Delete Account), your workouts, nutrition logs, weight history, profile, and subscription record are permanently removed. Anonymized or aggregate analytics that can no longer identify you may be retained for product-improvement purposes." },
      { heading: "Export and deletion", body: "You can export a JSON copy of everything in your account, and permanently delete your account and all associated data, at any time from Profile > Your Data. Deletion requires re-entering your password to confirm and cannot be undone." },
      { heading: "Security", body: "Access to your data is protected by Supabase's authentication and Row Level Security, which restricts every database query to the signed-in user's own rows. Server-side functions that need broader access (billing webhooks, account deletion, admin metrics) run behind their own authorization checks — see SECURITY.md in the project repository for full technical detail." },
      { heading: "Children and minimum age", body: "Asc3end is not directed at children and is not intended for use by anyone under 16. We do not knowingly collect data from children under 16. If you believe a child has created an account, contact us and we will delete it." },
      { heading: "International data processing", body: "Asc3end's infrastructure providers (Supabase, Anthropic, Stripe, Vercel) may process and store data outside your own country, including in the United States. By using Asc3end you consent to this processing." },
      { heading: "Your privacy rights", body: "Depending on where you live, you may have rights to access, correct, export, or delete your personal data, and to object to certain processing. The in-app Export and Delete Account tools cover most of these directly; for anything else, " + contactLine + "." },
      { heading: "Who provides this service", body: providerLine },
      { heading: "Contact", body: SUPPORT_EMAIL ? `Questions about this policy: ${SUPPORT_EMAIL}.` : "Questions about this policy: use the in-app Support area (Profile > Help & Support) — a dedicated privacy contact address has not yet been configured by the app owner." },
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      { heading: "Accounts", body: "You need an account (email and password) to use Asc3end. You're responsible for keeping your login credentials secure and for the accuracy of the information you log. One account per person." },
      { heading: "Acceptable use", body: "Use Asc3end for its intended purpose: tracking your own training and nutrition. Don't attempt to access another user's data, interfere with the service, abuse the AI features beyond fair personal use, or use the API endpoints outside of the app itself." },
      { heading: "The Free plan and Asc3end+ subscriptions", body: "Asc3end offers a permanent Free plan that never requires payment, alongside a paid Asc3end+ subscription (billed monthly or annually through Stripe) that removes the Free plan's monthly usage limits on AI features and unlocks the food scanner. Prices are shown before checkout." },
      { heading: "Cancellation", body: "Cancel Asc3end+ at any time from Profile > Manage Billing. You keep access until the end of the period you already paid for; cancelling does not retroactively refund that period. See the Refund & Cancellation Policy for refund specifics." },
      { heading: "Intellectual property", body: "Asc3end's software, design, and branding are owned by the app operator. The workout, nutrition, and other content you log remains yours — we don't claim ownership of it, though we process it to provide the service as described in the Privacy Policy." },
      { heading: "AI limitations", body: "AI Coach, food scanner, and Meals Near You responses are generated by a third-party AI model and can be inaccurate — see the AI Limitations page for detail. Don't treat AI output as professional advice." },
      { heading: "Health disclaimer", body: "Asc3end provides general fitness and nutrition information, not medical advice — see the Health & Fitness Disclaimer page in full before starting any training or nutrition program." },
      { heading: "Termination", body: "You can delete your own account at any time. We may suspend or terminate accounts that violate these terms, abuse the service, or attempt to circumvent billing or usage limits." },
      { heading: "Warranty and liability limitations", body: "Asc3end is provided \"as is,\" without warranties of any kind, express or implied. To the fullest extent permitted by law, the app operator is not liable for indirect, incidental, or consequential damages arising from your use of the service, including reliance on AI-generated training, nutrition, or meal-suggestion content." },
      { heading: "Changes to these terms", body: "We may update these terms as the product evolves. Material changes will ask you to re-accept before continuing to use the app." },
      { heading: "Who provides this service", body: providerLine },
      { heading: "Contact", body: SUPPORT_EMAIL ? `Questions about these terms: ${SUPPORT_EMAIL}.` : "Questions about these terms: use the in-app Support area (Profile > Help & Support)." },
    ],
  },
  disclaimer: {
    title: "Health & Fitness Disclaimer",
    sections: [
      { heading: "Not medical advice", body: "Asc3end provides general fitness and nutrition information — it is not medical advice, not a medical device, and does not diagnose, treat, cure, or prevent any medical condition." },
      { heading: "Estimates, not measurements", body: "Muscle recovery estimates are illustrative, based on time since you last logged training for a muscle group — not a medical or physiological measurement. Nutrition values from AI estimates, barcode lookups, or manual entry can be inaccurate." },
      { heading: "AI coaching guidance", body: "AI Coach guidance may be incorrect or unsuited to your specific situation, health history, or physical limitations. It does not know your full medical history unless you tell it, and it can still be wrong even then." },
      { heading: "Consult a professional", body: "Consult a doctor, physiotherapist, or registered dietitian before starting a new training or nutrition program — especially if you have an existing health condition, an injury, or are pregnant." },
      { heading: "Emergency symptoms", body: "Stop exercising and seek professional medical advice immediately if you experience chest pain, dizziness, shortness of breath, or other concerning symptoms during or after training." },
    ],
  },
  aiLimitations: {
    title: "AI Limitations",
    sections: [
      { heading: "How Asc3end's AI works", body: "The AI Coach, food scanner, and Meals Near You are powered by a third-party large language model (Anthropic's Claude) and, for Meals Near You, web search. Responses are generated by the model, not looked up from a verified database." },
      { heading: "What can go wrong", body: "Exercise recommendations, calorie/macro estimates, restaurant suggestions, prices, and business hours can be wrong, outdated, or nonsensical. The model can also misread a food photo or barcode, or misunderstand a chat message." },
      { heading: "Your responsibility", body: "Always sanity-check anything the AI tells you that affects your health, safety, or spending before relying on it — treat it as a knowledgeable but fallible assistant, not an authoritative source." },
    ],
  },
  subscriptionTerms: {
    title: "Subscription Terms",
    sections: [
      { heading: "Billing", body: "Asc3end+ is billed in advance on a recurring monthly (AUD $9.99) or annual (AUD $79.99) basis via Stripe. Your subscription renews automatically until you cancel." },
      { heading: "Free trial (if offered)", body: "Asc3end+ checkout may offer an optional free trial period, clearly disclosed on Stripe's own checkout page before you confirm, including the exact date your card will first be charged. Starting a trial is opt-in — the Free plan itself never requires this." },
      { heading: "Cancellation", body: "Cancelling stops future renewals but does not refund the current period — you keep Asc3end+ access until the end of the period you already paid for, then your account reverts to the Free plan automatically." },
      { heading: "Price changes", body: "Prices are shown before checkout. If prices change, we'll provide notice before the change applies to your next billing period." },
      { heading: "Payment failures", body: "If a renewal payment fails, your subscription enters a grace period during which you keep access while Stripe retries the charge. If payment continues to fail, Asc3end+ access ends and your account reverts to the Free plan." },
    ],
  },
  refundPolicy: {
    title: "Refund & Cancellation Policy",
    sections: [
      { heading: "Cancelling your subscription", body: "Cancel Asc3end+ at any time from Profile > Manage Billing, which opens Stripe's own billing portal. Access continues until the end of your current paid period, and you will not be charged again after cancelling." },
      { heading: "Refunds", body: "Refunds for the current billing period are considered on a case-by-case basis. " + (SUPPORT_EMAIL ? `Contact ${SUPPORT_EMAIL}` : "Contact support via Profile > Help & Support") + " with your account email and the reason for the request." },
      { heading: "Your consumer law rights", body: "Nothing in this policy excludes, restricts, or modifies any right or remedy you have under the Australian Consumer Law or other applicable consumer protection law that cannot lawfully be excluded, including the statutory guarantees that apply to services supplied to consumers. If a service fails to meet a consumer guarantee, you may be entitled to a remedy regardless of anything stated elsewhere in this policy." },
    ],
  },
  support: {
    title: "Support",
    sections: [
      { heading: "Something broken or confusing?", body: SUPPORT_EMAIL
        ? `Email ${SUPPORT_EMAIL} and describe what you were doing when it happened — screenshots help.`
        : "Support email not yet configured by the app owner. In the meantime, use the in-app Support area (Profile > Help & Support) or Send Feedback." },
      { heading: "Common topics", body: "Login trouble, billing and cancellation, AI accuracy, food scanning issues, data export, and account deletion are all covered in the in-app Help & Support page (Profile > Help & Support), reachable without waiting for an email reply." },
    ],
  },
  contact: {
    title: "Contact",
    sections: [
      { heading: "General, billing, and privacy questions", body: SUPPORT_EMAIL
        ? `Email ${SUPPORT_EMAIL}.`
        : "A dedicated contact address has not yet been configured by the app owner — use the in-app Support area (Profile > Help & Support) in the meantime." },
    ],
  },
};
