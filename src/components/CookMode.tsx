import { useCallback, useEffect, useRef, useState, type TouchEvent as ReactTouchEvent } from 'react'
import { createPortal } from 'react-dom'
import { useT, useLang } from '../i18n'
import { useAudience } from '../lib/audience'
import { type Recipe } from '../lib/recipes'
import { findDurations } from '../lib/duration'
import { ingredientsForStep, stepSentences, stripStepOrdinal } from '../lib/recipeSteps'
import { groupSections } from '../lib/recipeSections'
import { imgUrl } from '../lib/image'
import { spokenIngredient } from '../lib/measure'
import { useSpeak, stopSpeaking } from '../lib/speak'
import { useVoiceInput } from '../lib/useVoiceInput'
import { matchCookCommand } from '../lib/cookCommands'
import {
  type CookView,
  type CookDensity,
  useCookDensity,
  setCookDensity,
  useShowStepIngredients,
  setShowStepIngredients,
  loadCookView,
  saveCookView,
} from '../lib/cookPrefs'
import { IngredientLine } from './IngredientLine'
import { Icon, InlineIcon, type IconName } from './Icon'
import { useModal } from '../lib/useModal'
import { useCookTimers } from '../lib/cookTimers'
import { useWakeLock } from '../lib/useWakeLock'
import { TimerRail } from './cook/TimerRail'

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

// The three cooking layouts. The TODDLER lens is always locked to 'step' (the calm
// one-thing-at-a-time stepper — its whole point). The PARENT lens picks among all
// three from the bar, remembered per recipe:
//   • 'full'  — the whole recipe on one scroll page (skim it top-down).
//   • 'split' — ingredients pinned beside the steps (tablet) / two tabs (phone).
//   • 'step'  — Focus: the same big one-step-at-a-time stepper, parent-styled.
// (CookView lives in lib/cookPrefs so the bar switcher + persistence share it.)
const VIEW_ICON: Record<CookView, IconName> = { full: 'scroll-bold', split: 'book-open-bold', step: 'square-bold' }
const VIEW_ORDER: CookView[] = ['full', 'split', 'step']
const DENSITY_ORDER: CookDensity[] = ['compact', 'normal', 'large']

// Full-screen cooking view for the kitchen tablet. The TODDLER lens gets the calm
// stepper (one thing at a time — ingredients as a gather checklist, then each prep
// step as its own big page, auto read-aloud, timers, hands-free). The PARENT lens
// chooses its layout from the bar — full scroll page, split ingredients|steps, or
// the same stepper as a "Focus" mode — and that choice is remembered per recipe.
// A device-wide density control (Compact / Normal / Grand) sizes every view.
//
// Holds a Screen Wake Lock so the tablet doesn't sleep mid-recipe; re-acquires it
// when the tab becomes visible again (locks drop on hide). Silent no-op where the
// API is missing — it just behaves like a normal screen.
// `srcIdx` is the step's position in the ORIGINAL recipe.steps array, so it lines
// up with the parallel recipe.stepImages array (feature #17 B).
type Stage =
  | { kind: 'ingredients' }
  | { kind: 'step'; text: string; n: number; section: string | null; srcIdx: number }

// `siblings` turns Cook mode into the "Cuisiner ensemble" tabbed view (#43): a small
// sub-tab row under the bar controls flips between dish A / dish B / … Each dish is a
// full, independent CookMode kept mounted (its step, gather list and timers survive a
// switch — a pasta timer set on dish A still chimes while you read dish B); `hidden`
// display:none-s the inactive ones and no-ops their modal/keyboard wiring.
type Siblings = { titles: string[]; active: number; onSwitch: (i: number) => void }

export function CookMode({
  recipe,
  onClose,
  hidden = false,
  siblings,
}: {
  recipe: Recipe
  onClose: () => void
  hidden?: boolean
  siblings?: Siblings
}) {
  const t = useT()
  const { lang } = useLang()
  const speak = useSpeak()
  // Read this recipe's text in ITS OWN language when set (an English recipe in a
  // French app reads its steps/ingredients with an English voice), else the UI
  // language. #TTS explicit-hint — see lib/speak useSpeak(text, langOverride).
  const say = (txt: string | undefined) => speak(txt, recipe.lang ?? undefined)
  // Esc-to-exit + scroll-lock + focus-trap for the full-screen cooking view.
  const cookRef = useRef<HTMLDivElement>(null)
  // Hidden sibling tabs stay mounted but inert — no Esc/scroll-lock/focus-trap
  // fighting between the stacked instances (useModal no-ops when `open` is false).
  useModal(cookRef, onClose, { open: !hidden })
  const [idx, setIdx] = useState(0)
  // The view follows the audience: a toddler is LOCKED to the calm stepper (a
  // one-way door — no in-cook escape), while a parent picks any of the three and
  // we remember the pick per recipe. A ref mirrors the resolved mode so the
  // keyboard / swipe handlers can ignore nav outside the stepper without rebinding.
  const { audience } = useAudience()
  const isToddler = audience === 'toddler'
  const [view, setView] = useState<CookView>(() => (isToddler ? 'step' : loadCookView(recipe.id)))
  // The layout / text-size / step-ingredient controls are set-once options — collapse
  // them behind an « Affichage » (…) toggle so they don't crowd the step at the stove.
  const [showDisplay, setShowDisplay] = useState(false)
  const mode: CookView = isToddler ? 'step' : view
  const modeRef = useRef(mode)
  modeRef.current = mode
  function changeView(v: CookView) {
    setView(v)
    saveCookView(recipe.id, v) // parent-only path; toddler never calls this
  }
  // Device-wide text size for every cooking view (the bar's A / A / A control).
  const density = useCookDensity()
  // Device-wide: show each step's own ingredients ("what you need right now") under
  // the instruction, in EVERY view — toggled from the bar's carrot button. The
  // toddler stepper always shows them regardless (it has no bar toggle to undo it).
  const showStepIngs = useShowStepIngredients()
  const stepIngsOn = isToddler || showStepIngs
  // The toggle is only meaningful when there are both ingredients and steps to pair.
  const canPairIngs = recipe.ingredients.length > 0 && recipe.steps.length > 0
  // Split view: on a narrow phone the two panes collapse to a tab pair (ingredients
  // OR steps); on a tablet both show side by side and this is ignored (CSS).
  const [splitTab, setSplitTab] = useState<'ings' | 'steps'>('ings')
  // Several one-tap timers can run at once (start the pasta, then come back and
  // start the sauce). Each OUTLIVES step navigation — you set it then move on. The
  // countdown engine + chime/vibrate-on-finish + rail are the shared useCookTimers
  // primitive (lib/cookTimers), so the multi-recipe cook (#43) runs the same timers.
  const { timers, addTimer, toggleTimer, removeTimer } = useCookTimers()
  // Start a countdown for a duration, labelled by its step so a rail of them stays
  // legible (the engine takes a ready-made label; here we prefix the step number).
  const addStepTimer = (seconds: number, durLabel: string, stepN?: number) =>
    addTimer(seconds, stepN ? `${t.recipes.stepLabel} ${stepN} · ${durLabel}` : durLabel)

  // "## Section" markers group the flat lines (a recipe without markers is one
  // untitled group). A marker is never its own page — each step page carries
  // its section's name instead, and the step count covers real steps only.
  const ingGroups = groupSections(recipe.ingredients)
  const stepGroups = groupSections(recipe.steps)
  let stepN = 0
  const stages: Stage[] = [
    ...(ingGroups.some((g) => g.items.length) ? [{ kind: 'ingredients' } as Stage] : []),
    ...stepGroups.flatMap((g) =>
      g.items.map(({ text, idx }) => {
        const n = ++stepN
        // Drop a leading "5" when this IS step 5 — the stepper already shows the
        // number, so a doubled ordinal is noise (and gets read aloud otherwise).
        return { kind: 'step', text: stripStepOrdinal(text, n), n, section: g.title, srcIdx: idx } as Stage
      }),
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
  // A hidden sibling tab must stay silent — otherwise every dish in "Cuisiner
  // ensemble" would read its first step aloud at once on mount (read through a ref
  // so toggling visibility never itself triggers a read).
  const hiddenRef = useRef(hidden)
  hiddenRef.current = hidden
  // Only the stepper auto-narrates on arrival; the full / split pages are tap-to-hear.
  const stepText = mode === 'step' && cur?.kind === 'step' ? cur.text : null
  useEffect(() => {
    if (autoReadRef.current && stepText && !hiddenRef.current) speak(stepText, recipe.lang ?? undefined)
  }, [stepText, speak, recipe.lang])

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
      if (modeRef.current !== 'step') return // only the stepper has page nav
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
    if (!start || modeRef.current !== 'step') return
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

  // (The per-second ticker + chime/vibrate-on-finish now lives in useCookTimers.)

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
      if (d) addStepTimer(d.seconds, d.label, c?.kind === 'step' ? c.n : undefined)
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])
  const voice = useVoiceInput(handleCommand, { continuous: true })
  // The mic is a stepper affordance — never leave it open outside the stepper.
  useEffect(() => {
    if (mode !== 'step') voice.stop()
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [mode])

  // Keep the screen awake while cooking (shared with the multi-recipe cook).
  useWakeLock()

  // — Shared renderers (so the full + split views don't duplicate markup) —

  // The whole method as a numbered list; tap any step to hear it, with one-tap
  // timers for durations written into a step. Numbering runs across sections.
  const renderSteps = () => {
    let start = 1
    return stepGroups.map((g, gi) => {
      const olStart = start
      start += g.items.length
      return (
        <div key={gi}>
          {g.title && <h3 className="cook__full-subh">{g.title}</h3>}
          <ol className="cook__full-steps" start={olStart}>
            {g.items.map(({ text: rawS, idx }, i) => {
              const sN = olStart + i
              // Drop a leading ordinal that just repeats this step's number (the
              // <ol> already shows it) — see stripStepOrdinal.
              const s = stripStepOrdinal(rawS, sN)
              const durs = findDurations(s)
              // This step's own ingredients (scaled quantities + colour pills),
              // shown inline when the bar toggle is on — the same "what you need
              // right now" the stepper shows, generalized to the scroll views.
              const used = stepIngsOn ? ingredientsForStep(s, recipe.ingredients, g.title) : []
              return (
                <li
                  key={idx}
                  role="button"
                  tabIndex={0}
                  aria-label={t.recipes.readStep}
                  onClick={() => say(s)}
                  onKeyDown={(e) => {
                    if (e.key === 'Enter' || e.key === ' ') {
                      e.preventDefault()
                      say(s)
                    }
                  }}
                >
                  {s}
                  {used.length > 0 && (
                    <ul className="recipe-step__ings cook__step-ings-inline mono" aria-label={t.recipes.stepIngredients}>
                      {used.map((ing, j) => (
                        <li key={j}>
                          <IngredientLine line={ing} size="sm" />
                        </li>
                      ))}
                    </ul>
                  )}
                  {/* Start a timer for a duration in this step — same rail as the
                      stepper. stopPropagation so the tap doesn't also read the step. */}
                  {durs.length > 0 && (
                    <span className="cook__full-timers">
                      {durs.map((d) => (
                        <button
                          key={d.seconds}
                          type="button"
                          className="cook__timer-chip mono"
                          onClick={(e) => {
                            e.stopPropagation()
                            addStepTimer(d.seconds, d.label, sN)
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
  }

  // The gather checklist: tick the box as you grab each one (strike-through), tap
  // the text to hear the whole ingredient, with the colour-coded scoop circles.
  // Section names sit between the rows as plain headers — nothing to tick.
  const renderGather = (size: 'sm' | 'lg') => (
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
                onClick={() => say(spokenIngredient(ing, recipe.lang ?? lang))}
                onKeyDown={(e) => {
                  if (e.key === 'Enter' || e.key === ' ') {
                    e.preventDefault()
                    say(spokenIngredient(ing, recipe.lang ?? lang))
                  }
                }}
              >
                <IngredientLine line={ing} size={size} kid scoops />
              </span>
            </li>
          )
        }),
      ])}
    </ul>
  )

  // Cook mode is a true full-screen MODE, not a panel inside whatever opened it.
  // We portal to <body> so it escapes the recipe modal's stacking/scroll context
  // and owns the whole viewport — the modal it launched from stays mounted (state
  // intact for when you close), just fully covered, never peeking through.
  return createPortal(
    <div
      ref={cookRef}
      className="cook"
      data-density={density}
      role="dialog"
      aria-modal="true"
      aria-label={recipe.title}
      style={hidden ? { display: 'none' } : undefined}
    >
      <div className="cook__bar">
        <span className="cook__title">{recipe.title}</span>
        <div className="cook__bar-tools">
          {/* Parent-only « Affichage » toggle — opens the layout / text-size / step-
              ingredient options in a panel below (toddler is locked to the stepper). */}
          {!isToddler && (
            <button
              type="button"
              className={'cook__autoread' + (showDisplay ? ' is-on' : '')}
              onClick={() => setShowDisplay((s) => !s)}
              aria-pressed={showDisplay}
              aria-expanded={showDisplay}
              title={t.recipes.cookViewLabel}
              aria-label={t.recipes.cookViewLabel}
            >
              <Icon name="gear-six-bold" size={20} />
            </button>
          )}
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
          {/* Sharing lives on the recipe view now (one home for it), not in the
              cook bar — keeps the at-the-stove chrome to cook controls + exit. */}
          <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.close}>
            <Icon name="x-bold" size={20} />
          </button>
        </div>
      </div>

      {/* « Affichage » panel — the layout / text-size / step-ingredient options,
          collapsed by default so the step owns the screen at the stove. */}
      {!isToddler && showDisplay && (
        <div className="cook__display">
          <div className="cook__segctl" role="group" aria-label={t.recipes.cookViewLabel}>
            {VIEW_ORDER.map((v) => (
              <button
                key={v}
                type="button"
                className={'cook__segbtn' + (view === v ? ' is-on' : '')}
                onClick={() => changeView(v)}
                aria-pressed={view === v}
                title={t.recipes.cookView[v]}
                aria-label={t.recipes.cookView[v]}
              >
                <Icon name={VIEW_ICON[v]} size={18} />
              </button>
            ))}
          </div>
          <div className="cook__segctl cook__density" role="group" aria-label={t.recipes.cookDensityLabel}>
            {DENSITY_ORDER.map((d) => (
              <button
                key={d}
                type="button"
                className={'cook__segbtn' + (density === d ? ' is-on' : '')}
                onClick={() => setCookDensity(d)}
                aria-pressed={density === d}
                title={t.recipes.cookDensity[d]}
                aria-label={t.recipes.cookDensity[d]}
              >
                <span className={`cook__dens-a cook__dens-a--${d}`} aria-hidden="true">
                  A
                </span>
              </button>
            ))}
          </div>
          {/* Show / hide each step's own ingredients ("what you need right now")
              across every view. Only offered when the recipe has both lists. */}
          {canPairIngs && (
            <button
              type="button"
              className={'cook__autoread' + (showStepIngs ? ' is-on' : '')}
              onClick={() => setShowStepIngredients(!showStepIngs)}
              aria-pressed={showStepIngs}
              title={showStepIngs ? t.recipes.stepIngsShow : t.recipes.stepIngsHide}
              aria-label={showStepIngs ? t.recipes.stepIngsShow : t.recipes.stepIngsHide}
            >
              <Icon name="carrot-bold" size={20} />
            </button>
          )}
        </div>
      )}

      {/* "Cuisiner ensemble" dish switcher (#43): a sub-tab row under the display +
          text-size controls that flips between the dishes — each one a full cook view
          of its own. Sits below the bar so the layout/size controls govern whichever
          dish is showing. */}
      {siblings && siblings.titles.length > 1 && (
        <div className="cook__siblings" role="tablist" aria-label={t.kitchen.cookTogether}>
          {siblings.titles.map((title, i) => (
            <button
              key={i}
              type="button"
              role="tab"
              aria-selected={i === siblings.active}
              className={'cook__sibling' + (i === siblings.active ? ' is-on' : '')}
              onClick={() => siblings.onSwitch(i)}
            >
              {title}
            </button>
          ))}
        </div>
      )}

      {/* A spoken-command hint while the mic is open — so the words are discoverable
          (you can't see a menu of them otherwise). */}
      {mode === 'step' && voice.listening && (
        <p className="cook__voicehint mono" role="status">
          <InlineIcon name="microphone-bold" /> {t.recipes.voiceCookHint}
        </p>
      )}

      {/* Running timers live ABOVE the step so they stay visible as you move on —
          start one on step 2, watch it while you read step 5. The shared rail. */}
      <TimerRail timers={timers} onToggle={toggleTimer} onRemove={removeTimer} />

      <div
        className={
          'cook__stage' +
          (mode === 'full' ? ' cook__stage--full' : '') +
          (mode === 'split' ? ' cook__stage--split' : '')
        }
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
                            onClick={() => say(spokenIngredient(ing, recipe.lang ?? lang))}
                            onKeyDown={(e) => {
                              if (e.key === 'Enter' || e.key === ' ') {
                                e.preventDefault()
                                say(spokenIngredient(ing, recipe.lang ?? lang))
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
                {/* The whole method at a glance. Tap any step to hear it read. */}
                {renderSteps()}
              </section>
            )}
            {recipe.notes && (
              <section className="cook__full-sec">
                <h2 className="cook__full-h">{t.recipes.notes}</h2>
                <p className="cook__full-notes">{recipe.notes}</p>
              </section>
            )}
          </div>
        ) : mode === 'split' ? (
          // Ingredients pinned beside the steps. On a tablet both panes show; on a
          // narrow phone the tab pair flips between them (CSS owns the breakpoint).
          <div className="cook__split" data-tab={splitTab}>
            <div className="cook__split-tabs" role="tablist" aria-label={t.recipes.cookView.split}>
              <button
                type="button"
                role="tab"
                aria-selected={splitTab === 'ings'}
                className={'cook__split-tab' + (splitTab === 'ings' ? ' is-on' : '')}
                onClick={() => setSplitTab('ings')}
              >
                {t.recipes.ingredients}
              </button>
              <button
                type="button"
                role="tab"
                aria-selected={splitTab === 'steps'}
                className={'cook__split-tab' + (splitTab === 'steps' ? ' is-on' : '')}
                onClick={() => setSplitTab('steps')}
              >
                {t.recipes.steps}
              </button>
            </div>
            <aside className="cook__split-pane cook__split-ings">
              <h2 className="cook__full-h">{t.recipes.ingredients}</h2>
              {recipe.ingredients.length > 0 ? renderGather('lg') : null}
            </aside>
            <section className="cook__split-pane cook__split-steps">
              <h2 className="cook__full-h">{t.recipes.steps}</h2>
              {recipe.steps.length > 0 ? renderSteps() : null}
              {recipe.notes && <p className="cook__full-notes">{recipe.notes}</p>}
            </section>
          </div>
        ) : cur?.kind === 'ingredients' ? (
          <div className="cook__card">
            <h2 className="cook__h">{t.recipes.ingredients}</h2>
            {/* Gather list: tick the box as you grab each one, tap text to hear it. */}
            {renderGather('lg')}
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
              onClick={() => cur?.kind === 'step' && say(cur.text)}
              onKeyDown={(e) => {
                if ((e.key === 'Enter' || e.key === ' ') && cur?.kind === 'step') {
                  e.preventDefault()
                  say(cur.text)
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
              stepIngsOn &&
              (() => {
                const used = ingredientsForStep(cur.text, recipe.ingredients, cur.section)
                return used.length > 0 ? (
                  <ul className="cook__step-ings mono" aria-label={t.recipes.ingredients}>
                    {used.map((ing, i) => (
                      <li key={i}>
                        <IngredientLine line={ing} size="sm" kid scoops />
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
                    onClick={() => addStepTimer(d.seconds, d.label, cur?.kind === 'step' ? cur.n : undefined)}
                  >
                    ⏱ {d.label}
                  </button>
                ))}
              </div>
            )}
          </div>
        )}
      </div>

      {/* The stepper (toddler, or parent Focus) keeps its prev/next arrows — its
          whole point is one page at a time; the last step ends the nav rather than
          a big done button (the ✕ closes here too). Full / split are scroll pages,
          so the way out is the small ✕ in the bar. */}
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
