import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { RECIPES_KEY, RECIPE_TAGS_KEY, type RecipeTagsData, tagOptions } from '../../lib/recipes'
import { useConfirm } from '../../lib/confirm'
import { Icon, InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'

// Réglages → Recettes: the household tag layer. Two strips:
//   · the preset pills offered in the recipe form (chips, editable in place)
//   · every tag in use, with a count — rename or remove it on ALL recipes at
//     once, so cleaning up "Végé / végé / vege" never means opening each card.
export function RecipeTagsSection() {
  const t = useT()
  const qc = useQueryClient()
  const confirm = useConfirm()
  const tagsQ = useQuery({ queryKey: RECIPE_TAGS_KEY, queryFn: () => api<RecipeTagsData>('recipe-tags') })
  const presets = tagsQ.data?.presets ?? []
  const used = tagsQ.data?.used ?? []
  // What the form actually offers today (presets, or the built-in starters).
  const effective = tagOptions(presets, [], t.recipes.tagPresets)

  const [pillInput, setPillInput] = useState('')
  const [renaming, setRenaming] = useState<string | null>(null)
  const [renameTo, setRenameTo] = useState('')

  const invalidate = () => {
    qc.invalidateQueries({ queryKey: RECIPE_TAGS_KEY })
    qc.invalidateQueries({ queryKey: RECIPES_KEY })
  }
  const patch = useMutation({
    mutationFn: (body: { presets?: string[]; rename?: { from: string; to: string }; remove?: string }) =>
      api('recipe-tags', { method: 'PATCH', body }),
    onSettled: invalidate,
  })

  // Editing the pill list always writes the FULL effective list, so the first
  // touch turns the built-in starters into the household's own saved set.
  const savePills = (next: string[]) => patch.mutate({ presets: next })
  function addPill() {
    const s = pillInput.trim()
    if (s && !effective.some((tg) => tg.toLowerCase() === s.toLowerCase())) savePills([...effective, s])
    setPillInput('')
  }

  function commitRename(from: string) {
    const to = renameTo.trim()
    setRenaming(null)
    if (to && to.toLowerCase() !== from.toLowerCase()) patch.mutate({ rename: { from, to } })
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.tagsTitle}</h2>
      <p className="lead">{t.operator.tagsHint}</p>

      <h3 className="operator__sub">{t.operator.tagPills}</h3>
      <p className="mono operator__hint">{t.operator.tagPillsHint}</p>
      <div className="tag-admin__pills">
        {effective.map((tg) => (
          <button
            key={tg}
            type="button"
            className="chip is-on"
            onClick={() => savePills(effective.filter((x) => x !== tg))}
            aria-label={`${t.operator.tagRemove} — ${tg}`}
          >
            {tg} <InlineIcon name="x-bold" size={12} />
          </button>
        ))}
      </div>
      <form
        className="operator__inline-form"
        onSubmit={(e) => {
          e.preventDefault()
          addPill()
        }}
      >
        <input
          className="input"
          value={pillInput}
          onChange={(e) => setPillInput(e.target.value)}
          placeholder={t.operator.tagAddPill}
          aria-label={t.operator.tagAddPill}
          maxLength={24}
        />
        <button type="submit" className="btn" disabled={!pillInput.trim()}>
          ＋
        </button>
      </form>

      <h3 className="operator__sub">{t.operator.tagUsed}</h3>
      {used.length === 0 ? (
        <p className="board__empty mono">{t.operator.tagNoneUsed}</p>
      ) : (
        <ul className="operator__list tag-admin__list">
          {used.map(({ tag, count }) => (
            <li key={tag.toLowerCase()} className="tag-admin__row">
              {renaming === tag ? (
                <form
                  className="tag-admin__rename"
                  onSubmit={(e) => {
                    e.preventDefault()
                    commitRename(tag)
                  }}
                >
                  <input
                    className="input"
                    value={renameTo}
                    onChange={(e) => setRenameTo(e.target.value)}
                    maxLength={24}
                    autoFocus
                    aria-label={`${t.operator.tagRename} — ${tag}`}
                  />
                  <button type="submit" className="btn" disabled={!renameTo.trim()} aria-label={t.operator.tagRename}>
                    <Icon name="check-bold" size={16} />
                  </button>
                  <button type="button" className="btn btn--ghost mono" onClick={() => setRenaming(null)}>
                    <Icon name="x-bold" size={15} />
                  </button>
                </form>
              ) : (
                <>
                  <span className="chip tag-admin__name">{tag}</span>
                  <span className="tag-admin__count mono">{t.operator.tagOnN(count)}</span>
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
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
