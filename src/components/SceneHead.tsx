import type { ReactNode } from 'react'
import { Icon, InlineIcon, type IconName } from './Icon'
import { HelpDot } from './HelpDot'
import { useT } from '../i18n'

// The shared header bar for every full-screen .scene route (quick-add, price
// match, deals browser, day plan, the operator add-forms…). One bar so they
// can't drift: a clear title on the left (optional quiet subtitle + leading
// glyph), and on the right the contextual Guide "?" (when `card` is given) next
// to the close ✕. No decorative orange kicker — that loud rotated tag was
// removed app-wide; the title carries the meaning, the "?" carries the help.
export function SceneHead({
  title,
  subtitle,
  icon,
  card,
  onClose,
  closeLabel,
  action,
}: {
  title: ReactNode
  // A quiet line under the title — the thing the scene is acting on (the list
  // item being edited, the searched term…). Muted, never orange.
  subtitle?: ReactNode
  // Optional leading inline glyph before the title (FormScene uses it).
  icon?: IconName
  // A GUIDE entry id (lib/guideContent.ts). Given → a "?" links to that card.
  card?: string
  onClose: () => void
  closeLabel?: string
  // Optional trailing control in the head cluster (sits before the "?" + close), e.g.
  // a scene-level mode toggle (the recipe view's "Original" toggle).
  action?: ReactNode
}) {
  const t = useT()
  return (
    <div className="scene__head">
      <div className="scene__head-titles">
        <h2 className="pm-sheet__title">
          {icon && (
            <>
              <InlineIcon name={icon} />{' '}
            </>
          )}
          {title}
        </h2>
        {subtitle != null && <span className="scene__head-sub mono">{subtitle}</span>}
      </div>
      <div className="scene__head-actions">
        {action}
        {card && <HelpDot card={card} />}
        <button
          type="button"
          className="btn btn--ghost mono"
          onClick={onClose}
          aria-label={closeLabel ?? t.common.close}
        >
          <Icon name="x-bold" size={18} />
        </button>
      </div>
    </div>
  )
}
