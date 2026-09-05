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
| `?sub=<id>` | `/settings` | The Régler sub-section (ids in `SETTINGS_SUBS`; retired ids fold via `LEGACY_SUB`). |
| `?card=<guideId>&point=<n>` | `/settings` | Land on ONE guide card (+ sub-point): forces the card's home tab + Comprendre lens, opens/scrolls/highlights. Retired ids resolve through `GUIDE_CARD_ALIAS`. |
| `?focus=<helpKey>` | `/settings` | Land on ONE section card inside a stacked sub: scroll + accent ring (`SETTINGS_FOCUS`; anchor is `id="op-<helpKey>"` from `OperatorSection`). |
| `?focus=note|meal` | `/kitchen/day/:date` | **Open** that composer on the day scene (the note headline, or the hero slot's meal), seeded and ready. Same one-shot shape as the Réglages one: act, then consume the param with one functional `setParams` so a refresh or a back-nav doesn't reopen it. |
| `?plus=1\|<mode>` | any hub tab | Open the ＋ sheet: `1` = the section's chooser, a mode name = that tile (`/board?plus=mot`). Validated against `ADD_MODES`; ignored where the FAB is hidden; operator-grade modes fall back to the chooser when not signed in. |

## The two directions

**Feature → comprehension** (was already strong): "?" help-mode bubbles,
`HelpDot`, `EmptyState` links, end-of-tour « En savoir plus » — all target
`/settings?tab=guide&card=<id>&point=<n>`.

**Comprehension → action** (the 2026-07 rework): every guide card carries
- `route` → « Ouvrir » (the live feature),
- `settings` → « Régler » (`/settings?tab=&sub=&focus=`),
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
| board | board-widgets | /board?edit=1 | board▸layout |
| board | capture (+type-or-choose, +ask, +a-regler) | /board | settings▸ai |
| board | mots (+drawings) | /board?plus=mot | — |
| board | habits | /board/habitudes | settings▸ambient&focus=habits |
| kitchen | **kitchen** (section; +leftovers, +reserve as points) | /kitchen | ?tab=kitchen |
| kitchen | recipes (+cookmode, +favorites) | /kitchen | kitchen▸apparence |
| liste | **liste** (section; +ghost as two points) | /liste | ?tab=liste |
| liste | deals (+flyers, +cashier) | /liste/circulaires | liste▸shop |
| notes | **notes** (section) | /notes | — (Comprendre-only) |
| maison | **maison** (section) | /maison | ?tab=maison |
| maison | routines (was a section card) | /maison | maison▸routines |
| maison | cercle (was a section card) | /maison?section=family | maison▸members |
| maison | voyage | /voyage/new | — |
| maison | auto | /voiture | maison▸cars |
| maison | carnets | /maison?section=carnets | — |
| maison | todos | /board | maison▸todos |
| settings | **settings** (section; +offline) | /settings | — |
| settings | ai | — | settings▸ai |
| settings | calm (+undo) | — | settings▸calm |
| settings | audience (+surface) | — | settings▸display |
| settings | screensaver (+apod) | — | settings▸ambient&focus=ambient |
| settings | share-access (+share, +share-target) | — | settings▸guest |
| set-* | set-household (+account) | — | maison▸members |
| set-* | set-agenda (+activities) | — | board▸events |
| set-* | set-chores (+home-projects) | — | maison▸chores |
| set-* | set-shopping | — | liste▸shop |
| set-* | set-recipes | — | kitchen▸apparence |
| set-* | set-devices (+pairing, +cast-tv) | — | settings▸tablets |
| set-* | set-ai | — | settings▸ai |
| set-* | set-display | — | settings▸display |

(`tab▸sub` is shorthand for `/settings?tab=<tab>&sub=<sub>`.)

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
- **A concept id must sit in a `CONCEPT_THEMES` bucket** or it's invisible to
  the FeatureMap jump-grid.
- Concision budgets: `what` ≤ ~15 words, point label ≤ ~5, `detail` ≤ 2 plain
  sentences, `why` ≤ 1 and only when it earns it; concept cards ≤ 8 points,
  section cards ≤ 12. Plain FR-CA (souper, céduler, courriel).

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
