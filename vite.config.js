import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";
import { VitePWA } from "vite-plugin-pwa";

// Standard Vite + React setup. `build` produces a static, pre-optimized bundle in /dist —
// this is what actually fixes the "loading too slow" complaint: a real production build served
// from a CDN (Vercel/Netlify) loads in a fraction of the time an interpreted artifact does.
export default defineConfig({
  plugins: [
    react(),
    // Generates and registers a real service worker (via Workbox) that precaches the built app
    // shell (JS/CSS/HTML/icons) — this, plus the manifest below, is what makes Chrome/Android
    // actually offer "Install app" instead of just bookmarking a tab (iOS Safari's Add to Home
    // Screen only needs the manifest + apple-touch-icon, both already in index.html).
    // Deliberately does NOT add any runtimeCaching rules: with none configured, the service
    // worker only ever intercepts precached static-asset requests, never /api/* or Supabase
    // calls — auth, billing, and AI responses always hit the real network, never a stale cache.
    VitePWA({
      registerType: "autoUpdate",
      manifest: {
        name: "Asc3end — Training & Nutrition",
        short_name: "Asc3end",
        description: "Track workouts, hit your macros, and get AI coaching to keep climbing toward your goal.",
        start_url: "/",
        display: "standalone",
        background_color: "#0A120E",
        theme_color: "#0A120E",
        icons: [
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "any" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "any" },
          { src: "/icon-192.png", sizes: "192x192", type: "image/png", purpose: "maskable" },
          { src: "/icon-512.png", sizes: "512x512", type: "image/png", purpose: "maskable" },
        ],
      },
      includeAssets: ["apple-touch-icon.png", "icon-32.png", "robots.txt"],
      workbox: {
        // App shell only — index.html falls back for any unmatched navigation (SPA routing),
        // never for /api/*, so an API 404/500 is never masked by a cached HTML page.
        navigateFallbackDenylist: [/^\/api\//],
      },
    }),
  ],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.js", "src/**/*.test.jsx", "lib/**/*.test.js"],
    // Integration tests hit the live Supabase project (real RLS policies, real throwaway users)
    // and need SUPABASE_SERVICE_ROLE_KEY — excluded from the default fast/offline `npm test` run,
    // run explicitly via `npm run test:integration`.
    exclude: ["**/node_modules/**", "**/*.integration.test.js"],
  },
  build: {
    // Splits vendor code (React, Supabase) into its own cacheable chunk so repeat visits only
    // re-download the small app-specific bundle, not everything every time. recharts is
    // deliberately NOT listed here — it's only reachable through Progress.jsx's dynamic
    // import(), and naming it as a manual chunk (as it was before) defeats that: Vite treats
    // manual chunks as shared vendor code and eagerly <link rel="modulepreload">s them on every
    // page load regardless of whether anything on that page actually needs them. Leaving it out
    // lets Vite's automatic code-splitting defer the ~525KB recharts bundle until someone
    // actually opens the Progress tab.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
