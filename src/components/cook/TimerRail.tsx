import { useT } from '../../i18n'
import { type CookTimer, clock } from '../../lib/cookTimers'
import { Icon, InlineIcon } from '../Icon'

// The running-timers rail — shared by single-recipe CookMode and the multi-recipe
// cook (#43). Each timer shows its label + a clock you tap to pause/resume (or
// restart a finished one); ✕ dismisses it. A finished timer reads "Prêt !". Pure
// presentation over the useCookTimers engine; the same `.cook__timer*` styles
// (styles/cook.css) drive it in both surfaces.
export function TimerRail({
  timers,
  onToggle,
  onRemove,
}: {
  timers: CookTimer[]
  onToggle: (id: number) => void
  onRemove: (id: number) => void
}) {
  const t = useT()
  if (timers.length === 0) return null
  return (
    <div className="cook__timer-rail" aria-label={t.recipes.timer}>
      {timers.map((tm) => (
        <div key={tm.id} className={'cook__timer-item' + (tm.remaining === 0 ? ' is-done' : '')}>
          <span className="cook__timer-label mono">{tm.label}</span>
          <div className={'cook__timer' + (tm.remaining === 0 ? ' is-done' : '')}>
            <button type="button" className="cook__timer-clock mono" onClick={() => onToggle(tm.id)} aria-label={t.recipes.timer}>
              {tm.remaining === 0 ? (
                <>
                  <InlineIcon name="timer-bold" /> {t.recipes.timerDone}
                </>
              ) : (
                <>
                  <InlineIcon name={tm.running ? 'timer-bold' : 'play-bold'} /> {clock(tm.remaining)}
                </>
              )}
            </button>
            <button type="button" className="cook__timer-x" onClick={() => onRemove(tm.id)} aria-label={t.common.cancel}>
              <Icon name="x-bold" size={16} />
            </button>
          </div>
        </div>
      ))}
    </div>
  )
}
