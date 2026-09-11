import { defineConfig } from "vite";

// Separate config for the live-Supabase integration test (src/lib/security.integration.test.js)
// so it's excluded from the default `npm test` run but still runnable on demand via
// `npm run test:integration` — the main vite.config.js's test.exclude keeps it out of the fast,
// credential-free default suite.
export default defineConfig({
  test: {
    environment: "node",
    globals: true,
    include: ["src/**/*.integration.test.js"],
    testTimeout: 30000,
    hookTimeout: 30000,
  },
});
