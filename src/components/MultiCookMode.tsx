import { useMemo, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { type Recipe } from '../lib/recipes'
import { findDurations } from '../lib/duration'
import { groupSections } from '../lib/recipeSections'
import { imgUrl } from '../lib/image'
import { useSpeak } from '../lib/speak'
import { useCookDensity } from '../lib/cookPrefs'
import { useCookTimers } from '../lib/cookTimers'
import { useModal } from '../lib/useModal'
import { TimerRail } from './cook/TimerRail'
import { Icon, InlineIcon } from './Icon'

// #43 — cook SEVERAL recipes at once, coordinated by ONE shared timer rail. Each
// dish gets its own column + step stepper you advance independently; tapping a
// duration in any step starts a NAMED countdown ("Pâtes · 10 min") that lands in
// the single rail at the top — so a glance shows every dish's timers together and
// what finishes next. A finished timer chimes + is announced aloud (which dish).
//
// Reuses the shared cook primitives wholesale: the timer engine + rail
// (lib/cookTimers + cook/TimerRail), duration parsing, section-aware step grouping,
// density, and per-recipe read-aloud language (#TTS) — recipes carry no per-step
// times, so timers are cook-started from the durations written in each step's prose
// (same as single-recipe CookMode), never an auto-timeline.

// Per-column tint — a cheerful, deterministic colour so dishes read apart at a
// glance (mirrors BigTiles' palette).
const COL_TINTS = ['#E0724E', '#7BB0C9', '#88A36F', '#B06A93', '#F2A03D', '#5E8AA8']

type DishStep = { text: string; n: number; srcIdx: number }

// A recipe's real cooking steps (## section headings skipped), numbered 1..N, each
// keeping its original index so the parallel stepImages line up (feature #17 B).
function dishSteps(recipe: Recipe): DishStep[] {
  let n = 0
  return groupSections(recipe.steps ?? []).flatMap((g) =>
    g.items.map(({ text, idx }) => ({ text, n: ++n, srcIdx: idx })),
  )
}

const clamp = (v: number, lo: number, hi: number) => Math.max(lo, Math.min(hi, v))

export function MultiCookMode({ recipes, onClose }: { recipes: Recipe[]; onClose: () => void }) {
  const t = useT()
  const speak = useSpeak()
  const density = useCookDensity()
  const ref = useRef<HTMLDivElement>(null)
  useModal(ref, onClose) // Esc + scroll-lock + focus-trap, like CookMode
  // The shared rail. On finish, announce WHICH dish is ready (the label already
  // carries the recipe name) on top of the chime + vibration from the engine.
  const { timers, addTimer, toggleTimer, removeTimer } = useCookTimers((labels) =>
    labels.forEach((l) => speak(t.kitchen.cookTimerReady(l))),
  )

  const dishes = useMemo(() => recipes.map((r) => ({ recipe: r, steps: dishSteps(r) })), [recipes])
  const [idxs, setIdxs] = useState<number[]>(() => recipes.map(() => 0))
  const move = (di: number, delta: number) =>
    setIdxs((xs) => xs.map((x, i) => (i === di ? clamp(x + delta, 0, Math.max(0, dishes[i].steps.length - 1)) : x)))

  return createPortal(
    <div ref={ref} className="cook cook--multi" role="dialog" aria-modal="true" data-density={density}>
      <div className="cook__bar">
        <h2 className="cook__title">{t.kitchen.cookTogether}</h2>
        <span className="cook__count mono">{t.kitchen.cookTogetherN(dishes.length)}</span>
        <button type="button" className="btn btn--ghost mono" onClick={onClose} aria-label={t.common.back}>
          <Icon name="x-bold" size={20} />
        </button>
      </div>

      {/* The coordination: one rail over all dishes. Start "Pâtes · 10 min" here,
          "Sauce · 5 min" there — they tick side by side and chime as each ends. */}
      <TimerRail timers={timers} onToggle={toggleTimer} onRemove={removeTimer} />

      <div className="multicook__cols">
        {dishes.map((d, di) => {
          const i = Math.min(idxs[di], Math.max(0, d.steps.length - 1))
          const step = d.steps[i] as DishStep | undefined
          const tint = COL_TINTS[di % COL_TINTS.length]
          const photo = step ? d.recipe.stepImages?.[step.srcIdx] : ''
          const durs = step ? findDurations(step.text) : []
          const done = d.steps.length === 0 || i >= d.steps.length - 1
          return (
            <section key={d.recipe.id} className="multicook__col" style={{ ['--col-tint' as string]: tint }}>
              <header className="multicook__head">
                <h3 className="multicook__dish">{d.recipe.title}</h3>
                {d.steps.length > 0 && (
                  <span className="multicook__progress mono">
                    {step ? step.n : d.steps.length} / {d.steps.length}
                  </span>
                )}
              </header>

              {step ? (
                <button
                  type="button"
                  className="multicook__step"
                  onClick={() => speak(step.text, d.recipe.lang ?? undefined)}
                  aria-label={t.recipes.readStep}
                >
                  <span className="multicook__num" aria-hidden="true">
                    {step.n}
                  </span>
                  {photo && <img className="multicook__photo" src={imgUrl(photo)} alt="" />}
                  <span className="multicook__text">{step.text}</span>
                </button>
              ) : (
                <div className="multicook__step multicook__step--empty mono">{t.recipes.empty}</div>
              )}

              {durs.length > 0 && (
                <div className="multicook__timers">
                  {durs.map((dd, k) => (
                    <button
                      key={k}
                      type="button"
                      className="chip multicook__timer-add"
                      onClick={() => addTimer(dd.seconds, `${d.recipe.title} · ${dd.label}`)}
                    >
                      <InlineIcon name="timer-bold" /> {dd.label}
                    </button>
                  ))}
                </div>
              )}

              <div className="multicook__nav">
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  onClick={() => move(di, -1)}
                  disabled={i <= 0}
                  aria-label={t.shop.prev}
                >
                  <Icon name="arrow-left-bold" size={20} />
                </button>
                {done ? (
                  <span className="multicook__done mono">
                    <InlineIcon name="check-bold" color="var(--col-tint)" /> {t.kitchen.cookColDone}
                  </span>
                ) : (
                  <span className="multicook__spacer" />
                )}
                <button
                  type="button"
                  className="btn btn--ghost mono"
                  onClick={() => move(di, 1)}
                  disabled={i >= d.steps.length - 1}
                  aria-label={t.shop.next}
                >
                  <Icon name="arrow-right-bold" size={20} />
                </button>
              </div>
            </section>
          )
        })}
      </div>
    </div>,
    document.body,
  )
}
