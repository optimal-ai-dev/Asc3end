# Competitive-Landscape Audit: Exercise Catalogue Coverage

**Prepared for:** Asc3end exercise library expansion (~223 → 450-600 exercises)
**Access date for all sources:** 2026-09-15
**Method:** Public marketing pages, help-center/support docs, app store listings, public blog posts, and the wger open-source project's public REST API (`https://wger.de/api/v2/`). No login, paywall bypass, private API access, or wholesale copying was performed. No proprietary exercise descriptions, cues, or media were reproduced — only counts, category names, and the existence/absence of well-known exercise names, which are generic terms not owned by any vendor.

## Important caveat up front

**None of the commercial apps below expose a full, browsable list of their entire in-app exercise database on the public web.** Every count in this report is a *claim* the company makes on a marketing page, help article, or app-store listing — not something independently verified against a complete list. Where a review site or the company's own pages let me confirm specific named exercises exist, I've noted that as "confirmed present" via a specific URL; everything else is "claimed" or "could not verify." I have flagged every such limitation per app.

---

## 1. Hevy

| Field | Finding |
|---|---|
| Claimed catalogue size | "400+ high-quality exercises" |
| Muscle filters | Not enumerated publicly; help docs say filtering is available "by muscle targets" but no full list published |
| Equipment filters | Barbell, weight plates, dumbbells, kettlebells, gym machines, resistance bands, suspension kits, bodyweight (per feature page) |
| Custom exercises | **Yes.** Free accounts: up to 7 custom exercises. Pro: unlimited. Can also duplicate an existing library exercise into a custom one. |
| Logging types | Not explicitly enumerated on public pages beyond "exercise type" field when creating custom exercises (implies multiple types exist, e.g. weight+reps vs. bodyweight) |
| Notable exercises confirmed present via public how-to pages | Hack Squat, Chest Dip, Barbell Triceps Extension (skull-crusher family), Weighted Push-ups, Plate Press, Push Press, Decline DB Bench Press |
| Notable exercises not confirmed (absence not proven) | JM press, Tate press, farmer's carry, sled push, pendulum squat, belt squat, ski erg, Nordic curl, tibialis raise, Meadows row, seal row — no dedicated public how-to page found for these via search, but this only means Hevy hasn't published a marketing article on them, not that the app lacks the exercise |
| Sources | [Hevy Exercise Library Help Article](https://help.hevyapp.com/hc/en-us/articles/35688251991575-Hevy-Exercise-Library-400-Exercises-and-Custom-Exercises), [Exercise Library feature page](https://www.hevyapp.com/features/exercise-library/), [Custom Exercises feature page](https://www.hevyapp.com/features/custom-exercises/), individual how-to pages e.g. [Hack Squat](https://www.hevyapp.com/exercises/how-to-hack-squat/), [Chest Dip](https://www.hevyapp.com/exercises/how-to-chest-dip/) |
| Limitation | Full in-app catalogue is not publicly browsable outside the app; public how-to pages appear to cover only a marketing subset, so absence of a public page ≠ absence in-app |

## 2. Strong (Strong App)

| Field | Finding |
|---|---|
| Claimed catalogue size | "Over 200 built-in exercises" (one source); another source claims "over 300 exercises with instructions and animations" — sources disagree, so treat as ~200–300 |
| Muscle filters | Could not verify a published list |
| Equipment filters | Could not verify a published list |
| Custom exercises | **Yes.** Created via the Exercises tab ("New" on iOS, "Create Exercise" on Android), including during a live workout. Can create custom categories. v6.1.0 added ability to rename custom exercises. |
| Logging types | App Store listing confirms: Weight+Reps, Bodyweight (including "Assisted Bodyweight"), Duration-based, and user-defined custom types |
| Notable exercise families possibly missing vs. Asc3end gap list | Could not verify — no public exercise-by-exercise list found |
| Sources | [Strong Help Center – Create Custom Exercises](https://help.strongapp.io/article/97-create-custom-exercises), [Strong Help Center – Exercise Detail Screen](https://help.strongapp.io/article/237-about-exercise-detail), [App Store listing](https://apps.apple.com/us/app/strong-workout-tracker-gym-log/id464254577) |
| Limitation | Strong's help center does not publish its exercise list, muscle taxonomy, or equipment taxonomy anywhere public; count is inconsistent across secondary sources and could not be confirmed from Strong's own pages |

## 3. JEFIT

| Field | Finding |
|---|---|
| Claimed catalogue size | "1,400+ exercises" is JEFIT's standard marketing claim; the live public exercise-database web page itself reports **"1294 EXERCISES FOUND"**; some newer landing-page copy references "1,500+" — treat true figure as ~1,300–1,500 depending on page/date |
| Muscle filters (confirmed live on jefit.com) | Abs, Back, Biceps, Cardio, Chest, Forearms, Glutes, Shoulders, Triceps, Upper Legs, Lower Legs |
| Equipment filters (confirmed live on jefit.com) | Body Weight, Bands, Barbell, Bench, Dumbbell, Exercise Ball, EZ Curl Bar, Kettlebell, Cardio Machine, Strength Machine, Pullup Bar, Weight Plate |
| Custom exercises | **Yes.** Via Exercises tab → muscle group → "Custom" → "Create Custom Exercise"; you set name, "record type" (logging type), and muscles used; photo/image upload requires Elite subscription |
| Logging types | Confirmed a "record type" field exists at custom-exercise creation (implies multiple logging types), exact enumerated list not published |
| Notable gap-list items | JEFIT's public exercise database (jefit.com/exercises) is browsable and searchable — this is the single best public source among competitors for checking specific movement names since it's a live, indexed catalogue page rather than a marketing claim |
| Sources | [JEFIT Exercise Database](https://www.jefit.com/exercises), [How to Add a Custom Exercise](https://www.jefit.com/blog/how-to-add-a-custom-exercise) |
| Limitation | The live count (1294) came from a general database landing page which may itself be a partial/paginated view; JEFIT's own marketing copy is inconsistent (1,400+ vs 1,500+) |

## 4. Fitbod

| Field | Finding |
|---|---|
| Claimed catalogue size | Sources disagree: Fitbod's own help docs say "over 1,000 unique exercises"; other pages/blog claim "1,500+"; a third claims "1,600+". Treat as roughly 1,000–1,600, genuinely unclear which is current. |
| Muscle filters | Could not verify a published complete list |
| Equipment filters | Confirmed concept: equipment is configured per "Gym Profile" (per-location equipment list) that gates which exercises are recommended; cable machines specifically confirmed as a selectable equipment type |
| Custom exercises | **Yes.** Custom exercises can select equipment from Fitbod's existing list, or be left blank for bodyweight; once created they behave like library exercises (can be added to workouts, saved workouts, history) |
| Logging types | Not fully enumerated in public docs beyond equipment-based vs. bodyweight distinction |
| Notable gap-list items | Could not verify specific presence/absence of triceps variants or the commercial-machine gap list |
| Sources | [Fitbod FAQs](https://fitbod.me/faqs/), [Fitbod Algorithm blog post](https://fitbod.me/blog/fitbod-algorithm/), Fitbod Help Center article on Custom Exercises (title confirmed via search: "Custom Exercises – Fitbod's Help Center", content page returned 403 to automated fetch) |
| Limitation | Fitbod's Zendesk help articles blocked automated fetching (403); relied on search-result summaries rather than full article text; exercise count is inconsistent across Fitbod's own pages |

## 5. StrengthLog

| Field | Finding |
|---|---|
| Claimed catalogue size | "500+ strength training, mobility, and cardio exercises" |
| Muscle filters (confirmed on public Exercise Directory) | Chest, Shoulders, Biceps, Triceps, Legs (Quads/Hamstrings/Glutes/Calves), Back/Lats/Trapezius, Abs/Obliques/Core, Forearms (Flexors & Extensors)/Grip, Neck, Cardio/Equipment |
| Equipment filters | Not exposed as discrete filter chips but exercises are organized/tagged by: Barbell, Dumbbell, Kettlebell, Cable, Smith Machine, Bodyweight/Resistance Bands, specialized equipment (medicine ball, rings, plates) |
| Custom exercises | **Yes.** "No restrictions on how many exercises you can create and add, even in the free version" |
| Logging types | Not separately enumerated but directory spans strength (weight+reps), bodyweight, mobility, and cardio |
| Notable gap-list items — **this is the strongest evidence source for the gap list** | Confirmed present on StrengthLog's public exercise/article pages: **Nordic Hamstring Curl**, **Copenhagen Plank** (dedicated how-to page), **Glute-Ham Raise**, **Tibialis Raise**, **Tate Press**, multiple **dip variations including assisted and bar dips**, **Tricep Pushdown With Bar/Rope**, **Barbell Lying Triceps Extension** (skull crusher family). **Seal Row and Meadows Row were NOT found** in a site-restricted search — likely absent or at least not prominent. |
| Sources | [StrengthLog Exercise Directory](https://www.strengthlog.com/exercise-directory/), [Copenhagen Plank guide](https://www.strengthlog.com/copenhagen-plank/), [Posterior Chain Exercises](https://www.strengthlog.com/posterior-chain-exercises/) |
| Limitation | Directory is public and browsable, which is unusual among competitors — but Seal Row/Meadows Row absence is based on search-index coverage, not a direct site search, so treat as "likely absent, not fully confirmed" |

**This is evidence that Nordic curl, Copenhagen plank, glute-ham raise, and tibialis raise are mainstream enough that at least one major competitor (StrengthLog) publicly documents them — supporting adding them to Asc3end.** Seal row and Meadows row appear to be a tier more niche (strength-coach/bodybuilding-culture specific) and may be lower priority.

## 6. Alpha Progression

| Field | Finding |
|---|---|
| Claimed catalogue size | "795 exercise videos" with all equipment enabled; drops to ~661 when equipment is deselected in a user's gym profile |
| Muscle filters | Confirmed concept: filterable by targeted muscles with per-exercise "muscle building and strength potential" scoring; full taxonomy not published |
| Equipment filters | Confirmed categories referenced: barbell, dumbbell, cable, machines, bodyweight, assisted, isolation exercise types; filterable by equipment, muscle, exercise type (cardio, stability, size), or custom |
| Custom exercises | **Yes.** Custom exercises can have an attached photo (own camera roll photo or a duplicated image from an existing AP exercise); appear in database, workouts, and plans. Exercises can also be duplicated to create variations. |
| Logging types | Not fully enumerated publicly |
| Notable feature | All 795 exercises reportedly have **real video demonstrations filmed in actual gyms** rather than animated models — a differentiator worth noting even though it's about media quality, not catalogue breadth |
| Sources | [Alpha Progression blog: "Which Workout App Has the Best Exercise Database"](https://alphaprogression.com/en/blog/best-workout-exercise-database) (self-published comparison, treat competitor claims cited within it as unverified secondhand), [Alpha Progression app review](https://www.hotelgyms.com/blog/alpha-progression-the-gym-logger-app-from-germany) |
| Limitation | Primary count source is Alpha Progression's own blog post, which also makes claims about *other* competitors' exercise counts (Fitbod "1,500+", JEFIT "1,400+", Hevy "400+") — those secondhand claims are noted here for context but were cross-checked independently above where possible |

## 7. Caliber

| Field | Finding |
|---|---|
| Claimed catalogue size | Sources disagree: Caliber's own marketing says "500+ exercises"; a review site claims "800+ exercises" in the free version. Treat as ~500–800, unclear which is authoritative. |
| Muscle filters | Confirmed to exist (filter by "muscle groups worked") but full list not published |
| Equipment filters | Confirmed to exist (filter by equipment) but full list not published |
| Custom exercises | **Yes.** Users can create and track custom exercises, including custom supersets, gated to certain subscription tiers for advanced features |
| Logging types | Not enumerated in public sources |
| Notable feature | Exercise library is described as "alphabetized and searchable," with full written instructions/tips per exercise; "Muscles Involved" is tappable for a bottom-sheet muscle-group breakdown |
| Sources | [BarBend Caliber Fitness App Review](https://barbend.com/caliber-fitness-app-review/), [Garage Gym Reviews Caliber App Review](https://www.garagegymreviews.com/caliber-app-review), [Caliber App Store listing](https://apps.apple.com/us/app/caliber-strength-training/id1482405410) |
| Limitation | No official Caliber page publishes an exercise count or category taxonomy directly; all counts come from third-party reviews and disagree with each other |

## 8. Boostcamp

| Field | Finding |
|---|---|
| Claimed catalogue size | "500+ exercises" per App Store description and secondary blog reference. Note: Boostcamp's own public marketing page at boostcamp.app/exercises is a curated "30 exercise guides" showcase page, not the full in-app database — do not confuse the two. |
| Muscle filters | Not published as discrete filter chips; muscle groups referenced across content include Quadriceps, Lats, Biceps, Abs, Middle Delts, Hamstrings, Chest, Glutes, Upper Back, Triceps |
| Equipment filters | Barbell, Dumbbell, Kettlebell, Machine, Bodyweight, Cable (per the exercise guide page) |
| Custom exercises | **Yes.** Program builder supports custom exercises, supersets, drop sets, warmup templates, and training-max waves, available on free accounts |
| Logging types | Not enumerated |
| Notable gap-list items | On the public 30-exercise showcase page, none of Nordic curl, Copenhagen plank, glute-ham raise, seal row, Meadows row, tibialis raise, sled push/pull, farmer's carry, or ski erg appear — but this is a small curated marketing subset, so this is **not evidence of absence** in the full in-app library, only that Boostcamp doesn't feature them in its top marketing content |
| Sources | [Boostcamp Exercise Library page](https://www.boostcamp.app/exercises), [Boostcamp App Store listing](https://apps.apple.com/us/app/boostcamp-workout-programs/id1529354455), [Free Workout App page](https://www.boostcamp.app/free-workout-app) |
| Limitation | Boostcamp's core value proposition is workout **programs** (11,000+), not a browsable exercise database; the exercise-count claim is thin and the public showcase page covers only 30 of the claimed 500+ |

## 9. MuscleWiki

| Field | Finding |
|---|---|
| Claimed catalogue size | "1,900+ exercises with 7,700+ video demonstrations" (per API docs/marketing); app listing separately claims "1,600+ exercises" — discrepancy noted |
| Muscle filters | Marketing claims filtering "across 45 muscle groups" with an interactive body map; the full 45-muscle taxonomy is not published — the API's `/muscles` endpoint would list it but requires an API key |
| Equipment filters | Confirmed to exist (filterable by equipment) via API docs, e.g. example categories "Barbell," "Dumbbell," "Bodyweight" shown, full list gated behind `/categories` endpoint requiring auth |
| Custom exercises | **Unclear/could not verify.** MuscleWiki markets itself primarily as an exercise reference/database + AI-generated workout builder + workout logger; no public documentation confirms user-created custom exercises the way Hevy/Strong/JEFIT do |
| Logging types | Confirmed classification attributes exist per exercise: Difficulty (Novice/Beginner/Intermediate/Advanced), Force type (Push/Pull/Static), Mechanic (Isolation/Compound), Grip type (Overhand/Underhand/etc.), Gender-specific video variants |
| Notable feature | MuscleWiki exposes a genuine public developer API (api.musclewiki.com) — but every substantive endpoint (`/filters`, `/categories`, `/muscles`) returned `{"detail":"Authentication required","message":"Missing X-API-Key header"}` when queried directly, confirming the full taxonomy is **not actually publicly browsable** without a paid/gated API key despite public-facing docs describing it |
| Sources | [MuscleWiki API docs](https://api.musclewiki.com/documentation), [MuscleWiki About page](https://musclewiki.com/about) (blocked with 403 on direct fetch, summary via search only), [MuscleWiki app listing](https://apps.apple.com/us/app/musclewiki-workout-fitness/id1096827640) |
| Limitation | The API is real but access-gated (confirmed by direct query returning an auth-required error); could not enumerate the full muscle/equipment taxonomy; exercise count is inconsistent across MuscleWiki's own pages (1,600+ vs. 1,900+) |

## 10. StrongLifts (5x5)

| Field | Finding |
|---|---|
| Claimed catalogue size | Not applicable in the traditional sense — StrongLifts 5x5 is a minimal, program-first app built around 5 core barbell lifts (Squat, Bench Press, Barbell Row, Overhead Press, Deadlift), not a general exercise library |
| Muscle/equipment filters | Not applicable — no general browsable library confirmed |
| Custom exercises | **Yes**, limited. Users can search for alternate exercises or tap "create" to define their own exercise, and can reorder/remove exercises from their program |
| Logging types | Weight+reps only, consistent with its powerlifting-style 5x5 program focus |
| Notable gap-list items | Not applicable — app scope is intentionally narrow (per the task's own framing, this app has "little" relevant exercise-library info) |
| Sources | [Stronglifts Support: How To Customize Exercises](https://support.stronglifts.com/article/128-exercises), [Stronglifts 5×5 Workout Program Guide](https://stronglifts.com/stronglifts-5x5/workout-program/) |
| Limitation | Confirmed this app is not a relevant comparator for catalogue breadth, as anticipated in the task brief |

## 11. wger (open-source project)

wger is materially different from the others: it is an actual open dataset queryable via a public REST API with no authentication required, so figures below are **directly verified**, not marketing claims.

### License (verified via GitHub API + wger's own API `/license` endpoint)

- **Application code:** AGPL-3.0-or-later (confirmed via GitHub repo metadata: `"license":{"key":"agpl-3.0","name":"GNU Affero General Public License v3.0"}`, and `LICENSE.txt` in the repo).
- **Exercise/ingredient data:** **Not a single blanket license.** Each individual exercise entry carries its own `license` and `license_author` field. Querying wger's own `/api/v2/license/` endpoint returns exactly 5 licenses in circulation across the dataset:
  1. CC-BY-SA 3.0 (`https://creativecommons.org/licenses/by-sa/3.0/`)
  2. CC-BY-SA 4.0 (`https://creativecommons.org/licenses/by-sa/4.0/`)
  3. CC-BY 4.0 (`https://creativecommons.org/licenses/by/4.0/`)
  4. CC0 1.0 / public domain (`https://creativecommons.org/publicdomain/zero/1.0/`)
  5. ODbL (Open Data Commons Open Database License)
- **Documentation:** CC-BY-SA-4.0.
- **Practical implication for Asc3end:** wger's exercise *data* is crowd-sourced with per-entry attribution requirements (mostly copyleft/share-alike). This confirms the task brief's assumption that it's CC-BY-SA-family licensed, but with more nuance — some entries are CC0 (no attribution needed), others require share-alike attribution. **Reusing wger's naming/taxonomy conventions for gap-analysis purposes is fine; reusing its actual descriptions/text verbatim would trigger share-alike/attribution obligations on most entries.**

### Muscle taxonomy (verified via `GET /api/v2/muscle/`, 15 total)

| id | Latin/scientific name | Common (English) name | Front/back |
|---|---|---|---|
| 1 | Biceps brachii | Biceps | front |
| 2 | Anterior deltoid | Shoulders | front |
| 3 | Serratus anterior | (no common name given) | front |
| 4 | Pectoralis major | Chest | front |
| 5 | Triceps brachii | Triceps | back |
| 6 | Rectus abdominis | Abs | front |
| 7 | Gastrocnemius | Calves | back |
| 8 | Gluteus maximus | Glutes | back |
| 9 | Trapezius | (no common name given) | back |
| 10 | Quadriceps femoris | Quads | front |
| 11 | Biceps femoris | Hamstrings | back |
| 12 | Latissimus dorsi | Lats | back |
| 13 | Brachialis | (no common name given) | front |
| 14 | Obliquus externus abdominis | (no common name given) | front |
| 15 | Soleus | (no common name given) | back |

Note this is a fairly coarse 15-muscle taxonomy (no separate rear/side delts, no forearms/traps distinction, no adductors/abductors) — likely coarser than what Asc3end will want for a 450-600 exercise catalogue.

### Equipment taxonomy (verified via `GET /api/v2/equipment/`, 12 total)

Barbell, SZ-Bar (EZ-curl bar), Dumbbell, Gym mat, Swiss Ball, Pull-up bar, none (bodyweight), Bench, Incline bench, Kettlebell, Resistance band, Cable machine.

Also a fairly minimal list — no belt-squat machine, no sled, no dip station, no specialized commercial-machine categories (no "leg press," "smith machine," "hack squat machine," etc. as distinct equipment entries), which matches the task's hypothesis that commercial-gym machine specificity is a common gap even in a comprehensive open dataset.

### Exercise category taxonomy (verified via `GET /api/v2/exercisecategory/`, 8 total)

Abs, Arms, Back, Calves, Cardio, Chest, Legs, Shoulders.

### Exercise count (verified directly via API)

- **865** canonical exercise entries (`/api/v2/exercise/`, the language-independent "base" record with muscles/equipment/category attached).
- **3,323** exercise-translation records (`/api/v2/exercise-translation/`) — these are per-language name+description variants of the 865 canonical exercises, spread across ~15+ supported languages, so this is not 3,323 distinct exercises, it's 865 distinct exercises multiplied across languages.

### Limitations

- wger's website (wger.de) HTML pages are behind Anubis bot-protection and returned "Making sure you're not a bot!" challenge pages to automated fetches — the JSON REST API itself is not gated this way and was queried directly and successfully.
- A dedicated search-by-name API endpoint could not be located (tried `/exercise/search/`, filter params like `name__icontains=`, `search=` — none appeared to actually filter results server-side in ad hoc testing), so I could not efficiently confirm/deny presence of every gap-list exercise name (e.g., Meadows row, Tate press, JM press) inside wger's 865 entries without downloading the full dataset, which was out of scope for this pass.

### Sources
[wger GitHub repository](https://github.com/wger-project/wger), [wger API root](https://wger.de/api/v2/), [wger muscle endpoint](https://wger.de/api/v2/muscle/), [wger equipment endpoint](https://wger.de/api/v2/equipment/), [wger exercisecategory endpoint](https://wger.de/api/v2/exercisecategory/), [wger license endpoint](https://wger.de/api/v2/license/), [wger documentation index](https://wger.readthedocs.io/en/2.0/)

---

## Cross-cutting findings relevant to the Asc3end gap list

| Gap-list item | Evidence found |
|---|---|
| Skull crusher / lying triceps extension variants | Confirmed present at Hevy (Barbell Triceps Extension page) and StrengthLog (Barbell Lying Triceps Extension) — a standard, near-universal exercise. |
| Pushdown grip variants | Confirmed at StrengthLog ("Tricep Pushdown With Bar/Rope" — i.e., at least 2 grip variants documented). Standard/expected. |
| JM press, Tate press | Tate Press confirmed present at StrengthLog. JM press not confirmed present or absent at any competitor via public sources — appears more niche/powerlifting-culture, still worth adding given prevalence in lifting culture. |
| Kickbacks | Confirmed referenced in Hevy's public content as a standard triceps isolation move. Standard, should be included. |
| Dip variants (chest dip, triceps dip, assisted, bar) | Confirmed at Hevy (Chest Dip page) and StrengthLog ("multiple dip variations including assisted and bar dips"). High-confidence add. |
| Pendulum squat, belt squat, hack squat | Hack squat confirmed at Hevy and referenced generically across fitness content. Pendulum/belt squat are more machine-brand-specific; not directly confirmed present in any competitor's public pages, but commonly discussed as legitimate commercial-gym movement categories. |
| Nordic curl / reverse Nordic | **Confirmed present at StrengthLog** with a dedicated article citing injury-prevention research. |
| Copenhagen plank | **Confirmed present at StrengthLog** with a dedicated how-to page. |
| Glute-ham raise | **Confirmed present at StrengthLog**, explicitly compared to Nordic curl. |
| Seal row, Meadows row | **Not found** in public content at StrengthLog or any other competitor searched. May be genuinely more niche (bodybuilding-culture specific movements popularized by specific coaches) — included for completeness, lower urgency. |
| Tibialis raise | **Confirmed present at StrengthLog**, growing in popularity (often via "tib bar" products). |
| Sled push/pull | Not confirmed present in any competitor's public catalogue pages directly, though widely discussed in general fitness/Hyrox content. Standard enough in commercial gyms to include regardless. |
| Farmer's/suitcase/overhead carries | Not directly confirmed inside any competitor's app-specific public pages. Standard enough in commercial gym programming to include independent of competitor confirmation. |
| Ski erg | Not confirmed in any competitor's public exercise pages — mentioned only in general Hyrox-training content. Lower-confidence gap; treated as a cardio-equipment edge case. |
| Commercial machine-specific names (converging chest press, iso-lateral row, pendulum, glute drive, etc.) | **No competitor among Hevy, Strong, JEFIT, Fitbod, StrengthLog, Alpha Progression, Caliber, or Boostcamp publishes brand/model-specific machine names in public marketing content** — these apps use generic/equipment-class naming ("Machine Chest Press," "Cable Row") rather than brand names, to stay equipment-agnostic across different commercial gyms. wger's equipment taxonomy (12 broad categories) supports this pattern. **Asc3end should favor generic biomechanical/equipment-class naming ("iso-lateral row machine," "pendulum squat machine," "converging chest press machine") rather than true brand names**, while staying descriptive enough to distinguish these machine patterns from flat/free-weight equivalents. |

## Summary table

| App | Claimed exercise count | Custom exercises | Public taxonomy visible? |
|---|---|---|---|
| Hevy | 400+ | Yes (7 free / unlimited Pro) | Partial (equipment list only) |
| Strong | ~200–300 (sources disagree) | Yes | No |
| JEFIT | ~1,294–1,500 (live page shows 1,294) | Yes | Yes (full muscle + equipment lists confirmed live) |
| Fitbod | ~1,000–1,600 (sources disagree) | Yes | Partial |
| StrengthLog | 500+ | Yes (unlimited, even free) | Yes (fullest public directory of any competitor) |
| Alpha Progression | 795 (661 with reduced equipment) | Yes | Partial |
| Caliber | 500–800 (sources disagree) | Yes | No |
| Boostcamp | 500+ (per App Store; public showcase page shows only 30) | Yes | Partial |
| MuscleWiki | 1,600–1,900 (sources disagree) | Unclear/unconfirmed | No (API gated behind API key despite public docs) |
| StrongLifts 5x5 | N/A (5-lift program app) | Yes, limited | N/A |
| wger | **865 verified** (canonical exercises; 3,323 multi-language translations) | Yes (community-editable wiki model) | **Yes — fully verified via open API**: 15 muscles, 12 equipment types, 8 categories |

---

**Overall recommendation for the Asc3end project:** Treat StrengthLog's public exercise directory and wger's open API as the two most reliable, verifiable sources for gap-checking specific exercise names and taxonomy structure — both are genuinely public and queryable. Treat all other competitor exercise counts as unverified marketing claims that are internally inconsistent even within a single company's own pages, and do not cite them as hard facts without the "claimed, not verified" caveat.
