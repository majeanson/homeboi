import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { Icon } from '../components/Icon'
import { HelpDot } from '../components/HelpDot'
import { CATS } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { useUndoToast } from '../lib/toast'
import { useVoiceInput } from '../lib/useVoiceInput'
import { VoiceButton, VoiceStatus } from '../components/VoiceButton'
import { money, type Deal } from '../lib/deals'
import { pickListFrom, parseDeal, parseTerms, stageDeal } from '../lib/picks'
import { useQuickItems } from '../lib/quickItems'
import { pictoFor } from '../lib/picto'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { BOARD_KEY } from '../lib/queryKeys'

// The shared list — ONE active list, two lenses on the same data:
//   - parent: the compact list you check off as you shop.
//   - toddler: big tiles; tapping reads an item aloud (read-only — a pre-reader
//     can't clear the groceries).
// Reads the list out of the one-shot /board payload to avoid a second endpoint,
// sharing the ['board'] cache with the Board page.
//
// The model (NFR-CALM: one screen, one list):
//   - A check is a MARK, not a move — the item stays in place (struck through),
//     so you tick what's in the cart and leave what's out of stock. Tap again to
//     uncheck. Nothing is logged as bought yet.
//   - "Clear checked" removes every checked line in one go (→ logged as bought,
//     which feeds the predictions) and leaves the un-ticked items for next time.
//   - "⚡ Quick add" reopens past/predicted items to restock a week in a few taps,
//     each carrying the flyer synonyms it last shopped with.
//   - The shopping tools (browse flyers, auto-pick the best prices, show the
//     cashier) are always one tap away — no mode to switch into.
interface ListRow {
  id: string
  text: string
  source: string
  added_by?: string | null // pick-your-face attribution (member id), if any
  deal_json?: string | null // a staged flyer deal for the cashier (JSON), if any
  search_terms?: string | null // extra flyer-search synonyms (JSON array), if any
  checked_at?: number | null // set = ticked (in the cart); the item stays on the list
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
const HISTORY_KEY = ['list-history']

// One list row, drawn the same way for every item. Three independent tap targets:
// the picture opens the flyer/deals, the name opens the edit sheet, the check is
// the toggle. A checked row keeps its place but reads as "got it" (struck, filled
// check) until "Clear checked" removes it. Swiping the row LEFT deletes it
// outright (Outlook-mobile style) — a plain remove, NOT logged as bought (that's
// what the check + "Clear checked" is for).
function ListItemRow({
  text,
  picto,
  dealImage,
  dealLabel,
  adder,
  checked,
  toggleLabel,
  onImage,
  imageLabel,
  onName,
  nameLabel,
  onToggle,
  onDelete,
  deleteLabel,
}: {
  text: string
  picto: string
  dealImage?: string | null
  dealLabel?: React.ReactNode
  adder?: ListMember | null
  checked?: boolean
  toggleLabel: string
  onImage: () => void
  imageLabel: string
  onName: () => void
  nameLabel: string
  onToggle: () => void
  onDelete: () => void
  deleteLabel: string
}) {
  const mainRef = useRef<HTMLDivElement>(null)
  useSwipeToDelete(mainRef, onDelete)
  return (
    <div className="list-row">
      {/* The delete pane revealed behind the row as it slides left under the
          finger. Inert/aria-hidden — the swipe drives it; the edit sheet keeps an
          actual Delete button for non-touch. */}
      <span className="list-row__del" aria-hidden="true">
        <span className="list-row__del-icon">🗑</span>
        <span className="list-row__del-label">{deleteLabel}</span>
      </span>
      <div ref={mainRef} className={`act list-row__main${checked ? ' done' : ''}`}>
        <span className="spine" style={{ background: CATS.list.color }} aria-hidden="true" />
        <button type="button" className="list-row__img" onClick={onImage} aria-label={imageLabel}>
          {dealImage ? (
            // A linked flyer deal with a clipping → show the product picture.
            <span className="tile list-row__thumb" aria-hidden="true">
              <img src={dealImage} alt="" loading="lazy" />
            </span>
          ) : picto ? (
            // The item's own picture (milk/bread/apple…) so the list reads as
            // distinct things, not a column of identical carts.
            <span className="tile list-row__pic" style={{ background: CATS.list.wash }} aria-hidden="true">
              {picto}
            </span>
          ) : (
            <span className="tile" style={{ background: CATS.list.wash }} aria-hidden="true">
              <Icon name={CATS.list.icon} size={28} color={CATS.list.deep} />
            </span>
          )}
        </button>
        <button type="button" className="list-row__name act__text" onClick={onName} aria-label={nameLabel}>
          <span className="title" style={{ color: tintInk(CATS.list.color) }}>
            {text}
          </span>
          {dealLabel}
        </button>
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
        <button type="button" className="check list-row__toggle" onClick={onToggle} aria-label={toggleLabel}>
          <Icon name="check-bold" size={18} />
        </button>
      </div>
    </div>
  )
}

export function Liste() {
  const t = useT()
  const { audience } = useAudience()
  const qc = useQueryClient()
  const nav = useNavigate()
  const undo = useUndoToast()
  const [auto, setAuto] = useState(false)
  // Items whose "Clear checked" delete is DEFERRED behind the undo toast. Filtered
  // out of the displayed list at once so a refetch (the live poll, a focus, or an
  // add's invalidation) can't resurrect them before the clear commits.
  const [pendingClear, setPendingClear] = useState<Set<string>>(new Set())
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  // The mic is "add by voice", not dictation: each recognised phrase goes straight
  // onto the list (hands-free at the counter). `continuous` keeps the mic open so
  // you can reel off a whole list — tap again to stop — and `split` turns one
  // breath of "lait, œufs pis pain" into three items. postAdd is hoisted, so the
  // closure resolves it at speak time. Empty results (mis-hear) are ignored.
  const voice = useVoiceInput(
    (text) => {
      const v = text.trim()
      if (!v) return
      setAddText('')
      void postAdd(v)
    },
    { continuous: true, split: true },
  )

  const { data: board, error } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<BoardListData>('board'), ...live })
  // Candidate re-adds for the ⚡ Quick add page; here we only need the count for the
  // badge. The page itself reads the same hook off the shared caches.
  const quickItems = useQuickItems()

  // Add a line to the list. `terms` (optional) carries flyer synonyms — the
  // quick-add panel passes them so a re-added item keeps its deal search.
  async function postAdd(text: string, terms?: string[]) {
    if (!text) return
    try {
      await api('list', { method: 'POST', body: terms && terms.length ? { text, search_terms: terms } : { text } })
    } finally {
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      qc.invalidateQueries({ queryKey: GHOSTS_KEY })
      qc.invalidateQueries({ queryKey: HISTORY_KEY })
    }
  }
  function addItem(e?: React.FormEvent) {
    e?.preventDefault()
    const text = addText.trim()
    if (!text || adding) return
    setAdding(true)
    setAddText('')
    postAdd(text).finally(() => setAdding(false))
  }

  // Toggle a check (a MARK — the item stays on the list). Optimistic: flip
  // checked_at in the shared cache at once, then persist and resync. Tapping again
  // unchecks. No purchase is recorded here — that waits for "Clear checked".
  function toggleChecked(item: ListRow) {
    const checking = !item.checked_at
    const ts = checking ? Math.floor(Date.now() / 1000) : null
    qc.setQueryData<BoardListData>(BOARD_KEY, (b) =>
      b ? { ...b, list: b.list.map((i) => (i.id === item.id ? { ...i, checked_at: ts } : i)) } : b,
    )
    api('list', { method: 'PATCH', body: { id: item.id, checked: checking } })
      .catch(() => {})
      .finally(() => qc.invalidateQueries({ queryKey: BOARD_KEY }))
  }

  // Clear checked: every ticked line is a confirmed buy. Hide them NOW via
  // pendingClear and DEFER the delete behind the undo toast — a mis-tap costs
  // nothing. Pass the exact ids so a check made AFTER scheduling the undo isn't
  // swept up. Committing logs the buys (→ predictions shift, refresh the ghosts).
  function clearChecked(ids: string[]) {
    if (ids.length === 0) return
    setPendingClear((s) => new Set([...s, ...ids]))
    undo({
      message: t.undo.clearedN(ids.length),
      onUndo: () =>
        setPendingClear((s) => {
          const n = new Set(s)
          ids.forEach((i) => n.delete(i))
          return n
        }),
      onCommit: async () => {
        await api('list', { method: 'PATCH', body: { clearChecked: true, ids } }).catch(() => {})
        await qc.invalidateQueries({ queryKey: BOARD_KEY })
        qc.invalidateQueries({ queryKey: GHOSTS_KEY })
        qc.invalidateQueries({ queryKey: HISTORY_KEY })
        setPendingClear((s) => {
          const n = new Set(s)
          ids.forEach((i) => n.delete(i))
          return n
        })
      },
    })
  }

  // Swipe-left delete: a plain remove from the list — NOT logged as bought (that
  // path is the check + "Clear checked"). Mirrors clearChecked's deferred shape:
  // hide the row NOW via pendingClear (so the live poll can't resurrect it) and
  // hold the DELETE behind the undo toast, so a mis-swipe costs nothing.
  function deleteItem(item: ListRow) {
    setPendingClear((s) => new Set([...s, item.id]))
    undo({
      message: t.undo.cleared(item.text),
      onUndo: () =>
        setPendingClear((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        }),
      onCommit: async () => {
        await api('list', { method: 'DELETE', body: { id: item.id } }).catch(() => {})
        await qc.invalidateQueries({ queryKey: BOARD_KEY })
        setPendingClear((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        })
      },
    })
  }

  if (isUnauthorized(error)) return <PairPrompt />
  if (!board && !error) return <Loading />
  // Hide items whose clear is still settling so they can't be resurrected.
  const list = (board?.list ?? []).filter((i) => !pendingClear.has(i.id))
  const checkedIds = list.filter((i) => i.checked_at).map((i) => i.id)
  // Who-added-it faces: map member id → member so each row can show a tiny tint.
  const memberById = new Map((board?.members ?? []).map((m) => [m.id, m]))

  // The cashier set = every list line carrying a staged deal (server state, in
  // sync across devices, gone once the item is cleared).
  const pickList = pickListFrom(list)

  // Auto-pick: for each list item, grab the top (best-value) deal and stage it,
  // then jump to the cashier review. Carries each line's saved synonyms.
  async function autoPick(rows: ListRow[]) {
    setAuto(true)
    let any = false
    for (const item of rows) {
      try {
        const terms = parseTerms(item.search_terms)
        const qs = `deals?q=${encodeURIComponent(item.text)}${terms.length ? `&terms=${encodeURIComponent(terms.join(','))}` : ''}`
        const r = await api<{ deals: Deal[] }>(qs)
        if (r.deals[0]) {
          await stageDeal(qc, item.text, r.deals[0])
          any = true
        }
      } catch {
        /* skip items with no deals / errors */
      }
    }
    setAuto(false)
    if (any || pickList.length > 0) nav('/liste/cashier')
  }

  if (audience === 'toddler') {
    // Read-only for toddlers: tapping a tile reads it aloud but never checks it
    // off. Show only what's still needed (un-ticked) — a kid sees what's left to
    // get. Each tile draws its own picture (milk/bread/apple…) so it's legible to
    // someone who can't read, never a wall of identical carts.
    const tiles: Tile[] = list
      .filter((i) => !i.checked_at)
      .map((i) => ({ key: i.id, icon: pictoFor(i.text, '🛒'), label: i.text, narration: i.text }))
    return (
      <main className="kid__main">
        <div className="kid-head">
          <span className="kid-head__emoji" aria-hidden="true">🛒</span>
          <Sayable className="kid-head__title" text={t.kid.shopping} />
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
          <div className="app-head__titlerow">
            <h1 className="greet">{t.nav.list}</h1>
            <HelpDot card="liste" />
          </div>
        </div>
        <div className="avatar" style={{ background: 'var(--marigold-wash)' }}>
          <Icon name={CATS.list.icon} size={26} color={CATS.list.deep} />
        </div>
      </div>

      {/* Add a line right here — type it or speak it. The direct path; the ＋
          capture sheet still works for the AI-routed quick note. */}
      <form className="list-add" onSubmit={addItem}>
        <input
          className="input"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder={voice.listening ? t.capture.listening : t.list.addPlaceholder}
          aria-label={t.list.addPlaceholder}
        />
        <VoiceButton voice={voice} label={t.capture.voice} />
        <button type="submit" className="btn btn--primary" disabled={!addText.trim() || adding}>
          <Icon name="plus-bold" size={18} />
          {t.capture.add}
        </button>
      </form>
      <VoiceStatus voice={voice} />

      {/* Quick add: reopen past/predicted items to restock a week in a few taps. */}
      <button type="button" className="btn btn--ghost list-quick" onClick={() => nav('/liste/quick')}>
        ⚡ {t.list.quickAdd}
        {quickItems.length > 0 && <span className="list-quick__n mono">{quickItems.length}</span>}
      </button>

      {list.length === 0 ? (
        <p className="feed-empty">{t.board.listEmpty}</p>
      ) : (
        <div className="list-rows">
          {list.map((item) => {
            const adder = item.added_by ? memberById.get(item.added_by) : null
            const staged = parseDeal(item.deal_json)
            const checked = !!item.checked_at
            // Draw the item's own picture (milk/bread/apple…), falling back to the
            // list glyph only when nothing matches (a non-grocery note).
            const pic = pictoFor(item.text, '')
            return (
              <ListItemRow
                key={item.id}
                text={item.text}
                picto={pic}
                dealImage={staged?.image}
                // A staged flyer deal: store + price, visible on the row itself.
                dealLabel={
                  staged ? (
                    <span className="list-row__deal mono">
                      🏷️ {staged.merchant} · {money(staged.price)}
                    </span>
                  ) : null
                }
                adder={adder}
                checked={checked}
                toggleLabel={checked ? t.list.uncheck : t.list.check}
                onImage={() => nav(`/liste/deals/${item.id}`)}
                imageLabel={t.list.openFlyer}
                onName={() => nav(`/liste/item/${item.id}`)}
                nameLabel={t.list.edit}
                onToggle={() => toggleChecked(item)}
                onDelete={() => deleteItem(item)}
                deleteLabel={t.list.swipeDelete}
              />
            )
          })}
        </div>
      )}

      {/* Clear the trip: every checked line goes (logged as bought), the rest
          stays for next time. The primary action once anything's ticked. */}
      {checkedIds.length > 0 && (
        <div className="list-actions">
          <button type="button" className="btn btn--primary" onClick={() => clearChecked(checkedIds)}>
            ✓ {t.list.clearChecked} ({checkedIds.length})
          </button>
        </div>
      )}

      {/* Shopping tools, always one tap away — no mode to switch into. */}
      <div className="list-actions">
        <button type="button" className="btn btn--ghost mono" onClick={() => nav('/liste/circulaires')}>
          🔎 {t.shop.browse}
        </button>
        {list.length > 0 && (
          <button type="button" className="btn btn--ghost mono" onClick={() => autoPick(list)} disabled={auto}>
            {auto ? (
              t.shop.autoWorking
            ) : (
              <>
                <Icon name="sparkle-bold" size={15} style={{ display: 'inline-block', verticalAlign: '-2px' }} /> {t.shop.auto}
              </>
            )}
          </button>
        )}
        {pickList.length > 0 && (
          <button type="button" className="btn btn--primary" onClick={() => nav('/liste/cashier')}>
            🧾 {t.shop.present} ({pickList.length})
          </button>
        )}
      </div>

    </main>
  )
}
