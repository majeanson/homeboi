# 09 · La mémoire de la maison — the house that remembers its year

> Fourth ideas doc. `05` asked _what else could it do?_, `06` asked _what could
> it reach?_, `07` gave the house cared-for members, `08` asked _can anyone
> understand it in five seconds?_ This one asks a question about TIME:
>
> **The board answers "today" perfectly — clock, souper, la liste, les
> corvées. But who answers October? And who remembers last October?**
>
> A household's real rhythm isn't daily, it's ANNUAL: la rentrée, les pneus
> d'hiver, les fêtes, le camping d'été, the same birthday cake photo every
> year. The app already touches the year in a dozen half-built places (◐
> everywhere below) — birthdays are derived, carnets know replacement years,
> SeasonUpkeepCard knows seasons, voyage archives trips, the photo mosaic
> drifts by daypart. This doc pulls those threads into one question: **what
> does a calm memory look like?**
>
> **STATUS: TRIAGED with Marc, 2026-07-08.** Tally: **6 garde** (A-1 année ·
> A-4 rituels · A-5+6 countdown+leads · B-8 diary · B-11 drawings-by-year ·
> B-12 trip albums; A-2 fêtes already shipped) · **4 plus tard** (A-3 rentrée ·
> B-9 menu memory · B-10 année ensemble · C-13 traditions) · **2 rejetés**
> (B-7 idle photo bias · C-14 first-snow moments). Build order: any that
> parallelizes well (OQ-1); D-17/18 adopted as design rules. Verdict legend
> (same as 08): **✅ Garde** · **⏸ Plus tard** · **❌ Rejeté**.
> Effort: **[S]** small / **[M]** medium / **[L]** large ·
> **⚠** calm-tenet tension · **✦** out-of-the-box · **◐** partially exists.

---

## North star

Two directions from today, both calm:

- **Forward — the year ahead.** The house should never be surprised by its own
  rhythm. La rentrée, the tire swap, the furnace filter, tante Lucie's
  birthday, the cabane à sucre — the year's fixed points surface _gently, in
  season_, never as a wall of future obligations.
- **Backward — the year behind.** The house quietly accumulates real memory:
  photos, drawings, notes, care-log entries, cooked meals, finished trips.
  Today that memory is write-only — nothing ever resurfaces. A calm memory
  RESURFACES on invitation: « il y a un an » on the idle frame, last winter's
  menu when planning this winter's — **opt-in, derived, never a feed**.

**The calm line (non-negotiable, same test-enforced tenets):** no streaks
("3rd year doing this!"), no anniversary NAGS, no push, no infinite memories
feed, no "on this day" interruption. The house remembers **when asked, or when
idle** — never louder than that.

**The acceptance bar:**

> _In February, a parent glances at the board and the house already knows
> what February means here. In December, planning the réveillon, one tap shows
> what we cooked and who came last December — and it feels like opening a
> family album, not a notification._

---

## A · The year ahead (planning forward)

1. ✅ **« L'année » view** [M] ◐ — _garde (2026-07-08)_ — the calendar's third glance beside Grille and
   Mois: twelve small months (or four seasons) with only the ANNUAL fixed
   points — birthdays (derived, already exist), yearly-recur events, carnet
   upkeep cadences, school-year bounds, trips. Not a planner — a horizon.
   _(reuse: MonthView machinery, `_lib/birthdays`, home-projects `nextAt`.)_
   **SHIPPED same day:** `YearView` as the toggle's third option (`'annee'`,
   sun-horizon icon; `lib/boardview` widened, legacy values still fold to
   Grille). A ROLLING year from the first of this month: twelve mini-months
   (`monthGrid` ×12) painting the fixed points as colour dots (fête gold ·
   birthday pink · trip teal · event blue · upkeep sage · long-jeu slate) +
   a legend + the same points read as month sections (this month open, the
   rest folded in count-less Disclosures — the B-8 pattern). Data path per
   D-16/18: ONE new cold read **`/api/year?from&to`** (never polled, 400-day
   cap) reusing `_lib/birthdays` + `_lib/recur` (**yearly-freq events only**
   — a weekly practice is a week rhythm, not a year point) + `_lib/carnetLife`
   (replacement days UNfiltered by lead — a horizon shows the whole year) +
   the month read's trip pair; the fêtes stay client-derived in `lib/year`
   (`yearPoints()` merger, unit-tested; honours the `babillard-fetes`
   opt-out). Tap a mini-month → Mois at that offset (`MonthView
   initialOffset`, transient, not persisted). School-year bounds wait on A-3
   (plus tard). Guide « Changer la vue » rewritten to the trio + whatsNew.
2. ✅ **Les fêtes québécoises, dérivées** [S] — **SHIPPED 2026-07-08 (the
   first 09 item, per OQ-4's shape: announce all, zero impact, settings
   opt-out).** `src/lib/year.ts` (the D-16 module's first resident): 17
   curated QC/CA dates — fériés (jour de l'An, Vendredi saint, lundi de
   Pâques, Patriotes, St-Jean, Canada, Travail, Action de grâce, Noël) +
   fêtes culturelles (Valentin, Pâques, Mères, Pères, Halloween, Souvenir,
   les deux veilles) — each a pure `date(year)` fn (Gregorian computus for
   Pâques, nth-weekday + Monday-before-May-25 rules), 9 unit tests against
   known civil dates. Derived CLIENT-side (holidays need no household data):
   zero API, zero schema, works offline. Board merges them into the same
   event arrays every lens reads (parent Act rows, toddler tiles, Simple
   board, le fil) as static announce lines — all-day, nobody's, no peek, the
   emoji is the picture, tagged « Fête » / « Congé férié ». Per-device
   opt-out toggle in Réglages ▸ Système ▸ Affichage (`babillard-fetes`,
   default ON). Guide point on the board card + whatsNew. _(MonthView cells
   deliberately later — own data path.)_
3. ⏸ **La rentrée & the school year** [M] — _plus tard (2026-07-08 — not selected this wave)_ — a household's school-year bounds
   (first/last day, relâche) as ONE settings card; the board's « Demain »
   knows a school morning from a vacation morning, the rush-hour diet (C-25,
   plus-tard) gets its real calendar. No sync/import — typed once a year.
4. ✅ **Season turnover rituals** [S] ◐ — _garde (2026-07-08)_ — SeasonUpkeepCard already surfaces
   upkeep « cette saison »; complete it with the two big FR-CA rituals as
   suggested carnet cadences on first setup: pneus d'hiver (l'auto) and
   abris/piscine/gouttières (la maison). A seed list, not a new system.
   **Marc's build constraint (2026-07-08): must integrate with the EXISTING
   Routines & Corvées & Projets machinery** — accepting a seed creates a
   normal `home_projects` row (kind 'upkeep', yearly/6-month recur, carnet
   link when the carnet exists) through the normal endpoint, so it surfaces
   on the board / ledger / carnet cadence line like any hand-made upkeep.
   Never a parallel system. **SHIPPED same day to that shape:**
   `SEASON_SEEDS` in lib/year.ts (pneus 🛞 aux 6 mois mi-oct · gouttières 🍂
   annuel · abri d'auto 🏠 annuel, each with folded `match` keywords + a
   week-scale lead — the A-6 principle) + « Idées de saison » rows in
   Réglages ▸ Corvées ▸ Entretien: one tap POSTs the normal upkeep row
   (next-anchor `at`, recurrence, `lead_seconds` in weeks, carnet_id when a
   matching auto/home carnet exists); a seed hides once any existing row
   covers its keywords, and ✕ dismisses per device forever.
5. ✅ **Countdown tiles, generalized** [S] ◐ — _garde (2026-07-08, with A-6)_ — the birthday countdown exists in
   « Jouer » (toddler). Let a parent pin ONE countdown to the board (trip
   departure, Noël, la rentrée) — a single calm tile, never a stack of
   deadlines. _(reuse: jouer countdown math; boardCards for placement.)_
   **Marc's design (2026-07-08): SUGGESTION-driven** — the house PROPOSES the
   next natural countdown (next major fête from lib/year, next trip
   departure, next birthday), the parent accepts with one tap; when the day
   arrives and passes, the tile suggests the next one. Always exactly ONE
   countdown; the suggestion is an offer, never auto-pinned.
   **SHIPPED same day to that design:** `CountdownCard` (grid card
   'countdown' in lib/boardCards — show/hide + reorder like every card).
   Candidates = upcoming derived birthdays (🎂, from the board's own rows) +
   the next MAJOR fête long-range (Noël offerable in July —
   `nextMajorFete`, set: noel/jour-de-l'an/pâques/st-jean/halloween).
   Offer: « Compter les dodos jusqu'à X ? » Oui !/Passer (a skip hides THAT
   candidate until its date passes — next year may offer anew); pinned tile:
   emoji + name + « dans N dodos », « C'est aujourd'hui ! 🎉 » on the day,
   self-clears after and the next offer appears. Per-device stores
   (`babillard-countdown`, `-countdown-skip`); guests see a pinned tile,
   never the offer. Guide point + whatsNew. *(Trips as candidates: later,
   when the card can peek the trips cache. A-6's generic form-default —
   yearly recurrences pre-selecting a weeks-long lead — remains a small
   follow-up; the seeds + suggested countdowns already carry week leads.)*
6. ✅ **« Préparer » windows on annual events** [S] ◐ — _garde (2026-07-08, with A-5)_ — lead_seconds already
   gives « Bientôt »; for annual items the useful lead is WEEKS (gift for a
   birthday, tires before the first snow). Default yearly recurrences to a
   longer lead + copy that says why (« dans 3 semaines — le temps d'y
   penser »).

## B · The year behind (memory resurfacing)

7. ❌ ~~**« Il y a un an » on the idle frame**~~ [S] ⚠ ✦ — _rejeté (Marc,
   2026-07-08 — OQ-3: keep the mosaic purely random/recent, no time bias at
   all)._ ~~Bias the ambient photo mosaic toward photos taken the same week
   in past years.~~ Do not re-propose; the mosaic stays un-curated.
8. ✅ **The house's diary (read view)** [S] ◐ — _garde (2026-07-08)_ — care*log + chore ledger +
   finished trips + kept drawings already form an append-only house history;
   give it ONE quiet chronological read (Réglages ▸ or a carnet tab):
   « la maison cette année ». Names and dates, never counts (chore-ledger
   rule). *(reuse: care*log, task_participants, trips archive.)*
   **SHIPPED same day:** `HouseDiarySection` under **Réglages ▸ Le cercle ▸
   « Cette année »** (`?sub=annee`) — a cold-path CLIENT union (D-18: no new
   endpoint, no poll; the one backend touch widened chores-ledger's `?since`
   floor 90→366 days, defaults untouched) of care_log (household-wide read),
   chores-ledger (year window, its own cache row), finished trips (`end_at`
   before today; 403 fails soft on a kiosk since trips are operator-scoped)
   and kept drawings (credited « Léa · 3 ans » via `ageAt`, the B-11 voice).
   Grouped by `groupByMonth` (new in lib/year, unit-tested): newest month
   open, older months folded in count-less `Disclosure`s; rows reuse the
   `.ledger` CSS family (spine + title + day · context + faces). Guide point
   appended to the cercle card (16) + operatorHelp `houseDiary` + whatsNew.
9. ⏸ **Menu memory** [M] ✦ — _plus tard (2026-07-08 — not selected this wave)_ — when planning a week that contains a fête or a
   season boundary, « Suggérer » may add a line: « L'an passé à Noël : tourtière,
   ragoût » (from meals history, which already exists). One line inside the
   existing suggest flow — never a standalone "memories" surface.
10. ⏸ **« Cette année ensemble »** [M] ⚠ — _plus tard (Marc, 2026-07-08)_ — the year-scale sibling of « Cette
    semaine » (this-week-together): the year read by FACE — who came into the
    cercle, trips taken, drawings kept, first/lasts. STRICTLY faces + moments,
    zero tallies (« 47 soupers cuisinés » is REJECTED by construction).
    Renders once, on demand, maybe around jour de l'An.
11. ✅ **Drawings & mots, by year** [S] ◐ — _garde (2026-07-08)_ —
    **SHIPPED same day (drawings half):** « Mes dessins » now reads as the
    family album — grouped by YEAR once a second year exists (a young gallery
    stays one calm unlabelled grid; `groupByYear` in lib/year.ts), and each
    drawing credits the child's AGE at the time when the birth year is known
    (« Léa · 3 ans » — `ageAt` over members.birthday, never guessed from a
    year-less date). Pure regrouping, no new rows; both helpers unit-tested.
    **Mots half n/a for now:** mots are transient board messages with no
    archive surface — revisit only if a kept-mots gallery ever exists.
12. ✅ **Trip albums** [S] ◐ — _garde (2026-07-08)_ — a finished voyage already holds notes/photos/
    itinerary; a read-only « album » view of a past trip (today it's just the
    same editor, colder). One template over existing data.
    **SHIPPED same day:** `VoyageAlbum` — a finished trip (`end_at` before
    today, derived, no stored flag) opens `/voyage/:id` as its ALBUM: paper
    keepsake in the recipe-« Original » language (`.voyage-album` mirrors
    `.recipe-original`), photo grid of every non-PDF image/drawing note
    (`ZoomableImg`), day-by-day + kept notes via read-only `TripNoteCard`
    (no handlers → no RowActions), « On y était » faces. The editor stays one
    SceneHead `action` toggle away (« Modifier » ⇄ « L'album »); a `?vue=`/
    `?jour=` deep link (calendar day tap) still lands in the editor. The B-8
    diary's finished-trip rows link here — the diary is the album's doorway.
    PDFs/documents stay editor-side (logistics, not memory).

## C · Traditions (the year's own vocabulary)

13. ⏸ **Une tradition** [M] ✦ — _plus tard (Marc, 2026-07-08 — « no
    traditions for now »; the one new table stays unbuilt)._ A first-class
    _tradition_: a yearly event that ACCUMULATES its own memory (photos/notes
    attach to the tradition, not the year's instance). Modelled as a
    yearly-recur event + a media junction. ⚠ guard: never scores attendance.
14. ❌ ~~**First-snow / first-BBQ moments**~~ [S] ✦ — _rejeté (Marc, 2026-07-08 — the weather card already says it's snowing). Do not re-propose._ — a handful of derived,
    weather-triggered "moments" (first snow of the season, first 20° day) the
    board may mark with ONE line + picto, toddler-hearable. Weather data
    already polls; this is a derivation, not a feature system. Opt-out.
15. ❓ **The birthday arc, completed** [S] ◐ — _NOT YET TRIAGED (missed in the
    2026-07-08 pass — ask Marc next round)_ — birthdays are derived, gift_ideas
    exist on the peek; complete the loop: after the day passes, the peek
    quietly offers « garder une photo de la fête ? » linking a photo to the
    person (their carnet-like memory). No nag — a one-time affordance in the
    detail peek.

## D · Mechanics (the derived-year layer)

16. ◐ **`lib/year.ts` — one derivation module** [S] — **STARTED 2026-07-08**
    (shipped with A-2): the module exists with the fêtes derivation (easter
    computus, nth-weekday, holidaysOnDay/holidaysInRange, unit-tested) + the
    per-device pref. Future year-ahead items (rentrée bounds, season
    turnover, l'année view) add their derivations HERE — one tested place,
    no new tables for derived things (the 08/07 rule generalized).
17. **`created_at` is the memory index** [S] — every memory idea above reads
    EXISTING timestamps (photos, notes, drawings, meals, care_log, trips).
    Write the rule down: memory features derive from created_at/date columns;
    they never add tracking columns. (The calm-tenets test already blocks the
    worst; this is the design rule beside it.)
18. **Year-scale queries, free-tier honest** [S] — the memory reads are
    cold-path (idle frame, on-demand views): they must ride existing
    endpoints + client grouping or ONE new read each, never a new poll.
    (free-tier capacity note: polls are the cost lever.)

## E · Guardrails (what this doc must NOT become)

- ❌ **No memories feed / timeline tab.** The hub keeps six sections; memory
  lives inside existing surfaces (idle frame, peeks, carnets, garde-manger).
- ❌ **No anniversary notifications** — no push exists, and no in-app badge
  will nag either (the A-5 whisper-dot is the LOUDEST the app ever gets).
- ❌ **No auto-generated recap videos / social exports.** (08 rejected the
  video family; a shared album stays a share-link snapshot if anything.)
- ❌ **No counts anywhere in memory copy** — « des soupers ensemble », never
  « 47 soupers ». The chore-ledger rule is the voice of every memory line.

---

## Open questions for Marc

- ~~**OQ-1 — Which direction first?**~~ — **answered (2026-07-08, refined):
  any logical order that PARALLELIZES well** — no direction pairing required;
  pick units that ship independently.
- ~~**OQ-2 — Traditions (C-13)**~~ — **answered (2026-07-08): no traditions
  for now** — C-13 moves to ⏸ plus tard (no new table).
- ~~**OQ-3 — The idle frame as album (B-7):**~~ — **answered (2026-07-08):
  rejected outright.** No time bias on the mosaic; B-7 struck above.
- ~~**OQ-4 — Fêtes list (A-2)**~~ — **answered (2026-07-08): propose the
  relevant Québec/Canada dates with an opt-in/out in settings — or simply
  announce them all with no impact.** Build shape: derive the full QC/CA set,
  announce all by default as zero-impact calm lines, with a settings toggle
  to opt out (per-fête curation can come later if wanted).
