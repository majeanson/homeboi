import { useEffect, useRef, useState } from 'react'
import { useT } from '../i18n'
import { type Recipe } from '../lib/recipes'

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

  const stages: Stage[] = [
    ...(recipe.ingredients.length ? [{ kind: 'ingredients' } as Stage] : []),
    ...recipe.steps.map((text, i) => ({ kind: 'step', text, n: i + 1 }) as Stage),
  ]
  // A recipe with nothing to show shouldn't open, but guard so we never NaN.
  const total = Math.max(1, stages.length)
  const cur = stages[Math.min(idx, stages.length - 1)]
  const atFirst = idx === 0
  const atLast = idx >= stages.length - 1

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
            <p className="cook__step-text">{cur?.kind === 'step' ? cur.text : ''}</p>
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
