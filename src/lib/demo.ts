// The demo SANDBOX, client side. A sandbox visitor is an ORDINARY signed-in
// operator (functions/api/demo.ts) — the only thing that marks the session as
// throwaway is the operator email `demo-<id>@babillard.invalid` (RFC 2606),
// which /api/auth/me already hands the SPA. So "am I in the sandbox?" is a pure
// read off useAuth() — no new endpoint, no new flag to keep in sync. The pattern is
// shared/sandbox.ts isSandboxEmail, the Worker's too; the legacy read-only singleton (`demo@babillard.invalid`, no dash) is a GUEST
// session with no operator email, so it never matches here.
import { useAuth } from './auth'
import { isSandboxEmail } from '../../shared/sandbox'
export { isSandboxEmail }

/** True when the current session is a demo sandbox operator — the audience for
 * « Garder ma maisonnée » (the claim banner + /garder). */
export function useSandbox(): boolean {
  const { signedIn, email } = useAuth()
  return signedIn && isSandboxEmail(email)
}
