import { useState } from 'react'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { TRIP_PACKING_KEY } from '../../lib/queryKeys'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { EditField } from '../EditField'
import { CheckRow } from '../CheckRow'
import { MemberSwitcher, type MemberFace } from '../MemberSwitcher'
import type { PackingItem, Trip } from './voyage'

// « Voyage » → Bagages — per-member packing checklists. A face row picks whose list
// you're adding to (Maisonnée = the shared "Partagé" list); below it every list with
// items shows, grouped by member. Checking an item removes it (the calm finite-list
// pattern, held behind the undo toast via useDeferredRemoval so a poll can't flash it
// back). CALM: a check, never an "n of m" count. Reuses CheckRow + MemberSwitcher +
// EditField wholesale — no new primitive.
export function PackingList({ trip, items, faces }: { trip: Trip; items: PackingItem[]; faces: MemberFace[] }) {
  const t = useT()
  const write = useWrite()
  const [who, setWho] = useState<string | null>(null)
  const [text, setText] = useState('')
  const packingKey = [...TRIP_PACKING_KEY, trip.id]
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
      await write('trip-packing', {
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
      write('trip-packing', { method: 'PATCH', body: { id: item.id, packed: true }, affectedKeys: [packingKey] }),
    )
  }
  function rename(item: PackingItem, v: string) {
    const value = v.trim()
    if (!value) return
    void write('trip-packing', { method: 'PATCH', body: { id: item.id, text: value }, affectedKeys: [packingKey] }).catch(
      () => {},
    )
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
        <p className="voyage-packing__empty mono">{t.voyage.bagEmpty}</p>
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
                  onRename={(v) => rename(item, v)}
                />
              ))}
            </ul>
          </section>
        ))
      )}
    </div>
  )
}
