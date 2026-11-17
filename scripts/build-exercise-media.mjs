#!/usr/bin/env node
// Turns a purchased exercise-animation library into small, fast web clips and (optionally)
// uploads them to Supabase Storage. Run locally; the licensed source files and the encoded output
// never go into git (this repo is public and the licence forbids redistributing the raw files).
//
//   1. Draft a mapping of our exercises to the library's files (fuzzy filename match):
//        node scripts/build-exercise-media.mjs suggest --src ~/Downloads/library
//      -> writes exercise-media-map.csv. Review it: fix wrong matches, blank out the `file`
//         column for any exercise with no good clip (it keeps its current fallback).
//
//   2. Encode every mapped clip and update src/data/exerciseMedia.json:
//        node scripts/build-exercise-media.mjs build --src ~/Downloads/library
//      -> .exercise-media/<key>.mp4 (H.264), .webm (VP9), .webp (poster), -thumb.webp
//
//      Add --recolor to also re-theme each clip to the app (dark + light variants).
//
//   3. Upload (needs SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY in the environment):
//        node scripts/build-exercise-media.mjs upload
//
// Needs ffmpeg on PATH. Each clip is cropped to a square, scaled to 480px, stripped of audio and
// encoded at ~100–250 KB, so the detail screen starts playing almost immediately on mobile data.
import { execFileSync } from "node:child_process";
import { existsSync, mkdirSync, readdirSync, readFileSync, rmSync, statSync, writeFileSync } from "node:fs";
import { basename, extname, join, relative, resolve } from "node:path";
import { EXERCISES } from "../src/exerciseData.js";

const ROOT = resolve(new URL("..", import.meta.url).pathname);
const MAP_FILE = join(ROOT, "exercise-media-map.csv");
const OUT_DIR = join(ROOT, ".exercise-media");
const MANIFEST = join(ROOT, "src/data/exerciseMedia.json");
const BUCKET = "exercise-media";
const SIZE = 480;
const THUMB = 96;
const VIDEO_EXT = new Set([".mp4", ".mov", ".m4v", ".webm", ".gif", ".mkv"]);

const [cmd, ...rest] = process.argv.slice(2);
const args = Object.fromEntries(
  rest.reduce((acc, a, i, all) => (a.startsWith("--") ? [...acc, [a.slice(2), all[i + 1] && !all[i + 1].startsWith("--") ? all[i + 1] : true]] : acc), []),
);

/* ---------------------------------------------------------------- */
/* Helpers                                                           */
/* ---------------------------------------------------------------- */

export function slug(s) {
  return s.toLowerCase().replace(/[()]/g, "").replace(/[^a-z0-9]+/g, "-").replace(/(^-|-$)/g, "");
}

const STOP = new Set(["the", "a", "with", "on", "of", "to", "and", "male", "female", "version", "hd", "4k", "2k", "1080p", "720p", "loop", "v2"]);
const SYN = { db: "dumbbell", bb: "barbell", kb: "kettlebell", pullup: "pull up", pushup: "push up", chinup: "chin up", ez: "ez", lever: "machine" };

export function tokens(s) {
  return s
    .toLowerCase()
    .replace(/\.[a-z0-9]+$/, "")
    .replace(/[-_()]/g, " ")
    .replace(/\b\d{2,}\b/g, " ")
    .split(/\s+/)
    .map((t) => SYN[t] || t)
    .join(" ")
    .split(/\s+/)
    .map((t) => t.replace(/s$/, ""))
    .filter((t) => t && !STOP.has(t));
}

/** Dice-style overlap between two token lists, 0..1. */
export function similarity(a, b) {
  const A = new Set(a), B = new Set(b);
  if (!A.size || !B.size) return 0;
  let hit = 0;
  for (const t of A) if (B.has(t)) hit++;
  return (2 * hit) / (A.size + B.size);
}

function walk(dir) {
  const out = [];
  for (const name of readdirSync(dir)) {
    const p = join(dir, name);
    if (statSync(p).isDirectory()) out.push(...walk(p));
    else if (VIDEO_EXT.has(extname(name).toLowerCase())) out.push(p);
  }
  return out;
}

function parseCsv(text) {
  return text
    .split(/\r?\n/)
    .slice(1)
    .filter(Boolean)
    .map((line) => {
      const cells = [];
      let cur = "", q = false;
      for (const ch of line) {
        if (ch === '"') q = !q;
        else if (ch === "," && !q) { cells.push(cur); cur = ""; }
        else cur += ch;
      }
      cells.push(cur);
      return cells;
    });
}

const csvCell = (s) => (/[",]/.test(s) ? `"${String(s).replace(/"/g, '""')}"` : s);

function ffmpeg(argv) {
  execFileSync("ffmpeg", ["-hide_banner", "-loglevel", "error", "-y", ...argv], { stdio: "inherit" });
}

function requireSrc() {
  if (!args.src || !existsSync(args.src)) {
    console.error("Pass --src <folder with the purchased clips>");
    process.exit(1);
  }
  return resolve(args.src);
}

/* ---------------------------------------------------------------- */
/* Commands                                                          */
/* ---------------------------------------------------------------- */

function suggest() {
  const src = requireSrc();
  const files = walk(src).map((p) => ({ path: relative(src, p), toks: tokens(basename(p)) }));
  console.log(`${files.length} clips found in ${src}`);
  const rows = [["exercise", "file", "score"]];
  let matched = 0;
  for (const ex of EXERCISES) {
    const et = tokens(ex.name);
    let best = null;
    for (const f of files) {
      const score = similarity(et, f.toks);
      if (!best || score > best.score) best = { ...f, score };
    }
    const ok = best && best.score >= 0.75;
    if (ok) matched++;
    rows.push([ex.name, ok ? best.path : "", best ? best.score.toFixed(2) : "0"]);
  }
  writeFileSync(MAP_FILE, rows.map((r) => r.map(csvCell).join(",")).join("\n") + "\n");
  console.log(`Draft mapping written to ${relative(ROOT, MAP_FILE)}: ${matched}/${EXERCISES.length} exercises matched (score >= 0.75).`);
  console.log("Review it before running `build`: low scores and blanks need a human eye.");
}

/** Encode one clip to mp4 + webm + poster + thumb at `out`.*. With a theme, every frame is passed
 *  through scripts/recolor-exercise-frame.py first (white background -> app surface, red muscle
 *  highlight -> app green). */
function encodeClip(input, out, theme) {
  // Pad (not crop) to a square on white so wide clips keep the whole body and bar path.
  const vf = `scale=${SIZE}:${SIZE}:force_original_aspect_ratio=decrease:flags=lanczos,pad=${SIZE}:${SIZE}:(ow-iw)/2:(oh-ih)/2:white,fps=24`;
  let src = ["-i", input, "-vf", vf];
  let tmp = null;
  if (theme) {
    tmp = `${out}.rgb`;
    ffmpeg(["-i", input, "-an", "-vf", vf, "-f", "rawvideo", "-pix_fmt", "rgb24", `${tmp}.in`]);
    const recoloured = execFileSync("python3", ["-I", join(ROOT, "scripts/recolor-exercise-frame.py"), String(SIZE), String(SIZE), theme], {
      input: readFileSync(`${tmp}.in`), maxBuffer: 1 << 30,
    });
    writeFileSync(tmp, recoloured);
    src = ["-f", "rawvideo", "-pix_fmt", "rgb24", "-s", `${SIZE}x${SIZE}`, "-r", "24", "-i", tmp];
  }
  ffmpeg([...src, "-an", "-pix_fmt", "yuv420p", "-c:v", "libx264", "-profile:v", "main", "-crf", "28", "-preset", "slow", "-movflags", "+faststart", `${out}.mp4`]);
  ffmpeg([...src, "-an", "-pix_fmt", "yuv420p", "-c:v", "libvpx-vp9", "-b:v", "0", "-crf", "40", "-row-mt", "1", `${out}.webm`]);
  if (tmp) { rmSync(tmp, { force: true }); rmSync(`${tmp}.in`, { force: true }); }
  // Poster from ~40% through the rep, so the still shows the working position.
  const dur = Number(execFileSync("ffprobe", ["-v", "error", "-show_entries", "format=duration", "-of", "csv=p=0", `${out}.mp4`]).toString().trim()) || 1;
  const at = (dur * 0.4).toFixed(2);
  ffmpeg(["-ss", at, "-i", `${out}.mp4`, "-frames:v", "1", "-c:v", "libwebp", "-quality", "80", `${out}.webp`]);
  ffmpeg(["-ss", at, "-i", `${out}.mp4`, "-frames:v", "1", "-vf", `scale=${THUMB}:${THUMB}`, "-c:v", "libwebp", "-quality", "75", `${out}-thumb.webp`]);
  const kb = (f) => Math.round(statSync(f).size / 1024);
  console.log(`✓ ${basename(out)}  mp4 ${kb(`${out}.mp4`)} KB, webm ${kb(`${out}.webm`)} KB`);
}

function build() {
  const src = requireSrc();
  if (!existsSync(MAP_FILE)) {
    console.error(`No ${basename(MAP_FILE)} yet. Run \`suggest\` first.`);
    process.exit(1);
  }
  mkdirSync(OUT_DIR, { recursive: true });
  const byName = new Map(EXERCISES.map((e) => [e.name, e]));
  const clips = {};
  const encoded = new Map(); // source file -> key, so shared clips are encoded once
  const unknown = [];
  for (const [name, file] of parseCsv(readFileSync(MAP_FILE, "utf8"))) {
    if (!file) continue;
    const ex = byName.get(name);
    if (!ex) { unknown.push(name); continue; }
    const input = join(src, file);
    if (!existsSync(input)) { console.warn(`! missing source for ${name}: ${file}`); continue; }
    let key = encoded.get(file);
    if (!key) {
      key = slug(basename(file, extname(file)));
      const base = join(OUT_DIR, key);
      const variants = args.recolor ? ["dark", "light"] : [null];
      for (const theme of variants) {
        const out = theme ? `${base}-${theme}` : base;
        if (!existsSync(`${out}.mp4`) || args.force) encodeClip(input, out, theme);
      }
      encoded.set(file, key);
    }
    clips[ex.id] = key;
  }
  if (unknown.length) console.warn(`! ${unknown.length} rows name no known exercise: ${unknown.join(", ")}`);
  const manifest = {
    version: Math.floor(Date.now() / 1000),
    source: args.source || JSON.parse(readFileSync(MANIFEST, "utf8")).source || null,
    // themed: every clip exists as <key>-dark and <key>-light, re-coloured to the app's palette
    themed: Boolean(args.recolor),
    clips: Object.fromEntries(Object.entries(clips).sort()),
  };
  writeFileSync(MANIFEST, JSON.stringify(manifest, null, 2) + "\n");
  console.log(`\n${Object.keys(clips).length}/${EXERCISES.length} exercises now have a clip (${encoded.size} unique clips). Manifest: ${relative(ROOT, MANIFEST)}`);
}

async function upload() {
  const url = process.env.SUPABASE_URL || process.env.VITE_SUPABASE_URL;
  const key = process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!url || !key) {
    console.error("Set SUPABASE_URL and SUPABASE_SERVICE_ROLE_KEY to upload.");
    process.exit(1);
  }
  const { createClient } = await import("@supabase/supabase-js");
  const sb = createClient(url, key, { auth: { persistSession: false } });
  const { data: buckets } = await sb.storage.listBuckets();
  if (!buckets?.some((b) => b.name === BUCKET)) {
    const { error } = await sb.storage.createBucket(BUCKET, { public: true, allowedMimeTypes: ["video/mp4", "video/webm", "image/webp"] });
    if (error) throw error;
    console.log(`Created public bucket "${BUCKET}"`);
  }
  const types = { ".mp4": "video/mp4", ".webm": "video/webm", ".webp": "image/webp" };
  const files = readdirSync(OUT_DIR).filter((f) => types[extname(f)]);
  let n = 0;
  for (const f of files) {
    const { error } = await sb.storage.from(BUCKET).upload(f, readFileSync(join(OUT_DIR, f)), {
      contentType: types[extname(f)],
      cacheControl: "31536000",
      upsert: true,
    });
    if (error) console.warn(`! ${f}: ${error.message}`);
    else n++;
  }
  console.log(`Uploaded ${n}/${files.length} files to ${BUCKET}.`);
}

const commands = { suggest, build, upload };
if (import.meta.url === `file://${process.argv[1]}`) {
  if (!commands[cmd]) {
    console.error("Usage: build-exercise-media.mjs <suggest|build|upload> [--src dir] [--force] [--source 'Library name']");
    process.exit(1);
  }
  await commands[cmd]();
}
