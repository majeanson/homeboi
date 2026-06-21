# Babillard — component inventory & uniformization backlog

> Living audit of the shared UI. Pair it with the **`/dev/kit`** catalogue
> (`src/pages/DevKit.tsx`) — a dev-only page that renders the shared primitives live
> across the four presentation axes. Every entry is **collapsed by default** (name +
> file path at a glance), **searchable** by name/path, and unfolds to a live specimen.
> Reach it from **Réglages ▸ Affichage ▸ "Kit de composants (dev)"**, or `/dev/kit`.
> Keep it open alongside a chat to point at "this component, here" without running flows.

## The four axes

Every themed surface renders across these. The `/dev/kit` toolbar flips each one
(they're global contexts persisted to localStorage — set, look, set back):

| Axis | Values | Read/set | Notes |
| --- | --- | --- | --- |
| **Theme** | day / night | `getTheme`/`setTheme` (`lib/theme.ts`) — imperative, sets `data-theme` on root | no provider; bootstrapped pre-mount by `public/theme-bootstrap.js` |
| **Surface** | kiosk / mobile | `useSurface()` (`lib/surface.ts`) | device role; `?surface=` |
| **Audience** | parent / toddler | `useAudience()` (`lib/audience.ts`) | lens; `?kid=1` locks toddler (then `setAudience` is refused) |
| **Locale** | fr / en | `useLang()` / `useT()` (`i18n.ts`) | Québécois FR-first; `typeof FR` is the EN parity contract |

Providers live in `src/main.tsx` (Query → Lang → Audience → Surface → Profile →
Calm → Help → Toast → Confirm → AiError → Auth → Router → Tour). A standalone route
like `/dev/kit` inherits all of them.

---

## Shared primitives (gallery-suitable)

The genuinely cross-cutting, prop-driven components. Categorised as the gallery is.

### Inputs
| Component | File | Purpose |
| --- | --- | --- |
| **EditField** | `components/EditField.tsx` | THE add/edit text box — clear+mic inside the field, compact actions; opt-in voice/reorder/delete/secondary chips. See [the convention](#editfield-rollout). |
| **EntityCombobox** | `components/EntityCombobox.tsx` | THE "search + pick an existing thing + free-text" field. One box: type to filter a grouped dropdown (`ComboOption[]` with icons/badges), tap a row to link it, or just type & submit. Clearable ✕, caret-to-open, optional mic. Replaces the old "type here OR toggle a separate list" split. Kitchen builders in `kitchen/comboOptions.tsx`. Used in MealIdeas, Leftovers, DayEditor (recipes+restants), AddSheet leftovers. |
| **Icon / InlineIcon** | `components/Icon.tsx` | Phosphor-bold SVG via `currentColor`; `IconName` is a compile-time union (`lib/pipIcons.ts`). 40+ call sites. |
| **Disclosure** + **useSingleOpen** | `components/Disclosure.tsx` | Calm collapsed-by-default expand/toggle (caret + label + optional count). Tucks a space-hungry secondary group — suggestion chips, an aside — out of sight until tapped, so nothing populates the surface unasked (NFR-CALM-1). Wraps the departure-checklist "Listes prêtes" chips in **TodoSection** + the **AddSheet** todo form. Its per-item sibling, the **`useSingleOpen`** hook, drives the "tap a row → reveal its picker, one open at a time" expand in **MealIdeas** + **Leftovers** (trigger is a chip beside RowActions, body a sibling row — same toggle + rotating-caret cue, different layout). |
| **ColorPicker** | `components/ColorPicker.tsx` | Row of palette dots; controlled. |
| **GroupForm** | `components/cercle/GroupForm.tsx` | Name + kind + colour editor for a « Le cercle » named group; reuses **ColorPicker**. Shared by the create flow (bottom of the directory) and the inline edit on a group header. `onSubmit({name,kind,colour})`. |
| **ConnectPeople** | `components/cercle/ConnectPeople.tsx` | Connect two people (hence two families) at ONE junction: "X est [lien] de Y" — two **EntityCombobox** person pickers (search by first/last name) + a grouped relationship select + a live gendered preview. Writes one `/api/cercle-links` row; the relationship **closure** (`lib/cercle` `closedLinks`) propagates the rest. Reached from the cercle directory ("Relier deux personnes"). |
| **CercleNotes** | `components/cercle/CercleNotes.tsx` | « Le cercle » → Famille → "Notes & recommandations": iOS-Notes-style quick notes scoped to one member (the "Moi" list) or the whole Maisonnée (family-wide), with optional media (audio/drawing/photo). A face row (seeded from `useProfile`) sets whose notes show — a member sees their own **plus** the Maisonnée's; "Maisonnée" sees only family-wide (`lib/familyNotes` `visibleNotes`). Composer = **EditField** (multiline) + a Moi/Maisonnée scope toggle + **MemoControls** (reused via its new `endpoint`/`affectedKey`/`extraBody` props → `/api/family-notes`). CRUD via **useWrite** + **useDeferredRemoval**; cards reuse the `.note-card` look + **ZoomableImg**/**DrawPad**. Backed by `family_notes` (migration 0062). Searchable in `/search`. |
| **RecurPicker** | `components/RecurPicker.tsx` | Recurrence rule (freq/interval/weekdays). |
| **LeadPicker** | `components/LeadPicker.tsx` | Calm "Bientôt" reminder lead ("Afficher dès", 1h–1wk → `lead_seconds`); in EventForm + ChoreForm. |
| **DrawPad** | `components/DrawPad.tsx` | The family draw pad for a fridge note (#14) — useful + educational. Five tools — freehand **pen** (`signature_pad`), drag-out **shapes** (line/rect/oval/triangle/star/heart), tap-to-stamp **sticker packs** (faces/animals/nature/seasons/things/letters), chunky **pixel** grid (snap-grid overlay + flood-**fill**), and a **text** stamp — plus a **mirror/kaleidoscope** toggle, **undo + redo**, a family rainbow + **custom/recent colours**, 3 sizes, paper eraser. A collapsible **template** layer sits underneath: ruled **handwriting lines**, dashed-outline **letter/number tracing** (A–Z/a–z/0–9, thin so kids trace strokes not colour a letter), **dot grid**, or a **colour-in** outline. **Draw over a photo (#14b):** the 🖼 tool (or `pickPhotoOnOpen` → "Sur une photo" in `MemoControls`) loads a chosen photo as a faint **watermark base layer** with a **fade slider + quick presets** (Pâle/Doux/Net/Plein); WYSIWYG — the shown fade bakes into the saved PNG, so 0% = clean trace, 100% = annotate the photo. The photo stays client-side (object URL); only the flattened PNG uploads, so no R2/endpoint change. **Non-destructive (#1):** a drawing persists an editable **scene** (strokes/stamps/pixels/shapes JSON in R2, `scene_key`, migration 0055) so re-opening rebuilds the layers and adding on top never destroys prior marks; old PNG-only drawings degrade to a flat base image. **Perf:** canvas backing-store capped at 2× DPR, pixel paint skips repeats + rAF-coalesces, export size-capped (`MAX_EDGE` 1280). **Share** (Web Share API/download) + `onMakeRoutine` (→ routine card). `onSave(png, scene)`; `initial`/`initialSceneUrl` to re-open; `toddler` trims to big controls. Compact single-line-scroll toolbars keep the surface wide. **Drawings show only in the board's Grille/bento view** (`Notes variant="drawings"`). |
| **DrawingGalleryPage** | `pages/DrawingGalleryPage.tsx` (`/drawings`) | The lasting drawing **collection / gallery** — "Mes dessins" (#14). A wall of kept drawings (own R2 blobs, so clearing a fridge note never frees them), distinct from transient notes. Toddler = big tap tiles (tap → keep drawing on it); parent = same + delete (`useConfirm`); ＋ opens the full `DrawPad`, saving a fresh entry (non-destructive). Backed by `lib/drawingGallery` (`useGallery`/`useSaveToGallery`/`useDeleteFromGallery`) + `/api/drawings` (GET/POST/DELETE, table migration 0056). Reached from the kid board's "Mes dessins" tile + the "La galerie" link under the Grille drawings strip. Guest = read-only. |
| **HeartButton** | `components/HeartButton.tsx` | Family "favorites" ❤ on a recipe (#21, `useLoves`): shows the loved-by faces (never a count); toggle only when a face is picked (read-only as Maisonnée). On recipe cards + planned meals. |

### Actions & rows
| Component | File | Purpose |
| --- | --- | --- |
| **Act** + **Section** | `components/board/Act.tsx` | The ONE activity-row primitive: colour spine + tile + title/sub; three shapes (check / nav / info). Board **and** kitchen pickers. `onOpen` makes the row peek the entity detail — alone it's a whole-row tap (caret); with a check it **splits** (body peeks, check still ticks). |
| **EntityDetailSheet** | `components/detail/EntityDetailSheet.tsx` | THE generalized "tap an item → a picture, a date, the relevant text + smart actions" peek (a bottom sheet). Renders a normalized `DetailModel` (`lib/detail.ts`) built per-kind by `components/detail/adapters.ts` (event/meal/chore/todo/leftover/recipe/routine). Opened from any row via **`useEntityDetail()`** (`components/detail/DetailProvider.tsx`, mounted in `HubLayout`). Reuses `ZoomableImg`/`Avatar`/`HeartButton`/`Chip`. Wired on the board (Aujourd'hui rows + the "Ce soir" hero), recipe cards, and routine cards. Parent audience only. |
| **RowActions** | `components/RowActions.tsx` | The ✏️/🗑️ icon pair (40px targets). 8+ call sites. |
| **DragPill** | `components/DragPill.tsx` | The shared draggable pill/row shell over **`usePointerDnd`** (`lib/dnd`): the `data-dnd-zone` wrapper, the `is-dragging`/`dnd-over` state classes, and the ⠿ grip handle, in one place. `as` picks the element (`'span'` chip vs `'li'` row), `className`/`gripClassName` style it, `showGrip={false}` drops the handle for a read-only guest. Caller renders the pill's own contents as children + one `<DragGhost ghost={dnd.ghost} />` per page. Used by the recipe-tag reorder strip (`operator/recipesTags`) and the recipe-pill list (`operator/recipePills`). |
| **CheckRow** | `components/CheckRow.tsx` | Calm checklist row: check is its own tap target. Garde-manger + réserve. Optional secondary action slot (`onExtra`/`extraIcon`/`extraLabel`) — e.g. La réserve's "→ add to list" (#41). |
| **RecentsPanel** | `components/RecentsPanel.tsx` | The calm "Récents" session log (#38): button → Modal listing the last ~15 actions this session with relative time + a late "Annuler" for ones still in their hold window. Reads `useRecents()` (the same log the undo toast shows expanded). Session-only, no counts/ranks. In Réglages ▸ Affichage. |
| **TodoSection** | `components/todos/TodoSection.tsx` | À compléter (todos, migration 0046): a self-fetching check-off list — global (board) or per-day (day page). Check-in-place + "Effacer cochées", inline add/edit, one-tap departure templates. Distinct from the loose-chore "À faire". |
| **DealCard** | `components/DealCard.tsx` | Flyer-deal card (image + store + price + actions). |

### Display / content
| Component | File | Purpose |
| --- | --- | --- |
| **Avatar** | `components/Avatar.tsx` | Person = photo or coloured initial disc. 10+ call sites. |
| **BigTiles** + **Sayable** | `components/BigTiles.tsx` | Toddler picture-tiles + tap-to-speak text (`useSpeak`). |
| **KidCollections** | `components/kitchen/KidCollections.tsx` | Toddler hear-first 3-stage recipe-collection picker (collection → recipe → day) over the recipe-tag system (#11). Reuses `buildCollections` + the shared `kidSuggest` meal-plan write. Surfaced as a "Les collections" door tile inside `KidKitchen`. |
| **TimerRail** + **useCookTimers** | `components/cook/TimerRail.tsx`, `lib/cookTimers.ts` | The shared cook-timer engine + rail: named countdowns, a one-second ticker, and a chime + vibration on finish. Extracted from `CookMode` so single-recipe cook AND the #43 multi-recipe cook run ONE timer system. `addTimer(seconds, label)` (caller builds the label), `toggleTimer`/`removeTimer`; `onFinish(labels)` lets a caller also announce aloud. Styled by `.cook__timer*` (cook.css). |
| **MultiCookMode** | `components/MultiCookMode.tsx` | #43 — cook several recipes at once. A `/kitchen/cook/multi` scene (entered from the meals tab ▸ "Cuisiner ensemble" when 2+ of today's planned meals are saved recipes): one column per dish, each an independent step stepper, under ONE shared `TimerRail`. Tapping a duration in any step starts a named countdown ("Pâtes · 10 min") in the shared rail; reuses `findDurations`, `groupSections`, density, and per-recipe read-aloud language. |
| **ToddlerCookBook** | `components/kitchen/ToddlerCookBook.tsx` | #45 — the picture cookbook, ALWAYS a swipeable on-screen game (never a printable): cover + one big page per recipe (photo/picto + name read aloud in the recipe's language), a big "On cuisine !" hands off to the cook stepper. Shown inside `KidKitchen` via a "📖 Mon livre" door AND as the `/kitchen/book` scene (`RecipeBookPage`), entered from the kitchen ＋ ▸ "Le livre illustré". Reuses recipes + useSpeak + pictoFor. A `/kitchen/book` scene (entered from `RecipesTab` ▸ "Faire un livre"): a cover + one page per recipe (big sticker photo, tick-box ingredients, numbered step bubbles with step photos). Reuses recipes + the tag/collection layer; `window.print()` + `styles/book.css` `@media print` paginate one recipe per sheet (no migration, no endpoint, no PDF lib). |
| **IngredientLine** | `components/IngredientLine.tsx` | Recipe line with tappable measure pills; `scoops` adds the fill-circle drawing. Colours come from `lib/measurePrefs` (customizable in Réglages ▸ Affichage). |
| **MeasureScoops** | `components/MeasureScoops.tsx` | A measure drawn as colour-coded fill circles — one solid per whole scoop, a part-filled circle for a fraction ("2 c. à soupe" = 2 circles; "1½ tasse" = 1 full + ½). Tap to hear. Used by `IngredientLine` (Cook-mode toddler + split/focus views). |
| **ZoomableImg** | `components/ZoomableImg.tsx` | Tap-to-lightbox image. |

### Voice
| Component | File | Purpose |
| --- | --- | --- |
| **VoiceButton / VoiceStatus** | `components/VoiceButton.tsx` | Shared mic + its calm status line (hides where Web Speech is absent). |

### Feedback / chrome
| Component | File | Purpose |
| --- | --- | --- |
| **Loading / PairPrompt** | `components/Fallback.tsx` | Shared page states (PairPrompt is surface-aware). 15+ call sites. |
| **HelpDot** | `components/HelpDot.tsx` | "?" → Guide; gated by tutorial mode + parent audience. |
| **HubHead** | `components/HubHead.tsx` | Shared header for the four hub tabs: title (+ optional subtitle) left, `SectionAvatar` disc right. One source so the headers can't drift. |
| **SceneHead** | `components/SceneHead.tsx` | Shared header bar for full-screen `.scene` routes: title (+ optional subtitle/glyph) left, contextual Guide "?" + close ✕ right. No orange kicker. Used by quick-add, price-match, deals, day-plan, the operator add-forms. |
| **SectionAvatar** | `components/SectionAvatar.tsx` | Themed tab's top-right identity disc; in tutorial mode the disc itself deep-links to the Guide (folds HelpDot into the icon, corner "?" pip). Used by `HubHead`. |
| **SectionIntro** | `components/SectionIntro.tsx` | First-visit welcome card (mirrors Guide). |
| **TopBar** | `components/TopBar.tsx` | Minimal auth/home chrome (brand + day/night + FR/EN). |
| **FormScene** | `components/FormScene.tsx` | Full-screen shell for operator add-forms. |
| **RecipeListPicker** | `components/RecipeListPicker.tsx` | "Which ingredients?" picker (shared `Modal`) — tick the few you're missing, then add to the grocery list (`recipe-to-list`), instead of dumping every line. Opens all-unticked, select-all/none. Same checklist as the inline one in `RecipeSheet`; used by the Kitchen recipe **peek**'s "Ajouter à la liste". |

### Page orchestrators — intentionally NOT in the gallery
Need live data/route context, so they're catalogued but not rendered as specimens:
`AddSheet`, `MemoControls` (the ＋ Note-rapide audio-memo + draw controls, #38/#14;
parameterizable via `endpoint`/`affectedKey`/`extraBody` — reused by `CercleNotes`),
`SharePage` (the `/share` PWA share-target landing → capture, #13),
`HubLayout`, `RecipeSheet`, `RecipeForm`, `CookMode`, `CashierMode`,
`ProfilePicker`, `TourOverlay`, `DealsBrowser`, `FlyerViewer`, `ChoreLedger`
(read-only fairness glance, #18). #11 collections is now an "Aa vs Collections"
view toggle inside the recipe book (`RecipesTab`): "Aa" = flat alphabetical list,
"Collections" = grouped-by-tag sections; "Quoi cuisiner?" is a pill filter — both
flat in `RecipesTab`, no sub-tabs. `buildCollections` (in `CollectionPicker.tsx`,
now just that helper) is still shared with the toddler `KidCollections` flow. The kitchen sub-tabs
(`DayEditor`, `MealRows`, `PantryTab`, `ReserveSection`, …), and the `operator/*`
section bodies (incl. `operator/guest.tsx` — the babysitter-access issuer, #19;
`operator/ambient.tsx` — the Réglages ▸ Affichage ▸ Mode veille settings, `lib/ambient.ts`;
`operator/idleDebug.tsx` — the Réglages ▸ Debug idle tester: shrink the idle
window to seconds or force the screensaver/warn/drift, via `lib/idleDebug.ts`; and
`operator/recipePills.tsx` — the Réglages ▸ Recettes recipe-tab PILLS editor:
drag-reorder + show/hide the built-in filter pills and build CUSTOM pills (label +
colour + attribute rules over time / ingredients / servings / tag / favourite, see
`lib/recipePills.ts`, migration 0045), consumed by `RecipesTab`).
`operator/ai.tsx` — the Réglages ▸ IA section: the household AI on/off switch
(`AiSection`). The same on/off is mirrored on the Réglages header tag (the old
"IA : active" status is now the toggle). Both read `useAi()` / write `useAiToggle()`
(`lib/ai.ts`): the switch PATCHes `households.ai_enabled` (migration 0061) and
`/api/health` folds it into one effective `ai` flag the whole UI gates on, so turning
it off hides every AI affordance (capture sparkle, recipe-read, recap, suggestions,
search "Ask") AND each AI endpoint falls back server-side (capture→note, import→
parsers-only, the rest 503 via `authed({ requiresAi })`). `AmbientScreen` (the
full-screen idle screensaver — clock/date/photo-frame, backlog #3)
mounts in `HubLayout` and is driven by its idle timer.

**Le cercle** (the people directory tab, `/cercle`) — adapted from the standalone
`famolo / family-social` relationship visualizer, recast onto our household /
calm / dual-audience model. Page-level, live-data, so catalogued not gallery-rendered:
`Cercle` (parent directory grouped by auto-detected family + search + upcoming
birthdays; toddler "Qui est-ce ?" faces grid, tap → name read aloud), `ContactForm`
+ `RelationshipEditor` (the `/cercle/person/new|:id` scene — fields, R2 photo, tags,
and structured relationship links with auto-derived inverse), and `CercleBirthdays`
(the calm board strip — upcoming birthdays with a "Bientôt"-style note, no push/count;
mounted in `Board`). Domain logic (FR-CA relationship vocabulary + `RELATIONSHIP_INVERSES`
+ Union-Find `detectFamilyGroups` + birthday math) is pure in `lib/cercle.ts`; the
detail peek uses `buildContact` (`components/detail/adapters.ts`, kind `'contact'`,
Call/Write `run` actions). Backend: `functions/api/cercle.ts` (contacts CRUD + R2
photo upload) + `functions/api/cercle-links.ts` (edges; server derives the inverse,
parity pinned by `src/lib/cercle.test.ts`), migration `0049_cercle.sql`. New shared
icons added to the registry: `cake-bold`, `envelope-bold`, `phone-bold`.

Phase 2 unified members + contacts as **people** (`buildPeople`, `personKey`, polymorphic
`contact_links` via migration `0050_cercle_people_links.sql` — endpoints are `(kind, id)`,
kind `contact|member`; server `ownsPersons` validates each side). New pieces: `BirthdayPicker`
(Month+Day+optional-Year, the easy birthday input), `LinkComposer` (the intuitive sentence-builder
"{X} est [lien] de {qui}" with a plain-language preview — replaces the old dropdown row; reused in
the contact form AND Réglages ▸ Membres so a family links its OWN members), and a `Liste / Liens /
Arbre` view switch on `/cercle` (`useTabParam`): `CercleEgo` (tap-to-focus ego view) + `CercleTree`
(generation-banded family tree) — both **hand-rolled SVG, zero deps** (research: a force-directed
graph is the wrong tool at this scale). Domain helpers `detectFamilyGroups`/`generationOf` operate on
composite keys; deleting a member cascades its cercle links.

Phase 4 added **`unifyCircle`** (a member + its hard-linked contact collapse to ONE
person; links/groups remapped onto the member) — used everywhere the people set is
shown — and a **family builder**: `FamilyBuilder` (`components/cercle/FamilyBuilder.tsx`)
on the `/cercle/family/new|:groupId` scene (`CercleFamilyPage`). Two interchangeable
modes over ONE pure engine in `lib/cercle.ts` — `familyLinksFromBands` (drag faces into
Grandparents/Parents/Children via `usePointerDnd`; infers parent↔child, siblings, the
two-parent spouse, grandparent↔grandchild — never the ambiguous grandparent↔parent side)
and `familyLinksFromMatrix` ("everyone is [lien] of one anchor") — plus `dedupeNewLinks`
and `parsePersonKey`. Relationship labels are gendered by the **subject** (`genderedRelLabel`,
table pinned by a test); the toddler view shows the OTHER person's role. The Maisonnée
itself is renamable in Réglages ▸ La maisonnée (`HouseholdNameField` → `/api/household`
`name`). A linked member's avatar comes FROM the Maisonnée (read-only in the contact form
+ a leading gallery tile).

`CookMode` now offers the PARENT lens three layouts via a bar switcher — **Recette**
(full scroll page), **Côte à côte** (`split`: ingredients pinned beside the steps,
two tabs on a phone) and **Focus** (`step`: the parent-styled stepper) — plus a
device-wide **density** control (Compact/Normal/Grand). The view choice persists
per recipe and the density device-wide via `lib/cookPrefs.ts`. The TODDLER lens
stays locked to the stepper (one-way door). `operator/display.tsx ▸ MeasureColorsSection`
is the Réglages ▸ Affichage editor for the spoon/cup colours (`lib/measurePrefs.ts`).

---

## CSS design system (condensed)

Tokens in `styles/core.css`; the `@import` order in `styles/../styles.css` **is** the
cascade — never reorder (append only).

- **Colour** — warm riso palette on paper. Families each have base/deep/wash:
  marigold (`--accent`/primary/food), terracotta (`--warn`/alert), sage (success),
  sky (calm), berry (play), butter. Inks: `--ink` / `--ink-soft` / `--ink-faint`.
  Night = `:root[data-theme='night']` inverts grounds, darkens washes.
- **Type** — `--display` (Baloo 2), `--sans` (Hanken Grotesk), `--font-hand` (Caveat,
  toddler), `--mono`.
- **Shape/elevation** — `--radius-sm|md|lg|xl|pill`; warm offset shadows
  `--shadow-sm|md|lg|press` (never grey).
- **Motion** — `--ease-soft`/`--ease-out`; `--dur-fast|base|slow`.

**Reusable class families:** `.btn` (+`--primary/--ghost/--sm/--danger`), `.input`,
`.chip`/`.tag`, `.row-actions__*`, `.edit-field__*`, `.surface`/`.card`, `.avatar`,
`.sheet__*` / `.scene__*` / `.confirm__*`, `.bigtile__*`, `.deck__*`, `.subtabs__*`,
`.bento`/`.sec-label` (board).

---

## Kit primitives (built — adopt incrementally)

These shared components now EXIST and are demoed in `/dev/kit` (built from the backlog
below). The call-site sweeps remain — do them with visual QA, not blind:
`EmptyState` (`components/EmptyState.tsx`), `StatusMessage` (`StatusMessage.tsx`),
`Chip`+`ChipGroup` (`Chip.tsx`), `SectionHeader` (`SectionHeader.tsx`), `ListRow`
(`ListRow.tsx`, class `.listrow` — NOT the swipe `.list-row`), `Modal` (`Modal.tsx`,
centred dialog), **`Sheet`** (`Sheet.tsx` — the bottom-sheet shell: `.scrim`+`.sheet`+
`.grab`+optional `.sheet__close`, wires `useModal`+`useSwipeToDismiss`; AddSheet,
ProfilePicker and the detail peek all use it), `OperatorSection`
(`operator/OperatorSection.tsx`). Shared CSS in `styles/kit.css`.

## Uniformization backlog (call-site sweeps — prioritised)

What's still duplicated at the call sites. The primitive now exists for rows 1–7
(✅); the work left is migrating usages.

| # | Cluster | Spread | Recommendation |
| --- | --- | --- | --- |
| 1 | **Empty states** ✅ | ~~20+ sites~~ | **Done** (2026-06-19) — ~45 `feed-empty`/`board__empty` `<p>` lines folded onto `<EmptyState>` (tone="calm" for --calm; className preserves layout classes). Left: `<div>`/`<span>` empties with content, HubLayout's inline-styled line, specialized per-context `*-empty` cells. |
| 2 | **Chips / tags / pills** ✅ | ~~40+ sites~~ | **Done** (2026-06-19) — 21 bare `.chip` toggles/labels onto `<Chip>` (identical `.chip`/`.is-on` markup), then `Chip` extended with `className`+`style` so the colour-tinted/extra-class pills folded in too (RecipesTab `kitchen__pill` + tag toggles, ContactForm `cf__tag`/`cf__group-add`). Left hand-rolled: the **drag-grip** pills (`recipesTags`/`recipePills` — grip + colour-edit/eye toggle inside the pill). |
| 3 | **List rows** ✅ selective | ~~40+ sites~~ | **Done as a selective primitive** (2026-06-19) — `<ListRow>` is a CARDED row, so it's applied where that fits (sparse simple "leading + title + subtitle + actions" rows): **device rows, agenda EventRow, chore ChoreRow** (recur/when → subtitle). Verified the carded look via `/dev/kit` + Playwright. The control-laden rows (ColorPicker/toggle/cadence/ToD-chip **mid-row**, expand-pickers) correctly STAY flat — ListRow can't express a mid-row control, and that's by design. |
| 4 | **OperatorSection wrapper** ✅ | ~~13 identical~~ | **Done** (2026-06-19) — all ~28 sections (incl. help-mode + className variants); primitive extended to render `HelpTitle`+`bubbleFor` from `help`/`helpKey`. No hand-rolled block remains. |
| 5 | **Modal / sheet / scene** ✅ | 12+ overlays | **Done** (2026-06-19). Key finding: the BEHAVIOR was already unified — `useModal` (Esc/scroll-lock/focus-trap) + `useSwipeToDismiss` are used across ~14 overlays. The one real markup dup was the **bottom-sheet shell**, now extracted into **`Sheet`** and adopted by AddSheet, ProfilePicker, EntityDetailSheet (verified: 21 sheet e2e + add-sheet/profile flows + the AddSheet screenshot are pixel-identical). Center dialogs (`Modal` exists; RecipeSheet/RecipeForm `.recipe-modal`, KidExitGate `.kid-exit-modal`, confirm `.confirm`) keep intentionally-distinct CSS — folding them onto `.kit-modal` would be appearance-changing for no behavioural gain; they already share `useModal`. Correctly DISTINCT: full editors (Cook/Cashier/DrawPad), lightbox (Flyer/Zoomable), dropdown (EntityCombobox), routes (Deals/Ambient), TourOverlay spotlight, toast. |
| 6 | **Status / feedback lines** ✅ | ~~15+ sites~~ | **Done** (2026-06-19) — 17 `error mono`/`capture__routed` lines onto `<StatusMessage>` (tone error/success; primitive owns role + icon). Left: VoiceStatus voicemsg, ai-error structured toast, kid routine status, AddSheet routing summary. |
| 7 | **Section headers** ⏸ | kitchen/kid/reserve header variants | **SKIP — poor fit.** The actual sites don't match `SectionHeader`'s emoji+title+action anatomy: `kitchen__head` wraps a help-mode `HelpTitle` (SectionHeader can't carry it), and `kid-head` is toddler-specific (`Sayable` + big playful styling) that genericizing would REGRESS. `SectionHeader` stays available for NEW headers; don't force the existing ones onto it. |
| 8 | **Picker menus** ✅ | ~~RecipePicker/LeftoverPicker~~ | **Done** — folded into **EntityCombobox** (search + pick + free-text, grouped). RecipePickerMenu/LeftoverPickerMenu deleted; MealIdeas/Leftovers/DayEditor/AddSheet migrated. |
| 9 | **Inline forms → EditField** | remaining `.operator__inline-form` users | migrate to EditField (see below). |

### EditField rollout
Done: Liste add, kitchen meal/supper/note + meal rename, routine deck rows, device
rename, postal, réserve add, **PantryTab low + use-soon add (voice)**, **recipesTags
tag-pill add + rename**, **CheckRow inline rename** (`.checkrow__edit`).
**Deliberately NOT migrated:** `forms/ChoreForm` / `EventForm` / `RoutineForm` title
inputs — these are sub-fields inside a larger composite `<form>` with one submit at
the bottom; `EditField` renders its own `<form>`, and nesting forms is invalid HTML.
They stay plain `.input` unless EditField grows a non-form (`as="div"`) mode.

---

## How to extend the gallery

Add a primitive to `src/pages/DevKit.tsx`: a `<Section title hint>` with one or more
`<Demo label>` specimens holding a live instance (local state for interactive ones).
Keep specimens prop-driven and data-free; anything needing live server data belongs
to the page-orchestrator list, not the gallery.
