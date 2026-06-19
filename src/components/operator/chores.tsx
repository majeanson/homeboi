import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite } from '../../lib/write'
import { useAddSheet } from '../../lib/addSheet'
import { useUndoableRemove } from '../../lib/undoRemove'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { ROUTINE_TODS, TOD_ICON, TOD_TINT, isRoutineTod } from '../../lib/routineTod'
import { InlineIcon } from '../Icon'
import { RowActions } from '../RowActions'
import { ListRow } from '../ListRow'
import { OperatorSection } from './OperatorSection'
import { ChoreForm } from '../forms/ChoreForm'
import { RoutineForm } from '../forms/RoutineForm'
import { recurLabel } from '../../lib/recurLabel'
import { type Chore, type Routine } from './types'

export function ChoresSection({ chores, onChange }: { chores: Chore[]; onChange: () => void }) {
  const t = useT()
  const { open } = useAddSheet()
  const undoableRemove = useUndoableRemove()
  const write = useWrite()
  function remove(c: Chore) {
    undoableRemove({
      queryKey: ['chores'],
      listProp: 'chores',
      id: c.id,
      label: c.title,
      commit: () => write('chores', { method: 'DELETE', body: { id: c.id }, affectedKeys: [['chores']] }),
      after: onChange,
    })
  }

  return (
    <OperatorSection title={t.operator.chores}>
      <ul className="operator__list">
        {chores.map((c) => (
          <ChoreRow key={c.id} chore={c} onChange={onChange} onRemove={() => remove(c)} />
        ))}
      </ul>
      {/* Creating a chore is the same ＋ as everywhere; Réglages edits/removes the
          ones that exist (the rows above). Hidden for a read-only guest. */}
      {!isGuest() && (
        <button type="button" className="btn btn--primary operator__add" onClick={() => open('chore', ['chore'])}>
          <InlineIcon name="plus-bold" /> {t.operator.addChore}
        </button>
      )}
    </OperatorSection>
  )
}

// One chore row. Tapping ✏️ expands the SAME ＋ form, prefilled — one editor for
// title, rotation, colour and schedule (the old "Céduler"-only expander is now
// just part of full edit). 🗑️ removes it (deferred undo).
function ChoreRow({ chore, onChange, onRemove }: { chore: Chore; onChange: () => void; onRemove: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const [editing, setEditing] = useState(false)
  const label = recurLabel(chore.recur_json, t)
  // The rotation form needs the household roster; it's already cached by the
  // Réglages shell (the Household tab / board both read ['members']).
  const members = qc.getQueryData<{ members: { id: string; display_name: string }[] }>(['members'])?.members ?? []

  if (editing)
    return (
      <li className="operator__chore-row operator__chore-row--editing">
        <ChoreForm
          key={chore.id}
          members={members}
          value={chore}
          onSaved={() => {
            setEditing(false)
            onChange()
          }}
          onCancel={() => setEditing(false)}
        />
      </li>
    )

  return (
    <li>
      <ListRow
        leading={<span className="operator__avatar" style={{ background: chore.color ?? '#88A36F' }} aria-hidden="true" />}
        title={chore.title}
        subtitle={label || undefined}
        actions={
          <RowActions
            onEdit={() => setEditing(true)}
            onDelete={onRemove}
            editLabel={t.operator.editChore}
            deleteLabel={t.operator.deleteChore}
          />
        }
      />
    </li>
  )
}

export function RoutinesSection({ routines, onChange }: { routines: Routine[]; onChange: () => void }) {
  const t = useT()
  const qc = useQueryClient()
  const { open } = useAddSheet()
  const undoableRemove = useUndoableRemove()
  const recordUndo = useRecordUndo()
  const write = useWrite()
  // Read-only guest: hide the ToD cycle chip (a write) + the add-routine button.
  const ro = isGuest()
  const [editing, setEditing] = useState<string | null>(null)
  function remove(r: Routine) {
    if (editing === r.id) setEditing(null)
    undoableRemove({
      queryKey: ['routines'],
      listProp: 'routines',
      id: r.id,
      label: r.name,
      commit: () => write('routines', { method: 'DELETE', body: { id: r.id }, affectedKeys: [['routines']] }),
      after: onChange,
    })
  }
  // Cycle the moment cue: anytime → matin → après-midi → soir → anytime.
  // Optimistic (the chip flips at once); the kid view re-orders on its next poll.
  async function cycleTod(r: Routine) {
    const prev = r.timeOfDay
    const cur = isRoutineTod(r.timeOfDay) ? ROUTINE_TODS.indexOf(r.timeOfDay) : -1
    const next = cur + 1 >= ROUTINE_TODS.length ? null : ROUTINE_TODS[cur + 1]
    const setTod = (tod: string | null) =>
      qc.setQueryData<{ routines: Routine[] }>(['routines'], (d) =>
        d ? { routines: d.routines.map((x) => (x.id === r.id ? { ...x, timeOfDay: tod } : x)) } : d,
      )
    setTod(next)
    await write('routines', {
      method: 'PATCH',
      body: { routineId: r.id, timeOfDay: next },
      affectedKeys: [['routines']],
    }).catch(() => {})
    onChange()
    // Compensating undo: put the previous cue back (chip + server).
    recordUndo({
      message: t.undo.routineTime(r.name),
      onUndo: async () => {
        setTod(prev)
        await write('routines', {
          method: 'PATCH',
          body: { routineId: r.id, timeOfDay: prev },
          affectedKeys: [['routines']],
        }).catch(() => {})
        onChange()
      },
    })
  }

  return (
    <OperatorSection title={t.operator.routines}>
      <ul className="operator__list">
        {routines.map((r) =>
          editing === r.id ? (
            <li key={r.id} className="operator__routine-row--editing">
              <RoutineForm
                key={r.id}
                members={[]}
                value={r}
                onSaved={() => {
                  setEditing(null)
                  onChange()
                }}
                onCancel={() => setEditing(null)}
              />
            </li>
          ) : (
            <li key={r.id} className="operator__routine-row">
              <span>
                {r.name}
                {r.memberName ? ` · ${r.memberName}` : ''}
              </span>
              {/* The moment-of-day cue stays a one-tap chip (a quick content
                  toggle, not a CRUD affordance); ✏️/🗑️ edit and remove. For a guest
                  it reads as an inert badge (the cue is shown, but can't be cycled). */}
              {ro ? (
                <span className="chip mono" title={t.routines.todLabel}>
                  {isRoutineTod(r.timeOfDay) ? (
                    <>
                      <InlineIcon name={TOD_ICON[r.timeOfDay]} color={TOD_TINT[r.timeOfDay]} />{' '}
                      {t.routines.tod[r.timeOfDay]}
                    </>
                  ) : (
                    t.routines.tod.any
                  )}
                </span>
              ) : (
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
              )}
              <RowActions
                onEdit={() => setEditing(r.id)}
                onDelete={() => remove(r)}
                editLabel={t.operator.editRoutine}
                deleteLabel={t.operator.deleteRoutine}
              />
            </li>
          ),
        )}
      </ul>
      {/* Building a routine is the same ＋ as everywhere; Réglages edits/removes
          the ones that exist (the rows above). Hidden for a read-only guest. */}
      {!ro && (
        <button type="button" className="btn btn--primary operator__add" onClick={() => open('routine', ['routine'])}>
          <InlineIcon name="plus-bold" /> {t.operator.addRoutine}
        </button>
      )}
    </OperatorSection>
  )
}
