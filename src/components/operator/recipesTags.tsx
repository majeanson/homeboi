import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { RECIPES_KEY, RECIPE_TAGS_KEY, type RecipeTagsData, tagOptions, tagColor } from '../../lib/recipes'
import { wash, tintInk, edge } from '../../lib/colors'
import { useConfirm } from '../../lib/confirm'
import { useWrite } from '../../lib/write'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost, dropCueOf } from '../../lib/dnd'
import { Icon } from '../Icon'
import { ColorPicker } from '../ColorPicker'
import { DragPill } from '../DragPill'
import { EditField } from '../EditField'
import { Chip } from '../Chip'
import { Cluster } from '../Layout'
import { MEAL_SLOTS, type MealSlot } from '../../lib/mealSlots'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { OperatorSection } from './OperatorSection'

// A chip tinted by its tag colour (readable on cream AND dark via the theme-aware
// helpers), so the colour you pick previews in place. No colour → undefined = the
// default chip styling stays.
const chipTint = (hex: string | undefined): React.CSSProperties | undefined =>
  hex ? { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) } : undefined

// Réglages → Recettes: the household tag layer, as ONE ordered list. Every tag —
// a saved preset offered in the recipe form AND every tag already on a recipe —
// sits on a single row, so a tag that's both no longer shows up twice. Per row:
//   · drag ⠿ to reorder (this order drives the recipe form's pills AND the #11
//     collection sections)
//   · a count if it's on recipes, else "Proposée" — a spare preset not used yet
//   · recolour, rename (on ALL recipes at once), remove.
// Each tag carries an optional colour (migration 0037), shown on the chip
// everywhere the tag renders (recipe view, search pills, the form).
export function RecipeTagsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const confirm = useConfirm()
  // Read-only guest: tags read as plain inert chips — no recolor / rename / remove /
  // add (every interactive control here is a write).
  const ro = isGuest()
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const presets = tagsQ.data?.presets ?? []
  const used = tagsQ.data?.used ?? []
  const colors = tagsQ.data?.colors ?? {}
  // Which meal slots each tag is preferred for (lowercase tag → slots).
  const tagSlots = tagsQ.data?.tagSlots ?? {}
  // The one list folds in every tag in use, not just saved presets — so the
  // operator can drag ANY tag into place and that order drives the recipe book's
  // chips AND the #11 collection sections (RecipesTab reads this order). A tag in
  // use that's dragged once becomes a saved preset (offered in the form too).
  const effective = tagOptions(presets, used.map((u) => u.tag), t.recipes.tagPresets)
  // How many recipes carry each tag (case-insensitive), for the per-row count.
  const countFor = new Map(used.map((u) => [u.tag.toLowerCase(), u.count]))

  const [pillInput, setPillInput] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  // Which tag has a drawer open under it, and which one — the colour swatches or the
  // meal-slot chips. ONE state for both, so opening the second closes the first
  // instead of stacking two panes under a single row.
  const [openPane, setOpenPane] = useState<{ key: string; pane: 'color' | 'slots' } | null>(null)

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: RECIPE_TAGS_KEY })
    qc.invalidateQueries({ queryKey: RECIPES_KEY })
  }
  const patch = useMutation({
    mutationFn: (body: {
      presets?: string[]
      rename?: { from: string; to: string }
      remove?: string
      setColor?: { tag: string; color: string | null }
      setTagSlots?: { tag: string; slots: MealSlot[] }
      // Through useWrite — renaming or recolouring a tag is a household
      // preference, so it queues and replays like any other write.
    }) => write('recipe-tags', { method: 'PATCH', body, affectedKeys: [RECIPE_TAGS_KEY, RECIPES_KEY] }),
    onSettled: invalidate,
  })

  // Editing the pill list always writes the FULL effective list, so the first
  // touch turns the built-in starters into the household's own saved set.
  const savePills = (next: string[]) => patch.mutate({ presets: next })
  function addPill(value: string) {
    const s = value.trim()
    if (s && !effective.some((tg) => tg.toLowerCase() === s.toLowerCase())) savePills([...effective, s])
    setPillInput('')
  }

  // Drag a pill onto another to reorder. The saved order drives the recipe book's
  // tag chips AND the #11 collection sections (RecipesTab orders tags by it).
  function movePill(from: number, to: number) {
    if (from === to || from < 0 || to < 0 || from >= effective.length || to >= effective.length) return
    const next = [...effective]
    const [moved] = next.splice(from, 1)
    next.splice(to, 0, moved)
    savePills(next)
  }
  const dnd = usePointerDnd({
    onDrop: (from, to) => movePill(Number(from), Number(to)),
    canDrop: (from, to) => from !== to,
  })

  function commitRename(from: string) {
    const to = renameTo.trim()
    setRenaming(null)
    if (to && to.toLowerCase() !== from.toLowerCase()) patch.mutate({ rename: { from, to } })
  }

  const setColor = (tag: string, color: string | null) => patch.mutate({ setColor: { tag, color } })

  // Which meal slots this tag is for. Toggling one writes the whole list (an empty
  // list clears the preference server-side, so "none" is one state, not two).
  const slotsFor = (tag: string): MealSlot[] => tagSlots[tag.toLowerCase()] ?? []
  const toggleSlot = (tag: string, slot: MealSlot) => {
    const cur = slotsFor(tag)
    patch.mutate({ setTagSlots: { tag, slots: cur.includes(slot) ? cur.filter((x) => x !== slot) : [...cur, slot] } })
  }
  // The chip row dropped under a row when its meal drawer is open — the same control
  // the pill editor uses for the same job (operator/recipePills), so the two read as
  // one idea rather than two spellings of it.
  const slotEditor = (tag: string) => (
    <div className="tag-admin__slotedit">
      <span className="tag-admin__slots-hint">{t.operator.tagSlotsHint}</span>
      <div className="tag-admin__slotpick" role="group" aria-label={t.operator.tagSlotsPick(tag)}>
        {MEAL_SLOTS.map((sl) => (
          <Chip
            key={sl}
            className="tag-admin__slotopt"
            selected={slotsFor(tag).includes(sl)}
            onClick={() => toggleSlot(tag, sl)}
          >
            {t.kitchen.slots[sl]}
          </Chip>
        ))}
      </div>
    </div>
  )

  // The PALETTE dot row + a "no colour" clear, dropped under a row when open.
  const colorEditor = (tag: string) => {
    const cur = tagColor(colors, tag)
    return (
      <div className="tag-admin__coloredit">
        <ColorPicker value={cur ?? ''} onChange={(c) => setColor(tag, c)} label={t.operator.tagColorPick(tag)} />
        {cur && (
          <button type="button" className="btn btn--ghost mono tag-admin__color-clear" onClick={() => setColor(tag, null)}>
            {t.operator.tagColorNone}
          </button>
        )}
      </div>
    )
  }

  return (
    <OperatorSection title={t.operator.tagsTitle} help={help} helpKey="recipeTags">
      {effective.length === 0 ? (
        // Guard the cold load: don't flash the empty state before the query settles.
        tagsQ.isPending ? null : <EmptyState>{t.operator.tagNoneUsed}</EmptyState>
      ) : (
        <ul className="operator__list tag-admin__list">
          {effective.map((tg, i) => {
            const key = tg.toLowerCase()
            const count = countFor.get(key)
            const inUse = count != null
            const openColor = openPane?.key === key && openPane.pane === 'color'
            const openSlots = openPane?.key === key && openPane.pane === 'slots'
            const mySlots = tagSlots[key] ?? []
            return (
              <DragPill
                key={tg}
                as="li"
                dnd={dnd}
                index={i}
                label={tg}
                className="tag-admin__row-wrap"
                gripClassName="tag-admin__grip"
                showGrip={!ro}
                onMove={ro ? undefined : (dir) => movePill(i, dir === 'up' ? i - 1 : i + 1)}
                edge={dropCueOf(dnd, String(i))}
              >
                <div className="tag-admin__row">
                  {!ro && renaming === tg ? (
                    <EditField
                      value={renameTo}
                      onChange={setRenameTo}
                      onSubmit={() => commitRename(tg)}
                      onCancel={() => setRenaming(null)}
                      maxLength={24}
                      autoFocus
                      submitIcon="check-bold"
                      ariaLabel={`${t.operator.tagRename} — ${tg}`}
                      className="tag-admin__rename"
                    />
                  ) : (
                    <>
                      <Chip className="tag-admin__name" style={chipTint(tagColor(colors, tg))}>
                        {tg}
                      </Chip>
                      {/* A count if the tag is on recipes, else "Proposée" — it's a
                          spare preset offered in the form but not used yet. */}
                      <span className="tag-admin__count mono">
                        {inUse ? t.operator.tagOnN(count) : t.operator.tagUnusedHint}
                        {/* Say it on the row, so the preference reads without opening
                            anything — a setting you have to go looking for is a setting
                            nobody remembers making. */}
                        {mySlots.length > 0 && (
                          <span className="tag-admin__slots-on">
                            {t.operator.tagSlotsOn(mySlots.map((sl) => t.kitchen.slots[sl]).join(', '))}
                          </span>
                        )}
                      </span>
                      {/* The row's controls travel as ONE unit (Cluster wraps; never a
                          hand-rolled flex row — CLAUDE.md « Horizontal overflow »). Three
                          of them beside the chip and the count no longer fit a 360px
                          phone on one line, and they simply ran off the right edge: the
                          shell clips, so the pencil and the bin were unreachable. */}
                      {!ro && (
                        <Cluster className="tag-admin__acts">
                          <button
                            type="button"
                            className={`tag-admin__color-btn${openSlots ? ' is-on' : ''}`}
                            onClick={() => setOpenPane(openSlots ? null : { key, pane: 'slots' })}
                            aria-label={t.operator.tagSlotsPick(tg)}
                            aria-expanded={openSlots}
                          >
                            <Icon name="fork-knife-bold" size={16} />
                          </button>
                          <button
                            type="button"
                            className={`tag-admin__color-btn${openColor ? ' is-on' : ''}`}
                            onClick={() => setOpenPane(openColor ? null : { key, pane: 'color' })}
                            aria-label={t.operator.tagColorPick(tg)}
                            aria-expanded={openColor}
                          >
                            <Icon name="paint-brush-bold" size={16} />
                          </button>
                          <RowActions
                            editLabel={t.operator.tagRename}
                            deleteLabel={t.operator.tagRemove}
                            onEdit={() => {
                              setRenaming(tg)
                              setRenameTo(tg)
                            }}
                            onDelete={async () => {
                              // A tag in use → strips it from EVERY recipe: heavy, so a
                              // deliberate confirm. A spare preset (not on any recipe) →
                              // just drop it from the offered list, no confirm needed.
                              if (inUse) {
                                if (await confirm({ message: t.operator.tagRemoveConfirm(tg), confirmLabel: t.operator.tagRemove, tone: 'danger' }))
                                  patch.mutate({ remove: tg })
                              } else {
                                savePills(effective.filter((x) => x !== tg))
                              }
                            }}
                          />
                        </Cluster>
                      )}
                    </>
                  )}
                </div>
                {!ro && openColor && colorEditor(tg)}
                {!ro && openSlots && slotEditor(tg)}
              </DragPill>
            )
          })}
        </ul>
      )}
      {!ro && (
        <EditField
          value={pillInput}
          onChange={setPillInput}
          onSubmit={(v) => addPill(v)}
          placeholder={t.operator.tagAddPill}
          ariaLabel={t.operator.tagAddPill}
          maxLength={24}
          submitIcon="plus-bold"
        />
      )}
      <DragGhost ghost={dnd.ghost} />
    </OperatorSection>
  )
}
