import { lazy, Suspense, useEffect, useLayoutEffect, useRef, useState } from 'react'
import { createPortal } from 'react-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { Cluster } from './Layout'
import { scrollBehavior } from '../lib/motion'
import { guideHref } from '../lib/settingsNav'

/* oxlint-disable babillard/status-role -- the help popover, not a status line */

// Lazy on purpose — see the header. The bubble renders on every surface; the composer
// (the modal, the write hook, the attach panel) arrives only when someone reports.
const RemarkComposer = lazy(() => import('./RemarkComposer').then((m) => ({ default: m.RemarkComposer })))
const GuideSheet = lazy(() => import('./GuideSheet').then((m) => ({ default: m.GuideSheet })))

// Where a FLOATING bubble sits: centred under the tap, clamped inside the viewport, and
// flipped above the finger when there is no room below it. Pure, so it is tested alone.
export function bubblePlace(
  at: { x: number; y: number },
  size: { w: number; h: number },
  view: { w: number; h: number },
  gap = 12,
): { left: number; top: number } {
  const left = Math.min(Math.max(8, at.x - size.w / 2), Math.max(8, view.w - size.w - 8))
  const below = at.y + gap
  const top = below + size.h <= view.h - 8 ? below : Math.max(8, at.y - gap - size.h)
  return { left, top }
}

// A small in-place help box: a title, one calm line, and two ways out. « Voir le guide »
// opens the full Guide card (/settings?card=<id>, the same deep link HelpDot
// uses). « Signaler » opens « Les remarques » (0136) already knowing WHICH section you
// were asking about.
//
// THAT SECOND LINK IS THE « ? » DOOR, AND IT LIVES HERE ON PURPOSE. Help mode is mounted
// on all six themed tabs plus the ＋ sheet, across eight registries — so putting the door
// in the bubble gives every one of them a report door at once, and none of them has to
// know it exists. It also carries the best context in the app: a help KEY is semantic
// (`kitchen.recipes`), where a URL path is only where you happened to be standing.
//
// IT OPENS THE COMPOSER WHERE YOU STAND. It was a LINK into Réglages first, for a real
// reason — mounting a modal inside every bubble would pull Query, the write hook and the
// toast into a presentational component rendered on every surface. What that traded away
// was the point of the door: you tap « ? » because something is wrong HERE, and the
// answer walked you off the page you were describing (and, on the board, off the very
// card you were pointing at). `lazy()` settles it — the bubble imports nothing until
// someone taps, so a surface that never reports never pays.
//
// `?report=1` STAYS, for the caller that cannot do this: the crash screen, where
// ErrorBoundary is deliberately hook-free and must not be able to throw while rendering
// the fallback. One composer, two ways in.
export function HelpBubble({
  title,
  body,
  card,
  point,
  reportKey,
  at,
  onClose,
}: {
  title: string
  body: string
  card?: string
  // Optional 0-based index of the card's sub-point to open + highlight + scroll to.
  point?: number | undefined
  // The help-registry key this bubble is explaining. Present → the « Signaler » door
  // shows and carries it, so a report names the SECTION rather than the URL.
  reportKey?: string
  // The tap that asked (help mode, review #20): the bubble floats beside the finger
  // instead of opening in place, at the foot of the screen over another card.
  at?: { x: number; y: number } | null | undefined
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [reporting, setReporting] = useState(false)
  const [guiding, setGuiding] = useState(false)
  const [place, setPlace] = useState<{ left: number; top: number } | null>(null)

  useLayoutEffect(() => {
    if (!at || !ref.current) return setPlace(null)
    const r = ref.current.getBoundingClientRect()
    const doc = document.documentElement
    setPlace(bubblePlace(at, { w: r.width, h: r.height }, { w: doc.clientWidth, h: doc.clientHeight }))
  }, [at, title])

  // BRING IT FULLY INTO VIEW, CENTRED.
  //
  // A bubble renders in place, at whatever heading you tapped — and on a phone the
  // bottom nav is a fixed overlay, so a heading in the lower third opens a bubble whose
  // FOOT is behind it. Measured in Réglages ▸ Système ▸ Appareils & accès at 390×844:
  // the nav starts at y=772, the bubble ran 587→844, and both of its links sat under it.
  // Nothing scrolled, because the element WAS "in view" by the browser's definition —
  // it intersects the viewport; it is merely covered.
  //
  // `block: 'center'` clears any fixed chrome at either end without this file having to
  // know how tall the nav is (it differs by surface, and the keyboard changes it again).
  // Pre-existing — one link was already under the nav — but the second link is what made
  // it visible, so it is fixed here rather than noted.
  useEffect(() => {
    // A floating bubble is placed in the viewport already; scrolling would move the page
    // out from under the finger that asked.
    if (at) return
    ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
  }, [title, at])

  const to = card
    ? guideHref(card, point)
    : null
  const box = (
    <div
      className={'help-bubble' + (at ? ' help-bubble--float' : '')}
      role="status"
      ref={ref}
      // Measured hidden on its first frame, then placed (bubblePlace).
      style={at ? { left: place?.left ?? 0, top: place?.top ?? 0, visibility: place ? 'visible' : 'hidden' } : undefined}
    >
      <div className="help-bubble__head">
        <strong className="help-bubble__title">{title}</strong>
        <button type="button" className="help-bubble__x" onClick={onClose} aria-label={t.common.close}>
          <Icon name="x-bold" size={14} />
        </button>
      </div>
      <p className="help-bubble__body">{body}</p>
      {/* Cluster, not two bare inline-flex siblings: it wraps on a narrow phone and it
          owns the gap. The first version had neither, and the two links rendered
          TOUCHING — « Voir le guide →Signaler → » with the report link starting at the
          guide link's exact right edge (measured: 153.890625 to 153.890625). CLAUDE.md's
          standing rule says a row of controls is a Cluster; this is why. */}
      {(to || reportKey) && (
        <Cluster className="help-bubble__doors">
          {/* Over the current screen (review #20): it used to walk you into Réglages. */}
          {to && card && (
            <button type="button" className="help-bubble__guide" onClick={() => setGuiding(true)}>
              {t.help.goToGuide} <Icon name="arrow-right-bold" size={13} />
            </button>
          )}
          {reportKey && (
            <button type="button" className="help-bubble__report" onClick={() => setReporting(true)}>
              {t.remarks.signalHere}
            </button>
          )}
        </Cluster>
      )}
      {/* The bubble stays mounted under the dialog on purpose: it is what holds the
          composer, so closing it first would take the form with it. Both go together
          once the report is sent or dismissed. */}
      {reporting && (
        <Suspense fallback={null}>
          <RemarkComposer
            open
            seed={{ kind: 'bug', helpKey: reportKey }}
            onClose={() => {
              setReporting(false)
              onClose()
            }}
          />
        </Suspense>
      )}
      {guiding && card && (
        <Suspense fallback={null}>
          <GuideSheet
            card={card}
            point={point}
            onClose={() => {
              setGuiding(false)
              onClose()
            }}
          />
        </Suspense>
      )}
    </div>
  )
  // A floating bubble leaves the page's flow (and any rotated card's containing block)
  // for the body: `position: fixed` inside a transformed ancestor is fixed to IT.
  return at ? createPortal(box, document.body) : box
}
