import { type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { EmptyState } from '../EmptyState'
import { CATS } from '../../lib/cats'
import { tintInk, faint, hairline } from '../../lib/colors'
import { useMealPrefs } from '../../lib/mealPrefs'
import { useNextMeal } from '../../lib/nextMeal'
import { useRecipeForMeal } from '../kitchen/mealLookup'
import { useTagColors } from '../../lib/queryHooks'
import { formatTime } from '../../lib/format'
import { SLOT_ICON_NAME, SLOT_TIME_ORDER, slotLabel as slotLabelFor, type MealSlot } from '../../lib/mealSlots'
import { todayLocalDay } from '../../lib/localDay'
import { useWrite } from '../../lib/write'
import { useRecordUndo } from '../../lib/toast'
import { isGuest } from '../../lib/device'
import { type Lang } from '../../i18n'
import { Icon, InlineIcon } from '../Icon'
import { Act } from './Act'
import { AutoCard } from './AutoCard'
import { useEntityDetail } from '../detail/DetailProvider'
import { buildEvent, buildChore, buildLeftover, buildMeal, type DetailCtx } from '../detail/adapters'
import { type Todo } from '../../lib/todos'
import { colorOf, nameOf, type BoardData, type Dict, type EventRow } from './types'

const BOARD_KEY = ['board']

// "Now & Next" — a departure-board focus: the next thing up, big, with the one
// after it small beneath. When today is exhausted it BRIDGES to tomorrow's first
// event (rather than a stale "tonight" card); only an empty tomorrow falls back to
// the supper, then a calm empty. All-day items ride along as a quiet footer.
export function NowNext({
  data,
  lang,
  t,
  profileId,
  todos = [],
}: {
  data: BoardData
  lang: Lang
  t: Dict
  profileId: string | null
  todos?: Todo[]
}) {
  const mealPrefs = useMealPrefs()
  const nav = useNavigate()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  const ro = isGuest()
  // Tap any item to peek its detail — the same sheet the bento board uses.
  const detail = useEntityDetail()
  const detailCtx: DetailCtx = { t, lang, members: data.members, recipeFor: useRecipeForMeal(), tagColors: useTagColors() }
  // "Préparer le repas" — the next meal due that has a recipe → its cook mode.
  // Only shown when there's a recipe to open (a free-text meal has nothing to
  // cook), so the action is never a dead end.
  const cook = useNextMeal()
  const todaySec = todayLocalDay()
  const saveAsLeftover = async (id: string, title: string) => {
    const res = await write<{ id?: string }>('meal-leftovers', {
      method: 'POST', body: { title, sourceMealId: id }, affectedKeys: [BOARD_KEY],
    }).catch(() => null)
    const leftoverId = res && !res.queued ? res.data?.id : undefined
    recordUndo({
      message: t.undo.leftoverAdded(title),
      onUndo: async () => {
        if (leftoverId) await write('meal-leftovers', { method: 'DELETE', body: { id: leftoverId }, affectedKeys: [BOARD_KEY] }).catch(() => {})
      },
    })
  }
  const removeMealFromPlan = async (id: string, title: string, slot: string) => {
    await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [BOARD_KEY] }).catch(() => {})
    recordUndo({
      message: t.undo.mealRemoved(title),
      onUndo: () =>
        write('meals', { method: 'POST', body: { date: todaySec, slot, title }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    })
  }
  const supperColor = mealPrefs.color('supper')
  // The day's meal footer skips slots the household hid (Réglages ▸ Repas), and
  // groups by slot in time order so it reads as one colour chip per slot — the same
  // slot icon + colour the Kitchen pill and Réglages ▸ Repas use (mealSlots).
  const mealRows = SLOT_TIME_ORDER.map((s) => ({
    slot: s,
    titles: data.todayMeals
      .filter((m) => m.slot === s && mealPrefs.isVisible(m.slot))
      .map((m) => m.title)
      .join(', '),
  })).filter((r) => r.titles)
  const now = Date.now() / 1000
  const timed = data.today.filter((e) => !e.all_day).sort((a, b) => a.start_at - b.start_at)
  const allDay = data.today.filter((e) => e.all_day)
  // Something that started in the last 30 min still counts as "now".
  const upcoming = timed.filter((e) => e.start_at >= now - 1800)
  const tomorrow = [...data.tomorrow].sort((a, b) => a.start_at - b.start_at)

  let focus: EventRow | undefined
  let focusWhen = ''
  let then: EventRow | undefined
  let thenWhen = ''
  if (upcoming[0]) {
    focus = upcoming[0]
    focusWhen = focus.all_day ? t.board.allDay : formatTime(focus.start_at, lang)
    if (upcoming[1]) {
      then = upcoming[1]
      thenWhen = formatTime(then.start_at, lang)
    } else if (tomorrow[0]) {
      then = tomorrow[0]
      thenWhen = t.board.tomorrow
    }
  } else if (tomorrow[0]) {
    focus = tomorrow[0]
    focusWhen = t.board.tomorrow
    if (tomorrow[1]) {
      then = tomorrow[1]
      thenWhen = t.board.tomorrow
    }
  }

  const focusColor = focus ? colorOf(data.members, focus.member_id) : undefined
  const focusWho = focus ? nameOf(data.members, focus.member_id) : null
  const focusMine = !!focus && !!profileId && focus.member_id === profileId

  return (
    <div className="nownext">
      {focus ? (
        <div
          className={'nownext__focus nownext__focus--tap' + (focusMine ? ' act--mine' : '')}
          style={{ '--tint': focusColor ?? CATS.event.color } as CSSProperties}
          role="button"
          tabIndex={0}
          onClick={() => detail.open(buildEvent(focus!, detailCtx))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              detail.open(buildEvent(focus!, detailCtx))
            }
          }}
        >
          <div className="nownext__when mono">{focusWhen}</div>
          <div className="nownext__title" style={{ color: tintInk(focusColor ?? CATS.event.color) }}>
            {focus.title}
          </div>
          {focusWho && (
            <div className="nownext__who">
              {focusWho}
              {focusMine && (
                <>
                  {' '}
                  <InlineIcon name="star-fill" size={12} />
                </>
              )}
            </div>
          )}
        </div>
      ) : data.tonight && mealPrefs.isVisible('supper') ? (
        <div
          className="nownext__focus nownext__focus--tap"
          style={{ '--tint': supperColor } as CSSProperties}
          role="button"
          tabIndex={0}
          onClick={() => detail.open(buildMeal(data.tonight!, detailCtx, {
            color: supperColor,
            slotLabel: t.board.tonight,
            onLeftover: ro ? undefined : () => saveAsLeftover(data.tonight!.id, data.tonight!.title),
            onRemove: ro ? undefined : () => removeMealFromPlan(data.tonight!.id, data.tonight!.title, 'supper'),
          }))}
          onKeyDown={(e) => {
            if (e.key === 'Enter' || e.key === ' ') {
              e.preventDefault()
              detail.open(buildMeal(data.tonight!, detailCtx, {
                color: supperColor,
                slotLabel: t.board.tonight,
                onLeftover: ro ? undefined : () => saveAsLeftover(data.tonight!.id, data.tonight!.title),
                onRemove: ro ? undefined : () => removeMealFromPlan(data.tonight!.id, data.tonight!.title, 'supper'),
              }))
            }
          }}
        >
          <div className="nownext__when mono">{t.board.tonight}</div>
          <div className="nownext__title" style={{ color: tintInk(supperColor!) }}>
            {data.tonight.title}
          </div>
        </div>
      ) : (
        <div className="nownext__focus nownext__focus--empty">
          <div className="nownext__title">{t.boardView.nothingNext}</div>
        </div>
      )}

      {then && (
        <div className="nownext__then">
          <span className="nownext__then-label mono">{t.boardView.then}</span>
          <span className="nownext__then-when mono">{thenWhen}</span>
          <span className="nownext__then-title">{then.title}</span>
        </div>
      )}

      {/* A planned leftover isn't a cook — eating restes means nothing to prepare.
          So instead of the "Préparer le repas" CTA (which would send you to a stove
          you don't need), show a calm, non-actionable note: restes ce soir. */}
      {cook.meal?.is_leftover ? (
        <div className="nownext__cook nownext__cook--leftover" style={{ '--tint': supperColor } as CSSProperties}>
          <Icon name="arrow-counter-clockwise-bold" size={22} color={supperColor} />
          <span className="nownext__cook-label">
            {t.board.cookLeftover}
            <span className="nownext__cook-meal">{cook.meal.title}</span>
          </span>
        </div>
      ) : cook.meal && (
        <button
          type="button"
          className="nownext__cook"
          style={{ '--tint': supperColor } as CSSProperties}
          onClick={() => nav(cook.target ?? '/kitchen')}
        >
          <Icon name="cooking-pot-bold" size={22} color={supperColor} />
          <span className="nownext__cook-label">
            {cook.target ? t.board.cook : t.board.cookPlan}
            <span className="nownext__cook-meal">{cook.meal.title}</span>
            {/* Who's at the stove, if the meal names a cook — their member colour,
                so the board says "Papa cuisine" at a glance, not just "souper". */}
            {(() => {
              const who = nameOf(data.members, cook.meal!.cook_member_id)
              if (!who) return null
              const c = colorOf(data.members, cook.meal!.cook_member_id)
              return (
                <span className="nownext__cook-who">
                  <span className="nownext__cook-dot" style={{ background: c ?? 'var(--ink-faint)' }} />
                  {who} {t.board.cooks}
                </span>
              )
            })()}
          </span>
        </button>
      )}

      {allDay.length > 0 && (
        <div className="nownext__allday mono">
          {t.board.allDay} · {allDay.map((e) => e.title).join(' · ')}
        </div>
      )}

      {/* Recurring chores due today ride as a quiet footer too — so switching to
          "Maintenant" doesn't hide them (they're not time-bound, so they can't be
          the focus card). Rendered as the same colour-spined Act cards used
          everywhere else in this section, not bare text. */}
      {(data.choresToday ?? []).length > 0 && (
        <div className="nownext__chores">
          <span className="nownext__meals-label mono">{t.board.chores}</span>
          {(data.choresToday ?? []).map((c) => (
            <Act
              key={c.id}
              cat="chore"
              title={c.title}
              who={c.who ?? undefined}
              color={c.color ?? undefined}
              soon={c.soon}
              onOpen={() => detail.open(buildChore(c, detailCtx))}
            />
          ))}
        </div>
      )}

      {/* « L'auto » glance rides just above the À compléter footer in this view (#28).
          Renders nothing when the household uses no car. */}
      <AutoCard />

      {/* À compléter — open todos (global + today) ride as a quiet footer here too,
          so switching to "Maintenant" doesn't hide them. Read-only on this glance;
          check them off from the bento À compléter card or the day page. */}
      {todos.length > 0 && (
        <div className="nownext__chores">
          <span className="nownext__meals-label mono">{t.todos.title}</span>
          {todos.map((td) => (
            <Act key={td.id} cat="chore" icon="check-bold" title={td.title} who={td.section ?? undefined} />
          ))}
        </div>
      )}

      {/* « L'auto » work windows today (#28) — who's out / car taken, derived from
          the recurring schedule. Read-only on the glance; tune it in Réglages. */}
      {(data.work ?? []).length > 0 && (
        <div className="nownext__chores">
          <span className="nownext__meals-label mono">{t.auto.workToday}</span>
          {(data.work ?? []).map((w) => (
            <Act
              key={w.id}
              cat="work"
              title={w.label || t.auto.work}
              when={t.auto.range(formatTime(w.at, lang), formatTime(w.endAt, lang))}
              who={nameOf(data.members, w.member_id) ?? undefined}
              color={w.color ?? colorOf(data.members, w.member_id) ?? undefined}
            />
          ))}
        </div>
      )}

      {/* Today's full meal table rides as a footer too — every slot, not just the
          supper (which can also be the fallback focus above). One colour chip per
          slot: slot icon + meals, tinted with the slot's colour. */}
      {mealRows.length > 0 && (
        <div className="nownext__meals">
          <span className="nownext__meals-label mono">{t.board.meals}</span>
          {mealRows.map(({ slot, titles }) => {
            const c = mealPrefs.color(slot)!
            return (
              <span
                key={slot}
                className="meal-chip"
                style={{ color: tintInk(c), background: faint(c), borderColor: hairline(c) }}
              >
                <InlineIcon name={SLOT_ICON_NAME[slot]} /> {titles}
              </span>
            )
          })}
        </div>
      )}

      {/* Restants à finir — the "eat these first" nudge rides the minimal board too
          (read-only here; Fini lives on the bento board + kitchen strip). */}
      {(data.leftovers ?? []).length > 0 && (
        <div className="nownext__allday mono">
          <InlineIcon name="arrow-counter-clockwise-bold" /> {t.kitchen.leftoversBoard} ·{' '}
          {data.leftovers.map((l) => l.title).join(' · ')}
        </div>
      )}

      {/* Tomorrow's prep note — the night-before reminder, even on the minimal
          "Maintenant" board, so advance prep isn't hidden behind a view switch. */}
      {data.tomorrowNote && (
        <div className="nownext__allday mono">
          {t.board.prepTomorrow} · {data.tomorrowNote.text}
        </div>
      )}

      {/* « Avant de partir » — the Maintenant view IS a leaving focus, so it carries a
          one-tap door to the full pre-departure glance (checklist, corvées, L'auto…). */}
      <button type="button" className="btn btn--ghost mono nownext__depart" onClick={() => nav('/board/departure')}>
        <Icon name="key-bold" size={16} /> {t.departure.title}
      </button>
    </div>
  )
}

// Per-person "lanes": one column per family member (their today events + the
// chores/to-dos that are DUE TODAY and their turn). A leading "Maisonnée" lane
// carries tonight's supper and any unassigned events/chores — the common case,
// since quick-capture doesn't set a member — so nothing vanishes. The device's
// own member lane is gently accented.
//
// Due-today only, on purpose: lanes source chores from `choresToday` (recurring
// chores that occur today and aren't already done — see functions/api/board.ts),
// NOT every chore in rotation. A weekly chore shows in its person's lane on its
// day, not all week. Upcoming occurrences live in the Mois (month) view instead.
export function Lanes({
  data,
  lang,
  t,
  profileId,
  todos = [],
}: {
  data: BoardData
  lang: Lang
  t: Dict
  profileId: string | null
  todos?: Todo[]
}) {
  const mealPrefs = useMealPrefs()
  const write = useWrite()
  const recordUndo = useRecordUndo()
  const ro = isGuest()
  // Tap any item to peek its detail — the same sheet the bento board uses.
  const detail = useEntityDetail()
  const detailCtx: DetailCtx = { t, lang, members: data.members, recipeFor: useRecipeForMeal(), tagColors: useTagColors() }
  const todaySec = todayLocalDay()
  const saveAsLeftover = async (id: string, title: string) => {
    const res = await write<{ id?: string }>('meal-leftovers', {
      method: 'POST', body: { title, sourceMealId: id }, affectedKeys: [BOARD_KEY],
    }).catch(() => null)
    const leftoverId = res && !res.queued ? res.data?.id : undefined
    recordUndo({
      message: t.undo.leftoverAdded(title),
      onUndo: async () => {
        if (leftoverId) await write('meal-leftovers', { method: 'DELETE', body: { id: leftoverId }, affectedKeys: [BOARD_KEY] }).catch(() => {})
      },
    })
  }
  const removeMealFromPlan = async (id: string, title: string, slot: string) => {
    await write('meals', { method: 'DELETE', body: { id }, affectedKeys: [BOARD_KEY] }).catch(() => {})
    recordUndo({
      message: t.undo.mealRemoved(title),
      onUndo: () =>
        write('meals', { method: 'POST', body: { date: todaySec, slot, title }, affectedKeys: [BOARD_KEY] }).catch(() => {}),
    })
  }
  const planLeftoverTonight = async (id: string, title: string) => {
    const keys = [BOARD_KEY]
    const res = await write<{ mealId?: string }>('meal-leftovers', {
      method: 'POST', body: { action: 'plan', id, date: todaySec, slot: 'supper' }, affectedKeys: keys,
    }).catch(() => null)
    const mealId = res && !res.queued ? res.data?.mealId : undefined
    recordUndo({
      message: t.undo.leftoverPlanned(title),
      onUndo: async () => {
        if (mealId) await write('meals', { method: 'DELETE', body: { id: mealId }, affectedKeys: keys }).catch(() => {})
        await write('meal-leftovers', { method: 'POST', body: { title }, affectedKeys: keys }).catch(() => {})
      },
    })
  }
  const memberIds = new Set(data.members.map((m) => m.id))
  // Hidden meal slots (Réglages ▸ Repas) drop off the Maisonnée lane's table.
  const laneMeals = data.todayMeals.filter((m) => mealPrefs.isVisible(m.slot))
  const unassigned = data.today.filter((e) => !e.member_id || !memberIds.has(e.member_id))
  // Chores/to-dos due today with no rotation turn (who_id null) belong to the
  // whole household — they ride the Maisonnée lane beside unassigned events.
  const sharedChores = [...data.choresToday, ...data.todos].filter((c) => !c.who_id || !memberIds.has(c.who_id))
  // À compléter todos with no face (or a stale one) are household-wide too.
  const sharedTodos = todos.filter((td) => !td.member_id || !memberIds.has(td.member_id))
  const slotLabel = (slot: string) => slotLabelFor(slot, t)
  const cookLine = (cookId: string | null) => {
    const who = nameOf(data.members, cookId)
    return who ? `${who} ${t.board.cooks}` : undefined
  }

  return (
    <div className="lanes">
      {(unassigned.length > 0 || sharedChores.length > 0 || sharedTodos.length > 0 || laneMeals.length > 0 || (data.leftovers ?? []).length > 0) && (
        <div className="lane bento">
          <div className="lane__head lane__head--shared">
            <span className="lane__dot" style={{ background: 'var(--ink-faint)' }} aria-hidden="true" />
            {t.profile.household}
          </div>
          {/* The whole day's table — every planned (shown) slot, whoever's cooking. */}
          {laneMeals.map((m) => (
            <Act
              key={m.id}
              cat="meal"
              icon={SLOT_ICON_NAME[m.slot as MealSlot]}
              title={`${slotLabel(m.slot)} · ${m.title}`}
              who={cookLine(m.cook_member_id)}
              color={mealPrefs.color(m.slot)}
              onOpen={() => detail.open(buildMeal(m, detailCtx, {
                color: mealPrefs.color(m.slot),
                slotLabel: slotLabel(m.slot),
                onLeftover: ro ? undefined : () => saveAsLeftover(m.id, m.title),
                onRemove: ro ? undefined : () => removeMealFromPlan(m.id, m.title, m.slot),
              }))}
            />
          ))}
          {/* Restants à finir — the lanes glance now surfaces the plan-tonight action. */}
          {(data.leftovers ?? []).map((l) => (
            <Act
              key={l.id}
              cat="meal"
              icon="arrow-counter-clockwise-bold"
              title={`${t.kitchen.leftoversTag} · ${l.title}`}
              onOpen={() => detail.open(buildLeftover(l, detailCtx, {
                onPlanTonight: ro ? undefined : () => planLeftoverTonight(l.id, l.title),
              }))}
            />
          ))}
          {unassigned.map((e) => (
            <Act
              key={e.id}
              cat="event"
              title={e.title}
              when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
              who={e.business_name ?? e.contact_name ?? undefined}
              color={e.business_colour ?? undefined}
              soon={e.soon}
              onOpen={() => detail.open(buildEvent(e, detailCtx))}
            />
          ))}
          {sharedChores.map((c) => (
            <Act
              key={c.id}
              cat="chore"
              title={c.title}
              color={c.color ?? undefined}
              soon={c.soon}
              onOpen={() => detail.open(buildChore(c, detailCtx))}
            />
          ))}
          {sharedTodos.map((td) => (
            <Act key={td.id} cat="chore" icon="check-bold" title={td.title} />
          ))}
        </div>
      )}
      {data.members.map((m) => {
        const events = data.today.filter((e) => e.member_id === m.id)
        // Only what's due today and theirs: recurring chores occurring today plus
        // one-off to-dos on their turn. Future occurrences stay in the Mois view.
        const chores = [...data.choresToday, ...data.todos].filter((c) => c.who_id === m.id)
        // À compléter todos this member owns (optional face).
        const myTodos = todos.filter((td) => td.member_id === m.id)
        // « L'auto » work windows this member has today (#28) — read-only.
        const myWork = (data.work ?? []).filter((w) => w.member_id === m.id)
        const empty = events.length === 0 && chores.length === 0 && myTodos.length === 0 && myWork.length === 0
        const mine = m.id === profileId
        return (
          <div key={m.id} className={'lane bento' + (mine ? ' lane--mine' : '')}>
            <div className="lane__head" style={{ color: tintInk(m.colour) }}>
              <span className="lane__dot" style={{ background: m.colour }} aria-hidden="true" />
              {m.display_name}
              {mine && (
                <>
                  {' '}
                  <InlineIcon name="star-fill" size={12} />
                </>
              )}
            </div>
            {empty ? (
              <EmptyState tone="calm">{t.board.laneClear}</EmptyState>
            ) : (
              <>
                {events.map((e) => (
                  <Act
                    key={e.id}
                    cat="event"
                    title={e.title}
                    when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
                    color={e.business_colour ?? m.colour}
                    soon={e.soon}
                    onOpen={() => detail.open(buildEvent(e, detailCtx))}
                  />
                ))}
                {chores.map((c) => (
                  <Act
                    key={c.id}
                    cat="chore"
                    title={c.title}
                    color={c.color ?? m.colour}
                    soon={c.soon}
                    onOpen={() => detail.open(buildChore(c, detailCtx))}
                  />
                ))}
                {myTodos.map((td) => (
                  <Act key={td.id} cat="chore" icon="check-bold" title={td.title} color={m.colour} />
                ))}
                {myWork.map((w) => (
                  <Act
                    key={w.id}
                    cat="work"
                    title={w.label || t.auto.work}
                    when={t.auto.range(formatTime(w.at, lang), formatTime(w.endAt, lang))}
                    color={w.color ?? m.colour}
                  />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
