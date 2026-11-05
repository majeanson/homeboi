import { useT } from '../../i18n'
import { type CookTimer, clock } from '../../lib/cookTimers'
import { Icon, InlineIcon } from '../Icon'
import { useHScroll } from '../../lib/hscroll'

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
  // A side-scrolling row: the mouse wheel maps onto it (lib/hscroll), so a desktop
  // reaches the fourth timer without a thumb (CLAUDE.md « A scrolling row must be
  // reachable with a mouse »; hscroll-rule.test.ts).
  const rail = useHScroll<HTMLDivElement>()
  if (timers.length === 0) return null
  return (
    <div ref={rail.ref} className="cook__timer-rail" aria-label={t.recipes.timer}>
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
