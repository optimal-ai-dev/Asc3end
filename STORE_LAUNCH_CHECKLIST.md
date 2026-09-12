# Store Launch Checklist

This documents what it would take to get Asc3end into the Apple App Store and/or Google Play,
**as a checklist for a future decision** — no native app work has been done, and none is
recommended until the web app itself has real paying users and the business case for a store
listing is clear. Everything below is planning, not implementation.

Asc3end today is a installable Progressive Web App (PWA): a real web app manifest and a
Workbox-generated service worker (Phase 17), so Chrome/Android already offer "Install app" and
iOS Safari supports "Add to Home Screen." That is a legitimate, live alternative to a store
listing and costs nothing — it's worth explicitly deciding whether a store listing is even
necessary before spending money or engineering time on it.

## The billing problem — read this first

**This is the single biggest blocker to a native store listing, and it's a business decision, not
an engineering one.** Asc3end+ is billed through Stripe. If Asc3end is wrapped as a native iOS or
Android app that lets a user subscribe using Stripe directly inside the app, Apple's App Store
Review Guideline 3.1.1 (and Google Play's equivalent Payments policy) require digital
subscriptions to go through the platform's own in-app purchase system instead — Apple takes a
15-30% cut, Google similarly. This is not a technical limitation that a workaround fixes; both
platforms actively reject or remove apps that route digital-goods payments around their IAP.

Realistic options, none implemented:
1. **Web-only billing (the "Netflix model")**: the native app can't offer or even mention
   subscribing — users must sign up and pay at asc3end.vercel.app in a browser first, then use
   the native app once entitled. This is explicitly allowed by both stores (Apple calls this
   "reader apps" territory, though fitness apps don't automatically qualify — needs legal review
   of current guidelines before relying on it) but often hurts conversion.
2. **Add real native IAP** (StoreKit / Google Play Billing) alongside or instead of Stripe for
   the native builds, and reconcile entitlement across both — meaningfully more engineering work
   than anything else in this checklist, and doubles the subscription logic surface area.
3. **Stay web/PWA-only** and skip native store listings entirely.

Do not build a native wrapper before this is decided — it changes what the wrapper even needs to
do.

## Current PWA readiness (done)

- [x] Web app manifest (`vite-plugin-pwa`-generated `manifest.webmanifest`): name, icons (192/512,
  `any` + `maskable`), `display: standalone`, theme/background color.
- [x] Service worker registered in production, precaching the app shell (verified live).
- [x] App icons: 32/192/512px PNG + `apple-touch-icon.png` (existing `public/` assets).
- [x] HTTPS (Vercel default).
- [x] Legal pages (Privacy, Terms, Health Disclaimer, AI Limitations, Subscription Terms, Refund
  Policy, Support, Contact) reachable without an account — stores require a working privacy
  policy URL at minimum.

## If pursuing Google Play (Trusted Web Activity)

A TWA wraps the existing PWA with no native rewrite — the most realistic native option if the
billing question above is resolved in favor of web-only billing.

- [ ] Decide the billing approach (see above) before building anything.
- [ ] Google Play Developer account ($25 one-time) — **requires owner action**, real payment
  method and identity verification.
- [ ] Generate the Android package via [Bubblewrap](https://github.com/GoogleChromeLabs/bubblewrap)
  or [PWABuilder](https://www.pwabuilder.com/) pointed at the production URL.
- [ ] Host a Digital Asset Links file (`/.well-known/assetlinks.json`) proving domain ownership,
  signed with the Play app signing key.
- [ ] Store listing assets: app icon (512x512), feature graphic (1024x500), phone + tablet
  screenshots, short/long description, privacy policy URL (have it), content rating questionnaire
  (health/fitness — expect a "PEGI 3 / Everyone" style rating, but the questionnaire is
  authoritative, not this checklist).
- [ ] Data safety form (what data is collected: account email, workout/nutrition logs, payment
  status; who it's shared with: Anthropic for AI features, Stripe for billing) — **requires owner
  review**, this is a legal declaration to Google, not something to fill in from assumptions.

## If pursuing the Apple App Store

No PWA-to-App-Store path exists from Apple — a native wrapper (Capacitor, Cordova, or a bespoke
WebView shell) is the minimum, and Apple reviews wrapped-website apps more skeptically than
Google does (Guideline 4.2 "Minimum Functionality" — a bare WebView around a website is a common
rejection reason unless it adds real native capability: push notifications, native camera
integration for the food scanner instead of a web `<input capture>`, offline support, etc.).

- [ ] Decide the billing approach (see above) — this affects Guideline 3.1.1 compliance directly.
- [ ] Apple Developer Program membership ($99/year) — **requires owner action**.
- [ ] A Mac + Xcode to build and submit (or a cloud CI service that provides one) — not available
  in this environment.
- [ ] Wrap the app (Capacitor is the more actively maintained option as of this writing) and add
  enough native-feeling functionality to satisfy Guideline 4.2 — realistically a multi-week
  scoped project of its own, not a checklist item.
- [ ] App Store Connect listing: screenshots per required device size, description, keywords,
  support URL, privacy policy URL, App Privacy "nutrition label" (data types collected, linked to
  identity: email, workout/nutrition data, payment status).
- [ ] Age rating questionnaire, export compliance (uses HTTPS/standard encryption only — typically
  qualifies for the standard exemption, but confirm during submission, not from this note).

## Business details every store submission needs

These are the same "requires owner action" items already called out for legal pages
(`LEGAL_BUSINESS_NAME`, `LEGAL_BUSINESS_ABN`, `LEGAL_BUSINESS_ADDRESS` in `.env.example`) — both
stores require a real legal entity or individual name, a support contact, and (for paid apps or
IAP) tax/banking details for payout. None of this can be filled in on the app owner's behalf.

## What this checklist deliberately does not include

No native project scaffold, no Capacitor/Bubblewrap config, no store-specific code — none of that
should exist until the billing decision above is actually made, since it determines what the
wrapper needs to do. Building it speculatively would be exactly the kind of premature work this
project's own ground rules ask to avoid.
