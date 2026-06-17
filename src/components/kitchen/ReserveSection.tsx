import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useUndoToast } from '../../lib/toast'
import { wash } from '../../lib/colors'
import { useReserveLocations } from '../../lib/reservePrefs'
import { CheckRow } from '../CheckRow'
import { type ReserveRow, type ReserveData, RESERVE_KEY } from './types'

// La réserve: a reminder of items stashed in the freezer / back of the pantry so
// the "behind everything" stuff stops getting forgotten. Items are GROUPED by a
// storage location (the spots are custom & editable in Réglages ▸ Réserve). Like
// use-soon, marking/clearing never touches the shopping list — clearing just
// means "used it / tossed it". Lives as a third section inside the Garde-manger
// tab. The Kitchen page keeps the query (the unauth gate); this owns the writes.
export function ReserveSection({ reserve }: { reserve: ReserveRow[] }) {
  const t = useT()
  const qc = useQueryClient()
  const undo = useUndoToast()
  const write = useWrite()
  const { locations, name: locName } = useReserveLocations()
  const [newItem, setNewItem] = useState('')
  const [newLoc, setNewLoc] = useState<string>('')
  // The picked location, guarded against a stale choice — if the household removed
  // the location this field was on (or it hasn't been picked yet), fall back to the
  // first one rather than silently filing the next item under "Autres".
  const selectedLoc = locations.some((l) => l.id === newLoc) ? newLoc : (locations[0]?.id ?? '')

  async function addItem(e: React.FormEvent) {
    e.preventDefault()
    const v = newItem.trim()
    if (!v) return
    setNewItem('')
    const locationId = selectedLoc || null
    try {
      await write('reserve', { method: 'POST', body: { item: v, location_id: locationId }, affectedKeys: [RESERVE_KEY] })
    } catch {
      setNewItem(v) // a failed write must not eat what was typed (offline queues)
    }
  }

  // Clear an item (used it / tossed it). Deferred behind the undo toast, like the
  // other pantry lists — a mis-tap costs nothing and never round-trips.
  function clearItem(r: ReserveRow) {
    const prev = qc.getQueryData<ReserveData>(RESERVE_KEY)
    qc.setQueryData<ReserveData>(RESERVE_KEY, (d) =>
      d ? { reserve: d.reserve.filter((x) => x.id !== r.id) } : d,
    )
    undo({
      message: t.undo.cleared(r.item),
      onUndo: () => prev && qc.setQueryData(RESERVE_KEY, prev),
      onCommit: () => {
        void write('reserve', { method: 'DELETE', body: { id: r.id } }).catch(() => {})
      },
    })
  }

  // Rename and/or move an item to another location (the ✏️). Optimistic, then
  // persist only the fields that actually changed.
  async function saveItem(r: ReserveRow, item: string, locationId: string | null) {
    const v = item.trim()
    if (!v) return
    if (v === r.item && locationId === r.location_id) return
    qc.setQueryData<ReserveData>(RESERVE_KEY, (d) =>
      d ? { reserve: d.reserve.map((x) => (x.id === r.id ? { ...x, item: v, location_id: locationId } : x)) } : d,
    )
    const body: { id: string; item?: string; location_id?: string | null } = { id: r.id }
    if (v !== r.item) body.item = v
    if (locationId !== r.location_id) body.location_id = locationId
    await write('reserve', { method: 'PATCH', body, affectedKeys: [RESERVE_KEY] }).catch(() => {})
  }

  // Group items under their location, in the configured order, then an "Autres"
  // bucket for anything whose location was removed (or never set) — so a deleted
  // location never makes its items vanish.
  const known = new Set(locations.map((l) => l.id))
  const groups = locations
    .map((loc) => ({ id: loc.id, label: loc.name, color: loc.color, items: reserve.filter((r) => r.location_id === loc.id) }))
    .filter((g) => g.items.length > 0)
  const others = reserve.filter((r) => !r.location_id || !known.has(r.location_id))
  if (others.length) groups.push({ id: '__other', label: t.kitchen.reserveOther, color: undefined, items: others })

  return (
    <section>
      <h2>{t.kitchen.reserve}</h2>
      <p className="lead">{t.kitchen.reserveHint}</p>
      <form className="kitchen__reserve-add" onSubmit={addItem}>
        <input
          className="input"
          value={newItem}
          onChange={(e) => setNewItem(e.target.value)}
          placeholder={t.kitchen.reserveAdd}
        />
        {locations.length > 0 && (
          <select
            className="input kitchen__reserve-loc"
            value={selectedLoc}
            onChange={(e) => setNewLoc(e.target.value)}
            aria-label={t.kitchen.reserveWhere}
          >
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        )}
        <button type="submit" className="btn" disabled={!newItem.trim()}>
          {t.capture.add}
        </button>
      </form>
      {reserve.length === 0 ? (
        <p className="board__empty mono">{t.kitchen.reserveEmpty}</p>
      ) : (
        groups.map((g) => (
          <div key={g.id} className="kitchen__reserve-group">
            <h3 className="kitchen__reserve-head" style={g.color ? { background: wash(g.color), color: g.color } : undefined}>
              {g.color && <span className="kitchen__reserve-dot" style={{ background: g.color }} aria-hidden="true" />}
              {g.label}
            </h3>
            <ul className="kitchen__low">
              {g.items.map((r) => (
                <ReserveItemRow
                  key={r.id}
                  row={r}
                  locName={locName}
                  onClear={() => clearItem(r)}
                  onSave={(item, locationId) => saveItem(r, item, locationId)}
                />
              ))}
            </ul>
          </div>
        ))
      )}
    </section>
  )
}

// One reserve row: the calm clear button (used it / tossed it) is the primary
// tap, with the uniform ✏️ rename. ✏️ swaps the row for an inline editor that
// also lets you move the item to another location. No 🗑️ — clearing IS the
// check, so a separate delete would just duplicate it.
function ReserveItemRow({
  row,
  locName,
  onClear,
  onSave,
}: {
  row: ReserveRow
  locName: (id: string | null | undefined) => string
  onClear: () => void
  onSave: (item: string, locationId: string | null) => void
}) {
  const t = useT()
  return (
    <CheckRow
      item={row.item}
      onCheck={onClear}
      checkLabel={t.kitchen.reserveCheck}
      editLabel={`${t.common.edit} — ${locName(row.location_id)}`}
      renderEdit={(close) => <ReserveEditForm row={row} onSave={onSave} onClose={close} />}
    />
  )
}

// La réserve's richer inline editor: rename AND move the item to another storage
// location. Supplied to CheckRow via `renderEdit` (the default rename form can't
// carry the location <select>).
function ReserveEditForm({
  row,
  onSave,
  onClose,
}: {
  row: ReserveRow
  onSave: (item: string, locationId: string | null) => void
  onClose: () => void
}) {
  const t = useT()
  const { locations } = useReserveLocations()
  const [text, setText] = useState(row.item)
  const [loc, setLoc] = useState<string>(row.location_id ?? '')
  return (
    <form
      className="operator__inline-form"
      style={{ flex: '1 1 auto' }}
      onSubmit={(e) => {
        e.preventDefault()
        onSave(text, loc || null)
        onClose()
      }}
    >
      <input className="input" value={text} onChange={(e) => setText(e.target.value)} aria-label={t.common.edit} autoFocus />
      {locations.length > 0 && (
        <select className="input kitchen__reserve-loc" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label={t.kitchen.reserveWhere}>
          {locations.map((l) => (
            <option key={l.id} value={l.id}>
              {l.name}
            </option>
          ))}
        </select>
      )}
      <button type="submit" className="btn" disabled={!text.trim()}>
        {t.common.save}
      </button>
      <button type="button" className="btn btn--ghost mono" onClick={onClose}>
        {t.common.cancel}
      </button>
    </form>
  )
}
