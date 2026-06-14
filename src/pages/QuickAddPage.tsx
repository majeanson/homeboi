import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { api } from '../lib/api'
import { useT } from '../i18n'
import { pictoFor } from '../lib/picto'
import { Icon, InlineIcon } from '../components/Icon'
import { BOARD_KEY } from '../lib/queryKeys'
import { useQuickItems, type QuickItem } from '../lib/quickItems'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// Accent/case-blind matching so "creme" filters to "Crème".
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

const GHOSTS_KEY = ['ghosts']
const HISTORY_KEY = ['list-history']

// /liste/quick — the ⚡ Quick add screen as a full-screen route (was a bottom
// sheet, flaky to scroll): past/predicted items to restock a week in a few taps.
// Tap one to add it instantly — the page STAYS open (a running "Added N" counter)
// so a week's staples go on without leaving; an added chip locks with a ✓ so the
// same line isn't doubled. Typing offers an "Add '<what you typed>'" for anything
// new. The candidate set comes from the shared useQuickItems hook.
export function QuickAddPage() {
  const t = useT()
  const qc = useQueryClient()
  const close = useSceneClose('/liste')
  useEscapeKey(close)
  const items = useQuickItems()

  const [q, setQ] = useState('')
  const [added, setAdded] = useState<Set<string>>(new Set())
  const fq = fold(q)
  const shown = fq ? items.filter((i) => fold(i.label).includes(fq)) : items
  // Offer a free-text add only when what's typed isn't already a known item.
  const canAddTyped = fq.length > 0 && !items.some((i) => fold(i.label) === fq)

  // Add a line (with its remembered flyer synonyms) and refresh so it drops out of
  // the candidate set on the next render. Best-effort, like the rest of quick-add.
  async function postAdd(text: string, terms: string[]) {
    try {
      await api('list', { method: 'POST', body: terms.length ? { text, search_terms: terms } : { text } })
    } finally {
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      qc.invalidateQueries({ queryKey: GHOSTS_KEY })
      qc.invalidateQueries({ queryKey: HISTORY_KEY })
    }
  }

  function add(item: QuickItem) {
    if (added.has(item.key)) return
    void postAdd(item.label, item.searchTerms)
    setAdded((s) => new Set(s).add(item.key))
  }
  function addTyped() {
    const text = q.trim()
    if (!text) return
    const key = `typed:${fold(text)}`
    void postAdd(text, [])
    setAdded((s) => new Set(s).add(key))
    setQ('')
  }

  return (
    <div className="scene" aria-label={t.list.quickAddTitle}>
      <div className="scene__head">
        <div>
          <div className="hand-tag">{t.list.quickAddTitle}</div>
          <h2 className="pm-sheet__title">
            <InlineIcon name="lightning-bold" color="var(--marigold-deep)" /> {t.list.quickAdd}
            {added.size > 0 && <span className="qa__count"> · {t.list.addedN(added.size)}</span>}
          </h2>
        </div>
        <button type="button" className="btn btn--ghost mono" onClick={close} aria-label={t.shop.close}>
          <Icon name="x-bold" size={18} />
        </button>
      </div>

      <div className="scene__body qa">
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
              <span className="qa__pic" aria-hidden="true"><Icon name="plus-bold" size={20} /></span>
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
                  <Icon name={isAdded ? 'check-bold' : 'plus-bold'} size={16} />
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
