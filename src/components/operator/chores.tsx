import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { useUndoableRemove } from '../../lib/undoRemove'
import { ROUTINE_TODS, TOD_EMOJI, isRoutineTod } from '../../lib/routineTod'
import { ChoreForm } from '../forms/ChoreForm'
import { RoutineForm } from '../forms/RoutineForm'
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
          <li key={c.id}>
            <span className="operator__avatar" style={{ background: c.color ?? '#88A36F' }} aria-hidden="true" />
            <span>{c.title}</span>
            <button type="button" className="btn btn--ghost mono operator__del" onClick={() => remove(c)}>
              {t.operator.delete}
            </button>
          </li>
        ))}
      </ul>
      <ChoreForm members={members} onSaved={onChange} />
    </section>
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
              {isRoutineTod(r.timeOfDay)
                ? `${TOD_EMOJI[r.timeOfDay]} ${t.routines.tod[r.timeOfDay]}`
                : t.routines.tod.any}
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
