import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { live } from '../../lib/query'
import { isGuest } from '../../lib/device'
import { useUndoToast, useRecordUndo } from '../../lib/toast'
import { TODOS_KEY, TODO_TEMPLATES_KEY } from '../../lib/queryKeys'
import {
  type Todo,
  type TodosData,
  type TemplatesData,
  todosKey,
  todosPath,
  groupBySection,
  isChecked,
  checkedIds,
} from '../../lib/todos'
import { CATS } from '../../lib/cats'
import { tintInk } from '../../lib/colors'
import { Icon } from '../Icon'
import { EditField } from '../EditField'
import { RowActions } from '../RowActions'

interface FaceMember {
  id: string
  display_name: string
  colour?: string
}

// À cocher — a calm check-off list (todos), drop-in for the board glance (global +
// today) and the day page (one day). Check is a MARK in place (struck, stays put);
// "Effacer cochées" removes the ticked rows — same model as La liste, no done-shelf.
// Departure checklists (templates) instantiate here as a one-tap batch. Every write
// goes through useWrite (offline-safe) and is deferred/compensated for a calm undo.
//
// `day` undefined/null = the board glance (adds a GLOBAL/standing todo). A number =
// that calendar day (adds a per-day todo). `bento` wraps it as a board card; the
// day page passes false for the plainer sectioned look.
export function TodoSection({
  day,
  title,
  members = [],
  bento = true,
}: {
  day?: number | null
  title: string
  members?: FaceMember[]
  bento?: boolean
}) {
  const t = useT()
  const write = useWrite()
  const undo = useUndoToast()
  const recordUndo = useRecordUndo()
  const ro = isGuest()
  const scope = day ?? null

  const key = todosKey(scope)
  const { data } = useQuery({ queryKey: key, queryFn: () => api<TodosData>(todosPath(scope)), ...live })
  const templatesQ = useQuery({
    queryKey: TODO_TEMPLATES_KEY,
    queryFn: () => api<TemplatesData>('todo-templates'),
    ...live,
    enabled: !ro,
  })

  // Items whose clear/delete is DEFERRED behind the undo toast — filtered out now so
  // the live poll can't resurrect them before the write commits (Liste's pattern).
  const [pending, setPending] = useState<Set<string>>(new Set())
  const [addText, setAddText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const all = (data?.todos ?? []).filter((todo) => !pending.has(todo.id))
  // Grouped into sections (a composed list instantiates "as a list with sections");
  // a plain list / manual adds are one headless run.
  const groups = groupBySection(all)
  const openCount = all.filter((todo) => !isChecked(todo)).length
  const checked = checkedIds(all)
  const faceOf = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined)

  // — add (board glance → global; day page → that day) —
  async function add(text: string) {
    const value = text.trim()
    if (!value) return
    setAddText('')
    const tmpId = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const res = await write<{ id: string }>('todos', {
      method: 'POST',
      body: { title: value, day: scope },
      affectedKeys: [TODOS_KEY],
      optimistic: (qc) =>
        qc.setQueryData<TodosData>(key, (d) =>
          d
            ? { todos: [...d.todos, { id: tmpId, title: value, day: scope, member_id: null, done_at: null, position: 0, section: null }] }
            : { todos: [{ id: tmpId, title: value, day: scope, member_id: null, done_at: null, position: 0, section: null }] },
        ),
    }).catch(() => null)
    const id = res && !res.queued ? res.data?.id : undefined
    if (id)
      recordUndo({
        message: t.todos.added(value),
        onUndo: () => void write('todos', { method: 'DELETE', body: { id }, affectedKeys: [TODOS_KEY] }).catch(() => {}),
      })
  }

  // — toggle done (a MARK in place; optimistic flip, then resync) —
  function toggle(todo: Todo) {
    const next = todo.done_at == null ? Math.floor(Date.now() / 1000) : null
    void write('todos', {
      method: 'PATCH',
      body: { id: todo.id, done: next != null },
      affectedKeys: [TODOS_KEY],
      optimistic: (qc) =>
        qc.setQueryData<TodosData>(key, (d) =>
          d ? { todos: d.todos.map((x) => (x.id === todo.id ? { ...x, done_at: next } : x)) } : d,
        ),
    }).catch(() => {})
  }

  // — rename in place —
  async function rename(todo: Todo, text: string) {
    const value = text.trim()
    if (!value || value === todo.title) {
      setEditId(null)
      return
    }
    await write('todos', {
      method: 'PATCH',
      body: { id: todo.id, title: value },
      affectedKeys: [TODOS_KEY],
      optimistic: (qc) =>
        qc.setQueryData<TodosData>(key, (d) =>
          d ? { todos: d.todos.map((x) => (x.id === todo.id ? { ...x, title: value } : x)) } : d,
        ),
    }).catch(() => {})
    setEditId(null)
  }

  // — delete one (behind a deferred undo — a mis-tap costs nothing) —
  function remove(todo: Todo) {
    setPending((s) => new Set(s).add(todo.id))
    undo({
      message: t.todos.removed(todo.title),
      onUndo: () =>
        setPending((s) => {
          const n = new Set(s)
          n.delete(todo.id)
          return n
        }),
      onCommit: async () => {
        await write('todos', { method: 'DELETE', body: { id: todo.id }, affectedKeys: [TODOS_KEY] }).catch(() => {})
        setPending((s) => {
          const n = new Set(s)
          n.delete(todo.id)
          return n
        })
      },
    })
  }

  // — "Effacer cochées" — sweep the ticked rows (deferred; pass exact ids) —
  function clearChecked(ids: string[]) {
    if (ids.length === 0) return
    setPending((s) => new Set([...s, ...ids]))
    undo({
      message: t.todos.clearedN(ids.length),
      onUndo: () =>
        setPending((s) => {
          const n = new Set(s)
          ids.forEach((i) => n.delete(i))
          return n
        }),
      onCommit: async () => {
        await write('todos', { method: 'PATCH', body: { clearChecked: true, ids }, affectedKeys: [TODOS_KEY] }).catch(
          () => {},
        )
        setPending((s) => {
          const n = new Set(s)
          ids.forEach((i) => n.delete(i))
          return n
        })
      },
    })
  }

  // — instantiate a template → a batch of real todos in this scope. Purely
  // additive + immediately visible (and each row is individually deletable), so no
  // undo toast — the POST returns a count, not the new ids, to selectively reverse.
  async function instantiate(templateId: string) {
    await write('todos', {
      method: 'POST',
      body: { templateId, day: scope },
      affectedKeys: [TODOS_KEY],
    }).catch(() => {})
  }

  const templates = templatesQ.data?.templates ?? []
  // Nothing yet + read-only (guest) → render nothing rather than an empty frame.
  if (ro && all.length === 0) return null

  return (
    <section className={'todo-sec' + (bento ? ' bento' : '')}>
      <div className="sec-label">
        <b>{title}</b>
        <span className="ln" />
        {openCount ? <span className="ct">{openCount}</span> : null}
      </div>

      {all.length === 0 && !ro ? (
        <p className="feed-empty feed-empty--calm">{t.todos.empty}</p>
      ) : (
        <div className="todo-rows">
          {groups.map((g, gi) => (
            <div key={gi} className="todo-group">
              {g.section && <div className="todo-section-head mono">{g.section}</div>}
              {g.todos.map((todo) =>
            editId === todo.id ? (
              <EditField
                key={todo.id}
                value={editText}
                onChange={setEditText}
                onSubmit={(v) => rename(todo, v)}
                onCancel={() => setEditId(null)}
                autoFocus
                ariaLabel={t.todos.edit}
              />
            ) : (
              <div key={todo.id} className={'act todo-row' + (isChecked(todo) ? ' done' : '')}>
                <span className="spine" style={{ background: faceOf(todo.member_id)?.colour ?? CATS.chore.color }} aria-hidden="true" />
                {!ro ? (
                  <button
                    type="button"
                    className="check todo-row__check"
                    onClick={() => toggle(todo)}
                    aria-pressed={isChecked(todo)}
                    aria-label={isChecked(todo) ? t.todos.uncheck : t.todos.check}
                  >
                    <Icon name="check-bold" size={18} />
                  </button>
                ) : (
                  // Read-only guest: a static state marker (check only when done).
                  <span className="todo-row__check" aria-hidden="true">
                    {isChecked(todo) ? <Icon name="check-bold" size={16} /> : null}
                  </span>
                )}
                <button
                  type="button"
                  className="todo-row__name act__text"
                  onClick={ro ? undefined : () => {
                    setEditId(todo.id)
                    setEditText(todo.title)
                  }}
                  disabled={ro}
                  aria-label={ro ? undefined : t.todos.edit}
                >
                  <span className="title" style={isChecked(todo) ? undefined : { color: tintInk(faceOf(todo.member_id)?.colour ?? CATS.chore.color) }}>
                    {todo.title}
                  </span>
                </button>
                {faceOf(todo.member_id) && (
                  <span
                    className="todo-row__by"
                    style={{ background: faceOf(todo.member_id)!.colour ?? 'var(--ink-faint)' }}
                    title={faceOf(todo.member_id)!.display_name}
                    aria-label={faceOf(todo.member_id)!.display_name}
                  >
                    {(faceOf(todo.member_id)!.display_name[0] ?? '?').toUpperCase()}
                  </span>
                )}
                <RowActions onDelete={() => remove(todo)} deleteLabel={`${t.common.delete} — ${todo.title}`} />
              </div>
            ),
              )}
            </div>
          ))}
        </div>
      )}

      {!ro && (
        <EditField
          value={addText}
          onChange={setAddText}
          onSubmit={(v) => add(v)}
          submitLabel={t.capture.add}
          submitLeadingIcon="plus-bold"
          placeholder={t.todos.addPlaceholder}
          ariaLabel={t.todos.addPlaceholder}
        />
      )}

      {/* Departure checklists — one tap drops the whole list in as todos. */}
      {!ro && templates.length > 0 && (
        <div className="todo-templates mono">
          <span className="todo-templates__label">{t.todos.templatesLabel}</span>
          {templates.map((tpl) => (
            <button key={tpl.id} type="button" className="chip todo-templates__chip" onClick={() => instantiate(tpl.id)}>
              <Icon name="plus-bold" size={13} /> {tpl.title}
            </button>
          ))}
        </div>
      )}

      {!ro && checked.length > 0 && (
        <div className="todo-clear">
          <button type="button" className="btn btn--sm" onClick={() => clearChecked(checked)}>
            <Icon name="check-bold" size={15} /> {t.todos.clearChecked} ({checked.length})
          </button>
        </div>
      )}
    </section>
  )
}
