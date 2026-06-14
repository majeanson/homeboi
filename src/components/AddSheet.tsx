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
import { useNextMeal } from '../lib/nextMeal'
import { useKitchenActions, noKitchenActions } from '../lib/kitchenActions'
import { BOARD_KEY } from '../lib/queryKeys'
import { MEALS_KEY, PANTRY_KEY, type MealsData } from './kitchen/types'
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
type CaptureType = 'event' | 'meal' | 'task' | 'list-item' | 'pantry-low' | 'note'
interface FormMember { id: string; display_name: string; is_child: number }

// The 6 AI-router types — only shown as a fallback when a capture comes back
// degraded (AI off), so the human can re-route the saved note.
// wash = theme-aware CSS var so the icon tiles follow day↔night (night darkens
// each --*-wash); deep stays concrete hex (the glyph ink reads on both surfaces).
const TYPES: { type: CaptureType; icon: IconName; deep: string; wash: string }[] = [
  { type: 'event', icon: 'calendar-blank-bold', deep: '#5891AC', wash: 'var(--sky-wash)' },
  { type: 'meal', icon: 'bowl-food-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  { type: 'task', icon: 'hand-heart-bold', deep: '#6B8A52', wash: 'var(--sage-wash)' },
  { type: 'list-item', icon: 'sparkle-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  { type: 'pantry-low', icon: 'carrot-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  { type: 'note', icon: 'pencil-simple-bold', deep: '#95527A', wash: 'var(--berry-wash)' },
]

// Tile dressing per mode (labels resolve through i18n below). recipe/list-item
// borrow their hub tab's identity (terracotta book, sky sparkle) so the tile
// reads as "the thing this section adds".
const MODE_META: Record<AddSheetMode, { icon: IconName; deep: string; wash: string }> = {
  capture: { icon: 'sparkle-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  event: { icon: 'calendar-blank-bold', deep: '#5891AC', wash: 'var(--sky-wash)' },
  chore: { icon: 'hand-heart-bold', deep: '#6B8A52', wash: 'var(--sage-wash)' },
  routine: { icon: 'pencil-simple-bold', deep: '#95527A', wash: 'var(--berry-wash)' },
  cook: { icon: 'cooking-pot-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  recipe: { icon: 'book-open-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
  meal: { icon: 'calendar-blank-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  pantry: { icon: 'carrot-bold', deep: '#6B8A52', wash: 'var(--sage-wash)' },
  'list-item': { icon: 'sparkle-bold', deep: '#5891AC', wash: 'var(--sky-wash)' },
  'quick-add': { icon: 'lightning-bold', deep: '#D9842A', wash: 'var(--marigold-wash)' },
  flyer: { icon: 'magnifying-glass-bold', deep: '#C2563A', wash: 'var(--terracotta-wash)' },
}

// Modes with no in-sheet form — picking one leaves the sheet for a full-screen
// route (the recipe builder, the quick-add restock page, the flyer browser).
// They never become the sheet's default (defMode skips them).
const NAV_TARGET: Partial<Record<AddSheetMode, string>> = {
  recipe: '/kitchen/recipe/new',
  'quick-add': '/liste/quick',
  flyer: '/liste/circulaires',
}

// Navigate-only modes never host an in-sheet form, so they can't be the sheet's
// default. `cook`'s destination is dynamic (the next meal's recipe), resolved at
// click time, so it lives here rather than in the static NAV_TARGET map above.
const isNavOnly = (m: AddSheetMode) => m === 'cook' || m in NAV_TARGET

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
  const defMode = shown.includes('capture') ? 'capture' : (shown.find((m) => !isNavOnly(m)) ?? shown[0])
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

  // — plan a meal (kitchen) — "Planifier un repas" is now a DAY PICKER that opens
  // that day's full "Gérer" sheet (one real editor, reached two ways), instead of
  // a divergent mini day+slot+title form. Day options come from the SAME weekStart
  // the Kitchen grid renders, so picking a day lands on the matching grid row.
  const wantsMeal = shown.includes('meal')
  const { data: mealsData } = useQuery({
    queryKey: MEALS_KEY,
    queryFn: () => api<MealsData>('meals'),
    enabled: open && wantsMeal,
  })
  // "Cuisiner" tile: where it lands — the next meal due → its recipe cook mode,
  // else the kitchen (so the tap is never dead). Resolved from the shared meal +
  // recipe caches; fetched only while the sheet's open and the tile is shown.
  const cook = useNextMeal(open && shown.includes('cook'))
  const cookTarget = cook.target ?? '/kitchen'
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
      for (const key of [['board'], ['meals'], ['pantry']]) qc.invalidateQueries({ queryKey: key })
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
      pantry: t.kitchen.lowAdd,
      'list-item': t.list.addTitle,
      'quick-add': t.list.quickAdd,
      flyer: t.shop.browse,
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
            overlay that lives on the kitchen page, not in this sheet. */}
        {shown.length > 1 && (
          <div className={'cat-grid' + (shown.length === 3 ? ' cat-grid--3' : '')}>
            {shown.map((m) => (
              <button
                key={m}
                type="button"
                className={'cat-pick' + (mode === m ? ' sel' : '')}
                onClick={() => {
                  if (m === 'cook') {
                    close()
                    nav(cookTarget)
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
                <span className="ct" style={{ background: MODE_META[m].wash }}>
                  <Icon name={MODE_META[m].icon} size={22} color={MODE_META[m].deep} />
                </span>
                <span>{modeLabel(m)}</span>
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
                {TYPES.map((ty) => (
                  <button
                    key={ty.type}
                    type="button"
                    className="cat-pick"
                    onClick={() => submit(undefined, ty.type)}
                  >
                    <span className="ct" style={{ background: ty.wash }}>
                      <Icon name={ty.icon} size={22} color={ty.deep} />
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

        {mode === 'event' && <EventForm members={members} onSaved={savedWith([['board'], ['events']])} />}
        {mode === 'chore' && <ChoreForm members={members} onSaved={savedWith([['board'], ['chores']])} />}
        {mode === 'routine' && <RoutineForm members={members} onSaved={savedWith([['routines'], ['board']])} />}
      </div>
    </>
  )
}
