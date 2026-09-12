// Server-safe application configuration — the one place server-side code (api/*.js, build-time
// checks) reads app-wide settings like the support address, instead of each file reaching into
// process.env directly with its own copy of the variable name. Mirrors src/lib/legal.js's
// SUPPORT_EMAIL (which reads the same VITE_SUPPORT_EMAIL var via import.meta.env for the browser
// bundle) — both ultimately point at one canonical env var, so the client and server can never
// disagree about what the support address is.
export const SUPPORT_EMAIL = process.env.VITE_SUPPORT_EMAIL || null;
