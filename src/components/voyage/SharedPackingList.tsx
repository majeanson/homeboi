import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { SHARED_TRIP_PACKING_KEY } from '../../lib/queryKeys'
import { EditField } from '../EditField'
import { EmptyState } from '../EmptyState'
import { CheckRow } from '../CheckRow'
import { Avatar } from '../Avatar'
import { type SharedPackingItem, type SharedTrip } from './voyage'

// « Voyage partagé » → Bagages — the shared-trip sibling of PackingList. Bags are
// scoped by HOUSEHOLD, not member (product decision): each household edits its OWN
// bag(s); every other household's bags show READ-ONLY. Sections are grouped by
// household (its membership label + colour disc as the header). bag_label NULL = the
// household's shared bag; a free-text label = a per-person bag ("Léa"), shown as a
// muted note on the row. Checking an item packs + removes it (the calm finite-list
// pattern, held behind the undo toast via useDeferredRemoval so a poll can't flash it
// back). CALM: a check, never an "n of m" count. Reuses CheckRow + EditField +
// Avatar + EmptyState — no new primitive.
export function SharedPackingList({
  trip,
  items,
  myHouseholdId,
}: {
  trip: SharedTrip
  items: SharedPackingItem[]
  myHouseholdId: string
}) {
  const t = useT()
  const write = useWrite()
  const [text, setText] = useState('')
  const packingKey = [...SHARED_TRIP_PACKING_KEY, trip.id]
  const { remove, visible } = useDeferredRemoval(packingKey)

  // Only unpacked rows show (checking packs + removes it). visible() hides rows whose
  // removal is settling behind the undo toast.
  const open = visible(items.filter((i) => i.packed_at == null))
  const mine = open.filter((i) => i.household_id === myHouseholdId)
  const myMembership = trip.members.find((m) => m.household_id === myHouseholdId)
  // Other households with something to show (read-only), in membership order.
  const others = trip.members
    .filter((m) => m.household_id !== myHouseholdId)
    .map((m) => ({ m, rows: open.filter((i) => i.household_id === m.household_id) }))
    .filter((g) => g.rows.length > 0)

  async function add(v: string) {
    const value = v.trim()
    if (!value) return
    try {
      // household_id + the shared bag (bag_label NULL) are forced server-side.
      await write('shared-trip-packing', {
        method: 'POST',
        body: { tripId: trip.id, text: value },
        affectedKeys: [packingKey],
      })
      setText('')
    } catch {
      /* keep the text for retry / offline replay */
    }
  }

  function check(item: SharedPackingItem) {
    remove([item.id], t.voyage.packed(item.text), () =>
      write('shared-trip-packing', { method: 'PATCH', body: { id: item.id, packed: true }, affectedKeys: [packingKey] }),
    )
  }

  // Rename AND move between this household's bags in one save: text always, bag_label
  // only when it changed ('' / null = the shared bag).
  function saveItem(item: SharedPackingItem, v: string, bagLabel: string) {
    const value = v.trim()
    if (!value) return
    const body: { id: string; text: string; bag_label?: string | null } = { id: item.id, text: value }
    const nextBag = bagLabel.trim() || null
    if (nextBag !== (item.bag_label ?? null)) body.bag_label = nextBag
    void write('shared-trip-packing', { method: 'PATCH', body, affectedKeys: [packingKey] }).catch(() => {})
  }

  const bagNote = (label: string | null) => (label && label.trim() ? label : undefined)

  return (
    <div className="voyage-packing shared-packing">
      {/* — my household: fully editable — */}
      <section className="voyage-packing__group">
        <div className="shared-packing__head">
          <Avatar kind={null} colour={myMembership?.colour} name={myMembership?.label} size={22} />
          <b>{myMembership?.label ?? t.sharedVoyage.myBag}</b>
          <span className="shared-packing__you mono">({t.sharedVoyage.you})</span>
          <span className="ln" />
        </div>
        <EditField
          value={text}
          onChange={setText}
          onSubmit={add}
          submitLabel={t.common.add}
          submitLeadingIcon="plus-bold"
          placeholder={t.sharedVoyage.addToMyBag}
        />
        {mine.length === 0 ? (
          <EmptyState tone="calm">{t.sharedVoyage.myBagEmpty}</EmptyState>
        ) : (
          <ul className="kitchen__pantry">
            {mine.map((item) => (
              <CheckRow
                key={item.id}
                item={item.text}
                note={bagNote(item.bag_label)}
                onCheck={() => check(item)}
                checkLabel={t.voyage.markPacked}
                editLabel={t.common.edit}
                renderEdit={(close) => (
                  <PackingEditForm item={item} onSave={(v, bag) => saveItem(item, v, bag)} onClose={close} />
                )}
              />
            ))}
          </ul>
        )}
      </section>

      {/* — other households: read-only — */}
      {others.map(({ m, rows }) => (
        <section key={m.household_id} className="voyage-packing__group">
          <div className="shared-packing__head">
            <Avatar kind={null} colour={m.colour} name={m.label} size={22} />
            <b>{m.label}</b>
            <span className="ln" />
          </div>
          <ul className="kitchen__pantry">
            {rows.map((item) => (
              <CheckRow
                key={item.id}
                item={item.text}
                note={bagNote(item.bag_label)}
                onCheck={() => {}}
                checkLabel=""
                readOnly
              />
            ))}
          </ul>
        </section>
      ))}
      <p className="voyage-docs__hint mono">{t.sharedVoyage.otherBagsHint}</p>
    </div>
  )
}

// Rename the item AND move it to another of this household's bags (or the shared bag)
// via a free-text bag field. Supplied to CheckRow through renderEdit (the default
// rename form can't carry the bag input). Mirrors PackingList's PackingEditForm, but
// bags are free-text names here (no member roster crosses households).
function PackingEditForm({
  item,
  onSave,
  onClose,
}: {
  item: SharedPackingItem
  onSave: (text: string, bagLabel: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(item.text)
  const [bag, setBag] = useState(item.bag_label ?? '')
  return (
    <EditField
      value={text}
      onChange={setText}
      onSubmit={() => {
        onSave(text, bag)
        onClose()
      }}
      submitLabel={t.common.save}
      ariaLabel={t.common.edit}
      autoFocus
      onCancel={onClose}
      trailing={
        <input
          className="input voyage-packing__move"
          value={bag}
          onChange={(e) => setBag(e.target.value)}
          placeholder={t.sharedVoyage.bagName}
          aria-label={t.sharedVoyage.bagName}
        />
      }
    />
  )
}
