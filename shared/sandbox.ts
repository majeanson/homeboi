// What marks a demo SANDBOX operator: the email `demo-<id>@babillard.invalid` (RFC 2606), minted
// by functions/api/demo.ts. One copy for the Worker (the claim door, the write stamp) and the
// SPA (the claim banner, /garder, the « was signed in » memory) — it used to be three, one of
// them inline in lib/auth.tsx because lib/demo.ts imports useAuth from there (review #40).
//
// The sweep and the cap do NOT read it: they key on `households.is_sandbox` (0157), because an
// email is something a person can type. The legacy read-only singleton `demo@babillard.invalid`
// (no dash) deliberately does not match.
export const DEMO_SANDBOX_DOMAIN = '@babillard.invalid'
export const DEMO_SANDBOX_PREFIX = 'demo-'

export function isSandboxEmail(email: string | null | undefined): boolean {
  return !!email && email.startsWith(DEMO_SANDBOX_PREFIX) && email.endsWith(DEMO_SANDBOX_DOMAIN)
}

