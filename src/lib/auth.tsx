// Operator auth context. Thin: the server's bb_session cookie is the source of
// truth; this just caches /api/auth/me so the UI knows whether to show the
// operator surfaces. No external state lib (boring-tech).
import { createContext, useContext, useEffect, useState, type ReactNode } from 'react'
import { api } from './api'

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

  async function refresh() {
    try {
      const me = await api<{ signedIn: boolean; email?: string; household?: Household | null }>('auth/me')
      setSignedIn(me.signedIn)
      setEmail(me.email ?? null)
      setHousehold(me.household ?? null)
    } catch {
      setSignedIn(false)
      setEmail(null)
      setHousehold(null)
    } finally {
      setLoading(false)
    }
  }

  async function signOut() {
    await api('auth/logout', { method: 'POST' }).catch(() => {})
    await refresh()
  }

  useEffect(() => {
    refresh()
  }, [])

  return (
    <AuthContext.Provider value={{ loading, signedIn, email, household, refresh, signOut }}>
      {children}
    </AuthContext.Provider>
  )
}

export const useAuth = () => useContext(AuthContext)
