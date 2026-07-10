import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { EmptyState } from '../EmptyState'
import { api } from '../../lib/api'
import { useWrite } from '../../lib/write'
import { useT } from '../../i18n'
import { live } from '../../lib/query'
import { isGuest } from '../../lib/device'
import { useCreateWithUndo } from '../../lib/undoCreate'
import { useDeferredRemoval } from '../../lib/useDeferredRemoval'
import { TODOS_KEY, TODO_TEMPLATES_KEY, MONTH_KEY } from '../../lib/queryKeys'
import { todayLocalDay } from '../../lib/localDay'
import {
  type Todo,
  type TodoTemplate,
  type TodosData,
  type TemplatesData,
  todosKey,
  todosPath,
  isChecked,
  checkedIds,
} from '../../lib/todos'
import { CATS } from '../../lib/cats'
import { tintInk, readableInk } from '../../lib/colors'
import { Icon, type IconName } from '../Icon'
import { EditField } from '../EditField'
import { EntityCombobox } from '../EntityCombobox'
import { templateOptions } from './comboOptions'
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
// day page passes false for the plainer sectioned look. `hideWhenEmpty` renders
// nothing at all when there are no todos in scope — used where the section is
// embedded inside another card (the board's Demain glance) and an empty add-frame
// would just be clutter.
export function TodoSection({
  day,
  title,
  members = [],
  bento = true,
  hideWhenEmpty = false,
  icon,
  tint,
}: {
  day?: number | null
  title: string
  members?: FaceMember[]
  bento?: boolean
  hideWhenEmpty?: boolean
  // Subtle Pip identity (a coloured header glyph + a barely-there card wash), to match
  // the board's other tinted sections (Section / SubHead in board/Act).
  icon?: IconName
  tint?: string
}) {
  const t = useT()
  const write = useWrite()
  const createWithUndo = useCreateWithUndo()
  const ro = isGuest()
  const scope = day ?? null

  const key = todosKey(scope)
  const { data } = useQuery({ queryKey: key, queryFn: () => api<TodosData>(todosPath(scope)), ...live })
  // Bulletproof calm-delete (the shared hook): hide cleared/deleted rows + filter
  // them out and await a refetch before un-hiding so the live poll can't flash a
  // just-removed row back.
  const removal = useDeferredRemoval(key)
  const templatesQ = useQuery({
    queryKey: TODO_TEMPLATES_KEY,
    queryFn: () => api<TemplatesData>('todo-templates'),
    ...live,
    enabled: !ro,
  })

  const [addText, setAddText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  const all = removal.visible(data?.todos ?? [])
  // De-fragment into buckets: every loose item (manual / global / today add) in
  // ONE `loose` run, and each named section (a composed checklist instantiates "as
  // a list with sections") merged by title into `sectionGroups`. We bucket across
  // the WHOLE list rather than per contiguous run so a named section sitting
  // between two batches of loose items can't split them into two "En tout temps"
  // headers (or the same section into two headers). Section order = first-seen.
  const loose: Todo[] = []
  const sectionMap = new Map<string, Todo[]>()
  for (const td of all) {
    if (td.section == null) loose.push(td)
    else {
      const arr = sectionMap.get(td.section)
      if (arr) arr.push(td)
      else sectionMap.set(td.section, [td])
    }
  }
  const sectionGroups = [...sectionMap.entries()]
  const openCount = all.filter((todo) => !isChecked(todo)).length
  const checked = checkedIds(all)
  const faceOf = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined)
  // The board glance (scope null) is the ONE place that mixes standing globals
  // (day null) with today-pinned todos (day = today) — and they render identically,
  // which reads as "the same todo in two places". When BOTH kinds are present, split
  // them into two headed groups ("En tout temps" / "Aujourd'hui") so a today-pinned
  // one (e.g. created from a day's meal plan) reads as its own ephemeral row, not a
  // twin of a global. Homogeneous lists + day pages stay headerless (no noise).
  const showScope = scope === null && all.some((td) => td.day == null) && all.some((td) => td.day != null)

  // — add (board glance → global; day page → that day) —
  // A today-pinned add (day page where date === today) is a row the board's
  // Aujourd'hui glance (global ∪ today) ALSO shows, so write it into both that day's
  // cache and the board cache up front — otherwise it only appears on the board after
  // a refetch (and never, offline). A day≠today add belongs only in its day cache; a
  // global add (scope null) already writes TODOS_KEY, since `key` === TODOS_KEY there.
  async function add(text: string) {
    const value = text.trim()
    if (!value) return
    setAddText('')
    const tmpId = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`
    const tmpRow: Todo = { id: tmpId, title: value, day: scope, member_id: null, done_at: null, position: 0, section: null }
    const insert = (d: TodosData | undefined): TodosData => (d ? { todos: [...d.todos, tmpRow] } : { todos: [tmpRow] })
    await createWithUndo({
      endpoint: 'todos',
      body: { title: value, day: scope },
      affectedKeys: [TODOS_KEY, MONTH_KEY],
      optimistic: (qc) => {
        qc.setQueryData<TodosData>(key, insert)
        if (scope != null && scope === todayLocalDay()) qc.setQueryData<TodosData>(TODOS_KEY, insert)
      },
      // E-41: a queued follow-up (toggle done) on the tmp row gets rewritten to the
      // real id when this create replays.
      tmpId,
      message: t.todos.added(value),
    })
  }

  // — toggle done (a MARK in place; optimistic flip, then resync) —
  // A today-pinned todo is the SAME row on the day page (cache ['todos', day]) AND
  // the board's Aujourd'hui glance (cache ['todos'], which loads global + today). So
  // flip the row in EVERY todo scope it appears in via setQueriesData — otherwise
  // checking it on one surface leaves the other showing it unchecked until a refetch
  // lands (and never, while offline, since the server change is only queued). The
  // updater is a no-op on caches that don't hold this id, so cross-scope is safe.
  function toggle(todo: Todo) {
    const next = todo.done_at == null ? Math.floor(Date.now() / 1000) : null
    void write('todos', {
      method: 'PATCH',
      body: { id: todo.id, done: next != null },
      affectedKeys: [TODOS_KEY, MONTH_KEY],
      optimistic: (qc) =>
        qc.setQueriesData<TodosData>({ queryKey: TODOS_KEY }, (d) =>
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
      affectedKeys: [TODOS_KEY, MONTH_KEY],
      // Same cross-scope reasoning as toggle: rename the row in every todo cache it
      // appears in (board glance + any open day cache) so both surfaces agree at once.
      optimistic: (qc) =>
        qc.setQueriesData<TodosData>({ queryKey: TODOS_KEY }, (d) =>
          d ? { todos: d.todos.map((x) => (x.id === todo.id ? { ...x, title: value } : x)) } : d,
        ),
    }).catch(() => {})
    setEditId(null)
  }

  // — delete one (behind a deferred undo — a mis-tap costs nothing) —
  function remove(todo: Todo) {
    removal.remove([todo.id], t.todos.removed(todo.title), () =>
      write('todos', { method: 'DELETE', body: { id: todo.id }, affectedKeys: [TODOS_KEY, MONTH_KEY] }).catch(() => {}),
    )
  }

  // — "Effacer cochées" — sweep the ticked rows (deferred; pass exact ids) —
  function clearChecked(ids: string[]) {
    removal.remove(ids, t.todos.clearedN(ids.length), () =>
      write('todos', { method: 'PATCH', body: { clearChecked: true, ids }, affectedKeys: [TODOS_KEY, MONTH_KEY] }).catch(() => {}),
    )
  }

  // — instantiate a template → a batch of real todos in this scope. Purely
  // additive + immediately visible (and each row is individually deletable), so no
  // undo toast — the POST returns a count, not the new ids, to selectively reverse.
  async function instantiate(templateId: string) {
    await write('todos', {
      method: 'POST',
      body: { templateId, day: scope },
      affectedKeys: [TODOS_KEY, MONTH_KEY],
    }).catch(() => {})
  }

  const templates = templatesQ.data?.templates ?? []
  // Nothing yet + read-only (guest) → render nothing rather than an empty frame.
  if (ro && all.length === 0) return null
  // Embedded glance (Demain) with nothing in scope → render nothing, not an empty
  // add-frame.
  if (hideWhenEmpty && all.length === 0) return null

  // One check-off row. Extracted so it renders identically whether it sits loose or
  // inside a collapsed section Disclosure.
  const renderRow = (todo: Todo) => {
    // The row's colour = the assigned member's face colour (falls back to the chore
    // tint). It already tints the spine + the "by" avatar; when the row is checked we
    // FILL the check disc with it (so a done todo reads as "who did it" instead of a
    // generic green that clashes with the spine) and draw the tick in white or black —
    // whichever contrasts — so it never blends into its own fill.
    const rowColour = faceOf(todo.member_id)?.colour ?? CATS.chore.color
    const checkedStyle = { background: rowColour, borderColor: rowColour, color: readableInk(rowColour) }
    return editId === todo.id ? (
      <EditField
        key={todo.id}
        value={editText}
        onChange={setEditText}
        onSubmit={(v) => rename(todo, v)}
        onCancel={() => setEditId(null)}
        autoFocus
        ariaLabel={t.common.edit}
      />
    ) : (
      <div key={todo.id} className={'act todo-row' + (isChecked(todo) ? ' done' : '')}>
        <span className="spine" style={{ background: rowColour }} aria-hidden="true" />
        {!ro ? (
          <button
            type="button"
            className="check todo-row__check"
            onClick={() => toggle(todo)}
            aria-pressed={isChecked(todo)}
            aria-label={isChecked(todo) ? t.todos.uncheck : t.todos.check}
            style={isChecked(todo) ? checkedStyle : undefined}
          >
            <Icon name="check-bold" size={18} />
          </button>
        ) : (
          // Read-only guest: a static state marker (check only when done).
          <span className="todo-row__check" aria-hidden="true" style={isChecked(todo) ? { color: rowColour } : undefined}>
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
          aria-label={ro ? undefined : t.common.edit}
        >
          <span className="title" style={isChecked(todo) ? undefined : { color: tintInk(rowColour) }}>
            {todo.title}
          </span>
        </button>
        {faceOf(todo.member_id) && (
          <span
            className="todo-row__by"
            style={{ background: rowColour }}
            title={faceOf(todo.member_id)!.display_name}
            aria-label={faceOf(todo.member_id)!.display_name}
          >
            {(faceOf(todo.member_id)!.display_name[0] ?? '?').toUpperCase()}
          </span>
        )}
        <RowActions onDelete={() => remove(todo)} deleteLabel={`${t.common.delete} — ${todo.title}`} />
      </div>
    )
  }

  return (
    <section
      className={'todo-sec' + (bento ? ' bento' : '') + (bento && tint ? ' bento--tinted' : '')}
      style={tint ? ({ '--sec-tint': tint } as React.CSSProperties) : undefined}
    >
      <div className="sec-label">
        {icon && (
          <span className="sec-label__ico" aria-hidden="true">
            <Icon name={icon} size={16} />
          </span>
        )}
        <b>{title}</b>
        <span className="ln" />
        {openCount ? <span className="ct">{openCount}</span> : null}
      </div>

      {all.length === 0 && !ro ? (
        <EmptyState tone="calm">{t.todos.empty}</EmptyState>
      ) : (
        <div className="todo-rows">
          {/* Loose items first. The board glance is the ONE place that mixes standing
              globals with today-pinned todos; when both are present, split them into
              two headed groups ("En tout temps" / "Aujourd'hui") rather than tagging
              each row (a per-row pill ate a phone row's width). Homogeneous lists +
              day pages stay headerless. Each batch is the WHOLE loose set, so there's
              exactly one header per scope — never a duplicate. */}
          {loose.length > 0 &&
            (showScope
              ? (
                  <>
                    {loose.some((td) => td.day == null) && (
                      <div className="todo-group">
                        <div className="todo-grouphead">{t.todos.scopeGlobal}</div>
                        {loose.filter((td) => td.day == null).map(renderRow)}
                      </div>
                    )}
                    {loose.some((td) => td.day != null) && (
                      <div className="todo-group">
                        <div className="todo-grouphead">{t.todos.scopeToday}</div>
                        {loose.filter((td) => td.day != null).map(renderRow)}
                      </div>
                    )}
                  </>
                )
              : (
                  <div className="todo-group">{loose.map(renderRow)}</div>
                ))}
          {/* Then the named-section checklists (e.g. "Avant de partir"), each under
              its own always-visible header — NOT a collapse. On the read surface we
              want every todo listed at once; the expand/collapse belongs to the
              Réglages template editor (configuring). */}
          {sectionGroups.map(([section, rows]) => (
            <div key={`sec-${section}`} className="todo-group">
              <div className="todo-grouphead">{section}</div>
              {rows.map(renderRow)}
            </div>
          ))}
        </div>
      )}

      {!ro && (
        <EntityCombobox<TodoTemplate>
          value={addText}
          onChange={setAddText}
          options={templateOptions(templates, t)}
          onSubmit={(v) => add(v)}
          onPick={(opt) => {
            setAddText('')
            void instantiate(opt.data.id)
          }}
          submitLabel={t.common.add}
          submitLeadingIcon="plus-bold"
          placeholder={t.todos.addPlaceholder}
          ariaLabel={t.todos.addPlaceholder}
        />
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
