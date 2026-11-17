/* ------------------------------------------------------------------ */
/* Exercise demonstration clips                                        */
/* ------------------------------------------------------------------ */
// Licensed 3D exercise animations replace the hand-drawn SVG figures. The clips themselves are
// NOT in this repo (it is public, and the licence forbids redistributing the raw files): they are
// transcoded by scripts/build-exercise-media.mjs and uploaded to the public `exercise-media`
// bucket in Supabase Storage, which serves them from its CDN with a one-year immutable cache.
//
// src/data/exerciseMedia.json is the manifest that script writes: exercise id -> clip key. Several
// exercises can share one clip (e.g. "Weighted Pull-Up" and "Pull-Up"). An exercise with no entry
// keeps the existing fallback (SVG figure or "Demonstration coming soon"), so the app never shows a
// broken video.
import manifest from "../data/exerciseMedia.json";

const explicitBase = import.meta.env.VITE_EXERCISE_MEDIA_BASE;
const supabaseUrl = import.meta.env.VITE_SUPABASE_URL;

export const MEDIA_BASE = (explicitBase || (supabaseUrl ? `${supabaseUrl.replace(/\/$/, "")}/storage/v1/object/public/exercise-media` : "")).replace(/\/$/, "");

function currentTheme() {
  try {
    return document.documentElement.dataset.theme === "light" ? "light" : "dark";
  } catch {
    return "dark";
  }
}

/** Returns { mp4, webm, poster, thumb, alt } URLs for an exercise, or null when it has no clip.
 *  When the manifest is `themed`, each clip was re-coloured to the app's palette in a dark and a
 *  light variant, and the one matching the current theme is used. */
export function getExerciseMedia(ex, clips = manifest.clips, base = MEDIA_BASE, themed = manifest.themed, theme = currentTheme()) {
  if (!ex || !base) return null;
  const clip = clips[ex.id];
  if (!clip) return null;
  const key = themed ? `${clip}-${theme}` : clip;
  const v = manifest.version ? `?v=${manifest.version}` : "";
  return {
    mp4: `${base}/${key}.mp4${v}`,
    webm: `${base}/${key}.webm${v}`,
    poster: `${base}/${key}.webp${v}`,
    thumb: `${base}/${key}-thumb.webp${v}`,
    alt: `Animated demonstration of ${ex.name}, showing the full range of motion`,
  };
}

export const EXERCISE_MEDIA_COUNT = Object.keys(manifest.clips).length;
