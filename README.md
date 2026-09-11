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
  updated_at timestamptz default now()
);
alter table subscriptions enable row level security;
create policy "Users can read their own subscription" on subscriptions
  for select using (auth.uid() = user_id);
```

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
write never blocks a real user action. Instrumented at: `signup_completed`, `onboarding_completed`,
`plan_generated`, `plan_activated`, `workout_started`, `first_set_logged`, `workout_completed`,
`coach_message_sent`, `food_logged`, `paywall_viewed`, `subscription_started`.

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

## Optional
Add simple per-user rate limiting in `api/claude.js` so one heavy user can't run up the app's bill.
