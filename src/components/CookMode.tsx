import { useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT, useLang } from '../i18n'
import { useAudience } from '../lib/audience'
import { type Recipe } from '../lib/recipes'
import { findDurations } from '../lib/duration'
import { ingredientsForStep, stepSentences } from '../lib/recipeSteps'
import { groupSections } from '../lib/recipeSections'
import { spokenIngredient } from '../lib/measure'
import { useSpeak, stopSpeaking } from '../lib/speak'
import { IngredientLine } from './IngredientLine'

// Whether a step reads itself aloud on arrival. Default ON; an explicit opt-out
// persists per device (same shape as the calm/lang prefs). OFF = narration only
// when you tap the step or a pill — never auto-started.
const AUTOREAD_KEY = 'babillard-cook-autoread'
function loadAutoRead(): boolean {
  try {
    return localStorage.getItem(AUTOREAD_KEY) !== 'off'
  } catch {
    return true
  }
}

// Which cooking view: 'step' is the one-thing-at-a-time stepper (a pre-reader
// hears each instruction); 'full' is the whole recipe on one scrollable page —
// ingredients then every step, the way a parent skims it. This is NOT a toggle in
// the cooking screen — it follows the active profile (the Parent / Enfant
// audience), so a toddler always gets the stepper and a parent the full page.
type CookView = 'step' | 'full'

const clock = (r: number) => `${Math.floor(r / 60)}:${String(r % 60).padStart(2, '0')}`

// Full-screen cooking view for the kitchen tablet, in two modes:
//
//   • 'step' (toddler): one thing at a time — ingredients as a gather checklist,
//     then each prep step as its own big page. Back / Next, a progress count,
//     auto read-aloud, timers. The calm stepper shape, sized for reading across
//     the counter with messy hands.
//   • 'full' (parent): the whole recipe on one scrollable page — ingredients,
//     then every numbered step. The traditional big-picture view, no stepping;
//     tap any line or step to still hear it read aloud.
//
// A segmented toggle in the bar switches between them; the choice persists.
//
// Holds a Screen Wake Lock so the tablet doesn't sleep mid-recipe; re-acquires it
// when the tab becomes visible again (locks drop on hide). Silent no-op where the
// API is missing — it just behaves like a normal screen.
type Stage = { kind: 'ingredients' } | { kind: 'step'; text: string; n: number; section: string | null }

export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  const [idx, setIdx] = useState(0)
  // Toddler stepper vs parent full-recipe page. A ref mirrors it so the keyboard
  // handler can ignore arrow keys in full mode without re-binding the listener.
  // The view follows the active profile: a toddler audience cooks one step at a
  // time, a parent reads the whole recipe. No in-cook toggle — the cooking screen
  // stays chrome-light. A ref mirrors it so the keyboard handler can ignore arrow
  // keys in full mode without re-binding the listener.
  const { audience } = useAudience()
  const mode: CookView = audience === 'toddler' ? 'step' : 'full'
  const modeRef = useRef(mode)
  modeRef.current = mode
  const lockRef = useRef<{ release: () => Promise<void> } | null>(null)
  // A one-tap timer for a duration written into the current step. One at a time:
  // total is what it started from (so a finished timer can restart), remaining
  // ticks down while running.
  const [timer, setTimer] = useState<{ total: number; remaining: number; running: boolean } | null>(null)

  // "## Section" markers group the flat lines (a recipe without markers is one
  // untitled group). A marker is never its own page — each step page carries
  // its section's name instead, and the step count covers real steps only.
  const ingGroups = groupSections(recipe.ingredients)
  const stepGroups = groupSections(recipe.steps)
  let stepN = 0
  const stages: Stage[] = [
    ...(ingGroups.some((g) => g.items.length) ? [{ kind: 'ingredients' } as Stage] : []),
    ...stepGroups.flatMap((g) =>
      g.items.map(({ text }) => ({ kind: 'step', text, n: ++stepN, section: g.title }) as Stage),
    ),
  ]
  // A recipe with nothing to show shouldn't open, but guard so we never NaN.
  const total = Math.max(1, stages.length)
  const cur = stages[Math.min(idx, stages.length - 1)]
  const atFirst = idx === 0
  const atLast = idx >= stages.length - 1
  const durations = cur?.kind === 'step' ? findDurations(cur.text) : []

  // Moving to another step drops the timer — it belonged to the step you left.
  useEffect(() => setTimer(null), [idx])

  // Read the step aloud when it becomes current, so a pre-reader hears the whole
  // instruction — not only the measurement pills. The navigation tap is the user
  // gesture browsers require for speech; tapping the step again repeats it. The
  // gather (ingredients) page stays silent — nothing to narrate there.
  //
  // Auto-read is opt-out (the 🔊/🔇 toggle in the bar). We read the preference
  // through a ref so flipping the toggle never itself triggers (or silences) a
  // read — only arriving at a NEW step does, honouring the latest setting.
  const [autoRead, setAutoRead] = useState(loadAutoRead)
  const autoReadRef = useRef(autoRead)
  autoReadRef.current = autoRead
  const stepText = cur?.kind === 'step' ? cur.text : null
  useEffect(() => {
    if (autoReadRef.current && stepText) speak(stepText)
  }, [stepText, speak])

  function toggleAutoRead() {
    setAutoRead((on) => {
      const next = !on
      try {
        localStorage.setItem(AUTOREAD_KEY, next ? 'on' : 'off')
      } catch {
        /* noop */
      }
      if (!next) stopSpeaking() // turning it off silences whatever's reading now
      return next
    })
  }

  // Closing Cook mode (or unmounting) stops any narration still in progress.
  useEffect(() => () => stopSpeaking(), [])

  // Page navigation, shared by the arrow buttons, the keyboard and swipe.
  const goPrev = () => setIdx((i) => Math.max(0, i - 1))
  const goNext = () => setIdx((i) => Math.min(stages.length - 1, i + 1))
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (modeRef.current === 'full') return // full recipe scrolls; no step nav
      if (e.key === 'ArrowLeft') goPrev()
      else if (e.key === 'ArrowRight') goNext()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [stages.length])

  // Swipe left/right between pages — horizontal-dominant gestures only, so it
  // never hijacks the vertical scroll of a long step. A tap (tiny delta) is
  // ignored, so the pills / checkboxes keep working.
  const touch = useRef<{ x: number; y: number } | null>(null)
  const onTouchStart = (e: ReactTouchEvent) => {
    touch.current = { x: e.touches[0].clientX, y: e.touches[0].clientY }
  }
  const onTouchEnd = (e: ReactTouchEvent) => {
    const start = touch.current
    touch.current = null
    if (!start || modeRef.current === 'full') return
    const dx = e.changedTouches[0].clientX - start.x
    const dy = e.changedTouches[0].clientY - start.y
    if (Math.abs(dx) < 50 || Math.abs(dx) < Math.abs(dy)) return
    if (dx > 0) goPrev()
    else goNext()
  }

  // Gathered-ingredient checklist on the first page (session-local — a calm
  // "what I've grabbed", not data we persist; a reload starts fresh).
  const [gathered, setGathered] = useState<Set<number>>(() => new Set())
  const toggleGot = (i: number) =>
    setGathered((g) => {
      const n = new Set(g)
      if (n.has(i)) n.delete(i)
      else n.add(i)
      return n
    })

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

  // Cook mode is a true full-screen MODE, not a panel inside whatever opened it.
  // We portal to <body> so it escapes the recipe modal's stacking/scroll context
  // and owns the whole viewport — the modal it launched from stays mounted (state
  // intact for when you close), just fully covered, never peeking through.
  return createPortal(
    <div className="cook" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <div className="cook__bar">
        <span className="cook__title">{recipe.title}</span>
        {mode === 'step' && (
          <>
            <span className="cook__count mono" aria-live="polite">
              {Math.min(idx + 1, total)} / {total}
            </span>
            <button
              type="button"
              className={'cook__autoread' + (autoRead ? ' is-on' : '')}
              onClick={toggleAutoRead}
              aria-pressed={autoRead}
              title={autoRead ? t.recipes.autoReadOn : t.recipes.autoReadOff}
              aria-label={autoRead ? t.recipes.autoReadOn : t.recipes.autoReadOff}
            >
              {autoRead ? '🔊' : '🔇'}
            </button>
          </>
        )}
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
          ✕
        </button>
      </div>

      <div
        className={'cook__stage' + (mode === 'full' ? ' cook__stage--full' : '')}
        onTouchStart={onTouchStart}
        onTouchEnd={onTouchEnd}
      >
        {mode === 'full' ? (
          <div className="cook__full">
            {recipe.ingredients.length > 0 && (
              <section className="cook__full-sec">
                <h2 className="cook__full-h">{t.recipes.ingredients}</h2>
                {ingGroups.map((g, gi) => (
                  <div key={gi}>
                    {g.title && <h3 className="cook__full-subh">{g.title}</h3>}
                    <ul className="cook__full-ings">
                      {g.items.map(({ text: ing, idx }) => (
                        <li key={idx}>
                          <span
                            className="cook__ing-text"
                            role="button"
                            tabIndex={0}
                            aria-label={t.recipes.hearLine}
                            onClick={() => speak(spokenIngredient(ing, lang))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                speak(spokenIngredient(ing, lang))
                              }
                            }}
                          >
                            <IngredientLine line={ing} size="sm" />
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                ))}
              </section>
            )}
            {recipe.steps.length > 0 && (
              <section className="cook__full-sec">
                <h2 className="cook__full-h">{t.recipes.steps}</h2>
                {/* The whole method at a glance. Tap any step to hear it read.
                    Numbering runs across sections, matching the stepper. */}
                {(() => {
                  let start = 1
                  return stepGroups.map((g, gi) => {
                    const olStart = start
                    start += g.items.length
                    return (
                      <div key={gi}>
                        {g.title && <h3 className="cook__full-subh">{g.title}</h3>}
                        <ol className="cook__full-steps" start={olStart}>
                          {g.items.map(({ text: s, idx }) => (
                            <li
                              key={idx}
                              role="button"
                              tabIndex={0}
                              aria-label={t.recipes.readStep}
                              onClick={() => speak(s)}
                              onKeyDown={(e) => {
                                if (e.key === 'Enter' || e.key === ' ') {
                                  e.preventDefault()
                                  speak(s)
                                }
                              }}
                            >
                              {s}
                            </li>
                          ))}
                        </ol>
                      </div>
                    )
                  })
                })()}
              </section>
            )}
            {recipe.notes && (
              <section className="cook__full-sec">
                <h2 className="cook__full-h">{t.recipes.notes}</h2>
                <p className="cook__full-notes">{recipe.notes}</p>
              </section>
            )}
          </div>
        ) : cur?.kind === 'ingredients' ? (
          <div className="cook__card">
            <h2 className="cook__h">{t.recipes.ingredients}</h2>
            {/* Gather list: tick the box as you grab each one (strike-through),
                tap the text to hear the whole ingredient read aloud. Section
                names sit between the rows as plain headers — nothing to tick. */}
            <ul className="cook__ings">
              {ingGroups.flatMap((g) => [
                ...(g.title ? [<li key={`h-${g.title}`} className="cook__ing-sec">{g.title}</li>] : []),
                ...g.items.map(({ text: ing, idx: i }) => {
                const got = gathered.has(i)
                return (
                  <li key={i} className={'cook__ing' + (got ? ' is-got' : '')}>
                    <button
                      type="button"
                      className="cook__ing-check"
                      onClick={() => toggleGot(i)}
                      aria-pressed={got}
                      aria-label={got ? t.recipes.gathered : t.recipes.toGather}
                    >
                      <span className="cook__ing-box" aria-hidden="true">
                        {got ? '✓' : ''}
                      </span>
                    </button>
                    <span
                      className="cook__ing-text"
                      role="button"
                      tabIndex={0}
                      aria-label={t.recipes.hearLine}
                      onClick={() => speak(spokenIngredient(ing, lang))}
                      onKeyDown={(e) => {
                        if (e.key === 'Enter' || e.key === ' ') {
                          e.preventDefault()
                          speak(spokenIngredient(ing, lang))
                        }
                      }}
                    >
                      <IngredientLine line={ing} size="lg" kid />
                    </span>
                  </li>
                )
                }),
              ])}
            </ul>
          </div>
        ) : (
          <div className="cook__card">
            {cur?.kind === 'step' && cur.section && <span className="cook__step-sec mono">{cur.section}</span>}
            <span className="cook__step-n mono">
              {t.recipes.stepLabel} {cur?.kind === 'step' ? cur.n : ''}
            </span>
            {/* The instruction as bullet points (one per sentence), and the
                ingredients this step uses — so you've got the quantities right
                here, no flipping back to the list. Tap the instruction to hear
                the whole step again (it's read once automatically on arrival). */}
            <div
              className="cook__step-read"
              role="button"
              tabIndex={0}
              aria-label={t.recipes.readStep}
              onClick={() => cur?.kind === 'step' && speak(cur.text)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && cur?.kind === 'step') {
                  e.preventDefault()
                  speak(cur.text)
                }
              }}
            >
              <ul className="cook__step-text cook__step-list">
                {(cur?.kind === 'step' ? stepSentences(cur.text) : []).map((s, i) => (
                  <li key={i}>{s}</li>
                ))}
              </ul>
            </div>
            {cur?.kind === 'step' &&
              (() => {
                const used = ingredientsForStep(cur.text, recipe.ingredients, cur.section)
                return used.length > 0 ? (
                  <ul className="cook__step-ings mono" aria-label={t.recipes.ingredients}>
                    {used.map((ing, i) => (
                      <li key={i}>
                        <IngredientLine line={ing} size="sm" kid />
                      </li>
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

      {/* Parent/full is one scrolling page — the way out is the small ✕ in the
          bar, no full-width "Bonne appétit". The toddler stepper keeps its
          prev/next arrows (its whole point is one page at a time); the last step
          ends the nav rather than a big done button — the ✕ closes here too. */}
      {mode === 'step' && (
        <div className="cook__nav">
          <button
            type="button"
            className="cook__arrow"
            onClick={goPrev}
            disabled={atFirst}
            aria-label={t.shop.prev}
          >
            ←<span className="cook__arrow-label">{t.shop.prev}</span>
          </button>
          <button
            type="button"
            className="cook__arrow cook__arrow--next"
            onClick={goNext}
            disabled={atLast}
            aria-label={t.shop.next}
          >
            <span className="cook__arrow-label">{t.shop.next}</span>→
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
