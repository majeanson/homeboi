import { useCallback, useEffect, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api, ApiError } from '../lib/api'
import { useAuth } from '../lib/auth'
import { useVoiceInput } from '../lib/useVoiceInput'
import { VoiceButton } from './VoiceButton'
import { formatWeekday } from '../lib/format'
import { OPERATOR_MODES, type AddSheetMode } from '../lib/addSheet'
import { CATS, type CatKey } from '../lib/cats'
import { Act } from './board/Act'
import { useCookableMeals } from '../lib/nextMeal'
import { recipeImg } from '../lib/recipes'
import { useMealPrefs } from '../lib/mealPrefs'
import { SLOT_ICON_NAME, isMealSlot } from '../lib/mealSlots'
import { useKitchenActions, noKitchenActions } from '../lib/kitchenActions'
import { BOARD_KEY } from '../lib/queryKeys'
import { stageDeal, parseTerms, pickListFrom, type ListItem } from '../lib/picks'
import { type Deal } from '../lib/deals'
import { MEALS_KEY, PANTRY_KEY, LEFTOVERS_KEY, type MealsData } from './kitchen/types'
import { Icon, type IconName } from './Icon'
import { EventForm } from './forms/EventForm'
import { ChoreForm } from './forms/ChoreForm'
import { RoutineForm } from './forms/RoutineForm'
import { useModal } from '../lib/useModal'
import { useSwipeToDismiss } from '../lib/useSwipeToDismiss'

// Pip's "Add" bottom-sheet — CONTEXTUAL now. HubLayout hands in the current
// section's modes (lib/addSheet SECTION_MODES): the board keeps the quick-note
// chooser, the kitchen offers recette/repas/garde-manger, Routines and Liste
// skip the chooser entirely and open their one form. The operator forms
// (event/chore/routine) are the SAME components Réglages uses.
type CaptureType = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'leftover' | 'note'
interface FormMember { id: string; display_name: string; is_child: number }

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
  { type: 'note', cat: 'routine', icon: 'pencil-simple-bold' },
]

const MODE_DRESS: Record<AddSheetMode, { cat: CatKey; icon: IconName }> = {
  capture: { cat: 'list', icon: 'sparkle-bold' },
  event: { cat: 'event', icon: 'calendar-blank-bold' },
  chore: { cat: 'chore', icon: 'hand-heart-bold' },
  routine: { cat: 'routine', icon: 'pencil-simple-bold' },
  cook: { cat: 'meal', icon: 'cooking-pot-bold' },
  recipe: { cat: 'meal', icon: 'book-open-bold' },
  meal: { cat: 'list', icon: 'calendar-blank-bold' },
  leftovers: { cat: 'meal', icon: 'arrow-counter-clockwise-bold' },
  pantry: { cat: 'chore', icon: 'carrot-bold' },
  'list-item': { cat: 'event', icon: 'sparkle-bold' },
  'quick-add': { cat: 'list', icon: 'lightning-bold' },
  flyer: { cat: 'meal', icon: 'magnifying-glass-bold' },
  'auto-pick': { cat: 'chore', icon: 'tag-bold' },
}

// Modes with no in-sheet form — picking one leaves the sheet for a full-screen
// route (the recipe builder, the quick-add restock page, the flyer browser).
// They never become the sheet's default (defMode skips them).
const NAV_TARGET: Partial<Record<AddSheetMode, string>> = {
  recipe: '/kitchen/recipe/new',
  'quick-add': '/liste/quick',
  flyer: '/liste/circulaires',
}

// Modes that must never be the sheet's pre-selected default: they have no plain
// in-sheet "add a thing" form. `cook` opens its own in-sheet meal picker, and
// `auto-pick` runs an action in place (stage best deals → cashier) — both
// resolved at click time, plus the static nav targets above. The kitchen should
// open on its meal planner, not on the cook picker, so cook stays out of defMode.
const isNonDefault = (m: AddSheetMode) => m === 'cook' || m === 'auto-pick' || m in NAV_TARGET

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
  const nav = useNavigate()
  const { signedIn } = useAuth()
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
  // Section default: capture where it exists (the board), else the first
  // form-backed tile — navigate-only modes (recipe, quick-add, flyer) leave the
  // sheet, so the kitchen pre-selects the meal planner and Liste the add-a-line
  // form under their choosers.
  const defMode = shown.includes('capture') ? 'capture' : (shown.find((m) => !isNonDefault(m)) ?? shown[0])
  const [mode, setMode] = useState<AddSheetMode>(initialMode ?? defMode)
  // Re-sync on each open so the last visit's pick doesn't leak into this one.
  useEffect(() => {
    if (open) setMode(initialMode ?? defMode)
  }, [open, initialMode, defMode])

  const [busy, setBusy] = useState(false)

  // — quick capture (board) —
  const [text, setText] = useState('')
  const captureVoice = useVoiceInput(setText)
  const [routed, setRouted] = useState<{ label: string; degraded: boolean } | null>(null)

  // — list item (Liste) — its own state + mic so a board draft never posts to
  // the grocery list by accident.
  const [listText, setListText] = useState('')
  const listVoice = useVoiceInput(setListText)

  // — pantry (kitchen) — speak-to-fill, same single-shot mic as capture (the
  // sheet adds one then closes; the page's PantryTab is where you rattle off many).
  const [pantryText, setPantryText] = useState('')
  const pantryVoice = useVoiceInput(setPantryText)

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
  const mealPrefs = useMealPrefs()
  const weekStart = mealsData?.weekStart ?? 0
  // Same 10-day countdown window the Kitchen grid renders (shrinks 10 → 4 across
  // the week, re-anchored each Tuesday — see functions/api/meals.ts).
  const weekDays = weekStart
    ? Array.from({ length: mealsData?.windowDays ?? 10 }, (_, i) => weekStart + i * 86400)
    : []

  const { data: membersData } = useQuery({
    queryKey: ['members'],
    queryFn: () => api<{ members: FormMember[] }>('members'),
    enabled: signedIn && open,
  })
  const members = membersData?.members ?? []

  // Liste's "Meilleurs prix" tile (auto-pick): stages the best flyer deal onto
  // each grocery line, then jumps to the cashier. Needs the current list, fetched
  // only while the sheet's open on Liste. An empty list ⇒ nothing to price-match,
  // so the tile hides (see `tiles` below). Replaces the old on-page button — the
  // list page is now just the list; its shopping actions live behind the ＋.
  const wantsAutoPick = shown.includes('auto-pick')
  const { data: listBoard } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ list: ListItem[] }>('board'),
    enabled: open && wantsAutoPick,
  })
  const listItems = listBoard?.list ?? []
  const [autoBusy, setAutoBusy] = useState(false)
  // The tiles actually rendered: auto-pick only earns a spot once there's a list
  // to price-match against (an empty Liste shows just add/quick-add/flyer).
  const tiles = shown.filter((m) => m !== 'auto-pick' || listItems.length > 0)

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

  const close = useCallback(() => {
    setRouted(null)
    onClose()
  }, [onClose])

  // Esc / scroll-lock / focus-trap, plus drag-the-grab-handle-down to dismiss.
  // Gated on `open` so the always-mounted sheet does nothing while tucked away.
  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(sheetRef, close, { open })
  useSwipeToDismiss(sheetRef, close, { open })
  const savedWith = (keys: string[][]) => () => {
    for (const k of keys) qc.invalidateQueries({ queryKey: k })
    close()
  }

  // Quick capture. forceType (from the degraded fallback) skips the AI router.
  async function submit(e?: React.FormEvent, forceType?: CaptureType) {
    e?.preventDefault()
    const value = text.trim()
    if (!value || busy) return
    setBusy(true)
    setRouted(null)
    try {
      const res = await api<{ type: string; degraded: boolean; routed: { kind: string; label: string } }>('capture', {
        method: 'POST',
        body: { text: value, forceType },
      })
      const degraded = res.degraded && !forceType
      setRouted({ label: res.routed?.label ?? value, degraded })
      if (!degraded) setText('')
      for (const key of [['board'], ['meals'], ['pantry'], ['leftovers']]) qc.invalidateQueries({ queryKey: key })
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
      await api('list', { method: 'POST', body: { text: value } })
      setListText('')
      for (const key of [BOARD_KEY, ['ghosts'], ['list-history']]) qc.invalidateQueries({ queryKey: key })
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
      await api('pantry', { method: 'POST', body: { item: value } })
      setPantryText('')
      qc.invalidateQueries({ queryKey: PANTRY_KEY })
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
      await api('meal-leftovers', { method: 'POST', body: { title: value, recipeId, sourceMealId } })
      setLeftoverText('')
      qc.invalidateQueries({ queryKey: LEFTOVERS_KEY })
      close()
    } catch (e) {
      if (!(e instanceof ApiError)) throw e
    } finally {
      setBusy(false)
    }
  }

  // Open a day's full "Gérer" sheet from the picker: close this sheet and hand the
  // chosen day to the Kitchen page via ?manage=<date>, which it consumes to open
  // the DayManageSheet. One editor, no duplicate mini-form.
  const planDay = (d: number) => {
    close()
    nav(`/kitchen?manage=${d}`)
  }

  const modeLabel = (m: AddSheetMode) => {
    const labels: Record<AddSheetMode, string> = {
      capture: t.capture.quick,
      event: t.capture.types.event,
      chore: t.operator.chores,
      cook: t.kitchen.cook,
      routine: t.nav.routines,
      recipe: t.recipes.add,
      meal: t.kitchen.planMeal,
      leftovers: t.kitchen.leftovers,
      pantry: t.kitchen.lowAdd,
      'list-item': t.list.addTitle,
      'quick-add': t.list.quickAdd,
      flyer: t.shop.browse,
      'auto-pick': t.shop.auto,
    }
    return labels[m]
  }

  // The sheet's title names what this section adds (the chooser-less sections
  // would otherwise just say "Ajouter" over an unexplained form).
  const title =
    shown.length > 1
      ? shown.includes('capture')
        ? t.capture.add
        : shown.includes('list-item')
          ? t.list.addTitle
          : t.kitchen.addTitle
      : mode === 'routine'
        ? t.routines.add
        : mode === 'list-item'
          ? t.list.addTitle
          : t.capture.add

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={close} aria-hidden="true" />
      <div ref={sheetRef} className={'sheet' + (open ? ' show' : '')} role="dialog" aria-modal="true" aria-label={title}>
        {/* A real, always-reachable way out — the grab handle only hints at the
            drag-down gesture (touch-only, undiscoverable). This ✕ is sticky so a
            tall form (event/chore/routine) can't scroll it off-screen. */}
        <button type="button" className="sheet__close" onClick={close} aria-label={t.common.close}>
          <Icon name="x-bold" size={18} />
        </button>
        <div className="grab" aria-hidden="true" />
        <h3>{title}</h3>

        {/* The section's chooser — only when there's a real choice to make.
            The recipe tile is navigate-only: the recipe builder is a full
            overlay that lives on the kitchen page, not in this sheet. Liste's
            auto-pick tile drops out when the list is empty (nothing to price). */}
        {tiles.length > 1 && (
          <div className={'cat-grid' + (tiles.length === 3 ? ' cat-grid--3' : '')}>
            {tiles.map((m) => (
              <button
                key={m}
                type="button"
                className={'cat-pick' + (mode === m ? ' sel' : '')}
                disabled={m === 'auto-pick' && autoBusy}
                onClick={() => {
                  if (m === 'auto-pick') {
                    autoPick()
                    return
                  }
                  const target = NAV_TARGET[m]
                  if (target) {
                    close()
                    nav(target)
                    return
                  }
                  setMode(m)
                }}
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
              {kitchenActions.flags.canShop && (
                <button
                  type="button"
                  className="cat-pick"
                  onClick={() => {
                    kitchenActions.run('shop')
                    close()
                  }}
                >
                  <span className="ct" style={{ background: 'var(--sage-wash)' }}>
                    <Icon name="shopping-bag-bold" size={22} color="#6B8A52" />
                  </span>
                  <span>{t.kitchen.shopWeek}</span>
                </button>
              )}
              <button
                type="button"
                className="cat-pick"
                disabled={!kitchenActions.flags.canAiSuggest || kitchenActions.flags.aiBusy}
                title={kitchenActions.flags.canAiSuggest ? undefined : t.kitchen.suggestAiOff}
                onClick={() => {
                  kitchenActions.run('ai')
                  close()
                }}
              >
                <span className="ct" style={{ background: 'var(--marigold-wash)' }}>
                  <Icon name="sparkle-bold" size={22} color="#D9842A" />
                </span>
                <span>{t.kitchen.aiIdeas}</span>
              </button>
              {kitchenActions.flags.hasRecipes && (
                <button
                  type="button"
                  className="cat-pick"
                  onClick={() => {
                    kitchenActions.run('book')
                    close()
                  }}
                >
                  <span className="ct" style={{ background: 'var(--terracotta-wash)' }}>
                    <Icon name="book-open-bold" size={22} color="#C2563A" />
                  </span>
                  <span>{t.kitchen.bookIdeas}</span>
                </button>
              )}
              {/* "Use it up" — a recipe that finishes what you flagged à utiliser
                  bientôt. Only earns a tile when ≥1 recipe actually uses a soon item. */}
              {kitchenActions.flags.canUseUp && (
                <button
                  type="button"
                  className="cat-pick"
                  onClick={() => {
                    kitchenActions.run('useup')
                    close()
                  }}
                >
                  <span className="ct" style={{ background: 'var(--sage-wash)' }}>
                    <Icon name="carrot-bold" size={22} color="#6B8A52" />
                  </span>
                  <span>{t.kitchen.useUpIdeas}</span>
                </button>
              )}
            </div>
          </div>
        )}

        {mode === 'capture' && (
          <form onSubmit={submit}>
            <div className="sheet__field">
              <Icon name="pencil-simple-bold" size={20} color="var(--ink-faint)" />
              <input
                value={text}
                onChange={(e) => setText(e.target.value)}
                placeholder={captureVoice.listening ? t.capture.listening : t.capture.placeholder}
                aria-label={t.capture.add}
              />
              <VoiceButton voice={captureVoice} label={t.capture.voice} />
            </div>

            {/* Fallback only: AI off → let the human re-route the saved note. */}
            {routed?.degraded && (
              <div className="cat-grid">
                {TYPE_DRESS.map((ty) => (
                  <button
                    key={ty.type}
                    type="button"
                    className="cat-pick"
                    onClick={() => submit(undefined, ty.type)}
                  >
                    <span className="ct" style={{ background: CATS[ty.cat].wash }}>
                      <Icon name={ty.icon} size={22} color={CATS[ty.cat].deep} />
                    </span>
                    <span>{t.capture.types[ty.type]}</span>
                  </button>
                ))}
              </div>
            )}

            {routed && (
              <p className="capture__routed mono">
                {routed.degraded ? t.capture.degraded : `${t.capture.routed} ${routed.label}`}
              </p>
            )}

            <button type="submit" className="btn btn--primary" disabled={!text.trim() || busy}>
              <Icon name="plus-bold" size={20} />
              {t.capture.add}
            </button>
          </form>
        )}

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
              {t.capture.add}
            </button>
          </form>
        )}

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
              {t.capture.add}
            </button>
          </form>
        )}

        {mode === 'meal' && (
          <div className="addsheet__daypick">
            <p className="sheet__group-label mono">{t.kitchen.whichDay}</p>
            <div className="addsheet__days">
              {weekDays.map((d) => (
                <button key={d} type="button" className="chip" onClick={() => planDay(d)}>
                  {formatWeekday(d, lang)}
                </button>
              ))}
            </div>
          </div>
        )}

        {mode === 'leftovers' && (
          <>
            <form
              onSubmit={(e) => {
                e.preventDefault()
                postLeftover(leftoverText)
              }}
            >
              <div className="sheet__field">
                <Icon name="arrow-counter-clockwise-bold" size={20} color="var(--ink-faint)" />
                <input
                  value={leftoverText}
                  onChange={(e) => setLeftoverText(e.target.value)}
                  placeholder={leftoverVoice.listening ? t.capture.listening : t.kitchen.leftoversAdd}
                  aria-label={t.kitchen.leftoversAdd}
                />
                <VoiceButton voice={leftoverVoice} label={t.capture.voice} />
              </div>
              {/* Quick-pick today's planned meals — "we ate this, there's some left". */}
              {(mealsData?.days ?? []).filter((d) => d.date === weekStart && !d.is_leftover).length > 0 && (
                <div className="addsheet__days">
                  {(mealsData?.days ?? [])
                    .filter((d) => d.date === weekStart && !d.is_leftover)
                    .map((m) => (
                      <button
                        key={m.id}
                        type="button"
                        className="chip"
                        disabled={busy}
                        onClick={() => postLeftover(m.title, m.recipe_id ?? null, m.id)}
                      >
                        {m.title}
                      </button>
                    ))}
                </div>
              )}
              <button type="submit" className="btn btn--primary" disabled={!leftoverText.trim() || busy}>
                <Icon name="plus-bold" size={20} />
                {t.kitchen.leftoversToPool}
              </button>
            </form>
          </>
        )}

        {/* "Cuisiner" — pick which of today's planned meals to cook, not just the
            next one. Each row jumps straight into that recipe's cook mode. The
            meal the app would auto-pick (next due) is flagged "Prochain". Empty
            ⇒ nothing with a recipe planned today, so offer to plan one instead. */}
        {mode === 'cook' &&
          (cookChoices.length === 0 ? (
            <div className="addsheet__cook-empty">
              <p className="sheet__group-label mono">{t.kitchen.cookNone}</p>
              <button type="button" className="btn" onClick={() => setMode('meal')}>
                <Icon name="calendar-blank-bold" size={18} />
                {t.kitchen.planMeal}
              </button>
            </div>
          ) : (
            <div className="addsheet__cook">
              <p className="sheet__group-label mono">{t.kitchen.cookWhich}</p>
              {/* Each choice is the app's shared Act row (board/Act) — colour spine,
                  the recipe's photo (or the slot glyph) in the tile, slot · recipe as
                  the sub-line, a caret since it navigates, and the next-due meal's
                  "Prochain" badge. One row primitive, so this matches the board. */}
              <div className="addsheet__cooklist">
                {cookChoices.map((c) => {
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
                  const sub =
                    (isMealSlot(slot) ? t.kitchen.slots[slot] : '') +
                    (sameName ? '' : ` · ${c.recipe.title}`) +
                    (cookName ? ` · ${cookName}` : '')
                  return (
                    <Act
                      key={c.meal.id}
                      cat="meal"
                      color={color}
                      icon={isMealSlot(slot) ? SLOT_ICON_NAME[slot] : 'cooking-pot-bold'}
                      photo={recipeImg(c.recipe.image) || undefined}
                      title={c.meal.title}
                      who={sub}
                      badge={c.isNext ? t.kitchen.cookNext : undefined}
                      onActivate={() => {
                        close()
                        nav(c.target)
                      }}
                    />
                  )
                })}
              </div>
            </div>
          ))}

        {mode === 'event' && <EventForm members={members} onSaved={savedWith([['board'], ['events']])} />}
        {mode === 'chore' && <ChoreForm members={members} onSaved={savedWith([['board'], ['chores']])} />}
        {mode === 'routine' && <RoutineForm members={members} onSaved={savedWith([['routines'], ['board']])} />}
      </div>
    </>
  )
}
