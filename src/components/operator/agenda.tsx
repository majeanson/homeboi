import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useAddSheet } from '../../lib/addSheet'
import { useUndoableRemove } from '../../lib/undoRemove'
import { isGuest } from '../../lib/device'
import { formatDay, formatTime } from '../../lib/format'
import { EventForm } from '../forms/EventForm'
import { InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'
import { EmptyState } from '../EmptyState'
import { ListRow } from '../ListRow'
import { MONTH_KEY } from '../../lib/queryKeys'
import { OperatorSection } from './OperatorSection'
import { type EventRow, type Member } from './types'

// Events: the operator manages the agenda here (edit/delete + reschedule), but
// ADDING is the same ＋ as everywhere — this section opens it (open('event'))
// rather than carrying a duplicate blank form. The shared <EventForm> still
// appears inline, but only to EDIT an existing event. 🔁 marks a recurring series.
export function EventsSection({
  events,
  members,
  onChange,
}: {
  events: EventRow[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const { lang } = useLang()
  const { open } = useAddSheet()
  const undoableRemove = useUndoableRemove()
  const write = useWrite()
  // Read-only guest: hide the add-event button + the inline edit form (RowActions
  // already hides its own ✏️/🗑️, so a guest can't open the editor anyway).
  const ro = isGuest()
  const [editing, setEditing] = useState<EventRow | null>(null)

  function remove(ev: EventRow) {
    if (editing?.id === ev.id) setEditing(null)
    undoableRemove({
      queryKey: ['events'],
      listProp: 'events',
      id: ev.id,
      label: ev.title,
      commit: () =>
        write('events', { method: 'DELETE', body: { id: ev.id }, affectedKeys: [['events'], ['board'], MONTH_KEY] }),
      after: onChange,
    })
  }
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.display_name
  const memberColor = (id: string | null) => members.find((m) => m.id === id)?.colour

  return (
    <OperatorSection title={t.operator.events}>
      {events.length === 0 ? (
        <EmptyState>{t.operator.noEvents}</EmptyState>
      ) : (
        <ul className="operator__list">
          {events.map((ev) => (
            <li key={ev.id}>
              <ListRow
                leading={
                  <span
                    className="operator__avatar"
                    style={{ background: ev.business_colour ?? memberColor(ev.member_id) ?? 'var(--ink-faint)' }}
                    aria-hidden="true"
                  />
                }
                title={
                  <>
                    {ev.recur_json && (
                      <>
                        <InlineIcon name="repeat-bold" size={13} color="var(--sky-deep)" />{' '}
                      </>
                    )}
                    {ev.title}
                  </>
                }
                subtitle={
                  <>
                    {formatDay(ev.start_at, lang)}
                    {ev.all_day ? '' : ` ${formatTime(ev.start_at, lang)}`}
                    {(() => {
                      const who = ev.business_name ?? ev.contact_name ?? memberName(ev.member_id)
                      return who ? ` · ${who}` : ''
                    })()}
                  </>
                }
                actions={
                  <RowActions
                    onEdit={() => setEditing(ev)}
                    onDelete={() => remove(ev)}
                    editLabel={t.operator.editEvent}
                    deleteLabel={t.operator.deleteEvent}
                  />
                }
              />
            </li>
          ))}
        </ul>
      )}
      {/* Adding lives on the ＋ (open('event')); the inline form is EDIT-only so
          Réglages doesn't carry a second copy of the blank event form. */}
      {ro ? null : editing ? (
        <EventForm
          key={editing.id}
          members={members}
          value={editing}
          onSaved={() => {
            setEditing(null)
            onChange()
          }}
          onCancel={() => setEditing(null)}
        />
      ) : (
        <button type="button" className="btn btn--primary operator__add" onClick={() => open('event', ['event'])}>
          <InlineIcon name="plus-bold" /> {t.operator.addEvent}
        </button>
      )}
    </OperatorSection>
  )
}
