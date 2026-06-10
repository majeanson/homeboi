import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { useLang, useT } from '../i18n'
import { FlyerViewer } from './FlyerViewer'
import { DealCard } from './DealCard'
import { type Deal, type FlyerSummary } from '../lib/deals'
import { existingListId, stageDeal } from '../lib/picks'

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
  // Two ways to browse: by article (search) or by magasin (open a store's flyer).
  const [mode, setMode] = useState<'item' | 'store'>('item')
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [flyer, setFlyer] = useState<{ id: number; itemId: number | null; merchant: string } | null>(null)
  const [store, setStore] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [staged, setStaged] = useState<Set<string>>(new Set())

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
  // Store flyers near the household — only fetched when the "Par magasin" tab is on.
  const flyersQ = useQuery({
    queryKey: ['flyers', dayKey],
    queryFn: () => api<{ flyers: FlyerSummary[] }>('flyers'),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: mode === 'store',
  })
  const storeFlyers = flyersQ.data?.flyers ?? null
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
    // Don't duplicate a line that's already on the list (re-tap, or added by hand).
    if (existingListId(qc, name)) return
    await api('list', { method: 'POST', body: { text: name } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  // Add a deal to the list in one tap — it attaches the deal to its grocery line
  // (reusing an existing line or adding one), which both shows it on the list row
  // and flows it to the cashier. Persisted server-side, so it's there on any device.
  async function stage(deal: Deal) {
    setStaged((prev) => new Set(prev).add(deal.name))
    await stageDeal(qc, deal.name, deal)
  }

  const stores = deals ? [...new Set(deals.map((d) => d.merchant).filter(Boolean))].sort() : []
  const shown = (deals ?? []).filter((d) => !store || d.merchant === store)
  const bestKey = shown.find((d) => d.unitPrice != null)

  return (
    <div
      className="pm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t.shop.browseTitle}
      onClick={(e) => {
        // Only the bare backdrop closes — not bubbled clicks from the sheet or
        // the full-flyer viewer layered on top (those would dump you back to the
        // list when you only meant to pick an item).
        if (e.target === e.currentTarget) onClose()
      }}
    >
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

        {/* Mode switch (search vs browse-a-store) — a segmented control, not chips,
            so it doesn't read as another filter row above the actual filters. */}
        <div className="subtabs deal-tabs" role="tablist" aria-label={t.shop.browseTitle}>
          <button
            type="button"
            role="tab"
            className={`subtabs__opt${mode === 'item' ? ' is-on' : ''}`}
            onClick={() => setMode('item')}
            aria-selected={mode === 'item'}
          >
            🔎 {t.shop.byItem}
          </button>
          <button
            type="button"
            role="tab"
            className={`subtabs__opt${mode === 'store' ? ' is-on' : ''}`}
            onClick={() => setMode('store')}
            aria-selected={mode === 'store'}
          >
            🏬 {t.shop.byStore}
          </button>
        </div>

        {mode === 'item' && (
          <>
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
        {state === 'noPostal' && (
          // Not a dead-end: jump straight to Réglages ▸ Magasinage to fix it.
          <p className="feed-empty">
            {t.shop.noPostal}{' '}
            <Link to="/settings#shopping" className="btn btn--ghost mono">
              {t.shop.setPostal}
            </Link>
          </p>
        )}
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
                staged={staged.has(d.name)}
                onViewFlyer={(deal) => setFlyer({ id: deal.flyerId!, itemId: deal.id, merchant: deal.merchant })}
                onAddToList={addToList}
                onStage={stage}
              />
            ))}
          </ul>
        )}
          </>
        )}

        {mode === 'store' && (
          <>
            {flyersQ.isLoading && <p className="loading mono">{t.shop.searching}</p>}
            {flyersQ.error && (
              <p className="feed-empty">
                {isStatus(flyersQ.error, 400) ? (
                  <>
                    {t.shop.noPostal}{' '}
                    <Link to="/settings#shopping" className="btn btn--ghost mono">
                      {t.shop.setPostal}
                    </Link>
                  </>
                ) : (
                  t.shop.none
                )}
              </p>
            )}
            {storeFlyers && storeFlyers.length === 0 && <p className="feed-empty">{t.shop.none}</p>}
            {storeFlyers && storeFlyers.length > 0 && (
              <div className="flyer-stores">
                {storeFlyers.map((f) => (
                  <button
                    key={f.flyerId}
                    type="button"
                    className="flyer-store"
                    onClick={() => setFlyer({ id: f.flyerId, itemId: null, merchant: f.merchant })}
                  >
                    {f.logo ? (
                      <img className="flyer-store__logo" src={f.logo} alt="" loading="lazy" />
                    ) : (
                      <span className="flyer-store__logo flyer-store__logo--none" aria-hidden="true">🏬</span>
                    )}
                    <span className="flyer-store__name">{f.merchant}</span>
                  </button>
                ))}
              </div>
            )}
          </>
        )}

        <p className="deal__disclaimer mono">{t.shop.disclaimer}</p>
      </div>

      {flyer && (
        <FlyerViewer
          flyerId={flyer.id}
          highlightId={flyer.itemId}
          title={flyer.merchant}
          onAddToList={addToList}
          onStage={stage}
          onClose={() => setFlyer(null)}
        />
      )}
    </div>
  )
}
