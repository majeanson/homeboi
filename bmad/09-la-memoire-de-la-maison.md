# 09 · La mémoire de la maison — the house that remembers its year

> Fourth ideas doc. `05` asked *what else could it do?*, `06` asked *what could
> it reach?*, `07` gave the house cared-for members, `08` asked *can anyone
> understand it in five seconds?* This one asks a question about TIME:
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
> **STATUS: DRAFT — awaiting triage with Marc.** Verdict legend (same as 08):
> **✅ Garde** · **⏸ Plus tard** · **❌ Rejeté**.
> Effort: **[S]** small / **[M]** medium / **[L]** large ·
> **⚠** calm-tenet tension · **✦** out-of-the-box · **◐** partially exists.

---

## North star

Two directions from today, both calm:

- **Forward — the year ahead.** The house should never be surprised by its own
  rhythm. La rentrée, the tire swap, the furnace filter, tante Lucie's
  birthday, the cabane à sucre — the year's fixed points surface *gently, in
  season*, never as a wall of future obligations.
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

> *In February, a parent glances at the board and the house already knows
> what February means here. In December, planning the réveillon, one tap shows
> what we cooked and who came last December — and it feels like opening a
> family album, not a notification.*

---

## A · The year ahead (planning forward)

1. **« L'année » view** [M] ◐ — the calendar's third glance beside Grille and
   Mois: twelve small months (or four seasons) with only the ANNUAL fixed
   points — birthdays (derived, already exist), yearly-recur events, carnet
   upkeep cadences, school-year bounds, trips. Not a planner — a horizon.
   *(reuse: MonthView machinery, `_lib/birthdays`, home-projects `nextAt`.)*
2. **Les fêtes québécoises, dérivées** [S] — statutory + cultural FR-CA dates
   (jour de l'An, St-Jean, Action de grâce, Noël, Pâques…) DERIVED like
   birthdays (no rows, a pure function with the moving-feast math). Board
   shows them as all-day items; the year view anchors on them. Opt-out per
   household. *(pattern: `_lib/birthdays` — derive, never insert.)*
3. **La rentrée & the school year** [M] — a household's school-year bounds
   (first/last day, relâche) as ONE settings card; the board's « Demain »
   knows a school morning from a vacation morning, the rush-hour diet (C-25,
   plus-tard) gets its real calendar. No sync/import — typed once a year.
4. **Season turnover rituals** [S] ◐ — SeasonUpkeepCard already surfaces
   upkeep « cette saison »; complete it with the two big FR-CA rituals as
   suggested carnet cadences on first setup: pneus d'hiver (l'auto) and
   abris/piscine/gouttières (la maison). A seed list, not a new system.
5. **Countdown tiles, generalized** [S] ◐ — the birthday countdown exists in
   « Jouer » (toddler). Let a parent pin ONE countdown to the board (trip
   departure, Noël, la rentrée) — a single calm tile, never a stack of
   deadlines. *(reuse: jouer countdown math; boardCards for placement.)*
6. **« Préparer » windows on annual events** [S] ◐ — lead_seconds already
   gives « Bientôt »; for annual items the useful lead is WEEKS (gift for a
   birthday, tires before the first snow). Default yearly recurrences to a
   longer lead + copy that says why (« dans 3 semaines — le temps d'y
   penser »).

## B · The year behind (memory resurfacing)

7. **« Il y a un an » on the idle frame** [S] ⚠ ✦ — the ambient photo mosaic
   already drifts through household photos; BIAS it gently toward photos taken
   the same week in past years (EXIF/created_at only — no ML, no faces).
   Opt-in toggle in Mode veille. The wall becomes the family album exactly
   when nobody's using the tablet. No caption, no prompt — just the photo.
8. **The house's diary (read view)** [S] ◐ — care_log + chore ledger +
   finished trips + kept drawings already form an append-only house history;
   give it ONE quiet chronological read (Réglages ▸ or a carnet tab):
   « la maison cette année ». Names and dates, never counts (chore-ledger
   rule). *(reuse: care_log, task_participants, trips archive.)*
9. **Menu memory** [M] ✦ — when planning a week that contains a fête or a
   season boundary, « Suggérer » may add a line: « L'an passé à Noël : tourtière,
   ragoût » (from meals history, which already exists). One line inside the
   existing suggest flow — never a standalone "memories" surface.
10. **« Cette année ensemble »** [M] ⚠ — the year-scale sibling of « Cette
    semaine » (this-week-together): the year read by FACE — who came into the
    cercle, trips taken, drawings kept, first/lasts. STRICTLY faces + moments,
    zero tallies (« 47 soupers cuisinés » is REJECTED by construction).
    Renders once, on demand, maybe around jour de l'An.
11. **Drawings & mots, by year** [S] ◐ — the gallery already keeps drawings;
    group by year with the child's age at the time (« Léa, 4 ans »). Same for
    kept mots. Pure grouping, no new rows.
12. **Trip albums** [S] ◐ — a finished voyage already holds notes/photos/
    itinerary; a read-only « album » view of a past trip (today it's just the
    same editor, colder). One template over existing data.

## C · Traditions (the year's own vocabulary)

13. **Une tradition** [M] ✦ — a first-class *tradition*: a yearly event that
    ACCUMULATES its own memory (photos/notes attach to the tradition, not the
    year's instance). « La cabane à sucre » shows this year's date AND last
    year's photo. Modelled as a yearly-recur event + a media junction — small
    schema, big soul. ⚠ guard: the tradition never scores attendance.
14. **First-snow / first-BBQ moments** [S] ✦ — a handful of derived,
    weather-triggered "moments" (first snow of the season, first 20° day) the
    board may mark with ONE line + picto, toddler-hearable. Weather data
    already polls; this is a derivation, not a feature system. Opt-out.
15. **The birthday arc, completed** [S] ◐ — birthdays are derived, gift_ideas
    exist on the peek; complete the loop: after the day passes, the peek
    quietly offers « garder une photo de la fête ? » linking a photo to the
    person (their carnet-like memory). No nag — a one-time affordance in the
    detail peek.

## D · Mechanics (the derived-year layer)

16. **`lib/year.ts` — one derivation module** [S] — like `_lib/birthdays`:
    given the household's rows, derive the year's fixed points (fêtes,
    birthdays, cadences, school bounds, traditions) in ONE tested place that
    the board, the year view and Moments all read. No new tables for derived
    things — the 08/07 rule (« DERIVED via _lib/birthdays, NO event rows »)
    generalized.
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

- **OQ-1 — Which direction first?** Forward (A: the year ahead — planning
  value now) or backward (B: memory — soul value, needs data to exist)? The
  house has ~1 real household with months of data; memory features get better
  as data accumulates, which argues A first, B as it ripens.
- **OQ-2 — Traditions (C-13):** worth its small schema, or is a yearly event
  + the photo features already enough? (It's the one idea here that adds a
  table.)
- **OQ-3 — The idle frame as album (B-7):** comfortable with same-week-in-past
  photo bias on by default, or opt-in only? (It's the most "the app noticed
  something" feature in the doc — calm hinges on it feeling like furniture.)
- **OQ-4 — Fêtes list (A-2):** which holidays does this household actually
  mark? (Seed list needs your real ones, not a bank calendar.)
