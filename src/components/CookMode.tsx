import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT, useLang } from '../i18n'
import { useAudience } from '../lib/audience'
import { type Recipe } from '../lib/recipes'
import { findDurations } from '../lib/duration'
import { ingredientsForStep, stepSentences } from '../lib/recipeSteps'
import { groupSections } from '../lib/recipeSections'
import { imgUrl } from '../lib/image'
import { spokenIngredient } from '../lib/measure'
import { useSpeak, stopSpeaking } from '../lib/speak'
import { useVoiceInput } from '../lib/useVoiceInput'
import { matchCookCommand } from '../lib/cookCommands'
import { IngredientLine } from './IngredientLine'
import { Icon, InlineIcon } from './Icon'
import { useModal } from '../lib/useModal'

// A live countdown for a duration found in a step. Several can run at once now
// (start the pasta, then the sauce), so each carries a label + its own id.
type CookTimer = { id: number; label: string; total: number; remaining: number; running: boolean }

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
// `srcIdx` is the step's position in the ORIGINAL recipe.steps array, so it lines
// up with the parallel recipe.stepImages array (feature #17 B).
type Stage =
  | { kind: 'ingredients' }
  | { kind: 'step'; text: string; n: number; section: string | null; srcIdx: number }

export function CookMode({ recipe, onClose }: { recipe: Recipe; onClose: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  // Esc-to-exit + scroll-lock + focus-trap for the full-screen cooking view.
  const cookRef = useRef<HTMLDivElement>(null)
  useModal(cookRef, onClose)
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
  // Several one-tap timers can run at once (start the pasta, then come back and
  // start the sauce). Each is named by the step it came from and OUTLIVES step
  // navigation — that's the point, you set it then move on. `total` is what it
  // started from (so a finished timer can restart), `remaining` ticks while running.
  const [timers, setTimers] = useState<CookTimer[]>([])
  const timerSeq = useRef(0)
  // Start a new countdown for a duration, labelled by its step so a rail of them
  // stays legible. The rail shows it immediately; it survives moving steps.
  function addTimer(seconds: number, durLabel: string, stepN?: number) {
    const id = ++timerSeq.current
    const label = stepN ? `${t.recipes.stepLabel} ${stepN} · ${durLabel}` : durLabel
    setTimers((ts) => [...ts, { id, label, total: seconds, remaining: seconds, running: true }])
  }
  // Tap a clock: restart it if it's finished, else pause/resume. ✕ removes it.
  const toggleTimer = (id: number) =>
    setTimers((ts) =>
      ts.map((tm) =>
        tm.id !== id ? tm : tm.remaining === 0 ? { ...tm, remaining: tm.total, running: true } : { ...tm, running: !tm.running },
      ),
    )
  const removeTimer = (id: number) => setTimers((ts) => ts.filter((tm) => tm.id !== id))

  // "## Section" markers group the flat lines (a recipe without markers is one
  // untitled group). A marker is never its own page — each step page carries
  // its section's name instead, and the step count covers real steps only.
  const ingGroups = groupSections(recipe.ingredients)
  const stepGroups = groupSections(recipe.steps)
  let stepN = 0
  const stages: Stage[] = [
    ...(ingGroups.some((g) => g.items.length) ? [{ kind: 'ingredients' } as Stage] : []),
    ...stepGroups.flatMap((g) =>
      g.items.map(({ text, idx }) => ({ kind: 'step', text, n: ++stepN, section: g.title, srcIdx: idx }) as Stage),
    ),
  ]
  // A recipe with nothing to show shouldn't open, but guard so we never NaN.
  const total = Math.max(1, stages.length)
  const cur = stages[Math.min(idx, stages.length - 1)]
  const atFirst = idx === 0
  const atLast = idx >= stages.length - 1
  const durations = cur?.kind === 'step' ? findDurations(cur.text) : []

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

  // One ticker for ALL running timers: decrement each per second; any that hit
  // zero stop and buzz once (where supported). The screen wake-lock above keeps
  // the tablet awake for it. Re-armed only when the "is anything running" flag
  // flips, so adding/removing a paused timer doesn't churn the interval.
  const anyRunning = timers.some((tm) => tm.running)
  useEffect(() => {
    if (!anyRunning) return
    const id = setInterval(() => {
      setTimers((ts) => {
        let buzzed = false
        const next = ts.map((tm) => {
          if (!tm.running) return tm
          if (tm.remaining <= 1) {
            buzzed = true
            return { ...tm, remaining: 0, running: false }
          }
          return { ...tm, remaining: tm.remaining - 1 }
        })
        if (buzzed) {
          try {
            navigator.vibrate?.([200, 100, 200])
          } catch {
            /* no vibration API — the visual "done" state is enough */
          }
        }
        return next
      })
    }, 1000)
    return () => clearInterval(id)
  }, [anyRunning])

  // — Hands-free stepper (step mode only) —
  // A continuous on-device mic that maps a spoken phrase to a stepper command, so
  // you can advance/repeat/start a timer with messy hands. Latest step + durations
  // are read through refs so the command handler stays stable (empty deps) — it
  // never re-subscribes the running recogniser mid-session.
  const curRef = useRef(cur)
  curRef.current = cur
  const durationsRef = useRef(durations)
  durationsRef.current = durations
  const speakRef = useRef(speak)
  speakRef.current = speak
  const stagesLenRef = useRef(stages.length)
  stagesLenRef.current = stages.length
  const handleCommand = useCallback((raw: string) => {
    const cmd = matchCookCommand(raw)
    if (cmd === 'next') setIdx((i) => Math.min(stagesLenRef.current - 1, i + 1))
    else if (cmd === 'back') setIdx((i) => Math.max(0, i - 1))
    else if (cmd === 'repeat') {
      const c = curRef.current
      if (c?.kind === 'step') speakRef.current(c.text)
    } else if (cmd === 'timer') {
      const d = durationsRef.current[0]
      const c = curRef.current
      if (d) addTimer(d.seconds, d.label, c?.kind === 'step' ? c.n : undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const voice = useVoiceInput(handleCommand, { continuous: true })
  // The mic is a stepper affordance — never leave it open in the parent full page.
  useEffect(() => {
    if (mode === 'full') voice.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

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
    <div ref={cookRef} className="cook" role="dialog" aria-modal="true" aria-label={recipe.title}>
      <div className="cook__bar">
        <span className="cook__title">{recipe.title}</span>
        {mode === 'step' && (
          <>
            <span className="cook__count mono" aria-live="polite">
              {Math.min(idx + 1, total)} / {total}
            </span>
            {/* Hands-free: tap to listen for "suivant / retour / répète / minuteur".
                Hidden where the browser has no Web Speech API (a dead button helps
                no one). Glows while listening. */}
            {voice.hasVoice && (
              <button
                type="button"
                className={'cook__autoread cook__voicectl' + (voice.listening ? ' is-on' : '')}
                onClick={voice.start}
                aria-pressed={voice.listening}
                title={voice.listening ? t.recipes.voiceCookOn : t.recipes.voiceCookOff}
                aria-label={voice.listening ? t.recipes.voiceCookOn : t.recipes.voiceCookOff}
              >
                <Icon name="microphone-bold" size={20} />
              </button>
            )}
            <button
              type="button"
              className={'cook__autoread' + (autoRead ? ' is-on' : '')}
              onClick={toggleAutoRead}
              aria-pressed={autoRead}
              title={autoRead ? t.recipes.autoReadOn : t.recipes.autoReadOff}
              aria-label={autoRead ? t.recipes.autoReadOn : t.recipes.autoReadOff}
            >
              <Icon name={autoRead ? 'speaker-high-bold' : 'speaker-slash-bold'} size={20} />
            </button>
          </>
        )}
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
          <Icon name="x-bold" size={20} />
        </button>
      </div>

      {/* A spoken-command hint while the mic is open — so the words are discoverable
          (you can't see a menu of them otherwise). */}
      {mode === 'step' && voice.listening && (
        <p className="cook__voicehint mono" role="status">
          <InlineIcon name="microphone-bold" /> {t.recipes.voiceCookHint}
        </p>
      )}

      {/* Running timers live ABOVE the step so they stay visible as you move on —
          start one on step 2, watch it while you read step 5. Tap a clock to
          pause/resume (or restart a finished one); ✕ dismisses it. */}
      {timers.length > 0 && (
        <div className="cook__timer-rail" aria-label={t.recipes.timer}>
          {timers.map((tm) => (
            <div key={tm.id} className={'cook__timer-item' + (tm.remaining === 0 ? ' is-done' : '')}>
              <span className="cook__timer-label mono">{tm.label}</span>
              <div className={'cook__timer' + (tm.remaining === 0 ? ' is-done' : '')}>
                <button
                  type="button"
                  className="cook__timer-clock mono"
                  onClick={() => toggleTimer(tm.id)}
                  aria-label={t.recipes.timer}
                >
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
                <button
                  type="button"
                  className="cook__timer-x"
                  onClick={() => removeTimer(tm.id)}
                  aria-label={t.common.cancel}
                >
                  <Icon name="x-bold" size={16} />
                </button>
              </div>
            </div>
          ))}
        </div>
      )}

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
                          {g.items.map(({ text: s, idx }, i) => {
                            const stepN = olStart + i
                            const durs = findDurations(s)
                            return (
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
                                {/* Start a timer for a duration in this step — same
                                    rail as the stepper. stopPropagation so the tap
                                    doesn't also read the step aloud. */}
                                {durs.length > 0 && (
                                  <span className="cook__full-timers">
                                    {durs.map((d) => (
                                      <button
                                        key={d.seconds}
                                        type="button"
                                        className="cook__timer-chip mono"
                                        onClick={(e) => {
                                          e.stopPropagation()
                                          addTimer(d.seconds, d.label, stepN)
                                        }}
                                      >
                                        ⏱ {d.label}
                                      </button>
                                    ))}
                                  </span>
                                )}
                              </li>
                            )
                          })}
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
                        {got && <Icon name="check-bold" size={14} />}
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
            {/* The step's own photo, when one was attached (feature #17 B). Keyed
                by the step's ORIGINAL index into recipe.stepImages. No image →
                render nothing (no blank box) — graceful degrade, and the no-R2
                path leaves every slot empty. */}
            {(() => {
              const key = cur?.kind === 'step' ? recipe.stepImages?.[cur.srcIdx] : ''
              return key ? (
                <img className="cook__step-photo" src={imgUrl(key)} alt="" loading="lazy" />
              ) : null
            })()}
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
            {/* Start a timer for any duration in the step — tap to add it to the
                rail above. Chips stay tappable so you can run several at once
                (the rail, not this row, shows the live countdowns). */}
            {durations.length > 0 && (
              <div className="cook__timers">
                {durations.map((d) => (
                  <button
                    key={d.seconds}
                    type="button"
                    className="cook__timer-chip mono"
                    onClick={() => addTimer(d.seconds, d.label, cur?.kind === 'step' ? cur.n : undefined)}
                  >
                    ⏱ {d.label}
                  </button>
                ))}
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
            <Icon name="arrow-left-bold" size={20} /><span className="cook__arrow-label">{t.shop.prev}</span>
          </button>
          <button
            type="button"
            className="cook__arrow cook__arrow--next"
            onClick={goNext}
            disabled={atLast}
            aria-label={t.shop.next}
          >
            <span className="cook__arrow-label">{t.shop.next}</span><Icon name="arrow-right-bold" size={20} />
          </button>
        </div>
      )}
    </div>,
    document.body,
  )
}
