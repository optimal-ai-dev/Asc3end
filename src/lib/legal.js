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
export const LEGAL_DOCUMENT_VERSION = "2026-10-25-v5";
export const LEGAL_EFFECTIVE_DATE = "2026-10-25";

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


// Minimum age to create an account. Enforced in Onboarding and Profile (meetsMinimumAge) and
// stated in the Privacy Policy and Terms, so the number lives here once and can't drift.
export const MIN_AGE = 16;
export const meetsMinimumAge = (age) => typeof age === "number" && age >= MIN_AGE;


export const LEGAL_COPY = {
  privacy: {
    title: "Privacy Policy",
    sections: [
      { heading: "About this policy", body: "This policy explains how Asc3end collects, uses, stores and shares your personal information, and how you can access, correct or delete it. We handle personal information in line with the Australian Privacy Principles in the Privacy Act 1988 (Cth). " + providerLine },
      { heading: "Data we collect", body: "Account data: your email address and password (passwords are handled by our sign-in provider, Supabase, and are never visible to us). Profile data: name, age, gender, height, weight, training goal, experience level and training days. Health and fitness data: the workouts, sets, bodyweight entries, food and water logs, nutrition targets and weekly check-ins you record. AI data: messages you send to the AI Coach (your conversation history is saved to your account), food or nutrition-label photos you submit, and any location you type into Meals Near You. Billing data: your Stripe customer ID, plan, subscription status and renewal date (never your card number). Feedback you send us, and basic product-usage events (see \"Analytics and error monitoring\")." },
      { heading: "Health information and your consent", body: "Some of what you log, such as your weight, height, body measurements, training and food intake, is health information, which Australian privacy law treats as sensitive information. We only collect it with your consent, which you give when you create your account, and only use it to provide the app's features to you. You can withdraw consent at any time by deleting your account (Profile > Your Data > Delete Account); we cannot provide the app without this information." },
      { heading: "Why we collect it", body: "To provide the features you sign up for: tracking your training and nutrition, building your plan and nutrition targets, generating AI coaching and meal suggestions, showing your progress, billing Asc3end+ subscriptions, answering support requests and fixing bugs. We do not sell your personal information, we do not use it for advertising, and we do not share your workout, nutrition or profile data with other users." },
      { heading: "Account and profile data", body: "Stored in your own account and never shown to other users. You can view and edit it at any time in Profile & Settings." },
      { heading: "Workout, nutrition, and bodyweight data", body: "Stored against your account and used to power your dashboard, progress charts, muscle-recovery estimates, nutrition targets and Coach conversations. We do not routinely look at individual users' logs; we would only do so to investigate a problem you report, to keep the service secure, or where the law requires it." },
      { heading: "AI processing and Anthropic", body: "The AI Coach, food and label scanner, meal ideas and Meals Near You are powered by Anthropic's Claude API. When you use them, we send Anthropic only what the feature needs: for the Coach, your first name, goal, experience level, current weight, daily nutrition targets, a summary of your recent workouts and your conversation; for the scanners, the photo you took; for Meals Near You, the location you typed and your nutrition targets, which Anthropic may use to run a web search. We never send your email address, password or payment details. Under Anthropic's commercial terms, data sent through its API is not used to train its models by default. Don't include anything in a Coach message or photo that you don't want processed this way." },
      { heading: "Food databases", body: "Food searches are sent from our server to USDA FoodData Central and Open Food Facts, so those services see the search words but not who you are. When you scan a barcode, your device looks it up directly with Open Food Facts, which means Open Food Facts receives the barcode number and your device's IP address." },
      { heading: "Payment processing (Stripe)", body: "Asc3end+ subscriptions are billed through Stripe. You enter your card details on Stripe's own checkout page; they are never seen by or stored on Asc3end's servers. Stripe handles your payment information under its own privacy policy and keeps payment records it is legally required to keep." },
      { heading: "Who we share it with", body: "We use these service providers to run Asc3end, and they only process your information to provide their service to us: Supabase (database, sign-in and account emails), Vercel (website and server hosting), Anthropic (AI features), Stripe (payments), and, if enabled, Sentry (crash reports). We may also disclose information where the law requires it, for example to respond to a valid legal request, or to protect someone's life, health or safety. If the business is ever sold, your information may be transferred to the new owner, who would be bound by this policy." },
      { heading: "International data processing", body: "Our providers store or process data outside Australia. Anthropic, Vercel and Stripe process data mainly in the United States; Supabase stores your account data in its cloud hosting region, which may be outside Australia; Sentry processes crash reports in the United States; Open Food Facts operates from France. We use providers that commit by contract to protecting personal information, and we remain responsible for how your information is handled under the Australian Privacy Principles." },
      { heading: "Analytics and error monitoring", body: "We record simple product-usage events (for example \"workout completed\" or \"coach message sent\") against your account to understand how the app is used. These events contain counts and categories only, never your messages, food logs, name or email. If crash reporting (Sentry) is switched on, crash reports include technical details of what went wrong, not your workout content, card details or password." },
      { heading: "Automated processing", body: "Asc3end uses formulas and AI to produce your training plan, nutrition targets, recovery estimates and suggestions. These are recommendations you can change or ignore; the app does not use automated processing to make decisions that have a legal or similarly significant effect on you." },
      { heading: "Cookies and local storage", body: "Asc3end does not use advertising or tracking cookies. Your browser's local storage keeps you signed in between visits and saves an in-progress workout so a page reload doesn't lose it. Clearing your browser's site data signs you out." },
      { heading: "Data retention", body: "We keep your data for as long as your account exists. When you delete your account, your profile, workouts, nutrition logs, weight history, Coach history, feedback, usage records and subscription record are permanently deleted from our database straight away, and any active Asc3end+ subscription is cancelled. Copies may remain in our providers' encrypted backups for a short period until they are overwritten. Stripe keeps records of past payments for as long as tax and financial laws require." },
      { heading: "Export and deletion", body: "You can download a copy of your data, and permanently delete your account and its data, at any time from Profile > Your Data. Deletion asks you to re-enter your password and cannot be undone." },
      { heading: "Security", body: "Your data is protected by authenticated access and database rules that only let each signed-in user read their own records. Connections are encrypted, and server functions that need wider access (billing, account deletion) run behind their own checks. No system is perfectly secure, so please use a strong, unique password." },
      { heading: "Data breaches", body: "If we become aware of a data breach that is likely to cause you serious harm, we will notify you and the Office of the Australian Information Commissioner (OAIC) as required by the Notifiable Data Breaches scheme, and tell you what you can do to protect yourself." },
      { heading: "Children and minimum age", body: `You must be at least ${MIN_AGE} to create an Asc3end account, and the app will not let you sign up with a younger age. Asc3end is not designed for children. If you are under 18, please use Asc3end with the knowledge of a parent or guardian, and you need their permission to buy a subscription. If you believe a child under ${MIN_AGE} has an account, ${contactLine} and we will delete it.` },
      { heading: "Your privacy rights", body: `You can ask to access or correct the personal information we hold about you. Most of it can be viewed, corrected, exported or deleted directly in the app. For anything else, ${contactLine}. We will respond within 30 days and won't charge you for making a request. You can use a pseudonym in the Name field if you prefer.` },
      { heading: "Complaints", body: `If you have a concern about how we've handled your personal information, ${contactLine} and describe the issue. We will acknowledge it and aim to resolve it within 30 days. If you're not satisfied with our response, you can complain to the Office of the Australian Information Commissioner at oaic.gov.au or on 1300 363 992.` },
      { heading: "Changes to this policy", body: "If we change this policy in a way that matters, we will show you the updated version in the app and ask you to accept it before you continue. The version and effective date are shown at the bottom of this page." },
      { heading: "Who provides this service", body: providerLine },
      { heading: "Contact", body: SUPPORT_EMAIL ? `Privacy questions, requests and complaints: ${SUPPORT_EMAIL}.` : "Privacy questions, requests and complaints: use the in-app Support area (Profile > Help & Support). A dedicated privacy contact address has not yet been configured by the app owner." },
    ],
  },
  terms: {
    title: "Terms of Use",
    sections: [
      { heading: "About these terms", body: "These terms are an agreement between you and the operator of Asc3end. " + providerLine + " By creating an account you agree to these terms, the Privacy Policy and the Health & Fitness Disclaimer." },
      { heading: "Accounts and eligibility", body: `You must be at least ${MIN_AGE} to use Asc3end. If you are under 18 you need a parent's or guardian's permission to buy a subscription. You're responsible for keeping your password secure and for the accuracy of what you log. One account per person.` },
      { heading: "Acceptable use", body: "Use Asc3end for its intended purpose: tracking your own training and nutrition. Don't try to access another person's data, interfere with or overload the service, use the AI features to generate harmful content, use automated tools to access the service, or resell access to it." },
      { heading: "The Free plan and Asc3end+ subscriptions", body: "Asc3end has a Free plan that never requires payment, with monthly limits on AI features. Asc3end+ is a paid subscription, billed monthly or annually through Stripe, that raises those limits to the higher fair-use limits shown on the pricing page and unlocks the food scanner. Prices and what's included are shown before you pay. The Subscription Terms and the Refund & Cancellation Policy form part of these terms." },
      { heading: "Cancellation", body: "You can cancel Asc3end+ at any time from Profile > Manage Billing. You keep access until the end of the period you've paid for and won't be charged again. Deleting your account also cancels your subscription." },
      { heading: "Intellectual property", body: "Asc3end's software, design and branding belong to the operator. The workouts, food logs and other content you add remain yours; you give us permission to store and process them only to provide the service, as described in the Privacy Policy. Food data comes from third-party sources listed on the Data Sources & Credits page." },
      { heading: "AI limitations", body: "AI Coach, scanner and meal responses are generated by a third-party AI model and can be wrong. See the AI Limitations page. Don't treat AI output as professional advice." },
      { heading: "Health disclaimer", body: "Asc3end provides general fitness and nutrition information, not medical advice. Read the Health & Fitness Disclaimer before starting any training or nutrition program." },
      { heading: "Termination and suspension", body: "You can delete your account at any time. We may suspend or close an account that seriously or repeatedly breaches these terms, puts other people or the service at risk, or tries to get around billing or usage limits. Where it's reasonable, we'll tell you first and give you a chance to fix the problem. If we close the service altogether, we'll give you at least 30 days' notice and refund the unused part of any prepaid subscription." },
      { heading: "Your consumer rights", body: "Our services come with guarantees that cannot be excluded under the Australian Consumer Law. Nothing in these terms excludes, restricts or modifies any right or remedy you have under the Australian Consumer Law or any other law that cannot lawfully be excluded." },
      { heading: "Warranty and liability limitations", body: "Subject to your consumer rights above, we provide Asc3end on an \"as available\" basis and don't promise it will always be uninterrupted or error-free, or that estimates and AI output will be accurate. To the extent the law allows, we are not liable for loss that was not reasonably foreseeable, or for injury or loss caused by ignoring the Health & Fitness Disclaimer, such as training through pain or acting on AI output without checking it. Nothing in these terms limits liability that cannot be limited by law." },
      { heading: "Changes to these terms", body: "We may update these terms as the product changes. If a change is material, we'll show you the new version in the app and ask you to accept it before you continue. If you have a paid subscription and don't accept a material change that is to your disadvantage, you can cancel and ask for a refund of the unused part of your current period." },
      { heading: "Governing law", body: "These terms are governed by the laws of Victoria, Australia. If you're a consumer, you can also rely on the consumer protection laws of the place where you live." },
      { heading: "Who provides this service", body: providerLine },
      { heading: "Contact", body: SUPPORT_EMAIL ? `Questions about these terms: ${SUPPORT_EMAIL}.` : "Questions about these terms: use the in-app Support area (Profile > Help & Support)." },
    ],
  },
  disclaimer: {
    title: "Health & Fitness Disclaimer",
    sections: [
      { heading: "Not medical advice", body: "Asc3end provides general fitness and nutrition information. It is not medical advice and not a medical device, and it does not diagnose, treat, cure or prevent any condition." },
      { heading: "Estimates, not measurements", body: "Nutrition targets, calorie estimates and muscle-recovery estimates are calculated from general formulas and the information you enter. They are not medical or physiological measurements. Nutrition values from AI estimates, barcodes, food databases or manual entry can be wrong." },
      { heading: "AI coaching guidance", body: "AI Coach guidance may be incorrect or unsuited to your situation, health history or physical limitations. It only knows what you tell it, and it can still be wrong." },
      { heading: "Consult a professional", body: "Talk to a doctor, physiotherapist or Accredited Practising Dietitian before starting a new training or nutrition program, especially if you have a health condition or injury, take medication, are pregnant or recently gave birth, or have not exercised in a long time." },
      { heading: "Under 18", body: "Nutrition targets and training plans are designed for adults. If you are 16 or 17, don't follow aggressive calorie deficits or weight-loss goals, and check your plan with a parent, guardian or doctor." },
      { heading: "Eating and body image", body: "If tracking food or weight makes you anxious or is affecting how you eat, stop and talk to someone. The Butterfly Foundation helpline is free and confidential on 1800 33 4673 (butterfly.org.au)." },
      { heading: "Emergency symptoms", body: "Stop exercising and get medical help straight away if you have chest pain, dizziness, fainting, severe shortness of breath or other worrying symptoms. In an emergency in Australia, call 000." },
      { heading: "Your responsibility", body: "You choose how hard to train and what to eat. Use good form, warm up, start with weights you can control, and stop if something hurts." },
    ],
  },
  aiLimitations: {
    title: "AI Limitations",
    sections: [
      { heading: "How Asc3end's AI works", body: "The AI Coach, food and label scanner, meal ideas and Meals Near You are powered by a third-party AI model (Anthropic's Claude) and, for Meals Near You, web search. Responses are generated by the model, not looked up in a verified database." },
      { heading: "What can go wrong", body: "Exercise suggestions, calorie and macro estimates, restaurant suggestions, prices and opening hours can be wrong, out of date or nonsensical. The model can misread a photo or label, or misunderstand a message." },
      { heading: "Your responsibility", body: "Check anything the AI tells you that affects your health, safety or spending before relying on it. Treat it as a knowledgeable but fallible assistant, not an authority." },
      { heading: "What the AI sees", body: "The Privacy Policy explains exactly what is sent to the AI provider for each feature. Avoid putting sensitive details you don't need to share, such as medical records or other people's information, in Coach messages or photos." },
    ],
  },
  subscriptionTerms: {
    title: "Subscription Terms",
    sections: [
      { heading: "Billing", body: "Asc3end+ costs AUD $9.99 a month or AUD $79.99 a year, billed in advance through Stripe. Prices are in Australian dollars and are the total price you pay, including GST if it applies." },
      { heading: "Automatic renewal", body: "Your subscription renews automatically at the end of each month or year, and Stripe charges the card you used, until you cancel. The renewal date is shown in Profile > Manage Billing." },
      { heading: "Free trial", body: "When you choose the optional 7-day free trial at checkout, you won't be charged during the trial. If you don't cancel before the trial ends, your subscription starts and your card is charged automatically for the plan you chose. Stripe's checkout page shows the date of the first charge before you confirm." },
      { heading: "Cancellation", body: "Cancel at any time from Profile > Manage Billing, which opens Stripe's billing portal. Cancelling stops future renewals. You keep Asc3end+ until the end of the period you've paid for, then your account moves to the Free plan automatically. Deleting your account cancels your subscription immediately." },
      { heading: "Price changes", body: "If we change the price, we'll tell you at least 30 days before the new price applies to your next renewal, so you can cancel first if you don't want to continue." },
      { heading: "Payment failures", body: "If a renewal payment fails, you keep access for a short grace period while Stripe retries the charge. If payment still fails, Asc3end+ ends and your account moves to the Free plan. You won't lose your logged data." },
    ],
  },
  refundPolicy: {
    title: "Refund & Cancellation Policy",
    sections: [
      { heading: "Cancelling your subscription", body: "Cancel Asc3end+ at any time from Profile > Manage Billing. Access continues until the end of your current paid period, and you won't be charged again after cancelling." },
      { heading: "Change-of-mind refunds", body: "We don't usually refund a period you've already started just because you changed your mind, but we'll consider any request fairly, for example if you were charged for a renewal you forgot about and haven't used. " + (SUPPORT_EMAIL ? `Email ${SUPPORT_EMAIL}` : "Contact support via Profile > Help & Support") + " with your account email and the reason." },
      { heading: "When something goes wrong", body: "If Asc3end+ has a major problem, such as features you paid for not working for a significant time, you can ask for a refund for the affected period or cancel and get a refund for the unused part. If the problem is minor, we'll fix it within a reasonable time, and if we don't, you can ask for a refund." },
      { heading: "Your consumer law rights", body: "Nothing in this policy excludes, restricts or modifies any right or remedy you have under the Australian Consumer Law or any other consumer protection law that cannot lawfully be excluded, including the consumer guarantees that apply to services. You're entitled to a remedy when a service fails to meet a consumer guarantee, regardless of anything else in this policy." },
    ],
  },
  dataSources: {
    title: "Data Sources & Credits",
    sections: [
      { heading: "Open Food Facts", body: "Packaged-food and barcode data comes from Open Food Facts, a free, crowd-sourced database. This app contains information from Open Food Facts, which is made available under the Open Database License (ODbL). Individual product entries are licensed under the Database Contents License, and product images under Creative Commons Attribution-ShareAlike. Entries are added by volunteers and can contain mistakes, so check the label if a value looks off.",
        links: [
          { label: "openfoodfacts.org", href: "https://world.openfoodfacts.org" },
          { label: "Open Database License (ODbL)", href: "https://opendatacommons.org/licenses/odbl/1-0/" },
        ] },
      { heading: "USDA FoodData Central", body: "Generic food data comes from the U.S. Department of Agriculture's FoodData Central, which is in the public domain. Asc3end is not endorsed by the USDA.",
        links: [{ label: "fdc.nal.usda.gov", href: "https://fdc.nal.usda.gov" }] },
      { heading: "AI", body: "AI features are powered by Anthropic's Claude. Asc3end is not affiliated with or endorsed by Anthropic." },
    ],
  },
  support: {
    title: "Support",
    sections: [
      { heading: "Something broken or confusing?", body: SUPPORT_EMAIL
        ? `Email ${SUPPORT_EMAIL} and describe what you were doing when it happened. Screenshots help.`
        : "Support email not yet configured by the app owner. In the meantime, use the in-app Support area (Profile > Help & Support) or Send Feedback." },
      { heading: "Common topics", body: "Login trouble, billing and cancellation, AI accuracy, food scanning, data export and account deletion are covered in the in-app Help & Support page (Profile > Help & Support)." },
    ],
  },
  contact: {
    title: "Contact",
    sections: [
      { heading: "General, billing, and privacy questions", body: SUPPORT_EMAIL
        ? `Email ${SUPPORT_EMAIL}.`
        : "A dedicated contact address has not yet been configured by the app owner. Use the in-app Support area (Profile > Help & Support) in the meantime." },
      { heading: "Who provides this service", body: providerLine },
    ],
  },
};
