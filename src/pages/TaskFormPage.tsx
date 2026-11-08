import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { loadStateOf } from '../components/Fallback'
import { FormDelete } from '../components/FormDelete'
import { FormScene } from '../components/FormScene'
import { TaskForm } from '../components/forms/TaskForm'
import { useTaskActions } from '../components/tasks/useTaskActions'
import { useT } from '../i18n'
import { api } from '../lib/api'
import { inputFromLocalDay } from '../lib/localDay'
import { doorKind, emptyDraft, taskRead } from '../lib/taskSave'
import type { TaskFace } from '../lib/taskTarget'

// THE ONE TASK FORM as a full-screen scene (tall forms strand under a phone's keyboard in a
// sheet). Every old door still lands here, so no link breaks:
//   /chore/new           a new task. `?start=<sec>` (a local midnight, from the calendar) seeds its day.
//   /home-project/new    a new task. `?kind=plan|upkeep` and `?carnet=<id>` (a carnet's
//                        Entretien section) seed it: the door names the kind, the household never does.
//   /chore/:id, /home-project/:id, /todo/:id
//                        an edit of a row wearing that face; every peek's « Modifier » opens one.
// Which cache holds the row is the save adapter's answer (`taskRead`), never this page's.
export function TaskFormPage({ table }: { table?: TaskFace | undefined }) {
  const t = useT()
  const f = t.tasks.form
  const { id } = useParams()
  const [params] = useSearchParams()
  const editing = id && table ? { table, id } : null
  const read = taskRead(table ?? 'todo')
  const q = useQuery({ queryKey: read.key, queryFn: () => api<unknown>(read.path), enabled: !!editing })
  const draft = editing ? read.draftOf(q.data, editing.id) : undefined
  const wait = editing && !draft ? loadStateOf(q) : null
  const actions = useTaskActions(read.key)

  const start = Number(params.get('start'))
  const carnet = params.get('carnet')
  const seed = emptyDraft({
    date: Number.isFinite(start) && start > 0 ? inputFromLocalDay(start) : '',
    kind: doorKind(params.get('kind')),
    subject: carnet ? { kind: 'carnet', id: carnet } : null,
  })

  return (
    <FormScene card="set-chores" title={editing ? f.editTitle : f.newTitle} icon="check-square-bold" fallback="/board?view=taches" kiosk={!!editing}>
      {(_members, close) =>
        wait ?? (
          <>
            <TaskForm
              key={editing?.id ?? 'new'}
              value={editing && draft ? { ...editing, draft } : null}
              seed={seed}
              onSaved={close}
            />
            {editing && draft && (
              <FormDelete
                label={f.deleteLabel}
                onDelete={() => {
                  actions.remove({ source: editing.table, id: editing.id, title: draft.title })
                  close()
                }}
              />
            )}
          </>
        )
      }
    </FormScene>
  )
}
