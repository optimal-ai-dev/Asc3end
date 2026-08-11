# Asc3end — standalone app scaffold

This is a real Vite + React project, not an artifact. It's set up but not finished — a few concrete
tasks remain before it's live. Hand this whole folder to Claude Code (or a developer) with this list.

## What's already here
- `package.json`, `vite.config.js`, `index.html` — a working Vite project shell
- `src/App.jsx` — your current Asc3end app code, copied in as-is (still artifact-flavored, needs porting — see below)
- `src/lib/supabase.js` — Supabase client setup
- `src/lib/storage.js` — replaces `window.storage` with a real per-user Supabase table (same method shape: `.get()`/`.set()`/`.delete()`)
- `src/AuthScreen.jsx` — bare-bones login/signup screen using Supabase Auth (needs real styling to match the app)
- `api/claude.js` — a Vercel serverless function that proxies Claude API calls, keeping your real API key server-side

## What's NOT done yet — the actual remaining work
1. **Port `App.jsx`**: replace every `window.storage.get/set` call with `storage.get/set` from `src/lib/storage.js`. Replace every direct `fetch("https://api.anthropic.com/v1/messages", ...)` call with `fetch("/api/claude", ...)` instead — same body shape, just a different URL, and no API key needed in the frontend anymore.
2. **Wire up auth**: `App.jsx` needs to check for a logged-in Supabase session on load, show `AuthScreen` if there isn't one, and show the app if there is. Supabase's `supabase.auth.onAuthStateChange()` is the standard way to do this.
3. **Style `AuthScreen.jsx`** to match the rest of the app's design system (it currently has zero styling — functional only).
4. **Create the Supabase project** at supabase.com, run the SQL in the comment at the top of `src/lib/storage.js` to create the `user_data` table, and fill in `.env.local` (copy from `.env.example`).
5. **Get an Anthropic API key** at console.anthropic.com, set it as `ANTHROPIC_API_KEY` in your Vercel project's environment variables (not in a committed file).
6. **Deploy**: push this repo to GitHub, connect it to Vercel, and it should build and deploy automatically (`npm run build` is already configured, and Vercel auto-detects the `/api` folder as serverless functions).
7. **Optional but worth doing early**: add simple per-user rate limiting in `api/claude.js` so one heavy user can't run up the whole app's API bill.

## Local development
```
npm install
cp .env.example .env.local   # then fill in real values
npm run dev
```
