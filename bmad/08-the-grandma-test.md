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
19. ❌ ~~**Long-press ＋ → straight to the mic**~~ [S] — *rejeté.*
20. ✅ **Frequents-first comboboxes** [S] — `EntityCombobox` ranks by recency/
    frequency of *this household's* picks (a tiny local counter, not a synced
    metric — calm-safe). Milk, the same four people, the same store rise to
    the top; picking gets one keystroke shorter every week.
21. ❌ ~~**PWA app shortcuts + a widget-shaped entry**~~ [S] — *rejeté.*
22. ❌ ~~**NFC / QR waypoints in the house**~~ [M] ✦ — *rejeté.* (Deep-link
    stickers: fridge → /liste, washer → laundry routine.)
23. ✅ **Route-level code-splitting — offline-aware** [M] — **Marc: « yes but
    consider offline in all this. »** Measure first (`web-perf` pass on a
    throttled profile), split the heavy scenes (recipes, voyage, « Notre
    monde », DrawPad), add a bundle-size check to CI. **The offline
    constraint is load-bearing:** the SW precaches the built shell — every
    lazy chunk must still land in the precache manifest (`vite.config.ts`
    `swSource`) so a kiosk that reboots offline can still open a lazy route.
    Code-splitting must never punch a hole in NFR-OFFLINE-1.
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
30. ✅ **Cast × ambient** [S] ◐ — `/cast` shows the read-only board; let it
    also run the `AmbientScreen` rotation (clock/photos/next-up) so the
    living-room TV becomes the photo frame + glance surface when idle. The
    receiver and the screensaver both exist; join them.
31. ✅ **Carnets × upkeep cadence** [M] ◐ — carnets made home/auto/things into
    cared-for members (07); 06-A1's long-interval cadence (furnace filter,
    smoke batteries, tire swap) is its natural completion: a recurrence on a
    carnet that surfaces as one calm « bientôt » line. The derived-date layer
    06 called the highest-leverage primitive — build it *on carnets* rather
    than as its own system.
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
35. ✅ **Data takeout** [S] — one button, one JSON (+ R2 media manifest). A
    Loi 25 gesture, a trust signal, and incidentally your own backup story.
    Matters more as real family data (photos, mots, medical-ish notes)
    accumulates.
36. ✅ **Backup beyond takeout** [M] — a nightly R2 dump (cron trigger, one
    JSON per household) as cheap insurance against the scariest failure mode:
    a migration bug eating the only real household.
37. ✅ **Burn-in & battery care for the always-on panel** [S] — pixel-shift
    the ambient clock a few px per minute, deepen the night dim, and document
    a recommended tablet brightness/schedule in the Guide. Furniture
    shouldn't scar.
38. ⏸ **Per-guest locale** [S] — *plus tard.* Guest links carry an optional
    `lang` so a unilingual relative sees *her* views (postbox, Le pont) in her
    language while the house stays québécois. Revisit when Le pont (D-26)
    lands — it's the natural moment.
39. ✅ **The UNIFORMIZING reds, scheduled** [M] ◐ — put wave 1 of the existing
    debt backlog on the calendar: **BE-1 unscoped DELETEs first (correctness)**,
    then FE-1 hand-rolled tabs, FE-2 recipe overlays, LIB-2 inline query keys.
    Comprehension work (A/B above) goes faster on uniform primitives.
40. ✅ **Accessibility beyond contrast** [M] — one pass: focus order through
    the sheets, `aria-label` on every icon control, `prefers-reduced-motion`
    honored by the tour/ambient/view transitions, 44px hit-target sweep in
    *parent* view (toddler targets are already huge).
41. ✅ **The offline temp-id chain** [S] ◐ — OFFLINE.md's known limitation
    (add-then-edit the same row offline drops the edit on replay). Rare, but
    it's the only known way the outbox silently loses intent. A queued-op
    rewrite pass (map `tmp-…` → real id when the create replays) closes it.
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
    At the top of the hour the ambient clock breathes once (a slow 2s scale).
    No sound, no badge, no content — the house's heartbeat, the
    anti-notification. Ships behind the veille settings on every surface;
    `prefers-reduced-motion` turns it off.

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

**Wave 1 — words & fear** *(all [S], no schema, no risk)*
A-3 plain-words pass · A-7 human error copy · A-6 undo promise (improve
what exists) · B-15 empty-state contract · E-34 diagnostics health card.

**Wave 2 — daily speed**
C-18 tap-budget audit + pinned e2e spec *(OQ-2 answered: meal plan, liste,
flyers, board, calendar, voyage, l'auto, routines, kid mode — confirm/extend
via the DB-frequency audit)* · C-20 frequents-first comboboxes · C-24
prefetch-on-press.

**Wave 3 — discoverability**
A-4 help-mode rollout everywhere · A-5 adaptive tour for power users *(design
pass first)* · B-11 le saviez-vous · B-14 quoi de neuf · D-33 search entry
points + guide-in-search (absorbs B-12) · A-8 demo sandbox · A-9 icon labels
(soft: long-press/help-mode only) · A-10 contrast & type floor.

**Wave 4 — the grandma arc**
A-1 « Simple » audience lens → A-2 tap-to-hear everywhere. *(D-26 Le pont
deferred to the plus-tard shelf per OQ-3.)*

**Ambient & platform (continuous, order-free)**
D-30 cast×ambient · D-31 carnets upkeep cadence · F-47 hourly breath (kiosk +
mobile, behind settings) · E-35 takeout · E-36 nightly backup · E-37 burn-in
care · E-41 temp-id chain fix · E-39 UNIFORMIZING reds (BE-1 first) · E-40
a11y pass · C-23 offline-aware code-splitting (measure first).

**Plus tard shelf:** C-25 rush-hour diet · D-26 Le pont (deferred per OQ-3;
revive by picking the 2–3 real relatives first) · D-32 share-view print
styles · E-38 per-guest locale (rides along with D-26).

**Rejected (do not build, do not re-propose):** B-13 fridge manual · B-16
video embed · B-17 lens chips · C-19 long-press mic · C-21 PWA shortcuts ·
C-22 NFC/QR waypoints · D-27 acheter cette recette · D-28 drawn mots · D-29
voyage joins · E-42 recovery one-pager · F-43 spoken briefing · F-44 paper
mode · F-45 grandma-kiosk constellation · F-46 scribble-to-list.

## The Grandma Test, as a checklist (run it on a real human)

- [ ] 60s unaided: says what the app is (A-3 words / A-8 demo)
- [ ] Finds tonight's supper in ≤2 taps (C-18)
- [ ] Adds « lait » to the list by voice or typing (capture spine)
- [ ] Undoes it, unafraid (A-6)
- [ ] Hears something read aloud (A-2)
- [ ] Never once saw jargon, an error code, or a dead end (A-7, E-34)

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
