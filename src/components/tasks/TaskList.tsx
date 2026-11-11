import { useState } from 'react'
import { useLang, useT } from '../../i18n'
import { Act } from '../board/Act'
import { EmptyState } from '../EmptyState'
import { EntityCombobox } from '../EntityCombobox'
import { Icon } from '../Icon'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildChore } from '../detail/adapters'
import { isGuest } from '../../lib/device'
import { formatDayMaybeYear } from '../../lib/format'
import { todayLocalDay } from '../../lib/localDay'
import { useProfile } from '../../lib/profile'
import { lookOf, subjectOf, type SubjectLookup, type SubjectRef } from '../../lib/subjects'
import { EffortMark } from '../EffortDots'
import { isTicked, rotates, type TaskItem } from '../../lib/tasks'
import { TODO_TITLE_MAX } from '../../lib/todos'
import { type Member } from '../board/types'
import { type useTaskActions } from './useTaskActions'

type Actions = ReturnType<typeof useTaskActions>

// ONE ROW FOR A TASK, on the board, in the Tâches view and on a subject's page: the shared Act,
// with one-tap done. The look leads (the task's own icon, else its subject's: `lookOf`) and
// the title tint says who (the compact-rows rule: no spine, no avatar, no furniture). A rotation is the one thing that keeps a line
// under the title, because whose turn it is cannot be read from a colour alone.
export function TaskRow({
  item,
  members,
  lookup,
  actions,
  dated = false,
}: {
  item: TaskItem
  members: readonly Member[]
  lookup: SubjectLookup
  actions: Actions
  /** Say the date on the row: a list spanning days needs it, the board's today does not. */
  dated?: boolean | undefined
}) {
  const t = useT()
  const { lang } = useLang()
  const ro = isGuest()
  const detail = useEntityDetail()
  const { memberId } = useProfile()

  const subject = subjectOf(item.subject, lookup)
  const look = lookOf(item, subject)
  const who = members.find((m) => m.id === item.who_id)
  const owedSince = item.overdueSince
  const owed = owedSince != null
  const ticked = isTicked(item)
  // « En attente depuis … » is a DETAIL on the board's card (the owner, 2026-11-10): the owed row
  // already leads the card, and its peek says since when (adapters `buildChore`, `overdue`). A
  // list spanning days (`dated`) still says it on the row, where the date is the point.
  const when = owed
    ? dated
      ? t.board.lateSince(formatDayMaybeYear(owedSince, lang))
      : undefined
    : dated && item.day != null && !item.dueToday
      ? formatDayMaybeYear(item.day, lang)
      : undefined
  // A recurring task can only be checked when it is due: checking one early would advance the
  // rotation for a turn that has not come. A one-off can be done whenever it gets done.
  const checkable = !ro && (!item.recurring || item.dueToday || owed)

  const peek = () =>
    detail.open(
      buildChore(
        {
          id: item.id,
          title: item.title,
          color: look.colour,
          at: item.overdueSince ?? item.day ?? todayLocalDay(),
          who: who?.display_name ?? null,
          who_id: item.who_id,
          team: item.team,
          recurring: item.recurring,
        },
        { t, lang, members: [...members] },
        {
          upcoming: !item.dueToday && !owed && item.day != null,
          overdue: owed,
          onDone: checkable && !ticked ? () => actions.tick(item) : undefined,
          // « Reporter » where the row's table has a snooze (lib/taskSave), never by naming it.
          onPostponeWeek: checkable && !ticked && actions.canPostpone(item) ? () => actions.postpone(item, 'week') : undefined,
          onPostponeCycle: checkable && item.recurring && actions.canPostpone(item) ? () => actions.postpone(item, 'cycle') : undefined,
          editHref: ro ? undefined : actions.editHref(item),
          onDelete: ro ? undefined : () => actions.remove(item),
          subject: subject.ref && subject.to ? { label: subject.name ?? t.tasks.subjectKinds[subject.ref.kind], to: subject.to, icon: subject.icon ?? 'book-open-bold' } : undefined,
        },
      ),
    )

  return (
    <div data-item={item.id} data-task={item.source}>
      <Act
        cat="chore"
        title={item.title}
        when={when}
        emoji={look.emoji ?? undefined}
        icon={look.icon ?? undefined}
        color={who?.colour ?? look.colour ?? undefined}
        who={rotates(item) ? who?.display_name : undefined}
        mine={!!memberId && item.who_id === memberId}
        soon={item.soon}
        // The effort, small and read-only, only when it was said (EffortMark renders nothing
        // otherwise, so the badge slot stays empty rather than holding a blank span).
        badge={item.effort != null ? <EffortMark value={item.effort} /> : undefined}
        done={ticked}
        onCheck={checkable ? () => actions.tick(item) : undefined}
        // Every task opens the same peek, and its « Modifier » the one form (phase 4).
        onOpen={peek}
        // The tint IS the "who" on screen, and colour says nothing to a screen reader.
        srWho={who && !rotates(item) ? who.display_name : undefined}
      />
    </div>
  )
}

// The rows, and the one bulk gesture. `emptyText` null renders nothing when there is nothing.
export function TaskList({
  items,
  members,
  lookup,
  actions,
  dated,
  emptyText,
}: {
  items: readonly TaskItem[]
  members: readonly Member[]
  lookup: SubjectLookup
  actions: Actions
  dated?: boolean | undefined
  emptyText?: string | null | undefined
}) {
  const t = useT()
  const ro = isGuest()
  const ticked = items.filter(isTicked)
  if (items.length === 0) return emptyText && !ro ? <EmptyState tone="calm">{emptyText}</EmptyState> : null
  return (
    <>
      <div className="task-rows">
        {items.map((item) => (
          <TaskRow key={item.key} item={item} members={members} lookup={lookup} actions={actions} dated={dated} />
        ))}
      </div>
      {!ro && ticked.length > 0 && (
        <div className="todo-clear">
          <button type="button" className="btn btn--sm" onClick={() => actions.clearTicked(ticked)}>
            <Icon name="check-bold" size={15} /> {t.todos.clearChecked}
          </button>
        </div>
      )}
    </>
  )
}

// Adding a task is one field. `today` pins it to the board's day; the second button keeps it
// for « un jour », where it lives in the Tâches view and not on the glance.
export function TaskQuickAdd({
  actions,
  today,
  subject,
  autoFocus,
  onAdded,
}: {
  actions: Actions
  today?: number | undefined
  subject?: SubjectRef | undefined
  autoFocus?: boolean | undefined
  onAdded?: (() => void) | undefined
}) {
  const t = useT()
  const [text, setText] = useState('')
  const add = (v: string, day: number | null) => {
    setText('')
    void actions.add(v, day, subject).then(() => onAdded?.())
  }
  return (
    <EntityCombobox<never>
      value={text}
      onChange={setText}
      options={[]}
      onSelect={() => {}}
      onSubmit={(v) => add(v, today ?? null)}
      submitLabel={t.common.add}
      submitLeadingIcon="plus-bold"
      autoFocus={autoFocus}
      {...(today != null ? { secondaryLabel: t.todos.addSomeday, onSecondary: (v: string) => add(v, null) } : {})}
      placeholder={t.todos.addPlaceholder}
      ariaLabel={t.todos.addPlaceholder}
      limit={TODO_TITLE_MAX}
    />
  )
}
