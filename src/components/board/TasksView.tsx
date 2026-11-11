import { useQuery } from '@tanstack/react-query'
import { useState } from 'react'
import { Link, useSearchParams } from 'react-router-dom'
import { useT } from '../../i18n'
import { useOperatorT } from '../../i18n.operator'
import { api } from '../../lib/api'
import { isGuest } from '../../lib/device'
import { useProfile } from '../../lib/profile'
import { TASKS_KEY } from '../../lib/queryKeys'
import { subjectOf, type SubjectLookup, type SubjectRef } from '../../lib/subjects'
import { useTabParam } from '../../lib/tabParam'
import { FIND_WHEN, findable, groupTasks, horizonOf, HORIZONS, mineTask, NO_SUBJECT, NOBODY, personKey, subjectKey, type TaskGroup, type TaskItem } from '../../lib/tasks'
import { loadStateOf } from '../Fallback'
import { EmptyState } from '../EmptyState'
import { Cluster } from '../Layout'
import { InlineIcon } from '../Icon'
import { Chip } from '../Chip'
import { Segmented } from '../Segmented'
import { ChoreLedger } from '../ChoreLedger'
import { SeasonSeeds, useSeasonSeeds } from '../tasks/SeasonSeeds'
import { TaskFinder, useFinderNote } from '../tasks/TaskFinder'
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
// « Trouver quoi faire » lives in the URL too (?effort=1..5, ?quand=semaine|mois|unjour), so a
// narrowed list survives a scene's round trip and can be linked. `tout` = no answer, no param.
const ANY = 'tout'
const EFFORTS = [ANY, '1', '2', '3', '4', '5'] as const
const WHENS = [ANY, ...FIND_WHEN] as const

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
  const [effortParam, setEffortParam] = useTabParam<(typeof EFFORTS)[number]>('effort', ANY, EFFORTS)
  const [whenParam, setWhenParam] = useTabParam<(typeof WHENS)[number]>('quand', ANY, WHENS)
  const effort = effortParam === ANY ? null : Number(effortParam)
  const when = whenParam === ANY ? null : whenParam
  const [params] = useSearchParams()
  const focus = focusRef(params.get('sujet'))
  const actions = useTaskActions(TASKS_KEY)
  const q = useQuery({ queryKey: TASKS_KEY, queryFn: () => api<TasksFrame>('tasks') })
  const o18n = useOperatorT()
  const seeds = useSeasonSeeds(q.data?.tasks ?? [])
  const finderNote = useFinderNote(effort, when)
  // One panel open at a time under the action row. A linked finder (?effort= / ?quand=)
  // opens on its answer.
  const [panel, setPanel] = useState<'find' | 'seeds' | null>(effort != null || when != null ? 'find' : null)
  const togglePanel = (p: 'find' | 'seeds') => setPanel((cur) => (cur === p ? null : p))
  const wait = loadStateOf(q, { shape: 'row', count: 6 })
  if (wait) return wait

  const lookup: SubjectLookup = { ...q.data?.subjects, members }
  const focusKey = focus ? `${focus.kind}:${focus.id}` : null
  const shown = actions
    .visible(q.data?.tasks ?? [])
    .filter((x) => (focusKey ? subjectKey(x) === focusKey : true))
    // The face lens narrows like it does everywhere, except where people ARE the grouping.
    .filter((x) => lens === 'qui' || mineTask(x, memberId))
    .filter((x) => findable(x, effort, when, todayDay))
  const finding = effort != null || when != null

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
      {/* La liste's shape: the quick add first (a title and Enter is a whole task), then ONE
          row of buttons, then the list. The row is the recipe book's « Filtrer » shape: a pill
          that opens a panel under the row, lit while it narrows. Nothing else stands between
          the field and the tasks. */}
      {!ro && <TaskQuickAdd actions={actions} subject={focus ?? undefined} />}
      <Cluster className="tasks-view__actions">
        <Chip
          icon="magnifying-glass-bold"
          expanded={panel === 'find'}
          onClick={() => togglePanel('find')}
          {...(finding ? { className: 'is-on' } : {})}
        >
          {t.effort.finder}
          {finderNote && <span className="tasks-view__note"> · {finderNote}</span>}
        </Chip>
        {!ro && seeds.length > 0 && (
          <Chip icon="tree-bold" expanded={panel === 'seeds'} onClick={() => togglePanel('seeds')}>
            {o18n.home.seedsTitle}
          </Chip>
        )}
        {/* The one task form with every layer in reach: one door, never a « type » to pick
            (phase 4). The field above stays the one-tap add. */}
        {!ro && (
          <Chip icon="plus-bold" to="/chore/new">
            {t.tasks.addDetailed}
          </Chip>
        )}
        {/* A new SUBJECT, not a task (the garden, the pool, the chalet: a `thing` carnet). It
            belongs to the lens that groups by subject, so it shows there only. */}
        {!ro && lens === 'sujet' && (
          <Chip icon="plus-bold" to="/maison?add=chose">
            {t.tasks.newThingTitle}
          </Chip>
        )}
      </Cluster>
      {panel === 'find' && (
        <TaskFinder
          effort={effort}
          when={when}
          onEffort={(v) => setEffortParam(v == null ? ANY : (String(v) as (typeof EFFORTS)[number]))}
          onWhen={(v) => setWhenParam(v ?? ANY)}
        />
      )}
      {!ro && panel === 'seeds' && <SeasonSeeds seeds={seeds} />}
      {groups.length === 0 ? (
        <EmptyState tone="calm">{finding ? t.effort.none : t.todos.empty}</EmptyState>
      ) : (
        groups.map((g) => (
          <section key={g.key} className="tasks-view__group">
            <SecLabel label={g.label} />
            <TaskList items={g.tasks} members={members} lookup={lookup} actions={actions} dated />
          </section>
        ))
      )}
      {/* « Qui a fait quoi » answers a question about PEOPLE, so it lives in the lens that
          groups by person, under that lens's own list, and nowhere else on the board. */}
      {!ro && lens === 'qui' && <ChoreLedger />}
    </div>
  )
}
