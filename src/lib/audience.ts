// Who is looking at this surface right now: a capable parent, or a pre-reader
// toddler. It's a presentation axis, NOT a permission boundary (auth still gates
// writes server-side). Every themed tab except Réglages renders both ways off
// the same data. Same shape as LangContext (src/i18n.ts) on purpose: a global
// context, persisted to localStorage, overridable by `?kid=1` so a wall tablet
// can boot locked into the toddler view.
//
// `locked` is that kiosk lock: when the tablet booted with `?kid=1`, a toddler
// must not be able to flip back to the parent view or wander into Réglages. The
// switch and the settings tab hide, and /settings redirects away (PRD C5). To
// unlock, an adult relaunches the kiosk without the param — a deliberate act.
import { createContext, useContext } from 'react'

export type Audience = 'parent' | 'toddler'

export const AudienceContext = createContext<{
  audience: Audience
  setAudience: (a: Audience) => void
  locked: boolean
}>({
  audience: 'parent',
  setAudience: () => {},
  locked: false,
})

export const useAudience = () => useContext(AudienceContext)
