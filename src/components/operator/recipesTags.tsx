import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { api } from '../../lib/api'
import { RECIPES_KEY, RECIPE_TAGS_KEY, type RecipeTagsData, tagOptions, tagColor } from '../../lib/recipes'
import { wash, tintInk, edge } from '../../lib/colors'
import { useConfirm } from '../../lib/confirm'
import { isGuest } from '../../lib/device'
import { usePointerDnd, DragGhost } from '../../lib/dnd'
import { Icon, InlineIcon } from '../Icon'
import { ColorPicker } from '../ColorPicker'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'

// A chip tinted by its tag colour (readable on cream AND dark via the theme-aware
// helpers), so the colour you pick previews in place. No colour → undefined = the
// default chip styling stays.
const chipTint = (hex: string | undefined): React.CSSProperties | undefined =>
  hex ? { background: wash(hex), color: tintInk(hex), borderColor: edge(hex) } : undefined

// Réglages → Recettes: the household tag layer. Two strips:
//   · the preset pills offered in the recipe form (chips, editable in place)
//   · every tag in use, with a count — rename or remove it on ALL recipes at
//     once, so cleaning up "Végé / végé / vege" never means opening each card.
// Each tag also carries an optional colour (migration 0037), picked here and shown
// on the chip everywhere the tag renders (recipe view, search pills, the form).
export function RecipeTagsSection({ help }: { help?: HelpMode }) {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()
  // Read-only guest: tags read as plain inert chips — no recolor / rename / remove /
  // add (every interactive control here is a write).
  const ro = isGuest()
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const presets = tagsQ.data?.presets ?? []
  const used = tagsQ.data?.used ?? []
  const colors = tagsQ.data?.colors ?? {}
  // The ORDER strip folds in every tag in use, not just saved presets — so the
  // operator can drag ANY tag into place and that order drives the recipe book's
  // chips AND the #11 collection sections (RecipesTab reads this order). A tag in
  // use that's dragged once becomes a saved preset (offered in the form too).
  const effective = tagOptions(presets, used.map((u) => u.tag), t.recipes.tagPresets)
  // In-use tags can't be removed from the ORDER with the chip ✕ (they'd just
  // reappear, since they're still on recipes) — they're deleted from the "in use"
  // list below, which strips them off every recipe. The ✕ stays for spare presets.
  const usedKeys = new Set(used.map((u) => u.tag.toLowerCase()))

  const [pillInput, setPillInput] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')
  // Which tag's colour picker is open. Location-qualified ("preset:x" / "used:x")
  // so a tag that's both a preset and in use opens only where you clicked.
  const [coloring, setColoring] = useState<string | null>(null)

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
    }) => api('recipe-tags', { method: 'PATCH', body }),
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

  // The PALETTE dot row + a "no colour" clear, reused under both strips.
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
    <section className="surface operator__section">
      <HelpTitle help={help} k="recipeTags">{t.operator.tagsTitle}</HelpTitle>
      {help?.bubbleFor('recipeTags')}

      <HelpTitle as="h3" className="operator__sub" help={help} k="tagPills">{t.operator.tagPills}</HelpTitle>
      {help?.bubbleFor('tagPills')}
      <div className="tag-admin__pills">
        {effective.map((tg, i) => {
          const key = `preset:${tg.toLowerCase()}`
          const open = coloring === key
          if (ro) {
            return (
              <span key={tg} className="chip tag-admin__pill" style={chipTint(tagColor(colors, tg))}>
                {tg}
              </span>
            )
          }
          return (
            <span
              key={tg}
              data-dnd-zone={String(i)}
              className={
                'chip tag-admin__pill' +
                (open ? ' is-editing' : '') +
                (dnd.activeId === String(i) ? ' is-dragging' : '') +
                (dnd.over === String(i) ? ' dnd-over' : '')
              }
              style={chipTint(tagColor(colors, tg))}
            >
              <span
                className="tag-admin__pill-grip dnd-grip"
                data-dnd-grip=""
                role="button"
                aria-label={t.operator.dragHint}
                title={t.operator.dragHint}
                onPointerDown={(e) => dnd.start(String(i), tg, e)}
              >
                ⠿
              </span>
              <button
                type="button"
                className="tag-admin__pill-name"
                onClick={() => setColoring(open ? null : key)}
                aria-label={t.operator.tagColorPick(tg)}
                aria-expanded={open}
              >
                {tg}
              </button>
              {!usedKeys.has(tg.toLowerCase()) && (
                <button
                  type="button"
                  className="tag-admin__pill-x"
                  onClick={() => savePills(effective.filter((x) => x !== tg))}
                  aria-label={`${t.operator.tagRemove} — ${tg}`}
                >
                  <InlineIcon name="x-bold" size={12} />
                </button>
              )}
            </span>
          )
        })}
      </div>
      {!ro &&
        coloring?.startsWith('preset:') &&
        (() => {
          const tg = effective.find((x) => `preset:${x.toLowerCase()}` === coloring)
          return tg ? colorEditor(tg) : null
        })()}
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

      <HelpTitle as="h3" className="operator__sub" help={help} k="tagUsed">{t.operator.tagUsed}</HelpTitle>
      {help?.bubbleFor('tagUsed')}
      {used.length === 0 ? (
        <p className="board__empty mono">{t.operator.tagNoneUsed}</p>
      ) : (
        <ul className="operator__list tag-admin__list">
          {used.map(({ tag, count }) => {
            const key = `used:${tag.toLowerCase()}`
            const open = coloring === key
            return (
              <li key={tag.toLowerCase()} className="tag-admin__row-wrap">
                <div className="tag-admin__row">
                  {!ro && renaming === tag ? (
                    <EditField
                      value={renameTo}
                      onChange={setRenameTo}
                      onSubmit={() => commitRename(tag)}
                      onCancel={() => setRenaming(null)}
                      maxLength={24}
                      autoFocus
                      submitIcon="check-bold"
                      ariaLabel={`${t.operator.tagRename} — ${tag}`}
                      className="tag-admin__rename"
                    />
                  ) : (
                    <>
                      <span className="chip tag-admin__name" style={chipTint(tagColor(colors, tag))}>
                        {tag}
                      </span>
                      <span className="tag-admin__count mono">{t.operator.tagOnN(count)}</span>
                      {!ro && (
                        <button
                          type="button"
                          className={`tag-admin__color-btn${open ? ' is-on' : ''}`}
                          onClick={() => setColoring(open ? null : key)}
                          aria-label={t.operator.tagColorPick(tag)}
                          aria-expanded={open}
                        >
                          <Icon name="paint-brush-bold" size={16} />
                        </button>
                      )}
                      <RowActions
                        editLabel={t.operator.tagRename}
                        deleteLabel={t.operator.tagRemove}
                        onEdit={() => {
                          setRenaming(tag)
                          setRenameTo(tag)
                        }}
                        onDelete={async () => {
                          // Removing a tag strips it from EVERY recipe — heavy, so a
                          // deliberate confirm (the in-app dialog, not platform confirm).
                          if (await confirm({ message: t.operator.tagRemoveConfirm(tag), confirmLabel: t.operator.tagRemove, tone: 'danger' }))
                            patch.mutate({ remove: tag })
                        }}
                      />
                    </>
                  )}
                </div>
                {!ro && open && colorEditor(tag)}
              </li>
            )
          })}
        </ul>
      )}
      <DragGhost ghost={dnd.ghost} />
    </section>
  )
}
