import { lazy, Suspense, useEffect, useRef, useState } from 'react'
import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'
import { Cluster } from './Layout'
import { scrollBehavior } from '../lib/motion'

// Lazy on purpose — see the header. The bubble renders on every surface; the composer
// (the modal, the write hook, the attach panel) arrives only when someone reports.
const RemarkComposer = lazy(() => import('./RemarkComposer').then((m) => ({ default: m.RemarkComposer })))

// A small in-place help box: a title, one calm line, and two ways out. « Voir le guide »
// opens the full Guide card (/settings?tab=guide&card=<id>, the same deep link HelpDot
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
  onClose,
}: {
  title: string
  body: string
  card?: string
  // Optional 0-based index of the card's sub-point to open + highlight + scroll to.
  point?: number
  // The help-registry key this bubble is explaining. Present → the « Signaler » door
  // shows and carries it, so a report names the SECTION rather than the URL.
  reportKey?: string
  onClose: () => void
}) {
  const t = useT()
  const ref = useRef<HTMLDivElement>(null)
  const [reporting, setReporting] = useState(false)

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
    ref.current?.scrollIntoView({ behavior: scrollBehavior(), block: 'center' })
  }, [title])

  const to = card
    ? `/settings?tab=guide&card=${card}${point != null ? `&point=${point}` : ''}`
    : null
  return (
    <div className="help-bubble" role="status" ref={ref}>
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
          {to && (
            <Link to={to} className="help-bubble__guide" onClick={onClose}>
              {t.help.goToGuide} <Icon name="arrow-right-bold" size={13} />
            </Link>
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
    </div>
  )
}
