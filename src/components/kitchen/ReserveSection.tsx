import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { useUndoToast } from '../../lib/toast'
import { wash } from '../../lib/colors'
import { useReserveLocations } from '../../lib/reservePrefs'
import { CheckRow } from '../CheckRow'
import { EditField } from '../EditField'
import { SectionAdd, useSectionAdd } from '../SectionAdd'
import { EmptyState } from '../EmptyState'
import { HelpTitle, type HelpMode } from '../../lib/helpMode'
import { usePantryAdvanced } from '../../lib/surfaceMode'
import { BOARD_KEY, GHOSTS_KEY, HISTORY_KEY } from '../../lib/queryKeys'
import { type ReserveRow, type ReserveData, RESERVE_KEY } from './types'

// La réserve: a reminder of items stashed in the freezer / back of the pantry so
// the "behind everything" stuff stops getting forgotten. Items are GROUPED by a
// storage location (the spots are custom & editable in Réglages ▸ Réserve).
// Clearing still never touches the shopping list on its own — it just means "used
// it / tossed it". But each row also offers an explicit, opt-in "→ add to the
// list" (#41 two-way restock): pulling from the stash is the moment you notice
// you're running low, so a tap restocks it without leaving the réserve. Lives as a
// third section inside the Garde-manger tab. The Kitchen page keeps the query (the
// unauth gate); this owns the writes.
// `help` is the kitchen's page-level help mode — makes the "La réserve" heading
// explainable in place while armed.
export function ReserveSection({ reserve, help }: { reserve: ReserveRow[]; help?: HelpMode }) {
  const t = useT()
  const write = useWrite()
  // Bulletproof calm-delete for this LIVE-POLLED list (see useDeferredRemoval):
  // hide + filter the cleared row and await a refetch before un-hiding, so a poll
  // can't flash it back during the undo window.
  const removal = useDeferredRemoval(RESERVE_KEY)
  const undoToast = useUndoToast()
  const { locations, name: locName } = useReserveLocations()
  // EditField hides its own add/edit box for a read-only guest; CheckRow inside the
  // rows likewise hides its clear/edit.
  const [newItem, setNewItem] = useState('')
  // The add box waits behind the section ＋ (SectionAdd) — see the header below.
  const add = useSectionAdd()
  const [newLoc, setNewLoc] = useState<string>('')
  // SIMPLE ↔ AVANCÉ — the garde-manger tab's ONE flag (the ⚙ lives in PantryTab's
  // first header, above this section). Simple keeps the check + the 🛍 restock (DO
  // actions); Avancé restores the ✏️ rename/move editor. There is no 🗑 either way
  // — clearing IS the check (see ReserveItemRow).
  const advanced = usePantryAdvanced()
  // The picked location, guarded against a stale choice — if the household removed
  // the location this field was on (or it hasn't been picked yet), fall back to the
  // first one rather than silently filing the next item under "Autres".
  const selectedLoc = locations.some((l) => l.id === newLoc) ? newLoc : (locations[0]?.id ?? '')

  async function addItem() {
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
    removal.remove([r.id], t.undo.cleared(r.item), () =>
      write('reserve', { method: 'DELETE', body: { id: r.id }, affectedKeys: [RESERVE_KEY] }).catch(() => {}),
    )
  }

  // #41 two-way restock: pulling from the stash also means "I'm running low —
  // restock it". This adds the item to the shared shopping list WITHOUT removing it
  // from the réserve (you might still have one; you just need more). The same held
  // list-add the Garde-manger "running low" check uses (deferred behind the undo
  // toast, conflict-free — the write only fires if you don't undo). Opt-in by a tap,
  // never automatic, so clearing still never touches the list on its own.
  function addToList(r: ReserveRow) {
    undoToast({
      message: t.undo.addedToList(r.item),
      onUndo: () => {},
      onCommit: () =>
        // Invalidate the quick-add prediction caches too (GHOSTS/HISTORY), like the
        // canonical Liste.postAdd — else the newly-listed item lingers as a candidate.
        void write('list', { method: 'POST', body: { text: r.item }, affectedKeys: [BOARD_KEY, GHOSTS_KEY, HISTORY_KEY] }).catch(() => {}),
    })
  }

  // Rename and/or move an item to another location (the ✏️). Optimistic via
  // useWrite (guest-safe, one invalidate path), then persist only the fields that
  // actually changed.
  async function saveItem(r: ReserveRow, item: string, locationId: string | null) {
    const v = item.trim()
    if (!v) return
    if (v === r.item && locationId === r.location_id) return
    const body: { id: string; item?: string; location_id?: string | null } = { id: r.id }
    if (v !== r.item) body.item = v
    if (locationId !== r.location_id) body.location_id = locationId
    await write('reserve', {
      method: 'PATCH',
      body,
      affectedKeys: [RESERVE_KEY],
      optimistic: (qc) =>
        qc.setQueryData<ReserveData>(RESERVE_KEY, (d) =>
          d ? { reserve: d.reserve.map((x) => (x.id === r.id ? { ...x, item: v, location_id: locationId } : x)) } : d,
        ),
    }).catch(() => {})
  }

  // Group items under their location, in the configured order, then an "Autres"
  // bucket for anything whose location was removed (or never set) — so a deleted
  // location never makes its items vanish. Drop rows whose clear is still settling
  // (removal.visible) so a poll can't resurrect them mid-undo.
  const rows = removal.visible(reserve)
  const known = new Set(locations.map((l) => l.id))
  const groups = locations
    .map((loc) => ({ id: loc.id, label: loc.name, color: loc.color, items: rows.filter((r) => r.location_id === loc.id) }))
    .filter((g) => g.items.length > 0)
  const others = rows.filter((r) => !r.location_id || !known.has(r.location_id))
  if (others.length) groups.push({ id: '__other', label: t.kitchen.reserveOther, color: undefined, items: others })

  return (
    <section>
      {/* The add box waits behind the ＋, like the two lists around it — this
          section sat between them with a THIRD always-open composer (plus its
          location select), and the three together owned the whole first screen. */}
      <div className="kitchen__head">
        <HelpTitle help={help} k="reserve">{t.kitchen.reserve}</HelpTitle>
        <SectionAdd open={add.open} onToggle={add.toggle} label={t.kitchen.reserveAdd} />
      </div>
      {help?.bubbleFor('reserve')}
      {add.open && (
      <EditField
        value={newItem}
        onChange={setNewItem}
        onSubmit={() => {
          addItem()
          add.close()
        }}
        submitLabel={t.common.add}
        autoFocus={add.autoFocus}
        placeholder={t.kitchen.reserveAdd}
        ariaLabel={t.kitchen.reserveAdd}
        trailing={
          locations.length > 0 ? (
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
          ) : undefined
        }
      />
      )}
      {rows.length === 0 ? (
        <EmptyState guide={{ card: 'reserve' }}>{t.kitchen.reserveEmpty}</EmptyState>
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
                  onAddToList={() => addToList(r)}
                  advanced={advanced}
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
  onAddToList,
  advanced,
}: {
  row: ReserveRow
  locName: (id: string | null | undefined) => string
  onClear: () => void
  onSave: (item: string, locationId: string | null) => void
  onAddToList: () => void
  advanced: boolean
}) {
  const t = useT()
  return (
    <CheckRow
      item={row.item}
      onCheck={onClear}
      checkLabel={t.kitchen.reserveCheck}
      editLabel={`${t.common.edit} — ${locName(row.location_id)}`}
      renderEdit={advanced ? (close) => <ReserveEditForm row={row} onSave={onSave} onClose={close} /> : undefined}
      onExtra={onAddToList}
      extraIcon="shopping-bag-bold"
      extraLabel={t.kitchen.addToList}
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
    <EditField
      value={text}
      onChange={setText}
      onSubmit={() => {
        onSave(text, loc || null)
        onClose()
      }}
      submitLabel={t.common.save}
      ariaLabel={t.common.edit}
      autoFocus
      onCancel={onClose}
      trailing={
        locations.length > 0 ? (
          <select className="input kitchen__reserve-loc" value={loc} onChange={(e) => setLoc(e.target.value)} aria-label={t.kitchen.reserveWhere}>
            {locations.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    />
  )
}
