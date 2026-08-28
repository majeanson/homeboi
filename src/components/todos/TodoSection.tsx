import { useState, type ReactNode } from 'react'
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
  splitTodos,
  checkedIds,
  DEPARTURE_ADHOC,
  TODO_TITLE_MAX,
} from '../../lib/todos'
import { Disclosure } from '../Disclosure'
import { CATS } from '../../lib/cats'
import { tintInk, readableInk } from '../../lib/colors'
import { Icon, type IconName } from '../Icon'
import { EditField } from '../EditField'
import { EntityCombobox } from '../EntityCombobox'
import { templateOptions } from './comboOptions'

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
//
// The « Avant de partir » split (mig 0116) parameterizes WHICH rows a surface shows
// and how they sit, so the one machinery serves both concepts without a fork:
// - `show` — 'loose' (« À faire »: no checklist instances), 'checklists' (the
//   departure card / scene: instances only), 'all' (day pages + the Aujourd'hui /
//   Demain agglomerators).
// - `foldSections` — each checklist instance folds under a collapsed Disclosure
//   (title + open count) instead of an always-open header, so a long list stays a
//   glance.
// - `foldAll` — the agglomerator mode (Aujourd'hui / Demain): the loose group ALSO
//   folds under one collapsed « À compléter » Disclosure — everything present,
//   nothing taking the full view.
// - `picker` — 'templates' (combobox add + checklist instantiation), 'plain' (text
//   add only: « À faire », where instantiation no longer belongs), 'none' (the
//   agglomerator glances: adds live on « À faire » and the departure card).
export function TodoSection({
  day,
  title,
  members = [],
  bento = true,
  hideWhenEmpty = false,
  show = 'all',
  foldSections = false,
  foldAll = false,
  picker = 'templates',
  action,
  addAutoFocus,
  onAdded,
  emptyText,
  icon,
  tint,
}: {
  day?: number | null
  title: string
  members?: FaceMember[]
  bento?: boolean
  hideWhenEmpty?: boolean
  show?: 'all' | 'loose' | 'checklists'
  foldSections?: boolean
  foldAll?: boolean
  picker?: 'templates' | 'plain' | 'none'
  /** One quiet control at the heading's trailing edge — the same slot Section /
   *  SecLabel carry, so a caller can put a **SectionAdd** ＋ here and drive
   *  `picker` from its open state instead of leaving an add box permanently open
   *  above the list. « Avant de partir » is the first user. */
  action?: ReactNode
  // The host opens the add field behind its own header ＋ (the board's « À faire »,
  // mirroring the Notes card): focus the box the moment it appears, and tell the host
  // once something was actually written so it can close again.
  addAutoFocus?: boolean
  onAdded?: () => void
  // A surface-specific "nothing here" line (the departure card's « Aucune liste de
  // départ… ») — the generic t.todos.empty otherwise.
  emptyText?: string
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
    enabled: !ro && picker === 'templates',
  })

  const [addText, setAddText] = useState('')
  const [editId, setEditId] = useState<string | null>(null)
  const [editText, setEditText] = useState('')

  // De-fragment into the two concepts (lib/todos splitTodos): every loose item
  // (manual / global / today add) in ONE `loose` run, and each checklist instance
  // (keyed by its source template — or its section title for legacy rows) as its
  // own group, first-seen order. Bucketing across the WHOLE list means a checklist
  // sitting between two batches of loose items can't split them into two "En tout
  // temps" headers. `show` then keeps only this surface's concept — and everything
  // downstream (counts, clear, empty) sees only the shown rows.
  const split = splitTodos(removal.visible(data?.todos ?? []))
  const loose = show === 'checklists' ? [] : split.loose
  const checklistGroups = show === 'loose' ? [] : split.checklists
  const all = [...loose, ...checklistGroups.flatMap((g) => g.todos)]
  const openCount = all.filter((todo) => !isChecked(todo)).length
  const checked = checkedIds(all)
  const faceOf = (id: string | null) => (id ? members.find((m) => m.id === id) : undefined)
  // The board glance (scope null) is the ONE place that mixes standing globals
  // (day null) with today-pinned todos (day = today) — and they render identically,
  // which reads as "the same todo in two places". When BOTH kinds are present, split
  // them into two headed groups ("En tout temps" / "Aujourd'hui") so a today-pinned
  // one (e.g. created from a day's meal plan) reads as its own ephemeral row, not a
  // twin of a global. Homogeneous lists + day pages stay headerless (no noise).
  // (Scoped to the LOOSE set — a day-pinned checklist instance next to standing
  // globals must not force the headers onto a list whose loose rows are homogeneous.)
  // OVERDUE: a loose to-do left on a past day. The server only sends these to the
  // board glance (scope null) — see functions/api/todos.ts — where they used to be
  // invisible forever. They read as their own group ABOVE the rest, the same shape
  // Entretien's carry-forward already uses on the « À faire » card. Calm: a quiet
  // header, no count, no red, and nothing is rewritten — the row keeps its own day.
  const isOverdue = (td: Todo) => td.day != null && td.day < todayLocalDay()
  const overdue = scope === null ? loose.filter(isOverdue) : []
  const current = scope === null ? loose.filter((td) => !isOverdue(td)) : loose
  const showScope =
    scope === null && current.some((td) => td.day == null) && current.some((td) => td.day != null)

  // — add (board glance → global; day page → that day) —
  // A today-pinned add (day page where date === today) is a row the board's
  // Aujourd'hui glance (global ∪ today) ALSO shows, so write it into both that day's
  // cache and the board cache up front — otherwise it only appears on the board after
  // a refetch (and never, offline). A day≠today add belongs only in its day cache; a
  // global add (scope null) already writes TODOS_KEY, since `key` === TODOS_KEY there.
  // `dayFor` defaults to this section's scope; the board glance's « Pour ajd » button
  // passes today explicitly to pin a standing-list card's add to the Aujourd’hui group.
  async function add(text: string, dayFor: number | null = scope) {
    const value = text.trim()
    if (!value) return
    setAddText('')
    const tmpId = `tmp-${Date.now()}-${Math.floor(Math.random() * 1e6).toString(36)}`
    // On a departure surface (show="checklists") a free-typed item is an « Avant de
    // partir » item for the viewed day — FLOORED to today — NOT a loose todo: it
    // carries the ad-hoc sentinel + a shared section so it groups with the day's
    // checklists (stays visible here instead of vanishing as a filtered-out loose
    // row), counts on the departure mini, folds into the Aujourd'hui glance, and is
    // swept once its day passes. A loose add on any other surface is unchanged.
    const asDeparture = show === 'checklists'
    const pinnedDay = asDeparture ? Math.max(dayFor ?? todayLocalDay(), todayLocalDay()) : dayFor
    const tmpRow: Todo = {
      id: tmpId,
      title: value,
      day: pinnedDay,
      member_id: null,
      done_at: null,
      position: 0,
      section: asDeparture ? t.departure.adhocSection : null,
      source_template_id: asDeparture ? DEPARTURE_ADHOC : null,
    }
    const insert = (d: TodosData | undefined): TodosData => (d ? { todos: [...d.todos, tmpRow] } : { todos: [tmpRow] })
    await createWithUndo({
      endpoint: 'todos',
      body: asDeparture
        ? { title: value, departure: true, section: t.departure.adhocSection, day: pinnedDay }
        : { title: value, day: dayFor },
      affectedKeys: [TODOS_KEY, MONTH_KEY],
      optimistic: (qc) => {
        qc.setQueryData<TodosData>(key, insert)
        // On a day page (key ≠ TODOS_KEY) a today-pinned add also belongs on the
        // board glance up front. On the board glance itself `key` IS TODOS_KEY, so
        // the write above already covers it — don't double-insert.
        if (scope != null && pinnedDay === todayLocalDay()) qc.setQueryData<TodosData>(TODOS_KEY, insert)
      },
      // E-41: a queued follow-up (toggle done) on the tmp row gets rewritten to the
      // real id when this create replays.
      tmpId,
      message: t.todos.added(value),
    })
    onAdded?.()
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
    // tint). "Who" reads from the TITLE tint alone — no spine, no avatar disc: the
    // row spends its width on the text (compact-rows pass). Member colours are kept
    // distinct from the household fallbacks via nextFreeColour (lib/colors), so the
    // tint stays a reliable signal. When the row is checked we FILL the check disc
    // with it (so a done todo reads as "who did it") and draw the tick in white or
    // black — whichever contrasts — so it never blends into its own fill.
    const rowColour = faceOf(todo.member_id)?.colour ?? CATS.chore.color
    const checkedStyle = { background: rowColour, borderColor: rowColour, color: readableInk(rowColour) }
    return editId === todo.id ? (
      <EditField
        key={todo.id}
        value={editText}
        onChange={setEditText}
        onSubmit={(v) => rename(todo, v)}
        onCancel={() => setEditId(null)}
        // Delete lives HERE now (the row keeps no always-on trash): tap the name to
        // open this edit state, and the trash sits beside Save/Cancel.
        onDelete={() => {
          setEditId(null)
          remove(todo)
        }}
        deleteLabel={`${t.common.delete} — ${todo.title}`}
        autoFocus
        ariaLabel={t.common.edit}
        // The server slices the title — warn here rather than let a long rename
        // come back quietly shortened (the cap is generous; see lib/todos.ts).
        limit={TODO_TITLE_MAX}
      />
    ) : (
      <div key={todo.id} className={'act todo-row' + (isChecked(todo) ? ' done' : '')}>
        {!ro ? (
          <button
            type="button"
            className="check todo-row__check"
            onClick={() => toggle(todo)}
            aria-pressed={isChecked(todo)}
            aria-label={`${isChecked(todo) ? t.todos.uncheck : t.todos.check} — ${todo.title}`}
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
          // « Modifier » alone was every row's whole name — this button's only
          // content is the title, so naming the pair is what makes the row
          // identifiable (see the check above).
          aria-label={ro ? undefined : `${t.common.edit} — ${todo.title}`}
        >
          <span
            className="title"
            style={isChecked(todo) ? undefined : { color: tintInk(rowColour) }}
            title={faceOf(todo.member_id)?.display_name}
          >
            {todo.title}
          </span>
        </button>
        {/* The tint IS the "who" on screen — but colour alone says nothing to a
            screen reader, and the span's `title` is shadowed by the button's
            aria-label. This carries the name into the accessible tree without
            renaming any control. */}
        {faceOf(todo.member_id) && <span className="sr-only">{faceOf(todo.member_id)!.display_name}</span>}
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
        {action ? <span className="sec-label__act">{action}</span> : null}
      </div>

      {all.length === 0 && !ro ? (
        <EmptyState tone="calm">{emptyText ?? t.todos.empty}</EmptyState>
      ) : (
        <div className="todo-rows">
          {/* Loose items first. The board glance is the ONE place that mixes standing
              globals with today-pinned todos; when both are present, split them into
              two headed groups ("En tout temps" / "Aujourd'hui") rather than tagging
              each row (a per-row pill ate a phone row's width). Homogeneous lists +
              day pages stay headerless. Each batch is the WHOLE loose set, so there's
              exactly one header per scope — never a duplicate. In `foldAll` (the
              Aujourd'hui / Demain agglomerators) the whole loose set collapses under
              one « À compléter » Disclosure so it never takes the full view. */}
          {/* What's owed, first — a thing you meant to do on a day that has passed.
              Outside the fold, and above the rest, because it is the one part of this
              card that would otherwise be lost. */}
          {overdue.length > 0 && (
            <div className="todo-group todo-group--overdue">
              <div className="todo-grouphead">{t.todos.scopeOverdue}</div>
              {overdue.map(renderRow)}
            </div>
          )}
          {current.length > 0 &&
            (foldAll ? (
              <Disclosure
                label={t.todos.title}
                count={current.filter((td) => !isChecked(td)).length}
                className="todo-fold"
              >
                <div className="todo-group">{current.map(renderRow)}</div>
              </Disclosure>
            ) : showScope ? (
              <>
                {current.some((td) => td.day == null) && (
                  <div className="todo-group">
                    <div className="todo-grouphead">{t.todos.scopeGlobal}</div>
                    {current.filter((td) => td.day == null).map(renderRow)}
                  </div>
                )}
                {current.some((td) => td.day != null) && (
                  <div className="todo-group">
                    <div className="todo-grouphead">{t.todos.scopeToday}</div>
                    {current.filter((td) => td.day != null).map(renderRow)}
                  </div>
                )}
              </>
            ) : (
              <div className="todo-group">{current.map(renderRow)}</div>
            ))}
          {/* Then the checklist instances (« Avant de partir », « Sac de soccer »…),
              one group per instantiated template. `foldSections` collapses each under
              its own Disclosure (title + open count — the departure card and the
              agglomerators); otherwise an always-visible header (the read surfaces
              that want every todo listed at once). */}
          {checklistGroups.map((g) =>
            foldSections ? (
              <Disclosure
                key={g.key}
                label={g.section ?? t.todos.title}
                count={g.todos.filter((td) => !isChecked(td)).length}
                className="todo-fold"
              >
                <div className="todo-group">{g.todos.map(renderRow)}</div>
              </Disclosure>
            ) : (
              <div key={g.key} className="todo-group">
                <div className="todo-grouphead">{g.section ?? t.todos.title}</div>
                {g.todos.map(renderRow)}
              </div>
            ),
          )}
        </div>
      )}

      {!ro && picker !== 'none' && (
        <EntityCombobox<TodoTemplate>
          value={addText}
          onChange={setAddText}
          // 'plain' (« À faire ») = text add only: instantiation lives on the
          // departure card / scene now, so no template options are offered here.
          options={picker === 'templates' ? templateOptions(templates, t) : []}
          onSubmit={(v) => add(v)}
          onPick={(opt) => {
            setAddText('')
            void instantiate(opt.data.id)
          }}
          submitLabel={t.common.add}
          submitLeadingIcon="plus-bold"
          autoFocus={addAutoFocus}
          // Board glance only (scope null = global ∪ today): a second button pins the
          // add to today instead of « en tout temps », straight from this standing card.
          // Full label « Pour aujourd’hui » when the card is wide enough; a CSS container
          // query (todos.css) swaps to the short « Pour ajd » on a narrow card.
          // NOT on the checklists surface (the departure card): everything there is for
          // today by definition, so the global-vs-today choice is redundant noise.
          {...(scope === null && show !== 'checklists'
            ? {
                secondaryLabel: (
                  <>
                    <span className="todo-addtoday__full">{t.todos.addToday}</span>
                    <span className="todo-addtoday__short">{t.todos.addTodayShort}</span>
                  </>
                ),
                onSecondary: (v: string) => void add(v, todayLocalDay()),
              }
            : {})}
          placeholder={t.todos.addPlaceholder}
          ariaLabel={t.todos.addPlaceholder}
          limit={TODO_TITLE_MAX}
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
