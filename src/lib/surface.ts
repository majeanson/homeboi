// What kind of device this is: a wall-mounted KIOSK (always-on, glanceable,
// shared) or a personal MOBILE phone (on-the-go, quick capture). It's the device
// ROLE, chosen once at setup — orthogonal to `audience` (parent/toddler, the
// presentation lens, src/lib/audience.ts) and to auth (which still gates writes).
//
// Same shape as AudienceContext on purpose: a global context, persisted to
// localStorage ('babillard-surface'), overridable by `?surface=kiosk|mobile`
// (kiosk provisioning + e2e). `?kid=1` is shorthand that implies kiosk + toddler
// + locked (see src/main.tsx).
//
// `chosen` says whether the role was set deliberately (a stored value, a
// `?surface` param, or the `?kid=1` lock). The `/` smart entry (src/pages/Entry)
// uses it to decide marketing-vs-home: a brand-new visitor (not chosen, not
// paired, not signed in) sees the marketing page; everyone else goes to /board.
// When nothing is chosen the RESOLVED surface defaults to 'mobile' so any direct
// deep-link still renders the phone-friendly layout.
import { createContext, useContext } from 'react'

export type Surface = 'kiosk' | 'mobile'

export const SurfaceContext = createContext<{
  surface: Surface
  setSurface: (s: Surface) => void
  chosen: boolean
}>({
  surface: 'mobile',
  setSurface: () => {},
  chosen: false,
})

export const useSurface = () => useContext(SurfaceContext)
