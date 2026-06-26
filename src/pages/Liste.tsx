import { Fragment, useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { Icon, InlineIcon } from '../components/Icon'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { EmptyState } from '../components/EmptyState'
import { CATS } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useT, useLang } from '../i18n'
import { useAisleOrder, useAisleOverrides } from '../lib/aislePrefs'
import { aisleFor, aisleRanks, AISLE_BY_ID } from '../lib/aisle'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { useCreateWithUndo } from '../lib/undoCreate'
import { useDeferredRemoval } from '../lib/useDeferredRemoval'
import { useVoiceInput } from '../lib/useVoiceInput'
import { isGuest } from '../lib/device'
import { EditField } from '../components/EditField'
import { money } from '../lib/deals'
import { pickListFrom, parseDeal } from '../lib/picks'
import { pictoFor } from '../lib/picto'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { usePointerDnd, DragGhost, DND_HOLD_MS } from '../lib/dnd'
import { BOARD_KEY } from '../lib/queryKeys'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { LISTE_HELP } from '../lib/listeHelp'

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
//   - "Clear checked" (a small "Vider" tucked to the side) removes every checked
//     line in one go (→ logged as bought, which feeds the predictions) and leaves
//     the un-ticked items for next time.
//   - Below the add bar sit the two "fill the list" shortcuts as prominent buttons:
//     "Parcourir les circulaires" (browse flyers / stage deals) and "Ajout rapide"
//     (restock past/predicted items, carrying their flyer synonyms). Both also stay
//     reachable from the ＋ Add sheet. "Montrer à la caisse" appears once deals are
//     staged.
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
// Per-DEVICE list sort choice (not a household setting — a phone may want aisle
// order while the wall keeps the hand-dragged one). 'mine' = the dragged order,
// 'aisle' = grouped/sorted by the household's aisle order.
const LIST_SORT_KEY = 'liste-sort'

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
  aisleTag,
  dnd,
  index,
  readOnly = isGuest(),
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
  // A small muted aisle tag under the name (shown in "Mon ordre" so the aisle is
  // still visible without grouping; "Par allée" uses headers instead).
  aisleTag?: React.ReactNode
  // Drag-and-drop reorder: the shared pointer-DnD handle + this row's position. The
  // zone id and the drag id are both the index (a drop = "move dragged row here").
  dnd?: ReturnType<typeof usePointerDnd>
  index: number
  // Read-only guest: no check toggle, no swipe-to-delete, no delete pane, no drag
  // grip. The picture/name taps stay — they only navigate (open the flyer / detail).
  readOnly?: boolean
}) {
  const t = useT()
  const mainRef = useRef<HTMLDivElement>(null)
  // Only wire the swipe-delete when writes are allowed; a guest's row never deletes.
  useSwipeToDelete(mainRef, readOnly ? () => {} : onDelete)
  const zoneId = String(index)
  const draggable = !!dnd && !readOnly
  // Where, exactly, the dragged row will land — an INSERTION LINE on the right edge
  // of this row, so you feel the gap it'll drop into rather than guessing from a
  // whole-row highlight. Drag direction decides the edge: coming from above
  // (from < here) it lands BELOW this row; from below, ABOVE it. Never on the
  // dragged row's own slot (over === activeId), where there's no move to show.
  const overHere = !!dnd && dnd.over === zoneId && dnd.activeId !== null && dnd.activeId !== zoneId
  const fromIdx = dnd?.activeId != null ? Number(dnd.activeId) : null
  const dropEdge = overHere ? (fromIdx !== null && fromIdx < index ? 'bottom' : 'top') : null
  const zoneClass =
    'list-row' +
    (dnd?.activeId === zoneId ? ' is-dragging' : '') +
    (overHere ? ' dnd-over' : '')
  return (
    <div className={zoneClass} data-dnd-zone={draggable ? zoneId : undefined}>
      {/* The precise drop indicator: a calm accent line in the gap where the row
          will land, on the edge the drag is heading toward. */}
      {dropEdge && <span className={`list-row__drop list-row__drop--${dropEdge}`} aria-hidden="true" />}
      {/* The delete pane revealed behind the row as it slides left under the
          finger. Inert/aria-hidden — the swipe drives it; the edit sheet keeps an
          actual Delete button for non-touch. */}
      {!readOnly && (
        <span className="list-row__del" aria-hidden="true">
          <span className="list-row__del-icon"><Icon name="trash-bold" size={18} /></span>
          <span className="list-row__del-label">{deleteLabel}</span>
        </span>
      )}
      <div ref={mainRef} className={`act list-row__main${checked ? ' done' : ''}`}>
        <span className="spine" style={{ background: CATS.list.color }} aria-hidden="true" />
        {draggable && (
          // Press-and-hold the grip to reorder. It lives outside the swipe path
          // (data-dnd-grip makes useSwipeToDelete ignore it), so dragging the handle
          // never half-arms a swipe-delete.
          <span
            className="dnd-grip list-row__grip"
            data-dnd-grip=""
            role="button"
            aria-label={t.operator.dragHint}
            title={t.operator.dragHint}
            onPointerDown={(e) => dnd!.start(zoneId, text, e)}
          >
            ⠿
          </span>
        )}
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
          {aisleTag}
        </button>
        {adder && (
          <span
            className="list-row__by"
            style={{ background: adder.colour }}
            title={adder.display_name}
            aria-label={adder.display_name}
          >
            {(adder.display_name?.[0] ?? '?').toUpperCase()}
          </span>
        )}
        {!readOnly && (
          <button type="button" className="check list-row__toggle" onClick={onToggle} aria-label={toggleLabel}>
            <Icon name="check-bold" size={18} />
          </button>
        )}
      </div>
    </div>
  )
}

export function Liste() {
  const t = useT()
  const { lang } = useLang()
  const { audience } = useAudience()
  const { surface } = useSurface()
  const nav = useNavigate()
  const createWithUndo = useCreateWithUndo()
  const write = useWrite()
  // Bulletproof calm-delete for the list (the shared hook codifies what this page
  // pioneered): hide cleared/deleted ids + filter them out, and await a refetch
  // before un-hiding so the poll can't flash a just-removed row back.
  const removal = useDeferredRemoval(BOARD_KEY)
  const qc = useQueryClient()
  // Drag-and-drop reorder of the list. The grip on each row starts a press-and-hold
  // drag (DND_HOLD_MS); dropping onto another row's zone moves the dragged row to
  // that slot. We read the live rendered order out of the cache at drop time (the
  // hook must run before any early return, so it can't close over the `list` const
  // computed below), splice it, and persist the new id order — the server writes
  // position 0..n and the poll resorts everyone to match.
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => {
      const from = Number(fromId)
      const to = Number(toZone)
      if (!Number.isInteger(from) || !Number.isInteger(to) || from === to) return
      const cur = removal.visible(qc.getQueryData<BoardListData>(BOARD_KEY)?.list ?? [])
      const ids = cur.map((i) => i.id)
      if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return
      const [moved] = ids.splice(from, 1)
      ids.splice(to, 0, moved)
      reorderTo(ids)
    },
    holdMs: DND_HOLD_MS,
  })
  // Aisle sort: the household's saved aisle order (Réglages ▸ Magasinage) + a
  // per-device choice of which order to view the list in. 'aisle' groups + sorts by
  // the store walk; 'mine' keeps the hand-dragged order (so the drag grip only shows
  // there). Persisted to localStorage so a kiosk and a phone can each keep their own.
  const aislePrefs = useAisleOrder()
  const aisleOverrides = useAisleOverrides()
  const [sortMode, setSortMode] = useState<'mine' | 'aisle'>(() => {
    try {
      return localStorage.getItem(LIST_SORT_KEY) === 'aisle' ? 'aisle' : 'mine'
    } catch {
      return 'mine'
    }
  })
  function chooseSort(m: 'mine' | 'aisle') {
    setSortMode(m)
    try {
      localStorage.setItem(LIST_SORT_KEY, m)
    } catch {
      /* private mode / storage blocked — the choice just won't persist */
    }
  }
  // Contextual "?" help mode (shared hook): arm it in the header, then tap one of
  // the list's controls (flyer search / Vider les cochés / cashier) to learn what
  // it does in place instead of running it. La liste is one flat list, so its help
  // targets are these buttons, not section headings.
  const helpLabel = (k: string) =>
    ({ flyer: t.shop.browse, quick: t.list.quickAdd, clear: t.list.clearChecked, cashier: t.shop.present })[k] ?? k
  const help = useHelpMode(LISTE_HELP, helpLabel)
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

  // Add a line to the list. `terms` (optional) carries flyer synonyms — the
  // quick-add panel passes them so a re-added item keeps its deal search.
  async function postAdd(text: string, terms?: string[]) {
    if (!text) return
    // Show the new line INSTANTLY via an optimistic temp row — offline, the
    // invalidate can't refetch it; on reconnect the queued POST creates the real
    // row and the invalidate swaps the temp one out.
    const tmpId = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`
    // Online add returns the real id → offer Annuler that deletes exactly that line
    // (the COMPENSATING undo), even after several quick voice adds stack up. Offline
    // adds skip the undo (no server id yet); deleting the row is the way back.
    await createWithUndo({
      endpoint: 'list',
      body: terms && terms.length ? { text, search_terms: terms } : { text },
      affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
      optimistic: (qc) =>
        qc.setQueryData<BoardListData>(BOARD_KEY, (b) =>
          b ? { ...b, list: [...b.list, { id: tmpId, text, source: 'manual', checked_at: null }] } : b,
        ),
      message: t.undo.added(text),
      undoAffectedKeys: [BOARD_KEY, GHOSTS_KEY],
    })
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
    void write('list', {
      method: 'PATCH',
      body: { id: item.id, checked: checking },
      affectedKeys: [BOARD_KEY],
      optimistic: (qc) =>
        qc.setQueryData<BoardListData>(BOARD_KEY, (b) =>
          b ? { ...b, list: b.list.map((i) => (i.id === item.id ? { ...i, checked_at: ts } : i)) } : b,
        ),
    }).catch(() => {})
  }

  // Clear checked: every ticked line is a confirmed buy. The shared hook hides them
  // NOW + filters them out and holds the delete behind the undo toast — a mis-tap
  // costs nothing. Pass the exact ids so a check made AFTER scheduling isn't swept
  // up. Committing logs the buys (→ predictions shift, refresh the ghosts).
  function clearChecked(ids: string[]) {
    removal.remove(ids, t.undo.clearedN(ids.length), () =>
      write('list', {
        method: 'PATCH',
        body: { clearChecked: true, ids },
        affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
      }).catch(() => {}),
    )
  }

  // Persist a hand-reordered list. Optimistically resort the shared board cache to
  // the new id order so the move sticks instantly (offline too, via useWrite's
  // outbox); the server writes position 0..n and the next poll confirms it. A row
  // not in the set (mid-undo removal) sorts last and self-heals on refetch.
  function reorderTo(ids: string[]) {
    void write('list', {
      method: 'PATCH',
      body: { reorder: ids },
      affectedKeys: [BOARD_KEY],
      optimistic: (cache) =>
        cache.setQueryData<BoardListData>(BOARD_KEY, (b) => {
          if (!b) return b
          const pos = new Map(ids.map((id, i) => [id, i]))
          const sorted = [...b.list].sort(
            (a, c) => (pos.get(a.id) ?? Number.MAX_SAFE_INTEGER) - (pos.get(c.id) ?? Number.MAX_SAFE_INTEGER),
          )
          return { ...b, list: sorted }
        }),
    }).catch(() => {})
  }

  // Swipe-left delete: a plain remove from the list — NOT logged as bought (that
  // path is the check + "Clear checked"). Same deferred shape via the shared hook.
  function deleteItem(item: ListRow) {
    removal.remove([item.id], t.undo.cleared(item.text), () =>
      write('list', { method: 'DELETE', body: { id: item.id }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    )
  }

  if (isUnauthorized(error)) return <PairPrompt />
  if (!board && !error) return <Loading />
  // Hide items whose clear is still settling so they can't be resurrected.
  const list = removal.visible(board?.list ?? [])
  const checkedIds = list.filter((i) => i.checked_at).map((i) => i.id)
  // Who-added-it faces: map member id → member so each row can show a tiny tint.
  const memberById = new Map((board?.members ?? []).map((m) => [m.id, m]))

  // The cashier set = every list line carrying a staged deal (server state, in
  // sync across devices, gone once the item is cleared). Deals get staged from the
  // flyer browser (reached via the ＋ Add sheet → Circulaires).
  const pickList = pickListFrom(list)

  // The order the list is shown in. 'aisle' → grouped + sorted by the household's
  // aisle walk; classification reuses the row-picture keywords (aisleFor). A STABLE
  // sort, so items in the same aisle keep their hand/position order. 'mine' → the
  // list as the cache holds it (the dragged order), unchanged.
  const byAisle = sortMode === 'aisle'
  const ranks = aisleRanks(aislePrefs.order)
  // Classify with the per-item overrides applied (a corrected item beats the guess).
  const aisleOf = (text: string) => aisleFor(text, aisleOverrides)
  const displayList = byAisle ? [...list].sort((a, b) => ranks[aisleOf(a.text)] - ranks[aisleOf(b.text)]) : list

  // "Mon ordre" seed: write the list's positions to match the aisle walk right now,
  // so you START from aisle order and then hand-tweak from there — and it's kept
  // (persisted via the same reorder write). One tap; only meaningful in Mon ordre.
  function sortByAisleNow() {
    const ids = [...list].sort((a, b) => ranks[aisleOf(a.text)] - ranks[aisleOf(b.text)]).map((i) => i.id)
    reorderTo(ids)
  }

  if (audience === 'toddler') {
    // Read-only for toddlers: tapping a tile reads it aloud but never checks it
    // off. Show only what's still needed (un-ticked) — a kid sees what's left to
    // get. Each tile draws its own picture (milk/bread/apple…) so it's legible to
    // someone who can't read, never a wall of identical carts.
    const tiles: Tile[] = displayList
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
    <main className={'today-feed' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.list}
        icon={CATS.list.icon}
        // Match the footer nav's Liste tab (sky #5891AC = --sky-deep), not
        // CATS.list's marigold — the section identity is sky blue everywhere else.
        iconColor="var(--sky-deep)"
        background="var(--sky-wash)"
        card="liste"
      />

      <SectionIntro card="liste" />

      {/* La liste's header has no control group to sit the "?" beside (it's one
          flat list), so the toggle gets its own quiet right-aligned row. */}
      {help.available && (
        <div className="hub-helprow">
          <HelpToggle active={help.active} onToggle={help.toggle} />
        </div>
      )}
      {help.hint && <HelpHint />}

      {/* Add a line right here — type it or speak it. The direct path; the ＋
          capture sheet still works for the AI-routed quick note. */}
      <div data-tour="liste-add">
      <EditField
        value={addText}
        onChange={setAddText}
        onSubmit={() => addItem()}
        submitLabel={t.common.add}
        submitLeadingIcon="plus-bold"
        submitVariant="primary"
        busy={adding}
        voice={voice}
        placeholder={
          voice.listening
            ? t.capture.listening
            : surface === 'mobile'
              ? t.list.addPlaceholderShort
              : t.list.addPlaceholder
        }
        ariaLabel={t.list.addPlaceholder}
      />
      </div>

      {/* The two frequent "fill the list" moves earn real, prominent one-tap
          shortcuts here — not tucked away behind the ＋ Add sheet: searching the
          week's flyers for an aubaine ("Parcourir les circulaires") and reopening
          past/predicted items to restock ("Ajout rapide"). They split the row 50/50
          (glyph + short label each); full text stays on the aria-label/title. */}
      <div className="list-actions list-actions--split">
        <button
          type="button"
          className="btn btn--primary help-pick"
          aria-label={t.shop.browse}
          title={t.shop.browse}
          onClick={help.pick('flyer', () => nav('/liste/circulaires'))}
        >
          <InlineIcon name="magnifying-glass-bold" /> {t.shop.browseShort}
        </button>
        <button
          type="button"
          className="btn btn--primary help-pick"
          aria-label={t.list.quickAdd}
          title={t.list.quickAdd}
          onClick={help.pick('quick', () => nav('/liste/quick'))}
        >
          <InlineIcon name="plus-bold" /> {t.list.quickAddShort}
        </button>
      </div>
      {help.bubbleFor('flyer')}
      {help.bubbleFor('quick')}

      {/* Sort toggle: keep the hand-dragged order ("Mon ordre") or auto-group by
          store aisle ("Par allée", the order set in Réglages ▸ Magasinage). A quiet
          per-device view choice; only worth showing once there's more than one row. */}
      {list.length > 1 && (
        <div className="list-sortbar">
          <div className="list-sort" role="group" aria-label={t.list.sortBy}>
            <button
              type="button"
              className={'list-sort__seg' + (!byAisle ? ' is-on' : '')}
              aria-pressed={!byAisle}
              onClick={() => chooseSort('mine')}
            >
              <InlineIcon name="scroll-bold" /> {t.list.sortMine}
            </button>
            <button
              type="button"
              className={'list-sort__seg' + (byAisle ? ' is-on' : '')}
              aria-pressed={byAisle}
              onClick={() => chooseSort('aisle')}
            >
              <InlineIcon name="storefront-bold" /> {t.list.sortAisle}
            </button>
          </div>
          {/* In Mon ordre, seed the hand order from the aisle walk (then tweak). */}
          {!byAisle && !isGuest() && (
            <button type="button" className="btn btn--ghost btn--sm list-sortbar__apply" onClick={sortByAisleNow}>
              <InlineIcon name="storefront-bold" /> {t.list.sortApply}
            </button>
          )}
        </div>
      )}

      {list.length === 0 ? (
        <EmptyState guide={{ card: 'liste' }}>{t.board.listEmpty}</EmptyState>
      ) : (
        <div className="list-rows">
          {displayList.map((item, index) => {
            const adder = item.added_by ? memberById.get(item.added_by) : null
            const staged = parseDeal(item.deal_json)
            const checked = !!item.checked_at
            // Draw the item's own picture (milk/bread/apple…), falling back to the
            // list glyph only when nothing matches (a non-grocery note).
            const pic = pictoFor(item.text, '')
            // This item's aisle. In "Par allée" it drives the group header; in
            // "Mon ordre" it's shown as a small tag on the row so the aisle is still
            // visible without grouping.
            const ai = aisleOf(item.text)
            const aisleInfo = AISLE_BY_ID[ai]
            const showHeader = byAisle && ai !== (index > 0 ? aisleOf(displayList[index - 1].text) : null)
            return (
              <Fragment key={item.id}>
                {showHeader && (
                  <div className="list-aisle" role="presentation">
                    <span className="list-aisle__emoji" aria-hidden="true">
                      {aisleInfo.emoji}
                    </span>
                    <span className="list-aisle__name">{aisleInfo.label[lang]}</span>
                  </div>
                )}
                <ListItemRow
                  // The drag grip only makes sense in "Mon ordre" — aisle sort owns
                  // the order there, so no dnd is passed and the grip hides.
                  dnd={byAisle ? undefined : dnd}
                  index={index}
                  text={item.text}
                  picto={pic}
                  // In Mon ordre, a small aisle tag on the row (Par allée uses headers).
                  aisleTag={
                    !byAisle ? (
                      <span className="list-row__aisle">
                        <span aria-hidden="true">{aisleInfo.emoji}</span> {aisleInfo.label[lang]}
                      </span>
                    ) : undefined
                  }
                  dealImage={staged?.image}
                  // A staged flyer deal: store + price, visible on the row itself.
                  dealLabel={
                    staged ? (
                      <span className="list-row__deal mono">
                        <InlineIcon name="tag-bold" /> {staged.merchant} · {money(staged.price)}
                      </span>
                    ) : null
                  }
                  adder={adder}
                  checked={checked}
                  toggleLabel={checked ? t.list.uncheck : t.list.check}
                  onImage={() => nav(`/liste/deals/${item.id}`)}
                  imageLabel={t.list.openFlyer}
                  onName={() => nav(`/liste/item/${item.id}`)}
                  nameLabel={t.common.edit}
                  onToggle={() => toggleChecked(item)}
                  onDelete={() => deleteItem(item)}
                  deleteLabel={t.common.delete}
                />
              </Fragment>
            )
          })}
        </div>
      )}

      {/* Clear the trip: every checked line goes (logged as bought), the rest
          stays for next time. Kept small and tucked to the side — the list itself
          is the page, not its controls. */}
      {!isGuest() && checkedIds.length > 0 && (
        <div className="list-clear">
          <button
            type="button"
            className="btn btn--primary btn--sm help-pick"
            onClick={help.pick('clear', () => clearChecked(checkedIds))}
          >
            <InlineIcon name="check-bold" /> {t.list.clearChecked} ({checkedIds.length})
          </button>
        </div>
      )}
      {help.bubbleFor('clear')}

      {/* The one prominent shopping action: take the staged deals to the cashier.
          Browsing flyers and restocking past items live in the ＋ Add sheet now,
          so the page stays the list. */}
      {pickList.length > 0 && (
        <div className="list-actions">
          <button
            type="button"
            className="btn btn--primary help-pick"
            onClick={help.pick('cashier', () => nav('/liste/cashier'))}
          >
            <InlineIcon name="receipt-bold" /> {t.shop.present} ({pickList.length})
          </button>
        </div>
      )}
      {help.bubbleFor('cashier')}

      {/* The floating drag label that trails the finger while reordering. */}
      <DragGhost ghost={dnd.ghost} />
    </main>
  )
}
