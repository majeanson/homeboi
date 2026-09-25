import { useEffect, useState, type ReactNode } from 'react'
import { Modal } from './Modal'
import { Icon } from './Icon'
import { useT } from '../i18n'

// A « review-then-apply » checklist in a Modal: show a batch of proposed changes,
// tick which ones to keep (all preselected), then apply the whole list or just the
// selection. The shared shape behind the .vcf contact import (#44) AND « Compléter
// les familles » — any flow that proposes a set of writes and wants a final human
// OK before committing them. Generic over the item type; the caller renders each row
// and runs the writes in `onApply`.
export interface ReviewChecklistProps<T> {
  open: boolean
  onClose: () => void
  title: string
  items: T[]
  renderItem: (item: T, index: number) => ReactNode // the row's content (name + optional sub)
  onApply: (selected: T[]) => void
  applyAllLabel: (count: number) => string // "Import all (N)" — applies every item
  applySelectedLabel: (count: number) => string // "Apply selection (N)" — applies the ticked ones
  emptyLabel?: string // shown when there's nothing to review
  busy?: boolean // disable the action buttons while writes are in flight
}

export function ReviewChecklist<T>({
  open,
  onClose,
  title,
  items,
  renderItem,
  onApply,
  applyAllLabel,
  applySelectedLabel,
  emptyLabel,
  busy = false,
}: ReviewChecklistProps<T>) {
  const t = useT()
  // Which indices are ticked — all preselected when a review OPENS or its batch changes
  // size. NOT on the array's identity: every parent builds `items` inline, so any
  // re-render above (a refetch landing, a poll tick) minted a new array and this effect
  // quietly re-ticked what someone had just unticked — CI caught it twice on 2026-09-25
  // (family-import.spec: Théo unticked, then « Ajouter la sélection (3) »), and a person
  // unticking a relative while the cercle query refreshed lost the untick the same way.
  // A pick is theirs until the review closes (ReviewChecklist.test.ts holds it).
  const [picked, setPicked] = useState<Set<number>>(() => new Set(items.map((_, i) => i)))
  useEffect(() => {
    setPicked(new Set(items.map((_, i) => i)))
    // eslint-disable-next-line react-hooks/exhaustive-deps -- identity is the bug, see above
  }, [open, items.length])

  const allOn = picked.size === items.length && items.length > 0

  return (
    <Modal open={open} onClose={onClose} title={title}>
      {items.length === 0 ? (
        <p className="review__empty">{emptyLabel ?? ''}</p>
      ) : (
        <div className="review">
          <button
            type="button"
            className="btn btn--sm btn--ghost review__all"
            onClick={() => setPicked(allOn ? new Set() : new Set(items.map((_, i) => i)))}
          >
            <Icon name={allOn ? 'square-bold' : 'check-square-bold'} size={16} />
            {allOn ? t.cercle.unselectAll : t.cercle.selectAll}
          </button>
          <ul className="review__list">
            {items.map((item, i) => (
              <li key={i}>
                <label className="review__row">
                  <input
                    type="checkbox"
                    checked={picked.has(i)}
                    onChange={() =>
                      setPicked((s) => {
                        const n = new Set(s)
                        if (n.has(i)) n.delete(i)
                        else n.add(i)
                        return n
                      })
                    }
                  />
                  {renderItem(item, i)}
                </label>
              </li>
            ))}
          </ul>
          <div className="review__actions">
            <button type="button" className="btn btn--sm btn--ghost" disabled={busy} onClick={() => onApply(items)}>
              {applyAllLabel(items.length)}
            </button>
            <button
              type="button"
              className="btn btn--sm btn--primary"
              disabled={busy || picked.size === 0}
              onClick={() => onApply(items.filter((_, i) => picked.has(i)))}
            >
              {applySelectedLabel(picked.size)}
            </button>
          </div>
        </div>
      )}
    </Modal>
  )
}
