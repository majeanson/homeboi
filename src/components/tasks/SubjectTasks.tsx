import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../../i18n'
import { api } from '../../lib/api'
import { formatDayMaybeYear } from '../../lib/format'
import { MEMBERS_KEY, TASKS_KEY } from '../../lib/queryKeys'
import { type SubjectLookup, type SubjectRef } from '../../lib/subjects'
import { subjectKey, type TaskHistoryLine, type TaskItem } from '../../lib/tasks'
import { SecLabel } from '../board/BoardCard'
import { type Member } from '../board/types'
import { Disclosure } from '../Disclosure'
import { loadStateOf } from '../Fallback'
import { SectionAdd, useSectionAdd } from '../SectionAdd'
import { TaskList, TaskQuickAdd } from './TaskList'
import { useTaskActions } from './useTaskActions'

// THE TASKS OF ONE SUBJECT — one component for a carnet, a person and a pet (plan de la tâche
// unifiée, phase 2). What is on this thing now, a one-field add that files itself here, and
// what has been done: a dated history, names and dates. Never a score, a total or a count
// of anything: a pet's page does not rate who walks the dog.
interface SubjectFrame {
  tasks: TaskItem[]
  subjects: SubjectLookup
  history: TaskHistoryLine[]
}

export function SubjectTasks({ subject, hide }: { subject: SubjectRef; hide?: ((t: TaskItem) => boolean) | undefined }) {
  const t = useT()
  const { lang } = useLang()
  const add = useSectionAdd()
  const actions = useTaskActions(TASKS_KEY)
  const key = `${subject.kind}:${subject.id}`
  const q = useQuery({ queryKey: [...TASKS_KEY, key], queryFn: () => api<SubjectFrame>(`tasks?subject=${encodeURIComponent(key)}`) })
  const membersQ = useQuery({ queryKey: MEMBERS_KEY, queryFn: () => api<{ members: Member[] }>('members') })
  const members = membersQ.data?.members ?? []
  const wait = loadStateOf(q, { shape: 'row', count: 2 })
  const rows = actions.visible(q.data?.tasks ?? []).filter((x) => subjectKey(x) === key && !hide?.(x))
  const history = q.data?.history ?? []
  const nameOf = (id: string | null) => members.find((m) => m.id === id)?.display_name

  return (
    <section className="subject-tasks">
      <SecLabel label={t.board.todos} icon="check-bold" action={<SectionAdd open={add.open} onToggle={add.toggle} label={t.todos.addPlaceholder} />} />
      {wait ?? (
        <>
          <TaskList items={rows} members={members} lookup={{ ...q.data?.subjects, members }} actions={actions} dated emptyText={t.tasks.subjectEmpty} />
          {add.open && <TaskQuickAdd actions={actions} subject={subject} autoFocus={add.autoFocus} onAdded={add.close} />}
          {history.length > 0 && (
            <Disclosure label={t.tasks.history} className="subject-tasks__history">
              <ul className="task-history">
                {history.map((line) => (
                  <li key={line.key}>
                    <span className="task-history__when mono">{formatDayMaybeYear(line.at, lang)}</span> {line.title}
                    {nameOf(line.who_id) && <span className="task-history__who"> · {nameOf(line.who_id)}</span>}
                  </li>
                ))}
              </ul>
            </Disclosure>
          )}
        </>
      )}
    </section>
  )
}
