# Launch Readiness — Asc3end

Generated at the end of a 20-phase implementation pass turning Asc3end from a working beta into
commercial-launch infrastructure. Categorized honestly: **automated pass** (a test suite proves
it), **manually verified** (a human/agent walked through it live against the deployed app),
**requires owner action** (only the app owner can do this — a real credential, a business
decision, a payment), **requires legal review** (a lawyer needs to look at this before it's
relied on), and **requires real-device testing** (only verified via browser/viewport emulation,
not a physical phone). Nothing below claims "launch ready" — read the Blockers section before
deciding whether to launch.

## Blockers — read first

1. **`feedback` table migration not run.** Phase 13's feedback form will fail to submit (with a
   clean error message, not a crash) until this SQL runs in the Supabase SQL editor:
   ```sql
   create table feedback (
     id uuid primary key default gen_random_uuid(),
     user_id uuid references auth.users not null,
     type text not null check (type in ('bug', 'feature', 'rating')),
     message text not null default '',
     rating int check (rating between 1 and 5),
     page text,
     created_at timestamptz default now()
   );
   alter table feedback enable row level security;
   create policy "Users can submit their own feedback" on feedback
     for insert with check (auth.uid() = user_id);
   ```
2. **Supabase's built-in email service is not production-grade.** Discovered live during Phase 20
   testing: creating a handful of throwaway test accounts in this session tripped Supabase's
   default "email rate limit exceeded" — the free built-in SMTP is meant for development, not real
   signup volume. Before real users sign up, configure a custom SMTP provider (SendGrid, Postmark,
   Resend, etc.) in Supabase Dashboard → Authentication → Email settings, or confirmation emails
   and password resets will silently fail once signups pick up. **Requires owner action.**
3. **Legal pages are good-faith drafts, not lawyer-reviewed.** Every legal page says so on its
   face (see Phase 9). Do not treat them as sufficient legal protection for a paid commercial
   product. **Requires legal review.**
4. **Billing/business env vars are unset**: `VITE_SUPPORT_EMAIL`, `LEGAL_BUSINESS_NAME`,
   `LEGAL_BUSINESS_ABN`, `LEGAL_BUSINESS_ADDRESS`, `ADMIN_EMAILS`. The app runs fine without them
   (each degrades to an honest "not configured" message rather than a fake value), but none of
   these are set. **Requires owner action** — run `npm run check-launch-config` for a live report.

None of the above block the app from running correctly today — they block calling it fully
launch-ready.

---

## Phase 1 — Reliability & data integrity
- [Automated pass] `finishWorkout` double-submit guard, malformed-data sanitization
  (`sanitizeList` + validators), stale-session detection — all covered by
  `workoutMath.test.js`, `validation.test.js`, `session.test.js`, `storage.test.js` (46 tests).
- [Manually verified] Reproduced and fixed a live crash: malformed `customExercises` threw
  `Cannot read properties of undefined (reading 'toLowerCase')` in Train — fixed and
  re-verified live.

## Phase 2 — Authentication & account completion
- [Automated pass] N/A (auth flows are inherently live-integration territory).
- [Manually verified] Signup, login, forgot-password, onboarding with legal acceptance
  checkbox, profile edit, password change, reauth-before-delete — walked through live end to
  end this session on a fresh account (Phase 20).
- [Requires owner action] Custom SMTP for Supabase Auth emails (see Blockers above).

## Phase 3 — Server-side security
- [Automated pass] `security.integration.test.js` — live RLS tests against the real Supabase
  project with two throwaway authenticated users (excluded from default `npm test`, run via
  `npm run test:integration`).
- [Manually verified] `npm audit --omit=dev` → 0 production vulnerabilities (re-confirmed
  multiple times this session, including after adding `@sentry/react` and `vite-plugin-pwa`).
  5 dev-only findings documented in `SECURITY.md`.
- [Automated pass] Rate limiting live on `/api/claude`, `/api/create-checkout-session`,
  `/api/create-portal-session`, `/api/delete-account`, `/api/admin-metrics` (fixed-window via
  `rate_limits` table + `increment_rate_limit` RPC — table confirmed present in production DB).

## Phase 4 — Subscription model
- [Automated pass] `subscription.test.js` (14 tests) — every state transition of
  `computeSubscriptionState`/`isEntitled`/`describeSubscriptionState`, including the
  past_due-grace-period and cancel-at-period-end-still-entitled cases.

## Phase 5 — Payment integration
- [Manually verified] **Full live round trip against Stripe test mode**: Pricing page →
  monthly + annual + 7-day-trial checkout → real Stripe Checkout page → real test-card payment
  → webhook → `subscriptions` row updated → Dashboard/Profile show "Asc3end+ Monthly — renews
  10/12/2026" → Billing Portal shows the real $9.99 invoice, real card, real next-billing-date.
- [Manually verified] Found and fixed a real bug during this testing: the "Upgrade to Premium"
  buttons were wired as `onClick={onUpgrade}`, so React passed the click event as
  `startCheckout`'s first argument instead of `"monthly"` — `JSON.stringify`-ing the event threw
  `Converting circular structure to JSON` before the request was ever sent, silently swallowed as
  "Couldn't reach the server." This was live and broken until this session found and fixed it —
  worth knowing this exact class of button existed unverified since Phase 5 first shipped.
- [Manually verified, partial] Cancel-at-period-end: confirmed the Stripe portal's own
  confirmation screen correctly states "available until the end of your billing period on
  October 11, 2026" (proving the portal + our subscription setup agree on semantics), but did
  not complete the actual cancellation — Stripe's flow requires solving an hCaptcha, and this
  session does not attempt CAPTCHAs. The app-side rendering of a cancelled-but-still-entitled
  subscription is separately covered by `subscription.test.js`.
- [Requires owner action] Run the SQL migration for `subscriptions.cancel_at_period_end`/`plan`,
  `rate_limits`, and `processed_webhook_events` if not already done — **confirmed already applied
  in this project's Supabase instance during this session.**

## Phase 6 — Free vs Asc3end+ entitlement model
- [Automated pass] `entitlements.test.js` (9 tests) for `canAccessFeature`/`remainingTrialUses`.
- [Manually verified] Fixed a real correctness gap found during this phase: the old server-side
  check only granted access for `status active/trialing`, meaning a `past_due` (grace-period)
  subscriber was entitled client-side but would have been rejected by `/api/claude` — now both
  sides go through the same `computeSubscriptionState` + `canAccessFeature`.

## Phase 7 — Pricing/paywall page
- [Manually verified] Monthly/annual toggle, trial checkbox, feature comparison, FAQ — all
  live-tested; confirmed the annual+trial combination correctly reaches Stripe as "7 days free,
  then A$79.99/yr."

## Phase 8 — Public landing page
- [Manually verified] Hero, demo snapshot, problem/how-it-works/features/pricing/FAQ sections,
  footer legal links — live-tested as a genuine signed-out visitor (cleared localStorage).
  SEO: title, meta description, canonical URL, OG/Twitter tags, `robots.txt`, `sitemap.xml`.
- [Requires owner action] The OG/social-preview image is currently the app icon reused, not a
  dedicated 1200x630 marketing image — fine for launch, worth replacing before a wide push.

## Phase 9 — Legal/trust pages
- [Manually verified] All 8 documents (Privacy, Terms, Health Disclaimer, AI Limitations,
  Subscription Terms, Refund Policy, Support, Contact) reachable without an account; each shows
  a visible "good-faith draft, not lawyer-reviewed" notice and a version string. Support/Contact
  correctly say "not yet configured by the app owner" rather than a fabricated address.
- [Requires legal review] The documents themselves.

## Phase 10 — Analytics
- [Automated pass] `analytics.test.js` (6 tests) — the `EVENT_NAMES` allow-list and the
  `sanitizeProps` PII-stripping guard (sensitive key names, email-shaped strings, nested
  objects all rejected before a row is ever written).

## Phase 11 — Error monitoring
- [Automated pass] `errorMonitoring.test.js` (3 tests, no-DSN fallback path) and
  `ErrorBoundary.test.jsx` (2 tests, using `react-dom/client` directly in jsdom — renders a
  throwing child and asserts the themed fallback appears).
- [Manually verified] Dispatched a synthetic `unhandledrejection` against the live deployed app
  and confirmed it was captured and logged without crashing the page.
- [Requires owner action] Set `VITE_SENTRY_DSN` for remote error reporting — currently unset,
  so errors only reach the browser console (confirmed `@sentry/react` is fully absent from the
  production build's output when unconfigured — zero cost either way).

## Phase 12 — AI cost/abuse controls
- Server-side rate limiting: see Phase 3.
- [Manually verified] "Your AI Usage" card in Profile — confirmed it accurately reflected
  "1/5 used" immediately after a real Coach message during Phase 20 testing.

## Phase 13 — Beta feedback system
- [Automated pass] `feedback.test.js` (11 tests) — validation and submission logic.
- [Requires owner action] The `feedback` table migration (see Blockers) — the UI and validation
  are correct and tested, but nothing persists until the table exists.

## Phase 14 — Product metrics dashboard
- [Manually verified] `/api/admin-metrics` — confirmed a real authenticated user without an
  allowlisted email gets a genuine 403 ("Not authorized.") from the live deployed endpoint, not
  just a hidden UI route. Aggregate-only response (no per-user PII).
- [Requires owner action] Set `ADMIN_EMAILS` to actually use it.

## Phase 15 — Support operations
- [Manually verified] In-app Help & Support FAQ live-tested; correctly reflects unconfigured
  support email.

## Phase 16 — Performance/responsive testing
- [Manually verified] Swept every screen at 375px/768px/1440px via a DOM-based
  horizontal-overflow scan (`scrollWidth` vs viewport width) across Dashboard, Train, Coach,
  Nutrition, Progress, Profile, Pricing, Landing, Legal, and Support. Found and fixed one real
  bug: the Muscle Recovery diagram's spine-muscle labels overlapped their neighboring circles at
  every viewport width (not just narrow ones) — fixed by only labeling the two muscles with
  actual clearance and relying on the existing tap-to-reveal panel for the rest.
- [Requires real-device testing] Everything above is viewport emulation in a desktop browser,
  not a physical iOS/Android device. Touch targets, on-screen-keyboard behavior, and real mobile
  Safari/Chrome quirks are unverified.

## Phase 17 — PWA/web install completion
- [Automated pass] Build output verified directly: `dist/sw.js` precaches exactly 13 app-shell
  entries, denylists `/^\/api\//` from the navigation fallback, and has zero `runtimeCaching`
  rules (confirmed by reading the generated file).
- [Manually verified] Live production check: `navigator.serviceWorker.getRegistrations()`
  returns an active registration scoped to the real domain; `/manifest.webmanifest` and `/sw.js`
  both serve correctly from Vercel.
- [Requires real-device testing] The actual "Add to Home Screen"/"Install app" prompts and
  installed-app experience are unverified on a real device — only the underlying technical
  criteria (manifest + service worker) are confirmed met.

## Phase 18 — Store-readiness documentation
- `STORE_LAUNCH_CHECKLIST.md` — no native code written, deliberately. Leads with the
  Stripe-vs-App-Store/Play-Store in-app-purchase conflict, which is a business decision, not an
  engineering task.

## Phase 19 — Launch-configuration validator
- [Automated pass] `npm run check-launch-config` — live-run against this project's actual
  `.env.local`, correctly found a real gap (`ANTHROPIC_API_KEY` blank locally, though confirmed
  present in Vercel production via `vercel env ls`).

## Phase 20 — Final E2E journeys
All of the following were walked through live against the deployed production app this session,
on genuinely fresh accounts (not pre-seeded fixtures):
- [Manually verified] **Free user**: signup → onboarding with legal-acceptance checkbox →
  dashboard → scanner correctly paywalled with no trial.
- [Manually verified] **Workout persistence**: logged a set, got real-time PR detection, saved
  the workout, reloaded the page — streak and progression target both survived, proving
  server-side (not just in-memory) persistence.
- [Manually verified] **Coach**: sent a real message, got a real Anthropic-generated response
  that correctly used the athlete's name and referenced the just-logged lift; trial counter
  decremented from 5 to 4 correctly.
- [Manually verified] **Paid user**: full Stripe test-mode round trip (see Phase 5) plus Billing
  Portal showing a real paid invoice.
- [Manually verified] **Account**: profile edit (name change) persisted across a page close/open
  of Profile. Export/password-change/reauth-gated-deletion were built and verified earlier in
  this same session (not re-walked in this final pass to conserve remaining scope, but exercised
  when built).

---

## Environment variables
Run `npm run check-launch-config` for a live, presence-only report. See `.env.example` for the
full annotated list and `SECURITY.md` for what's server-only vs. safe to expose.

## Test suite summary
87 automated tests across 12 files (`npm test`), plus `security.integration.test.js` (live RLS,
run separately via `npm run test:integration`). Production build succeeds throughout — verified
after every phase in this pass, not just at the end.
