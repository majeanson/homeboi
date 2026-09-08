# DISCOVERY.md — the comprehension ↔ action map

> How Babillard explains itself, and how the explanations, the live features and
> the Réglages knobs all point at each other. Read this before touching the
> guide, the "?" help-mode, the tours, or any Réglages navigation. Companion to
> `COMPONENTS.md` (shared primitives) and `OFFLINE.md` (offline architecture).

The rule the whole system serves: **wherever a user stumbles on a feature, the
explanation is one tap away — and from the explanation, the feature (and its
settings) are one tap back.** No dead-end prose.

---

## The pieces (where everything lives)

| Piece | File(s) | What it is |
| --- | --- | --- |
| Guide content | `src/lib/guideContent.ts` | THE data: every card (`GUIDE`), the themed taxonomy (`CONCEPT_THEMES` → `FEATURE_MAP_TILES`), tints (`SECTION_TINT`), alias map (`GUIDE_CARD_ALIAS`), helpers (`cardHomeTab`, `guideWhat`, `helpFromGuide`). All copy is `Bi {fr,en}`, FR-CA first. |
| Guide views | `src/components/operator/guide.tsx` | `GuideCard` (one card + its action links), `ComprendrePanel` (a theme's slice), `DiscoverSection` (global search + FeatureMap), `resolveGuideCard` (alias resolution), `useGuideCardTarget` (?card/?point homing). |
| Réglages shell | `src/pages/Operator.tsx` | Découvrir + 6 themed tabs, « Comprendre / Régler » lens, sub pill rows, `?focus=` landing, « Voir dans l'app » backlinks, `LEGACY_TAB`/`LEGACY_SUB` folding. |
| Settings taxonomy | `src/lib/settingsNav.ts` | PLAIN DATA: `SETTINGS_SUBS` (sub ids + order, the one source), `SETTINGS_FOCUS` (focusable section anchors = operatorHelp helpKeys), `SUB_GOTO` (sub → live surface), `ROUTE_PREFIXES` (valid link targets, mirrors `router.tsx`). |
| "?" help-mode | `src/lib/helpMode.tsx` + `HelpBubble`/`HelpDot` | Tap "?" then a control → in-place bubble + « Voir le guide » deep-link. |
| Help registries | `src/lib/{board,liste,routines,kitchenTab,operator,add,cercle,notes}Help.ts` | 8 maps of `{ body, card, point? }` — every hint names its guide card/point. Maison merges two of them (`{...CERCLE_HELP, ...ROUTINES_HELP}`) since one page now hosts both worlds. |
| Tours | `src/lib/tour.tsx`, `src/lib/tourContent.ts`, `components/tour/TourOverlay.tsx` | Spotlight walkthroughs; steps anchor `data-tour` keys, can end on a guide card. `guidePoint(id, frLabel)` reuses any guide point's detail verbatim as a step body (`guidePlusActions(id)` = the « ＋ » point). A step with `sheet: true` walks INSIDE the ＋ sheet — HubLayout holds the section chooser open for it (in-sheet anchors: `add-note`, `add-tiles`, `add-week`, `add-routines`). |
| ＋ sheet | `src/lib/addSheet.tsx` + `components/AddSheet.tsx` | `SECTION_MODES` tiles; `ADD_MODES` (all modes, validates `?plus=`); tile explanations live in `ADD_HELP` + guide points, not on the tiles. |

## The URL grammar (deep links)

> **A door lands ON its target.** The grammar below is not decoration — it is how a
> door that NAMES a thing opens onto that thing ready to act, instead of onto the page
> that merely contains it. « Note du jour » in the calendar's ⋯ used to navigate to the
> day scene and stop: the composer was right there, closed, so asking for the note cost
> a second tap to go find it. A door that names a PAGE (« Planifier aujourd'hui » → the
> day's plan) is exempt; the page IS the target there.
> Guards: `e2e/door-landing.spec.ts` (each target really opens) and
> `boardCards.test.ts` « emptyTo » (each door really points at an add).

| Param | On | Means |
| --- | --- | --- |
| `?tab=<SectionKey>` | `/settings` | Which themed Réglages tab (retired ids fold via `LEGACY_TAB`). |
| `?lens=comprendre\|regler` | `/settings` | The tab's lens; default `regler` (stored as no param). |
| `?sub=<id>` | `/settings` | The Régler pill (ids in `SETTINGS_TREE` → `SETTINGS_SUBS`; retired ids fold via `LEGACY_SUB`). **Optional when `?focus=` is given** — the sub is then derived from the section (`subOfFocus`), which is what lets a link survive a pill reshuffle. |
| `?card=<guideId>&point=<n>` | `/settings` | Land on ONE guide card (+ sub-point): forces the card's home tab + Comprendre lens, opens/scrolls/highlights. Retired ids resolve through `GUIDE_CARD_ALIAS`. |
| `?focus=<sectionKey>` | `/settings` | Land on ONE section card: scroll + accent ring. The key is the card's entry in `SETTINGS_TREE` (its helpKey, or its explicit `anchor` where a helpKey is shared — `guestLinks`); anchor is `id="op-<key>"` from `OperatorSection`. **This is the stable address** — name the section, not the pill: `guideLinks.test.ts` requires it whenever the sub stacks two or more cards. |
| `?focus=note|meal` | `/kitchen/day/:date` | **Open** that composer on the day scene (the note headline, or the hero slot's meal), seeded and ready. Same one-shot shape as the Réglages one: act, then consume the param with one functional `setParams` so a refresh or a back-nav doesn't reopen it. |
| `?plus=1\|<mode>` | any hub tab | Open the ＋ sheet: `1` = the section's chooser, a mode name = that tile (`/board?plus=mot`). Validated against `ADD_MODES`; ignored where the FAB is hidden; operator-grade modes fall back to the chooser when not signed in. |

## The two directions

**Feature → comprehension** (was already strong): "?" help-mode bubbles,
`HelpDot`, `EmptyState` links, end-of-tour « En savoir plus » — all target
`/settings?tab=guide&card=<id>&point=<n>`.

**Comprehension → action** (the 2026-07 rework): every guide card carries
- `route` → « Ouvrir » (the live feature),
- `settings` → « Régler » (`/settings?tab=&sub=&focus=` — `focus` names the section; see the grammar above),
- per-point `route` → « Essayer » (that point's one concrete action),

and every Réglages sub with a live counterpart shows « Voir dans l'app »
(`SUB_GOTO`). The board▸Disposition ↔ `/board?edit=1` mirror is the pattern,
generalized. It rides the **Comprendre / Régler lens row** (`.operator__lensrow`),
in the half those two pills leave empty — it used to own a whole line between the
sub rail and the first setting. On a narrow phone the WORD hides and the ↗ glyph
stands alone, named by `aria-label` + `title`; the label returns as soon as the
row can hold it, so the control is never unnamed. Guard: `e2e/lean-forms.spec.ts`.

## The taxonomy (post-merge, 32 cards)

1 start (`first-time`) + 6 section cards + 17 concepts + 8 `set-*` reference
cards. 25 old ids retired into hosts — `GUIDE_CARD_ALIAS` keeps every old
`?card=&point=` link exact. **R** = « Ouvrir » (`route`), **S** = « Régler »
(`settings`); points carry their own « Essayer » routes (see the file).

> **The nav restructure DEMOTED, it did not retire.** When `/cercle` + `/routines`
> became `/notes` + `/maison`, the `cercle` and `routines` cards stayed **live**
> ids and kept every point at its exact index — they simply moved from
> `group:'sections'` to `group:'concepts'` inside the new `maison` bucket. That is
> why no `GUIDE_CARD_ALIAS` entry was added (aliasing a live id fails
> `guideLinks.test.ts`) and why `CERCLE_HELP`/`ROUTINES_HELP`/`OPERATOR_HELP`/
> `ADD_HELP` needed no index churn. Old `?tab=cercle`/`?tab=routines` links fold
> through `LEGACY_TAB` instead, keeping a valid `?sub=` as-is.

| Theme | Card (absorbed ids →) | R | S |
| --- | --- | --- | --- |
| — | first-time | — | — |
| board | **board** (section; +search, +reminders as points) | /board | ?tab=board |
| board | board-widgets | /board?edit=1 | board▸layout&focus=boardLayout |
| board | capture (+type-or-choose, +ask, +a-regler) | /board | settings▸ai&focus=ai |
| board | mots (+drawings) | /board?plus=mot | — |
| board | habits | /board/habitudes | settings▸display&focus=habits |
| kitchen | **kitchen** (section; +leftovers, +reserve as points) | /kitchen | ?tab=kitchen |
| kitchen | recipes (+cookmode, +favorites) | /kitchen | kitchen▸apparence&focus=recipeTags |
| liste | **liste** (section; +ghost as two points) | /liste | ?tab=liste |
| liste | deals (+flyers, +cashier) | /liste/circulaires | liste▸shop&focus=shop |
| notes | **notes** (section) | /notes | — (Comprendre-only) |
| maison | **maison** (section) | /maison | ?tab=maison |
| maison | routines (was a section card) | /maison | maison▸routines&focus=routines |
| maison | cercle (was a section card) | /maison?section=family | maison▸members&focus=members |
| maison | voyage | /voyage/new | — |
| maison | auto | /voiture | maison▸cars&focus=cars |
| maison | carnets | /maison?section=carnets | — |
| maison | todos | /board | maison▸routines&focus=todoTemplates |
| settings | **settings** (section; +offline) | /settings | — |
| settings | ai | — | settings▸ai&focus=ai |
| settings | calm (+undo) | — | settings▸display&focus=calm |
| settings | audience (+surface) | — | settings▸display&focus=display |
| settings | screensaver (+apod) | — | settings▸display&focus=ambient |
| settings | share-access (+share, +share-target) | — | settings▸tablets&focus=guestLinks |
| set-* | set-household (+account) | — | maison▸members&focus=members |
| set-* | set-agenda (+activities) | — | board▸events&focus=events |
| set-* | set-chores (+home-projects) | — | maison▸routines&focus=chores |
| set-* | set-shopping | — | liste▸shop&focus=shop |
| set-* | set-recipes | — | kitchen▸apparence&focus=recipeTags |
| set-* | set-devices (+pairing, +cast-tv) | — | settings▸tablets&focus=devices |
| set-* | set-ai | — | settings▸ai&focus=ai |
| set-* | set-display | — | settings▸display&focus=display |

(`tab▸sub&focus=key` is shorthand for `/settings?tab=<tab>&sub=<sub>&focus=<key>`.)

**The pill map (28 → 14, 2026-09-08)** — `SETTINGS_TREE` in `lib/settingsNav.ts` is
the one source; this is a reading of it, not a second copy:

| Tab | Pill (id → label) | Sections stacked, in order |
| --- | --- | --- |
| board | `events` → Agenda & semaine | events · schoolYear · thisWeek · recap |
| board | `layout` → Disposition du babillard | boardLayout |
| kitchen | `apparence` → Apparence | recipeTags · recipePills · measureColors |
| kitchen | `meals` → Couleurs des repas | mealSlots · mealWindow |
| kitchen | `reserve` → Emplacements de la réserve | reserveLocations |
| liste | `shop` → Magasinage | shop · aisleOrder · storeFilter |
| liste | `history` → Historique & suivi | history · ghost |
| maison | `routines` → Tâches de la maison | routines · chores · todoTemplates |
| maison | `members` → La maisonnée | members · cercleGroups |
| maison | `cars` → L'auto & horaires | cars · schedule |
| maison | `annee` → Cette année | houseDiary |
| settings | `tablets` → Appareils & accès | claimTablet · devices · guestLinks · health · buildInfo · takeout · micTest · kbDebug · aiLog |
| settings | `display` → Affichage & veille | display · ambient · habits · photos · calm |
| settings | `ai` → Voix & IA | ai · voice |

Each section carries an `access` (`device` / `household` / `operator`): a viewer's pill
row and stacks DERIVE from it — a link guest sees only `device` cards (and only pills
that have one), a paired kiosk everything but `operator` cards. There is no allowlist
to keep in step. **Moving a card is one line in `SETTINGS_TREE` plus a line in
`LEGACY_SUB`**; every link that named the card by `?focus=` keeps landing, and
`settingsNav.test.ts` + `guideLinks.test.ts` fail the build on anything that still
spells the retired pill.

## Invariants (tests enforce these — keep them green)

- **Registries use LIVE card ids only**; `GUIDE_CARD_ALIAS` serves URL bookmarks
  and `[[card:]]` tokens exclusively. (`helpRegistry.test.ts` — every `card`
  must exist, every `point` in range, no registry may name an alias key.)
- **Every guide link resolves** (`guideLinks.test.ts`): `/settings` URLs check
  tab/sub/focus against `settingsNav.ts`; other paths must prefix-match
  `ROUTE_PREFIXES`; `?plus=` values must be real `ADD_MODES`; every alias target
  exists with base < host point count; every `[[card:id]]` token resolves.
- **Every section card keeps a « ＋ » point** (`guidePlusActions` throws at
  module load without it).
- **A prose breadcrumb names a LIVE destination** (`settingsNav.test.ts`, the
  « prose breadcrumbs » block): every « Réglages ▸ A ▸ B » / « Settings ▸ A ▸ B » in
  a user-facing string (both i18n files, the guide, the help registries) has A = a
  themed-tab label and B = one of that tab's pill labels — in either language; a
  third segment (a card title, an inner tab) is free, and a two-segment crumb may
  name a pill directly when its label belongs to one tab. Comments aren't scanned
  (a comment's crumb is not a hint) but were re-pointed anyway. Spell the pill as
  it is labelled (« Disposition du babillard », not « Disposition »); a link that
  already goes there needs no crumb at all — say the verb (« Rétablir dans
  Réglages »). Added 2026-09-08, when the sweep found crumbs still naming pills
  retired three restructures earlier (« ▸ Guide », « ▸ Courses », « ▸ Le cercle »).
- **A concept id must sit in a `CONCEPT_THEMES` bucket** or it's invisible to
  the FeatureMap jump-grid.
- Concision budgets — **held by `guideBudget.test.ts` since 2026-09-08** (they had
  been listed here as enforced with no test behind them, and 30 of 32 `what` lines
  were over): `what` ≤ 15 words and point label ≤ 5 are HARD; `detail` ≤ 2
  sentences and the point caps (concept ≤ 8, section ≤ 12) are RATCHETS pinned at
  the day's count, lowered with each trim, never raised. `why` ≤ 1 and only when it
  earns it. Plain FR-CA (souper, céduler, courriel). The `what` is the one line a
  first-time grandparent reads before deciding to open the card — say it in fifteen
  plain words, and « L’écran coup d’œil : l’heure, la journée, le souper et les
  corvées » beats a paragraph.

## Adding a feature's comprehension wiring (checklist)

1. **Guide**: a point on an existing card (default) or — rarely — a new card in
   `guideContent.ts` (merge-first: ~32 cards is the ceiling, not a floor — and there
   are **32** today — at capacity — so the bar for a new one is higher, not lower). Give
   the card/point its `route`/`settings`; add a new concept id to its
   `CONCEPT_THEMES` bucket.
2. **Help**: an entry in the section's help registry (`{ body, card, point }`)
   + `help.bubbleFor(...)`/`helpKey` on the control or `OperatorSection`.
3. **Settings**: a new setting merges into an existing sub (C-15 — never a new
   pill); if its sub stacks several sections, list its helpKey in
   `SETTINGS_FOCUS` to make it `?focus=`-able; add a `SUB_GOTO` entry if the sub
   gained an obvious live counterpart.
4. **Tour** (optional): a step in that section's tour naming a `data-tour`
   anchor, or let the card's `tour` replay cover it. Source the body from the
   guide point you wrote in step 1 (`guidePoint(card, frLabel)`) rather than
   re-typing the prose; a quick-add tile is covered by the section's in-sheet
   `sheet: true` step (the « ＋ » enumeration) for free.
5. **Tests**: `npm run typecheck` + vitest — `helpRegistry` + `guideLinks`
   validate the whole graph; fix what they name.

## Renaming / merging a card (the alias drill)

1. Fold its points into the host (≤ 2 condensed points), delete the card.
2. Add `GUIDE_CARD_ALIAS['old-id'] = { id: host, base: <index where the block
   landed> }` so old `?card=` URLs and `[[card:]]` tokens keep landing.
3. Rewrite every in-code reference (registries, tours, whatsNew, discovery) to
   the host id + PRECISE new point index — never leave one on the alias.
4. Drop the old id from `CONCEPT_THEMES`; re-check the alias bases of every
   OTHER alias pointing into any card whose points you shifted.
5. **Re-check every `guidePoint(card, frLabel)` in `tourContent.ts`** — tours look a
   point up by its FRENCH LABEL, so a merged or renamed point is a module-load throw
   (`tourContent: no "…" point`), caught by `helpRegistry.test.ts` at build.

**The drill ran in full on 2026-09-08** (six cards over their cap merged down —
routines 13 → 8, cercle 13 → 8, capture 10 → 8, recipes 10 → 8, share-access 9 → 8,
set-display 13 → 11 — and every detail trimmed to two sentences). What it found while
re-checking bases: `capture`'s three aliases (`type-or-choose`, `ask`, `a-regler`)
and `cookmode` had been sitting ONE POINT OFF since an earlier trim — `helpRegistry`
only proves a base is in range, not that it lands on the right card. The lesson is
step 4 above, and it is why `guideBudget.test.ts` now refuses a card over its cap
outright: a card that never grows past eight points never needs a shift.
