// Who is looking at this surface right now: a capable parent, or a pre-reader
// toddler. It's a presentation axis, NOT a permission boundary (auth still gates
// writes server-side). Every themed tab except Réglages renders both ways off
// the same data. Same shape as LangContext (src/i18n.ts) on purpose: a global
// context, persisted to localStorage, overridable by `?kid=1` so a wall tablet
// can boot locked into the toddler view.
import { createContext, useContext } from 'react'

export type Audience = 'parent' | 'toddler'

export const AudienceContext = createContext<{ audience: Audience; setAudience: (a: Audience) => void }>({
  audience: 'parent',
  setAudience: () => {},
})

export const useAudience = () => useContext(AudienceContext)
