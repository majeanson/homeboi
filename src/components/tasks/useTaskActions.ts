import { useQueryClient, type QueryKey } from '@tanstack/react-query'
import { useT } from '../../i18n'
import { useWrite, writeFailed } from '../../lib/write'
import { useCreateWithUndo } from '../../lib/undoCreate'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { mintTmpId } from '../../lib/tmpIds'
import { BOARD_KEY, TASKS_KEY, TODOS_KEY } from '../../lib/queryKeys'
import { canPostpone, clearWrites, postponeWrite, type TaskRef, emptyDraft, removeBody, taskEndpoint, taskKeys, taskScene, taskWrite, tickBody } from '../../lib/taskSave'
import { inputFromLocalDay, todayLocalDay } from '../../lib/localDay'

import { isTicked, type TaskItem } from '../../lib/tasks'
import type { SubjectRef } from '../../lib/subjects'
import type { Todo, TodosData } from '../../lib/todos'

// What a person can DO to a task, in one place, so the board card, the Tâches view and a
// subject's page behave the same and each write still names every surface that shows it.
//
// Done has one meaning per case (functions/_lib/taskItem.ts), so a check has two tiers:
//   · ONE-OFF: a mark in place, like La liste. The row flips at once, stays, and a second
//     tap unticks it. The toggle is its own undo, so it carries no toast.
//   · RECURRING: it moves to its next date, and there is no server « un-do » for that (the
//     rotation has advanced). So it is DEFERRED behind the undo toast, through the shared
//     hook: hidden now, the write held, and Annuler means it never happened.
// A tick sends the moment it was made (`doneAt`), so one held in the offline outbox past
// midnight keeps its real day (`tickedAt`, _lib/ids.ts).

type TaskPatch = Partial<Pick<TaskItem, 'done' | 'doneAt'>>
interface TasksFrame {
  tasks: TaskItem[]
}
interface BoardFrame {
  tasks?: TaskItem[]
}

// Which table a row is in, and how that table spells a tick or a delete, is the save
// adapter's business (lib/taskSave): this hook never asks.
const keysFor = taskKeys
const endpoint = taskEndpoint

export function useTaskActions(scope: QueryKey = BOARD_KEY) {
  const t = useT()
  const qc = useQueryClient()
  const write = useWrite()
  const createWithUndo = useCreateWithUndo()
  const held = useDeferredRemoval(scope)

  // The row may be in up to three caches at once: flip it in each, so nothing disagrees
  // until a refetch lands (and never would, offline).
  function patchEverywhere(id: string, patch: TaskPatch) {
    const onItems = (rows: TaskItem[]) => rows.map((x) => (x.id === id ? { ...x, ...patch } : x))
    qc.setQueriesData<BoardFrame>({ queryKey: BOARD_KEY }, (d) => (d?.tasks ? { ...d, tasks: onItems(d.tasks) } : d))
    qc.setQueriesData<TasksFrame>({ queryKey: TASKS_KEY }, (d) => (d ? { ...d, tasks: onItems(d.tasks) } : d))
    qc.setQueriesData<TodosData>({ queryKey: TODOS_KEY }, (d) => {
      if (!d) return d
      const done_at = patch.doneAt === undefined ? undefined : patch.doneAt
      return {
        ...d,
        todos: d.todos.map((x) =>
          x.id === id && done_at !== undefined ? { ...x, done_at } : x,
        ),
        ...(d.items ? { items: onItems(d.items) } : {}),
      }
    })
  }

  function setTicked(item: TaskItem, on: boolean) {
    const doneAt = on ? Math.floor(Date.now() / 1000) : null
    const optimistic = () => patchEverywhere(item.id, { done: on ? 'ticked' : 'open', doneAt })
    const body = tickBody(item, on, doneAt)
    void write(endpoint(item), { method: 'PATCH', body, affectedKeys: keysFor(item), optimistic }).catch(writeFailed)
  }

  function tick(item: TaskItem) {
    if (!item.recurring) {
      setTicked(item, !isTicked(item))
      return
    }
    const doneAt = Math.floor(Date.now() / 1000)
    held.remove([item.id], t.undo.choreDone(item.title), () =>
      write(endpoint(item), {
        method: 'PATCH',
        body: tickBody(item, true, doneAt),
        affectedKeys: keysFor(item),
      }),
    )
  }

  // « Reporter »: only a table with a snooze column (lib/taskSave, `canPostpone`).
  function postpone(item: TaskItem, mode: 'week' | 'cycle') {
    const w = postponeWrite(item, mode)
    held.remove([item.id], t.undo.postponed(item.title), () => write(w.endpoint, { method: w.method, body: w.body, affectedKeys: w.affectedKeys }))
  }

  // Rename, the look, the effort and « Sur quoi ? » are the one form's (lib/taskSave): a row's
  // peek opens it. This hook keeps only what a row does without opening anything.

  // Delete: a todo mints optimistic tmp- ids, so its DELETE carries what lets the server heal
  // a stale one (lib/staleDelete). Chores and home rows have no tmp row to heal.
  function remove(item: TaskRef) {
    held.remove([item.id], t.todos.removed(item.title), () =>
      write(endpoint(item), {
        method: 'DELETE',
        body: removeBody(item),
        affectedKeys: keysFor(item),
      }),
    )
  }

  // « Vider les cochés »: one gesture, one toast, over up to three tables. A todo goes for
  // good, its old behaviour. A chore or a home row is history, so it only leaves the day
  // (cleared_at, migration 0147). The commit returns the writes and lets them reject: a
  // rejection means the rows did not clear, and the hook shows them again.
  function clearTicked(items: readonly TaskItem[]) {
    const ticked = items.filter(isTicked)
    if (ticked.length === 0) return
    held.remove(
      ticked.map((x) => x.id),
      t.todos.clearedN(ticked.length),
      async () => {
        // One write per table that holds a ticked row; the adapter spells each (lib/taskSave).
        await Promise.all(clearWrites(ticked).map((w) => write(w.endpoint, { method: w.method, body: w.body, affectedKeys: w.affectedKeys })))
        // The hold is scoped to one key, and these rows come from two polls. Wait for the
        // second, or the un-hide could paint a ticked row back out of its older frame.
        await qc.refetchQueries({ queryKey: TODOS_KEY, type: 'active' })
      },
    )
  }

  // One title field: the whole of adding a task. `day` null = un jour. The row appears at once
  // through the todos cache, and a follow-up tick on the tmp row is rewritten when the
  // create replays (E-41).
  async function add(text: string, day: number | null, subject?: SubjectRef | null) {
    const value = text.trim()
    if (!value) return
    const tmpId = mintTmpId()
    const today = todayLocalDay()
    const tmpRow: Todo = { id: tmpId, title: value, day, member_id: null, done_at: null, position: 0, section: null, source_template_id: null }
    const item: TaskItem = {
      key: `todo:${tmpId}`,
      source: 'todo',
      id: tmpId,
      title: value,
      color: null,
      icon: null,
      effort: null,
      subject: subject ?? null,
      kind: null,
      recurring: false,
      recurJson: null,
      day,
      dueToday: day === today,
      overdueSince: null,
      snoozedUntil: null,
      soon: false,
      done: 'open',
      doneAt: null,
      who_id: null,
      team: [],
      onBoard: day === today,
    }
    // Through the save adapter like every create: a title and a day are a to-do (taskTarget).
    const w = taskWrite(emptyDraft({ title: value, date: inputFromLocalDay(day), subject: subject ?? null }))
    await createWithUndo({
      endpoint: w.endpoint,
      body: w.body,
      affectedKeys: w.affectedKeys,
      optimistic: (client) => {
        client.setQueryData<TodosData>(TODOS_KEY, (d) => ({ todos: [...(d?.todos ?? []), tmpRow], items: [...(d?.items ?? []), item] }))
        client.setQueriesData<TasksFrame>({ queryKey: TASKS_KEY }, (d) => (d ? { ...d, tasks: [...d.tasks, item] } : d))
      },
      tmpId,
      message: t.todos.added(value),
    })
  }

  // Every task opens the one form, in its own scene (lib/taskSave knows which).
  const editHref = (item: TaskItem): string => taskScene(item)

  return { canPostpone, tick, postpone, remove, clearTicked, add, editHref, visible: held.visible }
}
