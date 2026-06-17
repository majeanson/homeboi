import { useEffect, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { live } from '../lib/query'
import { useT } from '../i18n'
import { Loading } from '../components/Fallback'
import { SceneHead } from '../components/SceneHead'
import { FlyerViewer } from '../components/FlyerViewer'
import { DealCard } from '../components/DealCard'
import { type Deal } from '../lib/deals'
import { existingListId, parseDeal, parseTerms, type ListItem } from '../lib/picks'
import { BOARD_KEY } from '../lib/queryKeys'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// /liste/deals/:itemId — price-match proof for one grocery line, as a full-screen
// route (was a bottom sheet stacked over the list — flaky to scroll). Given a
// list item, pull current competitor flyer deals near the household's postal code
// and show each as a card: real flyer clipping, store, price, "was" price, valid
// dates. Each card with a flyer can open the full flyer (FlyerViewer) with the
// item highlighted, and can be CHOSEN to attach to the line for the cashier. The
// item (query text + saved synonyms) is read straight off the shared ['board']
// cache — no props to thread, deep-linkable. Read-only; rides on /api/deals.
export function PriceMatchPage() {
  const t = useT()
  const qc = useQueryClient()
  const { itemId = '' } = useParams()
  const close = useSceneClose('/liste')

  const { data: board } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<{ list: ListItem[] }>('board'), ...live })
  const item = board?.list?.find((i) => i.id === itemId) ?? null
  const query = item?.text ?? ''
  const terms = parseTerms(item?.search_terms)

  // The currently chosen deal for this line (its staged deal on the list).
  const chosenId = parseDeal(item?.deal_json)?.id ?? null

  // Pick this price for the line: attach the deal to its grocery item (server
  // state → shows on the row + flows to the cashier on any device).
  async function choose(deal: Deal) {
    await api('list', { method: 'PATCH', body: { id: itemId, deal } }).catch(() => {})
    qc.invalidateQueries({ queryKey: BOARD_KEY })
  }
  // Cache the expensive Flipp lookup per query, per day — flyers change ~weekly,
  // so a day-scoped key serves re-opens instantly and refreshes tomorrow.
  const dayKey = new Date().toISOString().slice(0, 10)
  const termsParam = terms.length ? terms.join(',') : ''
  const dealsQ = useQuery({
    queryKey: ['deals', query, termsParam, dayKey],
    queryFn: () =>
      api<{ deals: Deal[] }>(
        `deals?q=${encodeURIComponent(query)}${termsParam ? `&terms=${encodeURIComponent(termsParam)}` : ''}`,
      ),
    staleTime: 60 * 60 * 1000,
    retry: false,
    enabled: query.length > 0,
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
  // Which flyer is open on top of the scene (null = none).
  const [flyer, setFlyer] = useState<{ id: number; itemId: number | null; merchant: string; logo?: string | null; premium?: boolean } | null>(null)
  // Filter the results to one store (Maxi, Super C…); null = all.
  const [store, setStore] = useState<string | null>(null)
  const [added, setAdded] = useState<string | null>(null)
  // Esc leaves the scene — but not while the full flyer is open over it (that
  // overlay owns Esc), so one keypress doesn't pop both layers.
  useEscapeKey(close, !flyer)

  // The line is gone (cleared elsewhere, or a cold deep-link to a stale id) →
  // there's nothing to price-match; slip back to the list.
  useEffect(() => {
    if (board && !item) close()
  }, [board, item, close])

  // Drop an item straight onto the grocery list (from a deal card or the flyer).
  async function addToList(name: string) {
    setAdded(name)
    if (existingListId(qc, name)) return // already on the list — no duplicate
    await api('list', { method: 'POST', body: { text: name } }).catch(() => {})
    qc.invalidateQueries({ queryKey: BOARD_KEY })
  }

  // Distinct stores for the filter; the shown list respects the active store.
  // Deals arrive sorted best-value first, so the first shown one with a unit
  // price is the best per-unit buy — badge it.
  const stores = deals ? [...new Set(deals.map((d) => d.merchant).filter(Boolean))].sort() : []
  const shown = (deals ?? []).filter((d) => !store || d.merchant === store)
  const bestKey = shown.find((d) => d.unitPrice != null)

  if (!board) return <Loading />
  if (!item) return null

  return (
    <div className="scene" aria-label={t.shop.proofTitle}>
      <SceneHead title={t.shop.proofTitle} subtitle={query} card="cashier" onClose={close} closeLabel={t.shop.close} />

      <div className="scene__body">
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
                  close()
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
