import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { type Recipe } from '../lib/recipes'
import { findDurations } from '../lib/duration'
import { ingredientsForStep, stepSentences } from '../lib/recipeSteps'

const clock = (r: number) => `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`

// Full-screen, one-thing-at-a-time cooking view for the kitchen tablet. The
// ingredients are the first page (a checklist to gather), then each prep step is
// its own big page. Back / Next, a progress count, nothing else to think about —
// the same calm stepper shape as CashierMode, sized for reading across the
// counter with messy hands.
//
// Holds a Screen Wake Lock so the tablet doesn't sleep mid-recipe; re-acquires it
// when the tab becomes visible again (locks drop on hide). Silent no-op where the
// API is missing — it just behaves like a normal screen.
type Stage = { kind: 'ingredients' } | { kind: 'step'; text: string; n: number }

export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useT()
  const [idx, setIdx] = useState(0)
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null)
  // A one-tap timer for a duration written into the current step. One at a time:
  // total is what it started from (so a finished timer can restart), remaining
  // ticks down while running.
  const [timer, setTimer] = useState<{ total: number; remaining: number; running: boolean } | null>(null)

  const stages: Stage[] = [
    ...(recipe.ingredients.length ? [{ kind: 'ingredients' } as Stage] : []),
    ...recipe.steps.map((text, i) => ({ kind: 'step', text, n: i + 1 }) as Stage),
  ]
  // A recipe with nothing to show shouldn't open, but guard so we never NaN.
  const total = Math.max(1, stages.length)
  const cur = stages[Math.min(idx, stages.length - 1)]
  const atFirst = idx === 0
  const atLast = idx >= stages.length - 1
  const durations = cur?.kind === 'step' ? findDurations(cur.text) : []

  // Moving to another step drops the timer — it belonged to the step you left.
  useEffect(() => setTimer(null), [idx])

  // Tick once a second while running; at zero, stop and give a gentle buzz
  // (where supported). The screen wake-lock above keeps the tablet awake for it.
  useEffect(() => {
    if (!timer?.running) return
    const id = setInterval(() => {
      setTimer((tm) => {
        if (!tm || !tm.running) return tm
        if (tm.remaining <= 1) {
          try {
            navigator.vibrate?.([200, 100, 200])
          } catch {
            /* no vibration API — the visual "done" state is enough */
          }
          return { ...tm, remaining: 0, running: false }
        }
        return { ...tm, remaining: tm.remaining - 1 }
      })
    }, 1000)
    return () => clearInterval(id)
  }, [timer?.running])

  // Tap a finished clock to restart it; otherwise pause/resume.
  const toggleTimer = () =>
    setTimer((tm) =>
      !tm ? tm : tm.remaining === 0 ? { ...tm, remaining: tm.total, running: true } : { ...tm, running: !tm.running },
    )

  // Keep the screen awake while cooking; re-acquire on visibility regain.
  useEffect(() => {
    const nav = navigator as Navigator & {
      wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> }
    }
    let cancelled = false
    async function acquire() {
      try {
        if (!nav.wakeLock) return
        const lock = await nav.wakeLock.request('screen')
        if (cancelled) {
          lock.release().catch(() => {})
          return
        }
        lockRef.current = lock
      } catch {
        /* denied / unsupported — fine, behave like a normal screen */
      }
    }
    acquire()
    const onVis = () => {
      if (document.visibilityState === 'visible' && !lockRef.current) acquire()
    }
    document.addEventListener('visibilitychange', onVis)
    return () => {
      cancelled = true
      document.removeEventListener('visibilitychange', onVis)
      lockRef.current?.release().catch(() => {})
      lockRef.current = null
    }
  }, [])

  return (
    <div className="cook" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <div className="cook__bar">
        <span className="cook__title">{recipe.title}</span>
        <span className="cook__count mono">
          {Math.min(idx + 1, total)} / {total}
        </span>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
          ✕
        </button>
      </div>

      <div className="cook__stage">
        {cur?.kind === 'ingredients' ? (
          <div className="cook__card">
            <h2 className="cook__h">{t.recipes.ingredients}</h2>
            <ul className="cook__ings">
              {recipe.ingredients.map((ing, i) => (
                <li key={i}>{ing}</li>
              ))}
            </ul>
          </div>
        ) : (
          <div className="cook__card">
            <span className="cook__step-n mono">
              {t.recipes.stepLabel} {cur?.kind === 'step' ? cur.n : ''}
            </span>
            {/* The instruction as bullet points (one per sentence), and the
                ingredients this step uses — so you've got the quantities right
                here, no flipping back to the list. */}
            <ul className="cook__step-text cook__step-list">
              {(cur?.kind === 'step' ? stepSentences(cur.text) : []).map((s, i) => (
                <li key={i}>{s}</li>
              ))}
            </ul>
            {cur?.kind === 'step' &&
              (() => {
                const used = ingredientsForStep(cur.text, recipe.ingredients)
                return used.length > 0 ? (
                  <ul className="cook__step-ings mono" aria-label={t.recipes.ingredients}>
                    {used.map((ing, i) => (
                      <li key={i}>{ing}</li>
                    ))}
                  </ul>
                ) : null
              })()}
            {durations.length > 0 && (
              <div className="cook__timers">
                {timer ? (
                  <div className={'cook__timer' + (timer.remaining === 0 ? ' is-done' : '')}>
                    <button
                      type="button"
                      className="cook__timer-clock mono"
                      onClick={toggleTimer}
                      aria-label={t.recipes.timer}
                    >
                      {timer.remaining === 0
                        ? `⏱ ${t.recipes.timerDone}`
                        : `${timer.running ? '⏱' : '▶'} ${clock(timer.remaining)}`}
                    </button>
                    <button
                      type="button"
                      className="cook__timer-x mono"
                      onClick={() => setTimer(null)}
                      aria-label={t.common.cancel}
                    >
                      ✕
                    </button>
                  </div>
                ) : (
                  durations.map((d) => (
                    <button
                      key={d.seconds}
                      type="button"
                      className="cook__timer-chip mono"
                      onClick={() => setTimer({ total: d.seconds, remaining: d.seconds, running: true })}
                    >
                      ⏱ {d.label}
                    </button>
                  ))
                )}
              </div>
            )}
          </div>
        )}
      </div>

      <div className="cook__nav">
        <button
          type="button"
          className="cook__arrow"
          onClick={() => setIdx((i) => Math.max(0, i - 1))}
          disabled={atFirst}
          aria-label={t.shop.prev}
        >
          ←<span className="cook__arrow-label">{t.shop.prev}</span>
        </button>
        {atLast ? (
          <button type="button" className="cook__arrow cook__arrow--done" onClick={onClose}>
            ✓<span className="cook__arrow-label">{t.recipes.cookDone}</span>
          </button>
        ) : (
          <button
            type="button"
            className="cook__arrow cook__arrow--next"
            onClick={() => setIdx((i) => Math.min(stages.length - 1, i + 1))}
            aria-label={t.shop.next}
          >
            <span className="cook__arrow-label">{t.shop.next}</span>→
          </button>
        )}
      </div>
    </div>
  )
}
