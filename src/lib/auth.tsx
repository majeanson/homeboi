// Operator auth context. Thin: the server's bb_session cookie is the source of
// truth; this just caches /api/auth/me so the UI knows whether to show the
// operator surfaces. No external state lib (boring-tech).
import { createContext, useContext, useEffect, useRef, useState, type ReactNode } from 'react'
import { api } from './api'
import { onAuthLost } from './authEvents'
import { createDeviceStore } from './createDeviceStore'

// A demo SANDBOX visitor (functions/api/demo.ts) is an ordinary signed-in operator
// whose email is the only tell — lib/demo.ts's `isSandboxEmail` can't be imported
// here (it imports `useAuth` FROM this file), so this mirrors it directly, same as
// it already mirrors functions/_lib/demoHousehold.ts's copy across the client/
// server boundary. Keep the three in step.
const isSandboxEmail = (email: string | null | undefined): boolean =>
  !!email && email.startsWith('demo-') && email.endsWith('@babillard.invalid')

interface Household {
  id: string
  name: string
  tier: string
}
interface AuthState {
  loading: boolean
  signedIn: boolean
  email: string | null
  household: Household | null
  refresh: () => Promise<void>
  signOut: () => Promise<void>
}

// Whether THIS device has ever seen a signed-in operator — mirrors device.ts's
// `isPaired()` (a kiosk's device token) so a returning phone gets the same
// "skip the network round trip" fast path. Without this, opening the PWA on a
// stalled/weak connection (a store, a flaky signal — see api.ts's timeout) left a
// FREQUENT user staring at only a loading spinner: `AuthProvider.refresh()` below
// awaits `api('auth/me')` inside try/finally, so `loading` never flipped false
// while that call hung, and the router's smart `/` entry only bypassed the wait
// for `chosen`/`isPaired()` (kiosk) devices — a plain phone had no offline-safe
// signal of its own. Built on the shared device-store primitive (createDeviceStore)
// rather than hand-rolling another localStorage flag. Set on every confirmed
// signed-in `auth/me` FOR A REAL OPERATOR, cleared on an explicit sign-out or a
// genuine (server-confirmed, not offline/timed-out) signed-out answer.
//
// Deliberately never set true for a demo SANDBOX session (`isSandboxEmail`): that
// household is swept on a TTL/cap and the session dies with it, so persisting this
// flag for one would later fast-path a stranded visitor straight past `Entry()`'s
// marketing/login fallback onto a dead board instead.
const wasSignedInStore = createDeviceStore('babillard-was-signed-in', false, {
  read: (raw) => raw === '1',
  write: (v) => (v ? '1' : '0'),
})
export const wasSignedIn = wasSignedInStore.get

const AuthContext = createContext<AuthState>({
  loading: true,
  signedIn: false,
  email: null,
  household: null,
  refresh: async () => {},
  signOut: async () => {},
})

export function AuthProvider({ children }: { children: ReactNode }) {
  const [loading, setLoading] = useState(true)
  const [signedIn, setSignedIn] = useState(false)
  const [email, setEmail] = useState<string | null>(null)
  const [household, setHousehold] = useState<Household | null>(null)
  // Two calls can overlap (the mount effect's refresh AND an onAuthLost-triggered
  // one, if a 401 fires while the first is still in flight on a slow connection —
  // now up to api.ts's own timeout). Without a sequence guard the SLOWER one could
  // resolve last and win, clobbering React state (and `wasSignedIn`) with a stale
  // answer even though a fresher, more-correct one already landed.
  const seqRef = useRef(0)

  async function refresh() {
    const seq = ++seqRef.current
    try {
      const me = await api<{ signedIn: boolean; email?: string; household?: Household | null }>('auth/me')
      if (seq !== seqRef.current) return // a newer refresh already superseded this one
      setSignedIn(me.signedIn)
      setEmail(me.email ?? null)
      setHousehold(me.household ?? null)
      // A real, server-confirmed answer — trustworthy either way. Never persisted
      // for a demo sandbox visitor (see the store's own comment above).
      wasSignedInStore.set(me.signedIn && !isSandboxEmail(me.email))
    } catch {
      if (seq !== seqRef.current) return
      // The server didn't actually answer (most commonly: offline, or api.ts's own
      // timeout on a stalled connection). This is NOT a confirmed sign-out, so
      // leave `wasSignedIn` alone — clearing it here is exactly what stranded a
      // returning operator on the marketing page / loading spinner.
      setSignedIn(false)
      setEmail(null)
      setHousehold(null)
    } finally {
      if (seq === seqRef.current) setLoading(false)
    }
  }

  async function signOut() {
    await api('auth/logout', { method: 'POST' }).catch(() => {})
    // Explicit and immediate — the user's intent here is unambiguous. Note this
    // CAN be overwritten by the refresh() below: if the logout request itself
    // failed for a reason other than being offline (a transient 5xx, a CSRF
    // mismatch) and the session cookie is still genuinely valid server-side,
    // refresh() will honestly report `signedIn: true` and that answer is correct —
    // the device really is still signed in until the server says otherwise.
    wasSignedInStore.set(false)
    await refresh()
  }

  useEffect(() => {
    refresh()
    // A 401 anywhere means the cached signedIn may be stale (cookie expired,
    // session revoked) — re-ask the server so guards (Operator → /login) react
    // without waiting for the user to navigate.
    return onAuthLost(() => {
      void refresh()
    })
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [])

  return (
    <AuthContext.Provider value={{ loading, signedIn, email, household, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
