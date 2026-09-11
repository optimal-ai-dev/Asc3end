# Security

This document describes Asc3end's actual security model as implemented in this codebase — not
aspirational policy. It's a companion to `README.md` (setup/SQL) and `LAUNCH_READINESS.md`
(the pass/fail launch checklist).

## Authentication model

- **Provider**: Supabase Auth (email + password). Asc3end never stores or hashes passwords
  itself — that's Supabase's job, not this app's.
- **Sessions**: Supabase issues a JWT access token + refresh token, held client-side by the
  Supabase JS SDK. Every `/api/*` route re-verifies the bearer token on every request via
  `supabaseAdmin.auth.getUser(token)` — the server never trusts a client-asserted user id.
- **Password reset**: `supabase.auth.resetPasswordForEmail` — returns the same generic response
  whether or not the email is registered (Supabase's own behavior; the app doesn't add or remove
  any distinction). The reset link signs the user into a temporary session that fires a
  `PASSWORD_RECOVERY` auth event; the app gates the whole UI behind a "set new password" screen in
  that state rather than exposing the rest of the account on the temporary session.
- **Account deletion re-authentication**: requires re-entering the current password
  (`supabase.auth.signInWithPassword`) immediately before the irreversible delete call, in
  addition to a type-DELETE confirmation.
- **Rate limiting on auth endpoints** (signup, login, password reset): provided by Supabase Auth
  itself at the platform level, not reimplemented in this codebase. Confirm current limits in the
  Supabase dashboard (Authentication → Rate Limits) before launch — defaults are meant for
  development, not necessarily production traffic.

## Authorization model

- **Row Level Security (RLS)** is enabled on every table that holds user data
  (`user_data`, `subscriptions`, `feature_usage`, `analytics_events`) — this is the real
  boundary, not anything client-side. Verified live in
  `src/lib/security.integration.test.js` (`npm run test:integration`) against the actual
  Supabase project, including the critical case: a user cannot self-grant premium by writing
  their own `subscriptions` row (only a SELECT policy exists for regular users; the Stripe
  webhook, using the service-role key, is the only writer).
- **Every `/api/*` route** re-derives the authenticated user from the bearer token and scopes
  every database operation to that user's own id — there is no endpoint that accepts a
  client-supplied user id for anything other than the authenticated caller's own.
- **Premium/entitlement checks are server-side**: `api/claude.js` checks `subscriptions.status`
  itself before proxying to Anthropic; the frontend's `isPremium` flag is display-only and can't
  unlock anything by itself (confirmed by the RLS tests above and by `api/claude.js` never
  trusting anything from the request body for this decision).
- **Rate limiting**: `lib/rateLimit.js` + the `rate_limits` table (see README.md for the SQL)
  enforces a per-user, per-endpoint fixed-window limit on `/api/claude` (20/min),
  `/api/create-checkout-session` (5/min), `/api/create-portal-session` (10/min), and
  `/api/delete-account` (3/min). Fails open (allows the request) if the rate-limit check itself
  errors, so a Postgres hiccup degrades to "temporarily unlimited," not "feature broken."
- **Anthropic proxy input validation**: `api/claude.js` only ever forwards a fixed model name, a
  capped `max_tokens` (≤4096), a bounded message-history length, and — if present — exactly the
  one `web_search` tool shape the app uses. This endpoint is reachable directly by anyone with a
  valid bearer token (not only through the app's frontend), so the request body can't be trusted
  as-is; validated server-side rather than relayed blind.
- **File uploads** (food scanner): downscaled client-side to ≤1024px/JPEG-0.8 before leaving the
  browser, with a 15MB hard cap and image-type check on the raw file; the server additionally caps
  total request body size (1.5MB) as defense in depth against a client that skips the downscale.

## Sensitive environment variables

Never commit real values for these (see `.env.example` for the full list with blanks). Names only:

| Variable | Exposure |
|---|---|
| `SUPABASE_SERVICE_ROLE_KEY` | Server-only. Bypasses RLS entirely — used only by `/api/*` routes and one-off `scripts/*.mjs`, never imported from anything under `src/`. |
| `STRIPE_SECRET_KEY` | Server-only. |
| `STRIPE_WEBHOOK_SECRET` | Server-only. Verifies webhook authenticity — see below. |
| `ANTHROPIC_API_KEY` | Server-only. |
| `VITE_SUPABASE_ANON_KEY` | Public by design — Supabase's anon key is meant to be shipped to the browser; RLS is the actual protection, not hiding this key. |
| `VITE_STRIPE_PUBLISHABLE_KEY` | Public by design. |

A grep-based check (`grep -rln "SUPABASE_SERVICE_ROLE_KEY\|STRIPE_SECRET_KEY\|ANTHROPIC_API_KEY" src/`)
returns nothing — confirmed none of the three server-only secrets are referenced anywhere under
`src/`, so none can end up in the client bundle.

## Webhook verification

`api/stripe-webhook.js`:
- Verifies the `Stripe-Signature` header against `STRIPE_WEBHOOK_SECRET` via
  `stripe.webhooks.constructEvent` before touching the payload at all — an unsigned or
  wrongly-signed request is rejected with 400 and never reaches the handler logic.
- **Idempotent**: every event id is inserted into `processed_webhook_events` (primary key on
  `event_id`) before processing; a redelivery of the same event (Stripe retries on slow responses)
  is detected via the primary-key conflict and short-circuited instead of reprocessed.
- Only ever writes `subscriptions` rows tagged with the `supabase_user_id` from the event's own
  metadata (set when the Checkout Session/Customer was created) — never trusts anything else in
  the payload to determine which app user a billing event belongs to.

## Dependency vulnerability review

`npm audit --omit=dev`: **0 vulnerabilities** in production dependencies. `npm audit` (including
dev dependencies) currently reports 5 (3 moderate, 1 high, 1 critical) — all in `vite`/`vitest`/
`esbuild`/`vite-node`, the dev-time build/test tooling, none of which ship in the production
build (`npm run build`'s output is static files + the untouched `/api` serverless functions) or
run in the deployed app. Worth upgrading when convenient, not launch-blocking.

## Data retention

- **Export**: available any time from Profile & Settings — profile, workouts, nutrition,
  bodyweight, and custom exercises as a downloaded JSON file.
- **Deletion**: `api/delete-account.js` deletes `user_data`, `subscriptions`, `feature_usage`, and
  `analytics_events` rows for the user, then deletes the Supabase Auth user itself. This is a hard
  delete, not anonymization — there is no retention window or soft-delete/undo period currently
  implemented. If a different retention policy is required (e.g. a grace period, or retaining
  anonymized analytics), that needs an explicit product decision before launch, not just a code
  change.
- Stripe retains its own billing/customer records per Stripe's standard retention — deleting an
  Asc3end account does not delete the corresponding Stripe customer/subscription object; consider
  whether that needs to be cancelled/deleted separately as part of the deletion flow.

## Security reporting contact

`[INSERT SECURITY CONTACT EMAIL]` — not yet configured. Add a real monitored address (or a
security.txt) before launch; a placeholder like this must not go live in production copy (see
`LAUNCH_READINESS.md`).
