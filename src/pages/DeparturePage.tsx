import { useQuery } from '@tanstack/react-query'
import { useSearchParams } from 'react-router-dom'
import { useT, useLang } from '../i18n'
import { api } from '../lib/api'
import { live } from '../lib/query'
import { type Weather, type DayOutlook, weatherIcon, weatherTint, weatherTip } from '../lib/weather'
import { useBoardData } from '../lib/queryHooks'
import { nameOf } from '../components/board/types'
import { todayLocalDay, addLocalDays } from '../lib/localDay'
import { formatDayLong } from '../lib/format'
import { MONTH_KEY } from '../lib/queryKeys'
import { SceneHead } from '../components/SceneHead'
import { TodoSection } from '../components/todos/TodoSection'
import { Act } from '../components/board/Act'
import { AutoCard } from '../components/board/AutoCard'
import { ActivityBring } from '../components/board/ActivityBring'
import { DayNote } from '../components/board/DayNote'
import { InlineIcon } from '../components/Icon'
import { useSceneClose, useEscapeKey } from '../lib/sceneNav'

// #17 — departure mode: one calm "before you go" screen for a chosen day (today by
// default, or ?day=<local-midnight sec> when reached from a specific Moments day).
// It fuses the REAL « À compléter » list (the shared TodoSection), that day's
// EVENTS + CORVÉES + fridge/day NOTE (read from /api/month, the same window the
// calendar uses), and — for today — the WEATHER dressing tip and the « L'auto »
// glance. Navigate-only: nothing is written on entry; tick a checklist item and it
// syncs everywhere. Reuses board data + shared components — no new endpoint.
const capitalize = (s: string) => (s ? s[0].toUpperCase() + s.slice(1) : s)

interface DepMonth {
  events: { id: string; title: string; at: number; all_day: number; member_id: string | null; contact_name?: string | null; business_name?: string | null; birthday?: boolean; bring_template_id?: string | null; day: number }[]
  chores: { id: string; title: string; color: string | null; who: string | null; day: number }[]
  dayNotes: { id: string; text: string; member_id: string | null; day: number }[]
}

export function DeparturePage() {
  const t = useT()
  const { lang } = useLang()
  const close = useSceneClose('/board')
  useEscapeKey(close)

  const [params] = useSearchParams()
  const today = todayLocalDay()
  const dayParam = Number(params.get('day'))
  const day = Number.isFinite(dayParam) && dayParam > 0 ? dayParam : today
  const isToday = day === today
  const isTomorrow = day === addLocalDays(today, 1)

  const board = useBoardData().data
  const members = board?.members ?? []
  const wx = useQuery({ queryKey: ['weather'], queryFn: () => api<{ weather: Weather | null; tomorrow: DayOutlook | null }>('weather'), staleTime: 15 * 60 * 1000 }).data
  const weather = wx?.weather ?? null
  const tip = weatherTip(weather)

  // That day's events + corvées + fridge note, from the same /api/month window the
  // calendar + Moments use (DST-safe, recurring expanded server-side).
  const data = useQuery({ queryKey: [...MONTH_KEY, day, addLocalDays(day, 1)], queryFn: () => api<DepMonth>(`month?from=${day}&to=${addLocalDays(day, 1)}`), ...live }).data
  const events = data?.events ?? []
  // The day's recurring rotation chores (whose turn it is) + today's one-off « À
  // faire » (those are a today glance, so only on the today screen).
  const chores = [...(data?.chores ?? []), ...(isToday ? (board?.todos ?? []) : [])]
  const dayNote = data?.dayNotes?.[0] ?? null

  const timeLabel = (at: number, all_day: number) =>
    all_day ? t.departure.allDay : new Date(at * 1000).toLocaleTimeString(lang === 'fr' ? 'fr-CA' : 'en-CA', { hour: '2-digit', minute: '2-digit' })

  // Header names the day when it isn't today, so a departure reached from « Demain »
  // reads as such.
  const title = isToday ? t.departure.title : `${t.departure.title} · ${capitalize(formatDayLong(day, lang))}`

  // Weather is a "now" glance: the live card for today, tomorrow's outlook for
  // tomorrow, nothing further out.
  const tomorrow = wx?.tomorrow ?? null
  const tomorrowTip = tomorrow ? weatherTip({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.lowC }) : null

  return (
    <div className="scene departure" aria-label={title}>
      <SceneHead title={title} icon="key-bold" onClose={close} />
      <div className="scene__body departure__body">
        {/* Weather + the one dressing tip — the first glance before the door. */}
        {isToday && weather && (
          <div className="departure__wx" style={{ borderColor: weatherTint(weather) }}>
            <InlineIcon name={weatherIcon(weather)} size={30} color={weatherTint(weather)} />
            <span className="departure__wx-temp">{Math.round(weather.tempC)}°</span>
            <span className="departure__wx-text">
              <span className="departure__wx-cond">{t.weather[weather.bucket]}</span>
              {tip && <span className="departure__wx-tip mono">{t.weather.tip[tip]}</span>}
            </span>
          </div>
        )}
        {isTomorrow && tomorrow && (
          <div className="departure__wx" style={{ borderColor: weatherTint({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.highC }) }}>
            <InlineIcon name={weatherIcon({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.highC })} size={30} color={weatherTint({ bucket: tomorrow.bucket, isDay: true, tempC: tomorrow.highC })} />
            <span className="departure__wx-temp">{Math.round(tomorrow.highC)}° / {Math.round(tomorrow.lowC)}°</span>
            <span className="departure__wx-text">
              <span className="departure__wx-cond">{t.weather[tomorrow.bucket]}</span>
              {tomorrowTip && <span className="departure__wx-tip mono">{t.weather.tip[tomorrowTip]}</span>}
            </span>
          </div>
        )}

        {/* The REAL « À compléter » list — global + today for today's screen, or that
            specific day's list otherwise. Tick one here and it syncs everywhere; add
            a one-off or drop a saved checklist from its own field. */}
        <TodoSection title={t.departure.checklist} members={members} day={isToday ? undefined : day} bento={false} />

        {/* « À apporter » — the bring-lists for the day's activities (soccer cleats,
            instrument…). One tap promotes one into the checklist above. */}
        <ActivityBring events={events} day={day} />

        {/* The day's fridge / day note (« Sans gluten ce soir »…) — the shared board
            card; read-aloud only in toddler. Hidden when the day carries no note. */}
        {dayNote && <DayNote note={dayNote} members={members} label={t.board.dayNote} />}

        {/* The day's plan — a read-only reminder of what it holds before you go. */}
        <section className="departure__events">
          <h2 className="departure__h mono">{t.departure.today}</h2>
          {events.length === 0 ? (
            <p className="departure__empty mono">{t.departure.noEvents}</p>
          ) : (
            <ul className="departure__agenda">
              {events.map((e) => {
                const who = e.business_name ?? e.contact_name ?? nameOf(members, e.member_id)
                return (
                  <li key={e.id} className="departure__ev">
                    <span className="departure__ev-time mono">{timeLabel(e.at, e.all_day)}</span>
                    <span className="departure__ev-title">
                      {e.birthday && <InlineIcon name="cake-bold" size={14} />} {e.title}
                    </span>
                    {who && <span className="departure__ev-who mono">{who}</span>}
                  </li>
                )
              })}
            </ul>
          )}
        </section>

        {/* The day's corvées — whose turn it is, before everyone scatters. Read-only
            (the board / day page is where you tick them); hidden when there are none. */}
        {chores.length > 0 && (
          <section className="departure__chores">
            <h2 className="departure__h mono">{t.departure.chores}</h2>
            {chores.map((c) => (
              <Act key={c.id} cat="chore" title={c.title} who={c.who || undefined} color={c.color || undefined} />
            ))}
          </section>
        )}

        {/* « L'auto » — is the car free, who has it, today's rides. A "now" glance, so
            today only; renders nothing when the household uses no car. */}
        {isToday && <AutoCard />}
      </div>
    </div>
  )
}
