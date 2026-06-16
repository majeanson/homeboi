# Babillard — component inventory & uniformization backlog

> Living audit of the shared UI. Pair it with the **`/dev/kit`** gallery
> (`src/pages/DevKit.tsx`) — a dev-only, unlinked route that renders the shared
> primitives live across the four presentation axes. Open it at `/dev/kit`.

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
| **Icon / InlineIcon** | `components/Icon.tsx` | Phosphor-bold SVG via `currentColor`; `IconName` is a compile-time union (`lib/pipIcons.ts`). 40+ call sites. |
| **ColorPicker** | `components/ColorPicker.tsx` | Row of palette dots; controlled. |
| **RecurPicker** | `components/RecurPicker.tsx` | Recurrence rule (freq/interval/weekdays). |

### Actions & rows
| Component | File | Purpose |
| --- | --- | --- |
| **Act** + **Section** | `components/board/Act.tsx` | The ONE activity-row primitive: colour spine + tile + title/sub; three shapes (check / nav / info). Board **and** kitchen pickers. |
| **RowActions** | `components/RowActions.tsx` | The ✏️/🗑️ icon pair (40px targets). 8+ call sites. |
| **CheckRow** | `components/CheckRow.tsx` | Calm checklist row: check is its own tap target. Garde-manger + réserve. |
| **DealCard** | `components/DealCard.tsx` | Flyer-deal card (image + store + price + actions). |

### Display / content
| Component | File | Purpose |
| --- | --- | --- |
| **Avatar** | `components/Avatar.tsx` | Person = photo or coloured initial disc. 10+ call sites. |
| **BigTiles** + **Sayable** | `components/BigTiles.tsx` | Toddler picture-tiles + tap-to-speak text (`useSpeak`). |
| **IngredientLine** | `components/IngredientLine.tsx` | Recipe line with tappable measure pills. |
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
| **SectionIntro** | `components/SectionIntro.tsx` | First-visit welcome card (mirrors Guide). |
| **TopBar** | `components/TopBar.tsx` | Minimal auth/home chrome (brand + day/night + FR/EN). |
| **FormScene** | `components/FormScene.tsx` | Full-screen shell for operator add-forms. |

### Page orchestrators — intentionally NOT in the gallery
Need live data/route context, so they're catalogued but not rendered as specimens:
`AddSheet`, `HubLayout`, `RecipeSheet`, `RecipeForm`, `CookMode`, `CashierMode`,
`ProfilePicker`, `TourOverlay`, `DealsBrowser`, `FlyerViewer`, the kitchen sub-tabs
(`DayEditor`, `MealRows`, `PantryTab`, `ReserveSection`, …), and the `operator/*`
section bodies.

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

## Uniformization backlog (prioritised)

What's still duplicated, highest-leverage first. Evidence from a full-codebase sweep.

| # | Cluster | Spread | Recommendation |
| --- | --- | --- | --- |
| 1 | **Empty states** | 20+ sites, ~7 class variants (`feed-empty`, `board__empty`, `*-empty`, `bigtiles__empty`…) | `<EmptyState message interactive?>`; one `.empty-state` class. Quick win. |
| 2 | **Chips / tags / pills** | 40+ sites, ~7 impls (`.chip`, `.tag`, `.picker-chips`, `.meal-chip`, `.tag-admin__pill`, `.lt-term`…) | `<Chip selected onClick>` + `<ChipGroup label>`. Highest visibility. |
| 3 | **List rows** | 40+ sites, ~6 row types (recipe-picker, pantry, operator rows, review-row, list-row, idea-row) | `<ListRow image title subtitle actions>` with `standard`/`checkable`/`swipeable` variants. Unblocks kitchen/operator. |
| 4 | **OperatorSection wrapper** | 13 identical `<section class="surface operator__section"><h2/><p class="lead"/>` | `<OperatorSection title hint>`. One-liner, 100% consistent. |
| 5 | **Modal / sheet / scene** | 12+ overlays, mixed mount strategies (`.show` toggle vs mount/unmount), confirm has its own CSS | `<Modal open>` + `<Sheet>` (swipe/handle); fold confirm into the modal pattern. Architectural. |
| 6 | **Status / feedback lines** | 15+ sites (`.error mono`, `.capture__routed`, `.list-add__voicemsg`, `ai-error-toast`) | `<StatusMessage type icon>`; `role=status` vs `alert`. |
| 7 | **Section headers** | kitchen/kid/reserve header variants | `<SectionHeader title subtitle emoji onMore>`. |
| 8 | **Picker menus** | RecipePicker/LeftoverPicker share class names + structure | `<PickerMenu items onPick renderItem search?>`. |
| 9 | **Inline forms → EditField** | remaining `.operator__inline-form` users | migrate to EditField (see below). |

### EditField rollout
Done: Liste add, kitchen meal/supper/note + meal rename, routine deck rows, device
rename, postal, réserve add. **Still hand-rolled (migrate next):**
- `components/kitchen/PantryTab.tsx` — low/running-out add (voice).
- `components/operator/recipesTags.tsx` — tag pill add + rename.
- `components/CheckRow.tsx` (lines ~46–78) — its built-in inline rename still uses a
  raw `operator__inline-form`; swap to EditField.
- The `forms/ChoreForm` / `EventForm` / `RoutineForm` title inputs.

---

## How to extend the gallery

Add a primitive to `src/pages/DevKit.tsx`: a `<Section title hint>` with one or more
`<Demo label>` specimens holding a live instance (local state for interactive ones).
Keep specimens prop-driven and data-free; anything needing live server data belongs
to the page-orchestrator list, not the gallery.
