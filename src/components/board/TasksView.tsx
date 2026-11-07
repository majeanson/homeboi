import { useQuery } from '@tanstack/react-query'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { api } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { useProfile } from '../../lib/profile'
import { TASKS_KEY } from '../../lib/queryKeys'
import { subjectOf, type SubjectLookup, type SubjectRef } from '../../lib/subjects'
import { useTabParam } from '../../lib/tabParam'
import { groupTasks, horizonOf, HORIZONS, mineTask, NO_SUBJECT, NOBODY, personKey, subjectKey, type TaskGroup, type TaskItem } from '../../lib/tasks'
import { loadStateOf } from '../Fallback'
import { Disclosure } from '../Disclosure'
import { EmptyState } from '../EmptyState'
import { Cluster } from '../Layout'
import { InlineIcon } from '../Icon'
import { Segmented } from '../Segmented'
import { ChoreLedger } from '../ChoreLedger'
import { SeasonSeeds } from '../tasks/SeasonSeeds'
import { TaskList, TaskQuickAdd } from '../tasks/TaskList'
import { useTaskActions } from '../tasks/useTaskActions'
import { SecLabel } from './BoardCard'
import { type Member } from './types'

// « Tâches » — the fifth board view, and the one home for browsing tasks (plan de la tâche
// unifiée). The same tasks, three ways: by horizon, by subject, by person. The lens lives in
// the URL (?par=), like every other view. The bento stays a glance of what is due; this is
// where a someday task lives and where « what is on the house this year? » gets answered.
//
// Lazy, like WeekView, and it reads /api/tasks once on opening: a cold read, kept fresh by
// the realtime nudge and by each write's affectedKeys. It never joins the poll.
const LENSES = ['horizon', 'sujet', 'qui'] as const
type Lens = (typeof LENSES)[number]

interface TasksFrame {
  tasks: TaskItem[]
  subjects: SubjectLookup
}

// `?sujet=project:<id>` narrows the view to one subject: a project has no page of its own,
// so this is where its row's link lands (lib/subjects).
function focusRef(raw: string | null): SubjectRef | null {
  const at = raw?.indexOf(':') ?? -1
  if (!raw || at <= 0) return null
  return { kind: raw.slice(0, at) as SubjectRef['kind'], id: raw.slice(at + 1) }
}

export function TasksView({ members, todayDay }: { members: Member[]; todayDay: number }) {
  const t = useT()
  const ro = isGuest()
  const { memberId } = useProfile()
  const [lens, setLens] = useTabParam<Lens>('par', 'horizon', LENSES)
  const [params] = useSearchParams()
  const focus = focusRef(params.get('sujet'))
  const actions = useTaskActions(TASKS_KEY)
  const q = useQuery({ queryKey: TASKS_KEY, queryFn: () => api<TasksFrame>('tasks') })
  const wait = loadStateOf(q, { shape: 'row', count: 6 })
  if (wait) return wait

  const lookup: SubjectLookup = { ...q.data?.subjects, members }
  const focusKey = focus ? `${focus.kind}:${focus.id}` : null
  const shown = actions
    .visible(q.data?.tasks ?? [])
    .filter((x) => (focusKey ? subjectKey(x) === focusKey : true))
    // The face lens narrows like it does everywhere, except where people ARE the grouping.
    .filter((x) => lens === 'qui' || mineTask(x, memberId))

  const nameOfSubject = (key: string, sample: TaskItem) =>
    key === NO_SUBJECT ? t.tasks.noSubject : (subjectOf(sample.subject, lookup).name ?? t.tasks.subjectKinds[sample.subject!.kind])
  const nameOfPerson = (key: string) => (key === NOBODY ? t.profile.household : (members.find((m) => m.id === key)?.display_name ?? t.profile.household))

  const groups: (TaskGroup<string> & { label: string })[] =
    lens === 'horizon'
      ? groupTasks(shown, (x) => horizonOf(x, todayDay), HORIZONS).map((g) => ({ ...g, label: t.tasks.horizons[g.key] }))
      : lens === 'sujet'
        ? groupTasks(shown, subjectKey).map((g) => ({ ...g, label: nameOfSubject(g.key, g.tasks[0]!) }))
        : groupTasks(shown, personKey).map((g) => ({ ...g, label: nameOfPerson(g.key) }))

  return (
    <div className="tasks-view">
      <Segmented<Lens>
        ariaLabel={t.tasks.lensLabel}
        value={lens}
        onChange={setLens}
        options={[
          { key: 'horizon', label: t.tasks.lens.horizon, icon: 'calendar-blank-bold' },
          { key: 'sujet', label: t.tasks.lens.sujet, icon: 'book-open-bold' },
          { key: 'qui', label: t.tasks.lens.qui, icon: 'users-three-bold' },
        ]}
      />
      {focus && (
        <p className="tasks-view__focus mono">
          <Link to="/board?view=taches&par=sujet">
            <InlineIcon name="arrow-left-bold" size={14} /> {t.tasks.allSubjects}
          </Link>
        </p>
      )}
      {!ro && <TaskQuickAdd actions={actions} subject={focus ?? undefined} />}
      {groups.length === 0 ? (
        <EmptyState tone="calm">{t.todos.empty}</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="tasks-view__group">
            <SecLabel label={g.label} />
            <TaskList items={g.tasks} members={members} lookup={lookup} actions={actions} dated />
          </section>
        ))
      )}
      {!ro && (
        <Cluster className="tasks-view__doors">
          <Link className="btn btn--sm" to="/chore/new">
            <InlineIcon name="repeat-bold" size={14} /> {t.tasks.addPlanned}
          </Link>
          <Link className="btn btn--sm" to="/home-project/new?kind=upkeep">
            <InlineIcon name="broom-bold" size={14} /> {t.tasks.addUpkeep}
          </Link>
          <Link className="btn btn--sm" to="/home-project/new?kind=plan">
            <InlineIcon name="paint-brush-bold" size={14} /> {t.tasks.addProject}
          </Link>
        </Cluster>
      )}
      {!ro && <SeasonSeeds tasks={q.data?.tasks ?? []} />}
      {!ro && (
        <Disclosure label={t.tasks.ledger} className="tasks-view__ledger">
          <ChoreLedger />
        </Disclosure>
      )}
    </div>
  )
}
