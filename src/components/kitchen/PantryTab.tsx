import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoToast } from '../../lib/toast'
import { useVoiceInput } from '../../lib/useVoiceInput'
import { VoiceButton, VoiceStatus } from '../VoiceButton'
import { Icon } from '../Icon'
import { RowActions } from '../RowActions'
import { BOARD_KEY } from '../../lib/queryKeys'
import { type LowRow, type PantryData, PANTRY_KEY, USE_SOON_KEY } from './types'

// Garde-manger: the "running low" list (never a full inventory — brief tenet 3)
// and the "use soon" list. Owns its own adds + undo-deferred clears; the parent
// page only passes the rows (it keeps the queries for the unauth gate).
export function PantryTab({ low, soon }: { low: LowRow[]; soon: LowRow[] }) {
  const t = useT()
  const qc = useQueryClient()
  const undo = useUndoToast()
  const [newLow, setNewLow] = useState('')
  const [newSoon, setNewSoon] = useState('')

  // Add one low item. `viaVoice` skips the put-it-back-on-failure (the field is
  // already cleared by the voice path and the spoken word is gone anyway).
  async function postLow(item: string, viaVoice = false) {
    const v = item.trim()
    if (!v) return
    try {
      await api('pantry', { method: 'POST', body: { item: v } })
    } catch {
      // A failed write must not eat what was typed — put it back to retry.
      if (!viaVoice) setNewLow(v)
    }
    qc.invalidateQueries({ queryKey: PANTRY_KEY })
  }
  async function addLow(e: React.FormEvent) {
    e.preventDefault()
    if (!newLow.trim()) return
    const item = newLow
    setNewLow('')
    await postLow(item)
  }

  // Speak a string of items into the low list, hands-free — same continuous +
  // split + pause-cut mic as La liste, so "patate … blé d'inde … tarte" lands as
  // three. Each finished phrase posts straight away. [shared VoiceButton]
  const lowVoice = useVoiceInput(
    (text) => {
      setNewLow('')
      void postLow(text, true)
    },
    { continuous: true, split: true },
  )

  // Checking a low item is the ONLY thing that puts it on the shopping list:
  // marking something low never touched the list (see api/pantry POST). The tap
  // adds it to the shared list AND clears the low flag — deferred behind an undo
  // toast so a mis-tap costs nothing and never round-trips. Removed from the low
  // view at once so a refetch can't resurrect it mid-undo.
  function checkLowItem(l: LowRow) {
    const prev = qc.getQueryData<PantryData>(PANTRY_KEY)
    qc.setQueryData<PantryData>(PANTRY_KEY, (d) => (d ? { low: d.low.filter((x) => x.id !== l.id) } : d))
    undo({
      message: t.undo.addedToList(l.item),
      onUndo: () => prev && qc.setQueryData(PANTRY_KEY, prev),
      onCommit: async () => {
        // Add to the shared list first, then drop the low flag. Refresh only the
        // board (where the list lives) — the low list stays optimistic, same as a
        // plain clear, so it can't flicker back mid-commit.
        await api('list', { method: 'POST', body: { text: l.item } }).catch(() => {})
        await api('pantry', { method: 'DELETE', body: { id: l.id } }).catch(() => {})
        qc.invalidateQueries({ queryKey: BOARD_KEY })
      },
    })
  }
  // Delete a low item WITHOUT putting it on the list (the 🗑️) — a real gap before:
  // a mis-typed "running low" could only leave by being shopped. Deferred undo.
  function removeLowItem(l: LowRow) {
    const prev = qc.getQueryData<PantryData>(PANTRY_KEY)
    qc.setQueryData<PantryData>(PANTRY_KEY, (d) => (d ? { low: d.low.filter((x) => x.id !== l.id) } : d))
    undo({
      message: t.undo.cleared(l.item),
      onUndo: () => prev && qc.setQueryData(PANTRY_KEY, prev),
      onCommit: () => {
        api('pantry', { method: 'DELETE', body: { id: l.id } }).catch(() => {})
      },
    })
  }
  // Rename a low item in place (the ✏️). Optimistic, then persist.
  async function renameLowItem(l: LowRow, item: string) {
    const v = item.trim()
    if (!v || v === l.item) return
    qc.setQueryData<PantryData>(PANTRY_KEY, (d) =>
      d ? { low: d.low.map((x) => (x.id === l.id ? { ...x, item: v } : x)) } : d,
    )
    await api('pantry', { method: 'PATCH', body: { id: l.id, item: v } }).catch(() => {})
    qc.invalidateQueries({ queryKey: PANTRY_KEY })
  }

  async function postSoon(item: string, viaVoice = false) {
    const v = item.trim()
    if (!v) return
    try {
      await api('use-soon', { method: 'POST', body: { item: v } })
    } catch {
      if (!viaVoice) setNewSoon(v)
    }
    qc.invalidateQueries({ queryKey: USE_SOON_KEY })
  }
  async function addSoon(e: React.FormEvent) {
    e.preventDefault()
    if (!newSoon.trim()) return
    const item = newSoon
    setNewSoon('')
    await postSoon(item)
  }
  const soonVoice = useVoiceInput(
    (text) => {
      setNewSoon('')
      void postSoon(text, true)
    },
    { continuous: true, split: true },
  )

  // Clear a use-soon item (used it / tossed it). Deferred behind the undo toast,
  // like the low list. No list side-effects — use-soon never touches shopping.
  function clearSoonItem(s: LowRow) {
    const prev = qc.getQueryData<{ soon: LowRow[] }>(USE_SOON_KEY)
    qc.setQueryData<{ soon: LowRow[] }>(USE_SOON_KEY, (d) => (d ? { soon: d.soon.filter((x) => x.id !== s.id) } : d))
    undo({
      message: t.undo.cleared(s.item),
      onUndo: () => prev && qc.setQueryData(USE_SOON_KEY, prev),
      onCommit: () => {
        api('use-soon', { method: 'DELETE', body: { id: s.id } }).catch(() => {})
      },
    })
  }
  async function renameSoonItem(s: LowRow, item: string) {
    const v = item.trim()
    if (!v || v === s.item) return
    qc.setQueryData<{ soon: LowRow[] }>(USE_SOON_KEY, (d) =>
      d ? { soon: d.soon.map((x) => (x.id === s.id ? { ...x, item: v } : x)) } : d,
    )
    await api('use-soon', { method: 'PATCH', body: { id: s.id, item: v } }).catch(() => {})
    qc.invalidateQueries({ queryKey: USE_SOON_KEY })
  }

  return (
    <>
      <section>
        <h2>{t.kitchen.low}</h2>
        <p className="kitchen__use-soon-hint mono">{t.kitchen.lowHint}</p>
        <form className="kitchen__low-add" onSubmit={addLow}>
          <input
            className="input"
            value={newLow}
            onChange={(e) => setNewLow(e.target.value)}
            placeholder={lowVoice.listening ? t.capture.listening : t.kitchen.lowAdd}
          />
          <VoiceButton voice={lowVoice} label={t.capture.voice} />
          <button type="submit" className="btn" disabled={!newLow.trim()}>
            {t.capture.add}
          </button>
        </form>
        <VoiceStatus voice={lowVoice} />
        {low.length === 0 ? (
          <p className="board__empty mono">{t.kitchen.lowEmpty}</p>
        ) : (
          <ul className="kitchen__low">
            {low.map((l) => (
              <PantryRow
                key={l.id}
                row={l}
                note={t.kitchen.addToList}
                onCheck={() => checkLowItem(l)}
                onRename={(item) => renameLowItem(l, item)}
                onDelete={() => removeLowItem(l)}
              />
            ))}
          </ul>
        )}
      </section>

      <section>
        <h2>{t.kitchen.useSoon}</h2>
        <p className="kitchen__use-soon-hint mono">{t.kitchen.useSoonHint}</p>
        <form className="kitchen__soon-add" onSubmit={addSoon}>
          <input
            className="input"
            value={newSoon}
            onChange={(e) => setNewSoon(e.target.value)}
            placeholder={soonVoice.listening ? t.capture.listening : t.kitchen.useSoonAdd}
          />
          <VoiceButton voice={soonVoice} label={t.capture.voice} />
          <button type="submit" className="btn" disabled={!newSoon.trim()}>
            {t.capture.add}
          </button>
        </form>
        <VoiceStatus voice={soonVoice} />
        {soon.length === 0 ? (
          <p className="board__empty mono">{t.kitchen.useSoonEmpty}</p>
        ) : (
          <ul className="kitchen__soon">
            {soon.map((s) => (
              <PantryRow
                key={s.id}
                row={s}
                onCheck={() => clearSoonItem(s)}
                onRename={(item) => renameSoonItem(s, item)}
                onDelete={() => clearSoonItem(s)}
              />
            ))}
          </ul>
        )}
      </section>
    </>
  )
}

// One pantry row: the calm check button stays the primary tap (low → "add to
// list", use-soon → "used it"), with the uniform ✏️ rename / 🗑️ remove pair
// beside it. ✏️ swaps the row for an inline input.
function PantryRow({
  row,
  note,
  onCheck,
  onRename,
  onDelete,
}: {
  row: LowRow
  note?: string
  onCheck: () => void
  onRename: (item: string) => void
  onDelete: () => void
}) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [text, setText] = useState(row.item)

  if (editing)
    return (
      <li className="kitchen__pantry-row">
        <form
          className="operator__inline-form"
          style={{ flex: '1 1 auto' }}
          onSubmit={(e) => {
            e.preventDefault()
            onRename(text)
            setEditing(false)
          }}
        >
          <input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label={t.common.edit} autoFocus />
          <button type="submit" className="btn" disabled={!text.trim()}>
            {t.common.save}
          </button>
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={() => {
              setText(row.item)
              setEditing(false)
            }}
          >
            {t.common.cancel}
          </button>
        </form>
      </li>
    )

  return (
    <li className="kitchen__pantry-row">
      <button type="button" className="board__list-item" onClick={onCheck}>
        <span className="board__check" aria-hidden="true">
          <Icon name="square-bold" size={18} />
        </span>
        <span>{row.item}</span>
        {note && <span className="kitchen__low-note mono">{note}</span>}
      </button>
      <RowActions
        onEdit={() => {
          setText(row.item)
          setEditing(true)
        }}
        onDelete={onDelete}
      />
    </li>
  )
}
