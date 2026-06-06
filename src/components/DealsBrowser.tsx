import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { useLang, useT } from '../i18n'
import { FlyerViewer } from './FlyerViewer'
import { DealCard } from './DealCard'
import { type Deal } from '../lib/deals'

// Standalone flyer/deals browser: search what's on sale near the household this
// week and add items straight to the shared list (or open the full flyer and add
// from there). Same /api/deals lookup as the price-match proof sheet, but query-
// driven instead of pinned to one list item — reached from the Liste page. Read-
// only; degrades to a clear message on nothing / no postal.

// A few common Québec grocery staples to seed browsing with no typing. Flipp
// search is bilingual-tolerant, but show the suggestions in the UI language.
const STAPLES: Record<'fr' | 'en', string[]> = {
  fr: ['lait', 'pain', 'œufs', 'poulet', 'bœuf haché', 'fromage', 'pommes', 'bananes', 'café', 'yogourt'],
  en: ['milk', 'bread', 'eggs', 'chicken', 'ground beef', 'cheese', 'apples', 'bananas', 'coffee', 'yogurt'],
}

export function DealsBrowser({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [flyer, setFlyer] = useState<{ id: number; itemId: number | null; merchant: string } | null>(null)
  const [store, setStore] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())

  // Day-scoped cache, shared with the price-match sheet's ['deals', q, day] key —
  // so a term browsed here is instant if matched there (and vice-versa).
  const dayKey = new Date().toISOString().slice(0, 10)
  const dealsQ = useQuery({
    queryKey: ['deals', query, dayKey],
    queryFn: () => api<{ deals: Deal[] }>(`deals?q=${encodeURIComponent(query)}`),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: query.length > 0,
  })
  const deals = dealsQ.data?.deals ?? null
  const state: 'start' | 'loading' | 'ok' | 'empty' | 'noPostal' | 'error' = !query
    ? 'start'
    : dealsQ.isLoading
      ? 'loading'
      : dealsQ.error
        ? isStatus(dealsQ.error, 400)
          ? 'noPostal'
          : 'error'
        : deals && deals.length
          ? 'ok'
          : 'empty'

  function search(q: string) {
    const v = q.trim()
    setInput(v)
    setStore(null)
    setQuery(v)
  }

  async function addToList(name: string) {
    setAdded((prev) => new Set(prev).add(name))
    await api('list', { method: 'POST', body: { text: name } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  const stores = deals ? [...new Set(deals.map((d) => d.merchant).filter(Boolean))].sort() : []
  const shown = (deals ?? []).filter((d) => !store || d.merchant === store)
  const bestKey = shown.find((d) => d.unitPrice != null)

  return (
    <div className="pm-overlay" role="dialog" aria-modal="true" aria-label={t.shop.browseTitle} onClick={onClose}>
      <div className="pm-sheet" onClick={(e) => e.stopPropagation()}>
        <div className="pm-sheet__head">
          <div>
            <div className="hand-tag">{t.shop.browseTitle}</div>
            <h2 className="pm-sheet__title">{t.shop.browseHint}</h2>
          </div>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            ✕
          </button>
        </div>

        <form
          className="deals-search"
          onSubmit={(e) => {
            e.preventDefault()
            search(input)
          }}
        >
          <input
            className="input"
            value={input}
            onChange={(e) => setInput(e.target.value)}
            placeholder={t.shop.search}
            aria-label={t.shop.search}
            autoFocus
          />
          <button type="submit" className="btn" disabled={!input.trim()}>
            🔎
          </button>
        </form>

        <div className="deal-stores mono">
          {STAPLES[lang].map((s) => (
            <button key={s} type="button" className={`chip${query === s ? ' is-on' : ''}`} onClick={() => search(s)}>
              {s}
            </button>
          ))}
        </div>

        {state === 'start' && <p className="feed-empty">{t.shop.browseStart}</p>}
        {state === 'loading' && <p className="loading mono">{t.shop.searching}</p>}
        {state === 'empty' && <p className="feed-empty">{t.shop.none}</p>}
        {state === 'noPostal' && <p className="feed-empty">{t.shop.noPostal}</p>}
        {state === 'error' && <p className="feed-empty">{t.shop.none}</p>}

        {state === 'ok' && stores.length > 1 && (
          <div className="deal-stores mono">
            <button type="button" className={`chip${store === null ? ' is-on' : ''}`} onClick={() => setStore(null)}>
              {t.shop.allStores}
            </button>
            {stores.map((s) => (
              <button key={s} type="button" className={`chip${store === s ? ' is-on' : ''}`} onClick={() => setStore(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {state === 'ok' && (
          <ul className="deal-list">
            {shown.map((d, i) => (
              <DealCard
                key={d.id ?? i}
                deal={d}
                isBest={d === bestKey}
                added={added.has(d.name)}
                onViewFlyer={(deal) => setFlyer({ id: deal.flyerId!, itemId: deal.id, merchant: deal.merchant })}
                onAddToList={addToList}
              />
            ))}
          </ul>
        )}

        <p className="deal__disclaimer mono">{t.shop.disclaimer}</p>
      </div>

      {flyer && (
        <FlyerViewer
          flyerId={flyer.id}
          highlightId={flyer.itemId}
          title={flyer.merchant}
          onAddToList={addToList}
          onClose={() => setFlyer(null)}
        />
      )}
    </div>
  )
}
