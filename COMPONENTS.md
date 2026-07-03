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
| **AislePicker** | `components/AislePicker.tsx` | THE "which store aisle does this grocery item sort into?" `<select>` — "Auto — <guess>" + the fixed aisles (`lib/aisle.ts`). Writes a per-item **override** keyed by `aisleKey(text)` (normalized identity) via `/api/household` (`aisleOverride:{key,aisle}`), so setting it on a list line, its recurrent quick-add item, or anywhere shares one key. Persists instantly (HOUSEHOLD_KEY → La liste re-sorts by aisle). Disabled for guests. Used in `ListEditPage`, `QuickAddPage` (`qa__aisle` compact). |
| **EntityCombobox** | `components/EntityCombobox.tsx` | THE "search + pick an existing thing + free-text" field. One box: type to filter a grouped dropdown (`ComboOption[]` with icons/badges), tap a row to link it, or just type & submit. Clearable ✕, caret-to-open, optional mic. Replaces the old "type here OR toggle a separate list" split. Kitchen builders in `kitchen/comboOptions.tsx`. Used in MealIdeas, Leftovers, DayEditor (recipes+restants), AddSheet leftovers. |
| **ContactFields** | `components/cercle/ContactFields.tsx` | THE shared identity field cluster (name parts, birthday, gender, optional phone/email/address) — controlled (`value`/`onChange` patch), `showContact`/`showAddress` toggles. Used by `ContactForm` AND the relative-facing intake form (`pages/IntakeForm.tsx`) so both render the exact same fields. Reuses `BirthdayPicker` + gender `Chip`s + the `cf__*` CSS. |
| **Icon / InlineIcon** | `components/Icon.tsx` | Phosphor-bold SVG via `currentColor`; `IconName` is a compile-time union (`lib/pipIcons.ts`). 40+ call sites. |
| **Disclosure** + **useSingleOpen** | `components/Disclosure.tsx` | Calm collapsed-by-default expand/toggle (caret + label + optional count). Tucks a space-hungry secondary group — suggestion chips, an aside — out of sight until tapped, so nothing populates the surface unasked (NFR-CALM-1). Wraps the departure-checklist "Listes prêtes" chips in **TodoSection** + the **AddSheet** todo form. Its per-item sibling, the **`useSingleOpen`** hook, drives the "tap a row → reveal its picker, one open at a time" expand in **MealIdeas** + **Leftovers** (trigger is a chip beside RowActions, body a sibling row — same toggle + rotating-caret cue, different layout). |
| **SubTabs** | `components/SubTabs.tsx` | THE app-wide segmented "one job at a time" sub-tab control (the `.subtabs` family in `styles/core.css`): a calm pill row, active tab filled with the surface accent. `options[]` (key/label/optional `icon`) + `value` + `onSelect`; help-mode aware (pass `pick={help.pick}` + `armed={help.active}` so a tap EXPLAINS the tab in help mode), optional `trailing` slot (the "?" `HelpToggle`), `tour` anchor, and `size="mini"` (the compact `.subtabs--mini`) / `className` passthrough (`deal-tabs`/`flyer-tabs`). Used by **La cuisine** (Repas · Garde-manger · Recettes) and **Le cercle** (Liste · Liens · Arbre); the deal/flyer/recipe-book toggles still hand-roll `.subtabs` and can migrate onto it. |
| **ColorPicker** | `components/ColorPicker.tsx` | Row of palette dots; controlled. |
| **Toggle** | `components/Toggle.tsx` | THE calm on/off pill — `btn`/`btn--primary` filled when on, glyph + label, `aria-pressed` reflects state (`disabled`→`aria-disabled`). Caller supplies the state-dependent icon/label. Shared by Réglages ▸ Affichage (ambient + display); reuse for any boolean setting. NOT for a cycle button (day↔night). |
| **MemberSwitcher** | `components/MemberSwitcher.tsx` | THE shared "pick-a-face" ROW — the calm Maisonnée + member faces control from the board's **"Aujourd'hui"** header (the `.mswitch` look). Controlled + identity-agnostic: `faces` (`{id,name,colour,photoUrl}` — map your snake_case `lib/members` OR camelCase `lib/cercle` member at the call site, resolving the photo via `imgUrl`) + `value`/`onChange` + `allLabel`/`ariaLabel`; `toggleOff` (default) clears on re-tap. The always-in-view row, best on a **kiosk** wall. Its collapsed sibling for **mobile** is **FaceSelect**. Used by the board (wrapped to the device profile in `board/chrome.tsx`) AND « Le cercle » (focus lens + Notes "whose notes"; local pick, doesn't move the device profile). |
| **FaceSelect** | `components/FaceSelect.tsx` | The COLLAPSED sibling of **MemberSwitcher**: a `.profile-chip--labeled` chip (avatar + name + caret) that opens a **Sheet** of the household's faces on tap — the board's "Aujourd'hui" mobile pattern (profile chip + ProfilePicker), generalized to be CONTROLLED (same `faces`/`value`/`onChange`/`allLabel`/`ariaLabel` as MemberSwitcher, so they're swap-in). Use the ROW on a kiosk, this CHIP on mobile where the row would crowd the page. « Le cercle » picks between them by **`useSurface()`** (focus lens + Notes). Reuses the `.profile-chip`/`.profile-faces`/`.profile-face` chrome. |
| **GroupForm** | `components/cercle/GroupForm.tsx` | Name + kind + colour editor for a « Le cercle » named group; reuses **ColorPicker**. Shared by the create flow (bottom of the directory) and the inline edit on a group header. `onSubmit({name,kind,colour})`. |
| **BusinessForm** | `components/cercle/BusinessForm.tsx` | Add/edit one « Le cercle » **Business** (vet, plumber, hospital, business card) — a deliberately simpler `ContactForm` (no relations/vCard/member-link/birthday): name + a category **EntityCombobox** (suggestions in `lib/businesses.ts`) + phone/email/address/website/notes + an optional card photo (blob POST → `{key}`). POST/PATCH via **useWrite** to `/api/businesses`. **Add** opens a page-level **Modal** on `/cercle` from the ＋ FAB's "Nouveau commerce" tile (`?add=business`, like group/connect — no in-tab add button); **edit** opens its Modal from a business's detail peek in `BusinessesTab`. |
| **ConnectPeople** | `components/cercle/ConnectPeople.tsx` | Connect two people (hence two families) at ONE junction: "X est [lien] de Y" — two **EntityCombobox** person pickers (search by first/last name) + a grouped relationship select + a live gendered preview. Writes one `/api/cercle-links` row; the relationship **closure** (`lib/cercle` `closedLinks`) propagates the rest. Reached from the cercle directory ("Relier deux personnes"). **Pets** are connectable too: either end can be an animal (own `smiley-bold` icon), and when one is the relationship select swaps to the « Animaux » group (**Propriétaire ↔ Animal**) + generic fallbacks via the shared **`relationshipPickerGroups(petInvolved)`** helper — an `owner` tie binds the pet into the family group (a `FAMILY_REL_TYPES` member) but is NOT a closure rung, so a pet never becomes a grandparent. |
| **PetForm** | `components/cercle/PetForm.tsx` | « Le cercle » → Pets: add/edit one animal (a new **PersonKind `'pet'`** — pets are people in the circle, folded into `unifyCircle`/`buildPeople`, never absorbed). Fields: name, species (an **EntityCombobox** over `PET_SPECIES`), breed, birthday (**BirthdayPicker**), microchip #, feeding schedule, sitter instructions, a small **weight log** (dated rows — a health log, NOT an inventory count; calm-safe), and a **vet** picked from existing **Businesses** (stores `vet_business_id`). POST/PATCH via **useWrite** to `/api/pets` (`affectedKeys: [CERCLE_KEY]`), photo blob via `api()`. Backed by `pets` (migration 0067). Rendered inside a **full-screen scene** (`pages/CerclePetPage.tsx`, routes `/cercle/pet/new` + `/cercle/pet/:id`), mirroring the person form (`CercleFormPage`) — the tall care form rides above the mobile keyboard instead of a cramped modal. **Add** from the ＋ FAB's "Ajouter un animal" tile (NAV → `/cercle/pet/new`); **edit** from a pet's detail peek (`buildPet` → `/cercle/pet/:id`). A pet renders as a card in the directory, can join a famille group, and can be **linked to its humans** via "Relier à quelqu'un" (**`ConnectPeople`**): an `owner ↔ pet` tie (Propriétaire / Animal) binds it into the family group. Still **excluded from human relationship closure** (it never derives a precise rung — no pet grandparents). R2 unset → photo hidden, the rest works. |
| **ReviewChecklist** | `components/ReviewChecklist.tsx` | THE shared "propose a batch of writes → tick which to keep (all preselected, select-all/none) → **apply all** or **apply the selection**" Modal. Generic over the item type (`renderItem` draws each row; `onApply` runs the writes). Behind the multi-card **.vcf contact import** (`ContactForm`) **and** **CompleteFamilies**. Class family `.review*` (in `styles/cercle.css`). Reuse it for any approve-then-commit batch flow instead of hand-rolling a checklist modal. |
| **CompleteFamilies** | `components/cercle/CompleteFamilies.tsx` | « Le cercle » → Famille: ONE "Compléter les familles" button that makes every named **famille**-kind group 100% related, using the hierarchy the existing links already imply — `lib/cercle` **`proposeFamilyLinks`** materializes the precise rung where the closure reveals one (siblings via a shared parent, grandparent chains, cousins…) and falls back to a generic **`relative`** ("Membre de la famille") kin tie where none can be known, so nobody you grouped together stays disconnected. Proposals (create / **modify** a vague `relative` up to a precise rung) go through the shared **ReviewChecklist** for a final OK, then POST/PATCH `/api/cercle-links` via **useWrite**. The button hides when there's nothing to complete. |
| **CercleNotes** | `components/cercle/CercleNotes.tsx` | « Le cercle » → its own **Notes** sub-tab (the third **SubTabs** section beside Famille/Social) → "Notes & recommandations": iOS-Notes-style quick notes scoped to one member (the "Moi" list) or the whole Maisonnée (family-wide), with optional media (audio/drawing/photo). The **shared pick-a-face control** (the same one as the board's "Aujourd'hui" header, surface-for-surface via `useSurface` — **MemberSwitcher** row on a kiosk, **FaceSelect** chip on mobile; seeded from `useProfile` but picks locally) sets whose notes show **and** the new note's scope: a member sees their own **plus** the Maisonnée's and writes a personal note; "Maisonnée" sees only family-wide and writes a family-wide one (`lib/familyNotes` `visibleNotes`). No separate Moi/Maisonnée toggle — scope follows the picked face. Composer = a **"Nouvelle note"** button (opens **NoteEditor**) + **MemoControls** (reused via its `endpoint`/`affectedKey`/`extraBody` props → `/api/family-notes` for quick audio/draw/photo memos). A note now carries an optional **title** + a rich **Markdown body** (`lib/noteMarkdown` — render/strip/format/toggle): the row shows a bold title + quiet "date · preview", taps to expand the full rendered note (checklists tappable → PATCH), and the pencil opens **NoteEditor** (an audio memo instead renames its caption = title). CRUD via **useWrite** + **useDeferredRemoval**; cards reuse **ZoomableImg**. Backed by `family_notes` (migrations 0062 + 0093 `title`). Searchable in `/search`. |
| **NoteEditor** | `components/cercle/NoteEditor.tsx` | THE full-screen iOS-Notes-style **rich note editor** (#richnotes), reused for **new + modify** (CercleNotes "Nouvelle note" + row pencil). Portal to `<body>` + **useModal** (Esc/scroll-lock/focus-trap), shell mirroring **DrawPad** (`.note-editor*` in `styles/cercle.css`). Optional **title** input + an **always-WYSIWYG `contentEditable` body** — the user never sees raw Markdown. Storage stays Markdown; the editor uses a **flat line-block model** (**`lib/noteHtml`** — `mdToHtml`/`htmlToMd`/`setLineKind`/`toggleCheckbox`, every transform pure + unit-tested in `noteHtml.test.ts`) where each visual line is one top-level element, so each toolbar button is a single reliable element transform. Toolbar: **bold/italic/strike** (native `execCommand`), **heading**, **bullet/numbered/checklist** (Enter continues the list, empty item ends it), **quote** — buttons light up for the caret's current format. Tappable checkbox toggles a checklist line. One optional **attachment** (single-media invariant): a **photo** (**uploadMedia** → `/api/note-media`) or **drawing** (reopens **DrawPad** with `initialSceneUrl` for lossless re-edit) — audio stays a quick-add. **Auto-saves on close** (iOS-style; empty new note discarded, emptied existing note deleted) via **useWrite** to `/api/family-notes` (a text note still queues offline; media uploads need online). R2 unbound (503) → attach controls hide. In DevKit. |
| **CardDeckEditor** | `components/CardDeckEditor.tsx` | Edit a routine's deck of picture cards — emoji (tap → `DECK_EMOJIS` palette) + word (**EditField**), reorder by ⠿-drag (`usePointerDnd`, touch-friendly) or ↑/↓. Controlled (parent owns `cards: DeckCard[]`). Per-card aids: a tap-to-cycle **⏱ timer** (`card.seconds`, no R2), an optional **parent-voice clip** (#17 A, `narration[]` parallel array → `/api/routine-audio`) and an optional **photo / drawn step** (#17 C, `photo[]` parallel array → `/api/routine-card-photo` + `DrawPad`). Parallel media arrays stay index-locked to `cards` via `lib/parallelArray`. R2 503 hides the media control (kid view falls back to TTS / emoji). Used by **RoutineForm**. In DevKit. |
| **Voyage (trip notebook)** | `pages/VoyagePage.tsx` + `components/voyage/*` | « Voyage » — the trip notebook (Carnet de voyage), a full-screen scene (`/voyage/new` + `/voyage/:id`) with four **SubTabs** (Itinéraire · Infos · Bagages · Documents) over one trip. **Itinéraire** = one section per trip day (start_at..end_at via `tripDays`), each with the composer; dated `trip_notes` surface on the calendar band + the day page's "Voyage — Jour N" header. **Infos** = a **Chip** category row (vols/hôtel/auto/activités/contacts/documents/divers) + an optional **MemberSwitcher** "pour qui" scope (kids/parents stuff), writing categorized `trip_notes`. The capture composer (`TripNoteAdd`) is the SAME Notes input the fridge/family notes use: **EditField** (+ `useVoiceInput` mic) for text, **MemoControls** (its `endpoint`/`affectedKey`/`extraBody` props → `/api/trip-notes`) for voice/drawing/photo — exactly the reuse asked for. **Bagages** = per-member packing (`PackingList`): a **MemberSwitcher** picks whose list, rows are **CheckRow** + **useDeferredRemoval** (a check packs+removes; calm, no count), shared list for Maisonnée. **Documents** = `trip_notes` with `category='document'`, uploaded via **uploadMedia** (`/api/trip-doc-media`, image OR PDF), viewed with the reused **CarnetDocs** strip, and **warmImageCache** ("Préparer pour hors-ligne") makes them readable offline on the road. Cards: the board **VoyageCard** ("Prochain voyage", self-hides when none) + a multi-day **band** on **MonthView**. ＋ board tile (`SECTION_MODES.board` `voyage` → `/voyage/new`). Backed by `trips`/`trip_notes`/`trip_packing` (migration 0092); operator-only. Guide concept `voyage`. |
| **CercleConstellation** | `components/cercle/CercleConstellation.tsx` | « Notre monde » — the **big-picture overview map** of the whole circle (the full-screen `/cercle/monde` scene, `CercleWorldPage`, audience-aware). Where Liens/Arbre zoom IN on one person/family, this zooms OUT: each cluster (the Maisonnée at the centre, your families, your groups) is a soft coloured **island** with member faces inside, and a dashed **bridge** joins two islands wherever a person ties them together (shared membership or a cross-island link). Everything taps + reads aloud (`useSpeak`): an island speaks its name + who's in it, a face its name, a bridge "{X} relie {A} et {B}". A **« Raconte-moi » guided tour** auto-narrates the whole map island-by-island then the bridges (highlighting each, dimming the rest), with a spoken caption. Hand-rolled SVG on the shared **PanZoom** surface, reusing **Avatar**/`.ego-node`. Pure structure from `buildWorld` + `worldClustersFrom` (`lib/cercle`, unit-tested). Read-only — built to UNDERSTAND, not edit. Reached from a CTA in the cercle directory + a big tile in the toddler "Qui est-ce?" screen. |
| **Jouer (play space)** | `pages/JouerPage.tsx` + `components/jouer/*` | « Jouer » — the toddler **play space** (full-screen `/jouer` scene, reached from a big door on the toddler board). A calm menu of cross-theme **toys** built from real household data, all hear-first (`useSpeak`), big taps, and — by design — **no score, no fail, nothing persisted** (NFR-CALM; zero schema). Three activities: **`SeekGame`** (« Cherche et trouve » — a find-it toy with theme *decks*: faces/animals/colours/foods/weather/mix; right tile → "Bravo !" + a new prompt, anything else just reads its name), **`DayTimeline`** (« Notre journée » — the matin→dodo day timeline, weaving today's meals+events to teach sequence), **`BirthdayCountdown`** (« Les fêtes » — upcoming birthdays as cake cards, "dans 3 dodos"). Pure content/builders in `lib/playContent.ts` (`buildSeekDecks`/`pickSeekRound`/`bucketDay`, unit-tested). `SeekGame` is in DevKit. |
| **RecurPicker** | `components/RecurPicker.tsx` | Recurrence rule (freq/interval/weekdays). |
| **LeadPicker** | `components/LeadPicker.tsx` | Calm "Bientôt" reminder lead ("Afficher dès", 1h–1wk → `lead_seconds`); in EventForm + ChoreForm. |
| **DrawPad** | `components/DrawPad.tsx` | The family draw pad for a fridge note (#14) — useful + educational. Five tools — freehand **pen** (`signature_pad`), drag-out **shapes** (line/rect/oval/triangle/star/heart), tap-to-stamp **sticker packs** (faces/animals/nature/seasons/things/letters), chunky **pixel** grid (snap-grid overlay + flood-**fill**), and a **text** stamp — plus a **mirror/kaleidoscope** toggle, **undo + redo**, a family rainbow + **custom/recent colours**, 3 sizes, paper eraser. A collapsible **template** layer sits underneath: ruled **handwriting lines**, dashed-outline **letter/number tracing** (A–Z/a–z/0–9, thin so kids trace strokes not colour a letter), **dot grid**, or a **colour-in** outline. **Draw over a photo (#14b):** the 🖼 tool (or `pickPhotoOnOpen` → "Sur une photo" in `MemoControls`) loads a chosen photo as a faint **watermark base layer** with a **fade slider + quick presets** (Pâle/Doux/Net/Plein); WYSIWYG — the shown fade bakes into the saved PNG, so 0% = clean trace, 100% = annotate the photo. The photo stays client-side (object URL); only the flattened PNG uploads, so no R2/endpoint change. **Non-destructive (#1):** a drawing persists an editable **scene** (strokes/stamps/pixels/shapes JSON in R2, `scene_key`, migration 0055) so re-opening rebuilds the layers and adding on top never destroys prior marks; old PNG-only drawings degrade to a flat base image. **Perf:** canvas backing-store capped at 2× DPR, pixel paint skips repeats + rAF-coalesces, export size-capped (`MAX_EDGE` 1280). **Share** (Web Share API/download) + `onMakeRoutine` (→ routine card). `onSave(png, scene)`; `initial`/`initialSceneUrl` to re-open; `toddler` trims to big controls. Compact single-line-scroll toolbars keep the surface wide. **Drawings show only in the board's Grille/bento view** (`Notes variant="drawings"`). |
| **DrawEditChoice** | `components/DrawEditChoice.tsx` | The "how do you want to continue?" choice shown (shared **Modal**) when you tap an existing kept drawing to re-open it (#14) — so editing isn't ALWAYS a trace-over: **Modifier l'original** (edit the real drawing in place — rebuilds its editable scene), **En faire une copie** (an identical, fully-editable copy → saved as a NEW entry, original untouched), or **Calquer** (load the original as a faded `filigrane` to redraw over → NEW entry). Driven by the shared **`useDrawEdit<T>()`** hook (`lib/drawEdit.ts`) — it holds the chooser/edit state + resolved `DrawEditMode` and derives the `DrawPad` load props (`{...draw.padProps}`, incl. `filigrane`), exposing `isNew` so the caller maps to PATCH-in-place vs POST-new. Used everywhere a drawing is re-opened: board `Notes` ✏️ badge, `DrawingGalleryPage` thumbnails, `CercleNotes` ✏️. Keeping into « Mes dessins » across all surfaces goes through **`useKeepInGalleryToast()` / `useKeepKeysInGalleryToast()`** (`lib/drawingGallery.ts`) — keep + a calm undoable "Gardé dans Mes dessins" toast (undo deletes the gallery row). General-audience (toddler-friendly big targets). |
| **DrawingGalleryPage** | `pages/DrawingGalleryPage.tsx` (`/drawings`) | The lasting drawing **collection / gallery** — "Mes dessins" (#14). A wall of kept drawings (own R2 blobs, so clearing a fridge note never frees them), distinct from transient notes. Toddler = big tap tiles (tap → keep drawing on it); parent = same + delete (`useConfirm`); ＋ opens the full `DrawPad`, saving a fresh entry (non-destructive). Backed by `lib/drawingGallery` (`useGallery`/`useSaveToGallery`/`useDeleteFromGallery`) + `/api/drawings` (GET/POST/DELETE, table migration 0056). Reached from the kid board's "Mes dessins" tile + the "La galerie" link under the Grille drawings strip. Guest = read-only. |
| **HeartButton** | `components/HeartButton.tsx` | Family "favorites" ❤ on a recipe (#21, `useLoves`): shows the loved-by faces (never a count); toggle only when a face is picked (read-only as Maisonnée). On recipe cards + planned meals. |

### Actions & rows
| Component | File | Purpose |
| --- | --- | --- |
| **Act** + **Section** + **SubHead** | `components/board/Act.tsx` | The ONE activity-row primitive: colour spine + tile + title/sub; three shapes (check / nav / info). Board **and** kitchen pickers. `onOpen` makes the row peek the entity detail — alone it's a whole-row tap (caret); with a check it **splits** (body peeks, check still ticks). **`Section`** is the bento tile wrapper; pass `icon`+`tint` for a SUBTLE Pip identity (a coloured header glyph in a tinted disc, a tinted rule, a barely-there card wash via `.bento--tinted`) so the board reads as one cohesive colour-coded surface. **`SubHead`** is a quieter inner divider for a SECOND group BUNCHED inside one tile (e.g. « Demain » under « Aujourd'hui », « Restants » + « À faire » in one « À finir » card). `TodoSection` takes the same `icon`/`tint`. |
| **BoardCard** + **SecLabel** | `components/board/BoardCard.tsx` | THE board glance-card primitives. **`SecLabel`** is the ONE `.sec-label` header (glyph disc + bold label + rule + optional quiet `count` + help-mode-aware tappable title) — `icon` for a Phosphor glyph, `iconNode` for an emoji/arbitrary node (the « Cette saison » 🍂). **`BoardCard`** is the standalone card SHELL wrapping `SecLabel` + content in a card container (`className` keeps the caller's deliberate layout CSS — `auto-card`/`carnets-card`; pass `to` for a navigating `<Link>`, else a `<div>`); empty-hide stays at the call site. Used by `AutoCard`/`CarnetsCard`/`SeasonUpkeepCard`. Bento **grid** sections use **`Section`** (Act.tsx) instead — same `SecLabel` header, `.bento` shell. (`ARegler`'s card variant is deliberately NOT one of these — it's a hero-tile, no `.sec-label`.) |
| **EntityDetailSheet** | `components/detail/EntityDetailSheet.tsx` | THE generalized "tap an item → a picture, a date, the relevant text + smart actions" peek (a bottom sheet). Renders a normalized `DetailModel` (`lib/detail.ts`) built per-kind by `components/detail/adapters.ts` (event/meal/chore/todo/leftover/recipe/routine). Opened from any row via **`useEntityDetail()`** (`components/detail/DetailProvider.tsx`, mounted in `HubLayout`). Reuses `ZoomableImg`/`Avatar`/`HeartButton`/`Chip`. Wired on the board (Aujourd'hui rows + the "Ce soir" hero), recipe cards, and routine cards. Parent audience only. |
| **RowActions** | `components/RowActions.tsx` | The ✏️/🗑️ icon pair (40px targets). 8+ call sites. |
| **DragPill** | `components/DragPill.tsx` | The shared draggable pill/row shell over **`usePointerDnd`** (`lib/dnd`): the `data-dnd-zone` wrapper, the `is-dragging`/`dnd-over` state classes, and the ⠿ grip handle, in one place. `as` picks the element (`'span'` chip vs `'li'` row), `className`/`gripClassName` style it, `showGrip={false}` drops the handle for a read-only guest. Caller renders the pill's own contents as children + one `<DragGhost ghost={dnd.ghost} />` per page. Used by the recipe-tag reorder strip (`operator/recipesTags`) and the recipe-pill list (`operator/recipePills`). |
| **CheckRow** | `components/CheckRow.tsx` | Calm checklist row: check is its own tap target. Garde-manger + réserve. Optional secondary action slot (`onExtra`/`extraIcon`/`extraLabel`) — e.g. La réserve's "→ add to list" (#41). |
| **RecentsPanel** | `components/RecentsPanel.tsx` | The calm "Récents" session log (#38): button → Modal listing the last ~15 actions this session with relative time + a late "Annuler" for ones still in their hold window. Reads `useRecents()` (the same log the undo toast shows expanded). Session-only, no counts/ranks. In Réglages ▸ Affichage. |
| **MealPool** | `components/kitchen/MealPool.tsx` | THE "pool of meal candidates you plan onto a day" — the shared body of **« Idées de repas »** (`MealIdeas`, reusable) and **« Restants »** (`Leftovers`, consumed-when-planned). Both were ~85% copy-pasted; this owns everything they share — add via **EntityCombobox**, live-poll-safe **`useDeferredRemoval`** delete + undo, inline rename (**`useInlineEdit`** + **EditField**, optimistic PATCH), and tap-to-reveal the one-at-a-time **MealPlanPicker** (**`useSingleOpen`**). The two wrappers inject only what differs: `endpoint`, `buildAddBody`, `onPlan` (reusable vs consumed + compensating undo), `renderLead` (the chip picto), `options`, and `labels`. Generic over the row type + the combobox entity. **Pantry/Todos are deliberately NOT folded in** (their primary action — check-and-add-to-list / toggle-in-place — and CheckRow markup differ; only the two meal pools are true twins). |
| **TodoSection** | `components/todos/TodoSection.tsx` | À compléter (todos, migration 0046): a self-fetching check-off list — global (board) or per-day (day page). Check-in-place + "Effacer cochées", inline add/edit, one-tap departure templates. Distinct from the loose-chore "À faire". |
| **DealCard** | `components/DealCard.tsx` | Flyer-deal card (image + store + price + actions). |

### Display / content
| Component | File | Purpose |
| --- | --- | --- |
| **Avatar** | `components/Avatar.tsx` | Person = photo or coloured initial disc. 10+ call sites. |
| **BigTiles** + **Sayable** | `components/BigTiles.tsx` | Toddler picture-tiles + tap-to-speak text (`useSpeak`). |
| **RoutinePlayer** | `components/RoutinePlayer.tsx` | THE shared RUN of one routine — the calm "right now / then" picture story (big hero card read aloud on tap, picture filmstrip beneath, ▶ start → → advance → ✓ finish, "sweet dreams" recap). Extracted from `KidView` so it plays on EVERY surface, not just the locked toddler kiosk: `KidView` mounts it after its face-picker; the `/routine/:id/run` scene (`RoutineRunPage`, reached from the Routines tab's ▶ "Faire" + the routine detail-peek's "Faire la routine" action) mounts it directly for a parent on any device. Owns its own optimistic done-toggle (`ROUTINES_KEY`). `routine`/`ro` (guest hides the progress controls)/`exitTo`/`onBack`+`backLabel`. **Per-step timers (`card.seconds`):** a timed step shows a calm tap-to-start countdown **donut ring** (`Countdown` sub-component) — soft `chime` (shared from `lib/cookTimers`) + ✓ pulse at zero, **never force-advances** (NFR-CALM). Styled by `.tdl-*` / `.tdl-countdown*` (kid.css). |
| **KidCollections** | `components/kitchen/KidCollections.tsx` | Toddler hear-first 3-stage recipe-collection picker (collection → recipe → day) over the recipe-tag system (#11). Reuses `buildCollections` + the shared `kidSuggest` meal-plan write. Surfaced as a "Les collections" door tile inside `KidKitchen`. |
| **TimerRail** + **useCookTimers** | `components/cook/TimerRail.tsx`, `lib/cookTimers.ts` | The shared cook-timer engine + rail: named countdowns, a one-second ticker, and a chime + vibration on finish. Extracted from `CookMode` so single-recipe cook AND the #43 multi-recipe cook run ONE timer system. `addTimer(seconds, label)` (caller builds the label), `toggleTimer`/`removeTimer`; `onFinish(labels)` lets a caller also announce aloud. Styled by `.cook__timer*` (cook.css). |
| **MultiCookMode** | `components/MultiCookMode.tsx` | #43 — cook several recipes at once. A `/kitchen/cook/multi` scene (entered from the ＋ "Cuisiner" picker ▸ "Cuisiner ensemble" when 2+ of today's planned meals are saved recipes). A thin wrapper: it renders one **full `CookMode`** per dish (all kept mounted; inactive ones `hidden`) and flips between them via `CookMode`'s `siblings` sub-tab row under the bar controls. Each dish keeps its own layout/text-size/gather/timers; a timer started on dish A keeps ticking + chiming while you read dish B. |
| **ToddlerCookBook** | `components/kitchen/ToddlerCookBook.tsx` | #45 — the picture cookbook, ALWAYS a swipeable on-screen game (never a printable): cover + one big page per recipe (photo/picto + name read aloud in the recipe's language), a big "On cuisine !" hands off to the cook stepper. Shown inside `KidKitchen` via a "📖 Mon livre" door AND as the `/kitchen/book` scene (`RecipeBookPage`), entered from the kitchen ＋ ▸ "Le livre illustré". Reuses recipes + useSpeak + pictoFor. A `/kitchen/book` scene (entered from `RecipesTab` ▸ "Faire un livre"): a cover + one page per recipe (big sticker photo, tick-box ingredients, numbered step bubbles with step photos). Reuses recipes + the tag/collection layer; `window.print()` + `styles/book.css` `@media print` paginate one recipe per sheet (no migration, no endpoint, no PDF lib). |
| **IngredientLine** | `components/IngredientLine.tsx` | Recipe line with tappable measure pills; `scoops` adds the fill-circle drawing. Colours come from `lib/measurePrefs` (customizable in Réglages ▸ Affichage). |
| **MeasureScoops** | `components/MeasureScoops.tsx` | A measure drawn as colour-coded fill circles — one solid per whole scoop, a part-filled circle for a fraction ("2 c. à soupe" = 2 circles; "1½ tasse" = 1 full + ½). Tap to hear. Used by `IngredientLine` (Cook-mode toddler + split/focus views). |
| **ZoomableImg** | `components/ZoomableImg.tsx` | Tap-to-lightbox image. |
| **WonderBand** / **useWonder** | `components/board/ApodFrame.tsx` | The board's « Photo du jour » daily-wonder picture, rotating between five free sources (`bing` curated photo · `wiki` Wikipedia Picture of the Day · `apod` space · `epic` Earth-today · `mars` rover) via a small corner ⟳ shuffle. Text is localized to the app language server-side, and each wonder carries its `lang` so the 🔊 reads it with a matching voice (an English APOD blurb isn't mangled by a French voice — same rule as recipes). The endpoint `/api/wonder?source=` falls back to a reliable source (Bing/Wiki lead), 7 s timeout per fetch, 6 h cache each; `wonder: null` only if all fail. **`useWonder()`** is the shared fetch+shuffle+last-good-frame hook — it drives BOTH the standalone band (`WonderFrame`, the toddler board) AND the parent board's **weather card backdrop** (Board.tsx `now-card--wx-photo`: the picture sits behind the temperature, weather in frosted chips, `.now-card__scrim` keeps it legible). Gated by the per-device `useApodEnabled` toggle (Réglages ▸ Affichage, `lib/apod.ts`). `WonderBand` (presentational) hides the blurb paragraph when empty (no redundant repeat). Reuses `.photo-frame__shuffle`. |
| **PhotoMosaic** | `components/PhotoMosaic.tsx` | The idle-screensaver family-memory wall (#49): tiles the surface with family photos + kept kids' drawings, gently cross-fading ONE random tile every ~4.5 s (opacity-only, NFR-CALM; daypart-biased when both sources are on — art by day, photos at dusk). Grid density scales to the image count (`gridFor`), never duplicating an image. Used by `AmbientScreen`; the board wall keeps the single-photo `PhotoFrame`. Returns `null` with nothing to show / R2 off. `.ambient-mosaic*` (ambient.css). In DevKit (needs a sized, `position:relative` box; blank with no photos/drawings). |
| **BoardLayoutSection** / **useBoardCards** | `components/operator/boardLayout.tsx`, `lib/boardCards.ts` | « Disposition du babillard » (Réglages ▸ Affichage): PER-DEVICE show/hide + drag-reorder of the Grille cards (`autoCard·fil·today·toFinish·todos·upcoming·drawings·photos`). **`useBoardCards()`** is a localStorage store (the `lib/ambient.ts` useSyncExternalStore shape) of `{order, hidden}`; `read()` reconciles a saved layout against the canonical id list so a NEW card auto-appears (visible, last). `Board.tsx` renders an inline `nodes` registry in `visibleCardOrder()`. The panel reuses `OperatorSection` + `DragPill` + `usePointerDnd` (no new primitives); a wall kiosk and a phone keep independent layouts. Calm: only hides/reorders existing cards, adds no surface. |
| **HouseholdListSection** / **useHouseholdListSetting** | `components/operator/HouseholdListSection.tsx`, `lib/householdListSetting.ts` | THE shared Réglages section for a "household list setting" — a small editable list of `{id, name, colour}` items kept in ONE `households.*` JSON column. **`useHouseholdListSetting(field, seed, clearedMsg)`** owns the behaviour: mount-once `api('household')` read (seeded with localized defaults when never set), whole-array PATCH via **`useWrite`** (invalidates `HOUSEHOLD_KEY` so every reader re-reads), optimistic rename/recolour/add, and an **undoable delete**. **`HouseholdListSection`** adds the identical coloured-legend render (`meal-slots` rows + **ColorPicker** + **EditField** + **OperatorSection**). **« L'auto »** (`cars.tsx`) and **« La réserve »** (`reserve.tsx`) — previously byte-for-byte copies — are now ~20-line wrappers passing `field`/`seed`/`labels`. A new such setting reuses this instead of hand-rolling. *(Known limitation, carried not introduced: the whole-array PATCH means two concurrent operator tabs last-write-win — acceptable under one-operator-per-household.)* |
| **BoardCanvas** / **useCanvasEnabled** | `components/board/BoardCanvas.tsx`, `lib/canvas.ts`, `lib/season.ts` | « Living canvas » — an ambient board backdrop that drifts with the **season** (`lib/season`, a `data-season` tint), **weather** (gentle drifting snow when the bucket is `snow`), and the existing `:root[data-daypart]`. Fixed behind the board content (board children lifted to `z-index:1`), low-opacity, pointer-events-none; reduced-motion drops the snow. Per-device opt-out (`useCanvasEnabled`, Réglages ▸ Affichage « Ambiance vivante »), default on. `.board-canvas*` in `styles/board/month.css`. Calm: no numbers, nothing interactive. **Time-aware emphasis** rides nearby (`lib/momentFocus` + `.bento--now`/`.now-card--now`): the board softly lifts the card that matters at this hour, gated by the ambient toggle. |
| **DayHeroes** | `components/board/DayHeroes.tsx` | The board's two "today" hero cards: the « Ce soir » supper card (every supper as a tappable row) + the weather card with the daily-wonder photo as its backdrop (`now-card--wx-photo`). The meal tap is a caller callback (`onOpenMeal`) so the host keeps its own detail actions; the wonder/shuffle is passed in. The weather card also carries a calm **few-hours-ahead strip** (`hours`: 3 icon+temp chips, `.now-card__hours`, frosted over the photo) from `/api/weather`'s `hours` (Open-Meteo `hourly`). Rendered by the **Grille** board view (`Board.tsx`). Returns null when there's neither a supper nor weather. `.board-heroes` / `.now-card*` in `styles/board/views.css` + `today.css`. |
| **Fil** / **placeFil** | `components/board/Fil.tsx`, `lib/dayRibbon.ts` | « Le fil du jour » — the day-ribbon: today read as a SHAPE. Timed things — **events + L'auto rides** (rides are events) **+ work/job windows** (`data.work`, `until=endAt` so a job is "past" only once it ends) — sit on a time axis (in order, spaced by a clamped proportional gap, past dimmed, a calm « maintenant » divider); **chores + all-day events** pool under « À tout moment ». Rows are built by the host (`eventAct`/`choreAct`/`workAct`) so taps→peek + chore-checks keep working; a per-minute tick drifts the marker. An optional grid card (`lib/boardCards` `'fil'`, canonical position before `today`); shown with **≥2 timed items**. **Dedups the « Aujourd'hui » card**: when on screen it carries the day's events + chores, so the day list drops them (keeps meals/home/pills) and the lone-next-up `Prochainement` hides. Toddler lens reuses `DayTimeline` (« Notre journée »). Pure layout in **`placeFil`** (`lib/dayRibbon`, unit-tested). `.fil*` in `styles/board/month.css`. Calm: shows position, never a count or an alarm. |
| **ActivityBring** | `components/board/ActivityBring.tsx` | « À apporter » in « Avant de partir »: the bring-lists for the day's **activities**. An activity is a recurring event with `events.bring_template_id` (a saved `todo_templates` list, migration 0077); this filters the day's events for those, shows each list's items via `expandTemplate` (`lib/todos`), and a one-tap « Ajouter à cocher » instantiates it onto the day (`POST /api/todos {templateId, day}` — the same path `TodoSection` uses) so items become tickable. Read-only by default (nothing written on entry). Authored in `EventForm` (the « À apporter » button-group) via the ＋ « Activité » tile (`/event/new?activity=1`). |
| **ARegler** / **useARegler** | `components/board/ARegler.tsx`, `lib/aRegler.ts` | « À régler » — the cross-domain heads-up. The derived **`/api/a-regler`** scan (operator-only, NO new table) reads existing data for a SHORT capped list of frictions: a driverless ride (`car_id` set, no driver), an empty supper tomorrow, a planned meal's running-low ingredient (`recipes` ∩ `pantry_low`), a birthday soon with no gift idea (`birthdays.ts` + `gift_ideas`). Returns **structured** signals; `frictionRow()` (`lib/aRegler`) composes the localized line + icon (copy in i18n). Surfaced via `useARegler` in two looks (`ARegler` `variant`): a **`card`** (hero-style tile, marigold) that rides the board **status band** beside the **`MomentPeek`** « Moments » card — directly under the supper/weather heroes (Grille) / above the calendar (Mois), parent-mobile only, hidden on kiosk/toddler/guest, renders nothing when empty — and a compact **`chip`** one-liner atop **« Cette semaine »** (`ThisWeekTogetherSection`) with one-tap fix links. Calm: finite, no counts-as-scores, empties to « Tout est sous contrôle ». |
| **SkyTonight** (in `components/board/MomentsView.tsx`) | `components/board/MomentsView.tsx` | « Ce soir dans le ciel » — a calm one-tap line in Moments (tonight / tomorrow scopes only) showing tonight's moon phase, computed locally by the pure `lib/moonPhase.ts` (no network, offline-safe, no key). Audience-aware: parent = a quiet emoji + phase-name row; toddler = a big centered emoji tile that speaks a full sentence. Tap to hear (`useSpeak`). No counts/ranks — additive and calm. `.sky-tonight` family in `styles/photos.css`. |
| **MomentPeek** / **MomentsView** | `components/board/MomentPeek.tsx`, `components/board/MomentsView.tsx` | **`MomentPeek`** is the board's « Moments » card (status band): four DIRECT window chips — « Ce soir · Demain · Une date · Cette semaine » — each deep-linking to `/moment?scope=`, with the contextually-relevant one (tonight by day / tomorrow in the evening) filled. **`MomentsView`** is the windowed recap + per-day « À compléter » handoff scene it opens (also `/moment`, deep-linkable via `?scope=`/`?date=` — the calendar's « Voir ce moment » lands on a date); hosts `SkyTonight`. Berry now-card; `.moment-chip` family in `styles/today.css`. |
| **DayNote** | `components/board/DayNote.tsx` | The per-day memo from La cuisine, shown read-only on the board (today's note + tomorrow's prep note « sortir le poulet »). Tinted by the member who wrote it; toddler variant reads it aloud. A `media_kind`-bearing note (audio/drawing/photo) is a separate concept (see Fridge memos / `Notes.tsx`). |
| **PanZoom** | `components/PanZoom.tsx` | Inline pinch / drag / wheel / +−·reset pan-and-zoom surface for any fit-to-box child (an SVG graph, a diagram). The child fills the surface (`<svg width="100%" height="100%">` + `viewBox` + `preserveAspectRatio="xMidYMid meet"`) so it fits at scale 1; the transform (kept in a ref, written straight to the node — smooth, no re-render per move) grows it. Pan is clamped so the content can't drift out of view. Native pinch is locked app-wide, so the floating +−·reset cluster is the kiosk-safe path (a frosted pill of round, quiet icon buttons). Used by the cercle **Arbre** (`CercleTree`), the Social **web** (`CercleWeb`), and the « Notre monde » overview map (`CercleConstellation`). |
| **FeatureMap** | `components/FeatureMap.tsx` | THE "everything Babillard does" themed jump-grid — one calm tile per theme (Les cinq sections · Au quotidien · Cuisine & épicerie · Appareils & affichage · Intelligence & calme · Réglages). Backed by the SINGLE shared taxonomy `CONCEPT_THEMES` / `FEATURE_MAP_TILES` in `lib/guideContent` (same source the Guide's concept sub-clustering uses, so the map and the cards never drift). Each tile now carries a `route` (via `CONCEPT_THEMES.route`); `featureMapRoute(key)` resolves it. `onSelect(key)` lets the caller decide what a tile does: the **Guide** (`operator/guide.tsx`) scrolls to the matching `guide-th-<key>` block; the Board **WelcomeCard** **navigates into the live section** (`featureMapRoute(k)` — alive now that a fresh account is seeded). Individual Guide cards also gained an "→ Ouvrir dans l'app" link via a per-card `route` (generalizes the old settings-only `tab` link to any hub tab/scene). Add a new feature by extending the taxonomy (a new concept card ⇒ add its id to a `CONCEPT_THEMES` bucket, else it's invisible to the jump-grid) — never fork a parallel list. |
| **WelcomeCard** | `components/WelcomeCard.tsx` | The Board first-run card for a brand-new household: a 3-step setup checklist ("Ajouter la famille" → "Choisir les repas" → "Jumeler une tablette", links to the right Réglages tab) + the **FeatureMap** for discovery. "Add the family" auto-checks off the live member list; the rest check on tap-through. Calm: dismissible ("Plus tard"), auto-hides once every step is done, never in the toddler lens. Persists `{dismissed, done[]}` to `localStorage` (`babillard-welcome`, mirroring SectionIntro's shape). Signup now lands on `/board` so it greets the new household. |
| **SampleBanner** | `components/SampleBanner.tsx` | The Board strip for a freshly-**seeded** household (onboarding Phase 1). A brand-new account is pre-populated with a small, calm, media-free demo family (`functions/_lib/sampleData.ts`, seeded at signup) so the board is alive on first login; the banner flags it as examples and offers **Garder** (dismiss — explore, add real data alongside) or **Vider les exemples** (confirm → `DELETE /api/seed` → invalidate everything). Operator-only (a wall kiosk just shows the living demo), never toddler, dismissal persists (`babillard-sample-banner`). Reads the demo-present count from `SAMPLE_KEY` (`GET /api/seed`). Clearing removes only `is_sample=1` rows (migration 0096) — never a row you added. Managed later from Réglages ▸ Guide (`operator/sampleData.tsx` **SampleDataControls** — clear, or load onto an empty household). |

### Voice
| Component | File | Purpose |
| --- | --- | --- |
| **VoiceButton / VoiceStatus** | `components/VoiceButton.tsx` | Shared mic + its calm status line (hides where Web Speech is absent). |

### Feedback / chrome
| Component | File | Purpose |
| --- | --- | --- |
| **Loading / PairPrompt** | `components/Fallback.tsx` | Shared page states (PairPrompt is surface-aware). 15+ call sites. |
| **HelpDot** | `components/HelpDot.tsx` | "?" → Guide; gated by tutorial mode + parent audience. |
| **HelpBubble** | `components/HelpBubble.tsx` | A small in-place help box — title + one calm line + an optional "→ Voir le guide" deep-link (`/settings?tab=guide&card=<id>[&point=N]`, same target as `HelpDot`). Presentational; the consumer owns placement + open/close. Used by the ＋ Add sheet's "?" help mode; adoptable anywhere a control wants quick contextual help without leaving the page. In DevKit. |
| **SharePreviewBar** / **useSharePreview** | `components/SharePreviewBar.tsx` | The calm banner an operator sees atop a previewed share scene (`?preview=<kind>` on Handoff/Welcome/FamilyWindow) — a note + "Fermer l'aperçu" back to Réglages ▸ Partage (a real guest scene has no close; this IS it, operator-only). `no-print`. `useSharePreview()` reads the param. In DevKit. |
| **GuestExpired** | `components/GuestExpired.tsx` | The terminal state for a guest scene whose share link 401/403'd (expired or revoked). DISTINCT from `EmptyState` so a relative on a dead « Gardienne »/« Accueil »/« Fenêtre » link sees "ce lien n'est plus valide", not a blank "rien à afficher" that reads like an empty household. Used by `HandoffPage`/`WelcomePage`/`FamilyWindowPage` when their `guest/window` query errors (paired with `retry: skip-on-401/403`). In DevKit. |
| **OfflineBanner** | `components/OfflineBanner.tsx` | The calm "Hors ligne" bar across the hub when connectivity drops, so a glance at the cached board is trusted, not mistaken for live data. Carries a "Données du …" freshness stamp (newest successful fetch) + a queued-write count (`useOutboxCount`). Awareness only — writes still queue/replay normally. Self-hides when online (`if (online) return null`) — in DevKit only visible via DevTools-offline. |
| **ErrorBoundary** | `components/ErrorBoundary.tsx` | App-level safety net (class component) — turns any render throw into a calm, recoverable bilingual screen (Recharger / Aller au babillard) instead of blanking the tree. Deliberately copy-light + dependency-free (no hooks/i18n/router) so the fallback can't itself fail. Wraps the app at the root. In DevKit (trigger-to-demo). |
| **HubHead** | `components/HubHead.tsx` | Shared header for the four hub tabs: title (+ optional subtitle) left, `SectionAvatar` disc right. One source so the headers can't drift. |
| **SceneHead** | `components/SceneHead.tsx` | Shared header bar for full-screen `.scene` routes: title (+ optional subtitle/glyph) left, contextual Guide "?" + close ✕ right. No orange kicker. Used by quick-add, price-match, deals, day-plan, the operator add-forms. |
| **SectionAvatar** | `components/SectionAvatar.tsx` | Themed tab's top-right identity disc; in tutorial mode the disc itself deep-links to the Guide (folds HelpDot into the icon, corner "?" pip). Used by `HubHead`. |
| **SectionIntro** | `components/SectionIntro.tsx` | First-visit welcome card (mirrors Guide). |
| **TopBar** | `components/TopBar.tsx` | Minimal auth/home chrome (brand + day/night + FR/EN). |
| **FormScene** | `components/FormScene.tsx` | Full-screen `.scene` shell for operator **add-forms** (event/chore/routine/home-project). Adds, over a bare scene, a **members-roster fetch** + an **operator-only auth bounce**, then renders `.scene` + `SceneHead` + `.scene__body` and hands the form `(members, close)`. **Which scene wrapper to use:** reach for **`FormScene`** when the page is a create-form that needs the household roster and must reject kiosks/guests; use a **manual `<div className="scene"> + <SceneHead> + .scene__body`** (with `useSceneClose`+`useEscapeKey`) for any other full-screen route (browsers, editors, viewers) — that 5-line shell is small and varies per page (extra header actions, body class, whether `close` is needed in the body), so it's kept inline rather than forced through one wrapper. (A generic **`EditScene`** sibling was considered for the ~15 manual sites but **deferred as over-abstraction** — the boilerplate already reuses `SceneHead`/`useSceneClose`, and a wrapper fitting all 15 would be prop-heavy for a ~5-line saving; revisit only if the pattern stabilises.) |
| **RecipeListPicker** | `components/RecipeListPicker.tsx` | "Which ingredients?" picker (shared `Modal`) — tick the few you're missing, then add to the grocery list (`recipe-to-list`), instead of dumping every line. Opens all-unticked, select-all/none. Same checklist as the inline one in `RecipeSheet`; used by the Kitchen recipe **peek**'s "Ajouter à la liste". |
| **EmptyFridgeSheet** | `components/kitchen/EmptyFridgeSheet.tsx` | « Vide-frigo » (#5) — a two-step `Modal` that turns what's about to spoil into supper. Step 1: one AI call (`POST /api/empty-fridge`) proposes ~10 dish **names** built around the `use-soon` + `réserve` items (anti-waste, not variety); you tick up to **3** (checkable `Chip`s, `lib/emptyFridge` `togglePick`/`MAX_FRIDGE_PICKS`). Step 2: `{step:'recipes'}` flesh each pick into a full recipe (`draftRecipe` with the on-hand items as `have` context, ≤3 calls — the pre-filter keeps cost down). Decide per card: **Garder** (`POST /api/recipes`, tagged « Vide-frigo ») or **Cuisiner** (save → cook mode). Opened from the kitchen ＋ tile via `useKitchenActions` (`canEmptyFridge` flag = AI on **and** something to use up); reuses `Modal`/`Chip`/`Icon`. No migration, no inventory (calm). |
| **MotComposer** | `components/mots/MotComposer.tsx` | « Laisse un mot » composer (#mots) — the board ＋ « Mot » panel. Pick a recipient face (kiosk `MemberSwitcher` row / mobile `FaceSelect` chip, default **Maisonnée**), then type a line (`EditField` → `useWrite POST /api/mots`) or leave a voice/drawing/photo memo (reuses `MemoControls` with `endpoint='mots'` + `extraBody`). An INTERNAL member-to-member message — distinct from the postbox (guest→household). Migration 0094 (`mots`: `member_id`=recipient, `author_member_id`=sender, `opened_at`/`saved_at` lifecycle); migration 0095 adds **`surface_at`** (« Plus tard » schedule — native date+time → the mot stays hidden until then, gated in `lib/mots` `isSurfaced`/`useMots`) and **`reply_to`** (a `replyTo` prop locks the recipient to the original sender + shows « En réponse à … »; opened from a mot's peek in a `Modal`). |
| **MotsCard** | `components/mots/MotsCard.tsx` | The « Laisse un mot » inbox — a **self-hiding board band card** (`BandCardId 'mots'`, Réglages-toggleable). Shows the picked face's WAITING (unopened) mots (+ Maisonnée-addressed); tapping one opens the shared entity-detail peek (`buildMot` — plays/reads it) AND stamps `opened_at` so the heads-up clears on every device. Opened mots drop into a collapsed « Déjà vus » `Disclosure` (kept ones pinned + badged); **Garder**/**Supprimer** live in the peek (a kept mot's delete asks `useConfirm`, an ordinary one uses the undo toast via `useDeferredRemoval`). When a face is picked, a third collapsed **« Ce que j'ai laissé »** `Disclosure` (the sender outbox, `sentMots` over the RAW `useAllMots`) shows that face's own mots with a per-item **En attente / Vu / Programmé · <when>** status (presence, never a household tally); a still-scheduled one offers **Reprogrammer** (opens `RescheduleBody` — `PATCH surface_at`, or « Envoyer maintenant » = `surface_at:null`) and **Annuler** (undo toast). Discovery: a calm boolean **`face-dot`** on the face row (`MemberSwitcher`/`FaceSelect`/`ProfilePicker`, fed by `useFaceHasWaiting`) — never a count (NFR-CALM). |
| **ScheduleFields** | `components/mots/ScheduleFields.tsx` | The « Plus tard » schedule picker — calm one-tap presets (**Ce soir / Demain matin / Ce week-end**, from the pure `presetWhen`) above the native date+time inputs. Controlled (host owns the date/time strings → seeds from an existing `surface_at`). Shared by `MotComposer` (« Plus tard ») and `RescheduleBody` (outbox reschedule). The composer also exposes **« Me le rappeler »** (self-mot: recipient = my own face + schedule = tomorrow morning — the calmest reminder, no push). |
| **RecipeReadReview** | `components/RecipeReadReview.tsx` | Verify-against-the-photo gate for a **photo-read** recipe. The read pipeline is faithful-first: real on-device OCR (`lib/ocr.ts`, Tesseract WASM — never flips a 3/4 into a 1/4 or invents an ingredient) transcribes the card, then the **same** structuring path as paste-import (`/api/recipe-import`) organises the text; the generative vision read (`/api/recipe-vision`) only runs as a low-confidence fallback. Before anything touches the form, this modal shows the **source photo** (`ZoomableImg`) beside the parsed title/ingredients/steps and flags the lines most likely mis-read — measurements + bare fractions (via `lib/measure` `findMeasures`) and any word the OCR returned with low confidence. Edit in place, confirm, and it's applied (`RecipeForm.applyDraft`); the source photo is stashed to R2 and shown again in the sheet's **Original** view (`RecipeOriginal.sourceImage`). Multi-photo capture stitches several pages in pick order. Opened from `RecipeForm`'s "Scanner une fiche". |

### Page orchestrators — intentionally NOT in the gallery
Need live data/route context, so they're catalogued but not rendered as specimens:
`AddSheet`, `MemoControls` (the ＋ Note-rapide audio-memo + draw controls, #38/#14;
parameterizable via `endpoint`/`affectedKey`/`extraBody` — reused by `CercleNotes`),
`SharePage` (the `/share` PWA share-target landing → capture, #13),
`HubLayout`, `RecipeSheet`, `RecipeForm`, `CookMode`,
`CashierMode` (the « Montrer à la caisse » till surface — a **grid** of picked deals;
tap the one being scanned → a full-screen `.bigcard` proof peek with `‹ Retour`; tapped
tiles dim with an ephemeral ✓. Random-access, NOT a sequential stepper — the user holds
the phone and items hit the belt out of order. Revise/remove via `RowActions` in the peek),
`CastPage` (the « Diffuser au salon » TV surface, `/cast` — a `?scene=` chooser:
`scene=board` (default) **composes the real `<Board/>`** rather than forking a read-only
layout (a `.cast` scope scales the type for 10-foot viewing, `pointer-events:none` makes it
passive); `scene=ambient` renders the `AmbientScreen` screensaver as a permanent
photo-frame "second screen". Boots with a read-only guest token; minted as a link + QR from
**Réglages ▸ Partage ▸ « Au salon »** (the scene-aware `CastTvSection`, moved out of
Affichage — board/ambient use a `showcase` token, the welcome scene a `welcome` token →
`/welcome`). The link/QR opened once in any TV browser is the path that works for everyone
(iOS can't START a cast); the Chrome "Cast now" sender + registered Cast receiver are a
bonus for Chromium devices — see DEPLOY.md/cast),
`BusinessesTab` (the « Le cercle » → **Business** tab — a standalone services/vendors
directory, isolated from the people graph; fetches `BUSINESSES_KEY`, rows + an edit
`Modal`(`BusinessForm`) + detail peek via `buildBusiness`; **add** is the ＋ FAB's job
now — page-level on `/cercle`, no in-tab button; an event can link one, see `EventForm`),
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
graph is the wrong tool at this scale). In the **Social** section those two are replaced by
`CercleWeb` (`components/cercle/CercleWeb.tsx`): the WHOLE social graph at once (no single focus, no
relationship-type filter) so you see ALL the circles of friends, not just one person's. Same
`PanZoom` + node/edge look as the Arbre, two layouts off one graph — `mode='clusters'` (Liens: each
connected component is a halo'd ring, loose people strip below) and `mode='blob'` (Arbre: one
phyllotaxis cloud with every tie drawn). Domain helpers `detectFamilyGroups`/`generationOf` operate on
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

**« L'auto »** (#28 — the single shared car + carpool + work schedules). The calm
answer to "où est l'auto, et est-elle libre ?" for a one-car household. Page-level /
live-data, so catalogued not gallery-rendered: `AutoCard` (`components/board/AutoCard.tsx`
— the board glance strip, mounted in `Board` beside `CercleBirthdays`: status now +
today's rides + soft conflict cue; **always visible once the household uses L'auto**
(a car, a schedule, or a ride today) — "Libre toute la journée" on an idle day, only a
never-configured household sees nothing — taps into `/voiture`) and
`VoiturePage` (`/voiture` — the fast weekly editor: the schedule template pre-fills each
day, tap a day to override just that date without touching the template; week nav +
"copier la semaine passée" / "réinitialiser au modèle"; toddler "qui te reconduit ?").
A **ride is just an event** (`EventForm` gained a **Transport** `Disclosure`: which car +
passenger faces; the ＋ FAB's "Ajouter un trajet" tile opens it via `/event/new?ride=1`) —
**rides recur fully** through the event `recur_json`.
Config in **Réglages ▸ L'auto**: `CarsSection` (`operator/cars.tsx`, mirrors `reserve.tsx`;
`households.cars` JSON, mig 0067) + `ScheduleSection` (`operator/schedule.tsx` — per-member
recurring work windows + "prend l'auto", mig 0069 `schedule_blocks`). **Horaires recur
every-N-weeks** (mig 0073 `week_interval` + `anchor_day`; 1 = weekly default — `BlockForm`
has a 1/2/3/4-week segmented for alternating shifts; `carResolve.weekActive()` gates it
with the same fortnight math as `recur.ts`). Per-date overrides in `car_day` (mig 0070).
**Horaires also surface across the calendar/agenda** — DERIVED, never event rows (like
birthdays) via `carResolve.workOccurrencesInRange()`: `/api/board` adds `work[]` (today
only — the weekly rota would flood À venir) rendered in NowNext + per-member Lanes;
`/api/month` adds them to `events` (`work:true`+`end`, full window) rendered in `MonthView`
(clock dot + read-only row) and `DayPlanPage`. New **`work` `CatKey`** (`lib/cats.ts`,
clock-bold/slate, member colour overrides); read-only everywhere → tap routes to `/voiture`.
Pure engine: `functions/_lib/carAvail.ts` (free gaps / busy-now /
conflicts) + `carResolve.ts` (template + override → spans + work occurrences, DST-safe via
`localTimeOnDay`), both unit-tested. Read model: `GET /api/car` (today for the card, a range
for the week) + `lib/car.ts` hooks (`CAR_KEY`); writes via `/api/schedule` + `/api/car-day`.
No counts/quantities (calm). Reuses `Chip`/`EditField`/`RowActions`/`Disclosure`/`SceneHead`/
`MemberSwitcher`-style faces — no new shared primitive.

**« Les carnets »** (the household's cared-for things as a TREE — a house, a car, and the
water heater INSIDE a house; mig 0082). Page-level / live-data, so catalogued not
gallery-rendered. Lives as a new **SubTab in Le cercle** (`CarnetsTab`,
`components/cercle/CarnetsTab.tsx`, mirrors `BusinessesTab`'s isolation — its own query,
never the people graph), a generic **scene** `CercleCarnetPage` (`/cercle/carnet/:id`: a
2-segment `SubTabs` toggle **« À surveiller »** / **« Le carnet »**, Intelligent default,
hero adaptive by kind; identité · ses choses (children) · historique · entretien), and a
board glance `CarnetsCard` (`components/board/CarnetsCard.tsx`, board card `'carnets'` in
`useBoardCards`; shows the **« long jeu »** lifecycle heads-up, **hides when nothing is near
end-of-life**). Forms: `CarnetForm` (identity — a carnet may carry an **emoji** identity,
default by kind 🏠🚗🔌⚙️🚪📦) + `CareLogForm` (a history entry: date/kind/title/cost/installer
business via `EntityCombobox` + invoice/manual docs via R2). **Three reuse seams** (no parallel
machinery): (1) cadence = an Entretien row scoped via **`home_projects.carnet_id`** → surfaces
on the board through the *existing* pipeline (`HomeProjectForm` gained a `carnetId` prop); (2)
« le long jeu » = a DERIVED lifecycle source `functions/_lib/carnetLife.ts` (install + lifespan →
"à prévoir", like birthdays — unit-tested); (3) the carnet scene IS the detail view (navigates,
no peek adapter yet). Data: `carnets` (tree) + `care_log` (history + R2 docs) + `home_pins` (the
map, P2); `lib/carnets.ts` (`useCarnets`/`useCareLog`, `CARNETS_KEY`). API: `/api/carnets` +
`/api/care-log` (both `authed()` + route table + realtime keys). **Calm**: no score/inventory;
`cost_cents` is a noted invoice, not a balance.
**Phase 2** added: **« En cas de pépin »** — a home carnet's house map (`home_pins`,
`/api/home-pins`, `HomePinForm`, `useHomePins`): calm reference of locations/how-tos
(where's the shutoff/breaker/spare key), shown in the carnet scene (home-kind) AND surfaced
**read-only to a sitter** — the curated `guest/window` (kind `sitter`) now returns `pins` and
`HandoffPage` renders « En cas de pépin » (the guest allowlist still keeps the sitter off
`/api/home-pins` directly — the window is the only door). The **L'auto bridge**: a `kind:'auto'`
carnet can link an existing « L'auto » car (`link_id` = car id, picked in `CarnetForm` via
`useCars`); its scene shows a « Voir l'horaire » link to `/voiture` (L'auto's own data untouched).
**Phase 3** polish: **board branding** — a carnet-scoped Entretien row on Aujourd'hui/À venir wears
its thing's emoji (🔥 Chauffe-eau · filtre) via `homeAct` (board.ts/`ChoreInstance` gained
`carnet_id`; `Board` maps it through a **non-polling** `CARNETS_KEY` fetch so a carnet-less household
never adds `/api/carnets` to the board poll) — and stays a normal **checkable-in-place** row
(deliberately NOT moved into the card, to keep one-tap done). **« Le long jeu » horizon** — the
carnet scene shows the aggregate of the carnet + its children's lifecycles on one calm timeline
(`.carnet-horizon`, sorted by projected year, no progress-bar/countdown). Deferred: month-calendar
lifecycle injection, on-this-day memory, the detail-peek adapter.

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
(`operator/OperatorSection.tsx`), **`QrCode`** (`QrCode.tsx`, class `.qrcode` — a
dumb client-side QR tile for a minted share link: scan off the wall tablet or print
by the door; used under the share-link input in `operator/guest.tsx`). Shared CSS in
`styles/kit.css`.

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
| 9 | **Inline forms → EditField** ✅ mostly | remaining `.operator__inline-form` body sub-fields | **Composite-form blocker resolved** (2026-06-29) — `EditField` grew an `as="div"` non-form mode, so the `ChoreForm`/`EventForm`/`RoutineForm` **title inputs** now use it (clear ✕ / mic, Enter via onKeyDown) inside the host `<form>` that keeps its single bottom submit. Left: the rest of each form's body fields (date/time/recur/colour) + EventForm's inline `.event-bring__add` list-builder stay plain `.input` inside `.operator__inline-form`. |

### EditField rollout
Done: Liste add, kitchen meal/supper/note + meal rename, routine deck rows, device
rename, postal, réserve add, **PantryTab low + use-soon add (voice)**, **recipesTags
tag-pill add + rename**, **CheckRow inline rename** (`.checkrow__edit`), **ChoreForm /
EventForm / RoutineForm title inputs** (via the `as="div"` mode — see below).
**`as="div"` (non-form) mode:** embeds `EditField` inside a larger composite `<form>`
without invalid nested `<form>`. Enter commits via `onKeyDown` (stops propagation so
the host form doesn't submit on the first keypress); the submit buttons become
`type="button"`; pass `submitIcon={null}` to hide the field's own submit so the host
form's bottom submit stays the sole one. The composite-form title inputs above use it.
**Still NOT migrated** (different semantics): EventForm's `.event-bring__add` builder
(pushes to a draft array, not a commit) — a future `as="div"` + `submitLeadingIcon`
migration. The body sub-fields (date/time/recur/colour pickers) stay plain `.input`.

---

## How to extend the gallery

Add a primitive to `src/pages/DevKit.tsx`: a `<Section title hint>` with one or more
`<Demo label>` specimens holding a live instance (local state for interactive ones).
Keep specimens prop-driven and data-free; anything needing live server data belongs
to the page-orchestrator list, not the gallery.
