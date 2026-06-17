// Who is looking at this surface right now: a capable parent, or a pre-reader
// toddler. It's a presentation axis, NOT a permission boundary (auth still gates
// writes server-side). Every themed tab except Réglages renders both ways off
// the same data. Same shape as LangContext (src/i18n.ts) on purpose: a global
// context, persisted to localStorage, overridable by `?kid=1` so a wall tablet
// can boot locked into the toddler view.
//
// `locked` is that kiosk lock: when the tablet booted with `?kid=1`, a toddler
// must not be able to flip back to the parent view or wander into Réglages. The
// switch and the settings tab hide, and /settings redirects away (PRD C5).
//
// `unlock()` is the adult escape hatch. Relaunching with `?kid=0` works in a
// browser tab, but an INSTALLED PWA has no address bar — so once latched, a
// toddler-locked kiosk has no way out. unlock() is the in-app equivalent: it
// clears the lock and drops back to the parent lens. It is NOT a tappable
// affordance — it sits behind a parental gate (sustained long-press + a math
// challenge a pre-reader can't solve), so the one-way-door property holds for
// the child while an adult can still get out without a keyboard URL bar.
import { createContext, useContext } from 'react'

export type Audience = 'parent' | 'toddler'

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
