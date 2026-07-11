import { Link } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { type HelpMode } from '../../lib/helpMode'
import { todayLocalDay } from '../../lib/localDay'
import { TODOS_KEY, WEATHER_KEY } from '../../lib/queryKeys'
import { type TodosData, isChecklistRow, isOpen } from '../../lib/todos'
import { type Weather, type DayOutlook, weatherIcon, weatherTint, weatherTip } from '../../lib/weather'
import { useBoardData } from '../../lib/queryHooks'
import { InlineIcon } from '../Icon'
import { BoardCard } from './BoardCard'
import { TodoSection } from '../todos/TodoSection'
import { ActivityBring } from './ActivityBring'

// « Avant de partir » — the departure concept's board home (mig 0116, the
// todos ↔ departure split). Everything before the door, TODAY only:
//   1. the weather dressing tip (the first glance before the door);
//   2. today's instantiated checklists — foldable, tickable, and the on-board
//      instantiation home (the template picker lives here, not on « À faire »);
//   3. « À apporter » — today's activities that carry a bring-list, one tap to
//      make one concrete;
//   4. the key-door into the full /board/departure scene.
// The door (+ tip) render on every day — leaving the house isn't conditional on
// the agenda — so the card is mode `always` in lib/boardCards and never sits
// slot-empty. A guest sees it read-only (TodoSection's `ro` path hides the picker
// and checks; the door is plain navigation).
export function DepartureCard({ help }: { help?: HelpMode }) {
  const t = useT()
  const today = todayLocalDay()
  // Members AND today's events (incl. `bring_template_id` — the /api/board events
  // now carry it precisely so this card costs NO extra fetch) ride the board
  // payload the page already polls. Zero net-new requests for the free tier.
  const board = useBoardData().data
  const members = board?.members ?? []

  // The SAME cache the departure scene reads (shared key), deliberately
  // non-polling: the board payload and realtime nudges already keep the household
  // fresh, and the embedded TodoSection polls TODOS_KEY itself while the card is
  // grown — this direct read only powers the compact mini.
  const todos = useQuery({ queryKey: TODOS_KEY, queryFn: () => api<TodosData>('todos') }).data?.todos ?? []
  const weather = useQuery({
    queryKey: WEATHER_KEY,
    queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'),
    staleTime: 15 * 60 * 1000,
  }).data?.weather

  const tip = weatherTip(weather ?? null)
  const openInstances = todos.filter((td) => isChecklistRow(td) && isOpen(td))

  return (
    <BoardCard
      className="depart-card bento bento--tinted"
      style={{ ['--sec-tint']: 'var(--marigold-deep)' } as React.CSSProperties}
      icon="key-bold"
      label={t.departure.title}
      help={help}
      helpKey="departure"
      count={openInstances.length || undefined}
      // Compact: name what's still to tick before the door; when nothing is listed
      // the mini taps straight through to the departure scene (the door IS the card).
      compactLabel={t.departure.titleShort}
      compactItems={openInstances.map((td) => td.title)}
      compactHint={openInstances.length ? String(openInstances.length) : undefined}
      compactTo={openInstances.length === 0 ? '/board/departure' : undefined}
    >
      {/* The one dressing tip, where the key already is — a quiet line, never a nag. */}
      {weather && tip && (
        <p className="depart-card__tip mono" style={{ color: weatherTint(weather) }}>
          <InlineIcon name={weatherIcon(weather)} size={14} /> {t.weather.tip[tip]}
        </p>
      )}

      {/* Today's departure checklists — the shared todos machinery, checklist rows
          only, each instance folded under its title. Adding from the picker here
          instantiates day-pinned to today (the server forces it). */}
      <TodoSection
        title={t.departure.lists}
        members={members}
        bento={false}
        show="checklists"
        foldSections
        emptyText={t.departure.emptyLists}
      />

      {/* « À apporter » — today's activities that carry a bring-list (soccer cleats,
          instrument…); renders nothing when none do. */}
      <ActivityBring events={board?.today ?? []} day={today} />

      {/* The door — the full pre-departure screen (weather + agenda + corvées +
          L'auto). Kept on every day, clear or not. */}
      <div className="depart-card__door">
        <Link to="/board/departure" className="btn btn--ghost mono">
          <InlineIcon name="key-bold" size={16} /> {t.departure.open}
        </Link>
      </div>
    </BoardCard>
  )
}
