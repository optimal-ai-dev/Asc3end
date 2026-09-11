import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. `build` produces a static, pre-optimized bundle in /dist —
// this is what actually fixes the "loading too slow" complaint: a real production build served
// from a CDN (Vercel/Netlify) loads in a fraction of the time an interpreted artifact does.
export default defineConfig({
  plugins: [react()],
  test: {
    environment: "jsdom",
    globals: true,
    include: ["src/**/*.test.js", "src/**/*.test.jsx"],
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
