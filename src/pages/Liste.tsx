import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
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
import { useOptimisticMutation } from '../lib/optimistic'
import { money, type Deal } from '../lib/deals'
import { pickListFrom, parseDeal, stageDeal, unstageDeal } from '../lib/picks'
import { pictoFor } from '../lib/picto'
import { BOARD_KEY } from '../lib/queryKeys'

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
  added_by?: string | null // pick-your-face attribution (member id), if any
  deal_json?: string | null // a staged flyer deal for the cashier (JSON), if any
}
interface ListMember {
  id: string
  display_name: string
  colour: string
}
// The board read returns more than the list; this page uses the list plus the
// members (to draw "who added it" faces). The shared ['board'] cache still holds
// the full payload for the Board page.
type BoardListData = { list: ListRow[]; members?: ListMember[] }
const GHOSTS_KEY = ['ghosts']

export function Liste() {
  const t = useT()
  const { audience } = useAudience()
  const qc = useQueryClient()
  const undo = useUndoToast()
  const [proofFor, setProofFor] = useState<{ id: string; text: string } | null>(null)
  const [cashierOpen, setCashierOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [auto, setAuto] = useState(false)

  const { data: board, error } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<BoardListData>('board'), ...live })
  // Ghost suggestions are a quiet best-effort layer — a failure just means no
  // strip, never a broken list. So: no retry, and errors fall back to [].
  const { data: ghostsData } = useQuery({ queryKey: GHOSTS_KEY, queryFn: () => fetchGhosts(), retry: false })
  const ghosts = ghostsData ?? []

  // Check an item off. Drop it from the cached list at once, but DEFER the write
  // behind an undo toast: a mis-tap costs nothing (tap Undo → restore, no
  // round-trip). A check records a purchase, which shifts the predictions, so
  // refresh the ghost strip once it commits.
  function checkOff(item: ListRow) {
    const prev = qc.getQueryData<BoardListData>(BOARD_KEY)
    // The list and the "show the cashier" set are one thing now: a checked-off item
    // leaves the open list, so it leaves the cashier set too — and its deal_json is
    // kept on the row, so undo (which restores the cached open list) brings the deal
    // back with it. No separate pick bookkeeping needed.
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
  const addGhost = useOptimisticMutation<Ghost[], Ghost>({
    queryKey: GHOSTS_KEY,
    mutationFn: (g) => api('list', { method: 'POST', body: { text: g.label } }),
    apply: (gs, g) => gs.filter((x) => x.key !== g.key),
    invalidateOnSettled: [BOARD_KEY, GHOSTS_KEY],
  })

  if (isUnauthorized(error)) return <PairPrompt />
  if (!board && !error) return <Loading />
  const list = board?.list ?? []
  // Who-added-it faces: map member id → member so each row can show a tiny tint.
  const memberById = new Map((board?.members ?? []).map((m) => [m.id, m]))

  // Auto-pick: for each list item, grab the top (best-value) deal and stage it,
  // then jump straight to the review screen. Best-first is the server's sort.
  async function autoPick(rows: ListRow[]) {
    setAuto(true)
    let any = false
    for (const item of rows) {
      try {
        const r = await api<{ deals: Deal[] }>(`deals?q=${encodeURIComponent(item.text)}`)
        if (r.deals[0]) {
          // Stage the best deal straight onto this line (matched by name).
          await stageDeal(qc, item.text, r.deals[0])
          any = true
        }
      } catch {
        /* skip items with no deals / errors */
      }
    }
    setAuto(false)
    if (any || pickList.length > 0) setCashierOpen(true)
  }

  // The cashier set = every open list line carrying a staged deal (server state,
  // so it's in sync across devices and gone once the item is checked off).
  const pickList = pickListFrom(list)

  if (audience === 'toddler') {
    // Read-only for toddlers: tapping a tile reads it aloud but does NOT check it
    // off (no onTap) — a pre-reader can't accidentally clear the grocery list.
    // Each item draws its own picture (pictoFor: milk/bread/apple…) so the list
    // is legible to someone who can't read, and never a wall of identical carts.
    const tiles: Tile[] = list.map((i) => ({
      key: i.id,
      icon: pictoFor(i.text, '🛒'),
      label: i.text,
      narration: i.text,
    }))
    return (
      <main className="kid__main">
        <div className="kid-head">
          <span className="kid-head__emoji" aria-hidden="true">🛒</span>
          <p className="kid-head__title">{t.kid.shopping}</p>
        </div>
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
          {list.map((item) => {
            const adder = item.added_by ? memberById.get(item.added_by) : null
            const staged = parseDeal(item.deal_json)
            // Draw the item's own picture (milk/bread/apple…) so the list reads as
            // distinct things, not a column of identical sparkles. Falls back to the
            // list category glyph only when nothing matches (a non-grocery note).
            const pic = pictoFor(item.text, '')
            return (
            <div key={item.id} className="list-row">
              <button type="button" className="act list-row__main" onClick={() => checkOff(item)}>
                <span className="spine" style={{ background: CATS.list.color }} aria-hidden="true" />
                {staged?.image ? (
                  // A linked flyer deal with a clipping → show the product picture.
                  <span className="tile list-row__thumb" aria-hidden="true">
                    <img src={staged.image} alt="" loading="lazy" />
                  </span>
                ) : pic ? (
                  <span className="tile list-row__pic" style={{ background: CATS.list.wash }} aria-hidden="true">
                    {pic}
                  </span>
                ) : (
                  <span className="tile" style={{ background: CATS.list.wash }} aria-hidden="true">
                    <Icon name={CATS.list.icon} size={28} color={CATS.list.deep} />
                  </span>
                )}
                <span className="act__text">
                  <span className="title" style={{ color: tintInk(CATS.list.color) }}>
                    {item.text}
                  </span>
                  {/* A staged flyer deal for this item: store + price, so the choice
                      is visible on the list itself (not just the 🏷️→✓ flip). */}
                  {staged && (
                    <span className="list-row__deal mono">
                      🏷️ {staged.merchant} · {money(staged.price)}
                    </span>
                  )}
                </span>
                {adder && (
                  <span
                    className="list-row__by"
                    style={{ background: adder.colour }}
                    title={adder.display_name}
                    aria-label={adder.display_name}
                  >
                    {(adder.display_name[0] ?? '?').toUpperCase()}
                  </span>
                )}
                <span className="check" aria-hidden="true">
                  <Icon name="check-bold" size={18} />
                </span>
              </button>
              <button
                type="button"
                className={`list-row__proof${staged ? ' is-picked' : ''}`}
                onClick={() => setProofFor({ id: item.id, text: item.text })}
                aria-label={t.shop.proof}
                title={t.shop.proof}
              >
                {staged ? '✓' : '🏷️'}
              </button>
            </div>
            )
          })}
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
        <PriceMatchSheet itemId={proofFor.id} query={proofFor.text} onClose={() => setProofFor(null)} />
      )}

      {cashierOpen && (
        <CashierMode
          picks={pickList}
          onRevise={(p) => setProofFor({ id: p.itemId, text: p.itemText })}
          onRemove={(itemId) => unstageDeal(qc, itemId)}
          onClose={() => setCashierOpen(false)}
        />
      )}

      {browseOpen && <DealsBrowser onClose={() => setBrowseOpen(false)} />}
    </main>
  )
}
