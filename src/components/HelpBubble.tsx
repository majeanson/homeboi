import { Link } from 'react-router-dom'
import { useT } from '../i18n'
import { Icon } from './Icon'

// A small in-place help box: a title, one calm line, and a "→ Voir le guide" link
// that opens the full Guide card (/settings?tab=guide&card=<id>, the same deep link
// HelpDot uses). Presentational + reusable — the consumer decides where it sits
// (inline in a sheet, a popover, …) and owns open/close. Used by the ＋ Add sheet's
// "?" help mode; adoptable anywhere a control wants quick contextual help without
// leaving the page. The guide link is the explicit way OUT to the manual.
export function HelpBubble({
  title,
  body,
  card,
  onClose,
}: {
  title: string
  body: string
  card?: string
  onClose: () => void
}) {
  const t = useT()
  return (
    <div className="help-bubble" role="status">
      <div className="help-bubble__head">
        <strong className="help-bubble__title">{title}</strong>
        <button type="button" className="help-bubble__x" onClick={onClose} aria-label={t.common.close}>
          <Icon name="x-bold" size={14} />
        </button>
      </div>
      <p className="help-bubble__body">{body}</p>
      {card && (
        <Link to={`/settings?tab=guide&card=${card}`} className="help-bubble__guide" onClick={onClose}>
          {t.help.goToGuide} <Icon name="arrow-right-bold" size={13} />
        </Link>
      )}
    </div>
  )
}
