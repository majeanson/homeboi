import { useEffect, useRef, useState } from 'react'
import { Link, useParams } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { StatusMessage } from '../components/StatusMessage'
import { InlineIcon } from '../components/Icon'
import { Chip } from '../components/Chip'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { api, isStatus } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { useT } from '../i18n'
import { Loading } from '../components/Fallback'
import { SceneHead } from '../components/SceneHead'
import { FlyerViewer } from '../components/FlyerViewer'
import { DealCard } from '../components/DealCard'
import { type Deal } from '../lib/deals'
import { ensureListLine, parseDeal, parseTerms, type AddedTo, type ListItem } from '../lib/picks'
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
  const write = useWrite()
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
    // Offline-aware (in-store signal is flaky): queue + replay, then reconcile the
    // board cache the list reads from.
    await write('list', { method: 'PATCH', body: { id: itemId, deal }, affectedKeys: [BOARD_KEY] }).catch(() => {})
  }
  // Cache the expensive Flipp lookup per query, per day — flyers change ~weekly,
  // so a day-scoped key serves re-opens instantly and refreshes tomorrow.
  const dayKey = new Date().toISOString().slice(0, 10)
  const termsParam = terms.length ? terms.join(',') : ''
  const dealsQ = useQuery({
    queryKey: ['deals', query, termsParam, dayKey],
    // Longer than api()'s 20s default: the server walks up to several Flipp
    // searches (one per term) sequentially, which can outrun that on its own.
    queryFn: () =>
      api<{ deals: Deal[] }>(
        `deals?q=${encodeURIComponent(query)}${termsParam ? `&terms=${encodeURIComponent(termsParam)}` : ''}`,
        { timeoutMs: 45_000 },
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
  // The EXISTING list line the last add rode on (null = it made a new line).
  const [addedTo, setAddedTo] = useState<AddedTo>(null)
  // Every name added this session, answered from memory on a re-tap — the
  // synchronous guard state can't be (two taps in one frame both read the
  // pre-update state). Same rule as DealsBrowser: one add per name, never a
  // second write that re-runs the match.
  const doneRef = useRef(new Map<string, AddedTo>())
  // Esc leaves the scene — but not while the full flyer is open over it (that
  // overlay owns Esc), so one keypress doesn't pop both layers.
  useEscapeKey(close, !flyer)

  // The line is gone (cleared elsewhere, or a cold deep-link to a stale id) →
  // there's nothing to price-match; slip back to the list.
  useEffect(() => {
    if (board && !item) close()
  }, [board, item, close])

  // Drop an item straight onto the grocery list (from a deal card or the flyer).
  // Reuse-not-duplicate: an existing line is kept (a checked one is unchecked),
  // only a true miss inserts — see matchListItem in lib/picks.
  async function addToList(name: string): Promise<AddedTo> {
    if (doneRef.current.has(name)) {
      const on = doneRef.current.get(name) ?? null
      setAdded(name)
      setAddedTo(on)
      return on
    }
    doneRef.current.set(name, null)
    setAdded(name)
    setAddedTo(null)
    const on = await ensureListLine(qc, name)
    doneRef.current.set(name, on)
    setAddedTo(on)
    return on
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
      {/* In-store scene, outside HubLayout: opt into the shared offline/stale bar
          (shop seam #2) — dead in-store signal must read as "not live", not "no deal". */}
      <SceneHead title={t.shop.proofTitle} subtitle={query} card="cashier" onClose={close} closeLabel={t.shop.close} offline />

      <div className="scene__body">
        {state === 'loading' && <p className="loading mono">{t.shop.searching}</p>}
        {state === 'empty' && <EmptyState>{t.shop.none}</EmptyState>}
        {state === 'noPostal' && (
          // Not a dead-end: jump straight to Réglages ▸ Magasinage to fix it.
          <EmptyState>
            {t.shop.noPostal}{' '}
            <Link to="/settings?tab=liste" className="btn btn--ghost mono">
              {t.shop.setPostal}
            </Link>
          </EmptyState>
        )}
        {/* A FAILED lookup is not "no deals" (shop seam #3): say the check broke
            and offer to run it again, instead of wearing the empty state's face. */}
        {state === 'error' && (
          <div className="deal-error">
            <StatusMessage tone="error">{t.shop.error}</StatusMessage>
            <button type="button" className="btn btn--ghost mono" onClick={() => void dealsQ.refetch()}>
              <InlineIcon name="arrow-clockwise-bold" /> {t.shop.retry}
            </button>
          </div>
        )}

        {state === 'ok' && stores.length > 1 && (
          <div className="deal-stores mono">
            <Chip selected={store === null} onClick={() => setStore(null)}>
              {t.shop.allStores}
            </Chip>
            {stores.map((s) => (
              <Chip key={s} selected={store === s} onClick={() => setStore(s)}>
                {s}
              </Chip>
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
                addedTo={added === d.name ? addedTo : null}
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
