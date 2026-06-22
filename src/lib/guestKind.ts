import { useEffect, useState } from 'react'
import { api } from './api'
import { getGuestToken, getGuestKind, setGuestKind, type GuestKind } from './device'

// Resolve the current LINK guest's share-mode. The token is opaque (server-signed),
// so the client asks /api/guest/whoami once, then caches the answer in localStorage
// (so a reload routes synchronously, no flash). Returns null when this isn't a link
// guest, or before the first answer lands. See functions/api/guest/whoami.ts.
export function useGuestKind(): GuestKind | null {
  const [kind, setKind] = useState<GuestKind | null>(() => getGuestKind())

  useEffect(() => {
    if (!getGuestToken()) return // not a link guest — nothing to resolve
    if (getGuestKind()) return // already cached
    let alive = true
    api<{ kind: GuestKind | null }>('guest/whoami')
      .then((r) => {
        if (!alive) return
        const k = r.kind ?? 'showcase' // a guest with no/unknown kind is a legacy Démo link
        setGuestKind(k)
        setKind(k)
      })
      .catch(() => {
        /* offline / 401 — leave unresolved; the hub stays read-only either way */
      })
    return () => {
      alive = false
    }
  }, [])

  return kind
}
