import { useCallback, useEffect, useMemo, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { useAi } from '../lib/ai'
import { useWrite } from '../lib/write'
import { useAuth } from '../lib/auth'
import { todayLocalDay, addLocalDays, localDayStart } from '../lib/localDay'
import { useReserveLocations } from '../lib/reservePrefs'
import { useVoiceInput } from '../lib/useVoiceInput'
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
import { stageDeal, parseTerms, cashierPicksFrom, useTillHiddenStores, type ListItem } from '../lib/picks'
import { type Deal } from '../lib/deals'
import { MEALS_KEY, PANTRY_KEY, LEFTOVERS_KEY, RESERVE_KEY, type MealsData } from './kitchen/types'
import { Icon, type IconName } from './Icon'
import { useMemoAttach } from './MemoAttach'
import { EditField } from './EditField'
import { MotComposer } from './mots/MotComposer'
import { EntityCombobox } from './EntityCombobox'
import { templateOptions } from './todos/comboOptions'
import { Chip } from './Chip'
import { mealOptions } from './kitchen/comboOptions'
import { ADD_HELP } from '../lib/addHelp'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { Sheet } from './Sheet'
import { Cluster } from './Layout'
import { scrollBehavior } from '../lib/motion'

// Pip's "Add" bottom-sheet — CONTEXTUAL now. HubLayout hands in the current
// section's modes (lib/addSheet SECTION_MODES): the board keeps the quick-note
// chooser, the kitchen offers recette/repas/garde-manger, Routines and Liste
// skip the chooser entirely and open their one form. The operator forms
// (event/chore/routine) are the SAME components Réglages uses.
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
const MODE_DRESS: Record<AddSheetMode, { cat: CatKey; icon: IconName }> = {
  note: { cat: 'routine', icon: 'pencil-simple-bold' },
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
  'family-import': { cat: 'cercle', icon: 'download-simple-bold' },
  // « Voyage » — start a trip notebook (navigate-only to /voyage/new).
  voyage: { cat: 'event', icon: 'map-pin-bold' },
  // « Laisse un mot » — a little letter for a household face (the rose 'cercle' family
  // reads as "a personal message"); opens an in-sheet composer.
  mot: { cat: 'cercle', icon: 'envelope-bold' },
  // « Mes habitudes » — a rhythm you keep (the repeat glyph); navigate-only to the
  // habit form (kind + cadence + reminder times don't fit an in-sheet composer).
  habit: { cat: 'chore', icon: 'repeat-bold' },
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
  'family-import': '/cercle/import',
  ...FORM_ROUTES,
}

// IA: a chooser tile either opens a field RIGHT HERE (event? no — todo, a memo, a
// pantry line) or LEAVES the sheet for a full-screen route. The two look identical
// as bare tiles, so a navigating tile earns a trailing chevron. "Navigates" = it's
// in NAV_TARGET, OR it's one of the two day-planner shortcuts (they resolve their
// /kitchen/day/<date> target at click time, not through the static table — see the
// chooser onClick). In-sheet forms (todo/mot/pantry/reserve/meal/leftovers/cook and
// the chores-pick sub-choice) deliberately get NO chevron.
const navigatesAway = (m: AddSheetMode) => !!NAV_TARGET[m] || m === 'plan-today' || m === 'plan-tomorrow'

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
//
// C-14 shrank this from 5 tiles to 2: « Magasiner » stays a distinct action (it
// writes straight to the list, no chooser needed); AI ideas / book ideas / use-it-
// up / vide-frigo folded into ONE « Idées » tile that opens the IdeasDrawer, whose
// own source chips (⭐🧊🤖👧) replace what used to be four separate sheet tiles.
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
  { key: 'ideas', icon: 'bowl-food-bold', iconColour: '#D9842A', wash: 'var(--marigold-wash)', label: (t) => t.kitchen.ideas, show: () => true },
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
  const nav = useNavigate()
  const { signedIn } = useAuth()
  // AI on/off (binding present AND household hasn't switched it off). When off, the
  // "AI ideas" tile is hidden outright — capture still works (it degrades to a note).
  const { enabled: aiEnabled } = useAi()
  // The kitchen week's actions (shop the week / AI ideas / ideas from the book /
  // use-up / vide-frigo), registered by the Kitchen page. They show as icon tiles
  // here on any parent kitchen sub-tab; tapping one closes the sheet, jumps to the
  // Repas tab and runs the flow, whose result lands on the week grid behind us.
  const kitchenActions = useKitchenActions()

  // Per-action gating, same semantics the old signedIn-only chooser had: the
  // operator forms drop off for an unsigned kiosk; if nothing survives (a kiosk
  // on /routines), fall back to quick capture — the AI router still sorts it.
  const allowed = signedIn ? modes : modes.filter((m) => !OPERATOR_MODES.has(m))
  const shown = allowed.length ? allowed : (['note'] as AddSheetMode[])
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
      // Scroll ONLY within the bottom sheet, never the page behind it. A plain
      // `scrollIntoView` walks every scroll ancestor including the document — on a
      // tall desktop board that smooth-scrolls the whole page when the sheet opens
      // (the "laggy scroll up"). Scope to the `.sheet` and only move when the panel
      // is actually clipped out of its view (the -12 matches its scroll-margin).
      const sheet = panel.closest('.sheet') as HTMLElement | null
      if (sheet) {
        const p = panel.getBoundingClientRect()
        const s = sheet.getBoundingClientRect()
        if (p.top < s.top || p.bottom > s.bottom) {
          sheet.scrollTo({ top: sheet.scrollTop + (p.top - s.top) - 12, behavior: scrollBehavior() })
        }
      }
      panel.focus({ preventScroll: true })
    })
    return () => cancelAnimationFrame(id)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode, open])

  const [busy, setBusy] = useState(false)

  // — « Note rapide » (board) — a plain fridge note: a line and/or ONE clipped memo.
  // No AI here any more; the router moved to the header mic (AskSheet ▸ Classer).
  const [text, setText] = useState('')
  const noteVoice = useVoiceInput(setText)
  const noteMemo = useMemoAttach({ drawDraftId: 'memo' })

  // — list item (Liste) — its own state + mic so a board draft never posts to
  // the grocery list by accident.
  const [listText, setListText] = useState('')
  const listVoice = useVoiceInput(setListText)

  // — todo (board) — a quick "À compléter" item. Standing by default (`global`, day
  // null); "Aujourd'hui" pins it to today, "Une date" to any chosen calendar day. Its
  // own state + mic so a board draft never lands as a todo by accident.
  const [todoText, setTodoText] = useState('')
  const todoVoice = useVoiceInput(setTodoText)
  const [todoScope, setTodoScope] = useState<'global' | 'today' | 'date'>('global')
  // The chosen day for the "Une date" scope, as a native <input type="date"> string
  // (local YYYY-MM-DD); '' until a date is picked (submit stays disabled meanwhile).
  const [todoDate, setTodoDate] = useState('')
  // Resolve the scope to the `day` value the API stores (local-midnight unix s, or
  // null for a standing global). "Une date" parses the picker string at local noon
  // then snaps to household-tz midnight (DST-safe, same as the meal/month grids); an
  // unset/invalid date falls back to null so a half-filled form never mis-files a day.
  const todoDaySec = (): number | null => {
    if (todoScope === 'today') return todayLocalDay()
    if (todoScope === 'date') {
      const [y, m, d] = todoDate.split('-').map(Number)
      if (!y || !m || !d) return null
      return localDayStart(new Date(y, m - 1, d, 12))
    }
    return null
  }
  // The picker's floor: no back-dating a todo to a day already gone.
  const todoDateMin = (() => {
    const now = new Date()
    const p = (n: number) => String(n).padStart(2, '0')
    return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`
  })()
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
    () => mealOptions((mealsData?.days ?? []).filter((d) => d.date === weekStart && !d.is_leftover), t),
    [mealsData, weekStart, t],
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
  // Till-hidden stores: auto-pick still stages their deals (they ride the list
  // line), but they don't count as a reason to open the cashier stepper.
  const tillHidden = useTillHiddenStores()
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
  // frequency intent — write a quick note — is reachable WITHOUT first tapping its
  // tile (3 taps → 2). The calm blank-slate chooser is preserved: no override form is
  // pre-selected, the other tiles stay below as explicit overrides, and the now-
  // redundant note tile drops out of the grid. A single-mode or kiosk-fallback
  // sheet (tiles.length === 1) keeps the note form in its panel exactly as before.
  const noteAtTop = tiles.length > 1 && tiles.includes('note')
  // Every action a section offers shows at once in ONE responsive grid — no "Plus…"
  // expand/collapse to hunt through (Marc's ask). The `.cat-grid` reflows to fit
  // however many tiles a section carries (auto-fill), so 2 or 9 both look even.
  const gridTiles = noteAtTop ? tiles.filter((m) => m !== 'note') : tiles

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
          if (!tillHidden.has(r.deals[0].merchant.trim().toLowerCase())) any = true
        }
      } catch {
        /* skip items with no deals / errors */
      }
    }
    const hadPicks = cashierPicksFrom(listItems, tillHidden).length > 0
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
    setEnsemblePick(null) // leave the ensemble picker so it reopens fresh next time
    onClose()
  }, [onClose])


  // « Note rapide » — ONE write carrying the text AND any clipped memo, since
  // /api/notes takes both on a row (`if (!text && !(kind && mediaKey))`). A memo with
  // no words is a valid note (a drawing for a pre-reader), hence EditField's
  // `allowEmpty`; a note with neither is not, and the server says so too.
  async function submitNote(v: string) {
    const value = v.trim()
    if ((!value && !noteMemo.draft) || busy) return
    setBusy(true)
    try {
      await write('notes', { method: 'POST', body: { text: value, ...noteMemo.body }, affectedKeys: [BOARD_KEY] })
      setText('')
      noteMemo.reset()
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
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

  // Add an "À compléter" todo (board ＋). Standing (day null), pinned to today, or to
  // a chosen date — see todoDaySec(). Offline-safe write; the board glance + any open
  // todo view refetch via TODOS_KEY (prefix-matches day-scoped reads), and MONTH_KEY
  // so a dated add shows on the calendar/day page. (Not BOARD_KEY: the board payload's
  // `todos` slice is the loose-chore "À faire", not these.)
  async function submitTodo(text?: string) {
    const value = (text ?? todoText).trim()
    if (!value || busy) return
    // "Une date" with no date picked yet — nothing to file against.
    if (todoScope === 'date' && todoDaySec() == null) return
    setBusy(true)
    try {
      await write('todos', {
        method: 'POST',
        body: { title: value, day: todoDaySec() },
        affectedKeys: [TODOS_KEY, MONTH_KEY],
      })
      setTodoText('')
      setTodoScope('global')
      setTodoDate('')
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Instantiate a whole checklist from the quick-add sheet — a composed list lands
  // as one sectioned batch (see functions/api/todos.ts). Honours the today/date
  // scopes; « En tout temps » does NOT exist for a checklist (the mig-0116 split:
  // an instance is always day-pinned, the server would coerce null→today anyway),
  // so the global scope explicitly falls back to today — and the hint line above
  // the picker says so rather than letting the scope toggle silently lie.
  async function quickAddTemplate(templateId: string) {
    if (busy) return
    if (todoScope === 'date' && todoDaySec() == null) return
    setBusy(true)
    try {
      await write('todos', {
        method: 'POST',
        body: { templateId, day: todoDaySec() ?? todayLocalDay() },
        affectedKeys: [TODOS_KEY, MONTH_KEY],
      })
      setTodoScope('global')
      setTodoDate('')
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
      note: t.capture.quick,
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
      // The tile names its destination section ("Ce qui s'achève" / "Running low")
      // so it reads as "flag something that's running low", not a vague "add a food".
      // The in-sheet input keeps the action-phrased `lowAdd` placeholder.
      pantry: t.kitchen.low,
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
      'family-import': t.familyShare.importTitle,
      voyage: t.voyage.captureTile,
      mot: t.mots.tile,
      habit: t.habits.add,
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
      ? shown.includes('note')
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

  // « Note rapide ». Rendered EITHER at the top of the board chooser (noteAtTop — the
  // fast path) OR, for a chooser-less / kiosk-fallback sheet, in the picked-mode panel
  // below. One definition, two placements (no duplicate form).
  //
  // The memo controls used to sit BESIDE this field as three full-width buttons that
  // discarded whatever you'd typed. They're now the field's own 📎: one note, text and
  // attachment together.
  const noteForm = (
    <EditField
      value={text}
      onChange={setText}
      onSubmit={submitNote}
      submitLabel={t.common.add}
      submitLeadingIcon="plus-bold"
      submitVariant="primary"
      leadingIcon="pencil-simple-bold"
      voice={noteVoice}
      voiceLabel={t.capture.voice}
      placeholder={noteVoice.listening ? t.capture.listening : t.notes.addPlaceholder}
      ariaLabel={t.capture.quick}
      busy={busy || noteMemo.busy}
      allowEmpty={!!noteMemo.draft}
      boxActions={noteMemo.attachButton}
    >
      {noteMemo.panel}
    </EditField>
  )

  // One chooser tile — reused by the primary grid AND the "Plus…" overflow
  // disclosure so the two placements can't drift. A navigating tile (navigatesAway)
  // carries a trailing chevron; an in-sheet-form tile does not.
  const renderTile = (m: AddSheetMode) => (
    <button
      key={m}
      type="button"
      className={'cat-pick' + (mode === m ? ' sel' : '')}
      data-mode={m}
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
      {/* Trailing "leaves the sheet" cue — decorative, so aria-hidden + no tap. */}
      {navigatesAway(m) && (
        <span className="cat-pick__nav" aria-hidden="true">
          <Icon name="arrow-up-right-bold" size={13} color="var(--ink-faint)" />
        </span>
      )}
    </button>
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

        {/* Fast path: the note box rides ABOVE the chooser on the board, so a quick
            note is one write-and-Add away (its tile is dropped from the grid below). */}
        {noteAtTop && <div className="addsheet__lead" data-tour="add-note">{noteForm}</div>}

        {/* The section's chooser — ONE grid with every action the section offers,
            shown at once (no "Plus…" overflow). The recipe tile is navigate-only:
            the recipe builder is a full overlay that lives on the kitchen page, not
            in this sheet. Liste's auto-pick tile drops out when the list is empty
            (nothing to price). On the board the note tile is hoisted out
            (noteAtTop) — the rest stay here as explicit overrides. The grid
            reflows (auto-fill) so any tile count stays even. */}
        {tiles.length > 1 && gridTiles.length > 0 && (
          <div className="cat-grid" data-tour="add-tiles">{gridTiles.map(renderTile)}</div>
        )}

        {/* The kitchen week's actions (shop the week / AI ideas / book ideas /
            use-up / vide-frigo) — offered on every parent kitchen sub-tab now.
            Firing one jumps to Repas (where its result renders) behind the sheet. */}
        {!noKitchenActions(kitchenActions.flags) && (
          <div className="sheet__group" data-tour="add-week">
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
        {/* When the note box is hoisted to the top (board), it isn't repeated
            here; a chooser-less / kiosk-fallback sheet still shows it in-panel. */}
        {!noteAtTop && mode === 'note' && noteForm}

        {mode === 'list-item' && (
          <EditField
            value={listText}
            onChange={setListText}
            onSubmit={() => void submitList()}
            submitLabel={t.common.add}
            submitLeadingIcon="plus-bold"
            submitVariant="primary"
            leadingIcon="sparkle-bold"
            voice={listVoice}
            voiceLabel={t.capture.voice}
            placeholder={listVoice.listening ? t.capture.listening : t.list.addPlaceholder}
            ariaLabel={t.list.addTitle}
            busy={busy}
          />
        )}

        {mode === 'todo' && (
          <div className="addsheet__todo">
            {/* Standing (default) vs today vs a chosen date. The scope applies fully to
                the TYPED line; a CHECKLIST picked below is always day-pinned (mig 0116 —
                no « global avant de partir » exists), so under « En tout temps » it lands
                on today instead — the hint under the field says so. */}
            <Cluster fill className="addsheet__scope" role="group" aria-label={t.todos.title}>
              <button
                type="button"
                className={'btn btn--sm' + (todoScope === 'global' ? ' btn--primary' : '')}
                aria-pressed={todoScope === 'global'}
                onClick={() => setTodoScope('global')}
              >
                {t.todos.scopeGlobal}
              </button>
              <button
                type="button"
                className={'btn btn--sm' + (todoScope === 'today' ? ' btn--primary' : '')}
                aria-pressed={todoScope === 'today'}
                onClick={() => setTodoScope('today')}
              >
                {t.todos.scopeToday}
              </button>
              <button
                type="button"
                className={'btn btn--sm' + (todoScope === 'date' ? ' btn--primary' : '')}
                aria-pressed={todoScope === 'date'}
                onClick={() => {
                  // Seed the picker to today so the input is never blank/invalid.
                  if (!todoDate) setTodoDate(todoDateMin)
                  setTodoScope('date')
                }}
              >
                {t.todos.scopeDate}
              </button>
            </Cluster>
            {todoScope === 'date' && (
              <input
                className="input addsheet__scope-date"
                type="date"
                value={todoDate}
                min={todoDateMin}
                onChange={(e) => setTodoDate(e.target.value)}
                aria-label={t.todos.scopeDate}
              />
            )}
            <EntityCombobox<TodoTemplate>
              value={todoText}
              onChange={setTodoText}
              options={templateOptions(todoTemplates, t)}
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
            {/* A checklist is a DEPARTURE thing: always for one day. Under the global
                scope the pick lands on today — say it, don't let the toggle lie. */}
            {todoScope === 'global' && <p className="addsheet__todo-hint mono">{t.todos.templateDayHint}</p>}
          </div>
        )}

        {/* « Laisse un mot » — pick a recipient face (or Maisonnée), then write them a
            line and/or clip a voice/drawing/photo memo onto it. Its own composer
            (recipient + EditField + useMemoAttach); closes the sheet on send. */}
        {mode === 'mot' && <MotComposer onDone={close} />}

        {mode === 'pantry' && (
          <EditField
            value={pantryText}
            onChange={setPantryText}
            onSubmit={() => void submitPantry()}
            submitLabel={t.common.add}
            submitLeadingIcon="plus-bold"
            submitVariant="primary"
            leadingIcon="carrot-bold"
            voice={pantryVoice}
            voiceLabel={t.capture.voice}
            placeholder={pantryVoice.listening ? t.capture.listening : t.kitchen.lowAdd}
            ariaLabel={t.kitchen.lowAdd}
            busy={busy}
          />
        )}

        {mode === 'reserve' && (
          <>
            {/* Where it's stashed — the same custom locations the Garde-manger tab uses.
                Above the field: you pick the shelf, then say what goes on it. */}
            {reservePrefs.locations.length > 0 && (
              <select
                className="input addsheet__reserve-loc"
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
            <EditField
              value={reserveText}
              onChange={setReserveText}
              onSubmit={() => void submitReserve()}
              submitLabel={t.common.add}
              submitLeadingIcon="plus-bold"
              submitVariant="primary"
              leadingIcon="cloud-snow-bold"
              voice={reserveVoice}
              voiceLabel={t.capture.voice}
              placeholder={reserveVoice.listening ? t.capture.listening : t.kitchen.reserveAdd}
              ariaLabel={t.kitchen.reserveAdd}
              busy={busy}
            />
          </>
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
              <button type="button" className="btn btn--block" onClick={() => setMode('meal')}>
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
          <div className="addsheet__cook" data-tour="add-routines">
            <button
              type="button"
              className="btn btn--primary btn--block"
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
