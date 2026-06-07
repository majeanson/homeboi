// "Who's using this device right now" — a household member picked on a phone so
// the app can greet them, highlight their day, and attribute what they add
// ("Camille added milk"). It is NOT auth and NOT a permission boundary: the
// household login still gates everything server-side; this is a presentation +
// attribution axis on top of the shared members, the same spirit as
// [[audience]] / [[surface]]. Persisted per device to localStorage
// ('babillard-profile'); cleared = "tout le monde" (no name, no attribution).
//
// Sent to the server on every write as the `X-Profile` header (see lib/api), so
// another device sees who added a list item. Spoofable by a determined client —
// fine: it's family attribution, not access control.
import { createContext, useContext } from 'react'

export const ProfileContext = createContext<{
  memberId: string | null
  setMemberId: (id: string | null) => void
}>({
  memberId: null,
  setMemberId: () => {},
})

export const useProfile = () => useContext(ProfileContext)
