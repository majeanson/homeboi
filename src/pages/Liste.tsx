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
import { Cluster } from '../components/Layout'
import { ActionMenu, type ActionMenuItem } from '../components/ActionMenu'
import { useAisleOrder, useAisleOverrides, useAisleTagsShown, setAisleTagsShown } from '../lib/aislePrefs'
import { aisleFor, aisleRanks, AISLE_BY_ID } from '../lib/aisle'
import { rushRank } from '../lib/listOrder'
import { mintTmpId } from '../lib/tmpIds'
import { spliceListLine } from '../lib/listAdd'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { PairPrompt } from '../components/Fallback'
import { Skeleton } from '../components/Skeleton'
import { useCreateWithUndo } from '../lib/undoCreate'
import { useDeferredRemoval } from '../lib/useDeferredRemoval'
import { useVoiceInput } from '../lib/useVoiceInput'
import { isGuest } from '../lib/device'
import { EditField } from '../components/EditField'
import { money, dealDate, dealEnded, type Deal } from '../lib/deals'
import { cashierPicksFrom, useTillHiddenStores, parseDeal, parseTerms, sameItemName } from '../lib/picks'
import { pictoFor } from '../lib/picto'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { usePointerDnd, DragGhost, DND_HOLD_MS, dropCueOf, dropEdgeClass } from '../lib/dnd'
import { BOARD_KEY, GHOSTS_KEY, HISTORY_KEY } from '../lib/queryKeys'
import { useHelpMode, HelpToggle, HelpHint } from '../lib/helpMode'
import { LISTE_HELP } from '../lib/listeHelp'
import { RowActions } from '../components/RowActions'
import { SwipeDeletePane } from '../components/SwipeDeletePane'
import { ZoomableImg } from '../components/ZoomableImg'
import { useLongPress } from '../lib/useLongPress'
import { useEntityDetail } from '../components/detail/DetailProvider'
import { buildListItem } from '../components/detail/adapters'
import type { Member as DetailMember } from '../components/board/types'
import { useListeAdvanced, setListeAdvanced } from '../lib/listeMode'
import { ModeToggle } from '../components/ModeToggle'

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
  non_urgent?: number | null // 1 = « pas pressé »: buy it only if a good deal is on
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
// Per-DEVICE list sort choice (not a household setting — a phone may want aisle
// order while the wall keeps the hand-dragged one). 'mine' = the dragged order,
// 'aisle' = grouped/sorted by the household's aisle order.
const LIST_SORT_KEY = 'liste-sort'

// The zoomed clipping's caption — the staged deal spelled out the way the cashier
// peek (CashierMode's bigcard) does it: the flyer product's own name, the item it's
// for, store, price (+ « avant » / unit price) and the validity — with « Aubaine
// terminée » said loud once the validTo day is past, since "is this still the
// deal?" is the whole reason the picture gets tapped.
function DealZoomCaption({ itemText, deal }: { itemText: string; deal: Deal }) {
  const t = useT()
  const { lang } = useLang()
  const ended = dealEnded(deal.validTo)
  const until = deal.validTo ? `${t.shop.until} ${dealDate(deal.validTo, lang)}` : ''
  const priceBits = [
    deal.price != null ? money(deal.price) : null,
    deal.wasPrice != null && deal.wasPrice > (deal.price ?? 0) ? `${t.shop.was} ${money(deal.wasPrice)}` : null,
    deal.unitPrice != null ? `${money(deal.unitPrice)}${deal.unitLabel ?? ''}` : null,
  ].filter((x): x is string => !!x)
  const head = [itemText, deal.merchant?.trim() || null].filter((x): x is string => !!x).join(' · ')
  // The product name is only worth a second line when it SAYS something the head
  // doesn't. Adding an item straight from the flyer names the list line after the
  // product, so the two were identical and the caption printed it twice
  // (« MELON D'EAU ENTIER SANS PÉPINS, ENVIRON 9 LB · Maxi » then the same again).
  // Compared through `sameItemName` — the exact-match tier of `matchListItem`, the
  // very matcher that linked this deal onto this line — so the two agree on what
  // "the same item" means, accents, case, plurals and leading quantities included.
  const name = deal.name?.trim()
  const nameAdds = !!name && !sameItemName(name, itemText)
  return (
    <>
      <span>{head}</span>
      {nameAdds && <span className="zoom-cap__name">{name}</span>}
      {priceBits.length > 0 && <span className="zoom-cap__price">{priceBits.join(' · ')}</span>}
      {ended ? (
        <span className="zoom-cap__ended">
          <InlineIcon name="warning-bold" size={13} /> {t.shop.dealEnded}
          {until ? ` (${until})` : ''}
        </span>
      ) : (
        until && <span>{until}</span>
      )}
    </>
  )
}

// One list row, drawn the same way for every item. Three independent tap targets:
// the picture opens the item's detail/edit sheet (rename, aisle, deals door,
// delete — the row keeps NO always-on action buttons, compact-rows pass), the
// whole row centre (the NAME) toggles the check — the in-store gesture, so a
// mis-aim by a cart-pushing thumb still ticks the item instead of yanking open
// the editor — and the check disc toggles too. "Who added it" reads from the
// TITLE's tint (the adder's member colour; nextFreeColour keeps member colours
// distinct from the marigold household fallback) instead of an avatar disc.
// A checked row keeps its place but reads as "got it" (struck, filled check)
// until "Clear checked" removes it. Swiping the row LEFT deletes it outright
// (Outlook-mobile style) — a plain remove, NOT logged as bought (that's what
// the check + "Clear checked" is for); the edit sheet keeps the mouse/keyboard
// Delete mirror.
//
// A « pas pressé » row (noRush) is drawn as one recognisable second class — pencilled
// in rather than errand-bound — so the eye can skip the whole set of them when there's
// no aubaine on. It behaves exactly like any other row otherwise.
function ListItemRow({
  itemId,
  text,
  picto,
  dealImage,
  dealLabel,
  dealDetail,
  advanced,
  adder,
  checked,
  noRush,
  toggleLabel,
  onName,
  nameLabel,
  onToggle,
  onDelete,
  deleteLabel,
  aisleTag,
  dnd,
  onMove,
  index,
  readOnly = isGuest(),
}: {
  /** Read off the row by the page's long-press listener to open THIS item. */
  itemId: string
  text: string
  picto: string
  dealImage?: string | null
  dealLabel?: React.ReactNode
  /** The staged deal spelled out, shown under the picture once it's zoomed. */
  dealDetail?: React.ReactNode
  /** AVANCÉ (lib/listeMode): put the explicit ✏️/🗑 back on the row. */
  advanced?: boolean
  adder?: ListMember | null
  checked?: boolean
  // « Pas pressé »: only worth buying on a deal. Purely a presentation state.
  noRush?: boolean
  toggleLabel: string
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
  // The grip's KEYBOARD mirror (focus it, ↑/↓): the drag is invisible to a
  // keyboard, so the same handle answers arrows too. Only passed with `dnd`.
  onMove?: (dir: 'up' | 'down') => void
  index: number
  // Read-only guest: no check toggle, no ✏️, no swipe-to-delete, no delete pane,
  // no drag grip. The picture/name taps stay — for a guest the name NAVIGATES to
  // the (read-only) detail instead of toggling a check it doesn't have.
  readOnly?: boolean
}) {
  const t = useT()
  const mainRef = useRef<HTMLDivElement>(null)
  // Only wire the swipe-delete when writes are allowed; a guest's row never deletes.
  useSwipeToDelete(mainRef, readOnly ? () => {} : onDelete)
  const zoneId = String(index)
  const draggable = !!dnd && !readOnly
  // Where, exactly, the dragged row will land — an INSERTION LINE in the gap it
  // will drop into, rather than a whole-row highlight you have to interpret. The
  // POINTER picks the edge (top half → lands above this row, bottom half → below);
  // `data-dnd-insert="y"` below is what tells lib/dnd to read it that way. Never on
  // the dragged row's own slot, where there's no move to show.
  const cue = dnd ? dropCueOf(dnd, zoneId) : null
  const dropEdge = dropEdgeClass(cue, 'y')
  const overHere = !!dropEdge
  const zoneClass =
    'list-row' +
    (noRush ? ' list-row--norush' : '') +
    (dnd?.activeId === zoneId ? ' is-dragging' : '') +
    (overHere ? ' dnd-over' : '')
  return (
    <div
      className={zoneClass}
      data-item-id={itemId}
      data-dnd-zone={draggable ? zoneId : undefined}
      // A reorderable column: the pointer's half of the row picks before/after.
      data-dnd-insert={draggable ? 'y' : undefined}
    >
      {/* The precise drop indicator: a calm accent line in the gap where the row
          will land, on the edge the drag is heading toward. */}
      {dropEdge && <span className={`dnd-drop dnd-drop--${dropEdge}`} aria-hidden="true" />}
      {/* The delete pane revealed behind the row as it slides left under the
          finger (shared with Ajout rapide) — the edit sheet keeps an actual
          Delete button for non-touch. */}
      {!readOnly && <SwipeDeletePane label={deleteLabel} />}
      <div ref={mainRef} className={`act list-row__main${checked ? ' done' : ''}`}>
        {draggable && (
          // Press-and-hold the grip to reorder. It lives outside the swipe path
          // (data-dnd-grip makes useSwipeToDelete ignore it), so dragging the handle
          // never half-arms a swipe-delete.
          <span
            className="dnd-grip list-row__grip"
            data-dnd-grip=""
            role="button"
            // Focusable on purpose: the drag is invisible to a keyboard, so the
            // SAME handle is the arrow door — Tab to the grip, ↑/↓ move the row
            // (ACTIONS.md ¹³, the desktop-reachability rule). preventDefault so
            // an arrow moves the ROW, not the page scroll.
            tabIndex={0}
            aria-label={`${t.list.reorderHint} — ${text}`}
            title={t.list.reorderHint}
            onPointerDown={(e) => dnd!.start(zoneId, text, e)}
            onKeyDown={(e) => {
              if (!onMove || (e.key !== 'ArrowUp' && e.key !== 'ArrowDown')) return
              e.preventDefault()
              onMove(e.key === 'ArrowUp' ? 'up' : 'down')
            }}
          >
            ⠿
          </span>
        )}
        {/* A row with a flyer clipping: the picture is the PICTURE. Tap it and it
            opens full-screen with the deal spelled out underneath — the "is this
            still the aubaine?" check, answered without leaving the list. Editing
            moved off this tap: press and hold the row (or flip ⚙ Avancé for an
            explicit ✏️, which is also the mouse/keyboard door). */}
        {dealImage ? (
          <span className="list-row__img list-row__img--zoom">
            <span className="tile list-row__thumb">
              <ZoomableImg src={dealImage} alt={text} caption={dealDetail} />
            </span>
          </span>
        ) : (
        <button type="button" className="list-row__img" onClick={onName} aria-label={`${nameLabel} — ${text}`}>
          {picto ? (
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
        )}
        {/* The row centre: the biggest target does the most frequent job — the
            CHECK (same handler as the disc, deferred/pending behaviour intact).
            Editing moved to the explicit ✏️ beside the check; a guest's name tap
            still navigates (it has no check to toggle). */}
        {/* NO aria-label here, deliberately: this button's content IS the row —
            the item, « pas pressé », the staged deal, the aisle — and an aria-label
            would REPLACE all of it with a bare « Cocher », which is what used to
            happen (the note below about naming the second class on the row was
            defeated by exactly that). `aria-pressed` carries the verb instead: the
            control announces as a toggle with its state, and the two labelled
            controls beside it (the picture, the check disc) still name the action
            explicitly. */}
        <button
          type="button"
          className="list-row__name act__text"
          onClick={readOnly ? onName : onToggle}
          aria-pressed={readOnly ? undefined : checked}
        >
          {/* The tint is inline (adder colour, else the CATS list marigold — the
              « Maisonnée » voice), so a « pas pressé » row has to soften it here —
              a stylesheet rule would lose to the inline colour. The tint IS the
              "who added it" signal now (the avatar disc is gone). */}
          <span
            className="title"
            style={{ color: noRush ? 'var(--ink-soft)' : tintInk(adder?.colour ?? CATS.list.color) }}
            title={adder?.display_name}
          >
            {text}
          </span>
          {/* The fade alone would leave the row's second class to be inferred from
              contrast (and invisible to a screen reader) — name it on the row. */}
          {noRush && (
            <span className="list-row__norush">
              <InlineIcon name="hourglass-high-bold" size={12} /> {t.list.rushNone}
            </span>
          )}
          {/* The name column carries the row's SECOND line — the quiet facts about
              the item (who added it, its deal, its aisle). They belong to the text,
              not to the row's furniture: measured at 390px, keeping the « who »
              disc as its own column left the title 55px — nine characters — and a
              long grocery name ("Lait à la bolognaise maison…") broke mid-word into
              a screen-tall row. Here it costs the title nothing. */}
          <span className="list-row__meta">
            {dealLabel}
            {aisleTag}
          </span>
        </button>
        {/* Same as the todo row: the adder's tint is a colour-only signal, so the
            name rides into the accessible tree here rather than renaming a control. */}
        {adder && <span className="sr-only">{adder.display_name}</span>}
        {/* AVANCÉ only. The long-press that edits in the simple face is invisible to
            a mouse and unreachable from a keyboard, so this pair is the non-touch
            door — the reason the toggle exists at all, not decoration. */}
        {advanced && !readOnly && (
          <RowActions
            className="list-row__acts"
            onEdit={onName}
            editLabel={`${nameLabel} — ${text}`}
            onDelete={onDelete}
            deleteLabel={`${deleteLabel} — ${text}`}
            size={16}
          />
        )}
        {!readOnly && (
          <button type="button" className="check list-row__toggle" onClick={onToggle} aria-label={`${toggleLabel} — ${text}`}>
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
  // SIMPLE ↔ AVANCÉ (lib/listeMode) — the same device-local flag « Les notes » uses.
  const advanced = useListeAdvanced()
  const detail = useEntityDetail()
  // Press and hold a row to edit it. The picture's tap now zooms the flyer clipping,
  // so the hold carries what that tap used to do. Grips and form fields are excluded
  // by the hook itself, so this never fights the drag-reorder or the add field — and
  // because a hold is invisible to a mouse and a keyboard, AVANCÉ's ✏️ is its mirror,
  // not a nicety (CLAUDE.md: no touch-only path to an action).
  // The hold opens the shared DETAIL PEEK, not the editor scene. In a shop you
  // mostly want to LOOK — « est-ce encore l'aubaine ? », « quelle allée ? », « qui
  // l'a mis ? » — and the peek answers all three without leaving the list;
  // « Modifier » inside it is one tap further into the same scene. AVANCÉ's ✏️
  // still goes straight there: it's the deliberate, non-touch path, and a peek in
  // front of it would only add a step.
  //
  // The builder needs data computed AFTER this hook (the aisle classifier, the
  // member map, the row's staged deal), and a hook can't move below the early
  // returns — so render fills this ref and the hold calls whatever is current.
  // Same shape as the kitchen-actions registration in HubLayout.
  const peekRef = useRef<(id: string) => void>(() => {})
  useLongPress({
    targets: '.list-row',
    enabled: !isGuest(),
    onLongPress: (el) => {
      const id = el.dataset.itemId
      if (id) peekRef.current(id)
    },
  })
  // Drag-and-drop reorder of the list. The grip on each row starts a press-and-hold
  // drag (DND_HOLD_MS); dropping onto another row's zone moves the dragged row to
  // that slot. We read the live rendered order out of the cache at drop time (the
  // hook must run before any early return, so it can't close over the `list` const
  // computed below), splice it, and persist the new id order — the server writes
  // position 0..n and the poll resorts everyone to match.
  // Move the row at `from` to slot `to` in the live cache order and persist.
  // Shared by the pointer DROP and the grip's keyboard ARROWS — the drag was the
  // only reorder path in « Mon ordre » (ACTIONS.md ¹³): a mouse can drag, a
  // keyboard could not, so the grip is focusable and ↑/↓ do the same splice.
  function moveRow(from: number, to: number) {
    if (from === to) return
    const cur = removal.visible(qc.getQueryData<BoardListData>(BOARD_KEY)?.list ?? [])
    const ids = cur.map((i) => i.id)
    if (from < 0 || from >= ids.length || to < 0 || to >= ids.length) return
    const [moved] = ids.splice(from, 1)
    ids.splice(to, 0, moved)
    reorderTo(ids)
  }
  const dnd = usePointerDnd({
    onDrop: (fromId, toZone) => {
      const from = Number(fromId)
      const to = Number(toZone)
      if (!Number.isInteger(from) || !Number.isInteger(to)) return
      moveRow(from, to)
    },
    holdMs: DND_HOLD_MS,
  })
  // Aisle sort: the household's saved aisle order (Réglages ▸ Magasinage) + a
  // per-device choice of which order to view the list in. 'aisle' groups + sorts by
  // the store walk; 'mine' keeps the hand-dragged order (so the drag grip only shows
  // there). Persisted to localStorage so a kiosk and a phone can each keep their own.
  const aislePrefs = useAisleOrder()
  const aisleOverrides = useAisleOverrides()
  // Device-local: print each row’s aisle under its name, or not (default not).
  const showAisleTags = useAisleTagsShown()
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
    ({ flyer: t.shop.browse, quick: t.list.quickAdd, clear: t.list.clearChecked, cashier: t.shop.present, search: t.search.title })[
      k
    ] ?? k
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
  // Stores hidden at the till — read here (before the early returns) so the
  // « Montrer à la caisse » count matches what the stepper will actually show.
  const tillHidden = useTillHiddenStores()

  // Add a line to the list. `terms` (optional) carries flyer synonyms — the
  // quick-add panel passes them so a re-added item keeps its deal search.
  async function postAdd(text: string, terms?: string[]) {
    if (!text) return
    // Show the new line INSTANTLY via an optimistic temp row — offline, the
    // invalidate can't refetch it; on reconnect the queued POST creates the real
    // row and the invalidate swaps the temp one out.
    const tmpId = mintTmpId()
    // Online add returns the real id → offer Annuler that deletes exactly that line
    // (the COMPENSATING undo), even after several quick voice adds stack up. Offline
    // adds skip the undo (no server id yet); deleting the row is the way back.
    await createWithUndo({
      endpoint: 'list',
      body: terms && terms.length ? { text, search_terms: terms } : { text },
      affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
      // A new line is an errand: it lands at the end of the errands, above any
      // « pas pressé » block — the same slot the server settles it into (the
      // shared splice, also used by the ＋ sheet and the ⚡ Quick add).
      optimistic: (qc) => spliceListLine(qc, tmpId, text),
      // E-41: if this add queues, later queued ops on the tmp row (check it, clear
      // it) get rewritten to the real id when the create replays.
      tmpId,
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
      }),
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
    // No .catch here on purpose: useDeferredRemoval needs to SEE a rejection to
    // tell "deleted, refetch failed" from "the delete failed" (it owns both cases).
    removal.remove([item.id], t.undo.cleared(item.text), () =>
      write('list', { method: 'DELETE', body: { id: item.id }, affectedKeys: [BOARD_KEY] }),
    )
  }

  if (isUnauthorized(error)) return <PairPrompt />
  if (!board && !error) return <Skeleton count={5} />
  // Hide items whose clear is still settling so they can't be resurrected.
  const list = removal.visible(board?.list ?? [])
  const checkedIds = list.filter((i) => i.checked_at).map((i) => i.id)
  // Who-added-it faces: map member id → member so each row can show a tiny tint.
  const memberById = new Map((board?.members ?? []).map((m) => [m.id, m]))

  // The cashier set = every list line carrying a staged deal (server state, in
  // sync across devices, gone once the item is cleared), minus till-hidden stores —
  // the same filter the /liste/cashier stepper applies, so the button's count is
  // the count the till will show. Deals get staged from the flyer browser (reached
  // via the ＋ Add sheet → Circulaires).
  const pickList = cashierPicksFrom(list, tillHidden)

  // The order the list is shown in. 'aisle' → grouped + sorted by the household's
  // aisle walk; classification reuses the row-picture keywords (aisleFor). A STABLE
  // sort, so items in the same aisle keep their hand/position order. 'mine' → the
  // list as the cache holds it (the dragged order), unchanged — a « pas pressé » row
  // dragged up there stays put, which is why only this branch skips the sort.
  const byAisle = sortMode === 'aisle'
  const ranks = aisleRanks(aislePrefs.order)
  // Classify with the per-item overrides applied (a corrected item beats the guess).
  const aisleOf = (text: string) => aisleFor(text, aisleOverrides)
  // Every AUTOMATIC order keys on « pas pressé » first: the aubaine-only lines sink
  // below the real errands, then the store walk orders each block.
  const byAisleThenRush = (a: ListRow, b: ListRow) =>
    rushRank(a) - rushRank(b) || ranks[aisleOf(a.text)] - ranks[aisleOf(b.text)]
  const displayList = byAisle ? [...list].sort(byAisleThenRush) : list
  // What an aisle header groups: the aisle WITHIN its block, so the header always
  // restarts where the « pas pressé » lines begin instead of swallowing the boundary.
  const groupOf = (i: ListRow) => `${rushRank(i)}:${aisleOf(i.text)}`

  // What the hold shows (see peekRef above). Built from the same values the row
  // draws from, so the peek can never disagree with the line it came from.
  peekRef.current = (id: string) => {
    const item = list.find((i) => i.id === id)
    if (!item) return
    const staged = parseDeal(item.deal_json)
    const ai = AISLE_BY_ID[aisleOf(item.text)]
    detail.open(
      buildListItem(
        {
          id: item.id,
          text: item.text,
          checked: !!item.checked_at,
          noRush: !!item.non_urgent,
          terms: parseTerms(item.search_terms),
        },
        { t, lang, members: (board?.members ?? []) as unknown as DetailMember[] },
        {
          adderId: item.added_by ?? null,
          picto: pictoFor(item.text),
          aisle: ai ? `${ai.emoji} ${ai.label[lang]}` : undefined,
          dealMerchant: staged?.merchant ?? null,
          dealPrice: staged?.price != null ? money(staged.price) : null,
          dealName: staged?.name ?? null,
          dealUntil: staged?.validTo ? `${t.shop.until} ${dealDate(staged.validTo, lang)}` : null,
          dealEnded: staged ? dealEnded(staged.validTo) : false,
          onToggle: () => toggleChecked(item),
          onDelete: () => deleteItem(item),
        },
      ),
    )
  }

  // Everything the « Allées » button opens. Two mutually exclusive sort rows
  // (radio: one order is always in force), then — in Mon ordre only — the aisle
  // tag toggle and the one-tap seed. « Par allée » drops both: its group headers
  // already print each aisle, and the walk IS the order there, so there's nothing
  // to seed. The tag is a DEVICE-local view preference (localStorage), so it is
  // not gated by isGuest — it writes nothing to the household; the seed rewrites
  // the household's row order, so it is.
  const sortItems: ActionMenuItem[] = [
    { icon: 'scroll-bold', label: t.list.sortMine, radio: true, checked: !byAisle, onSelect: () => chooseSort('mine') },
    {
      icon: 'storefront-bold',
      label: t.list.sortAisle,
      radio: true,
      checked: byAisle,
      onSelect: () => chooseSort('aisle'),
    },
    ...(byAisle
      ? []
      : [
          {
            icon: 'tag-bold' as const,
            label: t.list.aisleTags,
            checked: showAisleTags,
            separated: true,
            onSelect: () => setAisleTagsShown(!showAisleTags),
          },
          ...(isGuest()
            ? []
            : [{ icon: 'storefront-bold' as const, label: t.list.sortApply, onSelect: () => sortByAisleNow() }]),
        ]),
  ]

  // "Mon ordre" seed: write the list's positions to match the aisle walk right now,
  // so you START from aisle order and then hand-tweak from there — and it's kept
  // (persisted via the same reorder write). One tap; only meaningful in Mon ordre.
  function sortByAisleNow() {
    reorderTo([...list].sort(byAisleThenRush).map((i) => i.id))
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
        // The in-place help "?" tucks into the header cluster (beside search +
        // avatar) rather than stranding on its own row above a flat list.
        action={help.available ? <HelpToggle active={help.active} onToggle={help.toggle} /> : undefined}
        searchPick={(run) => help.pick('search', run)}
      />
      {help.bubbleFor('search')}

      <SectionIntro card="liste" />

      {help.hint && <HelpHint />}

      {/* Add a line right here — type it or speak it. The direct path; the ＋
          capture sheet still works for the AI-routed quick note. */}
      <div data-tour="liste-add">
      <EditField
        value={addText}
        onChange={setAddText}
        onSubmit={() => addItem()}
        // Enter IS the whole interaction — the « Ajouter » button was a solid primary
        // CTA taking a third of the row from the thing you're typing, on the app's
        // most-used field (the Notes treatment). The mic STAYS: on La liste it is not
        // dictation but hands-free adding — one breath of « lait, œufs pis pain »
        // becomes three items at the counter — which is this page's headline flow, not
        // furniture.
        submitIcon={null}
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

      {/* The three "fill the list" / "read the list" shortcuts — browse the week's
          flyers, restock a past item, choose the aisle order — as three GLYPHS on one
          line. They went from solid full-width orange bars stacked 2+1 (~180px of a
          phone's first screen, more than the list itself) to quiet labelled chips, and
          now to icons: they are shortcuts to other surfaces, and the list is what this
          page is. Each keeps its full name on aria-label + title, so nothing here is an
          unnamed control — and being one short row, they fit beside each other instead
          of wrapping. */}
      {/* The third shortcut is the « Allées » MENU: the sort choice (Mon ordre /
          Par allée), the on-demand aisle tag and « Ranger par allée » used to sit
          in a permanent bar above the list, spelling out a view preference you set
          once a season — and the tag repeated an aisle on every single row, pushing
          each item's own name into second place. Folded behind one button they're
          still one tap away, and the list is back to being the list. Only worth a
          button once there's more than one row to order. */}
      <Cluster className="list-actions list-actions--quiet">
        {/* The circulaires are the one shortcut that STARTS a shopping decision —
            the other two reorder or restock a list you already have. It carries the
            list's own marigold and a bigger target to say so; the other two stay
            quiet ghosts beside it. */}
        <button
          type="button"
          className="btn btn--sm list-actions__icon list-actions__icon--flyer help-pick"
          aria-label={t.shop.browse}
          title={t.shop.browse}
          onClick={help.pick('flyer', () => nav('/liste/circulaires'))}
        >
          <InlineIcon name="magnifying-glass-bold" size={20} />
        </button>
        <button
          type="button"
          className="btn btn--sm btn--ghost list-actions__icon help-pick"
          aria-label={t.list.quickAdd}
          title={t.list.quickAdd}
          onClick={help.pick('quick', () => nav('/liste/quick'))}
        >
          {/* ⚡ not ＋: this is the FAST add (restock past items), distinct from the
              add field above it. */}
          <InlineIcon name="lightning-bold" size={17} />
        </button>
        {list.length > 1 && (
          // No triggerLabel → ActionMenu renders its icon alone and names itself from
          // `label` (aria-label + title), the same contract the recipe book's icon-only
          // Collections tab uses.
          <ActionMenu
            triggerIcon="storefront-bold"
            triggerClassName="btn btn--sm btn--ghost list-actions__icon help-pick"
            label={t.list.aisleMenu}
            pick={(open) => help.pick('aisles', open)}
            items={sortItems}
          />
        )}
        {/* SIMPLE ↔ AVANCÉ. Icon-only and last in the row: it's a preference you set
            once, not a shortcut you reach for. Its accessible name says which way the
            next tap goes. Device-local, so a guest gets it too. Same control, same
            class family and same wording as « Les notes » — one thing to learn. */}
        <ModeToggle
          advanced={advanced}
          onToggle={help.pick('mode', () => setListeAdvanced(!advanced))}
          toSimple={t.list.modeToSimple}
          toAdvanced={t.list.modeToAdvanced}
          tint={CATS.list.deep}
          className="help-pick"
        />
      </Cluster>
      {help.bubbleFor('flyer')}
      {help.bubbleFor('quick')}
      {help.bubbleFor('aisles')}
      {help.bubbleFor('mode')}

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
            const showHeader = byAisle && (index === 0 || groupOf(displayList[index - 1]) !== groupOf(item))
            return (
              <Fragment key={item.id}>
                {showHeader && (
                  // A heading, not role="presentation" — in "Par allée" this groups the
                  // rows below it by aisle, so a SR user needs the grouping cue (and can
                  // jump between aisles by heading) instead of hitting an inert row.
                  <div className="list-aisle" role="heading" aria-level={3}>
                    <span className="list-aisle__emoji" aria-hidden="true">
                      {aisleInfo.emoji}
                    </span>
                    <span className="list-aisle__name">{aisleInfo.label[lang]}</span>
                  </div>
                )}
                <ListItemRow
                  // The drag grip only makes sense in "Mon ordre" — aisle sort owns
                  // the order there, so no dnd is passed and the grip hides
                  // (taking its keyboard mirror with it).
                  dnd={byAisle ? undefined : dnd}
                  onMove={byAisle ? undefined : (dir) => moveRow(index, dir === 'up' ? index - 1 : index + 1)}
                  index={index}
                  text={item.text}
                  picto={pic}
                  // The row's aisle, ON DEMAND (the « Allées » toggle in the sort bar,
                  // off by default): on every row it repeated « Autres » down half the
                  // list and pushed the item's own name into second place. « Par allée »
                  // says the same thing in its group headers, so the tag never shows
                  // there — it would repeat each header on every one of its own rows.
                  aisleTag={
                    !byAisle && showAisleTags ? (
                      <span className="list-row__aisle">
                        <span aria-hidden="true">{aisleInfo.emoji}</span> {aisleInfo.label[lang]}
                      </span>
                    ) : undefined
                  }
                  itemId={item.id}
                  advanced={advanced}
                  dealImage={staged?.image}
                  // A staged flyer deal: store + price, visible on the row itself.
                  // Store + price, joined only by what actually EXISTS. money() returns
                  // '' for a null price, so the old fixed « {merchant} · {money} » drew
                  // « Maxi · » — a separator with nothing after it — on any staged deal
                  // that carries a store but no price. Build the parts, drop the empty
                  // ones, and join; no part at all → no chip.
                  dealLabel={(() => {
                    if (!staged) return null
                    const bits = [staged.merchant?.trim() || null, staged.price != null ? money(staged.price) : null].filter(
                      (x): x is string => !!x,
                    )
                    // The validTo day is past → the deal likely no longer applies.
                    // Said ON the row (a small warn « ! » + word), so a stale aubaine
                    // is visible while scanning the list, not only once zoomed.
                    const ended = dealEnded(staged.validTo)
                    if (bits.length === 0 && !ended) return null
                    return (
                      <span className="list-row__deal mono">
                        {bits.length > 0 && (
                          <>
                            <InlineIcon name="tag-bold" /> {bits.join(' · ')}
                          </>
                        )}
                        {ended && (
                          <span className="list-row__deal-ended">
                            <InlineIcon name="warning-bold" size={12} /> {t.shop.dealEnded}
                          </span>
                        )}
                      </span>
                    )
                  })()}
                  // Spelled out under the picture once it's zoomed — the cashier-peek
                  // facts (name, store, price, avant/unit, validity + « terminée »),
                  // so « est-ce encore l'aubaine ? » is answered there.
                  dealDetail={staged ? <DealZoomCaption itemText={item.text} deal={staged} /> : null}
                  adder={adder}
                  checked={checked}
                  noRush={!!item.non_urgent}
                  toggleLabel={checked ? t.list.uncheck : t.list.check}
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
