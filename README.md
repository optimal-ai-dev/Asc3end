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

## Paywall
Free: workout logging, nutrition tracking (manual entry + quick add + AI macro estimate).
Premium ($9.99/mo): AI Coach, food scanner (photo/barcode), Meals Near You.

Gating happens in two places, both required — hiding a button in the UI alone would not stop
someone from calling the API directly:
- **Frontend**: `App.jsx` loads `isPremium` from the `subscriptions` table and passes it to
  `Coach`/`Nutrition`, which show a `Paywall` upsell in place of the gated feature.
- **Backend**: `api/claude.js` checks the caller's `subscriptions` row (via the service-role key)
  for any request tagged with a premium `feature` (`coach`, `scanner`, `meals`) before proxying to
  Anthropic — this is the actual enforcement.

## Optional
Add simple per-user rate limiting in `api/claude.js` so one heavy user can't run up the app's bill.
