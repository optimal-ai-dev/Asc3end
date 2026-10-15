// Optional, OWNER-RUN data correction for legacy workouts whose `date` was produced by the old
// `toISOString().slice(0, 10)` (the UTC date), which can be a day behind the athlete's local date.
//
// NOTHING is changed by default. The app itself never rewrites legacy dates (see src/lib/dates.js).
//
//   node scripts/migrate-workout-dates.mjs --tz Australia/Sydney                 # dry run, all users
//   node scripts/migrate-workout-dates.mjs --tz Australia/Sydney --user <uuid>    # dry run, one user
//   node scripts/migrate-workout-dates.mjs --tz Australia/Sydney --user <uuid> --apply
//   node scripts/migrate-workout-dates.mjs --rollback backups/workout-dates-<uuid>-<ts>.json
//
// A workout is a *provable* case only if: it has no stored timeZone (written before the policy), it
// has a real `startedAt` instant, its stored date equals the UTC date of that instant, and the local
// date in --tz differs. Anything else (no startedAt, date-only records, dates that already match) is
// left alone and reported as "not provable". The timezone of a legacy record was never stored, so the
// owner must supply the right one per run — apply it only for users you know are in that zone.
//
// --apply writes a full backup of the user's workouts row first and only then updates through a
// compare-and-set on updated_at (the same mechanism the app uses), so a concurrent save can't be lost.
// --rollback restores the backed-up row (again compare-and-set: it refuses if the row changed since).
import { createClient } from "@supabase/supabase-js";
import fs from "fs";
import path from "path";
import { localDateString, isDateString, legacyUtcDateMismatch } from "../src/lib/dates.js";

const args = process.argv.slice(2);
const flag = (n) => args.includes(`--${n}`);
const opt = (n) => { const i = args.indexOf(`--${n}`); return i >= 0 ? args[i + 1] : null; };

const env = Object.fromEntries(
  fs.readFileSync(".env.local", "utf8").split("\n").filter((l) => l.includes("=") && !l.trim().startsWith("#"))
    .map((l) => { const i = l.indexOf("="); return [l.slice(0, i).trim(), l.slice(i + 1).trim()]; })
);
const admin = createClient(env.VITE_SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { autoRefreshToken: false, persistSession: false } });
const KEY = "atlas:workouts";

async function rollback(file) {
  const backup = JSON.parse(fs.readFileSync(file, "utf8"));
  const { data: row } = await admin.from("user_data").select("updated_at").eq("user_id", backup.userId).eq("key", KEY).maybeSingle();
  if (!row) { console.error("Row no longer exists — refusing to recreate it automatically."); process.exit(1); }
  if (row.updated_at !== backup.appliedUpdatedAt) { console.error("The workouts row has changed since the migration was applied. Refusing to overwrite newer data; restore manually from the backup file."); process.exit(1); }
  const { data, error } = await admin.from("user_data").update({ value: backup.originalValue, updated_at: new Date().toISOString() }).eq("user_id", backup.userId).eq("key", KEY).eq("updated_at", backup.appliedUpdatedAt).select("updated_at");
  if (error || !data?.length) { console.error("Rollback failed", error?.message || "conflict"); process.exit(1); }
  console.log(`Rolled back ${backup.changed.length} workout date(s) for ${backup.userId}.`);
}

async function main() {
  if (opt("rollback")) return rollback(opt("rollback"));
  const tz = opt("tz");
  if (!tz) { console.error("--tz <IANA timezone> is required (e.g. Australia/Sydney)."); process.exit(1); }
  try { new Intl.DateTimeFormat("en-US", { timeZone: tz }); } catch { console.error("Unknown timezone:", tz); process.exit(1); }
  const apply = flag("apply");
  const only = opt("user");
  if (apply && !only) { console.error("--apply requires --user <uuid> (one account at a time)."); process.exit(1); }

  let q = admin.from("user_data").select("user_id, value, updated_at").eq("key", KEY);
  if (only) q = q.eq("user_id", only);
  const { data: rows, error } = await q;
  if (error) { console.error(error.message); process.exit(1); }

  let provable = 0, notProvable = 0, scanned = 0;
  for (const row of rows) {
    const list = Array.isArray(row.value) ? row.value : [];
    const changes = [];
    for (const w of list) {
      scanned++;
      const m = legacyUtcDateMismatch(w, tz);
      if (m) changes.push({ id: w.id, from: m.stored, to: m.local });
      else if (!w?.timeZone && !isDateString(w?.date)) notProvable++;
    }
    if (!changes.length) continue;
    provable += changes.length;
    console.log(`user ${row.user_id}: ${changes.length} provable legacy date(s) of ${list.length} workouts`);
    for (const c of changes.slice(0, 20)) console.log(`   ${c.id}: ${c.from} -> ${c.to}`);
    if (!apply) continue;

    fs.mkdirSync("backups", { recursive: true });
    const byId = new Map(changes.map((c) => [c.id, c.to]));
    const next = list.map((w) => (byId.has(w.id) ? { ...w, date: byId.get(w.id), dateCorrectedFrom: w.date, timeZone: tz } : w));
    const appliedAt = new Date().toISOString();
    // The backup is written BEFORE the row is touched, so a crash can never leave a changed row without one.
    const file = path.join("backups", `workout-dates-${row.user_id}-${Date.now()}.json`);
    fs.writeFileSync(file, JSON.stringify({ userId: row.user_id, tz, appliedUpdatedAt: appliedAt, changed: changes, originalValue: list }, null, 2));
    const { data, error: upErr } = await admin.from("user_data").update({ value: next, updated_at: appliedAt }).eq("user_id", row.user_id).eq("key", KEY).eq("updated_at", row.updated_at).select("updated_at");
    if (upErr || !data?.length) { fs.unlinkSync(file); console.error("Skipped: the row changed while migrating (or write failed). Nothing was modified. Re-run."); continue; }
    console.log(`   applied. Backup + rollback file: ${file}`);

  }
  console.log(`
${apply ? "APPLIED" : "DRY RUN (nothing changed)"} — scanned ${scanned} workouts, ${provable} provable legacy date(s), ${notProvable} not provable (left alone).`);
}
main();
