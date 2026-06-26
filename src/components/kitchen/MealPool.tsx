import { useState, type ReactNode } from 'react'
import type { QueryKey } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { isGuest } from '../../lib/device'
import { type MealSlot } from '../../lib/mealSlots'
import { EntityCombobox, type ComboOption } from '../EntityCombobox'
import { MealPlanPicker } from './MealPlanPicker'
import { Icon } from '../Icon'
import { EditField } from '../EditField'
import { useInlineEdit } from '../../lib/useInlineEdit'
import { RowActions } from '../RowActions'
import { useSingleOpen } from '../Disclosure'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'

export interface MealPoolLabels {
  heading: string
  addAria: string
  addPlaceholder: string // shown when there are no pick options (else t.combo.typeOrPick)
  empty: string
  removeLabel: string
  removedUndo: (title: string) => string
}

// A "meal pool" — a reusable shortlist of meal candidates under the week grid that
// you plan onto a day. TWO instances share this EXACT behaviour + markup: « Idées de
// repas » (reusable ideas) and « Restants » (leftovers — consumed when planned). They
// were ~85% copy-pasted; the genuine differences are injected here: the endpoint, the
// add body, the lead picto, the plan action (reusable vs consumed-with-compensating-
// undo), the combobox options, and the copy. Everything else — add via EntityCombobox,
// live-poll-safe deferred delete + undo (useDeferredRemoval), inline rename
// (useInlineEdit + EditField, optimistic PATCH), tap-to-reveal the one-at-a-time plan
// picker (useSingleOpen + MealPlanPicker) — lives here so the two pools can't drift.
//
// Pantry/Todos are deliberately NOT folded in: their primary action (check-and-add-to
// -list / toggle-in-place) and CheckRow markup differ — only the two meal pools are
// true twins. `T` is the row type, `O` the combobox option's entity (a Recipe for
// ideas, a MealRow for leftovers).
export function MealPool<T extends { id: string; title: string }, O>({
  items,
  queryKey,
  collectionKey,
  endpoint,
  options,
  buildAddBody,
  onPlan,
  renderLead,
  week,
  help,
  helpKey,
  labels,
  noMatchLabel,
}: {
  items: T[]
  queryKey: QueryKey
  collectionKey: string // the field holding the array in the query data ('ideas' | 'leftovers')
  endpoint: string
  options: ComboOption<O>[]
  buildAddBody: (title: string, picked: ComboOption<O> | null) => object
  onPlan: (item: T, date: number, slot: MealSlot) => void
  renderLead: (item: T) => ReactNode // the leading picto inside the chip (e.g. a recipe book glyph)
  week: { date: number; label: string }[]
  help?: HelpMode
  helpKey: string
  labels: MealPoolLabels
  noMatchLabel?: string
}) {
  const t = useT()
  const write = useWrite()
  // Bulletproof calm-delete for this LIVE-POLLED pool (see useDeferredRemoval): hide +
  // filter the removed row and await a refetch before un-hiding, so a poll can't
  // resurrect it mid-undo. Undo cancels the held DELETE — the row keeps its id.
  const removal = useDeferredRemoval(queryKey)
  const ro = isGuest() // read-only guest: no add / pick / plan / edit
  const [text, setText] = useState('')
  // Tap a row to reveal its plan-onto-a-day picker — one open at a time.
  const { isOpen, toggle, close } = useSingleOpen()
  const [planSlot, setPlanSlot] = useState<MealSlot>('supper')
  const [busy, setBusy] = useState(false)
  const edit = useInlineEdit() // which row is renaming + its draft

  function add(rawTitle: string, picked: ComboOption<O> | null) {
    const v = rawTitle.trim()
    if (!v || busy) return
    setBusy(true)
    write(endpoint, { method: 'POST', body: buildAddBody(v, picked), affectedKeys: [queryKey] })
      .then(() => setText(''))
      .catch(() => {
        /* keep the typed text so it can be retried */
      })
      .finally(() => setBusy(false))
  }

  function removeItem(item: T) {
    removal.remove([item.id], labels.removedUndo(item.title), () =>
      write(endpoint, { method: 'DELETE', body: { id: item.id }, affectedKeys: [queryKey] }).catch(() => {}),
    )
  }

  function rename(item: T, title: string) {
    const v = title.trim()
    if (!v || v === item.title) return
    // Optimistic rename, then persist (the pool is live-polled, so reflect it now).
    write(endpoint, {
      method: 'PATCH',
      body: { id: item.id, title: v },
      affectedKeys: [queryKey],
      optimistic: (c) =>
        c.setQueryData<Record<string, T[]>>(queryKey, (d) =>
          d ? { ...d, [collectionKey]: d[collectionKey].map((x) => (x.id === item.id ? { ...x, title: v } : x)) } : d,
        ),
    }).catch(() => {})
  }

  const planOn = (item: T, date: number, slot: MealSlot) => {
    close()
    onPlan(item, date, slot)
  }

  const visible = removal.visible(items)
  return (
    <section className="kitchen__ideas">
      <div className="kitchen__head">
        <HelpTitle help={help} k={helpKey}>{labels.heading}</HelpTitle>
      </div>
      {help?.bubbleFor(helpKey)}

      {!ro && (
        // Type a free-text candidate OR pick an existing entity (a recipe / a recent
        // meal) from the same box — the dropdown filters as you type.
        <EntityCombobox
          value={text}
          onChange={setText}
          options={options}
          onPick={(o) => add(o.label, o)}
          onSubmit={(v) => add(v, null)}
          submitIcon="plus-bold"
          placeholder={options.length > 0 ? t.combo.typeOrPick : labels.addPlaceholder}
          ariaLabel={labels.addAria}
          noMatchLabel={noMatchLabel}
          busy={busy}
          className="kitchen__ideas-combo"
        />
      )}

      {visible.length === 0 ? (
        <p className="kitchen__ideas-empty mono">{labels.empty}</p>
      ) : (
        <ul className="kitchen__ideas-list">
          {visible.map((item) => (
            <li key={item.id} className="kitchen__idea">
              <div className="kitchen__idea-row">
                {edit.editId === item.id && !ro ? (
                  <EditField
                    value={edit.text}
                    onChange={edit.setText}
                    onSubmit={(v) => {
                      edit.cancel()
                      rename(item, v)
                    }}
                    onCancel={edit.cancel}
                    clearable={false}
                    ariaLabel={t.common.edit}
                    autoFocus
                  />
                ) : (
                  <>
                    {ro ? (
                      <span className="chip kitchen__idea-name" aria-disabled="true">
                        {renderLead(item)}
                        {item.title}
                      </span>
                    ) : (
                      <button
                        type="button"
                        className={'chip kitchen__idea-name' + (isOpen(item.id) ? ' is-open' : '')}
                        onClick={() => toggle(item.id)}
                        aria-expanded={isOpen(item.id)}
                      >
                        {renderLead(item)}
                        {item.title}
                        <span className="kitchen__idea-caret" aria-hidden="true">
                          <Icon name="caret-down-bold" size={12} />
                        </span>
                      </button>
                    )}
                    <RowActions
                      editLabel={t.common.edit}
                      deleteLabel={labels.removeLabel}
                      onEdit={() => edit.open(item.id, item.title)}
                      onDelete={() => removeItem(item)}
                    />
                  </>
                )}
              </div>
              {!ro && isOpen(item.id) && (
                <MealPlanPicker slot={planSlot} onSlot={setPlanSlot} week={week} onPickDay={(date) => planOn(item, date, planSlot)} />
              )}
            </li>
          ))}
        </ul>
      )}
    </section>
  )
}
