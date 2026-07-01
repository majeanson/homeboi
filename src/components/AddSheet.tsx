import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { useAi } from '../lib/ai'
import { useWrite } from '../lib/write'
import { useRecordUndo } from '../lib/toast'
import { useAuth } from '../lib/auth'
import { todayLocalDay, addLocalDays } from '../lib/localDay'
import { useReserveLocations } from '../lib/reservePrefs'
import { useVoiceInput } from '../lib/useVoiceInput'
import { useOnline } from '../lib/online'
import { VoiceButton } from './VoiceButton'
import { StatusMessage } from './StatusMessage'
import { formatWeekday, formatRelativeWeekday } from '../lib/format'
import { OPERATOR_MODES, FORM_ROUTES, type AddSheetMode } from '../lib/addSheet'
import { CATS, type CatKey } from '../lib/cats'
import { Act } from './board/Act'
import { useCookableMeals } from '../lib/nextMeal'
import { recipeImg } from '../lib/recipes'
import { useMealPrefs } from '../lib/mealPrefs'
import { SLOT_ICON_NAME, isMealSlot } from '../lib/mealSlots'
import { useKitchenActions, noKitchenActions, type KitchenAction, type KitchenActionFlags } from '../lib/kitchenActions'
import { BOARD_KEY, MEMBERS_KEY, TODOS_KEY, TODO_TEMPLATES_KEY, ROUTINES_KEY, MONTH_KEY, GHOSTS_KEY, HISTORY_KEY } from '../lib/queryKeys'
import { type TodoTemplate, type TemplatesData } from '../lib/todos'
import { imgUrl } from '../lib/image'
import { stageDeal, parseTerms, pickListFrom, type ListItem } from '../lib/picks'
import { type Deal } from '../lib/deals'
import { MEALS_KEY, PANTRY_KEY, LEFTOVERS_KEY, RESERVE_KEY, type MealsData } from './kitchen/types'
import { Icon, type IconName } from './Icon'
import { MemoControls } from './MemoControls'
import { MotComposer } from './mots/MotComposer'
import { EntityCombobox, type ComboOption } from './EntityCombobox'
import { Chip } from './Chip'
import { mealOptions } from './kitchen/comboOptions'
import { ADD_HELP } from '../lib/addHelp'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { Sheet } from './Sheet'

// Pip's "Add" bottom-sheet — CONTEXTUAL now. HubLayout hands in the current
// section's modes (lib/addSheet SECTION_MODES): the board keeps the quick-note
// chooser, the kitchen offers recette/repas/garde-manger, Routines and Liste
// skip the chooser entirely and open their one form. The operator forms
// (event/chore/routine) are the SAME components Réglages uses.
type CaptureType = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'leftover' | 'note'
interface FormMember { id: string; display_name: string; is_child: number }
// Just the shape the routine picker rows need off the /routines payload.
interface RoutinePick {
  id: string
  name: string
  memberName: string | null
  color: string | null
  avatarPhoto: string | null
  cards?: unknown[]
}

// Tile dressing — colour comes from ONE source (CATS); each tile only names the
// family it reads as plus its own glyph. So the ＋ sheet can never drift from the
// board's colour-coding, and "deep ink + theme-aware --*-wash" is defined once.
// A few tiles deliberately borrow a DIFFERENT family than their data's: the meal
// *planner* reads marigold (the "add/plan" family), not a terracotta carrot;
// pantry-low and auto-pick ride the sage family; list-item is a sky sparkle.

// The 7 AI-router types — only shown as a fallback when a capture comes back
// degraded (AI off), so the human can re-route the saved note.
const TYPE_DRESS: { type: CaptureType; cat: CatKey; icon: IconName }[] = [
  { type: 'event', cat: 'event', icon: 'calendar-blank-bold' },
  { type: 'meal', cat: 'meal', icon: 'bowl-food-bold' },
  { type: 'leftover', cat: 'meal', icon: 'arrow-counter-clockwise-bold' },
  { type: 'task', cat: 'chore', icon: 'hand-heart-bold' },
  { type: 'list-item', cat: 'list', icon: 'sparkle-bold' },
  { type: 'pantry-low', cat: 'pantry', icon: 'carrot-bold' },
  { type: 'note', cat: 'routine', icon: CATS.routine.icon },
]

// One row a capture routing inserted (mirrors the Cleanup shape that
// functions/api/capture returns as `routed.cleanup`): the table + id, so a
// correction (re-route) or a calm undo can drop exactly what was created.
type Cleanup = { table: string; id: string }

// Each cleanup table → its own DELETE endpoint (every one already takes { id }).
// Lets the compensating undo remove the row(s) a routing created by REUSING each
// resource's existing delete — no new server handler. Mirrors capture.ts's
// CLEANUP_TABLES allowlist (keep the two in step).
const CAPTURE_UNDO_EP: Record<string, string> = {
  events: 'events',
  tasks: 'chores',
  list_items: 'list',
  pantry_low: 'pantry',
  meals: 'meals',
  meal_leftovers: 'meal-leftovers',
  notes: 'notes',
}

// The caches a capture can land in (board glance, meal grid, pantry, leftovers
// pool) — invalidated after a capture AND after an undo-delete so the live poll
// reconciles. Mirrors the fan-out the typed capture submit always did.
const CAPTURE_KEYS = [BOARD_KEY, MEALS_KEY, PANTRY_KEY, LEFTOVERS_KEY]

const MODE_DRESS: Record<AddSheetMode, { cat: CatKey; icon: IconName }> = {
  capture: { cat: 'list', icon: 'sparkle-bold' },
  event: { cat: 'event', icon: 'calendar-blank-bold' },
  ride: { cat: 'event', icon: 'key-bold' },
  // « Activité » — a recurring kid commitment (a team/lesson glyph), distinct from
  // the plain calendar event and the ride's key.
  activity: { cat: 'event', icon: 'users-three-bold' },
  chore: { cat: 'chore', icon: 'hand-heart-bold' },
  // The board ＋ « Corvées » tile — same chore dressing; it opens the Corvée /
  // Entretien / Projets sub-choice rather than jumping straight to a form.
  'chores-pick': { cat: 'chore', icon: 'hand-heart-bold' },
  todo: { cat: 'chore', icon: 'check-bold' },
  routine: { cat: 'routine', icon: CATS.routine.icon },
  'routine-pick': { cat: 'routine', icon: CATS.routine.icon },
  // The day-planner shortcuts borrow the marigold "today/tomorrow" sun glyphs the
  // board heroes use, so the ＋ reads the same as the day it plans.
  'plan-today': { cat: 'event', icon: 'sun-bold' },
  'plan-tomorrow': { cat: 'event', icon: 'sun-horizon-bold' },
  // #17 departure mode — a key glyph for "before you leave".
  departure: { cat: 'chore', icon: 'key-bold' },
  cook: { cat: 'meal', icon: 'cooking-pot-bold' },
  recipe: { cat: 'meal', icon: 'book-open-bold' },
  // The toddler picture cookbook (#45) — a baby glyph: it's the kids' read-aloud
  // book, distinct from the "add a recipe" open-book tile.
  book: { cat: 'meal', icon: 'baby-bold' },
  meal: { cat: 'list', icon: 'calendar-blank-bold' },
  leftovers: { cat: 'meal', icon: 'arrow-counter-clockwise-bold' },
  pantry: { cat: 'chore', icon: 'carrot-bold' },
  // La réserve = the freezer / back-of-pantry stash, so it reads as cold storage.
  reserve: { cat: 'pantry', icon: 'cloud-snow-bold' },
  'list-item': { cat: 'event', icon: 'sparkle-bold' },
  'quick-add': { cat: 'list', icon: 'lightning-bold' },
  flyer: { cat: 'meal', icon: 'magnifying-glass-bold' },
  'auto-pick': { cat: 'chore', icon: 'tag-bold' },
  share: { cat: 'list', icon: 'arrow-up-right-bold' },
  // Le cercle's creation tiles — all the rose 'cercle' family, distinct glyphs.
  person: { cat: 'cercle', icon: 'user-bold' },
  family: { cat: 'cercle', icon: 'tree-bold' },
  connect: { cat: 'cercle', icon: 'users-three-bold' },
  group: { cat: 'cercle', icon: 'tag-bold' },
  business: { cat: 'cercle', icon: 'storefront-bold' },
  pet: { cat: 'cercle', icon: 'smiley-bold' },
  carnet: { cat: 'cercle', icon: 'book-open-bold' },
  // « Voyage » — start a trip notebook (navigate-only to /voyage/new).
  voyage: { cat: 'event', icon: 'map-pin-bold' },
  // « Laisse un mot » — a little letter for a household face (the rose 'cercle' family
  // reads as "a personal message"); opens an in-sheet composer.
  mot: { cat: 'cercle', icon: 'envelope-bold' },
}

// Modes with no in-sheet form — picking one leaves the sheet for a full-screen
// route (the recipe builder, the quick-add restock page, the flyer browser, and
// the operator add-forms from FORM_ROUTES: event/chore/routine, which moved out
// of the sheet because their tall forms stranded inputs under the keyboard).
// They never become the sheet's default (defMode skips them).
const NAV_TARGET: Partial<Record<AddSheetMode, string>> = {
  recipe: '/kitchen/recipe/new',
  book: '/kitchen/book',
  departure: '/board/departure',
  'quick-add': '/liste/quick',
  flyer: '/liste/circulaires',
  // Le cercle: person + family + pet are scene routes; connect + group open on
  // /cercle itself via a ?param the page reads (then strips).
  person: '/cercle/person/new',
  family: '/cercle/family/new',
  pet: '/cercle/pet/new',
  connect: '/cercle?connect=1',
  group: '/cercle?add=group',
  business: '/cercle?add=business',
  carnet: '/cercle?add=carnet',
  ...FORM_ROUTES,
}

// The board ＋ « Corvées » sub-choice (rendered for mode === 'chores-pick'): a
// chore vs the two home-project kinds. Each navigates to its full-screen form
// scene. Labels resolve from t.operator.home at render (locale-aware).
const CHORE_KINDS: { key: 'chore' | 'upkeep' | 'plan'; icon: IconName; to: string }[] = [
  { key: 'chore', icon: 'hand-heart-bold', to: '/chore/new' },
  { key: 'upkeep', icon: 'gear-six-bold', to: '/home-project/new?kind=upkeep' },
  { key: 'plan', icon: 'paint-brush-bold', to: '/home-project/new?kind=plan' },
]

// The kitchen-week action tiles (P2-10) — a declarative catalog sibling to
// MODE_DRESS/CHORE_KINDS so adding an action is one entry, not another hand-rolled
// tile in the sheet render. `show`/`disabled`/`title` are pure functions of the live
// flags (+ help mode + AI-enabled); the render loop wires run/help/close. The key
// doubles as the run key AND the ADD_HELP help key (both already true inline).
type KitchenActionTile = {
  key: KitchenAction
  icon: IconName
  iconColour: string
  wash: string
  label: (t: ReturnType<typeof useT>) => string
  show: (f: KitchenActionFlags, helpActive: boolean, aiEnabled: boolean) => boolean
  disabled?: (f: KitchenActionFlags, helpActive: boolean) => boolean
  title?: (f: KitchenActionFlags, t: ReturnType<typeof useT>) => string | undefined
}
const KITCHEN_ACTIONS: KitchenActionTile[] = [
  { key: 'shop', icon: 'shopping-bag-bold', iconColour: '#6B8A52', wash: 'var(--sage-wash)', label: (t) => t.kitchen.shopWeek, show: (f) => f.canShop },
  // AI ideas — shown when AI is on (or in help mode so it can be explained); a runtime
  // 503 / busy keeps it disabled with the "AI off" hint.
  { key: 'ai', icon: 'sparkle-bold', iconColour: '#D9842A', wash: 'var(--marigold-wash)', label: (t) => t.kitchen.aiIdeas, show: (_f, help, ai) => ai || help, disabled: (f, help) => !help && (!f.canAiSuggest || f.aiBusy), title: (f, t) => (f.canAiSuggest ? undefined : t.kitchen.suggestAiOff) },
  { key: 'book', icon: 'book-open-bold', iconColour: '#C2563A', wash: 'var(--terracotta-wash)', label: (t) => t.kitchen.bookIdeas, show: (f) => f.hasRecipes },
  { key: 'useup', icon: 'carrot-bold', iconColour: '#6B8A52', wash: 'var(--sage-wash)', label: (t) => t.kitchen.useUpIdeas, show: (f) => f.canUseUp },
  // « Vide-frigo » (#5) — invent a recipe from what's about to spoil; shown when AI can
  // reach something to use up (or in help mode so it can be explained).
  { key: 'emptyFridge', icon: 'cooking-pot-bold', iconColour: '#6B8A52', wash: 'var(--sage-wash)', label: (t) => t.kitchen.fridge.tile, show: (f, help) => f.canEmptyFridge || help },
]

export function AddSheet({
  open,
  modes,
  initialMode = null,
  onClose,
}: {
  open: boolean
  modes: AddSheetMode[]
  // null = the section's default; an explicit mode (open('routine')) pins it.
  initialMode?: AddSheetMode | null
  onClose: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const write = useWrite()
  // Compensating undo (the row is already live server-side): records a "routed to
  // X" entry in the shared Récents toast whose onUndo deletes what was created.
  const recordUndo = useRecordUndo()
  const nav = useNavigate()
  const { signedIn } = useAuth()
  // AI on/off (binding present AND household hasn't switched it off). When off, the
  // "AI ideas" tile is hidden outright — capture still works (it degrades to a note).
  const { enabled: aiEnabled } = useAi()
  // The kitchen week's three actions (shop the week / AI ideas / ideas from the
  // book), registered by the Kitchen page. They show as icon tiles here only on
  // the kitchen Repas tab; tapping one closes the sheet and runs the flow, whose
  // result lands on the week grid behind us. (Replaces the old floating rail.)
  const kitchenActions = useKitchenActions()

  // Per-action gating, same semantics the old signedIn-only chooser had: the
  // operator forms drop off for an unsigned kiosk; if nothing survives (a kiosk
  // on /routines), fall back to quick capture — the AI router still sorts it.
  const allowed = signedIn ? modes : modes.filter((m) => !OPERATOR_MODES.has(m))
  const shown = allowed.length ? allowed : (['capture'] as AddSheetMode[])
  // The ＋ sheet opens with NOTHING pre-selected whenever it offers a chooser: no
  // tile is highlighted and no form shows until the operator picks one (Marc's
  // ask — a calm, blank-slate sheet in every section). A chooser-less section
  // (one mode, no tiles to choose between) still drops straight into its single
  // form, and an explicit initialMode (open('pantry'), the Garde-manger ＋) still
  // pins that form.
  const defMode: AddSheetMode | null = shown.length > 1 ? null : shown[0]
  const [mode, setMode] = useState<AddSheetMode | null>(initialMode ?? defMode)
  // Re-sync on each open so the last visit's pick doesn't leak into this one.
  useEffect(() => {
    if (open) setMode(initialMode ?? defMode)
  }, [open, initialMode, defMode])

  // When a tile is picked, its form renders BELOW the chooser grid — often below the
  // fold on a phone, where it isn't obvious you have to scroll. So whenever the mode
  // changes to an in-sheet form while a chooser is showing above it, bring that panel
  // into view and move focus to it. We focus the panel WRAPPER (a tabindex'd div), not
  // an input, on purpose: focusing an input would pop the mobile keyboard (see the
  // modal conventions — never auto-open the keyboard).
  const panelRef = useRef<HTMLDivElement>(null)
  useEffect(() => {
    // tiles.length is read on purpose without being a dep: a chooser of >1 tiles is
    // what puts the form below the fold. We only want to (re)scroll when the picked
    // mode changes, not when an async query nudges the tile count mid-form.
    if (!open || !mode || tiles.length <= 1) return
    const panel = panelRef.current
    if (!panel) return
    const id = requestAnimationFrame(() => {
      panel.scrollIntoView({ behavior: 'smooth', block: 'nearest' })
      panel.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open])

  const [busy, setBusy] = useState(false)

  // — quick capture (board) —
  const [text, setText] = useState('')
  const captureVoice = useVoiceInput(setText)
  // The last route's result, kept so we can (a) confirm "Ajouté : X", (b) offer the
  // re-route tiles, and (c) re-file with the ORIGINAL text + the rows to undo — the
  // input is cleared after a successful route, so a correction sources from here.
  const [routed, setRouted] = useState<{ text: string; label: string; degraded: boolean; cleanup: Cleanup[] } | null>(
    null,
  )
  // Capture needs a live round-trip (the AI type + reroute cleanup), so unlike the
  // list/todo adds it can't queue offline. Surface a failure instead of swallowing it,
  // so an offline/5xx capture isn't silently eaten (the one hole in "never lost").
  const [captureErr, setCaptureErr] = useState(false)
  const online = useOnline()

  // — list item (Liste) — its own state + mic so a board draft never posts to
  // the grocery list by accident.
  const [listText, setListText] = useState('')
  const listVoice = useVoiceInput(setListText)

  // — todo (board) — a quick "À compléter" item. Standing by default (day null);
  // the "Aujourd'hui" toggle pins it to today instead. Its own state + mic so a
  // board draft never lands as a todo by accident.
  const [todoText, setTodoText] = useState('')
  const todoVoice = useVoiceInput(setTodoText)
  const [todoToday, setTodoToday] = useState(false)
  // Quick-add can also drop in a whole departure CHECKLIST (a template), not just a
  // single line — the same instantiate the board/day chips use, honouring the scope
  // toggle. Fetched only while the todo form is open.
  const { data: todoTplData } = useQuery({
    queryKey: TODO_TEMPLATES_KEY,
    queryFn: () => api<TemplatesData>('todo-templates'),
    enabled: open && shown.includes('todo'),
  })
  const todoTemplates = todoTplData?.templates ?? []

  // — pantry (kitchen) — speak-to-fill, same single-shot mic as capture (the
  // sheet adds one then closes; the page's PantryTab is where you rattle off many).
  const [pantryText, setPantryText] = useState('')
  const pantryVoice = useVoiceInput(setPantryText)

  // — réserve (kitchen) — add to the freezer / back-of-pantry stash, grouped by a
  // storage location. Mirrors the in-page ReserveSection add (same locations + write),
  // so the ＋ files an item exactly where the Garde-manger tab would.
  const [reserveText, setReserveText] = useState('')
  const reserveVoice = useVoiceInput(setReserveText)
  const [reserveLoc, setReserveLoc] = useState('')
  const reservePrefs = useReserveLocations()
  // Guard against a stale pick (household removed this location) — fall back to the
  // first configured one rather than silently filing under "Autres".
  const reserveSelLoc = reservePrefs.locations.some((l) => l.id === reserveLoc)
    ? reserveLoc
    : reservePrefs.locations[0]?.id ?? ''

  // — leftovers (kitchen) — announce a cooked dish has extra; lands in the Restants
  // pool ("à finir bientôt"). Quick-pick one of today's planned meals or type one;
  // planning onto a day happens from the kitchen's Restants strip.
  const [leftoverText, setLeftoverText] = useState('')
  const leftoverVoice = useVoiceInput(setLeftoverText)

  // — plan a meal (kitchen) — "Planifier un repas" is now a DAY PICKER that opens
  // that day's full "Gérer" sheet (one real editor, reached two ways), instead of
  // a divergent mini day+slot+title form. Day options come from the SAME weekStart
  // the Kitchen grid renders, so picking a day lands on the matching grid row.
  const wantsMeal = shown.includes('meal') || shown.includes('leftovers')
  const { data: mealsData } = useQuery({
    queryKey: MEALS_KEY,
    queryFn: () => api<MealsData>('meals'),
    enabled: open && wantsMeal,
  })
  // "Cuisiner" tile → an in-sheet picker of today's cookable meals (each planned
  // meal that has a recipe), so you choose which to cook, not just the next one.
  // Fetched from the shared meal + recipe caches only while the sheet's open and
  // the tile is shown. mealPrefs colours each slot the way the rest of the app does.
  const cookChoices = useCookableMeals(open && shown.includes('cook'))
  // #43 — the "Cuisiner ensemble" pool spans EVERY planned day in the window (not
  // just today): batch-cooking is naturally cross-day, so you can pick a dish from
  // Tuesday and one from Thursday at once. Same shared caches (deduped fetch).
  const cookWeek = useCookableMeals(open && shown.includes('cook'), true)
  // The DISTINCT cookable dishes across the plan (a recipe planned on two days /
  // slots shows once): the set the ensemble picker selects from. 2+ unlocks it.
  const cookDistinct = useMemo(() => {
    const seen = new Set<string>()
    return cookWeek.filter((c) => {
      if (seen.has(c.recipe.id)) return false
      seen.add(c.recipe.id)
      return true
    })
  }, [cookWeek])
  // null = not picking; a Set of recipe ids = the ensemble selection is open. Starts
  // EMPTY — you tap the dishes you want, then "Commencer" (needs 2+).
  const [ensemblePick, setEnsemblePick] = useState<Set<string> | null>(null)
  const mealPrefs = useMealPrefs()
  const weekStart = mealsData?.weekStart ?? 0
  // Same 10-day countdown window the Kitchen grid renders (shrinks 10 → 4 across
  // the week, re-anchored each Tuesday — see functions/api/meals.ts).
  const weekDays = weekStart
    ? Array.from({ length: mealsData?.windowDays ?? 10 }, (_, i) => addLocalDays(weekStart, i))
    : []
  // Today's planned (non-leftover) meals → "we ate this, there's some left"
  // suggestions for the leftovers combobox; picking one carries its recipe link.
  const leftoverMealOpts = useMemo(
    () => mealOptions((mealsData?.days ?? []).filter((d) => d.date === weekStart && !d.is_leftover)),
    [mealsData, weekStart],
  )

  const { data: membersData } = useQuery({
    queryKey: MEMBERS_KEY,
    queryFn: () => api<{ members: FormMember[] }>('members'),
    enabled: signedIn && open,
  })
  const members = membersData?.members ?? []

  // Routines ＋ picker (the /routines tab): the household's routines, so the sheet
  // can offer "edit this one" alongside "build a new one". Fetched only while the
  // sheet's open on that tab; the same ROUTINES_KEY the tab + Réglages already use.
  const wantsRoutinePick = shown.includes('routine-pick')
  const { data: routinesData } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutinePick[] }>('routines'),
    enabled: open && wantsRoutinePick,
  })
  const routinePick = routinesData?.routines ?? []

  // Liste's "Meilleurs prix" tile (auto-pick): stages the best flyer deal onto
  // each grocery line, then jumps to the cashier. Needs the current list, fetched
  // only while the sheet's open on Liste. An empty list ⇒ nothing to price-match,
  // so the tile hides (see `tiles` below). Replaces the old on-page button — the
  // list page is now just the list; its shopping actions live behind the ＋.
  // Both the auto-pick (price-match) and share tiles need the current list, fetched
  // only while the sheet's open on Liste.
  const wantsList = shown.includes('auto-pick') || shown.includes('share')
  const { data: listBoard } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: ListItem[] }>('board'),
    enabled: open && wantsList,
  })
  const listItems = listBoard?.list ?? []
  const [autoBusy, setAutoBusy] = useState(false)
  // The OS share sheet exists (mobile/PWA, not every desktop). Gate the share tile
  // on it so we never offer a dead button.
  const canShare = typeof navigator !== 'undefined' && !!navigator.share
  // The tiles actually rendered: auto-pick + share only earn a spot once there's a
  // list to act on (an empty Liste shows just add/quick-add/flyer); share also needs
  // OS share support.
  const tiles = shown.filter((m) => {
    if (m === 'auto-pick') return listItems.length > 0
    if (m === 'share') return canShare && listItems.length > 0
    return true
  })
  // CHANGE 1 — fast path to the capture box. On a section whose chooser offers quick
  // capture (the board), surface the capture box ABOVE the tiles so the highest-
  // frequency intent — type-or-speak a note — is reachable WITHOUT first tapping its
  // tile (3 taps → 2). The calm blank-slate chooser is preserved: no override form is
  // pre-selected, the other tiles stay below as explicit overrides, and the now-
  // redundant capture tile drops out of the grid. A single-mode or kiosk-fallback
  // sheet (tiles.length === 1) keeps capture in its panel exactly as before.
  const captureAtTop = tiles.length > 1 && tiles.includes('capture')
  const gridTiles = captureAtTop ? tiles.filter((m) => m !== 'capture') : tiles

  async function autoPick() {
    if (autoBusy) return
    setAutoBusy(true)
    let any = false
    for (const item of listItems) {
      try {
        const terms = parseTerms(item.search_terms)
        const qs = `deals?q=${encodeURIComponent(item.text)}${terms.length ? `&terms=${encodeURIComponent(terms.join(','))}` : ''}`
        const r = await api<{ deals: Deal[] }>(qs)
        if (r.deals[0]) {
          await stageDeal(qc, item.text, r.deals[0])
          any = true
        }
      } catch {
        /* skip items with no deals / errors */
      }
    }
    const hadPicks = pickListFrom(listItems).length > 0
    setAutoBusy(false)
    close()
    if (any || hadPicks) nav('/liste/cashier')
  }

  // Share the list through the OS share sheet — the unchecked lines (or the whole
  // list if nothing's unchecked), one bullet per line. Moved off the Liste page
  // (where it sat beside the flyer search) to here, so the page stays just the list.
  async function shareList() {
    if (!canShare) return
    const unchecked = listItems.filter((i) => !i.checked_at)
    const items = (unchecked.length > 0 ? unchecked : listItems).map((i) => `• ${i.text}`).join('\n')
    if (!items) return
    close()
    try {
      await navigator.share({ title: t.list.share, text: items })
    } catch {
      /* user dismissed the share sheet, or it's unavailable — nothing to do */
    }
  }

  const close = useCallback(() => {
    setRouted(null)
    setEnsemblePick(null) // leave the ensemble picker so it reopens fresh next time
    onClose()
  }, [onClose])


  // Compensating undo for a capture: the row(s) are already live, so delete each
  // via its own resource endpoint (CAPTURE_UNDO_EP). Offline-aware (useWrite) and
  // idempotent — a row already gone (e.g. it was re-routed) just no-ops.
  async function undoCapture(cleanup: Cleanup[]) {
    for (const row of cleanup) {
      const ep = CAPTURE_UNDO_EP[row.table]
      if (!ep) continue
      try {
        await write(ep, { method: 'DELETE', body: { id: row.id }, affectedKeys: CAPTURE_KEYS })
      } catch {
        /* already gone or a server reject — nothing to take back */
      }
    }
  }

  // Quick capture. forceType (a re-route correction tile, or the degraded
  // type-picker) skips the AI router. A re-route re-files the text we already
  // captured (the input was cleared on the first success) and hands the server the
  // PREVIOUS routing's rows to delete (`undo`), so a correction MOVES the capture
  // instead of duplicating it (functions/api/capture applyCleanup).
  async function submit(e?: React.FormEvent, forceType?: CaptureType) {
    e?.preventDefault()
    const value = (forceType ? routed?.text ?? text : text).trim()
    if (!value || busy) return
    setCaptureErr(false)
    // Capture can't be queued (it needs the sync AI response), so if we're offline
    // tell the user instead of silently no-op'ing — the typed text stays in the box.
    if (!online) {
      setCaptureErr(true)
      return
    }
    setBusy(true)
    const prevCleanup = forceType ? routed?.cleanup : undefined
    setRouted(null)
    try {
      const res = await api<{ type: string; degraded: boolean; routed: { kind: string; label: string; cleanup?: Cleanup[] } }>(
        'capture',
        { method: 'POST', body: { text: value, forceType, undo: prevCleanup } },
      )
      const degraded = res.degraded && !forceType
      const label = res.routed?.label ?? value
      const cleanup = res.routed?.cleanup ?? []
      setRouted({ text: value, label, degraded, cleanup })
      if (!degraded) setText('')
      for (const key of CAPTURE_KEYS) qc.invalidateQueries({ queryKey: key })
      // Calm undo on every REAL route (not the degraded fallback note, which is
      // awaiting a re-route): the created row is live, so record a compensating
      // entry that deletes it. A re-route records a fresh entry for the new row;
      // any prior entry's delete then no-ops (the server already dropped that row).
      if (!degraded && cleanup.length) {
        recordUndo({ message: `${t.capture.routed} ${label}`, onUndo: () => void undoCapture(cleanup) })
      }
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
      // A real 4xx/5xx (not just offline): surface it so the tap isn't silently lost.
      setCaptureErr(true)
    } finally {
      setBusy(false)
    }
  }

  // Add straight to the grocery list (Liste's ＋) — same write + invalidation
  // fan-out as the page's own add bar (board carries the list; ghosts/history
  // feed the quick-add panel).
  async function submitList(e?: React.FormEvent) {
    e?.preventDefault()
    const value = listText.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      // Offline-aware (like the todo/reserve adds below): queues + replays offline,
      // then affectedKeys reconcile the board + the quick-add ghosts/history panel.
      await write('list', { method: 'POST', body: { text: value }, affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY] })
      setListText('')
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Add an "À compléter" todo (board ＋). Standing (day null) unless "Aujourd'hui"
  // is picked → today's local-midnight day. Offline-safe write; the board glance +
  // any open todo view refetch via TODOS_KEY (prefix-matches day-scoped reads), and
  // MONTH_KEY so a today-pinned add shows on the calendar/day page. (Not BOARD_KEY:
  // the board payload's `todos` slice is the loose-chore "À faire", not these.)
  async function submitTodo(text?: string) {
    const value = (text ?? todoText).trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('todos', {
        method: 'POST',
        body: { title: value, day: todoToday ? todayLocalDay() : null },
        affectedKeys: [TODOS_KEY, MONTH_KEY],
      })
      setTodoText('')
      setTodoToday(false)
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Instantiate a whole checklist from the quick-add sheet — a composed list lands
  // as one sectioned batch (see functions/api/todos.ts). Honours the scope toggle.
  async function quickAddTemplate(templateId: string) {
    if (busy) return
    setBusy(true)
    try {
      await write('todos', {
        method: 'POST',
        body: { templateId, day: todoToday ? todayLocalDay() : null },
        affectedKeys: [TODOS_KEY, MONTH_KEY],
      })
      setTodoToday(false)
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Mark something low in the pantry (kitchen ＋) — mirrors PantryTab's add.
  async function submitPantry(e?: React.FormEvent) {
    e?.preventDefault()
    const value = pantryText.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('pantry', { method: 'POST', body: { item: value }, affectedKeys: [PANTRY_KEY] })
      setPantryText('')
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Add to La réserve (kitchen ＋) — same offline-aware write as ReserveSection,
  // filing the item under the picked storage location (null ⇒ "Autres").
  async function submitReserve(e?: React.FormEvent) {
    e?.preventDefault()
    const value = reserveText.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('reserve', {
        method: 'POST',
        body: { item: value, location_id: reserveSelLoc || null },
        affectedKeys: [RESERVE_KEY],
      })
      setReserveText('')
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Announce leftovers into the Restants pool (kitchen ＋). Quick-pick chips pass a
  // title (+ recipe/source); the typed form passes its own text. Planning onto a
  // day is done later from the kitchen's Restants strip.
  async function postLeftover(title: string, recipeId?: string | null, sourceMealId?: string | null) {
    const value = title.trim()
    if (!value || busy) return
    setBusy(true)
    try {
      await write('meal-leftovers', { method: 'POST', body: { title: value, recipeId, sourceMealId }, affectedKeys: [LEFTOVERS_KEY] })
      setLeftoverText('')
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Open a day's full editor from the picker: close this sheet and navigate to the
  // day's planning scene (/kitchen/day/<date>). One editor, two entry points (the
  // other is the grid's pencil); no duplicate mini-form.
  const planDay = (d: number) => {
    close()
    nav(`/kitchen/day/${d}`)
  }

  const modeLabel = (m: AddSheetMode) => {
    const labels: Record<AddSheetMode, string> = {
      capture: t.capture.quick,
      event: t.capture.types.event,
      ride: t.auto.addRide,
      activity: t.operator.addActivity,
      chore: t.operator.chores,
      'chores-pick': t.operator.chores,
      todo: t.todos.title,
      'routine-pick': t.nav.routines,
      'plan-today': t.board.planToday,
      'plan-tomorrow': t.board.planTomorrow,
      departure: t.departure.title,
      cook: t.kitchen.cook,
      routine: t.nav.routines,
      recipe: t.recipes.add,
      book: t.recipes.bookMake,
      meal: t.kitchen.planMeal,
      leftovers: t.kitchen.leftovers,
      pantry: t.kitchen.lowAdd,
      reserve: t.kitchen.reserve,
      'list-item': t.list.addTitle,
      'quick-add': t.list.quickAdd,
      flyer: t.shop.browse,
      'auto-pick': t.shop.auto,
      share: t.list.share,
      person: t.cercle.add,
      family: t.cercle.familyBuild,
      connect: t.cercle.connectTwo,
      group: t.cercle.addGroup,
      business: t.cercle.business.add,
      pet: t.cercle.pet.add,
      carnet: t.carnets.add,
      voyage: t.voyage.captureTile,
      mot: t.mots.tile,
    }
    return labels[m]
  }

  // The HelpBubble title for a help key — a mode label, or a kitchen-action label.
  // Derived from the one KITCHEN_ACTIONS catalog so labels can't drift (and so
  // emptyFridge, previously omitted here, now gets its title instead of falling through).
  const actionLabel: Record<string, string> = Object.fromEntries(KITCHEN_ACTIONS.map((a) => [a.key, a.label(t)]))
  const helpTitle = (key: string) => actionLabel[key] ?? modeLabel(key as AddSheetMode)
  // Contextual "?" help mode (shared hook): arm it, then tapping any tile explains
  // it in place instead of running it. Resets each time the sheet (re)opens.
  const help = useHelpMode(ADD_HELP, helpTitle, open)

  // The sheet's title names what this section adds (the chooser-less sections
  // would otherwise just say "Ajouter" over an unexplained form).
  const title =
    shown.length > 1
      ? shown.includes('capture')
        ? t.common.add
        : shown.includes('list-item')
          ? t.list.addTitle
          : shown.includes('person')
            ? t.cercle.addTitle
            : t.kitchen.addTitle
      : mode === 'routine-pick'
        ? t.nav.routines
        : mode === 'routine'
        ? t.routines.add
        : mode === 'list-item'
          ? t.list.addTitle
          : t.common.add

  // The quick-capture form. Rendered EITHER at the top of the board chooser
  // (captureAtTop — the fast path) OR, for a chooser-less / kiosk-fallback sheet, in
  // the picked-mode panel below. One definition, two placements (no duplicate form).
  const captureForm = (
    <>
      <form onSubmit={submit}>
        <div className="sheet__field">
          <Icon name="pencil-simple-bold" size={20} color="var(--ink-faint)" />
          <input
            value={text}
            onChange={(e) => setText(e.target.value)}
            placeholder={captureVoice.listening ? t.capture.listening : t.capture.placeholder}
            aria-label={t.common.add}
          />
          <VoiceButton voice={captureVoice} label={t.capture.voice} />
        </div>

        {captureErr && <StatusMessage tone="error">{online ? t.capture.failed : t.capture.offline}</StatusMessage>}

        {/* CHANGE 2 — confirmation + one-tap correction after EVERY route (not only
            the degraded fallback). The AI can mis-route, so re-filing the saved
            capture to another type in one tap beats deleting + retyping. The degraded
            line already says "pick the type"; a normal route reads "Non, plutôt…".
            Re-routing hands the server the previous rows as `undo` (see submit), so a
            correction MOVES the capture instead of duplicating it. */}
        {routed && (
          <>
            <p className="capture__routed mono">
              {routed.degraded ? t.capture.degraded : `${t.capture.routed} ${routed.label}`}
            </p>
            {!routed.degraded && <p className="sheet__group-label mono">{t.capture.reroute}</p>}
            <div className="cat-grid">
              {TYPE_DRESS.map((ty) => (
                <button key={ty.type} type="button" className="cat-pick" onClick={() => submit(undefined, ty.type)}>
                  <span className="ct" style={{ background: CATS[ty.cat].wash }}>
                    <Icon name={ty.icon} size={22} color={CATS[ty.cat].deep} />
                  </span>
                  <span>{t.capture.types[ty.type]}</span>
                </button>
              ))}
            </div>
          </>
        )}

        <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy}>
          <Icon name="plus-bold" size={20} />
          {t.common.add}
        </button>
      </form>
      {/* Or leave a memo instead of typing: a voice clip (#38) or a quick
          drawing (#14). Both file a fridge note with an R2 attachment. */}
      <MemoControls onDone={close} />
    </>
  )

  return (
    <Sheet open={open} onClose={close} ariaLabel={title} className={help.active ? 'help-armed' : undefined}>
      {/* Contextual help toggle: arm it, then tap any tile to learn what it does
          in place. Only in tutorial mode (experts hide every "?"). */}
      {help.available && <HelpToggle className="sheet__help" active={help.active} onToggle={help.toggle} />}
      <h3>{title}</h3>

        {/* Help mode: a hint, then (once a tile is tapped) the in-place help box. */}
        {help.hint && <HelpHint />}
        {help.bubble}

        {/* Fast path: the capture box rides ABOVE the chooser on the board, so the
            quick note is one type-and-Add away (the tile for it is dropped below). */}
        {captureAtTop && <div className="addsheet__lead">{captureForm}</div>}

        {/* The section's chooser — only when there's a real choice to make.
            The recipe tile is navigate-only: the recipe builder is a full
            overlay that lives on the kitchen page, not in this sheet. Liste's
            auto-pick tile drops out when the list is empty (nothing to price).
            On the board the capture tile is hoisted out (captureAtTop) — the rest
            stay here as explicit overrides. */}
        {tiles.length > 1 && gridTiles.length > 0 && (
          <div className={'cat-grid' + (gridTiles.length === 3 ? ' cat-grid--3' : '')}>
            {gridTiles.map((m) => (
              <button
                key={m}
                type="button"
                className={'cat-pick' + (mode === m ? ' sel' : '')}
                disabled={!help.active && m === 'auto-pick' && autoBusy}
                onClick={help.pick(m, () => {
                  if (m === 'auto-pick') {
                    autoPick()
                    return
                  }
                  if (m === 'share') {
                    void shareList()
                    return
                  }
                  // The day-planner shortcuts resolve their date at click time
                  // (today / tomorrow), then jump to that day's full planner.
                  if (m === 'plan-today' || m === 'plan-tomorrow') {
                    const base = todayLocalDay()
                    const d = m === 'plan-today' ? base : addLocalDays(base, 1)
                    close()
                    nav(`/kitchen/day/${d}`)
                    return
                  }
                  const target = NAV_TARGET[m]
                  if (target) {
                    close()
                    nav(target)
                    return
                  }
                  setMode(m)
                })}
                aria-pressed={mode === m}
              >
                <span className="ct" style={{ background: CATS[MODE_DRESS[m].cat].wash }}>
                  <Icon name={MODE_DRESS[m].icon} size={22} color={CATS[MODE_DRESS[m].cat].deep} />
                </span>
                <span>{m === 'auto-pick' && autoBusy ? t.shop.autoWorking : modeLabel(m)}</span>
              </button>
            ))}
          </div>
        )}

        {/* The kitchen week's actions — only on the Repas tab, where their result
            (the shop chips / the suggestion card) shows on the grid behind the
            sheet. Tapping a tile closes the sheet and runs the flow. */}
        {!noKitchenActions(kitchenActions.flags) && (
          <div className="sheet__group">
            <p className="sheet__group-label mono">{t.kitchen.week}</p>
            <div className="cat-grid">
              {KITCHEN_ACTIONS.filter((a) => a.show(kitchenActions.flags, help.active, aiEnabled)).map((a) => (
                <button
                  key={a.key}
                  type="button"
                  className="cat-pick"
                  disabled={a.disabled ? a.disabled(kitchenActions.flags, help.active) : undefined}
                  title={a.title ? a.title(kitchenActions.flags, t) : undefined}
                  onClick={help.pick(a.key, () => { kitchenActions.run(a.key); close() })}
                >
                  <span className="ct" style={{ background: a.wash }}>
                    <Icon name={a.icon} size={22} color={a.iconColour} />
                  </span>
                  <span>{a.label(t)}</span>
                </button>
              ))}
            </div>
          </div>
        )}

        {/* The picked tile's form/panel. Wrapped so the mode-change effect can scroll
            it into view + focus it (the chooser above can push it below the fold).
            tabIndex -1 makes the wrapper programmatically focusable without being a
            tab stop; outline is suppressed in CSS — the scroll-into-view is the cue. */}
        <div ref={panelRef} tabIndex={-1} className="addsheet__panel">
        {/* When the capture box is hoisted to the top (board), it isn't repeated
            here; a chooser-less / kiosk-fallback sheet still shows it in-panel. */}
        {!captureAtTop && mode === 'capture' && captureForm}

        {mode === 'list-item' && (
          <form onSubmit={submitList}>
            <div className="sheet__field">
              <Icon name="sparkle-bold" size={20} color="var(--ink-faint)" />
              <input
                value={listText}
                onChange={(e) => setListText(e.target.value)}
                placeholder={listVoice.listening ? t.capture.listening : t.list.addPlaceholder}
                aria-label={t.list.addTitle}
              />
              <VoiceButton voice={listVoice} label={t.capture.voice} />
            </div>
            <button type="submit" className="btn btn--primary" disabled={!listText.trim() || busy}>
              <Icon name="plus-bold" size={20} />
              {t.common.add}
            </button>
          </form>
        )}

        {mode === 'todo' && (
          <div className="addsheet__todo">
            {/* Standing (default) vs just today — applies to BOTH the typed line and
                a checklist dropped in below. */}
            <div className="addsheet__scope" role="group" aria-label={t.todos.title}>
              <button
                type="button"
                className={'btn btn--sm' + (!todoToday ? ' btn--primary' : '')}
                aria-pressed={!todoToday}
                onClick={() => setTodoToday(false)}
              >
                {t.todos.scopeGlobal}
              </button>
              <button
                type="button"
                className={'btn btn--sm' + (todoToday ? ' btn--primary' : '')}
                aria-pressed={todoToday}
                onClick={() => setTodoToday(true)}
              >
                {t.todos.scopeToday}
              </button>
            </div>
            <EntityCombobox<TodoTemplate>
              value={todoText}
              onChange={setTodoText}
              options={todoTemplates.map((tpl): ComboOption<TodoTemplate> => ({
                id: tpl.id,
                label: tpl.title,
                data: tpl,
                icon: 'check-square-bold',
                group: t.todos.templatesLabel,
              }))}
              onSubmit={(v) => void submitTodo(v)}
              onPick={(opt) => {
                setTodoText('')
                void quickAddTemplate(opt.data.id)
              }}
              submitLabel={t.common.add}
              submitLeadingIcon="plus-bold"
              submitVariant="primary"
              placeholder={todoVoice.listening ? t.capture.listening : t.todos.addPlaceholder}
              ariaLabel={t.todos.title}
              voice={todoVoice}
              busy={busy}
            />
          </div>
        )}

        {/* « Laisse un mot » — pick a recipient face (or Maisonnée), then type or record a
            voice/drawing/photo memo for them. Its own composer (recipient + EditField +
            MemoControls); closes the sheet on send. */}
        {mode === 'mot' && <MotComposer onDone={close} />}

        {mode === 'pantry' && (
          <form onSubmit={submitPantry}>
            <div className="sheet__field">
              <Icon name="carrot-bold" size={20} color="var(--ink-faint)" />
              <input
                value={pantryText}
                onChange={(e) => setPantryText(e.target.value)}
                placeholder={pantryVoice.listening ? t.capture.listening : t.kitchen.lowAdd}
                aria-label={t.kitchen.lowAdd}
              />
              <VoiceButton voice={pantryVoice} label={t.capture.voice} />
            </div>
            <button type="submit" className="btn btn--primary" disabled={!pantryText.trim() || busy}>
              <Icon name="plus-bold" size={20} />
              {t.common.add}
            </button>
          </form>
        )}

        {mode === 'reserve' && (
          <form onSubmit={submitReserve}>
            <div className="sheet__field">
              <Icon name="cloud-snow-bold" size={20} color="var(--ink-faint)" />
              <input
                value={reserveText}
                onChange={(e) => setReserveText(e.target.value)}
                placeholder={reserveVoice.listening ? t.capture.listening : t.kitchen.reserveAdd}
                aria-label={t.kitchen.reserveAdd}
              />
              <VoiceButton voice={reserveVoice} label={t.capture.voice} />
            </div>
            {/* Where it's stashed — the same custom locations the Garde-manger tab uses. */}
            {reservePrefs.locations.length > 0 && (
              <select
                className="input"
                value={reserveSelLoc}
                onChange={(e) => setReserveLoc(e.target.value)}
                aria-label={t.kitchen.reserveWhere}
              >
                {reservePrefs.locations.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </select>
            )}
            <button type="submit" className="btn btn--primary" disabled={!reserveText.trim() || busy}>
              <Icon name="plus-bold" size={20} />
              {t.common.add}
            </button>
          </form>
        )}

        {mode === 'meal' && (
          <div className="addsheet__daypick">
            <p className="sheet__group-label mono">{t.kitchen.whichDay}</p>
            <div className="addsheet__days">
              {weekDays.map((d) => (
                <Chip key={d} onClick={() => planDay(d)}>
                  {formatRelativeWeekday(d, lang, t.board.today, t.board.tomorrow)}
                </Chip>
              ))}
            </div>
          </div>
        )}

        {/* « Corvées » sub-choice — the extra step (like « Planifier un repas »):
            a chore, recurring maintenance, or a home project. Each jumps to the
            matching full-screen form scene (the chore form, or the home-project
            form pre-set to its kind). One ＋ tile, three destinations. */}
        {mode === 'chores-pick' && (
          <div className="addsheet__chorepick">
            <p className="sheet__group-label mono">{t.operator.home.pickKind}</p>
            <div className="cat-grid cat-grid--3">
              {CHORE_KINDS.map((c) => (
                <button
                  key={c.key}
                  type="button"
                  className="cat-pick"
                  onClick={() => {
                    close()
                    nav(c.to)
                  }}
                >
                  <span className="ct" style={{ background: CATS.chore.wash }}>
                    <Icon name={c.icon} size={22} color={CATS.chore.deep} />
                  </span>
                  <span>
                    {c.key === 'chore'
                      ? t.operator.home.subCorvees
                      : c.key === 'upkeep'
                        ? t.operator.home.subEntretien
                        : t.operator.home.subProjets}
                  </span>
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'leftovers' && (
          // Type a free-text leftover OR pick one of today's planned meals ("we ate
          // this, there's some left") from the same box — the unified field shared
          // with the Restants pool and the day editor.
          <EntityCombobox
            value={leftoverText}
            onChange={setLeftoverText}
            options={leftoverMealOpts}
            onPick={(o) => postLeftover(o.data.title, o.data.recipe_id ?? null, o.data.id)}
            onSubmit={(v) => postLeftover(v)}
            submitLabel={t.kitchen.leftoversToPool}
            submitLeadingIcon="plus-bold"
            submitVariant="primary"
            voice={leftoverVoice}
            placeholder={leftoverVoice.listening ? t.capture.listening : t.kitchen.leftoversAdd}
            ariaLabel={t.kitchen.leftoversAdd}
            busy={busy}
          />
        )}

        {/* "Cuisiner" — pick which of today's planned meals to cook, not just the
            next one. Each row jumps straight into that recipe's cook mode. The
            meal the app would auto-pick (next due) is flagged "Prochain". Empty
            ⇒ nothing with a recipe planned today, so offer to plan one instead. */}
        {mode === 'cook' &&
          // Nothing to offer only when today has no cookable meal AND the week
          // can't form an ensemble (2+ distinct dishes) — otherwise show the picker.
          (cookChoices.length === 0 && cookDistinct.length < 2 ? (
            <div className="addsheet__cook-empty">
              <p className="sheet__group-label mono">{t.kitchen.cookNone}</p>
              <button type="button" className="btn" onClick={() => setMode('meal')}>
                <Icon name="calendar-blank-bold" size={18} />
                {t.kitchen.planMeal}
              </button>
            </div>
          ) : (
            <div className="addsheet__cook">
              <p className="sheet__group-label mono">
                {ensemblePick ? t.kitchen.cookTogetherPick : t.kitchen.cookWhich}
              </p>
              {/* #43 — 2+ distinct dishes today ⇒ offer to cook them at once. Tapping
                  it doesn't launch straight away: it opens an empty selection (every
                  dish a check row), then "Commencer" starts the coordinated cook with
                  the dishes you ticked. */}
              {!ensemblePick && cookDistinct.length >= 2 && (
                <div className="addsheet__cooklist">
                  <Act
                    cat="meal"
                    icon="cooking-pot-bold"
                    title={t.kitchen.cookTogether}
                    who={t.kitchen.cookTogetherN(cookDistinct.length)}
                    onActivate={() => setEnsemblePick(new Set())}
                  />
                </div>
              )}
              {/* Each choice is the app's shared Act row (board/Act) — colour spine,
                  the recipe's photo (or the slot glyph) in the tile, slot · recipe as
                  the sub-line, the next-due meal's "Prochain" badge. In ensemble mode
                  the same rows become CHECK rows (tap toggles the selection); the
                  pool collapses to distinct recipes so a dish never lists twice.
                  One row primitive, so this matches the board. */}
              <div className="addsheet__cooklist">
                {(ensemblePick ? cookDistinct : cookChoices).map((c) => {
                  const slot = c.meal.slot
                  // Cookable meals are always real slots, so the colour is a hex —
                  // safe to hand Act as its spine/tile colour (no CSS-var footgun).
                  const color = isMealSlot(slot) ? mealPrefs.color(slot) : undefined
                  const sameName = c.recipe.title.trim().toLowerCase() === c.meal.title.trim().toLowerCase()
                  // Who's assigned to cook this slot, if anyone — appended to the
                  // sub-line so the picker says who's at the stove, like the board.
                  const cookName = c.meal.cook_member_id
                    ? members.find((m) => m.id === c.meal.cook_member_id)?.display_name
                    : undefined
                  // The ensemble pool spans days, so prefix the weekday for any dish
                  // not planned today — the single picker is today-only, no prefix.
                  const dayLabel =
                    ensemblePick && weekStart && c.meal.date !== weekStart ? `${formatWeekday(c.meal.date, lang)} · ` : ''
                  const sub =
                    dayLabel +
                    (isMealSlot(slot) ? t.kitchen.slots[slot] : '') +
                    (sameName ? '' : ` · ${c.recipe.title}`) +
                    (cookName ? ` · ${cookName}` : '')
                  const picked = ensemblePick?.has(c.recipe.id) ?? false
                  return (
                    <Act
                      key={c.meal.id}
                      cat="meal"
                      color={color}
                      icon={isMealSlot(slot) ? SLOT_ICON_NAME[slot] : 'cooking-pot-bold'}
                      photo={recipeImg(c.recipe.image) || undefined}
                      title={c.meal.title}
                      who={sub}
                      badge={!ensemblePick && c.isNext ? t.kitchen.cookNext : undefined}
                      // Ensemble mode → a check row (toggle in/out of the selection);
                      // otherwise a nav row straight into that one dish's cook mode.
                      done={ensemblePick ? picked : undefined}
                      onCheck={
                        ensemblePick
                          ? () =>
                              setEnsemblePick((prev) => {
                                const next = new Set(prev)
                                if (next.has(c.recipe.id)) next.delete(c.recipe.id)
                                else next.add(c.recipe.id)
                                return next
                              })
                          : undefined
                      }
                      onActivate={
                        ensemblePick
                          ? undefined
                          : () => {
                              close()
                              nav(c.target)
                            }
                      }
                    />
                  )
                })}
              </div>
              {/* Ensemble actions: cancel back to the single picker, or start the
                  coordinated cook with the ticked dishes (needs 2+). */}
              {ensemblePick && (
                <div className="addsheet__cook-actions">
                  <button type="button" className="btn btn--ghost" onClick={() => setEnsemblePick(null)}>
                    {t.common.cancel}
                  </button>
                  <button
                    type="button"
                    className="btn btn--primary"
                    disabled={ensemblePick.size < 2}
                    onClick={() => {
                      const ids = [...ensemblePick]
                      close()
                      nav(`/kitchen/cook/multi?r=${ids.join(',')}`)
                    }}
                  >
                    <Icon name="cooking-pot-bold" size={18} />
                    {t.kitchen.cookTogetherStart(ensemblePick.size)}
                  </button>
                </div>
              )}
            </div>
          ))}

        {/* Routines ＋ (the /routines tab): build a new routine OR edit an existing
            one. Both open the full-screen builder scene (its tall form strands
            inputs under a sheet's keyboard) — "new" at /routine/new, an edit at
            /routine/<id>. Listing the routines here is the "modify existing" ask:
            you pick the one to change instead of hunting it down in Réglages. */}
        {mode === 'routine-pick' && (
          <div className="addsheet__cook">
            <button
              type="button"
              className="btn btn--primary"
              onClick={() => {
                close()
                nav('/routine/new')
              }}
            >
              <Icon name="plus-bold" size={20} />
              {t.routines.newRoutine}
            </button>
            {routinePick.length > 0 && (
              <>
                <p className="sheet__group-label mono">{t.routines.editExisting}</p>
                <div className="addsheet__cooklist">
                  {routinePick.map((r) => (
                    <Act
                      key={r.id}
                      cat="routine"
                      color={r.color ?? undefined}
                      icon={CATS.routine.icon}
                      photo={r.avatarPhoto ? imgUrl(r.avatarPhoto) : undefined}
                      title={r.name}
                      who={[r.memberName, t.routines.stepsN(r.cards?.length ?? 0)]
                        .filter(Boolean)
                        .join(' · ')}
                      onActivate={() => {
                        close()
                        nav(`/routine/${r.id}`)
                      }}
                    />
                  ))}
                </div>
              </>
            )}
          </div>
        )}
        </div>
    </Sheet>
  )
}
