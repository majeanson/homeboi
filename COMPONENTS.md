# Babillard — component inventory

> The shared UI, as the **`/dev/kit`** gallery holds it (`src/pages/DevKit.tsx`): every entry is
> collapsed by default (name + file), searchable, and unfolds to a live specimen across the four
> axes below. Reach it from **Réglages ▸ Système ▸ Avancé ▸ « Kit de composants »**, or `/dev/kit`.
> Everything under the marker line is **generated** (`npm run components`): the list is the
> gallery, and each purpose is the first sentence of the component's own doc comment. Which
> primitive carries which user action, from where, is the door table in **`PARITY.md`**.

## The four axes

Every themed surface renders across these. The `/dev/kit` toolbar flips each one
(they're global contexts persisted to localStorage — set, look, set back):

| Axis | Values | Read/set | Notes |
| --- | --- | --- | --- |
| **Theme** | day / night | `getTheme`/`setTheme` (`lib/theme.ts`) — imperative, sets `data-theme` on root | no provider; bootstrapped pre-mount by `public/theme-bootstrap.js` |
| **Surface** | kiosk / mobile | `useSurface()` (`lib/surface.ts`) | device role; `?surface=` |
| **Audience** | parent / toddler / simple | `useAudience()` (`lib/audience.ts`) | lens; `?kid=1` locks toddler (then `setAudience` is refused); `simple` = the post-reader/grandma face (`SimpleBoard`, root `data-lens="simple"` ~1.4× scale elsewhere) |
| **Locale** | fr / en | `useLang()` / `useT()` (`i18n.ts`) | Québécois FR-first; `typeof FR` is the EN parity contract |

Providers live in `src/main.tsx` (Query → Lang → Audience → Surface → Profile →
Calm → Help → Toast → Confirm → AiError → Auth → Router → Tour). A standalone route
like `/dev/kit` inherits all of them.

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
`.cluster`/`.rail` (horizontal-row primitives — see below), `.bento`/`.sec-label` (board).

**Horizontal rows → `Cluster` / `Rail` (never a hand-rolled flex row).** Any row of
buttons/chips/controls goes through one of two primitives (`components/Layout.tsx`,
CSS `.cluster`/`.rail` in `core.css`, demoed in `/dev/kit`): **`<Cluster>`** wraps to a
second line when it doesn't fit (the default — action bars, chip rows); **`<Rail>`**
stays one line and scrolls sideways (segmented controls, timelines, filmstrips — same
behaviour as `.subtabs`). A bespoke `display:flex` row with a fixed `flex-basis`
(e.g. `flex: 1 1 6rem`) is the #1 cause of x-overflow here: a basis smaller than the
item's content keeps everything on one line and bleeds off the right (the `.sheet`/
`#root`/`.hub__body` `overflow-x:hidden` then *hides* it rather than fixing it). Use
`<Cluster fill>` for "grow to share the row but wrap when narrow." The e2e guard
`journey-capture.spec.ts` measures per-child bleed past the container's right edge,
which sees through the clip.

**A side-scrolling row must stay reachable with a MOUSE → `useHScroll` (`lib/hscroll.ts`).**
Every `.rail`/`.subtabs`-style row hides its scrollbar for calm. On touch you swipe it;
on a desktop that used to hide content outright — no bar to drag, no swipe, and a mouse
wheel only emits `deltaY`, which no browser maps onto a horizontal scroller. `useHScroll`
translates the wheel (handing it back to the page at either end, so the row is never a
wheel trap) and reports `overflowing`/`atStart`/`atEnd` + `page()`/`toView()` so a caller
can draw an affordance. It adds no DOM and no layout, so it's safe on any existing row.
`Rail` and `SubTabs` wire it themselves (SubTabs also draws ‹ › chevrons while the row
overflows, on a fine pointer only, and keeps the selected tab in view). Attach it by hand
to any other hidden-scrollbar row. Guard: `e2e/journey-fit.spec.ts`.

**A full-screen surface where the user types → the "Keyboard fit" block (`core.css`) +
`lib/viewportVars.ts`.** iOS overlays the keyboard without shrinking the layout viewport
(and PANS it — vv.offsetTop — to reveal a caret near the bottom), so a fixed surface needs
two things, both learned from real on-device failures (July 2026, kbdebug screenshots):
(1) **fit** — the shell keeps `inset: 0` (full-size + opaque, covering the page behind)
and its CONTENT is padded into the visible band with `--vvt`/`--kb`; `height: var(--vvh)`
under `.kb-open` is the BANNED shell-shrink form — it un-covers the keyboard strip, a
live scrollable window onto the page behind. (2) **slack** — the surface's editing
scroller gets 120px trailing padding under `.kb-open`, because a caret on the LAST line
sits flush with the box bottom at max scroll (under the iOS floating accessory pill) and
otherwise has no room to rise: `civ below=72 moved=0`. A new surface should just BE a
`.scene` (FormScene); one that can't be adds `.vv-fit` on the shell + `.vv-slack` on the
scroller — never a new name forked into a new rule. The caret-follow itself (pin on
keyboard-rise + follow on input/selectionchange) is global in `lib/viewportVars.ts`,
nothing to wire per field. On-device diagnosis: Réglages ▸ Système ▸ Version — « Activer
le diagnostic clavier » (or `?kbdebug=1`). Guards: `src/styles/keyboard-fit.test.ts`
(build — bans the shrink, enforces the one definition), `e2e/journey-keyboard.spec.ts`
(strip-ownership probes, stranded-field follow, viewport-push pan), and
`e2e/journey-family-journey-mots.spec.ts` (shell coverage + slack ≥ 100px). Demoed in `/dev/kit`
▸ Fondations ▸ *Clavier (keyboard fit)*.

---

## How to extend the gallery

Add an `Entry` to `src/pages/DevKit.tsx` (`cat` / `name` / `file` / `kw` / `render`) whose render
holds one or more `<Demo label>` specimens, prop-driven and data-free. Give the component a doc
comment whose first sentence says what it is, then run `npm run components`.
`src/lib/componentsDoc.test.ts` fails the build when this file is not what the generator prints, and
`src/lib/devkitParity.test.ts` holds the gallery honest: every entry's `file` exists, every name it
advertises is exported, no component name lives in two files, one name per category.

A card that fetches its own data is shown with the toolbar's fourth switch, **« Données : Réelles |
Exemple »**: every `/api/*` GET answers from `e2e/mocks.ts` (`src/lib/devFixtures.ts`, dev builds only).

<!-- GENERATED BELOW by scripts/gen-components.mjs (npm run components) — edit the code, not this file -->

## The gallery, by category

148 entries in `/dev/kit`. Each purpose is the first sentence of the component's own doc comment; open the specimen to see it across theme, surface, lens and locale.

### Fondations

| Component | File | Purpose |
| --- | --- | --- |
| **WidgetGrid · CardSlot** | `components/board/WidgetGrid.tsx`, `components/board/CardSlot.tsx` | The board's widget-space layout engine. |
| **Contraste (WCAG)** | `lib/contrastAudit.ts` | Contrast maths, so an ink/ground pair can be CHECKED rather than eyeballed. |
| **Élévation (--shadow-*)** | `styles/core.css` | Babillard — single design-token stylesheet. |
| **Boutons (.btn)** | `styles/core.css` | Babillard — single design-token stylesheet. |
| **Cluster · Rail** | `components/Layout.tsx` | Wrap-safe flex row. Children shrink to their content and drop to the next line when they run out of room; every child gets min-width:0 (via the .cluster CSS) so a long word can shrink instead of forcing the row wider. |
| **Clavier (keyboard fit)** | `styles/core.css (« Keyboard fit ») + lib/viewportVars.ts` | — |
| **GlossaryTermMark** | `components/GlossaryTerm.tsx` | A WORD YOU CAN TAP, in Réglages and Comprendre only. |
| **Chip · ChipGroup** | `components/Chip.tsx` | The ONE chip — the small mono pill used for filters, toggles, day-pickers and tags across the app. |
| **Disclosure** | `components/Disclosure.tsx` | A calm, collapsed-by-default expand/toggle. |
| **Toggle** | `components/Toggle.tsx` | THE calm on/off pill — filled (btn--primary) when on, plain when off, with a glyph + label and `aria-pressed` reflecting state. |
| **FeatureMap** | `components/FeatureMap.tsx` | A calm grid of theme tiles — "everything Babillard does" at a glance, one source (the themed taxonomy in lib/guideContent). |
| **SubTabs** | `components/SubTabs.tsx` | SubTabs — the app-wide segmented "one job at a time" sub-tab control (the `.subtabs` family in styles/core.css). |
| **Icon · InlineIcon** | `components/Icon.tsx` | An icon sized to sit inline with text (baseline-aligned), for mid-sentence use or beside a label in a button/chip. |

### Saisie

| Component | File | Purpose |
| --- | --- | --- |
| **Segmented** | `components/Segmented.tsx` | THE value picker (solidify 3.3, 2026-11-05): one choice among a few, shown in place. |
| **Field** | `components/Field.tsx` | THE labelled form field (solidify 3.1, 2026-11-05). |
| **TimeField** | `components/TimeField.tsx` | THE time-of-day control: an hour and a minute, always on a 24-hour clock. |
| **EditField** | `components/EditField.tsx` | The ONE add/edit text box. |
| **useMemoAttach** | `components/MemoAttach.tsx` | « Joindre » — the ONE way to hang a voice memo (#38), a drawing (#14) or a photo (#13) onto whatever you're writing. |
| **AislePicker** | `components/AislePicker.tsx` | The shared "which store aisle does this grocery item sort into?" picker. |
| **ModeToggle** | `components/ModeToggle.tsx` | The ⚙ SIMPLE ↔ AVANCÉ chip — THE control of every two-faces surface (« Les notes », « La liste », the garde-manger, the meal pools; flags minted by lib/surfaceMode's createModeStore). |
| **SearchField** | `components/SearchField.tsx` | SearchField — THE in-page search box: a magnifier glyph, the field itself, and a trailing ✕. |
| **CopyButton** | `components/CopyButton.tsx` | THE copy-to-clipboard affordance. |
| **EntityCombobox** | `components/EntityCombobox.tsx` | The ONE "choose an existing thing, OR just type a new one" control. |
| **ContactFields** | `components/cercle/ContactFields.tsx` | The shared identity field-cluster for a person: name parts, birthday, gender, and (optionally) phone/email/address. |
| **ColorPicker** | `components/ColorPicker.tsx` | A row of colour dots — pick one. |
| **MemberSwitcher** | `components/MemberSwitcher.tsx` | The shared "pick-a-face" row — the calm Maisonnée + member faces control from the board's "Aujourd'hui" header (the kiosk member switcher), now generalized so any surface reuses the SAME look + behaviour. |
| **MemberPicker** | `components/MemberPicker.tsx` | The MULTI-select sibling of MemberSwitcher: tap household faces to select several at once — a chore rotation, an event's passengers, a pet's owners, a routine's kids. |
| **FormFooter** | `components/FormFooter.tsx` | The one shared commit bar for every edit/create form. |
| **EmojiPicker** | `components/EmojiPicker.tsx` | Tap-to-pick emoji grid — the one shared control for choosing a glyph (a routine card, a carnet, anything). |
| **LookPicker** | `components/LookPicker.tsx` | THE LOOK OF A THING: an icon and a colour, in ONE control (plans/2026-11-06-TACHE-UNIFIEE.md, phase 3). |
| **EffortDots** | `components/EffortDots.tsx` | THE EFFORT OF A TASK (0149, plans/2026-11-06-TACHE-UNIFIEE.md phase 3b): five dots, one is tout simple, five is gros effort. |
| **TaskForm** | `components/forms/TaskForm.tsx` | THE ONE TASK FORM (plans/2026-11-06-TACHE-UNIFIEE.md, phase 4). |
| **FaceSelect** | `components/FaceSelect.tsx` | The COLLAPSED "pick-a-face" control — a small chip showing the current face that opens the shared face sheet (`FaceSheet`) on tap. |
| **GroupForm** | `components/cercle/GroupForm.tsx` | The name + kind + colour editor for a « Le cercle » named group, shared by the create flow (bottom of the directory) and the inline edit on a group header. |
| **ShareModal** | `components/ShareModal.tsx` | The ONE share sheet. |
| **FamilyShareModal** | `components/cercle/FamilyShareModal.tsx` | « Partager une famille » — the SENDER's share sheet. |
| **BusinessForm** | `components/cercle/BusinessForm.tsx` | « Le cercle » → Business: add / edit one service card (vet, plombier, hôpital…). |
| **ConnectPeople** | `components/cercle/ConnectPeople.tsx` | Connect two families (or any two people) at a SINGLE junction: "X est [lien] de Y". |
| **PetForm** | `components/cercle/PetForm.tsx` | « Le cercle » → Pets: add / edit one animal — a ContactForm cousin (no relationships or vCard) with the care fields a household needs at a glance: species/breed, birthday, microchip #, feeding schedule, sitter… |
| **CompleteFamilies** | `components/cercle/CompleteFamilies.tsx` | « Compléter les familles » — ONE button that deduces every family link worth making across the whole intertwined family, then lets you tick which to keep (the same approve-then-apply ReviewChecklist as the .vcf import). |
| **ReviewChecklist** | `components/ReviewChecklist.tsx` | A « review-then-apply » checklist in a Modal: show a batch of proposed changes, tick which ones to keep (all preselected), then apply the whole list or just the selection. |
| **CercleNotes** | `components/cercle/CercleNotes.tsx` | « Les notes » — iOS-Notes-style notes scoped to ONE household member (the "Moi" list) or the whole Maisonnée (family-wide). |
| **SectionAdd** | `components/SectionAdd.tsx` | SectionAdd — THE "open this section's composer" affordance: a small round ＋ in a section's header that flips to ✕ while its add box is open. |
| **NoteQuickAdd** | `components/cercle/NoteQuickAdd.tsx` | The ONE quick « note rapide » composer for family_notes — one line to write, a mic, and the 📎 to clip a voice memo / drawing / photo onto it, in ONE write. |
| **NoteEditor** | `components/cercle/NoteEditor.tsx` | Full-screen iOS-Notes-style editor for « Le cercle » → Notes, reused for BOTH a new note and modifying an existing one (#richnotes). |
| **MotComposer** | `components/mots/MotComposer.tsx` | « Mot » composer — the board ＋ FAB « Mot » panel (#mots). |
| **ScheduleFields** | `components/mots/ScheduleFields.tsx` | The « Plus tard » date+time picker, shared by the mot composer AND the sender-outbox reschedule modal. |
| **RecurPicker** | `components/RecurPicker.tsx` | Recurrence control for the event form: pick a frequency (or "never"), an interval, and — for weekly — which weekdays ("garbage every Wednesday"). |
| **LeadPicker** | `components/LeadPicker.tsx` | Calm "Bientôt" reminder lead: how far AHEAD the board starts highlighting a dated item (event / scheduled chore). |
| **PhotoField** | `components/PhotoField.tsx` | THE optional-single-photo field — pick one image, see it, replace it by picking again. |
| **RecipeIngredientPick** | `components/RecipeIngredientPick.tsx` | THE « quels ingrédients ? » checklist — tick the few you're missing before a recipe's ingredients go on the shared grocery list. |
| **CardDeckEditor** | `components/CardDeckEditor.tsx` | Edit a routine's deck of picture cards: each card is an emoji + a word. |
| **DocUploadButton** | `components/DocUploadButton.tsx` | « Joindre un document » — the ONE control that is deliberately NOT a memo attachment (useMemoAttach). |
| **MealPlanPicker** | `components/kitchen/MealPlanPicker.tsx` | The shared "place this onto the week" picker: choose a meal slot, then a day. |

### Rangées & actions

| Component | File | Purpose |
| --- | --- | --- |
| **IconButton** | `components/IconButton.tsx` | THE icon-only button (solidify 2.5, 2026-11-05). |
| **RowActions** | `components/RowActions.tsx` | The ONE affordance every manageable row uses: icon-only edit + delete, the same two Phosphor glyphs (pencil-simple-bold / trash-bold) everywhere, so the app stops mixing "Modifier", "Retirer", a bare ✕ and a text… |
| **Reorder** | `components/Reorder.tsx` | The ↑/↓ reorder pair — ONE implementation. |
| **ActionMenu** | `components/ActionMenu.tsx` | The shared overflow menu — a "⋯" button that folds a surface's SECONDARY actions into one compact dropdown, so the surface itself keeps at most its one or two primary buttons (the recipe view's footer went from seven… |
| **DragPill** | `components/DragPill.tsx` | The shared "draggable pill/row" shell over usePointerDnd (lib/dnd). |
| **CheckRow** | `components/CheckRow.tsx` | The ONE calm check-list row. |
| **ListRow** | `components/ListRow.tsx` | A general list-row shell: an optional leading slot (icon/avatar/picture), a title with optional subtitle, and an optional trailing actions slot. |
| **Act · Section** | `components/board/Act.tsx` | Pip section header: an optional category glyph + label + rule + a quiet count (never a score). |
| **BoardCard · SecLabel** | `components/board/BoardCard.tsx` | A board glance card SHELL — the standalone (non-bento-grid) cards that sit in the board's status band or full-width strips (« L'auto », « Les carnets », « Cette saison »). |
| **Fil (le fil du jour)** | `components/board/Fil.tsx` | One thing on the ribbon: a pre-rendered row (the host builds it with its own `eventAct`/`choreAct`/`workAct`, so taps + checks keep working) plus the times the layout needs. |
| **MealPool (idées / restants)** | `components/kitchen/MealPool.tsx` | A "meal pool" — a reusable shortlist of meal candidates under the week grid that you plan onto a day. |
| **EntityDetailSheet** | `components/detail/EntityDetailSheet.tsx` | The generalized "entity detail" peek: one calm bottom sheet that renders any DetailModel (lib/detail) — a quick picture, a date, the relevant text, the face it belongs to, and a couple of smart actions. |
| **FormDelete** | `components/FormDelete.tsx` | « Supprimer » under an edit form (a rendez-vous, a task). |
| **TaskList** | `components/tasks/TaskList.tsx` | The rows, and the one bulk gesture. |
| **SubjectTasks** | `components/tasks/SubjectTasks.tsx` | THE TASKS OF ONE SUBJECT — one component for a carnet, a person and a pet (plan de la tâche unifiée, phase 2). |
| **SubjectPicker** | `components/tasks/SubjectPicker.tsx` | The last option: a subject that does not exist yet. |
| **RotationField** | `components/tasks/RotationField.tsx` | « Qui ? », for any task: nobody, one person, or, on a recurring task, « chacun son tour ». |
| **TodoSection** | `components/todos/TodoSection.tsx` | À cocher — a calm check-off list (todos), drop-in for the board glance (global + today) and the day page (one day). |
| **DealCard** | `components/DealCard.tsx` | One flyer-deal card: clipping image, store (+ best-price star), name, valid dates, price / unit-price / was-price, and a row of actions. |
| **SwipeDeletePane** | `components/SwipeDeletePane.tsx` | The red "delete" pane `useSwipeToDelete` (lib/useSwipeToDelete.ts) reveals behind a `.list-row` as the foreground slides left. |

### Affichage

| Component | File | Purpose |
| --- | --- | --- |
| **BoardLayoutSection** | `components/operator/boardLayout.tsx` | « Disposition du babillard » — per-device control over which board cards show, how wide they are, and in what order (lib/boardCards). |
| **SectionHeader** | `components/SectionHeader.tsx` | A small section header: an optional emoji/icon, a title, an optional subtitle, and an optional trailing action (a "＋ Ajouter", a filter). |
| **RoutineRing** | `components/RoutineRing.tsx` | A calm "où on est rendu aujourd'hui" cue: a fixed-width ring filled to today's proportion of finished steps (a ring, not a row of dots — a 12-step deck would overflow a phone card). |
| **Companion** | `components/Companion.tsx` | A member's chosen routine companion, drawn as its emoji. |
| **SceneHead** | `components/SceneHead.tsx` | The shared header bar for every full-screen .scene route (quick-add, price match, deals browser, day plan, the operator add-forms…). |
| **HubHead** | `components/HubHead.tsx` | The shared header for the four themed hub tabs (Board/Kitchen/Routines/Liste): a big title on the left, the section's identity disc top-right. |
| **SectionAvatar** | `components/SectionAvatar.tsx` | The section's identity glyph in the top-right of every themed tab's header. |
| **Avatar** | `components/Avatar.tsx` | One place that knows how to draw a person: their photo if they have one, else a coloured disc with their initial(s). |
| **AvatarStack** | `components/AvatarStack.tsx` | A compact overlapping row of household faces — an event's « Qui » (the people a rendez-vous concerns) or a ride's passengers. |
| **BigTiles · Sayable** | `components/BigTiles.tsx` | Toddler-surface text that reads itself aloud on tap — headings, greetings, empty lines. |
| **ToddlerCollections** | `components/kitchen/ToddlerCollections.tsx` | #11 toddler "collections" — the pre-reader's hear-first walk through the recipe book BY COLLECTION (the existing recipe tag system, reused as a browse layer; no migration, no endpoint). |
| **IngredientLine** | `components/IngredientLine.tsx` | Render one ingredient line with its measuring-tool amounts turned into tappable, colour-coded pills. |
| **MeasureScoops** | `components/MeasureScoops.tsx` | "Scoops" — a measure drawn as physical fills of its colour-coded tools: one circle per scoop, EACH tinted to the very tool you'd grab. |
| **Img** | `components/Img.tsx` | THE image element. Every picture the app shows — an R2 blob by its key (`imgUrl`), a flyer clipping through `/api/flyer-img`, a store logo, a recipe photo from the web, a data-URL — renders through here, and a build… |
| **ZoomableImg** | `components/ZoomableImg.tsx` | Tap an image to open it full-screen (zoom-in); tap the backdrop, the ✕, or press Esc to close. |
| **WonderBand** | `components/board/ApodFrame.tsx` | The presentational band: the image + a localized kicker per source, the title, an optional clamped blurb that expands, a 🔊 hear button (reads in the text's own language), an optional credit, and a small corner… |
| **SkyTonight** | `components/board/SkyTonight.tsx` | « Ce soir dans le ciel » — tonight's moon phase, computed locally by the pure `lib/moonPhase` (no network, offline-safe, no key). |
| **PanZoom** | `components/PanZoom.tsx` | A calm inline pan + zoom surface. |
| **PhotoMosaic** | `components/PhotoMosaic.tsx` | Full-screen family-memory mosaic for the idle screensaver: tiles the whole surface with family PHOTOS and saved kids' DRAWINGS (#49), and every few seconds cross-fades ONE random tile to a different image. |
| **HeartButton** | `components/HeartButton.tsx` | `name` (review #35): every heart said « J'aime » — on a recipe book that is a column of identical buttons. |
| **SimpleBoard** | `components/board/SimpleBoard.tsx` | « Simple » board (bmad/08 A-1) — the post-reader/grandma glance: calm zones instead of the parent's bento. |
| **MonthView** | `components/board/MonthView.tsx` | "Mois" — the fourth board take (after bento · next · lanes): a calm six-week calendar of EVERYTHING dated, so a glance answers "what's the month look like?" Cells carry colour dots; tapping a day opens its full list… |
| **YearView** | `components/board/YearView.tsx` | Page-local query key: the year read lives only here (queryKeys.ts is for cross-page keys). |
| **RoutinesTab** | `components/maison/RoutinesTab.tsx` | The routines overview (Maison ▸ Routines): every routine as a card, grouped by the moment of the day with the current moment first, each card showing its progress and opening its player. |
| **DayNote** | `components/board/DayNote.tsx` | The Aujourd'hui board's note for TODAY — the memo pinned to this day in La cuisine (functions/api/day-notes). |
| **ActivityBring** | `components/board/ActivityBring.tsx` | « À apporter » — the bring-lists for the day's activities, surfaced in « Avant de partir ». |
| **DepartureCard** | `components/board/DepartureCard.tsx` | « Avant de partir » — the departure concept's board home (mig 0116, the todos ↔ departure split). |
| **ARegler** | `components/board/ARegler.tsx` | « À régler » — a quiet board card surfacing the cross-domain heads-up scan: a short list of frictions worth sorting (a ride with no driver, an empty supper, a birthday with no gift idea…), each tappable through to… |
| **CarnetDocs** | `components/cercle/CarnetDocs.tsx` | The attached-docs strip for a « carnet » — an invoice, a manual, a photo (R2 keys). |

### Sections & pages

| Component | File | Purpose |
| --- | --- | --- |
| **MealIdeas** | `components/kitchen/MealIdeas.tsx` | « Idées de repas » — the kept, reusable pool: free text ("tacos") or a saved-recipe shortcut. |
| **IdeasDrawer** | `components/kitchen/IdeasDrawer.tsx` | « Un seul tiroir d'idées-repas » (C-14, bmad/10) — the ONE place every source of "what's for supper" ideas lives, replacing four-plus scattered pools a family learned one of and never found the rest (dormant machinery). |

### Overlays & chrome

| Component | File | Purpose |
| --- | --- | --- |
| **RecentsPanel** | `components/RecentsPanel.tsx` | The calm "Récents" review (#38): a quiet, opt-in look at the last few actions this session — what happened + when — with a late "Annuler" for anything still in its hold window. |
| **useConfirm** | `lib/confirm.tsx` | A real in-app confirm dialog — replaces the platform `window.confirm()` (ugly, unstyled, blocks the JS thread, invisible to e2e) for the few HEAVY deletes that warrant a deliberate yes/no rather than the forgiving… |
| **Modal** | `components/Modal.tsx` | A centred dialog wrapper: one place that wires the shared modal behaviour (Escape, scroll-lock, focus-trap, the phone's back button — via useModal), the backdrop, and the ✕ close, so the dozen hand-rolled overlays… |
| **AskDialog** | `components/AskDialog.tsx` | E-22 — « Parle à la maison » : the ONE voice surface, reachable from every hub tab's header. |
| **EmptyFridgeDialog** | `components/kitchen/EmptyFridgeDialog.tsx` | « Vide-frigo » — turn what's about to spoil into supper, in two calm steps: 1. |
| **DrawEditChoice** | `components/DrawEditChoice.tsx` | #14 — the small choice shown when you tap an existing drawing to keep working on it. |
| **BookmarkletHowTo** | `components/BookmarkletHowTo.tsx` | THE ONE how-to for the « Envoyer à Babillard » bookmark — shown where the cook needs it: in Réglages ▸ La cuisine (the standing card) AND right under a « ce site bloque l'importation » message in the recipe form… |
| **RecipeReadReview** | `components/RecipeReadReview.tsx` | Verify-against-the-photo gate for a recipe read (Pillar 3 of the faithful-import work). |
| **Sheet** | `components/Sheet.tsx` | The ONE bottom-sheet shell. |
| **SettingsRow** | `components/operator/SettingsRow.tsx` | THE Réglages setting row (solidify 3.2, 2026-11-05): a label on the left, the control on the right, an optional hint line under the row. |
| **OperatorSection** | `components/operator/OperatorSection.tsx` | Every Réglages panel is the same shell: a `.surface` card with a heading, an optional lead paragraph, and the body. |
| **HouseholdListSection** | `components/operator/HouseholdListSection.tsx` | THE shared Réglages section for a "household list setting" — a small editable list of `{id, name, colour}` items kept in one `households.*` JSON column. |
| **SharePreviewBar** | `components/SharePreviewBar.tsx` | The banner an operator sees on top of a previewed scene: a calm note + a way back to settings (a guest scene has no close affordance — this IS that affordance, only for the operator). |
| **HelpBubble** | `components/HelpBubble.tsx` | A small in-place help box: a title, one calm line, and two ways out. |
| **OfflineBanner** | `components/OfflineBanner.tsx` | A clear, calm "hors ligne" bar shown across the hub when the device loses connectivity OR (bmad/10 B-7) when it's still "online" but the shared data has quietly stopped refreshing (captive portal, dead uplink past… |
| **ErrorBoundary** | `components/ErrorBoundary.tsx` | App-level safety net. |
| **TopBar** | `components/TopBar.tsx` | Minimal chrome: brand, day/night, FR/EN. |
| **FaceSheet** | `components/FaceSheet.tsx` | THE "pick a face" bottom sheet — the grid of household faces plus the neutral « tout le monde » tile, in one place. |
| **FormScene** | `components/FormScene.tsx` | Shared shell for the operator add-forms (event / chore / routine). |
| **DrawPad** | `components/DrawPad.tsx` | The family draw pad for a fridge note (#14) — useful + educational, ~80% for the kids. |

### Feedback

| Component | File | Purpose |
| --- | --- | --- |
| **Skeleton** | `components/Skeleton.tsx` | The waiting state for a surface whose SHAPE is already known — a list of rows, a grid of cards. |
| **EmptyState** | `components/EmptyState.tsx` | The ONE "nothing here, and that's fine" line. |
| **GuestExpired** | `components/GuestExpired.tsx` | The terminal state for a guest scene whose share link 401/403'd — expired or revoked. |
| **StatusMessage** | `components/StatusMessage.tsx` | `live` (default on) gives the line its live-region role — an error is an alert, the rest a status; a line that is READ, not announced (a count beside a list, a hint that was there before the reader arrived) passes… |
| **LoadError** | `components/LoadError.tsx` | The honest face of a data-less read that ERRORED. |
| **QrCode** | `components/QrCode.tsx` | A dumb, presentational QR tile. |
| **TimerRail** | `components/cook/TimerRail.tsx` | The running-timers rail — shared by single-recipe CookMode and the multi-recipe cook (#43). |
| **SoundToggle** | `components/SoundToggle.tsx` | « Le son » — the app's own silent switch (lib/sound). |
| **VoiceButton · VoiceStatus** | `components/VoiceButton.tsx` | The calm one-line feedback under a continuous (auto-add) voice field: a hint while the mic is open, or WHY nothing landed (denied / unsupported / silence) so the mic is never a silent dead button. |
| **Loading · LoadState · PairPrompt** | `components/Fallback.tsx` | Shown while the first fetch is in flight. |
| **HelpDot** | `components/HelpDot.tsx` | A small "?" beside a section that deep-links into the Guide at the matching card (/settings?card=<id>, read by GuideSection). |
| **SectionIntro** | `components/SectionIntro.tsx` | A calm, once-per-section welcome card shown the FIRST time a parent opens a themed tab — the progressive, in-context half of onboarding (the guided tour covers the cross-cutting basics; this explains "what this… |
| **SampleBanner** | `components/SampleBanner.tsx` | The board banner for a freshly-seeded household (onboarding Phase 1). |
| **WelcomeCard** | `components/WelcomeCard.tsx` | The Board first-run card for a brand-new household: a short setup checklist (add the family → set the meals → pair a tablet) plus the shared FeatureMap so a newcomer can also see — and jump into — everything the app… |
| **DidYouKnowCard · WhatsNewLine** | `components/operator/discover.tsx` | « Le saviez-vous ? » — ONE dismissible card for a feature the household provably hasn't touched. |

### Cercle

| Component | File | Purpose |
| --- | --- | --- |
| **CercleConstellation** | `components/cercle/CercleConstellation.tsx` | « Notre monde » — the BIG-PICTURE map of the whole circle. |
| **JoindreRail** | `components/cercle/JoindreRail.tsx` | « Joindre » (A-6, bmad/10) — "call the dentist" used to be a 3-tap hunt across Famille/Social/Business. |

### Voyage

| Component | File | Purpose |
| --- | --- | --- |
| **TripNoteCard** | `components/voyage/TripNoteCard.tsx` | One « Voyage » info/itinerary entry: an optional category glyph + label, the text, and any attached media (a voice memo plays inline; a drawing/photo zooms). |
| **SharedPackingList** | `components/voyage/SharedPackingList.tsx` | « Voyage partagé » → Bagages — the shared-trip sibling of PackingList. |
| **VoyageShareModal** | `components/voyage/VoyageShareModal.tsx` | « Voyage partagé » → the invite sheet (opened from the « Partagé » header chip or the foot « Inviter »). |

### Toddler

| Component | File | Purpose |
| --- | --- | --- |
| **SeekGame** | `components/jouer/SeekGame.tsx` | « Cherche et trouve » — the hear-first find-it TOY. |
| **ToddlerBoard** | `components/board/ToddlerBoard.tsx` | Toddler lens on the SAME board data as the parent — same content, kid UI: big read-aloud tiles, picture-first, member colour says whose thing it is. |
| **NotesKidView** | `components/cercle/NotesKidView.tsx` | Toddler lens for « Les notes » (pages/Notes.tsx): read-only, hear-first — the same `.cercle-kid` faces-grid anatomy CircleKidView uses (reused as-is, no new CSS), one card per Maisonnée note instead of one per person. |

## Not in the gallery

Exported components with no specimen: routes, page orchestrators that need live household data, and parts that only make sense inside their parent. Listed so a search finds them before anyone rebuilds one.

- `components/AddSheet.tsx`: AddSheet
- `components/AmbientScreen.tsx`: AmbientScreen
- `components/board/AutoCard.tsx`: AutoCard, AutoCardView
- `components/board/BoardCanvas.tsx`: BoardCanvas
- `components/board/CarnetsCard.tsx`: CarnetsCard
- `components/board/CercleNotesCard.tsx`: CercleNotesCard
- `components/board/chrome.tsx`: BoardViewToggle, TodayFaceRow
- `components/board/CountdownCard.tsx`: CountdownCard
- `components/board/DayHeroes.tsx`: DayHeroes
- `components/board/DayMark.tsx`: DayMark
- `components/board/HabitudesCard.tsx`: HabitudesCard
- `components/board/Notes.tsx`: Notes
- `components/board/PhotoFrame.tsx`: PhotoFrame
- `components/board/RemarksCard.tsx`: RemarksCard
- `components/board/RoutineNextCard.tsx`: RoutineNextCard
- `components/board/SeasonUpkeepCard.tsx`: SeasonUpkeepCard
- `components/board/SkySheet.tsx`: SkySheet
- `components/board/SouvenirsCard.tsx`: SouvenirsCard
- `components/board/TasksView.tsx`: TasksView
- `components/board/TodayChangesSheet.tsx`: TodayChangesSheet
- `components/board/VoyageCard.tsx`: VoyageCard
- `components/board/WeekView.tsx`: WeekView
- `components/CaptureForm.tsx`: CaptureForm
- `components/CashierMode.tsx`: CashierMode
- `components/cercle/BirthdayPicker.tsx`: BirthdayPicker
- `components/cercle/BusinessesTab.tsx`: BusinessesTab
- `components/cercle/CareLogForm.tsx`: CareLogForm
- `components/cercle/CarnetForm.tsx`: CarnetForm
- `components/cercle/CarnetsTab.tsx`: CarnetsTab
- `components/cercle/CercleEgo.tsx`: CercleEgo
- `components/cercle/CercleTree.tsx`: CercleTree
- `components/cercle/CercleWeb.tsx`: CercleWeb
- `components/cercle/ContactForm.tsx`: ContactForm
- `components/cercle/ContactPhotos.tsx`: ContactPhotos
- `components/cercle/FamilyBuilder.tsx`: FamilyBuilder
- `components/cercle/HomePinForm.tsx`: HomePinForm
- `components/cercle/LinkComposer.tsx`: LinkComposer
- `components/cercle/NoteEditorTiptap.tsx`: NoteEditorTiptap
- `components/cercle/NotesList.tsx`: NotesList
- `components/CheckDisc.tsx`: CheckDisc
- `components/ChoreLedger.tsx`: ChoreLedger
- `components/CookMode.tsx`: CookMode
- `components/DealsBrowser.tsx`: DealsBrowser
- `components/detail/DetailProvider.tsx`: DetailProvider
- `components/EntityShareModal.tsx`: EntityShareModal
- `components/FlippDialog.tsx`: FlippDialog
- `components/FlippPager.tsx`: FlippPager
- `components/FlyerViewer.tsx`: FlyerViewer
- `components/forms/EventForm.tsx`: EventForm
- `components/forms/HabitForm.tsx`: HabitForm
- `components/forms/PlanForm.tsx`: PlanForm
- `components/forms/RoutineForm.tsx`: RoutineForm
- `components/forms/TransferForm.tsx`: TransferForm
- `components/GuideSheet.tsx`: GuideSheet
- `components/habits/DefiBlock.tsx`: DefiBlock
- `components/habits/HabitControls.tsx`: HabitControls
- `components/habits/HabitHistory.tsx`: HabitHistory
- `components/habits/HabitRow.tsx`: HabitRow
- `components/habits/ReminderTimesField.tsx`: ReminderTimesField
- `components/HubLayout.tsx`: HubLayout
- `components/InstallHint.tsx`: InstallHint
- `components/jouer/BirthdayCountdown.tsx`: BirthdayCountdown
- `components/jouer/DayTimeline.tsx`: DayTimeline
- `components/kitchen/DayEditor.tsx`: DayEditor
- `components/kitchen/HistoryTab.tsx`: HistoryTab
- `components/kitchen/Leftovers.tsx`: Leftovers
- `components/kitchen/MealRows.tsx`: MealRows
- `components/kitchen/PantryTab.tsx`: PantryTab
- `components/kitchen/RecipesTab.tsx`: RecipesTab
- `components/kitchen/ReserveSection.tsx`: ReserveSection
- `components/kitchen/SlotPicker.tsx`: SlotPicker
- `components/kitchen/ToddlerCookBook.tsx`: ToddlerCookBook
- `components/kitchen/ToddlerKitchen.tsx`: ToddlerKitchen
- `components/kitchen/UnplacedDay.tsx`: UnplacedDay
- `components/mots/RescheduleBody.tsx`: RescheduleBody
- `components/MultiCookMode.tsx`: MultiCookMode
- `components/operator/advanced.tsx`: DevKitSection, SampleDataSection
- `components/operator/agenda.tsx`: EventsSection, SchoolYearSection
- `components/operator/ai.tsx`: AiSection
- `components/operator/aiErrors.tsx`: AiErrorLogSection
- `components/operator/aisles.tsx`: AisleOrderSection
- `components/operator/ambient.tsx`: AmbientSettingsSection, HabitCheckinSection
- `components/operator/buildInfo.tsx`: BuildInfoSection
- `components/operator/cars.tsx`: CarsSection
- `components/operator/cercle.tsx`: CercleGroupsSection
- `components/operator/chores.tsx`: RoutinesSection
- `components/operator/CoOperatorsSection.tsx`: CoOperatorsSection
- `components/operator/devices.tsx`: ClaimTablet, DevicesSection, AgentSection
- `components/operator/display.tsx`: DisplaySection, VoiceSection, MeasureColorsSection, CalmSection
- `components/operator/guest.tsx`: GuestSection
- `components/operator/guide.tsx`: ComprendrePanel, DiscoverSection
- `components/operator/healthCard.tsx`: HealthSection
- `components/operator/HouseDiary.tsx`: HouseDiarySection
- `components/operator/household.tsx`: MembersSection
- `components/operator/IntakeReview.tsx`: IntakeReview
- `components/operator/kbDebug.tsx`: KbDebugSection
- `components/operator/meals.tsx`: MealSlotsSection, MealWindowSection
- `components/operator/media.tsx`: RecapSection, PhotosSection
- `components/operator/micTest.tsx`: MicSelfTest
- `components/operator/PostboxReview.tsx`: PostboxReview
- `components/operator/recipePills.tsx`: RecipePillsSection
- `components/operator/recipesTags.tsx`: RecipeTagsSection, RecipeBookmarkletSection
- `components/operator/remarks.tsx`: RemarksSection
- `components/operator/reserve.tsx`: ReserveLocationsSection
- `components/operator/sampleData.tsx`: SampleDataControls
- `components/operator/schedule.tsx`: ScheduleSection
- `components/operator/SessionsSection.tsx`: SessionsSection
- `components/operator/shopping.tsx`: ShopSection, StoreFilterSection, HistorySection, GhostSection, FlippSection
- `components/operator/takeout.tsx`: TakeoutSection
- `components/operator/ThisWeekTogetherSection.tsx`: ThisWeekTogetherSection
- `components/operator/todos.tsx`: TodoTemplatesSection
- `components/ProfilePicker.tsx`: ProfilePicker
- `components/RecipeForm.tsx`: RecipeForm
- `components/RecipeScene.tsx`: RecipeScene
- `components/RecipeShareModal.tsx`: RecipeShareModal
- `components/RemarkComposer.tsx`: RemarkComposer
- `components/RoutinePlayer.tsx`: RoutinePlayer
- `components/share/SharedEventCard.tsx`: SharedEventCard
- `components/share/SharedRecipeView.tsx`: SharedRecipeView
- `components/share/SharedRoutineView.tsx`: SharedRoutineView
- `components/StaleBounce.tsx`: StaleBounce
- `components/tasks/SeasonSeeds.tsx`: SeasonSeeds
- `components/tasks/TaskFinder.tsx`: TaskFinder
- `components/tasks/TaskSpecimens.tsx`: SubjectTasksSpecimen, SubjectPickerSpecimen, RotationFieldSpecimen, TaskListSpecimen
- `components/ToddlerExitGate.tsx`: ToddlerExitGate
- `components/todos/TemplateEditor.tsx`: TemplateEditor
- `components/tour/TourOverlay.tsx`: TourOverlay
- `components/virements/CatchupGraph.tsx`: CatchupGraph
- `components/virements/CatchupMath.tsx`: CatchupMath
- `components/virements/PlanCard.tsx`: PlanCard
- `components/virements/VirementsSection.tsx`: VirementsSection
- `components/virements/YearSummary.tsx`: YearSummary
- `components/voyage/PackingList.tsx`: PackingList
- `components/voyage/SharedClaims.tsx`: SharedGearList, SharedMealPlan
- `components/voyage/SharedTripTabs.tsx`: SharedTripTabs
- `components/voyage/TripNoteAdd.tsx`: TripNoteAdd
- `components/voyage/VoyageAlbum.tsx`: VoyageAlbum
- `components/voyage/VoyageDocuments.tsx`: VoyageDocuments
- `components/voyage/VoyageInfos.tsx`: VoyageInfos
- `components/voyage/VoyageItinerary.tsx`: VoyageItinerary
