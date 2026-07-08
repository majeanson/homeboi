import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useLang, useT } from '../i18n'
import { api } from '../lib/api'
import { BOARD_KEY, ROUTINES_KEY } from '../lib/queryKeys'
import { formatTime, formatDayLong, capitalize as cap } from '../lib/format'
import { useAmbient } from '../lib/ambient'
import { pickMomentRoutine, TOD_ICON, TOD_TINT, isRoutineTod } from '../lib/routineTod'
import { Companion } from './Companion'
import { isCompanion } from '../lib/companions'
import { useMealPrefs } from '../lib/mealPrefs'
import { CATS } from '../lib/cats'
import { PhotoMosaic } from './PhotoMosaic'
import { InlineIcon } from './Icon'
import type { CSSProperties } from 'react'

// The ambient screensaver (backlog #3): after N idle minutes the kiosk fades to a
// big clock + date over the slow photo frame, with an optional "next up" stack —
// tonight's meal, the next event, and the routine of the moment (#4).
// Tap/press anything to wake. What it shows is operator-tunable (lib/ambient,
// Réglages ▸ Affichage). HubLayout owns the idle timer + the `show` flag and the
// wake (any pointer/key reset hides it); this is just the calm full-screen face.
// Renders nothing when hidden, so it's free while tucked away.
interface BoardEvent {
  id: string
  title: string
  start_at: number
  all_day: number
}
interface BoardMeal {
  id: string
  title: string
}
interface RoutineRow {
  id: string
  name: string
  timeOfDay: string | null
  color: string | null
  cards: { icon?: string }[]
  companion?: string | null
}


export function AmbientScreen({ show, onWake }: { show: boolean; onWake: () => void }) {
  const a = useAmbient()
  const t = useT()
  const { lang } = useLang()
  const mealPrefs = useMealPrefs()

  // A gentle minute clock — tick every 10 s so the displayed HH:MM is never stale
  // by more than a few seconds, without a per-second re-render on the wall.
  const [now, setNow] = useState(() => Date.now())
  useEffect(() => {
    if (!show) return
    setNow(Date.now())
    const id = setInterval(() => setNow(Date.now()), 10_000)
    return () => clearInterval(id)
  }, [show])

  // Next event still to come today, from the already-cached board frame (no extra
  // load on a fresh kiosk — the board polls this anyway).
  const { data } = useQuery({
    queryKey: BOARD_KEY,
    queryFn: () => api<{ today: BoardEvent[]; tonight: BoardMeal | null }>('board'),
    enabled: show && a.showNext,
  })
  const nowSec = Math.floor(now / 1000)
  const next =
    a.showNext
      ? [...(data?.today ?? [])]
          .filter((e) => e.all_day === 1 || e.start_at >= nowSec)
          .sort((x, y) => x.start_at - y.start_at)[0]
      : undefined
  // Tonight's supper rides on the same board frame — the most glanceable "what's
  // next" on a wall at rest, alongside the next event. (#4: next up = meal + event.)
  const meal = a.showNext ? data?.tonight ?? undefined : undefined

  // #4 (last leg): the routine that fits the moment — morning routines at morning,
  // bedtime in the evening — so a kid glancing at the wall sees what's coming. Its
  // own query (only while the screensaver is up, so the board poll stays lean), the
  // same ROUTINES_KEY cache the Routines tab fills. todRank orders by the current
  // time-of-day; we take the best-ranked routine that actually has cards. Calm: a
  // cue, never a nag — it just surfaces, it doesn't blink or count.
  const { data: rdata } = useQuery({
    queryKey: ROUTINES_KEY,
    queryFn: () => api<{ routines: RoutineRow[] }>('routines'),
    enabled: show && a.showNext,
  })
  const routine = a.showNext ? pickMomentRoutine(rdata?.routines ?? [], now) : undefined

  // F-47: the hourly breath — the top-of-the-hour tick (10 s granularity) lands
  // inside the first ~20 s of minute :00, adding a class that plays the one slow
  // 2 s scale (CSS animation, once; prefers-reduced-motion drops it entirely).
  const d = new Date(now)
  const breath = a.hourlyBreath && d.getMinutes() === 0 && d.getSeconds() < 20
  // E-37 burn-in care: an always-on pixel drift for the always-on panel — the
  // static clock/date/next block wanders a few px through a 5×5 grid, one step
  // per minute (full loop ≈ 25 min), so no glyph parks on the same pixels for
  // hours. Imperceptible (±4 px, eased in CSS); not a setting — it's furniture
  // care, like the deepened night veil.
  const drift = d.getHours() * 60 + d.getMinutes()
  const driftX = ((drift % 5) - 2) * 2
  const driftY = ((Math.floor(drift / 5) % 5) - 2) * 2

  if (!show) return null
  // Wake without leaking the gesture into the app underneath: preventDefault on the
  // pointerdown suppresses the compatibility mouse/click, and a one-shot capturing
  // click swallower catches any straggler before it lands on a board control.
  const wake = (e: React.PointerEvent | React.KeyboardEvent) => {
    e.preventDefault()
    e.stopPropagation()
    const swallow = (ev: Event) => {
      ev.preventDefault()
      ev.stopPropagation()
    }
    window.addEventListener('click', swallow, { capture: true, once: true })
    // Drop the listener shortly after in case no click ever follows (keyboard wake).
    setTimeout(() => window.removeEventListener('click', swallow, { capture: true } as EventListenerOptions), 700)
    onWake()
  }
  return (
    <div
      className="ambient"
      role="dialog"
      aria-label={t.ambient.title}
      onPointerDown={wake}
      onKeyDown={wake}
      tabIndex={-1}
    >
      {(a.showPhotos || a.showDrawings) && (
        <div className="ambient__bg" aria-hidden="true">
          <PhotoMosaic />
        </div>
      )}
      <div className="ambient__veil" aria-hidden="true" />
      <div className="ambient__center" style={{ transform: `translate(${driftX}px, ${driftY}px)` }}>
        {a.showClock && <div className={'ambient__clock' + (breath ? ' is-breath' : '')}>{formatTime(nowSec, lang)}</div>}
        {a.showDate && <div className="ambient__date">{cap(formatDayLong(nowSec, lang))}</div>}
        {meal && (
          <div className="ambient__next" style={{ '--tint': mealPrefs.color('supper') } as CSSProperties}>
            <InlineIcon name="fork-knife-bold" /> {meal.title}
          </div>
        )}
        {next && (
          <div className="ambient__next" style={{ '--tint': CATS.event.color } as CSSProperties}>
            <InlineIcon name="calendar-blank-bold" />{' '}
            {next.all_day === 1 ? next.title : `${formatTime(next.start_at, lang)} · ${next.title}`}
          </div>
        )}
        {routine && (
          <div
            className="ambient__next"
            style={{ '--tint': routine.color ?? (isRoutineTod(routine.timeOfDay) ? TOD_TINT[routine.timeOfDay] : 'var(--berry-deep)') } as CSSProperties}
          >
            <InlineIcon name={isRoutineTod(routine.timeOfDay) ? TOD_ICON[routine.timeOfDay] : 'baby-bold'} />{' '}
            {routine.name}
            {/* The routine's companion naps here at rest — its pose follows the
                daypart (dozing at night), pure decoration, never a counter. */}
            {isCompanion(routine.companion) && (
              <span className="ambient__companion">
                <Companion companion={routine.companion} size={26} at={now} />
              </span>
            )}
          </div>
        )}
      </div>
    </div>
  )
}
