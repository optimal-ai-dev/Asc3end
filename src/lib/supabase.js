import { createClient } from "@supabase/supabase-js";

// Create a free project at https://supabase.com, then put these two values in a .env file
// (never commit real keys to git — use .env.local + .gitignore):
//   VITE_SUPABASE_URL=https://your-project.supabase.co
//   VITE_SUPABASE_ANON_KEY=your-anon-public-key
//
// The "anon" key is safe to expose in frontend code by design — Supabase enforces access
// with Row Level Security policies on the database side, not by hiding this key.
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;
const supabaseAnonKey = import.meta.env.VITE_SUPABASE_ANON_KEY;

export const supabase = createClient(supabaseUrl, supabaseAnonKey);
