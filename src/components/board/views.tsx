import { CATS } from '../../lib/cats'
import { tintInk } from '../../lib/colors'
import { formatTime } from '../../lib/format'
import { SLOT_ICON_NAME, type MealSlot } from '../../lib/mealSlots'
import { type Lang } from '../../i18n'
import { Act } from './Act'
import { colorOf, nameOf, type BoardData, type Dict, type EventRow } from './types'

// "Now & Next" — a departure-board focus: the next thing up, big, with the one
// after it small beneath. When today is exhausted it BRIDGES to tomorrow's first
// event (rather than a stale "tonight" card); only an empty tomorrow falls back to
// the supper, then a calm empty. All-day items ride along as a quiet footer.
export function NowNext({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const slotLabel = (slot: string) => t.kitchen.slots[slot as keyof typeof t.kitchen.slots] ?? slot
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
          className={'nownext__focus' + (focusMine ? ' act--mine' : '')}
          style={{ borderColor: (focusColor ?? CATS.event.color) + '55' }}
        >
          <div className="nownext__when mono">{focusWhen}</div>
          <div className="nownext__title" style={{ color: tintInk(focusColor ?? CATS.event.color) }}>
            {focus.title}
          </div>
          {focusWho && (
            <div className="nownext__who">
              {focusWho}
              {focusMine ? ' ★' : ''}
            </div>
          )}
        </div>
      ) : data.tonight ? (
        <div className="nownext__focus" style={{ borderColor: CATS.meal.color + '55' }}>
          <div className="nownext__when mono">{t.board.tonight}</div>
          <div className="nownext__title" style={{ color: CATS.meal.deep }}>
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

      {allDay.length > 0 && (
        <div className="nownext__allday mono">
          {t.board.allDay} · {allDay.map((e) => e.title).join(' · ')}
        </div>
      )}

      {/* Recurring chores due today ride as a quiet footer too — so switching to
          "Maintenant" doesn't hide them (they're not time-bound, so they can't be
          the focus card). */}
      {(data.choresToday ?? []).length > 0 && (
        <div className="nownext__allday mono">
          {t.board.chores} ·{' '}
          {(data.choresToday ?? []).map((c) => (c.who ? `${c.title} (${c.who})` : c.title)).join(' · ')}
        </div>
      )}

      {/* Today's full meal table rides as a footer too — every slot, not just the
          supper (which can also be the fallback focus above). */}
      {data.todayMeals.length > 0 && (
        <div className="nownext__allday mono">
          {t.board.meals} · {data.todayMeals.map((m) => `${slotLabel(m.slot)}: ${m.title}`).join(' · ')}
        </div>
      )}

      {/* Tomorrow's prep note — the night-before reminder, even on the minimal
          "Maintenant" board, so advance prep isn't hidden behind a view switch. */}
      {data.tomorrowNote && (
        <div className="nownext__allday mono">
          {t.board.prepTomorrow} · {data.tomorrowNote.text}
        </div>
      )}
    </div>
  )
}

// Per-person "lanes": one column per family member (their today events + the chore
// currently their turn). A leading "Maisonnée" lane carries tonight's supper and
// any unassigned events — the common case, since quick-capture doesn't set a
// member — so nothing vanishes. The device's own member lane is gently accented.
export function Lanes({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const choresFor = (memberId: string) =>
    data.chores.filter((c) => {
      try {
        const rot = JSON.parse(c.rotation_json) as string[]
        return rot[c.current_idx] === memberId
      } catch {
        return false
      }
    })
  const memberIds = new Set(data.members.map((m) => m.id))
  const unassigned = data.today.filter((e) => !e.member_id || !memberIds.has(e.member_id))
  const slotLabel = (slot: string) => t.kitchen.slots[slot as keyof typeof t.kitchen.slots] ?? slot
  const cookLine = (cookId: string | null) => {
    const who = nameOf(data.members, cookId)
    return who ? `${who} ${t.board.cooks}` : undefined
  }

  return (
    <div className="lanes">
      {(unassigned.length > 0 || data.todayMeals.length > 0) && (
        <div className="lane bento">
          <div className="lane__head lane__head--shared">
            <span className="lane__dot" style={{ background: 'var(--ink-faint)' }} aria-hidden="true" />
            {t.profile.household}
          </div>
          {/* The whole day's table — every planned slot, whoever's cooking. */}
          {data.todayMeals.map((m) => (
            <Act
              key={m.id}
              cat="meal"
              icon={SLOT_ICON_NAME[m.slot as MealSlot]}
              title={`${slotLabel(m.slot)} · ${m.title}`}
              who={cookLine(m.cook_member_id)}
            />
          ))}
          {unassigned.map((e) => (
            <Act
              key={e.id}
              cat="event"
              title={e.title}
              when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
            />
          ))}
        </div>
      )}
      {data.members.map((m) => {
        const events = data.today.filter((e) => e.member_id === m.id)
        const chores = choresFor(m.id)
        const empty = events.length === 0 && chores.length === 0
        const mine = m.id === profileId
        return (
          <div key={m.id} className={'lane bento' + (mine ? ' lane--mine' : '')}>
            <div className="lane__head" style={{ color: tintInk(m.colour) }}>
              <span className="lane__dot" style={{ background: m.colour }} aria-hidden="true" />
              {m.display_name}
              {mine ? ' ★' : ''}
            </div>
            {empty ? (
              <p className="feed-empty">—</p>
            ) : (
              <>
                {events.map((e) => (
                  <Act
                    key={e.id}
                    cat="event"
                    title={e.title}
                    when={e.all_day ? t.board.allDay : formatTime(e.start_at, lang)}
                    color={m.colour}
                  />
                ))}
                {chores.map((c) => (
                  <Act key={c.id} cat="chore" title={c.title} color={c.color ?? m.colour} />
                ))}
              </>
            )}
          </div>
        )
      })}
    </div>
  )
}
