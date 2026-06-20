import { useState } from 'react'
import { Navigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useWrite } from '../lib/write'
import { isGuest } from '../lib/device'
import { useT } from '../i18n'
import { pictoFor } from '../lib/picto'
import { Icon, InlineIcon } from '../components/Icon'
import { SceneHead } from '../components/SceneHead'
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
  const write = useWrite()
  const close = useSceneClose('/liste')
  useEscapeKey(close)
  const items = useQuickItems()

  const [q, setQ] = useState('')
  const [alpha, setAlpha] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  // The entire scene is a restock/add tool — nothing here but writes. A read-only
  // guest has no business on it; slip back to the list (also guards a deep link).
  // Placed after every hook so this isn't a conditional-hook violation.
  const ro = isGuest()
  const fq = fold(q)
  const filtered = fq ? items.filter((i) => fold(i.label).includes(fq)) : items
  // Default order is status/frequency (from useQuickItems); the Aa toggle re-sorts
  // the same set alphabetically so a long list is easy to scan by name.
  const shown = alpha ? [...filtered].sort((a, b) => a.label.localeCompare(b.label)) : filtered
  // #27: standing staples ride at the top under a "Toujours" header — a
  // deterministic always-on group for the household's never-forget items, distinct
  // from the predicted/past ones below.
  const alwaysItems = shown.filter((i) => i.always)
  const restItems = shown.filter((i) => !i.always)
  // Offer a free-text add only when what's typed isn't already a known item.
  const canAddTyped = fq.length > 0 && !items.some((i) => fold(i.label) === fq)

  // Add a line (with its remembered flyer synonyms) and refresh so it drops out of
  // the candidate set on the next render. Best-effort, like the rest of quick-add.
  async function postAdd(text: string, terms: string[]) {
    await write('list', {
      method: 'POST',
      body: terms.length ? { text, search_terms: terms } : { text },
      affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
    }).catch(() => {})
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

  // One candidate chip — shared by the "Toujours" group and the rest, so the two
  // groups draw identical rows (just a different header above them).
  function renderChip(item: QuickItem) {
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
  }

  if (ro) return <Navigate to="/liste" replace />

  return (
    <div className="scene" aria-label={t.list.quickAddTitle}>
      <SceneHead
        title={
          <>
            <InlineIcon name="lightning-bold" color="var(--marigold-deep)" /> {t.list.quickAdd}
            {added.size > 0 && <span className="qa__count"> · {t.list.addedN(added.size)}</span>}
          </>
        }
        card="liste"
        onClose={close}
        closeLabel={t.shop.close}
      />

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
          <button
            type="button"
            className={`qa__sort${alpha ? ' is-on' : ''}`}
            onClick={() => setAlpha((v) => !v)}
            aria-pressed={alpha}
            aria-label={t.list.quickSortAlpha}
            title={t.list.quickSortAlpha}
          >
            Aa
          </button>
        </div>

        <div className="qa__list">
          {canAddTyped && (
            <button type="button" className="qa__chip qa__chip--new" onClick={addTyped}>
              <span className="qa__pic" aria-hidden="true"><Icon name="plus-bold" size={20} /></span>
              <span className="qa__label">{t.list.addNew(q.trim())}</span>
            </button>
          )}
          {alwaysItems.length > 0 && (
            <>
              <p className="qa__grouphead mono">
                <InlineIcon name="push-pin-bold" size={13} /> {t.list.quickAlways}
              </p>
              {alwaysItems.map(renderChip)}
            </>
          )}
          {alwaysItems.length > 0 && restItems.length > 0 && (
            <p className="qa__grouphead mono">{t.list.quickOthers}</p>
          )}
          {restItems.map(renderChip)}
          {shown.length === 0 && !canAddTyped && <EmptyState>{t.list.quickEmpty}</EmptyState>}
        </div>
      </div>
    </div>
  )
}
