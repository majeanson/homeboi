# 08 · The Grandma Test — understand it, drive it faster, finish what's half-there

> Third ideas doc, with a deliberately different question than `05` (50 features)
> and `06` (50 lifestyle reaches). Those asked **"what else could it do?"**
> This one asks: **"the app now does ~40 things — can a first-time 70-year-old,
> a tired parent at 6:45am, and a babysitter each understand it in five seconds
> and do the thing they came for in two taps?"**
>
> Four lenses: **comprehension** (grandma & anyone), **speed** (taps + latency),
> **completion** (features that go hand-in-hand with what exists but stopped at
> 80%), and **the honest audit** (obvious/overlooked things nobody wrote down).
>
> Same legend: **[S]** small / **[M]** medium / **[L]** large ·
> **⚠** calm-tenet tension (needs the gentle, opt-in, no-count treatment) ·
> **✦** out-of-the-box · **◐** partially exists — the idea is the missing 20%.
> Grounded in real code (`lib/tour.tsx`, `useSpeak`, `guideContent`, the
> audience axis, share modes, the promo-video pipeline…). Nothing committed.

---

## North star

The brief says a **pre-reader is a first-class user**. The unfinished symmetry:
**a post-reader is too.** Grandma is already *in* the product — she writes to the
postbox, fills an intake card, opens a guest link — but she was never designed
for. She is the toddler's mirror: big targets, spoken words, picture-first,
zero fear of breaking something. Almost everything built for the three-year-old
(TTS, pictos, locked lenses, hear-first pickers) generalizes to her for free.

**The Grandma Test** (the acceptance bar every idea below serves):

> *Hand a first-time visitor the tablet. Within 60 seconds, unaided, they can:
> (1) say what this thing is, (2) find what's for supper, (3) add "lait" to the
> list, and (4) undo it — without fear, without reading a manual, without help.*

Second insight: the app's own success created its comprehension problem. Six
tabs, ~40 features, three surfaces, two audiences, five guest kinds. `05`/`06`
grew the surface; this doc grows the **legibility** of that surface. A feature
nobody can find or explain is inventory — and we don't do inventory.

---

## A · The Grandma Test — comprehension for absolutely anyone

1. **A third audience lens: « Simple »** [M] ✦ — the flagship idea. The audience
   axis (`lib/audience.ts`) is `parent | toddler`; add **`simple`** — the
   post-reader lens. Board collapses to four giant tiles (Aujourd'hui · Souper ·
   La liste · Notes), type scales up ~1.4×, secondary chrome hides, every card
   is tap-to-hear. Boots locked via `?simple=1` exactly like `?kid=1`. This is
   *not* a new app — it's the toddler-lens machinery pointed at the other end of
   life. Grandma's kiosk in her own kitchen becomes a real product surface
   (see F-38). *(reuse: audience context, locked-kiosk pattern, `KidView`'s
   filmstrip philosophy, `SECTION_TINT`.)*
2. **Tap-to-hear everywhere** [M] ◐ — `useSpeak` already narrates routines,
   recipes, measure pills, « Notre monde ». Generalize: in toddler/simple
   lenses, a long-press on *any* card/row reads it aloud. One shared
   `useSpeakable` wrapper (or a `data-speak` attribute the shell listens for)
   instead of per-feature wiring. Low vision, low literacy, hands-full-of-flour
   — one affordance covers all three. *(reuse: `useSpeak`, the world-map
   tap-to-speak pattern.)*
3. **The plain-words pass** [S] — audit `i18n.ts` copy against a "would my
   mother-in-law parse this cold?" bar. « Garde-manger », « Carnets »,
   « Le cercle », « Capture » are lovely but opaque on first contact. Keep the
   names (they're brand) but guarantee every section header carries a plain
   subtitle where help mode is on, and every empty state opens with *what this
   is* before *what to do*. One sweep, one PR, huge first-contact payoff.
4. **Help mode (« ? ») on every tab** [M] ◐ — the contextual help engine
   (`lib/addHelp.ts`, `CERCLE_HELP`) exists but only some sections wear the
   « ? ». Finish the rollout: Board, Kitchen, Liste, Routines each get their
   help registry; P2-9's orphan-check keeps entries honest. The rule becomes
   structural: *a control ships with its help entry or it doesn't ship.*
5. **Per-persona guided tours** [M] ◐ — the spotlight-coachmark engine
   (`lib/tour.tsx`) auto-runs for the first parent. Add variants: a **guest
   tour** (auto-offers when a guest token opens — "here's what you can see and
   the one thing you can do"), a **kiosk tour** (after pairing), and a
   **« Simple » tour** (three steps, all spoken). Tours are data; the engine is
   done. *(reuse: `TourOverlay`, `data-tour`, guest-kind detection.)*
6. **Fear-free by proof: the visible undo promise** [S] — grandma's #1 blocker
   is "I'll break it." We have undo (`lib/undoStack`, « Récents ») — but the
   *promise* is invisible until you've already dared. Surface it: the first
   destructive-ish act per device gets a one-time gentle line ("Tout se défait —
   regarde en bas"), and Réglages ▸ Système gains a « Récents » viewer showing
   the last N undoable acts with one-tap restore. Confidence is a feature.
7. **Human error copy** [S] — sweep every toast/`StatusMessage`/banner for
   tech-speak. "503", "réessayer", "erreur réseau" → what happened, in kitchen
   Québécois, and what (if anything) to do: « Pas d'internet — c'est noté, ça
   partira tout seul » (the outbox already makes that true!). The offline
   architecture is world-class; the *words* undersell it.
8. **« Essaie sans peur » demo sandbox** [M] ✦ — a demo household seeded from
   the sample-seed migration (0096), reachable from the marketing page and from
   Réglages, watermarked « Démo », resettable in one tap. New users (and the
   showcase audience) poke a *full* household — supper planned, routines mid-run,
   a note from Papi in the postbox — with zero fear and zero setup. Doubles as
   the sales demo. *(reuse: sample-seed, e2e mock data shapes.)*
9. **Icon + word, never icon-only** [S] — in parent view, audit every bare-icon
   control (RowActions ✏️/🗑️ are fine on rows, but standalone icon buttons in
   headers/toolbars get a visible or long-press label). Phosphor-not-emoji is
   already law; this is its comprehension corollary.
10. **Contrast & type floor** [S] — a `/dev/kit` sweep of all six section tints
    × dawn/day/dusk/night dayparts against WCAG AA on a *cheap washed-out
    tablet panel* (the actual device class!). Fix the failing pairs in tokens,
    not per-page. Add a `prefers-contrast` bump. Grandma's eyes are the spec.

## B · Understand *the app itself* — discoverability of ~40 features

11. **« Le saviez-vous ? » — one calm discovery card** [S] ⚠ — Découvrir rotates
    ONE dismissible card surfacing a feature the household provably hasn't
    touched (no pets rows → the pets card; no voyage → voyage). Derived from
    data absence, never tracked engagement; shows once, dismiss is forever.
    This is the anti-feed version of feature discovery. *(reuse:
    `FEATURE_MAP_TILES` — each tile gains an optional `isUnused(data)` probe.)*
12. **Guide search** [S] ◐ — `guideContent.ts` is rich and data-driven; the
    global SearchPage indexes entities. Fold guide entries into the same search
    (P2-7's `SEARCHABLE_INDEX` contract) so typing « comment inviter grand-maman »
    finds the postbox guide card, not nothing.
13. **The fridge manual — a printable one-pager** [S] ✦ — a print-stylesheet
    view generated from `guideContent`: the six sections, one line + one picto
    each, the household's actual guest QR, « appuie sur ? pour l'aide ». Tape it
    beside the tablet. The resistant relative reads paper; meet her there.
    *(reuse: guideContent, the share-modes print/QR work.)*
14. **« Quoi de neuf » gentle changelog** [S] — one line in Découvrir when a
    session lands after new features shipped ("Nouveau : les mots doux — laisse
    un message à quelqu'un"), sourced from a tiny hand-maintained list, shown
    once, dismissible. Ships with each feature PR (three words of discipline).
15. **Empty states that teach** [S] ◐ — audit every `EmptyState` against the
    three-part contract: *what this section is* → *one concrete example* → *the
    one button*. Several already comply; make it a checklist item in
    COMPONENTS.md so drift can't restart.
16. **The promo video, inside the app** [S] ◐ ✦ — the code-driven promo pipeline
    (Playwright + Remotion, FR+EN, 16:9+9:16) already produces a short. Embed
    the FR short in the marketing `/` page and as a « Voir en 60 secondes »
    card in Découvrir. Zero new production; the asset exists and self-updates
    with the pipeline. Nobody's grandma reads docs; everybody watches 60s.
17. **Name the lenses on-screen** [S] — surface/audience are invisible axes;
    users experience them as "the app looks different and I don't know why."
    A tiny persistent chip when a non-default lens is active (« Vue enfant »,
    « Mode simple », « Invité — lecture seule ») demystifies the single most
    confusing thing about a multi-surface app. One component, shell-level.

## C · Be faster — the tap budget & perceived speed

18. **The tap-budget audit (then a test that pins it)** [M] ✦ — enumerate the
    ten daily actions (add list item; check item; mark chore done; see supper;
    plan supper; start a routine; leave a note; add an event; check today;
    dismiss a note) and count taps-from-board for each. Set budgets (most ≤2).
    Then encode them as e2e specs — `e2e/tap-budget.spec.ts` asserts the click
    count so a future redesign can't silently make daily life slower. Perf
    budgets exist for bytes; this is one for *thumbs*.
19. **Long-press ＋ → straight to the mic** [S] — the FAB's most common capture
    is voice; long-press (or a second tap while open) skips the sheet and starts
    listening. One saved tap × many times a day. *(reuse: `AddSheet`,
    `VoiceButton`; keep the tap path unchanged.)*
20. **Frequents-first comboboxes** [S] — `EntityCombobox` ranks by recency/
    frequency of *this household's* picks (a tiny local counter, not a synced
    metric — calm-safe). Milk, the same four people, the same store rise to
    the top; picking gets one keystroke shorter every week.
21. **PWA app shortcuts + a widget-shaped entry** [S] — manifest `shortcuts`
    (long-press the home-screen icon → « La liste », « Ajouter », « Souper »)
    is a five-line win. Investigate the newer PWA widget/badging surface where
    supported; degrade silently elsewhere. *(reuse: manifest in
    `vite.config.ts`.)*
22. **NFC / QR waypoints in the house** [M] ✦ — a writable NFC sticker (or
    printed QR) that deep-links: fridge → `/liste`, washer → the laundry
    routine's run view, entry table → the departure checklist. Zero navigation,
    zero typing — the house itself becomes the nav. Pure deep-links; the app
    already routes everything (`/routine/:id/run`, `?tab=`…). Ship as a
    Réglages « Imprimer les raccourcis » sheet of QR labels.
23. **Route-level code-splitting for the heavy scenes** [M] — recipes,
    voyage, « Notre monde », DrawPad (perfect-freehand), Remotion-adjacent
    bits: lazy-load them so the board's first paint on a cheap tablet stays
    lean. Measure first (`web-perf` pass on a throttled profile), split the
    top offenders, add a bundle-size check to CI so it can't regress.
24. **Optimistic navigation warmth** [S] — on tab hover/press-start, prefetch
    that tab's primary query (TanStack `prefetchQuery`) so the pane lands
    full. The cache-first architecture makes this nearly free; it converts
    "fast" into "instant."
25. **A « rush hour » information diet** [S] ⚠ ✦ — 6:30–8:30 on school-day
    mornings, the board quietly leads with the three things that matter (leave
    time, lunches, weather-coat call) and tucks the rest below the fold. It's
    the day-part theming idea applied to *content* instead of colour. Gentle,
    derived, opt-out — never a nag. *(reuse: `lib/timeofday`, board ordering.)*

## D · Hand-in-hand — the missing 20% of shipped features

26. **« Le pont » — one home for the extended family** [M] ◐ ✦ — postbox
    (write to the house), intake (fill your card), share links (see a slice),
    the grandparents-window idea (06-36) — four doors for the *same person*,
    each a separate URL. Unify: one guest landing per person that composes
    what their token allows — today's highlights, drop a note, see shared
    photos, their intake card. The backend capability model (share-modes'
    per-kind allowlist) already supports it; this is a front-door refactor.
    Grandma gets ONE bookmark. *(reuse: guestScope allowlists, postbox,
    intake, SharePage.)*
27. **« Acheter cette recette »** [M] ◐ — the one kitchen gap both docs keep
    circling (05-15): diff a recipe (or the week's plan) against pantry-low +
    the current list, propose the delta, one tap seeds the list. Every piece
    exists (ingredients arrays, pantry flags, list add with `search_terms`);
    only the diff view is new. Probably the single highest-daily-value unbuilt
    feature in the ecosystem.
28. **Mots + drawings + TTS converge** [S] ◐ — a mot (« Laisse un mot ») can
    already wait on a face; let it be *drawn* (DrawPad exists) and let a
    pre-reader recipient tap-to-hear it (useSpeak exists). Three shipped
    systems, one join, and suddenly a 3-year-old and her grandmother exchange
    messages neither can read. That's the product's soul in one feature.
29. **Voyage × the rest of the house** [S each] ◐ — three small joins:
    weather at the destination on the itinerary (lib/weather + trip dates);
    l'auto as the trip's vehicle (car_id on the trip → the departure checklist
    auto-attaches); and an « on est partis » toggle that pauses chore/bin
    recurrence while away (06-48's vacation mode, now trivial on top of trips).
30. **Cast × ambient** [S] ◐ — `/cast` shows the read-only board; let it also
    run the `AmbientScreen` rotation (clock/photos/next-up) so the living-room
    TV becomes the photo frame + glance surface when idle. The receiver and
    the screensaver both exist; join them.
31. **Carnets × upkeep cadence** [M] ◐ — carnets made home/auto/things into
    cared-for members (07); 06-A1's long-interval cadence (furnace filter,
    smoke batteries) is its natural completion: a recurrence on a carnet that
    surfaces as one calm « bientôt » line. The derived-date layer 06 called
    the highest-leverage primitive — build it *on carnets* rather than as its
    own system.
32. **Print stylesheets for every share view** [S] ◐ — the babysitter sheet,
    the intake card, a recipe, the week plan: each shared/public view gets
    `@media print` love (share-modes already added print/QR for links). Paper
    is the interop layer with the older generation; be excellent at it.
33. **Search, findable** [S] ◐ — SearchPage indexes a dozen entity kinds, but
    how do you reach it on a kiosk? Give search a permanent, obvious home
    (board header icon + a `?tab=` deep-link) and fold in guide entries
    (B-12). A thing exists in proportion to its entry points.

## E · The honest audit — obvious & overlooked

34. **Make degradation legible** [S] — optional bindings (AI, R2, DO) degrade
    *silently by design* — good for guests, confusing for the operator ("why
    is there no mic?"). Réglages ▸ Système ▸ Diagnostics gains a health card:
    each binding, its state, and one line on what's hidden because of it
    (« IA non configurée → la capture devient un choix manuel »). Turns
    mystery-missing-features into a checklist.
35. **Data takeout** [S] — 05-49, still unbuilt, and it matters more now that
    real family data (photos, mots, medical-ish notes) accumulates: one button,
    one JSON (+ R2 media manifest). A Loi 25 gesture, a trust signal, and
    incidentally your own backup story.
36. **Backup beyond takeout** [M] — D1 point-in-time restore exists at the
    platform level, but *household-level* restore doesn't. A nightly R2 dump
    (cron trigger, one JSON per household) is cheap insurance against the
    scariest failure mode: a migration bug eating the only real household.
37. **Burn-in & battery care for the always-on panel** [S] — the kiosk runs
    24/7 on a cheap LCD/OLED: pixel-shift the ambient clock a few px per
    minute, deepen the night dim, and document a recommended tablet
    brightness/schedule in the Guide. Furniture shouldn't scar.
38. **Per-guest locale** [S] — the household speaks FR; grandma in Ontario
    might not. Guest links carry an optional `lang` so *her* view (postbox,
    Le pont) renders in her language while the house stays québécois. The
    i18n parity contract makes this nearly free.
39. **The UNIFORMIZING reds, scheduled** [M] ◐ — Part I/II already name the
    debt (FE-1 hand-rolled tabs, FE-2 recipe overlays, LIB-2 inline query
    keys, BE-1 unscoped DELETEs — that one's a *correctness* issue, do it
    first). This doc's ask: put wave 1 on the actual calendar instead of the
    perpetual someday. Comprehension work (A/B above) goes faster on uniform
    primitives.
40. **Accessibility beyond contrast** [M] — one pass: focus order through the
    sheets, `aria-label` on every icon control, `prefers-reduced-motion`
    honored by the tour/ambient/view transitions, 44px hit-target sweep
    (toddler targets are huge; *parent* view has the small ones). Grandma may
    use a screen reader; the toddler lens already proved we care about
    non-readers — extend the courtesy.
41. **The offline temp-id chain** [S] ◐ — OFFLINE.md's known limitation
    (add-then-edit the same row offline drops the edit on replay). Rare, but
    it's the only known way the outbox silently loses intent. A queued-op
    rewrite pass (map `tmp-…` → real id when the create replays) closes it.
42. **Kiosk recovery drill** [S] — power blip + wifi change + revoked token:
    write the « the tablet is acting weird » one-pager in the Guide (unplug it,
    re-pair via the 6-digit code). The person doing this at 7am is not the
    operator. Pure documentation, real resilience.

## F · Out of the box — adjacent leaps that fit the soul

43. **The morning briefing, spoken** [M] ✦ ◐ — 06-25, promoted: first
    presence-tap of the morning (or a tap on the clock) reads the day aloud —
    weather, who has what, supper, the one don't-forget. It's the board's data
    given a voice, and it doubles as the low-vision interface. *(reuse:
    `useSpeak` + board data + ambient wake.)*
44. **Paper mode — the week, printed** [S] ✦ — a print view of the week
    (agenda + suppers + chores) formatted like a lovely fridge sheet. Some
    households will *never* mount a tablet; their bridge to Babillard is the
    operator printing Sunday night. Also the world's calmest export format.
45. **A « grandma kiosk » starter kit** [L] ✦ — compose A-1 (« Simple » lens) +
    B-13 (paper manual) + D-26 (Le pont) + C-22 (QR waypoints) into a documented
    recipe: a $80 tablet at *her* house, locked to `?simple=1`, showing her
    slice — the grandkids' week, shared photos, a giant « Laisse un mot »
    button. The product grows from one household to a *constellation of
    kitchens* without a single new backend concept (voyage already proved
    cross-household sync). This is the moat nobody else is building: the
    family network *without* a social feed. ⚠-proof by construction: no feed,
    no counts, just her people.
46. **Scribble-to-list** [S] ✦ — DrawPad, pointed at the list: scribble
    « lait » in handwriting, it lands as an image chip on la liste (no OCR, no
    AI — it's just a tiny drawing as an item). Whimsical, instant, and the
    fastest capture for people who will never talk to a tablet.
47. **A soft hourly presence** [S] ⚠ ✦ — on the kiosk only, at the top of the
    hour, the ambient clock breathes once (a slow 2s scale). No sound, no
    badge, no content. The house's heartbeat — the anti-notification. (Ships
    behind the veille settings; reduced-motion turns it off.)

---

## The three moves (where this coheres)

1. **Symmetry: the post-reader joins the pre-reader.** A-1 + A-2 + D-28 + F-45
   are one thesis — everything built for the toddler (speech, pictures, locked
   lenses, fearlessness) is the accessibility layer for the other end of life.
   Cheapest big product expansion available; almost all machinery exists.
2. **Legibility is the next feature.** B-11..17 + A-4..7: the app stopped
   needing more features and started needing to *explain itself*. Help mode,
   tours, plain words, the demo, the video — one quarter of "make the existing
   40 features findable" beats ten new ones.
3. **Joins, not systems.** Every D idea is two shipped systems + one join
   (recipe×list, mots×draw×TTS, cast×ambient, carnets×cadence, voyage×weather).
   The codebase's reuse discipline earned this: the next ten features are
   mostly *edges*, not *nodes*.

## Suggested execution waves

- **Wave 1 — words & fear (all [S], one sitting each):** A-3 plain-words pass,
  A-7 error copy, A-6 undo promise, B-15 empty states, B-17 lens chips,
  E-34 diagnostics card. *No schema, no risk, instant comprehension payoff.*
- **Wave 2 — the daily-speed pack:** C-18 tap-budget audit + spec, C-19
  long-press mic, C-20 frequents-first, C-21 PWA shortcuts, D-27 « acheter
  cette recette ».
- **Wave 3 — discoverability:** A-4 help-mode rollout, A-5 persona tours,
  B-11 le saviez-vous, B-16 promo video embed, B-13 fridge manual, D-33 search
  entry.
- **Wave 4 — the grandma arc:** A-1 « Simple » lens → A-2 tap-to-hear → D-26
  Le pont → D-28 mots convergence → (later) F-45 the constellation.
- **Continuous:** E-39 uniformizing reds (BE-1 first), E-40 a11y pass, C-23
  code-splitting when a perf measurement justifies it.

## The Grandma Test, as a checklist (run it on a real human)

- [ ] 60s unaided: says what the app is (B-16 video / A-3 words)
- [ ] Finds tonight's supper in ≤2 taps (C-18)
- [ ] Adds « lait » to the list by voice or scribble (C-19 / F-46)
- [ ] Undoes it, unafraid (A-6)
- [ ] Hears something read aloud (A-2)
- [ ] Leaves a mot for a grandkid (D-28)
- [ ] Never once saw jargon, an error code, or a dead end (A-7, E-34)

## Open questions for Marc (answer these to sharpen the plan)

- **OQ-1** Is a real « grandma household » (a second kitchen, F-45) an actual
  ambition, or is grandma a *guest* of yours forever? Changes whether A-1 is a
  lens (cheap) or a deployment story (bigger).
- **OQ-2** Which ten actions are YOUR real daily top-ten? C-18's tap budget
  should be measured against your household's true habits, not my guess.
- **OQ-3** Le pont (D-26): who are the actual 2–3 relatives who'd use it this
  year, and what's the ONE thing each would do weekly? Build their door first.
- **OQ-4** How much of Wave 1 do you want done autonomously vs. reviewed
  idea-by-idea? (Wave 1 is all no-risk copy/UI polish — a good candidate for
  the ship-quick-wins bias.)
- **OQ-5** Is FR-only acceptable for the « Simple » lens v1, or is per-guest
  locale (E-38) a prerequisite because of who grandma actually is?
