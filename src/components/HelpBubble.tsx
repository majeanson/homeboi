import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'

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
// It is a LINK, not a composer. Mounting a modal inside every bubble would pull Query,
// the write hook and the toast into a presentational component rendered on every surface
// — and the hand-off through `?report=1` already exists for the crash screen, which
// needs it for a harder reason (ErrorBoundary cannot use hooks at all). One mechanism,
// two callers.
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
  const to = card
    ? `/settings?tab=guide&card=${card}${point != null ? `&point=${point}` : ''}`
    : null
  return (
    <div className="help-bubble" role="status">
      <div className="help-bubble__head">
        <strong className="help-bubble__title">{title}</strong>
        <button type="button" className="help-bubble__x" onClick={onClose} aria-label={t.common.close}>
          <Icon name="x-bold" size={14} />
        </button>
      </div>
      <p className="help-bubble__body">{body}</p>
      {to && (
        <Link to={to} className="help-bubble__guide" onClick={onClose}>
          {t.help.goToGuide} <Icon name="arrow-right-bold" size={13} />
        </Link>
      )}
      {reportKey && (
        <Link
          to={`/settings?tab=settings&sub=tablets&focus=remarks&report=1&hk=${encodeURIComponent(reportKey)}`}
          className="help-bubble__report"
          onClick={onClose}
        >
          {t.remarks.signalHere} <Icon name="arrow-right-bold" size={13} />
        </Link>
      )}
    </div>
  )
}
