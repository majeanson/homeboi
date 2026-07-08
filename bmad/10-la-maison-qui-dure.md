# 10 · La maison qui dure — the house a family still opens in a year

> Fifth ideas doc. `05` asked _what else could it do?_, `06` asked _what could
> it reach?_, `07` gave the house cared-for members, `08` asked _can anyone
> understand it in five seconds?_, `09` taught the house to remember its year.
> This one asks the only question left that matters:
>
> **A year from now, on a rainy Tuesday in March, does a real family still
> open this — every day, without anyone "maintaining" it?**
>
> The audit behind this doc walked the code as five personas for a full week
> (parent on the phone, the wall at 7am, the toddler, the babysitter link, the
> relative), rebuilt the bundle, and re-read every verdict of 05–09. Its
> finding: the risk is no longer missing features. It is three quieter things —
> **the week-two cliff** (calm here is achieved by self-hiding empty cards, so
> liveliness is proportional to manual feeding, and the surfaces that most
> need feeding are exactly the ones a busy family drops first), **the silent
> lie** (a handful of narrow paths where the house can lose a word or show a
> stale board without saying so), and **the sprawl** (three renderers of the
> same board, four meal-idea pools, 30 Réglages sub-sections). So this doc's
> axes are friction, trust, pruning, reach — and a couple of ✦.
>
> Checked against every ❌ of 07/08/09: **nothing rejected returns.** Two ⏸
> plus-tard items are deliberately proposed for re-opening and marked **↻**
> (09 said a future doc may re-open them — this is that doc).
>
> **STATUS: TRIAGED 2026-07-08 (Marc, item-by-item) — 16 garde · 5 plus
> tard · 2 rejetés. Execution planned in waves; build from here.**
> Verdict legend (same as 08/09): **✅ Garde** · **⏸ Plus tard** ·
> **❌ Rejeté**. Effort: **[S]** small / **[M]** medium / **[L]** large ·
> **⚠** calm-tenet tension · **✦** out-of-the-box · **◐** partially exists ·
> **↻** re-opens a 08/09 plus-tard.

---

## North star

Durability, not novelty. Three commitments:

- **The house survives neglect.** A family that only uses la liste + les
  soupers must still find the wall worth glancing at in month six. Derived
  content (weather, fêtes, birthdays, l'année) already needs no feeding —
  the fed surfaces should either get cheaper to feed (one tap, not seven
  scenes) or degrade into something honest, never into blank decor.
- **The house never lies and never loses a word.** Every add queues or says
  why not. A stale board says it's stale — even when the wifi icon looks
  fine. A write that dies tells you, keeping your words. Backups are visible,
  export is real. Trust is the retention feature.
- **The house sheds weight as it grows.** Pruning is a first-class outcome of
  this doc, not a failure: fewer parallel renderers, fewer idea pools, fewer
  settings pills — same features, less machine.

**The calm line (non-negotiable, test-enforced, unchanged):** no streaks, no
points, no badges, no push, no counts, no feeds. Nothing below adds one.

**The acceptance bar:**

> _Next March: nobody has touched Réglages in a month, the meal plan lapsed
> in January, and the phone had no signal in the basement twice this week.
> The board is still telling the truth, the list still filled itself at the
> store without losing a word, and when someone finally plans a week again
> it takes one minute, not seven screens. Nobody thought about the app —
> which is why they still use it._

---

## A · La falaise de la deuxième semaine (friction & stickiness)

1. ❌ ~~**« Remplir la semaine »**~~ [M] ◐ — _rejeté (Marc, 2026-07-08). Do
   not re-propose._ ~~The most-repeated kitchen job is the most tedious:
   planning Mon–Sun means seven full-screen round-trips through
   `/kitchen/day/:date` (the grid is read-only; the ＋ day-picker routes to
   the same scene). Give the 7-day grid a quick-assign layer: tap an empty
   day → a one-line picker (ideas pool, favourites, « comme la semaine
   passée » from meals history). The day scene stays THE editor; this is
   only a faster hand.~~ The seven day-scenes stay the planning model.
2. ✅ **La capture tient parole** [S] ◐ — _garde (2026-07-08)_ — AddSheet
   capture is the ONE add-path with no outbox: offline or on any 4xx/5xx it
   flips `captureErr` and the dictated text just sits in the box — while the
   i18n copy already promises « Ton texte est gardé ». Make the promise
   true: on failure, queue the raw text through the outbox (route it on
   replay, or degrade to the manual type-picker that already exists for
   AI-unset) so a parking-lot dictation is never lost. The parent's "never
   lost" guarantee must not have an asterisk on its front door. _(reuse:
   useWrite/outbox, the AI-unset type-picker fallback, existing
   `capture.offline` copy.)_
3. ✅ **« Depuis ce matin »** [M] ⚠ ✦ — _garde (2026-07-08)_ — the question
   a two-parent household actually asks — _what changed since I last
   looked?_ — has no home: RecentsPanel is this-device-only and « Quoi de
   neuf » is a product changelog. Give it a **pull-only** answer: tap the
   board greeting → a peek listing today's writes by FACE (« Papa a ajouté
   du lait · Léa a proposé une pizza »), derived entirely from existing
   `created_at` + attribution columns (D-17 of 09: zero new tables), one
   cold read (D-18 of 09: never polled), gone when closed. ⚠ this is the
   doc's sharpest calm edge: it must never become a badge, a count, or a
   persistent feed — it exists only under the finger that asked. _(reuse:
   EntityDetailSheet, Avatar, the house-diary client-union pattern from 09
   B-8.)_
4. ✅ **« À régler » sur le mur** [S] ◐ — _garde (2026-07-08)_ — the nudge
   card is gated `surface === 'mobile'` — disabled on the kiosk, the one
   always-glanced surface a household shares. Surface it on the kiosk parent
   lens (read-only listing if kiosk write-scope is the blocker). _(reuse:
   ARegler as-is; it's one gate.)_ **SHIPPED same day to that shape:** the
   blocker was real (`functions/api/a-regler.ts` was `authed(…, 'operator')`,
   so a kiosk token 403'd) — dropped to plain `authed(...)` with an in-handler
   guest short-circuit (`return ok({ signals: [] })`, before any query, so a
   sitter never gets the friction scan); `Board.tsx`'s gate is now
   `enabled={audience === 'parent' && !ro}` (a locked kiosk is toddler audience
   → still hidden). The card's fixes were already all navigations a kiosk can
   do (`/kitchen/day`, `/liste`, `/cercle`, `/settings?tab=board&sub=thisweek`)
   — no write-scope workaround needed.
5. ⏸ **Les visages s'allument sur la liste** [S] ◐ — _plus tard (2026-07-08
   — not selected this wave)_ — per-item face discs exist on la liste, but
   neither the inline add nor the ＋ sheet passes the picked face
   (`added_by`), so the affordance rarely lights up. Audit whether the
   server honours `X-Profile` here; wire whichever end is dropping it.
   _(reuse: the discs, MemberSwitcher's picked profile, X-Profile already
   sent by api().)_
6. ✅ **« Joindre » — the phone book up front** [S] ◐ — _garde (2026-07-08)_
   — "call the dentist" is a 3-tap hunt across Famille/Social/Business
   sub-tabs; tel:/mailto links render only deep in a card. Put one
   **Joindre** rail at the top of Le cercle on mobile: frequent/recent faces
   + businesses, tap-to-call. The genealogy depth (Arbre, Liens, Monde)
   stays exactly where it is — this just puts the everyday job first.
   _(reuse: the C-20 frequents ranking, Avatar, Rail, existing tel: links.)_

## B · La confiance (the house never lies, never loses)

7. ✅ **La ligne de vérité** [S] — **SHIPPED 2026-07-08 (same shape as
   planned: OfflineBanner's second, independent condition).** `lib/query.ts`
   exports `liveInterval` (the existing awake/asleep × realtime gear picker,
   unchanged logic — just made readable elsewhere). `lib/online.ts` adds the
   pure `isStaleAt(newestMs, nowMs, gearMs, anyFirstRetryInFlight)` (threshold
   `max(3 × gearMs, 90_000)` — floors the two fast gears at 90 s, trips the
   idle gear at 6 min so a healthy idling kiosk never trips it) + the
   `useDataFreshness()` hook (aggregates `max(dataUpdatedAt)` over queries
   tagged `meta.live === true`, re-checked on a 5 s timer + on every query-cache
   change; suppresses the flag while a live query's FIRST fetch attempt is
   in-flight — `fetchStatus 'fetching' && fetchFailureCount === 0` — killing the
   resume-from-background flash with no debounce timer). `OfflineBanner`'s
   second condition (`online && stale`) renders the same `.offline-bar` with a
   cooler `--stale` tint (`--sky` instead of the true-offline `--marigold`), a
   clock icon instead of the wifi glyph, and « Données de HH:MM » (`offline.stale`,
   FR+EN) — no pending count needed since nothing failed to send. True-offline
   still wins. Exhaustive `online.test.ts` vitest table (every real poll gear ×
   boundary, the 90 s floor, the 6-min idle trip point, first-fetch suppression,
   no-data-yet, degenerate gear) + `e2e/data-staleness.spec.ts` (real TanStack
   Query state under `page.clock.install()`/`fastForward` proves the wiring
   fires, not just the pure math). Guide `offline` card gains a point (appended
   at the end); whatsNew `stale-stamp`. _(reuse: OfflineBanner + the
   `dataUpdatedAt` it already reads — extended, not forked.)_
8. ⏸ **La file d'attente, visible** [M] — _plus tard (2026-07-08 — parked
   whole, including the minimal silent-loss half)_ — today the outbox is a
   count, shown only while offline. Meanwhile: a queued write that 400s is
   **silently dropped** (the optimistic row just evaporates on the next
   poll), a 5xx retries forever with no cap — and a stuck entry keeps
   `useDeferredRemoval` holding deleted rows hidden indefinitely. The
   contract fix when revived: (a) keep the « N en attente » chip visible
   while draining, even once online; (b) a dropped 4xx surfaces one toast —
   « une chose n'a pas pu être gardée » — with the text preserved; (c) a
   small « En attente » list under Réglages ▸ Système ▸ diagnostics with
   retry/cancel; (d) an aging cap on 5xx loops. _(reuse: outbox.ts,
   OfflineBanner, toast, the diagnostics sub.)_
9. ✅ **Idempotence dès le premier geste** [S] — **SHIPPED 2026-07-08** — the
   server-side idempotency ledger only engaged on outbox **replay** (fresh
   key per enqueue); a normal online create sent no key, so a double-tap on
   flaky wifi (response lost, user re-taps) could double-apply. `writeWith`
   (`src/lib/write.ts`) now hoists ONE key above the online attempt and
   reuses that SAME key whether it lands online or gets queued after a
   transport failure — a lost-response re-tap and a later replay both dedup
   against the ledger instead of double-applying. `api()`'s guest read-only
   backstop, which used to key off "an idempotencyKey is present" to
   recognize a replay, now tests an explicit `replay` flag instead (key
   presence alone no longer implies replay). Scope stays `writeWith` only —
   direct `api()` writes stay keyless on purpose (no retry loop → nothing to
   dedup). _(reuse: `_lib/idempotency.ts` unchanged server-side.)_
10. ⏸ **La sauvegarde qu'on peut voir (et emporter)** [M] ◐ — _plus tard
    (2026-07-08 — parked whole, including the [S] status-line half; restore
    per OQ-3 is agreed as a user-facing [L] in a future doc)_ — E-36's
    nightly backup runs invisibly (R2, 14 days) and **silently no-ops if R2
    is unset**; E-35's takeout exports JSON with a *manifest* of photo keys,
    not the bytes — so it is not a true photo backup, and there is no
    restore. When revived: (a) a « Dernière sauvegarde : cette nuit ✓ » line
    in Système ▸ diagnostics + honest copy when R2 is unset; (b) media bytes
    in the takeout (zip stream); (c) the restore/import [L]. _(reuse:
    dumpHousehold, takeout.tsx, the E-34 degradation-legible rule.)_
11. ✅ **Le régime tablette-cheap** [M] ◐ — _garde (2026-07-08, full scope
    including the realtime revisit)_ — the build is healthy (heic2any's
    1.35 MB is correctly online-only and un-precached) but two always-loaded
    costs remain: the **261 kB icon chunk** (Phosphor set — audit whether
    it's truly shaken to used glyphs) and the **317 kB single CSS file**;
    plus first install precaches all ~150 route chunks (right for
    NFR-OFFLINE-1, heavy for a cheap tablet — worth measuring, not
    assuming). Same item, server side: `REALTIME_ENABLED` is currently
    **false**, so every device runs fast-gear polling. **Marc doesn't
    remember why it's off (OQ-5)** — investigate via git history and
    behaviour, then decide inside this item; re-enabling the DO push is the
    single free-tier capacity lever we already built. _(reuse: everything
    exists; this is measurement + flags.)_

## C · Cohérence & élagage (pruning is a deliverable)

12. ✅ **Un seul modèle du babillard, trois lentilles** [M] — _garde
    (2026-07-08)_ — parent, toddler and Simple boards are three hand-synced
    renderers of the same data: `dayClear`, `kidAllClear` (~12 mirrored
    conditions), and per-lens meal-visibility logic must be kept in
    agreement by discipline. Extract ONE board view-model (what exists
    today, what's empty, what's next) that all three lenses render.
    Invisible to users; removes the class of "the kid board disagrees with
    the parent board" bugs and makes every future card one change instead of
    three. _(reuse: pure refactor inside Board.tsx + SimpleBoard.)_
13. ✅ **Un seul moteur ambiant** [M] ◐ — _garde (2026-07-08)_ — the
    screensaver (AmbientScreen), the cast ambient scene, and the board's
    all-clear wonder-photo hero are three renderings of "the house at
    rest," each with its own next-up logic. Fold into one ambient-scene
    provider that all three consume. (09's B-7 verdict stands untouched: the
    mosaic stays un-curated — this unifies plumbing, never content.)
    _(reuse: lib/ambient.ts as the home; PhotoMosaic, CAST_SCENES,
    WonderBand stay the faces.)_
14. ✅ **Un seul tiroir d'idées-repas** [M] ◐ — _garde (2026-07-08)_ —
    "what's for supper" is answered by four+ pools (AI ideas, book ideas,
    vide-frigo, the kept-ideas pool, leftovers-to-plan, toddler
    suggestions): a family learns one and never finds the rest — dormant
    machinery. Converge on ONE « Idées » drawer with source chips (⭐
    favoris · 🧊 à écouler · 🤖 IA · 👧 proposé par), reachable from both
    the grid and the ＋ sheet. Bonus stickiness: a child's suggestion
    becomes **visible** — a small « Léa propose 🍕 » chip on the empty day
    tile, so the toddler's one write finally has an on-screen consequence
    (today only the narration confirms it). _(reuse: MealPool as the body;
    vide-frigo keeps its identity as a chip, per its own memory. A-1's
    rejection stands — the drawer serves the ＋/grid entry points that
    already exist, it does not become a week-filler.)_
15. ✅ **Trois pinceaux, un pot** [S] — _garde (2026-07-08, including the
    standing rule)_ — La cuisine's Réglages has three separate
    colour-tinkering sub-sections (Étiquettes, Pastilles, Couleurs de
    mesure) among its five — fold into one « Apparence » sub. And fold the
    P2-9 drift while there: `ADD_HELP`/`CERCLE_HELP` one-liners that restate
    `GUIDE.what` differently should source from the guide. Réglages counts
    30 subs today; **standing rule adopted: any new setting must name the
    sub it merges into, not add a pill.** _(reuse: the subs' own bodies;
    UNIFORMIZING P2-9.)_
16. ⏸ **La question « quel genre ? » posée plus tard** [S] — _plus tard
    (2026-07-08 — not selected this wave)_ — adding a task forces a
    chore/upkeep/plan classification *before* a stressed parent knows the
    difference (and AI capture guesses it anyway). Default the ＋ path to a
    loose chore; reclassifying becomes a one-tap action on the item's detail
    peek, after the thing is safely captured. Capture first, taxonomy later.
    _(reuse: the existing kinds + detail peek; nothing new.)_

## D · La portée (reach, without ever getting louder)

17. ✅ ↻ **La rentrée** [M] ◐ — _garde, rentrée half only (Marc, 2026-07-08:
    « Rentrée only » — the 08-C-25 rush-hour diet half STAYS ⏸ parked)_ —
    re-opens 09-A-3: the household types its school-year bounds once a year
    (first/last day, relâche — ONE settings card, no imports); the board's
    « Demain » knows a school morning from a vacation morning; the year view
    (09 A-1) gets its school-year bounds for free. The rush-hour
    content-diet remains parked as 08-C-25 for a future doc. _(reuse:
    lib/year.ts as the home (09 D-16), the board card machinery.)_
18. ✅ ↻ **« Le pont », version minimale — des proches durables** [M] ◐ —
    _garde (2026-07-08 — Marc: nobody concrete yet, **build the mechanism
    generically**; the 08 revive condition is waived in favour of a generic
    shape)_ — every relative-facing finding points at the same root: guest
    links are **stateless and short** (sitter caps at 24 h — a weekly
    babysitter needs a fresh link every time; grandma's postbox link
    silently dies within 7 days after she bookmarked it), and a relative who
    drops a word gets no sign it was ever received. The smallest useful
    shape: a **named, standing, revocable** guest (« Mamie », « Rosalie la
    gardienne ») whose link doesn't expire until revoked, whose landing
    composes what her token allows, with one closing hint when the operator
    accepts a postbox drop (« reçu ✓ » on her next visit — pull, not push).
    E-38 per-guest locale rides along as designed. _(reuse: guest-links
    table + guestScope allowlists, HandoffPage, Postbox, GuestExpired.)_
19. ✅ **La carte de la gardienne se complète** [S] ◐ — _garde (2026-07-08)_
    — the sitter card is the strongest guest surface in the app, and it
    fails exactly once: when minted over missing data, the sitter's only
    screen is a terminal empty state. At mint time, show the operator what
    the card will actually contain (« il manque : contacts d'urgence,
    allergies — compléter ? ») before the link goes out; and add one opt-in
    « joindre un parent » line (the operator's number) so mid-evening plan
    changes have a channel. _(reuse: HandoffPage sections know their own
    emptiness; ShareInfoEditor; Aperçu already exists on share links.)_
20. ❌ ~~**Les rendez-vous qui reviennent**~~ [S] ◐ — _rejeté (Marc,
    2026-07-08). Do not re-propose._ ~~Dentist every 6 months, coiffeur, the
    vet via the pet's carnet: seed-shaped recurring appointments per member,
    the 09-A-4 SEASON_SEEDS pattern.~~ Recurring appointments are typed by
    hand through the normal event flow.
21. ✅ **« Sortir le bac »** [S] ◐ — _garde (2026-07-08)_ — bin day is
    already stored (the sitter card shows it); the family never sees it. One
    derived evening line on the board the night before (« c'est le soir du
    bac bleu »), toddler-hearable, opt-out — mechanically a sibling of the
    fêtes announce lines (09 A-2): derived, nobody's, zero new tables.
    _(reuse: ShareInfoEditor's bin data, the A-2 announce-line pattern,
    itemLife for the evening window.)_

## E · ✦ Hors-piste

22. ✅ ✦ **« Demande à la maison »** [M] ◐ — _garde (2026-07-08)_ — the
    house knows when the dentist appointment is, what's planned Thursday,
    whose birthday is next — but only navigation can answer. One pull-only
    voice question on the kiosk (hold the mic: « c'est quand le rendez-vous
    chez le dentiste ? ») → Workers AI answers over the household's own
    data, speaks it, done. Strictly on-demand (AI is already per-ask),
    degrades to the search box when AI is unset, never listens ambiently —
    the mic opens under a finger, period. ◐: an `/api/ask` handler and D-33
    search already exist as the retrieval spine. _(reuse:
    VoiceButton/useVoiceInput, capture's transcribe path, search index,
    TTS.)_
23. ⏸ ✦ **L'app grandit avec l'enfant** [M] — _plus tard (2026-07-08 — not
    selected this wave)_ — the toddler lens is pitched at a pre-reader, and
    children stop being pre-readers. Derive a reading stage from the
    birthday the house already knows: around 6–7, Réglages quietly *offers*
    (whisper-dot loudness, the 09 maximum) « Léa lit maintenant ? La vue
    Simple lui irait peut-être mieux » — one tap to switch that device's
    lens, never automatic, never a milestone banner. _(reuse:
    members.birthday + ageAt (09 B-11), the Simple lens (08 A-1), audience
    machinery.)_

## F · Guardrails (what this doc must NOT become)

- ❌ **No feed, ever.** A-3 (« Depuis ce matin ») is the closest this doc
  walks to the cliff: it renders only under the finger that asked, shows
  faces + items (never counts), and leaves no unread state behind. If it
  can't be built that way, it dies in triage.
- ❌ **No re-litigating the seventeen — now nineteen.** The ❌ items of
  07/08/09 (idle-photo bias, first-snow moments, birthday arc, printable
  manual, promo-in-app, lens chips, long-press mic, PWA shortcuts, NFC
  waypoints, acheter-cette-recette, mots-TTS converge, voyage×house joins,
  kiosk drill, spoken briefing, paper mode, grandma kit, scribble-to-list)
  stay dead — joined by this doc's A-1 (remplir-la-semaine quick-assign) and
  D-20 (appointment seeds). Only ↻ items marked here re-open, and only the
  ⏸ ones.
- ❌ **No new tracking columns, no new polls.** 09's D-17/D-18 stand: every
  derived surface above reads existing timestamps, cold-path, one new read
  at most. The calm-tenets test stays green by construction.
- ❌ **Pruning may not orphan the map.** Every fold (C section) updates
  COMPONENTS.md, /dev/kit, and the guide in the same change — a merged
  surface that still shows two guide cards is half-pruned.
- ❌ **Trust fixes never get loud.** The sync line, the outbox chip, the
  backup line are one quiet sentence each in existing surfaces — no error
  modals, no red banners, no "reconnecting…" spinners.

---

## Open questions for Marc

- ~~**OQ-1 — The week-two stance.**~~ — **answered (2026-07-08): the décor
  floor bothers him.** A-1's *specific shape* is rejected, but the problem
  stays open as a standing note: future docs should keep looking for calm
  ways to keep the fed surfaces alive. 10's derived lines (fêtes, bacs,
  rentrée) are the first answer; they are not declared sufficient.
- ~~**OQ-2 — The two re-opens (↻ 17, 18).**~~ — **answered (2026-07-08):
  D-17 garde as rentrée-only (rush-hour stays parked as 08-C-25); D-18 garde
  with the revive condition waived — no concrete relatives named, build the
  durable-guest mechanism generically.**
- ~~**OQ-3 — Restore.**~~ — **answered (2026-07-08): a user-facing
  restore/import is worth an [L] in a future doc** — not this one; B-10
  (backup visibility + bytes-in-takeout) is parked with it.
- ~~**OQ-4 — Pruning consent.**~~ — **answered (2026-07-08) via the C
  verdicts: all four folds garde (C-12/13/14/15); only C-16 (kind-later)
  parked. Nothing declared off-limits.**
- ~~**OQ-5 — Realtime.**~~ — **answered (2026-07-08): Marc doesn't remember
  why `REALTIME_ENABLED` is false.** B-11 (garde) starts by investigating
  git history/behaviour, then decides whether to re-enable.
