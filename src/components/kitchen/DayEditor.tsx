import { useT } from '../../i18n'
import { type Recipe } from '../../lib/recipes'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../../lib/dnd'
import { SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { useMealPrefs } from '../../lib/mealPrefs'
import { type Pill } from '../../lib/recipePills'
import { useMemo } from 'react'
import { Icon, InlineIcon } from '../Icon'
import { EditField } from '../EditField'
import { StatusMessage } from '../StatusMessage'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { SectionAdd } from '../SectionAdd'
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
// and each slot's add affordance sits on its header line, not a row of its own — the
// shared `SectionAdd` ＋ chip, the same one the day page's sections carry, so every
// "add something here" on that scene is the same round ＋ in the same place (it used
// to be a dashed « ＋ Ajouter un autre » pill, one per slot, five of them down the
// page). It flips to ✕ while its composer is open, which is also how you close it.
type Plan = ReturnType<typeof useMealPlanning>

// A stable empty-Set default for `loved` — a fresh `new Set()` literal in the
// props destructure would re-identity every render and defeat the useMemo below.
const EMPTY_LOVED: Set<string> = new Set()

export function DayEditor({
  date,
  recipes,
  lowItems,
  listItems,
  pills = [],
  tagSlots = {},
  loved = EMPTY_LOVED,
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
  hideNote = false,
}: {
  date: number
  recipes: Recipe[]
  lowItems: string[]
  listItems: string[]
  // The household's recipe-pill config + who loved what — decide which recipes
  // get lifted to the top of a slot's picker (a "Dîner & Souper" pill). Optional:
  // omitted/empty behaves exactly as before (cookable-ranked, no priority group).
  pills?: Pill[]
  /** Per-tag meal preferences (Réglages ▸ Recettes ▸ Étiquettes) — a tag can lift its
   *  recipes for a slot on its own, without a pill built around it. */
  tagSlots?: Record<string, MealSlot[]>
  loved?: Set<string>
  suppers: MealRow[]
  mealsFor: (date: number, slot: string) => MealRow[]
  note: DayNoteRow | undefined
  recipeFor: (m: MealRow) => Recipe | undefined
  memberName: (id: string | null | undefined) => string
  // Fired only for a meal that RESOLVED a recipe — the page sends the tap straight to
  // that recipe's view. MealRows' own row actions already own remove/move/rename/restants,
  // so there is nothing a peek in between would add.
  onOpenRecipe: (r: Recipe, m: MealRow) => void
  // A meal save failed (offline / 503) — surface it inline so it never reads as saved.
  mealErr?: boolean
  // The souper planning flow (type a title → save). Owned by the page.
  plan: Pick<Plan, 'editDate' | 'setEditDate' | 'mealText' | 'setMealText' | 'beginSetMeal'>
  // Planning a recipe onto a slot. The dropdown is the combobox's own; only the
  // pick handler lives here.
  picker: {
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
  // Suppress the day-note section — the day-plan page renders the note as a headline
  // at the top instead, so it shouldn't repeat it here. Default false keeps the note
  // for other hosts (VoiturePage).
  hideNote?: boolean
}) {
  const t = useT()
  const mealPrefs = useMealPrefs()
  // Read-only guest: every add/rename/reorder/remove control is hidden. MealRows
  // already renders inert (no drag handle passed below) and the recipe-open survives.
  const ro = isGuest()

  const { editDate, setEditDate, mealText, setMealText, beginSetMeal } = plan
  const { planRecipe } = picker
  const { editSlot, setEditSlot, slotText, setSlotText, saveSlot } = slotEdit
  const { editNote, setEditNote, noteText, setNoteText, saveNote, clearNote } = noteEdit
  const { clearMeal, moveMeal, renameMeal, clearSlotMeals, clearDay, announceLeftover, rescheduleMeal } = actions

  // The day's HERO slot (souper unless the household picked another in Réglages ▸
  // Repas) — it gets the grocery-staples step; the rest are plain slot sections.
  const hero = mealPrefs.hero
  const sideSlots = mealPrefs.sideSlots

  // Cross-slot drag: drag a meal's grip onto another slot's section to move it
  // there (same day). Zones are keyed by slot name (the day is fixed — this page
  // is one day). A drop on a meal's own slot is rejected so it never shows a cue it
  // won't honour. Touch-friendly, so it works on the wall tablet.
  const slotOfMeal = (id: string): string | null => {
    if (suppers.some((m) => m.id === id)) return hero
    for (const s of sideSlots) if (mealsFor(date, s).some((m) => m.id === id)) return s
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
  // Built PER SLOT (not once for the whole day): a pill lifting recipes for
  // "Souper" shouldn't also reorder the "Déjeuner" field.
  const mealOptsFor = useMemo(
    () => (slot: string) =>
      mealPickOptions(recipes, lowItems, listItems, leftovers.pool, t, { slot: slot as MealSlot, pills, loved, tagSlots }),
    [recipes, lowItems, listItems, leftovers.pool, t, pills, loved, tagSlots],
  )
  // Route a combobox pick to the right handler for the given slot.
  const pickMeal = (d: number, slot: string) => (o: ComboOption<MealPick>) => {
    if (o.data.kind === 'recipe') planRecipe(d, slot, o.data.recipe)
    else leftovers.plan(d, slot, o.data.leftover)
  }
  const dayMealCount = sideSlots.reduce((n, s) => n + mealsFor(date, s).length, suppers.length)
  // Add-affordance label: "Ajouter un autre" when the slot already holds a meal,
  // plain "Ajouter" when it's empty (no redundant "＋ Déjeuner" beside the header).
  const addLabel = (count: number) => (count ? t.kitchen.addAnother : t.common.add)

  const supperEditing = editDate === date

  // A lighter slot's section — everything except the hero's grocery-staples step.
  const renderSideSlot = (slot: (typeof sideSlots)[number]) => {
        const slotMeals = mealsFor(date, slot)
        const editing = editSlot?.date === date && editSlot.slot === slot
        return (
          <section
            key={slot}
            data-dnd-zone={slot}
            className={'day-mng__sec' + (mealDnd.over === slot ? ' dnd-over' : '')}
            // The slot's own colour drives its ＋ chip, exactly as the day page's
            // section tints drive theirs — one add affordance, one colour language.
            style={{ '--sec-tint': mealPrefs.color(slot) } as React.CSSProperties}
          >
            <div className="day-mng__sec-head-row">
              <p className="day-mng__sec-head mono">
                <Icon name={SLOT_ICON_NAME[slot]} size={16} color={mealPrefs.color(slot)} /> {t.kitchen.slots[slot]}
              </p>
              {!ro && (
                <SectionAdd
                  open={editing}
                  onToggle={() => {
                    setEditSlot(editing ? null : { date, slot })
                    setSlotText('')
                  }}
                  label={`${addLabel(slotMeals.length)} — ${t.kitchen.slots[slot]}`}
                  readOnly={ro}
                />
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
                options={mealOptsFor(slot)}
                onPick={pickMeal(date, slot)}
                onSubmit={(v) => saveSlot(date, slot, v)}
                noMatchLabel={t.combo.noMatch}
                frequentsKey="meal"
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
  }

  // ── The hero meal. Rendered at its place in the household's order, not pinned
  //    last — only its position in the list sets it apart from a side slot. ──
  const renderHeroSlot = () => (
      <section
        key={hero}
        data-dnd-zone={hero}
        className={'day-mng__sec' + (mealDnd.over === hero ? ' dnd-over' : '')}
        style={{ '--sec-tint': mealPrefs.color(hero) } as React.CSSProperties}
      >
        <div className="day-mng__sec-head-row">
          <p className="day-mng__sec-head mono">
            <Icon name={SLOT_ICON_NAME[hero]} size={16} color={mealPrefs.color(hero)} /> {t.kitchen.slots[hero]}
          </p>
          {!ro && (
            <SectionAdd
              open={supperEditing}
              onToggle={() => {
                setEditDate(supperEditing ? null : date)
                setMealText('')
              }}
              label={`${addLabel(suppers.length)} — ${t.kitchen.slots[hero]}`}
              readOnly={ro}
            />
          )}
        </div>
        <MealRows
          meals={suppers}
          recipeFor={recipeFor}
          memberName={memberName}
          onOpenRecipe={onOpenRecipe}
          onRemove={clearMeal}
          onMove={moveMeal}
          onRename={renameMeal}
          onClearAll={() => clearSlotMeals(date, hero)}
          onLeftover={announceLeftover}
          onDragStart={ro ? undefined : mealDnd.start}
          draggingId={mealDnd.activeId}
          dragLabel={t.kitchen.dragMeal}
        />
        {supperEditing && !ro && (
          // The hero's box: type a free-text meal, or pick a recipe / leftover.
          <EntityCombobox
            value={mealText}
            onChange={setMealText}
            options={mealOptsFor(hero)}
            onPick={pickMeal(date, hero)}
            onSubmit={() => beginSetMeal(date, hero)}
            noMatchLabel={t.combo.noMatch}
            frequentsKey="meal"
            onCancel={() => {
              setEditDate(null)
              setMealText('')
            }}
            autoFocus
            // Named after the HERO slot, like every side slot's field — the old
            // fixed « Quoi pour souper ? » read wrong above a promoted dîner.
            placeholder={t.kitchen.slots[hero]}
          />
        )}
      </section>
  )

  return (
    <>
      {mealErr && <StatusMessage tone="error">{t.common.saveFailed}</StatusMessage>}

      {/* ── Every slot, in the household's order (Réglages ▸ Repas). Out of the box
          that's chronological — déjeuner / dîner / collation / souper / dessert —
          with the hero souper reading last before the note. ── */}
      {mealPrefs.order.map((slot) => (slot === hero ? renderHeroSlot() : renderSideSlot(slot)))}

      {/* ── The day's free-text note — last, after the meals. Suppressed when the
          host renders it elsewhere (the day-plan page lifts it to a headline). ── */}
      {!hideNote && (
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
      )}

      {/* Wipe the whole day's meals at once — only when there's something. Sits
          last, reads red: a deliberate, destructive clear, not a quiet control. */}
      {!ro && dayMealCount > 0 && (
        <button
          type="button"
          className="btn btn--ghost mono kitchen__clear-day"
          onClick={() => clearDay(date)}
        >
          <InlineIcon name="trash-bold" /> {t.kitchen.clearDayMeals}
        </button>
      )}
      <DragGhost ghost={mealDnd.ghost} />
    </>
  )
}
