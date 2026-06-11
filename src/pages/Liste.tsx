import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { Icon } from '../components/Icon'
import { CATS } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { api, isUnauthorized } from '../lib/api'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { PriceMatchSheet } from '../components/PriceMatchSheet'
import { ListItemSheet } from '../components/ListItemSheet'
import { DealsBrowser } from '../components/DealsBrowser'
import { CashierMode } from '../components/CashierMode'
import { GhostStrip } from '../components/GhostStrip'
import { fetchGhosts, type Ghost } from '../lib/ghost'
import { useUndoToast } from '../lib/toast'
import { useOptimisticMutation } from '../lib/optimistic'
import { useVoiceInput } from '../lib/useVoiceInput'
import { money, type Deal } from '../lib/deals'
import { pickListFrom, parseDeal, parseTerms, stageDeal, unstageDeal } from '../lib/picks'
import { pictoFor } from '../lib/picto'
import { BOARD_KEY } from '../lib/queryKeys'

// The shared list (groceries + anything), two lenses on the same data:
//   - parent: the compact check-off list.
//   - toddler: big tiles; tapping checks the item off AND reads it aloud, so a
//     pre-reader can help clear the list — the same write a parent makes.
// Reads the list out of the one-shot /board payload to avoid a second endpoint,
// sharing the ['board'] cache with the Board page.
//
// The parent lens has two MODES (NFR-CALM: one screen, two intents):
//   - 'home'  — preparing the list: a check moves the item to the done shelf.
//   - 'store' — shopping with it: a check means "in my cart", so the item STAYS
//     in the list with a filled check; the cashier ("Montrer à la caisse") lives
//     here, plus a one-tap "empty the cart" to clear what was bought.
interface ListRow {
  id: string
  text: string
  source: string
  added_by?: string | null // pick-your-face attribution (member id), if any
  deal_json?: string | null // a staged flyer deal for the cashier (JSON), if any
  search_terms?: string | null // extra flyer-search synonyms (JSON array), if any
}
interface ListMember {
  id: string
  display_name: string
  colour: string
}
// A recently checked-off item on the "done" shelf — still visible, one tap to
// put back (checking off is a shelf move now, not a disappearance).
interface DoneRow {
  id: string
  text: string
  source: string
  added_by?: string | null
  checked_at: number
}
// The board read returns more than the list; this page uses the list plus the
// members (to draw "who added it" faces). The shared ['board'] cache still holds
// the full payload for the Board page.
type BoardListData = { list: ListRow[]; listDone?: DoneRow[]; members?: ListMember[] }
const GHOSTS_KEY = ['ghosts']
const HISTORY_KEY = ['list-history']

// Anything the household has put on the list before — feeds the add bar's
// "you've added this before" typeahead chips.
interface HistoryItem {
  key: string
  text: string
  count: number
  lastAt: number
}

// Accent/case-insensitive matching for the typeahead ("creme" finds "Crème").
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

// One list row, drawn the same way wherever it appears — the live list AND the
// done shelf (so checked items read as the same things, just resting). Three
// independent tap targets: the picture opens the flyer/deals, the name opens the
// edit sheet, the check is the toggle. On the done shelf all three restore.
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
  proof,
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
  proof?: React.ReactNode
}) {
  return (
    <div className="list-row">
      <div className={`act list-row__main${checked ? ' done' : ''}`}>
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
      {proof}
    </div>
  )
}

export function Liste() {
  const t = useT()
  const { audience } = useAudience()
  const qc = useQueryClient()
  const undo = useUndoToast()
  const [proofFor, setProofFor] = useState<{ id: string; text: string; terms: string[] } | null>(null)
  const [editItem, setEditItem] = useState<ListRow | null>(null)
  const [cashierOpen, setCashierOpen] = useState(false)
  const [browseOpen, setBrowseOpen] = useState(false)
  const [auto, setAuto] = useState(false)
  // 'home' = preparing the list (a check shelves the item); 'store' = shopping
  // (a check means "in my cart" — the item stays, the cashier shows). Remembered
  // per device so you land back where you were. Local-only: the cart is the phone
  // in your hand, not synced household state.
  const [mode, setMode] = useState<'home' | 'store'>(() => {
    try {
      return localStorage.getItem('list-mode') === 'store' ? 'store' : 'home'
    } catch {
      return 'home'
    }
  })
  function chooseMode(m: 'home' | 'store') {
    setMode(m)
    try {
      localStorage.setItem('list-mode', m)
    } catch {
      /* private mode — just don't remember it */
    }
  }
  // In-cart items (store mode): a local, per-device Set. Toggling marks "I picked
  // this up" — the row stays put with a filled check; it never touches the server
  // until you empty the cart (which checks them all off → done shelf).
  const [inCart, setInCart] = useState<Set<string>>(new Set())
  // Items checked off but whose delete is still DEFERRED behind the undo toast.
  // Filtered out of the displayed list so a refetch (the live poll, a focus, or
  // an add's invalidation) can't resurrect them before their write commits — the
  // bug where ticking one item then adding another brought the ticked one back.
  const [pendingChecked, setPendingChecked] = useState<Set<string>>(new Set())
  const [addText, setAddText] = useState('')
  const [adding, setAdding] = useState(false)
  const { listening, hasVoice, start: startVoice } = useVoiceInput(setAddText)

  const [doneOpen, setDoneOpen] = useState(false)

  const { data: board, error } = useQuery({ queryKey: BOARD_KEY, queryFn: () => api<BoardListData>('board'), ...live })
  // Ghost suggestions are a quiet best-effort layer — a failure just means no
  // strip, never a broken list. So: no retry, and errors fall back to [].
  const { data: ghostsData } = useQuery({ queryKey: GHOSTS_KEY, queryFn: () => fetchGhosts(), retry: false })
  const ghosts = ghostsData ?? []
  // Everything ever added/bought — the typeahead's haystack. Same best-effort
  // stance as the ghosts: a failure just means no chips.
  const { data: history } = useQuery({
    queryKey: HISTORY_KEY,
    queryFn: () => api<{ items: HistoryItem[] }>('list?view=history').then((r) => r.items),
    retry: false,
    staleTime: 60_000,
  })

  // Check an item off (HOME mode). Drop it from the cached list at once, but DEFER
  // the write behind an undo toast: a mis-tap costs nothing (tap Undo → restore, no
  // round-trip). A check records a purchase, which shifts the predictions, so
  // refresh the ghost strip once it commits.
  function checkOff(item: ListRow) {
    // Hide it NOW via pendingChecked (durable — survives any refetch), and DEFER
    // the write behind the undo toast so a mis-tap costs nothing. The id leaves
    // pendingChecked only once the commit's refetch confirms it's gone server-side,
    // so the row never flickers back. A check records a purchase, which shifts the
    // predictions, so refresh the ghost strip once it commits.
    setPendingChecked((s) => new Set(s).add(item.id))
    undo({
      message: t.undo.checked(item.text),
      onUndo: () =>
        setPendingChecked((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        }),
      onCommit: async () => {
        await api('list', { method: 'PATCH', body: { id: item.id, checked: true } }).catch(() => {})
        await qc.invalidateQueries({ queryKey: BOARD_KEY })
        qc.invalidateQueries({ queryKey: GHOSTS_KEY })
        qc.invalidateQueries({ queryKey: HISTORY_KEY })
        setPendingChecked((s) => {
          const n = new Set(s)
          n.delete(item.id)
          return n
        })
      },
    })
  }

  // Toggle an item in/out of the cart (STORE mode) — purely local; the row stays
  // on the list, just gains/loses its filled check.
  function toggleCart(id: string) {
    setInCart((s) => {
      const n = new Set(s)
      if (n.has(id)) n.delete(id)
      else n.add(id)
      return n
    })
  }

  // Empty the cart (STORE mode): everything you picked up gets checked off in one
  // go (→ done shelf), clearing the trip. Hidden at once via pendingChecked so the
  // live poll can't bring them back mid-commit.
  async function clearCart() {
    const ids = [...inCart]
    if (ids.length === 0) return
    setPendingChecked((s) => new Set([...s, ...ids]))
    setInCart(new Set())
    for (const id of ids) {
      await api('list', { method: 'PATCH', body: { id, checked: true } }).catch(() => {})
    }
    await qc.invalidateQueries({ queryKey: BOARD_KEY })
    qc.invalidateQueries({ queryKey: GHOSTS_KEY })
    qc.invalidateQueries({ queryKey: HISTORY_KEY })
    setPendingChecked((s) => {
      const n = new Set(s)
      ids.forEach((i) => n.delete(i))
      return n
    })
  }

  // Add a line straight from the list (type it, speak it, or tap a "you've added
  // this before" chip). The pendingChecked filter means this add's refetch can't
  // bring a just-ticked item back.
  async function submitAdd(text: string) {
    if (!text || adding) return
    setAdding(true)
    setAddText('')
    try {
      await api('list', { method: 'POST', body: { text } })
    } catch {
      setAddText(text) // keep what was typed so a failed add can be retried
    } finally {
      setAdding(false)
      qc.invalidateQueries({ queryKey: BOARD_KEY })
      qc.invalidateQueries({ queryKey: GHOSTS_KEY })
      qc.invalidateQueries({ queryKey: HISTORY_KEY })
    }
  }
  function addItem(e?: React.FormEvent) {
    e?.preventDefault()
    void submitAdd(addText.trim())
  }

  // Put a done-shelf item back on the list: move it in the shared cache at once
  // (the row hops shelves with no flicker), then persist the uncheck and resync.
  async function restore(item: DoneRow) {
    qc.setQueryData<BoardListData>(BOARD_KEY, (b) =>
      b && {
        ...b,
        list: [...b.list, { id: item.id, text: item.text, source: item.source, added_by: item.added_by }],
        listDone: (b.listDone ?? []).filter((d) => d.id !== item.id),
      },
    )
    await api('list', { method: 'PATCH', body: { id: item.id, checked: false } }).catch(() => {})
    qc.invalidateQueries({ queryKey: BOARD_KEY })
    qc.invalidateQueries({ queryKey: GHOSTS_KEY })
  }

  // Open the flyer/deals sheet for a line, carrying its saved synonyms so the
  // lookup can fan out ("Œuf" → also "egg"/"oeufs").
  function openFlyer(item: ListRow) {
    setProofFor({ id: item.id, text: item.text, terms: parseTerms(item.search_terms) })
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
  // Hide items whose check-off is still settling so they can't be resurrected.
  const list = (board?.list ?? []).filter((i) => !pendingChecked.has(i.id))
  // Who-added-it faces: map member id → member so each row can show a tiny tint.
  const memberById = new Map((board?.members ?? []).map((m) => [m.id, m]))
  // The done shelf: recently checked items, still one tap from coming back.
  const done = board?.listDone ?? []
  // Typeahead: once 2+ chars are typed, offer past items that match (accent- and
  // case-blind) and aren't already on the open list. Capped — chips, not a wall.
  const q = fold(addText)
  const openTexts = new Set(list.map((i) => fold(i.text)))
  const matches =
    q.length >= 2
      ? (history ?? [])
          .filter((h) => {
            const f = fold(h.text)
            return f.includes(q) && !openTexts.has(f)
          })
          .slice(0, 5)
      : []

  // Auto-pick: for each list item, grab the top (best-value) deal and stage it,
  // then jump straight to the review screen. Best-first is the server's sort.
  // Carries each line's saved synonyms into the lookup, same as the proof sheet.
  async function autoPick(rows: ListRow[]) {
    setAuto(true)
    let any = false
    for (const item of rows) {
      try {
        const terms = parseTerms(item.search_terms)
        const qs = `deals?q=${encodeURIComponent(item.text)}${terms.length ? `&terms=${encodeURIComponent(terms.join(','))}` : ''}`
        const r = await api<{ deals: Deal[] }>(qs)
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
          <h1 className="greet">{t.nav.list}</h1>
        </div>
        <div className="avatar" style={{ background: 'var(--marigold-wash)' }}>
          <Icon name={CATS.list.icon} size={26} color={CATS.list.deep} />
        </div>
      </div>

      {/* Two intents, one screen: prepare the list at home, or shop with it at the
          store (where a check means "in my cart" and the cashier appears). */}
      <div className="list-mode" role="tablist" aria-label={t.nav.list}>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'home'}
          className={`list-mode__opt${mode === 'home' ? ' is-on' : ''}`}
          onClick={() => chooseMode('home')}
        >
          🏠 {t.list.modeHome}
        </button>
        <button
          type="button"
          role="tab"
          aria-selected={mode === 'store'}
          className={`list-mode__opt${mode === 'store' ? ' is-on' : ''}`}
          onClick={() => chooseMode('store')}
        >
          🛒 {t.list.modeStore}
        </button>
      </div>
      <p className="list-mode__hint mono">{mode === 'store' ? t.list.modeStoreHint : t.list.modeHomeHint}</p>

      {/* Add a line right here — type it or speak it. The direct path; the ＋
          capture sheet still works for the AI-routed quick note. */}
      <form className="list-add" onSubmit={addItem}>
        <input
          className="input"
          value={addText}
          onChange={(e) => setAddText(e.target.value)}
          placeholder={listening ? t.capture.listening : t.list.addPlaceholder}
          aria-label={t.list.addPlaceholder}
        />
        {hasVoice && (
          <button
            type="button"
            className={`btn btn--ghost list-add__voice${listening ? ' is-listening' : ''}`}
            onClick={startVoice}
            aria-label={t.capture.voice}
          >
            🎤
          </button>
        )}
        <button type="submit" className="btn btn--primary" disabled={!addText.trim() || adding}>
          <Icon name="plus-bold" size={18} />
          {t.capture.add}
        </button>
      </form>

      {/* "You've added this before" — past items matching what's being typed,
          one tap to re-add. Quiet chips, never a dropdown over the list. */}
      {matches.length > 0 && (
        <div className="list-suggest" aria-label={t.list.history}>
          {matches.map((h) => (
            <button
              key={h.key}
              type="button"
              className="list-suggest__chip"
              onClick={() => void submitAdd(h.text)}
              aria-label={`${t.ghost.add} ${h.text}`}
            >
              <span className="list-suggest__plus" aria-hidden="true">＋</span>
              {h.text}
            </button>
          ))}
        </div>
      )}

      {list.length === 0 ? (
        <p className="feed-empty">{t.board.listEmpty}</p>
      ) : (
        <div className="stagger">
          {list.map((item) => {
            const adder = item.added_by ? memberById.get(item.added_by) : null
            const staged = parseDeal(item.deal_json)
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
                // Store mode: a checked row is "in my cart" and stays put.
                checked={mode === 'store' && inCart.has(item.id)}
                toggleLabel={mode === 'store' ? t.list.inCart : t.list.check}
                onImage={() => openFlyer(item)}
                imageLabel={t.list.openFlyer}
                onName={() => setEditItem(item)}
                nameLabel={t.list.edit}
                onToggle={() => (mode === 'store' ? toggleCart(item.id) : checkOff(item))}
                proof={
                  <button
                    type="button"
                    className={`list-row__proof${staged ? ' is-picked' : ''}`}
                    onClick={() => openFlyer(item)}
                    aria-label={t.shop.proof}
                    title={t.shop.proof}
                  >
                    {staged ? '✓' : '🏷️'}
                  </button>
                }
              />
            )
          })}
        </div>
      )}

      {/* The done shelf: checked-off items don't vanish — they land here in the
          same row format (just without the flyer deal), one tap to put back. */}
      {done.length > 0 && (
        <section className="list-done" aria-label={t.list.done}>
          <div className="list-done__head mono">✓ {t.list.done}</div>
          <div className="stagger">
            {(doneOpen ? done : done.slice(0, 6)).map((d) => (
              <ListItemRow
                key={d.id}
                text={d.text}
                picto={pictoFor(d.text, '')}
                adder={d.added_by ? memberById.get(d.added_by) : null}
                checked
                toggleLabel={t.list.restore}
                onImage={() => void restore(d)}
                imageLabel={t.list.restore}
                onName={() => void restore(d)}
                nameLabel={t.list.restore}
                onToggle={() => void restore(d)}
              />
            ))}
          </div>
          {!doneOpen && done.length > 6 && (
            <button type="button" className="ghost-strip__more mono" onClick={() => setDoneOpen(true)}>
              +{done.length - 6} {t.ghost.more}
            </button>
          )}
        </section>
      )}

      <GhostStrip ghosts={ghosts} onAdd={(g) => addGhost.mutate(g)} />

      <div className="list-actions">
        <button type="button" className="btn btn--ghost mono" onClick={() => setBrowseOpen(true)}>
          🔎 {t.shop.browse}
        </button>
      </div>

      {/* Shopping tools live in store mode: auto-pick the best prices, show the
          cashier, and empty the cart when the trip's done. */}
      {mode === 'store' && list.length > 0 && (
        <div className="list-actions">
          <button type="button" className="btn btn--ghost mono" onClick={() => autoPick(list)} disabled={auto}>
            {auto ? t.shop.autoWorking : `✨ ${t.shop.auto}`}
          </button>
          {pickList.length > 0 && (
            <button type="button" className="btn btn--primary" onClick={() => setCashierOpen(true)}>
              🧾 {t.shop.present} ({pickList.length})
            </button>
          )}
          {inCart.size > 0 && (
            <button type="button" className="btn btn--ghost mono" onClick={() => void clearCart()}>
              ✓ {t.list.clearCart} ({inCart.size})
            </button>
          )}
        </div>
      )}

      {proofFor && (
        <PriceMatchSheet
          itemId={proofFor.id}
          query={proofFor.text}
          terms={proofFor.terms}
          onClose={() => setProofFor(null)}
        />
      )}

      {editItem && <ListItemSheet item={editItem} onClose={() => setEditItem(null)} />}

      {cashierOpen && (
        <CashierMode
          picks={pickList}
          onRevise={(p) => setProofFor({ id: p.itemId, text: p.itemText, terms: [] })}
          onRemove={(itemId) => unstageDeal(qc, itemId)}
          onClose={() => setCashierOpen(false)}
        />
      )}

      {browseOpen && <DealsBrowser onClose={() => setBrowseOpen(false)} />}
    </main>
  )
}
