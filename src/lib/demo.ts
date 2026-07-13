// The demo SANDBOX, client side. A sandbox visitor is an ORDINARY signed-in
// operator (functions/api/demo.ts) — the only thing that marks the session as
// throwaway is the operator email `demo-<id>@babillard.invalid` (RFC 2606),
// which /api/auth/me already hands the SPA. So "am I in the sandbox?" is a pure
// read off useAuth() — no new endpoint, no new flag to keep in sync. The pattern
// mirrors functions/_lib/demoHousehold.ts isSandboxEmail (the sweep's LIKE key);
// the legacy read-only singleton (`demo@babillard.invalid`, no dash) is a GUEST
// session with no operator email, so it never matches here.
import { useAuth } from './auth'

export function isSandboxEmail(email: string | null | undefined): boolean {
  return !!email && email.startsWith('demo-') && email.endsWith('@babillard.invalid')
}

/** True when the current session is a demo sandbox operator — the audience for
 * « Garder ma maisonnée » (the claim banner + /garder). */
export function useSandbox(): boolean {
  const { signedIn, email } = useAuth()
  return signedIn && isSandboxEmail(email)
}
