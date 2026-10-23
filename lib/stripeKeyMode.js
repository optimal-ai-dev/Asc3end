// Tells test-mode Stripe keys from live-mode ones by their documented prefix (sk_test_/sk_live_,
// pk_test_/pk_live_, rk_test_/rk_live_ for restricted keys). Used by
// scripts/check-launch-config.mjs to catch the two ways a "switch to live mode" goes quietly
// wrong: production still running on test keys (checkout works, but no real money is ever
// collected), or the secret and publishable keys coming from different modes (checkout fails).
//
// Like validateSecretFormat.js, this never returns or logs a key — only which mode it's in.

/**
 * @param {string|undefined} value
 * @returns {"live" | "test" | "unknown" | null} null when unset
 */
export function stripeKeyMode(value) {
  if (!value) return null;
  const match = /^(?:sk|pk|rk)_(live|test)_/.exec(value.trim());
  return match ? match[1] : "unknown";
}

/**
 * @param {Record<string, string|undefined>} env
 * @param {{ isProduction: boolean }} options
 * @returns {{ secretMode: string|null, publishableMode: string|null, warnings: string[] }}
 */
export function checkStripeModes(env, { isProduction }) {
  const secretMode = stripeKeyMode(env.STRIPE_SECRET_KEY);
  const publishableMode = stripeKeyMode(env.VITE_STRIPE_PUBLISHABLE_KEY);
  const warnings = [];

  if (secretMode && publishableMode && secretMode !== "unknown" && publishableMode !== "unknown" && secretMode !== publishableMode) {
    warnings.push(`STRIPE_SECRET_KEY is a ${secretMode}-mode key but VITE_STRIPE_PUBLISHABLE_KEY is ${publishableMode}-mode — both must come from the same mode or checkout will fail.`);
  }
  if (isProduction && (secretMode === "test" || publishableMode === "test")) {
    warnings.push("Production is using Stripe TEST-mode keys — checkout appears to work but no real payment is ever collected. Swap in live keys, live price IDs, and the live webhook secret before taking real customers.");
  }
  if (secretMode === "unknown") warnings.push("STRIPE_SECRET_KEY doesn't start with sk_live_, sk_test_, rk_live_ or rk_test_.");
  if (publishableMode === "unknown") warnings.push("VITE_STRIPE_PUBLISHABLE_KEY doesn't start with pk_live_ or pk_test_.");

  return { secretMode, publishableMode, warnings };
}
