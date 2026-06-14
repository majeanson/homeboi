import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { ROUTINE_TODS, TOD_ICON, TOD_TINT, isRoutineTod } from '../../lib/routineTod'
import { InlineIcon } from '../Icon'
import { ChoreForm } from '../forms/ChoreForm'
import { RoutineForm } from '../forms/RoutineForm'
import { RecurPicker, type RecurValue } from '../RecurPicker'
import { recurLabel, recurOf, anchorSecToDate, dateToAnchorSec, todayAnchorDate } from '../../lib/recurLabel'
import { type Chore, type Member, type Routine } from './types'

export function ChoresSection({
  chores,
  members,
  onChange,
}: {
  chores: Chore[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const undoableRemove = useUndoableRemove()
  function remove(c: Chore) {
    undoableRemove({
      queryKey: ['chores'],
      listProp: 'chores',
      id: c.id,
      label: c.title,
      commit: () => api('chores', { method: 'DELETE', body: { id: c.id } }),
      after: onChange,
    })
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.chores}</h2>
      <ul className="operator__list">
        {chores.map((c) => (
          <ChoreRow key={c.id} chore={c} onChange={onChange} onRemove={() => remove(c)} />
        ))}
      </ul>
      <ChoreForm members={members} onSaved={onChange} />
    </section>
  )
}

// One chore row with an expandable "schedule" control, so an existing chore can
// be given (or cleared of) a recurrence without recreating it.
function ChoreRow({ chore, onChange, onRemove }: { chore: Chore; onChange: () => void; onRemove: () => void }) {
  const t = useT()
  const [editing, setEditing] = useState(false)
  const [recur, setRecur] = useState<RecurValue | null>(recurOf(chore.recur_json))
  // The recurrence anchor; defaults to today when this chore never had one.
  const [start, setStart] = useState(anchorSecToDate(chore.recur_start) || todayAnchorDate())
  const label = recurLabel(chore.recur_json, t)

  // One write sets both rule and anchor — they always travel together, and the
  // anchor is only meaningful while a rule exists (cleared with it).
  async function saveRecur(v: RecurValue | null, s: string) {
    setRecur(v)
    setStart(s)
    await api('chores', {
      method: 'PATCH',
      body: { id: chore.id, recur: v, start: v ? dateToAnchorSec(s) : null },
    }).catch(() => {})
    onChange()
  }

  return (
    <li className="operator__chore-row">
      <span className="operator__avatar" style={{ background: chore.color ?? '#88A36F' }} aria-hidden="true" />
      <span className="operator__chore-name">
        {chore.title}
        {label && <span className="operator__chore-recur mono"> · {label}</span>}
      </span>
      <button type="button" className="btn btn--ghost mono" onClick={() => setEditing((s) => !s)}>
        {t.operator.schedule}
      </button>
      <button type="button" className="btn btn--ghost mono operator__del" onClick={onRemove}>
        {t.operator.delete}
      </button>
      {editing && (
        <div className="operator__chore-schedule">
          <RecurPicker value={recur} onChange={(v) => saveRecur(v, start)} />
          {recur && (
            <label className="recur__row mono">
              <span>{t.operator.choreStart}</span>
              <input
                className="input"
                type="date"
                value={start}
                onChange={(e) => saveRecur(recur, e.target.value)}
              />
            </label>
          )}
        </div>
      )}
    </li>
  )
}

export function RoutinesSection({
  routines,
  members,
  onChange,
}: {
  routines: Routine[]
  members: Member[]
  onChange: () => void
}) {
  const t = useT()
  const qc = useQueryClient()
  const undoableRemove = useUndoableRemove()
  function remove(r: Routine) {
    undoableRemove({
      queryKey: ['routines'],
      listProp: 'routines',
      id: r.id,
      label: r.name,
      commit: () => api('routines', { method: 'DELETE', body: { id: r.id } }),
      after: onChange,
    })
  }
  // Cycle the moment cue: anytime → matin → après-midi → soir → anytime.
  // Optimistic (the chip flips at once); the kid view re-orders on its next poll.
  async function cycleTod(r: Routine) {
    const cur = isRoutineTod(r.timeOfDay) ? ROUTINE_TODS.indexOf(r.timeOfDay) : -1
    const next = cur + 1 >= ROUTINE_TODS.length ? null : ROUTINE_TODS[cur + 1]
    qc.setQueryData<{ routines: Routine[] }>(['routines'], (d) =>
      d ? { routines: d.routines.map((x) => (x.id === r.id ? { ...x, timeOfDay: next } : x)) } : d,
    )
    await api('routines', { method: 'PATCH', body: { routineId: r.id, timeOfDay: next } }).catch(() => {})
    onChange()
  }

  return (
    <section className="surface operator__section">
      <h2>{t.operator.routines}</h2>
      <ul className="operator__list">
        {routines.map((r) => (
          <li key={r.id}>
            <span>
              {r.name}
              {r.memberName ? ` · ${r.memberName}` : ''}
            </span>
            <button
              type="button"
              className="chip mono"
              onClick={() => cycleTod(r)}
              title={t.routines.todLabel}
              aria-label={`${t.routines.todLabel} ${isRoutineTod(r.timeOfDay) ? t.routines.tod[r.timeOfDay] : t.routines.tod.any}`}
            >
              {isRoutineTod(r.timeOfDay) ? (
                <>
                  <InlineIcon name={TOD_ICON[r.timeOfDay]} color={TOD_TINT[r.timeOfDay]} />{' '}
                  {t.routines.tod[r.timeOfDay]}
                </>
              ) : (
                t.routines.tod.any
              )}
            </button>
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(r)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <RoutineForm members={members} onSaved={onChange} />
    </section>
  )
}
