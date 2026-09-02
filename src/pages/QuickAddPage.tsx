import { useRef, useState } from 'react'
import { Navigate } from 'react-router-dom'
import { EmptyState } from '../components/EmptyState'
import { useWrite } from '../lib/write'
import { useUndoToast, useNotice } from '../lib/toast'
import { mintTmpId } from '../lib/tmpIds'
import { spliceListLine } from '../lib/listAdd'
import { isGuest } from '../lib/device'
import { useT } from '../i18n'
import { pictoFor } from '../lib/picto'
import { Icon, InlineIcon } from '../components/Icon'
import { SceneHead } from '../components/SceneHead'
import { BOARD_KEY, GHOSTS_KEY, HISTORY_KEY } from '../lib/queryKeys'
import { useQuickItems, type QuickItem } from '../lib/quickItems'
import { useSwipeToDelete } from '../lib/useSwipeToDelete'
import { AislePicker } from '../components/AislePicker'
import { RowActions } from '../components/RowActions'
import { SwipeDeletePane } from '../components/SwipeDeletePane'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// Accent/case-blind matching so "creme" filters to "Crème".
const fold = (s: string) => s.toLowerCase().normalize('NFD').replace(/\p{Diacritic}/gu, '').trim()

// /liste/quick — the ⚡ Quick add screen as a full-screen route (was a bottom
// sheet, flaky to scroll): past/predicted items to restock a week in a few taps.
// Tap one to add it instantly — the page STAYS open (a running "Added N" counter)
// so a week's staples go on without leaving; an added chip locks with a ✓ so the
// same line isn't doubled. Typing offers an "Add '<what you typed>'" for anything
// new. The candidate set comes from the shared useQuickItems hook.
export function QuickAddPage() {
  const t = useT()
  const write = useWrite()
  const undo = useUndoToast()
  const notice = useNotice()
  const close = useSceneClose('/liste')
  useEscapeKey(close)
  const items = useQuickItems()

  const [q, setQ] = useState('')
  const [alpha, setAlpha] = useState(false)
  const [added, setAdded] = useState<Set<string>>(new Set())
  // Suggestions swiped away this session — hidden at once, the real removal held
  // behind the undo toast (deferred, like La liste). The held write only fires if
  // the undo window lapses, so a mis-swipe is fully recoverable.
  const [removed, setRemoved] = useState<Set<string>>(new Set())
  // The entire scene is a restock/add tool — nothing here but writes. A read-only
  // guest has no business on it; slip back to the list (also guards a deep link).
  // Placed after every hook so this isn't a conditional-hook violation.
  const ro = isGuest()
  const fq = fold(q)
  const base = removed.size ? items.filter((i) => !removed.has(i.key)) : items
  const filtered = fq ? base.filter((i) => fold(i.label).includes(fq)) : base
  // Default order is status/frequency (from useQuickItems); the Aa toggle re-sorts
  // the same set alphabetically so a long list is easy to scan by name.
  const shown = alpha ? [...filtered].sort((a, b) => a.label.localeCompare(b.label)) : filtered
  // #27: standing staples ride at the top under a "Toujours" header — a
  // deterministic always-on group for the household's never-forget items, distinct
  // from the predicted/past ones below.
  const alwaysItems = shown.filter((i) => i.always)
  // Tracked-but-not-due re-buys ride in their own quiet "Souvent racheté" group,
  // between the staples and the plain history — a gentle offer, never a count.
  const oftenItems = shown.filter((i) => i.often && !i.always)
  const restItems = shown.filter((i) => !i.always && !i.often)
  // Offer a free-text add only when what's typed isn't already a known item.
  const canAddTyped = fq.length > 0 && !items.some((i) => fold(i.label) === fq)

  // Add a line (with its remembered flyer synonyms). The optimistic temp row (the
  // shared splice every list door uses now) is what makes an offline/queued add
  // visible on La liste at once; before it, this page ticked « Ajouté N » and
  // locked the chip ✓ off LOCAL state alone while nothing appeared on the list.
  // Returns whether the write landed or queued — a server rejection (4xx/5xx) was
  // 100 % invisible here (`.catch(() => {})`, the only write site with no error
  // path), which read as « the quick add doesn't add any item at all ».
  async function postAdd(text: string, terms: string[]): Promise<boolean> {
    const tmpId = mintTmpId()
    const res = await write('list', {
      method: 'POST',
      body: terms.length ? { text, search_terms: terms } : { text },
      affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY],
      optimistic: (qc) => spliceListLine(qc, tmpId, text),
      tmpId,
    }).catch(() => null)
    return res != null
  }

  // Lock the chip ✓ at once (the tap must feel instant), but a REJECTED write
  // un-locks it and says so once — the ✓ must never certify a write that the
  // server refused. (A queued offline write counts as landed: the outbox owns it,
  // and the optimistic row is already on the list.)
  function reportFailed(key: string) {
    setAdded((s) => {
      const n = new Set(s)
      n.delete(key)
      return n
    })
    notice(t.common.saveFailed)
  }
  function add(item: QuickItem) {
    if (added.has(item.key)) return
    setAdded((s) => new Set(s).add(item.key))
    void postAdd(item.label, item.searchTerms).then((ok) => {
      if (!ok) reportFailed(item.key)
    })
  }
  function addTyped() {
    const text = q.trim()
    if (!text) return
    const key = `typed:${fold(text)}`
    setAdded((s) => new Set(s).add(key))
    setQ('')
    void postAdd(text, []).then((ok) => {
      if (!ok) reportFailed(key)
    })
  }

  // Swipe a suggestion away → hide it now, hold the real removal behind the undo
  // toast (deferred). On commit we prune the source(s) the candidate folds in —
  // the exact actions Réglages exposes: drop the purchase-history entry, mute the
  // ghost prediction, and unpin a standing staple from "Toujours".
  function removeSuggestion(item: QuickItem) {
    setRemoved((s) => new Set(s).add(item.key))
    undo({
      message: t.list.quickRemoved(item.label),
      onUndo: () =>
        setRemoved((s) => {
          const n = new Set(s)
          n.delete(item.key)
          return n
        }),
      onCommit: () => {
        const ghostKey = item.ghostKey ?? item.stapleKey
        if (item.historyKey)
          void write('list', {
            method: 'DELETE',
            body: { historyKey: item.historyKey },
            affectedKeys: [BOARD_KEY, HISTORY_KEY],
          }).catch(() => {})
        if (ghostKey)
          // muted hides it from predictions; standing:false drops it from the
          // "Toujours" staple group. Both in one upsert covers every ghost source.
          // useWrite (not raw patchGhost) so muting a ghost offline queues + replays,
          // matching the sibling list DELETE above; affectedKeys refetches the panel.
          void write('ghost', {
            method: 'PATCH',
            body: { key: ghostKey, label: item.label, muted: true, standing: false },
            affectedKeys: [GHOSTS_KEY],
          }).catch(() => {})
      },
    })
  }

  // One candidate chip — shared by the "Toujours" group and the rest, so the two
  // groups draw identical rows (just a different header above them). Swipe-left to
  // remove (touch), the same gesture as La liste.
  function renderChip(item: QuickItem) {
    return (
      <QaChip
        key={item.key}
        item={item}
        isAdded={added.has(item.key)}
        onAdd={() => add(item)}
        onRemove={() => removeSuggestion(item)}
      />
    )
  }

  if (ro) return <Navigate to="/liste" replace />

  return (
    <div className="scene" aria-label={t.list.quickAddTitle}>
      <SceneHead
        title={
          <>
            <InlineIcon name="lightning-bold" color="var(--marigold-deep)" /> {t.list.quickAdd}
            {added.size > 0 && <span className="qa__count"> · {t.list.addedN(added.size)}</span>}
          </>
        }
        card="liste"
        onClose={close}
        closeLabel={t.shop.close}
        // In-store scene, outside HubLayout: the shared offline/stale bar rides
        // along (shop seam #2) — it self-hides when online and fresh.
        offline
      />

      <div className="scene__body qa">
        <div className="qa__search">
          <input
            className="input"
            value={q}
            onChange={(e) => setQ(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter' && canAddTyped) {
                e.preventDefault()
                addTyped()
              }
            }}
            placeholder={t.list.quickSearch}
            aria-label={t.list.quickSearch}
          />
          <button
            type="button"
            className={`qa__sort${alpha ? ' is-on' : ''}`}
            onClick={() => setAlpha((v) => !v)}
            aria-pressed={alpha}
            aria-label={t.list.quickSortAlpha}
            title={t.list.quickSortAlpha}
          >
            Aa
          </button>
        </div>

        <div className="qa__list">
          {canAddTyped && (
            <button type="button" className="qa__chip qa__chip--new" onClick={addTyped}>
              <span className="qa__pic" aria-hidden="true"><Icon name="plus-bold" size={20} /></span>
              <span className="qa__label">{t.list.addNew(q.trim())}</span>
            </button>
          )}
          {alwaysItems.length > 0 && (
            <>
              <p className="qa__grouphead mono">
                <InlineIcon name="push-pin-bold" size={13} /> {t.list.quickAlways}
              </p>
              {alwaysItems.map(renderChip)}
            </>
          )}
          {alwaysItems.length > 0 && restItems.length > 0 && (
            <p className="qa__grouphead mono">{t.list.quickOthers}</p>
          )}
          {restItems.map(renderChip)}
          {/* "Souvent racheté" — tracked recurring items not due yet. Quietest group
              (dimmed header), no per-row tag/count; swipe a chip to dismiss (mutes
              the prediction). Pull-only, lives in this scene the user opened. */}
          {oftenItems.length > 0 && (
            <>
              <p className="qa__grouphead qa__grouphead--often mono">
                <InlineIcon name="repeat-bold" size={13} /> {t.list.quickOften}
              </p>
              {oftenItems.map(renderChip)}
            </>
          )}
          {shown.length === 0 && !canAddTyped && <EmptyState>{t.list.quickEmpty}</EmptyState>}
        </div>
      </div>
    </div>
  )
}

// One suggestion row: the add button is the sliding foreground (.list-row__main),
// the red delete pane sits behind it — the same clip-window structure La liste's
// rows use, driven by the shared useSwipeToDelete. onRemove fires after the row
// slides out, so the undo toast takes over while it unmounts.
function QaChip({
  item,
  isAdded,
  onAdd,
  onRemove,
}: {
  item: QuickItem
  isAdded: boolean
  onAdd: () => void
  onRemove: () => void
}) {
  const t = useT()
  const mainRef = useRef<HTMLButtonElement>(null)
  // An already-added chip is inert (✓ locked) — don't let it swipe away too.
  useSwipeToDelete(mainRef, isAdded ? () => {} : onRemove)
  // useSwipeToDelete binds touch events only, so the swipe is invisible to a mouse and
  // a keyboard — removing a suggestion was unreachable on desktop. RowActions is the
  // mirror (the same pattern as La liste, whose edit sheet keeps a real Delete button).
  return (
    <div className="list-row qa__row">
      <SwipeDeletePane label={t.common.delete} />
      <button
        ref={mainRef}
        type="button"
        className={`list-row__main qa__chip${isAdded ? ' is-added' : ''}`}
        onClick={onAdd}
        disabled={isAdded}
        aria-label={`${t.common.add} ${item.label}`}
      >
        <span className="qa__pic" aria-hidden="true">
          {pictoFor(item.label, '🛒')}
        </span>
        <span className="qa__label">{item.label}</span>
        {item.status && (
          <span className={`qa__tag qa__tag--${item.status}`}>
            {item.status === 'due' ? t.ghost.due : t.ghost.soon}
          </span>
        )}
        <span className="qa__act" aria-hidden="true">
          <Icon name={isAdded ? 'check-bold' : 'plus-bold'} size={16} />
        </span>
      </button>
      {/* The aisle for this recurrent item — outside the add button (a select can't
          nest in a button), keyed by the item's name so it's the SAME override the
          list line uses. Set it once here on "Oeuf" and it sticks for the line too.
          `compact`: icon-only, so the name (the thing you're scanning for) keeps the
          row and the aisle is a glyph you tap, not a sentence you re-read 12 times. */}
      {!isGuest() && <AislePicker text={item.label} compact className="qa__aisle" />}
      {!isAdded && (
        <RowActions onDelete={onRemove} deleteLabel={t.list.quickRemove(item.label)} size={16} />
      )}
    </div>
  )
}
