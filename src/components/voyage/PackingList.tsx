import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { EditField } from '../EditField'
import { EmptyState } from '../EmptyState'
import { CheckRow } from '../CheckRow'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import { useVoyageApi, type PackingItem, type Trip } from './voyage'

// « Voyage » → Bagages — per-member packing checklists. A face row picks whose list
// you're adding to (Maisonnée = the shared "Partagé" list); below it every list with
// items shows, grouped by member. Checking an item removes it (the calm finite-list
// pattern, held behind the undo toast via useDeferredRemoval so a poll can't flash it
// back). CALM: a check, never an "n of m" count. Reuses CheckRow + MemberSwitcher +
// EditField wholesale — no new primitive.
export function PackingList({ trip, items, faces }: { trip: Trip; items: PackingItem[]; faces: MemberFace[] }) {
  const t = useT()
  const write = useWrite()
  const voyageApi = useVoyageApi()
  const [who, setWho] = useState<string | null>(null)
  const [text, setText] = useState('')
  const packingKey = voyageApi.packingKey(trip.id)
  const { remove, visible } = useDeferredRemoval(packingKey)

  // Only unpacked rows show (checking packs + removes it). visible() hides rows whose
  // removal is settling behind the undo toast.
  const open = visible(items.filter((i) => i.packed_at == null))
  const groups: { id: string | null; name: string; rows: PackingItem[] }[] = [
    { id: null, name: t.voyage.sharedList, rows: open.filter((i) => i.member_id == null) },
    ...faces.map((f) => ({ id: f.id, name: f.name, rows: open.filter((i) => i.member_id === f.id) })),
  ].filter((g) => g.rows.length > 0)

  async function add(v: string) {
    const value = v.trim()
    if (!value) return
    try {
      await write(voyageApi.packingEndpoint, {
        method: 'POST',
        body: { tripId: trip.id, text: value, member_id: who },
        affectedKeys: [packingKey],
      })
      setText('')
    } catch {
      /* keep the text for retry / offline replay */
    }
  }

  function check(item: PackingItem) {
    remove([item.id], t.voyage.packed(item.text), () =>
      write(voyageApi.packingEndpoint, { method: 'PATCH', body: { id: item.id, packed: true }, affectedKeys: [packingKey] }),
    )
  }
  // Rename AND move between bags in one save: text always, member_id only when it
  // changed (the shared list is null). Mirrors La réserve's "rename + relocate".
  function saveItem(item: PackingItem, v: string, memberId: string | null) {
    const value = v.trim()
    if (!value) return
    const body: { id: string; text: string; member_id?: string | null } = { id: item.id, text: value }
    if (memberId !== item.member_id) body.member_id = memberId
    void write(voyageApi.packingEndpoint, { method: 'PATCH', body, affectedKeys: [packingKey] }).catch(() => {})
  }

  return (
    <div className="voyage-packing">
      {faces.length > 0 && (
        <MemberSwitcher
          faces={faces}
          value={who}
          onChange={setWho}
          allLabel={t.voyage.sharedList}
          ariaLabel={t.voyage.whosBag}
          className="voyage-packing__who"
        />
      )}
      <EditField
        value={text}
        onChange={setText}
        onSubmit={add}
        submitLabel={t.common.add}
        submitLeadingIcon="plus-bold"
        placeholder={who ? t.voyage.addToBag(faces.find((f) => f.id === who)?.name ?? '') : t.voyage.addToShared}
      />

      {groups.length === 0 ? (
        <EmptyState tone="calm">{t.voyage.bagEmpty}</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.id ?? 'shared'} className="voyage-packing__group">
            <div className="sec-label">
              <b>{g.name}</b>
              <span className="ln" />
            </div>
            <ul className="kitchen__pantry">
              {g.rows.map((item) => (
                <CheckRow
                  key={item.id}
                  item={item.text}
                  onCheck={() => check(item)}
                  checkLabel={t.voyage.markPacked}
                  editLabel={t.common.edit}
                  renderEdit={(close) => (
                    <PackingEditForm
                      item={item}
                      faces={faces}
                      onSave={(v, mid) => saveItem(item, v, mid)}
                      onClose={close}
                    />
                  )}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}

// La réserve's "rename + relocate" shape, applied to bags: rename the item AND move
// it to another member's bag (or the shared list) via a face <select>. Supplied to
// CheckRow through renderEdit (the default rename form can't carry the select).
function PackingEditForm({
  item,
  faces,
  onSave,
  onClose,
}: {
  item: PackingItem
  faces: MemberFace[]
  onSave: (text: string, memberId: string | null) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(item.text)
  const [mid, setMid] = useState<string>(item.member_id ?? '')
  return (
    <EditField
      value={text}
      onChange={setText}
      onSubmit={() => {
        onSave(text, mid || null)
        onClose()
      }}
      submitLabel={t.common.save}
      ariaLabel={t.common.edit}
      autoFocus
      onCancel={onClose}
      trailing={
        faces.length > 0 ? (
          <select
            className="input voyage-packing__move"
            value={mid}
            onChange={(e) => setMid(e.target.value)}
            aria-label={t.voyage.whosBag}
          >
            <option value="">{t.voyage.sharedList}</option>
            {faces.map((f) => (
              <option key={f.id} value={f.id}>
                {f.name}
              </option>
            ))}
          </select>
        ) : undefined
      }
    />
  )
}
