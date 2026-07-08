// Who is looking at this surface right now. THREE lenses off the SAME data (a
// presentation axis, NOT a permission boundary — auth still gates writes
// server-side):
//   • `parent`  — a capable reader; the full app.
//   • `toddler` — a PRE-reader (a three-year-old): picture-first, big targets,
//     read-aloud, no required reading, no settings.
//   • `simple`  — a POST-reader (bmad/08 A-1, the "grandma" lens): a capable
//     adult who reads fine but wants calm, large, spoken. The toddler machinery
//     pointed at the OTHER end of life — real words + full capability (she gets
//     the PARENT views on every tab), but ~1.4× type, a four-giant-tile board,
//     tap-to-hear, no settings. Boots locked via `?simple=1` exactly like
//     `?kid=1`.
// Same shape as LangContext (src/i18n.ts): a global context persisted to
// localStorage, overridable by `?kid=1` / `?simple=1` so a wall tablet can boot
// locked into the toddler or simple view.
//
// `locked` is that kiosk lock: when the tablet booted with `?kid=1` OR
// `?simple=1`, the viewer must not flip back to the parent view or wander into
// Réglages. The switch and the settings tab hide, and /settings redirects away
// (PRD C5).
//
// `unlock()` is the adult escape hatch. Relaunching with `?kid=0` / `?simple=0`
// works in a browser tab, but an INSTALLED PWA has no address bar — so once
// latched, a locked kiosk has no way out. unlock() is the in-app equivalent: it
// clears the lock(s) and drops back to the parent lens. It sits behind an exit
// gate (a sustained long-press; toddler additionally needs a math challenge a
// pre-reader can't solve — a post-reader adult doesn't), so the one-way-door
// property holds for the child while an adult can still get out without a URL bar.
import { createContext, useContext } from 'react'

export type Audience = 'parent' | 'toddler' | 'simple'

export const AudienceContext = createContext<{
  audience: Audience
  setAudience: (a: Audience) => void
  locked: boolean
  unlock: () => void
  // `guestPreview` is the operator's read-only "act as a guest" mode — the third
  // option beside Parent|Toddler in Réglages. It lives in the context (not just
  // localStorage) so toggling it re-renders the tree and the read-only guards
  // (RowActions/EditField hide, `writeWith` refuses) take effect at once. Unlike a
  // link guest it does NOT lock Réglages, so the operator can switch back to Parent.
  guestPreview: boolean
  setGuestPreview: (on: boolean) => void
}>({
  audience: 'parent',
  setAudience: () => {},
  locked: false,
  unlock: () => {},
  guestPreview: false,
  setGuestPreview: () => {},
})

export const useAudience = () => useContext(AudienceContext)
