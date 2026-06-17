import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { MealRows } from './MealRows'
import { RecipePickerMenu } from './RecipePickerMenu'
import { LeftoverPickerMenu } from './LeftoverPickerMenu'
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
  onOpenRecipe: (r: Recipe) => void
  // A meal save failed (offline / 503) — surface it inline so it never reads as saved.
  mealErr?: boolean
  // The souper planning flow (type a title → AI staples → save). Owned by the page.
  plan: Pick<
    Plan,
    'editDate' | 'setEditDate' | 'mealText' | 'setMealText' | 'staplesBusy' | 'staplePrompt' | 'saveMeal' | 'beginSetMeal' | 'toggleStaple'
  >
  // The shared recipe picker (which {date,slot} is open) + the souper staples opt-in.
  picker: {
    recipePickFor: { date: number; slot: string } | null
    setRecipePickFor: (v: { date: number; slot: string } | null) => void
    pickWithStaples: boolean
    setPickWithStaples: (f: (s: boolean) => boolean) => void
    planRecipe: (date: number, slot: string, r: Recipe) => void
  }
  // The Restants pool + its own slot picker ("Choisir un reste", parallel to the
  // recipe picker). Planning one consumes it into a real meal badged Restants.
  leftovers: {
    pool: Leftover[]
    pickFor: { date: number; slot: string } | null
    setPickFor: (v: { date: number; slot: string } | null) => void
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

  const { editDate, setEditDate, mealText, setMealText, staplesBusy, staplePrompt, saveMeal, beginSetMeal, toggleStaple } = plan
  const { recipePickFor, setRecipePickFor, pickWithStaples, setPickWithStaples, planRecipe } = picker
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
  const pickOpenFor = (d: number, slot: string) => recipePickFor?.date === d && recipePickFor.slot === slot
  const leftoverOpenFor = (d: number, slot: string) => leftovers.pickFor?.date === d && leftovers.pickFor.slot === slot
  // The recipe + leftover pickers share a slot's add-row but only one shows at a
  // time — opening either closes the other so the page never stacks two lists.
  const openRecipePick = (d: number, slot: string) => {
    leftovers.setPickFor(null)
    setRecipePickFor(pickOpenFor(d, slot) ? null : { date: d, slot })
  }
  const openLeftoverPick = (d: number, slot: string) => {
    setRecipePickFor(null)
    leftovers.setPickFor(leftoverOpenFor(d, slot) ? null : { date: d, slot })
  }
  const dayMealCount = SIDE_SLOTS.reduce((n, s) => n + mealsFor(date, s).length, suppers.length)
  // Add-affordance label: "Ajouter un autre" when the slot already holds a meal,
  // plain "Ajouter" when it's empty (no redundant "＋ Déjeuner" beside the header).
  const addLabel = (count: number) => (count ? t.kitchen.addAnother : t.capture.add)

  const supperEditing = editDate === date
  const supperStaples = staplePrompt?.date === date && staplePrompt.slot === 'supper'

  return (
    <>
      {mealErr && (
        <p className="error mono" role="alert">
          {t.common.saveFailed}
        </p>
      )}

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
              {!editing && (
                <button
                  type="button"
                  className="kitchen__slot-add mono"
                  onClick={() => {
                    setEditSlot({ date, slot })
                    setSlotText('')
                  }}
                >
                  ＋ {addLabel(slotMeals.length)}
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
              onDragStart={mealDnd.start}
              draggingId={mealDnd.activeId}
              dragLabel={t.kitchen.dragMeal}
            />
            {editing && (
              <EditField
                value={slotText}
                onChange={setSlotText}
                onSubmit={(v) => saveSlot(date, slot, v)}
                submitLabel={t.kitchen.setMeal}
                onCancel={() => {
                  setEditSlot(null)
                  setSlotText('')
                }}
                autoFocus
                placeholder={t.kitchen.slots[slot]}
                ariaLabel={t.kitchen.slots[slot]}
              >
                {(recipes.length > 0 || leftovers.pool.length > 0) && (
                  <div className="kitchen__day-recipes">
                    <div className="kitchen__day-recipes-row">
                      {recipes.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__pick-recipe"
                          onClick={() => openRecipePick(date, slot)}
                          aria-expanded={pickOpenFor(date, slot)}
                        >
                          <InlineIcon name="book-open-bold" /> {t.kitchen.chooseRecipe}
                        </button>
                      )}
                      {leftovers.pool.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__pick-recipe"
                          onClick={() => openLeftoverPick(date, slot)}
                          aria-expanded={leftoverOpenFor(date, slot)}
                        >
                          <InlineIcon name="arrow-counter-clockwise-bold" /> {t.kitchen.chooseLeftover}
                        </button>
                      )}
                    </div>
                    {pickOpenFor(date, slot) && (
                      <RecipePickerMenu
                        recipes={recipes}
                        lowItems={lowItems}
                        listItems={listItems}
                        onPick={(r) => planRecipe(date, slot, r)}
                      />
                    )}
                    {leftoverOpenFor(date, slot) && (
                      <LeftoverPickerMenu leftovers={leftovers.pool} onPick={(l) => leftovers.plan(date, slot, l)} />
                    )}
                  </div>
                )}
              </EditField>
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
          {!supperEditing && !supperStaples && (
            <button
              type="button"
              className="kitchen__slot-add mono"
              onClick={() => {
                setEditDate(date)
                setMealText('')
              }}
            >
              ＋ {addLabel(suppers.length)}
            </button>
          )}
        </div>
        {supperStaples && staplePrompt ? (
          <div className="kitchen__staples">
            <p className="kitchen__staples-q mono">
              {staplePrompt.title} · {t.kitchen.staplesQ}
            </p>
            <p className="kitchen__staples-hint mono">{t.kitchen.staplesHint}</p>
            <div className="kitchen__staples-chips">
              {staplePrompt.options.map((o) => (
                <button
                  key={o.item}
                  type="button"
                  className={`chip${o.on ? ' is-on' : ''}`}
                  onClick={() => toggleStaple(o.item)}
                  aria-pressed={o.on}
                  title={o.item}
                >
                  <InlineIcon name={o.on ? 'check-square-bold' : 'square-bold'} /> {o.item}
                </button>
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
              onDragStart={mealDnd.start}
              draggingId={mealDnd.activeId}
              dragLabel={t.kitchen.dragMeal}
            />
            {supperEditing && (
              <EditField
                value={mealText}
                onChange={setMealText}
                onSubmit={() => beginSetMeal(date, 'supper')}
                submitLabel={staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                busy={staplesBusy}
                onCancel={() => {
                  setEditDate(null)
                  setMealText('')
                }}
                autoFocus
                placeholder={t.kitchen.plan}
              >
                {(recipes.length > 0 || leftovers.pool.length > 0) && (
                  <div className="kitchen__day-recipes">
                    <div className="kitchen__day-recipes-row">
                      {recipes.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__pick-recipe"
                          onClick={() => openRecipePick(date, 'supper')}
                          aria-expanded={pickOpenFor(date, 'supper')}
                        >
                          <InlineIcon name="book-open-bold" /> {t.kitchen.chooseRecipe}
                        </button>
                      )}
                      {leftovers.pool.length > 0 && (
                        <button
                          type="button"
                          className="btn btn--ghost mono kitchen__pick-recipe"
                          onClick={() => openLeftoverPick(date, 'supper')}
                          aria-expanded={leftoverOpenFor(date, 'supper')}
                        >
                          <InlineIcon name="arrow-counter-clockwise-bold" /> {t.kitchen.chooseLeftover}
                        </button>
                      )}
                    </div>
                    {pickOpenFor(date, 'supper') && (
                      <>
                        {/* Pick a recipe → quick-add (links it, saves now, no
                            staples). Flip this on first to also confirm its
                            ingredients for the grocery list. */}
                        <button
                          type="button"
                          className={'chip kitchen__recipe-staples' + (pickWithStaples ? ' is-on' : '')}
                          onClick={() => setPickWithStaples((s) => !s)}
                          aria-pressed={pickWithStaples}
                        >
                          <InlineIcon name={pickWithStaples ? 'check-square-bold' : 'square-bold'} />{' '}
                          <InlineIcon name="shopping-bag-bold" /> {t.kitchen.alsoStaples}
                        </button>
                        <RecipePickerMenu
                          recipes={recipes}
                          lowItems={lowItems}
                          listItems={listItems}
                          onPick={(r) => planRecipe(date, 'supper', r)}
                        />
                      </>
                    )}
                    {leftoverOpenFor(date, 'supper') && (
                      <LeftoverPickerMenu leftovers={leftovers.pool} onPick={(l) => leftovers.plan(date, 'supper', l)} />
                    )}
                  </div>
                )}
              </EditField>
            )}
          </>
        )}
      </section>

      {/* ── The day's free-text note — last, after the meals ── */}
      <section className="day-mng__sec">
        <p className="day-mng__sec-head mono">
          <Icon name="pencil-simple-bold" size={16} color="var(--ink-soft)" /> {t.kitchen.note}
        </p>
        {editNote === date ? (
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
            ＋ {t.kitchen.note}
          </button>
        )}
      </section>

      {/* Wipe the whole day's meals at once — only when there's something. */}
      {dayMealCount > 0 && (
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
