import { useRef } from 'react'
import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { useModal } from '../../lib/useModal'
import { useSwipeToDismiss } from '../../lib/useSwipeToDismiss'
import { SIDE_SLOTS, SLOT_ICON_NAME } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { Icon, InlineIcon } from '../Icon'
import { MealRows } from './MealRows'
import { RecipePickerMenu } from './RecipePickerMenu'
import { LeftoverPickerMenu } from './LeftoverPickerMenu'
import { type Leftover, type MealRow, type DayNoteRow } from './types'
import { type useMealPlanning } from './useMealPlanning'

// One day's full meal-planning controls, lifted off the week grid into a bottom
// sheet. The grid row stays a calm read-only summary + a single "Gérer" button;
// every edit (add/remove/reorder a meal in any slot, link a recipe, the grocery
// staples step, the day note, clear the day) lives here so two days fit a phone.
// State + handlers stay owned by the Kitchen page — this only renders them for the
// one open day, so the souper/recipe-picker singletons can't fight across days.
//
// Slots read CHRONOLOGICALLY (déjeuner → dîner → collation → souper, note last),
// and each slot's "＋ Ajouter" sits on its header line, not a row of its own.
type Plan = ReturnType<typeof useMealPlanning>

export function DayManageSheet({
  open,
  date,
  title,
  onClose,
  recipes,
  lowItems,
  listItems,
  suppers,
  mealsFor,
  note,
  recipeFor,
  memberName,
  onOpenRecipe,
  plan,
  picker,
  leftovers,
  slotEdit,
  noteEdit,
  actions,
}: {
  open: boolean
  date: number | null
  title: string
  onClose: () => void
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  suppers: MealRow[]
  mealsFor: (date: number, slot: string) => MealRow[]
  note: DayNoteRow | undefined
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  onOpenRecipe: (r: Recipe) => void
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
  }
}) {
  const t = useT()
  const mealPrefs = useMealPrefs()
  const sheetRef = useRef<HTMLDivElement>(null)
  useModal(sheetRef, onClose, { open })
  useSwipeToDismiss(sheetRef, onClose, { open })

  const { editDate, setEditDate, mealText, setMealText, staplesBusy, staplePrompt, saveMeal, beginSetMeal, toggleStaple } = plan
  const { recipePickFor, setRecipePickFor, pickWithStaples, setPickWithStaples, planRecipe } = picker
  const { editSlot, setEditSlot, slotText, setSlotText, saveSlot } = slotEdit
  const { editNote, setEditNote, noteText, setNoteText, saveNote, clearNote } = noteEdit
  const { clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover } = actions
  const pickOpenFor = (d: number, slot: string) => recipePickFor?.date === d && recipePickFor.slot === slot
  const leftoverOpenFor = (d: number, slot: string) => leftovers.pickFor?.date === d && leftovers.pickFor.slot === slot
  // The recipe + leftover pickers share a slot's add-row but only one shows at a
  // time — opening either closes the other so the sheet never stacks two lists.
  const openRecipePick = (d: number, slot: string) => {
    leftovers.setPickFor(null)
    setRecipePickFor(pickOpenFor(d, slot) ? null : { date: d, slot })
  }
  const openLeftoverPick = (d: number, slot: string) => {
    setRecipePickFor(null)
    leftovers.setPickFor(leftoverOpenFor(d, slot) ? null : { date: d, slot })
  }
  const dayMealCount = date != null ? SIDE_SLOTS.reduce((n, s) => n + mealsFor(date, s).length, suppers.length) : 0
  // Add-affordance label: "Ajouter un autre" when the slot already holds a meal,
  // plain "Ajouter" when it's empty (no redundant "＋ Déjeuner" beside the header).
  const addLabel = (count: number) => (count ? t.kitchen.addAnother : t.capture.add)

  const supperEditing = date != null && editDate === date
  const supperStaples = date != null && staplePrompt?.date === date && staplePrompt.slot === 'supper'

  return (
    <>
      <div className={'scrim' + (open ? ' show' : '')} onClick={onClose} aria-hidden="true" />
      <div
        ref={sheetRef}
        className={'sheet' + (open ? ' show' : '')}
        role="dialog"
        aria-modal="true"
        aria-label={title}
      >
        <div className="grab" aria-hidden="true" />
        {date != null && (
          <>
            <h3>{title}</h3>

            {/* ── The lighter slots, in time order: déjeuner / dîner / collation.
                The hero souper follows them so the day reads chronologically. ── */}
            {SIDE_SLOTS.map((slot) => {
              const slotMeals = mealsFor(date, slot)
              const editing = editSlot?.date === date && editSlot.slot === slot
              return (
                <section key={slot} className="day-mng__sec">
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
                  />
                  {editing && (
                    <div className="kitchen__slot-edit-wrap">
                      <form
                        className="kitchen__slot-edit"
                        onSubmit={(e) => {
                          e.preventDefault()
                          saveSlot(date, slot, slotText)
                        }}
                      >
                        <input
                          className="input"
                          autoFocus
                          value={slotText}
                          onChange={(e) => setSlotText(e.target.value)}
                          placeholder={t.kitchen.slots[slot]}
                          aria-label={t.kitchen.slots[slot]}
                        />
                        {slotText && (
                          <button
                            type="button"
                            className="btn btn--ghost mono kitchen__clear-text"
                            onClick={() => setSlotText('')}
                            aria-label={t.kitchen.clearText}
                            title={t.kitchen.clearText}
                          >
                            <Icon name="x-bold" size={15} />
                          </button>
                        )}
                        <button type="submit" className="btn btn--ghost mono">
                          {t.kitchen.setMeal}
                        </button>
                      </form>
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
                      <button
                        type="button"
                        className="btn btn--ghost mono kitchen__add-cancel"
                        onClick={() => {
                          setEditSlot(null)
                          setSlotText('')
                        }}
                      >
                        {t.common.cancel}
                      </button>
                    </div>
                  )}
                </section>
              )
            })}

            {/* ── Souper: the day's hero meal (its own grocery-staples step), shown
                last in the chronological run. ── */}
            <section className="day-mng__sec">
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
                  />
                  {supperEditing && (
                    <div className="kitchen__day-edit-wrap">
                      <form
                        className="kitchen__day-edit"
                        onSubmit={(e) => {
                          e.preventDefault()
                          beginSetMeal(date, 'supper')
                        }}
                      >
                        <input
                          className="input"
                          autoFocus
                          value={mealText}
                          onChange={(e) => setMealText(e.target.value)}
                          placeholder={t.kitchen.plan}
                        />
                        {mealText && (
                          <button
                            type="button"
                            className="btn btn--ghost mono kitchen__clear-text"
                            onClick={() => setMealText('')}
                            aria-label={t.kitchen.clearText}
                            title={t.kitchen.clearText}
                          >
                            <Icon name="x-bold" size={15} />
                          </button>
                        )}
                        <button type="submit" className="btn btn--ghost mono" disabled={staplesBusy}>
                          {staplesBusy ? t.kitchen.staplesThinking : t.kitchen.setMeal}
                        </button>
                      </form>
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
                                <InlineIcon name={pickWithStaples ? 'check-square-bold' : 'square-bold'} /> 🛒 {t.kitchen.alsoStaples}
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
                      <button
                        type="button"
                        className="btn btn--ghost mono kitchen__add-cancel"
                        onClick={() => {
                          setEditDate(null)
                          setMealText('')
                        }}
                      >
                        {t.common.cancel}
                      </button>
                    </div>
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
                <form
                  className="kitchen__note-edit"
                  onSubmit={(e) => {
                    e.preventDefault()
                    saveNote(date, noteText)
                  }}
                >
                  <input
                    className="input"
                    autoFocus
                    value={noteText}
                    onChange={(e) => setNoteText(e.target.value)}
                    placeholder={t.kitchen.notePlaceholder}
                    aria-label={t.kitchen.note}
                  />
                  <button type="submit" className="btn btn--ghost mono">
                    {t.kitchen.setMeal}
                  </button>
                  {note && (
                    <button
                      type="button"
                      className="btn btn--ghost mono kitchen__clear-meal"
                      onClick={() => clearNote(date)}
                    >
                      <InlineIcon name="trash-bold" /> {t.kitchen.clearNote}
                    </button>
                  )}
                </form>
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
                onClick={() => {
                  clearDay(date)
                  onClose()
                }}
              >
                <InlineIcon name="trash-bold" /> {t.kitchen.clearDay}
              </button>
            )}
          </>
        )}
      </div>
    </>
  )
}
