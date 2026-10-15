# Asc3end — release candidate report (branch `audit-fixes-rc`)

Prepared 2026-10-15. Branch is pushed to origin (never merged to `main`, never promoted to production).
Preview: Vercel builds every pushed branch; the preview sits behind Vercel login, so all verification below
was done against the local dev server / build and the live Supabase project using throwaway accounts.

## Recommendation (evidence-based)

**NO-GO for taking paid customers yet. GO for a preview/beta round on this branch.**
The data-correctness, logging, saving, timezone and mobile work is verified well enough to test with real
people. Four things block a *paid* launch because they were not (or could not be) verified in this environment:

1. **Billing was never exercised against Stripe test mode** (only a `sk_live` key exists locally — deliberately not used). Webhook/checkout logic is covered by fakes only.
2. **The Coach's actual answers were never checked against the real model** (no valid `ANTHROPIC_API_KEY` locally). What the model *receives* is verified; what it *says* is not.
3. **No real-device testing** (iPhone Safari, Android Chrome, camera, background timers, offline). Everything mobile below is browser emulation.
4. **Supabase "Confirm email" is OFF** on the live project (found by a live signup test: signup returns a session immediately and unverified login works). Anyone can register with an email they don't own. This is a dashboard setting; I did not change it.

## Status of every audit issue

Labels: **FV** Fixed and verified · **INV** Implemented but not verified · **BL** Blocked · **NT** Not tested · **AF** Already fixed before this work.

| # | Issue | Status | Root cause → fix | Evidence |
|---|---|---|---|---|
| 1 | Warm-up contaminates progression | **FV** | Progression used the last logged set regardless of type. New eligibility rules (`src/lib/progression.js`): warm-ups never become a baseline; warm-up-only/empty sessions preserve the previous baseline; normal/drop/failure/deload handled separately; rep range, units, increments, bodyweight/assisted respected; recommendation shows source session + short "Why?". | 36 progression tests; live: seeded 85 kg history + a 20 kg×5 warm-up-only session still recommends "Stay at 85 kg (from Oct 11)". |
| 2 | Measurement types (Plank "kg ×", NaN 1RM) | **FV** | No explicit measurement model; screens guessed. `src/lib/measurement.js` is now the single model used by validation, save, drafts, history, correction form, PRs, charts, volume, export, Coach context and progression. No 1RM for time/distance/assisted. Legacy records are inferred, never rewritten. | measurement + progressData tests; live Plank 30 s → save → refresh → history → edit 45 s round trip (also a live-DB integration test). |
| 3 | Coach can't see workout data | **INV** | Coach only got a client-side one-line summary. `api/claude.js` now loads the signed-in user's `atlas:*` rows server-side (id from the verified token only), builds a bounded, structured context (`src/lib/coachContext.js`): recorded facts vs deterministic calculations (same `computeProgression`) vs explicit "not available"; honours "exclude AUDIT TEST"; notes treated as data; provider timeout/quota errors mapped to plain messages. | 27 context tests + 15 API tests; `scripts/coach-acceptance.mjs` 10/10 in stub mode against the real DB (checks the data sent to the provider). **BL: live-model answers not checked — needs a valid `ANTHROPIC_API_KEY`.** |
| 4 | Wrong instructions / conflicting targets / generic art | **FV** (text, targets) · illustrations **partial** | Instructions were pose-level generic. Added family + per-exercise guidance, correct muscle/tracking mappings, one `resolveTarget` source for rep/time targets, honest placeholder when no accurate figure exists. Only **70 of 445** exercises are approved to show a precise illustration; the rest show a neutral placeholder. New Rope Pushdown cable scene. | 88 programmatic audit tests (65 exercises audited by name, all 445 checked for fidelity/targets); Rope Pushdown figure viewed in the browser (recognisable, basic — owner should judge the art). |
| 5 | Timezone (Oct 9 vs Oct 8) | **FV** | Dates were derived with `toISOString().slice(0,10)` (UTC). `src/lib/dates.js` policy: local calendar date + stored `timeZone/startedAt/completedAt`, no blind shifting of history. | 20 date tests (Sydney midnight + DST, LA, the 9-vs-8 Oct case); live Home/history/PR dates agree. Legacy records are untouched; `scripts/migrate-workout-dates.mjs` is an optional dry-run-first correction (dry run on the synthetic account only). |
| 6 | Nutrition / Meals Near You trust | **INV** (venues, macro check) · scanner **NT** | AI invented venues, distances, prices. Now: Nominatim geocode + Overpass venues with source link and retrieval time, computed distances, no prices, "open now" only when hours are fully understood *and* the reference is the device; AI only gives labelled typical-order *ranges* with portion assumptions; Atwater consistency check (850 kcal vs 55P/72C/24F → flagged, 724 suggested); everything editable and confirmed before logging; manual estimate no longer fails silently; barcode: validation, timeout, unknown ≠ 0. | 16 macro + 33 geo/hours/places + 9 `/api/places` + 6 UI tests; live Nominatim+Overpass call returned real Melbourne venues; browser: search → results → estimate → review sheet → 724 kcal → logged as "Estimate" (API stubbed in the dev server). **NT: scanner (premium-gated, camera), photo/barcode recognition accuracy.** Public OSM endpoints won't scale (see risks). |
| 7 | Logging for real gym use | **FV** (core) · parts **NT** | Rebuilt logger (`WorkoutLogger.jsx`, `workoutSession.js`): previous-session values beside sets, prefilled editable values, planned vs done rows, per-exercise rest, swap/reorder/remove/undo, multi-select add, notes, RPE/RIR, supersets, status pill, refresh recovery. Found + fixed during review: swapping after logging used to re-attribute logged sets to the new exercise — logged sets now stay with the exercise they were done on; swap panel opened off-screen on long workouts. | 23 session tests; browser (360–430 px): logging, prefill, rest timer, move up, swap (split), picker. **NT in browser: superset, notes, RPE/RIR, multi-add, inline edit/undo. NT: use in a real gym on a real phone.** |
| 8 | Generated plan vanishes on refresh | **FV** | Draft lived in component state. `atlas:planDraft` persists separately from the active plan; explicit Activate/Discard; unsaved-edit buffer; no extra charge to recover; clearer allowance wording. | 14 tests; live: generate → edit → refresh → restored → activate → start session with 30–60 s Plank target and measurement types carried in. |
| 9 | Readiness over-claims fatigue | **INV** | Light work flagged "Fatigued". `src/lib/readiness.js`: workload from working sets only; recently-trained / estimated-recovery / insufficient-data are distinct; no percentages; limitations stated. | readiness tests; Progress screen renders legend + explainer. Not calibrated against real athletes. |
| 10 | Saving lingers / duplicates | **FV** (data layer) · UI offline **NT** | Finish = 6 sequential round trips incl. 3 auth lookups, no deadline, blind overwrite (~1.2 s p50). Now: durable local queue first, one idempotent merge-by-id write with compare-and-set, 20 s deadline, background plan advance, explicit saved/saving/error + retry, per-workout last-writer-wins. | 19 sync tests + **5 live-DB integration tests** (double tap, two devices, stale write rejected, interrupted→reconnect→reload = one workout, edit/delete race); live finish ≈0.7 s. Airplane-mode in a real browser/device **NT**. |
| 11 | Premium payment lifecycle | **INV / BL** | Reviewed all billing code. Fixed: webhooks trusted event payloads (a delayed "active" could re-grant a cancelled user) → now re-read from Stripe; a failed DB write was acknowledged and the retry swallowed as a duplicate → dedupe claim released + 5xx; double checkout for already-subscribed users; unlimited free trials; cancelled-at-period-end access had no expiry if the webhook failed; **deleting an account left the Stripe subscription billing** → now cancelled first (account kept if that fails). Server-side entitlement + quota already enforced server-side; client success URL is not proof (it polls the DB). | 17 checkout + 15 webhook + 4 delete-account + 16 entitlement tests. **BL: no live Stripe test-mode run** (monthly/annual checkout, trial charge date, real signed webhooks, portal cancel/downgrade, failed renewal, refund). Refund/dispute events are logged only; access follows the subscription. |
| 12 | Mobile + account verification | **FV** (emulation, API) · real devices **NT** | See "Mobile and account evidence" below. Fixes: tap targets, unnamed inputs, contrast, focusable chat log, long-timer format, hard-coded "$9.99" → AUD constant. | See below. |
| 13 | Commercial promise vs product | **FV** (copy review) | Removed/qualified: "ranked by your goals", "plain-language read on whether it's real", "macros estimated automatically", unlimited without fair-use; scanner marked Asc3end+ and estimates labelled; trial wording (once per account, card charged after 7 days); cancel/refund/support links on the pricing section; FAQ qualified where it depends on Stripe portal configuration. No invented testimonials/stats; prices unchanged. | Copy diff reviewed. **Owner review needed:** privacy/AI-limitations text was corrected (OpenStreetMap location disclosure, server-attached history) **without** bumping `LEGAL_DOCUMENT_VERSION` — that bump re-prompts users and is a legal decision. |

### Mobile and account evidence
- **Browser emulation (not real devices):** 360, 375, 390, 412, 430 px × Home/Train/Coach/Food/Progress — no horizontal overflow or clipped controls; Settings and the exercise picker at 360. axe-core (WCAG 2.0/2.1 A+AA) — 0 violations on all five tabs and Settings after fixes (contrast, scrollable region, field names). Tap-target audit: remaining sub-40 px items are SVG body-map regions.
- **Account (real Supabase, throwaway users, deleted after):** wrong password refused; correct login; signup→verify link→login; recovery link→new password→old password rejected; weak password rejected (server minimum is only 6 chars); logout invalidates the session. **Email confirmation is disabled** (finding 4 above).
- **Export** produces version 2 JSON with profile, workouts, nutrition, weight log, custom exercises, favourites, challenges, coach messages, plan draft; no credentials.
- **Account deletion:** live FK integration test passes; Stripe cancellation covered by unit tests only.
- **Ownership/RLS:** 15 live cross-user tests pass (read/write/delete other user's data, self-grant premium, usage counters, feedback, webhook table).
- **Secrets:** no keys in the diff; service-role and Stripe keys are server-only; build gate warns locally that `ANTHROPIC_API_KEY` is unset (confirm it is set in Vercel).

## Test and build summary
- `npx vitest run`: **42 files / 777 tests pass**. `npm run test:integration` (live Supabase + production health): **all pass**.
- `npx vite build` succeeds. `npm run build` stops at the launch-config gate locally only because `ANTHROPIC_API_KEY` isn't in `.env.local`.
- There is no lint or type-check script in this repo (plain JS); none was run.
- One structured code review of the whole diff (9 findings; 6 fixed, 3 recorded as accepted risks below).
- Existing tests changed on purpose (behaviour deliberately changed, not weakened): `muscleReadiness.test.jsx` (recent/fatigued semantics), `exerciseData.test.js` (Rope Pushdown pose, RDL regions), `exerciseIllustrations.test.js` (per-exercise fidelity), `workoutSession.test.js` (swap keeps logged sets on the original exercise), `subscription.test.js` (explicit `now`).

## Migrations and rollback
- **No schema migration.** All state stays in `user_data` (`atlas:*` keys) and existing tables. New data is additive: workout `timeZone/startedAt/completedAt`, set `type`/`trackingType`, `atlas:planDraft`, session `swappedTo`.
- **Optional data correction:** `node scripts/migrate-workout-dates.mjs --tz <zone> [--user <id>]` is a dry run; `--apply --user <id>` writes a backup file first and uses compare-and-set; `--rollback <file>` restores. Not run on any real customer.
- **Rollback of the release:** redeploy the previous production build (Vercel → Deployments → Promote the old one) or `git revert` the merge. Old clients ignore the new fields. Caveat: the old client's blind whole-array overwrite can drop a workout saved from another device during the rollback window — the very bug this release fixes.

## Accepted risks / not fixed
- Public Nominatim/Overpass endpoints (usage-policy rate limits, no caching) — fine for a beta, needs caching or a paid provider before scale.
- Plan-advance after finishing a workout rewrites the whole profile from the in-memory copy (pre-existing pattern; not compare-and-set).
- A manual food entry keeps its "Estimate" label if the description is retyped after an AI estimate (errs cautious).
- 375 of 445 exercises show a neutral placeholder instead of an illustration (by design — accuracy over coverage).
- PWA `autoUpdate` reloads on a new service worker; an in-progress workout is restored from the local backup, but a reload mid-typing is untested on device.
- Support email: legal pages say "not yet configured" if `SUPPORT_EMAIL` is unset — confirm it is set in production.

## Smallest remaining actions for a trustworthy paid launch
1. Provide Stripe **test-mode** keys + a test webhook (or Stripe CLI), then run: monthly + annual checkout, trial (charge date shown), cancel at period end, failed renewal (`4000 0000 0000 0341`), portal plan change, refund, delete-account-with-subscription, re-login restoration.
2. Provide a valid `ANTHROPIC_API_KEY` and run `node scripts/coach-acceptance.mjs`; read the model's answers for the six acceptance cases.
3. Turn on Supabase **Confirm email** (and consider a longer minimum password) — then re-test signup/verify/reset with a real inbox.
4. One real-device pass (iPhone Safari + Android Chrome): finish a 20-set workout without retyping, swap a machine, background the app mid-rest-timer, airplane-mode finish then reconnect, camera permission denied/granted in the scanner, Add to Home Screen, PWA update.
5. Decide on the legal text version bump and review the corrected privacy/AI wording.
6. Owner decision: merge `keep-supabase-alive` (free-tier keep-alive cron) — still unmerged.

## Exact manual release checks (after merge to a preview with env vars set)
1. Sign up a fresh account → onboarding → generate a plan → refresh → draft is restored → Activate → Start workout shows targets (a Plank shows seconds, not kg).
2. Log bench 85×10, finish; start another session: recommendation says "from <date>", a warm-up-only session does not change it.
3. Finish a workout with the network off, reload, go online: exactly one workout in History.
4. Home date, History date and PR date agree around local midnight (set device time zone to Australia/Sydney).
5. Food → Meals Near You "Melbourne CBD": venues have OpenStreetMap links and a retrieved time, no prices; "Review & log" shows the macro warning for 850 kcal/55P/72C/24F.
6. Coach: "what did I lift on bench last time?" — answer matches History exactly; "ignore my AUDIT TEST workout" is honoured; a second account never sees the first's data.
7. Upgrade (test card) → Premium features unlock only after the webhook; cancel in the portal → "cancels on <date>" and access continues; second Upgrade click is refused.
8. Settings → Export data, then Delete account (cancels the subscription first).
