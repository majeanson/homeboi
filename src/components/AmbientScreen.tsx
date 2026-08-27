import { useLang, useT } from '../i18n'
import { formatTime, formatDayLong, capitalize as cap } from '../lib/format'
import { useAmbient } from '../lib/ambient'
import { useAmbientScene } from '../lib/useAmbientScene'
import { TOD_ICON, TOD_TINT, isRoutineTod } from '../lib/routineTod'
import { Companion } from './Companion'
import { isCompanion } from '../lib/companions'
import { useMealPrefs } from '../lib/mealPrefs'
import { CATS } from '../lib/cats'
import { PhotoMosaic } from './PhotoMosaic'
import { InlineIcon } from './Icon'
import { useEffect, useRef, type CSSProperties } from 'react'

// The ambient screensaver (backlog #3): after N idle minutes the kiosk fades to a
// big clock + date over the slow photo frame, with an optional "next up" stack —
// tonight's meal, the next event, and the routine of the moment (#4).
// Tap/press anything to wake. What it shows is operator-tunable (lib/ambient,
// Réglages ▸ Affichage). HubLayout owns the idle timer + the `show` flag and the
// wake (any pointer/key reset hides it); this is just the calm full-screen face.
// Renders nothing when hidden, so it's free while tucked away.
//
// « Un seul moteur ambiant » (C-13, bmad/10): the clock/next-up/meal/routine/
// breath/drift are ALL supplied by `useAmbientScene` (lib/ambientScene) — the one
// seam this component and the cast ambient face (which renders this same
// component, see CastPage.tsx) both ride, instead of each carrying its own ticker
// + next-up selector.

export function AmbientScreen({ show, onWake }: { show: boolean; onWake: () => void }) {
  const a = useAmbient()
  const boxRef = useRef<HTMLDivElement>(null)
  const openerRef = useRef<Element | null>(null)
  const t = useT()
  const { lang } = useLang()
  const mealPrefs = useMealPrefs()
  const { now, nowSec, next, meal, routine, breath, drift } = useAmbientScene(show)
  const { x: driftX, y: driftY } = drift

  // Take focus while the screensaver covers everything, and hand it back on wake.
  // Without this the focus ring stayed on whatever control was focused BEHIND the
  // z-200 overlay (invisible to a sighted keyboard user), and this dialog's own
  // `onKeyDown` wake was dead code — a key only woke the screen because HubLayout
  // listens at `window`. Same capture-the-opener idiom as DetailProvider.
  useEffect(() => {
    if (show) {
      openerRef.current = document.activeElement
      boxRef.current?.focus()
      return
    }
    const back = openerRef.current
    openerRef.current = null
    if (back instanceof HTMLElement && back.isConnected) back.focus()
  }, [show])

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
      ref={boxRef}
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
          <div className="ambient__next" style={{ '--tint': mealPrefs.color(mealPrefs.hero) } as CSSProperties}>
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
