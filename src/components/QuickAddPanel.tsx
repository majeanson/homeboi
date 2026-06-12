import { useState } from 'react'
import { useT } from '../i18n'
import { pictoFor } from '../lib/picto'

// One re-add candidate for the quick-add panel: something bought before (history)
// and/or near its renewal point (a ghost 'due'/'soon'). Carries the flyer
// synonyms it last shopped with, so re-adding "Pain" restocks "baguette/bread"
// too. The parent (Liste) merges history + ghosts into these and drops anything
// already on the list, so the panel is pure presentation.
export interface QuickItem {
  key: string
  label: string
  count: number
  searchTerms: string[]
  status?: 'due' | 'soon'
}

// Accent/case-blind matching so "creme" filters to "Crème".
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

// The ⚡ Quick add panel: a sheet of past/predicted items. Tap one to add it
// instantly — the panel STAYS open (a running "Added N" counter) so a week's
// staples go on in a few taps. An added chip locks with a ✓ so the same line
// isn't doubled. Typing offers an "Add '<what you typed>'" for anything new.
export function QuickAddPanel({
  items,
  onAdd,
  onClose,
}: {
  items: QuickItem[]
  onAdd: (item: QuickItem) => void
  onClose: () => void
}) {
  const t = useT()
  const [q, setQ] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const fq = fold(q)
  const shown = fq ? items.filter((i) => fold(i.label).includes(fq)) : items
  // Offer a free-text add only when what's typed isn't already a known item.
  const canAddTyped = fq.length > 0 && !items.some((i) => fold(i.label) === fq)

  function add(item: QuickItem) {
    if (added.has(item.key)) return
    onAdd(item)
    setAdded((s) => new Set(s).add(item.key))
  }
  function addTyped() {
    const text = q.trim()
    if (!text) return
    const key = `typed:${fold(text)}`
    onAdd({ key, label: text, count: 0, searchTerms: [] })
    setAdded((s) => new Set(s).add(key))
    setQ('')
  }

  return (
    <div
      className="pm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t.list.quickAddTitle}
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose()
      }}
    >
      <div className="pm-sheet qa" onClick={(e) => e.stopPropagation()}>
        <div className="pm-sheet__head">
          <div>
            <div className="hand-tag">{t.list.quickAddTitle}</div>
            <h2 className="pm-sheet__title">
              ⚡ {t.list.quickAdd}
              {added.size > 0 && <span className="qa__count"> · {t.list.addedN(added.size)}</span>}
            </h2>
          </div>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            ✕
          </button>
        </div>

        <div className="qa__search">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddTyped) {
                e.preventDefault()
                addTyped()
              }
            }}
            placeholder={t.list.quickSearch}
            aria-label={t.list.quickSearch}
          />
        </div>

        <div className="qa__list">
          {canAddTyped && (
            <button type="button" className="qa__chip qa__chip--new" onClick={addTyped}>
              <span className="qa__pic" aria-hidden="true">＋</span>
              <span className="qa__label">{t.list.addNew(q.trim())}</span>
            </button>
          )}
          {shown.map((item) => {
            const isAdded = added.has(item.key)
            return (
              <button
                key={item.key}
                type="button"
                className={`qa__chip${isAdded ? ' is-added' : ''}`}
                onClick={() => add(item)}
                disabled={isAdded}
                aria-label={`${t.ghost.add} ${item.label}`}
              >
                <span className="qa__pic" aria-hidden="true">
                  {pictoFor(item.label, '🛒')}
                </span>
                <span className="qa__label">{item.label}</span>
                {item.status && (
                  <span className={`qa__tag qa__tag--${item.status}`}>
                    {item.status === 'due' ? t.ghost.due : t.ghost.soon}
                  </span>
                )}
                <span className="qa__act" aria-hidden="true">
                  {isAdded ? '✓' : '＋'}
                </span>
              </button>
            )
          })}
          {shown.length === 0 && !canAddTyped && <p className="feed-empty">{t.list.quickEmpty}</p>}
        </div>
      </div>
    </div>
  )
}
