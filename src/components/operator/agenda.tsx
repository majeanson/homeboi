import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { formatDay, formatTime } from '../../lib/format'
import { EventForm } from '../forms/EventForm'
import { type EventRow, type Member } from './types'

// Events: the operator's direct CRUD over the agenda. The form itself is the
// shared <EventForm> (also used by the Add sheet); this section just adds the
// list + edit/delete around it. 🔁 marks a recurring series.
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
  const undoableRemove = useUndoableRemove()
  const [editing, setEditing] = useState<EventRow | null>(null)

  function remove(ev: EventRow) {
    if (editing?.id === ev.id) setEditing(null)
    undoableRemove({
      queryKey: ['events'],
      listProp: 'events',
      id: ev.id,
      label: ev.title,
      commit: () => api('events', { method: 'DELETE', body: { id: ev.id } }),
      after: onChange,
    })
  }
  const memberName = (id: string | null) => members.find((m) => m.id === id)?.display_name
  const memberColor = (id: string | null) => members.find((m) => m.id === id)?.colour

  return (
    <section className="surface operator__section">
      <h2>{t.operator.events}</h2>
      {events.length === 0 ? (
        <p className="board__empty mono">{t.operator.noEvents}</p>
      ) : (
        <ul className="operator__list">
          {events.map((ev) => (
            <li key={ev.id}>
              <span
                className="operator__avatar"
                style={{ background: memberColor(ev.member_id) ?? 'var(--ink-faint)' }}
                aria-hidden="true"
              />
              <span>
                {ev.recur_json ? '🔁 ' : ''}
                {ev.title}
                <span className="mono operator__event-when">
                  {' · '}
                  {formatDay(ev.start_at, lang)}
                  {ev.all_day ? '' : ` ${formatTime(ev.start_at, lang)}`}
                  {memberName(ev.member_id) ? ` · ${memberName(ev.member_id)}` : ''}
                </span>
              </span>
              <button type="button" className="btn btn--ghost mono" onClick={() => setEditing(ev)} aria-label={t.common.edit}>
                ✎
              </button>
              <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(ev)}>
                {t.operator.delete}
              </button>
            </li>
          ))}
        </ul>
      )}
      <EventForm
        key={editing?.id ?? 'new'}
        members={members}
        value={editing}
        onSaved={() => {
          setEditing(null)
          onChange()
        }}
        onCancel={editing ? () => setEditing(null) : undefined}
      />
    </section>
  )
}
