import { useCallback, useEffect, useRef, useState } from 'react'
import { useT, useLang } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { BOARD_KEY, HOUSEHOLD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { MEALS_KEY } from '../kitchen/types'
import {
  DEFAULT_HERO,
  DEFAULT_SLOT_HOURS,
  DEFAULT_SLOT_ORDER,
  SLOT_COLOR,
  SLOT_ICON_NAME,
  formatSlotHour,
  isMealSlot,
  WINDOW_DAYS_DEFAULT,
  WINDOW_DAYS_OPTIONS,
  type MealSlot,
} from '../../lib/mealSlots'
import { wash } from '../../lib/colors'
import { isGuest } from '../../lib/device'
import { useConfirm } from '../../lib/confirm'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { DragPill } from '../DragPill'
import { ColorPicker } from '../ColorPicker'
import { Icon, InlineIcon } from '../Icon'
import { StatusMessage } from '../StatusMessage'
import { OperatorSection } from './OperatorSection'
import type { HouseholdSettings } from '../../lib/mealPrefs'

// Réglages ▸ Repas. Five household-level settings for the meals of a day, shared by
// every device and all saved on /api/household:
//   • ORDER — drag the meals into the order YOUR day runs in. Respected everywhere a
//     meal appears: the kitchen grid + day editor, the board's day list, the month,
//     the slot pickers — and server-side, in the ORDER BY of every meal read.
//   • HERO — which meal is the day's headline (« Ce soir » on the board, the kitchen
//     day summary, « à régler »'s "rien de prévu"). The souper by default.
//   • HOURS — when each meal is SERVED. This, NOT the drag order, is what « Prochain
//     repas » (Cuisiner) walks, when the board strikes a meal through, and which part
//     of the day it's narrated in: reordering the list never claims the dessert comes
//     before the déjeuner on the clock.
//   • COLOUR per meal — it tints that meal everywhere it's shown.
//   • SHOW/HIDE per meal — drops a slot off the glance/plan ("I only care about
//     souper"). You can still plan a hidden slot in La cuisine.
// Saving invalidates HOUSEHOLD_KEY so every surface re-reads via useMealPrefs — plus
// BOARD/MEALS/MONTH when the order or hero changed, because those payloads are sorted
// and filtered server-side (see `save` below).

// Filter a saved order to the known slots, appending any the server omitted — so the
// editable list is always complete even against a stale cached payload.
function normalize(saved: string[] | null | undefined): MealSlot[] {
  const seen = new Set<MealSlot>()
  const out: MealSlot[] = []
  for (const s of saved ?? []) if (isMealSlot(s) && !seen.has(s)) (seen.add(s), out.push(s))
  for (const s of DEFAULT_SLOT_ORDER) if (!seen.has(s)) out.push(s)
  return out
}

// The hour field steps in 30-minute notches: enough control to say "our souper is at
// 17 h 30", not so much that a wall tablet becomes a time-entry form.
const STEP_MIN = 30
const clampMin = (m: number) => Math.max(0, Math.min(24 * 60 - STEP_MIN, m))

export function MealSlotsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const { lang } = useLang()
  const write = useWrite()
  const confirm = useConfirm()
  // Only OVERRIDES live here (a slot absent = its default colour).
  const [colors, setColors] = useState<Record<string, string>>({})
  const [hidden, setHidden] = useState<Set<string>>(new Set())
  const [order, setOrder] = useState<MealSlot[] | null>(null)
  const [hero, setHero] = useState<MealSlot>(DEFAULT_HERO)
  const [hours, setHours] = useState<Record<MealSlot, number>>(DEFAULT_SLOT_HOURS)
  // Mirrors `hours` so `nudgeHour` can compound rapid taps (see below).
  const hoursRef = useRef(hours)
  hoursRef.current = hours
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')
  // Read-only guest: the slot rows read as a coloured legend — no recolor / reset /
  // show-hide / reorder controls.
  const ro = isGuest()

  useEffect(() => {
    api<HouseholdSettings>('household')
      .then((r) => {
        setColors(r.mealColors ?? {})
        setHidden(new Set(r.mealHidden ?? []))
        setOrder(normalize(r.mealOrder))
        if (isMealSlot(r.mealHero)) setHero(r.mealHero)
        setHours({ ...DEFAULT_SLOT_HOURS, ...(r.mealHours as Partial<Record<MealSlot, number>>) })
      })
      .catch(() => setOrder([...DEFAULT_SLOT_ORDER]))
  }, [])

  // One save path for every field — PATCH sends only what changed, then we refresh
  // the shared household cache so the board/kitchen re-order/re-tint without a reload.
  // useWrite so a change made offline queues + replays. A server 4xx still throws →
  // 'bad'; a queued offline write resolves → 'saved' (it'll replay).
  //
  // ORDER and HERO also change what the SERVER returns — /api/board filters + sorts by
  // them, /api/meals and /api/month sort by the order — so those caches must be
  // invalidated too, not just HOUSEHOLD_KEY. Colours and visibility are client-side
  // only, so they settle with the household cache alone.
  const save = useCallback(
    async (patch: Record<string, unknown>) => {
      setStatus('idle')
      const serverSorted = 'mealOrder' in patch || 'mealHero' in patch
      const affectedKeys = serverSorted ? [HOUSEHOLD_KEY, BOARD_KEY, MEALS_KEY, MONTH_KEY] : [HOUSEHOLD_KEY]
      try {
        await write('household', { method: 'PATCH', body: patch, affectedKeys })
        setStatus('saved')
      } catch {
        setStatus('bad')
      }
    },
    [write],
  )

  function pickColor(slot: MealSlot, c: string) {
    const next = { ...colors, [slot]: c }
    setColors(next)
    save({ mealColors: next })
  }
  function resetColor(slot: MealSlot) {
    const next = { ...colors }
    delete next[slot]
    setColors(next)
    save({ mealColors: next })
  }
  function toggleVisible(slot: MealSlot) {
    const next = new Set(hidden)
    if (next.has(slot)) next.delete(slot)
    else next.add(slot)
    setHidden(next)
    save({ mealHidden: [...next] })
  }
  function pickHero(slot: MealSlot) {
    setHero(slot)
    save({ mealHero: slot })
  }
  function nudgeHour(slot: MealSlot, delta: number) {
    // Base the step on the REF, not the render closure: two taps on ± landing in the
    // same frame must compound, not both read the same pre-render value and lose one.
    // (A functional `setHours` updater wouldn't help — we need the new value NOW, to
    // PATCH it, and React doesn't promise the updater has run by the time we return.)
    const base = hoursRef.current
    const next = { ...base, [slot]: clampMin(base[slot] + delta) }
    hoursRef.current = next
    setHours(next)
    // Send only the changed slot — the server merges onto the stored map.
    save({ mealHours: { [slot]: next[slot] } })
  }
  // Resets the LAYOUT (order · hero · hours) only. Colours and hidden slots keep their
  // own per-row reset affordances, so this button never silently undoes them.
  async function resetLayout() {
    if (!(await confirm({ message: t.operator.resetConfirm, confirmLabel: t.operator.mealReset, tone: 'default' }))) return
    setOrder([...DEFAULT_SLOT_ORDER])
    setHero(DEFAULT_HERO)
    setHours({ ...DEFAULT_SLOT_HOURS })
    save({ mealOrder: DEFAULT_SLOT_ORDER, mealHero: DEFAULT_HERO, mealHours: DEFAULT_SLOT_HOURS })
  }

  // Shared by the drop handler and the ↑/↓ keyboard mirror below.
  function move(from: number, to: number) {
    if (!order || !Number.isInteger(from) || !Number.isInteger(to) || from === to) return
    if (from < 0 || from >= order.length || to < 0 || to >= order.length) return
    const next = [...order]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    setOrder(next)
    save({ mealOrder: next })
  }

  // Reuse the shared pointer DnD (same grip + ghost as La liste's reorder and the
  // aisle-order rows). A drop moves the dragged slot to the target index; we read the
  // live order at drop time.
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => move(Number(fromId), Number(toZone)),
    holdMs: DND_HOLD_MS,
  })

  if (order === null) return <p className="loading mono">{t.common.loading}</p>

  return (
    <OperatorSection
      title={t.operator.mealColors}
      hint={t.operator.mealOrderHint}
      help={help}
      helpKey="mealSlots"
      action={
        !ro ? (
          <button type="button" className="btn btn--ghost btn--sm" onClick={resetLayout}>
            <InlineIcon name="arrows-counter-clockwise-bold" /> {t.operator.mealReset}
          </button>
        ) : undefined
      }
    >
      <ul className="operator__list meal-slots">
        {order.map((slot, i) => {
          const resolved = colors[slot] ?? SLOT_COLOR[slot]
          const shown = !hidden.has(slot)
          const overridden = slot in colors
          const isHero = slot === hero
          return (
            <DragPill
              key={slot}
              dnd={dnd}
              index={i}
              label={t.kitchen.slots[slot]}
              className={'meal-slots__row' + (shown ? '' : ' is-off') + (isHero ? ' is-hero' : '')}
              showGrip={!ro}
              onMove={ro ? undefined : (dir) => move(i, dir === 'up' ? i - 1 : i + 1)}
            >
              <span className="meal-slots__name">
                <span
                  className="meal-slots__chip"
                  style={{ background: wash(resolved), color: resolved }}
                  aria-hidden="true"
                >
                  <Icon name={SLOT_ICON_NAME[slot]} size={20} color={resolved} />
                </span>
                {t.kitchen.slots[slot]}
              </span>

              {/* When the meal starts — "à partir de". Drives « Prochain repas ». */}
              <span className="meal-slots__hour">
                {!ro && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => nudgeHour(slot, -STEP_MIN)}
                    aria-label={`${t.operator.mealHourEarlier} · ${t.kitchen.slots[slot]}`}
                  >
                    <InlineIcon name="minus-bold" />
                  </button>
                )}
                <span className="mono meal-slots__hour-val">{formatSlotHour(hours[slot], lang)}</span>
                {!ro && (
                  <button
                    type="button"
                    className="btn btn--ghost btn--sm"
                    onClick={() => nudgeHour(slot, STEP_MIN)}
                    aria-label={`${t.operator.mealHourLater} · ${t.kitchen.slots[slot]}`}
                  >
                    <InlineIcon name="plus-bold" />
                  </button>
                )}
              </span>

              {!ro && (
                <div className="meal-slots__pick">
                  <ColorPicker value={resolved} onChange={(c) => pickColor(slot, c)} label={t.operator.mealColors} />
                  {overridden && (
                    <button type="button" className="btn btn--ghost mono meal-slots__reset" onClick={() => resetColor(slot)}>
                      {t.operator.mealColorReset}
                    </button>
                  )}
                </div>
              )}

              {/* The day's headline meal. A radio, not a toggle — exactly one wins. */}
              {ro ? (
                isHero ? <span className="mono meal-slots__hero-tag">{t.operator.mealHero}</span> : null
              ) : (
                <button
                  type="button"
                  className={'btn mono meal-slots__hero' + (isHero ? ' btn--primary' : ' btn--ghost')}
                  onClick={() => pickHero(slot)}
                  aria-pressed={isHero}
                  title={t.operator.mealHeroHint}
                >
                  <InlineIcon name="star-fill" /> {t.operator.mealHero}
                </button>
              )}

              {ro ? (
                <span className="mono meal-slots__toggle">
                  {shown ? t.operator.mealVisible : t.operator.mealHidden}
                </span>
              ) : (
                <button
                  type="button"
                  className={'btn mono meal-slots__toggle' + (shown ? ' btn--primary' : ' btn--ghost')}
                  onClick={() => toggleVisible(slot)}
                  aria-pressed={shown}
                >
                  {shown ? t.operator.mealVisible : t.operator.mealHidden}
                </button>
              )}
            </DragPill>
          )
        })}
      </ul>
      {/* A hidden hero means no headline anywhere — say so rather than letting the
          board quietly lose its « Ce soir ». */}
      {hidden.has(hero) && <StatusMessage tone="info">{t.operator.mealHeroHidden}</StatusMessage>}
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}

// « Jours affichés » — how far ahead the meal grid reaches, counting today.
//
// Its own section, stacked under the SAME `meals` pill as MealSlotsSection
// (C-15: a new setting merges into the sub that already owns the concept, never a
// new pill — the board▸events / SchoolYearSection precedent). Kept separate from
// MealSlotsSection rather than folded into it because that section's title and
// help copy describe THE MEALS OF A DAY (order, hero, hours, colour, visibility);
// a planning horizon is a different question about the same grid.
//
// Why it exists at all: the window used to be a Tuesday-anchored block that
// decayed from 10 days to 4 by Monday, so a Sunday-evening planning session could
// not reach the coming Fri/Sat — the weekend it was for (bmad/11 tier-1 seam #1).
// It is a rolling window from today now, and its length is the household's call.
export function MealWindowSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  const ro = isGuest()
  const [days, setDays] = useState<number | null>(null)
  const [status, setStatus] = useState<'idle' | 'saved' | 'bad'>('idle')

  useEffect(() => {
    api<HouseholdSettings>('household')
      .then((r) => setDays(r.mealWindowDays ?? WINDOW_DAYS_DEFAULT))
      .catch(() => setDays(WINDOW_DAYS_DEFAULT))
  }, [])

  async function pick(next: number) {
    setDays(next)
    setStatus('idle')
    try {
      // MEALS_KEY as well as HOUSEHOLD_KEY: this changes what the SERVER returns
      // for /api/meals (the window bounds its SQL), so the grid must refetch — the
      // same `serverSorted` reasoning as the order/hero saves in MealSlotsSection.
      await write('household', {
        method: 'PATCH',
        body: { mealWindowDays: next },
        affectedKeys: [HOUSEHOLD_KEY, MEALS_KEY],
      })
      setStatus('saved')
    } catch {
      setStatus('bad')
    }
  }

  return (
    <OperatorSection title={t.operator.mealWindowTitle} help={help} helpKey="mealWindow">
      <div className="operator__seg">
        <span className="operator__seg-label mono">{t.operator.mealWindowLabel}</span>
        {ro ? (
          <span className="mono">{t.operator.mealWindowDays(days ?? WINDOW_DAYS_DEFAULT)}</span>
        ) : (
          <select
            className="input"
            value={days ?? WINDOW_DAYS_DEFAULT}
            onChange={(e) => pick(Number(e.target.value))}
            aria-label={t.operator.mealWindowLabel}
          >
            {WINDOW_DAYS_OPTIONS.map((n) => (
              <option key={n} value={n}>
                {t.operator.mealWindowDays(n)}
              </option>
            ))}
          </select>
        )}
      </div>
      <p className="operator__hint mono">{t.operator.mealWindowHint}</p>
      {status === 'saved' && <StatusMessage tone="success">{t.operator.postalSaved}</StatusMessage>}
      {status === 'bad' && <StatusMessage tone="error">{t.operator.postalBad}</StatusMessage>}
    </OperatorSection>
  )
}
