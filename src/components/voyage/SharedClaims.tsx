import { useState } from 'react'
import { useT, useLang } from '../../i18n'
import { useWrite, writeFailed } from '../../lib/write'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { formatDayLong, capitalize as cap } from '../../lib/format'
import { SHARED_TRIP_CLAIMS_KEY } from '../../lib/queryKeys'
import { EditField } from '../EditField'
import { EmptyState } from '../EmptyState'
import { ListRow } from '../ListRow'
import { Chip } from '../Chip'
import { Avatar } from '../Avatar'
import { InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'
import { MEAL_SLOTS, tripDays, useVoyageApi, type MealSlot, type SharedTripClaim } from './voyage'

// « Voyage partagé » → « Qui apporte quoi » (Bagages) + « Qui cuisine » (Repas), migration
// 0154. Both are ONE gesture: a row of the WHOLE trip that one household takes on — the
// camping weekend's tent-cuisine, stove and coolers; Saturday's supper. Unlike a bag
// (one household's own), any member adds or renames a row; the CLAIM is a household's
// own word (take a free row, let go of yours — the server refuses the rest).
//
// Calm: a claim is a face and a name on a row. Never a count, never « 3 sur 8 », never
// who brings the most. In the public invite preview (voyageApi.readOnly) every door hides
// and the rows simply read « Les Tremblay l'apportent ».

/** The trip's household roster, as the claims render it (an alias in the preview). */
export interface ClaimFace {
  household_id: string
  label: string
  colour: string
}

interface Common {
  tripId: string
  claims: SharedTripClaim[]
  faces: ClaimFace[]
  myHouseholdId: string
}

// The three writes, each spelled with its literal method (the write/operator-door guards
// read the call site, and a `method` variable reads as nothing to them).
function useClaimWrites(tripId: string) {
  const write = useWrite()
  const key = [...SHARED_TRIP_CLAIMS_KEY, tripId]
  type Body = Record<string, unknown>
  const post = (body: Body) => write('shared-trip-claims', { method: 'POST', body, affectedKeys: [key] })
  const patch = (body: Body) => write('shared-trip-claims', { method: 'PATCH', body, affectedKeys: [key] })
  const del = (body: Body) => write('shared-trip-claims', { method: 'DELETE', body, affectedKeys: [key] })
  return { key, post, patch, del }
}

// Who holds a row, as a leading face (or a quiet empty disc when nobody does yet).
function Holder({ c, faces }: { c: SharedTripClaim | undefined; faces: ClaimFace[] }) {
  const face = c?.household_id ? faces.find((f) => f.household_id === c.household_id) : undefined
  const label = face?.label ?? c?.household_label ?? null
  if (!c?.household_id) return <Avatar kind={null} name="?" colour="var(--line)" size={24} decorative />
  return <Avatar kind={null} name={label} colour={face?.colour} size={24} decorative />
}

const holderName = (c: SharedTripClaim, faces: ClaimFace[]) =>
  faces.find((f) => f.household_id === c.household_id)?.label ?? c.household_label ?? ''

// ---- « Qui apporte quoi » ------------------------------------------------------

export function SharedGearList({ tripId, claims, faces, myHouseholdId }: Common) {
  const t = useT()
  const ro = !!useVoyageApi().readOnly
  const { key, post, patch, del } = useClaimWrites(tripId)
  const { remove, visible } = useDeferredRemoval(key)
  const [text, setText] = useState('')
  const [editing, setEditing] = useState<string | null>(null)
  const gear = visible(claims.filter((c) => c.kind === 'gear'))

  async function add(v: string) {
    const value = v.trim()
    if (!value) return
    try {
      await post({ tripId, kind: 'gear', text: value })
      setText('')
    } catch {
      /* keep the text for a retry / the offline replay */
    }
  }

  return (
    <section className="voyage-packing__group shared-claims">
      <div className="sec-label">
        <b>{t.sharedVoyage.gearTitle}</b>
        <span className="ln" />
      </div>
      {!ro && (
        <EditField
          value={text}
          onChange={setText}
          onSubmit={add}
          submitLabel={t.common.add}
          submitLeadingIcon="plus-bold"
          placeholder={t.sharedVoyage.gearAdd}
        />
      )}
      {gear.length === 0 ? (
        <EmptyState tone="calm">{t.sharedVoyage.gearEmpty}</EmptyState>
      ) : (
        <div className="shared-claims__list">
          {gear.map((c) => {
            const mine = c.household_id === myHouseholdId
            const free = !c.household_id
            if (editing === c.id)
              return (
                <EditRow
                  key={c.id}
                  initial={c.text}
                  onSave={(v) => void patch({ id: c.id, text: v }).catch(writeFailed)}
                  onClose={() => setEditing(null)}
                />
              )
            return (
              <ListRow
                key={c.id}
                className="shared-claims__row"
                leading={<Holder c={c} faces={faces} />}
                title={c.text}
                subtitle={free ? t.sharedVoyage.nobodyYet : t.sharedVoyage.bringsIt(holderName(c, faces))}
                actions={
                  ro ? undefined : (
                    <>
                      {(free || mine) && (
                        <Chip
                          icon={mine ? 'check-bold' : 'hand-heart-bold'}
                          selected={mine}
                          onClick={() => void patch({ id: c.id, claim: !mine }).catch(writeFailed)}
                        >
                          {mine ? t.sharedVoyage.iBringIt : t.sharedVoyage.illBringIt}
                        </Chip>
                      )}
                      <RowActions
                        onEdit={() => setEditing(c.id)}
                        onDelete={
                          free || mine
                            ? () => remove([c.id], t.sharedVoyage.gearRemoved(c.text), () => del({ id: c.id }))
                            : undefined
                        }
                        editLabel={t.common.edit}
                        deleteLabel={t.common.delete}
                      />
                    </>
                  )
                }
              />
            )
          })}
        </div>
      )}
      <p className="voyage-docs__hint mono">{t.sharedVoyage.gearHint}</p>
    </section>
  )
}

// ---- « Qui cuisine » -------------------------------------------------------------

export function SharedMealPlan({
  tripId,
  claims,
  faces,
  myHouseholdId,
  start,
  end,
}: Common & { start: number | null; end: number | null }) {
  const t = useT()
  const { lang } = useLang()
  const ro = !!useVoyageApi().readOnly
  const { post, patch } = useClaimWrites(tripId)
  const [editing, setEditing] = useState<string | null>(null) // `${day}:${slot}`
  const days = tripDays(start, end)
  const meals = claims.filter((c) => c.kind === 'meal')
  const at = (day: number, slot: MealSlot) => meals.find((m) => m.date === day && m.slot === slot)

  if (days.length === 0) return <EmptyState tone="calm" guide={{ card: 'voyage' }}>{t.voyage.setDatesForItinerary}</EmptyState>

  // « On cuisine » on an empty slot creates the row already claimed; on a free row, takes it.
  function cook(day: number, slot: MealSlot, row: SharedTripClaim | undefined) {
    const p = row
      ? patch({ id: row.id, claim: true })
      : post({ tripId, kind: 'meal', date: day, slot, claim: true })
    void p.catch(writeFailed)
  }
  function saveMenu(day: number, slot: MealSlot, row: SharedTripClaim | undefined, text: string) {
    const p = row
      ? patch({ id: row.id, text })
      : post({ tripId, kind: 'meal', date: day, slot, text })
    void p.catch(writeFailed)
  }

  return (
    <div className="voyage-itin shared-claims">
      <p className="voyage-docs__hint mono">{t.sharedVoyage.mealsHint}</p>
      {days.map((d, i) => (
        <section key={d} className="voyage-itin__day">
          <div className="sec-label">
            <b>{t.voyage.dayN(i + 1)}</b>
            <span className="voyage-itin__date mono">{cap(formatDayLong(d, lang))}</span>
            <span className="ln" />
          </div>
          <div className="shared-claims__list">
            {MEAL_SLOTS.map(({ key: slot, icon }) => {
              const row = at(d, slot)
              const mine = !!row && row.household_id === myHouseholdId
              const free = !row?.household_id
              const id = `${d}:${slot}`
              if (editing === id)
                return (
                  <EditRow
                    key={slot}
                    initial={row?.text ?? ''}
                    placeholder={t.sharedVoyage.menuPlaceholder}
                    allowEmpty
                    onSave={(v) => saveMenu(d, slot, row, v)}
                    onClose={() => setEditing(null)}
                  />
                )
              return (
                <ListRow
                  key={slot}
                  className="shared-claims__row"
                  leading={row?.household_id ? <Holder c={row} faces={faces} /> : <InlineIcon name={icon} size={20} />}
                  title={
                    <>
                      {t.sharedVoyage.slot[slot]}
                      {row?.text ? <span className="shared-claims__menu"> — {row.text}</span> : null}
                    </>
                  }
                  subtitle={free ? t.sharedVoyage.nobodyCooks : t.sharedVoyage.cooks(holderName(row!, faces))}
                  actions={
                    ro ? undefined : (
                      <>
                        {(free || mine) && (
                          <Chip
                            icon={mine ? 'check-bold' : 'cooking-pot-bold'}
                            selected={mine}
                            onClick={() =>
                              mine ? void patch({ id: row!.id, claim: false }).catch(writeFailed) : cook(d, slot, row)
                            }
                          >
                            {mine ? t.sharedVoyage.weCook : t.sharedVoyage.wellCook}
                          </Chip>
                        )}
                        <RowActions onEdit={() => setEditing(id)} editLabel={t.sharedVoyage.editMenu} />
                      </>
                    )
                  }
                />
              )
            })}
          </div>
        </section>
      ))}
    </div>
  )
}

// The inline rename (a gear item) / menu edit (a meal) — the EditField inline-edit shape
// TripNoteCard and the bags use.
function EditRow({
  initial,
  placeholder,
  allowEmpty,
  onSave,
  onClose,
}: {
  initial: string
  placeholder?: string
  allowEmpty?: boolean
  onSave: (v: string) => void
  onClose: () => void
}) {
  const t = useT()
  const [text, setText] = useState(initial)
  return (
    <EditField
      value={text}
      onChange={setText}
      onSubmit={() => {
        const v = text.trim()
        if (v || allowEmpty) onSave(v)
        onClose()
      }}
      submitLabel={t.common.save}
      ariaLabel={t.common.edit}
      {...(placeholder ? { placeholder } : {})}
      allowEmpty={!!allowEmpty}
      autoFocus
      onCancel={onClose}
    />
  )
}
