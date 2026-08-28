# 08 · The Grandma Test — understand it, drive it faster, finish what's half-there

> Third ideas doc, with a deliberately different question than `05` (50 features)
> and `06` (50 lifestyle reaches). Those asked **"what else could it do?"**
> This one asks: **"the app now does ~40 things — can a first-time 70-year-old,
> a tired parent at 6:45am, and a babysitter each understand it in five seconds
> and do the thing they came for in two taps?"**
>
> **TRIAGED with Marc, 2026-07-07 — every idea carries a verdict:**
> **✅ Garde** (approved) · **⏸ Plus tard** (kept, not scheduled) ·
> **❌ Rejeté** (struck — text kept for the record, do not build).
> Marc's notes are quoted inline. Tally: **29 garde · 4 plus tard · 14 rejetés**
> (D-26 Le pont moved to plus tard on Marc's OQ-3 answer, second pass same day).
>
> Effort legend unchanged: **[S]** small / **[M]** medium / **[L]** large ·
> **⚠** calm-tenet tension · **✦** out-of-the-box · **◐** partially exists.

---

## North star

The brief says a **pre-reader is a first-class user**. The unfinished symmetry:
**a post-reader is too.** Grandma is already *in* the product — she writes to the
postbox, fills an intake card, opens a guest link — but she was never designed
for. She is the toddler's mirror: big targets, spoken words, picture-first,
zero fear of breaking something. Almost everything built for the three-year-old
(TTS, pictos, locked lenses, hear-first pickers) generalizes to her for free.

**Triage outcome on the north star:** the grandma arc is ON (Simple lens,
tap-to-hear, Le pont all approved) — but as a **guest of the household**, not a
second-kitchen deployment (F-45 rejected). She visits; she doesn't get a kiosk.

**The Grandma Test** (the acceptance bar every idea below serves):

> *Hand a first-time visitor the tablet. Within 60 seconds, unaided, they can:
> (1) say what this thing is, (2) find what's for supper, (3) add "lait" to the
> list, and (4) undo it — without fear, without reading a manual, without help.*

---

## A · The Grandma Test — comprehension for absolutely anyone

1. ✅ **A third audience lens: « Simple »** [M] ✦ — the flagship idea. The
   audience axis (`lib/audience.ts`) is `parent | toddler`; add **`simple`** —
   the post-reader lens. Board collapses to four giant tiles (Aujourd'hui ·
   Souper · La liste · Notes), type scales up ~1.4×, secondary chrome hides,
   every card is tap-to-hear. Boots locked via `?simple=1` exactly like
   `?kid=1`. Not a new app — the toddler-lens machinery pointed at the other
   end of life. *(reuse: audience context, locked-kiosk pattern, `KidView`'s
   filmstrip philosophy, `SECTION_TINT`.)*
2. ✅ **Tap-to-hear everywhere** [M] ◐ — `useSpeak` already narrates routines,
   recipes, measure pills, « Notre monde ». Generalize: in toddler/simple
   lenses, a long-press on *any* card/row reads it aloud. One shared
   `useSpeakable` wrapper (or a `data-speak` attribute the shell listens for)
   instead of per-feature wiring. Low vision, low literacy, hands-full-of-flour
   — one affordance covers all three. *(reuse: `useSpeak`, the world-map
   tap-to-speak pattern.)*
3. ✅ **The plain-words pass** [S] — audit `i18n.ts` copy against a "would my
   mother-in-law parse this cold?" bar. « Garde-manger », « Carnets »,
   « Le cercle », « Capture » are lovely but opaque on first contact. Keep the
   names (they're brand) but guarantee every section header carries a plain
   subtitle where help mode is on, and every empty state opens with *what this
   is* before *what to do*. One sweep, one PR, huge first-contact payoff.
4. ✅ **Help mode (« ? ») on every tab** [M] ◐ — the contextual help engine
   (`lib/addHelp.ts`, `CERCLE_HELP`) exists but only some sections wear the
   « ? ». Finish the rollout: Board, Kitchen, Liste, Routines each get their
   help registry; P2-9's orphan-check keeps entries honest. The rule becomes
   structural: *a control ships with its help entry or it doesn't ship.*
5. ✅ **Guided tours — reshaped by Marc** [M] ◐ — original pitch was
   per-persona variants (guest/kiosk/simple). **Marc: « adapt the tour
   automatically but only for power users in some way. »** **Power user
   defined (OQ-5, answered): the ones who edit the most and use the full
   functionality — no guest, no kid, no small-subset surface.** So: the
   adaptive tour targets the operator (and full-parent mobile users) and
   draws on what they actually edit — e.g. surfacing tour steps for shipped
   features their editing pattern shows they haven't touched (kin to C-18's
   DB-derived frequency + B-11's isUnused probes). Guests/kiosk/toddler keep
   nothing or one static simple tour. Needs a small design pass before build.
   *(reuse: `TourOverlay`, `data-tour`, `lib/tour.tsx`.)*
6. ✅ **Fear-free by proof: the visible undo promise** [S] ◐ — **Marc: « we
   already have some of it but we could improve it. »** We have undo
   (`lib/undoStack`, « Récents » toast) — the *promise* is invisible until you
   dare. Improve: a one-time gentle line on the first destructive-ish act per
   device ("Tout se défait — regarde en bas"), and a « Récents » viewer in
   Réglages ▸ Système listing the last N undoable acts with one-tap restore.
7. ✅ **Human error copy** [S] — sweep every toast/`StatusMessage`/banner for
   tech-speak. "503", "réessayer", "erreur réseau" → what happened, in kitchen
   Québécois, and what (if anything) to do: « Pas d'internet — c'est noté, ça
   partira tout seul » (the outbox already makes that true!). The offline
   architecture is world-class; the *words* undersell it.
8. ✅ **« Essaie sans peur » demo sandbox** [M] ✦ — a demo household seeded
   from the sample-seed migration (0096), reachable from the marketing page and
   from Réglages, watermarked « Démo », resettable in one tap. New users (and
   the showcase audience) poke a *full* household with zero fear and zero
   setup. Doubles as the sales demo. *(reuse: sample-seed, e2e mock shapes.)*
9. ✅ **Icon + word — SOFT version only** [S] — **Marc: no visible words added
   to headers.** Audit standalone bare-icon controls in parent view, but the
   remedy is exclusively the quiet route: a long-press label and/or a help-mode
   (« ? ») entry per control. Headers stay minimal; row-level ✏️/🗑️ untouched.
10. ✅ **Contrast & type floor** [S] — a `/dev/kit` sweep of all six section
    tints × dawn/day/dusk/night dayparts against WCAG AA on a *cheap washed-out
    tablet panel* (the actual device class!). Fix the failing pairs in tokens,
    not per-page. Add a `prefers-contrast` bump. Grandma's eyes are the spec.

## B · Understand *the app itself* — discoverability of ~40 features

11. ✅ **« Le saviez-vous ? » — one calm discovery card** [S] ⚠ — Découvrir
    rotates ONE dismissible card surfacing a feature the household provably
    hasn't touched (no pets rows → the pets card; no voyage → voyage). Derived
    from data absence, never tracked engagement; shows once, dismiss is
    forever. The anti-feed version of feature discovery. *(reuse:
    `FEATURE_MAP_TILES` — each tile gains an optional `isUnused(data)` probe.)*
12. ✅ **Guide search** [S] ◐ — folded into D-33 (one work item): guide entries
    join the global search index (P2-7's `SEARCHABLE_INDEX` contract) so typing
    « comment inviter grand-maman » finds the postbox guide card, not nothing.
13. ❌ ~~**The fridge manual — a printable one-pager**~~ [S] ✦ — *rejeté.*
    (Print-stylesheet view of guideContent to tape beside the tablet.)
14. ✅ **« Quoi de neuf » gentle changelog** [S] — one line in Découvrir when a
    session lands after new features shipped ("Nouveau : les mots doux —
    laisse un message à quelqu'un"), sourced from a tiny hand-maintained list,
    shown once, dismissible. Ships with each feature PR (three words of
    discipline).
15. ✅ **Empty states that teach** [S] ◐ — audit every `EmptyState` against the
    three-part contract: *what this section is* → *one concrete example* → *the
    one button*. Several already comply; make it a checklist item in
    COMPONENTS.md so drift can't restart.
16. ❌ ~~**The promo video, inside the app**~~ [S] ◐ ✦ — *rejeté.* (Embedding
    the Remotion short in `/` and Découvrir.)
17. ❌ ~~**Name the lenses on-screen**~~ [S] — *rejeté.* (The persistent
    « Vue enfant / Invité » chip.)

## C · Be faster — the tap budget & perceived speed

18. ✅ **The tap-budget audit (then a test that pins it)** [M] ✦ — **Marc's
    top areas (OQ-2, answered):** meal plan · liste · flyers · board ·
    calendar · trip (voyage) · car (l'auto) · routines · kid mode — "and
    maybe more I'm missing." Convert each area into its 1–2 most frequent
    *actions* (plan a supper; add/check a list item; browse a flyer deal;
    glance the board; add an event; open the trip; check the car; start a
    routine; enter kid mode), count taps-from-board, set budgets (most ≤2),
    and pin them in `e2e/tap-budget.spec.ts`. **Marc's second idea, adopted
    as the method:** derive the *true* top actions from the DB itself —
    entity write recency/frequency per table (meals, list items, events,
    trips…) tells us what this household actually does daily. A one-off
    operator-side audit query (or a tiny Diagnostics read-out), never a
    user-facing metric — same data-derived, calm-safe philosophy as B-11's
    `isUnused(data)` probes, pointed at frequency instead of absence.

    **The audit, ready to run** (read-only; against the remote D1 when you
    want prod truth). List the tables, then count rows created in the last
    30 days per candidate table — the ranking IS the household's real
    top-10:

    ```bash
    npx wrangler d1 execute <db-name-from-wrangler.toml> --remote \
      --command "SELECT name FROM sqlite_master WHERE type='table' ORDER BY name"
    # then, adapting table/timestamp names to what step 1 shows:
    npx wrangler d1 execute <db> --remote --command "
      SELECT 'meals' AS t, COUNT(*) AS n30 FROM meals    WHERE created_at > strftime('%s','now') - 2592000
      UNION ALL SELECT 'events',  COUNT(*) FROM events   WHERE created_at > strftime('%s','now') - 2592000
      UNION ALL SELECT 'tasks',   COUNT(*) FROM tasks    WHERE created_at > strftime('%s','now') - 2592000
      UNION ALL SELECT 'todos',   COUNT(*) FROM todos    WHERE created_at > strftime('%s','now') - 2592000
      UNION ALL SELECT 'notes',   COUNT(*) FROM notes    WHERE created_at > strftime('%s','now') - 2592000
      ORDER BY n30 DESC"
    ```

    Extend the UNION with the list-items, trips, rides, recipes and mots
    tables once step 1 confirms their names. If the ranking disagrees with
    the guessed top-10, adjust the spec's flows — the DB wins.
19. ❌ ~~**Long-press ＋ → straight to the mic**~~ [S] — *rejeté.*
20. ✅ **Frequents-first comboboxes** [S] — `EntityCombobox` ranks by recency/
    frequency of *this household's* picks (a tiny local counter, not a synced
    metric — calm-safe). Milk, the same four people, the same store rise to
    the top; picking gets one keystroke shorter every week.
21. ❌ ~~**PWA app shortcuts + a widget-shaped entry**~~ [S] — *rejeté.*
22. ❌ ~~**NFC / QR waypoints in the house**~~ [M] ✦ — *rejeté.* (Deep-link
    stickers: fridge → /liste, washer → laundry routine.)
23. ✅ **Route-level code-splitting — offline-aware** [M] — **Marc: « yes but
    consider offline in all this. »** **SHIPPED 2026-07-07 — measured first:**
    the ~40 routes were ALREADY split (recipes/voyage/Notre monde/DrawPad all
    lazy; entry ~407 KB, largest lazy chunk Icon ~251 KB) — the real finding
    was **heic2any (1.3 MB wasm HEIC decoder) precached on every kiosk install
    for an ONLINE-ONLY action** (photo upload; Blob writes never queue). It's
    now excluded from the sw.js precache (`ONLINE_ONLY_CHUNKS` in
    vite.config.ts) and runtime-caches on first online use. **The CI check:**
    `scripts/check-bundle.mjs` (`npm run check:bundle`, wired into ci.yml
    after build) enforces BOTH sides of the load-bearing constraint — every
    lazy chunk MUST be in the precache (offline kiosk opens every lazy route,
    NFR-OFFLINE-1) except the online-only allowlist which must NOT be — plus
    size budgets (entry ≤ 500 KB, lazy ≤ 320 KB). `npm run e2e:sw` re-verified
    the offline shell reboot after the precache change.
24. ✅ **Optimistic navigation warmth** [S] — on tab hover/press-start,
    prefetch that tab's primary query (TanStack `prefetchQuery`) so the pane
    lands full. The cache-first architecture makes this nearly free; it
    converts "fast" into "instant."
25. ⏸ **A « rush hour » information diet** [S] ⚠ ✦ — *plus tard.* 6:30–8:30
    school-day mornings, the board leads with the three things that matter
    (leave time, lunches, weather-coat call) and tucks the rest below the
    fold. Day-part theming applied to *content*. Gentle, derived, opt-out.

## D · Hand-in-hand — the missing 20% of shipped features

26. ⏸ **« Le pont » — one home for the extended family** [M] ◐ ✦ —
    **deferred by Marc (OQ-3): plus tard.** Postbox (write to the house),
    intake (fill your card), share links (see a slice) — separate doors for
    the *same person*. Unify: one guest landing per person that composes what
    their token allows — today's highlights, drop a note, see shared photos,
    their intake card. The share-modes capability model (per-kind allowlists)
    already supports it; this is a front-door refactor. Grandma gets ONE
    bookmark. *(reuse: guestScope allowlists, postbox, intake, SharePage.)*
    When revived, pick the 2–3 real relatives and build their door first;
    E-38 (per-guest locale) rides along.
27. ❌ ~~**« Acheter cette recette »**~~ [M] ◐ — *rejeté.* (The recipe/plan →
    pantry-low → list diff-and-seed.)
28. ❌ ~~**Mots + drawings + TTS converge**~~ [S] ◐ — *rejeté.* (Drawn mots a
    pre-reader can tap-to-hear.)
29. ❌ ~~**Voyage × the rest of the house**~~ [S each] ◐ — *rejeté.* (Trip
    weather, l'auto as trip vehicle, « on est partis » pause.)
30. ✅ **Cast × ambient** [S] ◐ — **SHIPPED (was already done — audit stale):**
    `/cast` offers « Le babillard » vs « Ambiance » — the Ambience choice renders
    `AmbientScreen` full-time (`CastPage.tsx`), and the Guide's cast card
    documents it. The hourly breath + burn-in drift (F-47/E-37) ride along on
    the TV automatically since they live inside AmbientScreen.
31. ✅ **Carnets × upkeep cadence** [M] ◐ — **SHIPPED 2026-07-07 (audit: ~95%
    already existed).** The stack was built by construction: `home_projects`
    kind `'upkeep'` carries `recur_json` (monthly/yearly + interval — « filtre
    aux 3 mois » works via RecurPicker in `HomeProjectForm`), `lead_seconds`
    (« Bientôt »), and `carnet_id` (mig 0082); the server derives `nextAt`
    (`_lib/recur.expandRange`); occurrences surface on the board
    (homeToday/homeUpcoming, checkable, carnet emoji) + SeasonUpkeepCard; the
    carnet page lists its entretien + adds one pinned to the carnet. **The
    one missing piece, now fixed:** the carnet page's entretien row showed
    the raw recurrence ANCHOR `at` (last cycle's date — misleading); it now
    shows the calm cadence line — `nextAt` + `recurLabel` (« 12 oct. · tous
    les 3 mois ») — so the carnet answers "when do I care for this next?".
32. ⏸ **Print stylesheets for every share view** [S] ◐ — *plus tard.*
    (Babysitter sheet, intake card, recipe, week plan get `@media print`.)
33. ✅ **Search, findable** [S] ◐ — give SearchPage a permanent, obvious home
    (board header icon + a deep-link) and fold guide entries into the index
    (absorbs B-12). A thing exists in proportion to its entry points.

## E · The honest audit — obvious & overlooked

34. ✅ **Make degradation legible** [S] — Réglages ▸ Système ▸ Diagnostics
    gains a health card: each optional binding (AI, R2, DO), its state, and
    one line on what's hidden because of it (« IA non configurée → la capture
    devient un choix manuel »). Turns mystery-missing-features into a
    checklist.
35. ✅ **Data takeout** [S] — **SHIPPED 2026-07-07:** `GET /api/takeout`
    (operator-only, content-disposition download) over the shared
    `dumpHousehold()` (`functions/_lib/takeout.ts`): a GENERIC sqlite_master
    scan exports every table with a `household_id` (new migrations ride along
    automatically) + a junction map (task_participants, routine_runs,
    contact_group_members) + custom scoping for shared_trips
    (owner/participant); auth/token tables (operators, devices, guests,
    shares, pairing…) are deliberately EXCLUDED so a leaked export never leaks
    a credential; unscopable tables land in `skipped`, never silently. Media =
    a manifest of R2 keys (media_key/scene_key + recipe images), not blobs.
    Button: Réglages ▸ Système ▸ Diagnostics « Emporter mes données »
    (operator-only UI, online-only); Guide point on the `calm` card (« Tes
    données t'appartiennent ») + whatsNew.
36. ✅ **Backup beyond takeout** [M] — **SHIPPED 2026-07-07:** a Worker
    `scheduled` handler (worker/index.ts) + cron `10 7 * * *` (wrangler.toml
    [triggers], ~2-3 AM Eastern) dumps every household via the SAME
    `dumpHousehold()` to R2 (`backup/<householdId>/<date>.json`), keeps the
    newest 14, one household's failure never skips the others. R2 unset →
    no-op (optional binding). JSON only — the media blobs already live in
    that same bucket.
37. ✅ **Burn-in & battery care for the always-on panel** [S] — **SHIPPED
    2026-07-07:** the ambient clock/date/next block now pixel-drifts ±4 px
    through a 5×5 grid, one step per minute (~25-min loop; eased under
    no-preference, instant jump under reduced-motion — the protection holds
    either way; `AmbientScreen.tsx` + ambient.css). The deepened night veil
    already existed (deliberate, kept). Guide: « Prendre soin de l'écran »
    point on the screensaver card documents the drift + a recommended 30–50%
    brightness / night schedule.
38. ⏸ **Per-guest locale** [S] — *plus tard.* Guest links carry an optional
    `lang` so a unilingual relative sees *her* views (postbox, Le pont) in her
    language while the house stays québécois. Revisit when Le pont (D-26)
    lands — it's the natural moment.
39. ✅ **The UNIFORMIZING reds, scheduled** [M] ◐ — put wave 1 of the existing
    debt backlog on the calendar: **BE-1 unscoped DELETEs first (correctness)**,
    then FE-1 hand-rolled tabs, FE-2 recipe overlays, LIB-2 inline query keys.
    Comprehension work (A/B above) goes faster on uniform primitives.
40. ✅ **Accessibility beyond contrast** [M] — **SHIPPED 2026-07-07 (full
    audit + fixes).** Audit verdicts: **icon labels CLEAN** (every production
    icon-only button carries aria-label/title — RowActions, Modal ✕,
    HeartButton, VoiceButton, Act, all role=button divs; only 2 dev-only
    DevKit demos lacked one, fixed). **Focus CLEAN** — every overlay routes
    through `useModal` (Esc, focus-trap, restore-to-opener, scroll-lock):
    all Modal + Sheet consumers + 10 direct users verified.
    **Reduced-motion gaps FIXED:** the bottom sheet's viewport-height slide
    (capture.css) now `transition: none` under reduce; 9 imperative
    `scrollIntoView/scrollTo smooth` sites (FlyerViewer ×2, guide ×2,
    Kitchen, AddSheet, BusinessesTab, CercleNotes, VoyageItinerary,
    viewportVars) now use the new `lib/motion.ts scrollBehavior()` (reads the
    preference live per call). Tour/ambient/snow/pips were already gated.
    **44px hit targets FIXED:** edit-field ✕/submit/mic 40→44, reorder
    steppers 30→44 wide (height stays 30 — the ↑/↓ pair stacks in one row,
    documented), hearts ❤ min-44 (icon unchanged), recipe-scale +/− 35→44,
    meal-slot chips 35→44, note-editor format 37→44, cook timer ✕ 38→44,
    sheet close ✕ 40→44. Left as documented-deliberate: kitchen `.chip` 40px,
    `.list-row__toggle` 42px. All 74 overflow-guard e2e specs re-run green
    with the grown targets.
41. ✅ **The offline temp-id chain** [S] ◐ — **SHIPPED 2026-07-07:** a queued
    create now carries its optimistic `tmpId` (`WriteSpec.tmpId` → OutboxEntry,
    threaded via `useCreateWithUndo` from the two tmp-row sites: Liste add,
    todos add). On replay, `extractCreatedId` pulls the real id from the
    response and `rewriteTmpId` patches every later queued op still targeting
    the tmp id (path + body, persisted mid-replay). Pure helpers unit-tested
    (`src/lib/outbox.test.ts`); OFFLINE.md limitation updated with the one
    residual edge (acting in the create-landed→refetch window).
42. ❌ ~~**Kiosk recovery drill**~~ [S] — *rejeté.* (The « tablet is acting
    weird » Guide one-pager.)

## F · Out of the box — adjacent leaps that fit the soul

43. ❌ ~~**The morning briefing, spoken**~~ [M] ✦ ◐ — *rejeté.* (First
    presence-tap reads the day aloud.)
44. ❌ ~~**Paper mode — the week, printed**~~ [S] ✦ — *rejeté.* (The printable
    fridge sheet of the week.)
45. ❌ ~~**A « grandma kiosk » starter kit**~~ [L] ✦ — *rejeté.* (The
    second-kitchen constellation. Grandma stays a **guest** — the Simple lens
    + Le pont serve her *within* this household's orbit; no cross-household
    deployment story.)
46. ❌ ~~**Scribble-to-list**~~ [S] ✦ — *rejeté.* (Handwriting as an image
    chip on la liste.)
47. ✅ **A soft hourly presence — kiosk AND mobile** [S] ⚠ ✦ — **Marc:
    « garde, and add for mobile too while at it (still behind settings). »**
    **SHIPPED 2026-07-07:** at the top of the hour the ambient clock breathes
    once (a slow 2 s scale, `ambient-breath` keyframes; the 10 s tick catches
    the first ~20 s of minute :00). No sound, no badge, no content. New
    `hourlyBreath` pref in `lib/ambient` (default ON) + « Le souffle de
    l'heure » toggle in Réglages ▸ Mode veille; `prefers-reduced-motion`
    drops it entirely. Every surface — the idle timer already arms on kiosk
    AND mobile, and `/cast`'s Ambience screen inherits it. Guide point +
    whatsNew entry (`hourly-breath`).

---

## The three moves — revised after triage

1. **Symmetry: the post-reader joins the pre-reader — as a guest.** A-1 + A-2
   survived intact; D-26 (her one bookmark) is deferred, and F-45 (her own
   kiosk) is dead. The thesis stands at household scale: the toddler machinery
   is the accessibility layer for the other end of life, delivered through the
   Simple lens on this household's surfaces first.
2. **Legibility is the next feature — confirmed.** The comprehension slate
   (A-3/4/6/7/8/10, B-11/14/15, D-33) passed almost whole; the *artifacts*
   (video, printed manual, lens chips) were cut. Marc wants the app to explain
   itself **in-app, in flow** — not through side media.
3. **Joins, not systems — but only the ambient ones.** The daily-workflow
   joins (recipe×list, mots×draw, voyage×house) were all cut; the *ambient*
   joins (cast×ambient, carnets×cadence) survived. The pattern in the
   verdicts: grow the calm background layer, not the interaction surface.

## The approved plan (triaged 2026-07-07)

**Wave 1 — words & fear** *(all [S], no schema, no risk)* — **✅ SHIPPED
2026-07-07.** A-3 plain-words pass + A-7 human error copy (one i18n sweep:
capture degraded, board offline banner, login/save/fridge errors, uploads
« Envoi… », privacyBody, cercle blobHint, aiOff tag) · A-6 undo promise (the
« Récents » viewer already existed — added the one-time first-undo hint,
`babillard-undo-hint-seen`) · B-15 empty-state contract (written into
COMPONENTS.md row 1; taught the worst offenders: search, à-compléter,
businesses, carnet choses/entretien) · E-34 health card (« État des
services » in Système ▸ diagnostics; /api/health now also reports
`photos` + `realtime`).

**Wave 2 — daily speed** — **✅ SHIPPED 2026-07-07.**
C-18 `e2e/tap-budget.spec.ts` pins the measured budgets: supper tonight **0**
· who has the car **0** · check a list item **2** · add a list item **2** ·
browse flyers **2** (the honest front door is La liste's « Circulaires »
shortcut, not La cuisine) · see the meal week **1** · add a rendez-vous **3**
· run a routine **2** (the card's direct ▶ « Faire ») · open the next trip
**1**. Kid mode deliberately unbudgeted (one-way door is slow by design).
The DB-frequency audit is documented above, ready to run. · C-20
frequents-first comboboxes (`lib/frequents.ts` + `frequentsKey` on
EntityCombobox; wired: meals in DayEditor/MealPool, « Avec » in EventForm) ·
C-24 prefetch-on-press (HubLayout `TAB_PREFETCH`).

**Wave 3 — discoverability** — **✅ SHIPPED 2026-07-07.**

- **A-4 help mode everywhere — was ALREADY DONE** (the ◐ above was stale): all
  7 registries exist and are wired (`ADD_HELP`/`CERCLE_HELP`/`BOARD_HELP`/
  `KITCHEN_TAB_HELP`/`LISTE_HELP`/`OPERATOR_HELP`/`ROUTINES_HELP`), and P2-9's
  orphan check shipped 2026-06-26 as a compile-time guard (`useHelpMode<K>` +
  `satisfies` → an unregistered key fails `tsc`). Wave 3 added one entry per
  hub registry: the header loupe (see A-9/D-33 below).
- **B-11 « Le saviez-vous ? »** — `lib/discovery.ts` (`DISCOVERY_PROBES`: 7
  data-absence probes → GUIDE cards: voyage/mots/drawings/favorites/carnets/
  auto/todos; `pickDaily` day-rotation; unit-tested) + `DidYouKnowCard` in
  Découvrir (`operator/discover.tsx`, SectionIntro look). Conservative by
  construction: only shows when signed in, sample data cleared, and EVERY
  probe positively answered (an empty array, never a failed read). Dismiss
  is forever (`babillard-didyouknow-seen`).
- **A-5 adaptive tour — FULLY SHIPPED** (safe core 2026-07-07; auto-offer
  2026-07-08 after Marc settled the design): `buildDiscoveryTour()` assembles
  a runtime Tour from the same probes (intro + ≤6 card-linked stops, each
  handing off to its Guide card); `lib/tour.tsx` gained `startTour(tour)` for
  unregistered tours; the « Faire le tour (N trouvailles) » button rides the
  saviez-vous card when ≥2 features sleep. **Auto-offer (Marc's verdicts:
  local proxy · quiet badge · ≤1/month):** `lib/tourOffer.ts` — the
  power-user signal is a per-device write counter bumped by `writeWith()`
  (≥30 writes; a local heuristic, never displayed, never sent anywhere);
  eligibility also requires ≥2 features provably sleeping **from the query
  cache alone** (no fetch is ever fired for a dot) + parent audience + not
  guest/kiosk/locked + a 30-day cooldown. Surfaces as `.hubnav__whisper` —
  a tiny sage dot on the Réglages tab (no count, no red, aria-hidden);
  opening Découvrir stamps the offer (taken or not) so it rests a month.
- **B-14 « Quoi de neuf »** — `lib/whatsNew.ts` (hand-maintained, newest
  first, 3 seed entries) + `WhatsNewLine` in Découvrir: ONE line, newest
  undismissed, dismiss-forever per device. Discipline note in COMPONENTS.md:
  a user-visible feature PR adds one line at the top.
- **D-33 search findable — mostly ALREADY THERE** (stale ◐ again): the loupe
  already sat in every hub-tab header (HubHead, parent-only) and guide entries
  were already in the SearchPage index. Wave 3 closed the real gaps: the
  documented `/search?q=…` deep-link now actually works (input seeds from the
  URL + mirrors back, replace-state), and search got its own GUIDE card
  (`search`, board bucket) — so search is findable *in the manual and in
  itself*. (B-12 absorbed, as planned.)
- **A-8 demo sandbox « Essaie sans peur »** — public `POST /api/demo`
  (CSRF-exempt like signup): lazily creates the singleton demo household
  (sentinel operator `demo@babillard.invalid`, unguessable password), keeps it
  seeded (reseeds when >24 h stale so dates stay alive), mints a 4 h READ-ONLY
  `showcase` guest token, and the marketing page's new « Essayer la démo » CTA
  boots it through the normal `?guest=` door (existing watermark banner).
  Réglages side: `SampleDataControls` gained the one-tap « Repartir les
  exemples à neuf » (clear+reseed). **CLOSED 2026-07-08 — Marc: the read-only
  demo suffices.** The writable public sandbox is not built and not planned
  (zero abuse surface, zero upkeep; writing comes with signup). Revive only
  if the read-only demo demonstrably fails as the sales demo.
- **A-9 icon labels (soft only)** — audit found every icon-only button already
  carries `aria-label`; the gaps were hover labels and the un-explained header
  loupe. Shipped: `title` (= aria-label) on SceneHead ✕, RowActions ✏/🗑, the
  ＋ FAB, the board profile chip, the nav-reopen caret, the kitchen day pencil;
  and the loupe is now help-mode pickable on all five hub tabs (HubHead
  `searchPick` + a `search`/`globalSearch` entry per registry). No visible
  words added anywhere. (No long-press primitive exists in the codebase; the
  title+help-mode route covers the soft ask — a hold-to-reveal label hook
  remains a possible later refinement.)
- **A-10 contrast & type floor** — measured every `-deep`-on-wash pair across
  day/night/twilight/deep-twilight: ALL six failed 4.5:1 in day, twilight
  failed even the 3:1 glyph bar. Fixed in tokens (`core.css`): a new
  **`--*-ink` section-text tier** (six colours × four themes, ≥4.5:1 on wash,
  annotated with ratios) which `SECTION_TINT.ink` now resolves to; `-deep`
  stays the glyph tier with per-theme nudges past 3:1 (day marigold/sky,
  night berry, all six in twilight, terracotta/berry in deep-twilight);
  `--ink-faint` darkened to clear 4.5:1 on every daypart paper (dusk was
  4.18); an `@media (prefers-contrast: more)` bump mirroring the
  `data-contrast='high'` profile when no explicit in-app choice was made; and
  the type floor — the sub-`--text-xs` literals (0.72/0.74rem tag/eyebrow/
  setup-step) raised to `var(--text-xs)`. Off-token literals in page CSS stay
  for the UNIFORMIZING type sweep.

**Wave 4 — the grandma arc** — **✅ SHIPPED 2026-07-07 (merged to `main`).**

- **A-1 « Simple » audience lens — ✅ SHIPPED.** The axis: `Audience` widened to
  `parent | toddler | simple` (`lib/audience.ts`); the `?simple=1` boot latch +
  `babillard-simple-lock` mirror `?kid=1` (`main.tsx`), `locked = kidLocked ||
  simpleLocked`; `unlock()` clears both; the ~1.4× type bump is a root
  `data-lens='simple'` attribute (core.css rule + `main.tsx` effect +
  `theme-bootstrap.js` pre-paint, same mechanism as `data-text-scale`);
  HubLayout gained `simple`/`restricted` so the simple lens hides Réglages + the
  ＋ FAB + the collapsible rail and gets an **exit gate** (`KidExitGate
  requireMath={false}` — a 3s hold, NO math: a capable adult, not a pre-reader);
  the Réglages audience switch gained a 4th **Simple** button
  (`operator/display.tsx`). Simple **inherits the PARENT views** on every tab
  (real words, full capability — she reads fine), just bigger + calmer.
  The board: **`SimpleBoard`** (`components/board/SimpleBoard.tsx`) — four calm
  zones off the same `useBoardData`: three one-tap `.bigtile` door-Links
  (Aujourd'hui → `/moment?scope=tonight`, Souper → `/kitchen`, La liste →
  `/liste`), each answering its question right on the tile (next thing today,
  tonight's supper, the first few list items by NAME — never a count), + the
  fridge Notes inline as the fourth zone. Branched in `Board.tsx` before the
  toddler branch; tiles wear their hub section's nav colour and carry
  `data-speak`. e2e: `Audience` widened in `e2e/mocks.ts`; a `?simple=1` lock
  spec in `e2e/interactions.spec.ts` mirrors the kid-lock one (no settings, no
  FAB, `/settings` bounces, 3s hold exits with NO math) — passing.
- **A-2 tap-to-hear everywhere — ✅ SHIPPED.** `lib/tapToHear.ts`: ONE
  shell-level ~500 ms long-press listener (mounted by HubLayout) on
  `[data-speak], .act, .listrow, .note-card, .bigtile, .today-hero, .sayable` →
  `useSpeak()`; active only in toddler/simple + a per-device pref
  (`babillard-tap-to-hear`, default ON, `createDeviceStore`), toggled in
  Réglages ▸ Système ▸ Affichage ▸ **Voix** (« Toucher pour entendre »).
  Defensively scoped as surveyed: skips `[data-dnd-zone]`, `.kid-exit-switch`,
  form fields, open modal/tour; aborts on >8 px travel (passive listeners,
  scroll stays native); suppresses the OS context menu on targets and swallows
  the ONE post-hold click so hearing never also acts. A hub.css rule drops the
  OS text-selection callout on those rows in the simplified lenses. Guide:
  the `audience` card grew « Vue simple » + « Toucher pour entendre » points;
  `whatsNew` entry `simple-lens`; COMPONENTS.md rows for both.
  **Known limit (fine for v1):** the listener lives in HubLayout, so
  full-screen scenes OUTSIDE the hub shell (`/moment`, cook mode) don't
  long-press-speak — their surfaces already have their own read-aloud
  affordances.

*(D-26 Le pont deferred to the plus-tard shelf per OQ-3.)*

**Ambient & platform (continuous, order-free)**
~~D-30 cast×ambient~~ ✅ (was already shipped) ·
~~D-31 carnets upkeep cadence~~ ✅ 2026-07-07 (was ~95% built; carnet rows now
show nextAt + cadence, not the raw anchor) ·
~~F-47 hourly breath~~ ✅ 2026-07-07 · ~~E-35 takeout~~ ✅ 2026-07-07 ·
~~E-36 nightly backup~~ ✅ 2026-07-07 ·
~~E-37 burn-in care~~ ✅ 2026-07-07 · ~~E-41 temp-id chain fix~~ ✅ 2026-07-07 ·
~~E-39 UNIFORMIZING reds~~ ✅ (audit shows BE-1/BE-2/FE-1/FE-2/LIB-2 + Phases
0–2 all landed — the "reds" note was stale; what remains in UNIFORMIZING.md is
Phase 3/4 opportunistic work) · ~~E-40 a11y pass~~ ✅ 2026-07-07 (audit: labels
+ focus already clean; fixed sheet-slide + 9 smooth-scrolls under
reduced-motion, 8 hit-target families to 44px) ·
~~C-23 offline-aware code-splitting~~ ✅ 2026-07-07 (heic2any out of the
precache + `check:bundle` CI guard enforcing precache-completeness + budgets).

**→ Every approved item of bmad/08 is now shipped** (waves 1–4 + the whole
ambient/platform continuous set), **and the two ask-Marc follow-ups are
settled (2026-07-08): A-5 auto-offer BUILT (local write-counter signal ·
whisper-dot on Réglages · ≤1/month) · A-8 CLOSED (read-only demo suffices,
writable sandbox not planned).** Left open on purpose: the plus-tard shelf
and the rejected list (never re-propose). Next streams per Marc:
UNIFORMIZING Phase 3/4 opportunistic + a fresh bmad/09 product pass.

**Plus tard shelf:** C-25 rush-hour diet · D-26 Le pont (deferred per OQ-3;
revive by picking the 2–3 real relatives first) · D-32 share-view print
styles · E-38 per-guest locale (rides along with D-26).

**Rejected (do not build, do not re-propose):** B-13 fridge manual · B-16
video embed · B-17 lens chips · C-19 long-press mic · C-21 PWA shortcuts ·
C-22 NFC/QR waypoints · D-27 acheter cette recette · D-28 drawn mots · D-29
voyage joins · E-42 recovery one-pager · F-43 spoken briefing · F-44 paper
mode · F-45 grandma-kiosk constellation · F-46 scribble-to-list.

## The Grandma Test, as a checklist (run it on a real human)

> A **protocol you run**, not work in this file — copy these six lines into the notes of
> the session where you sit someone down with the tablet, and tick them there. No
> checkboxes here: a `- [ ]` in this repo means open work (`STATE.md` §2), and these
> were six of the boxes that made the repo-wide count wrong.

- 60s unaided: says what the app is (A-3 words / A-8 demo)
- Finds tonight's supper in ≤2 taps (C-18)
- Adds « lait » to the list by voice or typing (capture spine)
- Undoes it, unafraid (A-6)
- Hears something read aloud (A-2)
- Never once saw jargon, an error code, or a dead end (A-7, E-34)

## Open questions — all answered except OQ-4

- ~~**OQ-1** guest vs. second kitchen~~ — **answered by triage:** grandma is a
  guest (F-45 rejected). The Simple lens serves this household's surfaces
  first; Le pont (deferred) would later serve her from her own phone.
- ~~**OQ-2** the real daily top-ten~~ — **answered:** meal plan, liste,
  flyers, board, calendar, trip, car, routines, kid mode ("maybe more") —
  plus Marc's method upgrade: derive/confirm the list from DB entity
  write-frequency. Folded into C-18.
- ~~**OQ-3** Le pont's real users~~ — **answered: defer Le pont.** Moved to
  the plus-tard shelf; revive by naming the 2–3 real relatives first.
- **OQ-4** (still open) How much of Wave 1 do you want done autonomously vs.
  reviewed idea-by-idea? (Wave 1 is all no-risk copy/UI polish.)
- ~~**OQ-5** define "power user" for the adaptive tour~~ — **answered: the
  ones who edit the most and use the full functionality — no guest, no kid,
  no small-subset surface.** Folded into A-5.
