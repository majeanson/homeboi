import { type CSSProperties } from 'react'
import { useNavigate } from 'react-router-dom'
import { CATS } from '../../lib/cats'
import { tintInk, faint, hairline } from '../../lib/colors'
import { useMealPrefs } from '../../lib/mealPrefs'
import { useNextMeal } from '../../lib/nextMeal'
import { formatTime } from '../../lib/format'
import { SLOT_ICON_NAME, SLOT_TIME_ORDER, type MealSlot } from '../../lib/mealSlots'
import { type Lang } from '../../i18n'
import { Icon, InlineIcon } from '../Icon'
import { Act } from './Act'
import { colorOf, nameOf, type BoardData, type Dict, type EventRow } from './types'

// "Now & Next" — a departure-board focus: the next thing up, big, with the one
// after it small beneath. When today is exhausted it BRIDGES to tomorrow's first
// event (rather than a stale "tonight" card); only an empty tomorrow falls back to
// the supper, then a calm empty. All-day items ride along as a quiet footer.
export function NowNext({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const mealPrefs = useMealPrefs()
  const nav = useNavigate()
  // "Préparer le repas" — the next meal due that has a recipe → its cook mode.
  // Only shown when there's a recipe to open (a free-text meal has nothing to
  // cook), so the action is never a dead end.
  const cook = useNextMeal()
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
          className={'nownext__focus' + (focusMine ? ' act--mine' : '')}
          style={{ '--tint': focusColor ?? CATS.event.color } as CSSProperties}
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
      ) : data.tonight && mealPrefs.isVisible('supper') ? (
        <div className="nownext__focus" style={{ '--tint': supperColor } as CSSProperties}>
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

      {/* Jump straight to cook mode for the next meal due (déjeuner→souper by the
          hour) when it resolves to a saved recipe — the same shortcut the kitchen
          ＋ "Cuisiner" tile uses. When a meal IS planned but has no recipe yet, the
          CTA doesn't vanish: it leads to the kitchen to attach one, so a planned
          souper is never a dead end. (No meal planned at all → nothing here.) */}
      {cook.meal && (
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
            <Act key={c.id} cat="chore" title={c.title} who={c.who ?? undefined} color={c.color ?? undefined} />
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
export function Lanes({ data, lang, t, profileId }: { data: BoardData; lang: Lang; t: Dict; profileId: string | null }) {
  const mealPrefs = useMealPrefs()
  const memberIds = new Set(data.members.map((m) => m.id))
  // Hidden meal slots (Réglages ▸ Repas) drop off the Maisonnée lane's table.
  const laneMeals = data.todayMeals.filter((m) => mealPrefs.isVisible(m.slot))
  const unassigned = data.today.filter((e) => !e.member_id || !memberIds.has(e.member_id))
  // Chores/to-dos due today with no rotation turn (who_id null) belong to the
  // whole household — they ride the Maisonnée lane beside unassigned events.
  const sharedChores = [...data.choresToday, ...data.todos].filter((c) => !c.who_id || !memberIds.has(c.who_id))
  const slotLabel = (slot: string) => t.kitchen.slots[slot as keyof typeof t.kitchen.slots] ?? slot
  const cookLine = (cookId: string | null) => {
    const who = nameOf(data.members, cookId)
    return who ? `${who} ${t.board.cooks}` : undefined
  }

  return (
    <div className="lanes">
      {(unassigned.length > 0 || sharedChores.length > 0 || laneMeals.length > 0) && (
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
          {sharedChores.map((c) => (
            <Act key={c.id} cat="chore" title={c.title} color={c.color ?? undefined} />
          ))}
        </div>
      )}
      {data.members.map((m) => {
        const events = data.today.filter((e) => e.member_id === m.id)
        // Only what's due today and theirs: recurring chores occurring today plus
        // one-off to-dos on their turn. Future occurrences stay in the Mois view.
        const chores = [...data.choresToday, ...data.todos].filter((c) => c.who_id === m.id)
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
