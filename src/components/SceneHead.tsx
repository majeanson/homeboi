import type { ReactNode } from 'react'
import { Icon, InlineIcon, type IconName } from './Icon'
import { HelpDot } from './HelpDot'
import { OfflineBanner } from './OfflineBanner'
import { useT } from '../i18n'
import { useSceneClose } from '../lib/sceneNav'

// The shared header bar for every full-screen .scene route (quick-add, price
// match, deals browser, day plan, the operator add-forms…). One bar so they
// can't drift: a clear title on the left (optional quiet subtitle + leading
// glyph), and on the right the contextual Guide "?" (when `card` is given) next
// to the close ✕. No decorative orange kicker — that loud rotated tag was
// removed app-wide; the title carries the meaning, the "?" carries the help.
//
// Three exits, pick one (2026-11-05, wave 0.5):
//   • `onClose`  — the ✕ on the right; the scene decides what closing means.
//   • `backTo`   — a ← on the LEFT that pops history, or lands on this route when the
//                  scene was entered cold (useSceneClose). For a scene that reads as a
//                  page you arrived at, not a sheet you opened.
//   • neither    — no exit control: a public page reached by a link (the family
//                  window, the handoff, the welcome), where the only way out is the
//                  browser's own. Five of those hand-copied this bar because `onClose`
//                  used to be required; they fold back onto it in wave 3.
export function SceneHead({
  title,
  subtitle,
  icon,
  card,
  onClose,
  backTo,
  closeLabel,
  action,
  offline,
}: {
  title: ReactNode
  // A quiet line under the title — the thing the scene is acting on (the list
  // item being edited, the searched term…). Muted, never orange.
  subtitle?: ReactNode
  // Optional leading inline glyph before the title (FormScene uses it).
  icon?: IconName
  // A GUIDE entry id (lib/guideContent.ts). Given → a "?" links to that card.
  card?: string
  onClose?: () => void
  /** The route to land on when there is nothing in-app to pop back to. */
  backTo?: string
  closeLabel?: string
  // Optional trailing control in the head cluster (sits before the "?" + close), e.g.
  // a scene-level mode toggle (the recipe view's "Original" toggle).
  action?: ReactNode
  // Opt-in offline/stale awareness (shop seam #2): full-screen scenes render
  // OUTSIDE HubLayout, so the hub's OfflineBanner never covers them — a cashier
  // staring at cached prices in a dead-signal store aisle had no cue. Scenes used
  // at the store (cashier, price-match, flyers, quick-add) pass `offline` and the
  // shared banner rides above the head; it self-hides when online AND fresh.
  offline?: boolean
}) {
  const t = useT()
  // Always called (rules-of-hooks); only used when `backTo` is given.
  const back = useSceneClose(backTo ?? '/')
  return (
    <>
    {offline && <OfflineBanner />}
    <div className="scene__head">
      {backTo != null && onClose == null && (
        <button
          type="button"
          className="btn btn--ghost mono scene__head-back"
          onClick={back}
          aria-label={closeLabel ?? t.common.back}
          title={closeLabel ?? t.common.back}
        >
          <Icon name="arrow-left-bold" size={18} />
        </button>
      )}
      <div className="scene__head-titles">
        <h2 className="scene__head-title">
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
        {onClose && (
          <button
            type="button"
            className="btn btn--ghost mono"
            onClick={onClose}
            aria-label={closeLabel ?? t.common.close}
            title={closeLabel ?? t.common.close}
          >
            <Icon name="x-bold" size={18} />
          </button>
        )}
      </div>
    </div>
    </>
  )
}
