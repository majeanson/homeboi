import { type CSSProperties } from 'react'
import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { ROUTINES_KEY } from '../../lib/queryKeys'
import { pickMomentRoutine, TOD_ICON, TOD_TINT, isRoutineTod } from '../../lib/routineTod'
import { Avatar } from '../Avatar'
import { RoutineRing } from '../RoutineRing'
import { InlineIcon } from '../Icon'
import { BoardCard } from './BoardCard'

// A routine-shaped row from GET /api/routines — the same cache the Routines tab and
// the idle screensaver fill. We take the subset this glance needs.
interface RoutineRow {
  id: string
  name: string
  timeOfDay: string | null
  color: string | null
  avatarPhoto: string | null
  memberName: string | null
  cards: { icon?: string }[]
  doneIdx?: number[]
}

// The board « Prochaine routine » glance — the ONE routine that fits the current
// moment (pickMomentRoutine, the exact rule the screensaver uses so they can't
// drift), with its moment cue, the owning face, today's progress ring, and a ▶ Faire
// straight into the run. So routines aren't siloed in their own tab — the wall shows
// what's coming. Renders NOTHING when no carded routine exists (calm; each board card
// owns its empty rule). Non-polling (staleTime) so this default-on card never adds
// /api/routines to the board poll — realtime nudges keep it fresh on another device's
// tick. A cue, never a nag: it just surfaces, it doesn't blink or count.
export function RoutineNextCard() {
  const t = useT()
  const { data } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    staleTime: 5 * 60_000,
  })
  const routine = pickMomentRoutine(data?.routines ?? [], Date.now())
  if (!routine) return null

  const tint =
    routine.color ?? (isRoutineTod(routine.timeOfDay) ? TOD_TINT[routine.timeOfDay] : 'var(--berry-deep)')
  const icon = isRoutineTod(routine.timeOfDay) ? TOD_ICON[routine.timeOfDay] : 'clock-bold'
  const doneCount = Math.min((routine.doneIdx ?? []).length, routine.cards.length)

  return (
    <BoardCard
      className="routine-next-card"
      style={{ '--tint': tint } as CSSProperties}
      icon={icon}
      label={t.boardCard.routineNext}
    >
      <div className="routine-next-card__body">
        <span className="routine-next-card__face">
          <Avatar
            kind={routine.avatarPhoto ? 'photo' : undefined}
            photo={routine.avatarPhoto}
            colour={tint}
            name={routine.memberName ?? routine.name}
            size={40}
          />
        </span>
        <div className="routine-next-card__title">
          <span className="routine-next-card__name">{routine.name}</span>
          {routine.memberName && <span className="routine-next-card__who mono">{routine.memberName}</span>}
        </div>
        <RoutineRing done={doneCount} total={routine.cards.length} tint={tint} label={t.routines.progressAria} />
      </div>
      <Link to={`/routine/${routine.id}/run`} className="routine-next-card__run">
        <InlineIcon name="play-bold" /> {t.routines.doRoutine}
      </Link>
    </BoardCard>
  )
}
