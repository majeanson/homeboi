import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { useT } from '../i18n'
import { FlyerViewer } from './FlyerViewer'
import { DealCard } from './DealCard'
import { type Deal } from '../lib/deals'
import { existingListId, parseDeal, type ListItem } from '../lib/picks'

// Price-match proof sheet (Maxi "Imbattable" et al.): given a grocery item, pull
// current competitor flyer deals near the household's postal code and show each
// as a card the cashier can look at — real flyer clipping image, store, price,
// "was" price, and valid dates. Each card with a flyer can open the full flyer
// (FlyerViewer) with the item highlighted, and can be CHOSEN to add to the
// cashier list. Read-only; rides on /api/deals (unofficial Flipp backend),
// degrading to a clear message on nothing / no postal.

export function PriceMatchSheet({
  itemId,
  query,
  terms,
  onClose,
}: {
  itemId: string // the shared-list item this proof is for — picks key on it
  query: string
  terms?: string[] // extra flyer-search synonyms saved on the line, if any
  onClose: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  // The currently chosen deal for this line (its staged deal on the list).
  const chosenId =
    parseDeal(qc.getQueryData<{ list?: ListItem[] }>(['board'])?.list?.find((i) => i.id === itemId)?.deal_json)?.id ??
    null

  // Pick this price for the line: attach the deal to its grocery item (server
  // state → shows on the row + flows to the cashier on any device).
  async function choose(deal: Deal) {
    await api('list', { method: 'PATCH', body: { id: itemId, deal } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['board'] })
  }
  // Cache the expensive Flipp lookup per query, per day — flyers change ~weekly,
  // so a day-scoped key serves re-opens instantly and refreshes tomorrow.
  const dayKey = new Date().toISOString().slice(0, 10)
  const termsParam = terms && terms.length ? terms.join(',') : ''
  const dealsQ = useQuery({
    queryKey: ['deals', query, termsParam, dayKey],
    queryFn: () =>
      api<{ deals: Deal[] }>(
        `deals?q=${encodeURIComponent(query)}${termsParam ? `&terms=${encodeURIComponent(termsParam)}` : ''}`,
      ),
    staleTime: 60 * 60 * 1000,
    retry: false,
  })
  const deals = dealsQ.data?.deals ?? null
  // 400 from /api/deals means "no/invalid postal" — point at settings.
  const state: 'loading' | 'ok' | 'empty' | 'noPostal' | 'error' = dealsQ.isLoading
    ? 'loading'
    : dealsQ.error
      ? isStatus(dealsQ.error, 400)
        ? 'noPostal'
        : 'error'
      : deals && deals.length
        ? 'ok'
        : 'empty'
  // Which flyer is open on top of the sheet (null = none).
  const [flyer, setFlyer] = useState<{ id: number; itemId: number | null; merchant: string; logo?: string | null; premium?: boolean } | null>(null)
  // Filter the results to one store (Maxi, Super C…); null = all.
  const [store, setStore] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)

  // Drop an item straight onto the grocery list (from a deal card or the flyer).
  async function addToList(name: string) {
    setAdded(name)
    if (existingListId(qc, name)) return // already on the list — no duplicate
    await api('list', { method: 'POST', body: { text: name } }).catch(() => {})
    qc.invalidateQueries({ queryKey: ['board'] })
  }

  // Distinct stores for the filter; the shown list respects the active store.
  // Deals arrive sorted best-value first, so the first shown one with a unit
  // price is the best per-unit buy — badge it.
  const stores = deals ? [...new Set(deals.map((d) => d.merchant).filter(Boolean))].sort() : []
  const shown = (deals ?? []).filter((d) => !store || d.merchant === store)
  const bestKey = shown.find((d) => d.unitPrice != null)

  return (
    <div
      className="pm-overlay"
      role="dialog"
      aria-modal="true"
      aria-label={t.shop.proofTitle}
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
            <div className="hand-tag">{t.shop.proofTitle}</div>
            <h2 className="pm-sheet__title">{query}</h2>
          </div>
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.shop.close}>
            ✕
          </button>
        </div>

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
            <button
              type="button"
              className={`chip${store === null ? ' is-on' : ''}`}
              onClick={() => setStore(null)}
            >
              {t.shop.allStores}
            </button>
            {stores.map((s) => (
              <button key={s} type="button" className={`chip${store === s ? ' is-on' : ''}`} onClick={() => setStore(s)}>
                {s}
              </button>
            ))}
          </div>
        )}

        {state === 'ok' && deals && (
          <ul className="deal-list">
            {shown.map((d, i) => (
              <DealCard
                key={d.id ?? i}
                deal={d}
                isBest={d === bestKey}
                isChosen={chosenId != null && d.id === chosenId}
                added={added === d.name}
                onViewFlyer={(deal) => setFlyer({ id: deal.flyerId!, itemId: deal.id, merchant: deal.merchant, logo: deal.logo, premium: deal.premium })}
                onAddToList={addToList}
                onChoose={(deal) => {
                  choose(deal)
                  onClose()
                }}
              />
            ))}
          </ul>
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
          onStage={(deal) => choose(deal)}
          onClose={() => setFlyer(null)}
        />
      )}
    </div>
  )
}
