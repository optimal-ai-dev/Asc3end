import { defineConfig } from "vite";
import react from "@vitejs/plugin-react";

// Standard Vite + React setup. `build` produces a static, pre-optimized bundle in /dist —
// this is what actually fixes the "loading too slow" complaint: a real production build served
// from a CDN (Vercel/Netlify) loads in a fraction of the time an interpreted artifact does.
export default defineConfig({
  plugins: [react()],
  build: {
    // Splits vendor code (React, Supabase, charts) into its own cacheable chunk so repeat
    // visits only re-download the small app-specific bundle, not everything every time.
    rollupOptions: {
      output: {
        manualChunks: {
          vendor: ["react", "react-dom"],
          charts: ["recharts"],
          supabase: ["@supabase/supabase-js"],
        },
      },
    },
  },
});
