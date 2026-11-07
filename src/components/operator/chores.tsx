import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { type QueryClient } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { useWrite, writeFailed } from '../../lib/write'
import { useAddSheet } from '../../lib/addSheet'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { ROUTINE_TODS, TOD_ICON, TOD_TINT, isRoutineTod } from '../../lib/routineTod'
import { InlineIcon } from '../Icon'
import { Chip } from '../Chip'
import { RowActions } from '../RowActions'
import { type HelpMode } from '../../lib/helpMode'
import { EmptyState } from '../EmptyState'
import { OperatorSection } from './OperatorSection'
import { useNavigate } from 'react-router-dom'
import { ROUTINES_KEY } from '../../lib/queryKeys'
import { type Routine } from './types'

export function RoutinesSection({ routines, onChange, help }: { routines: Routine[]; onChange: () => void; help?: HelpMode }) {
  const o18n = useOperatorT()
  const t = useT()
  const { open } = useAddSheet()
  const removal = useDeferredRemoval(ROUTINES_KEY)
  const recordUndo = useRecordUndo()
  const write = useWrite()
  const navigate = useNavigate()
  // Read-only guest: hide the ToD cycle chip (a write) + the add-routine button.
  const ro = isGuest()
  function remove(r: Routine) {
    // No .catch: a rejected delete must un-hide the row (useDeferredRemoval reads the
    // rejection to tell "gone, refetch failed" from "the delete failed").
    removal.remove([r.id], t.undo.cleared(r.name), async () => {
      await write('routines', { method: 'DELETE', body: { id: r.id }, affectedKeys: [ROUTINES_KEY] })
      onChange()
    })
  }
  // Cycle the moment cue: anytime → matin → après-midi → soir → anytime.
  // Optimistic (the chip flips at once); the kid view re-orders on its next poll.
  async function cycleTod(r: Routine) {
    const prev = r.timeOfDay
    const cur = isRoutineTod(r.timeOfDay) ? ROUTINE_TODS.indexOf(r.timeOfDay) : -1
    const next = ROUTINE_TODS[cur + 1] ?? null
    // One write per cue, with the chip flip carried as useWrite's optimistic (so it
    // reverts on a server reject and queues offline instead of being lost).
    const setTodWrite = (tod: string | null) =>
      write('routines', {
        method: 'PATCH',
        body: { routineId: r.id, timeOfDay: tod },
        affectedKeys: [ROUTINES_KEY],
        optimistic: (qc: QueryClient) =>
          qc.setQueryData<{ routines: Routine[] }>(ROUTINES_KEY, (d) =>
            d ? { routines: d.routines.map((x) => (x.id === r.id ? { ...x, timeOfDay: tod } : x)) } : d,
          ),
      }).catch(writeFailed)
    await setTodWrite(next)
    onChange()
    // Compensating undo: put the previous cue back (chip + server).
    recordUndo({
      message: t.undo.routineTime(r.name),
      onUndo: async () => {
        await setTodWrite(prev)
        onChange()
      },
    })
  }

  return (
    <OperatorSection title={o18n.routines} help={help} helpKey="routines">
      {routines.length === 0 && <EmptyState>{o18n.noRoutines}</EmptyState>}
      <ul className="operator__list">
        {removal.visible(routines).map((r) => {
          // The moment-of-day cue's inner label — one definition, rendered either as
          // an inert guest badge or the operator's tap-to-cycle button below.
          const todText = isRoutineTod(r.timeOfDay) ? t.routines.tod[r.timeOfDay] : t.routines.tod.any
          const todContent = isRoutineTod(r.timeOfDay) ? (
            <>
              <InlineIcon name={TOD_ICON[r.timeOfDay]} color={TOD_TINT[r.timeOfDay]} /> {todText}
            </>
          ) : (
            todText
          )
          return (
            <li key={r.id} className="operator__routine-row">
              <span>
                {r.name}
                {r.memberName ? ` · ${r.memberName}` : ''}
              </span>
              {/* The moment-of-day cue stays a one-tap chip (a quick content
                  toggle, not a CRUD affordance); ✏️/🗑️ edit and remove. For a guest
                  it reads as an inert badge (the cue is shown, but can't be cycled). */}
              {ro ? (
                <Chip className="mono" title={t.routines.todLabel}>
                  {todContent}
                </Chip>
              ) : (
                <Chip
                  className="mono"
                  onClick={() => cycleTod(r)}
                  title={t.routines.todLabel}
                  ariaLabel={`${t.routines.todLabel} ${todText}`}
                >
                  {todContent}
                </Chip>
              )}
              {/* Edit opens the full-screen builder scene (/routine/:id), not an
                  inline form: the card deck was "the worst sheet offender" under the
                  mobile keyboard, so both edit entry points (here + the Routines tab)
                  route to the one ergonomic surface. */}
              <RowActions
                onEdit={() => navigate(`/routine/${r.id}`)}
                onDelete={() => remove(r)}
                editLabel={o18n.editRoutine}
                deleteLabel={o18n.deleteRoutine}
              />
            </li>
          )
        })}
      </ul>
      {/* Building a routine is the same ＋ as everywhere; Réglages edits/removes
          the ones that exist (the rows above). Hidden for a read-only guest. */}
      {!ro && (
        <button type="button" className="btn btn--primary operator__add" onClick={() => open('routine', ['routine'])}>
          <InlineIcon name="plus-bold" /> {o18n.addRoutine}
        </button>
      )}
    </OperatorSection>
  )
}
