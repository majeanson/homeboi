import { useRef, useState } from 'react'
import { useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BigTiles, Sayable, type Tile } from '../components/BigTiles'
import { Icon, InlineIcon } from '../components/Icon'
import { HubHead } from '../components/HubHead'
import { SectionIntro } from '../components/SectionIntro'
import { EmptyState } from '../components/EmptyState'
import { CATS } from '../lib/cats'
import { tintInk } from '../lib/colors'
import { useT } from '../i18n'
import { useAudience } from '../lib/audience'
import { useSurface } from '../lib/surface'
import { api, isUnauthorized } from '../lib/api'
import { useWrite } from '../lib/write'
import { live } from '../lib/query'
import { Loading, PairPrompt } from '../components/Fallback'
import { useRecordUndo } from '../lib/toast'
import { useDeferredRemoval } from '../lib/useDeferredRemoval'
import { useVoiceInput } from '../lib/useVoiceInput'
import { isGuest } from '../lib/device'
import { EditField } from '../components/EditField'
import { money } from '../lib/deals'
import { pickListFrom, parseDeal } from '../lib/picks'
import { pictoFor } from '../lib/picto'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
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
//   - The page is deliberately just the list + its add bar. Secondary actions live
//     behind the ＋ Add sheet, not as buttons on the page: "Ajout rapide" (restock
//     past/predicted items, carrying their flyer synonyms) and "Circulaires"
//     (browse flyers / stage deals). The only prominent shopping button is
//     "Montrer à la caisse", and only once deals are staged.
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
  // Read-only guest: no check toggle, no swipe-to-delete, no delete pane. The
  // picture/name taps stay — they only navigate (open the flyer / a read detail).
  readOnly?: boolean
}) {
  const mainRef = useRef<HTMLDivElement>(null)
  // Only wire the swipe-delete when writes are allowed; a guest's row never deletes.
  useSwipeToDelete(mainRef, readOnly ? () => {} : onDelete)
  return (
    <div className="list-row">
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
  const { audience } = useAudience()
  const { surface } = useSurface()
  const nav = useNavigate()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  // Bulletproof calm-delete for the list (the shared hook codifies what this page
  // pioneered): hide cleared/deleted ids + filter them out, and await a refetch
  // before un-hiding so the poll can't flash a just-removed row back.
  const removal = useDeferredRemoval(BOARD_KEY)
  // Contextual "?" help mode (shared hook): arm it in the header, then tap one of
  // the list's controls (flyer search / Vider les cochés / cashier) to learn what
  // it does in place instead of running it. La liste is one flat list, so its help
  // targets are these buttons, not section headings.
  const helpLabel = (k: string) =>
    ({ flyer: t.shop.browse, clear: t.list.clearChecked, cashier: t.shop.present })[k] ?? k
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
    const res = await write<{ id: string }>('list', {
      method: 'POST',
      body: terms && terms.length ? { text, search_terms: terms } : { text },
      affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
      optimistic: (qc) =>
        qc.setQueryData<BoardListData>(BOARD_KEY, (b) =>
          b ? { ...b, list: [...b.list, { id: tmpId, text, source: 'manual', checked_at: null }] } : b,
        ),
    }).catch(() => null)
    // Online add returns the real id → offer Annuler that deletes exactly that line
    // (the COMPENSATING undo), even after several quick voice adds stack up. Offline
    // adds skip the undo (no server id yet); deleting the row is the way back.
    const newId = res && !res.queued ? res.data?.id : undefined
    if (newId)
      recordUndo({
        message: t.undo.added(text),
        onUndo: () =>
          void write('list', { method: 'DELETE', body: { id: newId }, affectedKeys: [BOARD_KEY, GHOSTS_KEY] }).catch(
            () => {},
          ),
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
    <main className={'today-feed' + (help.active ? ' help-armed' : '')}>
      <HubHead
        title={t.nav.list}
        icon={CATS.list.icon}
        iconColor={CATS.list.deep}
        background="var(--marigold-wash)"
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
      <EditField
        value={addText}
        onChange={setAddText}
        onSubmit={() => addItem()}
        submitLabel={t.capture.add}
        submitLeadingIcon="plus-bold"
        submitVariant="primary"
        busy={adding}
        voice={voice}
        // A small magnifier beside Ajouter — searching the week's flyers for an
        // item is a frequent move, so it earns a one-tap shortcut here instead of
        // living only behind the ＋ Add sheet → Circulaires.
        trailing={
          // Sharing the list moved to the ＋ Add sheet (→ "Partager"), so the page
          // stays just the list + the one frequent flyer-search shortcut.
          <button
            type="button"
            className="edit-field__icon-btn help-pick"
            onClick={help.pick('flyer', () => nav('/liste/circulaires'))}
            aria-label={t.shop.browse}
            title={t.shop.browse}
          >
            <Icon name="magnifying-glass-bold" size={17} />
          </button>
        }
        placeholder={
          voice.listening
            ? t.capture.listening
            : surface === 'mobile'
              ? t.list.addPlaceholderShort
              : t.list.addPlaceholder
        }
        ariaLabel={t.list.addPlaceholder}
      />
      {help.bubbleFor('flyer')}

      {list.length === 0 ? (
        <EmptyState>{t.board.listEmpty}</EmptyState>
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

    </main>
  )
}
