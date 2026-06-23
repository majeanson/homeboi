import { useCallback, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useNavigate } from 'react-router-dom'
import { useLang, useT } from '../../i18n'
import { useAudience } from '../../lib/audience'
import { useSurface } from '../../lib/surface'
import { useModal } from '../../lib/useModal'
import { renderRich } from '../../lib/richText'
import { useTour } from '../../lib/tour'
import { Icon } from '../Icon'

// The one renderer for any active guided tour (engine: lib/tour.tsx). It dims the
// screen, cuts a spotlight around the step's target element (via an SVG mask, so
// any size/shape works), and floats a caption card with Skip/Back/Next. A step
// with no target shows a centred card (welcome/closing). Mounted once at app root
// so it can overlay ANY route. Reuses useModal (Esc=skip, scroll-lock, focus-trap)
// and createPortal, matching the app's other overlays (CookMode, sheets).

type Rect = { top: number; left: number; width: number; height: number }
type Pos = { top: number; left: number }

const PAD = 8 // breathing room of the cutout/ring around the spotlighted element
const GAP = 14 // gap between the spotlight and the caption card

// Pick the side with the most room and clamp the card into the viewport.
function placeCard(rect: Rect, cardW: number, cardH: number): Pos {
  const vw = window.innerWidth
  const vh = window.innerHeight
  const clamp = (v: number, lo: number, hi: number) => Math.min(Math.max(v, lo), Math.max(lo, hi))
  const below = vh - (rect.top + rect.height)
  const above = rect.top
  const right = vw - (rect.left + rect.width)
  const left = rect.left
  const max = Math.max(below, above, right, left)
  let top: number
  let leftPos: number
  if (max === below) {
    top = rect.top + rect.height + GAP
    leftPos = rect.left + rect.width / 2 - cardW / 2
  } else if (max === above) {
    top = rect.top - GAP - cardH
    leftPos = rect.left + rect.width / 2 - cardW / 2
  } else if (max === right) {
    leftPos = rect.left + rect.width + GAP
    top = rect.top + rect.height / 2 - cardH / 2
  } else {
    leftPos = rect.left - GAP - cardW
    top = rect.top + rect.height / 2 - cardH / 2
  }
  return {
    top: clamp(top, 12, vh - cardH - 12),
    left: clamp(leftPos, 12, vw - cardW - 12),
  }
}

export function TourOverlay() {
  const { activeTour, stepIndex, isActive, next, prev, end } = useTour()
  const { audience } = useAudience()
  const { surface } = useSurface()
  const t = useT()
  const { lang } = useLang()
  const nav = useNavigate()

  // Never over the toddler lens — belt-and-suspenders with the auto-start guard.
  const live = isActive && audience !== 'toddler'

  const cardRef = useRef<HTMLDivElement>(null)
  const skip = useCallback(() => end('skipped'), [end])
  useModal(cardRef, skip, { open: live })

  // Hand off to the matching Guide card: end the tour, then open Réglages ▸ Guide
  // at that card (GuideSection reads ?card= and scrolls/opens it). The tour is the
  // quick orient; the guide is the deep reference.
  const learnMore = useCallback(
    (card: string) => {
      end('finished')
      nav(`/settings?tab=guide&card=${card}`)
    },
    [end, nav],
  )

  const step = activeTour?.steps[stepIndex] ?? null
  const [rect, setRect] = useState<Rect | null>(null)
  const [pos, setPos] = useState<Pos | null>(null)

  // Measure the target (if any), position the card, and keep both in sync with
  // layout. A target that isn't on this surface (e.g. the ＋ FAB is hidden) is
  // retried briefly to allow a late mount, then we quietly advance rather than
  // strand the user on an orphan bubble.
  useLayoutEffect(() => {
    if (!live || !step) return
    if (!step.target) {
      setRect(null)
      setPos(null)
      return
    }
    let raf = 0
    let timer: ReturnType<typeof setTimeout> | undefined
    let tries = 0
    const measure = () => {
      const el = document.querySelector<HTMLElement>(`[data-tour="${step.target}"]`)
      if (!el) {
        // The anchor can mount late: start() navigates to the tour's route, then a
        // lazy page + its data fetch land a beat later. Retry for a few seconds.
        // If it's STILL absent (hidden on this surface, or it never mounts), do NOT
        // skip the step — fall back to a centred card so the user still reads it and
        // advances on their own. Nothing auto-advances and nothing auto-closes:
        // every step is shown to the end, Next is always a deliberate tap.
        if (tries++ < 25) {
          timer = setTimeout(measure, 120)
        } else {
          setRect(null)
          setPos(null)
        }
        return
      }
      const r = el.getBoundingClientRect()
      const rr: Rect = { top: r.top, left: r.left, width: r.width, height: r.height }
      setRect(rr)
      const card = cardRef.current
      setPos(placeCard(rr, card?.offsetWidth ?? 320, card?.offsetHeight ?? 220))
    }
    measure()
    const onChange = () => {
      cancelAnimationFrame(raf)
      raf = requestAnimationFrame(measure)
    }
    window.addEventListener('resize', onChange)
    window.addEventListener('scroll', onChange, true)
    window.visualViewport?.addEventListener('resize', onChange)
    return () => {
      cancelAnimationFrame(raf)
      if (timer) clearTimeout(timer)
      window.removeEventListener('resize', onChange)
      window.removeEventListener('scroll', onChange, true)
      window.visualViewport?.removeEventListener('resize', onChange)
    }
  }, [live, step])

  if (!live || !step) return null

  const total = activeTour!.steps.length
  const isFirst = stepIndex === 0
  const isLast = stepIndex === total - 1
  const cardStyle: React.CSSProperties = pos
    ? { top: pos.top, left: pos.left }
    : {} // centred via the --center class

  return createPortal(
    <div className="tour" data-surface={surface}>
      <svg className="tour__scrim" width="100%" height="100%" aria-hidden="true">
        <defs>
          <mask id="tour-cut">
            <rect x="0" y="0" width="100%" height="100%" fill="white" />
            {rect && (
              <rect
                x={rect.left - PAD}
                y={rect.top - PAD}
                width={rect.width + PAD * 2}
                height={rect.height + PAD * 2}
                rx="16"
                fill="black"
              />
            )}
          </mask>
        </defs>
        <rect x="0" y="0" width="100%" height="100%" fill="rgba(20,16,12,0.55)" mask="url(#tour-cut)" />
      </svg>

      {rect && (
        <div
          className="tour__ring"
          aria-hidden="true"
          style={{ top: rect.top - PAD, left: rect.left - PAD, width: rect.width + PAD * 2, height: rect.height + PAD * 2 }}
        />
      )}

      <div
        ref={cardRef}
        className={`tour__card${pos ? '' : ' tour__card--center'}`}
        style={cardStyle}
        role="dialog"
        aria-modal="true"
        aria-label={step.title[lang]}
      >
        {/* A clear "you are in a tour" banner: label + which step. Without it the
            non-blocking overlay can read as just a stray card — this names it. */}
        <div className="tour__eyebrow mono">
          <span className="tour__eyebrow-dot" aria-hidden="true" />
          <span>{t.tour.label}</span>
          <span className="tour__eyebrow-step">{t.tour.stepOf(stepIndex + 1, total)}</span>
        </div>

        <div className="tour__head">
          {step.icon && (
            <span className="tour__icon">
              <Icon name={step.icon} size={22} />
            </span>
          )}
          <span className="tour__title">{step.title[lang]}</span>
        </div>

        <p className="tour__body">{renderRich(step.body[lang])}</p>

        {step.card && (
          <button type="button" className="tour__learn" onClick={() => learnMore(step.card!)}>
            <span>{t.tour.learnMore}</span>
            <Icon name="arrow-right-bold" size={16} />
          </button>
        )}

        <div className="tour__dots" aria-hidden="true">
          {activeTour!.steps.map((_, i) => (
            <span key={i} className={`tour__dot${i === stepIndex ? ' is-on' : ''}`} />
          ))}
        </div>

        <div className="tour__controls">
          <button type="button" className="btn btn--ghost mono tour__skip" onClick={skip}>
            {t.tour.skip}
          </button>
          <div className="tour__controls-right">
            {!isFirst && (
              <button type="button" className="btn btn--ghost" onClick={prev}>
                {t.tour.back}
              </button>
            )}
            <button type="button" className="btn btn--primary" onClick={next}>
              {isLast ? t.tour.done : t.tour.next}
            </button>
          </div>
        </div>
      </div>
    </div>,
    document.body,
  )
}
