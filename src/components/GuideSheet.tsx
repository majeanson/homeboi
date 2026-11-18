import { Link } from 'react-router-dom'
import { useLang, useT } from '../i18n'
import { GUIDE } from '../lib/guideContent'
import { renderRich } from '../lib/richText'
import { guideHref } from '../lib/settingsNav'
import { Icon } from './Icon'
import { Sheet } from './Sheet'

// ONE guide card, over the screen you are on (review #20, 2026-11-17). A help bubble's
// « Voir le guide » used to walk you into Réglages, off the very card you were asking
// about, with no way back but the back button. The card reads here, in a sheet; the full
// guide (search, every other card) stays one link away at its foot.
//
// Lazy-loaded by HelpBubble: GUIDE is the biggest text module in the app, and a surface
// whose bubbles nobody opens never pays for it.
export function GuideSheet({ card, point, onClose }: { card: string; point?: number | undefined; onClose: () => void }) {
  const t = useT()
  const { lang } = useLang()
  const entry = GUIDE.find((e) => e.id === card)
  if (!entry) return null
  return (
    <Sheet open onClose={onClose} title={entry.title[lang]} className="guide-sheet">
      <p className="guide-sheet__what">{renderRich(entry.what[lang])}</p>
      <ul className="guide-sheet__points">
        {entry.points.map((p, i) => (
          <li key={i}>
            <details open={i === point}>
              <summary>{renderRich(p.label[lang])}</summary>
              <p>{renderRich(p.detail[lang])}</p>
            </details>
          </li>
        ))}
      </ul>
      <Link to={guideHref(card, point)} className="guide-sheet__more" onClick={onClose}>
        {t.help.guideShort} <Icon name="arrow-right-bold" size={13} />
      </Link>
    </Sheet>
  )
}
