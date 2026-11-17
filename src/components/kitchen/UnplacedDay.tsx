import { useRef, useState, type PointerEvent as ReactPointerEvent } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useCreateWithUndo } from '../../lib/undoCreate'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { dropCueOf, type usePointerDnd } from '../../lib/dnd'
import { SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { Icon } from '../Icon'
import { IconButton } from '../IconButton'
import { Chip, ChipGroup } from '../Chip'
import { useSingleOpen } from '../Disclosure'
import { MealPlanPicker } from './MealPlanPicker'
import { placeMeal, relinkUnplaced, unplacedGroups } from './mealMutations'
import { type MealPick } from './comboOptions'
import { BOARD_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { MEALS_KEY, MEAL_HISTORY_KEY, type UnplacedMeal } from './types'

// Every surface a meal shows on (the write-owners rule) — a bin write touches only the
// meals read today, but the set is THE meal set, not a guess about which one moved.
const MEAL_KEYS = [MEALS_KEY, BOARD_KEY, MEAL_HISTORY_KEY, MONTH_KEY]

// « À placer » — the week grid's FIRST card: the week's meals that have no day yet
// (mig 0155; Marc, 2026-11-14: « plan the week without assigning a day yet, say have
// 5 meals in there, and drag and drop easily »). It is a day card without a date, on
// purpose: same `.kitchen__day` shell, same meal rows, same drop cue, so a meal
// dragged out of it onto Thursday is visibly the same object landing somewhere else.
//
// Its doors:
//   · the head's ＋ — type a meal or pick a recipe (the grid's own recipe options);
//   · an idea from « Idées de repas » — its day picker's first chip is « À placer »
//     (useParkMeal, shared below so both doors write the same body);
//   · drag a planned meal off its day onto this card (Kitchen's dayDnd);
//   · drag a row from here onto a day — or, without a drag (a mouse, a keyboard, a
//     thumb that would rather tap), tap the row for the same day picker the ideas use.
// Rows are CONSUMED when placed: the meal moves, it does not copy (that is the line
// between this and the reusable ideas pool).
//
// LINKED rows (mig 0156; Marc, 2026-11-16: « link two recipes together … so that after
// they move together until explicitly unlinked »). On a day, a slot's meals already
// travel as one — the supper headline drags them all. Here each row was alone, so
// « spaghetti + salade » had to be placed twice. LINK = drag one row onto another
// (each row is its own drop zone, UNPLACED_ROW, nested in the bin's): the two (or
// their groups) become one group, drawn in one bracket. Marc, 2026-11-17: « link
// appears on drag and drop … not with always-on UI buttons » — so no chain sits
// between rows any more. UNLINK = the small broken-chain on a linked row's own line,
// beside its ✕: that row leaves, the rest stay together. A group drags, places (tap →
// day picker) and lands as one, in the grabbed row's slot.
// The non-drag mirror of LINK (dnd-mirror): tap a row — the panel that opens under it
// lists the other groups as « Lier à » chips. Only there, never always on.

type Dnd = ReturnType<typeof usePointerDnd>

/** Park a meal in « À placer » — with the add's « Annuler », which DELETEs exactly that row. */
export function useParkMeal() {
  const createWithUndo = useCreateWithUndo()
  const t = useT()
  return (title: string, recipeId: string | null = null, slot: string | null = null) =>
    createWithUndo({
      endpoint: 'meals',
      body: { action: 'park', title, recipeId, slot },
      affectedKeys: MEAL_KEYS,
      undoBody: { unplaced: true },
      message: t.undo.unplacedAdded(title),
    })
}

export function UnplacedDay({
  items,
  dnd,
  options,
  week,
  ro,
}: {
  items: UnplacedMeal[]
  dnd: Dnd
  // The grid's recipe options (the leftovers group left out: a leftover is consumed
  // by its own pool's plan action, and parking a copy of it would orphan the original).
  options: ComboOption<MealPick>[]
  week: { date: number; label: string }[]
  ro: boolean
}) {
  const t = useT()
  const qc = useQueryClient()
  const nav = useNavigate()
  const write = useWrite()
  const mealPrefs = useMealPrefs()
  const park = useParkMeal()
  const removal = useDeferredRemoval(MEALS_KEY)
  const { isOpen, toggle, close } = useSingleOpen()
  const [adding, setAdding] = useState(false)
  const [text, setText] = useState('')
  const [busy, setBusy] = useState(false)
  const [slotPick, setSlotPick] = useState<MealSlot | null>(null)
  // A press that then travels is a drag, not a tap — the grid's own guard (Kitchen's
  // tapDownRef), so letting go of a drag never also opens the day picker.
  const downRef = useRef<{ x: number; y: number } | null>(null)

  function add(title: string, recipeId: string | null) {
    const v = title.trim()
    if (!v || busy) return
    setBusy(true)
    park(v, recipeId)
      .then((res) => {
        if (!res) return // failed: keep the typed text for a retry
        setText('')
        setAdding(false)
      })
      .finally(() => setBusy(false))
  }

  function removeRow(u: UnplacedMeal) {
    close()
    removal.remove([u.id], t.undo.unplacedRemoved(u.title), () =>
      write('meals', { method: 'DELETE', body: { id: u.id, unplaced: true }, affectedKeys: MEAL_KEYS }),
    )
  }

  const rows = removal.visible(items)
  const groups = unplacedGroups(rows)
  // The group being dragged (any of its rows can be the grip) dims as one.
  const draggingId = dnd.activeId?.startsWith(`${UNPLACED_ZONE}:`) ? dnd.activeId.slice(UNPLACED_ZONE.length + 1) : null
  // A row under the drag: for a bin row that is « link with this group »; for a meal
  // coming off a day it is just the bin (Kitchen's onDrop treats it so) — the cue says
  // which.
  const overRowId = dnd.over?.startsWith(`${UNPLACED_ROW}:`) ? dnd.over.slice(UNPLACED_ROW.length + 1) : null
  const linkTarget = draggingId != null && overRowId != null ? groups.find((g) => g.some((x) => x.id === overRowId)) : undefined
  const over = dropCueOf(dnd, UNPLACED_ZONE) === 'into' || (overRowId != null && draggingId == null)
  const join = (a: UnplacedMeal[], b: UnplacedMeal[]) => void relinkUnplaced(qc, [[...a, ...b].map((x) => x.id)])

  const row = (u: UnplacedMeal, group: UnplacedMeal[]) => {
    const slot = (u.slot as MealSlot | null) ?? mealPrefs.hero
    const start = (e: ReactPointerEvent) => {
      downRef.current = { x: e.clientX, y: e.clientY }
      dnd.start(`${UNPLACED_ZONE}:${u.id}`, group.map((x) => x.title).join(' · '), e)
    }
    const dragging = draggingId != null && group.some((x) => x.id === draggingId)
    const others = groups.filter((g) => g !== group)
    return (
      <div key={u.id} className="kitchen__unplaced-item" data-dnd-zone={ro ? undefined : `${UNPLACED_ROW}:${u.id}`}>
        {/* A plain div carries the drag (it holds two buttons — no role of its
            own, nested-interactive). The title button is the tap door. */}
        <div
          className={'kitchen__day-meal kitchen__unplaced-row' + (dragging ? ' is-dragging' : '')}
          onPointerDown={ro ? undefined : start}
          title={ro ? undefined : t.kitchen.dragDay}
        >
          <button
            type="button"
            className="kitchen__unplaced-open"
            aria-expanded={ro ? undefined : isOpen(u.id)}
            onClick={(e) => {
              const d = downRef.current
              if (d && (Math.abs(e.clientX - d.x) > 6 || Math.abs(e.clientY - d.y) > 6)) return
              if (ro) {
                if (u.recipe_id) nav(`/kitchen/recipe/${u.recipe_id}`)
                return
              }
              setSlotPick(null)
              toggle(u.id)
            }}
          >
            <Icon name={SLOT_ICON_NAME[slot]} size={18} color={mealPrefs.color(slot)} />
            <span className="kitchen__day-meal-text">
              <span className="kitchen__day-meal-title">{u.title}</span>
            </span>
          </button>
          {/* One quiet ✕ — the row is a meal waiting for a day, not a record to
              manage (its recipe opens from the day it lands on). Removes THIS row
              only; its partners stay linked to each other. On a LINKED row a
              broken chain sits before it, on the same line: this row leaves the
              group (a group of two simply comes apart). */}
          {!ro && group.length > 1 && (
            <IconButton
              icon="link-break-bold"
              variant="bare"
              size="sm"
              iconSize={14}
              className="kitchen__unplaced-unlink"
              label={t.kitchen.unplacedUnlink(u.title)}
              onClick={() =>
                void relinkUnplaced(qc, [[u.id], group.filter((x) => x.id !== u.id).map((x) => x.id)])
              }
            />
          )}
          {!ro && (
            <IconButton
              icon="x-bold"
              variant="bare"
              size="sm"
              className="kitchen__unplaced-remove"
              label={t.kitchen.unplacedRemove}
              onClick={() => removeRow(u)}
            />
          )}
        </div>
        {!ro && isOpen(u.id) && (
          <MealPlanPicker
            slot={slotPick ?? slot}
            onSlot={setSlotPick}
            week={week}
            onPickDay={(date) => {
              close()
              // The whole group lands together, in the picked slot.
              for (const m of group) void placeMeal(qc, m, date, slotPick ?? slot)
            }}
          />
        )}
        {/* The drag-to-link mirror: the other groups, one chip each. */}
        {!ro && isOpen(u.id) && others.length > 0 && (
          <ChipGroup label={t.kitchen.unplacedLinkTo}>
            {others.map((g) => (
              <Chip
                key={g[0]?.id}
                icon="link-bold"
                onClick={() => {
                  close()
                  join(group, g)
                }}
              >
                {g.map((x) => x.title).join(' · ')}
              </Chip>
            ))}
          </ChipGroup>
        )}
      </div>
    )
  }
  return (
    <li
      data-dnd-zone={UNPLACED_ZONE}
      className={'surface kitchen__day kitchen__day--unplaced' + (over ? ' is-droptarget' : '')}
    >
      <div className="kitchen__day-head">
        <span className="kitchen__unplaced-title">
          <Icon name="tray-bold" size={18} />
          {t.kitchen.unplaced}
        </span>
        {!ro && !adding && (
          <div className="kitchen__day-head-actions">
            <IconButton
              icon="plus-bold"
              variant="bare"
              iconSize={16}
              className="kitchen__day-manage"
              onClick={() => setAdding(true)}
              label={t.kitchen.unplacedAdd}
            />
          </div>
        )}
      </div>
      <div className="kitchen__day-body">
        {adding && !ro && (
          <EntityCombobox
            className="kitchen__day-add"
            value={text}
            onChange={setText}
            options={options}
            onSelect={(o: ComboOption<MealPick>) => {
              if (o.data.kind === 'recipe') add(o.data.recipe.title, o.data.recipe.id)
            }}
            onSubmit={(v) => add(v, null)}
            onCancel={() => {
              setAdding(false)
              setText('')
            }}
            noMatchLabel={t.combo.noMatch}
            frequentsKey="meal"
            // The ＋ that revealed it asked to type (the day cards' ＋ does the same).
            autoFocus
            busy={busy}
            placeholder={t.kitchen.planPlaceholder}
            ariaLabel={t.kitchen.unplacedAdd}
          />
        )}
        {rows.length === 0 ? (
          !adding && <span className="kitchen__day-sum-empty mono">{t.kitchen.unplacedEmpty}</span>
        ) : (
          <div className="kitchen__day-meals">
            {groups.map((g) => (
              <div
                key={g[0]?.id}
                className={
                  'kitchen__unplaced-group' + (g.length > 1 ? ' is-linked' : '') + (g === linkTarget ? ' is-linktarget' : '')
                }
              >
                {g.map((u) => row(u, g))}
              </div>
            ))}
          </div>
        )}
      </div>
    </li>
  )
}

/** The drop zone key of « À placer » on the week grid; a row drags as `unplaced:<id>`. */
export const UNPLACED_ZONE = 'unplaced'
/** One row of the bin as a drop zone, `unplacedrow:<id>` — a bin row dropped here links
 *  the two groups; anything else dropped here is simply a drop into the bin. */
export const UNPLACED_ROW = 'unplacedrow'
