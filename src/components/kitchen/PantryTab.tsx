import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoToast } from '../../lib/toast'
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

  async function addLow(e: React.FormEvent) {
    e.preventDefault()
    const item = newLow.trim()
    if (!item) return
    setNewLow('')
    try {
      await api('pantry', { method: 'POST', body: { item } })
    } catch {
      // A failed write must not eat what was typed — put it back to retry.
      setNewLow(item)
    }
    qc.invalidateQueries({ queryKey: PANTRY_KEY })
  }

  // Drop the cleared item from the low list at once, but DEFER the delete behind
  // an undo toast — a mis-tap is recoverable with no round-trip.
  function clearLowItem(l: LowRow) {
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

  async function addSoon(e: React.FormEvent) {
    e.preventDefault()
    const item = newSoon.trim()
    if (!item) return
    setNewSoon('')
    try {
      await api('use-soon', { method: 'POST', body: { item } })
    } catch {
      setNewSoon(item)
    }
    qc.invalidateQueries({ queryKey: USE_SOON_KEY })
  }

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

  return (
    <>
      <section>
        <h2>{t.kitchen.low}</h2>
        <form className="kitchen__low-add" onSubmit={addLow}>
          <input
            className="input"
            value={newLow}
            onChange={(e) => setNewLow(e.target.value)}
            placeholder={t.kitchen.lowAdd}
          />
          <button type="submit" className="btn" disabled={!newLow.trim()}>
            {t.capture.add}
          </button>
        </form>
        {low.length === 0 ? (
          <p className="board__empty mono">{t.kitchen.lowEmpty}</p>
        ) : (
          <ul className="kitchen__low">
            {low.map((l) => (
              <li key={l.id}>
                <button type="button" className="board__list-item" onClick={() => clearLowItem(l)}>
                  <span className="board__check" aria-hidden="true">
                    ☐
                  </span>
                  <span>{l.item}</span>
                  <span className="kitchen__low-note mono">{t.kitchen.addToList}</span>
                </button>
              </li>
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
            placeholder={t.kitchen.useSoonAdd}
          />
          <button type="submit" className="btn" disabled={!newSoon.trim()}>
            {t.capture.add}
          </button>
        </form>
        {soon.length === 0 ? (
          <p className="board__empty mono">{t.kitchen.useSoonEmpty}</p>
        ) : (
          <ul className="kitchen__soon">
            {soon.map((s) => (
              <li key={s.id}>
                <button type="button" className="board__list-item" onClick={() => clearSoonItem(s)}>
                  <span className="board__check" aria-hidden="true">
                    ☐
                  </span>
                  <span>{s.item}</span>
                </button>
              </li>
            ))}
          </ul>
        )}
      </section>
    </>
  )
}
