import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, type Tile } from '../components/BigTiles'
import { Icon } from '../components/Icon'
import { CATS } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { PriceMatchSheet } from '../components/PriceMatchSheet'
import { DealsBrowser } from '../components/DealsBrowser'
import { CashierMode } from '../components/CashierMode'
import { GhostStrip } from '../components/GhostStrip'
import { fetchGhosts, type Ghost } from '../lib/ghost'
import { useUndoToast } from '../lib/toast'
import { type Deal, type Pick } from '../lib/deals'

// The shared list (groceries + anything), two lenses on the same data:
//   - parent: the compact check-off list.
//   - toddler: big tiles; tapping checks the item off AND reads it aloud, so a
//     pre-reader can help clear the list — the same write a parent makes.
// Reads the list out of the one-shot /board payload to avoid a second endpoint,
// sharing the ['board'] cache with the Board page.
interface ListRow {
  id: string
  text: string
  source: string
}
// The board read returns more than the list, but this page only needs the list;
// the shared ['board'] cache still holds the full payload for the Board page.
type BoardListData = { list: ListRow[] }
const BOARD_KEY = ['board']
const GHOSTS_KEY = ['ghosts']

// Chosen deals survive a reload (build the list at home, present it in store).
// Keyed by list-item id. Deals go stale weekly, but that's fine — re-pick then.
const PICKS_KEY = 'babillard-cashier-picks'
type Picks = Record<string, { deal: Deal; itemText: string }>
function loadPicks(): Picks {
  try {
    const raw = localStorage.getItem(PICKS_KEY)
    return raw ? (JSON.parse(raw) as Picks) : {}
  } catch {
    return {}
  }
}

export function Liste() {
  const t = useT()
  const { audience } = useAudience()
  const qc = useQueryClient()
  const undo = useUndoToast()
  const [proofFor, setProofFor] = useState<{ id: string; text: string } | null>(null)
  const [picks, setPicks] = useState<Picks>(loadPicks)
  const [cashierOpen, setCashierOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [auto, setAuto] = useState(false)

  const { data: board, error } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<BoardListData>('board'), ...live })
  // Ghost suggestions are a quiet best-effort layer — a failure just means no
  // strip, never a broken list. So: no retry, and errors fall back to [].
  const { data: ghostsData } = useQuery({ queryKey: GHOSTS_KEY, queryFn: () => fetchGhosts(), retry: false })
  const ghosts = ghostsData ?? []

  // Persist picks so they're there at the store.
  useEffect(() => {
    try {
      localStorage.setItem(PICKS_KEY, JSON.stringify(picks))
    } catch {
      /* storage full / private mode — picks just won't persist */
    }
  }, [picks])

  function choose(itemId: string, itemText: string, deal: Deal) {
    setPicks((p) => ({ ...p, [itemId]: { deal, itemText } }))
  }
  function removePick(itemId: string) {
    setPicks((p) => {
      const { [itemId]: _, ...rest } = p
      return rest
    })
  }

  // Check an item off. Drop it from the cached list at once, but DEFER the write
  // behind an undo toast: a mis-tap costs nothing (tap Undo → restore, no
  // round-trip). A check records a purchase, which shifts the predictions, so
  // refresh the ghost strip once it commits.
  function checkOff(item: ListRow) {
    const prev = qc.getQueryData<BoardListData>(BOARD_KEY)
    qc.setQueryData<BoardListData>(BOARD_KEY, (d) => (d ? { ...d, list: d.list.filter((i) => i.id !== item.id) } : d))
    undo({
      message: t.undo.checked(item.text),
      onUndo: () => prev && qc.setQueryData(BOARD_KEY, prev),
      onCommit: () => {
        api('list', { method: 'PATCH', body: { id: item.id, checked: true } }).catch(() => {})
        qc.invalidateQueries({ queryKey: GHOSTS_KEY })
      },
    })
  }

  // Tap a suggestion → add it to the real list. Drop the chip immediately
  // (optimistic), then persist and refresh both the list and the strip.
  const addGhost = useMutation({
    mutationFn: (g: Ghost) => api('list', { method: 'POST', body: { text: g.label } }),
    onMutate: async (g) => {
      await qc.cancelQueries({ queryKey: GHOSTS_KEY })
      const prev = qc.getQueryData<Ghost[]>(GHOSTS_KEY)
      qc.setQueryData<Ghost[]>(GHOSTS_KEY, (gs) => gs?.filter((x) => x.key !== g.key) ?? gs)
      return { prev }
    },
    onError: (_e, _v, ctx) => {
      if (ctx?.prev) qc.setQueryData(GHOSTS_KEY, ctx.prev)
    },
    onSettled: () => {
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      qc.invalidateQueries({ queryKey: GHOSTS_KEY })
    },
  })

  if (isUnauthorized(error)) return <PairPrompt />
  if (!board && !error) return <Loading />
  const list = board?.list ?? []

  // Auto-pick: for each list item, grab the top (best-value) deal and stage it,
  // then jump straight to the review screen. Best-first is the server's sort.
  async function autoPick(rows: ListRow[]) {
    setAuto(true)
    const next: Picks = { ...picks }
    for (const item of rows) {
      try {
        const r = await api<{ deals: Deal[] }>(`deals?q=${encodeURIComponent(item.text)}`)
        if (r.deals[0]) next[item.id] = { deal: r.deals[0], itemText: item.text }
      } catch {
        /* skip items with no deals / errors */
      }
    }
    setPicks(next)
    setAuto(false)
    if (Object.keys(next).length) setCashierOpen(true)
  }

  // Built from picks directly (not the current list) so a pick survives even
  // after its grocery item is checked off.
  const pickList: Pick[] = Object.entries(picks).map(([itemId, v]) => ({
    itemId,
    itemText: v.itemText,
    deal: v.deal,
  }))

  if (audience === 'toddler') {
    // Read-only for toddlers: tapping a tile reads it aloud but does NOT check it
    // off (no onTap) — a pre-reader can't accidentally clear the grocery list.
    const tiles: Tile[] = list.map((i) => ({
      key: i.id,
      icon: '🛒',
      label: i.text,
      narration: i.text,
    }))
    return (
      <main className="kid__main">
        <BigTiles tiles={tiles} empty={t.board.listEmpty} />
      </main>
    )
  }

  return (
    <main className="today-feed">
      <div className="app-head">
        <div>
          <div className="hand-tag">{t.capture.add}</div>
          <h1 className="greet">{t.nav.list}</h1>
        </div>
        <div className="avatar" style={{ background: 'var(--marigold-wash)' }}>
          <Icon name={CATS.list.icon} size={26} color={CATS.list.deep} />
        </div>
      </div>

      {list.length === 0 ? (
        <p className="feed-empty">{t.board.listEmpty}</p>
      ) : (
        <div className="stagger">
          {list.map((item) => (
            <div key={item.id} className="list-row">
              <button type="button" className="act list-row__main" onClick={() => checkOff(item)}>
                <span className="spine" style={{ background: CATS.list.color }} aria-hidden="true" />
                <span className="tile" style={{ background: CATS.list.wash }} aria-hidden="true">
                  <Icon name={CATS.list.icon} size={28} color={CATS.list.deep} />
                </span>
                <span className="act__text">
                  <span className="title" style={{ color: tintInk(CATS.list.color) }}>
                    {item.text}
                  </span>
                </span>
                <span className="check" aria-hidden="true">
                  <Icon name="check-bold" size={18} />
                </span>
              </button>
              <button
                type="button"
                className={`list-row__proof${picks[item.id] ? ' is-picked' : ''}`}
                onClick={() => setProofFor({ id: item.id, text: item.text })}
                aria-label={t.shop.proof}
                title={t.shop.proof}
              >
                {picks[item.id] ? '✓' : '🏷️'}
              </button>
            </div>
          ))}
        </div>
      )}

      <GhostStrip ghosts={ghosts} onAdd={(g) => addGhost.mutate(g)} />

      <div className="list-actions">
        <button type="button" className="btn btn--ghost mono" onClick={() => setBrowseOpen(true)}>
          🔎 {t.shop.browse}
        </button>
      </div>

      {list.length > 0 && (
        <div className="list-actions">
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => autoPick(list)}
            disabled={auto}
          >
            {auto ? t.shop.autoWorking : `✨ ${t.shop.auto}`}
          </button>
          {pickList.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => setCashierOpen(true)}>
              🧾 {t.shop.present} ({pickList.length})
            </button>
          )}
        </div>
      )}

      {proofFor && (
        <PriceMatchSheet
          query={proofFor.text}
          chosenId={picks[proofFor.id]?.deal.id ?? null}
          onChoose={(deal) => choose(proofFor.id, proofFor.text, deal)}
          onClose={() => setProofFor(null)}
        />
      )}

      {cashierOpen && (
        <CashierMode
          picks={pickList}
          onRevise={(p) => setProofFor({ id: p.itemId, text: p.itemText })}
          onRemove={removePick}
          onClose={() => setCashierOpen(false)}
        />
      )}

      {browseOpen && <DealsBrowser onClose={() => setBrowseOpen(false)} />}
    </main>
  )
}
