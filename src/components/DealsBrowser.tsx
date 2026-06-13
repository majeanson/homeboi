import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { useLang, useT } from '../i18n'
import { FlyerViewer } from './FlyerViewer'
import { DealCard } from './DealCard'
import { type Deal, type FlyerSummary } from '../lib/deals'
import { existingListId, stageDeal } from '../lib/picks'
import { useEscapeKey } from '../lib/sceneNav'
import { useTabParam } from '../lib/tabParam'

// Standalone flyer/deals browser: search what's on sale near the household this
// week and add items straight to the shared list (or open the full flyer and add
// from there). Same /api/deals lookup as the price-match proof sheet, but query-
// driven instead of pinned to one list item — its own route (/liste/circulaires)
// reached from the Liste page, so it's a full-screen scene with native back, not
// a sheet stacked over the list. Read-only; degrades to a clear message on
// nothing / no postal.

// A few common Québec grocery staples to seed browsing with no typing. Flipp
// search is bilingual-tolerant, but show the suggestions in the UI language.
const STAPLES: Record<'fr' | 'en', string[]> = {
  fr: ['lait', 'pain', 'œufs', 'poulet', 'bœuf haché', 'fromage', 'pommes', 'bananes', 'café', 'yogourt'],
  en: ['milk', 'bread', 'eggs', 'chicken', 'ground beef', 'cheese', 'apples', 'bananas', 'coffee', 'yogurt'],
}

// A store flyer is either in effect now or published for a future week (Flipp puts
// next week's out ~1-2 days early). The split lets you open the upcoming one to
// prepare next week's list before it's even live.
function flyerWhen(f: FlyerSummary, now: number): 'current' | 'upcoming' {
  const vf = f.validFrom ? Date.parse(f.validFrom) : NaN
  return !Number.isNaN(vf) && vf > now ? 'upcoming' : 'current'
}

// "11 juin – 17 juin" — the run dates the cashier checks, in the UI language.
function fmtRange(f: FlyerSummary, lang: 'fr' | 'en'): string {
  const loc = lang === 'fr' ? 'fr-CA' : 'en-CA'
  const opt = { month: 'short', day: 'numeric' } as const
  const from = f.validFrom ? new Date(f.validFrom).toLocaleDateString(loc, opt) : ''
  const to = f.validTo ? new Date(f.validTo).toLocaleDateString(loc, opt) : ''
  if (from && to) return `${from} – ${to}`
  return to || from || ''
}

export function DealsBrowser({ onClose }: { onClose: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const qc = useQueryClient()
  // Two ways to browse: by article (search) or by magasin (open a store's flyer).
  // Held in the URL (?view=) so the chosen tab survives a remount and is shareable.
  const [mode, setMode] = useTabParam('view', 'item', ['item', 'store'] as const)
  const [input, setInput] = useState('')
  const [query, setQuery] = useState('')
  const [flyer, setFlyer] = useState<{ id: number; itemId: number | null; merchant: string; logo?: string | null; premium?: boolean } | null>(null)
  const [store, setStore] = useState<string | null>(null)
  const [added, setAdded] = useState<Set<string>>(new Set())
  const [staged, setStaged] = useState<Set<string>>(new Set())
  // Esc leaves the scene — but not while the full flyer is open over it (that
  // overlay owns Esc), so one keypress doesn't pop both layers.
  useEscapeKey(onClose, !flyer)

  // Day-scoped cache, shared with the price-match sheet's ['deals', q, day] key —
  // so a term browsed here is instant if matched there (and vice-versa).
  const dayKey = new Date().toISOString().slice(0, 10)
  const now = Date.now()
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

  // The grocery line a browsed deal belongs to. Searching BY ITEM, that's the
  // generic thing the user looked up ("oeufs") — never the flyer's specific product
  // ("Oeuf blanc sélection") — so the deal rides on the recurring item and the
  // quick-add suggestions stay generic. Browsing a whole store flyer has no such
  // search concept, so there the product name is the best we have.
  const lineName = (productName: string) => (mode === 'item' && query.trim() ? query.trim() : productName)

  async function addToList(name: string) {
    setAdded((prev) => new Set(prev).add(name))
    const line = lineName(name)
    // Don't duplicate a line that's already on the list (matched by name or synonym).
    if (existingListId(qc, line)) return
    await api('list', { method: 'POST', body: { text: line } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  // Add a deal to the list in one tap — it attaches the deal to its grocery line
  // (the recurring item, reusing an existing line or adding one), which both shows
  // it on the list row and flows it to the cashier. Persisted server-side, so it's
  // there on any device.
  async function stage(deal: Deal) {
    setStaged((prev) => new Set(prev).add(deal.name))
    await stageDeal(qc, lineName(deal.name), deal)
  }

  const stores = deals ? [...new Set(deals.map((d) => d.merchant).filter(Boolean))].sort() : []
  const shown = (deals ?? []).filter((d) => !store || d.merchant === store)
  const bestKey = shown.find((d) => d.unitPrice != null)

  return (
    <div className="scene" aria-label={t.shop.browseTitle}>
      <div className="scene__head">
        <div>
          <div className="hand-tag">{t.shop.browseTitle}</div>
          <h2 className="pm-sheet__title">{t.shop.browseHint}</h2>
        </div>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
          ✕
        </button>
      </div>

      <div className="scene__body">

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
            <Link to="/settings?tab=shopping" className="btn btn--ghost mono">
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
                onViewFlyer={(deal) => setFlyer({ id: deal.flyerId!, itemId: deal.id, merchant: deal.merchant, logo: deal.logo, premium: deal.premium })}
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
                    <Link to="/settings?tab=shopping" className="btn btn--ghost mono">
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
                {storeFlyers.map((f) => {
                  const when = flyerWhen(f, now)
                  const range = fmtRange(f, lang)
                  return (
                    <button
                      key={f.flyerId}
                      type="button"
                      className="flyer-store"
                      onClick={() => setFlyer({ id: f.flyerId, itemId: null, merchant: f.merchant, logo: f.logo, premium: f.premium })}
                    >
                      {f.logo ? (
                        <img className="flyer-store__logo" src={f.logo} alt="" loading="lazy" />
                      ) : (
                        <span className="flyer-store__logo flyer-store__logo--none" aria-hidden="true">🏬</span>
                      )}
                      <span className="flyer-store__text">
                        <span className="flyer-store__name">{f.merchant}</span>
                        {range && <span className="flyer-store__dates mono">{range}</span>}
                      </span>
                      <span className={`flyer-store__when flyer-store__when--${when}`}>
                        {when === 'upcoming' ? t.shop.flyerUpcoming : t.shop.flyerThisWeek}
                      </span>
                    </button>
                  )
                })}
              </div>
            )}
          </>
        )}
      </div>

      {flyer && (
        <FlyerViewer
          flyerId={flyer.id}
          highlightId={flyer.itemId}
          title={flyer.merchant}
          logo={flyer.logo}
          premium={flyer.premium}
          onAddToList={addToList}
          onStage={stage}
          onClose={() => setFlyer(null)}
        />
      )}
    </div>
  )
}
