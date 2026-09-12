# Asc3end

A Vite + React fitness/nutrition app with Supabase auth + storage, a Claude-powered coach proxied
through a Vercel serverless function, and a Stripe subscription paywall.

## Stack
- `src/App.jsx` — the app itself
- `src/lib/supabase.js` / `src/lib/storage.js` — Supabase client + per-user key/value storage
- `src/AuthScreen.jsx` — login/signup
- `api/claude.js` — proxies Claude API calls (keeps the Anthropic key server-side, requires a
  signed-in user, and enforces the Premium paywall for gated features)
- `api/create-checkout-session.js` / `api/create-portal-session.js` / `api/stripe-webhook.js` —
  Stripe Checkout + Billing Portal + the webhook that actually activates/deactivates subscriptions
- `lib/stripe.js` / `lib/supabaseAdmin.js` — server-only helpers (never imported from `src/`)

## Local development
```
npm install
cp .env.example .env.local   # then fill in real values (see below)
npm run dev
```
Note: `npm run dev` (plain Vite) does **not** run the `/api` serverless functions — Coach, the food
scanner, and the Stripe endpoints will 404 locally. Use `vercel dev` (requires `vercel login`) to
exercise those, or just test against the deployed Vercel URL.

## One-time setup
1. **Supabase**: create a project, run the SQL below in the SQL Editor, and fill in
   `VITE_SUPABASE_URL` / `VITE_SUPABASE_ANON_KEY` / `SUPABASE_SERVICE_ROLE_KEY` in `.env.local`.
2. **Anthropic**: get a key at console.anthropic.com, set `ANTHROPIC_API_KEY`.
3. **Stripe**: set `STRIPE_SECRET_KEY` (test or live), then run `node scripts/setup-stripe.mjs` to
   create the Premium product/price and print `STRIPE_PRICE_ID` to add to your env. After deploying,
   create a webhook endpoint in the Stripe Dashboard (Developers > Webhooks) pointing at
   `https://<your-domain>/api/stripe-webhook`, subscribed to `checkout.session.completed`,
   `customer.subscription.created`, `customer.subscription.updated`, and
   `customer.subscription.deleted` — then copy its signing secret into `STRIPE_WEBHOOK_SECRET`.
4. **Deploy**: push to GitHub, import into Vercel, and set every variable from `.env.example` in
   the Vercel project's Environment Variables (Vercel auto-detects the `/api` folder).

### `user_data` table (per-user key/value storage)
```sql
create table user_data (
  user_id uuid references auth.users not null,
  key text not null,
  value jsonb not null,
  updated_at timestamptz default now(),
  primary key (user_id, key)
);
alter table user_data enable row level security;
create policy "Users manage their own data" on user_data
  for all using (auth.uid() = user_id);
```

### `subscriptions` table (Stripe billing state)
Only the webhook (using `SUPABASE_SERVICE_ROLE_KEY`, which bypasses RLS) ever writes to this table —
users can only read their own row, never set themselves as subscribed from the client.
```sql
create table subscriptions (
  user_id uuid references auth.users primary key,
  stripe_customer_id text,
  stripe_subscription_id text,
  status text not null default 'inactive',
  current_period_end timestamptz,
  cancel_at_period_end boolean not null default false,
  plan text,
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users can read their own subscription" on subscriptions
  for select using (auth.uid() = user_id);
```
If you already have this table from before `cancel_at_period_end`/`plan` existed, add them with:
```sql
alter table subscriptions add column if not exists cancel_at_period_end boolean not null default false;
alter table subscriptions add column if not exists plan text;
```
`cancel_at_period_end` and `plan` feed `src/lib/subscription.js`'s `computeSubscriptionState` — see
that file for the full authoritative entitlement model (free / demo / paid / loading / error) that
every premium-gated part of the app now derives from, instead of ad hoc `status === "active"`
checks scattered around.

### `feature_usage` table (free-trial counters)
Same pattern as `subscriptions` — only the server (via `SUPABASE_SERVICE_ROLE_KEY`) writes to this;
users can only read their own rows, so they can't reset their own trial count from the client.
```sql
create table feature_usage (
  user_id uuid references auth.users not null,
  feature text not null,
  count int not null default 0,
  updated_at timestamptz default now(),
  primary key (user_id, feature)
);
alter table feature_usage enable row level security;
create policy "Users can read their own usage" on feature_usage
  for select using (auth.uid() = user_id);
```

### `analytics_events` table (lightweight product analytics)
Written directly from the client — the RLS policy only allows a user to insert rows with their own
`user_id` (no update/delete/select policy, since nothing in-app reads these back). Query from the
Supabase SQL editor or a dashboard tool when you want to look at product usage.
```sql
create table analytics_events (
  id uuid primary key default gen_random_uuid(),
  user_id uuid references auth.users not null,
  name text not null,
  props jsonb not null default '{}',
  created_at timestamptz default now()
);
alter table analytics_events enable row level security;
create policy "Users can insert their own events" on analytics_events
  for insert with check (auth.uid() = user_id);
```
Logged from `src/lib/analytics.js`'s `logEvent(name, props)`, fire-and-forget so a failed or slow
write never blocks a real user action. `EVENT_NAMES` in that file is the authoritative, typed
catalog of every event the app emits and what props each carries — `logEvent()` silently no-ops
(dev-only console warning) on any name not in that set, and strips any prop that looks sensitive
(an email-shaped string, a key like `email`/`token`/`*name`, or a nested object) before the row
ever leaves the browser, so a future call site can't accidentally leak PII into analytics even by
mistake. Currently instrumented: `signup_completed`, `onboarding_completed`, `plan_generated`,
`plan_activated`, `plan_edited`, `workout_started`, `first_set_logged`, `workout_completed`,
`coach_message_sent`, `food_logged`, `paywall_viewed`, `checkout_started`, `checkout_failed`,
`subscription_activated`.

### `rate_limits` table + `increment_rate_limit` function (server-side rate limiting)
Only ever touched by API routes using `SUPABASE_SERVICE_ROLE_KEY` (via `lib/rateLimit.js`) — no
client policies, since nothing in the browser should read or write this. Fixed-window counters:
each `(user_id, endpoint, window_start)` triple is one row, incremented atomically by the RPC
function (a plain supabase-js `.upsert()` can't express "increment the existing value").
```sql
create table rate_limits (
  user_id uuid not null,
  endpoint text not null,
  window_start timestamptz not null,
  count int not null default 1,
  primary key (user_id, endpoint, window_start)
);
alter table rate_limits enable row level security;
-- no policies — service_role bypasses RLS entirely, and nothing else should touch this table.

create or replace function increment_rate_limit(p_user_id uuid, p_endpoint text, p_window_start timestamptz)
returns int
language plpgsql
security definer
as $$
declare
  new_count int;
begin
  insert into rate_limits (user_id, endpoint, window_start, count)
  values (p_user_id, p_endpoint, p_window_start, 1)
  on conflict (user_id, endpoint, window_start)
  do update set count = rate_limits.count + 1
  returning count into new_count;
  return new_count;
end;
$$;
```
Old rows are never automatically deleted — harmless (each is tiny, and window_start naturally
ages out of relevance), but if it ever matters, a scheduled `delete from rate_limits where
window_start < now() - interval '1 day'` is enough.

### `processed_webhook_events` table (Stripe webhook idempotency)
Stripe can and does redeliver the same event (retries on a slow response, network blips). Every
event id is inserted here before processing; a primary-key conflict means "already handled this
one" and the handler short-circuits instead of reprocessing.
```sql
create table processed_webhook_events (
  event_id text primary key,
  event_type text,
  processed_at timestamptz default now()
);
alter table processed_webhook_events enable row level security;
-- no policies — service_role only.
```

### `feedback` table (beta bug reports, feature requests, ratings)
Same trust model as `analytics_events`: users can insert their own rows and nothing else — no
select/update/delete policy, so feedback is admin-protected by construction (readable only via
the Supabase SQL editor or a future admin tool using the service-role key, never by any signed-in
user, including the one who submitted it).
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
Submitted from Profile > Send Feedback via `src/lib/feedback.js`'s `submitFeedback()`, which
validates type/length/rating client-side before writing (defense in depth — the same constraints
are enforced in the schema via the `check` clauses above). Query from the Supabase SQL editor:
`select * from feedback order by created_at desc;`.

## Admin metrics
`/api/admin-metrics` returns aggregate product metrics (user count, signups, subscriptions by
status, workouts completed, feedback counts) — authorized entirely server-side against
`ADMIN_EMAILS` (a comma-separated allowlist env var), not by the in-app view being hard to find.
Anyone whose verified Supabase auth email isn't on that list gets a 403, same as any other
privileged endpoint in this app. Leave `ADMIN_EMAILS` unset to disable the endpoint entirely.

View it by signing in with an allowlisted email and appending `?admin=1` to the app URL. There's
no nav-bar link to it on purpose (no reason to surface it to regular users), but that's a
convenience, not the security boundary — the server-side email check is.

## Paywall
Free: workout logging, nutrition tracking (manual entry + quick add + AI macro estimate).
Premium ($9.99/mo): unlimited AI Coach, the food scanner (photo/barcode), and Meals Near You.

Free trial: everyone gets `FREE_TRIAL_LIMIT` (5, set in `api/claude.js`) free uses each of the AI
Coach and Meals Near You before hitting the paywall — tracked per-user in `feature_usage`. The food
scanner has no free trial; it's Premium-only from the first use.

Gating happens in two places, both required — hiding a button in the UI alone would not stop
someone from calling the API directly:
- **Frontend**: `App.jsx` loads `isPremium` and `usage` (`{ coach, meals }` counts from `/api/usage`)
  and passes them to `Coach`/`Nutrition`, which show remaining free uses and swap in the `Paywall`
  once exhausted.
- **Backend**: `api/claude.js` is the real enforcement — it checks the caller's `subscriptions` row
  for `scanner` (always Premium), and checks + increments `feature_usage` for `coach`/`meals` (free
  up to the limit, then Premium) before proxying to Anthropic.

## Error monitoring
`src/lib/errorMonitoring.js` is a small Sentry-shaped abstraction (`initErrorMonitoring`,
`captureException`, `captureMessage`) — the rest of the app never imports `@sentry/react`
directly. With no `VITE_SENTRY_DSN` set, every call degrades to a console log and the app works
exactly as before; Rollup tree-shakes `@sentry/react` out of the build entirely in that case (it's
only ever reached via a dynamic `import()` behind an `if (dsn)` check), so a Sentry-free deploy
ships zero extra bytes for it. `ErrorBoundary.jsx` wraps the app in `main.jsx` and shows a themed
"Something went wrong — Reload" screen instead of a blank page on a render error; `main.jsx` also
wires `window.onerror`/`unhandledrejection` for errors outside React's render (event handlers,
async code) that a boundary can't catch.

**Important**: Vite inlines `import.meta.env.VITE_SENTRY_DSN` at *build* time, not runtime — adding
the env var in Vercel only takes effect starting from the next build/deploy after you add it, not
by itself.

## Optional
Add simple per-user rate limiting in `api/claude.js` so one heavy user can't run up the app's bill.
