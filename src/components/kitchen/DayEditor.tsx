import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { useMemo } from 'react'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { StatusMessage } from '../StatusMessage'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { Chip } from '../Chip'
import { MealRows } from './MealRows'
import { mealPickOptions, type MealPick } from './comboOptions'
import { type Leftover, type MealRow, type DayNoteRow } from './types'
import { type useMealPlanning } from './useMealPlanning'

// One day's full meal-planning controls — the body of the /kitchen/day/:date
// scene. It used to be a bottom sheet (DayManageSheet), but a height-capped sheet
// floats ABOVE the mobile keyboard, so its lower text inputs (add a meal, the day
// note) stranded under the keyboard and couldn't be seen while typing. As a
// full-screen .scene the page pins to the VISIBLE viewport and scrolls its body,
// so every field rides above the keyboard. This component is purely presentational
// — the page (DayPlanPage) owns the state + handlers and renders the .scene shell.
//
// Slots read CHRONOLOGICALLY (déjeuner → dîner → collation → souper, note last),
// and each slot's "＋ Ajouter" sits on its header line, not a row of its own.
type Plan = ReturnType<typeof useMealPlanning>

export function DayEditor({
  date,
  recipes,
  lowItems,
  listItems,
  suppers,
  mealsFor,
  note,
  recipeFor,
  memberName,
  onOpenRecipe,
  mealErr,
  plan,
  picker,
  leftovers,
  slotEdit,
  noteEdit,
  actions,
}: {
  date: number
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  suppers: MealRow[]
  mealsFor: (date: number, slot: string) => MealRow[]
  note: DayNoteRow | undefined
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  onOpenRecipe: (r: Recipe, m: MealRow) => void
  // A meal save failed (offline / 503) — surface it inline so it never reads as saved.
  mealErr?: boolean
  // The souper planning flow (type a title → AI staples → save). Owned by the page.
  plan: Pick<
    Plan,
    'editDate' | 'setEditDate' | 'mealText' | 'setMealText' | 'staplesBusy' | 'staplePrompt' | 'saveMeal' | 'beginSetMeal' | 'toggleStaple'
  >
  // Planning a recipe onto a slot + the souper staples opt-in. The dropdown is now
  // the combobox's own; only the pick handler + the staples toggle live here.
  picker: {
    pickWithStaples: boolean
    setPickWithStaples: (f: (s: boolean) => boolean) => void
    planRecipe: (date: number, slot: string, r: Recipe) => void
  }
  // The Restants pool — a leftover picked from the combobox is consumed into the
  // slot (it leaves the pool, badged Restants).
  leftovers: {
    pool: Leftover[]
    plan: (date: number, slot: string, l: Leftover) => void
  }
  // The lighter side slots' inline title editor.
  slotEdit: {
    editSlot: { date: number; slot: string } | null
    setEditSlot: (v: { date: number; slot: string } | null) => void
    slotText: string
    setSlotText: (v: string) => void
    saveSlot: (date: number, slot: string, title: string) => void
  }
  // The day's free-text memo.
  noteEdit: {
    editNote: number | null
    setEditNote: (v: number | null) => void
    noteText: string
    setNoteText: (v: string) => void
    saveNote: (date: number, text: string) => void
    clearNote: (date: number) => void
  }
  actions: {
    clearMeal: (id: string) => void
    moveMeal: (id: string, dir: 'up' | 'down') => void
    renameMeal: (id: string, title: string) => void
    clearSlotMeals: (date: number, slot: string) => void
    clearDay: (date: number) => void
    announceLeftover: (meal: MealRow) => void
    // Drag a meal to another slot (same day) — slot passed, date kept.
    rescheduleMeal: (id: string, toDate: number, slot?: string) => void
  }
}) {
  const t = useT()
  const mealPrefs = useMealPrefs()
  // Read-only guest: every add/rename/reorder/remove control is hidden. MealRows
  // already renders inert (no drag handle passed below) and the recipe-open survives.
  const ro = isGuest()

  const { editDate, setEditDate, mealText, setMealText, staplesBusy, staplePrompt, saveMeal, beginSetMeal, toggleStaple } = plan
  const { pickWithStaples, setPickWithStaples, planRecipe } = picker
  const { editSlot, setEditSlot, slotText, setSlotText, saveSlot } = slotEdit
  const { editNote, setEditNote, noteText, setNoteText, saveNote, clearNote } = noteEdit
  const { clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover, rescheduleMeal } = actions

  // Cross-slot drag: drag a meal's grip onto another slot's section to move it
  // there (same day). Zones are keyed by slot name (the day is fixed — this page
  // is one day). A drop on a meal's own slot is rejected so it never shows a cue it
  // won't honour. Touch-friendly, so it works on the wall tablet.
  const slotOfMeal = (id: string): string | null => {
    if (suppers.some((m) => m.id === id)) return 'supper'
    for (const s of SIDE_SLOTS) if (mealsFor(date, s).some((m) => m.id === id)) return s
    return null
  }
  const mealDnd = usePointerDnd({
    onDrop: (id, slot) => rescheduleMeal(id, date, slot),
    canDrop: (id, slot) => slotOfMeal(id) !== slot,
    // Press-and-hold a meal to move it between slots — deliberate, not a flick.
    holdMs: DND_HOLD_MS,
  })
  // Recipes + leftovers as one grouped dropdown for the slot field — pick a recipe
  // (links it) or a pooled leftover (consumes it), or just type a free-text meal.
  const mealOpts = useMemo(
    () => mealPickOptions(recipes, lowItems, listItems, leftovers.pool, t),
    [recipes, lowItems, listItems, leftovers.pool, t],
  )
  // Route a combobox pick to the right handler for the given slot.
  const pickMeal = (d: number, slot: string) => (o: ComboOption<MealPick>) => {
    if (o.data.kind === 'recipe') planRecipe(d, slot, o.data.recipe)
    else leftovers.plan(d, slot, o.data.leftover)
  }
  const dayMealCount = SIDE_SLOTS.reduce((n, s) => n + mealsFor(date, s).length, suppers.length)
  // Add-affordance label: "Ajouter un autre" when the slot already holds a meal,
  // plain "Ajouter" when it's empty (no redundant "＋ Déjeuner" beside the header).
  const addLabel = (count: number) => (count ? t.kitchen.addAnother : t.capture.add)

  const supperEditing = editDate === date
  const supperStaples = staplePrompt?.date === date && staplePrompt.slot === 'supper'

  return (
    <>
      {mealErr && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}

      {/* ── The lighter slots, in time order: déjeuner / dîner / collation.
          The hero souper follows them so the day reads chronologically. ── */}
      {SIDE_SLOTS.map((slot) => {
        const slotMeals = mealsFor(date, slot)
        const editing = editSlot?.date === date && editSlot.slot === slot
        return (
          <section
            key={slot}
            data-dnd-zone={slot}
            className={'day-mng__sec' + (mealDnd.over === slot ? ' dnd-over' : '')}
          >
            <div className="day-mng__sec-head-row">
              <p className="day-mng__sec-head mono">
                <Icon name={SLOT_ICON_NAME[slot]} size={16} color={mealPrefs.color(slot)} /> {t.kitchen.slots[slot]}
              </p>
              {!editing && !ro && (
                <button
                  type="button"
                  className="kitchen__slot-add mono"
                  onClick={() => {
                    setEditSlot({ date, slot })
                    setSlotText('')
                  }}
                >
                  <InlineIcon name="plus-bold" /> {addLabel(slotMeals.length)}
                </button>
              )}
            </div>
            <MealRows
              meals={slotMeals}
              recipeFor={recipeFor}
              memberName={memberName}
              onOpenRecipe={onOpenRecipe}
              onRemove={clearMeal}
              onMove={moveMeal}
              onRename={renameMeal}
              onClearAll={() => clearSlotMeals(date, slot)}
              onLeftover={announceLeftover}
              onDragStart={ro ? undefined : mealDnd.start}
              draggingId={mealDnd.activeId}
              dragLabel={t.kitchen.dragMeal}
            />
            {editing && !ro && (
              // One box: type a free-text meal, or pick a recipe / leftover from
              // the filtered dropdown (grouped when both exist).
              <EntityCombobox
                value={slotText}
                onChange={setSlotText}
                options={mealOpts}
                onPick={pickMeal(date, slot)}
                onSubmit={(v) => saveSlot(date, slot, v)}
                submitLabel={t.kitchen.setMeal}
                noMatchLabel={t.combo.noMatch}
                onCancel={() => {
                  setEditSlot(null)
                  setSlotText('')
                }}
                autoFocus
                placeholder={t.kitchen.slots[slot]}
                ariaLabel={t.kitchen.slots[slot]}
              />
            )}
          </section>
        )
      })}

      {/* ── Souper: the day's hero meal (its own grocery-staples step), shown
          last in the chronological run. ── */}
      <section
        data-dnd-zone="supper"
        className={'day-mng__sec' + (mealDnd.over === 'supper' ? ' dnd-over' : '')}
      >
        <div className="day-mng__sec-head-row">
          <p className="day-mng__sec-head mono">
            <Icon name={SLOT_ICON_NAME.supper} size={16} color={mealPrefs.color('supper')} /> {t.kitchen.slots.supper}
          </p>
          {!supperEditing && !supperStaples && !ro && (
            <button
              type="button"
              className="kitchen__slot-add mono"
              onClick={() => {
                setEditDate(date)
                setMealText('')
              }}
            >
              <InlineIcon name="plus-bold" /> {addLabel(suppers.length)}
            </button>
          )}
        </div>
        {supperStaples && staplePrompt && !ro ? (
          <div className="kitchen__staples">
            <p className="kitchen__staples-q mono">
              {staplePrompt.title} · {t.kitchen.staplesQ}
            </p>
            <p className="kitchen__staples-hint mono">{t.kitchen.staplesHint}</p>
            <div className="kitchen__staples-chips">
              {staplePrompt.options.map((o) => (
                <Chip key={o.item} selected={o.on} onClick={() => toggleStaple(o.item)} title={o.item}>
                  <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                </Chip>
              ))}
            </div>
            <div className="kitchen__staples-actions">
              <button
                type="button"
                className="btn btn--primary mono"
                onClick={() =>
                  saveMeal(
                    staplePrompt.date,
                    staplePrompt.slot,
                    staplePrompt.title,
                    staplePrompt.options.filter((o) => o.on).map((o) => o.item),
                    staplePrompt.recipeId,
                  )
                }
              >
                {t.kitchen.staplesAdd}
              </button>
              <button
                type="button"
                className="btn btn--ghost mono"
                onClick={() => saveMeal(staplePrompt.date, staplePrompt.slot, staplePrompt.title, [], staplePrompt.recipeId)}
              >
                {t.kitchen.staplesSkip}
              </button>
            </div>
          </div>
        ) : (
          <>
            <MealRows
              meals={suppers}
              recipeFor={recipeFor}
              memberName={memberName}
              onOpenRecipe={onOpenRecipe}
              onRemove={clearMeal}
              onMove={moveMeal}
              onRename={renameMeal}
              onClearAll={() => clearSlotMeals(date, 'supper')}
              onLeftover={announceLeftover}
              onDragStart={ro ? undefined : mealDnd.start}
              draggingId={mealDnd.activeId}
              dragLabel={t.kitchen.dragMeal}
            />
            {supperEditing && !ro && (
              // Souper's box: type a free-text supper or pick a recipe / leftover.
              // The dropdown leads with the "+ ingrédients" opt-in (off by default):
              // it governs BOTH a recipe pick (also fill the grocery list with its
              // ingredients) AND free text (→ AI staples). Default off → "Mettre"
              // just saves the meal, one less step.
              <EntityCombobox
                value={mealText}
                onChange={setMealText}
                options={mealOpts}
                onPick={pickMeal(date, 'supper')}
                onSubmit={() => beginSetMeal(date, 'supper', pickWithStaples)}
                submitLabel={staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                busy={staplesBusy}
                noMatchLabel={t.combo.noMatch}
                onCancel={() => {
                  setEditDate(null)
                  setMealText('')
                }}
                autoFocus
                placeholder={t.kitchen.plan}
                listHeader={
                  <button
                    type="button"
                    className={'chip kitchen__recipe-staples' + (pickWithStaples ? ' is-on' : '')}
                    onClick={() => setPickWithStaples((s) => !s)}
                    aria-pressed={pickWithStaples}
                  >
                    <InlineIcon name={pickWithStaples ? 'check-square-bold' : 'square-bold'} />{' '}
                    <InlineIcon name="shopping-bag-bold" /> {t.kitchen.alsoStaples}
                  </button>
                }
              />
            )}
          </>
        )}
      </section>

      {/* ── The day's free-text note — last, after the meals ── */}
      <section className="day-mng__sec">
        <p className="day-mng__sec-head mono">
          <Icon name="pencil-simple-bold" size={16} color="var(--ink-soft)" /> {t.kitchen.note}
        </p>
        {ro ? (
          // Guest: the note reads as plain text (or nothing) — no edit/add affordance.
          note ? (
            <span className="kitchen__note-chip" aria-disabled="true">
              <span aria-hidden="true"><Icon name="pencil-simple-bold" size={16} /></span>
              <span className="kitchen__note-text">{note.text}</span>
            </span>
          ) : null
        ) : editNote === date ? (
          <EditField
            value={noteText}
            onChange={setNoteText}
            onSubmit={(v) => saveNote(date, v)}
            submitLabel={t.kitchen.setMeal}
            autoFocus
            placeholder={t.kitchen.notePlaceholder}
            ariaLabel={t.kitchen.note}
          >
            {note && (
              <button
                type="button"
                className="btn btn--ghost mono kitchen__clear-meal"
                onClick={() => clearNote(date)}
              >
                <InlineIcon name="trash-bold" /> {t.kitchen.clearNote}
              </button>
            )}
          </EditField>
        ) : note ? (
          <button
            type="button"
            className="kitchen__note-chip"
            onClick={() => {
              setEditNote(date)
              setNoteText(note.text)
            }}
          >
            <span aria-hidden="true"><Icon name="pencil-simple-bold" size={16} /></span>
            <span className="kitchen__note-text">{note.text}</span>
          </button>
        ) : (
          <button
            type="button"
            className="kitchen__note-add mono"
            onClick={() => {
              setEditNote(date)
              setNoteText('')
            }}
          >
            <InlineIcon name="plus-bold" /> {t.kitchen.note}
          </button>
        )}
      </section>

      {/* Wipe the whole day's meals at once — only when there's something. Sits
          last, reads red: a deliberate, destructive clear, not a quiet control. */}
      {!ro && dayMealCount > 0 && (
        <button
          type="button"
          className="btn btn--ghost mono kitchen__clear-day"
          onClick={() => clearDay(date)}
        >
          <InlineIcon name="trash-bold" /> {t.kitchen.clearDay}
        </button>
      )}
      <DragGhost ghost={mealDnd.ghost} />
    </>
  )
}
